// Headless fit-check smoke for a STEM Sketch challenge (needs a server on :3000 — `python -m http.server 3000 --directory public` is enough).
// Usage: node scripts/stem-sketch-fitcheck-smoke.mjs <slug> [stage] [targetCubeIn] [mustPassDoc.json]
// loads the iframe
// straight from the dev server, enters assignment preview mode with the
// challenge's reference, then checks (a) the reference itself as the student
// model → must PASS, (b) a plain cube → must FAIL. Exercises the same
// _computeFit pipeline the teacher preview uses, minus the auth'd shell.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const slug = process.argv[2] || "s1-01-starter-brick";
const stage = Number(process.argv[3] || 1);
const targetCubeIn = process.argv[4] ? Number(process.argv[4]) : null;
const ref = JSON.parse(readFileSync(`./lib/stem-sketch/challenges/${slug}.json`, "utf8"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });

await page.goto("http://localhost:3000/stem-sketch/index.html", { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => !!window.__manifold, null, { timeout: 120000 });
console.log("engine ready");

const challenge = { id: slug, stage, title: slug, precision: "quarter", studentInstructions: "test", refDocJson: ref, toleranceMm: 0.5, targetCubeIn };
await page.evaluate(c => window.postMessage({ type: "STEMSKETCH_ASSIGNMENT", assignment: { id: "preview", preview: true, challenge: c } }, "*"), challenge);
await page.waitForFunction(() => !!window.__assignment, null, { timeout: 20000 });
console.log("assignment mode entered");

async function check(label, docJson) {
  const sig = b => JSON.stringify(b.map(x => [x.type, x.op, (x.children || []).map(c => c.type + ":" + c.op)]));
  const want = sig(docJson.bodies);
  await page.evaluate(([d, name]) => window.postMessage({ type: "STEMSKETCH_LOAD", name, docJson: d, units: "in" }, "*"), [docJson, label]);
  // `doc` is a script-scope lexical binding (not window.doc) — reachable by
  // bare name from evaluate. Wait until the loaded structure matches what we
  // sent (a stale canvas from the previous case must not be checked).
  try {
    await page.waitForFunction(w => typeof doc !== "undefined" && JSON.stringify(doc.bodies.map(x => [x.type, x.op, (x.children || []).map(c => c.type + ":" + c.op)])) === w, want, { timeout: 30000 });
  } catch (e) {
    const got = await page.evaluate(() => JSON.stringify(doc.bodies.map(x => [x.type, x.op, (x.children || []).map(c => c.type + ":" + c.op)])));
    console.log(`\n[${label}] LOAD did not apply.\n  wanted ${want}\n  got    ${got}`);
    console.log("errors:\n  " + errors.filter(e => !e.includes("GL Driver")).slice(0, 15).join("\n  "));
    await browser.close(); process.exit(1);
  }
  console.log(`[${label}] loaded: ${want}`);
  await page.waitForTimeout(800);
  // _assignLastCheck is also a script-scope `let` — bare-name access only.
  await page.evaluate(() => { _assignLastCheck = null; });
  const diag = await page.evaluate(() => {
    if (viewer) viewer.rebuildBodies();
    return {
      resetWorked: _assignLastCheck === null,
      bodies: doc.bodies.map(b => ({ id: b.id, type: b.type, op: b.op, hasMesh: !!b.mesh,
        volIn3: b.mesh ? +(_geoVolume(b.mesh.geometry) / 16387.064).toFixed(3) : null })),
    };
  });
  console.log(`[${label}] diag: ${JSON.stringify(diag)}`);
  await page.evaluate(() => runAssignmentCheck());
  try {
    await page.waitForFunction(() => _assignLastCheck !== null, null, { timeout: 120000 });
  } catch (e) {
    const title = await page.evaluate(() => document.querySelector(".acc-title")?.textContent);
    const detail = await page.evaluate(() => document.querySelector(".acc-detail")?.textContent);
    const hint = await page.evaluate(() => document.querySelector("#hint, .hint")?.textContent);
    console.log(`\n[${label}] TIMEOUT — overlay: ${title} / ${detail} / hint: ${hint}`);
    console.log("errors:\n  " + errors.slice(0, 15).join("\n  "));
    await browser.close();
    process.exit(1);
  }
  const res = await page.evaluate(() => {
    const r = _assignLastCheck;
    const o = {};
    for (const k of Object.keys(r)) if (typeof r[k] !== "object" || r[k] === null) o[k] = r[k];
    if (r.metrics) o.metrics = r.metrics;
    return o;
  });
  const title = await page.evaluate(() => document.querySelector(".acc-title")?.textContent);
  console.log(`\n[${label}] overlay: ${title}`);
  console.log(JSON.stringify(res, null, 1));
  await page.evaluate(() => typeof _closeCheckOverlay === "function" && _closeCheckOverlay());
  return res;
}

// Stage 2: the student must build the COMPLEMENT, so the must-pass model is a
// hand-built solution doc (argv[5]) and the printed block itself must FAIL.
const passDocPath = process.argv[5];
const passDoc = passDocPath ? JSON.parse(readFileSync(passDocPath, "utf8")) : ref;
// (a) the correct model → must pass
const a = await check(passDocPath ? "solution piece" : "reference as model", passDoc);
// (b) a wrong model → must fail: the block itself for stage 2, else a plain cube
const plain = JSON.parse(JSON.stringify(ref));
if (stage !== 2) (function strip(b) { if (b.children) { b.children = b.children.filter(c => c.op !== "subtract"); b.children.forEach(strip); } })({ children: plain.bodies });
// Drop any baked geometry the save carries on groups — the loader trusts it
// over the children, so a stripped group would otherwise keep the old solid.
(function unbake(b) {
  for (const k of Object.keys(b)) {
    if (k === "children") continue;
    const v = b[k];
    if (k === "_geomSerialized") { delete b[k]; continue; }
    if (v && typeof v === "object" && (/(geom|geo|bake|mesh|buffer|verts|tris)/i.test(k) || v.position || v.attributes || v.positions || Array.isArray(v.vertices))) delete b[k];
  }
  (b.children || []).forEach(unbake);
})({ children: plain.bodies });
// Fresh ids so any id-keyed geometry cache from the previous load can't serve stale meshes.
(function renum(b) { if (typeof b.id === "number") b.id += 1000; (b.children || []).forEach(renum); })({ children: plain.bodies });
plain.nextBodyId = (plain.nextBodyId || 0) + 1000;
const b = await check("plain cube", plain);

await page.screenshot({ path: `./fitcheck-${slug}.png` });
await browser.close();

const ok = a.passed === true && b.passed === false;
console.log(`\nRESULT: ${ok ? "PASS" : "FAIL"}  (reference→${a.passed}, plain cube→${b.passed})`);
if (errors.length) console.log("\nconsole/page errors:\n  " + errors.slice(0, 12).join("\n  "));
process.exit(ok ? 0 : 1);
