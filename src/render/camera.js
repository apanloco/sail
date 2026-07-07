// Maps world metres to screen pixels and smoothly chases a target. The camera is the
// only thing that knows the world is bigger than the screen.
export function createCamera(pixelsPerMeter) {
  return { x: 0, y: 0, ppm: pixelsPerMeter, w: 0, h: 0 };
}

export function resize(cam, w, h) {
  cam.w = w;
  cam.h = h;
}

export function follow(cam, target, dt) {
  const k = Math.min(1, 5 * dt); // critically-ish damped; no jitter, no lag
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
}

// Frame a set of world points (the boats): centre on their midpoint and zoom to fit
// them all, clamped so it never zooms uncomfortably close or uselessly far. Smoothed so
// pan and zoom glide rather than snap.
export function frame(cam, points, dt, { pad = 12, minPpm = 2, maxPpm = 14 } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = maxX - minX + pad * 2;
  const spanY = maxY - minY + pad * 2;
  const fit = Math.min(cam.w / spanX, cam.h / spanY);
  const desired = Math.max(minPpm, Math.min(maxPpm, fit));

  const k = Math.min(1, 4 * dt);
  cam.x += (cx - cam.x) * k;
  cam.y += (cy - cam.y) * k;
  cam.ppm += (desired - cam.ppm) * k;
}

export function worldToScreen(cam, p) {
  return { x: (p.x - cam.x) * cam.ppm + cam.w / 2, y: (p.y - cam.y) * cam.ppm + cam.h / 2 };
}

// World-space rectangle currently visible, padded so things scroll in smoothly.
export function visibleBounds(cam, pad = 4) {
  const hw = cam.w / 2 / cam.ppm + pad;
  const hh = cam.h / 2 / cam.ppm + pad;
  return { minX: cam.x - hw, maxX: cam.x + hw, minY: cam.y - hh, maxY: cam.y + hh };
}
