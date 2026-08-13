-- One-time cleanup for orphaned "planned" load_log rows -- see CLAUDE.md
-- "Pre-launch cleanup: orphaned planned load_log rows". These are rows
-- created by begin_load when a driver taps LOAD, but never reach
-- status='loaded' because the app was backgrounded/closed before either
-- LOADED or Cancel was tapped. The app-side fix (useLoadWorkflow.ts now
-- deletes any existing planned row for a combo before creating a new one)
-- prevents this from accumulating further going forward -- this migration
-- only clears the pre-existing backlog.
--
-- Safe to run: confirmed via the load_lines FK
-- (load_lines_load_id_fkey ... ON DELETE CASCADE, in
-- 20260222172537_remote_schema.sql) that deleting a load_log row cleanly
-- cascades its load_lines, no orphaned children left behind. These rows
-- carry no real data (no actual_total_gal, never fed
-- terminal_temp_bias/terminal_products), so deleting them loses nothing.
--
-- Scoped to rows still 'planned' after 24 hours -- a genuinely in-progress
-- load is a same-session, minutes-long affair, so anything older than that
-- is abandoned, not just slow.

delete from public.load_lines
where load_id in (
  select load_id from public.load_log
  where status = 'planned'
    and created_at < now() - interval '24 hours'
);

delete from public.load_log
where status = 'planned'
  and created_at < now() - interval '24 hours';
