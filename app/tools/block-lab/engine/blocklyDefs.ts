import * as Blockly from 'blockly';
import { ScriptNode } from './runtime';
import { BLOCK_MAP, BlockDef } from './blocks';

// ─── Block JSON definitions ───────────────────────────────────────────────────

const BLOCKLY_JSON_DEFS = [
  {
    type: 'move_forward',
    message0: 'Move Forward',
    previousStatement: null,
    nextStatement: null,
    colour: '#2563EB',
    tooltip: 'Move STEM Bot one cell forward',
  },
  {
    type: 'turn_left',
    message0: 'Turn Left',
    previousStatement: null,
    nextStatement: null,
    colour: '#2563EB',
    tooltip: 'Rotate 90° counter-clockwise',
  },
  {
    type: 'turn_right',
    message0: 'Turn Right',
    previousStatement: null,
    nextStatement: null,
    colour: '#2563EB',
    tooltip: 'Rotate 90° clockwise',
  },
  {
    type: 'repeat',
    message0: 'Repeat %1 times',
    args0: [{ type: 'field_number', name: 'TIMES', value: 3, min: 1, max: 20, precision: 1 }],
    message1: 'do %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#D97706',
    tooltip: 'Repeat the blocks inside N times',
  },
  {
    type: 'while_path_ahead',
    message0: 'While path ahead',
    message1: 'do %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#D97706',
    tooltip: 'Keep repeating while the cell ahead is open',
  },
  {
    type: 'while_not_at_goal',
    message0: 'While not at goal',
    message1: 'do %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#D97706',
    tooltip: 'Keep repeating until STEM Bot reaches the goal',
  },
  {
    type: 'if_path_ahead',
    message0: 'If path ahead',
    message1: 'do %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#7C3AED',
    tooltip: 'Run once if the cell ahead is open',
  },
  {
    type: 'if_path_left',
    message0: 'If path left',
    message1: 'do %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#7C3AED',
    tooltip: 'Run once if the cell to the left is open',
  },
  {
    type: 'if_path_right',
    message0: 'If path right',
    message1: 'do %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#7C3AED',
    tooltip: 'Run once if the cell to the right is open',
  },
];

let defsRegistered = false;
export function registerBlockDefs() {
  if (defsRegistered) return;
  Blockly.defineBlocksWithJsonArray(BLOCKLY_JSON_DEFS);
  defsRegistered = true;
}

// ─── Toolbox builder ──────────────────────────────────────────────────────────

export function buildToolbox(availableBlocks: BlockDef[]) {
  const motion = availableBlocks.filter(b => b.category === 'motion');
  const loops = availableBlocks.filter(b => b.category === 'control' && (b.id === 'repeat' || b.id.startsWith('while')));
  const conditionals = availableBlocks.filter(b => b.category === 'control' && b.id.startsWith('if'));

  const contents: object[] = [];

  if (motion.length > 0) {
    contents.push({
      kind: 'category', name: 'Motion', colour: '#2563EB',
      contents: motion.map(b => ({ kind: 'block', type: b.id })),
    });
  }

  if (loops.length > 0) {
    contents.push({
      kind: 'category', name: 'Loops', colour: '#D97706',
      contents: loops.map(b =>
        b.id === 'repeat'
          ? { kind: 'block', type: 'repeat', fields: { TIMES: 3 } }
          : { kind: 'block', type: b.id }
      ),
    });
  }

  if (conditionals.length > 0) {
    contents.push({
      kind: 'category', name: 'Conditions', colour: '#7C3AED',
      contents: conditionals.map(b => ({ kind: 'block', type: b.id })),
    });
  }

  return { kind: 'categoryToolbox', contents };
}

// ─── Workspace → ScriptNode[] ─────────────────────────────────────────────────

function blockToNode(block: Blockly.Block): ScriptNode {
  const blockId = block.type;
  const params: Record<string, number | string> = {};
  const children: ScriptNode[] = [];

  if (blockId === 'repeat') {
    const raw = block.getFieldValue('TIMES');
    params.times = Math.max(1, Math.min(20, Number(raw) || 3));
  }

  const bodyBlock = block.getInputTargetBlock('BODY');
  if (bodyBlock) {
    children.push(...seqToNodes(bodyBlock));
  }

  const hasBody = BLOCK_MAP[blockId]?.hasBody ?? false;
  return {
    id: block.id,
    blockId,
    params,
    children: hasBody ? children : undefined,
  };
}

function seqToNodes(block: Blockly.Block): ScriptNode[] {
  const nodes: ScriptNode[] = [blockToNode(block)];
  const next = block.getNextBlock();
  if (next) nodes.push(...seqToNodes(next));
  return nodes;
}

export function workspaceToScript(workspace: Blockly.WorkspaceSvg): ScriptNode[] {
  const topBlocks = workspace.getTopBlocks(true);
  return topBlocks.flatMap(block => seqToNodes(block));
}
