import { Theme } from './themes';
import { RenderState } from './animation';

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function renderBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  grid: number[][],
  cellW: number,
  cellH: number,
  theme: Theme,
  t: number,
) {
  const rows = grid.length;
  const cols = grid[0].length;

  ctx.clearRect(0, 0, width, height);

  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, theme.boardBg);
  grad.addColorStop(1, theme.boardBg2);
  ctx.fillStyle = grad;
  roundedRect(ctx, 0, 0, width, height, 14);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, 0, 0, width, height, 14);
  ctx.clip();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW;
      const cy = r * cellH;
      if (grid[r][c] === 1) {
        ctx.fillStyle = theme.wallFill;
        ctx.fillRect(cx, cy, cellW, cellH);
        ctx.fillStyle = theme.wallHighlight;
        ctx.fillRect(cx, cy, cellW, 3);
        ctx.fillRect(cx, cy, 3, cellH);
        ctx.fillStyle = theme.wallShade;
        ctx.fillRect(cx, cy + cellH - 3, cellW, 3);
        ctx.fillRect(cx + cellW - 3, cy, 3, cellH);
      } else {
        ctx.fillStyle = (r + c) % 2 === 0 ? theme.pathFill : theme.pathFill2;
        ctx.fillRect(cx, cy, cellW, cellH);
      }
    }
  }

  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 1;
  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cellW, 0);
    ctx.lineTo(c * cellW, height);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * cellH);
    ctx.lineTo(width, r * cellH);
    ctx.stroke();
  }

  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 3;
  roundedRect(ctx, 1.5, 1.5, width - 3, height - 3, 14);
  ctx.stroke();

  void t; // suppress unused warning — used for future animated decor
}

export function renderGoal(
  ctx: CanvasRenderingContext2D,
  exitX: number,
  exitY: number,
  cellW: number,
  cellH: number,
  theme: Theme,
  t: number,
) {
  const cx = exitX * cellW + cellW / 2;
  const cy = exitY * cellH + cellH / 2;
  const r = Math.min(cellW, cellH) * 0.28;
  const pulse = 0.88 + Math.sin(t / 420) * 0.12;

  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3 * pulse);
  grd.addColorStop(0, theme.goalGlow);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 3 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme.goalFill;
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.38 * pulse, 0, Math.PI * 2);
  ctx.fill();
}

export function renderCollectible(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  theme: Theme,
  t: number,
) {
  const cx = x * cellW + cellW / 2;
  const cy = y * cellH + cellH / 2;
  const r = Math.min(cellW, cellH) * 0.2;
  const bob = Math.sin(t / 340 + x * 1.3 + y * 0.7) * 3;

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.scale(
    1 + Math.sin(t / 230 + x) * 0.04,
    1 + Math.cos(t / 270 + y) * 0.04,
  );

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(0, r * 1.5, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme.itemFill;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = theme.itemAccent;
  ctx.beginPath();
  ctx.arc(-r * 0.22, -r * 0.28, r * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function renderBot(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  cellW: number,
  cellH: number,
  theme: Theme,
) {
  const baseCx = state.x * cellW + cellW / 2;
  const baseCy = state.y * cellH + cellH / 2;
  const size = Math.min(cellW, cellH) * 0.72 * state.scale;
  const w = size;
  const h = size * 0.86;

  ctx.save();

  // Apply bump offset in the direction the bot tried to move
  let bx = baseCx, by = baseCy;
  if (state.bumpOffset !== 0) {
    if (state.direction === 'right') bx += state.bumpOffset;
    else if (state.direction === 'left') bx -= state.bumpOffset;
    else if (state.direction === 'up') by -= state.bumpOffset;
    else by += state.bumpOffset;
  }

  ctx.translate(bx, by);

  if (state.moving) {
    const tilt = 0.065;
    if (state.direction === 'right') ctx.rotate(tilt);
    else if (state.direction === 'left') ctx.rotate(-tilt);
    else if (state.direction === 'up') ctx.rotate(-tilt * 0.5);
    else ctx.rotate(tilt * 0.5);
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.54, w * 0.36, h * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = theme.botPrimary;
  roundedRect(ctx, -w / 2, -h / 2, w, h, w * 0.22);
  ctx.fill();

  // Sheen
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundedRect(ctx, -w / 2 + w * 0.1, -h / 2 + h * 0.09, w * 0.8, h * 0.22, w * 0.1);
  ctx.fill();

  // Eyes
  const eyeY = -h * 0.1 + (state.frame === 0 ? 0 : 1.2);
  ctx.fillStyle = '#1A2530';
  ctx.beginPath();
  ctx.arc(-w * 0.18, eyeY, w * 0.075, 0, Math.PI * 2);
  ctx.arc(w * 0.18, eyeY, w * 0.075, 0, Math.PI * 2);
  ctx.fill();
  // Glints
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(-w * 0.155, eyeY - w * 0.028, w * 0.028, 0, Math.PI * 2);
  ctx.arc(w * 0.205, eyeY - w * 0.028, w * 0.028, 0, Math.PI * 2);
  ctx.fill();

  // Antenna stem
  ctx.fillStyle = theme.botAccent;
  ctx.fillRect(-w * 0.04, -h / 2 - h * 0.22, w * 0.08, h * 0.18);
  // Antenna ball
  ctx.beginPath();
  ctx.arc(0, -h / 2 - h * 0.25, w * 0.09, 0, Math.PI * 2);
  ctx.fill();

  // Wheels
  const wl = state.frame === 0 ? 0 : 1.5;
  ctx.fillStyle = '#1E2A3A';
  ctx.beginPath();
  ctx.arc(-w * 0.33, h * 0.38 - wl, w * 0.12, 0, Math.PI * 2);
  ctx.arc(w * 0.33, h * 0.38 + wl, w * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Directional arrow
  ctx.fillStyle = theme.botAccent;
  const a = w * 0.11;
  if (state.direction === 'right') {
    ctx.beginPath();
    ctx.moveTo(w * 0.44, 0);
    ctx.lineTo(w * 0.28, -a);
    ctx.lineTo(w * 0.28, a);
    ctx.closePath();
    ctx.fill();
  } else if (state.direction === 'left') {
    ctx.beginPath();
    ctx.moveTo(-w * 0.44, 0);
    ctx.lineTo(-w * 0.28, -a);
    ctx.lineTo(-w * 0.28, a);
    ctx.closePath();
    ctx.fill();
  } else if (state.direction === 'up') {
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.44);
    ctx.lineTo(-a, -h * 0.28);
    ctx.lineTo(a, -h * 0.28);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, h * 0.44);
    ctx.lineTo(-a, h * 0.28);
    ctx.lineTo(a, h * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  // Collect glow ring
  if (state.collecting) {
    ctx.strokeStyle = 'rgba(255,225,70,0.72)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.68, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Particles ──────────────────────────────────────────────────────────────

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export function spawnParticles(cx: number, cy: number, color: string, count = 8): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const speed = 0.5 + Math.random() * 1.6;
    return { x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, color };
  });
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles
    .map(p => ({
      ...p,
      x: p.x + p.vx * dt * 0.065,
      y: p.y + p.vy * dt * 0.065,
      vy: p.vy + dt * 0.0018,
      life: p.life + dt * 0.0025,
    }))
    .filter(p => p.life < 1);
}

export function renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[], cellSize: number) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = 1 - p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, cellSize * 0.06 * (1 - p.life * 0.6), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
