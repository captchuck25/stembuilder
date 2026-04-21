export type BlockCategory = "motion" | "control" | "looks" | "sensing" | "variable";

export interface BlockParam {
  name: string;
  type: "number" | "text" | "select";
  default: number | string;
  min?: number;
  max?: number;
  options?: string[];
}

export interface BlockDef {
  id: string;
  /** Label with params embedded as [paramName], e.g. "move right [steps] steps" */
  label: string;
  category: BlockCategory;
  color: string;
  params?: BlockParam[];
  module: number;
  isHat?: boolean;
  isC?: boolean;
}

export const CATEGORY_COLORS: Record<BlockCategory, string> = {
  motion:   "#4c97ff",
  control:  "#ffab19",
  looks:    "#9966ff",
  sensing:  "#5cb1d6",
  variable: "#ff8c1a",
};

export const ALL_BLOCKS: BlockDef[] = [

  // ── Module 1: Events & Basic Movement ─────────────────────────────────────

  {
    id: "when_flag_clicked",
    label: "when 🏁 clicked",
    category: "control",
    color: "#ffab19",
    module: 1,
    isHat: true,
  },
  {
    id: "move_right",
    label: "move right [steps] steps",
    category: "motion",
    color: "#4c97ff",
    module: 1,
    params: [{ name: "steps", type: "number", default: 1, min: 1, max: 20 }],
  },
  {
    id: "move_left",
    label: "move left [steps] steps",
    category: "motion",
    color: "#4c97ff",
    module: 1,
    params: [{ name: "steps", type: "number", default: 1, min: 1, max: 20 }],
  },
  {
    id: "move_up",
    label: "move up [steps] steps",
    category: "motion",
    color: "#4c97ff",
    module: 1,
    params: [{ name: "steps", type: "number", default: 1, min: 1, max: 20 }],
  },
  {
    id: "move_down",
    label: "move down [steps] steps",
    category: "motion",
    color: "#4c97ff",
    module: 1,
    params: [{ name: "steps", type: "number", default: 1, min: 1, max: 20 }],
  },
  {
    id: "go_to_xy",
    label: "go to x: [x]  y: [y]",
    category: "motion",
    color: "#4c97ff",
    module: 1,
    params: [
      { name: "x", type: "number", default: 0, min: 0, max: 9 },
      { name: "y", type: "number", default: 0, min: 0, max: 9 },
    ],
  },

  // ── Module 2: Sprites & Interaction ───────────────────────────────────────

  {
    id: "when_key_pressed",
    label: "when [key] pressed",
    category: "control",
    color: "#ffab19",
    module: 2,
    isHat: true,
    params: [{
      name: "key", type: "select", default: "ArrowRight",
      options: ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Space"],
    }],
  },
  {
    id: "say",
    label: "say [message]",
    category: "looks",
    color: "#9966ff",
    module: 2,
    params: [{ name: "message", type: "text", default: "Hello!" }],
  },
  {
    id: "show",
    label: "show",
    category: "looks",
    color: "#9966ff",
    module: 2,
  },
  {
    id: "hide",
    label: "hide",
    category: "looks",
    color: "#9966ff",
    module: 2,
  },

  // ── Module 3: Loops & Animation ───────────────────────────────────────────

  {
    id: "repeat",
    label: "repeat [times] times",
    category: "control",
    color: "#ffab19",
    module: 3,
    isC: true,
    params: [{ name: "times", type: "number", default: 10, min: 1, max: 100 }],
  },
  {
    id: "forever",
    label: "forever",
    category: "control",
    color: "#ffab19",
    module: 3,
    isC: true,
  },
  {
    id: "wait",
    label: "wait [seconds] seconds",
    category: "control",
    color: "#ffab19",
    module: 3,
    params: [{ name: "seconds", type: "number", default: 1, min: 0.1, max: 10 }],
  },

  // ── Module 4: Conditionals & Game Rules ───────────────────────────────────

  {
    id: "if_touching_target",
    label: "if touching target",
    category: "control",
    color: "#ffab19",
    module: 4,
    isC: true,
  },
  {
    id: "if_key",
    label: "if [key] pressed",
    category: "control",
    color: "#ffab19",
    module: 4,
    isC: true,
    params: [{
      name: "key", type: "select", default: "Space",
      options: ["Space", "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"],
    }],
  },
  {
    id: "broadcast",
    label: "broadcast [message]",
    category: "control",
    color: "#ffab19",
    module: 4,
    params: [{ name: "message", type: "text", default: "start" }],
  },

  // ── Module 5: Variables & Final Game ─────────────────────────────────────

  {
    id: "set_variable",
    label: "set [var] to [value]",
    category: "variable",
    color: "#ff8c1a",
    module: 5,
    params: [
      { name: "var",   type: "text",   default: "score" },
      { name: "value", type: "number", default: 0 },
    ],
  },
  {
    id: "change_variable",
    label: "change [var] by [amount]",
    category: "variable",
    color: "#ff8c1a",
    module: 5,
    params: [
      { name: "var",    type: "text",   default: "score" },
      { name: "amount", type: "number", default: 1 },
    ],
  },
  {
    id: "show_variable",
    label: "show [var]",
    category: "variable",
    color: "#ff8c1a",
    module: 5,
    params: [{ name: "var", type: "text", default: "score" }],
  },
];