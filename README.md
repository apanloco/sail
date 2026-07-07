# Segla ⛵

A 2D sailing game — learn to sail a Laser dinghy by feel. See [`GDD.md`](./GDD.md) for
the design.

## Play it — no server needed

Build a single self-contained file and open it:

```bash
node build.js      # or: npm run build
# then double-click dist/index.html  (opens straight from the filesystem)
```

`build.js` inlines all the code into one HTML file, so `dist/index.html` runs from a plain
`file://` — no server, nothing to install. Share that one file and it just works.

## Deploy (Render.com)

The game is entirely client-side (two-player couch is all local), so deploy it as a
**Static Site** — no web service, no backend.

- Easiest: this repo includes [`render.yaml`](./render.yaml). In Render choose
  **New → Blueprint**, pick the repo, and it configures everything.
- Or set it up manually — **New → Static Site**, then:
  - **Build Command:** `node build.js`
  - **Publish Directory:** `dist`

Render clones the repo, runs the build (bundling `src/` into `dist/index.html`), and serves
it over HTTPS on a CDN. Every push redeploys.

## Develop it

During development the source uses ES modules, which browsers only load over HTTP, so serve
the folder while editing (any static server) and open `http://localhost:8000`:

```bash
python3 -m http.server 8000
```

Re-run `node build.js` whenever you want a fresh single-file `dist/segla.html`.

## Race

Two players share one keyboard and race a **three-buoy triangle**. Press **S** to start —
a **3 · 2 · 1 countdown**, then go. Round marks 1 → 2 → 3 in order, then cross the separate
**finish line** (downwind of the leeward mark, so the course is a clean one-way loop). First
boat home wins.

Press **R** to **shift the wind** — mid-race it veers to a new direction live (the marks
stay put, so a beat can become a reach and you have to re-read the course); before a start
or after a win it rolls a fresh race. Sound effects play for the countdown, mark roundings,
crash gybes, and the finish (a music track can be added later).

Like a real race, the course is **set to the wind**: you start at the leeward (downwind)
end and **beat upwind** to mark 1. The **wind direction is random each race** and **shifts
gently** as you sail, so every race faces a different way and rewards reading the shifts.

| | Steer (tiller) | Sheet in | Ease out |
| --- | --- | --- | --- |
| **Player 1** (red) | `A` / `D` | `S` | `W` |
| **Player 2** (teal) | `←` / `→` | `↓` | `↑` |

Steering is a **tiller**: push it one way and the boat turns the *other* way — press
**left to turn right**, like a real dinghy. Sheet: **down tightens** the rope (sail in),
**up loosens** it (sail out).

Press **H** to launch a **coaching ghost** from each boat — a glowing orb that sails the
whole lap at high speed, tacking upwind and all, leaving an illuminated trail. Watch it to
learn the angles: how much to zig-zag upwind, how to round the marks. Press **H** again to
clear it.

Sail across the wind (a *reach*) for the most speed. Point too close to the wind and you
stall in the no-go zone (shaded red on your compass) — tack to make ground upwind. Running
downwind, ease the sail all the way out.

**Gybing** (turning downwind so the wind crosses your stern): the boom swings across on
its own, but if you cross with the sheet eased right out — no tension — it slams over and
you pay for it: a burst of spray, a broach you have to catch with the rudder, and lost
speed (your speed flashes red). Sheet in *before* you gybe, then ease out on the new side,
for a clean one. It's a real place to gain or lose a race.

## Layout

```
src/
  config.js          all tunable numbers (sail power, drag, helm, wind)
  core/              pure simulation — no DOM, testable in isolation
    vec.js           2D vector helpers
    boat.js          boat state
    sailing.js       the sail force model (apparent wind, luffing, no-go zone)
    step.js          step(world, inputs, dt) → world
    course.js        the windward-leeward course geometry
    race.js          per-boat progress + finish order
    world.js         builds a race: two boats, wind, course
  input/             keyboard → per-boat controls (one binding per player)
  render/            camera (fit-to-both), sea + boat + course drawing, HUD
  main.js            composition root: input → step → render loop
```

The core is a pure `step(world, inputs, dt) → world` over a *list* of boats, which is what
lets two players (and, later, an online server) drop in without a rewrite.
