// Robot Garage — each student's personal bot design. The config is cosmetic
// only (no gameplay effect) and follows the student everywhere: missions,
// Free Build, and (M5) playing classmates' levels. Their bot is their signature.

export type BotEyes = 'round' | 'visor' | 'sleepy' | 'googly' | 'cyclops';
export type BotHat = 'antenna' | 'cap' | 'fin' | 'mohawk' | 'propeller' | 'party' | 'crown';
export type BotDecal = 'none' | 'star' | 'bolt' | 'heart' | 'pizza' | 'rainbow';
export type BotFeet = 'wheels' | 'duck' | 'sneakers' | 'springs';

export interface BotConfig {
  body: string;
  accent: string;
  eyes: BotEyes;
  hat: BotHat;
  decal: BotDecal;
  feet: BotFeet;
}

export const BODY_COLORS = ['#4C8DFF', '#EF4444', '#22C55E', '#F59E0B', '#8E4EC6', '#EC4899', '#14B8A6', '#64748B'];
export const ACCENT_COLORS = ['#FFD54A', '#7DF9FF', '#FF6BD6', '#A3E635', '#FFFFFF', '#FB923C'];
export const EYE_OPTIONS: { id: BotEyes; label: string; emoji: string }[] = [
  { id: 'round', label: 'Round', emoji: '👀' },
  { id: 'visor', label: 'Visor', emoji: '🥽' },
  { id: 'sleepy', label: 'Sleepy', emoji: '😴' },
  { id: 'googly', label: 'Googly', emoji: '🤪' },
  { id: 'cyclops', label: 'Cyclops', emoji: '🔵' },
];
export const HAT_OPTIONS: { id: BotHat; label: string; emoji: string }[] = [
  { id: 'antenna', label: 'Antenna', emoji: '📡' },
  { id: 'cap', label: 'Cap', emoji: '🧢' },
  { id: 'fin', label: 'Fin', emoji: '🦈' },
  { id: 'mohawk', label: 'Mohawk', emoji: '🎸' },
  { id: 'propeller', label: 'Propeller', emoji: '🚁' },
  { id: 'party', label: 'Party Hat', emoji: '🎉' },
  { id: 'crown', label: 'Crown', emoji: '👑' },
];
export const FEET_OPTIONS: { id: BotFeet; label: string; emoji: string }[] = [
  { id: 'wheels', label: 'Wheels', emoji: '⚙️' },
  { id: 'duck', label: 'Duck Feet', emoji: '🦆' },
  { id: 'sneakers', label: 'Sneakers', emoji: '👟' },
  { id: 'springs', label: 'Springs', emoji: '🌀' },
];
export const DECAL_OPTIONS: { id: BotDecal; label: string; emoji: string }[] = [
  { id: 'none', label: 'None', emoji: '—' },
  { id: 'star', label: 'Star', emoji: '⭐' },
  { id: 'bolt', label: 'Bolt', emoji: '⚡' },
  { id: 'heart', label: 'Heart', emoji: '❤️' },
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'rainbow', label: 'Rainbow', emoji: '🌈' },
];

export function defaultBot(): BotConfig {
  return { body: '#4C8DFF', accent: '#FFD54A', eyes: 'visor', hat: 'antenna', decal: 'none', feet: 'wheels' };
}

export function sanitizeBot(raw: unknown): BotConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const d = defaultBot();
  const hex = (v: unknown, fallback: string) =>
    typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v) ? v : fallback;
  const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
    typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : fallback;
  return {
    body: hex(r.body, d.body),
    accent: hex(r.accent, d.accent),
    eyes: pick(r.eyes, ['round', 'visor', 'sleepy', 'googly', 'cyclops'], d.eyes),
    hat: pick(r.hat, ['antenna', 'cap', 'fin', 'mohawk', 'propeller', 'party', 'crown'], d.hat),
    decal: pick(r.decal, ['none', 'star', 'bolt', 'heart', 'pizza', 'rainbow'], d.decal),
    feet: pick(r.feet, ['wheels', 'duck', 'sneakers', 'springs'], d.feet),
  };
}

// ── Persistence: localStorage + cloud (tool arcade-lab, level 2, challenge 0) ─

const BOT_KEY = 'arcade_bot';

export function loadBotLocal(): BotConfig | null {
  try {
    const raw = localStorage.getItem(BOT_KEY);
    if (raw) return sanitizeBot(JSON.parse(raw));
  } catch { /* ignore */ }
  return null;
}

export function saveBotLocal(cfg: BotConfig) {
  try { localStorage.setItem(BOT_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

export async function fetchCloudBot(): Promise<BotConfig | null> {
  try {
    const res = await fetch('/api/progress?tool=arcade-lab');
    const rows = res.ok ? await res.json() : [];
    const row = (rows ?? []).find(
      (r: { level_idx: number; challenge_idx: number; saved_code?: string }) =>
        r.level_idx === 2 && r.challenge_idx === 0 && r.saved_code,
    );
    if (row?.saved_code) return sanitizeBot(JSON.parse(row.saved_code));
  } catch { /* ignore */ }
  return null;
}

export function syncBotToCloud(cfg: BotConfig) {
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'arcade-lab', level_idx: 2, challenge_idx: 0,
      completed: true, saved_code: JSON.stringify(cfg),
    }),
  }).catch(() => { /* offline is fine */ });
}
