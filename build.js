// Zero-dependency bundler: concatenate the ES modules (stripping import/export) into one
// classic script and inline it into a single self-contained HTML file. The result opens
// straight from the filesystem (double-click) — no server, no module CORS. Run: node build.js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Modules in dependency order (a name must be defined before the code that runs it).
const MODULES = [
  'src/core/vec.js',
  'src/config.js',
  'src/audio.js',
  'src/render/camera.js',
  'src/core/boat.js',
  'src/core/course.js',
  'src/core/sailing.js',
  'src/core/race.js',
  'src/core/step.js',
  'src/core/ghost.js',
  'src/core/world.js',
  'src/input/keyboard.js',
  'src/input/controls.js',
  'src/render/draw.js',
  'src/render/hud.js',
  'src/main.js',
];

function strip(src) {
  return src
    .split('\n')
    .filter((line) => !/^\s*import\b/.test(line)) // drop `import ... from '...'`
    .filter((line) => !/^\s*export\s*\{/.test(line)) // drop `export { ... }` re-exports (none, but safe)
    .map((line) => line.replace(/^(\s*)export\s+/, '$1')) // `export const x` → `const x`
    .join('\n');
}

const banner = '// Segla — bundled build. Edit the files in src/ and re-run `node build.js`.\n';
const body = MODULES.map((f) => `\n// ===== ${f} =====\n${strip(readFileSync(f, 'utf8'))}`).join('\n');
const bundle = `${banner}(function () {\n'use strict';\n${body}\n})();`;

// Detect accidental duplicate top-level declarations early (they'd throw at runtime).
const names = {};
for (const m of bundle.matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)) {
  names[m[1]] = (names[m[1]] || 0) + 1;
}
const dupes = Object.entries(names).filter(([, n]) => n > 1).map(([k]) => k);
if (dupes.length) console.warn('⚠ duplicate top-level names (may collide):', dupes.join(', '));

const html = readFileSync('index.html', 'utf8').replace(
  /<script type="module"[^>]*><\/script>/,
  `<script>\n${bundle}\n</script>`,
);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html); // index.html → served at the site root (and double-clicks locally)
console.log(`built dist/index.html  (${(html.length / 1024).toFixed(0)} KB, ${MODULES.length} modules inlined)`);
