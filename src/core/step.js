import { sailForce } from './sailing.js';
import { updateRace } from './race.js';
import { clamp, fromAngle } from './vec.js';

// Advance the whole world by dt seconds. `inputs` is aligned with world.boats; each is
// { rudder: -1..1, sheetDelta: -1..1 } describing that boat's controls this tick.
//
// This is the pure core the whole GDD hangs on: state in, state out. Single-player,
// couch, and (later) an authoritative server all call exactly this.
export function step(world, inputs, dt) {
  updateWind(world, dt);
  world.boats.forEach((boat, i) => stepBoat(boat, inputs[i] ?? NEUTRAL, world.wind, world.cfg, dt));
  updateRace(world, dt);
  return world;
}

// The wind oscillates gently around its mean direction over the race — a couple of slow,
// out-of-phase swings so it wanders naturally (a lift here, a header there) rather than
// ticking metronomically. Deterministic, so the pure core stays reproducible.
function updateWind(world, dt) {
  world.windT += dt;
  const t = world.windT;
  const shift = 0.16 * Math.sin(t * 0.11) + 0.06 * Math.sin(t * 0.37 + 1.3); // ≈ ±13°
  world.wind = fromAngle(world.windDirBase + shift, world.windSpeed);
}

const NEUTRAL = { rudder: 0, sheetDelta: 0 };

// Advance one boat one tick. Exported so the ghost/coach sim can reuse the real physics.
export function stepBoat(boat, input, wind, cfg, dt) {
  // Controls: the rudder chases the key (and re-centres when released); the sheet trims
  // in/out and stays put, like a cleat.
  boat.rudder += (input.rudder - boat.rudder) * Math.min(1, cfg.rudderRate * dt);
  boat.sheet = clamp(boat.sheet + input.sheetDelta * cfg.sheetSpeed * dt, 0, 1);

  const sail = sailForce(boat, wind, cfg);
  boat.telemetry = sail; // read by the HUD and the sail renderer
  applyGybe(boat, sail, cfg, dt);

  const fwd = { x: Math.cos(boat.heading), y: Math.sin(boat.heading) };
  const stb = { x: -fwd.y, y: fwd.x };
  const vFwd = boat.vel.x * fwd.x + boat.vel.y * fwd.y;
  const vLat = boat.vel.x * stb.x + boat.vel.y * stb.y;

  // Hull drag: light and quadratic forward (sets top speed), heavy sideways (the
  // centreboard turns sail force into forward travel instead of sliding to leeward).
  const dragFwd = -cfg.dragFwd * Math.abs(vFwd) * vFwd;
  const dragLat = -cfg.dragLat * vLat;

  const ax = sail.force.x + fwd.x * dragFwd + stb.x * dragLat;
  const ay = sail.force.y + fwd.y * dragFwd + stb.y * dragLat;
  boat.vel.x += ax * dt;
  boat.vel.y += ay * dt;
  boat.pos.x += boat.vel.x * dt;
  boat.pos.y += boat.vel.y * dt;

  // Tiller steering: push the helm to port and the boat turns to starboard (hence the
  // minus). The rudder only bites when water is flowing past it, so steering fades as you
  // slow — and reverses when making sternway. Angular damping settles the turn.
  const torque = -cfg.rudderTorque * boat.rudder * vFwd - cfg.angDamp * boat.omega;
  boat.omega += torque * dt;
  boat.heading += boat.omega * dt;
}

const GYBE_FX_TIME = 0.55; // seconds the crash splash + HUD flash linger

// Detect the boom crossing the stern (a gybe) and punish it if you crossed with the
// sheet eased — the "no tension, boom slams" case. A clean, sheeted-in gybe passes free.
function applyGybe(boat, sail, cfg, dt) {
  boat.gybeCooldown = Math.max(0, boat.gybeCooldown - dt);

  const crossedStern = sail.awa > Math.PI / 2; // wind near the stern, not the bow (a tack)
  const flipped = boat.lastLee !== 0 && sail.lee !== boat.lastLee;
  if (flipped && crossedStern && sail.luff > 0.3 && boat.gybeCooldown === 0) {
    // How far the boom was eased as it slammed across = how little tension you had.
    const ease = sail.boomAngle / cfg.maxBoom; // 0 (sheeted in) .. 1 (fully out)
    const power = Math.max(0, (ease - cfg.gybeMinEase) / (1 - cfg.gybeMinEase));
    if (power > 0) {
      const loss = cfg.gybeSpeedLoss * power;
      boat.vel.x *= 1 - loss;
      boat.vel.y *= 1 - loss;
      boat.omega += -sail.lee * cfg.gybeBroach * power; // rounds up into the wind — catch it
      boat.gybePower = power;
      boat.gybeFx = 1;
      boat.gybeCooldown = 1.2;
    }
  }
  boat.lastLee = sail.lee;

  if (boat.gybeFx > 0) boat.gybeFx = Math.max(0, boat.gybeFx - dt / GYBE_FX_TIME);
}
