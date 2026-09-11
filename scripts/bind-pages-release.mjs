import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function bindPagesRelease({
  root = process.cwd(),
  output = path.join(root, 'dist-pages'),
} = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(output, 'runtime-config.json'), 'utf8'));
  const release = String(config.deployedRelease || '').trim();
  if (!release) throw new Error('runtime-config.json is missing deployedRelease');
  const encoded = encodeURIComponent(release);

  for (const entry of ['index.html', 'v900.html']) {
    const file = path.join(output, entry);
    let html = fs.readFileSync(file, 'utf8');
    const before = html;
    html = html.replace(
      /src=(['"])\.\/entry-preload-v900\.mjs(?:\?[^'"]*)?\1/,
      `src="./entry-preload-v900.mjs?release=${encoded}"`,
    );
    if (html === before) throw new Error(`${entry} did not contain the active entry-preload-v900 module`);
    if (!html.includes(`entry-preload-v900.mjs?release=${encoded}`)) {
      throw new Error(`${entry} is not bound to release ${release}`);
    }
    fs.writeFileSync(file, html, 'utf8');
  }

  const manifestFile = path.join(output, 'patch-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!Array.isArray(manifest.files)) throw new Error('patch-manifest.json files are missing');
  const entries = manifest.files.map(entry => {
    const file = path.join(output, entry.path);
    if (!fs.existsSync(file)) throw new Error(`manifest file missing after release bind: ${entry.path}`);
    return { ...entry, size: fs.statSync(file).size, sha256: sha256(file) };
  });
  const digest = crypto.createHash('sha256')
    .update(entries.map(entry => `${entry.sha256}  ${entry.path}\n`).join(''))
    .digest('hex')
    .slice(0, 12);
  const nextManifest = {
    ...manifest,
    buildId: `${manifest.gameVersion || manifest.serverVersion}.content.${digest}`,
    files: entries,
  };
  fs.writeFileSync(manifestFile, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
  return { release, buildId: nextManifest.buildId };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = bindPagesRelease();
  console.log(`Bound Pages entries to ${result.release} (${result.buildId})`);
}
