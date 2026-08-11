-- Weather (ambient temp) only ever needs city-level precision -- terminals
-- within the same city all resolved to the same coordinates anyway (the
-- small variance seen live was just geocoding noise from repeated calls,
-- never real per-terminal precision). Storing lat/lon per-terminal
-- duplicated the same value onto every terminal row and left each one
-- independently able to go missing or corrupt -- confirmed live: 3
-- terminals across 2 cities had lat/lon stored as literal (0,0), which
-- silently resolved to real (but wrong) weather for "Null Island" in the
-- Gulf of Guinea instead of ever falling back to a fresh geocode.
--
-- Moving the cache to `cities` (once per city, not once per terminal)
-- removes that whole class of bug and the terminal-coordinate lookup/
-- backfill code path entirely. terminals.lat/lon are left in place,
-- unused going forward -- same "don't bother dropping, just stop reading
-- it" call already made elsewhere in this project's migration history.
alter table cities add column if not exists lat double precision;
alter table cities add column if not exists lon double precision;
