import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildFirebaseLauncher({ root = process.cwd(), output = path.join(root, 'firebase-launcher') } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'runtime-config.json'), 'utf8'));
  const assetBase = config.assetBaseUrl;
  if (!assetBase || new URL(assetBase).protocol !== 'https:') throw new Error('runtime-config.json requires an HTTPS assetBaseUrl');
  const release = encodeURIComponent(config.deployedRelease || Date.now());
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html
    .replace(`src="./entry-preload.mjs"`, `src="./firebase-launcher-entry.mjs?v=${release}"`)
    .replace(`href="./style-v800.css?v=810"`, `href="${assetBase}style-v800.css?v=${release}"`)
    .replace(`src="./startup-errors.mjs"`, `src="${assetBase}startup-errors.mjs?v=${release}"`)
    .replace(`  <script type="module" src="./game-v800.js?v=810"></script>`, '');
  for (const required of [assetBase, 'firebase-launcher-entry.mjs', `${assetBase}style-v800.css`]) {
    if (!html.includes(required)) throw new Error(`Firebase launcher build is missing ${required}`);
  }
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(output, '404.html'), html, 'utf8');
  fs.copyFileSync(path.join(root, 'firebase-launcher-entry.mjs'), path.join(output, 'firebase-launcher-entry.mjs'));
  fs.writeFileSync(path.join(output, 'runtime-config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { output, assetBase, release: config.deployedRelease };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = buildFirebaseLauncher();
  console.log(`Built Firebase launcher in ${result.output}`);
  console.log(`Assets: ${result.assetBase} (${result.release})`);
}
