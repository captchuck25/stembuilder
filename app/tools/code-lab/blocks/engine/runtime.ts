export interface ScriptNode {
  id: string;
  blockId: string;
  params: Record<string, number | string>;
  children?: ScriptNode[];
}

export type Direction = "right" | "left" | "up" | "down";

export interface Sprite {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  bubble?: string;
  direction: Direction;
}

export interface Collectible {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

export interface GameState {
  sprites:      Record<string, Sprite>;
  collectibles: Collectible[];
  walls:        string[];          // "x,y" strings
  variables:    Record<string, number>;
  tick:         number;
  won:          boolean;
}

export type ExecutionStep =
  | { kind: "move";       spriteId: string; dx: number; dy: number }
  | { kind: "goto";       spriteId: string; x: number;  y: number  }
  | { kind: "say";        spriteId: string; text: string           }
  | { kind: "clear_say";  spriteId: string                         }
  | { kind: "show";       spriteId: string                         }
  | { kind: "hide";       spriteId: string                         }
  | { kind: "wait";       ms: number                               }
  | { kind: "set_var";    name: string; value: number              }
  | { kind: "change_var"; name: string; amount: number             };

const GRID     = 10;
const MAX_LOOP = 200;

export function compileScript(nodes: ScriptNode[], spriteId: string): ExecutionStep[] {
  const out: ExecutionStep[] = [];

  function walk(list: ScriptNode[]) {
    for (const n of list) {
      const p = n.params;
      switch (n.blockId) {
        case "when_flag_clicked":
        case "when_key_pressed":
          break;

        // Per-cell steps so animation is visible
        // Y=0 is at the bottom (math convention): up = +y, down = -y
        case "move_right":
          for (let i = 0; i < Math.max(1, +(p.steps || 1)); i++)
            out.push({ kind: "move", spriteId, dx: 1,  dy: 0 });
          break;
        case "move_left":
          for (let i = 0; i < Math.max(1, +(p.steps || 1)); i++)
            out.push({ kind: "move", spriteId, dx: -1, dy: 0 });
          break;
        case "move_up":
          for (let i = 0; i < Math.max(1, +(p.steps || 1)); i++)
            out.push({ kind: "move", spriteId, dx: 0, dy: 1 });
          break;
        case "move_down":
          for (let i = 0; i < Math.max(1, +(p.steps || 1)); i++)
            out.push({ kind: "move", spriteId, dx: 0, dy: -1 });
          break;

        case "go_to_xy":
          out.push({ kind: "goto", spriteId, x: +(p.x ?? 0), y: +(p.y ?? 0) });
          break;

        case "say":
          out.push({ kind: "say",       spriteId, text: String(p.message ?? "") });
          out.push({ kind: "wait",      ms: 1500 });
          out.push({ kind: "clear_say", spriteId });
          break;
        case "show":
          out.push({ kind: "show", spriteId });
          break;
        case "hide":
          out.push({ kind: "hide", spriteId });
          break;
        case "wait":
          out.push({ kind: "wait", ms: +(p.seconds ?? 1) * 1000 });
          break;

        case "repeat": {
          const times = Math.min(+(p.times ?? 1), MAX_LOOP);
          for (let i = 0; i < times; i++) walk(n.children ?? []);
          break;
        }
        case "forever":
          for (let i = 0; i < MAX_LOOP; i++) walk(n.children ?? []);
          break;

        case "set_variable":
          out.push({ kind: "set_var",    name: String(p.var ?? "score"), value: +(p.value ?? 0) });
          break;
        case "change_variable":
          out.push({ kind: "change_var", name: String(p.var ?? "score"), amount: +(p.amount ?? 1) });
          break;
      }
    }
  }

  const body = nodes[0]?.blockId === "when_flag_clicked" ? nodes.slice(1) : nodes;
  walk(body);
  return out;
}

export function applyStep(step: ExecutionStep, state: GameState): GameState {
  const sprites      = { ...state.sprites };
  let   collectibles = state.collectibles;
  const variables    = { ...state.variables };
  const wallSet      = new Set(state.walls);

  switch (step.kind) {
    case "move": {
      const s = sprites[step.spriteId];
      if (s) {
        const nx  = Math.max(0, Math.min(GRID - 1, s.x + step.dx));
        const ny  = Math.max(0, Math.min(GRID - 1, s.y + step.dy));
        const dir: Direction =
          step.dx > 0 ? "right" : step.dx < 0 ? "left" :
          step.dy > 0 ? "up"    : "down";
        if (!wallSet.has(`${nx},${ny}`)) {
          sprites[step.spriteId] = { ...s, x: nx, y: ny, direction: dir };
          collectibles = collectibles.map(c =>
            !c.collected && c.x === nx && c.y === ny ? { ...c, collected: true } : c
          );
        } else {
          // Rover stays put but still faces the attempted direction
          sprites[step.spriteId] = { ...s, direction: dir };
        }
      }
      break;
    }
    case "goto": {
      const s = sprites[step.spriteId];
      if (s) {
        const nx = Math.max(0, Math.min(GRID - 1, step.x));
        const ny = Math.max(0, Math.min(GRID - 1, step.y));
        sprites[step.spriteId] = { ...s, x: nx, y: ny };
        // goto bypasses walls but still collects
        collectibles = collectibles.map(c =>
          !c.collected && c.x === nx && c.y === ny ? { ...c, collected: true } : c
        );
      }
      break;
    }
    case "say": {
      const s = sprites[step.spriteId];
      if (s) sprites[step.spriteId] = { ...s, bubble: step.text };
      break;
    }
    case "clear_say": {
      const s = sprites[step.spriteId];
      if (s) sprites[step.spriteId] = { ...s, bubble: undefined };
      break;
    }
    case "show": {
      const s = sprites[step.spriteId];
      if (s) sprites[step.spriteId] = { ...s, visible: true };
      break;
    }
    case "hide": {
      const s = sprites[step.spriteId];
      if (s) sprites[step.spriteId] = { ...s, visible: false };
      break;
    }
    case "set_var":    variables[step.name] = step.value; break;
    case "change_var": variables[step.name] = (variables[step.name] ?? 0) + step.amount; break;
    case "wait": break;
  }

  return { ...state, sprites, collectibles, variables, tick: state.tick + 1 };
}

export function makeInitialState(
  spriteX: number,
  spriteY: number,
  collectibles: { x: number; y: number }[],
  walls:        { x: number; y: number }[],
): GameState {
  return {
    sprites: {
      rover: { id: "rover", x: spriteX, y: spriteY, visible: true, direction: "right" },
    },
    collectibles: collectibles.map((c, i) => ({ ...c, id: i, collected: false })),
    walls:        walls.map(w => `${w.x},${w.y}`),
    variables:    {},
    tick:         0,
    won:          false,
  };
}