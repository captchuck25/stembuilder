export type Direction = 'right' | 'left' | 'up' | 'down';

export interface RenderState {
  x: number;
  y: number;
  direction: Direction;
  /** Facing angle in radians (canvas coords: right=0, down=+π/2) — tweens smoothly on turns */
  angle: number;
  scale: number;
  moving: boolean;
  turning: boolean;
  collecting: boolean;
  bumping: boolean;
  bumpOffset: number;
  /** True for a short period after a bump — draw X-eyes / wobble */
  dizzy: boolean;
  celebrating: boolean;
  /** Seconds since celebrate() was called (0 when not celebrating) */
  celebrateT: number;
  /** 0 = eyes open, 1 = eyes fully closed (blink) */
  blink: number;
  frame: number;
}

const DIR_ANGLE: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Smallest signed angle from a to b, in (-π, π] */
function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export class STEMBotAnimator {
  gridX = 0;
  gridY = 0;
  direction: Direction = 'right';

  /** Playback speed multiplier (0.5 = slow, 2 = fast). Scales all tween durations. */
  speed = 1;

  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private moveStart = 0;
  private readonly baseMoveDuration = 240;
  private _moving = false;

  private fromAngle = 0;
  private toAngle = 0;
  private turnStart = 0;
  private readonly baseTurnDuration = 170;
  private _turning = false;

  private growthScale = 1.0;
  private collectBoost = 0;
  private collectStart = 0;
  private readonly collectDuration = 240;
  private collectCount = 0;

  private bumpStart = 0;
  private readonly bumpDuration = 320;
  private readonly dizzyDuration = 750;
  private _bumping = false;

  private celebrateStart = 0;
  private _celebrating = false;

  private readonly blinkPhase = Math.random() * 4000;

  get moveDuration() {
    return this.baseMoveDuration / this.speed;
  }

  get turnDuration() {
    return this.baseTurnDuration / this.speed;
  }

  get isMoving() {
    return this._moving;
  }

  reset(x: number, y: number, dir: Direction) {
    this.gridX = this.fromX = this.toX = x;
    this.gridY = this.fromY = this.toY = y;
    this.direction = dir;
    this.fromAngle = this.toAngle = DIR_ANGLE[dir];
    this._moving = false;
    this._turning = false;
    this._bumping = false;
    this._celebrating = false;
    this.celebrateStart = 0;
    this.growthScale = 1.0;
    this.collectCount = 0;
    this.collectBoost = 0;
    this.collectStart = 0;
    this.bumpStart = 0;
  }

  moveTo(x: number, y: number, dir: Direction, now = performance.now()) {
    this.fromX = this.gridX;
    this.fromY = this.gridY;
    this.toX = x;
    this.toY = y;
    this.gridX = x;
    this.gridY = y;
    this.direction = dir;
    this.moveStart = now;
    this._moving = true;
  }

  /** Smoothly rotate to face a new direction */
  turnTo(dir: Direction, now = performance.now()) {
    const current = this.currentAngle(now);
    this.fromAngle = current;
    this.toAngle = current + angleDelta(current, DIR_ANGLE[dir]);
    this.direction = dir;
    this.turnStart = now;
    this._turning = true;
  }

  private currentAngle(now: number) {
    if (!this._turning) return this.toAngle;
    const t = Math.min((now - this.turnStart) / this.turnDuration, 1);
    if (t >= 1) {
      this._turning = false;
      return this.toAngle;
    }
    return lerp(this.fromAngle, this.toAngle, easeInOutQuad(t));
  }

  bump(now = performance.now()) {
    this.bumpStart = now;
    this._bumping = true;
  }

  collect(now = performance.now()) {
    this.collectCount++;
    this.growthScale = Math.min(1 + this.collectCount * 0.06, 1.42);
    this.collectBoost = 0.22;
    this.collectStart = now;
  }

  celebrate(now = performance.now()) {
    this._celebrating = true;
    this.celebrateStart = now;
  }

  getRenderState(now = performance.now()): RenderState {
    let moveT = 1;
    if (this._moving) {
      moveT = Math.min((now - this.moveStart) / this.moveDuration, 1);
      if (moveT >= 1) this._moving = false;
    }

    const ease = easeInOutQuad(moveT);
    const x = lerp(this.fromX, this.toX, ease);
    const y = lerp(this.fromY, this.toY, ease);

    const angle = this.currentAngle(now);

    let collectT = 1;
    if (this.collectStart > 0) {
      collectT = Math.min((now - this.collectStart) / this.collectDuration, 1);
    }
    let collectPulse = 0;
    if (collectT < 1) {
      const up = collectT < 0.4 ? collectT / 0.4 : 1 - (collectT - 0.4) / 0.6;
      collectPulse = this.collectBoost * Math.max(0, up);
    }

    let bumpOffset = 0;
    let dizzy = false;
    if (this.bumpStart > 0) {
      const since = now - this.bumpStart;
      dizzy = since < this.dizzyDuration;
      if (this._bumping) {
        const bt = Math.min(since / this.bumpDuration, 1);
        if (bt >= 1) {
          this._bumping = false;
        } else {
          bumpOffset = Math.sin(bt * Math.PI * 4) * 6 * (1 - bt);
        }
      }
    }

    // Blink: quick close-open every ~3.6s (skipped while dizzy — X-eyes take over)
    const blinkCycle = ((now + this.blinkPhase) % 3600) / 3600;
    const blink = blinkCycle < 0.05 ? Math.sin((blinkCycle / 0.05) * Math.PI) : 0;

    const celebrateT = this._celebrating ? (now - this.celebrateStart) / 1000 : 0;

    const bob = this._moving
      ? Math.sin(now / 60) * 0.03
      : Math.sin(now / 180) * 0.02;

    return {
      x, y,
      direction: this.direction,
      angle,
      scale: this.growthScale + collectPulse + bob,
      moving: this._moving,
      turning: this._turning,
      collecting: collectT < 1,
      bumping: this._bumping,
      bumpOffset,
      dizzy,
      celebrating: this._celebrating,
      celebrateT,
      blink,
      frame: this._moving ? Math.floor(now / 120) % 2 : Math.floor(now / 260) % 2,
    };
  }

  waitForMove(): Promise<void> {
    if (!this._moving) return Promise.resolve();
    const remaining = this.moveDuration - (performance.now() - this.moveStart);
    return new Promise(r => setTimeout(r, Math.max(0, remaining) + 12));
  }

  waitForTurn(): Promise<void> {
    if (!this._turning) return Promise.resolve();
    const remaining = this.turnDuration - (performance.now() - this.turnStart);
    return new Promise(r => setTimeout(r, Math.max(0, remaining) + 12));
  }
}
