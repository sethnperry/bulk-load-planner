-- Adds the incentive system's "averaging period" setting -- distinct from
-- incentive_settings.pay_period_type/pay_period_anchor_date, which only
-- ever drove the Period Report's CSV export (see CLAUDE.md "Incentive
-- system" -- that pass was renamed away from "payroll" language, but its
-- underlying columns/purpose are unchanged). This new column instead
-- drives a live running-average stat card on the Planner. Deliberately
-- calendar-aligned with NO anchor date at all -- week starts Sunday,
-- month/quarter/year always run from their real calendar start-to-date
-- through today -- unlike the existing pay-period types (weekly/biweekly/
-- semi_monthly/monthly), none of daily/weekly/monthly/quarterly/annually
-- need an admin-set start date, so there's nothing to anchor.
--
-- Fully independent of pay_period_type/pay_period_anchor_date and of
-- app/admin/payPeriods.ts -- per explicit product direction, the incentive
-- system shouldn't relate to payroll at all; this is a second, unrelated
-- period concept that happens to live on the same settings row.
--
-- NOT applied automatically -- run manually in the Supabase SQL editor.

alter table public.incentive_settings
  add column averaging_period_type text not null default 'weekly'
    check (averaging_period_type in ('daily','weekly','monthly','quarterly','annually'));

-- No RLS change needed -- incentive_settings_company_read/admin_write
-- (from 20260802000000_incentive_system.sql) already cover any column on
-- this table, this one included.
