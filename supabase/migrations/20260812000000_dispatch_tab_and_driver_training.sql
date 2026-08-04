-- Terminal Tier continuation: Dispatch tab + Driver Training. See CLAUDE.md
-- "Terminal Tier — Build Spec" for the full design (2026-08-03/04 mockup
-- walkthrough). Verified live before writing: profiles already has
-- region/local_area/division/employee_number (get_display_names_full
-- already returns all of them -- no new query needed for driver identity),
-- so only the shift schedule is genuinely new. trucks/trailers already have
-- reg_expiration_date etc. for the equipment summary. terminal_access has an
-- existing admin/dispatch READ policy (terminal_access_admin_dispatch_read)
-- but user_terminal_cards has none at all -- confirmed via pg_policies.

-- ── Driver Training: single-load model ──────────────────────────────────────
-- trainee_id is set by the client right after begin_load (a plain UPDATE on
-- the lead's own row, already allowed by load_log_update_own -- no RPC
-- change needed). The new SELECT policy is scoped narrowly to "the load I'm
-- tagged as trainee on", not a general cross-driver grant -- doesn't touch
-- the existing load_log_select_own / admin-dispatch-read policies.
alter table load_log add column trainee_id uuid references auth.users(id);
create index idx_load_log_trainee_id on load_log(trainee_id) where trainee_id is not null;

create policy load_log_select_trainee on load_log
  for select to authenticated
  using (trainee_id = auth.uid());

-- ── Dispatch tab: driver identity/schedule + notes ──────────────────────────
-- One row per user (not per company) -- matches profiles' own existing
-- shape (a single profile row regardless of company membership), not a
-- per-membership table.
create table driver_schedules (
  user_id          uuid primary key references auth.users(id),
  company_id       uuid references companies(company_id),
  days_of_week     smallint[] not null default '{}',  -- 0=Sun..6=Sat
  shift_start_local time,
  shift_end_local  time,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users(id)
);

create trigger trg_driver_schedules_updated_at
  before update on driver_schedules
  for each row execute function set_updated_at();

alter table driver_schedules enable row level security;

create policy driver_schedules_self_read on driver_schedules
  for select to authenticated
  using (user_id = auth.uid());

create policy driver_schedules_staff_all on driver_schedules
  for all to authenticated
  using (company_id is null or is_company_staff(company_id))
  with check (company_id is null or is_company_staff(company_id));

-- Dispatcher notes -- visible/editable by lead/dispatch/admin only, per the
-- spec ("lead/admin too" when asked who else besides dispatch). No
-- self-read policy -- these are internal notes about a driver, not a
-- driver-facing feature.
create table dispatcher_notes (
  user_id     uuid primary key references auth.users(id),
  company_id  uuid references companies(company_id),
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

create trigger trg_dispatcher_notes_updated_at
  before update on dispatcher_notes
  for each row execute function set_updated_at();

alter table dispatcher_notes enable row level security;

create policy dispatcher_notes_staff_all on dispatcher_notes
  for all to authenticated
  using (company_id is null or is_company_staff(company_id))
  with check (company_id is null or is_company_staff(company_id));

-- ── Cards tab, contextual for dispatch/admin ────────────────────────────────
-- Deliberately READ-ONLY for now, not full read/write parity -- confirmed
-- live that user_terminal_cards has zero admin/dispatch access today (only
-- owner_* policies exist), and granting cross-user WRITE access to another
-- driver's card numbers/PINs is a real permission expansion this project's
-- own pattern treats as something to confirm explicitly, not assume. This
-- mirrors terminal_access_admin_dispatch_read's exact shape, extended to
-- user_terminal_cards which didn't have the equivalent yet.
create policy user_terminal_cards_admin_dispatch_read on user_terminal_cards
  for select to authenticated
  using (
    exists (
      select 1
      from user_companies uc
      join user_companies uc2 on uc2.company_id = uc.company_id
      where uc.user_id = auth.uid()
        and uc.role = any (array['admin','dispatch'])
        and uc2.user_id = user_terminal_cards.user_id
    )
  );
