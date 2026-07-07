// Tiny Web Audio synth for game sound effects — no audio files, everything is generated.
// The AudioContext must be unlocked by a user gesture (see resumeAudio), which main.js
// wires to the first keypress. A background music track can be layered on top later.
let actx = null;

function ac() {
  if (!actx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    actx = new Ctor();
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}

// Call from a user-gesture handler to unlock audio on browsers that block autoplay.
export function resumeAudio() {
  ac();
}

function tone(freq, dur, { type = 'sine', gain = 0.2, at = 0, glideTo } = {}) {
  const c = ac();
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise(dur, { gain = 0.2, at = 0, cutoff = 700 } = {}) {
  const c = ac();
  const t0 = c.currentTime + at;
  const n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur);
}

export const sfx = {
  count: () => tone(520, 0.14, { type: 'square', gain: 0.14 }), // 3 · 2 · 1 beeps
  go: () => {
    tone(760, 0.4, { type: 'square', gain: 0.2 });
    tone(1140, 0.4, { type: 'square', gain: 0.1 });
  },
  mark: () => {
    tone(880, 0.1, { type: 'triangle', gain: 0.13 }); // rounded a mark
    tone(1320, 0.12, { type: 'triangle', gain: 0.1, at: 0.08 });
  },
  gybe: () => {
    noise(0.28, { gain: 0.28, cutoff: 480 }); // the crash
    tone(150, 0.28, { type: 'sawtooth', gain: 0.12, glideTo: 60 });
  },
  finish: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'square', gain: 0.16, at: i * 0.11 }));
  },
};
