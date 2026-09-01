-- 0027: Bridge Builder cost rescale (2026-08-31)
--
-- The client-side cost engine changed in the same deploy:
--   * COST_SCALE 10 -> 50 (all steel + joint prices x5)
--   * NEW site cost baseline: span_feet * $1,500 added to every total
--
-- Saved bridge designs store only geometry (cost is recomputed client-side),
-- so they re-price automatically. But teacher assignment budgets and student
-- submission costs store DOLLARS and must be rescaled to match, or existing
-- budgets become impossible and old submissions look absurdly cheap.
--
-- !! RUN ONCE, together with the deploy that changes COST_SCALE to 50 !!
-- (Running twice would compound the rescale. If unsure, check a known
-- assignment's max_cost before and after.)

BEGIN;

-- Teacher budgets: x5 steel scale + the new site baseline for that span.
UPDATE bridge_assignments
SET max_cost = max_cost * 5 + span_feet * 1500;

-- Historical submission costs: same transformation, span from the assignment.
UPDATE bridge_submissions s
SET cost = s.cost * 5 + a.span_feet * 1500
FROM bridge_assignments a
WHERE s.assignment_id = a.id;

COMMIT;
