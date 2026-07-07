// Maps held keys into a per-boat input { rudder, sheetDelta }. One binding per player,
// so couch multiplayer is just "more entries in this list" — no change to the sim.
//
// rudder:  the helm works like a real tiller — push it one way, the boat turns the other
//          (see step.js). "left" key = tiller to port, which steers the boat to starboard.
// sheetDelta: -1 = trim in (pull the sail in)  ..  +1 = ease out.
//          Up eases the sail out (loosen the rope), down trims it in (tighten).
export const PLAYER_BINDINGS = [
  { rudderLeft: 'KeyA', rudderRight: 'KeyD', sheetIn: 'KeyS', sheetOut: 'KeyW' }, // P1
  { rudderLeft: 'ArrowLeft', rudderRight: 'ArrowRight', sheetIn: 'ArrowDown', sheetOut: 'ArrowUp' }, // P2
];

export function readInput(keyboard, binding) {
  const axis = (neg, pos) => (keyboard.isDown(neg) ? -1 : 0) + (keyboard.isDown(pos) ? 1 : 0);
  return {
    rudder: axis(binding.rudderLeft, binding.rudderRight),
    sheetDelta: axis(binding.sheetIn, binding.sheetOut),
  };
}
