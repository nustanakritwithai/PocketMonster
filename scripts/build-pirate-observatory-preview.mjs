import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function walkFiles(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(full));
    else output.push(full);
  }
  return output;
}

function verifyRelativeModuleImports(root) {
  const previewDir = path.join(root, 'firebase-launcher', 'pirate-observatory');
  const files = walkFiles(previewDir).filter(file => file.endsWith('.mjs'));
  const importPattern = /(?:from\s+|import\s*)['"](\.\.?\/[^'"]+)['"]/g;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const target = path.resolve(path.dirname(file), match[1]);
      if (!fs.existsSync(target)) {
        throw new Error(`Pirate Observatory preview import is missing: ${path.relative(root, file)} -> ${match[1]}`);
      }
    }
  }
}

export function buildPirateObservatoryPreview({ root = process.cwd() } = {}) {
  const launcher = path.join(root, 'firebase-launcher');
  const source = path.join(root, 'pirate-observatory');
  const target = path.join(launcher, 'pirate-observatory');
  if (!fs.existsSync(launcher)) throw new Error('firebase-launcher must be built before the Observatory preview');
  if (!fs.existsSync(source)) throw new Error('pirate-observatory source is missing');

  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });

  for (const dependency of [
    'runtime-config.mjs',
    'launch-bootstrap.mjs',
    'pirate-fruit-island-map-v900.mjs',
  ]) {
    fs.copyFileSync(path.join(root, dependency), path.join(launcher, dependency));
  }

  const required = [
    'firebase-launcher/runtime-config.json',
    'firebase-launcher/runtime-config.mjs',
    'firebase-launcher/launch-bootstrap.mjs',
    'firebase-launcher/pirate-fruit-island-map-v900.mjs',
    'firebase-launcher/pirate-observatory/index.html',
    'firebase-launcher/pirate-observatory/bootstrap.mjs',
    'firebase-launcher/pirate-observatory/dashboard.css',
  ];
  for (const relative of required) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error(`Pirate Observatory preview artifact is missing ${relative}`);
  }

  verifyRelativeModuleImports(root);
  return Object.freeze({
    output: target,
    entry: 'pirate-observatory/index.html',
  });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = buildPirateObservatoryPreview();
  console.log(`Built Pirate Observatory preview: ${result.output}`);
  console.log(`Preview entry: /${result.entry}`);
}
