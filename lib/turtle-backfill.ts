import { CHALLENGES } from '@/app/tools/code-lab/turtle/challenges';
import { saveTurtleWork } from '@/lib/achievements';

// One-time backfill of tutorial completions that previously lived only in
// localStorage. Designed to be safe to call from any signed-in client page —
// guarded by a per-user localStorage flag so it runs at most once per device
// per user. If there's nothing to backfill the flag is set immediately so we
// don't keep hitting localStorage on every page.
//
// Safe to call multiple times in parallel — the flag check short-circuits
// after the first attempt, and the server upserts on (user_id, challenge_id)
// so duplicate POSTs are no-ops.
export async function runTurtleBackfillOnce(userId: string): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;
  const flagKey = `turtle_backfill_done:${userId}`;
  if (localStorage.getItem(flagKey) === '1') return;

  let localIds: string[] = [];
  try {
    const saved = localStorage.getItem('turtle_completed');
    if (saved) localIds = JSON.parse(saved) as string[];
  } catch {}

  const tutorialIdSet = new Set(
    CHALLENGES.filter(c => c.category === 'tutorial').map(c => c.id),
  );
  const toBackfill = localIds.filter(id => tutorialIdSet.has(id));
  if (toBackfill.length === 0) {
    localStorage.setItem(flagKey, '1');
    return;
  }

  try {
    const res = await fetch('/api/turtle');
    const existing: Array<{ challenge_id: string }> = res.ok ? await res.json() : [];
    const existingIds = new Set(existing.map(s => s.challenge_id));
    const missing = toBackfill.filter(id => !existingIds.has(id));
    for (const id of missing) {
      const ch = CHALLENGES.find(c => c.id === id);
      if (!ch) continue;
      // Empty image is fine — the teacher dashboard keys completion off row
      // existence, not the thumbnail. Server-side lock enforcement rejects
      // locked items, which is the intended behavior.
      await saveTurtleWork(userId, id, ch.starterCode, '').catch(() => {});
    }
  } finally {
    localStorage.setItem(flagKey, '1');
  }
}
