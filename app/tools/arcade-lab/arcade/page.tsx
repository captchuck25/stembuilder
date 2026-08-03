'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '@/app/components/SiteHeader';
import { BotConfig, defaultBot, sanitizeBot } from '../engine/bot';
import { renderBotPortrait } from '../engine/render';

const CARD: React.CSSProperties = {
  background: '#1a2540', border: '1px solid rgba(99,179,237,0.15)',
  borderRadius: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
};

interface GalleryGame {
  id: string;
  title: string;
  plays: number;
  attempts: number;
  wins: number;
  updatedAt: string;
  bot: unknown;
  ownerId: string;
  ownerName: string;
  record: { ms: number; name: string } | null;
  topRuns: { name: string; ms: number; mine: boolean; isDesigner: boolean }[];
  myBestMs: number | null;
}

function fmt(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Kid-readable difficulty from the class-wide win rate */
function difficulty(attempts: number, wins: number): { label: string; color: string } | null {
  if (attempts < 3) return null; // not enough tries to judge
  const rate = wins / attempts;
  if (rate >= 0.6) return { label: '😊 Chill', color: '#4ade80' };
  if (rate >= 0.3) return { label: '😅 Tricky', color: '#fbbf24' };
  if (rate > 0) return { label: '🔥 Brutal', color: '#f87171' };
  return { label: '💀 Unbeaten', color: '#f87171' };
}

function BotFace({ bot }: { bot: unknown }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cfg: BotConfig = sanitizeBot(bot) ?? defaultBot();
    renderBotPortrait(canvas.getContext('2d')!, canvas.width, canvas.height, 0, cfg);
  }, [bot]);
  return <canvas ref={ref} width={64} height={64} style={{ display: 'block' }} />;
}

export default function ClassArcadePage() {
  const [games, setGames] = useState<GalleryGame[] | null>(null);
  const [role, setRole] = useState<string>('student');
  const [meId, setMeId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  const load = useCallback(() => {
    fetch('/api/arcade/games')
      .then(r => (r.ok ? r.json() : { games: [] }))
      .then(data => {
        setGames(data.games ?? []);
        setRole(data.role ?? 'student');
        setClosed(!!data.closed);
      });
    fetch('/api/auth/session')
      .then(r => (r.ok ? r.json() : null))
      .then(s => setMeId(s?.user?.id ?? null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = useCallback(async (g: GalleryGame) => {
    const isMine = g.ownerId === meId;
    if (!confirm(isMine
      ? `Unpublish "${g.title}"? Classmates will no longer see it. Your draft in Free Build is not affected.`
      : `Take down "${g.title}" by ${g.ownerName}? (Their Free Build draft is not affected.)`)) return;
    setRemoving(g.id);
    const res = await fetch(`/api/arcade/games?id=${g.id}`, { method: 'DELETE' });
    setRemoving(null);
    if (res.ok) setGames(prev => (prev ?? []).filter(x => x.id !== g.id));
  }, [meId]);

  const isStaff = role !== 'student';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px' }}>

          <div style={{ ...CARD, padding: '16px 24px', marginBottom: 20 }}>
            <Link href="/tools/arcade-lab" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Arcade Lab</Link>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#e2e8f0', margin: '6px 0 2px' }}>🏟️ Class Arcade</h1>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', margin: 0 }}>
              Games built and coded by your class. Beat them — then beat the clock. Fastest run holds the record. ⏱
            </p>
          </div>

          {games === null && (
            <div style={{ ...CARD, padding: '40px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
              Loading the arcade…
            </div>
          )}

          {games !== null && games.length === 0 && closed && (
            <div style={{ ...CARD, padding: '48px 40px', textAlign: 'center' }}>
              <div style={{ fontSize: 48 }}>🔒</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', margin: '12px 0 8px' }}>The arcade is closed right now</h2>
              <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
                Your teacher has locked the Class Arcade. Check back when it reopens!
              </p>
            </div>
          )}

          {games !== null && games.length === 0 && !closed && (
            <div style={{ ...CARD, padding: '48px 40px', textAlign: 'center' }}>
              <div style={{ fontSize: 48 }}>🕹️</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', margin: '12px 0 8px' }}>No games in the arcade yet</h2>
              <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 20px' }}>
                Be the first! Build a level in Free Build, beat it yourself, and hit Publish.
              </p>
              <Link href="/tools/arcade-lab/create" style={{ display: 'inline-block', padding: '11px 26px', background: '#7C3AED', color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                🛠️ Open Free Build →
              </Link>
            </div>
          )}

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {(games ?? []).map(g => (
              <div key={g.id} style={{ ...CARD, width: 290, padding: 18, position: 'relative' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, flexShrink: 0 }}>
                    <BotFace bot={g.bot} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>by {g.ownerName}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 10 }}>
                  <span>🕹 {g.plays} play{g.plays === 1 ? '' : 's'}</span>
                  {g.attempts >= 3 && (
                    <span title={`${g.wins} win${g.wins === 1 ? '' : 's'} in ${g.attempts} tries across the class`}
                      style={{ color: difficulty(g.attempts, g.wins)?.color }}>
                      {difficulty(g.attempts, g.wins)?.label} · {g.wins}/{g.attempts}
                    </span>
                  )}
                  {g.myBestMs != null && <span style={{ color: '#7DF9FF' }}>Me: {fmt(g.myBestMs)}</span>}
                </div>

                {/* Top 5 — the class leaderboard at a glance */}
                <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: '8px 12px', marginBottom: 12, minHeight: 34 }}>
                  {g.topRuns.length === 0 ? (
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>🏆 No finishes yet — set the first time!</div>
                  ) : (
                    g.topRuns.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11, fontWeight: 700, lineHeight: '18px', color: r.mine ? '#7DF9FF' : i === 0 ? '#FFD54A' : '#94a3b8' }}>
                        <span style={{ width: 16, flexShrink: 0 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.name}{r.isDesigner ? ' 🛠' : ''}{r.mine ? ' (me)' : ''}
                        </span>
                        <span style={{ flexShrink: 0 }}>{fmt(r.ms)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/tools/arcade-lab/play/${g.id}`}
                    style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: '#7C3AED', color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                    ▶ Play
                  </Link>
                  {(isStaff || g.ownerId === meId) && (
                    <button onClick={() => remove(g)} disabled={removing === g.id}
                      title={g.ownerId === meId ? 'Unpublish my game' : 'Teacher takedown'}
                      style={{ padding: '10px 12px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>
                      {removing === g.id ? '…' : '🗑'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
