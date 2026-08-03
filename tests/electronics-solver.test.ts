import { describe, expect, it } from 'vitest';
import { clipWireAtSwitches, continuity, isLit, isSeries, solveCircuit } from '@/app/tools/electronics-lab/engine/solver';
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
