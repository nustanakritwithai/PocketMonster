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
const PUBLIC_DIRECTORIES = ['asset-presentation/', 'assets/'];
const REQUIRED_BOOTSTRAP_FILES = ['entry-preload.mjs', 'launch-bootstrap.mjs', 'runtime-config.mjs', 'startup-errors.mjs'];

function normalize(relative) {
  return relative.replaceAll('\\', '/');
}

export function isPublicGameFile(relative) {
  const name = normalize(relative);
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

export function buildGitHubPages({ root = process.cwd(), output = path.join(root, 'dist-pages'), writeRootManifest = false } = {}) {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const relative of REQUIRED_BOOTSTRAP_FILES) {
    if (!fs.existsSync(path.join(root, relative))) throw new Error(`Required bootstrap file is missing: ${relative}`);
  }
  const files = [...new Set([...trackedFiles(root).filter(isPublicGameFile), ...REQUIRED_BOOTSTRAP_FILES])].sort();
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
