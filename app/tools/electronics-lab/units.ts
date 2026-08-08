// Electronics Lab curriculum content — Units 1–2 (M2 slice).
// Grid layouts assume the default 10×6 board (points 0..10 × 0..6).

import { Part, Pt } from './engine/types';

export interface QuizQ {
  question: string;
  options: [string, string, string, string];
  /** Index into options of the correct answer (display order is shuffled at render). */
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

export type Goal =
  | { type: 'light-all'; series?: boolean; minBrightness?: number; bulbs?: string[] }
  | { type: 'short' }
  | { type: 'sort-materials' }
  | { type: 'predict' }
  /** All bulbs lit, AND removing any single bulb leaves every other bulb lit
   *  (verified by actually simulating each removal). */
  | { type: 'redundant' }
  /** All bulbs lit with every switch closed, AND for each test, opening that
   *  one switch darkens exactly the listed bulbs while the others stay lit. */
  | { type: 'switch-test'; tests: { switchId: string; darkWhenOpen: string[]; litWhenOpen: string[] }[] }
  /** Freebuild capstone: judged against a spec over whatever the student
   *  placed, not fixed part ids — any correct design passes. */
  | { type: 'free-spec'; check: 'lit' | 'series' | 'redundant' | 'master-switch' | 'broken-branch'; minBulbs: number; minBrightness?: number }
  /** Circuit Detective: find and repair every hidden broken part (or, for the
   *  intro, just observe one beep and one no-beep). */
  | { type: 'detective' }
  /** Ohm's Law bench: dial the sliders until the ammeter hits the target. */
  | { type: 'meter-target' }
  /** Ohm's Law worksheet: answer every computation round. */
  | { type: 'compute-set' }
  /** Breadboard: every LED lit at a safe current, none burned; with
   *  requireSwitch, some switch must darken every LED when opened. */
  | { type: 'led-safe'; requireSwitch?: boolean };

export interface MaterialDef {
  label: string;
  emoji: string;
  conductive: boolean;
}

export interface ElecChallenge {
  id: string;
  title: string;
  /** One-line coaching hint shown under the challenge title. */
  hint: string;
  /** Optional explicit objective panel — use whenever a challenge introduces a
   *  new mechanic, so students know exactly what to do and when they are done. */
  objective?: { goal: string; steps: string[] };
  mode: 'build' | 'materials' | 'predict' | 'freebuild' | 'detective' | 'meters' | 'compute';
  /** Build mode: wire count for 3 stars (par+2 → 2 stars, more → 1). */
  par: number;
  given: Part[];
  goal: Goal;
  allowUnscrew?: boolean;
  /** The teaching payoff, shown in the success banner. */
  successNote: string;
  predict?: {
    question: string;
    options: string[];
    answer: number;
    actionPrompt: string;
    resultNote: string;
    /** Bulb the student is asked to unscrew. */
    targetBulb: string;
  };
  materials?: MaterialDef[];
  /** Parts bin — what the student may place, and how many. Used by freebuild
   *  and by build challenges that require placing components (U7 capstone).
   *  'breakwire' = a wire segment with a visible crack that conducts nothing. */
  palette?: { kind: 'battery' | 'bulb' | 'switch' | 'breakwire' | 'resistor' | 'led'; count: number }[];
  /** Detective only. Faulty parts are the `given` entries with `broken: true`.
   *  intro = complete on observing one beep + one silence (no repairs). */
  detective?: { intro?: boolean };
  /** Meters only: the Ohm's Law bench configuration. requirePlan makes the
   *  student COMPUTE the unknown ('r', 'v', or 'both') before the dials
   *  unlock — no slide-until-it-works. */
  meters?: {
    targetCurrent: number;
    tolerance: number;
    vRange: [number, number];
    vStep: number;
    rRange: [number, number];
    rStep: number;
    vLocked?: number;
    rLocked?: number;
    requirePlan?: 'r' | 'v' | 'both';
  };
  /** Compute only: worksheet rounds (answer within ±0.01). */
  compute?: { prompt: string; answer: number; unit: 'V' | 'A' | 'Ω'; explain: string }[];
  /** Board size override (default 10×6) for challenges needing more room. */
  gridW?: number;
  gridH?: number;
  /** Breadboard challenge: renders the skin, x-ray toggle, jumper wires. */
  breadboard?: boolean;
  /** Capstone: a read-only schematic the student must translate to the board. */
  reference?: { parts: Part[]; gridW: number; gridH: number };
}

export interface VocabTerm {
  term: string;
  def: string;
}

export interface ElecUnit {
  id: number;
  title: string;
  tagline: string;
  color: string;
  emoji: string;
  story: string;
  /** Words to Know — shown as a card on the unit intro; these terms must also
   *  appear in the intro notes and be tested on the quiz. */
  vocab: VocabTerm[];
  introNotes: string;
  /** Schematic-view toggle appears from this unit on. */
  schematicUnlocked: boolean;
  challenges: ElecChallenge[];
  quiz: QuizQ[];
  /** "Try it for real" — the away-from-the-screen activity, as steps. */
  tryReal: string[];
}

export const chalKey = (ui: number, ci: number) => `u${ui}c${ci}`;

export function countCompleted(ui: number, completed: Record<string, boolean>): number {
  return UNITS[ui].challenges.reduce((s, _, ci) => s + (completed[chalKey(ui, ci)] ? 1 : 0), 0);
}

// ── Layout helpers ────────────────────────────────────────────────────────────
const P = (x: number, y: number): Pt => ({ x, y });
const battery = (id: string, a: Pt, b: Pt): Part => ({ id, kind: 'battery', a, b, fixed: true });
const bulb = (id: string, a: Pt, b: Pt, label?: string): Part => ({ id, kind: 'bulb', a, b, fixed: true, label });
const fwire = (id: string, a: Pt, b: Pt): Part => ({ id, kind: 'wire', a, b, fixed: true });
const fswitch = (id: string, a: Pt, b: Pt, label?: string): Part => ({ id, kind: 'switch', a, b, fixed: true, closed: false, label });

// ══════════════════════════════════════════════════════════════════════════════
// UNIT 1 — Circuits Alive
// ══════════════════════════════════════════════════════════════════════════════

const UNIT1: ElecUnit = {
  id: 1,
  title: 'Circuits Alive',
  tagline: 'Close the loop and make electricity flow',
  color: '#f59e0b',
  emoji: '💡',
  story:
    'Welcome to the STEM Workshop! The storm last night knocked out the workbench lights, and you are the new electrician on duty. Grab your wires — the workshop needs light, and only a complete circuit can deliver it.',
  schematicUnlocked: false,
  vocab: [
    { term: 'Circuit', def: 'A complete loop that electricity can flow around' },
    { term: 'Current', def: 'The flow of electricity through a circuit' },
    { term: 'Closed circuit', def: 'A circuit with no gaps — current flows and the bulb lights' },
    { term: 'Open circuit', def: 'A circuit with a gap — current stops everywhere' },
    { term: 'Conductor', def: 'A material that lets current flow through it (most metals)' },
    { term: 'Insulator', def: 'A material that blocks current (plastic, rubber, wood, glass)' },
    { term: 'Load', def: 'The part that uses the energy — like a bulb' },
    { term: 'Short circuit', def: 'Current skips the load and races through bare wire — dangerous!' },
  ],
  introNotes: `# What is a circuit?

Electricity is the movement of tiny particles called **electrons**. The flow of those electrons is called **current**. Current flows out of a battery, through wires, and back into the battery — but only if the path is a complete loop. A complete loop is called a **closed circuit**. A loop with a gap anywhere is an **open circuit**, and in an open circuit the current stops everywhere, instantly.

## The three things every circuit needs

| Part | Job |
|---|---|
| **Power source** | The battery pushes the current around the loop |
| **Path** | Wires carry the current |
| **Load** | The part that uses the energy — our bulb — and lights up! |

> Say it like an electrician: a working circuit is **closed**, a broken circuit is **open**. You will use these words in every unit from now on.

## Conductors and insulators

Some materials let current flow through them. Those are **conductors** — mostly metals, like copper, steel, and aluminum.

Other materials block current completely. Those are **insulators** — like plastic, rubber, wood, and glass. That is why wires are copper on the inside and plastic on the outside!

## One rule to never forget

The **load** is what makes a circuit safe. If current can skip the load and race straight back to the battery, that is a **short circuit** — the wire gets dangerously hot. You will see this for yourself in the last challenge (safely, on screen!).`,
  challenges: [
    {
      id: 'u1c1',
      title: 'Light It Up',
      hint: 'Drag wires from the battery terminals to the bulb. The loop must be complete — no gaps!',
      mode: 'build',
      par: 4,
      given: [battery('bat', P(3, 5), P(7, 5)), bulb('b1', P(4, 1), P(6, 1), 'Bulb')],
      goal: { type: 'light-all' },
      successNote:
        'The loop is complete — electrons are flowing out of the battery, through the bulb, and back again. Watch the moving dashes: that is the current!',
    },
    {
      id: 'u1c2',
      title: 'Conductor or Insulator?',
      hint: 'Place each material between the clips. If the bulb lights, it conducts! Then sort every material into the correct bin.',
      mode: 'materials',
      par: 0,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(5, 1), P(7, 1), 'Tester Bulb'),
        { id: 'gap', kind: 'material', a: P(2, 1), b: P(4, 1), fixed: true, removed: true },
        fwire('w1', P(3, 5), P(2, 5)),
        fwire('w2', P(2, 5), P(2, 1)),
        fwire('w3', P(4, 1), P(5, 1)),
        fwire('w4', P(7, 1), P(8, 1)),
        fwire('w5', P(8, 1), P(8, 5)),
        fwire('w6', P(8, 5), P(7, 5)),
      ],
      goal: { type: 'sort-materials' },
      materials: [
        { label: 'Paper Clip', emoji: '🖇️', conductive: true },
        { label: 'Crayon', emoji: '🖍️', conductive: false },
        { label: 'Metal Spoon', emoji: '🥄', conductive: true },
        { label: 'Craft Stick', emoji: '🪵', conductive: false },
        { label: 'Penny', emoji: '🪙', conductive: true },
      ],
      successNote:
        'Every conductor you found is a metal — and every insulator is not. Metals let electrons move freely; plastic, wax, and wood hold them in place.',
    },
    {
      id: 'u1c3',
      title: 'Short Circuit! (Safe Version)',
      hint: 'This circuit works fine. Now add ONE wire that lets current skip past the bulb… and watch what happens to the battery.',
      mode: 'build',
      par: 1,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(4, 1), P(6, 1), 'Bulb'),
        fwire('w1', P(3, 5), P(3, 1)),
        fwire('w2', P(3, 1), P(4, 1)),
        fwire('w3', P(7, 5), P(7, 1)),
        fwire('w4', P(7, 1), P(6, 1)),
      ],
      goal: { type: 'short' },
      successNote:
        'The current took the easy path and skipped the bulb — that is a short circuit. With nothing to slow it down, the wire heats up fast. This is why real wires are insulated and why you NEVER connect a battery straight to itself.',
    },
    {
      id: 'u1c4',
      title: 'Design It Yourself',
      hint: 'The workbench is empty and the parts bin is on the left. Place the battery and the bulb wherever YOU want, then wire a closed circuit that lights the bulb. Any working design counts!',
      mode: 'freebuild',
      par: 0,
      given: [],
      palette: [
        { kind: 'battery', count: 1 },
        { kind: 'bulb', count: 1 },
      ],
      goal: { type: 'free-spec', check: 'lit', minBulbs: 1 },
      successNote:
        'You designed a circuit from nothing — power source, path, and load, all placed by you. Every electrician starts exactly here.',
    },
  ],
  quiz: [
    {
      question: 'A bulb lights up only when the battery, wires, and bulb make a…',
      options: [
        'complete loop with no gaps',
        'straight line from the battery to the bulb',
        'stack, with everything touching the battery',
        'pattern that uses the longest wires',
      ],
      answer: 0,
      explanation: 'Current must flow out of the battery, through the bulb, and all the way back. One gap anywhere stops the whole flow.',
    },
    {
      question: 'Which of these materials is a conductor?',
      options: ['A metal paper clip', 'A plastic straw', 'A rubber eraser', 'A wooden craft stick'],
      answer: 0,
      explanation: 'Metals like steel, copper, and aluminum let electrons flow through them. Plastic, rubber, and wood are insulators.',
    },
    {
      question: 'What is the name for the flow of electricity through a circuit?',
      options: ['Current', 'Glow', 'Sparkle', 'Charge dust'],
      answer: 0,
      explanation: 'The flow of electrons around a circuit is called current. When current flows through the bulb, it lights up.',
    },
    {
      question: 'A circuit with a gap in it, where no current can flow, is called…',
      options: ['An open circuit', 'A closed circuit', 'A short circuit', 'A super circuit'],
      answer: 0,
      explanation: 'Open = a gap somewhere, so current stops. Closed = a complete loop, so current flows. Electricians use these words every day.',
    },
    {
      question: 'In a circuit, which part is the "load"?',
      options: [
        'The part that uses the energy, like a bulb',
        'The battery',
        'The wires',
        'The heaviest part',
      ],
      answer: 0,
      explanation: 'The load is whatever the circuit is powering — a bulb, a fan, a speaker. It uses the energy the battery provides.',
    },
    {
      question: 'You wire up a bulb but it does not light. What is the most likely problem?',
      options: [
        'There is a gap somewhere in the loop',
        'The wires are too long',
        'The bulb is facing the wrong way',
        'The battery is lying on its side',
      ],
      answer: 0,
      explanation: 'The number one cause of a dead circuit is a break in the loop — a loose wire or an unfinished connection. It is an open circuit until you close the gap.',
    },
    {
      question: 'Why is a short circuit dangerous?',
      options: [
        'The current skips the load, so nothing slows it down and the wire gets very hot',
        'It makes the bulb shine too brightly',
        'It slowly uses up the metal inside the wire',
        'It makes the battery too cold to touch',
      ],
      answer: 0,
      explanation: 'The load normally limits how much current flows. When current bypasses it, a huge current races through the bare wire and heats it up.',
    },
  ],
  tryReal: [
    'Gather a battery pack (or a fresh D battery), a flashlight bulb, and two strips of aluminum foil.',
    'Use the foil strips as wires: connect one end of the battery to the side of the bulb, and the other end to the bulb’s bottom tip.',
    'When the loop is complete, the bulb lights — just like Challenge 1.',
    'Now test 5 objects from your classroom in the loop (scissors, eraser, pencil, coin, ruler). Which ones are conductors?',
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIT 2 — One Path: Series Circuits
// ══════════════════════════════════════════════════════════════════════════════

const UNIT2: ElecUnit = {
  id: 2,
  title: 'One Path: Series',
  tagline: 'Components in a line share everything',
  color: '#ef4444',
  emoji: '🔗',
  story:
    'The workshop lights are back — but now the display shelf needs lighting too. The parts bin only has one battery pack and a handful of bulbs. Time to learn what happens when bulbs share a single path.',
  schematicUnlocked: true,
  vocab: [
    { term: 'Series circuit', def: 'Parts connected one after another in a single line — one path' },
    { term: 'Component', def: 'Any single part of a circuit: a bulb, battery, wire, or switch' },
    { term: 'Voltage', def: 'The strength of the battery’s push, measured in volts (V)' },
    { term: 'Volt (V)', def: 'The unit for voltage — our battery pack is 3 volts' },
    { term: 'Schematic', def: 'An engineer’s drawing of a circuit using simple symbols' },
    { term: 'Symbol', def: 'The simple shape that stands for a component on a schematic' },
  ],
  introNotes: `# Series circuits

Every part of a circuit — each bulb, battery, wire, and switch — is called a **component**. When components are connected one after another in a single line, we call it a **series circuit**. The current has exactly **one path** — it must flow through every component, one at a time.

## Voltage: the battery's push

The strength of a battery's push is called **voltage**, and it is measured in **volts (V)**. Look at the battery pack on your workbench: it says **3V** — three volts. A bigger voltage means a stronger push, and a stronger push means brighter bulbs.

## What being in series means for bulbs

| What you do | What happens |
|---|---|
| Add more bulbs in series | **Every** bulb gets dimmer |
| Unscrew any one bulb | **Every** bulb goes dark |
| Add another battery (+ to −) | Voltages add — every bulb gets brighter |

## Why do they get dimmer?

The battery's voltage stays the same, but now that push is **shared** between more bulbs. Each bulb gets a smaller share of the energy, so each one glows less.

## Why does one break kill them all?

There is only one path! Unscrewing a bulb leaves a gap — an **open circuit** — and a gap anywhere stops the flow **everywhere**. This is exactly why old strings of holiday lights all went dark when a single bulb burned out.

> **New this unit:** the **Schematic view** button. Engineers draw circuits as a **schematic** — a diagram made of simple **symbols** instead of pictures. Flip the view any time to see your circuit the way an engineer would draw it.`,
  challenges: [
    {
      id: 'u2c1',
      title: 'Two Bulbs, One Path',
      hint: 'Bulb A and Bulb B are already joined in the middle. Wire the two outer ends down to the battery to complete one big loop.',
      mode: 'build',
      par: 2,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(3, 1), P(5, 1), 'Bulb A'),
        bulb('b2', P(5, 1), P(7, 1), 'Bulb B'),
      ],
      goal: { type: 'light-all', series: true },
      successNote:
        'Both bulbs are lit — but look closely: each one is dimmer than the single bulb from Unit 1. They are sharing the battery’s push!',
    },
    {
      id: 'u2c2',
      title: 'Add a Third Bulb',
      hint: 'Three bulbs in a row now. Complete the loop and compare the brightness to the last challenge.',
      mode: 'build',
      par: 4,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(2, 1), P(4, 1), 'Bulb A'),
        bulb('b2', P(4, 1), P(6, 1), 'Bulb B'),
        bulb('b3', P(6, 1), P(8, 1), 'Bulb C'),
      ],
      goal: { type: 'light-all', series: true },
      successNote:
        'Even dimmer! Every bulb you add in series takes a share of the battery’s push, so every bulb — old and new — glows less.',
    },
    {
      id: 'u2c3',
      title: 'Break the Chain',
      hint: 'Make a prediction first — then test it on the real circuit.',
      mode: 'predict',
      par: 0,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(2, 1), P(4, 1), 'Bulb A'),
        bulb('b2', P(4, 1), P(6, 1), 'Bulb B'),
        bulb('b3', P(6, 1), P(8, 1), 'Bulb C'),
        fwire('w1', P(2, 1), P(2, 5)),
        fwire('w2', P(2, 5), P(3, 5)),
        fwire('w3', P(8, 1), P(8, 5)),
        fwire('w4', P(8, 5), P(7, 5)),
      ],
      goal: { type: 'predict' },
      allowUnscrew: true,
      predict: {
        question: 'All three bulbs are glowing. If you unscrew Bulb B (the middle one), what will happen to Bulb A and Bulb C?',
        options: [
          'They both go dark',
          'They both get brighter',
          'They stay exactly the same',
          'Bulb A stays lit but Bulb C goes dark',
        ],
        answer: 0,
        actionPrompt: 'Now test it — tap Bulb B to unscrew it and watch the whole circuit.',
        resultNote:
          'All dark! Unscrewing Bulb B left a gap in the circuit’s only path, so the current stopped everywhere at once — Bulb A and Bulb C never even had a chance.',
        targetBulb: 'b2',
      },
      successNote:
        'One gap stops a series circuit completely. Remember this when a whole string of lights goes out — you are hunting for one single break.',
    },
    {
      id: 'u2c4',
      title: 'Double the Power',
      hint: 'Two battery packs this time! Connect them in a chain (+ to −) and wire the bulbs into the loop. Can you get both bulbs glowing at FULL brightness?',
      mode: 'build',
      par: 5,
      given: [
        battery('bat1', P(2, 5), P(5, 5)),
        battery('bat2', P(6, 5), P(9, 5)),
        bulb('b1', P(3, 1), P(5, 1), 'Bulb A'),
        bulb('b2', P(5, 1), P(7, 1), 'Bulb B'),
      ],
      goal: { type: 'light-all', minBrightness: 0.6 },
      successNote:
        'Batteries in series add their pushes together: 3V + 3V = 6V. Two bulbs sharing a double push glow just as brightly as one bulb on a single battery!',
    },
    {
      id: 'u2c5',
      title: 'Series From Scratch',
      hint: 'Empty workbench, your rules: place at least two bulbs and wire everything into ONE single loop — a true series circuit with every bulb glowing.',
      mode: 'freebuild',
      par: 0,
      given: [],
      palette: [
        { kind: 'battery', count: 1 },
        { kind: 'bulb', count: 3 },
      ],
      goal: { type: 'free-spec', check: 'series', minBulbs: 2 },
      successNote:
        'A hand-designed series circuit — one path, every component in the chain. Notice your bulbs sharing the voltage, just like the guided builds.',
    },
  ],
  quiz: [
    {
      question: 'In a series circuit, how many paths can the current take?',
      options: ['Exactly one', 'One for each bulb', 'Two — one out, one back', 'As many as there are wires'],
      answer: 0,
      explanation: 'Series means everything is connected in a single line. The current has one path and must pass through every part.',
    },
    {
      question: 'You add MORE bulbs to a series circuit. What happens?',
      options: [
        'Every bulb gets dimmer',
        'Every bulb gets brighter',
        'Only the newest bulb is dim',
        'The brightness does not change',
      ],
      answer: 0,
      explanation: 'The battery’s push is shared between all the bulbs in the line, so each bulb gets a smaller share and glows less.',
    },
    {
      question: 'Three bulbs are in series and one of them is unscrewed. What happens to the other two?',
      options: [
        'They go dark too',
        'They stay lit at the same brightness',
        'They get brighter',
        'They blink on and off',
      ],
      answer: 0,
      explanation: 'Unscrewing a bulb breaks the only path. A gap anywhere in a series circuit stops the current everywhere.',
    },
    {
      question: 'On an old string of holiday lights, ONE bulb burns out and the whole string goes dark. What does that tell you?',
      options: [
        'The lights were wired in series',
        'The plug is broken',
        'Every bulb burned out at the same time',
        'The string was too long',
      ],
      answer: 0,
      explanation: 'Only a series circuit dies completely from a single break — the burned-out bulb left a gap in the one and only path.',
    },
    {
      question: 'You connect a second battery into the chain, + to −. What happens to the bulbs?',
      options: [
        'They glow brighter',
        'They go dark',
        'They get dimmer',
        'Nothing — extra batteries do nothing',
      ],
      answer: 0,
      explanation: 'Batteries in series add their voltages together (3V + 3V = 6V), so more current flows and the bulbs glow brighter.',
    },
    {
      question: 'What is voltage?',
      options: [
        'The strength of the battery’s push, measured in volts',
        'The speed of the wires',
        'The number of bulbs in a circuit',
        'The temperature of the battery',
      ],
      answer: 0,
      explanation: 'Voltage measures how hard the battery pushes current around the circuit. Our battery pack pushes with 3 volts — that is the "3V" printed on it.',
    },
    {
      question: 'An engineer’s drawing of a circuit made of simple symbols is called a…',
      options: ['Schematic', 'Photograph', 'Recipe', 'Storyboard'],
      answer: 0,
      explanation: 'A schematic uses standard symbols for each component so any engineer, anywhere in the world, can read the circuit at a glance.',
    },
  ],
  tryReal: [
    'Wire two flashlight bulbs in a chain with a battery pack and alligator clips — battery → bulb → bulb → back to the battery.',
    'Compare their brightness against a single bulb on the same battery. Dimmer?',
    'Unscrew one bulb. Does the other stay lit?',
    'If you have a second battery pack, add it to the chain (+ to −) and watch the brightness come back.',
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIT 3 — Many Paths: Parallel
// ══════════════════════════════════════════════════════════════════════════════

const UNIT3: ElecUnit = {
  id: 3,
  title: 'Many Paths: Parallel',
  tagline: 'Branches that share the battery but not the path',
  color: '#14b8a6',
  emoji: '🔀',
  story:
    'The workshop display shelf is wired in series, and it is driving everyone crazy — every time one bulb gets bumped loose, the whole shelf goes dark. Real buildings never have this problem. Today you learn their secret: give every bulb its own path.',
  schematicUnlocked: true,
  vocab: [
    { term: 'Parallel circuit', def: 'Components connected on separate side-by-side paths — many paths for current' },
    { term: 'Branch', def: 'One of the separate paths in a parallel circuit' },
    { term: 'Junction', def: 'A point where wires meet and current can split apart or join back together' },
    { term: 'Household wiring', def: 'The parallel circuits in a building — every light and outlet gets its own branch' },
  ],
  introNotes: `# Parallel circuits

In Unit 2, every component shared one path. A **parallel circuit** is the opposite: components sit on separate, side-by-side paths called **branches**. Current leaves the battery, reaches a **junction** — a point where wires meet — and splits up. Part of the current takes each branch, then it all joins back together at another junction and returns to the battery.

> Watch the dots on your board: every place wires meet and current can split or join is a junction.

## What being in parallel means for bulbs

| What you do | What happens |
|---|---|
| Add more bulbs, each on its own branch | Each bulb stays **bright** |
| Unscrew one bulb | Only that branch stops — the others **keep glowing** |
| Follow the current | It **splits** at a junction, then **joins** back |

## Why do parallel bulbs stay bright?

Each branch gets a direct connection to the battery, so each bulb feels the battery's **full voltage**. Nothing is shared, nothing is split — every bulb acts like it has the battery all to itself.

## This is how buildings are wired

Your home uses **household wiring** — one giant parallel circuit. Every light and every outlet is its own branch. That is why turning off the kitchen light does not darken your bedroom, and why one burned-out bulb never blacks out the house.`,
  challenges: [
    {
      id: 'u3c1',
      title: 'Two Paths',
      hint: 'Both bulbs sit on their own branch. Wire the left ends together down to the battery, and the right ends together — your wires will pass right through both branches.',
      mode: 'build',
      par: 2,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(3, 1), P(7, 1), 'Bulb A'),
        bulb('b2', P(3, 3), P(7, 3), 'Bulb B'),
      ],
      goal: { type: 'light-all', minBrightness: 0.6 },
      successNote:
        'Both bulbs are at FULL brightness — compare that to Unit 2! Current splits at the junction dots, takes both branches at once, and joins back. Each bulb feels the battery’s full voltage.',
    },
    {
      id: 'u3c2',
      title: 'Series vs. Parallel Showdown',
      hint: 'The dim series shelf is built for you. Wire the two bulbs on the right in PARALLEL — then compare the brightness side by side.',
      mode: 'build',
      par: 2,
      gridW: 14,
      given: [
        // Left: complete series circuit (fixed, dim)
        battery('batL', P(1, 5), P(5, 5)),
        bulb('sb1', P(1, 1), P(3, 1), 'Series A'),
        bulb('sb2', P(3, 1), P(5, 1), 'Series B'),
        fwire('lw1', P(1, 5), P(1, 1)),
        fwire('lw2', P(5, 5), P(5, 1)),
        // Right: parallel circuit for the student to finish
        battery('batR', P(8, 5), P(12, 5)),
        bulb('b1', P(8, 1), P(12, 1), 'Parallel A'),
        bulb('b2', P(8, 3), P(12, 3), 'Parallel B'),
      ],
      goal: { type: 'light-all', minBrightness: 0.6, bulbs: ['b1', 'b2'] },
      successNote:
        'Same batteries, same bulbs — completely different brightness! The series pair shares one path and splits the voltage; your parallel pair each gets a full-strength branch.',
    },
    {
      id: 'u3c3',
      title: 'Break a Branch',
      hint: 'Make a prediction first — then test it on the real circuit.',
      mode: 'predict',
      par: 0,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(3, 1), P(7, 1), 'Bulb A'),
        bulb('b2', P(3, 3), P(7, 3), 'Bulb B'),
        fwire('w1', P(3, 5), P(3, 1)),
        fwire('w2', P(7, 5), P(7, 1)),
      ],
      goal: { type: 'predict' },
      allowUnscrew: true,
      predict: {
        question: 'Both bulbs are glowing on their own branches. If you unscrew Bulb A (the top branch), what happens to Bulb B?',
        options: [
          'Bulb B stays bright',
          'Bulb B goes dark too',
          'Bulb B gets much dimmer',
          'Bulb B starts flickering',
        ],
        answer: 0,
        actionPrompt: 'Now test it — tap Bulb A to unscrew it and watch Bulb B.',
        resultNote:
          'Bulb B kept glowing! Its branch still makes a complete closed circuit with the battery. Only Bulb A’s branch became an open circuit. This is exactly why one dead bulb never blacks out a whole house.',
        targetBulb: 'b1',
      },
      successNote:
        'A break in one branch stays in that branch. Compare that to Unit 2’s Break the Chain — series breaks stop everything; parallel breaks stop only themselves.',
    },
    {
      id: 'u3c4',
      title: 'Blackout-Proof Shelf',
      hint: 'Three bulbs, three branches. Wire them so that unscrewing ANY one bulb leaves the other two glowing. The checker will test all three!',
      mode: 'build',
      par: 2,
      gridH: 8,
      given: [
        battery('bat', P(3, 7), P(7, 7)),
        bulb('b1', P(3, 1), P(7, 1), 'Bulb A'),
        bulb('b2', P(3, 3), P(7, 3), 'Bulb B'),
        bulb('b3', P(3, 5), P(7, 5), 'Bulb C'),
      ],
      goal: { type: 'redundant' },
      allowUnscrew: true,
      successNote:
        'Blackout-proof! Every bulb has its own branch, so every bulb survives losing any other. Try unscrewing bulbs yourself and watch the survivors keep glowing — the workshop shelf is finally fixed.',
    },
    {
      id: 'u3c5',
      title: 'Parallel From Scratch',
      hint: 'Design your own blackout-proof shelf: place all three bulbs and give each one its own branch. The checker will unscrew every bulb, one at a time, and the rest must survive.',
      mode: 'freebuild',
      par: 0,
      given: [],
      gridH: 8,
      palette: [
        { kind: 'battery', count: 1 },
        { kind: 'bulb', count: 3 },
      ],
      goal: { type: 'free-spec', check: 'redundant', minBulbs: 3 },
      successNote:
        'Your very own parallel design — three branches, three independent bulbs, zero blackouts. This is real electrician thinking.',
    },
  ],
  quiz: [
    {
      question: 'A circuit where components sit on separate side-by-side paths is called a…',
      options: ['Parallel circuit', 'Series circuit', 'Short circuit', 'Open circuit'],
      answer: 0,
      explanation: 'Parallel means many paths — each component gets its own branch, side by side.',
    },
    {
      question: 'Each separate path in a parallel circuit is called a…',
      options: ['Branch', 'Layer', 'Ladder', 'Lane'],
      answer: 0,
      explanation: 'Just like branches of a tree splitting off the trunk, each path in a parallel circuit is called a branch.',
    },
    {
      question: 'A point where wires meet and current can split apart or join together is called a…',
      options: ['Junction', 'Station', 'Corner', 'Plug'],
      answer: 0,
      explanation: 'Junctions are where the current divides between branches or merges back together — the dots on your circuit board.',
    },
    {
      question: 'Two bulbs are in parallel, and two identical bulbs are in series, using the same kind of battery. How do they compare?',
      options: [
        'The parallel bulbs are brighter than the series bulbs',
        'The series bulbs are brighter',
        'They are exactly the same brightness',
        'The parallel bulbs do not light at all',
      ],
      answer: 0,
      explanation: 'Parallel bulbs each get the battery’s full voltage on their own branch. Series bulbs have to split the voltage between them, so they are dimmer.',
    },
    {
      question: 'One bulb in a parallel circuit burns out. What happens to the bulbs on the other branches?',
      options: [
        'They keep glowing',
        'They all go dark',
        'They get much dimmer',
        'They burn out too',
      ],
      answer: 0,
      explanation: 'Each branch is its own complete loop with the battery. A break in one branch does not touch the others.',
    },
    {
      question: 'Why are the lights in a house wired in parallel?',
      options: [
        'Each light works on its own — one burning out never darkens the rest',
        'Parallel circuits use less wire',
        'Parallel circuits look neater inside walls',
        'It makes the electric bill smaller',
      ],
      answer: 0,
      explanation: 'Household wiring gives every light and outlet its own branch, so each one can work — or fail — independently.',
    },
    {
      question: 'In a parallel circuit, what does the current from the battery do?',
      options: [
        'It splits between the branches at a junction, then joins back together',
        'It visits the branches one at a time, in order',
        'It only uses the first branch it finds',
        'It waits at the junction until a switch tells it where to go',
      ],
      answer: 0,
      explanation: 'Current divides at the first junction — some down each branch — and merges again at the far junction before returning to the battery.',
    },
  ],
  tryReal: [
    'Wire two bulbs in parallel with a battery pack: clip both bulbs’ left sides together to the battery’s − end, and both right sides together to the + end.',
    'Compare the brightness to the series chain from Unit 2 — same parts, brighter bulbs!',
    'Unscrew one bulb. Does the other keep glowing?',
    'Bonus: find a junction in your build — the clip where two wires meet. That is where the current splits.',
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIT 4 — Take Control: Switches
// ══════════════════════════════════════════════════════════════════════════════

const UNIT4: ElecUnit = {
  id: 4,
  title: 'Take Control: Switches',
  tagline: 'Put the break exactly where you want it',
  color: '#8b5cf6',
  emoji: '🎛️',
  story:
    'The workshop lights work beautifully now — and they never, ever turn off. You have been shutting them down by yanking wires off the battery, which is no way to run a workshop. Time to install proper switches — and to discover that WHERE you put a switch decides WHAT it controls.',
  schematicUnlocked: true,
  vocab: [
    { term: 'Switch', def: 'A component that opens or closes a circuit on purpose' },
    { term: 'Contacts', def: 'The two metal points a switch connects or separates' },
    { term: 'Lever', def: 'The moving arm of a switch that bridges the contacts' },
    { term: 'Main line', def: 'The shared path that current uses before it splits into branches' },
    { term: 'Master switch', def: 'A switch on the main line — it controls every branch' },
    { term: 'Branch switch', def: 'A switch inside one branch — it controls only that branch' },
  ],
  introNotes: `# Switches

A **switch** is a deliberate, movable break in a circuit. Its **lever** — the moving arm — either bridges the two **contacts** (switch closed, current flows) or lifts away from them (switch open, current stops). Sound familiar? A switch simply flips the circuit between **closed** and **open** — the same words you learned in Unit 1.

## Placement is everything

A switch controls everything whose current must pass through it — and nothing else.

| Where you put it | What it controls | Its name |
|---|---|---|
| On the **main line**, before the branches split | **Every** branch | **Master switch** |
| Inside **one branch** | **Only** that branch | **Branch switch** |

## Think like an electrician

Before placing a switch, trace the current with your finger. Ask: *which bulbs need this path?* If every bulb's current passes through your switch, it is a master switch. If only one bulb's current does, it is a branch switch.

> Your house has both! The breaker box is a master switch for whole rooms; each wall switch is a branch switch for its own light.`,
  challenges: [
    {
      id: 'u4c1',
      title: 'Flip the Switch',
      hint: 'Wire the battery, switch, and bulb into one loop — then tap the switch lever to turn the bulb on and off. The checker verifies BOTH: on when closed, off when open.',
      mode: 'build',
      par: 3,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        fswitch('s1', P(3, 1), P(4, 1), 'Switch'),
        bulb('b1', P(5, 1), P(7, 1), 'Bulb'),
      ],
      goal: { type: 'switch-test', tests: [{ switchId: 's1', darkWhenOpen: ['b1'], litWhenOpen: [] }] },
      successNote:
        'You installed your first switch! Closed = a closed circuit, bulb on. Open = an open circuit, bulb off. No more yanking wires off the battery.',
    },
    {
      id: 'u4c2',
      title: 'The Master Switch',
      hint: 'Two bulbs on two branches, one switch near the battery. Wire it so the current for BOTH branches must pass through the switch — one flip should control the whole shelf.',
      mode: 'build',
      par: 3,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        fswitch('s1', P(3, 4), P(3, 3)),
        bulb('b1', P(3, 1), P(7, 1), 'Bulb A'),
        bulb('b2', P(3, 3), P(7, 3), 'Bulb B'),
      ],
      goal: { type: 'switch-test', tests: [{ switchId: 's1', darkWhenOpen: ['b1', 'b2'], litWhenOpen: [] }] },
      successNote:
        'That is a master switch — it sits on the main line, so every branch’s current must pass through it. One flip, whole shelf. (If only one bulb obeyed your switch, current was sneaking around it — trace the path!)',
    },
    {
      id: 'u4c3',
      title: 'The Branch Switch',
      hint: 'This switch sits inside Bulb A’s branch. Finish the wiring so the switch controls ONLY Bulb A — Bulb B should stay on no matter what.',
      mode: 'build',
      par: 3,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        fswitch('s1', P(3, 1), P(4, 1)),
        bulb('b1', P(4, 1), P(6, 1), 'Bulb A'),
        bulb('b2', P(3, 3), P(7, 3), 'Bulb B'),
      ],
      goal: { type: 'switch-test', tests: [{ switchId: 's1', darkWhenOpen: ['b1'], litWhenOpen: ['b2'] }] },
      successNote:
        'A branch switch! Only Bulb A’s current passes through it, so only Bulb A obeys it. Bulb B’s branch never touches the switch — it keeps its own complete loop.',
    },
    {
      id: 'u4c4',
      title: 'A Switch for Each Room',
      hint: 'Two rooms, two bulbs, two switches — each switch already sits in its own branch. Wire it up like a real electrician: each switch controls its own bulb only.',
      mode: 'build',
      par: 4,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        fswitch('s1', P(3, 1), P(4, 1)),
        bulb('b1', P(4, 1), P(6, 1), 'Bulb A'),
        fswitch('s2', P(3, 3), P(4, 3)),
        bulb('b2', P(4, 3), P(6, 3), 'Bulb B'),
      ],
      goal: {
        type: 'switch-test',
        tests: [
          { switchId: 's1', darkWhenOpen: ['b1'], litWhenOpen: ['b2'] },
          { switchId: 's2', darkWhenOpen: ['b2'], litWhenOpen: ['b1'] },
        ],
      },
      successNote:
        'Exactly how a house is wired: every room’s light is a branch with its own branch switch. Flip them separately, flip them together — each branch minds its own business.',
    },
    {
      id: 'u4c5',
      title: 'The Master Plan',
      hint: 'Your final design: two bright bulbs, each on its own branch, plus ONE master switch that controls them both. Place everything yourself — the checker flips your switch to verify.',
      mode: 'freebuild',
      par: 0,
      given: [],
      palette: [
        { kind: 'battery', count: 1 },
        { kind: 'bulb', count: 2 },
        { kind: 'switch', count: 1 },
      ],
      goal: { type: 'free-spec', check: 'master-switch', minBulbs: 2, minBrightness: 0.6 },
      successNote:
        'A parallel circuit with a master switch, designed entirely by you — branches for brightness, one switch on the main line for control. You have earned the Unit 4 quiz.',
    },
  ],
  quiz: [
    {
      question: 'What does a switch do?',
      options: [
        'It opens or closes a circuit on purpose',
        'It makes bulbs brighter',
        'It stores extra electricity',
        'It turns wires into insulators',
      ],
      answer: 0,
      explanation: 'A switch is a movable break: closed, it completes the circuit; open, it leaves a gap that stops the current.',
    },
    {
      question: 'When you turn a switch OFF, what does it do to the circuit?',
      options: ['It opens the circuit', 'It closes the circuit', 'It shortens the circuit', 'It reverses the circuit'],
      answer: 0,
      explanation: 'Off = open. The lever lifts away from the contacts, leaving a gap — an open circuit — so current stops.',
    },
    {
      question: 'The moving arm of a switch that bridges the two contacts is called the…',
      options: ['Lever', 'Spring', 'Hook', 'Handle'],
      answer: 0,
      explanation: 'The lever swings between the contacts. Touching both: closed. Lifted away: open.',
    },
    {
      question: 'You want ONE switch to control EVERY bulb in a parallel circuit. Where does it go?',
      options: [
        'On the main line, before the branches split',
        'Inside the branch with the brightest bulb',
        'Inside any one branch',
        'Between the two bulbs',
      ],
      answer: 0,
      explanation: 'On the main line, all the current — for every branch — must pass through the switch. That makes it a master switch.',
    },
    {
      question: 'You want a switch to control ONLY one bulb in a parallel circuit. Where does it go?',
      options: [
        'Inside that bulb’s branch',
        'On the main line',
        'Right next to the battery',
        'Anywhere — every spot works the same',
      ],
      answer: 0,
      explanation: 'Inside a branch, the switch only interrupts that branch’s current. The other branches never touch it.',
    },
    {
      question: 'A switch placed on the main line, controlling every branch at once, is called a…',
      options: ['Master switch', 'Branch switch', 'Backup switch', 'Half switch'],
      answer: 0,
      explanation: 'A master switch rules the main line. Your home’s breaker box works exactly this way.',
    },
    {
      question: 'Your bedroom light has its own wall switch, and the kitchen light has its own wall switch. What kind of switch is each one?',
      options: [
        'A branch switch — each controls just its own branch',
        'A master switch — each controls the whole house',
        'A short circuit',
        'A conductor',
      ],
      answer: 0,
      explanation: 'Each room’s light is one branch of the house’s parallel wiring, and its wall switch sits inside that branch.',
    },
  ],
  tryReal: [
    'Build a switch: push a metal brad through each end of a cardboard strip, and trap a paper clip under one brad so it can swing to touch the other.',
    'Wire your switch into the Unit 1 circuit: battery → switch → bulb → back. Swing the paper clip lever and watch the bulb obey.',
    'Now build the Unit 3 parallel circuit and put your switch BEFORE the branches split. One flip should kill both bulbs — a master switch.',
    'Move the switch into just one bulb’s branch. Now it is a branch switch — the other bulb ignores it.',
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIT 5 — Circuit Detective
// ══════════════════════════════════════════════════════════════════════════════

const brokenWire = (id: string, a: Pt, b: Pt): Part => ({ id, kind: 'wire', a, b, fixed: true, broken: true });

const UNIT5: ElecUnit = {
  id: 5,
  title: 'Circuit Detective',
  tagline: 'Hunt hidden breaks with a continuity tester',
  color: '#0ea5e9',
  emoji: '🔍',
  story:
    'Broken gadgets have been piling up on the workshop bench — a flashlight, a string of lights, an old radio switch. They all LOOK fine. That is the thing about electrical faults: you cannot see them. But with a continuity tester and a detective’s method, you can find every single one.',
  schematicUnlocked: true,
  vocab: [
    { term: 'Continuity', def: 'An unbroken conductive path between two points' },
    { term: 'Continuity tester', def: 'A tool that beeps when there is continuity between its two probes' },
    { term: 'Multimeter', def: 'The electrician’s measuring tool — its beep mode tests continuity' },
    { term: 'Probe', def: 'One of the tester’s two metal tips' },
    { term: 'Fault', def: 'A hidden problem in a circuit, like a break inside a wire' },
    { term: 'Troubleshooting', def: 'Finding a fault step by step instead of guessing' },
  ],
  introNotes: `# Finding invisible problems

A broken wire looks exactly like a working wire. So how do electricians find a **fault** — the hidden problem — without tearing everything apart? They test for **continuity**: an unbroken path that electricity can flow through.

## The continuity tester

A **multimeter** set to beep mode (our **continuity tester**) has two **probes**. Touch them to two points:

| The meter screen shows | Meaning |
|---|---|
| 🔊 **BEEP!** | There IS an unbroken path between your probes |
| **OL** (open loop) | The path between your probes is broken somewhere |

The tester beeps through wires, closed switches — and even bulb filaments! A working bulb has a thin unbroken wire inside, so it passes the signal. A burned-out bulb stays silent.

## Think in halves — that is troubleshooting

**Troubleshooting** means narrowing down step by step. Don't test every part from the start! Probe the middle of the circuit first:

- Beep on the first half? The fault is in the **other** half.
- Now split THAT half and probe again.

Each test cuts your search area in half. A good detective finds one fault in a long string of parts with just two or three tests.

> One rule from real electricians: continuity testing is for circuits with the **power off**. The tester sends its own tiny signal — and it never beeps through a battery.`,
  challenges: [
    {
      id: 'u5c1',
      title: 'Meet the Probe',
      hint: 'A continuity tester tells you whether two points are connected — even when your eyes cannot.',
      objective: {
        goal: 'Learn to use the continuity tester: get one BEEP and one SILENCE.',
        steps: [
          'Tap any point on the circuit — that places the red probe.',
          'Tap a second point, then read the meter screen: 🔊 BEEP! means the path between your probes is unbroken. OL (open loop) means there is a break between them.',
          'Get one BEEP (try the two ends of a wire, or even across the bulb) and one OL (try across the open switch).',
        ],
      },
      mode: 'detective',
      par: 0,
      detective: { intro: true },
      given: [
        fwire('w1', P(1, 3), P(4, 3)),
        bulb('b1', P(4, 3), P(6, 3), 'Bulb'),
        fswitch('s1', P(6, 3), P(7, 3), 'Open switch'),
        fwire('w2', P(7, 3), P(9, 3)),
      ],
      goal: { type: 'detective' },
      successNote:
        'You heard both answers: BEEP through wires and even through the bulb’s filament — silence across the open switch. Notice there is no battery here: testers work on unpowered circuits and send their own tiny signal.',
    },
    {
      id: 'u5c2',
      title: 'The Dead Flashlight',
      hint: 'Every part LOOKS fine — but one wire is broken inside, and only the tester can tell which.',
      objective: {
        goal: 'Find the hidden broken wire and repair it so the flashlight lights up.',
        steps: [
          'Probe pairs of points to hunt: OL means the break is somewhere between your probes.',
          'To catch the culprit, put one probe on EACH end of the part you suspect. OL straight across a part proves IT is the fault — it gets a "⚠ fault found" tag.',
          'Only a tagged part can be repaired with the 🔧 tool. Fewer tests = more stars!',
        ],
      },
      mode: 'detective',
      par: 3,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        bulb('b1', P(4, 1), P(6, 1), 'Bulb'),
        brokenWire('w1', P(3, 5), P(3, 1)),
        fwire('w2', P(3, 1), P(4, 1)),
        fwire('w3', P(7, 5), P(7, 1)),
        fwire('w4', P(7, 1), P(6, 1)),
      ],
      goal: { type: 'detective' },
      successNote:
        'Fault found and fixed! Silence between two points means the break is between them. That dead wire looked perfect from the outside — only the tester could tell.',
    },
    {
      id: 'u5c3',
      title: 'The String of Lights',
      hint: 'Five bulbs, one burned out, all dark. Guessing one-by-one wastes tests — think in halves.',
      objective: {
        goal: 'Find the ONE burned-out bulb and replace it — in 3 tests or fewer for 3 stars.',
        steps: [
          'Probe across the FIRST HALF of the string. BEEP? The fault is in the other half.',
          'Split the silent half again and probe it. Keep narrowing.',
          'Finish the job like a pro: probe straight across the suspect bulb to condemn it (⚠), then repair it.',
        ],
      },
      mode: 'detective',
      par: 3,
      gridW: 12,
      given: [
        // five bulbs in series need a stronger supply — just like real light strings
        { id: 'bat', kind: 'battery' as const, a: P(4, 5), b: P(8, 5), fixed: true, voltage: 12 },
        bulb('b1', P(1, 1), P(3, 1), 'Bulb A'),
        bulb('b2', P(3, 1), P(5, 1), 'Bulb B'),
        bulb('b3', P(5, 1), P(7, 1), 'Bulb C'),
        { id: 'b4', kind: 'bulb' as const, a: P(7, 1), b: P(9, 1), fixed: true, broken: true, label: 'Bulb D' },
        bulb('b5', P(9, 1), P(11, 1), 'Bulb E'),
        fwire('w1', P(1, 1), P(1, 5)),
        fwire('w2', P(1, 5), P(4, 5)),
        fwire('w3', P(11, 1), P(11, 5)),
        fwire('w4', P(11, 5), P(8, 5)),
      ],
      goal: { type: 'detective' },
      successNote:
        'That is real troubleshooting: every probe cut the search in half. Old-style holiday lights died exactly like this — and now you know how the repair techs found the bad bulb.',
    },
    {
      id: 'u5c4',
      title: 'Double Trouble',
      hint: 'TWO faults this time — and one hides inside a part that looks perfectly healthy.',
      objective: {
        goal: 'Find and repair BOTH hidden faults to bring the circuit back to life.',
        steps: [
          'Probe section by section — OL means at least one fault is between your probes.',
          'Condemn each fault by probing straight across it (⚠), repair it… then keep testing! The circuit stays dead until every fault is fixed.',
          'Remember: even a switch that looks closed can be broken inside. Test it like everything else.',
        ],
      },
      mode: 'detective',
      par: 5,
      given: [
        battery('bat', P(3, 5), P(7, 5)),
        { id: 's1', kind: 'switch' as const, a: P(3, 1), b: P(4, 1), fixed: true, closed: true, broken: true, label: 'Switch' },
        bulb('b1', P(4, 1), P(6, 1), 'Bulb'),
        fwire('w1', P(3, 5), P(3, 1)),
        brokenWire('w2', P(6, 1), P(7, 1)),
        fwire('w3', P(7, 1), P(7, 5)),
      ],
      goal: { type: 'detective' },
      successNote:
        'Two faults, both found! The sneaky one: a switch can be CLOSED and still be broken inside — its contacts corrode. Never trust a part just because it looks right. Test it.',
    },
    {
      id: 'u5c5',
      title: 'The Fault Demo Board',
      hint: 'The workshop wants a display that PROVES why buildings use parallel wiring: even with a broken wire, only one light goes out.',
      objective: {
        goal: 'Build a parallel circuit that contains the broken wire segment — one bulb dark, the other still shining bright.',
        steps: [
          'Place the battery and BOTH bulbs, giving each bulb its own branch — a parallel circuit, just like Unit 3.',
          'Place the broken wire segment (you can see its crack!) inside ONE bulb’s branch, then wire everything together.',
          'Done right, the branch with the break goes dark while the other bulb shines at full brightness — a break in a parallel circuit only kills its own branch.',
          'The checker will also secretly repair your broken segment in a test copy: with the crack fixed, BOTH bulbs must light. That proves your dark bulb is dark because of the break — not because of missing wires!',
        ],
      },
      mode: 'freebuild',
      par: 0,
      given: [],
      palette: [
        { kind: 'battery', count: 1 },
        { kind: 'bulb', count: 2 },
        { kind: 'breakwire', count: 1 },
      ],
      goal: { type: 'free-spec', check: 'broken-branch', minBulbs: 2, minBrightness: 0.6 },
      successNote:
        'A perfect demonstration: the broken branch went dark and its neighbor never flickered. You built the exact reason every home is wired in parallel — and after this unit, you also know how to FIND a break like that with a tester.',
    },
  ],
  quiz: [
    {
      question: 'Continuity means…',
      options: [
        'An unbroken path that electricity can flow through',
        'A circuit with two batteries',
        'A wire that is very long',
        'A bulb at full brightness',
      ],
      answer: 0,
      explanation: 'Continuity = continuous. If the path between two points has no breaks, there is continuity between them.',
    },
    {
      question: 'The electrician’s measuring tool with a continuity beep mode is called a…',
      options: ['Multimeter', 'Thermometer', 'Telescope', 'Stopwatch'],
      answer: 0,
      explanation: 'A multimeter measures many things — voltage, current, resistance — and its beep mode tests continuity.',
    },
    {
      question: 'A hidden problem in a circuit — like a break inside a wire — is called a…',
      options: ['Fault', 'Glitch bug', 'Dent', 'Leak'],
      answer: 0,
      explanation: 'Electricians call any hidden defect a fault. Faults are invisible from the outside, which is why we test instead of look.',
    },
    {
      question: 'The tester BEEPS when its two probes touch…',
      options: [
        'Two points connected by an unbroken conductive path',
        'Any two points made of metal',
        'Two points on opposite sides of a break',
        'The same point twice',
      ],
      answer: 0,
      explanation: 'A beep means the tester’s signal made it from one probe to the other — the path between them has continuity.',
    },
    {
      question: 'You probe the two ends of a wire and hear NO beep. What do you know?',
      options: [
        'The wire is broken somewhere inside',
        'The wire is working perfectly',
        'The battery is dead',
        'The wire is too short to test',
      ],
      answer: 0,
      explanation: 'Silence between two points means the path between them is broken — even if the wire looks fine on the outside.',
    },
    {
      question: 'A dark string of lights: the tester beeps across the first half but stays silent across the second half. Where is the fault?',
      options: [
        'Somewhere in the second half',
        'Somewhere in the first half',
        'In the plug',
        'In every bulb at once',
      ],
      answer: 0,
      explanation: 'The beeping half is healthy. The silent half contains the break — now split THAT half and keep narrowing.',
    },
    {
      question: 'What is the smartest way to find one fault in a long circuit?',
      options: [
        'Split the circuit in half, test each half, and keep narrowing down',
        'Replace every part one at a time starting from the left side of the screen',
        'Shake the circuit and listen for rattles',
        'Add a second battery to push through the break',
      ],
      answer: 0,
      explanation: 'Halving is real troubleshooting: every test eliminates half the remaining suspects, so even a long circuit takes just a few probes.',
    },
  ],
  tryReal: [
    'If your class has multimeters: set one to beep mode and go on a continuity scavenger hunt — test a paper clip, a pencil (tip to tip!), scissors, and a rubber band.',
    'Test a flashlight bulb between its side and bottom tip. Beep = good filament. Then try a burned-out bulb if you can find one — silence.',
    'No multimeter? Use the test lamp you designed in the capstone: battery + bulb + two foil leads. If the bulb lights across an object, that is continuity.',
    'Detective challenge: a partner secretly cuts one strip in a chain of foil strips taped under paper. Find the break with your tester — using as few tests as you can.',
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIT 6 — Ohm's Law & Meters
// ══════════════════════════════════════════════════════════════════════════════

const UNIT6: ElecUnit = {
  id: 6,
  title: "Ohm's Law & Meters",
  tagline: 'Voltage pushes, resistance resists, current results',
  color: '#f97316',
  emoji: '📐',
  story:
    'The workshop just got a proper lab bench: a power supply with a voltage dial, a box of resistors, and two shiny meters. Time to stop describing circuits with words like "brighter" and "dimmer" — today you measure them with numbers, and one small formula explains everything you have seen since Unit 1.',
  schematicUnlocked: true,
  vocab: [
    { term: 'Resistance', def: 'How strongly a component pushes back against the flow of current' },
    { term: 'Ohm (Ω)', def: 'The unit for resistance' },
    { term: 'Resistor', def: 'A component built to add an exact amount of resistance' },
    { term: 'Ampere (A)', def: 'The unit for current — how much charge flows each second' },
    { term: "Ohm's Law", def: 'Current = Voltage ÷ Resistance (I = V ÷ R)' },
    { term: 'Voltmeter', def: 'The meter that measures voltage — the push' },
    { term: 'Ammeter', def: 'The meter that measures current — the flow' },
  ],
  introNotes: `# The formula behind everything

You already know **voltage** — the battery's push, in volts. Now meet its opponent: **resistance**, how strongly a component pushes back against the flow. Resistance is measured in **ohms (Ω)**, and a **resistor** is a component built to add an exact amount of it.

The result of push versus push-back is the **current** — the flow you have been watching since Unit 1 — measured in **amperes (A)**, or amps.

## Ohm's Law

| | |
|---|---|
| **The law** | Current = Voltage ÷ Resistance |
| **In symbols** | I = V ÷ R |
| **More push (V up)** | More current — brighter |
| **More push-back (R up)** | Less current — dimmer |

Try it: 6 volts across 12 ohms → I = 6 ÷ 12 = **0.5 amps**. That is the whole law.

## Reading the meters

A **voltmeter** measures the push (volts). An **ammeter** measures the flow (amps). On your lab bench both meters read live — change a dial and watch them respond instantly.

## This explains Unit 2!

Remember bulbs dimming in series? Each bulb adds resistance, so the chain's total R goes up — and I = V ÷ R means the current drops. Everything you saw with your eyes, this formula predicts with numbers.`,
  challenges: [
    {
      id: 'u6c1',
      title: 'The Lab Bench',
      hint: 'Welcome to your first real lab bench — two dials you control, two meters that never lie.',
      objective: {
        goal: 'Dial in a current of exactly 0.50 A on the ammeter.',
        steps: [
          'Drag the VOLTAGE dial (the push) and watch the ammeter jump.',
          'Drag the RESISTANCE dial (the push-back) and watch it drop.',
          'Use the formula card — I = V ÷ R — to find a combination that lands exactly on 0.50 A. More than one combo works!',
        ],
      },
      mode: 'meters',
      par: 0,
      given: [],
      meters: {
        targetCurrent: 0.5,
        tolerance: 0.005,
        vRange: [1.5, 9], vStep: 0.5,
        rRange: [2, 30], rStep: 1,
      },
      goal: { type: 'meter-target' },
      successNote:
        'You hit 0.50 A — and here is the secret: every combination that worked has V ÷ R = 0.5. Try another one: 3V with 6Ω, 6V with 12Ω… same current, same law.',
    },
    {
      id: 'u6c2',
      title: 'Solve for Resistance',
      hint: 'The power supply is locked at 6 V. The fan motor needs exactly 0.30 A. The dial stays locked until your math says what R must be.',
      objective: {
        goal: 'Calculate the resistance first — then dial in your answer and let the ammeter prove it.',
        steps: [
          'Read the knowns: V = 6 V (locked) and the target I = 0.30 A. The unknown is R.',
          'Rearrange Ohm’s Law with the triangle: cover the R and what is left is V ÷ I. Compute it and type your answer.',
          'A correct answer unlocks the resistance dial. Set it to YOUR number and watch the ammeter land exactly on 0.30 A.',
        ],
      },
      mode: 'meters',
      par: 0,
      given: [],
      meters: {
        targetCurrent: 0.3,
        tolerance: 0.005,
        vRange: [1.5, 9], vStep: 0.5,
        rRange: [2, 30], rStep: 1,
        vLocked: 6,
        requirePlan: 'r',
      },
      goal: { type: 'meter-target' },
      successNote:
        'R = V ÷ I = 6 ÷ 0.30 = 20 Ω — you rearranged Ohm’s Law and the ammeter proved you right. Engineers do this exact calculation every time they pick a resistor.',
    },
    {
      id: 'u6c3',
      title: 'Solve for Voltage',
      hint: 'This time the resistor is fixed at 15 Ω and the circuit needs exactly 0.40 A. Your math unlocks the voltage dial.',
      objective: {
        goal: 'Calculate the voltage first — then dial in your answer and let the meters prove it.',
        steps: [
          'Read the knowns: R = 15 Ω (locked) and the target I = 0.40 A. The unknown is V.',
          'Cover the V on the triangle: what is left is I × R. Compute it and type your answer.',
          'A correct answer unlocks the voltage dial. Set it to YOUR number and watch the ammeter hit 0.40 A on the nose.',
        ],
      },
      mode: 'meters',
      par: 0,
      given: [],
      meters: {
        targetCurrent: 0.4,
        tolerance: 0.005,
        vRange: [1.5, 9], vStep: 0.5,
        rRange: [2, 30], rStep: 1,
        rLocked: 15,
        requirePlan: 'v',
      },
      goal: { type: 'meter-target' },
      successNote:
        'V = I × R = 0.40 × 15 = 6 V. That is the third face of Ohm’s Law. You now own all three: I = V ÷ R, V = I × R, R = V ÷ I.',
    },
    {
      id: 'u6c4',
      title: 'Circuit Math',
      hint: 'Time to work like an engineer: calculate first, then let the meters check you.',
      objective: {
        goal: 'Solve all three bench problems using Ohm’s Law.',
        steps: [
          'Read each problem and decide which face of the law you need: I = V ÷ R, V = I × R, or R = V ÷ I.',
          'Type your answer and press Check — the bench meters confirm it.',
          'No mistakes across all three = 3 stars. Calculators allowed, thinking required!',
        ],
      },
      mode: 'compute',
      par: 0,
      given: [],
      compute: [
        {
          prompt: 'The supply is set to 6 V and the resistor is 12 Ω. How much current flows?',
          answer: 0.5, unit: 'A',
          explain: 'I = V ÷ R = 6 ÷ 12 = 0.5 A. The ammeter agrees: 0.50 A.',
        },
        {
          prompt: 'The ammeter reads 0.25 A through a 12 Ω resistor. What is the supply voltage?',
          answer: 3, unit: 'V',
          explain: 'V = I × R = 0.25 × 12 = 3 V. The voltmeter agrees: 3.0 V.',
        },
        {
          prompt: 'The supply is 9 V and the ammeter reads 0.3 A. What is the resistance?',
          answer: 30, unit: 'Ω',
          explain: 'R = V ÷ I = 9 ÷ 0.3 = 30 Ω. Check the resistor’s label: 30 Ω.',
        },
      ],
      goal: { type: 'compute-set' },
      successNote:
        'Three problems, three faces of the same law. When the math and the meters agree, you KNOW the circuit — no guessing left.',
    },
    {
      id: 'u6c5',
      title: 'The Precision Job',
      hint: 'Capstone: a delicate motor needs exactly 0.75 A — too much burns it out, too little stalls it. Engineers commit to their numbers BEFORE touching the equipment.',
      objective: {
        goal: 'Plan a voltage-and-resistance pair that gives exactly 0.75 A — then dial in your own plan.',
        steps: [
          'Only the target is given: I = 0.75 A. YOU choose both V and R — any pair where V ÷ R = 0.75 works.',
          'Pick values the dials can actually reach: V in steps of 0.5 V (up to 9 V), R in whole ohms (up to 30 Ω). Try R = 8 Ω... what V do you need?',
          'Type your plan. If the math checks out, both dials unlock — set them to your plan and the ammeter will read exactly 0.75 A.',
        ],
      },
      mode: 'meters',
      par: 0,
      given: [],
      meters: {
        targetCurrent: 0.75,
        tolerance: 0.005,
        vRange: [1.5, 9], vStep: 0.5,
        rRange: [2, 30], rStep: 1,
        requirePlan: 'both',
      },
      goal: { type: 'meter-target' },
      successNote:
        'Precision work: 0.75 A on the nose (6 V ÷ 8 Ω, 4.5 V ÷ 6 Ω — any pair with V ÷ R = 0.75). This is exactly how engineers protect real motors, LEDs, and chips.',
    },
  ],
  quiz: [
    {
      question: 'Resistance is…',
      options: [
        'How strongly a component pushes back against the flow of current',
        'How fast electricity travels through a wire',
        'The number of bulbs in a circuit',
        'How hot a battery gets',
      ],
      answer: 0,
      explanation: 'Resistance opposes the flow. More resistance in the path means less current gets through.',
    },
    {
      question: 'Resistance is measured in…',
      options: ['Ohms (Ω)', 'Volts (V)', 'Amps (A)', 'Degrees (°)'],
      answer: 0,
      explanation: 'Ohms, symbol Ω — named after Georg Ohm, the scientist who discovered the law you just learned.',
    },
    {
      question: 'Current is measured in…',
      options: ['Amperes (A)', 'Ohms (Ω)', 'Volts (V)', 'Watts (W)'],
      answer: 0,
      explanation: 'Amperes — amps for short — measure how much charge flows past a point each second.',
    },
    {
      question: "What does Ohm's Law say?",
      options: [
        'Current = Voltage ÷ Resistance',
        'Current = Voltage × Resistance',
        'Voltage = Current ÷ Resistance',
        'Resistance = Current × Voltage',
      ],
      answer: 0,
      explanation: 'I = V ÷ R. More push means more current; more push-back means less current.',
    },
    {
      question: 'A 6 V supply is connected to a 12 Ω resistor. How much current flows?',
      options: ['0.5 A', '2 A', '72 A', '6 A'],
      answer: 0,
      explanation: 'I = V ÷ R = 6 ÷ 12 = 0.5 A.',
    },
    {
      question: 'You need 0.3 A from a 6 V supply. What resistance should you use?',
      options: ['20 Ω', '2 Ω', '18 Ω', '0.05 Ω'],
      answer: 0,
      explanation: 'R = V ÷ I = 6 ÷ 0.3 = 20 Ω.',
    },
    {
      question: 'Which meter measures the battery’s push?',
      options: ['The voltmeter', 'The ammeter', 'The thermometer', 'The odometer'],
      answer: 0,
      explanation: 'Voltmeter = voltage = the push. The ammeter measures the flow (current) instead.',
    },
  ],
  tryReal: [
    'With a multimeter on the resistance (Ω) setting, measure a real resistor — then decode its color bands and see if they match.',
    'Predict before you measure: for a battery and resistor you have, compute I = V ÷ R on paper.',
    'Now build the circuit with the multimeter in amp mode and compare the reading to your prediction. Being within 10% counts as a win — real parts are never perfect!',
    'Find the resistor inside an old LED gadget (with permission!) and work out from Ohm’s Law why the designer chose it.',
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
// UNIT 7 — Breadboard Bootcamp
// ══════════════════════════════════════════════════════════════════════════════

/** The standard kid breadboard: + rail along y=0, − rail along y=5, terminal
 *  strip columns x=1..9 spanning y=1..4. All internals are hidden wires — the
 *  same engine as every other unit, wearing a breadboard skin. */
const breadboardFixture = (withBattery: boolean): Part[] => {
  const parts: Part[] = [
    { id: 'railP', kind: 'wire', a: P(0, 0), b: P(10, 0), fixed: true, hidden: true },
    { id: 'railN', kind: 'wire', a: P(0, 5), b: P(10, 5), fixed: true, hidden: true },
  ];
  for (let x = 1; x <= 9; x++) {
    parts.push({ id: `strip${x}`, kind: 'wire', a: P(x, 1), b: P(x, 4), fixed: true, hidden: true });
  }
  if (withBattery) {
    // − to the blue rail, + to the red rail, standing at the board's left edge
    parts.push({ id: 'bat', kind: 'battery', a: P(0, 5), b: P(0, 0), fixed: true });
  }
  return parts;
};

const UNIT7: ElecUnit = {
  id: 7,
  title: 'Breadboard Bootcamp',
  tagline: 'Build like a real engineer — no solder needed',
  color: '#a16207',
  emoji: '🍞',
  story:
    'The final bench in the workshop holds the tool every inventor uses to try ideas fast: the breadboard. No tape, no solder — push parts in, pull them out, rebuild in seconds. Learn its secret wiring, meet your first LED, and graduate by building a circuit from nothing but its schematic.',
  schematicUnlocked: true,
  vocab: [
    { term: 'Breadboard', def: 'A reusable building board — push parts into its holes, no soldering needed' },
    { term: 'Terminal strip', def: 'A hidden metal strip connecting a column of holes inside the board' },
    { term: 'Power rail', def: 'The long rows along the edges that carry + and − to everything' },
    { term: 'Jumper', def: 'A short wire that hops between holes, connecting only at its two ends' },
    { term: 'LED', def: 'A light-emitting diode — a one-way light that needs a resistor to survive' },
    { term: 'Polarity', def: 'Which way around a part goes: an LED only works with + to its long leg' },
  ],
  introNotes: `# The board with hidden wiring

A **breadboard** looks like a plastic block full of holes — but the magic is inside. Metal **terminal strips** connect each COLUMN of holes, and long **power rails** run along the edges: red for **+**, blue for **−**. Push two part legs into the same column and they are connected, instantly, no soldering.

## The rules of the board

| Holes | Connected? |
|---|---|
| Same column (same terminal strip) | **Yes** — the hidden strip joins them |
| Different columns | **No** — you must add a part or a jumper |
| Along a power rail | **Yes** — the whole rail is one long strip |

A **jumper** is a short hop wire. Unlike the bare wires from earlier units, a jumper connects ONLY at its two ends — it arcs safely over everything in between.

## Meet the LED

The **LED** (light-emitting diode) is a one-way light. It has **polarity**: current may only enter its **+ leg** (the long one) and leave its **− leg** (the flat side). Backwards? It simply stays dark — no harm done.

But an LED has no self-control: connect it straight to the battery and it gulps far too much current and **burns out** 💥. Its bodyguard is a **resistor** in its path — exactly the R you mastered in Unit 6, doing a real job.

> This unit puts everything together: continuity (Unit 5) to explore the board, Ohm's Law (Unit 6) to protect the LED, and schematics (Unit 2) to build the final circuit.`,
  challenges: [
    {
      id: 'u7c1',
      title: 'X-Ray the Board',
      hint: 'Before you build on a breadboard, you must know which holes are secretly connected. Your multimeter and the X-ray view will show you.',
      objective: {
        goal: 'Prove the breadboard’s hidden wiring with the continuity tester: get one BEEP and one OL.',
        steps: [
          'Probe two holes in the SAME column — the hidden terminal strip connects them, so the meter BEEPs.',
          'Probe two holes in DIFFERENT columns — no connection, so the meter reads OL.',
          'Try the + rail too: any two holes along it beep, end to end.',
          'Tap 🩻 X-ray view to see the metal strips you just discovered!',
        ],
      },
      mode: 'detective',
      par: 0,
      detective: { intro: true },
      breadboard: true,
      gridH: 5,
      given: breadboardFixture(false),
      goal: { type: 'detective' },
      successNote:
        'Now you can read a breadboard blind: columns are connected by terminal strips, rails run the whole edge, and neighbors across columns are strangers until YOU connect them.',
    },
    {
      id: 'u7c2',
      title: 'First Light',
      hint: 'A resistor and an LED are plugged in. Jumper the circuit together — and mind the LED’s polarity!',
      objective: {
        goal: 'Light the LED safely: + rail → resistor → LED → − rail.',
        steps: [
          'Trace what is plugged in: the resistor bridges columns 2 and 4; the LED bridges columns 4 and 6.',
          'Add a jumper from the + rail down into column 2, and a jumper from column 6 down to the − rail.',
          'Dark? Check the LED’s polarity — current must enter its + leg. Tap the LED to flip it around.',
          'NEVER let the LED skip the resistor: a jumper straight from the + rail to the LED’s column burns it out 💥 (try it if you dare — then remove the jumper).',
        ],
      },
      mode: 'build',
      par: 2,
      breadboard: true,
      gridH: 5,
      given: [
        ...breadboardFixture(true),
        { id: 'r1', kind: 'resistor' as const, a: P(2, 2), b: P(4, 2), fixed: true, resistance: 100, label: '100 Ω' },
        { id: 'led1', kind: 'led' as const, a: P(6, 2), b: P(4, 2), fixed: true, label: 'LED' }, // starts backwards!
      ],
      goal: { type: 'led-safe' },
      successNote:
        'First light! The resistor tames the current (I = 3 ÷ 110 ≈ 0.03 A — safely small), and the LED only agreed to shine once its + leg faced the + side. Polarity matters!',
    },
    {
      id: 'u7c3',
      title: 'Switch It On',
      hint: 'Real gadgets have power buttons. Wire the switch into the LED’s path so one tap controls the light.',
      objective: {
        goal: 'Wire the circuit so the switch turns the LED on and off.',
        steps: [
          'The path must be: + rail → resistor (columns 2–4) → LED (columns 4–6) → switch (columns 6–7) → − rail.',
          'Add a jumper from the + rail into column 2, and a jumper from column 7 down to the − rail.',
          'The checker flips your switch both ways: closed = LED on, open = LED off.',
        ],
      },
      mode: 'build',
      par: 2,
      breadboard: true,
      gridH: 5,
      given: [
        ...breadboardFixture(true),
        { id: 'r1', kind: 'resistor' as const, a: P(2, 2), b: P(4, 2), fixed: true, resistance: 100, label: '100 Ω' },
        { id: 'led1', kind: 'led' as const, a: P(4, 3), b: P(6, 3), fixed: true, label: 'LED' },
        fswitch('s1', P(6, 2), P(7, 2), 'Switch'),
      ],
      goal: { type: 'led-safe', requireSwitch: true },
      successNote:
        'A complete gadget: power, protection, light, and control — all on a board you could rebuild in a minute. This is exactly how real prototypes start.',
    },
    {
      id: 'u7c4',
      title: 'Graduation: Schematic to Board',
      hint: 'The final exam every engineer takes daily: here is the schematic — build it. An empty board, a bin of parts, and no step-by-step this time.',
      objective: {
        goal: 'Build the schematic on the breadboard from scratch: place every component, then jumper the loop together.',
        steps: [
          'Read the schematic card: follow the loop from the battery’s + through each symbol and back to −.',
          'Place the switch, resistor, and LED from the parts bin — each one must bridge two DIFFERENT columns, in the order the schematic shows.',
          'Jumper the loop closed: + rail into the first column, column to column where parts don’t already connect, last column down to the − rail.',
          'Mind the LED’s polarity (tap it to flip). When the switch controls a safely-lit LED, you have graduated. 🎓',
        ],
      },
      mode: 'build',
      par: 3,
      breadboard: true,
      gridH: 5,
      given: breadboardFixture(true),
      palette: [
        { kind: 'switch', count: 1 },
        { kind: 'resistor', count: 1 },
        { kind: 'led', count: 1 },
      ],
      reference: {
        gridW: 8,
        gridH: 5,
        parts: [
          { id: 'ref-bat', kind: 'battery', a: P(1, 4), b: P(7, 4), fixed: true },
          { id: 'ref-sw', kind: 'switch', a: P(1, 1), b: P(3, 1), fixed: true, closed: true },
          { id: 'ref-r', kind: 'resistor', a: P(3, 1), b: P(5, 1), fixed: true, resistance: 100, label: '100 Ω' },
          // anode faces the battery's + side (current arrives via the right-hand wire)
          { id: 'ref-led', kind: 'led', a: P(7, 1), b: P(5, 1), fixed: true, label: 'LED' },
          { id: 'ref-w1', kind: 'wire', a: P(1, 4), b: P(1, 1), fixed: true },
          { id: 'ref-w2', kind: 'wire', a: P(7, 4), b: P(7, 1), fixed: true },
        ],
      },
      goal: { type: 'led-safe', requireSwitch: true },
      successNote:
        '🎓 Graduated! You read a schematic cold and made it real — the exact skill that turns ideas into working electronics. The whole lab led here: circuits, series, parallel, switches, testing, Ohm’s Law, and now the builder’s board.',
    },
  ],
  quiz: [
    {
      question: 'What is a breadboard for?',
      options: [
        'Building and changing circuits quickly, without soldering',
        'Storing spare parts safely',
        'Measuring voltage and current',
        'Charging batteries',
      ],
      answer: 0,
      explanation: 'Push parts in, pull them out, rebuild in seconds — the breadboard is the inventor’s scratchpad.',
    },
    {
      question: 'The hidden metal piece that connects a COLUMN of holes is called a…',
      options: ['Terminal strip', 'Power cord', 'Fuse', 'Antenna'],
      answer: 0,
      explanation: 'Each column of holes shares one terminal strip inside the plastic — that is the board’s secret wiring.',
    },
    {
      question: 'The long + and − rows along the edges of a breadboard are called…',
      options: ['Power rails', 'Border strips', 'Speed lanes', 'Ground floors'],
      answer: 0,
      explanation: 'The power rails carry + and − along the whole board so every column can reach power with one jumper.',
    },
    {
      question: 'Two part legs are pushed into the SAME column of the breadboard. Are they connected?',
      options: [
        'Yes — the column’s terminal strip joins them',
        'No — holes never connect to each other',
        'Only if they touch each other',
        'Only when the battery is on',
      ],
      answer: 0,
      explanation: 'Same column = same terminal strip = connected. Different columns need a part or jumper to bridge them.',
    },
    {
      question: 'What does polarity mean for an LED?',
      options: [
        'It only works one way around — current must enter its + leg',
        'It gets brighter the longer it runs',
        'It can only be used once',
        'It works best upside down',
      ],
      answer: 0,
      explanation: 'An LED is a diode — a one-way street. Backwards, it simply stays dark.',
    },
    {
      question: 'Why must an LED have a resistor in its path?',
      options: [
        'The resistor limits the current so the LED doesn’t burn out',
        'The resistor makes the LED brighter',
        'The resistor changes the LED’s color',
        'The resistor charges the LED',
      ],
      answer: 0,
      explanation: 'On its own an LED gulps far too much current. The resistor is its bodyguard — Ohm’s Law doing a real job.',
    },
    {
      question: 'An LED is wired backwards in a circuit (− to its + leg). What happens?',
      options: [
        'It stays dark until you flip it around',
        'It explodes instantly',
        'It glows a different color',
        'It drains the battery faster',
      ],
      answer: 0,
      explanation: 'A backwards LED just blocks — no light, no harm. Flip it so current enters the + leg and it shines.',
    },
  ],
  tryReal: [
    'Get a real mini breadboard, a battery pack, a 100–330 Ω resistor, an LED, and a few jumper wires.',
    'First, X-ray it with your multimeter: beep-test two holes in the same column, then two in different columns — just like Challenge 1.',
    'Build First Light for real: + rail → resistor → LED (long leg toward the resistor!) → − rail.',
    'If the LED stays dark, flip it — you already know why. Then add a switch or a second LED branch and keep going: you are an electronics builder now.',
  ],
};

export const UNITS: ElecUnit[] = [UNIT1, UNIT2, UNIT3, UNIT4, UNIT5, UNIT6, UNIT7];

/** Future units shown as locked "coming soon" cards on the overview. */
export const COMING_SOON: { id: number; title: string; tagline: string; emoji: string }[] = [];
