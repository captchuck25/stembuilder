// Grading rubric — the tiered, teacher-editable rubric that sits ON TOP of
// the binary Requirements checks. Modeled directly on Charlie's classroom
// "West Hollow" rubric: categories × 4 quality tiers with plain-language
// descriptors. AUTO categories get an engine-SUGGESTED tier derived from
// check results (with an evidence line); the teacher can bump any tier and
// scores the judgment categories (design flow, adjacency) by hand.
// See docs/BLUEPRINT_LAB_ASSIGNMENTS_PLAN.md → "Rubric builder design".

import { Level } from './types';
import {
  BRIEFS, Brief, RubricCheck, bedroomWindowStats, evaluateBrief, extraRoomTypes,
} from './rubric';

// Merge a stored assignment's teacher-edited config over its base brief —
// the same resolution the tool client performs. Server routes use this to
// compute auto tiers against the exact rubric the student saw.
export function resolveAssignmentBrief(
  briefId: string, title: string | null | undefined, config: Partial<Brief> | null | undefined,
): Brief {
  const base = BRIEFS.find(b => b.id === briefId) ?? BRIEFS[0];
  return config && Array.isArray(config.rooms)
    ? { ...base, ...config, id: base.id, title: title || base.title }
    : { ...base, title: title || base.title };
}

export type RubricScoring = 'auto' | 'teacher';
export type RubricAutoSource =
  | 'requirements'   // room-count checks + total SF
  | 'sizes'          // minimum-dimension checks
  | 'windows'
  | 'doors'
  | 'furnishings'
  | 'closets';
export type RubricDeliverable = 'floor-plan' | 'roof-plan' | 'elevations' | 'section';

export interface RubricTier {
  points: number;
  descriptor: string;
}

export interface RubricCategory {
  id: string;
  name: string;
  scoring: RubricScoring;
  autoSource?: RubricAutoSource;   // required when scoring === 'auto'
  deliverable: RubricDeliverable;  // category hidden when deliverable excluded
  tiers: RubricTier[];             // best → worst (4 by convention)
}

export interface RubricBonus {
  id: string;
  label: string;
  points: number;                  // negative = penalty
  scoring: RubricScoring;          // v1: teacher-awarded
}

export interface GradingRubric {
  categories: RubricCategory[];
  bonuses: RubricBonus[];
}

// Engine-suggested placement for one auto category.
export interface AutoTierResult {
  tier: number;       // index into tiers (0 = best)
  evidence: string;   // one-line justification shown to student + teacher
}

// What the teacher stores per category on the submission.
export interface TeacherCategoryScore {
  tier?: number;      // chosen tier index (auto categories: override; teacher categories: the score)
  comment?: string;
}
export interface TeacherScores {
  categories: Record<string, TeacherCategoryScore>;
  bonuses: Record<string, boolean>;  // bonus id → awarded
}

// ─── Default template — Charlie's West Hollow rubric, digitized ──────────────

const T = (a: string, b: string, c: string, d: string): RubricTier[] => [
  { points: 14, descriptor: a },
  { points: 12, descriptor: b },
  { points: 9,  descriptor: c },
  { points: 6,  descriptor: d },
];

export const DEFAULT_GRADING_RUBRIC: GradingRubric = {
  categories: [
    {
      id: 'design-flow', name: 'Design — floor plan', scoring: 'teacher', deliverable: 'floor-plan',
      tiers: T(
        'The home is very well designed. Traveling room to room is fluid, room groupings are appropriate (bedrooms together; kitchen, dining and living connected). No dead space!',
        'Home has a good design. Some room orientation could be better — e.g. a bedroom stranded on the far side of the kitchen. No dead space!',
        'Some rooms are out of place. Some maze qualities! Some dead space!',
        'Room orientation is off. Your home is a maze!',
      ),
    },
    {
      id: 'requirements', name: 'Requirements — required rooms', scoring: 'auto', autoSource: 'requirements', deliverable: 'floor-plan',
      tiers: T(
        'All requirements are met AND exceeded — additional living spaces beyond the required rooms (an office, an extra half bath…). Overall SQFT is in range.',
        'All requirements are met. (Nothing beyond the minimum, or overall SQFT is off.)',
        'One requirement was not completely met.',
        'More than one requirement was not completely met.',
      ),
    },
    {
      id: 'sizes', name: 'Room sizes & shape', scoring: 'auto', autoSource: 'sizes', deliverable: 'floor-plan',
      tiers: T(
        'All rooms exceed required sizes and are shaped to allow proper room for furniture or appliances. Quality distribution of space!',
        'Rooms meet the minimum size requirements.',
        'Some rooms do not meet the minimum sizes and/or are of irregular shape.',
        'Multiple rooms are too small.',
      ),
    },
    {
      id: 'windows', name: 'Windows', scoring: 'auto', autoSource: 'windows', deliverable: 'floor-plan',
      tiers: T(
        'Every required room has windows, thoughtfully placed — bedrooms have at least two.',
        'Every required room has windows.',
        'Windows are missing.',
        'No windows.',
      ),
    },
    {
      id: 'furnishings', name: 'Furnishings & fixtures', scoring: 'auto', autoSource: 'furnishings', deliverable: 'floor-plan',
      tiers: T(
        'Home is fully furnished. Furniture and fixtures give a viewer an understanding of the home and display quality room size and function.',
        'Home is furnished. Some furnishings or fixtures are out of place.',
        'Furnishings or fixtures are not present or do not fit in the home.',
        'No furnishings or fixtures.',
      ),
    },
    {
      id: 'doors', name: 'Doors', scoring: 'auto', autoSource: 'doors', deliverable: 'floor-plan',
      tiers: T(
        'Minimum of 2 entrances. Every bedroom, bathroom and closet has a properly sized door that opens in the right direction.',
        'Some doors are off in location and/or open in the wrong direction.',
        'Numerous doors off or missing.',
        'No doors.',
      ),
    },
    {
      id: 'closets', name: 'Closets', scoring: 'auto', autoSource: 'closets', deliverable: 'floor-plan',
      tiers: T(
        'Closets where required, appropriately sized.',
        'All closets present but wrong sizes.',
        'Some closets are missing.',
        'No closets.',
      ),
    },
  ],
  // No default bonuses — the paper rubric's "Yard +5" needs a yard tool that
  // doesn't exist yet; teachers add their own bonus/penalty rows as needed.
  bonuses: [],
};

// Ready-made teacher-graded categories the builder offers from a dropdown —
// deliverable-tagged so "Roof plan complete" hides on floor-plan-only
// assignments automatically. "Custom" is the blank starting point.
export const TEACHER_CATEGORY_PRESETS: Array<Omit<RubricCategory, 'id'>> = [
  {
    name: 'Room pairings & adjacency', scoring: 'teacher', deliverable: 'floor-plan',
    tiers: T(
      'Rooms are grouped the way a real home lives: bedrooms clustered away from noise, kitchen–dining–living connected.',
      'Groupings mostly make sense; one pairing is questionable.',
      'Several rooms are paired oddly (a bedroom opening into the kitchen, bathroom far from bedrooms).',
      'Room placement shows no grouping logic.',
    ),
  },
  {
    name: 'Creativity & presentation', scoring: 'teacher', deliverable: 'floor-plan',
    tiers: T(
      'The design shows original thinking and the plan is clean, labeled and a pleasure to read.',
      'Solid, readable plan with some personal touches.',
      'Functional but plain; presentation is rough in places.',
      'Hard to read; little care in presentation.',
    ),
  },
  {
    name: 'Roof plan complete', scoring: 'teacher', deliverable: 'roof-plan',
    tiers: T(
      'Roof plan is complete and coherent — ridges, valleys and overhangs all resolved.',
      'Roof plan is complete with minor issues.',
      'Roof plan is started but unresolved in places.',
      'No usable roof plan.',
    ),
  },
  {
    name: 'Cross section complete', scoring: 'teacher', deliverable: 'section',
    tiers: T(
      'Cross section is complete and reads correctly (foundation, walls, roof structure).',
      'Cross section is complete with minor issues.',
      'Cross section is partially done.',
      'No usable cross section.',
    ),
  },
  {
    name: 'Elevations complete', scoring: 'teacher', deliverable: 'elevations',
    tiers: T(
      'All four elevations are complete and consistent with the plan.',
      'Elevations complete with minor inconsistencies.',
      'Some elevations missing or inconsistent.',
      'No usable elevations.',
    ),
  },
  {
    name: 'Custom category', scoring: 'teacher', deliverable: 'floor-plan',
    tiers: T('Excellent.', 'Good.', 'Needs work.', 'Incomplete.'),
  },
];

// ─── Auto-tier computation ───────────────────────────────────────────────────

// Which checklist rows feed each auto source.
function checksForSource(checks: RubricCheck[], source: RubricAutoSource): RubricCheck[] {
  switch (source) {
    case 'requirements':
      return checks.filter(c => c.id.endsWith('-count') || c.id === 'total-sf');
    case 'sizes':
      return checks.filter(c => c.id.endsWith('-dims') || c.id === 'HALLWAY-width');
    case 'windows':
      return checks.filter(c => c.id.endsWith('-windows'));
    case 'doors':
      return checks.filter(c =>
        c.id.endsWith('-doors') || c.id.endsWith('-extra-door')
        || c.id === 'front-door' || c.id === 'back-door'
        || c.id === 'GARAGE-garage-door' || c.id === 'GARAGE-house-door');
    case 'furnishings':
      return checks.filter(c => c.id.includes('-furn-'));
    case 'closets':
      return checks.filter(c => c.id.endsWith('-closet'));
  }
}

// Context for "exceeded"-style top-tier judgments.
interface TierContext {
  extraRooms: string[];                              // living rooms beyond the brief
  bedrooms: { bedrooms: number; withTwoPlus: number }; // 2+-window standard
}

// Tier placement rule (teacher can always override):
//   0 fails + "exceeded" signal → tier 0 (met AND exceeded)
//   0 fails                     → tier 1 for requirements/windows (met), 0 elsewhere
//   SF-only miss (requirements) → tier 1
//   1 fail  → tier 2
//   2+ fails → tier 3
//   no applicable checks → tier 3 (empty plans don't score 14s)
function placeTier(relevant: RubricCheck[], source: RubricAutoSource, ctx: TierContext): AutoTierResult {
  const fails = relevant.filter(c => c.status === 'fail');
  if (relevant.length === 0) {
    return { tier: 3, evidence: 'No matching rooms drawn yet — this scores once the rooms exist.' };
  }
  if (fails.length === 0) {
    if (source === 'requirements') {
      if (ctx.extraRooms.length > 0) {
        return { tier: 0, evidence: `All requirements met AND exceeded — added ${ctx.extraRooms.join(', ')}.` };
      }
      return { tier: 1, evidence: 'All requirements met (nothing beyond the minimum yet).' };
    }
    if (source === 'windows') {
      if (ctx.bedrooms.bedrooms > 0 && ctx.bedrooms.withTwoPlus === ctx.bedrooms.bedrooms) {
        return { tier: 0, evidence: `All window checks pass and every bedroom has 2+ windows.` };
      }
      return {
        tier: 1,
        evidence: ctx.bedrooms.bedrooms > 0
          ? `All window checks pass; ${ctx.bedrooms.withTwoPlus} of ${ctx.bedrooms.bedrooms} bedrooms have 2+ windows (top tier wants all).`
          : `All ${relevant.length} checks pass.`,
      };
    }
    return { tier: 0, evidence: `All ${relevant.length} checks pass.` };
  }
  if (source === 'requirements') {
    const sfOnly = fails.length === 1 && fails[0].id === 'total-sf';
    if (sfOnly) return { tier: 1, evidence: `All rooms present — ${fails[0].detail}` };
  }
  const list = fails.slice(0, 2).map(f => f.label).join('; ');
  if (fails.length === 1) {
    return { tier: 2, evidence: `1 of ${relevant.length} checks failing: ${list}` };
  }
  return { tier: 3, evidence: `${fails.length} of ${relevant.length} checks failing: ${list}${fails.length > 2 ? '; …' : ''}` };
}

// Compute suggested tiers for every AUTO category against a level.
export function computeAutoTiers(
  level: Level, brief: Brief, rubric: GradingRubric,
): Record<string, AutoTierResult> {
  const checks = evaluateBrief(level, brief);
  const ctx: TierContext = {
    extraRooms: extraRoomTypes(level, brief),
    bedrooms: bedroomWindowStats(level),
  };
  const out: Record<string, AutoTierResult> = {};
  for (const cat of rubric.categories) {
    if (cat.scoring !== 'auto' || !cat.autoSource) continue;
    out[cat.id] = placeTier(checksForSource(checks, cat.autoSource), cat.autoSource, ctx);
  }
  return out;
}

// ─── Totals ──────────────────────────────────────────────────────────────────

export const rubricMaxPoints = (rubric: GradingRubric): number =>
  rubric.categories.reduce((s, c) => s + Math.max(...c.tiers.map(t => t.points)), 0);

// Final score: teacher tier where set, else the auto suggestion; teacher
// categories with no tier yet contribute nothing (grade incomplete).
export function computeGradeTotal(
  rubric: GradingRubric,
  autoTiers: Record<string, AutoTierResult>,
  teacher: TeacherScores,
): { total: number; complete: boolean } {
  let total = 0;
  let complete = true;
  for (const cat of rubric.categories) {
    const chosen = teacher.categories[cat.id]?.tier ?? autoTiers[cat.id]?.tier;
    if (chosen == null || !cat.tiers[chosen]) { complete = false; continue; }
    total += cat.tiers[chosen].points;
  }
  for (const b of rubric.bonuses) {
    if (teacher.bonuses[b.id]) total += b.points;
  }
  return { total, complete };
}

// Assignment configs may predate the rubric (or carry a partial one) — always
// resolve through this so old assignments grade with the default template.
export function resolveGradingRubric(config: { gradingRubric?: GradingRubric } | null | undefined): GradingRubric {
  const r = config?.gradingRubric;
  if (r && Array.isArray(r.categories) && r.categories.length > 0) {
    return { categories: r.categories, bonuses: Array.isArray(r.bonuses) ? r.bonuses : [] };
  }
  return DEFAULT_GRADING_RUBRIC;
}

// Filter categories to the assignment's chosen deliverables (floor-plan-only
// teachers never see roof/section/elevation rows).
export function rubricForDeliverables(rubric: GradingRubric, deliverables: string[]): GradingRubric {
  const allowed = new Set<string>(deliverables.length ? deliverables : ['floor-plan']);
  // 'section' rides along with roof-plan+elevations projects by convention.
  if (allowed.has('roof-plan') && allowed.has('elevations')) allowed.add('section');
  return {
    categories: rubric.categories.filter(c => allowed.has(c.deliverable)),
    bonuses: rubric.bonuses,
  };
}
