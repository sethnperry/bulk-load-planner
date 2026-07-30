-- Fleet Tier Section 1.3, part 2: "priority terminal flagging" -- design
-- confirmed with user 2026-08-01 (see CLAUDE.md "Priority terminal
-- flagging"). A customizable per-terminal checklist gates a new driver's
-- perceived "active" status at a terminal (N training loads + arbitrary
-- other steps), not a fixed rule.
--
-- NOT applied automatically -- no live DB write access this session. Run
-- manually in the Supabase SQL editor.

-- ── terminal_checklist_items ──────────────────────────────────────────────
-- Company-scoped checklist definition for a given terminal. A terminal with
-- zero rows here has no gate at all -- existing terminals/companies not
-- using this feature see zero behavior change.
--
-- RLS mirrors the existing service_types/equipment pattern exactly: any
-- member of the row's active company gets full CRUD, not role-gated at the
-- RLS level (role gating for who can *edit* this happens in the admin UI,
-- same as trucks/trailers/service_types today -- see CLAUDE.md architecture
-- notes on why this codebase does it that way).
create table public.terminal_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  terminal_id uuid not null references public.terminals(terminal_id) on delete cascade,
  label text not null,
  item_type text not null check (item_type in ('training_loads', 'manual')) default 'manual',
  -- only meaningful for item_type = 'training_loads'
  required_count int,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.terminal_checklist_items enable row level security;

create policy terminal_checklist_items_select_active_company on public.terminal_checklist_items
  for select using (company_id = get_active_company_id());
create policy terminal_checklist_items_insert_active_company on public.terminal_checklist_items
  for insert with check (company_id = get_active_company_id());
create policy terminal_checklist_items_update_active_company on public.terminal_checklist_items
  for update using (company_id = get_active_company_id()) with check (company_id = get_active_company_id());
create policy terminal_checklist_items_delete_active_company on public.terminal_checklist_items
  for delete using (company_id = get_active_company_id());

-- ── terminal_checklist_progress ───────────────────────────────────────────
-- One row per (driver, checklist item). No direct client write at all --
-- training_loads progress must come from real completed loads
-- (record_terminal_checklist_load, called after complete_load) and manual
-- checkbox toggles go through toggle_terminal_checklist_item, both
-- SECURITY DEFINER below. This prevents a driver from self-reporting
-- training loads that didn't happen.
create table public.terminal_checklist_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  checklist_item_id uuid not null references public.terminal_checklist_items(id) on delete cascade,
  progress_count int not null default 0,
  is_checked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, checklist_item_id)
);

alter table public.terminal_checklist_progress enable row level security;

create policy terminal_checklist_progress_own_read on public.terminal_checklist_progress
  for select using (user_id = auth.uid());

-- Manager/dispatch visibility -- "managers and dispatchers can see the
-- status and progress" per spec. Matches the admin+dispatch read pattern
-- already established for terminal_access in FleetCardsModal.
create policy terminal_checklist_progress_admin_dispatch_read on public.terminal_checklist_progress
  for select using (
    exists (
      select 1
      from public.terminal_checklist_items tci
      join public.user_companies uc on uc.company_id = tci.company_id
      where tci.id = terminal_checklist_progress.checklist_item_id
        and uc.user_id = auth.uid()
        and uc.role = any (array['admin', 'dispatch'])
    )
  );

create policy terminal_checklist_progress_no_direct_write on public.terminal_checklist_progress
  for all using (false) with check (false);

-- ── load_log tag column ───────────────────────────────────────────────────
-- Nullable -- a training load is still a completely normal load, just
-- annotated with which checklist step it counted toward.
alter table public.load_log
  add column if not exists training_checklist_item_id uuid references public.terminal_checklist_items(id);

-- ── toggle_terminal_checklist_item ────────────────────────────────────────
-- Driver checks/unchecks a manual (non-load-count) step. Rejects
-- training_loads items -- those are only ever incremented by real loads.
create or replace function public.toggle_terminal_checklist_item(p_item_id uuid, p_checked boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_item_type text;
begin
  select item_type into v_item_type from terminal_checklist_items where id = p_item_id;
  if not found then
    raise exception 'checklist_item_not_found: %', p_item_id;
  end if;
  if v_item_type != 'manual' then
    raise exception 'not_manual: checklist item % is not a manual item', p_item_id;
  end if;

  insert into terminal_checklist_progress (user_id, checklist_item_id, is_checked, updated_at)
  values (auth.uid(), p_item_id, p_checked, now())
  on conflict (user_id, checklist_item_id) do update set
    is_checked = excluded.is_checked,
    updated_at = now();
end;
$function$;

-- ── record_terminal_checklist_load ────────────────────────────────────────
-- Called client-side right after complete_load succeeds (fire-and-forget,
-- non-fatal -- same pattern as calculate_load_points). No-ops silently if
-- the load's terminal has no incomplete training_loads checklist item for
-- this driver. Picks the first such incomplete item (by sort_order) if more
-- than one exists.
create or replace function public.record_terminal_checklist_load(p_load_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id     uuid;
  v_terminal_id uuid;
  v_company_id  uuid;
  v_item_id     uuid;
  v_new_count   int;
begin
  select user_id, terminal_id into v_user_id, v_terminal_id
    from load_log where load_id = p_load_id;

  if not found then
    raise exception 'load_not_found: %', p_load_id;
  end if;

  if v_user_id != auth.uid() then
    raise exception 'unauthorized: load does not belong to current user';
  end if;

  if v_terminal_id is null then
    return jsonb_build_object('ok', true, 'tagged', false);
  end if;

  v_company_id := get_active_company_id();

  select tci.id into v_item_id
    from terminal_checklist_items tci
    left join terminal_checklist_progress tcp
      on tcp.checklist_item_id = tci.id and tcp.user_id = v_user_id
    where tci.company_id = v_company_id
      and tci.terminal_id = v_terminal_id
      and tci.item_type = 'training_loads'
      and tci.is_active = true
      and coalesce(tcp.progress_count, 0) < coalesce(tci.required_count, 1)
    order by tci.sort_order
    limit 1;

  if v_item_id is null then
    return jsonb_build_object('ok', true, 'tagged', false);
  end if;

  insert into terminal_checklist_progress (user_id, checklist_item_id, progress_count, updated_at)
  values (v_user_id, v_item_id, 1, now())
  on conflict (user_id, checklist_item_id) do update set
    progress_count = terminal_checklist_progress.progress_count + 1,
    updated_at = now()
  returning progress_count into v_new_count;

  update load_log set training_checklist_item_id = v_item_id where load_id = p_load_id;

  return jsonb_build_object('ok', true, 'tagged', true, 'checklist_item_id', v_item_id, 'progress_count', v_new_count);
end;
$function$;
