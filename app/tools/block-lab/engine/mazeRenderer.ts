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

/** Deterministic pseudo-random in [0,1) from cell coords — stable across frames */
function hash2(r: number, c: number, salt = 0): number {
  let h = r * 374761393 + c * 668265263 + salt * 1274126177;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

// ── Scenery: desert ──────────────────────────────────────────────────────────

function drawCactus(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.fillStyle = '#3E7D3A';
  roundedRect(ctx, cx - s * 0.09, cy - s * 0.3, s * 0.18, s * 0.58, s * 0.09);
  ctx.fill();
  // arms
  roundedRect(ctx, cx - s * 0.28, cy - s * 0.14, s * 0.2, s * 0.09, s * 0.045);
  ctx.fill();
  roundedRect(ctx, cx - s * 0.28, cy - s * 0.14, s * 0.09, s * 0.22, s * 0.045);
  ctx.fill();
  roundedRect(ctx, cx + s * 0.08, cy - s * 0.04, s * 0.2, s * 0.09, s * 0.045);
  ctx.fill();
  roundedRect(ctx, cx + s * 0.19, cy - s * 0.18, s * 0.09, s * 0.23, s * 0.045);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundedRect(ctx, cx - s * 0.06, cy - s * 0.28, s * 0.05, s * 0.5, s * 0.025);
  ctx.fill();
}

function drawRock(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.fillStyle = '#8A7358';
  ctx.beginPath();
  ctx.ellipse(cx, cy + s * 0.08, s * 0.26, s * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#A08A6C';
  ctx.beginPath();
  ctx.ellipse(cx - s * 0.07, cy + s * 0.02, s * 0.15, s * 0.11, -0.3, 0, Math.PI * 2);
  ctx.fill();
}

// ── Scenery: forest ──────────────────────────────────────────────────────────

function drawMushroom(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.fillStyle = '#E8DCC8';
  roundedRect(ctx, cx - s * 0.05, cy - s * 0.02, s * 0.1, s * 0.16, s * 0.03);
  ctx.fill();
  ctx.fillStyle = '#D2483E';
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.02, s * 0.15, s * 0.1, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(cx - s * 0.06, cy - s * 0.07, s * 0.026, 0, Math.PI * 2);
  ctx.arc(cx + s * 0.05, cy - 0.05 * s, s * 0.022, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlower(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, seed: number) {
  const petal = seed > 0.5 ? '#F2A7C3' : '#F5E06E';
  ctx.fillStyle = petal;
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * s * 0.055, cy + Math.sin(a) * s * 0.055, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#B85C00';
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

// ── Scenery: space ───────────────────────────────────────────────────────────

function drawDish(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number) {
  ctx.strokeStyle = '#8FA3C8';
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.14);
  ctx.lineTo(cx, cy - s * 0.05);
  ctx.stroke();
  ctx.fillStyle = '#A8BCE0';
  ctx.beginPath();
  ctx.ellipse(cx, cy - s * 0.1, s * 0.14, s * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fill();
  const blink = Math.sin(t / 400 + cx) > 0.4;
  if (blink) {
    ctx.fillStyle = '#FF5C5C';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.16, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Board ────────────────────────────────────────────────────────────────────

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
  const isPath = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < rows && c < cols && grid[r][c] === 0;

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

  // Cell fills
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW;
      const cy = r * cellH;
      if (grid[r][c] === 1) {
        if (theme.name === 'forest') {
          // hedge base — canopy blobs drawn in decor pass
          ctx.fillStyle = theme.wallShade;
          ctx.fillRect(cx, cy, cellW, cellH);
        } else {
          ctx.fillStyle = theme.wallFill;
          ctx.fillRect(cx, cy, cellW, cellH);
          ctx.fillStyle = theme.wallHighlight;
          ctx.fillRect(cx, cy, cellW, 3);
          ctx.fillRect(cx, cy, 3, cellH);
          ctx.fillStyle = theme.wallShade;
          ctx.fillRect(cx, cy + cellH - 3, cellW, 3);
          ctx.fillRect(cx + cellW - 3, cy, 3, cellH);
        }
      } else {
        ctx.fillStyle = (r + c) % 2 === 0 ? theme.pathFill : theme.pathFill2;
        ctx.fillRect(cx, cy, cellW, cellH);
      }
    }
  }

  // Space: twinkling starfield over path cells
  if (theme.name === 'space') {
    const starCount = Math.floor((width * height) / 2200);
    for (let i = 0; i < starCount; i++) {
      const sx = hash2(i, 7, 1) * width;
      const sy = hash2(i, 13, 2) * height;
      if (!isPath(Math.floor(sy / cellH), Math.floor(sx / cellW))) continue;
      const tw = 0.25 + 0.75 * Math.abs(Math.sin(t / 700 + i * 1.7));
      const sr = 0.6 + hash2(i, 3, 3) * 1.1;
      ctx.fillStyle = `rgba(220,236,255,${(0.35 + 0.55 * tw).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr * tw, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Grid lines (subtle)
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

  // Decor pass
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = c * cellW + cellW / 2;
      const cy = r * cellH + cellH / 2;
      const s = Math.min(cellW, cellH);
      const h = hash2(r, c);

      if (grid[r][c] === 1) {
        if (theme.name === 'desert') {
          if (h < 0.12) drawCactus(ctx, cx, cy, s);
          else if (h < 0.26) drawRock(ctx, cx, cy, s);
        } else if (theme.name === 'forest') {
          // canopy blobs with a gentle sway
          const sway = Math.sin(t / 1100 + (r * 3 + c) * 0.9) * s * 0.02;
          const blobs = 3 + Math.floor(h * 2);
          for (let b = 0; b < blobs; b++) {
            const bx = cx + (hash2(r, c, 10 + b) - 0.5) * s * 0.55 + sway;
            const by = cy + (hash2(r, c, 20 + b) - 0.5) * s * 0.55;
            const br = s * (0.22 + hash2(r, c, 30 + b) * 0.14);
            ctx.fillStyle = hash2(r, c, 40 + b) < 0.5 ? theme.wallFill : theme.wallHighlight;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
          }
          if (h > 0.8) {
            // berries
            ctx.fillStyle = '#D2483E';
            for (let b = 0; b < 3; b++) {
              ctx.beginPath();
              ctx.arc(
                cx + (hash2(r, c, 50 + b) - 0.5) * s * 0.5,
                cy + (hash2(r, c, 60 + b) - 0.5) * s * 0.5,
                s * 0.035, 0, Math.PI * 2,
              );
              ctx.fill();
            }
          } else if (h < 0.1) {
            drawMushroom(ctx, cx + s * 0.15, cy + s * 0.2, s);
          }
        } else if (theme.name === 'space') {
          // metal panel: inset line + rivets, glow edge facing paths
          ctx.strokeStyle = 'rgba(255,255,255,0.09)';
          ctx.lineWidth = 1;
          ctx.strokeRect(c * cellW + 5.5, r * cellH + 5.5, cellW - 11, cellH - 11);
          if (h < 0.6) {
            ctx.fillStyle = 'rgba(200,220,255,0.28)';
            const inset = 9;
            for (const [dx, dy] of [[inset, inset], [cellW - inset, inset], [inset, cellH - inset], [cellW - inset, cellH - inset]]) {
              ctx.beginPath();
              ctx.arc(c * cellW + dx, r * cellH + dy, 1.6, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          if (h > 0.92) drawDish(ctx, cx, cy - s * 0.05, s, t);
          const glow = 0.25 + 0.15 * Math.sin(t / 900 + r + c);
          ctx.strokeStyle = `rgba(57,208,255,${glow.toFixed(3)})`;
          ctx.lineWidth = 2;
          if (isPath(r + 1, c)) { ctx.beginPath(); ctx.moveTo(c * cellW + 2, (r + 1) * cellH - 1); ctx.lineTo((c + 1) * cellW - 2, (r + 1) * cellH - 1); ctx.stroke(); }
          if (isPath(r - 1, c)) { ctx.beginPath(); ctx.moveTo(c * cellW + 2, r * cellH + 1); ctx.lineTo((c + 1) * cellW - 2, r * cellH + 1); ctx.stroke(); }
          if (isPath(r, c + 1)) { ctx.beginPath(); ctx.moveTo((c + 1) * cellW - 1, r * cellH + 2); ctx.lineTo((c + 1) * cellW - 1, (r + 1) * cellH - 2); ctx.stroke(); }
          if (isPath(r, c - 1)) { ctx.beginPath(); ctx.moveTo(c * cellW + 1, r * cellH + 2); ctx.lineTo(c * cellW + 1, (r + 1) * cellH - 2); ctx.stroke(); }
        }
      } else {
        // path decor
        if (theme.name === 'desert') {
          ctx.fillStyle = 'rgba(160,120,60,0.28)';
          for (let d = 0; d < 3; d++) {
            if (hash2(r, c, 70 + d) < 0.5) continue;
            ctx.beginPath();
            ctx.arc(
              c * cellW + hash2(r, c, 80 + d) * cellW,
              r * cellH + hash2(r, c, 90 + d) * cellH,
              1.4, 0, Math.PI * 2,
            );
            ctx.fill();
          }
        } else if (theme.name === 'forest') {
          if (h < 0.3) {
            // grass tufts
            ctx.strokeStyle = 'rgba(60,120,40,0.5)';
            ctx.lineWidth = 1.2;
            const gx = c * cellW + (0.25 + hash2(r, c, 100) * 0.5) * cellW;
            const gy = r * cellH + (0.3 + hash2(r, c, 101) * 0.5) * cellH;
            for (let g = -1; g <= 1; g++) {
              ctx.beginPath();
              ctx.moveTo(gx + g * 3, gy + 4);
              ctx.quadraticCurveTo(gx + g * 4, gy - 1, gx + g * 5.5, gy - 4);
              ctx.stroke();
            }
          } else if (h > 0.93) {
            drawFlower(ctx, c * cellW + cellW * 0.7, r * cellH + cellH * 0.3, Math.min(cellW, cellH), hash2(r, c, 102));
          }
        }
      }
    }
  }

  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 3;
  roundedRect(ctx, 1.5, 1.5, width - 3, height - 3, 14);
  ctx.stroke();
}

// ── Goal ─────────────────────────────────────────────────────────────────────

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

  if (theme.name === 'desert') {
    // waypoint flag on a sand mound
    ctx.fillStyle = 'rgba(160,120,60,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 1.15, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6B4E2E';
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 1.15);
    ctx.lineTo(cx, cy - r * 1.5);
    ctx.stroke();
    const wave = Math.sin(t / 260) * r * 0.22;
    ctx.fillStyle = theme.goalFill;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.5);
    ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 1.35 + wave * 0.5, cx + r * 1.5, cy - r * 1.1 + wave);
    ctx.lineTo(cx, cy - r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.5);
    ctx.quadraticCurveTo(cx + r * 0.5, cy - r * 1.38 + wave * 0.3, cx + r * 0.9, cy - r * 1.22 + wave * 0.6);
    ctx.lineTo(cx, cy - r * 1.1);
    ctx.closePath();
    ctx.fill();
  } else if (theme.name === 'forest') {
    // campfire
    ctx.save();
    ctx.translate(cx, cy + r * 0.55);
    ctx.fillStyle = '#7A5230';
    ctx.rotate(0.45);
    roundedRect(ctx, -r * 1.0, -r * 0.16, r * 2.0, r * 0.32, r * 0.14);
    ctx.fill();
    ctx.rotate(-0.9);
    roundedRect(ctx, -r * 1.0, -r * 0.16, r * 2.0, r * 0.32, r * 0.14);
    ctx.fill();
    ctx.restore();
    const flick = 1 + Math.sin(t / 90) * 0.12 + Math.sin(t / 47) * 0.06;
    const flame = (fr: number, fh: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy + r * 0.5 - fh * flick);
      ctx.quadraticCurveTo(cx + fr, cy + r * 0.45 - fh * 0.35, cx, cy + r * 0.62);
      ctx.quadraticCurveTo(cx - fr, cy + r * 0.45 - fh * 0.35, cx, cy + r * 0.5 - fh * flick);
      ctx.fill();
    };
    flame(r * 0.75, r * 1.7, '#F0742E');
    flame(r * 0.5, r * 1.2, '#FFB53E');
    flame(r * 0.27, r * 0.7, '#FFF3C4');
    // rising sparks
    for (let i = 0; i < 2; i++) {
      const cyc = ((t / 9 + i * 260) % 520) / 520;
      ctx.fillStyle = `rgba(255,200,90,${(1 - cyc).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(cx + Math.sin(cyc * 9 + i * 3) * r * 0.35, cy + r * 0.3 - cyc * r * 2.2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // space: swirling warp portal
    ctx.save();
    ctx.translate(cx, cy);
    const inner = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.15);
    inner.addColorStop(0, 'rgba(255,255,255,0.9)');
    inner.addColorStop(0.4, theme.goalGlow);
    inner.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.15 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.strokeStyle = theme.goalFill;
    ctx.rotate(t / 500);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.05, 0, Math.PI * 1.35);
    ctx.stroke();
    ctx.rotate(-t / 500 - t / 380);
    ctx.strokeStyle = 'rgba(142,107,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.35, 0, Math.PI * 1.1);
    ctx.stroke();
    // orbiting mote
    ctx.rotate(t / 380 + t / 240);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(r * 1.35, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ── Collectibles ─────────────────────────────────────────────────────────────

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
  const r = Math.min(cellW, cellH) * 0.22;
  const bob = Math.sin(t / 340 + x * 1.3 + y * 0.7) * 3;

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 1.5, r * 1.0, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy + bob);

  if (theme.name === 'desert') {
    // faceted crystal
    ctx.rotate(Math.sin(t / 900 + x) * 0.1);
    ctx.fillStyle = theme.itemAccent;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.8, -r * 0.2);
    ctx.lineTo(r * 0.5, r * 0.95);
    ctx.lineTo(-r * 0.5, r * 0.95);
    ctx.lineTo(-r * 0.8, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15);
    ctx.lineTo(r * 0.8, -r * 0.2);
    ctx.lineTo(0, r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,100,20,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.15); ctx.lineTo(0, r * 0.1);
    ctx.moveTo(-r * 0.8, -r * 0.2); ctx.lineTo(0, r * 0.1); ctx.lineTo(r * 0.8, -r * 0.2);
    ctx.stroke();
  } else if (theme.name === 'forest') {
    // acorn
    ctx.rotate(Math.sin(t / 700 + x * 2) * 0.12);
    ctx.fillStyle = theme.itemFill;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 0.72, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, r * 0.1, r * 0.2, r * 0.4, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5C3A1E';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.35, r * 0.82, r * 0.5, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5C3A1E';
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.8);
    ctx.quadraticCurveTo(r * 0.2, -r * 1.1, r * 0.3, -r * 1.2);
    ctx.stroke();
  } else {
    // data chip
    const glow = 0.5 + 0.5 * Math.sin(t / 300 + x + y);
    ctx.fillStyle = theme.itemFill;
    roundedRect(ctx, -r * 0.85, -r * 0.85, r * 1.7, r * 1.7, r * 0.3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundedRect(ctx, -r * 0.85, -r * 0.85, r * 1.7, r * 0.6, r * 0.3);
    ctx.fill();
    // pins
    ctx.fillStyle = '#C9D4F0';
    for (const side of [-1, 1]) {
      for (const off of [-r * 0.45, 0, r * 0.45]) {
        ctx.fillRect(side * r * 0.85 + (side > 0 ? 0 : -r * 0.28), off - r * 0.08, r * 0.28, r * 0.16);
      }
    }
    ctx.fillStyle = `rgba(57,208,255,${(0.45 + 0.55 * glow).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // sparkle
  const sp = (t / 500 + x * 0.9 + y * 1.7) % 1;
  if (sp < 0.35) {
    const sa = Math.sin((sp / 0.35) * Math.PI);
    const sxp = cx + r * 1.1;
    const syp = cy - r * 1.2 + bob;
    ctx.strokeStyle = `rgba(255,255,255,${(sa * 0.9).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    const sl = 3.5 * sa;
    ctx.beginPath();
    ctx.moveTo(sxp - sl, syp); ctx.lineTo(sxp + sl, syp);
    ctx.moveTo(sxp, syp - sl); ctx.lineTo(sxp, syp + sl);
    ctx.stroke();
  }
}

// ── STEM Bot ─────────────────────────────────────────────────────────────────

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

  // Bump offset along the facing angle
  let bx = baseCx, by = baseCy;
  if (state.bumpOffset !== 0) {
    bx += Math.cos(state.angle) * state.bumpOffset;
    by += Math.sin(state.angle) * state.bumpOffset;
  }

  ctx.translate(bx, by);

  // Shadow stays on the ground even when hopping
  const hop = state.celebrating ? Math.abs(Math.sin(state.celebrateT * 7)) * h * 0.22 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.54, w * (0.36 - hop * 0.002), h * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(0, -hop);

  if (state.celebrating) {
    ctx.rotate(Math.sin(state.celebrateT * 9) * 0.14);
  } else if (state.moving) {
    const tilt = 0.065;
    ctx.rotate(Math.cos(state.angle) * tilt + Math.sin(state.angle) * tilt * 0.5);
  } else if (state.dizzy) {
    ctx.rotate(state.bumpOffset * 0.02);
  }

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
  const eyeR = w * 0.095;
  if (state.dizzy) {
    // X-eyes
    ctx.strokeStyle = '#12202E';
    ctx.lineWidth = Math.max(2, w * 0.035);
    for (const ex of [-w * 0.18, w * 0.18]) {
      ctx.beginPath();
      ctx.moveTo(ex - eyeR * 0.7, eyeY - eyeR * 0.7); ctx.lineTo(ex + eyeR * 0.7, eyeY + eyeR * 0.7);
      ctx.moveTo(ex + eyeR * 0.7, eyeY - eyeR * 0.7); ctx.lineTo(ex - eyeR * 0.7, eyeY + eyeR * 0.7);
      ctx.stroke();
    }
  } else if (state.celebrating) {
    // happy ^ ^ eyes
    ctx.strokeStyle = '#12202E';
    ctx.lineWidth = Math.max(2, w * 0.04);
    ctx.lineCap = 'round';
    for (const ex of [-w * 0.18, w * 0.18]) {
      ctx.beginPath();
      ctx.arc(ex, eyeY + eyeR * 0.4, eyeR, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  } else {
    // eye whites, pupils glancing toward travel direction, blink
    const openness = Math.max(0.08, 1 - state.blink);
    for (const ex of [-w * 0.18, w * 0.18]) {
      ctx.fillStyle = '#F4F7FA';
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eyeR, eyeR * openness, 0, 0, Math.PI * 2);
      ctx.fill();
      if (openness > 0.25) {
        const px = Math.cos(state.angle) * w * 0.026;
        const py = Math.sin(state.angle) * w * 0.02;
        ctx.fillStyle = '#12202E';
        ctx.beginPath();
        ctx.ellipse(ex + px, eyeY + py, eyeR * 0.52, eyeR * 0.52 * openness, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(ex + px + eyeR * 0.15, eyeY + py - eyeR * 0.18, eyeR * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Mouth
  ctx.strokeStyle = '#12202E';
  ctx.lineWidth = Math.max(1.5, w * 0.028);
  ctx.lineCap = 'round';
  if (state.celebrating) {
    ctx.fillStyle = '#12202E';
    ctx.beginPath();
    ctx.arc(0, h * 0.14, w * 0.11, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#E86A6A';
    ctx.beginPath();
    ctx.arc(0, h * 0.2, w * 0.05, 0, Math.PI);
    ctx.fill();
  } else if (state.dizzy) {
    ctx.beginPath();
    ctx.arc(0, h * 0.24, w * 0.07, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, h * 0.1, w * 0.09, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }

  // Antenna
  ctx.fillStyle = theme.botAccent;
  ctx.fillRect(-w * 0.04, -h / 2 - h * 0.22, w * 0.08, h * 0.18);
  ctx.beginPath();
  ctx.arc(0, -h / 2 - h * 0.25, w * 0.09, 0, Math.PI * 2);
  ctx.fill();
  if (state.celebrating) {
    // antenna glow while celebrating
    ctx.fillStyle = 'rgba(255,235,120,0.35)';
    ctx.beginPath();
    ctx.arc(0, -h / 2 - h * 0.25, w * 0.18 * (1 + Math.sin(state.celebrateT * 10) * 0.3), 0, Math.PI * 2);
    ctx.fill();
  }

  // Wheels
  const wl = state.frame === 0 ? 0 : 1.5;
  ctx.fillStyle = '#1E2A3A';
  ctx.beginPath();
  ctx.arc(-w * 0.33, h * 0.38 - wl, w * 0.12, 0, Math.PI * 2);
  ctx.arc(w * 0.33, h * 0.38 + wl, w * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Directional arrow — rotates smoothly with the facing angle
  ctx.save();
  ctx.rotate(state.angle);
  ctx.fillStyle = theme.botAccent;
  const a = w * 0.11;
  ctx.beginPath();
  ctx.moveTo(w * 0.46, 0);
  ctx.lineTo(w * 0.29, -a);
  ctx.lineTo(w * 0.29, a);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

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

// ── Particles ────────────────────────────────────────────────────────────────

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  shape?: 'dot' | 'rect';
  rot?: number;
  vr?: number;
  size?: number;
  /** life units per ms — smaller = longer-lived */
  fade?: number;
}

export function spawnParticles(cx: number, cy: number, color: string, count = 8): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const speed = 0.5 + Math.random() * 1.6;
    return { x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, color };
  });
}

export function spawnConfetti(cx: number, cy: number, colors: string[], count = 70): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 2.6;
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.2,
      life: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: 'rect' as const,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.02,
      size: 0.6 + Math.random() * 0.8,
      fade: 0.0007,
    };
  });
}

export function updateParticles(particles: Particle[], dt: number): Particle[] {
  return particles
    .map(p => ({
      ...p,
      x: p.x + p.vx * dt * 0.065,
      y: p.y + p.vy * dt * 0.065,
      vy: p.vy + dt * (p.shape === 'rect' ? 0.0032 : 0.0018),
      rot: p.rot !== undefined && p.vr !== undefined ? p.rot + p.vr * dt : p.rot,
      life: p.life + dt * (p.fade ?? 0.0025),
    }))
    .filter(p => p.life < 1);
}

export function renderParticles(ctx: CanvasRenderingContext2D, particles: Particle[], cellSize: number) {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = 1 - p.life;
    ctx.fillStyle = p.color;
    if (p.shape === 'rect') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot ?? 0);
      const pw = cellSize * 0.15 * (p.size ?? 1);
      const ph = cellSize * 0.09 * (p.size ?? 1);
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, cellSize * 0.06 * (1 - p.life * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
