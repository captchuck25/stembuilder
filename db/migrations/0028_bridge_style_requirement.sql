-- 0028: Bridge assignment style requirement (design checker briefs)
-- Teachers can require a basic structural concept per assignment:
--   'none' | 'triangles' | 'xbrace' | 'substructure' | 'arch'
-- Existing assignments default to 'none' (no behavior change). Idempotent.

ALTER TABLE bridge_assignments
  ADD COLUMN IF NOT EXISTS style_requirement text NOT NULL DEFAULT 'none';
