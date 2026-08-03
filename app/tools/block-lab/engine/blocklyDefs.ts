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
    type: 'collect',
    message0: 'Collect ✦',
    previousStatement: null,
    nextStatement: null,
    colour: '#0D9488',
    tooltip: 'Pick up the item on the square STEM Bot is standing on (does nothing on an empty square)',
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
  {
    type: 'if_on_item',
    message0: 'If on a crystal ✦',
    message1: 'do %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    previousStatement: null,
    nextStatement: null,
    colour: '#7C3AED',
    tooltip: 'Run once if STEM Bot is standing on an uncollected crystal',
  },
  {
    // No prev/next connectors: a definition stands alone on the workspace,
    // it never runs where it sits — only "Do Trick" performs it
    type: 'define_trick',
    message0: '🎓 Teach Trick %1',
    args0: [{
      type: 'field_dropdown', name: 'NAME',
      options: [['⭐ 1', '1'], ['🌟 2', '2'], ['✨ 3', '3']],
    }],
    message1: 'how: %1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    colour: '#DB2777',
    tooltip: 'Teach STEM Bot a trick — a set of blocks with a name. Teaching does nothing by itself; use "Do Trick" to perform it.',
  },
  {
    type: 'do_trick',
    message0: 'Do Trick %1',
    args0: [{
      type: 'field_dropdown', name: 'NAME',
      options: [['⭐ 1', '1'], ['🌟 2', '2'], ['✨ 3', '3']],
    }],
    previousStatement: null,
    nextStatement: null,
    colour: '#DB2777',
    tooltip: 'Perform a taught trick. Counts as ONE block no matter how big the trick is!',
  },
];

let defsRegistered = false;
export function registerBlockDefs() {
  if (defsRegistered) return;
  Blockly.defineBlocksWithJsonArray(BLOCKLY_JSON_DEFS);
  defsRegistered = true;
}

// ─── Dark workspace theme (matches the Block Lab card UI) ────────────────────

let darkTheme: Blockly.Theme | null = null;
export function getDarkTheme(): Blockly.Theme {
  if (!darkTheme) {
    darkTheme = Blockly.Theme.defineTheme('stembuilder-dark', {
      name: 'stembuilder-dark',
      base: Blockly.Themes.Classic,
      componentStyles: {
        workspaceBackgroundColour: '#0f1a30',
        toolboxBackgroundColour: '#0c1526',
        toolboxForegroundColour: '#cbd5e1',
        flyoutBackgroundColour: '#111d36',
        flyoutForegroundColour: '#cbd5e1',
        flyoutOpacity: 1,
        scrollbarColour: '#33415c',
        scrollbarOpacity: 0.55,
        insertionMarkerColour: '#93c5fd',
        insertionMarkerOpacity: 0.4,
        markerColour: '#93c5fd',
        cursorColour: '#93c5fd',
      },
      fontStyle: { weight: 'bold', size: 11 },
    });
  }
  return darkTheme;
}

// ─── Toolbox builder ──────────────────────────────────────────────────────────

export function buildToolbox(availableBlocks: BlockDef[]) {
  const motion = availableBlocks.filter(b => b.category === 'motion');
  const actions = availableBlocks.filter(b => b.category === 'action');
  const loops = availableBlocks.filter(b => b.category === 'control' && (b.id === 'repeat' || b.id.startsWith('while')));
  const conditionals = availableBlocks.filter(b => b.category === 'control' && b.id.startsWith('if'));

  const contents: object[] = [];

  if (motion.length > 0) {
    contents.push({ kind: 'label', text: '— Motion —' });
    contents.push(...motion.map(b => ({ kind: 'block', type: b.id })));
  }

  if (actions.length > 0) {
    contents.push({ kind: 'sep' });
    contents.push({ kind: 'label', text: '— Actions —' });
    contents.push(...actions.map(b => ({ kind: 'block', type: b.id })));
  }

  if (loops.length > 0) {
    contents.push({ kind: 'sep' });
    contents.push({ kind: 'label', text: '— Loops —' });
    contents.push(...loops.map(b =>
      b.id === 'repeat'
        ? { kind: 'block', type: 'repeat', fields: { TIMES: 3 } }
        : { kind: 'block', type: b.id }
    ));
  }

  if (conditionals.length > 0) {
    contents.push({ kind: 'sep' });
    contents.push({ kind: 'label', text: '— Conditions —' });
    contents.push(...conditionals.map(b => ({ kind: 'block', type: b.id })));
  }

  const tricks = availableBlocks.filter(b => b.category === 'trick');
  if (tricks.length > 0) {
    contents.push({ kind: 'sep' });
    contents.push({ kind: 'label', text: '— Tricks —' });
    contents.push(...tricks.map(b => ({ kind: 'block', type: b.id })));
  }

  // flyoutToolbox: all blocks always visible — no clicking to expand categories
  return { kind: 'flyoutToolbox', contents };
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
  if (blockId === 'define_trick' || blockId === 'do_trick') {
    params.trick = String(block.getFieldValue('NAME') ?? '1');
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
  const script = topBlocks.flatMap(block => seqToNodes(block));

  // Tricks: collect the taught definitions, then embed each definition's body
  // as the children of every "Do Trick" call. The runtime skips definitions
  // and performs a call's children — and countBlocks counts a call as 1, so
  // reusing a trick costs one block, exactly like calling a function.
  const defs: Record<string, ScriptNode[]> = {};
  for (const node of script) {
    if (node.blockId === 'define_trick') defs[String(node.params.trick ?? '1')] = node.children ?? [];
  }
  if (Object.keys(defs).length === 0 && !script.some(n => n.blockId === 'do_trick')) return script;

  const expand = (nodes: ScriptNode[], depth: number): ScriptNode[] =>
    nodes.map(n => {
      if (n.blockId === 'do_trick') {
        // Depth cap: a trick that performs itself (or a cycle) stops quietly
        const body = depth < 3 ? (defs[String(n.params.trick ?? '1')] ?? []) : [];
        return { ...n, children: expand(body, depth + 1) };
      }
      if (n.children) return { ...n, children: expand(n.children, depth) };
      return n;
    });
  return expand(script, 0);
}
