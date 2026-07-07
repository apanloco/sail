import { createBoat } from './boat.js';
import { fromAngle } from './vec.js';
import { CONFIG } from '../config.js';
import { createCourse } from './course.js';
import { initRace } from './race.js';

// Player accents. Index 0 = Player 1 (WASD), index 1 = Player 2 (arrow keys).
export const PLAYER_COLORS = ['#e8593f', '#37c0c8'];

const START_ANGLE = (50 * Math.PI) / 180; // close-hauled: ~50° off the wind (safely powered)

// Build a fresh race. The wind direction can be injected (main.js randomises it per race
// to keep the core pure/seedable); the course is laid out relative to it, and it then
// oscillates gently as you sail (see step.js). Boats start on the line, close-hauled,
// already beating up toward the windward mark.
export function createWorld(config = CONFIG, opts = {}) {
  const windDirBase = opts.windDir ?? config.windDir;
  const windSpeed = opts.windSpeed ?? config.windSpeed;
  const course = createCourse(windDirBase);

  const upAngle = windDirBase + Math.PI; // heading if pointed dead into the wind
  const heading = upAngle - START_ANGLE; // close-hauled on one tack
  const u = fromAngle(upAngle); // upwind
  const c = { x: -u.y, y: u.x }; // along the start line

  // Just upwind of the line, offset to either side of centre.
  const spawn = (side, color) => {
    const boat = createBoat({
      x: u.x * 4 + c.x * side,
      y: u.y * 4 + c.y * side,
      heading,
      color,
    });
    boat.sheet = 0.12; // sheeted in for the beat
    boat.vel = fromAngle(heading, 2.5);
    return boat;
  };

  const world = {
    cfg: config.boat,
    windDirBase, // mean wind direction for this race; the course is set to it
    windSpeed,
    windT: 0, // accumulates dt; drives the shift oscillation
    wind: fromAngle(windDirBase, windSpeed),
    boats: [spawn(-10, PLAYER_COLORS[0]), spawn(10, PLAYER_COLORS[1])],
    course,
  };
  initRace(world);
  return world;
}
