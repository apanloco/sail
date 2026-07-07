// Tracks which physical keys are currently held. The only place that touches the DOM
// keyboard API — everything else asks this for a boolean.
export function createKeyboard(target = window) {
  const held = new Set();
  const onDown = (e) => {
    held.add(e.code);
    if (HANDLED.has(e.code)) e.preventDefault(); // stop arrows scrolling the page
  };
  const onUp = (e) => held.delete(e.code);
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  return {
    isDown: (code) => held.has(code),
    dispose: () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
    },
  };
}

const HANDLED = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space', // peek out to the whole course
]);
