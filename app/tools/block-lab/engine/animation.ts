export type Direction = 'right' | 'left' | 'up' | 'down';

export interface RenderState {
  x: number;
  y: number;
  direction: Direction;
  scale: number;
  moving: boolean;
  collecting: boolean;
  bumping: boolean;
  bumpOffset: number;
  frame: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class STEMBotAnimator {
  gridX = 0;
  gridY = 0;
  direction: Direction = 'right';

  private fromX = 0;
  private fromY = 0;
  private toX = 0;
  private toY = 0;
  private moveStart = 0;
  readonly moveDuration = 240;
  private _moving = false;

  private growthScale = 1.0;
  private collectBoost = 0;
  private collectStart = 0;
  private readonly collectDuration = 240;
  private collectCount = 0;

  private bumpStart = 0;
  private readonly bumpDuration = 320;
  private _bumping = false;

  get isMoving() {
    return this._moving;
  }

  reset(x: number, y: number, dir: Direction) {
    this.gridX = this.fromX = this.toX = x;
    this.gridY = this.fromY = this.toY = y;
    this.direction = dir;
    this._moving = false;
    this._bumping = false;
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

  getRenderState(now = performance.now()): RenderState {
    let moveT = 1;
    if (this._moving) {
      moveT = Math.min((now - this.moveStart) / this.moveDuration, 1);
      if (moveT >= 1) this._moving = false;
    }

    const ease = easeInOutQuad(moveT);
    const x = lerp(this.fromX, this.toX, ease);
    const y = lerp(this.fromY, this.toY, ease);

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
    if (this._bumping) {
      const bt = Math.min((now - this.bumpStart) / this.bumpDuration, 1);
      if (bt >= 1) {
        this._bumping = false;
      } else {
        bumpOffset = Math.sin(bt * Math.PI * 4) * 6 * (1 - bt);
      }
    }

    const bob = this._moving
      ? Math.sin(now / 60) * 0.03
      : Math.sin(now / 180) * 0.02;

    return {
      x, y,
      direction: this.direction,
      scale: this.growthScale + collectPulse + bob,
      moving: this._moving,
      collecting: collectT < 1,
      bumping: this._bumping,
      bumpOffset,
      frame: this._moving ? Math.floor(now / 120) % 2 : Math.floor(now / 260) % 2,
    };
  }

  waitForMove(): Promise<void> {
    if (!this._moving) return Promise.resolve();
    const remaining = this.moveDuration - (performance.now() - this.moveStart);
    return new Promise(r => setTimeout(r, Math.max(0, remaining) + 12));
  }
}
