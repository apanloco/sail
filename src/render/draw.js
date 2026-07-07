import { norm, len, clamp } from '../core/vec.js';
import { worldToScreen, visibleBounds } from './camera.js';

// Renders the sea and the boats. Read-only over world state; everything lives in world
// coordinates (so the boats visibly move across the water) and is batched into a handful of
// Path2D strokes per layer — not a draw call per wavelet — so a dense living sea stays cheap.
//
// The sea is five layers, back to front, and all of them read the wind or the light:
//   • water   — the deep base, with broad pools of brighter water breathing across it, so
//               the surface is never a flat fill (sunlight playing on open water)
//   • gusts   — dark "cat's-paw" patches drifting downwind: where the wind is touching down.
//               A real sailor's tell — see the puff coming before it hits you.
//   • swell   — long, slow crest lines rolling downwind (the ocean's big rhythm)
//   • chop    — short, quick crest lines on top (the surface texture; fades out when the
//               camera zooms far out, so the survey view stays calm and cheap)
//   • glitter — sparse sun sparkle twinkling in a band along the light direction.
// Crest lines lie ACROSS the wind and march downwind, and the whole field swings when the
// wind shifts (R), so direction reads from the motion (the HUD compass gives the exact angle).
//
// One sun lights all of it: crests carry a shadowed windward edge and a bright foam edge
// split along the light axis, and the glitter twinkles along the same axis — so the layers
// agree on where the light comes from and the water reads as one body, not stacked effects.
const LIGHT = norm({ x: 0.55, y: -0.83 }); // afternoon sun, up and to the right
const BUCKETS = 4; // brightness levels per crest layer (→ this many strokes for all its lines)
const BASE_WIND = 7; // reference wind speed the sea is tuned around; stronger wind = livelier

export function drawSea(ctx, cam, wind, time) {
  drawWater(ctx, cam, time);

  const w = norm(wind); // wind direction; crests lie across it, everything drifts along it
  const gust = clamp(len(wind) / BASE_WIND, 0.55, 1.7); // livelier as the wind builds

  drawGusts(ctx, cam, w, gust, time);
  crestField(ctx, cam, w, time, SWELL, gust);
  crestField(ctx, cam, w, time, CHOP, gust);
  drawGlitter(ctx, cam, w, gust, time);
}

// The body of water: a deep vertical gradient (light spills from the top of the frame),
// overlaid with a few broad, slow-drifting pools of brighter water — sunlight breathing
// across the surface. Screen-space and cheap: a handful of soft radial fills.
function drawWater(ctx, cam, time) {
  const bg = ctx.createLinearGradient(0, 0, 0, cam.h);
  bg.addColorStop(0, '#0e6484');
  bg.addColorStop(0.55, '#0a4a67');
  bg.addColorStop(1, '#062f47');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cam.w, cam.h);

  const reach = Math.max(cam.w, cam.h);
  for (let k = 0; k < 3; k++) {
    const phase = time * 0.05 + k * 2.1;
    const px = cam.w * (0.5 + 0.42 * Math.sin(phase * 0.7 + k));
    const py = cam.h * (0.5 + 0.42 * Math.cos(phase * 0.9 - k));
    const rad = reach * (0.4 + 0.12 * Math.sin(phase));
    const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(96,196,224,0.09)');
    g.addColorStop(1, 'rgba(96,196,224,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.w, cam.h);
  }
}

// The two rolling-crest layers. Both are the same field at different scales — that's what
// gives the sea parallax depth — so they share one routine, tuned by these presets.
const SWELL = {
  spacing: 18, // metres between crests
  halfLen: 8, // half a crest's length (world metres → scales with zoom)
  amp: 0.7, // depth of the crest's single gentle bow
  cycle: 6.5, // seconds to fade in, roll downwind, fade out
  driftFrac: 0.85, // fraction of `spacing` it slides over that life
  bowSpeed: 0.5, // how fast the bow breathes
  angleJitter: 0.35, // ±rad the crest tilts off dead-across-wind, per crest (breaks the grid)
  lineWidth: 2.4,
  peakAlpha: 0.16,
  windAmp: 0.15, // extra bow per unit of gust
  relief: 0.9, // world-metres the shadow and foam edges split apart along the light axis
  zoomFadeIn: 0, // always drawn
  zoomFadeFull: 0,
};
const CHOP = {
  spacing: 7,
  halfLen: 3.2,
  amp: 0.35,
  cycle: 3.2,
  driftFrac: 1.0,
  bowSpeed: 1.3,
  angleJitter: 0.5,
  lineWidth: 1.5,
  peakAlpha: 0.2,
  windAmp: 0.4,
  relief: 0.45,
  zoomFadeIn: 3.5, // invisible below this zoom (survey view stays calm + cheap)…
  zoomFadeFull: 8, // …full detail from here in (racing close-up)
};

// Draw one crest layer: a grid of short wavy lines lying across the wind, each running its
// own fade-in → drift-downwind → fade-out cycle (offset per cell, so the field flows rather
// than pulsing in unison), batched into brightness buckets and stroked a few times total.
// Each crest is a long, near-straight line lying across the wind with a single gentle bow
// that breathes — plus a per-crest tilt and length, so the field reads as waves, not a grid.
function crestField(ctx, cam, w, time, o, gust) {
  const zoom = zoomFade(cam.ppm, o.zoomFadeIn, o.zoomFadeFull);
  if (zoom <= 0.001) return;

  const amp = o.amp * (1 + (gust - 1) * o.windAmp);
  const cycle = o.cycle / gust; // windier → crests roll through faster
  const driftDist = o.spacing * o.driftFrac * gust;

  const b = visibleBounds(cam, o.spacing + o.halfLen + amp);
  const i0 = Math.floor(b.minX / o.spacing);
  const i1 = Math.ceil(b.maxX / o.spacing);
  const j0 = Math.floor(b.minY / o.spacing);
  const j1 = Math.ceil(b.maxY / o.spacing);

  const buckets = [];
  for (let k = 0; k < BUCKETS; k++) buckets.push(new Path2D());

  const SEGMENTS = 6; // points along each crest → a smooth line
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const r = hash(i, j);
      const frac = (((time / cycle + r) % 1) + 1) % 1;
      const alpha = Math.sin(Math.PI * frac); // 0 → 1 → 0 over the cycle
      if (alpha < 0.1) continue;

      const drift = (frac - 0.5) * driftDist;
      const cx = (i + (r - 0.5) * 0.6) * o.spacing + w.x * drift;
      const cy = (j + (hash(j, i) - 0.5) * 0.6) * o.spacing + w.y * drift;

      // Per-crest character: a small tilt off dead-across-wind and a varied length, so no two
      // are quite alike and the grid dissolves.
      const r2 = hash(i * 13 + 5, j * 13 + 9);
      const tilt = (r2 - 0.5) * o.angleJitter;
      const ax = -w.y * Math.cos(tilt) - w.x * Math.sin(tilt);
      const ay = w.x * Math.cos(tilt) - w.y * Math.sin(tilt);
      const half = o.halfLen * (0.65 + 0.7 * r2);
      const bow = amp * Math.sin(r * Math.PI * 2 + time * o.bowSpeed); // breathes side to side

      const path = buckets[Math.min(BUCKETS - 1, (alpha * BUCKETS) | 0)];
      for (let s = 0; s <= SEGMENTS; s++) {
        const u = s / SEGMENTS - 0.5; // -0.5 .. 0.5 along the crest
        const sway = bow * Math.cos(u * Math.PI); // single gentle bow: peaks mid-crest, flat at the ends
        const wx = cx + ax * u * 2 * half + w.x * sway;
        const wy = cy + ay * u * 2 * half + w.y * sway;
        const p = worldToScreen(cam, { x: wx, y: wy });
        if (s === 0) path.moveTo(p.x, p.y);
        else path.lineTo(p.x, p.y);
      }
    }
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = o.lineWidth;

  // Relief: stroke the same crests twice, split a touch apart along the light axis — a
  // shadow on the windward face, a bright foam edge to leeward — so each wave stands up
  // off the water instead of lying flat on it. A pure translate, so it costs no geometry.
  // Capped in pixels: enough to emboss a single wave, never so wide it reads as two lines.
  const off = Math.min(o.relief * cam.ppm, o.lineWidth * 1.6);

  ctx.save();
  ctx.translate(-LIGHT.x * off, -LIGHT.y * off);
  for (let k = 0; k < BUCKETS; k++) {
    const a = o.peakAlpha * 0.65 * ((k + 0.5) / BUCKETS) * zoom;
    ctx.strokeStyle = `rgba(5,26,40,${a.toFixed(3)})`;
    ctx.stroke(buckets[k]);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(LIGHT.x * off, LIGHT.y * off);
  for (let k = 0; k < BUCKETS; k++) {
    const a = o.peakAlpha * ((k + 0.5) / BUCKETS) * zoom;
    ctx.strokeStyle = `rgba(224,241,250,${a.toFixed(3)})`;
    ctx.stroke(buckets[k]);
  }
  ctx.restore();
}

// Cat's-paws: soft dark ruffles drifting downwind where a puff touches the surface. The
// ripples there scatter the light, so the patch reads darker and textured — the sailor's
// tell that more wind is on its way. Each patch fades in, slides downwind, and fades out;
// most of the water between them stays calm. Soft radial fills plus a batched stipple.
const GUST_SPACING = 44; // world metres between potential puffs

function drawGusts(ctx, cam, w, gust, time) {
  const b = visibleBounds(cam, GUST_SPACING);
  const i0 = Math.floor(b.minX / GUST_SPACING);
  const i1 = Math.ceil(b.maxX / GUST_SPACING);
  const j0 = Math.floor(b.minY / GUST_SPACING);
  const j1 = Math.ceil(b.maxY / GUST_SPACING);

  const cycle = 9 / gust; // windier → puffs sweep through faster
  const ruffle = new Path2D();
  let anyRuffle = false;

  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const r = hash(i * 7 + 1, j * 7 + 3);
      if (r > 0.45) continue; // most of the sea is calm between puffs
      const frac = (((time / cycle + r * 3.1) % 1) + 1) % 1;
      const alpha = Math.sin(Math.PI * frac); // 0 → 1 → 0 over the cycle
      if (alpha < 0.12) continue;

      const drift = (frac - 0.5) * GUST_SPACING * 1.3 * gust;
      const wx = (i + (r - 0.5) * 0.5) * GUST_SPACING + w.x * drift;
      const wy = (j + (hash(j, i) - 0.5) * 0.5) * GUST_SPACING + w.y * drift;
      const p = worldToScreen(cam, { x: wx, y: wy });
      const rad = GUST_SPACING * 0.5 * cam.ppm * (0.7 + 0.5 * hash(i, j + 9));
      if (rad < 6) continue;

      const a = 0.15 * alpha * gust;
      const g = ctx.createRadialGradient(p.x, p.y, rad * 0.15, p.x, p.y, rad);
      g.addColorStop(0, `rgba(4,24,38,${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(4,24,38,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();

      // The ruffle inside the paw — only close in, and only once the patch is well established
      // (so flecks don't pop into being at the patch's faint edges).
      if (cam.ppm > 4 && alpha > 0.5) {
        for (let k = 0; k < 6; k++) {
          const ang = hash(k * 3, i + j) * Math.PI * 2;
          const dist = rad * 0.85 * hash(i * 17 + k, j * 17 + k * 3);
          const fx = p.x + Math.cos(ang) * dist;
          const fy = p.y + Math.sin(ang) * dist;
          ruffle.moveTo(fx + 1.1, fy);
          ruffle.arc(fx, fy, 1.1, 0, Math.PI * 2);
          anyRuffle = true;
        }
      }
    }
  }

  if (anyRuffle) {
    ctx.fillStyle = 'rgba(3,20,32,0.26)';
    ctx.fill(ruffle);
  }
}

// Sun sparkle: tiny bright flecks that twinkle on and off, gathered into a slow band along
// the light axis so it reads as glitter off the sun, not random noise. One batched fill;
// only when the camera is close enough for it to register.
const GLITTER_SPACING = 6.5;

function drawGlitter(ctx, cam, w, gust, time) {
  const zoom = zoomFade(cam.ppm, 6, 11);
  if (zoom <= 0.001) return;

  const b = visibleBounds(cam, GLITTER_SPACING);
  const i0 = Math.floor(b.minX / GLITTER_SPACING);
  const i1 = Math.ceil(b.maxX / GLITTER_SPACING);
  const j0 = Math.floor(b.minY / GLITTER_SPACING);
  const j1 = Math.ceil(b.maxY / GLITTER_SPACING);

  const path = new Path2D();
  let any = false;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const r = hash(i * 3 + 2, j * 5 + 7);
      const pulse = Math.max(0, Math.sin(time * 2.4 + r * Math.PI * 2));
      const spark = pulse * pulse * pulse * pulse; // sharp + sparse: brief flashes
      if (spark < 0.4) continue;
      const wx = (i + (r - 0.5) * 0.8) * GLITTER_SPACING;
      const wy = (j + (hash(j, i) - 0.5) * 0.8) * GLITTER_SPACING;
      // The sun band brightens flecks along the light axis but never gates them off: it
      // rides a floor (0.4 → 1.0) so some glitter is always present, and its wavelength is
      // short enough that several bands cross the viewport at once — no screen-wide blackout
      // as it drifts. The fast per-fleck twinkle above is what keeps it sparse and alive.
      const band = 0.7 + 0.3 * Math.sin((wx * LIGHT.x + wy * LIGHT.y) * 0.05 + time * 0.2);
      const p = worldToScreen(cam, { x: wx, y: wy });
      const rad = (0.9 + 1.2 * spark) * band; // brightest flecks sit deepest in the band
      path.moveTo(p.x + rad, p.y);
      path.arc(p.x, p.y, rad, 0, Math.PI * 2);
      any = true;
    }
  }
  if (any) {
    ctx.fillStyle = `rgba(255,250,236,${(0.6 * zoom * gust).toFixed(3)})`;
    ctx.fill(path);
  }
}

// 0 below `lo`, 1 above `hi`, smooth between — used to fade fine detail in as you zoom in.
const zoomFade = (ppm, lo, hi) => (hi <= lo ? 1 : clamp((ppm - lo) / (hi - lo), 0, 1));

export function drawBoat(ctx, cam, boat, time) {
  const p = worldToScreen(cam, boat.pos);
  const L = 4.2 * cam.ppm; // hull length in pixels
  const B = L * 0.32; // beam
  const t = boat.telemetry;

  ctx.save();
  ctx.translate(p.x, p.y);

  // Identity halo: a soft ring in the player's colour, easy to pick out when the camera
  // zooms out to keep both boats framed.
  ctx.beginPath();
  ctx.arc(0, 0, L * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = withAlpha(boat.color, 0.5);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.rotate(boat.heading);

  // --- Wake: foam trailing astern, longer the faster you go --------------------
  const speed = Math.hypot(boat.vel.x, boat.vel.y);
  const wake = Math.min(1, speed / 6);
  if (wake > 0.02) {
    const g = ctx.createLinearGradient(-L * 0.5, 0, -L * 0.5 - L * 2.2 * wake, 0);
    g.addColorStop(0, `rgba(230,244,250,${0.28 * wake})`);
    g.addColorStop(1, 'rgba(230,244,250,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, -B * 0.32);
    ctx.lineTo(-L * 0.5 - L * 2.2 * wake, -B * 0.7);
    ctx.lineTo(-L * 0.5 - L * 2.2 * wake, B * 0.7);
    ctx.lineTo(-L * 0.5, B * 0.32);
    ctx.closePath();
    ctx.fill();
  }

  // --- Hull: a pointed dinghy, bow at +x --------------------------------------
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0); // bow
  ctx.quadraticCurveTo(L * 0.12, -B * 0.5, -L * 0.42, -B * 0.42);
  ctx.quadraticCurveTo(-L * 0.5, -B * 0.3, -L * 0.5, 0); // transom (port)
  ctx.quadraticCurveTo(-L * 0.5, B * 0.3, -L * 0.42, B * 0.42);
  ctx.quadraticCurveTo(L * 0.12, B * 0.5, L * 0.5, 0);
  ctx.closePath();
  ctx.fillStyle = '#f2ead9'; // warm deck
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3a2f22';
  ctx.stroke();

  // Cockpit, in the player's colour
  ctx.beginPath();
  ctx.ellipse(-L * 0.1, 0, L * 0.18, B * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = boat.color;
  ctx.fill();

  // --- Rudder: at the transom, deflected by helm (tiller side, matches the key) -------
  ctx.save();
  ctx.translate(-L * 0.5, 0);
  ctx.rotate(-boat.rudder * 0.5);
  ctx.strokeStyle = '#2a2119';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-L * 0.2, 0);
  ctx.stroke();
  ctx.restore();

  // --- Mast, boom and sail ----------------------------------------------------
  const mastX = L * 0.16;
  const a = t ? t.boomAngle : 0;
  const lee = t ? t.lee : 1;
  const luff = t ? t.luff : 0;
  const boomLen = L * 0.6;
  // Boom points aft (−x) swung out toward the leeward side (±y).
  const bx = mastX + Math.cos(a) * -boomLen;
  const by = Math.sin(a) * lee * boomLen;

  // Sail: a curve from mast to boom-end that bellies to leeward. Only an *over-eased* sail
  // flaps (luffs) — an over-sheeted one is stalled but pulled taut, so it stays full and
  // stiff. `luffing` is true only when the boom is eased past the optimum.
  const dx = bx - mastX;
  const dy = by;
  const clen = Math.hypot(dx, dy) || 1;
  const nx = -dy / clen; // chord normal
  const ny = dx / clen;
  const sign = Math.sign(nx * 0 + ny * lee) || 1; // point the belly toward the lee side
  const luffing = t && t.boomAngle > t.boomFree; // eased past the optimum → the flapping side
  const flap = luffing && luff < 0.6 ? (1 - luff) * Math.sin(time * 22) * 0.25 : 0;
  const belly = (0.32 * luff + 0.12 + flap) * boomLen * sign;
  const midX = (mastX + bx) / 2 + nx * belly;
  const midY = by / 2 + ny * belly;
  const weak = luffing && luff < 0.4; // ragged + pale only when genuinely luffing
  ctx.beginPath();
  ctx.moveTo(mastX, 0);
  ctx.quadraticCurveTo(midX, midY, bx, by);
  ctx.lineWidth = luffing && luff < 0.6 ? 2 : 3;
  ctx.strokeStyle = weak ? 'rgba(245,245,240,0.6)' : '#fbfaf6';
  // Fill the sail lightly so it reads as cloth, not a line.
  ctx.lineTo(mastX, 0);
  ctx.fillStyle = weak ? 'rgba(245,245,240,0.18)' : 'rgba(251,250,246,0.85)';
  ctx.fill();
  ctx.stroke();

  // Boom (spar)
  ctx.beginPath();
  ctx.moveTo(mastX, 0);
  ctx.lineTo(bx, by);
  ctx.strokeStyle = '#4a3c28';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Mast
  ctx.beginPath();
  ctx.arc(mastX, 0, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = '#4a3c28';
  ctx.fill();

  ctx.restore();

  if (boat.gybeFx > 0) {
    drawGybeSplash(ctx, p, L, boat.gybeFx, boat.gybePower);
    drawGybeCallout(ctx, p, L, boat.gybeFx, boat.gybePower);
  }
}

// A "GYBE!" shout above the boat that rises and fades — names the crash so the cost (the
// speed you just lost and the slew you have to steer out of) is unmistakable.
function drawGybeCallout(ctx, p, L, fx, power) {
  const y = p.y - L * 0.85 - (1 - fx) * 26; // drifts upward as it fades
  const size = 14 + 10 * power;
  ctx.font = `800 ${size.toFixed(0)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(0,0,0,${(0.5 * fx).toFixed(2)})`;
  ctx.strokeText('GYBE!', p.x, y);
  ctx.fillStyle = `rgba(255,90,74,${fx.toFixed(2)})`;
  ctx.fillText('GYBE!', p.x, y);
  ctx.textAlign = 'left';
}

// A crash-gybe splash: an expanding foam ring with spray, drawn in screen space around
// the boat. Bigger and brighter the harder the gybe; fades over the effect's lifetime.
function drawGybeSplash(ctx, p, L, fx, power) {
  const grow = 1 - fx; // 0 at the slam → 1 as it fades
  const r = L * (0.45 + 1.7 * grow) * (0.6 + 0.6 * power);
  const alpha = fx * (0.15 + 0.5 * power);

  ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
  ctx.lineWidth = 1.5 + 2 * power;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();

  // Radial spray flecks flung outward.
  const flecks = Math.round(6 + 10 * power);
  ctx.fillStyle = `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`;
  for (let k = 0; k < flecks; k++) {
    const ang = (k / flecks) * Math.PI * 2 + power * 4;
    const rr = r * (0.75 + 0.4 * hash(k, 11));
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Draws the course: the numbered marks (with rounding rings) and the separate start and
// finish lines, each strung between two posts and labelled.
export function drawCourse(ctx, cam, course) {
  for (const m of course.marks) {
    const mp = worldToScreen(cam, m);
    ctx.beginPath();
    ctx.arc(mp.x, mp.y, m.r * cam.ppm, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,140,66,0.09)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,140,66,0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawBuoy(ctx, mp, '#ff8c42', 8, m.label);
  }

  drawGateLine(ctx, cam, course.start, 'rgba(255,255,255,0.5)', '#ffd36e', 'START');
  drawGateLine(ctx, cam, course.finish, 'rgba(120,235,160,0.75)', '#7fe0a0', 'FINISH');
}

function drawGateLine(ctx, cam, line, stroke, buoyColor, label) {
  const a = worldToScreen(cam, line.a);
  const b = worldToScreen(cam, line.b);
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  drawBuoy(ctx, a, buoyColor, 6);
  drawBuoy(ctx, b, buoyColor, 6);
  ctx.fillStyle = stroke;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 9);
  ctx.textAlign = 'left';
}

// The coaching ghost: the illuminated trail it has sailed (fading toward the tail) plus a
// glowing orb at its head. Watching it sail the lap teaches the angles by example.
export function drawGhost(ctx, cam, ghost) {
  const tr = ghost.trail;
  if (tr.length > 1) {
    // Whole trail as one dim stroke + a brighter recent tail — 2 strokes, not one per point.
    const full = new Path2D();
    const recent = new Path2D();
    const tailFrom = Math.max(0, tr.length - 26);
    let s = worldToScreen(cam, tr[0]);
    full.moveTo(s.x, s.y);
    for (let i = 1; i < tr.length; i++) {
      s = worldToScreen(cam, tr[i]);
      full.lineTo(s.x, s.y);
      if (i === tailFrom) recent.moveTo(s.x, s.y);
      else if (i > tailFrom) recent.lineTo(s.x, s.y);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = withAlpha(ghost.color, 0.4);
    ctx.stroke(full);
    ctx.strokeStyle = withAlpha(ghost.color, 0.85);
    ctx.stroke(recent);
  }
  if (!ghost.done) {
    const p = worldToScreen(cam, ghost.boat.pos);
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 15);
    glow.addColorStop(0, withAlpha(ghost.color, 0.95));
    glow.addColorStop(0.4, withAlpha(ghost.color, 0.55));
    glow.addColorStop(1, withAlpha(ghost.color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuoy(ctx, p, color, radius, letter) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  if (letter) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, p.x, p.y + 0.5);
    ctx.textBaseline = 'alphabetic';
  }
}

// #rrggbb → rgba(...) with the given alpha.
export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Cheap deterministic hash → [0,1). Stable per world cell so the sea doesn't shimmer
// randomly as the camera moves.
function hash(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
