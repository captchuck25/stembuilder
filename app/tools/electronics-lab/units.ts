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
  | { type: 'free-spec'; check: 'lit' | 'series' | 'redundant' | 'master-switch'; minBulbs: number; minBrightness?: number };

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
  mode: 'build' | 'materials' | 'predict' | 'freebuild';
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
  /** Freebuild only: the parts bin — what the student may place, and how many. */
  palette?: { kind: 'battery' | 'bulb' | 'switch'; count: number }[];
  /** Board size override (default 10×6) for challenges needing more room. */
  gridW?: number;
  gridH?: number;
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

export const UNITS: ElecUnit[] = [UNIT1, UNIT2, UNIT3, UNIT4];

/** Future units shown as locked "coming soon" cards on the overview. */
export const COMING_SOON = [
  { id: 5, title: 'Circuit Detective', tagline: 'Hunt hidden breaks with a continuity tester', emoji: '🔍' },
  { id: 6, title: "Ohm's Law & Meters", tagline: 'Voltage pushes, resistance resists, current results', emoji: '📐' },
  { id: 7, title: 'Breadboard Bootcamp', tagline: 'Build like a real engineer — no solder needed', emoji: '🍞' },
];
