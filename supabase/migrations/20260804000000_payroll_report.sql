-- Fleet Tier Section 2 (Incentive system): the deferred payroll report
-- piece. See CLAUDE.md "Incentive system" for the full spec -- this covers
-- the "Payroll / payout" subsection: pay-period-scoped reporting, CSV
-- export, and edit-and-recalculate with stale-report flagging.
--
-- NOT applied automatically -- no live DB write access this session. Run
-- manually in the Supabase SQL editor. Requires
-- 20260802000000_incentive_system.sql to already be applied
-- (calculate_load_points, load_points, incentive_settings.pay_period_type/
-- pay_period_anchor_date).

-- ── payroll_reports ────────────────────────────────────────────────────────
-- One row per "admin generated a report for this period." Exists purely to
-- track staleness -- the report itself (the table view / CSV) is always
-- computed live from load_points, never stored. Generating the same period
-- twice is fine (e.g. re-checking after a stale flag) and just inserts
-- another row -- the UI reads the most recent one per period.
create table public.payroll_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(company_id) on delete cascade,
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null default now(),
  generated_by uuid not null references auth.users(id),
  is_stale boolean not null default false
);

alter table public.payroll_reports enable row level security;

create policy payroll_reports_admin_all on public.payroll_reports
  for all using (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = payroll_reports.company_id and uc.role = 'admin'
    )
  ) with check (
    exists (
      select 1 from public.user_companies uc
      where uc.user_id = auth.uid() and uc.company_id = payroll_reports.company_id and uc.role = 'admin'
    )
  );

-- ── load_edit_history ──────────────────────────────────────────────────────
-- "Track edit history (who, old→new, timestamp) on the load." One row per
-- edit_load_line() call; changes is a small jsonb map of
-- {field: {old, new}} for whatever changed in that call.
create table public.load_edit_history (
  id uuid primary key default gen_random_uuid(),
  load_id uuid not null references public.load_log(load_id) on delete cascade,
  comp_number int not null,
  edited_by uuid not null references auth.users(id),
  edited_at timestamptz not null default now(),
  changes jsonb not null
);

alter table public.load_edit_history enable row level security;

create policy load_edit_history_admin_read on public.load_edit_history
  for select using (
    exists (
      select 1 from public.load_log ll
      join public.user_companies uc on uc.user_id = ll.user_id
      where ll.load_id = load_edit_history.load_id
        and uc.company_id = get_active_company_id()
        and uc.role = 'admin'
    )
  );

create policy load_edit_history_no_direct_write on public.load_edit_history
  for all using (false) with check (false);

-- ── flag_stale_payroll_reports (trigger) ──────────────────────────────────
-- Whenever a load_points row is recalculated, any already-generated payroll
-- report whose period covers that load's date gets flagged stale (not
-- invalid, not blocked, not auto-regenerated -- per spec, purely
-- informational for the admin to notice and re-check).
create or replace function public.flag_stale_payroll_reports()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update payroll_reports pr
     set is_stale = true
   where pr.company_id = new.company_id
     and pr.is_stale = false
     and new.created_at::date >= pr.period_start
     and new.created_at::date <= pr.period_end;
  return new;
end;
$function$;

create trigger load_points_flag_stale
  after update on public.load_points
  for each row execute function public.flag_stale_payroll_reports();

-- ── recalculate_load_points ────────────────────────────────────────────────
-- Admin-only (payroll edits are financially consequential -- gated inside
-- the function itself, not left to load_lines' normal open-CRUD RLS).
--
-- p_preserve_density = true (default): "Recalc uses the original
-- density_at_load snapshot unless the edit specifically corrects a bad
-- density reading." Re-prorates using each compartment's EXISTING
-- density_at_load and the (possibly just-edited) actual_gallons from
-- load_lines -- density itself never moves.
--
-- p_preserve_density = false: the edit specifically corrected a bad
-- density reading, so this is a full from-scratch recompute --
-- calculate_load_points already derives density fresh from current
-- load_lines.actual_lbs/actual_gallons, so it's reused directly.
create or replace function public.recalculate_load_points(p_load_id uuid, p_preserve_density boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id     uuid;
  v_caller_role    text;
  v_tare_lbs       numeric;
  v_weight_cap_lbs numeric;
begin
  v_company_id := get_active_company_id();
  select role into v_caller_role from user_companies where user_id = auth.uid() and company_id = v_company_id;
  if v_caller_role is distinct from 'admin' then
    raise exception 'unauthorized: only admin can recalculate load points';
  end if;

  if not p_preserve_density then
    return calculate_load_points(p_load_id);
  end if;

  select coalesce(tare_lbs, 0) into v_tare_lbs from load_log where load_id = p_load_id;
  select coalesce(weight_cap_lbs, 80000) into v_weight_cap_lbs from incentive_settings where company_id = v_company_id;
  if v_weight_cap_lbs is null then v_weight_cap_lbs := 80000; end if;

  with lines as (
    select
      ll.comp_number,
      ll.actual_gallons,
      lp.density_at_load,
      lp.benchmark_gallons_used,
      (ll.actual_gallons * lp.density_at_load) as actual_lbs_at_density
    from load_lines ll
    join load_points lp on lp.load_id = ll.load_id and lp.comp_number = ll.comp_number
    where ll.load_id = p_load_id
      and ll.actual_gallons is not null and ll.actual_gallons > 0
  ),
  totals as (
    select sum(actual_gallons) as total_gallons, sum(actual_lbs_at_density) as total_lbs from lines
  ),
  scored as (
    select
      l.comp_number,
      l.actual_gallons,
      greatest(
        0,
        (l.actual_gallons / t.total_gallons * least(t.total_lbs, greatest(v_weight_cap_lbs - v_tare_lbs, 0)))
          - (l.actual_gallons / t.total_gallons * l.benchmark_gallons_used * l.density_at_load)
      ) / l.density_at_load as recovered_gallons
    from lines l cross join totals t
  )
  update load_points lp
     set actual_gallons    = s.actual_gallons,
         recovered_gallons = s.recovered_gallons,
         recovered_points  = s.recovered_gallons,
         updated_at        = now()
    from scored s
   where lp.load_id = p_load_id and lp.comp_number = s.comp_number;

  return jsonb_build_object('ok', true);
end;
$function$;

-- ── edit_load_line ─────────────────────────────────────────────────────────
-- Admin-only correction to a completed load's actual gallons/lbs (typo
-- fixes, wrong compartment, etc). Logs to load_edit_history, then
-- recalculates load_points (preserving density by default -- pass
-- p_density_correction = true only when the edit specifically fixes a bad
-- density/API/temp reading).
create or replace function public.edit_load_line(
  p_load_id uuid,
  p_comp_number int,
  p_actual_gallons numeric,
  p_actual_lbs numeric,
  p_density_correction boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company_id  uuid;
  v_caller_role text;
  v_old_gallons numeric;
  v_old_lbs     numeric;
begin
  v_company_id := get_active_company_id();
  select role into v_caller_role from user_companies where user_id = auth.uid() and company_id = v_company_id;
  if v_caller_role is distinct from 'admin' then
    raise exception 'unauthorized: only admin can edit load lines';
  end if;

  if not exists (
    select 1 from load_log ll
    join user_companies uc on uc.user_id = ll.user_id
    where ll.load_id = p_load_id and uc.company_id = v_company_id
  ) then
    raise exception 'load_not_found_in_company: %', p_load_id;
  end if;

  select actual_gallons, actual_lbs into v_old_gallons, v_old_lbs
    from load_lines where load_id = p_load_id and comp_number = p_comp_number;

  if not found then
    raise exception 'load_line_not_found: load % comp %', p_load_id, p_comp_number;
  end if;

  update load_lines
     set actual_gallons = p_actual_gallons,
         actual_lbs     = p_actual_lbs,
         updated_at     = now()
   where load_id = p_load_id and comp_number = p_comp_number;

  insert into load_edit_history (load_id, comp_number, edited_by, changes)
  values (
    p_load_id, p_comp_number, auth.uid(),
    jsonb_build_object(
      'actual_gallons', jsonb_build_object('old', v_old_gallons, 'new', p_actual_gallons),
      'actual_lbs',      jsonb_build_object('old', v_old_lbs,     'new', p_actual_lbs)
    )
  );

  perform recalculate_load_points(p_load_id, not p_density_correction);

  return jsonb_build_object('ok', true);
end;
$function$;
