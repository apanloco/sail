import { sub, dot, len, scale, fromAngle, clamp } from './vec.js';

// The sail force model — the heart of the game. Given a boat and the true wind, work out
// the force the sail produces (and telemetry the HUD needs). Pure: no mutation.
//
// The sail is trimmed like a wing: it drives best when the boom sits at ~half the wind
// angle — 45° on a beam reach, 90° on a run, ~22° close-hauled — and drive falls off if
// you ease past that (luff) or over-sheet (stall). To keep that optimum *stable and
// intuitive* (rather than sliding around as apparent wind shifts), the ideal angle and the
// no-go zone are measured against the TRUE wind, while the force *magnitude* uses the
// apparent wind — so speed still self-limits and reaches still beat runs.
export function sailForce(boat, wind, cfg) {
  const fwd = fromAngle(boat.heading);
  const stb = { x: -fwd.y, y: fwd.x }; // starboard: 90° clockwise from the bow

  const windSpeed = len(wind);
  if (windSpeed < 1e-4) {
    return { force: ZERO, awa: Math.PI, boomAngle: 0, boomFree: 0, luff: 0, lee: 1, appWind: ZERO, appSpeed: 0 };
  }

  // Angle to the TRUE wind (0 = head to wind, PI = dead run) and which beam it's on.
  const trueFrom = scale(wind, -1 / windSpeed); // unit vector toward the wind's source
  const twa = Math.acos(clamp(dot(fwd, trueFrom), -1, 1));
  const lee = Math.sign(dot(wind, stb)) || 1; // beam the wind blows toward

  // Trim: the player sets the boom angle directly; it's ideal at ~half the wind angle.
  const boomAngle = boat.sheet * cfg.maxBoom;
  const ideal = twa / 2;
  const eff = trimEfficiency(boomAngle, ideal, cfg);
  const gate = clamp((twa - cfg.noGoLo) / (cfg.noGoHi - cfg.noGoLo), 0, 1); // no-go zone

  // Boom in world space (from the mast, aft, swung to the lee beam); force acts along its
  // leeward normal, so the forward/side split — and thus which points of sail are fast —
  // falls out of the geometry.
  const c = Math.cos(boomAngle);
  const s = Math.sin(boomAngle);
  const boom = { x: c * -fwd.x + s * lee * stb.x, y: c * -fwd.y + s * lee * stb.y };
  let n = { x: -boom.y, y: boom.x };
  if (dot(n, wind) < 0) n = { x: -n.x, y: -n.y }; // face leeward (downwind)

  // Drive grows with true wind² (constant for a given trim → hull drag gives a finite top
  // speed, no runaway), fades in the no-go zone and off-optimum trim, and drops as the boat
  // nears wind speed downwind (apparent wind fades) so you can't outrun the wind.
  const appWind = sub(wind, boat.vel);
  const appSpeed = len(appWind);
  const drop = Math.min(1, appSpeed / windSpeed);
  const mag = cfg.Csail * windSpeed * windSpeed * eff * gate * drop;

  return {
    force: { x: n.x * mag, y: n.y * mag },
    awa: twa,
    boomAngle,
    boomFree: ideal,
    luff: eff,
    lee,
    appWind,
    appSpeed,
  };
}

// How well the boom is trimmed: 1 at the ideal angle, falling off either side. Easing past
// the optimum (luffing) bites fast; over-sheeting (stalling) is gentler and keeps a floor.
function trimEfficiency(boom, ideal, cfg) {
  const d = boom - ideal; // + = eased past ideal (luffing), − = over-sheeted (stalling)
  const width = d >= 0 ? cfg.luffWidth : cfg.stallWidth;
  const e = Math.exp(-((d / width) ** 2));
  return d >= 0 ? e : Math.max(cfg.stallFloor, e);
}

const ZERO = { x: 0, y: 0 };
