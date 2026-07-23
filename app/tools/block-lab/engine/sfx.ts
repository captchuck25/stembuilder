// Tiny WebAudio sound effects for Block Lab — no assets, all synthesized.
// Everything is wrapped in try/catch and gated on the mute flag so a broken
// or blocked AudioContext can never take down the game.

const MUTE_KEY = 'block_lab_muted';

let ctx: AudioContext | null = null;
let muted: boolean | null = null;

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch { /* ignore */ }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; slideTo?: number } = {},
) {
  if (isMuted()) return;
  const ac = audio();
  if (!ac) return;
  try {
    const { type = 'sine', gain = 0.12, delay = 0, slideTo } = opts;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + duration);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + duration);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch { /* ignore */ }
}

/** Soft tick for each forward step */
export function playMove() {
  tone(340, 0.055, { type: 'triangle', gain: 0.05 });
}

/** Two-note rising chime on collect */
export function playCollect() {
  tone(660, 0.09, { gain: 0.12 });
  tone(990, 0.14, { gain: 0.12, delay: 0.07 });
}

/** Low descending thud on wall bump */
export function playBump() {
  tone(160, 0.22, { type: 'sawtooth', gain: 0.1, slideTo: 55 });
}

/** Muted low blip — Collect used on an empty square */
export function playEmpty() {
  tone(200, 0.07, { type: 'triangle', gain: 0.04 });
}

/** Squash + pop — stomping an enemy (Arcade Lab) */
export function playStomp() {
  tone(380, 0.1, { type: 'square', gain: 0.09, slideTo: 120 });
  tone(720, 0.07, { gain: 0.08, delay: 0.06 });
}

/** Laser-ish zap (Arcade Lab sound block) */
export function playZap() {
  tone(900, 0.12, { type: 'sawtooth', gain: 0.07, slideTo: 180 });
}

/** Short victory fanfare */
export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(f, i === notes.length - 1 ? 0.4 : 0.14, { gain: 0.13, delay: i * 0.11 }));
  tone(1318.5, 0.5, { gain: 0.06, delay: 0.44 });
}
