// Arcade Lab Blockly blocks: event hats + action blocks, one script sheet per
// object type. compileScripts() turns the saved XML into CompiledRules that the
// physics engine executes — nothing in the game happens unless a block says so.

import * as Blockly from 'blockly';
import {
  ArcadeAction,
  ArcadeKey,
  ArcadeSound,
  CompiledRules,
  ScriptOwner,
  emptyRules,
} from './types';

const EVENT = '#EAB308';
const MOTION = '#2563EB';
const OBJECT = '#0D9488';
const SCORE = '#D97706';
const DANGER = '#EF4444';
const GAME = '#7C3AED';
const SOUND = '#EC4899';

const ARCADE_DEFS = [
  // ── Event hats ──
  {
    type: 'arcade_when_key',
    message0: 'when %1 key is pressed',
    args0: [{
      type: 'field_dropdown', name: 'KEY',
      options: [
        ['→ right', 'right'], ['← left', 'left'], ['↑ up', 'up'], ['space', 'space'],
        ['letter D', 'd'], ['letter A', 'a'], ['letter W', 'w'], ['letter S', 's'],
      ],
    }],
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs while this key is held down',
  },
  {
    type: 'arcade_when_touch_me',
    message0: 'when the player touches me',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs once each time the player touches this object',
  },
  {
    type: 'arcade_when_stomped',
    message0: 'when the player lands on my head',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs when the player falls onto this enemy from above',
  },
  {
    type: 'arcade_when_touch_side',
    message0: 'when the player runs into me',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs when the player touches this enemy from the side',
  },
  {
    type: 'arcade_when_game_starts',
    message0: 'when the game starts',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs once at the very beginning',
  },
  {
    type: 'arcade_when_score',
    message0: 'when the score reaches %1',
    args0: [{ type: 'field_number', name: 'N', value: 5, min: 1, max: 99, precision: 1 }],
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs once when the score gets this high',
  },
  // ── Actions ──
  {
    type: 'arcade_move',
    message0: 'move %1',
    args0: [{ type: 'field_dropdown', name: 'DIR', options: [['→ right', 'right'], ['← left', 'left']] }],
    previousStatement: null, nextStatement: null, colour: MOTION,
    tooltip: 'Move the player sideways',
  },
  {
    type: 'arcade_jump',
    message0: 'jump',
    previousStatement: null, nextStatement: null, colour: MOTION,
    tooltip: 'Jump (only works while standing on ground)',
  },
  {
    type: 'arcade_bounce_player',
    message0: 'bounce the player up',
    previousStatement: null, nextStatement: null, colour: MOTION,
    tooltip: 'Give the player a little hop — great after a stomp',
  },
  {
    type: 'arcade_disappear',
    message0: 'disappear',
    previousStatement: null, nextStatement: null, colour: OBJECT,
    tooltip: 'Remove this object from the level',
  },
  {
    type: 'arcade_disappear_all',
    message0: 'make all %1 disappear',
    args0: [{
      type: 'field_dropdown', name: 'TARGET',
      options: [['🔺 spikes', 'spike'], ['👾 enemies', 'enemy'], ['🪙 crystals', 'coin']],
    }],
    previousStatement: null, nextStatement: null, colour: OBJECT,
    tooltip: 'Remove every object of that type from the level at once',
  },
  {
    type: 'arcade_change_score',
    message0: 'change score by %1',
    args0: [{ type: 'field_number', name: 'N', value: 1, min: -10, max: 10, precision: 1 }],
    previousStatement: null, nextStatement: null, colour: SCORE,
    tooltip: 'Add to the score (negative numbers subtract!)',
  },
  {
    type: 'arcade_set_score',
    message0: 'set score to %1',
    args0: [{ type: 'field_number', name: 'N', value: 0, min: 0, max: 99, precision: 1 }],
    previousStatement: null, nextStatement: null, colour: SCORE,
    tooltip: 'Set the score to an exact number',
  },
  {
    type: 'arcade_set_lives',
    message0: 'set lives to %1',
    args0: [{ type: 'field_number', name: 'N', value: 3, min: 1, max: 9, precision: 1 }],
    previousStatement: null, nextStatement: null, colour: GAME,
    tooltip: 'How many lives the player starts with',
  },
  {
    type: 'arcade_hurt_player',
    message0: 'hurt the player (lose a life)',
    previousStatement: null, nextStatement: null, colour: DANGER,
    tooltip: 'Costs a life and sends the player back to the start',
  },
  {
    type: 'arcade_win',
    message0: 'win the game 🏆',
    previousStatement: null, nextStatement: null, colour: '#22C55E',
    tooltip: 'The player wins!',
  },
  {
    type: 'arcade_game_over',
    message0: 'game over 💀',
    previousStatement: null, nextStatement: null, colour: DANGER,
    tooltip: 'The game ends immediately in a loss',
  },
  {
    type: 'arcade_play_sound',
    message0: 'play sound %1',
    args0: [{
      type: 'field_dropdown', name: 'SOUND',
      options: [['✨ chime', 'chime'], ['💥 pop', 'pop'], ['🥁 thud', 'thud'], ['⚡ zap', 'zap']],
    }],
    previousStatement: null, nextStatement: null, colour: SOUND,
    tooltip: 'Play a sound effect',
  },
];

let registered = false;
export function registerArcadeBlocks() {
  if (registered) return;
  Blockly.defineBlocksWithJsonArray(ARCADE_DEFS);
  registered = true;
}

// ── Toolboxes per script owner ────────────────────────────────────────────────

const TOOLBOX_BLOCKS: Record<ScriptOwner, string[]> = {
  player: ['arcade_when_key', 'arcade_move', 'arcade_jump', 'arcade_play_sound'],
  coin:   ['arcade_when_touch_me', 'arcade_disappear', 'arcade_change_score', 'arcade_disappear_all', 'arcade_play_sound'],
  spike:  ['arcade_when_touch_me', 'arcade_hurt_player', 'arcade_change_score', 'arcade_disappear', 'arcade_play_sound'],
  enemy:  ['arcade_when_stomped', 'arcade_when_touch_side', 'arcade_disappear', 'arcade_bounce_player', 'arcade_hurt_player', 'arcade_change_score', 'arcade_play_sound'],
  flag:   ['arcade_when_touch_me', 'arcade_win', 'arcade_change_score', 'arcade_disappear_all', 'arcade_play_sound'],
  game:   ['arcade_when_game_starts', 'arcade_when_score', 'arcade_disappear_all', 'arcade_set_lives', 'arcade_set_score', 'arcade_win', 'arcade_game_over', 'arcade_play_sound'],
};

export function buildArcadeToolbox(owner: ScriptOwner) {
  const types = TOOLBOX_BLOCKS[owner];
  const contents: object[] = [];
  const events = types.filter(t => t.startsWith('arcade_when'));
  const actions = types.filter(t => !t.startsWith('arcade_when'));
  contents.push({ kind: 'label', text: '— Events —' });
  contents.push(...events.map(t => ({ kind: 'block', type: t })));
  contents.push({ kind: 'sep' });
  contents.push({ kind: 'label', text: '— Actions —' });
  contents.push(...actions.map(t => ({ kind: 'block', type: t })));
  return { kind: 'flyoutToolbox', contents };
}

// ── Compiler: saved XML → CompiledRules ──────────────────────────────────────

function chainToActions(block: Blockly.Block | null): ArcadeAction[] {
  const actions: ArcadeAction[] = [];
  let b = block;
  while (b) {
    switch (b.type) {
      case 'arcade_move':
        actions.push({ kind: 'move', dir: b.getFieldValue('DIR') === 'left' ? 'left' : 'right' });
        break;
      case 'arcade_jump': actions.push({ kind: 'jump' }); break;
      case 'arcade_bounce_player': actions.push({ kind: 'bouncePlayer' }); break;
      case 'arcade_disappear': actions.push({ kind: 'disappear' }); break;
      case 'arcade_disappear_all':
        actions.push({ kind: 'disappearAll', target: (b.getFieldValue('TARGET') ?? 'spike') as 'spike' | 'enemy' | 'coin' });
        break;
      case 'arcade_change_score': actions.push({ kind: 'changeScore', n: Number(b.getFieldValue('N')) || 0 }); break;
      case 'arcade_set_score': actions.push({ kind: 'setScore', n: Number(b.getFieldValue('N')) || 0 }); break;
      case 'arcade_set_lives': actions.push({ kind: 'setLives', n: Number(b.getFieldValue('N')) || 3 }); break;
      case 'arcade_hurt_player': actions.push({ kind: 'hurtPlayer' }); break;
      case 'arcade_win': actions.push({ kind: 'win' }); break;
      case 'arcade_game_over': actions.push({ kind: 'gameOver' }); break;
      case 'arcade_play_sound': actions.push({ kind: 'sound', name: (b.getFieldValue('SOUND') ?? 'chime') as ArcadeSound }); break;
    }
    b = b.getNextBlock();
  }
  return actions;
}

export function compileScripts(scripts: Partial<Record<ScriptOwner, string>>): CompiledRules {
  registerArcadeBlocks();
  const rules = emptyRules();

  for (const owner of Object.keys(scripts) as ScriptOwner[]) {
    const xml = scripts[owner];
    if (!xml) continue;
    const ws = new Blockly.Workspace();
    try {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xml), ws);
      for (const top of ws.getTopBlocks(false)) {
        const actions = chainToActions(top.getNextBlock());
        switch (top.type) {
          case 'arcade_when_key':
            if (owner === 'player') rules.keys.push({ key: top.getFieldValue('KEY') as ArcadeKey, actions });
            break;
          case 'arcade_when_touch_me':
            if (owner === 'coin') rules.touchCoin.push(actions);
            else if (owner === 'spike') rules.touchSpike.push(actions);
            else if (owner === 'flag') rules.touchFlag.push(actions);
            break;
          case 'arcade_when_stomped':
            if (owner === 'enemy') rules.enemyTop.push(actions);
            break;
          case 'arcade_when_touch_side':
            if (owner === 'enemy') rules.enemySide.push(actions);
            break;
          case 'arcade_when_game_starts':
            if (owner === 'game') rules.gameStart.push(actions);
            break;
          case 'arcade_when_score':
            if (owner === 'game') rules.scoreRules.push({ n: Number(top.getFieldValue('N')) || 1, actions });
            break;
        }
      }
    } catch {
      // Unparseable sheet — treat as empty rather than crashing the game
    } finally {
      ws.dispose();
    }
  }

  return rules;
}
