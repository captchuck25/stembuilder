// Load .env.local (Next.js convention) into process.env for tests, without a
// dotenv dependency. Values already present in the environment win.
import fs from 'fs'
import path from 'path'

for (const file of ['.env.local', '.env']) {
  const p = path.resolve(__dirname, '..', file)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (process.env[key] !== undefined) continue
    process.env[key] = rawValue.replace(/^["']|["']$/g, '')
  }
}
