import { vec } from './vec.js';

// A boat is plain, serializable state — no methods, no I/O. The simulation reads and
// rewrites these fields each tick; the renderer only reads them. Designed so a world
// can hold many boats (couch / online later) without any change here.
export function createBoat({ x = 0, y = 0, heading = 0, color = '#f2ead9' } = {}) {
  return {
    pos: vec(x, y),
    vel: vec(0, 0),
    heading, // radians; direction the bow points
    omega: 0, // angular velocity, rad/s
    sheet: 0.5, // 0 = sheeted in (boom on centreline), 1 = fully eased
    rudder: 0, // -1 (port) .. 1 (starboard)
    telemetry: null, // last sail computation, stashed for the HUD/renderer
    color, // player accent, for telling boats apart
    race: null, // per-boat race progress, owned by race.js

    // Gybe tracking: detect the boom crossing the stern and stage the crash effect.
    lastLee: 0, // previous leeward side (±1); 0 until the first tick
    gybeCooldown: 0, // debounce so one crossing can't be charged twice
    gybeFx: 0, // crash effect: 1 at the slam, decays to 0 (drives splash + HUD flash)
    gybePower: 0, // how hard that gybe was (0..1), for effect strength
  };
}
