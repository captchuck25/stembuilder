'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import SiteHeader from '@/app/components/SiteHeader';
import {
  BotConfig, defaultBot, loadBotLocal, saveBotLocal, fetchCloudBot, syncBotToCloud,
  BODY_COLORS, ACCENT_COLORS, EYE_OPTIONS, HAT_OPTIONS, DECAL_OPTIONS, FEET_OPTIONS,
} from '../engine/bot';
import { renderBotPortrait } from '../engine/render';

const CARD: React.CSSProperties = {
  background: '#1a2540', border: '1px solid rgba(99,179,237,0.15)',
  borderRadius: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
}

export default function RobotGaragePage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [cfg, setCfg] = useState<BotConfig>(defaultBot);
  const [synced, setSynced] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // Load: local wins, else cloud
  useEffect(() => {
    if (status === 'loading') return;
    const local = loadBotLocal();
    if (local) { setCfg(local); return; }
    fetchCloudBot().then(c => { if (c) setCfg(c); });
  }, [status]);

  // Save: local immediately, cloud debounced
  useEffect(() => {
    saveBotLocal(cfg);
    if (!userId) return;
    setSynced(false);
    const timer = setTimeout(() => { syncBotToCloud(cfg); setSynced(true); }, 1200);
    return () => clearTimeout(timer);
  }, [cfg, userId]);

  // Live preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const loop = (now: number) => {
      renderBotPortrait(ctx, canvas.width, canvas.height, now, cfgRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const set = useCallback(<K extends keyof BotConfig>(key: K, value: BotConfig[K]) => {
    setCfg(c => ({ ...c, [key]: value }));
  }, []);

  const swatch = (color: string, active: boolean): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: 10, cursor: 'pointer', background: color,
    border: active ? '3px solid #FFD54A' : '2px solid rgba(255,255,255,0.2)',
  });

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700,
    background: active ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.06)',
    border: active ? '2px solid #7C3AED' : '2px solid rgba(255,255,255,0.12)',
    color: active ? '#e2e8f0' : '#94a3b8',
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px' }}>

          <div style={{ ...CARD, padding: '16px 24px', marginBottom: 20 }}>
            <Link href="/tools/arcade-lab" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Arcade Lab</Link>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#e2e8f0', margin: '6px 0 2px' }}>🔧 Robot Garage</h1>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', margin: 0 }}>
              Design YOUR bot. It plays every game with you — missions, your levels, and soon your classmates&apos; levels too.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Preview */}
            <div style={{ ...CARD, padding: 20, textAlign: 'center', flexShrink: 0 }}>
              <canvas ref={canvasRef} width={240} height={240}
                style={{ display: 'block', borderRadius: 14, background: 'linear-gradient(180deg, rgba(126,200,240,0.15), rgba(83,181,75,0.12))' }} />
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, marginTop: 10 }}>
                {userId ? (synced ? '☁️ Saved to your account' : '💾 Saving…') : '💾 Saved on this device'}
              </div>
            </div>

            {/* Options */}
            <div style={{ ...CARD, padding: '20px 24px', flex: 1, minWidth: 320 }}>
              <Section title="Body color">
                {BODY_COLORS.map(c => (
                  <button key={c} onClick={() => set('body', c)} style={swatch(c, cfg.body === c)} title={c} />
                ))}
              </Section>
              <Section title="Accent color">
                {ACCENT_COLORS.map(c => (
                  <button key={c} onClick={() => set('accent', c)} style={swatch(c, cfg.accent === c)} title={c} />
                ))}
              </Section>
              <Section title="Eyes">
                {EYE_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => set('eyes', o.id)} style={chip(cfg.eyes === o.id)}>
                    {o.emoji} {o.label}
                  </button>
                ))}
              </Section>
              <Section title="Headgear">
                {HAT_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => set('hat', o.id)} style={chip(cfg.hat === o.id)}>
                    {o.emoji} {o.label}
                  </button>
                ))}
              </Section>
              <Section title="Feet">
                {FEET_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => set('feet', o.id)} style={chip(cfg.feet === o.id)}>
                    {o.emoji} {o.label}
                  </button>
                ))}
              </Section>
              <Section title="Chest decal">
                {DECAL_OPTIONS.map(o => (
                  <button key={o.id} onClick={() => set('decal', o.id)} style={chip(cfg.decal === o.id)}>
                    {o.emoji} {o.label}
                  </button>
                ))}
              </Section>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <Link href="/tools/arcade-lab/create" style={{ padding: '11px 22px', background: '#7C3AED', color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                  🛠️ Take it for a spin →
                </Link>
                <button onClick={() => setCfg(defaultBot())}
                  style={{ padding: '11px 18px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                  ↺ Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
