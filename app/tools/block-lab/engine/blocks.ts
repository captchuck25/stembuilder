export type BlockCategory = 'motion' | 'action' | 'control' | 'trick';

export interface BlockParam {
  key: string;
  type: 'number';
  default: number;
  min: number;
  max: number;
  label: string;
}

export interface BlockDef {
  id: string;
  label: string;
  category: BlockCategory;
  color: string;
  params?: BlockParam[];
  hasBody?: boolean;
  unlockLevel: number;
}

export const BLOCK_DEFS: BlockDef[] = [
  { id: 'move_forward', label: 'Move Forward', category: 'motion', color: '#2563EB', unlockLevel: 0 },
  { id: 'turn_left',    label: 'Turn Left',    category: 'motion', color: '#2563EB', unlockLevel: 0 },
  { id: 'turn_right',   label: 'Turn Right',   category: 'motion', color: '#2563EB', unlockLevel: 0 },
  { id: 'collect',      label: 'Collect',      category: 'action', color: '#0D9488', unlockLevel: 0 },
  {
    id: 'repeat',
    label: 'Repeat',
    category: 'control',
    color: '#D97706',
    hasBody: true,
    params: [{ key: 'times', type: 'number', default: 3, min: 1, max: 20, label: 'times' }],
    unlockLevel: 4,
  },
  // Tier map (unit index × 4): sequence=0, loops=4, NESTED LOOPS=8 (repeat +
  // if_on_item only), while&sensors=12, functions=16. Units with per-challenge
  // blockIds override this; the tiers are the fallback.
  { id: 'while_path_ahead',  label: 'While path ahead',  category: 'control', color: '#D97706', hasBody: true, unlockLevel: 12 },
  { id: 'while_not_at_goal', label: 'While not at goal', category: 'control', color: '#D97706', hasBody: true, unlockLevel: 12 },
  { id: 'if_path_ahead',     label: 'If path ahead',     category: 'control', color: '#7C3AED', hasBody: true, unlockLevel: 12 },
  { id: 'if_path_left',      label: 'If path left',      category: 'control', color: '#7C3AED', hasBody: true, unlockLevel: 12 },
  { id: 'if_path_right',     label: 'If path right',     category: 'control', color: '#7C3AED', hasBody: true, unlockLevel: 12 },
  { id: 'if_on_item',        label: 'If on a crystal',   category: 'control', color: '#7C3AED', hasBody: true, unlockLevel: 8 },
  // Block type ids stay 'define_trick'/'do_trick' so saved student XML keeps
  // loading — only the student-facing labels use the real vocabulary
  { id: 'define_trick',      label: 'Define Function',   category: 'trick',   color: '#DB2777', hasBody: true, unlockLevel: 16 },
  { id: 'do_trick',          label: 'Call Function',     category: 'trick',   color: '#DB2777', unlockLevel: 16 },
];

export const BLOCK_MAP = Object.fromEntries(BLOCK_DEFS.map(b => [b.id, b]));

export function blocksForLevel(levelIdx: number): BlockDef[] {
  return BLOCK_DEFS.filter(b => b.unlockLevel <= levelIdx);
}
