// Arcade Lab renderer — all vector, no image assets (same approach as Block Lab).
// Levels can be larger than the viewport: renderGame follows the player with a
// clamped camera; renderDesign takes an explicit view offset (editor panning).
// Backdrops parallax against the camera so scrolling feels deep.

import { Backdrop, GameDef, ObjectType, TILE, VIEW_W, VIEW_H, solidSet } from './types';
import { GameState, PW, PH } from './physics';
import { BotConfig, defaultBot } from './bot';

function hash2(a: number, b: number, salt = 0): number {
  let h = a * 374761393 + b * 668265263 + salt * 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

/** Wrap a parallax-shifted coordinate into [0, span) */
function wrap(v: number, span: number): number {
  return ((v % span) + span) % span;
}

// ── Camera ───────────────────────────────────────────────────────────────────

export function cameraFor(def: GameDef, state: GameState): { x: number; y: number } {
  const levelW = def.cols * TILE;
  const levelH = def.rows * TILE;
  const px = state.player.x * TILE + (PW * TILE) / 2;
  const py = state.player.y * TILE + (PH * TILE) / 2;
  return {
    x: Math.max(0, Math.min(px - VIEW_W / 2, levelW - VIEW_W)),
    y: Math.max(0, Math.min(py - VIEW_H / 2, levelH - VIEW_H)),
  };
}

// ── Backdrops (drawn in screen space, parallaxed against the camera) ─────────

function drawBackdrop(ctx: CanvasRenderingContext2D, backdrop: Backdrop, w: number, h: number, t: number, parX: number, parY: number) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (backdrop === 'hills') {
    grad.addColorStop(0, '#7EC8F0');
    grad.addColorStop(1, '#D7F0FC');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // sun (far away — barely moves)
    const sunX = w * 0.85 - parX * 0.05;
    const sg = ctx.createRadialGradient(sunX, h * 0.16, 0, sunX, h * 0.16, 70);
    sg.addColorStop(0, 'rgba(255,236,150,0.95)');
    sg.addColorStop(0.4, 'rgba(255,220,110,0.55)');
    sg.addColorStop(1, 'rgba(255,220,110,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 80, h * 0.16 - 80, 160, 160);
    // drifting clouds (mid distance)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 4; i++) {
      const cx = wrap(t / (55 + i * 12) + i * 340 - parX * 0.4, w + 220) - 110;
      const cy = h * (0.1 + i * 0.08) - parY * 0.15;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42, 15, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 26, cy + 6, 26, 11, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 28, cy + 5, 30, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // far hills
    ctx.fillStyle = 'rgba(110,190,120,0.45)';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.72 + Math.sin((x + parX * 0.5) / 130 + 1) * 26 - parY * 0.2);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  } else if (backdrop === 'cave') {
    grad.addColorStop(0, '#241A38');
    grad.addColorStop(1, '#120D1E');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // stalactites hang from the "ceiling" — recede upward as you climb
    ctx.fillStyle = 'rgba(70,55,105,0.8)';
    for (let i = 0; i < 12; i++) {
      const sx = wrap(hash2(i, 3) * (w + 60) - parX * 0.5, w + 60) - 30;
      const sl = 20 + hash2(i, 5) * 45;
      const sy = -parY * 0.55;
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy);
      ctx.lineTo(sx + 12, sy);
      ctx.lineTo(sx, sy + sl);
      ctx.closePath();
      ctx.fill();
    }
    // glowing crystals
    for (let i = 0; i < 10; i++) {
      const gx = wrap(hash2(i, 7) * (w + 40) - parX * 0.35, w + 40) - 20;
      const gy = wrap(h * (0.25 + hash2(i, 11) * 0.6) - parY * 0.35, h);
      const pulse = 0.4 + 0.6 * Math.abs(Math.sin(t / 800 + i * 1.9));
      ctx.fillStyle = `rgba(140,220,255,${(0.25 + 0.4 * pulse).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(gx, gy, 2.5 + pulse * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (backdrop === 'candy') {
    grad.addColorStop(0, '#FFD9EC');
    grad.addColorStop(1, '#FFF4FA');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const pastels = ['rgba(255,170,200,0.35)', 'rgba(190,220,255,0.35)', 'rgba(255,240,160,0.4)', 'rgba(190,255,200,0.35)'];
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = pastels[i % pastels.length];
      const cx = wrap(hash2(i, 13) * (w + 80) - parX * 0.3, w + 80) - 40;
      const cy = wrap(h * (0.08 + hash2(i, 17) * 0.6) - parY * 0.3, h) + Math.sin(t / 1400 + i) * 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 16 + hash2(i, 19) * 26, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // space
    grad.addColorStop(0, '#141B33');
    grad.addColorStop(1, '#080B16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) {
      const depth = 0.15 + hash2(i, 37) * 0.25; // varied star depths
      const sx = wrap(hash2(i, 23) * (w + 30) - parX * depth, w + 30) - 15;
      const sy = wrap(hash2(i, 29) * (h + 30) - parY * depth, h + 30) - 15;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t / 700 + i * 1.7));
      ctx.fillStyle = `rgba(220,236,255,${(0.3 + 0.6 * tw).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, (0.5 + hash2(i, 31)) * tw + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // ringed planet (mid distance)
    ctx.save();
    ctx.translate(wrap(w * 0.82 - parX * 0.4, w + 160) - 80, h * 0.2 - parY * 0.3);
    ctx.fillStyle = '#B08CFF';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,102,0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 2, 36, 10, -0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Tiles ────────────────────────────────────────────────────────────────────

const TILE_STYLE: Record<Backdrop, { fill: string; top: string; edge: string }> = {
  hills: { fill: '#8B5E34', top: '#53B54B', edge: '#6E4826' },
  cave:  { fill: '#4A4258', top: '#6B6180', edge: '#332C40' },
  candy: { fill: '#D9A066', top: '#FF8FBE', edge: '#B57F4C' },
  space: { fill: '#3A4866', top: '#5A6888', edge: '#242E48' },
};

function drawTile(ctx: CanvasRenderingContext2D, backdrop: Backdrop, x: number, y: number, solidAbove: boolean) {
  const s = TILE_STYLE[backdrop];
  const px = x * TILE, py = y * TILE;
  ctx.fillStyle = s.fill;
  ctx.fillRect(px, py, TILE, TILE);
  ctx.strokeStyle = s.edge;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  if (!solidAbove) {
    ctx.fillStyle = s.top;
    ctx.fillRect(px, py, TILE, 8);
    if (backdrop === 'hills') {
      ctx.fillStyle = 'rgba(30,90,30,0.4)';
      for (let g = 0; g < 4; g++) {
        if (hash2(x, y, g) > 0.5) ctx.fillRect(px + 4 + g * 9, py, 2, 5 + hash2(x, y, g + 8) * 4);
      }
    } else if (backdrop === 'candy') {
      const cols = ['#FF5C8A', '#5CC8FF', '#FFE066'];
      for (let g = 0; g < 3; g++) {
        ctx.fillStyle = cols[g];
        ctx.fillRect(px + 5 + g * 12 + hash2(x, y, g) * 5, py + 2, 4, 2);
      }
    } else if (backdrop === 'space') {
      ctx.fillStyle = 'rgba(57,208,255,0.5)';
      ctx.fillRect(px, py, TILE, 2);
    }
  }
  if (backdrop === 'space' && hash2(x, y, 40) < 0.6) {
    ctx.fillStyle = 'rgba(200,220,255,0.3)';
    ctx.beginPath();
    ctx.arc(px + 8, py + TILE - 8, 1.6, 0, Math.PI * 2);
    ctx.arc(px + TILE - 8, py + TILE - 8, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Sprites ──────────────────────────────────────────────────────────────────

function drawCoin(ctx: CanvasRenderingContext2D, px: number, py: number, t: number, seed: number) {
  const cx = px + TILE / 2;
  const cy = py + TILE / 2 + Math.sin(t / 320 + seed * 1.3) * 3;
  const spin = Math.abs(Math.sin(t / 260 + seed));
  const r = TILE * 0.28;
  ctx.fillStyle = '#E8A820';
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(r * spin, r * 0.14), r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFD54A';
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(r * spin, r * 0.14) * 0.7, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (spin > 0.6) {
    ctx.fillStyle = '#B8821A';
    ctx.font = `bold ${Math.round(TILE * 0.3)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', cx, cy + 1);
  }
}

function drawSpike(ctx: CanvasRenderingContext2D, px: number, py: number) {
  ctx.fillStyle = '#C8CDD8';
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 1.5;
  const base = py + TILE;
  for (let i = 0; i < 3; i++) {
    const sx = px + i * (TILE / 3);
    ctx.beginPath();
    ctx.moveTo(sx + 2, base);
    ctx.lineTo(sx + TILE / 6, py + TILE * 0.42);
    ctx.lineTo(sx + TILE / 3 - 2, base);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawFlag(ctx: CanvasRenderingContext2D, px: number, py: number, t: number) {
  const bx = px + TILE * 0.3;
  ctx.strokeStyle = '#6B4E2E';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(bx, py + TILE);
  ctx.lineTo(bx, py + TILE * 0.08);
  ctx.stroke();
  const wave = Math.sin(t / 260) * 4;
  ctx.fillStyle = '#22C55E';
  ctx.beginPath();
  ctx.moveTo(bx, py + TILE * 0.08);
  ctx.quadraticCurveTo(bx + TILE * 0.35, py + TILE * 0.16 + wave * 0.5, bx + TILE * 0.62, py + TILE * 0.26 + wave);
  ctx.lineTo(bx, py + TILE * 0.44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(bx, py + TILE - 2, TILE * 0.22, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(ctx: CanvasRenderingContext2D, fx: number, fy: number, dir: 1 | -1, t: number, dmg = 0) {
  const px = fx * TILE, py = fy * TILE;
  const cx = px + TILE / 2;
  const bob = Math.sin(t / 110) * 1.5;
  const squish = 1 - dmg * 0.16; // dented by stomps
  ctx.fillStyle = '#5B2E91';
  const step = Math.sin(t / 90) * 3;
  ctx.beginPath();
  ctx.ellipse(cx - 8 + step, py + TILE - 4, 6, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 8 - step, py + TILE - 4, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = dmg > 0 ? '#A968E0' : '#8E4EC6';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE * (0.58 + dmg * 0.05) + bob, TILE * 0.34 * (1 + dmg * 0.06), TILE * 0.3 * squish, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx - 4, py + TILE * 0.48 + bob, TILE * 0.16, TILE * 0.1, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx + dir * 4 - 5, py + TILE * 0.52 + bob, 4.5, 0, Math.PI * 2);
  ctx.arc(cx + dir * 4 + 5, py + TILE * 0.52 + bob, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2B1B3D';
  ctx.beginPath();
  ctx.arc(cx + dir * 5.5 - 5, py + TILE * 0.52 + bob, 2.2, 0, Math.PI * 2);
  ctx.arc(cx + dir * 5.5 + 5, py + TILE * 0.52 + bob, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2B1B3D';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 9, py + TILE * 0.4 + bob);
  ctx.lineTo(cx - 2, py + TILE * 0.45 + bob);
  ctx.moveTo(cx + 9, py + TILE * 0.4 + bob);
  ctx.lineTo(cx + 2, py + TILE * 0.45 + bob);
  ctx.stroke();
}

function drawSpiky(ctx: CanvasRenderingContext2D, fx: number, fy: number, dir: 1 | -1, t: number) {
  const px = fx * TILE, py = fy * TILE;
  const cx = px + TILE / 2;
  const bob = Math.sin(t / 110) * 1.5;
  // feet
  ctx.fillStyle = '#8A2E1E';
  const step = Math.sin(t / 90) * 3;
  ctx.beginPath();
  ctx.ellipse(cx - 8 + step, py + TILE - 4, 6, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 8 - step, py + TILE - 4, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // spike crown FIRST (behind the body top)
  ctx.fillStyle = '#C8CDD8';
  ctx.strokeStyle = '#6B7280';
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    const sx = cx + i * TILE * 0.13;
    ctx.beginPath();
    ctx.moveTo(sx - 3.5, py + TILE * 0.42 + bob);
    ctx.lineTo(sx, py + TILE * (0.12 + Math.abs(i) * 0.05) + bob);
    ctx.lineTo(sx + 3.5, py + TILE * 0.42 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // body
  ctx.fillStyle = '#E85D3D';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE * 0.62 + bob, TILE * 0.34, TILE * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx - 4, py + TILE * 0.54 + bob, TILE * 0.15, TILE * 0.09, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // grumpy eyes
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx + dir * 4 - 5, py + TILE * 0.58 + bob, 4, 0, Math.PI * 2);
  ctx.arc(cx + dir * 4 + 5, py + TILE * 0.58 + bob, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3D1409';
  ctx.beginPath();
  ctx.arc(cx + dir * 5.5 - 5, py + TILE * 0.58 + bob, 2, 0, Math.PI * 2);
  ctx.arc(cx + dir * 5.5 + 5, py + TILE * 0.58 + bob, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3D1409';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 9, py + TILE * 0.48 + bob);
  ctx.lineTo(cx - 2, py + TILE * 0.52 + bob);
  ctx.moveTo(cx + 9, py + TILE * 0.48 + bob);
  ctx.lineTo(cx + 2, py + TILE * 0.52 + bob);
  ctx.stroke();
}

function drawFlyer(ctx: CanvasRenderingContext2D, fx: number, fy: number, dir: 1 | -1, t: number, dmg = 0) {
  const px = fx * TILE, py = fy * TILE;
  const cx = px + TILE / 2;
  const cy = py + TILE * (0.5 + dmg * 0.04);
  const flap = Math.sin(t / (90 + dmg * 40)); // tired wings when dented
  // wings
  ctx.fillStyle = 'rgba(56,189,248,0.55)';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(cx + side * TILE * 0.2, cy - TILE * 0.05);
    ctx.rotate(side * (0.5 + flap * 0.45));
    ctx.beginPath();
    ctx.ellipse(side * TILE * 0.16, 0, TILE * 0.2, TILE * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // body
  ctx.fillStyle = dmg > 0 ? '#5BC4F0' : '#0EA5E9';
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 0.26 * (1 + dmg * 0.06), TILE * 0.22 * (1 - dmg * 0.14), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx - 3, cy - 4, TILE * 0.11, TILE * 0.07, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(cx + dir * 4 - 4, cy - 1, 3.5, 0, Math.PI * 2);
  ctx.arc(cx + dir * 4 + 4, cy - 1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#082F49';
  ctx.beginPath();
  ctx.arc(cx + dir * 5.5 - 4, cy - 1, 1.8, 0, Math.PI * 2);
  ctx.arc(cx + dir * 5.5 + 4, cy - 1, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // little tail wiggle
  ctx.strokeStyle = '#0EA5E9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - dir * TILE * 0.24, cy + 2);
  ctx.quadraticCurveTo(cx - dir * TILE * 0.36, cy + 5 + flap * 2, cx - dir * TILE * 0.42, cy + 2 + flap * 3);
  ctx.stroke();
}

function drawAlien(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, seed = 0) {
  const px = fx * TILE, py = fy * TILE;
  const cx = px + TILE / 2;
  const wob = Math.sin(t / 300 + seed * 1.3);
  const cy = py + TILE * 0.42 + wob * 1.5;
  // dangly tentacles, wiggling out of phase
  ctx.strokeStyle = '#4E9E33';
  ctx.lineWidth = 2.5;
  for (let i = -2; i <= 2; i++) {
    const lx = cx + i * TILE * 0.12;
    const sway = Math.sin(t / 220 + seed + i * 1.4) * 3;
    ctx.beginPath();
    ctx.moveTo(lx, cy + TILE * 0.12);
    ctx.quadraticCurveTo(lx + sway * 0.5, cy + TILE * 0.28, lx + sway, cy + TILE * 0.4);
    ctx.stroke();
  }
  // squishy dome body
  ctx.fillStyle = '#7CDB4F';
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 0.32 * (1 + wob * 0.04), TILE * 0.24 * (1 - wob * 0.05), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx - 4, cy - 4, TILE * 0.13, TILE * 0.08, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // antennae with glowing tips
  ctx.strokeStyle = '#4E9E33';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * 5, cy - TILE * 0.18);
    ctx.lineTo(cx + side * 8, cy - TILE * 0.34);
    ctx.stroke();
    ctx.fillStyle = '#D8FF6A';
    ctx.beginPath();
    ctx.arc(cx + side * 8, cy - TILE * 0.36, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // big glowy eyes
  ctx.fillStyle = '#0E2A08';
  ctx.beginPath();
  ctx.ellipse(cx - 6, cy - 1, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 6, cy - 1, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#D8FF6A';
  ctx.beginPath();
  ctx.arc(cx - 6, cy - 2, 1.8, 0, Math.PI * 2);
  ctx.arc(cx + 6, cy - 2, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawBrute(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, seed = 0, dmg = 0) {
  const px = fx * TILE, py = fy * TILE;
  const cx = px + TILE / 2;
  const wob = Math.sin(t / 380 + seed * 1.1);
  const cy = py + TILE * 0.46 + wob * 1.2;
  // stubby armored legs
  ctx.strokeStyle = '#7C2D12';
  ctx.lineWidth = 4;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * TILE * 0.18, cy + TILE * 0.2);
    ctx.lineTo(cx + side * TILE * 0.22, cy + TILE * 0.42);
    ctx.stroke();
  }
  // armor slab body (lightens as it takes dents)
  ctx.fillStyle = dmg > 0 ? '#FB923C' : '#EA580C';
  roundedRect(ctx, cx - TILE * 0.37, cy - TILE * 0.27, TILE * 0.74, TILE * 0.5, 7);
  ctx.fill();
  ctx.strokeStyle = '#7C2D12';
  ctx.lineWidth = 2;
  roundedRect(ctx, cx - TILE * 0.37, cy - TILE * 0.27, TILE * 0.74, TILE * 0.5, 7);
  ctx.stroke();
  // rivets
  ctx.fillStyle = 'rgba(60,20,5,0.55)';
  for (const [rx, ry] of [[-0.3, -0.19], [0.3, -0.19], [-0.3, 0.14], [0.3, 0.14]]) {
    ctx.beginPath();
    ctx.arc(cx + rx * TILE, cy + ry * TILE, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // cracks once dented
  if (dmg > 0) {
    ctx.strokeStyle = 'rgba(60,20,5,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - TILE * 0.2, cy - TILE * 0.24);
    ctx.lineTo(cx - TILE * 0.1, cy - TILE * 0.08);
    ctx.lineTo(cx - TILE * 0.18, cy + 0.04 * TILE);
    if (dmg > 1) {
      ctx.moveTo(cx + TILE * 0.24, cy - TILE * 0.1);
      ctx.lineTo(cx + TILE * 0.12, cy + TILE * 0.02);
      ctx.lineTo(cx + TILE * 0.2, cy + TILE * 0.16);
    }
    ctx.stroke();
  }
  // visor with glowing eyes
  ctx.fillStyle = '#1E1B4B';
  roundedRect(ctx, cx - TILE * 0.26, cy - TILE * 0.13, TILE * 0.52, TILE * 0.17, 5);
  ctx.fill();
  const pulse = 0.6 + 0.4 * Math.abs(Math.sin(t / 500 + seed));
  ctx.fillStyle = `rgba(252,211,77,${pulse.toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(cx - 7, cy - TILE * 0.045, 2.6, 0, Math.PI * 2);
  ctx.arc(cx + 7, cy - TILE * 0.045, 2.6, 0, Math.PI * 2);
  ctx.fill();
  // stubby horns
  ctx.fillStyle = '#7C2D12';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * TILE * 0.22, cy - TILE * 0.27);
    ctx.lineTo(cx + side * TILE * 0.28, cy - TILE * 0.4);
    ctx.lineTo(cx + side * TILE * 0.32, cy - TILE * 0.26);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBomber(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, seed = 0) {
  const px = fx * TILE, py = fy * TILE;
  const cx = px + TILE / 2;
  const wob = Math.sin(t / 320 + seed * 1.5);
  const cy = py + TILE * 0.4 + wob * 1.8;
  // round indigo body
  ctx.fillStyle = '#6366F1';
  ctx.beginPath();
  ctx.ellipse(cx, cy, TILE * 0.3, TILE * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(cx - 4, cy - 5, TILE * 0.12, TILE * 0.07, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // bomb-bay hatch underneath, with the next bomb peeking out
  ctx.fillStyle = '#312E81';
  ctx.beginPath();
  ctx.ellipse(cx, cy + TILE * 0.2, TILE * 0.16, TILE * 0.09, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#1F2937';
  ctx.beginPath();
  ctx.arc(cx, cy + TILE * 0.24 + wob * 0.8, 4.2, 0, Math.PI * 2);
  ctx.fill();
  // single big eye, scanning for you
  ctx.fillStyle = '#F4F7FA';
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1E1B4B';
  ctx.beginPath();
  ctx.arc(cx + Math.sin(t / 700 + seed) * 3, cy - 1, 3.2, 0, Math.PI * 2);
  ctx.fill();
  // side fins
  ctx.fillStyle = '#4F46E5';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * TILE * 0.28, cy - 3);
    ctx.lineTo(cx + side * TILE * 0.42, cy + 2 + wob * side);
    ctx.lineTo(cx + side * TILE * 0.28, cy + 6);
    ctx.closePath();
    ctx.fill();
  }
}

function drawBombSprite(ctx: CanvasRenderingContext2D, bx: number, by: number, t: number) {
  const wig = Math.sin(t / 90 + bx) * 1.5;
  ctx.fillStyle = '#1F2937';
  ctx.beginPath();
  ctx.arc(bx + wig, by, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.arc(bx + wig - 2, by - 2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // sparking fuse on top
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(bx + wig, by - 6);
  ctx.lineTo(bx + wig + 2, by - 10);
  ctx.stroke();
  const spark = 0.5 + 0.5 * Math.sin(t / 60);
  ctx.fillStyle = `rgba(253,224,71,${(0.4 + 0.6 * spark).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(bx + wig + 2, by - 11, 1.6 + spark * 1.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawAmmo(ctx: CanvasRenderingContext2D, fx: number, fy: number, t: number, seed = 0) {
  const cx = fx * TILE + TILE / 2;
  const cy = fy * TILE + TILE / 2 + Math.sin(t / 260 + seed) * 2;
  const pulse = 0.5 + 0.5 * Math.abs(Math.sin(t / 420 + seed));
  // glow halo
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
  glow.addColorStop(0, `rgba(253,224,71,${(0.35 + 0.3 * pulse).toFixed(3)})`);
  glow.addColorStop(1, 'rgba(253,224,71,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - 16, cy - 16, 32, 32);
  // capsule
  ctx.fillStyle = '#0F172A';
  roundedRect(ctx, cx - 8, cy - 10, 16, 20, 7);
  ctx.fill();
  ctx.strokeStyle = '#FDE047';
  ctx.lineWidth = 2;
  roundedRect(ctx, cx - 8, cy - 10, 16, 20, 7);
  ctx.stroke();
  // lightning bolt
  ctx.fillStyle = '#FDE047';
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 7);
  ctx.lineTo(cx - 4, cy + 1);
  ctx.lineTo(cx - 0.5, cy + 1);
  ctx.lineTo(cx - 2, cy + 7);
  ctx.lineTo(cx + 4, cy - 1);
  ctx.lineTo(cx + 0.5, cy - 1);
  ctx.closePath();
  ctx.fill();
}

function drawSpring(ctx: CanvasRenderingContext2D, px: number, py: number, squash: number) {
  const cx = px + TILE / 2;
  const base = py + TILE;
  const height = TILE * (0.5 - squash * 0.28);
  // base plate
  ctx.fillStyle = '#6B7280';
  ctx.fillRect(px + TILE * 0.2, base - 3, TILE * 0.6, 3);
  // coil
  ctx.strokeStyle = '#9CA3AF';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const coils = 4;
  for (let i = 0; i <= coils; i++) {
    const yy = base - 3 - (height * i) / coils;
    const side = i % 2 === 0 ? -1 : 1;
    if (i === 0) ctx.moveTo(cx + side * TILE * 0.18, yy);
    else ctx.lineTo(cx + side * TILE * 0.18, yy);
  }
  ctx.stroke();
  // top pad
  ctx.fillStyle = '#EF4444';
  ctx.fillRect(px + TILE * 0.14, base - 3 - height - 5, TILE * 0.72, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(px + TILE * 0.14, base - 3 - height - 5, TILE * 0.72, 2);
}

/** The parametric bot sprite — used in-game and for Garage/gallery portraits */
export function drawBot(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, w: number, h: number,
  facing: 1 | -1, t: number, cfg: BotConfig,
  opts: { moving?: boolean } = {},
) {
  const cx = px + w / 2;
  const u = w / 26.4; // scale unit relative to the in-game sprite size

  // feet
  const roll = opts.moving ? Math.sin(t / 50) * 1.5 * u : 0;
  if (cfg.feet === 'duck') {
    ctx.fillStyle = '#F59E0B';
    const waddle = opts.moving ? Math.sin(t / 90) * 0.2 : 0;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(cx + side * w * 0.22, py + h - 2.5 * u);
      ctx.rotate(side * 0.1 + waddle * side);
      ctx.beginPath();
      ctx.moveTo(-4.5 * u, 0);
      ctx.quadraticCurveTo(0, -2.5 * u, 4.5 * u, 0);
      ctx.lineTo(6 * u, 3.6 * u);
      ctx.lineTo(2 * u, 2.2 * u);
      ctx.lineTo(0, 3.9 * u);
      ctx.lineTo(-2 * u, 2.2 * u);
      ctx.lineTo(-6 * u, 3.6 * u);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else if (cfg.feet === 'sneakers') {
    for (const side of [-1, 1]) {
      const fx = cx + side * w * 0.28 - 5.5 * u;
      const fy = py + h - 7 * u + (side > 0 ? roll : -roll);
      ctx.fillStyle = '#FFFFFF';
      roundedRect(ctx, fx, fy, 11 * u, 5 * u, 2.4 * u);
      ctx.fill();
      ctx.fillStyle = '#1E2A3A';
      ctx.fillRect(fx, fy + 4 * u, 11 * u, 2 * u);
      ctx.fillStyle = cfg.accent;
      ctx.fillRect(fx + 2 * u, fy + 1.2 * u, 3 * u, 1.6 * u);
    }
  } else if (cfg.feet === 'springs') {
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1.6 * u;
    const squish = opts.moving ? Math.abs(Math.sin(t / 110)) * 1.5 * u : 0;
    for (const side of [-1, 1]) {
      const sx = cx + side * w * 0.26;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yy = py + h - 8 * u + squish + i * (1.8 * u - squish / 3);
        ctx.moveTo(sx - 3.5 * u, yy);
        ctx.lineTo(sx + 3.5 * u, yy + 0.9 * u);
      }
      ctx.stroke();
      ctx.fillStyle = '#6B7280';
      ctx.fillRect(sx - 4 * u, py + h - 1.5 * u, 8 * u, 1.8 * u);
    }
  } else {
    // wheels
    ctx.fillStyle = '#1E2A3A';
    ctx.beginPath();
    ctx.arc(cx - w * 0.28, py + h - 4 * u + roll, 5 * u, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.28, py + h - 4 * u - roll, 5 * u, 0, Math.PI * 2);
    ctx.fill();
  }

  // body + sheen
  ctx.fillStyle = cfg.body;
  roundedRect(ctx, px, py + 2 * u, w, h - 8 * u, 7 * u);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundedRect(ctx, px + 3 * u, py + 4 * u, w - 6 * u, (h - 8 * u) * 0.3, 5 * u);
  ctx.fill();

  // eyes
  const eyeY = py + h * 0.34;
  if (cfg.eyes === 'round') {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#F4F7FA';
      ctx.beginPath();
      ctx.arc(cx + side * w * 0.17, eyeY, w * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12202E';
      ctx.beginPath();
      ctx.arc(cx + side * w * 0.17 + facing * w * 0.05, eyeY, w * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (cfg.eyes === 'googly') {
    // mismatched sizes, pupils wandering opposite ways — maximum derp
    const wob = Math.sin(t / 300);
    for (const side of [-1, 1]) {
      const r = side < 0 ? w * 0.17 : w * 0.12;
      ctx.fillStyle = '#F4F7FA';
      ctx.beginPath();
      ctx.arc(cx + side * w * 0.17, eyeY - (side < 0 ? 1.5 * u : 0), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12202E';
      ctx.beginPath();
      ctx.arc(
        cx + side * w * 0.17 + Math.cos(wob + side * 2) * r * 0.35,
        eyeY - (side < 0 ? 1.5 * u : 0) + Math.sin(wob + side * 2) * r * 0.35,
        r * 0.42, 0, Math.PI * 2,
      );
      ctx.fill();
    }
  } else if (cfg.eyes === 'cyclops') {
    ctx.fillStyle = '#F4F7FA';
    ctx.beginPath();
    ctx.arc(cx, eyeY, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = cfg.accent;
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.arc(cx, eyeY, w * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#12202E';
    ctx.beginPath();
    ctx.arc(cx + facing * w * 0.07, eyeY, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // visor / sleepy share the wide visor shape
    ctx.fillStyle = '#F4F7FA';
    ctx.beginPath();
    ctx.ellipse(cx + facing * 2 * u, eyeY, w * 0.3, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12202E';
    ctx.beginPath();
    ctx.arc(cx + facing * (w * 0.14), eyeY + (cfg.eyes === 'sleepy' ? h * 0.07 : 0), 3.6 * u, 0, Math.PI * 2);
    ctx.fill();
    if (cfg.eyes === 'sleepy') {
      // heavy eyelid
      ctx.fillStyle = cfg.body;
      ctx.beginPath();
      ctx.ellipse(cx + facing * 2 * u, eyeY - h * 0.1, w * 0.31, h * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // headgear
  ctx.fillStyle = cfg.accent;
  if (cfg.hat === 'antenna') {
    ctx.fillRect(cx - 1.5 * u, py - 6 * u, 3 * u, 8 * u);
    ctx.beginPath();
    ctx.arc(cx, py - 7 * u, 3.5 * u, 0, Math.PI * 2);
    ctx.fill();
  } else if (cfg.hat === 'cap') {
    ctx.beginPath();
    ctx.arc(cx, py + 3 * u, w * 0.34, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx + (facing > 0 ? 0 : -w * 0.52), py + 1.4 * u, w * 0.52, 2.6 * u);
  } else if (cfg.hat === 'fin') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.16, py + 3 * u);
    ctx.lineTo(cx, py - 9 * u);
    ctx.lineTo(cx + w * 0.16, py + 3 * u);
    ctx.closePath();
    ctx.fill();
  } else if (cfg.hat === 'mohawk') {
    // four punk spikes leaning away from the direction of travel
    const heights = [7, 10, 9, 6];
    for (let i = 0; i < 4; i++) {
      const bx = cx + (i - 1.5) * w * 0.12;
      ctx.beginPath();
      ctx.moveTo(bx - 2.2 * u, py + 3 * u);
      ctx.lineTo(bx - facing * 1.6 * u, py - heights[i] * u);
      ctx.lineTo(bx + 2.6 * u, py + 3 * u);
      ctx.closePath();
      ctx.fill();
    }
  } else if (cfg.hat === 'propeller') {
    // beanie dome + spinning blade (spins faster while moving)
    ctx.beginPath();
    ctx.arc(cx, py + 3 * u, w * 0.3, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1.4 * u;
    ctx.beginPath();
    ctx.moveTo(cx, py - 3 * u);
    ctx.lineTo(cx, py - 7 * u);
    ctx.stroke();
    const spin = Math.sin(t / (opts.moving ? 60 : 200));
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.ellipse(cx, py - 7.5 * u, Math.max(Math.abs(spin) * 9 * u, 1.5 * u), 1.8 * u, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (cfg.hat === 'party') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.18, py + 3 * u);
    ctx.lineTo(cx, py - 10 * u);
    ctx.lineTo(cx + w * 0.18, py + 3 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, py - 10 * u, 2.2 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2 * u;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.11, py - 1.5 * u);
    ctx.lineTo(cx + w * 0.07, py - 4.5 * u);
    ctx.stroke();
  } else {
    // crown
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.26, py + 3 * u);
    ctx.lineTo(cx - w * 0.26, py - 5 * u);
    ctx.lineTo(cx - w * 0.13, py - 1 * u);
    ctx.lineTo(cx, py - 7 * u);
    ctx.lineTo(cx + w * 0.13, py - 1 * u);
    ctx.lineTo(cx + w * 0.26, py - 5 * u);
    ctx.lineTo(cx + w * 0.26, py + 3 * u);
    ctx.closePath();
    ctx.fill();
  }

  // chest decal
  if (cfg.decal !== 'none') {
    const glyph = cfg.decal === 'star' ? '⭐'
      : cfg.decal === 'bolt' ? '⚡'
      : cfg.decal === 'heart' ? '❤️'
      : cfg.decal === 'pizza' ? '🍕'
      : '🌈';
    ctx.font = `${Math.round(w * 0.34)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, cx, py + h * 0.66);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, s: GameState, t: number, cfg: BotConfig) {
  const p = s.player;
  if (s.timeMs < p.invulnUntil && Math.floor(t / 90) % 2 === 0) return;
  const px = p.x * TILE, py = p.y * TILE;
  const w = PW * TILE, h = PH * TILE;
  const cx = px + w / 2;
  const stretch = p.grounded ? 1 : 1.08;

  ctx.save();
  ctx.translate(cx, py + h);
  ctx.scale(1, stretch);
  ctx.translate(-cx, -(py + h));
  drawBot(ctx, px, py, w, h, p.facing, t, cfg, { moving: p.vx !== 0 });
  ctx.restore();
}

/** Defender: the student's bot piloting a flying saucer */
function drawShip(ctx: CanvasRenderingContext2D, s: GameState, t: number, cfg: BotConfig) {
  const p = s.player;
  if (s.timeMs < p.invulnUntil && Math.floor(t / 90) % 2 === 0) return;
  const px = p.x * TILE, py = p.y * TILE;
  const w = PW * TILE, h = PH * TILE;
  const cx = px + w / 2;
  const bob = Math.sin(t / 380) * 1.5;
  const dishY = py + h - 7 + bob;

  // engine glow
  const glow = ctx.createRadialGradient(cx, dishY + 8, 0, cx, dishY + 8, w * 0.6);
  glow.addColorStop(0, 'rgba(57,208,255,0.5)');
  glow.addColorStop(1, 'rgba(57,208,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - w * 0.6, dishY, w * 1.2, w * 0.7);

  // the pilot (feet hidden inside the dish drawn after)
  const bw = w * 0.72, bh = h * 0.62;
  drawBot(ctx, cx - bw / 2, dishY - bh + 4, bw, bh, p.facing, t, cfg, { moving: p.vx !== 0 });

  // saucer dish
  ctx.fillStyle = '#8FA6C8';
  ctx.beginPath();
  ctx.ellipse(cx, dishY, w * 0.62, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5F7398';
  ctx.beginPath();
  ctx.ellipse(cx, dishY + 3, w * 0.5, 6, 0, 0, Math.PI);
  ctx.fill();
  // running lights chase around the rim
  for (let i = 0; i < 3; i++) {
    const on = Math.floor(t / 220 + i) % 3 === 0;
    ctx.fillStyle = on ? '#FFD54A' : 'rgba(255,213,74,0.3)';
    ctx.beginPath();
    ctx.arc(cx + (i - 1) * w * 0.36, dishY + 1, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBombs(ctx: CanvasRenderingContext2D, s: GameState, t: number) {
  for (const b of s.bombs) drawBombSprite(ctx, b.x * TILE, b.y * TILE, t);
}

function drawBlasters(ctx: CanvasRenderingContext2D, s: GameState) {
  for (const b of s.blasters) {
    const bx = b.x * TILE, by = b.y * TILE;
    const glow = ctx.createRadialGradient(bx, by - 7, 0, bx, by - 7, 12);
    glow.addColorStop(0, 'rgba(57,208,255,0.6)');
    glow.addColorStop(1, 'rgba(57,208,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(bx - 12, by - 19, 24, 24);
    ctx.strokeStyle = '#AEE9FF';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by - TILE * 0.35);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bx, by - 2);
    ctx.lineTo(bx, by - TILE * 0.35 + 2);
    ctx.stroke();
  }
}

/** Big idle bot for the Garage preview and gallery cards */
export function renderBotPortrait(ctx: CanvasRenderingContext2D, cw: number, ch: number, t: number, cfg: BotConfig) {
  ctx.clearRect(0, 0, cw, ch);
  const w = cw * 0.52;
  const h = w * (PH / PW);
  const bob = Math.sin(t / 420) * ch * 0.015;
  drawBot(ctx, (cw - w) / 2, (ch - h) / 2 + bob, w, h, 1, t, cfg, { moving: false });
}

// ── HUD (screen space) ───────────────────────────────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, s: GameState, w: number) {
  ctx.save();
  ctx.font = 'bold 17px sans-serif';
  ctx.textBaseline = 'middle';
  // lives — hearts support quarter-fills (defender partial damage)
  ctx.textAlign = 'left';
  for (let i = 0; i < 3; i++) {
    const hx = 12 + i * 21;
    const frac = Math.max(0, Math.min(1, s.lives - i));
    if (frac >= 1) ctx.fillText('❤️', hx, 20);
    else if (frac <= 0) ctx.fillText('🖤', hx, 20);
    else {
      ctx.fillText('🖤', hx, 20);
      ctx.save();
      ctx.beginPath();
      ctx.rect(hx, 6, 19 * frac, 28);
      ctx.clip();
      ctx.fillText('❤️', hx, 20);
      ctx.restore();
    }
  }
  // defender: aliens-remaining counter; platformer: defeated-enemies counter
  if (s.genre === 'defender') {
    const left = s.entities.filter(e => (e.type === 'alien' || e.type === 'brute' || e.type === 'bomber') && e.alive).length;
    const al = `👽 ${left}`;
    const aw = ctx.measureText(al).width;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, 78, 8, aw + 18, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#D8FF6A';
    ctx.fillText(al, 87, 20);
    // shots remaining (only when a shot-limit block is in play)
    if (s.ammo !== null) {
      const sl = `🔫 ${s.ammo}`;
      const sw = ctx.measureText(sl).width;
      const sx = 78 + aw + 26;
      ctx.fillStyle = s.ammo <= 0 ? 'rgba(153,27,27,0.55)' : 'rgba(0,0,0,0.35)';
      roundedRect(ctx, sx, 8, sw + 18, 24, 12);
      ctx.fill();
      ctx.fillStyle = s.ammo <= 3 ? '#FCA5A5' : '#AEE9FF';
      ctx.fillText(sl, sx + 9, 20);
    }
  } else if (s.kills > 0) {
    const kl = `👾 ${s.kills}`;
    const kw = ctx.measureText(kl).width;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, 78, 8, kw + 18, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(kl, 87, 20);
  }
  // run timer (hundredths — the future leaderboard stat)
  const secs = (s.timeMs / 1000).toFixed(2);
  ctx.textAlign = 'center';
  const tw2 = ctx.measureText(`⏱ ${secs}`).width;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundedRect(ctx, w / 2 - tw2 / 2 - 10, 8, tw2 + 20, 24, 12);
  ctx.fill();
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(`⏱ ${secs}`, w / 2, 20);
  // score pill (no coin total when the level has no coins, e.g. defender)
  const label = s.coinsTotal > 0 ? `✦ ${s.score} / ${s.coinsTotal}` : `✦ ${s.score}`;
  ctx.textAlign = 'right';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundedRect(ctx, w - tw - 30, 8, tw + 20, 24, 12);
  ctx.fill();
  ctx.fillStyle = '#FFD54A';
  ctx.fillText(label, w - 18, 20);
  ctx.restore();
}

// ── Shared world pass (called inside a camera-translated context) ────────────

function drawWorld(
  ctx: CanvasRenderingContext2D,
  def: GameDef,
  solids: Set<string>,
  entities: { type: ObjectType; alive?: boolean; px: number; py: number; dir?: 1 | -1; id?: number; springSquash?: number; hp?: number; maxHp?: number }[],
  t: number,
  camX: number,
  camY: number,
) {
  const c0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const c1 = Math.min(def.cols - 1, Math.ceil((camX + VIEW_W) / TILE) + 1);
  const r0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const r1 = Math.min(def.rows - 1, Math.ceil((camY + VIEW_H) / TILE) + 1);

  for (const o of def.objects) {
    if (o.type !== 'platform') continue;
    if (o.x < c0 || o.x > c1 || o.y < r0 || o.y > r1) continue;
    drawTile(ctx, def.backdrop, o.x, o.y, solids.has(`${o.x},${o.y - 1}`));
  }

  for (const e of entities) {
    if (e.alive === false) continue;
    if (e.px < c0 - 1 || e.px > c1 + 1 || e.py < r0 - 1 || e.py > r1 + 1) continue;
    if (e.type === 'coin') drawCoin(ctx, e.px * TILE, e.py * TILE, t, (e.id ?? e.px + e.py * 7));
    else if (e.type === 'spike') drawSpike(ctx, e.px * TILE, e.py * TILE);
    else if (e.type === 'flag') drawFlag(ctx, e.px * TILE, e.py * TILE, t);
    else if (e.type === 'enemy') drawEnemy(ctx, e.px, e.py, e.dir ?? 1, t, (e.maxHp ?? 1) - (e.hp ?? 1));
    else if (e.type === 'spiky') drawSpiky(ctx, e.px, e.py, e.dir ?? 1, t);
    else if (e.type === 'flyer') drawFlyer(ctx, e.px, e.py, e.dir ?? 1, t, (e.maxHp ?? 1) - (e.hp ?? 1));
    else if (e.type === 'spring') drawSpring(ctx, e.px * TILE, e.py * TILE, e.springSquash ?? 0);
    else if (e.type === 'alien') drawAlien(ctx, e.px, e.py, t, e.id ?? e.px + e.py * 7);
    else if (e.type === 'brute') drawBrute(ctx, e.px, e.py, t, e.id ?? e.px + e.py * 7, (e.maxHp ?? 1) - (e.hp ?? 1));
    else if (e.type === 'bomber') drawBomber(ctx, e.px, e.py, t, e.id ?? e.px + e.py * 7);
    else if (e.type === 'ammo') drawAmmo(ctx, e.px, e.py, t, e.id ?? e.px + e.py * 7);
  }
}

// ── Play mode ────────────────────────────────────────────────────────────────

export function renderGame(
  ctx: CanvasRenderingContext2D,
  def: GameDef,
  state: GameState,
  t: number,
  bot?: BotConfig,
) {
  const cam = cameraFor(def, state);

  drawBackdrop(ctx, def.backdrop, VIEW_W, VIEW_H, t, cam.x, cam.y);

  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawWorld(ctx, def, state.solids, state.entities, t, cam.x, cam.y);
  if (state.genre === 'defender') {
    drawBlasters(ctx, state);
    drawBombs(ctx, state, t);
    drawShip(ctx, state, t, bot ?? defaultBot());
  } else {
    drawPlayer(ctx, state, t, bot ?? defaultBot());
  }
  ctx.restore();

  drawHUD(ctx, state, VIEW_W);
}

// ── Design mode ──────────────────────────────────────────────────────────────

function drawSpawnMarker(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  const px = x * TILE, py = y * TILE;
  const cx = px + TILE / 2;
  ctx.save();
  ctx.globalAlpha = 0.55 + Math.sin(t / 500) * 0.12;
  ctx.fillStyle = '#4C8DFF';
  roundedRect(ctx, cx - 13, py + 8, 26, 26, 7);
  ctx.fill();
  ctx.fillStyle = '#F4F7FA';
  ctx.beginPath();
  ctx.ellipse(cx, py + 18, 8, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#12202E';
  ctx.beginPath();
  ctx.arc(cx + 2, py + 18, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFD54A';
  ctx.fillRect(cx - 1.5, py + 2, 3, 7);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('START', cx, py + TILE + 11);
}

export interface DesignHover {
  x: number;
  y: number;
  tool: ObjectType | 'eraser';
}

export function renderDesign(
  ctx: CanvasRenderingContext2D,
  def: GameDef,
  t: number,
  hover: DesignHover | null,
  view: { x: number; y: number },
) {
  const solids = solidSet(def);

  drawBackdrop(ctx, def.backdrop, VIEW_W, VIEW_H, t, view.x, view.y);

  ctx.save();
  ctx.translate(-view.x, -view.y);

  const entities = def.objects
    .filter(o => o.type !== 'platform' && o.type !== 'spawn')
    .map(o => ({ type: o.type, px: o.x, py: o.y, dir: 1 as const }));
  drawWorld(ctx, def, solids, entities, t, view.x, view.y);

  for (const o of def.objects) {
    if (o.type === 'spawn') drawSpawnMarker(ctx, o.x, o.y, t);
    else if (o.type === 'enemy' || o.type === 'spiky' || o.type === 'flyer' || o.type === 'alien' || o.type === 'brute' || o.type === 'bomber' || o.type === 'ammo') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(o.type === 'flyer' ? '〰' : o.type === 'ammo' ? '↓' : '↔', o.x * TILE + TILE / 2, o.y * TILE + 2);
    }
  }

  // grid over the visible range
  const c0 = Math.max(1, Math.floor(view.x / TILE));
  const c1 = Math.min(def.cols - 1, Math.ceil((view.x + VIEW_W) / TILE));
  const r0 = Math.max(1, Math.floor(view.y / TILE));
  const r1 = Math.min(def.rows - 1, Math.ceil((view.y + VIEW_H) / TILE));
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  for (let x = c0; x <= c1; x++) {
    ctx.beginPath(); ctx.moveTo(x * TILE + 0.5, view.y); ctx.lineTo(x * TILE + 0.5, view.y + VIEW_H); ctx.stroke();
  }
  for (let y = r0; y <= r1; y++) {
    ctx.beginPath(); ctx.moveTo(view.x, y * TILE + 0.5); ctx.lineTo(view.x + VIEW_W, y * TILE + 0.5); ctx.stroke();
  }

  // level edge marker
  ctx.strokeStyle = 'rgba(255,213,74,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, def.cols * TILE - 3, def.rows * TILE - 3);

  // hover highlight
  if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < def.cols && hover.y < def.rows) {
    const hx = hover.x * TILE, hy = hover.y * TILE;
    const erasing = hover.tool === 'eraser';
    ctx.fillStyle = erasing ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.2)';
    ctx.fillRect(hx, hy, TILE, TILE);
    ctx.strokeStyle = erasing ? '#EF4444' : '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
  }

  ctx.restore();
}

// ── Minimap ──────────────────────────────────────────────────────────────────

const MINI_COLORS: Record<string, string> = {
  coin: '#FFD54A', spike: '#EF4444', enemy: '#B06AE8', flag: '#22C55E', spawn: '#4C8DFF',
  spiky: '#F87171', flyer: '#38BDF8', spring: '#A3A3A3', alien: '#7CDB4F',
  brute: '#F97316', bomber: '#818CF8', ammo: '#FDE047',
};

/** Draws the whole level small + the current viewport rectangle. Returns scale. */
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  def: GameDef,
  view: { x: number; y: number },
  miniW: number,
  miniH: number,
  playerPos?: { x: number; y: number },
  /** Play mode: live entity positions (marching aliens!) instead of design spots */
  live?: { type: ObjectType; alive: boolean; px: number; py: number }[],
): number {
  const levelW = def.cols * TILE;
  const levelH = def.rows * TILE;
  const scale = Math.min(miniW / levelW, miniH / levelH);

  ctx.clearRect(0, 0, miniW, miniH);
  ctx.fillStyle = 'rgba(10,16,32,0.92)';
  ctx.fillRect(0, 0, def.cols * TILE * scale, def.rows * TILE * scale);

  const tileStyle = TILE_STYLE[def.backdrop];
  const sz = Math.max(2, TILE * scale);
  for (const o of def.objects) {
    if (live && o.type !== 'platform') continue; // live entities drawn below
    ctx.fillStyle = o.type === 'platform' ? tileStyle.top : (MINI_COLORS[o.type] ?? '#fff');
    ctx.fillRect(o.x * TILE * scale, o.y * TILE * scale, sz, sz);
  }
  if (live) {
    for (const e of live) {
      if (!e.alive) continue;
      ctx.fillStyle = MINI_COLORS[e.type] ?? '#fff';
      ctx.fillRect(e.px * TILE * scale, e.py * TILE * scale, sz, sz);
    }
  }

  if (playerPos) {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(playerPos.x * TILE * scale, playerPos.y * TILE * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#FFD54A';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(view.x * scale + 0.5, view.y * scale + 0.5, VIEW_W * scale - 1, VIEW_H * scale - 1);

  return scale;
}
