'use client';

// The grading rubric surface, two modes:
//  - 'student': centered modal — live standing on AUTO categories (engine
//    tier + evidence), "Teacher graded" badges on judgment rows; once graded,
//    shows the teacher's tiers/comments and the total.
//  - 'teacher': docked right-side panel in the grading view — auto tiers
//    pre-placed (overridable), tier pickers for judgment rows, comments,
//    bonuses, save-draft / return / finalize actions.

import { useMemo, useState } from 'react';
import {
  AutoTierResult, GradingRubric, TeacherScores, computeGradeTotal, rubricMaxPoints,
} from '../engine/gradingRubric';
import { T } from '../engine/theme';

export const emptyTeacherScores = (): TeacherScores => ({ categories: {}, bonuses: {} });

function TierRow({ chosen, suggested, points, descriptor, onPick }: {
  chosen: boolean; suggested: boolean; points: number; descriptor: string;
  onPick?: () => void;
}) {
  return (
    <div
      onClick={onPick}
      style={{
        display: 'flex', gap: 8, padding: '5px 8px', borderRadius: 6, marginBottom: 2,
        background: chosen ? T.accentSoft : 'transparent',
        border: chosen ? `1px solid ${T.accent}` : '1px solid transparent',
        cursor: onPick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        fontSize: 11, fontWeight: 800, minWidth: 22, textAlign: 'right',
        color: chosen ? T.accentInk : T.inkMuted,
      }}>{points}</span>
      <span style={{ fontSize: 11, color: chosen ? T.ink : T.inkSoft, lineHeight: 1.4, flex: 1 }}>
        {descriptor}
        {suggested && !chosen && (
          <span style={{ color: T.accentInk, fontWeight: 600 }}> (suggested)</span>
        )}
      </span>
    </div>
  );
}

export default function RubricPanel({
  mode, rubric, autoTiers, teacherScores, gradeTotal, graded,
  onClose, onChangeScores, onSaveDraft, onReturn, onFinalize, busy,
}: {
  mode: 'student' | 'teacher';
  rubric: GradingRubric;
  autoTiers: Record<string, AutoTierResult>;
  teacherScores: TeacherScores;
  gradeTotal?: number | null;
  graded?: boolean;
  onClose: () => void;
  onChangeScores?: (s: TeacherScores) => void;
  onSaveDraft?: () => void;
  onReturn?: () => void;
  onFinalize?: (total: number) => void;
  busy?: boolean;
}) {
  const [confirmingReturn, setConfirmingReturn] = useState(false);
  const max = rubricMaxPoints(rubric);
  const { total, complete } = useMemo(
    () => computeGradeTotal(rubric, autoTiers, teacherScores),
    [rubric, autoTiers, teacherScores],
  );

  const pickTier = (catId: string, tier: number) => {
    if (!onChangeScores) return;
    onChangeScores({
      ...teacherScores,
      categories: { ...teacherScores.categories, [catId]: { ...teacherScores.categories[catId], tier } },
    });
  };
  const setComment = (catId: string, comment: string) => {
    if (!onChangeScores) return;
    onChangeScores({
      ...teacherScores,
      categories: { ...teacherScores.categories, [catId]: { ...teacherScores.categories[catId], comment } },
    });
  };

  const body = (
    <>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: T.ink, flex: 1 }}>
          {mode === 'teacher' ? 'GRADE — RUBRIC' : 'RUBRIC'}
        </span>
        {(mode === 'teacher' || graded) && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: T.accentSoft, color: T.accentInk,
          }}>
            {graded && mode === 'student' ? `${gradeTotal ?? total}` : total}/{max}
            {mode === 'teacher' && !complete ? ' · incomplete' : ''}
          </span>
        )}
        <button onClick={onClose} title="Close"
          style={{ border: 'none', background: 'transparent', color: T.inkMuted, cursor: 'pointer', fontSize: 14, padding: 2 }}>
          ✕
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: '8px 10px', flex: 1 }}>
        {rubric.categories.map(cat => {
          const auto = autoTiers[cat.id];
          const override = teacherScores.categories[cat.id]?.tier;
          const chosen = override ?? (cat.scoring === 'auto' ? auto?.tier : undefined);
          const isTeacherCat = cat.scoring === 'teacher';
          const showTierState = mode === 'teacher' || !isTeacherCat || !!graded;
          return (
            <div key={cat.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px 3px' }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.3, color: T.inkSoft, flex: 1 }}>
                  {cat.name.toUpperCase()}
                </span>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                  background: isTeacherCat ? '#fff4e0' : '#e6f7ef',
                  color: isTeacherCat ? '#a05a00' : T.good,
                }}>
                  {isTeacherCat ? 'TEACHER GRADED' : 'AUTO'}
                </span>
              </div>
              {cat.tiers.map((tier, i) => (
                <TierRow
                  key={i}
                  points={tier.points}
                  descriptor={tier.descriptor}
                  chosen={showTierState && chosen === i}
                  suggested={mode === 'teacher' && cat.scoring === 'auto' && auto?.tier === i && override != null && override !== i}
                  onPick={mode === 'teacher' ? () => pickTier(cat.id, i) : undefined}
                />
              ))}
              {cat.scoring === 'auto' && auto && (
                <div style={{ fontSize: 10, color: T.inkMuted, padding: '2px 8px', lineHeight: 1.4 }}>
                  {auto.evidence}
                  {mode === 'teacher' && override != null && override !== auto.tier ? ' — overridden' : ''}
                </div>
              )}
              {isTeacherCat && mode === 'student' && !graded && (
                <div style={{ fontSize: 10, color: T.inkMuted, padding: '2px 8px' }}>
                  Your teacher scores this after you submit.
                </div>
              )}
              {graded && teacherScores.categories[cat.id]?.comment && (
                <div style={{
                  fontSize: 10.5, color: T.accentInk, background: T.accentSoft,
                  borderRadius: 6, padding: '4px 8px', margin: '3px 4px 0', lineHeight: 1.4,
                }}>
                  “{teacherScores.categories[cat.id]!.comment}”
                </div>
              )}
              {mode === 'teacher' && (
                <input
                  placeholder="Comment (optional)"
                  value={teacherScores.categories[cat.id]?.comment ?? ''}
                  onChange={e => setComment(cat.id, e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box', margin: '3px 4px 0', fontSize: 11,
                    padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.line}`,
                    color: T.ink, background: T.panel,
                  }}
                />
              )}
            </div>
          );
        })}

        {rubric.bonuses.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.inkSoft, padding: '0 4px 3px' }}>
              BONUS / PENALTY
            </div>
            {rubric.bonuses.map(b => (
              <label key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5,
                color: T.ink, padding: '3px 8px', cursor: mode === 'teacher' ? 'pointer' : 'default',
              }}>
                <input
                  type="checkbox"
                  disabled={mode !== 'teacher'}
                  checked={!!teacherScores.bonuses[b.id]}
                  onChange={e => onChangeScores?.({
                    ...teacherScores,
                    bonuses: { ...teacherScores.bonuses, [b.id]: e.target.checked },
                  })}
                />
                {b.label}
                <span style={{ color: b.points >= 0 ? T.good : T.danger, fontWeight: 700 }}>
                  {b.points >= 0 ? `+${b.points}` : b.points}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {mode === 'teacher' && (
        <div style={{
          padding: '10px 12px', borderTop: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onSaveDraft} disabled={busy}
              style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: '7px 0', borderRadius: 6,
                border: `1px solid ${T.lineStrong}`, background: T.panel, color: T.ink, cursor: 'pointer',
              }}>
              Save draft
            </button>
            <button
              onClick={() => { if (confirmingReturn) { setConfirmingReturn(false); onReturn?.(); } else setConfirmingReturn(true); }}
              disabled={busy}
              style={{
                flex: 1, fontSize: 12, fontWeight: 600, padding: '7px 0', borderRadius: 6,
                border: `1px solid ${confirmingReturn ? T.danger : T.lineStrong}`,
                background: confirmingReturn ? '#fff5f5' : T.panel,
                color: confirmingReturn ? T.danger : T.ink, cursor: 'pointer',
              }}>
              {confirmingReturn ? 'Confirm return?' : 'Return for edits'}
            </button>
          </div>
          <button
            onClick={() => onFinalize?.(total)}
            disabled={busy || !complete}
            title={complete ? undefined : 'Score every category first'}
            style={{
              fontSize: 12.5, fontWeight: 800, padding: '8px 0', borderRadius: 6,
              border: 'none', background: complete ? T.accent : T.lineStrong,
              color: '#fff', cursor: complete ? 'pointer' : 'not-allowed',
            }}>
            Finalize grade — {total}/{max}
          </button>
        </div>
      )}
    </>
  );

  if (mode === 'teacher') {
    return (
      <aside style={{
        width: 300, flexShrink: 0, background: T.panel,
        borderLeft: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column',
      }}>
        {body}
      </aside>
    );
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(20,28,65,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: T.panel, borderRadius: 12, boxShadow: T.shadow,
        width: 420, maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100% - 48px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {body}
      </div>
    </div>
  );
}
