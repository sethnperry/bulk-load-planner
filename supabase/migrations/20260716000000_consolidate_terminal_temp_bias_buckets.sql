-- Consolidates terminal_temp_bias rows keyed by legacy exact-UTC-hour buckets
-- into the 3-hour buckets the app now reads/writes (see
-- lib/fuelTempPredictor.ts, app/api/fuel-temp/route.ts, and
-- app/calculator/hooks/useLoadWorkflow.ts, all bucketing via
-- floor(hour_of_day / 3) * 3). Exact-hour buckets fragmented samples too
-- thinly for the bias correction to mature.
--
-- Combines sample_count / mean_error / m2 via the standard parallel-variance
-- (Chan et al.) merge so no historical learning is discarded -- rows are
-- folded together, not dropped.
--
-- Idempotent / safe to re-run: only touches (terminal_id, month_of_year,
-- bucket) groups that have more than one row or a row not already aligned
-- to a 3-hour boundary.

do $$
declare
  grp record;
  member record;
  n_a int;
  mean_a double precision;
  m2_a double precision;
  n_b int;
  mean_b double precision;
  m2_b double precision;
  delta double precision;
  first_row boolean;
begin
  for grp in
    select terminal_id, month_of_year, (floor(hour_of_day / 3.0) * 3)::int as bucket_hour
    from terminal_temp_bias
    group by terminal_id, month_of_year, (floor(hour_of_day / 3.0) * 3)::int
    having count(*) > 1
        or bool_or(hour_of_day <> (floor(hour_of_day / 3.0) * 3)::int)
  loop
    first_row := true;
    n_a := 0; mean_a := 0; m2_a := 0;

    for member in
      select sample_count, mean_error, m2
      from terminal_temp_bias
      where terminal_id = grp.terminal_id
        and month_of_year = grp.month_of_year
        and (floor(hour_of_day / 3.0) * 3)::int = grp.bucket_hour
      order by updated_at
    loop
      n_b := coalesce(member.sample_count, 0);
      mean_b := coalesce(member.mean_error, 0);
      m2_b := coalesce(member.m2, 0);

      if first_row then
        n_a := n_b;
        mean_a := mean_b;
        m2_a := m2_b;
        first_row := false;
      else
        delta := mean_b - mean_a;
        m2_a := m2_a + m2_b + (delta * delta) * n_a * n_b / nullif(n_a + n_b, 0);
        mean_a := mean_a + delta * n_b / nullif(n_a + n_b, 0);
        n_a := n_a + n_b;
      end if;
    end loop;

    delete from terminal_temp_bias
    where terminal_id = grp.terminal_id
      and month_of_year = grp.month_of_year
      and (floor(hour_of_day / 3.0) * 3)::int = grp.bucket_hour;

    insert into terminal_temp_bias (terminal_id, hour_of_day, month_of_year, sample_count, mean_error, m2, updated_at)
    values (grp.terminal_id, grp.bucket_hour, grp.month_of_year, n_a, mean_a, m2_a, now());
  end loop;
end $$;
