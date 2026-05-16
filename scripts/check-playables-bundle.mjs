/**
 * Mirrors Google's playables_bundle_analyzer filename rule:
 * ^[a-zA-Z0-9\-\._]+$
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const pattern = /^[a-zA-Z0-9._-]+$/;
const issues = [];

if (!fs.existsSync(distDir)) {
  console.error('Run npm run build first — dist/ not found.');
  process.exit(1);
}

for (const root of walk(distDir)) {
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name);
    if (fs.statSync(full).isDirectory()) continue;
    if (!pattern.test(name)) {
      issues.push(full);
    }
  }
}

const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
const external = [...html.matchAll(/\bhttps?:\/\/[^\s"'<>]+/g)].map((m) => m[0]);
const badExternal = external.filter(
  (url) =>
    !url.includes('youtube.com/game_api') &&
    /[+@#?&=;:()]/.test(url),
);

if (issues.length) {
  console.error('Unsupported filenames in dist/:');
  issues.forEach((f) => console.error(' ', f));
}

if (badExternal.length) {
  console.error('index.html loads external URLs with unsupported characters (remove for Playables):');
  badExternal.forEach((u) => console.error(' ', u));
}

if (issues.length || badExternal.length) {
  process.exit(1);
}

console.log('Playables bundle filenames OK (%d files under dist/).', countFiles(distDir));

function* walk(dir) {
  yield dir;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) yield* walk(full);
  }
}

function countFiles(dir) {
  let n = 0;
  for (const root of walk(dir)) {
    for (const name of fs.readdirSync(root)) {
      if (fs.statSync(path.join(root, name)).isFile()) n++;
    }
  }
  return n;
}
