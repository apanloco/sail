import { fromAngle } from './vec.js';

// The race course, laid out relative to the wind (like a real race committee): windward
// mark straight upwind of the start, a reach mark out to the side, a leeward mark, and a
// **separate finish line** placed downwind of the leeward mark. That keeps the course a
// clean one-way loop — you never have to loop back across the start through oncoming
// boats. Dimensions are in a wind-relative frame: up = upwind, cross = across the wind.
const LAYOUT = {
  windward: { up: 120, cross: 8 }, // beat up to it
  wing: { up: 55, cross: 82 }, // reach out to the side
  leeward: { up: 42, cross: -45 }, // reach across to it
  startHalf: 26, // half-width of the start line (at up = 0, on the wind)
  finish: { up: 2, cross: -45, half: 22 }, // finish line: downwind of the leeward mark
  markR: 16, // rounding-zone radius
};

export function createCourse(windDir) {
  const u = fromAngle(windDir + Math.PI); // upwind unit (toward the wind's source)
  const c = { x: -u.y, y: u.x }; // across the wind
  const place = (up, cross) => ({ x: u.x * up + c.x * cross, y: u.y * up + c.y * cross });
  const f = LAYOUT.finish;

  return {
    marks: [
      { ...place(LAYOUT.windward.up, LAYOUT.windward.cross), r: LAYOUT.markR, label: '1' },
      { ...place(LAYOUT.wing.up, LAYOUT.wing.cross), r: LAYOUT.markR, label: '2' },
      { ...place(LAYOUT.leeward.up, LAYOUT.leeward.cross), r: LAYOUT.markR, label: '3' },
    ],
    start: { a: place(0, -LAYOUT.startHalf), b: place(0, LAYOUT.startHalf) },
    finish: { a: place(f.up, f.cross - f.half), b: place(f.up, f.cross + f.half) },
  };
}

export function nextTarget(boat, course) {
  const n = boat.race ? boat.race.nextMark : 0;
  if (n < course.marks.length) {
    const m = course.marks[n];
    return { x: m.x, y: m.y };
  }
  return finishCentre(course);
}

export const finishCentre = (course) => ({
  x: (course.finish.a.x + course.finish.b.x) / 2,
  y: (course.finish.a.y + course.finish.b.y) / 2,
});

// Do segments p1→p2 and p3→p4 cross? Used to detect crossing the (wind-angled) finish.
export function segmentsCross(p1, p2, p3, p4) {
  const side = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = side(p3, p4, p1);
  const d2 = side(p3, p4, p2);
  const d3 = side(p1, p2, p3);
  const d4 = side(p1, p2, p4);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}
