import { scale, len, angleOf } from '../core/vec.js';
import { raceOver } from '../core/race.js';
import { nextTarget } from '../core/course.js';
import { withAlpha } from './draw.js';

// Two-player heads-up display. Each sailor gets a compact card in a top corner — wind
// compass (with the no-go zone shaded), speed, and what leg they're on — and the middle
// of the screen carries the race clock, standings, and the win banner. Pure drawing.

const CARD_W = 214;
const CARD_H = 116;

export function drawHud(ctx, view, world, ui = {}) {
  const [p1, p2] = world.boats;
  // Player 1 (WASD) on the left, Player 2 (arrow keys) on the right — mirrors where each
  // player's hands sit on a shared keyboard.
  drawPlayerCard(ctx, 16, 16, p1, world.wind, 'P1', world.course);
  drawPlayerCard(ctx, view.w - CARD_W - 16, 16, p2, world.wind, 'P2', world.course);

  drawStandings(ctx, view, world);
  drawMinimap(ctx, view, world);
  drawControls(ctx, view);
  if (raceOver(world)) drawWinBanner(ctx, view, world);
  else drawStartOverlay(ctx, view, ui);
}

// A course map in the corner. The race camera stays hugged in on the boats so you can trim
// the sail; this is how you know where you're headed — the whole course at a glance, each
// boat where it is, and a line to the mark it's chasing. (Space still peeks the real camera
// out for a proper look.)
const MAP_SIZE = 156;

function drawMinimap(ctx, view, world) {
  const x = view.w - MAP_SIZE - 16;
  const y = view.h - MAP_SIZE - 44; // clear of the controls strip along the bottom
  panel(ctx, x, y, MAP_SIZE, MAP_SIZE);

  const c = world.course;
  const world_pts = [...c.marks, c.start.a, c.start.b, c.finish.a, c.finish.b, ...world.boats.map((b) => b.pos)];
  const toMap = fitProjection(world_pts, x, y, MAP_SIZE, 18);

  gateLine(ctx, toMap(c.start.a), toMap(c.start.b), 'rgba(255,255,255,0.5)');
  gateLine(ctx, toMap(c.finish.a), toMap(c.finish.b), 'rgba(127,224,160,0.8)');

  c.marks.forEach((m) => mapDot(ctx, toMap(m), 3, '#ff8c42'));

  world.boats.forEach((b) => {
    const p = toMap(b.pos);
    if (b.race?.finishTime == null) {
      const t = toMap(nextTarget(b, c)); // a faint tether to the mark you're chasing
      ctx.strokeStyle = withAlpha(b.color, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    boatMark(ctx, p, b.heading, b.color);
  });
}

// Fit world points into a square, centred and scaled to leave a margin, and return the
// world→map projection. Keeps aspect (a circle stays a circle), so the course isn't warped.
function fitProjection(pts, x, y, size, margin) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const k = (size - margin * 2) / Math.max(maxX - minX, maxY - minY, 1);
  return (p) => ({ x: x + size / 2 + (p.x - cx) * k, y: y + size / 2 + (p.y - cy) * k });
}

function gateLine(ctx, a, b, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function mapDot(ctx, p, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
}

// A little arrow at the boat's position, pointing where its bow points.
function boatMark(ctx, p, heading, color) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(heading); // bow at +x, matching world space
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-3, -3.2);
  ctx.lineTo(-3, 3.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Pre-start prompt and the 3·2·1·GO countdown, centred on screen.
function drawStartOverlay(ctx, view, ui) {
  ctx.textAlign = 'center';
  if (ui.phase === 'prestart') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 34px system-ui, sans-serif';
    ctx.fillText('Press  S  to start', view.w / 2, view.h / 2 - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('H  see the route     ·     R  new wind', view.w / 2, view.h / 2 + 30);
  } else if (ui.phase === 'countdown') {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = '800 100px system-ui, sans-serif';
    ctx.fillText(String(Math.max(1, Math.ceil(ui.countdown))), view.w / 2, view.h / 2 + 34);
  }
  if (ui.goFlash > 0) {
    ctx.fillStyle = `rgba(127,224,160,${Math.min(1, ui.goFlash * 2).toFixed(2)})`;
    ctx.font = '800 100px system-ui, sans-serif';
    ctx.fillText('GO!', view.w / 2, view.h / 2 + 34);
  }
  ctx.textAlign = 'left';
}

function drawPlayerCard(ctx, x, y, boat, wind, name, course) {
  panel(ctx, x, y, CARD_W, CARD_H);

  const cx = x + 46;
  const cy = y + 52;
  drawCompass(ctx, cx, cy, 32, boat, wind);

  const tx = x + 92;
  ctx.textAlign = 'left';
  ctx.fillStyle = boat.color;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.fillText(name, tx, y + 22);

  const speed = len(boat.vel).toFixed(1);
  // Flash the speed red the instant a crash gybe scrubs it, fading back to white.
  const flash = boat.gybeFx || 0;
  const chan = Math.round(255 * (1 - flash));
  ctx.fillStyle = flash > 0 ? `rgb(255,${chan},${chan})` : '#ffffff';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(speed, tx, y + 48);
  const speedWidth = ctx.measureText(speed).width; // measure in the 24px font it was drawn in
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('m/s', tx + speedWidth + 5, y + 48);

  // Line 1: where you're headed (always shown). Line 2: a sail warning, only when it
  // applies — so you always know your target even while wrestling the wind.
  const finished = boat.race?.finishTime != null;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = finished ? '#7fd3a0' : 'rgba(255,255,255,0.85)';
  ctx.fillText(targetText(boat, course), tx, y + 70);

  const warn = warningText(boat);
  if (warn) {
    ctx.fillStyle = boat.gybeFx > 0.25 ? '#ff6b5a' : '#ffd36e';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(warn, tx, y + 88);
  }

  drawSheetBar(ctx, tx, x + CARD_W - 14, y + 106, boat);
}

// A compact "in ▮▮▯▯ out" trim bar. The fill grows rightward as the sheet is eased; it
// turns red when the sail is luffing, so you can see at a glance you're mistrimmed.
function drawSheetBar(ctx, left, right, baseline, boat) {
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'left';
  ctx.fillText('in', left, baseline);
  ctx.textAlign = 'right';
  ctx.fillText('out', right, baseline);
  ctx.textAlign = 'left';

  const barX = left + 16;
  const barW = right - 20 - barX;
  const barY = baseline - 8;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(barX, barY, barW, 6);
  const luffing = boat.telemetry && boat.telemetry.luff < 0.4 && boat.telemetry.appSpeed > 0.5;
  ctx.fillStyle = luffing ? '#e05a50' : '#7fd3a0';
  ctx.fillRect(barX, barY, barW * boat.sheet, 6);
}

function targetText(boat, course) {
  if (boat.race?.finishTime != null) return 'FINISHED';
  const n = boat.race ? boat.race.nextMark : 0;
  return n < course.marks.length ? `→ round mark ${n + 1}` : '→ cross the finish';
}

// The sail warning, or null when the sail is drawing fine. A fresh crash gybe takes
// priority — it names the mistake ("sheet in before you gybe") while the penalty bites.
function warningText(boat) {
  if (boat.gybeFx > 0.25) return 'crash gybe! — sheet in to gybe';
  const t = boat.telemetry;
  if (!t || t.appSpeed < 0.5 || t.luff >= 0.4) return null;
  if (t.awa < Math.PI / 4) return 'in irons — bear away';
  return t.boomAngle > t.boomFree ? 'luffing — sheet in' : 'over-trimmed — ease out';
}

// Boat-relative wind compass: bow points up, the no-go zone (±45° of the wind) is shaded,
// and an arrow shows where the wind blows from. Steer the bow out of the red to sail.
function drawCompass(ctx, cx, cy, r, boat, wind) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,28,40,0.6)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.stroke();

  const windFrom = scale(wind, -1);
  const windRel = angleOf(windFrom) - boat.heading;
  const wc = Math.atan2(-Math.cos(windRel), Math.sin(windRel));

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, wc - Math.PI / 4, wc + Math.PI / 4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(224,90,80,0.3)';
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  // Hull, bow up
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 7);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fillStyle = boat.color;
  ctx.fill();
  // Rudder blade at the stern — leans the way you're steering (right key → leans right).
  ctx.translate(0, 7);
  ctx.rotate(-boat.rudder * 0.6);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 9);
  ctx.stroke();
  ctx.restore();

  const ax = cx + Math.cos(wc) * r * 0.92;
  const ay = cy + Math.sin(wc) * r * 0.92;
  const ix = cx + Math.cos(wc) * r * 0.36;
  const iy = cy + Math.sin(wc) * r * 0.36;
  ctx.strokeStyle = '#8fd0ff';
  ctx.fillStyle = '#8fd0ff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ix, iy);
  ctx.stroke();
  arrowHead(ctx, ax, ay, ix, iy, 6);
}

// Race clock and the finish order as boats cross the line.
function drawStandings(ctx, view, world) {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 20px ui-monospace, monospace';
  ctx.fillText(clock(world.clock), view.w / 2, 34);

  ctx.font = '600 13px system-ui, sans-serif';
  world.finishers.forEach((idx, place) => {
    const boat = world.boats[idx];
    ctx.fillStyle = boat.color;
    ctx.fillText(
      `${place + 1}.  P${idx + 1}   ${clock(boat.race.finishTime)}`,
      view.w / 2,
      56 + place * 20,
    );
  });
  ctx.textAlign = 'left';
}

function drawWinBanner(ctx, view, world) {
  const winnerIdx = world.finishers[0];
  const boat = world.boats[winnerIdx];
  ctx.fillStyle = 'rgba(6,28,40,0.82)';
  ctx.fillRect(0, view.h / 2 - 70, view.w, 140);

  ctx.textAlign = 'center';
  ctx.fillStyle = boat.color;
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText(`PLAYER ${winnerIdx + 1} WINS`, view.w / 2, view.h / 2 + 4);

  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('press  R  to race again', view.w / 2, view.h / 2 + 44);
  ctx.textAlign = 'left';
}

function drawControls(ctx, view) {
  const y = view.h - 20;
  ctx.textAlign = 'center';
  ctx.font = '13px system-ui, sans-serif';
  const parts = [
    ['#e8593f', 'P1  A D steer  S in  W out'],
    ['rgba(255,255,255,0.4)', '   ·   '],
    ['#37c0c8', 'P2  ←→ steer  ↓ in  ↑ out'],
    ['rgba(255,255,255,0.4)', '   ·   '],
    ['rgba(255,255,255,0.55)', 'H  demo lap'],
    ['rgba(255,255,255,0.4)', '   ·   '],
    ['rgba(255,255,255,0.55)', 'R  new wind'],
    ['rgba(255,255,255,0.4)', '   ·   '],
    ['rgba(255,255,255,0.55)', 'Space  peek'],
  ];
  const widths = parts.map((p) => ctx.measureText(p[1]).width);
  let x = view.w / 2 - widths.reduce((a, b) => a + b, 0) / 2;
  ctx.textAlign = 'left';
  parts.forEach(([color, text], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    x += widths[i];
  });
}

// --- helpers ------------------------------------------------------------------
function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(6,28,40,0.55)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function arrowHead(ctx, fromX, fromY, toX, toY, size) {
  const a = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - size * Math.cos(a - 0.4), toY - size * Math.sin(a - 0.4));
  ctx.lineTo(toX - size * Math.cos(a + 0.4), toY - size * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}
function clock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
