'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import SiteHeader from '@/app/components/SiteHeader';
import {
  ARCADE_MISSIONS, ArcadeUnitProgress, emptyUnitProgress,
  loadUnitProgress, loadCloudUnitProgress, mergeUnitProgress, saveUnitProgress,
} from './unit';

const CARD: React.CSSProperties = {
  background: '#1a2540', border: '1px solid rgba(99,179,237,0.15)',
  borderRadius: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
};

export default function ArcadeLabLanding() {
  const { data: session, status } = useSession();
  const role = session?.user?.role ?? 'student';
  const [progress, setProgress] = useState<ArcadeUnitProgress>(emptyUnitProgress);

  useEffect(() => {
    if (status === 'loading') return;
    const local = loadUnitProgress();
    setProgress(local);
    loadCloudUnitProgress().then(cloud => {
      const merged = mergeUnitProgress(local, cloud);
      setProgress(merged);
      saveUnitProgress(merged);
    });
  }, [status]);

  const done = ARCADE_MISSIONS.filter((_, i) => progress.completed[i]).length;
  const total = ARCADE_MISSIONS.length;
  const teacher = role === 'teacher' || role === 'admin';
  const createUnlocked = progress.unitComplete || teacher;

  const TILE_CARD: React.CSSProperties = {
    ...CARD, width: 340, padding: 28, textDecoration: 'none', display: 'block',
    transition: 'transform 150ms ease, box-shadow 150ms ease',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 32px' }}>

          <div style={{ ...CARD, padding: '20px 28px', marginBottom: 28 }}>
            <Link href="/tools/code-lab" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Code Lab</Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>🕹️ Arcade Lab</h1>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', background: '#FFD54A', borderRadius: 12, padding: '3px 10px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Beta</span>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', margin: 0 }}>
              Learn to code real game rules — then build your own game and beat it.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

            {/* Missions */}
            <Link href="/tools/arcade-lab/missions" style={TILE_CARD}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}>
              <div style={{ fontSize: 40 }}>🎓</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>Game Coder Missions</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 16 }}>
                Ten broken games. You fix them — wire the controls, write the rules, tune the difficulty, debug the wiring. Finish the missions (and the quiz) to unlock Free Build.
              </div>
              <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 20, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${Math.round(done / total * 100)}%`, height: '100%', background: '#7C3AED', borderRadius: 20, transition: 'width 400ms ease' }} />
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                {done} / {total} missions{progress.unitComplete ? ' · ✅ unit complete' : progress.quizScore !== null ? ` · quiz ${progress.quizScore}/5` : ''}
              </div>
            </Link>

            {/* Robot Garage */}
            <Link href="/tools/arcade-lab/garage" style={TILE_CARD}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}>
              <div style={{ fontSize: 40 }}>🔧</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>Robot Garage</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>
                Design YOUR bot — colors, eyes, headgear, decal. It stars in every game you play, and it&apos;s your signature when you share.
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>✅ Always open</div>
            </Link>

            {/* Free Build */}
            <Link href="/tools/arcade-lab/create" style={{ ...TILE_CARD, opacity: createUnlocked ? 1 : 0.6, position: 'relative' }}
              onMouseEnter={e => { if (createUnlocked) (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}>
              {!createUnlocked && <div style={{ position: 'absolute', top: 16, right: 18, fontSize: 22 }}>🔒</div>}
              {teacher && !progress.unitComplete && (
                <div style={{ position: 'absolute', top: 18, right: 18, fontSize: 10, fontWeight: 800, color: '#0f172a', background: '#FFD54A', borderRadius: 10, padding: '3px 8px', textTransform: 'uppercase' }}>Teacher access</div>
              )}
              <div style={{ fontSize: 40 }}>🛠️</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>Free Build</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>
                The full game studio: design your level, code every rule, test until it&apos;s fun. {createUnlocked ? 'Unlocked — go make something!' : 'Complete the Missions to unlock.'}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: createUnlocked ? '#4ade80' : '#64748b' }}>
                {createUnlocked ? '✅ Unlocked' : `🔒 Locked — ${total - done} mission${total - done === 1 ? '' : 's'} to go`}
              </div>
            </Link>

            {/* Class Arcade */}
            <Link href="/tools/arcade-lab/arcade" style={TILE_CARD}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}>
              <div style={{ fontSize: 40 }}>🏟️</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>Class Arcade</div>
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>
                Play the games your classmates built and coded. Every level is creator-certified beatable — the only question is: how fast? ⏱
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#4ade80' }}>✅ Always open</div>
            </Link>

          </div>
        </div>
      </main>
    </div>
  );
}
