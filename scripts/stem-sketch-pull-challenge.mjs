// Pull a saved STEM Sketch design out of Supabase and stage it as assignment
// challenge content. Usage (from repo root; .env.local must hold
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//
//   node scripts/stem-sketch-pull-challenge.mjs "<saved design name>" <challenge-slug> [--precision quarter] [--list] [--force]
//
//   --list       only list designs whose name matches (case-insensitive)
//   --precision  whole | half | quarter | eighth (default quarter) — the
//                dimension audit flags any number not on that inch grid
//   --force      write even if the audit fails or the JSON already exists
//
// Writes:
//   lib/stem-sketch/challenges/<slug>.json      (doc_json — the CLEAN reference)
//   public/stem-sketch/challenges/<slug>.jpg    (thumbnail, if the save has one)
//
// Rule from the challenge intake workflow: pull the reference from the CLEAN
// save (no FRONT engraving). The engraved teacher print is an STL only.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const STEP_MM_BY_PRECISION = { whole: 25.4, half: 12.7, quarter: 6.35, eighth: 3.175 }
const TOL = 0.05 // mm of float noise tolerated (editor stores e.g. 38.0999984)

function bail(code) { process.exitCode = code }

function loadEnv() {
  const env = {}
  for (const line of readFileSync(resolve('.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

// ── Dimension audit ──────────────────────────────────────────────────────
// Every length-like number in the body tree should sit on the precision grid
// (in mm). Audited: cube w/h/d, body positions x/y/z, extrude heights (a
// SUBTRACT extrude may overshoot by up to 1 mm — through-cuts do that on
// purpose), sketch plane origins, and sketch points converted to WORLD
// coordinates (origin + u*x + v*y) since sketch coords are relative to the
// face center. Derived values (regionCentroid) are skipped.
function auditDoc(doc, stepMm) {
  const offGrid = []
  const counts = { total: 0, byType: {} }
  const cubes = []
  const onGrid = v => Math.abs(v / stepMm - Math.round(v / stepMm)) * stepMm <= TOL
  const flag = (path, v) => { if (!onGrid(v)) offGrid.push({ path, mm: v, inches: v / 25.4 }) }
  const world = (pl, pt, a) => pl.origin[a] + pl.u[a] * pt.x + pl.v[a] * pt.y

  // POSITIONS are checked relative to the block's corner, not world zero —
  // a 3" cube centered on the origin has faces at ±1.5", which is still a
  // whole-inch block. The corner comes from the first (base) cube found.
  // SIZES (w/h/d, extrude height, radius) are checked absolutely.
  ;(function findBase(b) { if (b.type === 'cube' && !cubes.length) cubes.push(b); (b.children ?? []).forEach(findBase) })({ children: doc.bodies ?? [] })
  const base = cubes[0]
  // STEM Sketch cube convention: x/z are the CENTER, y is the BOTTOM face
  // (bodies rest on the workplane), so the corner is (x - w/2, y, z - d/2).
  const corner = base ? [base.x - base.w / 2, base.y, base.z - base.d / 2] : [0, 0, 0]
  const flagPos = (path, v, axis) => flag(path, v - corner[axis])

  function auditSketch(sk, path) {
    const pl = sk?.plane
    if (!pl?.origin || !pl.u || !pl.v) return
    // plane.origin is the FACE CENTER (1.5" on a 3" face) — not a dimension;
    // the sketch points below are what matter, checked in world coords.
    for (const [ei, e] of (sk.entities ?? []).entries()) {
      for (const [pi, pt] of (e.points ?? []).entries()) {
        for (let a = 0; a < 3; a++) flagPos(`${path}.entities[${ei}].points[${pi}].world.${'xyz'[a]}`, world(pl, pt, a), a)
      }
      if (typeof e.r === 'number') flag(`${path}.entities[${ei}].r`, e.r)
      if (e.center) for (let a = 0; a < 3; a++) flagPos(`${path}.entities[${ei}].center.world.${'xyz'[a]}`, world(pl, e.center, a), a)
    }
  }
  function auditBody(b, path) {
    counts.total++; counts.byType[b.type] = (counts.byType[b.type] ?? 0) + 1
    if (b.type === 'cube' && b !== base) cubes.push(b)
    for (const k of ['w', 'h', 'd', 'r', 'radius']) if (typeof b[k] === 'number') flag(`${path}.${k}`, b[k])
    // Body position = its center; a cube's corner is what must sit on the grid.
    if (b.type === 'cube') {
      flagPos(`${path}.x(min)`, b.x - b.w / 2, 0); flagPos(`${path}.y(min)`, b.y, 1); flagPos(`${path}.z(min)`, b.z - b.d / 2, 2)
    } else if (b.type !== 'group' && b.type !== 'extrude') {
      for (const [i, k] of ['x', 'y', 'z'].entries()) if (typeof b[k] === 'number') flagPos(`${path}.${k}`, b[k], i)
    }
    if (typeof b.height === 'number') {
      const over = b.height - Math.floor(b.height / stepMm + 1e-6) * stepMm
      const okOvershoot = b.op === 'subtract' && over > TOL && over <= 1.0
      if (!okOvershoot) flag(`${path}.height`, b.height)
    }
    if (b.sketch) auditSketch(b.sketch, `${path}.sketch`)
    for (const [i, c] of (b.children ?? []).entries()) auditBody(c, `${path}.children[${i}]`)
  }
  for (const [i, b] of (doc.bodies ?? []).entries()) auditBody(b, `bodies[${i}]`)
  return { offGrid, counts, cubes, roots: (doc.bodies ?? []).length }
}

async function main() {
  const args = process.argv.slice(2)
  const flags = new Set(args.filter(a => a.startsWith('--')))
  const precisionIdx = args.indexOf('--precision')
  const precision = precisionIdx >= 0 ? args[precisionIdx + 1] : 'quarter'
  const positional = args.filter((a, i) => !a.startsWith('--') && (precisionIdx < 0 || i !== precisionIdx + 1))
  const [designName, slug] = positional

  if (!designName) {
    console.error('usage: node scripts/stem-sketch-pull-challenge.mjs "<design name>" <slug> [--list] [--precision quarter] [--force]')
    return bail(1)
  }
  const stepMm = STEP_MM_BY_PRECISION[precision]
  if (!stepMm) { console.error(`bad --precision ${precision}`); return bail(1) }

  const env = loadEnv()
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local'); return bail(1) }

  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const q = `${url}/rest/v1/stem_sketch_designs?select=id,user_id,name,units,updated_at,thumbnail,doc_json` +
    `&deleted_at=is.null&name=ilike.*${encodeURIComponent(designName)}*&order=updated_at.desc`
  const res = await fetch(q, { headers })
  if (!res.ok) { console.error('Supabase error', res.status, await res.text()); return bail(1) }
  const rows = await res.json()

  if (rows.length === 0) { console.error(`No designs match "${designName}"`); return bail(1) }
  console.log(`Matches for "${designName}":`)
  for (const r of rows) console.log(`  [${r.id}] ${r.name}  (${r.units}, updated ${r.updated_at}, thumb ${r.thumbnail ? 'yes' : 'no'})`)
  if (flags.has('--list') || !slug) return

  const exact = rows.filter(r => r.name.toLowerCase() === designName.toLowerCase())
  if (rows.length > 1 && exact.length !== 1) {
    console.error(`\n${rows.length} matches and no single exact name match — rerun with the exact saved name.`)
    return bail(1)
  }
  const row = exact[0] ?? rows[0]
  console.log(`\nUsing [${row.id}] ${row.name}`)

  const doc = row.doc_json
  const { offGrid, counts, cubes, roots } = auditDoc(doc, stepMm)
  console.log(`\nBodies: ${counts.total}`, counts.byType)
  // The fit check unions every top-level body, so several roots are allowed,
  // but a stray extra body is the usual authoring slip — so it's printed.
  console.log(`Top-level bodies: ${roots}`)
  if (cubes.length) {
    const inch = v => (v / 25.4).toFixed(2)
    console.log('Cubes (in):', cubes.map(c => `${inch(c.w)}x${inch(c.h)}x${inch(c.d)}`).join(', '))
  }
  if (offGrid.length) {
    console.log(`\nWARNING: ${offGrid.length} value(s) off the ${precision}-inch grid:`)
    for (const o of offGrid.slice(0, 40)) console.log(`  ${o.path} = ${o.mm.toFixed(3)} mm (${o.inches.toFixed(4)} in)`)
    if (!flags.has('--force')) { console.log('\nNot writing. Fix the design or rerun with --force.'); return bail(2) }
  } else {
    console.log(`OK: every audited dimension is on the ${precision}-inch grid`)
  }

  const jsonPath = resolve('lib/stem-sketch/challenges', `${slug}.json`)
  const jpgPath = resolve('public/stem-sketch/challenges', `${slug}.jpg`)
  if (existsSync(jsonPath) && !flags.has('--force')) {
    console.log(`\n${jsonPath} exists — pass --force to overwrite.`); return bail(2)
  }
  writeFileSync(jsonPath, JSON.stringify(doc))
  console.log(`\nwrote ${jsonPath}`)
  if (row.thumbnail) {
    const m = String(row.thumbnail).match(/^data:image\/(\w+);base64,(.*)$/s)
    if (m) {
      const out = jpgPath.replace(/\.jpg$/, `.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
      writeFileSync(out, Buffer.from(m[2], 'base64'))
      console.log(`wrote ${out}`)
    } else console.log('thumbnail present but not a data URL — skipped')
  } else console.log('no thumbnail on this save (re-save in STEM Sketch to capture one)')
  console.log('\nNext: add/update the entry in lib/stem-sketch/challenges.ts and drop the STL into public/stem-sketch/challenges/.')
}

await main()
