// Electronics Lab question bank (M0).
// Two sources merge here:
//   1. The in-lab end-of-unit quizzes, absorbed from UNITS at module load so
//      the bank never drifts from what students actually see in the lab.
//      Absorbed ids are positional (elec-u<unitIdx>-c<n>) — reordering a
//      unit's quiz array in units.ts would shift them, so don't reorder.
//   2. Bank-only questions authored below, unit by unit. Unit 1 (unitIdx 0)
//      is the first authored slice; remaining units get bank-only questions
//      in later M0 slices.
// Kid-friendly rules apply to every question: one clearly correct answer,
// 5th–6th grade phrasing, no compass directions.

import { UNITS } from '@/app/tools/electronics-lab/units';
import { BankQuestion, CurriculumMeta } from './types';

// ── Topic/difficulty annotations for absorbed curriculum questions ───────────
// Keyed by unitIdx, positional per question. Units without an entry fall back
// to topic = unit title, difficulty = 2, until their authored slice lands.
const CURRICULUM_META: Record<number, CurriculumMeta[]> = {
  0: [
    { topic: 'Circuits & loops', difficulty: 1 },
    { topic: 'Conductors & insulators', difficulty: 1 },
    { topic: 'Current', difficulty: 1 },
    { topic: 'Open vs closed', difficulty: 1 },
    { topic: 'Circuit parts', difficulty: 1 },
    { topic: 'Troubleshooting', difficulty: 2 },
    { topic: 'Short circuits', difficulty: 3 },
  ],
  1: [
    { topic: 'Series basics', difficulty: 1 },
    { topic: 'Brightness in series', difficulty: 1 },
    { topic: 'Breaks in series', difficulty: 1 },
    { topic: 'Breaks in series', difficulty: 2 },
    { topic: 'Voltage & batteries', difficulty: 2 },
    { topic: 'Voltage & batteries', difficulty: 1 },
    { topic: 'Schematics & symbols', difficulty: 1 },
  ],
  2: [
    { topic: 'Parallel basics', difficulty: 1 },
    { topic: 'Branches & junctions', difficulty: 1 },
    { topic: 'Branches & junctions', difficulty: 1 },
    { topic: 'Series vs parallel', difficulty: 2 },
    { topic: 'Breaks in parallel', difficulty: 1 },
    { topic: 'Household wiring', difficulty: 2 },
    { topic: 'Branches & junctions', difficulty: 2 },
  ],
  3: [
    { topic: 'Switch basics', difficulty: 1 },
    { topic: 'Switch basics', difficulty: 1 },
    { topic: 'Contacts & lever', difficulty: 1 },
    { topic: 'Switch placement', difficulty: 2 },
    { topic: 'Switch placement', difficulty: 2 },
    { topic: 'Master switch', difficulty: 1 },
    { topic: 'Branch switch', difficulty: 2 },
  ],
  4: [
    { topic: 'Continuity basics', difficulty: 1 },
    { topic: 'Using the tester', difficulty: 1 },
    { topic: 'Faults', difficulty: 1 },
    { topic: 'Continuity basics', difficulty: 1 },
    { topic: 'Using the tester', difficulty: 2 },
    { topic: 'Troubleshooting method', difficulty: 2 },
    { topic: 'Troubleshooting method', difficulty: 2 },
  ],
  5: [
    { topic: 'Resistance basics', difficulty: 1 },
    { topic: 'Units & meters', difficulty: 1 },
    { topic: 'Units & meters', difficulty: 1 },
    { topic: "Ohm's Law", difficulty: 1 },
    { topic: 'Circuit math', difficulty: 2 },
    { topic: 'Circuit math', difficulty: 2 },
    { topic: 'Units & meters', difficulty: 1 },
  ],
  6: [
    { topic: 'Breadboard wiring', difficulty: 1 },
    { topic: 'Breadboard wiring', difficulty: 1 },
    { topic: 'Jumpers & rails', difficulty: 1 },
    { topic: 'Breadboard wiring', difficulty: 2 },
    { topic: 'LED & polarity', difficulty: 1 },
    { topic: 'LED safety', difficulty: 2 },
    { topic: 'LED & polarity', difficulty: 2 },
  ],
};

const absorbed: BankQuestion[] = UNITS.flatMap((unit, unitIdx) =>
  unit.quiz.map((q, n) => {
    const meta = CURRICULUM_META[unitIdx]?.[n] ?? { topic: unit.title, difficulty: 2 as const };
    return {
      id: `elec-u${unitIdx}-c${n}`,
      lab: 'electronics-lab' as const,
      unitIdx,
      topic: meta.topic,
      difficulty: meta.difficulty,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
    };
  })
);

// ── Unit 1 (unitIdx 0) — Circuits Alive: bank-only questions ─────────────────
const UNIT1_BANK: BankQuestion[] = [
  {
    id: 'elec-u0-b0',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Current',
    difficulty: 1,
    question: 'Electricity is the movement of tiny particles. What are those particles called?',
    options: ['Electrons', 'Air bubbles', 'Sparks', 'Magnets'],
    answer: 0,
    explanation:
      'Electrons are the tiny particles that move through a circuit. The flow of electrons is what we call current.',
  },
  {
    id: 'elec-u0-b1',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Circuit parts',
    difficulty: 1,
    question: 'Which three things does every working circuit need?',
    options: [
      'A power source, a path, and a load',
      'A battery, a magnet, and a mirror',
      'A wire, a ruler, and a bell',
      'A bulb, a fan, and a speaker',
    ],
    answer: 0,
    explanation:
      'Every circuit needs a power source (the battery) to push the current, a path (the wires) to carry it, and a load (like a bulb) to use the energy.',
  },
  {
    id: 'elec-u0-b2',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Circuit parts',
    difficulty: 1,
    question: 'In a circuit with a battery, wires, and a bulb, which part is the power source?',
    options: ['The battery', 'The bulb', 'The wires', 'The workbench'],
    answer: 0,
    explanation:
      'The battery pushes the current around the loop — that push is what makes it the power source.',
  },
  {
    id: 'elec-u0-b3',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Circuit parts',
    difficulty: 2,
    question: 'What job do the wires do in a circuit?',
    options: [
      'They give the current a path to follow',
      'They make the current all by themselves',
      'They use up the energy like a bulb does',
      'They stop the current from moving',
    ],
    answer: 0,
    explanation:
      'Wires are the path. The battery makes the push, the load uses the energy, and the wires carry the current between them.',
  },
  {
    id: 'elec-u0-b4',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Conductors & insulators',
    difficulty: 1,
    question: 'Which of these materials is an insulator?',
    options: ['A rubber eraser', 'A copper wire', 'A metal spoon', 'A penny'],
    answer: 0,
    explanation:
      'Rubber blocks current, so it is an insulator. Copper, spoons, and pennies are all metal — metals are conductors.',
  },
  {
    id: 'elec-u0-b5',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Conductors & insulators',
    difficulty: 2,
    question: 'Real wires are copper on the inside and plastic on the outside. Why plastic on the outside?',
    options: [
      'Plastic is an insulator, so it keeps the current safely inside the wire',
      'Plastic makes the current move faster',
      'Plastic makes the wire stronger than steel',
      'Plastic lets you see the current glowing',
    ],
    answer: 0,
    explanation:
      'The copper inside is the conductor that carries the current. The plastic outside is an insulator — it blocks current so the electricity stays in the wire.',
  },
  {
    id: 'elec-u0-b6',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Conductors & insulators',
    difficulty: 2,
    question:
      'Your tester circuit lights up when you clip in a paper clip. Then you clip in a crayon and the bulb stays dark. What did you learn about the crayon?',
    options: [
      'The crayon is an insulator',
      'The crayon is a conductor',
      'The crayon made the battery stronger',
      'The crayon fixed the circuit',
    ],
    answer: 0,
    explanation:
      'The paper clip proved the tester works. When the crayon went in and the bulb stayed dark, the crayon must be blocking the current — it is an insulator.',
  },
  {
    id: 'elec-u0-b7',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Open vs closed',
    difficulty: 1,
    question: 'What is a closed circuit?',
    options: [
      'A complete loop with no gaps, so current flows',
      'A circuit that is kept inside a closed box',
      'A circuit that is finished charging',
      'A circuit with the lights turned off',
    ],
    answer: 0,
    explanation:
      'Closed means the loop is complete — current can flow all the way around. A gap anywhere makes it an open circuit instead.',
  },
  {
    id: 'elec-u0-b8',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Open vs closed',
    difficulty: 2,
    question: 'A lamp is shining. Then one wire comes loose from the battery. What happens?',
    options: [
      'The current stops everywhere and the lamp goes dark',
      'The current keeps flowing, just more slowly',
      'Only half of the lamp stays lit',
      'The current waits at the gap until someone fixes it',
    ],
    answer: 0,
    explanation:
      'One gap anywhere stops the current in the whole loop, instantly. That is what makes it an open circuit.',
  },
  {
    id: 'elec-u0-b9',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Open vs closed',
    difficulty: 2,
    question:
      'Your circuit is working and the bulb is lit. You unclip one wire from the battery and the bulb goes dark, because the circuit is now…',
    options: ['Open', 'Closed', 'Shorted', 'Overloaded'],
    answer: 0,
    explanation:
      'Unclipping the wire made a gap, and a loop with a gap is an open circuit. Electricians say it exactly that way: the circuit is open.',
  },
  {
    id: 'elec-u0-b10',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Current',
    difficulty: 2,
    question: 'Where does current flow in a working circuit?',
    options: [
      'Out of the battery, through the whole loop, and back into the battery',
      'From the battery to the bulb, where it stays',
      'Back and forth between the two wires',
      'Only inside the bulb',
    ],
    answer: 0,
    explanation:
      'Current does not get used up or stay anywhere — it flows around the complete loop, out of the battery and back in again.',
  },
  {
    id: 'elec-u0-b11',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Circuit parts',
    difficulty: 2,
    question: 'Which of these is a load?',
    options: [
      'A fan that the circuit is powering',
      'The battery',
      'A copper wire',
      'The plastic cover on a wire',
    ],
    answer: 0,
    explanation:
      'The load is whatever uses the energy — a bulb, a fan, or a speaker. The battery makes the push and the wires carry the current, but the fan is what the circuit is powering.',
  },
  {
    id: 'elec-u0-b12',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Short circuits',
    difficulty: 2,
    question:
      'A battery and a bulb are wired in a working loop. Then you add one extra wire that lets the current skip past the bulb. What happens?',
    options: [
      'A short circuit — the current skips the bulb and the wire heats up fast',
      'The bulb shines twice as bright',
      'The extra wire charges the battery back up',
      'Nothing changes at all',
    ],
    answer: 0,
    explanation:
      'Current takes the easy path. With a wire that skips the load, nothing slows the current down — that is a short circuit, and the wire gets dangerously hot.',
  },
  {
    id: 'elec-u0-b13',
    lab: 'electronics-lab',
    unitIdx: 0,
    topic: 'Short circuits',
    difficulty: 3,
    question: 'What is the difference between an open circuit and a short circuit?',
    options: [
      'An open circuit stops the current; a short circuit lets current skip the load',
      'They are two names for the same thing',
      'An open circuit is dangerous; a short circuit is safe',
      'An open circuit has no battery; a short circuit has two batteries',
    ],
    answer: 0,
    explanation:
      'Open = a gap, so current stops everywhere. Short = current found a shortcut past the load, so too much flows and the wire overheats. One is a dead circuit, the other is a dangerous one.',
  },
];

// ── Unit 2 (unitIdx 1) — One Path: Series: bank-only questions ───────────────
const UNIT2_BANK: BankQuestion[] = [
  {
    id: 'elec-u1-b0',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Components',
    difficulty: 1,
    question: 'What is a component?',
    options: [
      'Any single part of a circuit, like a bulb, battery, wire, or switch',
      'Only the battery',
      'The box the circuit parts came in',
      'The table the circuit sits on',
    ],
    answer: 0,
    explanation:
      'Every single part of a circuit is a component — bulbs, batteries, wires, and switches all count.',
  },
  {
    id: 'elec-u1-b1',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Voltage & batteries',
    difficulty: 1,
    question: 'The battery pack on your workbench says "3V." What does that mean?',
    options: [
      'The battery pushes with 3 volts',
      'The battery weighs 3 pounds',
      'The battery can light at most 3 bulbs',
      'The battery lasts for 3 hours',
    ],
    answer: 0,
    explanation:
      '"3V" means 3 volts — the strength of the battery’s push. A bigger number means a stronger push.',
  },
  {
    id: 'elec-u1-b2',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Voltage & batteries',
    difficulty: 1,
    question: 'What unit is voltage measured in?',
    options: ['Volts', 'Meters', 'Grams', 'Minutes'],
    answer: 0,
    explanation: 'Voltage is measured in volts, written with a V — like the 3V printed on the battery pack.',
  },
  {
    id: 'elec-u1-b3',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Brightness in series',
    difficulty: 2,
    question: 'Why do bulbs get dimmer when you add more of them to a series circuit?',
    options: [
      'The battery’s push is shared between more bulbs, so each one gets a smaller share',
      'The battery shrinks a little with each new bulb',
      'The wires get tired from carrying more bulbs',
      'The new bulbs steal light from the old ones',
    ],
    answer: 0,
    explanation:
      'The voltage stays the same but must now be shared by more bulbs. A smaller share of the push means a dimmer glow.',
  },
  {
    id: 'elec-u1-b4',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Series basics',
    difficulty: 2,
    question: 'A series circuit has three bulbs. How does the current travel?',
    options: [
      'Through every bulb, one after another, along the single path',
      'It picks its favorite bulb and only goes through that one',
      'It splits three ways, one way per bulb',
      'It skips the middle bulb to save energy',
    ],
    answer: 0,
    explanation:
      'Series means one path. The current must pass through every component in the line, one at a time.',
  },
  {
    id: 'elec-u1-b5',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Breaks in series',
    difficulty: 2,
    question: 'A string of four bulbs is wired in series. One bulb burns out. How many bulbs stay lit?',
    options: ['None', 'Three', 'Two', 'One'],
    answer: 0,
    explanation:
      'The burned-out bulb leaves a gap in the only path, so the current stops everywhere — all four go dark.',
  },
  {
    id: 'elec-u1-b6',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Voltage & batteries',
    difficulty: 2,
    question: 'You chain two 3V battery packs together, + to −. How strong is the total push?',
    options: ['6 volts', '3 volts', '9 volts', '0 volts'],
    answer: 0,
    explanation: 'Batteries in series add their voltages: 3V + 3V = 6V. That is why the bulbs glow brighter.',
  },
  {
    id: 'elec-u1-b7',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Schematics & symbols',
    difficulty: 2,
    question: 'Why do engineers draw circuits with symbols instead of pictures of the real parts?',
    options: [
      'So any engineer, anywhere in the world, can read the circuit at a glance',
      'To keep the circuit design a secret',
      'Because symbols make the current flow better',
      'Because drawing real parts is against the rules',
    ],
    answer: 0,
    explanation:
      'Schematic symbols are a shared language. Every engineer learns the same symbols, so any schematic can be read anywhere.',
  },
  {
    id: 'elec-u1-b8',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Breaks in series',
    difficulty: 2,
    question:
      'Two bulbs are chained in series with a battery. You unscrew one bulb and the other goes dark. Why?',
    options: [
      'The only path now has a gap, so the current stops everywhere',
      'The other bulb burned out at the same moment',
      'The battery ran out of energy exactly then',
      'The second bulb needs a rest before it can glow alone',
    ],
    answer: 0,
    explanation:
      'Unscrewing a bulb makes an open circuit. In series there is no other path, so every bulb loses its current at once.',
  },
  {
    id: 'elec-u1-b9',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Voltage & batteries',
    difficulty: 1,
    question: 'A stronger push (a higher voltage) makes the bulbs glow…',
    options: ['Brighter', 'Dimmer', 'Not at all', 'In a different color'],
    answer: 0,
    explanation: 'More voltage means a stronger push on the current, and a stronger push makes bulbs glow brighter.',
  },
  {
    id: 'elec-u1-b10',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Series basics',
    difficulty: 2,
    question: 'Which of these is a series circuit?',
    options: [
      'Battery → bulb → bulb → back to the battery, all in one single loop',
      'Two bulbs that each have their own separate path to the battery',
      'A battery sitting on the workbench with no wires',
      'A bulb connected to another bulb but no battery',
    ],
    answer: 0,
    explanation:
      'Series means every component is in one single line — one loop, one path, everything connected one after another.',
  },
  {
    id: 'elec-u1-b11',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Schematics & symbols',
    difficulty: 2,
    question: 'You press the Schematic view button on your workbench. What changes?',
    options: [
      'The same circuit is drawn with simple symbols instead of pictures',
      'The circuit rewires itself into a better design',
      'The parts move to new places on the board',
      'The current stops until you switch back',
    ],
    answer: 0,
    explanation:
      'Schematic view is just a different way of LOOKING at the same circuit — every component becomes its standard symbol.',
  },
  {
    id: 'elec-u1-b12',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Voltage & batteries',
    difficulty: 3,
    question:
      'Two bulbs in series are glowing dimly. You want them both at full brightness. What could you do?',
    options: [
      'Add a second battery to the chain, + to −',
      'Add a third bulb to the chain',
      'Take away one of the wires',
      'Swap the order of the two bulbs',
    ],
    answer: 0,
    explanation:
      'A second battery doubles the push: 3V + 3V = 6V. Two bulbs sharing a double push glow like one bulb on a single battery. Adding bulbs would make things dimmer, not brighter.',
  },
  {
    id: 'elec-u1-b13',
    lab: 'electronics-lab',
    unitIdx: 1,
    topic: 'Series basics',
    difficulty: 3,
    question:
      'Bulb A and Bulb B are in series. Your friend says, "Bulb A uses up all the current, so Bulb B gets none." Is your friend right?',
    options: [
      'No — the same current flows through every part of a series circuit',
      'Yes — the first bulb always takes all the current',
      'Yes — that is why the second bulb is always dark',
      'No — Bulb B makes its own current',
    ],
    answer: 0,
    explanation:
      'Current is not used up along the way. In a series loop the same current flows through Bulb A, Bulb B, and back to the battery. What the bulbs share is the voltage — the push.',
  },
];

// ── Unit 3 (unitIdx 2) — Many Paths: Parallel: bank-only questions ───────────
const UNIT3_BANK: BankQuestion[] = [
  {
    id: 'elec-u2-b0',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Brightness in parallel',
    difficulty: 2,
    question: 'Why do bulbs in a parallel circuit stay bright?',
    options: [
      'Each bulb gets the battery’s full voltage on its own branch',
      'Parallel bulbs are a special brighter kind of bulb',
      'The wires in parallel circuits glow too',
      'The battery gets stronger every time you add a branch',
    ],
    answer: 0,
    explanation:
      'Every branch connects straight to the battery, so nothing is shared or split — each bulb acts like it has the battery all to itself.',
  },
  {
    id: 'elec-u2-b1',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Brightness in parallel',
    difficulty: 2,
    question:
      'Three bulbs are glowing in parallel. You add a fourth bulb on its own new branch. What happens to the first three?',
    options: [
      'They stay just as bright',
      'All of them get dimmer',
      'All of them get brighter',
      'They go dark',
    ],
    answer: 0,
    explanation:
      'Each branch feels the battery’s full voltage no matter how many branches there are. That is the big difference from series, where every new bulb dims the rest.',
  },
  {
    id: 'elec-u2-b2',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Branches & junctions',
    difficulty: 1,
    question: 'Where does the current split apart in a parallel circuit?',
    options: ['At a junction', 'Inside a bulb', 'Inside the battery', 'At the brightest spot'],
    answer: 0,
    explanation:
      'A junction is a point where wires meet. That is where current divides between the branches — and where it joins back together.',
  },
  {
    id: 'elec-u2-b3',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Household wiring',
    difficulty: 2,
    question:
      'You turn off the kitchen light, but the bedroom light stays on. What does that tell you about how the house is wired?',
    options: [
      'Each light is on its own branch — the house is wired in parallel',
      'The house has a separate battery for every room',
      'The bedroom uses a different kind of electricity',
      'The kitchen switch must be broken',
    ],
    answer: 0,
    explanation:
      'Household wiring is one giant parallel circuit. Every light and outlet has its own branch, so each one works independently.',
  },
  {
    id: 'elec-u2-b4',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Series vs parallel',
    difficulty: 3,
    question: 'What is the difference between a break in a series circuit and a break in a parallel circuit?',
    options: [
      'A series break stops everything; a parallel break stops only its own branch',
      'Both kinds of break stop every bulb',
      'Neither kind of break changes anything',
      'A parallel break stops everything; a series break stops only one bulb',
    ],
    answer: 0,
    explanation:
      'In series there is only one path, so one gap stops it all. In parallel, each branch is its own loop — a gap in one branch leaves the other branches glowing.',
  },
  {
    id: 'elec-u2-b5',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Parallel basics',
    difficulty: 2,
    question:
      'You want a shelf of bulbs where unscrewing ANY one bulb leaves all the others glowing. How should you wire it?',
    options: [
      'In parallel — every bulb on its own branch',
      'In series — every bulb in one single loop',
      'With extra-long wires between the bulbs',
      'With two batteries instead of one',
    ],
    answer: 0,
    explanation:
      'Parallel wiring makes the shelf blackout-proof: each bulb’s branch is a complete loop with the battery, so losing one branch never touches the rest.',
  },
  {
    id: 'elec-u2-b6',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Breaks in parallel',
    difficulty: 3,
    question:
      'Bulb A is on the top branch and Bulb B is on the bottom branch. You unscrew Bulb A. What kind of circuit is each branch now?',
    options: [
      'Bulb A’s branch is open; Bulb B’s branch is still a closed loop',
      'Both branches are open circuits now',
      'Both branches are still closed circuits',
      'Bulb A’s branch is closed; Bulb B’s branch is open',
    ],
    answer: 0,
    explanation:
      'The gap from unscrewing Bulb A only lives in Bulb A’s branch — that branch is open. Bulb B’s branch still makes a complete closed loop with the battery, so it keeps glowing.',
  },
  {
    id: 'elec-u2-b7',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Breaks in parallel',
    difficulty: 2,
    question:
      'Two bulbs are wired in parallel with a battery. You unscrew one bulb and the other keeps glowing. Why?',
    options: [
      'Its own branch still makes a complete loop with the battery',
      'It stored up electricity before the other bulb was removed',
      'The alligator clips hold the light in',
      'The battery pushes twice as hard to keep it lit',
    ],
    answer: 0,
    explanation:
      'Each parallel branch is its own complete circuit. Removing one bulb opens only that branch — the survivor’s loop is untouched.',
  },
  {
    id: 'elec-u2-b8',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Household wiring',
    difficulty: 1,
    question: 'What is household wiring?',
    options: [
      'One giant parallel circuit — every light and outlet has its own branch',
      'A long series chain running from room to room',
      'A battery hidden inside each lamp',
      'Wires that only carry current at night',
    ],
    answer: 0,
    explanation:
      'Buildings are wired in parallel. Every light and every outlet is its own branch, which is why they all work independently.',
  },
  {
    id: 'elec-u2-b9',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Series vs parallel',
    difficulty: 3,
    question:
      'Two series bulbs are dimmer than two parallel bulbs, even with the same kind of battery. Why?',
    options: [
      'Series bulbs share the voltage; parallel bulbs each get the full voltage',
      'Series wires are always thinner than parallel wires',
      'Parallel bulbs are always newer',
      'The battery prefers parallel circuits',
    ],
    answer: 0,
    explanation:
      'In series, the battery’s push is split between the bulbs. In parallel, every branch gets a direct, full-strength connection to the battery.',
  },
  {
    id: 'elec-u2-b10',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Parallel basics',
    difficulty: 2,
    question:
      'A battery powers three bulbs, each on its own branch. How many paths can the current take?',
    options: ['Three', 'One', 'Zero', 'Six'],
    answer: 0,
    explanation:
      'Each branch is a path. Parallel means many paths — here the current splits three ways at the junction.',
  },
  {
    id: 'elec-u2-b11',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Series vs parallel',
    difficulty: 1,
    question: 'Why did the workshop’s series display shelf drive everyone crazy?',
    options: [
      'Every time one bulb got bumped loose, the whole shelf went dark',
      'The bulbs were too bright to look at',
      'It used up a battery every single day',
      'The wires kept changing color',
    ],
    answer: 0,
    explanation:
      'On a series shelf there is only one path, so one loose bulb blacks out everything. Giving every bulb its own parallel branch fixed it.',
  },
  {
    id: 'elec-u2-b12',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Parallel basics',
    difficulty: 1,
    question:
      'You unscrew the bulb on the top branch, and the bulb on the bottom branch stays bright. What type of circuit is this?',
    options: ['Parallel', 'Series', 'Short', 'Open everywhere'],
    answer: 0,
    explanation:
      'Only a parallel circuit keeps glowing when another bulb is removed — each bulb lives on its own independent branch.',
  },
  {
    id: 'elec-u2-b13',
    lab: 'electronics-lab',
    unitIdx: 2,
    topic: 'Branches & junctions',
    difficulty: 3,
    question:
      'A parallel circuit has Bulb A and Bulb B on their own branches. Which single break would make BOTH bulbs go dark?',
    options: [
      'A break in the main wire between the battery and the first junction',
      'A break in Bulb A’s branch',
      'A break in Bulb B’s branch',
      'Unscrewing either one of the bulbs',
    ],
    answer: 0,
    explanation:
      'Before the first junction, all the current travels together in one shared wire. A gap there stops current from ever reaching either branch — but a gap inside one branch only darkens that branch.',
  },
];

// ── Unit 4 (unitIdx 3) — Take Control: Switches: bank-only questions ─────────
const UNIT4_BANK: BankQuestion[] = [
  {
    id: 'elec-u3-b0',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Switch basics',
    difficulty: 1,
    question: 'When a switch is CLOSED, what is the circuit?',
    options: [
      'Closed — current flows',
      'Open — current stops',
      'Shorted — the wires overheat',
      'Reversed — current flows backwards',
    ],
    answer: 0,
    explanation:
      'A closed switch bridges its contacts, completing the loop. Closed switch = closed circuit = current flows.',
  },
  {
    id: 'elec-u3-b1',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Contacts & lever',
    difficulty: 1,
    question: 'The two metal points that a switch connects or separates are called the…',
    options: ['Contacts', 'Corners', 'Clips', 'Coils'],
    answer: 0,
    explanation:
      'The lever swings between the two contacts. Touching both closes the circuit; lifting away opens it.',
  },
  {
    id: 'elec-u3-b2',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Switch basics',
    difficulty: 2,
    question: 'How is a switch different from a broken wire?',
    options: [
      'A switch is a break you control on purpose; a broken wire is an accident',
      'They are exactly the same thing',
      'A switch carries more current than a wire',
      'A broken wire can be turned back on with a tap',
    ],
    answer: 0,
    explanation:
      'Both make a gap in the circuit — but a switch is a deliberate, movable break that you flip whenever you choose.',
  },
  {
    id: 'elec-u3-b3',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Master switch',
    difficulty: 1,
    question: 'What is the main line of a circuit?',
    options: [
      'The shared path the current uses before it splits into branches',
      'The longest wire on the board',
      'The branch with the brightest bulb',
      'The line printed on the battery',
    ],
    answer: 0,
    explanation:
      'Before the first junction, all the current travels together on the main line. A switch placed there controls everything.',
  },
  {
    id: 'elec-u3-b4',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Branch switch',
    difficulty: 2,
    question:
      'A switch sits inside Bulb A’s branch of a parallel circuit. You open the switch. What happens?',
    options: [
      'Bulb A goes dark; the other branches keep glowing',
      'Every bulb goes dark',
      'Every bulb gets brighter',
      'Nothing happens at all',
    ],
    answer: 0,
    explanation:
      'A branch switch only interrupts its own branch. The other branches never touch it, so their loops stay closed.',
  },
  {
    id: 'elec-u3-b5',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Master switch',
    difficulty: 2,
    question: 'A master switch on the main line is OPEN. What happens to the three branches beyond it?',
    options: [
      'All three go dark — no current can reach any branch',
      'Only the nearest branch goes dark',
      'The branches take turns lighting up',
      'The branches keep glowing on stored current',
    ],
    answer: 0,
    explanation:
      'Every branch’s current must pass through the main line. An open master switch stops all of it before it ever splits.',
  },
  {
    id: 'elec-u3-b6',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Switch placement',
    difficulty: 2,
    question: 'What is the electrician’s trick for figuring out what a switch will control?',
    options: [
      'Trace the current with your finger — whatever must pass through the switch is what it controls',
      'Check the color of the switch',
      'Count how many wires are on the board',
      'The switch always controls the closest bulb',
    ],
    answer: 0,
    explanation:
      'A switch controls everything whose current must pass through it — and nothing else. Tracing the path tells you which bulbs that is.',
  },
  {
    id: 'elec-u3-b7',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Real-world switches',
    difficulty: 2,
    question: 'What kind of switch is the breaker box in a house?',
    options: [
      'A master switch — it can shut off whole rooms at once',
      'A branch switch — it controls one lamp',
      'A short circuit',
      'A kind of battery',
    ],
    answer: 0,
    explanation:
      'The breaker box sits on the main lines of the house’s wiring, so one breaker controls every light and outlet on its circuit.',
  },
  {
    id: 'elec-u3-b8',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Switch placement',
    difficulty: 3,
    question:
      'A switch controls only Bulb A, but you want it to control BOTH bulbs of the parallel circuit. Where should you move it?',
    options: [
      'Out of Bulb A’s branch and onto the main line, before the branches split',
      'Into Bulb B’s branch instead',
      'Closer to Bulb A',
      'Next to the brightest bulb',
    ],
    answer: 0,
    explanation:
      'On the main line, both branches’ current must pass through the switch — that turns a branch switch into a master switch.',
  },
  {
    id: 'elec-u3-b9',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Contacts & lever',
    difficulty: 2,
    question:
      'You build a switch from a cardboard strip, two metal brads, and a paper clip. What closes the circuit?',
    options: [
      'Swinging the paper clip so it touches BOTH brads',
      'Pushing the brads deeper into the cardboard',
      'Painting the cardboard',
      'Adding a second paper clip anywhere',
    ],
    answer: 0,
    explanation:
      'The paper clip is the lever and the brads are the contacts. When the clip bridges both brads, the gap is closed and current flows.',
  },
  {
    id: 'elec-u3-b10',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Switch placement',
    difficulty: 3,
    question:
      'You wired what you meant to be a master switch, but flipping it only darkens ONE of the two bulbs. What went wrong?',
    options: [
      'Some current has a path around the switch — trace the wiring and close the sneaky route',
      'The switch is too small for two bulbs',
      'The second bulb is switch-proof',
      'The battery is too strong to switch off',
    ],
    answer: 0,
    explanation:
      'If a bulb ignores your switch, its current is NOT passing through the switch — there is another route. A true master switch must sit where every path crosses it.',
  },
  {
    id: 'elec-u3-b11',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Branch switch',
    difficulty: 1,
    question: 'A switch placed inside one branch of a parallel circuit is called a…',
    options: ['Branch switch', 'Master switch', 'Backup switch', 'Junction switch'],
    answer: 0,
    explanation: 'A branch switch lives inside one branch and rules only that branch — like a room’s wall switch.',
  },
  {
    id: 'elec-u3-b12',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Switch basics',
    difficulty: 2,
    question: 'How does a switch actually work?',
    options: [
      'Its lever moves to bridge the contacts or lift away from them',
      'It heats the wire until current can pass',
      'It changes the wire into an insulator forever',
      'It adds extra voltage to the circuit',
    ],
    answer: 0,
    explanation:
      'Lever down: the contacts are bridged and the circuit is closed. Lever up: there is a gap and the circuit is open. That is the whole machine.',
  },
  {
    id: 'elec-u3-b13',
    lab: 'electronics-lab',
    unitIdx: 3,
    topic: 'Real-world switches',
    difficulty: 3,
    question:
      'Flipping the hallway wall switch darkens only the hallway. Flipping a breaker darkens the hallway AND the kitchen. What kinds of switches are these?',
    options: [
      'The wall switch is a branch switch; the breaker is a master switch',
      'The wall switch is a master switch; the breaker is a branch switch',
      'Both are branch switches',
      'Both are master switches',
    ],
    answer: 0,
    explanation:
      'The wall switch sits inside the hallway light’s own branch. The breaker sits on the main line feeding several rooms — every branch beyond it obeys.',
  },
];

// ── Unit 5 (unitIdx 4) — Circuit Detective: bank-only questions ──────────────
const UNIT5_BANK: BankQuestion[] = [
  {
    id: 'elec-u4-b0',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Using the tester',
    difficulty: 1,
    question: 'The meter screen shows "OL." What does that mean?',
    options: [
      'Open loop — the path between the probes is broken somewhere',
      'Overly loud — the beep is too strong',
      'On line — the circuit is working',
      'Old — the battery needs replacing',
    ],
    answer: 0,
    explanation:
      'OL means open loop: the tester’s signal could not get from one probe to the other, so there is a break between them.',
  },
  {
    id: 'elec-u4-b1',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Using the tester',
    difficulty: 1,
    question: 'What are the probes of a continuity tester?',
    options: [
      'Its two metal tips that you touch to the circuit',
      'The buttons that change its settings',
      'The wires inside the meter',
      'The stickers on its case',
    ],
    answer: 0,
    explanation:
      'You touch the two probes to two points in the circuit. Beep = unbroken path between them; OL = a break between them.',
  },
  {
    id: 'elec-u4-b2',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Continuity basics',
    difficulty: 2,
    question: 'The tester BEEPS when you probe across a working bulb. Why?',
    options: [
      'A working bulb has a thin, unbroken filament wire inside',
      'The bulb still has light stored in it',
      'Glass is a conductor',
      'The tester is broken',
    ],
    answer: 0,
    explanation:
      'The filament is a tiny wire — an unbroken path. That is why testers beep through good bulbs and stay silent on burned-out ones.',
  },
  {
    id: 'elec-u4-b3',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Continuity basics',
    difficulty: 2,
    question: 'You probe across a burned-out bulb. What does the tester do, and why?',
    options: [
      'Stays silent — the filament inside is broken, so there is no path',
      'Beeps — glass always conducts',
      'Beeps twice as loud as normal',
      'Shows the bulb’s age on the screen',
    ],
    answer: 0,
    explanation:
      'Burned out means the filament snapped. No unbroken path, no continuity, no beep.',
  },
  {
    id: 'elec-u4-b4',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Testing rules',
    difficulty: 2,
    question: 'When should you use a continuity tester on a circuit?',
    options: [
      'With the power OFF — the tester sends its own tiny signal',
      'Only while the circuit is running at full power',
      'Only outdoors',
      'Only on circuits with two batteries',
    ],
    answer: 0,
    explanation:
      'Real electricians test continuity on unpowered circuits. The tester supplies its own tiny signal — and it never beeps through a battery.',
  },
  {
    id: 'elec-u4-b5',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Faults',
    difficulty: 2,
    question: 'Why can’t you find a broken wire just by looking at it?',
    options: [
      'The break hides inside — a broken wire looks exactly like a working one',
      'Wires are too small to see at all',
      'Looking at wires is against the safety rules',
      'Broken wires turn invisible',
    ],
    answer: 0,
    explanation:
      'Electrical faults are invisible from the outside. That is the whole reason electricians test instead of look.',
  },
  {
    id: 'elec-u4-b6',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Troubleshooting method',
    difficulty: 1,
    question: 'What does troubleshooting mean?',
    options: [
      'Finding a fault step by step instead of guessing',
      'Replacing every part until something works',
      'Shaking the circuit to fix it',
      'Turning the power off and on again',
    ],
    answer: 0,
    explanation:
      'Troubleshooting is a method: each test narrows down where the fault can be, until only one suspect is left.',
  },
  {
    id: 'elec-u4-b7',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Troubleshooting method',
    difficulty: 3,
    question: 'A long chain of parts has one hidden fault. Where should your FIRST probe test be?',
    options: [
      'Across one half of the chain — one test rules out half the parts',
      'Across the first part in the chain',
      'Across the last part in the chain',
      'Across every part, one at a time, from the start',
    ],
    answer: 0,
    explanation:
      'Think in halves! If the tested half beeps, the fault is in the other half. Every probe cuts your search area in half.',
  },
  {
    id: 'elec-u4-b8',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Using the tester',
    difficulty: 2,
    question: 'How do you PROVE that one particular part is the fault?',
    options: [
      'Probe straight across that one part — OL right across it condemns it',
      'Stare at it very closely',
      'Remove it and see if the circuit looks different',
      'Probe the two ends of the battery',
    ],
    answer: 0,
    explanation:
      'OL straight across a single part means the break is inside THAT part. That is how a detective catches the culprit.',
  },
  {
    id: 'elec-u4-b9',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Faults',
    difficulty: 3,
    question: 'A switch LOOKS closed, but the circuit is still dead. Could the switch be the fault?',
    options: [
      'Yes — a switch can be broken inside its contacts; test it like everything else',
      'No — a closed switch always works',
      'No — switches never break',
      'Only if the switch is upside down',
    ],
    answer: 0,
    explanation:
      'Contacts can corrode or snap inside where you cannot see. Never trust a part just because it looks right — test it.',
  },
  {
    id: 'elec-u4-b10',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Continuity basics',
    difficulty: 2,
    question: 'The tester will BEEP through which of these?',
    options: ['A closed switch', 'An open switch', 'A rubber band', 'A plastic ruler'],
    answer: 0,
    explanation:
      'A closed switch bridges its contacts — an unbroken metal path. Open switches have a gap, and rubber and plastic are insulators.',
  },
  {
    id: 'elec-u4-b11',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Troubleshooting method',
    difficulty: 3,
    question:
      'A dark string of lights: the tester is SILENT across the first half and BEEPS across the second half. Where is the fault?',
    options: [
      'Somewhere in the first half',
      'Somewhere in the second half',
      'In both halves',
      'There is no fault',
    ],
    answer: 0,
    explanation:
      'The half that beeps is healthy. The silent half hides the break — split that half and probe again to keep narrowing.',
  },
  {
    id: 'elec-u4-b12',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Using the tester',
    difficulty: 2,
    question: 'Your class has no multimeter. What can you build to test continuity instead?',
    options: [
      'A test lamp: battery + bulb + two foil leads — if the bulb lights across an object, there is continuity',
      'A paper tester: wrap the object in paper and listen',
      'A water tester: dip the object in a glass of water',
      'Nothing — only a multimeter can test continuity',
    ],
    answer: 0,
    explanation:
      'A battery-and-bulb test lamp works the same way: if current can cross the object and light the bulb, the path is unbroken.',
  },
  {
    id: 'elec-u4-b13',
    lab: 'electronics-lab',
    unitIdx: 4,
    topic: 'Troubleshooting method',
    difficulty: 2,
    question:
      'Using the think-in-halves method, about how many tests does it take to find one fault in a long string of parts?',
    options: [
      'Only two or three — every probe cuts the search area in half',
      'One test for every single part',
      'At least twenty',
      'Zero — you can spot the fault by eye',
    ],
    answer: 0,
    explanation:
      'Halving is powerful: each test eliminates half the remaining suspects, so even a long chain gives up its fault in just a few probes.',
  },
];

// ── Unit 6 (unitIdx 5) — Ohm's Law & Meters: bank-only questions ─────────────
const UNIT6_BANK: BankQuestion[] = [
  {
    id: 'elec-u5-b0',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Resistance basics',
    difficulty: 1,
    question: 'What is a resistor?',
    options: [
      'A component built to add an exact amount of resistance',
      'A stronger kind of battery',
      'A meter that measures current',
      'A wire with no resistance at all',
    ],
    answer: 0,
    explanation:
      'A resistor’s whole job is push-back: it adds a precise, known amount of resistance to the path.',
  },
  {
    id: 'elec-u5-b1',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Units & meters',
    difficulty: 1,
    question: 'What does the ammeter measure?',
    options: ['Current — the flow, in amps', 'Voltage — the push', 'Resistance — the push-back', 'Temperature'],
    answer: 0,
    explanation: 'Ammeter = amps = current. Its partner the voltmeter measures the push (volts).',
  },
  {
    id: 'elec-u5-b2',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: "Ohm's Law",
    difficulty: 2,
    question: 'You turn the voltage UP but keep the same resistor. What happens to the current?',
    options: [
      'It goes up — more push means more flow',
      'It goes down',
      'It stays exactly the same',
      'It reverses direction',
    ],
    answer: 0,
    explanation: 'I = V ÷ R. With R fixed, raising V raises I — that is why more voltage means brighter bulbs.',
  },
  {
    id: 'elec-u5-b3',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: "Ohm's Law",
    difficulty: 2,
    question: 'You swap in a BIGGER resistor but keep the same voltage. What happens to the current?',
    options: [
      'It goes down — more push-back means less flow',
      'It goes up',
      'It stays exactly the same',
      'It doubles',
    ],
    answer: 0,
    explanation: 'I = V ÷ R. With V fixed, raising R lowers I — more resistance chokes the flow.',
  },
  {
    id: 'elec-u5-b4',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Circuit math',
    difficulty: 2,
    question: 'A 3 V battery is connected to a 6 Ω resistor. How much current flows?',
    options: ['0.5 A', '2 A', '18 A', '3 A'],
    answer: 0,
    explanation: 'I = V ÷ R = 3 ÷ 6 = 0.5 A.',
  },
  {
    id: 'elec-u5-b5',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Circuit math',
    difficulty: 2,
    question: 'The ammeter reads 0.25 A through a 12 Ω resistor. What is the supply voltage?',
    options: ['3 V', '48 V', '0.02 V', '12 V'],
    answer: 0,
    explanation: 'V = I × R = 0.25 × 12 = 3 V.',
  },
  {
    id: 'elec-u5-b6',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Circuit math',
    difficulty: 2,
    question: 'The supply is 9 V and the ammeter reads 0.3 A. What is the resistance?',
    options: ['30 Ω', '2.7 Ω', '3 Ω', '27 Ω'],
    answer: 0,
    explanation: 'R = V ÷ I = 9 ÷ 0.3 = 30 Ω.',
  },
  {
    id: 'elec-u5-b7',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: "Ohm's Law",
    difficulty: 3,
    question: 'You know the current and the resistance. How do you find the voltage?',
    options: [
      'Multiply them: V = I × R',
      'Divide them: V = I ÷ R',
      'Add them: V = I + R',
      'You cannot find V from I and R',
    ],
    answer: 0,
    explanation:
      'Cover the V on the Ohm’s Law triangle and what remains is I × R. All three faces: I = V ÷ R, V = I × R, R = V ÷ I.',
  },
  {
    id: 'elec-u5-b8',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: "Ohm's Law",
    difficulty: 3,
    question: 'In Unit 2, bulbs got dimmer as you added more of them in series. How does Ohm’s Law explain that?',
    options: [
      'Each bulb adds resistance, so total R goes up — and I = V ÷ R means the current drops',
      'Each bulb adds voltage, so the battery gets tired',
      'The wires get longer, which reverses the current',
      'Ohm’s Law does not apply to bulbs',
    ],
    answer: 0,
    explanation:
      'Every bulb is resistance. A longer chain means a bigger total R, and with the same battery push, a smaller current — dimmer bulbs. The formula predicts what your eyes saw.',
  },
  {
    id: 'elec-u5-b9',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Resistance basics',
    difficulty: 2,
    question: 'More resistance in the path means…',
    options: [
      'Less current gets through',
      'More current gets through',
      'The voltage disappears',
      'The circuit becomes parallel',
    ],
    answer: 0,
    explanation: 'Resistance is push-back against the flow. The more of it in the path, the smaller the current.',
  },
  {
    id: 'elec-u5-b10',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Circuit math',
    difficulty: 3,
    question: 'A delicate motor needs exactly 0.75 A, and you picked an 8 Ω resistor. What voltage do you need?',
    options: ['6 V', '0.09 V', '8.75 V', '75 V'],
    answer: 0,
    explanation: 'V = I × R = 0.75 × 8 = 6 V. Engineers commit to the math before touching the dials.',
  },
  {
    id: 'elec-u5-b11',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Units & meters',
    difficulty: 2,
    question: 'What does an ampere measure?',
    options: [
      'How much charge flows past a point each second',
      'How hard the battery pushes',
      'How hot the resistor gets',
      'How long the circuit has been on',
    ],
    answer: 0,
    explanation:
      'Amps measure the flow itself — the amount of charge streaming past each second. That flow is the current.',
  },
  {
    id: 'elec-u5-b12',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Circuit math',
    difficulty: 3,
    question: 'Which voltage-and-resistance pair gives a current of 0.5 A?',
    options: ['3 V and 6 Ω', '6 V and 6 Ω', '3 V and 12 Ω', '9 V and 3 Ω'],
    answer: 0,
    explanation:
      '3 ÷ 6 = 0.5 A. The others give 1 A, 0.25 A, and 3 A. Any pair where V ÷ R = 0.5 hits the target — that is the whole law.',
  },
  {
    id: 'elec-u5-b13',
    lab: 'electronics-lab',
    unitIdx: 5,
    topic: 'Circuit math',
    difficulty: 3,
    question: 'A motor must draw exactly 0.5 A from a 9 V supply. Which resistor should the engineer choose?',
    options: ['18 Ω', '4.5 Ω', '9.5 Ω', '45 Ω'],
    answer: 0,
    explanation:
      'R = V ÷ I = 9 ÷ 0.5 = 18 Ω. This is the exact calculation engineers run every time they pick a resistor to protect a part.',
  },
];

// ── Unit 7 (unitIdx 6) — Breadboard Bootcamp: bank-only questions ────────────
const UNIT7_BANK: BankQuestion[] = [
  {
    id: 'elec-u6-b0',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Jumpers & rails',
    difficulty: 1,
    question: 'What is a jumper?',
    options: [
      'A short wire that connects ONLY at its two ends, hopping between holes',
      'A spring that pops parts off the board',
      'A wire that connects everything it crosses',
      'The plastic case of the breadboard',
    ],
    answer: 0,
    explanation:
      'A jumper arcs safely over everything in between — unlike the bare wires from earlier units, it touches nothing except its two ends.',
  },
  {
    id: 'elec-u6-b1',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Breadboard wiring',
    difficulty: 2,
    question: 'Two part legs are pushed into DIFFERENT columns of the breadboard. Are they connected?',
    options: [
      'No — you must add a part or a jumper to bridge them',
      'Yes — all holes are connected to each other',
      'Only on rainy days',
      'Only if the legs are the same length',
    ],
    answer: 0,
    explanation:
      'Each column has its own terminal strip. Different columns are strangers until YOU connect them with a part or a jumper.',
  },
  {
    id: 'elec-u6-b2',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'LED & polarity',
    difficulty: 1,
    question: 'What does LED stand for?',
    options: ['Light-emitting diode', 'Long electric wire', 'Low energy dial', 'Light every day'],
    answer: 0,
    explanation:
      'A diode is a one-way street for current — an LED is a diode that lights up when current flows through it the right way.',
  },
  {
    id: 'elec-u6-b3',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'LED & polarity',
    difficulty: 1,
    question: 'Which leg of an LED is the + leg?',
    options: ['The long leg', 'The short leg', 'Both legs are +', 'The leg closest to the resistor'],
    answer: 0,
    explanation: 'Current must enter through the LED’s + leg — the long one. The flat side marks the − leg.',
  },
  {
    id: 'elec-u6-b4',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Jumpers & rails',
    difficulty: 1,
    question: 'On a breadboard’s power rails, what do the red and blue stripes mean?',
    options: ['Red is +, blue is −', 'Red is −, blue is +', 'Red is for LEDs, blue is for bulbs', 'They are just decoration'],
    answer: 0,
    explanation: 'Red rail carries +, blue rail carries −, along the whole edge of the board.',
  },
  {
    id: 'elec-u6-b5',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Breadboard wiring',
    difficulty: 2,
    question: 'Are two holes at OPPOSITE ends of the + power rail connected?',
    options: [
      'Yes — the whole rail is one long strip',
      'No — rails only connect neighboring holes',
      'Only when a jumper joins them',
      'Only when the battery is removed',
    ],
    answer: 0,
    explanation:
      'A power rail runs the whole edge as one connected strip, so every column can reach power with a single jumper.',
  },
  {
    id: 'elec-u6-b6',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'LED safety',
    difficulty: 3,
    question:
      'You add a jumper straight from the + rail to the LED’s column, letting current skip the resistor. What happens?',
    options: [
      'The LED gulps far too much current and burns out',
      'The LED shines twice as bright, safely',
      'The LED changes color',
      'Nothing — LEDs control their own current',
    ],
    answer: 0,
    explanation:
      'An LED has no self-control. Without its resistor bodyguard limiting the current, it takes far too much and burns out. 💥',
  },
  {
    id: 'elec-u6-b7',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'LED safety',
    difficulty: 2,
    question: 'What is the correct, safe path for the First Light circuit?',
    options: [
      '+ rail → resistor → LED → − rail',
      '+ rail → LED → − rail, no resistor needed',
      '− rail → LED → − rail',
      'Battery straight to the LED with two jumpers',
    ],
    answer: 0,
    explanation:
      'The resistor sits in the LED’s path so it can limit the current before it reaches the LED. Power, protection, light, return.',
  },
  {
    id: 'elec-u6-b8',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Breadboard wiring',
    difficulty: 2,
    question:
      'You probe two holes in the SAME column with a continuity tester. What happens, and why?',
    options: [
      'BEEP — the hidden terminal strip connects them',
      'OL — holes are never connected',
      'BEEP — the plastic conducts',
      'Nothing — testers do not work on breadboards',
    ],
    answer: 0,
    explanation:
      'Same column = same terminal strip = continuity. That is the breadboard’s secret wiring, and your Unit 5 tester proves it.',
  },
  {
    id: 'elec-u6-b9',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'LED safety',
    difficulty: 3,
    question: 'The First Light circuit uses a 100 Ω resistor with the 3 V battery. What does that resistor do to the current?',
    options: [
      'Keeps it small and safe — about 0.03 A',
      'Boosts it up to 3 A',
      'Stops it completely',
      'Stores it for later',
    ],
    answer: 0,
    explanation:
      'I = V ÷ R ≈ 3 ÷ 110 ≈ 0.03 A — a tiny, safe current. That is Ohm’s Law from Unit 6 doing a real job as the LED’s bodyguard.',
  },
  {
    id: 'elec-u6-b10',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Schematic to board',
    difficulty: 2,
    question: 'In the graduation challenge, what does "building from a schematic" mean?',
    options: [
      'Reading the symbol diagram and placing real parts to match its loop',
      'Copying another student’s board',
      'Drawing a picture of the finished circuit',
      'Letting the checker place the parts for you',
    ],
    answer: 0,
    explanation:
      'Engineers turn schematics into real circuits every day: follow the loop symbol by symbol and recreate it with real parts.',
  },
  {
    id: 'elec-u6-b11',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Schematic to board',
    difficulty: 2,
    question: 'When you place a part like a resistor on the breadboard, its two legs must go into…',
    options: [
      'Two DIFFERENT columns',
      'The same column',
      'The same hole',
      'The two power rails only',
    ],
    answer: 0,
    explanation:
      'Legs in the same column are shorted together by the terminal strip — the part would do nothing. Bridging two columns puts the part into the path.',
  },
  {
    id: 'elec-u6-b12',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'LED & polarity',
    difficulty: 3,
    question:
      'Your LED circuit is wired correctly with its resistor, but the LED stays dark. What should you check FIRST?',
    options: [
      'The LED’s polarity — flip it so current enters its + leg',
      'Whether the breadboard is plugged into the wall',
      'Whether the resistor is the right color',
      'Whether the board is upside down',
    ],
    answer: 0,
    explanation:
      'A backwards LED simply blocks — no light, no harm. Flipping it so current enters the long + leg is the first fix to try.',
  },
  {
    id: 'elec-u6-b13',
    lab: 'electronics-lab',
    unitIdx: 6,
    topic: 'Schematic to board',
    difficulty: 3,
    question: 'The graduation circuit uses skills from three earlier units. Which list is right?',
    options: [
      'Continuity testing to explore the board, Ohm’s Law to protect the LED, schematics to read the plan',
      'Short circuits to speed up the current, insulators to slow it down',
      'Parallel wiring to make the LED brighter, a master switch to charge the battery',
      'None — the breadboard replaces everything you learned before',
    ],
    answer: 0,
    explanation:
      'The bootcamp is the capstone: Unit 5’s tester reveals the hidden strips, Unit 6’s law sizes the resistor, and Unit 2’s schematic language gives you the plan to build from.',
  },
];

export const ELECTRONICS_BANK: BankQuestion[] = [
  ...absorbed,
  ...UNIT1_BANK,
  ...UNIT2_BANK,
  ...UNIT3_BANK,
  ...UNIT4_BANK,
  ...UNIT5_BANK,
  ...UNIT6_BANK,
  ...UNIT7_BANK,
];
