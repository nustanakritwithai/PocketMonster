import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_FILE_EXTENSIONS = new Set(['.css', '.html', '.ico', '.js', '.json', '.mjs', '.png', '.svg', '.webmanifest', '.woff', '.woff2']);
const ROOT_EXCLUDES = new Set([
  'deployment-manifest.json',
  'firebase.json',
  'firestore.indexes.json',
  'package-lock.json',
  'package.json',
  'patch-manifest.json',
  'server_save_backup.json',
  'workspace-manifest.json',
]);
const PUBLIC_DIRECTORIES = ['asset-presentation/', 'assets/', 'pirate-fruit-offline/'];
const DEPENDENCY_EXTENSIONS = new Set([
  '.bin', '.css', '.gif', '.glb', '.gltf', '.html', '.ico', '.jpeg', '.jpg', '.js', '.json',
  '.mjs', '.mp3', '.ogg', '.png', '.svg', '.wasm', '.wav', '.webmanifest', '.webp', '.woff', '.woff2',
]);
const TEXT_DEPENDENCY_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs']);
export const REQUIRED_V9_ENTRY_FILES = Object.freeze(['index.html', 'v900.html', 'scene-v900.html']);
const REQUIRED_BOOTSTRAP_FILES = [
  ...REQUIRED_V9_ENTRY_FILES,
  'entry-preload.mjs',
  'entry-preload-v900.mjs',
  'launch-bootstrap.mjs',
  'runtime-config.mjs',
  'startup-errors.mjs',
  'chat-runtime.mjs',
  'online-world-bridge-v900.mjs',
  'online-world-shell-v900.mjs',
  'pirate-save-bridge-v900.mjs',
  'pirate-fruit-offline/pocket-bootstrap.mjs',
  'scene-entry-v900.mjs',
  'worlds-v900.mjs',
];

function normalize(relative) {
  return relative.replaceAll('\\', '/');
}

export function isPublicGameFile(relative) {
  const name = normalize(relative);
  if (path.extname(name).toLowerCase() === '.md') return false;
  if (PUBLIC_DIRECTORIES.some(prefix => name.startsWith(prefix))) return true;
  if (name.includes('/')) return false;
  return !ROOT_EXCLUDES.has(name) && ROOT_FILE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean).map(normalize);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function cleanLocalReference(value) {
  if (typeof value !== 'string') return null;
  let reference = value.trim();
  if (!reference || reference.startsWith('#') || reference.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(reference)) return null;
  reference = reference.split(/[?#]/, 1)[0];
  if (!reference || reference.endsWith('/')) return null;
  try { reference = decodeURIComponent(reference); } catch { /* keep the literal path */ }
  return DEPENDENCY_EXTENSIONS.has(path.posix.extname(normalize(reference)).toLowerCase()) ? normalize(reference) : null;
}

function addMatches(source, expression, references, valueIndex = 2) {
  for (const match of source.matchAll(expression)) {
    const reference = cleanLocalReference(match[valueIndex]);
    if (reference) references.add(reference);
  }
}

function collectJsonStrings(value, references) {
  if (typeof value === 'string') {
    const reference = cleanLocalReference(value);
    if (reference) references.add(reference);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, references);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectJsonStrings(item, references);
  }
}

export function extractPublicDependencyReferences(relative, source) {
  const extension = path.posix.extname(normalize(relative)).toLowerCase();
  const references = new Set();
  if (extension === '.html') {
    addMatches(source, /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gis, references);
  } else if (extension === '.css') {
    addMatches(source, /@import\s+(?:url\(\s*)?(["'])(.*?)\1\s*\)?/gis, references);
    for (const match of source.matchAll(/\burl\(\s*(?:(["'])(.*?)\1|([^)'"\s][^)]*))\s*\)/gis)) {
      const reference = cleanLocalReference(match[2] || match[3]);
      if (reference) references.add(reference);
    }
  } else if (extension === '.js' || extension === '.mjs') {
    addMatches(source, /\bimport\s*\(\s*(["'])(.*?)\1\s*\)/gis, references);
    addMatches(source, /\b(?:import|export)\s+(?:[^;'"()]*?\bfrom\s*)?(["'])(.*?)\1/gis, references);
    addMatches(source, /\bnew\s+URL\s*\(\s*(["'])(.*?)\1\s*,\s*import\.meta\.url\s*\)/gis, references);
    // Vite chunk maps and runtime catalogs keep browser-loaded filenames in string literals.
    addMatches(source, /(["'])((?:\.{1,2}\/|\/)[^'"\\\r\n]+)\1/g, references);
  } else if (extension === '.json') {
    let json;
    try { json = JSON.parse(source); } catch (error) {
      throw new Error(`Invalid public JSON dependency ${relative}: ${error.message}`);
    }
    collectJsonStrings(json, references);
  }
  return references;
}

function insideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function resolvePublicDependency(root, importer, reference) {
  const rootPath = path.resolve(root);
  const importerDirectory = path.posix.dirname(normalize(importer));
  const candidates = [];
  if (reference.startsWith('/')) {
    candidates.push(reference.slice(1));
  } else {
    candidates.push(path.posix.normalize(path.posix.join(importerDirectory, reference)));
    if (!reference.startsWith('../')) candidates.push(reference.replace(/^\.\//, ''));
  }

  for (const candidate of new Set(candidates)) {
    const absolute = path.resolve(rootPath, ...normalize(candidate).split('/'));
    if (!insideRoot(rootPath, absolute)) throw new Error(`Public dependency escapes the repository: ${reference} from ${importer}`);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) return normalize(path.relative(rootPath, absolute));
  }
  throw new Error(`Missing public dependency ${reference} referenced by ${importer}`);
}

export function collectPublicDependencyClosure(root = process.cwd(), entryFiles = REQUIRED_V9_ENTRY_FILES) {
  const rootPath = path.resolve(root);
  const queue = [...entryFiles].map(normalize);
  const closure = new Set();
  while (queue.length > 0) {
    const relative = queue.shift();
    if (closure.has(relative)) continue;
    const absolute = path.resolve(rootPath, ...relative.split('/'));
    if (!insideRoot(rootPath, absolute) || !fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`Required V9 entry or dependency is missing: ${relative}`);
    }
    if (!isPublicGameFile(relative)) throw new Error(`V9 entry depends on a non-public file: ${relative}`);
    closure.add(relative);
    const extension = path.posix.extname(relative).toLowerCase();
    if (!TEXT_DEPENDENCY_EXTENSIONS.has(extension)) continue;
    const source = fs.readFileSync(absolute, 'utf8');
    for (const reference of extractPublicDependencyReferences(relative, source)) {
      const dependency = resolvePublicDependency(rootPath, relative, reference);
      if (!closure.has(dependency)) queue.push(dependency);
    }
  }
  return new Set([...closure].sort());
}

export function buildGitHubPages({ root = process.cwd(), output = path.join(root, 'dist-pages'), writeRootManifest = false } = {}) {
  const dependencyClosure = collectPublicDependencyClosure(root);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const relative of REQUIRED_BOOTSTRAP_FILES) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error(`Required bootstrap file is missing: ${relative}`);
  }
  const files = [...new Set([
    ...trackedFiles(root).filter(isPublicGameFile),
    ...REQUIRED_BOOTSTRAP_FILES,
    ...dependencyClosure,
  ])].sort();
  for (const relative of files) {
    const source = path.join(root, relative);
    const destination = path.join(output, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  fs.writeFileSync(path.join(output, '.nojekyll'), '', 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const entries = files.map(relative => {
    const file = path.join(output, relative);
    return { path: relative, size: fs.statSync(file).size, sha256: sha256(file) };
  });
  const contentDigest = crypto.createHash('sha256').update(entries.map(entry => `${entry.sha256}  ${entry.path}\n`).join('')).digest('hex').slice(0, 12);
  const manifest = {
    schemaVersion: 1,
    buildId: `${packageJson.version}.content.${contentDigest}`,
    serverVersion: packageJson.version,
    gameVersion: packageJson.version,
    publishedAtUtc: new Date().toISOString(),
    files: entries,
  };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(path.join(output, 'patch-manifest.json'), json, 'utf8');
  if (writeRootManifest) fs.writeFileSync(path.join(root, 'patch-manifest.json'), json, 'utf8');
  return { output, manifest };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const root = process.cwd();
  const writeRootManifest = process.argv.includes('--write-root-manifest');
  const { output, manifest } = buildGitHubPages({ root, writeRootManifest });
  console.log(`Built ${manifest.files.length} public files in ${output}`);
  console.log(`Patch ${manifest.buildId}${writeRootManifest ? ' (root manifest updated)' : ''}`);
}
