import { segmentsCross, finishCentre } from './course.js';
import { sub, add, norm } from './vec.js';

// You must *round* a mark, not just clip its edge or drive over it. A rounding counts when
// your track crosses the mark's *outside ray* — the ray from the buoy pointing away from both
// the leg you sailed in on and the leg you leave on. You can only cross it by actually sailing
// around the mark: cutting the corner, nosing in and turning toward the next mark, or steaming
// straight over the buoy all stay on the inside and never reach it. Runs in the fixed-timestep
// sim (updateRace per DT step, not per rendered frame), so it's frame-rate independent.
//
// (Earlier tries failed here: a bearing-sweep test let you skip the leeward mark because
// passing close swings the bearing fast; a which-half-plane test triggered on a slight
// overshoot; and a close-enough "touch" pass let you complete a mark by driving over it.)
const OUTSIDE_REACH = 2.0; // ×mark.r — length of the outside ray your track must cross to round

export function initRace(world) {
  world.clock = 0;
  world.finishers = []; // boat indices, in the order they crossed the finish
  world.boats.forEach((boat) => {
    boat.race = {
      nextMark: 0,
      finishTime: null,
      lastPos: { x: boat.pos.x, y: boat.pos.y },
    };
  });
}

export function updateRace(world, dt) {
  world.clock += dt;
  const { marks, finish } = world.course;

  world.boats.forEach((boat, i) => {
    const r = boat.race;
    if (r.finishTime === null) {
      if (r.nextMark < marks.length) {
        roundMark(r, boat.pos, marks[r.nextMark], outsideRayEnd(world.course, r.nextMark));
      } else if (segmentsCross(r.lastPos, boat.pos, finish.a, finish.b)) {
        r.finishTime = world.clock;
        world.finishers.push(i);
      }
    }
    r.lastPos.x = boat.pos.x;
    r.lastPos.y = boat.pos.y;
  });
}

function roundMark(r, pos, mark, rayEnd) {
  if (segmentsCross(r.lastPos, pos, mark, rayEnd)) advance(r); // sailed across the outside ray
}

function advance(r) {
  r.nextMark++;
}

// The far end of mark n's outside ray. The corner opens toward the leg in (from the previous
// mark, or the start line for the first) and the leg out (to the next mark, or the finish for
// the last); their bisector points *into* the corner, so the ray runs the opposite way — out
// the far side of the buoy, the side you have to sail around to.
function outsideRayEnd(course, n) {
  const marks = course.marks;
  const mark = marks[n];
  const prev = n === 0 ? startCentre(course) : marks[n - 1];
  const next = n === marks.length - 1 ? finishCentre(course) : marks[n + 1];
  const into = norm(add(norm(sub(prev, mark)), norm(sub(next, mark))));
  const reach = mark.r * OUTSIDE_REACH;
  return { x: mark.x - into.x * reach, y: mark.y - into.y * reach };
}

const startCentre = (course) => ({
  x: (course.start.a.x + course.start.b.x) / 2,
  y: (course.start.a.y + course.start.b.y) / 2,
});

export const raceOver = (world) =>
  world.finishers.length > 0 && world.finishers.length >= world.boats.length;
