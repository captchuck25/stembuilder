export type BlockCategory = 'motion' | 'control';

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
  {
    id: 'repeat',
    label: 'Repeat',
    category: 'control',
    color: '#D97706',
    hasBody: true,
    params: [{ key: 'times', type: 'number', default: 3, min: 1, max: 20, label: 'times' }],
    unlockLevel: 4,
  },
  { id: 'while_path_ahead',  label: 'While path ahead',  category: 'control', color: '#D97706', hasBody: true, unlockLevel: 8 },
  { id: 'while_not_at_goal', label: 'While not at goal', category: 'control', color: '#D97706', hasBody: true, unlockLevel: 8 },
  { id: 'if_path_ahead',     label: 'If path ahead',     category: 'control', color: '#7C3AED', hasBody: true, unlockLevel: 8 },
  { id: 'if_path_left',      label: 'If path left',      category: 'control', color: '#7C3AED', hasBody: true, unlockLevel: 8 },
  { id: 'if_path_right',     label: 'If path right',     category: 'control', color: '#7C3AED', hasBody: true, unlockLevel: 8 },
];

export const BLOCK_MAP = Object.fromEntries(BLOCK_DEFS.map(b => [b.id, b]));

export function blocksForLevel(levelIdx: number): BlockDef[] {
  return BLOCK_DEFS.filter(b => b.unlockLevel <= levelIdx);
}
