import { CONFIG } from './config.js';
import { createWorld } from './core/world.js';
import { step } from './core/step.js';
import { raceOver } from './core/race.js';
import { nextTarget } from './core/course.js';
import { createGhost, stepGhost } from './core/ghost.js';
import { createKeyboard } from './input/keyboard.js';
import { PLAYER_BINDINGS, readInput } from './input/controls.js';
import { createCamera, resize, frame } from './render/camera.js';
import { drawSea, drawCourse, drawBoat, drawGhost } from './render/draw.js';
import { drawHud } from './render/hud.js';
import { sfx, resumeAudio } from './audio.js';

// Composition root: wire input → simulation → render, and run the loop. All the DOM and
// timing lives here; the core stays pure.
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const keyboard = createKeyboard();
const cam = createCamera(CONFIG.render.pixelsPerMeter);
window.addEventListener('keydown', resumeAudio); // unlock audio on first gesture

const randomWind = () => ({ windDir: Math.random() * Math.PI * 2 });
let world = createWorld(CONFIG, randomWind());

// Race flow: wait for S → 3·2·1 countdown → racing → done (someone wins).
let phase = 'prestart'; // 'prestart' | 'countdown' | 'racing' | 'done'
let countdown = 0;
let goFlash = 0;
let ghosts = null; // H-key coaching ghosts, or null
let prevMark = [];
let prevGybe = [];
let prevFinishers = 0;

function resetTracking() {
  prevMark = world.boats.map((b) => b.race.nextMark);
  prevGybe = world.boats.map(() => 0);
  prevFinishers = 0;
}
function newRace() {
  world = createWorld(CONFIG, randomWind());
  ghosts = null;
  phase = 'prestart';
  countdown = 0;
  goFlash = 0;
  resetTracking();
}
resetTracking();

function fit() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels, render crisp on retina
  resize(cam, window.innerWidth, window.innerHeight);
  frame(cam, framePoints(null, true), 1); // snap to the course overview at load
}
window.addEventListener('resize', fit);

// What the camera frames. Racing: just the two boats, zoomed in so you can read the sail
// and rudder. Overview (pre-start, ghosts running, or holding Space to peek): the whole
// course at a steady wide zoom, so you see where you're headed. The overview box is a
// rotation-invariant square around the course, so a random wind never changes its zoom.
function framePoints(ghosts, overview) {
  if (!overview && !ghosts) {
    return world.boats.map((b) => b.pos); // follow: fit both boats, close in
  }
  const c = world.course;
  const all = [...c.marks, c.start.a, c.start.b, c.finish.a, c.finish.b];
  let cx = 0;
  let cy = 0;
  for (const p of all) {
    cx += p.x;
    cy += p.y;
  }
  cx /= all.length;
  cy /= all.length;
  let r = 10; // margin
  for (const p of all) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy) + 10);

  const pts = [
    { x: cx - r, y: cy - r },
    { x: cx + r, y: cy - r },
    { x: cx - r, y: cy + r },
    { x: cx + r, y: cy + r },
  ];
  for (const b of world.boats) pts.push(b.pos);
  if (ghosts) for (const g of ghosts) pts.push(g.boat.pos);
  return pts;
}

fit();

// Fixed-timestep simulation so the physics is frame-rate independent; render as often as
// the browser paints. `simTime` drives the wave animation.
const DT = 1 / 60;
let acc = 0;
let last = performance.now();
let simTime = 0;
let sWasDown = false;
let hWasDown = false;
let rWasDown = false;
let lastBeep = 0;
const GHOST_STEPS = 8; // sim sub-steps per frame → the ghost sails ~8× real speed

function frameLoop(now) {
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25; // after a tab switch, don't fast-forward forever

  // --- Input: S starts, R shifts wind / restarts, H toggles the coaching ghosts --------
  const sDown = keyboard.isDown('KeyS');
  if (sDown && !sWasDown && phase === 'prestart') {
    phase = 'countdown';
    countdown = 3.2;
    lastBeep = 4;
  }
  sWasDown = sDown;

  const rDown = keyboard.isDown('KeyR');
  if (rDown && !rWasDown) {
    if (phase === 'racing') world.windDirBase = Math.random() * Math.PI * 2; // live wind shift
    else newRace(); // prestart or done → fresh race, new wind
  }
  rWasDown = rDown;

  const hDown = keyboard.isDown('KeyH');
  if (hDown && !hWasDown) ghosts = ghosts ? null : world.boats.map((b) => createGhost(b, world.course));
  hWasDown = hDown;

  // --- Countdown → GO -------------------------------------------------------------------
  if (phase === 'countdown') {
    countdown -= elapsed;
    const sec = Math.ceil(countdown);
    if (sec < lastBeep && sec >= 1) {
      sfx.count();
      lastBeep = sec;
    }
    if (countdown <= 0) {
      phase = 'racing';
      goFlash = 0.7;
      sfx.go();
    }
  }
  if (goFlash > 0) goFlash = Math.max(0, goFlash - elapsed);

  // --- Simulation (only while racing) ---------------------------------------------------
  const inputs = PLAYER_BINDINGS.map((binding) => readInput(keyboard, binding));
  if (phase === 'racing') {
    acc += elapsed;
    while (acc >= DT) {
      step(world, inputs, DT);
      simTime += DT;
      acc -= DT;
    }
    playSimSounds();
    if (raceOver(world)) phase = 'done';
  } else {
    acc = 0; // don't bank a burst of steps while paused
    simTime += elapsed; // keep the water animating
  }

  if (ghosts) {
    for (const g of ghosts) for (let i = 0; i < GHOST_STEPS; i++) stepGhost(g, world.wind, world.cfg, DT);
  }

  // --- Render ---------------------------------------------------------------------------
  // Zoom in to follow while racing; peek out to the whole course when holding Space (or
  // before the start / while the ghosts demo the lap).
  const overview = phase !== 'racing' || keyboard.isDown('Space');
  // Racing: hug the boats so you can read sail and rudder, with a little sea around them —
  // the minimap tells you where to head. Overview: let it zoom right out to the course.
  frame(cam, framePoints(ghosts, overview), elapsed, overview ? {} : { pad: 28, maxPpm: 12 });
  drawSea(ctx, cam, world.wind, simTime);
  drawCourse(ctx, cam, world.course);
  world.boats.forEach((b) => drawBoat(ctx, cam, b, simTime));
  if (ghosts) ghosts.forEach((g) => drawGhost(ctx, cam, g));
  drawHud(ctx, cam, world, { phase, countdown, goFlash });

  requestAnimationFrame(frameLoop);
}

// Fire sounds off the sim's events: rounding a mark, a crash gybe, crossing the finish.
function playSimSounds() {
  world.boats.forEach((b, i) => {
    if (b.race.nextMark > prevMark[i]) {
      sfx.mark();
      prevMark[i] = b.race.nextMark;
    }
    if (b.gybeFx > prevGybe[i] + 0.2) sfx.gybe();
    prevGybe[i] = b.gybeFx;
  });
  if (world.finishers.length > prevFinishers) {
    sfx.finish();
    prevFinishers = world.finishers.length;
  }
}

requestAnimationFrame(frameLoop);
