#!/usr/bin/env node
// Compare how every dependency resolves in two Cindy Host release layouts.
//
// Usage: node tools/release-resolution-check.mjs <reference-release> <candidate-release>
//
// For each package directory present in both releases, and for each name it
// declares in dependencies / optionalDependencies / peerDependencies, walk Node's
// bare-specifier lookup (each enclosing node_modules, nearest first) in each
// layout and compare what it finds (name@version plus a hash of package.json).
// Exits non-zero on any difference: a candidate layout that removes copies (for
// example by deduping) must not change which package any import resolves to.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const [refRoot, candRoot] = process.argv.slice(2).map(p => p && path.resolve(p));
if (!refRoot || !candRoot) { console.error('Usage: release-resolution-check.mjs <reference> <candidate>'); process.exit(2); }

function packageDirs(root) {
  const out = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some(e => e.isFile() && e.name === 'package.json') && dir.includes(`${path.sep}node_modules${path.sep}`)) out.push(dir);
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name));
  })(path.join(root, 'node_modules'));
  return out;
}

const identityCache = new Map();
function identity(dir) {
  if (!identityCache.has(dir)) {
    const raw = fs.readFileSync(path.join(dir, 'package.json'));
    const pkg = JSON.parse(raw);
    identityCache.set(dir, `${pkg.name}@${pkg.version}#${createHash('sha256').update(raw).digest('hex').slice(0, 12)}`);
  }
  return identityCache.get(dir);
}

function resolve(root, importerDir, name) {
  for (let dir = importerDir; dir === root || dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
    if (path.basename(dir) !== 'node_modules') {
      const candidate = path.join(dir, 'node_modules', ...name.split('/'));
      if (fs.existsSync(path.join(candidate, 'package.json'))) return identity(candidate);
    }
    if (dir === root) break;
  }
  return null;
}

const ref = packageDirs(refRoot);
const candSet = new Set(packageDirs(candRoot).map(d => path.relative(candRoot, d)));
let importers = 0, edges = 0, unresolvedBoth = 0;
const differences = [];
for (const dir of ref) {
  const rel = path.relative(refRoot, dir);
  if (!candSet.has(rel)) continue;   // removed copy: its importers now reach an identical copy, checked below
  importers++;
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const names = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);
  for (const name of names) {
    edges++;
    const a = resolve(refRoot, dir, name);
    const b = resolve(candRoot, path.join(candRoot, rel), name);
    if (a === null && b === null) { unresolvedBoth++; continue; }   // optional/peer deps absent in both
    if (a !== b) differences.push(`${rel} -> ${name}: reference ${a ?? 'unresolved'}, candidate ${b ?? 'unresolved'}`);
  }
}
const removed = ref.length - importers;
console.log(`reference packages ${ref.length}, candidate packages ${candSet.size}, compared importers ${importers}, removed copies ${removed}`);
console.log(`dependency edges checked ${edges} (unresolved in both: ${unresolvedBoth}), differences ${differences.length}`);
for (const d of differences.slice(0, 20)) console.log('  DIFF', d);
process.exit(differences.length ? 1 : 0);
