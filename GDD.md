# Segla — Game Design Document

A 2D sailing game. The goal is to **have fun while learning to sail a simple one-sail
dinghy** — the kind we call a *Laser* in Sweden. You control the two things a real
Laser sailor controls: the **sheet** (*skot*) and the **rudder** (*roder*). Everything
else — where the boat goes, how fast, whether you stall head-to-wind — emerges from
those two inputs and the wind.

---

## 1. Vision

> Sit down, feel the wind, trim the sail, steer around an island, and *get it* — why
> you can't sail straight into the wind, why you have to tack, why speed makes the wind
> feel like it shifts.

The game teaches by feel, not by tutorial text. If the physics is honest, the lessons
come for free. Fun first; realism only as far as it serves fun and learning.

**A session looks like:** you're at point A, you can see the true wind arrow, your
speed, the waves, and a bearing to point B. You trim and steer your way there, tacking
upwind when you have to, dodging rocks and rounding an island. Optionally a friend sails
a second boat on the same keyboard and you race.

---

## 2. Player controls

A Laser has one sail, so there are exactly two controls. This is the whole point of
choosing a Laser — tiny input space, deep behaviour.

| Control | Real term | What it does |
|--------|-----------|--------------|
| **Sheet** | *skot* | How far the sail is let out. Sheeted in = sail near centreline; sheeted out = sail swung out toward 90°. Controls how much of the wind becomes drive vs. how much the sail luffs (flaps uselessly). |
| **Rudder** | *roder* | Turns the boat. Turning force scales with boat speed — a stationary boat barely steers, which teaches "keep way on." |

### Couch multiplayer key map (MVP: 2 boats, one keyboard)

| | Rudder left / right | Sheet in / out |
|---|---|---|
| **Player 1** | `←` / `→` | `↑` / `↓` |
| **Player 2** | `A` / `D` | `W` / `S` |

Controls are **held**, not tapped — analog-feeling. Rudder returns toward centre when
released; sheet holds its last position (like a cleat) unless actively eased/trimmed.

---

## 3. The sailing model (the heart of the game)

This is hand-written. No physics engine — see §5 for why. All of it lives in a pure
core (§6) that takes state + inputs and returns new state.

### 3.1 State

- **True wind** `W_true` — a vector (direction + speed). MVP: roughly constant, with
  slow gentle shifts later.
- **Boat**: position `(x, y)`, heading `θ` (where the bow points), velocity `v` (a
  vector), angular velocity `ω`, sheet setting `s ∈ [0,1]`, rudder setting `r ∈ [−1,1]`.

### 3.2 Apparent wind — the first real lesson

The wind the sail *feels* is not the true wind; it's the true wind minus the boat's own
motion:

```
W_app = W_true − v
```

This is why picking up speed makes the wind seem to swing forward. It falls straight out
of the vector math — the player discovers it by sailing, we don't explain it.

### 3.3 Sail force

The sail is trimmed like a wing — there's a **best boom angle** and drive falls off if you
miss it. The player sets the boom angle directly with the sheet, and:

1. **Ideal trim ≈ half the wind angle** (the bisector): ~22° close-hauled, **45° on a beam
   reach, 90° on a run**. A **trim-efficiency** curve peaks there and falls off if you ease
   past it (luff — bites fast) or over-sheet (stall — gentler, with a small floor).
2. To keep that optimum **stable and intuitive** (rather than sliding around as the
   apparent wind shifts with speed), the ideal angle and the no-go gate are measured
   against the **true wind**. The force *magnitude* uses the **apparent** wind, so speed
   still self-limits and reaches still beat runs.
3. Drive scales with wind², vanishes in the no-go zone, and **fades as the boat nears wind
   speed downwind** (apparent wind dies) so you can't outrun the wind. The force acts along
   the sail's leeward normal, so the forward/side split — and thus which points of sail are
   fast — falls out of the geometry.

This is a deliberate game-design choice: bigger, stable optimum angles (matching a sailor's
intuition) make the boat controllable and *fun* to trim, at the cost of not modelling the
apparent-wind trim shift a racing sailor would actually make at speed.

### 3.4 Hull & rudder

- **Hull** resists sideways motion *strongly* (the centreboard) and forward motion
  *weakly* (drag). Each frame, split velocity into forward/lateral in the boat frame,
  apply heavy lateral damping and light forward drag. This is what turns sideways sail
  force into forward travel.
- **Rudder** applies a turning torque proportional to `r × boatSpeed`, changing `ω`
  then `θ`. No speed → no steering.

### 3.5 The no-go zone — emergent, not scripted

Point too close to dead upwind (~45°) and the sail can't make a useful angle of attack →
no drive → you stall. We don't code a "you may not go here" rule; it **emerges** from
the force model. The player learns they must **tack** (zig-zag upwind). This is the
single most satisfying "aha" in sailing and we get it for free from honest physics.

### 3.6 Waves

MVP: mostly visual (a scrolling, animated surface) plus a small periodic bob and a light
drift force so the sea feels alive. Not a gameplay obstacle at first; can grow into one.

---

## 4. World

A large, scrollable sea in world coordinates (metres). The screen is a **camera** onto
it; only what's on-screen is drawn.

- **Islands** — polygons (circles are fine for MVP) you sail around.
- **Rocks / stones** — circles to avoid.
- **Waypoints** — a start (A) and finish (B); later, a multi-mark course.
- **Camera** — follows the boat in single-player. In couch multiplayer it frames *both*
  boats (zoom-to-fit around their midpoint). Split-screen is a later option if they get
  too far apart.

### Collision (custom, ~30 lines)

Rocks are circles, islands are polygons/circles. After integrating each frame, test the
boat (a circle) against nearby obstacles. On overlap:

1. Find the surface normal `n`.
2. Push the boat out of the overlap along `n`.
3. Remove the into-surface velocity: `v -= (v·n)·n`.
4. Scrub some speed so it *feels* like a bump.

Collisions are rare "oops" events, not a core mechanic, so this simple resolution is
plenty — and it keeps a single integrator we fully control.

---

## 5. Why no off-the-shelf physics engine

2D engines (Matter.js, Planck.js) are **rigid-body + collision** engines. They solve
"boxes collide and stack." **None** of sailing lives there — apparent wind, sail
lift/drag, the no-go zone, hull leeway, and speed-dependent steering are all a custom
force model we must write regardless of engine choice.

An engine would only handle our (rare, simple) rock collisions — while its built-in
damping/restitution/friction sit on top of our force model and fight the gliding-boat
feel we're tuning. There is only ever **one** integrator; letting an engine own it buys
us little and costs us control. So: **custom force model + custom collision.**

---

## 6. Architecture

One idea makes single-player, couch, and future online multiplayer the *same* core:

> **Pure state + `step(world, inputsByBoat, dt) → world`.**
> Everything else is just *where inputs come from* and *who runs `step`*.

- **Single-player:** one boat, inputs from the keyboard.
- **Couch:** N boats, each boat reads a different key group from the same keyboard.
- **Online (future):** the server runs `step`; clients send inputs and render state. The
  core is unchanged.

So we **design for N boats from day one** and keep the simulation pure and serializable.
Per the repo guidelines: business/simulation logic depends inward and never imports DOM,
canvas, or input code. I/O stays at the edges.

### File layout (plain JS, ES modules)

```
index.html            canvas + minimal UI shell
src/
  main.js             bootstrap + game loop (requestAnimationFrame), wires input→step→render
  core/               PURE simulation — no DOM, no canvas
    world.js          world state factory: wind, obstacles, waypoints, boats[]
    boat.js           boat state + creation
    sailing.js        apparent wind, sail force, hull & rudder forces (pure math)
    collision.js      resolve boat vs. obstacles (pure)
    step.js           step(world, inputsByBoat, dt) → world
    vec.js            small 2D vector helpers
  input/
    keyboard.js       raw key state → per-boat input {rudder, sheetDelta}
    controls.js       player→key-group mapping (P1 arrows, P2 WASD)
  render/
    camera.js         world→screen transform, follow / fit-to-boats
    draw.js           sea, waves, islands, rocks, boats, wakes
    hud.js            wind arrow, speed, heading, bearing-to-mark
```

Core is testable without a browser (given the same inputs it returns the same state),
which is exactly what a future authoritative server needs.

---

## 7. HUD

Minimal, glanceable, non-intrusive:

- **True wind arrow** (direction, with a hint of strength).
- **Boat speed.**
- **Heading** and **bearing to the next mark** (so "sail A→B" is legible).
- Subtle **luffing indicator** when the sail is stalled/flapping — the game's gentle
  "trim me" nudge.

In couch multiplayer, each boat gets its own small readout.

---

## 8. Tech stack

- **Plain JavaScript + ES modules.** No compile step required; runs from any static
  server. Keep dependencies near zero.
- **Vite** *(optional, dev only)* for a fast dev server / hot reload. The shipped game
  stays a static single page.
- **Canvas 2D** for rendering the MVP. A scrolling camera over a large world is simple in
  Canvas. PixiJS (WebGL) is an easy later upgrade if we want richer animated water and
  many sprites.
- Single-page: one `index.html`, canvas fills the viewport, responsive.

---

## 9. Scope & milestones

**MVP = a couch two-player race** around a buoy course. The game found its shape early:
rather than an A→B cruise, it's a *race*, because a course forces every skill (upwind legs
you can't point straight at, downwind legs where a lazy gybe costs you).

1. ✅ **Feel the wind.** One boat, wind, full sailing model, HUD (wind compass with no-go
   zone, speed, heading). Physics verified: no-go zone, points of sail, tacking. *This
   milestone is the whole game; everything else is scaffolding.*
2. ✅ **Couch two-player race.** Two boats (P1 WASD, P2 arrows), race tracking (round the
   marks in order → cross the line → finish order + times), a **shared fit-to-both camera**
   that keeps each boat's target on screen, a per-player HUD, and a win banner with restart.
3. ✅ **Depth + variety.** A **three-buoy triangle** lap; **randomised wind direction per
   race** with a gentle in-race oscillation, so a fixed course sails differently every time;
   and a **crash-gybe penalty** (gybe with the sheet eased and you slam, broach, and lose
   speed — sheet in first for a clean one).
4. ✅ **Feel + coaching.** Real **tiller steering** (push the helm one way, the boat turns
   the other); the crash-gybe made clearer (a "GYBE!" callout, red HUD message, harsher
   speed loss); and a **coaching ghost** (press **H**) — a glowing orb launched from each
   boat that sails the whole lap at ~8× speed through the real physics, leaving a trail, so
   you learn the angles (upwind zig-zag, mark roundings) by watching it done.
5. ✅ **Race framing + feel.** A proper **start sequence** (press S → 3·2·1 countdown → go),
   a **separate finish line** downwind of the leeward mark so the course is a clean one-way
   loop (no looping back across the start), a **live wind shift** on R, and **synthesised
   sound** (countdown, mark roundings, crash gybes, finish — a music track can layer on top).
6. ⏭ **Obstacles.** Islands + rocks + custom collision (see §4).
7. ⏭ **Polish.** Best-time tracking, a reliable input path for demos (gamepads / two
   keyboards to dodge keyboard ghosting), and the background music track.

### Decisions made along the way

- **Separate finish line, placed for a one-way course** — the finish is its own line
  downwind of the leeward mark, crossed heading away from the course. An earlier version
  reused the start line, which (with the leeward mark right there) would force boats to loop
  back and cross oncoming traffic — something real race committees design courses to avoid.
  Rounding stays forgiving (either side), so there's no mandatory loop.
- **Course: a three-buoy triangle set to the wind, like a real race committee** — the
  windward mark is laid straight upwind of the start each race, so you always start at the
  leeward end and beat up to mark 1. The wind direction is randomised per race (the whole
  course faces a new bearing) and shifts gently as you sail. (An earlier version fixed the
  course and randomised only the wind, but that produced unrealistic starts — you'd begin
  next to a side mark with no proper beat — so we set the course to the wind instead.)
- **You must round marks, not touch them** — a rounding counts only once you reach the
  *outside* of the corner (the side of the mark away from both the leg in and the leg out),
  so diving into the zone and turning toward the next mark doesn't count; you have to sail
  around. (An earlier bearing-sweep test let you skip the leeward mark — passing close swings
  the bearing fast, so a corner-cut clocked up enough "sweep" — so we switched to which side
  of the mark you pass, which is what actually distinguishes a rounding from a cut.)
- **Gybe stays automatic, but has a cost** — crossing the stern with the sheet eased (no
  tension) slams the boom across: speed loss + a broach you steer out of. Rewards the real
  technique (sheet in, gybe, ease out) without adding a control or a new key.
- **Tiller steering, not arcade steering** — press left and the boat turns right, like
  holding a real tiller. And the sheet reads like a rope: down tightens (sail in), up
  loosens (sail out). Chosen for authenticity, since the game is about learning to sail.
- **Coaching ghost = a real boat, sped up** — H launches a boat run by an autopilot through
  the actual sailing model at ~8× speed, leaving an illuminated trail; you still sail it
  yourself. It sails *naturally* — the organic upwind zig-zag is the whole teaching value —
  and its only goal is to **reach the next mark** (get within its zone), not to round it
  precisely. (A geometric "ideal line" was tried; it rounded marks perfectly but the
  straight laylines looked lifeless, so we went back to a real boat sailing the beat.)

### Performance notes

- **The sea is the hot path.** Wave marks are batched into a few `Path2D` strokes by
  brightness (not a gradient + stroke per dash, which cost thousands of GPU calls when the
  camera zoomed out), and a level-of-detail grid keeps the dash count bounded at any zoom.
  A worst-case zoomed-out frame with both ghosts running measures ~0.8 ms.
- Ghost trails are one batched stroke each. Wave direction is shown by an arrowhead on each
  wavelet (no per-dash gradients); each wavelet also runs a fade-in → drift-downwind →
  fade-out cycle, offset per cell so the field flows with the wind.
- **Camera: shared zoom-to-fit**, not split-screen — simpler, keeps both players on one
  social view. It also frames each boat's current target (mark or finish) so you always
  see where to go; a floor on the zoom stops it getting uselessly tiny.
- **No boat-boat collision yet** — YAGNI for a first race; boats pass through each other.

---

## 10. Future: online multiplayer

A separate phase, deliberately deferred (YAGNI) but kept open by the pure core:

- **Rust authoritative server**, hosted on **render.com**. Clients send inputs; the
  server runs `step` and broadcasts world state; clients interpolate between snapshots.
- "Everyone can just join and sail" — an open sea with many boats — becomes a matter of
  N boats in the same `world`, which the architecture already assumes.
- The sailing model would be re-expressed (or shared) server-side; because the JS core is
  pure and deterministic-ish, it's a faithful reference to port from.

Nothing in the MVP should be built *for* this — only in a way that doesn't *block* it.

---

## 11. Open questions (to revisit)

- Wind: constant vs. gusts/shifts — how much variability is fun without being unfair?
- Do waves ever become a real gameplay force (surfing down them, capsize risk), or stay
  atmospheric?
- Couch camera: fit-to-both vs. split-screen threshold.
- Capsize? A Laser famously tips. Fun mechanic or frustration? (Lean: later, optional.)
