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
  updatedAt: string;
  bot: unknown;
  ownerId: string;
  ownerName: string;
  record: { ms: number; name: string } | null;
  myBestMs: number | null;
}

function fmt(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
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

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 12 }}>
                  <span>🕹 {g.plays} play{g.plays === 1 ? '' : 's'}</span>
                  {g.record
                    ? <span title={`Record held by ${g.record.name}`}>🏆 {fmt(g.record.ms)} — {g.record.name}</span>
                    : <span>🏆 No record yet</span>}
                  {g.myBestMs != null && <span style={{ color: '#7DF9FF' }}>Me: {fmt(g.myBestMs)}</span>}
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
