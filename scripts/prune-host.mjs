#!/usr/bin/env node
// Remove files a built Cindy Host release never loads at runtime, then rewrite
// its SHA256SUMS.json inventory so it matches the pruned tree.
//
// Why: fnOS storage spaces formatted as ext4 use 64 KB clusters, so every file
// costs at least 64 KB. The upstream release has ~298k files (~24 GB on ext4);
// most are type declarations, source maps and duplicate module builds.
// See docs/fnos-platform-notes.md.
//
// Usage: node scripts/prune-host.mjs <release-dir>
// Writes <release-dir>/pruned.json with what was removed and why.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(root, 'release.json'))) {
  console.error('Usage: node scripts/prune-host.mjs <cindy-host release dir>');
  process.exit(1);
}
const release = JSON.parse(fs.readFileSync(path.join(root, 'release.json'), 'utf8'));
const harnesses = release.harnesses ?? ['claude-code-bin', 'codex-package-bin', 'pi-bin', 'ripgrep-bin'];

const stats = {};
const count = (rule, file) => {
  const s = (stats[rule] ??= { files: 0, bytes: 0 });
  s.files++;
  s.bytes += fs.lstatSync(file).size;
};
const removeFile = (rule, file) => { count(rule, file); fs.rmSync(file); };
const removeTree = (rule, dir) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) removeTree(rule, p);
    else count(rule, p);
  }
  fs.rmSync(dir, { recursive: true, force: true });
};

const KEEP = /^(licen[cs]e|notice|copying|authors|patents)/i;   // license notices must ship
const TYPES = /\.d\.(c|m)?ts$/;
const TEST_DIRS = new Set(['__tests__', 'test', 'tests', 'example', 'examples']);

// A package's dist-es copy is dead weight only when Node can never resolve to it:
// no "exports" map (which could pick it via the "import" condition) and "main"
// pointing elsewhere. Node ignores the bundler-only "module" field.
function distEsIsUnused(pkgDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
    return !pkg.exports && !String(pkg.main ?? '').includes('dist-es');
  } catch { return false; }
}

function walk(dir, pkgDir) {
  const isPkg = fs.existsSync(path.join(dir, 'package.json'));
  if (isPkg) pkgDir = dir;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      if (item.name === 'dist-types') { removeTree('types directory (dist-types)', p); continue; }
      if (item.name === 'dist-es' && pkgDir && distEsIsUnused(pkgDir)) { removeTree('unused ESM duplicate (dist-es)', p); continue; }
      // Only test/example folders directly under a package root, never deeper.
      if (isPkg && TEST_DIRS.has(item.name)) { removeTree('package test/example directory', p); continue; }
      walk(p, pkgDir);
      continue;
    }
    if (KEEP.test(item.name)) continue;
    if (TYPES.test(item.name)) removeFile('type declarations (.d.ts)', p);
    else if (item.name.endsWith('.map')) removeFile('source maps (.map)', p);
    else if (/\.(md|markdown)$/i.test(item.name)) removeFile('markdown docs', p);
  }
}

const nodeModules = path.join(root, 'node_modules');
walk(nodeModules, null);

// claude-agent-sdk ships a native Claude Code binary per platform. It is only
// used to run Claude Code, which this distribution does not bundle.
if (!harnesses.includes('claude-code-bin')) {
  const scope = path.join(nodeModules, '@anthropic-ai', 'claude-agent-sdk', 'node_modules', '@anthropic-ai');
  if (fs.existsSync(scope)) {
    for (const name of fs.readdirSync(scope)) {
      if (name.startsWith('claude-agent-sdk-')) removeTree('Claude Code native binary (harness not bundled)', path.join(scope, name));
    }
  }
}

// Drop directories left empty.
(function prune(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) prune(path.join(dir, item.name));
  }
  if (dir !== nodeModules && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
})(nodeModules);

// Rebuild the checksum inventory exactly as upstream does, minus removed files.
const checksums = {};
let files = 0;
(function inventory(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory()) inventory(p);
    else if (item.isFile() && item.name !== 'SHA256SUMS.json') {
      files++;
      checksums[path.relative(root, p).split(path.sep).join('/')] = createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  }
})(root);
const total = Object.values(stats).reduce((a, s) => ({ files: a.files + s.files, bytes: a.bytes + s.bytes }), { files: 0, bytes: 0 });
fs.writeFileSync(path.join(root, 'pruned.json'), JSON.stringify({ removed: stats, total, remainingFiles: files + 2 }, null, 2) + '\n');
checksums['pruned.json'] = createHash('sha256').update(fs.readFileSync(path.join(root, 'pruned.json'))).digest('hex');
fs.writeFileSync(path.join(root, 'SHA256SUMS.json'), JSON.stringify(checksums, null, 2) + '\n');

for (const [rule, s] of Object.entries(stats)) console.log(`${rule.padEnd(52)} ${String(s.files).padStart(7)} files ${(s.bytes / 2 ** 20).toFixed(0).padStart(6)} MiB`);
console.log(`Removed ${total.files} files (${(total.bytes / 2 ** 20).toFixed(0)} MiB); ${files + 1} files remain.`);
