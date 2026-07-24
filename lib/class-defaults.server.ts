import { LEVELS } from '@/app/tools/code-lab/python/levels'
import { UNITS } from '@/app/tools/block-lab/units'
import { CHALLENGES as TURTLE_CHALLENGES } from '@/app/tools/code-lab/turtle/challenges'

// Shared class-creation defaults, used by BOTH the teacher "create class" flow
// and the roster importer so rostered classes behave identically.

export function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// Default a new class to "all levels locked" for every lockable tool so students
// can't access content until a teacher explicitly assigns or opens it.
// Important for turtle: the teacher dashboard 3-state UI keys each item by its
// position in the FULL CHALLENGES array (tutorials + challenges), so the
// auto-lock indexes must match that — otherwise the wrong items end up locked.
export function buildDefaultLocks(classId: string) {
  const rows: Array<{ class_id: string; tool: string; level_idx: number; challenge_idx: number }> = []
  for (let i = 0; i < LEVELS.length; i++) rows.push({ class_id: classId, tool: 'code-lab', level_idx: i, challenge_idx: -1 })
  for (let i = 0; i < UNITS.length; i++) rows.push({ class_id: classId, tool: 'block-lab', level_idx: i, challenge_idx: -1 })
  for (let i = 0; i < TURTLE_CHALLENGES.length; i++) rows.push({ class_id: classId, tool: 'turtle', level_idx: i, challenge_idx: -1 })
  // Arcade Lab areas: 0 = Missions, 1 = Free Build, 2 = Class Arcade
  for (let i = 0; i < 3; i++) rows.push({ class_id: classId, tool: 'arcade-lab', level_idx: i, challenge_idx: -1 })
  return rows
}
