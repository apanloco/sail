// All tunable knobs in one place. Milestone 1 is "sail until it feels good", so the
// numbers here are meant to be nudged. Everything downstream reads from this object.

const deg = (d) => (d * Math.PI) / 180;

export const CONFIG = {
  // True wind, stored as the air's velocity vector — the direction it blows TOWARD.
  // PI/2 points +y (south / down the screen), i.e. a wind FROM the north.
  windSpeed: 7,
  windDir: Math.PI / 2,

  boat: {
    // --- Sail --------------------------------------------------------------
    // The sail drives best when the boom sits at ~half the apparent-wind angle (45° on a
    // reach, 90° on a run). Drive falls off if you ease past that (luff) or over-sheet
    // (stall). Wide bands = forgiving, controllable trim.
    Csail: 0.02, // overall drive strength
    maxBoom: deg(90), // boom fully eased = 90° (the run optimum)
    luffWidth: deg(14), // ease past the optimum and drive dies fast (flapping)
    stallWidth: deg(42), // gentler falloff when over-sheeted (over-trimmed)
    stallFloor: 0.1, // a hard-sheeted sail still pulls a little
    noGoLo: deg(35), // below this true-wind angle there's no drive (in irons)
    noGoHi: deg(50), // full drive available from here out

    // --- Hull --------------------------------------------------------------
    dragFwd: 0.02, // forward drag (quadratic) — sets top speed
    dragLat: 4.0, // sideways resistance (the centreboard) — keep large

    // --- Gybe --------------------------------------------------------------
    // Gybing (stern through the wind) is automatic, but if you cross with the sheet
    // eased out — no tension — the boom slams across and you pay for it. Penalty scales
    // with how far out the boom was; sheet in before you gybe for a clean one.
    gybeSpeedLoss: 0.65, // fraction of speed scrubbed by a fully-eased crash gybe
    gybeBroach: 1.8, // round-up kick (rad/s) from a full crash gybe — catch it with the helm
    gybeMinEase: 0.25, // boom eased less than this gybes cleanly (no penalty)

    // --- Steering ----------------------------------------------------------
    rudderTorque: 0.55, // turning force per unit rudder, scaled by boat speed
    angDamp: 3.0, // rotational drag — how quickly a turn settles

    // --- Control response --------------------------------------------------
    sheetSpeed: 0.45, // how fast the sheet trims in/out — slower = finer trim control
    rudderRate: 4.0, // how fast the rudder follows the key (and re-centres)

    length: 4.2, // Laser hull length, metres — used for drawing scale
  },

  render: {
    pixelsPerMeter: 12,
  },
};
