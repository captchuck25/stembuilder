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
    type: 'arcade_when_touch_me_score',
    message0: 'when the player touches me with at least %1 ✦',
    args0: [{ type: 'field_number', name: 'N', value: 5, min: 1, max: 99, precision: 1 }],
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs only if the player has collected enough points — otherwise the goal stays locked',
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
    type: 'arcade_when_landed',
    message0: 'when the player lands on me',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs when the player falls onto this object from above',
  },
  {
    type: 'arcade_when_kills',
    message0: 'when %1 enemies are defeated',
    args0: [{ type: 'field_number', name: 'N', value: 3, min: 1, max: 50, precision: 1 }],
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs once when that many enemies have been defeated',
  },
  {
    type: 'arcade_when_touch_me_kills',
    message0: 'when the player touches me after defeating %1 enemies',
    args0: [{ type: 'field_number', name: 'N', value: 3, min: 1, max: 50, precision: 1 }],
    nextStatement: null,
    colour: EVENT,
    tooltip: 'The goal stays locked until enough enemies have been defeated',
  },
  // ── Space Defender ──
  {
    type: 'arcade_when_blaster_hits',
    message0: 'when a blaster hits me',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs when one of the ship\'s blaster bolts hits this alien',
  },
  {
    type: 'arcade_when_reach_bottom',
    message0: 'when I reach the bottom',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs when this alien descends to the ship\'s row — the invasion moment',
  },
  {
    type: 'arcade_when_touch_ship',
    message0: 'when I touch the ship',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs when this alien collides with the player\'s ship',
  },
  {
    type: 'arcade_when_aliens_cleared',
    message0: 'when every alien is destroyed',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs once when the last alien is gone',
  },
  {
    type: 'arcade_fire',
    message0: 'fire the blaster 🔫',
    previousStatement: null, nextStatement: null, colour: MOTION,
    tooltip: 'Shoot a bolt straight up from the ship (short reload between shots)',
  },
  {
    type: 'arcade_when_bomb_hits',
    message0: 'when my bomb hits the ship 💣',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Bombers drop bombs on their own — this decides what a hit DOES',
  },
  {
    type: 'arcade_when_caught',
    message0: 'when the ship catches me',
    nextStatement: null,
    colour: EVENT,
    tooltip: 'Runs when the falling pickup lands on the player\'s ship',
  },
  {
    type: 'arcade_armor',
    message0: '🛡 I take %1 blaster hits',
    args0: [{
      type: 'field_dropdown', name: 'N',
      options: [['1', '1'], ['2', '2'], ['3', '3']],
    }],
    previousStatement: null, nextStatement: null,
    colour: '#64748B',
    tooltip: 'Armor plating — non-final blaster hits just make me flash',
  },
  {
    type: 'arcade_set_pace',
    message0: 'aliens march %1',
    args0: [{
      type: 'field_dropdown', name: 'PACE',
      options: [['🐢 slowly', 'slow'], ['normally', 'normal'], ['🔥 FAST', 'fast']],
    }],
    previousStatement: null, nextStatement: null, colour: GAME,
    tooltip: 'Set the armada\'s marching speed — at game start, or mid-game (try "when score reaches 10 → aliens march FAST")',
  },
  {
    type: 'arcade_shot_limit',
    message0: 'shot limit: %1 blasts 🔫',
    args0: [{
      type: 'field_dropdown', name: 'N',
      options: [['10', '10'], ['15', '15'], ['20', '20'], ['30', '30'], ['50', '50']],
    }],
    previousStatement: null, nextStatement: null, colour: GAME,
    tooltip: 'Snap under "when the game starts" — without this block, shots are unlimited. Add ⚡ pickups so players can restock!',
  },
  {
    type: 'arcade_damage',
    message0: '💔 damage the ship: %1',
    args0: [{
      type: 'field_dropdown', name: 'AMT',
      options: [['a full life', '1'], ['half a life', '0.5'], ['a quarter life', '0.25']],
    }],
    previousStatement: null, nextStatement: null, colour: DANGER,
    tooltip: 'Chip the ship\'s hearts — smaller damage keeps the battle going (no respawn, just a hit flash)',
  },
  {
    type: 'arcade_add_shots',
    message0: 'add %1 shots 🔫',
    args0: [{
      type: 'field_dropdown', name: 'N',
      options: [['3', '3'], ['5', '5'], ['10', '10']],
    }],
    previousStatement: null, nextStatement: null, colour: SCORE,
    tooltip: 'Give the ship more blaster shots (only matters when there\'s a shot limit)',
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
    type: 'arcade_launch',
    message0: 'launch the player 🌀 %1 jump power',
    args0: [{
      type: 'field_dropdown', name: 'STRENGTH',
      options: [['2×', '2'], ['3×', '3'], ['4×', '4']],
    }],
    previousStatement: null, nextStatement: null, colour: MOTION,
    tooltip: 'A SUPER bounce — 2×, 3×, or 4× as high as a normal jump',
  },
  {
    type: 'arcade_toughness',
    message0: '🛡 I take %1 stomps to squash',
    args0: [{
      type: 'field_dropdown', name: 'N',
      options: [['1', '1'], ['2', '2'], ['3', '3']],
    }],
    previousStatement: null, nextStatement: null,
    colour: '#64748B',
    tooltip: 'Snap under "when the game starts" — non-final stomps make me flinch and bounce the player off',
  },
  {
    type: 'arcade_require_score',
    message0: 'only if score is at least %1 ✦',
    args0: [{ type: 'field_number', name: 'N', value: 5, min: 1, max: 99, precision: 1 }],
    previousStatement: null, nextStatement: null, colour: '#A16207',
    tooltip: 'A guard: if the score is too low, the rest of this chain is skipped',
  },
  {
    type: 'arcade_require_kills',
    message0: 'only if at least %1 enemies defeated',
    args0: [{ type: 'field_number', name: 'N', value: 3, min: 1, max: 50, precision: 1 }],
    previousStatement: null, nextStatement: null, colour: '#A16207',
    tooltip: 'A guard: if not enough enemies are defeated, the rest of this chain is skipped',
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
      options: [['✨ chime', 'chime'], ['💥 pop', 'pop'], ['🥁 thud', 'thud'], ['⚡ zap', 'zap'], ['🌀 boing', 'boing']],
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

// Note: the old combo hats (arcade_when_touch_me_score / _kills) stay
// registered so saved games keep working, but they're out of the palette —
// students compose "when the player touches me" + "only if…" guards instead.
const TOOLBOX_BLOCKS: Record<ScriptOwner, string[]> = {
  player: ['arcade_when_key', 'arcade_move', 'arcade_jump', 'arcade_require_score', 'arcade_play_sound'],
  coin:   ['arcade_when_touch_me', 'arcade_disappear', 'arcade_change_score', 'arcade_require_score', 'arcade_require_kills', 'arcade_disappear_all', 'arcade_play_sound'],
  spike:  ['arcade_when_touch_me', 'arcade_hurt_player', 'arcade_change_score', 'arcade_require_score', 'arcade_require_kills', 'arcade_disappear', 'arcade_play_sound'],
  enemy:  ['arcade_when_stomped', 'arcade_when_touch_side', 'arcade_when_game_starts', 'arcade_toughness', 'arcade_disappear', 'arcade_bounce_player', 'arcade_launch', 'arcade_hurt_player', 'arcade_change_score', 'arcade_require_score', 'arcade_require_kills', 'arcade_play_sound'],
  spiky:  ['arcade_when_touch_me', 'arcade_hurt_player', 'arcade_disappear', 'arcade_launch', 'arcade_change_score', 'arcade_require_score', 'arcade_require_kills', 'arcade_play_sound'],
  flyer:  ['arcade_when_stomped', 'arcade_when_touch_side', 'arcade_when_game_starts', 'arcade_toughness', 'arcade_disappear', 'arcade_bounce_player', 'arcade_launch', 'arcade_hurt_player', 'arcade_change_score', 'arcade_require_score', 'arcade_require_kills', 'arcade_play_sound'],
  spring: ['arcade_when_landed', 'arcade_launch', 'arcade_bounce_player', 'arcade_change_score', 'arcade_require_score', 'arcade_require_kills', 'arcade_hurt_player', 'arcade_disappear', 'arcade_play_sound'],
  flag:   ['arcade_when_touch_me', 'arcade_require_score', 'arcade_require_kills', 'arcade_win', 'arcade_change_score', 'arcade_disappear_all', 'arcade_play_sound'],
  game:   ['arcade_when_game_starts', 'arcade_when_score', 'arcade_when_kills', 'arcade_disappear_all', 'arcade_set_lives', 'arcade_set_score', 'arcade_win', 'arcade_game_over', 'arcade_play_sound'],
  alien:  ['arcade_when_blaster_hits', 'arcade_when_reach_bottom', 'arcade_when_touch_ship', 'arcade_armor', 'arcade_disappear', 'arcade_change_score', 'arcade_damage', 'arcade_hurt_player', 'arcade_game_over', 'arcade_require_score', 'arcade_play_sound'],
  brute:  ['arcade_when_blaster_hits', 'arcade_when_reach_bottom', 'arcade_when_touch_ship', 'arcade_armor', 'arcade_disappear', 'arcade_change_score', 'arcade_damage', 'arcade_hurt_player', 'arcade_game_over', 'arcade_require_score', 'arcade_play_sound'],
  bomber: ['arcade_when_blaster_hits', 'arcade_when_bomb_hits', 'arcade_when_reach_bottom', 'arcade_when_touch_ship', 'arcade_armor', 'arcade_disappear', 'arcade_change_score', 'arcade_damage', 'arcade_hurt_player', 'arcade_game_over', 'arcade_require_score', 'arcade_play_sound'],
  ammo:   ['arcade_when_caught', 'arcade_add_shots', 'arcade_disappear', 'arcade_change_score', 'arcade_play_sound'],
};

// Defender-mode overrides: the ship's sheet gets fire; the Game sheet gets
// the every-alien-destroyed win hat plus pace + shot-limit dials
const DEFENDER_TOOLBOX: Partial<Record<ScriptOwner, string[]>> = {
  player: ['arcade_when_key', 'arcade_move', 'arcade_fire', 'arcade_require_score', 'arcade_play_sound'],
  game:   ['arcade_when_game_starts', 'arcade_when_aliens_cleared', 'arcade_when_score', 'arcade_when_kills', 'arcade_set_pace', 'arcade_shot_limit', 'arcade_set_lives', 'arcade_set_score', 'arcade_add_shots', 'arcade_win', 'arcade_game_over', 'arcade_play_sound'],
};

export function buildArcadeToolbox(owner: ScriptOwner, genre: 'platformer' | 'defender' = 'platformer') {
  const types = (genre === 'defender' && DEFENDER_TOOLBOX[owner]) || TOOLBOX_BLOCKS[owner];
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
      case 'arcade_launch': {
        const n = Number(b.getFieldValue('STRENGTH'));
        actions.push({ kind: 'launch', n: n >= 2 && n <= 4 ? n : 2 });
        break;
      }
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
      case 'arcade_require_score': actions.push({ kind: 'requireScore', n: Number(b.getFieldValue('N')) || 1 }); break;
      case 'arcade_require_kills': actions.push({ kind: 'requireKills', n: Number(b.getFieldValue('N')) || 1 }); break;
      case 'arcade_fire': actions.push({ kind: 'fire' }); break;
      case 'arcade_set_pace': actions.push({ kind: 'setPace', pace: (b.getFieldValue('PACE') as 'slow' | 'normal' | 'fast') || 'normal' }); break;
      case 'arcade_shot_limit': actions.push({ kind: 'setAmmo', n: Number(b.getFieldValue('N')) || 10 }); break;
      case 'arcade_add_shots': actions.push({ kind: 'addAmmo', n: Number(b.getFieldValue('N')) || 5 }); break;
      case 'arcade_damage': actions.push({ kind: 'damage', amt: Number(b.getFieldValue('AMT')) || 1 }); break;
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
            else if (owner === 'spiky') rules.spikyTouch.push(actions);
            break;
          case 'arcade_when_touch_me_score':
            if (owner === 'flag') rules.touchFlagScored.push({ n: Number(top.getFieldValue('N')) || 1, actions });
            break;
          case 'arcade_when_stomped':
            if (owner === 'enemy') rules.enemyTop.push(actions);
            else if (owner === 'flyer') rules.flyerTop.push(actions);
            break;
          case 'arcade_when_touch_side':
            if (owner === 'enemy') rules.enemySide.push(actions);
            else if (owner === 'flyer') rules.flyerSide.push(actions);
            break;
          case 'arcade_when_landed':
            if (owner === 'spring') rules.springLand.push(actions);
            break;
          case 'arcade_when_kills':
            if (owner === 'game') rules.killRules.push({ n: Number(top.getFieldValue('N')) || 1, actions });
            break;
          case 'arcade_when_blaster_hits':
            if (owner === 'alien') rules.alienHit.push(actions);
            else if (owner === 'brute') rules.bruteHit.push(actions);
            else if (owner === 'bomber') rules.bomberHit.push(actions);
            break;
          case 'arcade_when_reach_bottom':
            if (owner === 'alien') rules.alienBottom.push(actions);
            else if (owner === 'brute') rules.bruteBottom.push(actions);
            else if (owner === 'bomber') rules.bomberBottom.push(actions);
            break;
          case 'arcade_when_touch_ship':
            if (owner === 'alien') rules.alienShip.push(actions);
            else if (owner === 'brute') rules.bruteShip.push(actions);
            else if (owner === 'bomber') rules.bomberShip.push(actions);
            break;
          case 'arcade_when_bomb_hits':
            if (owner === 'bomber') rules.bombHit.push(actions);
            break;
          case 'arcade_when_caught':
            if (owner === 'ammo') rules.ammoCatch.push(actions);
            break;
          case 'arcade_when_aliens_cleared':
            if (owner === 'game') rules.aliensCleared.push(actions);
            break;
          case 'arcade_when_touch_me_kills':
            if (owner === 'flag') rules.touchFlagKills.push({ n: Number(top.getFieldValue('N')) || 1, actions });
            break;
          // (arcade_toughness is handled below via a whole-sheet scan, so it
          // works chained under a hat OR floating free)
          case 'arcade_when_game_starts':
            // Allowed on the Game sheet and on enemy/flyer sheets (as the home
            // for the toughness block); real actions all route to game start
            if (owner === 'game' || owner === 'enemy' || owner === 'flyer') rules.gameStart.push(actions);
            break;
          case 'arcade_when_score':
            if (owner === 'game') rules.scoreRules.push({ n: Number(top.getFieldValue('N')) || 1, actions });
            break;
        }
      }
      // Toughness is a property: honored wherever the block sits on the sheet
      // (snapped into a chain or floating free)
      if (owner === 'enemy' || owner === 'flyer') {
        for (const b of ws.getAllBlocks(false)) {
          if (b.type === 'arcade_toughness') {
            const n = Math.max(1, Math.min(3, Number(b.getFieldValue('N')) || 1));
            if (owner === 'enemy') rules.enemyToughness = Math.max(rules.enemyToughness, n);
            else rules.flyerToughness = Math.max(rules.flyerToughness, n);
          }
        }
      }
      // Armor works the same way on the defender sheets
      if (owner === 'alien' || owner === 'brute' || owner === 'bomber') {
        for (const b of ws.getAllBlocks(false)) {
          if (b.type === 'arcade_armor') {
            const n = Math.max(1, Math.min(3, Number(b.getFieldValue('N')) || 1));
            if (owner === 'alien') rules.alienToughness = Math.max(rules.alienToughness, n);
            else if (owner === 'brute') rules.bruteToughness = Math.max(rules.bruteToughness, n);
            else rules.bomberToughness = Math.max(rules.bomberToughness, n);
          }
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
