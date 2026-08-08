import { describe, expect, it } from 'vitest';
import { clipWireAtSwitches, continuity, evaluateFreeBuild, isLit, isSeries, solveCircuit } from '@/app/tools/electronics-lab/engine/solver';
import { Part } from '@/app/tools/electronics-lab/engine/types';

// Layout helpers. All test circuits live on a small grid:
// battery spans (3,5)→(7,5) with − at (3,5) and + at (7,5).
const battery = (id = 'bat', ax = 3, bx = 7, y = 5): Part => ({ id, kind: 'battery', a: { x: ax, y }, b: { x: bx, y } });
const bulb = (id: string, ax: number, bx: number, y = 1, removed = false): Part => ({ id, kind: 'bulb', a: { x: ax, y }, b: { x: bx, y }, removed });
const wire = (id: string, ax: number, ay: number, bx: number, by: number): Part => ({ id, kind: 'wire', a: { x: ax, y: ay }, b: { x: bx, y: by } });
const sw = (id: string, ax: number, ay: number, bx: number, by: number, closed: boolean): Part => ({ id, kind: 'switch', a: { x: ax, y: ay }, b: { x: bx, y: by }, closed });

/** battery + one bulb (4,1)-(6,1), fully wired loop */
function singleBulbLoop(): Part[] {
  return [
    battery(),
    bulb('b1', 4, 6),
    wire('w1', 3, 5, 3, 1),
    wire('w2', 3, 1, 4, 1),
    wire('w3', 7, 5, 7, 1),
    wire('w4', 7, 1, 6, 1),
  ];
}

/** battery + two bulbs sharing terminal at (5,1) — series loop */
function twoSeriesLoop(): Part[] {
  return [
    battery(),
    bulb('b1', 3, 5),
    bulb('b2', 5, 7),
    wire('w1', 3, 5, 3, 1),
    wire('w2', 7, 5, 7, 1),
  ];
}

/** battery + two bulbs in parallel between rails x=3 and x=7 */
function twoParallelLoop(): Part[] {
  return [
    battery(),
    bulb('b1', 3, 7, 1),
    bulb('b2', 3, 7, 3),
    wire('w1', 3, 5, 3, 1), // left rail covers both branch taps
    wire('w2', 7, 5, 7, 1), // right rail
  ];
}

describe('solveCircuit — basics', () => {
  it('lights a single bulb at full brightness in a complete loop', () => {
    const r = solveCircuit(singleBulbLoop());
    expect(r.shorted).toBe(false);
    expect(r.parts['b1'].brightness).toBeGreaterThan(0.95);
    expect(r.parts['b1'].brightness).toBeLessThan(1.05);
    expect(isLit(r, 'b1')).toBe(true);
  });

  it('leaves everything dark when the loop is open', () => {
    const parts = singleBulbLoop().filter(p => p.id !== 'w1');
    const r = solveCircuit(parts);
    expect(isLit(r, 'b1')).toBe(false);
    expect(r.batteryCurrent).toBeLessThan(1e-6);
  });

  it('reports wire segment currents for the flow animation', () => {
    const r = solveCircuit(singleBulbLoop());
    const segs = r.wireSegments['w1'];
    expect(segs.length).toBe(4); // (3,5)→(3,1) is 4 one-cell segments
    for (const s of segs) expect(Math.abs(s.current)).toBeGreaterThan(0.2);
  });
});

describe('series circuits', () => {
  it('two series bulbs are each dimmer than a single bulb', () => {
    const r = solveCircuit(twoSeriesLoop());
    const b1 = r.parts['b1'].brightness!;
    const b2 = r.parts['b2'].brightness!;
    expect(b1).toBeGreaterThan(0.1);
    expect(b1).toBeLessThan(0.5);
    expect(b2).toBeCloseTo(b1, 3);
  });

  it('three series bulbs are dimmer still, and all carry equal current', () => {
    const parts: Part[] = [
      battery(),
      bulb('b1', 2, 4),
      bulb('b2', 4, 6),
      bulb('b3', 6, 8),
      wire('w1', 2, 1, 2, 5),
      wire('w2', 2, 5, 3, 5),
      wire('w3', 8, 1, 8, 5),
      wire('w4', 8, 5, 7, 5),
    ];
    const r = solveCircuit(parts);
    const two = solveCircuit(twoSeriesLoop());
    expect(r.parts['b1'].brightness!).toBeLessThan(two.parts['b1'].brightness!);
    expect(isSeries(r, ['b1', 'b2', 'b3'])).toBe(true);
  });

  it('unscrewing one series bulb kills the whole string', () => {
    const parts = twoSeriesLoop().map(p => (p.id === 'b1' ? { ...p, removed: true } : p));
    const r = solveCircuit(parts);
    expect(isLit(r, 'b2')).toBe(false);
  });

  it('isSeries rejects a parallel arrangement', () => {
    const r = solveCircuit(twoParallelLoop());
    expect(isSeries(r, ['b1', 'b2'])).toBe(false);
  });
});

describe('parallel circuits', () => {
  it('parallel bulbs each stay near full brightness', () => {
    const r = solveCircuit(twoParallelLoop());
    expect(r.parts['b1'].brightness!).toBeGreaterThan(0.85);
    expect(r.parts['b2'].brightness!).toBeGreaterThan(0.85);
  });

  it('battery current is roughly the sum of branch currents', () => {
    const r = solveCircuit(twoParallelLoop());
    const sum = Math.abs(r.parts['b1'].current) + Math.abs(r.parts['b2'].current);
    expect(Math.abs(r.batteryCurrent - sum) / sum).toBeLessThan(0.01);
  });

  it('a broken parallel branch leaves the other branch lit', () => {
    const parts = twoParallelLoop().map(p => (p.id === 'b1' ? { ...p, removed: true } : p));
    const r = solveCircuit(parts);
    expect(isLit(r, 'b1')).toBe(false);
    expect(r.parts['b2'].brightness!).toBeGreaterThan(0.9);
  });
});

describe('switches', () => {
  const switched = (closed: boolean): Part[] => [
    battery(),
    bulb('b1', 4, 6),
    sw('s1', 3, 1, 4, 1, closed),
    wire('w1', 3, 5, 3, 1),
    wire('w2', 7, 5, 7, 1),
    wire('w3', 7, 1, 6, 1),
  ];

  it('open switch → dark, closed switch → lit', () => {
    expect(isLit(solveCircuit(switched(false)), 'b1')).toBe(false);
    expect(isLit(solveCircuit(switched(true)), 'b1')).toBe(true);
  });
});

describe('short circuits', () => {
  it('a wire straight across the battery is flagged as a short', () => {
    const parts: Part[] = [battery(), wire('w1', 3, 5, 3, 3), wire('w2', 3, 3, 7, 3), wire('w3', 7, 3, 7, 5)];
    const r = solveCircuit(parts);
    expect(r.shorted).toBe(true);
    expect(r.batteryCurrent).toBeGreaterThan(5);
  });

  it('shorting past the bulb darkens it and flags the battery', () => {
    const parts = [...singleBulbLoop(), wire('short', 3, 1, 7, 1)];
    const r = solveCircuit(parts);
    expect(r.shorted).toBe(true);
    expect(isLit(r, 'b1')).toBe(false);
  });

  it('a healthy circuit is never flagged', () => {
    expect(solveCircuit(singleBulbLoop()).shorted).toBe(false);
    expect(solveCircuit(twoParallelLoop()).shorted).toBe(false);
  });
});

describe('multiple batteries', () => {
  it('two batteries in series drive two bulbs at full brightness', () => {
    const parts: Part[] = [
      { id: 'bat1', kind: 'battery', a: { x: 2, y: 5 }, b: { x: 5, y: 5 } },
      { id: 'bat2', kind: 'battery', a: { x: 6, y: 5 }, b: { x: 9, y: 5 } },
      wire('link', 5, 5, 6, 5),
      bulb('b1', 3, 5),
      bulb('b2', 5, 7),
      wire('w1', 3, 1, 2, 1),
      wire('w2', 2, 1, 2, 5),
      wire('w3', 7, 1, 9, 1),
      wire('w4', 9, 1, 9, 5),
    ];
    const r = solveCircuit(parts);
    expect(r.parts['b1'].brightness!).toBeGreaterThan(0.9);
    expect(r.parts['b2'].brightness!).toBeGreaterThan(0.9);
    expect(r.shorted).toBe(false);
  });

  it('opposing batteries (+ facing +) cancel out — bulbs stay dark', () => {
    const parts: Part[] = [
      { id: 'bat1', kind: 'battery', a: { x: 2, y: 5 }, b: { x: 5, y: 5 } },
      { id: 'bat2', kind: 'battery', a: { x: 9, y: 5 }, b: { x: 6, y: 5 } }, // flipped
      wire('link', 5, 5, 6, 5),
      bulb('b1', 4, 6, 1),
      wire('w1', 4, 1, 2, 1),
      wire('w2', 2, 1, 2, 5),
      wire('w3', 6, 1, 9, 1),
      wire('w4', 9, 1, 9, 5),
    ];
    const r = solveCircuit(parts);
    expect(isLit(r, 'b1')).toBe(false);
  });
});

describe('continuity tester', () => {
  it('beeps through wires and bulb filaments, not through gaps', () => {
    const parts = singleBulbLoop().filter(p => p.kind !== 'battery');
    // whole loop minus battery: from (3,5) to (7,5) via bulb should connect
    expect(continuity(parts, { x: 3, y: 5 }, { x: 7, y: 5 }).connected).toBe(true);
    // remove a wire → break
    const broken = parts.filter(p => p.id !== 'w3');
    expect(continuity(broken, { x: 3, y: 5 }, { x: 7, y: 5 }).connected).toBe(false);
  });

  it('never beeps through a battery or an open switch', () => {
    expect(continuity([battery()], { x: 3, y: 5 }, { x: 7, y: 5 }).connected).toBe(false);
    expect(continuity([sw('s1', 1, 1, 2, 1, false)], { x: 1, y: 1 }, { x: 2, y: 1 }).connected).toBe(false);
    expect(continuity([sw('s1', 1, 1, 2, 1, true)], { x: 1, y: 1 }, { x: 2, y: 1 }).connected).toBe(true);
  });

  it('conductive materials pass the signal, insulators do not', () => {
    const mat = (conductive: boolean): Part => ({ id: 'm1', kind: 'material', a: { x: 1, y: 1 }, b: { x: 3, y: 1 }, conductive });
    expect(continuity([mat(true)], { x: 1, y: 1 }, { x: 3, y: 1 }).connected).toBe(true);
    expect(continuity([mat(false)], { x: 1, y: 1 }, { x: 3, y: 1 }).connected).toBe(false);
  });
});

describe('materials in the test-clip gap', () => {
  const rig = (conductive: boolean): Part[] => [
    battery(),
    bulb('b1', 4, 6),
    { id: 'm1', kind: 'material', a: { x: 3, y: 1 }, b: { x: 4, y: 1 }, conductive },
    wire('w1', 3, 5, 3, 1),
    wire('w2', 7, 5, 7, 1),
    wire('w3', 7, 1, 6, 1),
  ];

  it('a conductor completes the tester circuit; an insulator does not', () => {
    expect(isLit(solveCircuit(rig(true)), 'b1')).toBe(true);
    expect(isLit(solveCircuit(rig(false)), 'b1')).toBe(false);
  });
});

// ── Units 3–4 curriculum layouts: the intended wiring must satisfy each goal ──

import { UNITS } from '@/app/tools/electronics-lab/units';

const unit = (id: number) => UNITS.find(u => u.id === id)!;
const lit = (r: ReturnType<typeof solveCircuit>, id: string) => (r.parts[id]?.brightness ?? 0) > 0.05;
const bright = (r: ReturnType<typeof solveCircuit>, id: string) => (r.parts[id]?.brightness ?? 0) > 0.6;

describe('Unit 3 layouts', () => {
  it('C1 Two Paths: two rail wires light both branches at full brightness', () => {
    const ch = unit(3).challenges[0];
    const r = solveCircuit([...ch.given, wire('r1', 3, 5, 3, 1), wire('r2', 7, 5, 7, 1)]);
    expect(bright(r, 'b1')).toBe(true);
    expect(bright(r, 'b2')).toBe(true);
    expect(r.shorted).toBe(false);
  });

  it('C2 Showdown: fixed series side is dim, wired parallel side is bright', () => {
    const ch = unit(3).challenges[1];
    const r = solveCircuit([...ch.given, wire('r1', 8, 5, 8, 1), wire('r2', 12, 5, 12, 1)]);
    expect(lit(r, 'sb1')).toBe(true);
    expect(bright(r, 'sb1')).toBe(false); // series stays dim
    expect(bright(r, 'b1')).toBe(true);
    expect(bright(r, 'b2')).toBe(true);
  });

  it('C3 Break a Branch: given circuit is complete; unscrewing A leaves B bright', () => {
    const ch = unit(3).challenges[2];
    const before = solveCircuit(ch.given);
    expect(lit(before, 'b1')).toBe(true);
    expect(lit(before, 'b2')).toBe(true);
    const after = solveCircuit(ch.given.map(p => (p.id === 'b1' ? { ...p, removed: true } : p)));
    expect(lit(after, 'b1')).toBe(false);
    expect(bright(after, 'b2')).toBe(true);
  });

  it('C4 Blackout-Proof: rails survive the loss of any single bulb', () => {
    const ch = unit(3).challenges[3];
    const parts = [...ch.given, wire('r1', 3, 7, 3, 1), wire('r2', 7, 7, 7, 1)];
    const base = solveCircuit(parts);
    for (const id of ['b1', 'b2', 'b3']) expect(lit(base, id)).toBe(true);
    for (const victim of ['b1', 'b2', 'b3']) {
      const r = solveCircuit(parts.map(p => (p.id === victim ? { ...p, removed: true } : p)));
      for (const other of ['b1', 'b2', 'b3'].filter(o => o !== victim)) expect(lit(r, other)).toBe(true);
    }
  });
});

describe('Unit 4 layouts (switch scenarios)', () => {
  const withSwitch = (parts: Part[], id: string, closed: boolean) =>
    parts.map(p => (p.id === id ? { ...p, closed } : p));
  const allClosed = (parts: Part[]) => parts.map(p => (p.kind === 'switch' ? { ...p, closed: true } : p));

  it('C1 Flip the Switch: bulb obeys the switch', () => {
    const ch = unit(4).challenges[0];
    const parts = [...ch.given, wire('r1', 3, 5, 3, 1), wire('m', 4, 1, 5, 1), wire('r2', 7, 5, 7, 1)];
    expect(lit(solveCircuit(allClosed(parts)), 'b1')).toBe(true);
    expect(lit(solveCircuit(withSwitch(parts, 's1', false)), 'b1')).toBe(false);
  });

  it('C2 Master Switch: one switch on the main line controls both branches', () => {
    const ch = unit(4).challenges[1];
    const parts = [...ch.given, wire('r1', 3, 5, 3, 4), wire('r2', 3, 3, 3, 1), wire('r3', 7, 5, 7, 1)];
    const closed = solveCircuit(allClosed(parts));
    expect(lit(closed, 'b1')).toBe(true);
    expect(lit(closed, 'b2')).toBe(true);
    const open = solveCircuit(withSwitch(parts, 's1', false));
    expect(lit(open, 'b1')).toBe(false);
    expect(lit(open, 'b2')).toBe(false);
  });

  it('C2 anti-cheat: bypassing the switch with a direct rail fails the open test', () => {
    const ch = unit(4).challenges[1];
    const parts = [...ch.given, wire('r1', 3, 5, 3, 1), wire('r3', 7, 5, 7, 1)]; // skips the switch
    const open = solveCircuit(withSwitch(parts, 's1', false));
    expect(lit(open, 'b1')).toBe(true); // still lit → switch-test goal would reject this
  });

  it('C3 Branch Switch: opening it darkens only Bulb A', () => {
    const ch = unit(4).challenges[2];
    const parts = [...ch.given, wire('r1', 3, 5, 3, 1), wire('m', 6, 1, 7, 1), wire('r2', 7, 5, 7, 1)];
    const closed = solveCircuit(allClosed(parts));
    expect(lit(closed, 'b1')).toBe(true);
    expect(lit(closed, 'b2')).toBe(true);
    const open = solveCircuit(withSwitch(parts, 's1', false));
    expect(lit(open, 'b1')).toBe(false);
    expect(bright(open, 'b2')).toBe(true);
  });

  it('C4 A Switch for Each Room: each switch controls exactly its own bulb', () => {
    const ch = unit(4).challenges[3];
    const parts = [...ch.given,
      wire('r1', 3, 5, 3, 1), wire('m1', 6, 1, 7, 1), wire('m2', 6, 3, 7, 3), wire('r2', 7, 5, 7, 1)];
    const closed = solveCircuit(allClosed(parts));
    expect(lit(closed, 'b1')).toBe(true);
    expect(lit(closed, 'b2')).toBe(true);
    const s1open = solveCircuit(withSwitch(allClosed(parts), 's1', false));
    expect(lit(s1open, 'b1')).toBe(false);
    expect(lit(s1open, 'b2')).toBe(true);
    const s2open = solveCircuit(withSwitch(allClosed(parts), 's2', false));
    expect(lit(s2open, 'b2')).toBe(false);
    expect(lit(s2open, 'b1')).toBe(true);
  });
});

describe('clipWireAtSwitches (switch is a barrier while drawing)', () => {
  const parts: Part[] = [sw('s1', 3, 4, 3, 3, false)];

  it('a drag across both contacts is clipped at the first contact', () => {
    // dragging from the battery (3,5) up to (3,1) must stop at (3,4)
    expect(clipWireAtSwitches({ x: 3, y: 5 }, { x: 3, y: 1 }, parts)).toEqual({ x: 3, y: 4 });
  });

  it('a drag starting ON a contact cannot cross to the other contact', () => {
    // (3,4) → (3,1) covers both contacts → clipped back to zero length
    expect(clipWireAtSwitches({ x: 3, y: 4 }, { x: 3, y: 1 }, parts)).toEqual({ x: 3, y: 4 });
  });

  it('a drag from the far contact away from the switch is untouched', () => {
    expect(clipWireAtSwitches({ x: 3, y: 3 }, { x: 3, y: 1 }, parts)).toEqual({ x: 3, y: 1 });
  });

  it('wires nowhere near the switch are untouched', () => {
    expect(clipWireAtSwitches({ x: 7, y: 5 }, { x: 7, y: 1 }, parts)).toEqual({ x: 7, y: 1 });
  });
});

describe('evaluateFreeBuild (freebuild capstone specs)', () => {
  it('lit: any complete circuit with the required bulbs passes; an open one fails', () => {
    expect(evaluateFreeBuild(singleBulbLoop(), { check: 'lit', minBulbs: 1 })).toBe(true);
    expect(evaluateFreeBuild(singleBulbLoop().filter(p => p.id !== 'w1'), { check: 'lit', minBulbs: 1 })).toBe(false);
    expect(evaluateFreeBuild(singleBulbLoop(), { check: 'lit', minBulbs: 2 })).toBe(false); // not enough bulbs
  });

  it('series: accepts a series pair, rejects a parallel pair', () => {
    expect(evaluateFreeBuild(twoSeriesLoop(), { check: 'series', minBulbs: 2 })).toBe(true);
    expect(evaluateFreeBuild(twoParallelLoop(), { check: 'series', minBulbs: 2 })).toBe(false);
  });

  it('redundant: accepts a parallel pair, rejects a series pair', () => {
    expect(evaluateFreeBuild(twoParallelLoop(), { check: 'redundant', minBulbs: 2 })).toBe(true);
    expect(evaluateFreeBuild(twoSeriesLoop(), { check: 'redundant', minBulbs: 2 })).toBe(false);
  });

  it('master-switch: passes when one switch darkens every bright bulb', () => {
    // parallel rungs with a switch on the main line below them
    const design: Part[] = [
      battery('bat', 3, 7, 5),
      bulb('b1', 3, 7, 1),
      bulb('b2', 3, 7, 3),
      sw('s1', 3, 5, 3, 4, true),
      wire('w1', 3, 4, 3, 1),
      wire('w2', 7, 5, 7, 1),
    ];
    expect(evaluateFreeBuild(design, { check: 'master-switch', minBulbs: 2, minBrightness: 0.6 })).toBe(true);
  });

  it('master-switch: rejects a branch switch (one bulb ignores it)', () => {
    const design: Part[] = [
      battery('bat', 3, 7, 5),
      bulb('b1', 4, 6, 1),          // top branch: switch + bulb
      sw('s1', 3, 1, 4, 1, true),
      bulb('b2', 3, 7, 3),          // second branch, no switch
      wire('w1', 3, 5, 3, 1),
      wire('w2', 6, 1, 7, 1),
      wire('w3', 7, 5, 7, 1),
    ];
    expect(evaluateFreeBuild(design, { check: 'master-switch', minBulbs: 2, minBrightness: 0.6 })).toBe(false);
  });

  it('master-switch: rejects a dim series layout even though the switch kills it', () => {
    const design: Part[] = [...twoSeriesLoop().filter(p => p.id !== 'w1'), sw('s1', 3, 5, 3, 4, true), wire('wx', 3, 4, 3, 1)];
    expect(evaluateFreeBuild(design, { check: 'master-switch', minBulbs: 2, minBrightness: 0.6 })).toBe(false);
  });
});

// ── Unit 5/6 engine additions ─────────────────────────────────────────────────

describe('broken parts (hidden faults)', () => {
  it('a broken wire kills the circuit but looks like any dead circuit', () => {
    const parts = singleBulbLoop().map(p => (p.id === 'w1' ? { ...p, broken: true } : p));
    const r = solveCircuit(parts);
    expect(isLit(r, 'b1')).toBe(false);
    expect(r.parts['b1'].brightness!).toBeLessThan(1e-9);
  });

  it('continuity is silent across a broken part, beeps elsewhere', () => {
    const parts = singleBulbLoop().map(p => (p.id === 'w1' ? { ...p, broken: true } : p));
    // across the broken wire: silence
    expect(continuity(parts, { x: 3, y: 5 }, { x: 3, y: 1 }).connected).toBe(false);
    // across the healthy right-side wire: beep
    expect(continuity(parts, { x: 7, y: 5 }, { x: 7, y: 1 }).connected).toBe(true);
  });

  it('a closed-but-broken switch conducts nothing until repaired', () => {
    const parts: Part[] = [sw('s1', 1, 1, 2, 1, true)].map(p => ({ ...p, broken: true }));
    expect(continuity(parts, { x: 1, y: 1 }, { x: 2, y: 1 }).connected).toBe(false);
    const fixed = parts.map(p => ({ ...p, broken: false }));
    expect(continuity(fixed, { x: 1, y: 1 }, { x: 2, y: 1 }).connected).toBe(true);
  });

  it('U5C2 dead flashlight: fault findable, repair restores the light', () => {
    const ch = UNITS.find(u => u.id === 5)!.challenges[1];
    expect(isLit(solveCircuit(ch.given), 'b1')).toBe(false);
    expect(continuity(ch.given, { x: 3, y: 5 }, { x: 3, y: 1 }).connected).toBe(false);
    const repaired = ch.given.map(p => ({ ...p, broken: false }));
    expect(solveCircuit(repaired).parts['b1'].brightness!).toBeGreaterThan(0.9);
  });

  it('U5C3 string of lights: halving probes isolate the dead bulb', () => {
    const ch = UNITS.find(u => u.id === 5)!.challenges[2];
    // left half (through bulbs A-C): beep
    expect(continuity(ch.given, { x: 1, y: 1 }, { x: 7, y: 1 }).connected).toBe(true);
    // right half (through broken bulb D): silence
    expect(continuity(ch.given, { x: 7, y: 1 }, { x: 11, y: 1 }).connected).toBe(false);
    // narrowed to bulb D itself: silence
    expect(continuity(ch.given, { x: 7, y: 1 }, { x: 9, y: 1 }).connected).toBe(false);
    // repair all faults → whole string lights
    const repaired = ch.given.map(p => ({ ...p, broken: false }));
    for (const id of ['b1', 'b2', 'b3', 'b4', 'b5']) expect(isLit(solveCircuit(repaired), id)).toBe(true);
  });

  it('U5C4 double trouble: both faults must be repaired before power returns', () => {
    const ch = UNITS.find(u => u.id === 5)!.challenges[3];
    const oneFixed = ch.given.map(p => (p.id === 's1' ? { ...p, broken: false } : p));
    expect(isLit(solveCircuit(oneFixed), 'b1')).toBe(false); // wire w2 still broken
    const bothFixed = ch.given.map(p => ({ ...p, broken: false }));
    expect(isLit(solveCircuit(bothFixed), 'b1')).toBe(true);
  });
});

describe('ideal battery (internalR: 0) for the Ohm\'s Law bench', () => {
  it('meter readings match I = V/R exactly', () => {
    const parts: Part[] = [
      { id: 'bat', kind: 'battery', a: { x: 1, y: 4 }, b: { x: 9, y: 4 }, voltage: 6, internalR: 0 },
      { id: 'res', kind: 'resistor', a: { x: 3, y: 1 }, b: { x: 7, y: 1 }, resistance: 12 },
      wire('w1', 1, 4, 1, 1), wire('w2', 1, 1, 3, 1), wire('w3', 9, 4, 9, 1), wire('w4', 9, 1, 7, 1),
    ];
    const r = solveCircuit(parts);
    expect(Math.abs(r.parts['res'].current)).toBeCloseTo(0.5, 3);
    expect(Math.abs(r.parts['res'].voltage)).toBeCloseTo(6, 2);
  });
});

describe('broken wires never leak visual hints', () => {
  it('a broken wire reports zero segment current (no phantom hot flow)', () => {
    const parts = singleBulbLoop().map(p => (p.id === 'w1' ? { ...p, broken: true } : p));
    const r = solveCircuit(parts);
    for (const seg of r.wireSegments['w1']) expect(seg.current).toBe(0);
    expect(r.parts['w1'].current).toBe(0);
  });
});

describe('broken-branch freebuild spec (U5C5 Fault Demo Board)', () => {
  const demo = (breakInBranch: boolean): Part[] => [
    battery(),
    bulb('b1', 3, 7, 1),                                    // healthy branch
    bulb('b2', 3, 5, 3),                                    // faulty branch: bulb + break segment
    { id: 'bw', kind: 'wire', a: { x: 5, y: 3 }, b: breakInBranch ? { x: 7, y: 3 } : { x: 7, y: 3 }, broken: breakInBranch },
    ...(!breakInBranch ? [] : []),
    wire('r1', 3, 5, 3, 1),
    wire('r2', 7, 5, 7, 1),
  ];

  it('accepts a parallel circuit with the break isolating one branch', () => {
    expect(evaluateFreeBuild(demo(true), { check: 'broken-branch', minBulbs: 2, minBrightness: 0.6 })).toBe(true);
  });

  it('rejects when no bulb is dark (break bridged or missing)', () => {
    expect(evaluateFreeBuild(demo(false), { check: 'broken-branch', minBulbs: 2, minBrightness: 0.6 })).toBe(false);
  });

  it('rejects a break on the main line (both bulbs dark)', () => {
    const parts: Part[] = [
      battery(),
      bulb('b1', 3, 7, 1),
      bulb('b2', 3, 7, 3),
      { id: 'bw', kind: 'wire', a: { x: 3, y: 5 }, b: { x: 3, y: 1 }, broken: true }, // broken rail
      wire('r2', 7, 5, 7, 1),
    ];
    expect(evaluateFreeBuild(parts, { check: 'broken-branch', minBulbs: 2, minBrightness: 0.6 })).toBe(false);
  });

  it('rejects a series arrangement even with a break (repaired copy is too dim)', () => {
    const parts: Part[] = [
      ...twoSeriesLoop().filter(p => p.id !== 'w1'),
      { id: 'bw', kind: 'wire', a: { x: 3, y: 5 }, b: { x: 3, y: 1 }, broken: true },
    ];
    expect(evaluateFreeBuild(parts, { check: 'broken-branch', minBulbs: 2, minBrightness: 0.6 })).toBe(false);
  });
});

// ── Unit 7: LEDs, jumpers, breadboard ─────────────────────────────────────────

const jump = (id: string, ax: number, ay: number, bx: number, by: number): Part =>
  ({ id, kind: 'wire', a: { x: ax, y: ay }, b: { x: bx, y: by }, jump: true });

describe('LED physics', () => {
  const ledRig = (flipped: boolean, resistance?: number): Part[] => [
    battery(), // − at (3,5), + at (7,5)
    ...(resistance ? [{ id: 'r1', kind: 'resistor' as const, a: { x: 7, y: 1 }, b: { x: 5, y: 1 }, resistance }] : [wire('wr', 7, 1, 5, 1)]),
    // forward: anode toward the + side (fed via resistor from +)
    { id: 'led1', kind: 'led' as const, a: { x: flipped ? 3 : 5, y: 1 }, b: { x: flipped ? 5 : 3, y: 1 } },
    wire('w1', 7, 5, 7, 1),
    wire('w2', 3, 1, 3, 5),
  ];

  it('lights forward at a safe current with a resistor', () => {
    const r = solveCircuit(ledRig(false, 100));
    const led = r.parts['led1'];
    expect(led.current).toBeGreaterThan(0.001);
    expect(led.current).toBeLessThanOrEqual(0.05);
    expect(led.brightness!).toBeGreaterThan(0.5);
  });

  it('blocks completely when reversed', () => {
    const r = solveCircuit(ledRig(true, 100));
    expect(Math.abs(r.parts['led1'].current)).toBeLessThan(1e-6);
    expect(r.parts['led1'].brightness).toBe(0);
  });

  it('burns (overcurrent) without a resistor', () => {
    const r = solveCircuit(ledRig(false));
    expect(r.parts['led1'].current).toBeGreaterThan(0.05);
  });
});

describe('jumper wires connect endpoints only', () => {
  it('a jumper over a strip does NOT short to it; a bare wire does', () => {
    const strip: Part = { id: 'strip5', kind: 'wire', a: { x: 5, y: 0 }, b: { x: 5, y: 2 }, hidden: true };
    // jumper from (3,1) to (7,1) passes straight over the strip at (5,1)
    expect(continuity([strip, jump('j1', 3, 1, 7, 1)], { x: 3, y: 1 }, { x: 5, y: 0 }).connected).toBe(false);
    expect(continuity([strip, wire('w1', 3, 1, 7, 1)], { x: 3, y: 1 }, { x: 5, y: 0 }).connected).toBe(true);
    // but the jumper itself still conducts end to end
    expect(continuity([jump('j1', 3, 1, 7, 1)], { x: 3, y: 1 }, { x: 7, y: 1 }).connected).toBe(true);
  });
});

describe('Unit 7 breadboard layouts', () => {
  const u7 = () => UNITS.find(u => u.id === 7)!;

  it('C1: same column beeps, different columns read OL, rails run end to end', () => {
    const parts = u7().challenges[0].given;
    expect(continuity(parts, { x: 3, y: 1 }, { x: 3, y: 4 }).connected).toBe(true);  // same strip
    expect(continuity(parts, { x: 3, y: 2 }, { x: 4, y: 2 }).connected).toBe(false); // neighbors
    expect(continuity(parts, { x: 0, y: 0 }, { x: 10, y: 0 }).connected).toBe(true); // + rail
  });

  it('C2: jumpers + flipped LED light safely; skipping the resistor burns it', () => {
    const ch = u7().challenges[1];
    const jumpers = [jump('j1', 2, 0, 2, 1), jump('j2', 6, 3, 6, 5)];
    // as given (LED backwards): dark
    const asGiven = solveCircuit([...ch.given, ...jumpers]);
    expect(Math.abs(asGiven.parts['led1'].current)).toBeLessThan(1e-6);
    // flipped: safe and lit
    const flipped = ch.given.map(p => (p.id === 'led1' ? { ...p, a: p.b, b: p.a } : p));
    const r = solveCircuit([...flipped, ...jumpers]);
    expect(r.parts['led1'].current).toBeGreaterThan(0.001);
    expect(r.parts['led1'].current).toBeLessThanOrEqual(0.05);
    // shortcut jumper straight from + rail to the LED column: burnout
    const burned = solveCircuit([...flipped, ...jumpers, jump('j3', 4, 0, 4, 1)]);
    expect(burned.parts['led1'].current).toBeGreaterThan(0.05);
  });

  it('C3: the switch controls the LED', () => {
    const ch = u7().challenges[2];
    const jumpers = [jump('j1', 2, 0, 2, 1), jump('j2', 7, 4, 7, 5)];
    const withSwitch = (closed: boolean) =>
      [...ch.given.map(p => (p.kind === 'switch' ? { ...p, closed } : p)), ...jumpers];
    const on = solveCircuit(withSwitch(true));
    expect(on.parts['led1'].current).toBeGreaterThan(0.001);
    expect(on.parts['led1'].current).toBeLessThanOrEqual(0.05);
    const off = solveCircuit(withSwitch(false));
    expect(Math.abs(off.parts['led1'].current)).toBeLessThan(1e-6);
  });

  it('C4 graduation: student-placed parts + jumpers work, switch and all', () => {
    const ch = u7().challenges[3];
    // components the student places from the bin (matching the schematic order)
    const studentParts: Part[] = [
      { id: 'ps', kind: 'switch', a: { x: 2, y: 2 }, b: { x: 3, y: 2 }, closed: true },
      { id: 'pr', kind: 'resistor', a: { x: 4, y: 2 }, b: { x: 6, y: 2 }, resistance: 100 },
      { id: 'pl', kind: 'led', a: { x: 6, y: 3 }, b: { x: 8, y: 3 } },
    ];
    const jumpers = [jump('j1', 2, 0, 2, 1), jump('j2', 3, 3, 4, 3), jump('j3', 8, 4, 8, 5)];
    const withSwitch = (closed: boolean) =>
      [...ch.given, ...studentParts.map(p => (p.kind === 'switch' ? { ...p, closed } : p)), ...jumpers];
    const on = solveCircuit(withSwitch(true));
    expect(on.parts['pl'].current).toBeGreaterThan(0.001);
    expect(on.parts['pl'].current).toBeLessThanOrEqual(0.05);
    const off = solveCircuit(withSwitch(false));
    expect(Math.abs(off.parts['pl'].current)).toBeLessThan(1e-6);
    // the reference schematic itself is a live, lit circuit
    const ref = solveCircuit(ch.reference!.parts);
    expect(ref.parts['ref-led'].current).toBeGreaterThan(0.001);
  });
});
