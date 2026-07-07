import { stepBoat } from './step.js';
import { sub, norm, clamp, angleOf } from './vec.js';

// The coaching "ghost": a boat run by an autopilot through the *real* sailing model, sped
// up, that sails to each mark in turn and leaves an illuminated trail. It sails naturally
// — beating upwind with an organic zig-zag — which is the whole point: you learn the angles
// by watching a real boat sail them. Its only goal is to reach the next mark (get within
// its zone); it doesn't fuss over rounding, so the demo stays simple and readable.
const NOGO = (46 * Math.PI) / 180; // close-hauled angle the autopilot points to upwind
const CORRIDOR = 22; // how far off the direct line before it tacks back
const MAX_AGE = 240; // sim-seconds before giving up (safety)
const TRAIL_STEP2 = 9; // min squared distance between recorded trail points

export function createGhost(boat, course) {
  return {
    color: boat.color,
    course,
    boat: {
      pos: { x: boat.pos.x, y: boat.pos.y },
      vel: { x: boat.vel.x, y: boat.vel.y },
      heading: boat.heading,
      omega: 0,
      sheet: boat.sheet,
      rudder: 0,
      telemetry: null,
      color: boat.color,
      race: null,
      lastLee: 0,
      gybeCooldown: 0,
      gybeFx: 0,
      gybePower: 0,
    },
    nextMark: boat.race ? boat.race.nextMark : 0,
    legStart: { x: boat.pos.x, y: boat.pos.y },
    tackHeading: null,
    trail: [{ x: boat.pos.x, y: boat.pos.y }],
    age: 0,
    done: false,
  };
}

export function stepGhost(g, wind, cfg, dt) {
  if (g.done) return;
  g.age += dt;
  stepBoat(g.boat, pilot(g, wind), wind, cfg, dt);

  const marks = g.course.marks;
  if (g.nextMark < marks.length) {
    const m = marks[g.nextMark];
    if ((g.boat.pos.x - m.x) ** 2 + (g.boat.pos.y - m.y) ** 2 <= m.r * m.r) {
      g.nextMark++; // reached this sub-goal — on to the next
      g.legStart = { x: g.boat.pos.x, y: g.boat.pos.y };
      g.tackHeading = null;
    }
  } else {
    const c = lineCentre(g.course);
    if ((g.boat.pos.x - c.x) ** 2 + (g.boat.pos.y - c.y) ** 2 <= 100) g.done = true;
  }
  if (g.age > MAX_AGE) g.done = true;

  const last = g.trail[g.trail.length - 1];
  if ((g.boat.pos.x - last.x) ** 2 + (g.boat.pos.y - last.y) ** 2 > TRAIL_STEP2) {
    g.trail.push({ x: g.boat.pos.x, y: g.boat.pos.y });
  }
}

function currentTarget(g) {
  if (g.nextMark < g.course.marks.length) return g.course.marks[g.nextMark];
  return lineCentre(g.course);
}

// Steer toward the target, tacking up a corridor when it's upwind, and trim for the point
// of sail. Note the minus on rudder — steering is tiller-reversed (see step.js).
function pilot(g, wind) {
  const b = g.boat;
  const target = currentTarget(g);
  const windFrom = Math.atan2(-wind.y, -wind.x);
  const dirToTarget = angleOf(sub(target, b.pos));

  let desired;
  if (Math.abs(angDiff(dirToTarget, windFrom)) >= NOGO) {
    desired = dirToTarget; // reach or run — sail straight at it
  } else {
    // Upwind: beat up a corridor around the rhumb line, tacking at the edges.
    const L = norm(sub(target, g.legStart));
    const N = { x: -L.y, y: L.x };
    const perp = (b.pos.x - g.legStart.x) * N.x + (b.pos.y - g.legStart.y) * N.y;
    const hPlus = windFrom + NOGO;
    const hMinus = windFrom - NOGO;
    const nvel = (h) => Math.cos(h) * N.x + Math.sin(h) * N.y;
    if (perp > CORRIDOR) g.tackHeading = nvel(hPlus) < nvel(hMinus) ? hPlus : hMinus;
    else if (perp < -CORRIDOR) g.tackHeading = nvel(hPlus) > nvel(hMinus) ? hPlus : hMinus;
    else if (g.tackHeading == null) g.tackHeading = hPlus;
    desired = g.tackHeading;
  }

  const rudder = clamp(-angDiff(desired, b.heading) / 0.5, -1, 1);
  // Trim to the bisector: boom ≈ half the wind angle → sheet = twa / (2·maxBoom) = twa/π.
  const twa = Math.abs(angDiff(b.heading, windFrom)); // 0 = head to wind .. PI = dead run
  const sheetTarget = clamp(twa / Math.PI, 0.05, 1);
  const sheetDelta = Math.abs(sheetTarget - b.sheet) > 0.03 ? Math.sign(sheetTarget - b.sheet) : 0;
  return { rudder, sheetDelta };
}

const lineCentre = (course) => ({
  x: (course.finish.a.x + course.finish.b.x) / 2,
  y: (course.finish.a.y + course.finish.b.y) / 2,
});
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
