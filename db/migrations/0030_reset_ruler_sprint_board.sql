-- 0030: OPTIONAL — reset the Ruler sprint leaderboard.
--
-- From 2026-09-10 the ruler board only accepts sprints played at
-- Find · Inches · 1/16" (enforced in /api/measurement-runs via
-- LEADERBOARD_SETTINGS in app/tools/measurement-lab/constants.ts). The 41
-- ruler bests already on the board were earned under mixed settings (whole
-- inches, halves, metric…) and cannot be verified, so this tombstones them.
-- A student's next qualifying sprint resurrects their row with the new best.
--
-- Run once in the Supabase SQL editor ONLY if you want a clean ruler board.
-- Not required for the code to work. Other instruments are untouched.

update measurement_runs
   set deleted_at = now()
 where tool = 'ruler'
   and deleted_at is null;
