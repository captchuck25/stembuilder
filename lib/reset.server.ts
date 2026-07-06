import crypto from 'crypto'

// ─── Self-service reset tokens ───────────────────────────────────────────────
// The raw token travels in the reset URL; only its SHA-256 hash is stored in the
// database. A leaked password_reset_tokens table therefore can't be used to reset
// anyone's password.

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function createResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url')
  return { raw, hash: sha256(raw) }
}

// ─── Teacher-issued temporary passwords ──────────────────────────────────────
// Readable word-word-## passwords a teacher can say out loud to a student who
// can't reach their own email (or has no email at all). Always ≥ 8 characters,
// avoids ambiguous look-alike words.

const ADJECTIVES = [
  'brave', 'bright', 'calm', 'clever', 'eager', 'fair', 'gentle', 'happy',
  'jolly', 'keen', 'lucky', 'mighty', 'noble', 'proud', 'quick', 'swift',
  'sunny', 'witty', 'zippy', 'bold',
]
const NOUNS = [
  'tiger', 'maple', 'comet', 'river', 'falcon', 'pixel', 'rocket', 'cedar',
  'harbor', 'meadow', 'cactus', 'planet', 'anchor', 'pebble', 'garnet',
  'walrus', 'thunder', 'orbit', 'canyon', 'willow',
]

export function generateTempPassword(): string {
  const a = ADJECTIVES[crypto.randomInt(ADJECTIVES.length)]
  const n = NOUNS[crypto.randomInt(NOUNS.length)]
  const num = 10 + crypto.randomInt(90) // two digits, 10–99
  return `${a}-${n}-${num}` // e.g. "brave-tiger-42" — always ≥ 8 chars
}
