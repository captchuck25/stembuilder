// Cross-floor staircase linking.
//
// A staircase drawn on one floor implies an arrival opening on the floor above:
// the same flight is shown there going DOWN. We model that as a real mirrored
// Stair on the upper level, sharing a `linkGroup` with the source so the two
// stay vertically aligned — moving/resizing one propagates to the other, and
// the auto-generated mirror is flagged `linked` so the UI can warn before a
// move. `syncLinkedStairs` is idempotent: it only adds the missing mirrors and
// back-fills `linkGroup` on sources, returning the SAME project object when
// nothing changes (safe to call from an effect without causing render loops).

import { Project, Stair, makeId } from './types';

export function syncLinkedStairs(project: Project): Project {
  if (project.levels.length < 2) return project;
  // Index levels low→high so each source mirrors onto the next floor up.
  const order = [...project.levels].sort((a, b) => a.elevation - b.elevation);
  // Work on shallow copies of each level's stair array; track if anything changed.
  const stairsById = new Map(order.map(l => [l.id, [...l.stairs]]));
  let changed = false;

  for (let i = 0; i < order.length - 1; i++) {
    const lower = order[i];
    const upper = order[i + 1];
    const lowerStairs = stairsById.get(lower.id)!;
    const upperStairs = stairsById.get(upper.id)!;
    for (let j = 0; j < lowerStairs.length; j++) {
      const s = lowerStairs[j];
      // Never mirror an auto-generated mirror again (avoids stacking copies up).
      if (s.linked) continue;
      let group = s.linkGroup;
      if (!group) {
        group = makeId('stairlink');
        lowerStairs[j] = { ...s, linkGroup: group };
        changed = true;
      }
      // Ensure the upper floor has the matching mirror.
      if (!upperStairs.some(u => u.linkGroup === group)) {
        const src = lowerStairs[j];
        upperStairs.push({
          ...src,
          id: makeId('stair'),
          levelId: upper.id,
          direction: 'down',   // arrival floor shows the flight going DOWN
          linked: true,
          linkGroup: group,
        });
        changed = true;
      }
    }
  }

  if (!changed) return project;
  return {
    ...project,
    levels: project.levels.map(l => ({ ...l, stairs: stairsById.get(l.id) ?? l.stairs })),
  };
}

// Geometry fields that must stay identical between linked copies (everything
// that positions/sizes the flight). `direction` is intentionally excluded so
// each floor keeps its own UP/DN sense; id/levelId/linked stay per-copy.
export type LinkedStairPatch = Pick<Stair, 'position' | 'rotation' | 'width' | 'length' | 'shape' | 'treads'>;

export function linkedGeometryPatch(patch: Partial<Stair>): Partial<LinkedStairPatch> {
  const out: Partial<LinkedStairPatch> = {};
  if (patch.position != null) out.position = patch.position;
  if (patch.rotation != null) out.rotation = patch.rotation;
  if (patch.width != null) out.width = patch.width;
  if (patch.length != null) out.length = patch.length;
  if (patch.shape != null) out.shape = patch.shape;
  if (patch.treads != null) out.treads = patch.treads;
  return out;
}
