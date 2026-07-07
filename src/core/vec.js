// Minimal 2D vector helpers. Screen convention: +x is east, +y is south, so a
// positive rotation (perp) turns a vector clockwise on screen. Kept tiny and pure —
// every function returns a fresh object and mutates nothing.

export const vec = (x = 0, y = 0) => ({ x, y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const len = (a) => Math.hypot(a.x, a.y);
export const perp = (a) => ({ x: -a.y, y: a.x }); // 90° clockwise on screen
export const fromAngle = (a, m = 1) => ({ x: Math.cos(a) * m, y: Math.sin(a) * m });
export const angleOf = (a) => Math.atan2(a.y, a.x);

export const norm = (a) => {
  const l = Math.hypot(a.x, a.y);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
