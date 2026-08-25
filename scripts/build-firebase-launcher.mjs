import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function buildFirebaseLauncher({ root = process.cwd(), output = path.join(root, 'firebase-launcher') } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'runtime-config.json'), 'utf8'));
  const assetBase = config.assetBaseUrl;
  if (!assetBase || new URL(assetBase).protocol !== 'https:') throw new Error('runtime-config.json requires an HTTPS assetBaseUrl');
  const release = encodeURIComponent(config.deployedRelease || Date.now());
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const bootstrap = `<script>window.__POCKETMONSTER_ASSET_BASE__=${escapeJsonForHtml(assetBase)};window.__POCKETMONSTER_RUNTIME_MANIFEST__=${escapeJsonForHtml(config)};</script>`;
  html = html
    .replace(`<script type="module">import {applyPendingPatch} from './patch-updater.mjs'; await applyPendingPatch();</script>`, `${bootstrap}\n  <script type="module">import {applyPendingPatch} from '${assetBase}patch-updater.mjs?v=${release}'; await applyPendingPatch();</script>`)
    .replace(`href="./style-v800.css?v=810"`, `href="${assetBase}style-v800.css?v=${release}"`)
    .replace(`src="./game-v800.js?v=810"`, `src="${assetBase}game-v800.js?v=${release}"`);
  for (const required of [assetBase, '__POCKETMONSTER_RUNTIME_MANIFEST__', `${assetBase}game-v800.js`]) {
    if (!html.includes(required)) throw new Error(`Firebase launcher build is missing ${required}`);
  }
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(output, '404.html'), html, 'utf8');
  return { output, assetBase, release: config.deployedRelease };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = buildFirebaseLauncher();
  console.log(`Built Firebase launcher in ${result.output}`);
  console.log(`Assets: ${result.assetBase} (${result.release})`);
}
