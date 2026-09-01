import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildFirebaseLauncher({ root = process.cwd(), output = path.join(root, 'firebase-launcher') } = {}) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'runtime-config.json'), 'utf8'));
  const assetBase = config.assetBaseUrl;
  const apiOrigin = new URL(config.apiBaseUrl).origin;
  if (!assetBase || new URL(assetBase).protocol !== 'https:') throw new Error('runtime-config.json requires an HTTPS assetBaseUrl');
  if (new URL(apiOrigin).protocol !== 'https:') throw new Error('runtime-config.json requires an HTTPS apiBaseUrl');
  const release = encodeURIComponent(config.deployedRelease || Date.now());
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const isCombinedV9 = html.includes('entry-preload-v900.mjs');
  if (!html.includes(`connect-src 'self' ${apiOrigin}`)) {
    html = html.replace(`connect-src 'self'`, `connect-src 'self' ${apiOrigin}`);
  }
  if (isCombinedV9) {
    html = html
      .replace(/src="\.\/entry-preload-v900\.mjs(?:\?[^"]*)?"/, `src="./firebase-launcher-entry.mjs?v=${release}"`)
      .replace(`href="./style-v800.css?v=813"`, `href="${assetBase}style-v800.css?v=${release}"`)
      .replace(/href="\.\/style-v900\.css(?:\?[^"]*)?"/, `href="${assetBase}style-v900.css?v=${release}"`)
      .replace(/\n\s*<link rel="stylesheet" href="\.\/combat-v91\.css(?:\?[^"]*)?"\s*\/?>/, '')
      .replace(`src="./startup-errors.mjs"`, `src="${assetBase}startup-errors.mjs?v=${release}"`);
  } else {
    html = html
      .replace(/src="\.\/entry-preload\.mjs(?:\?[^"]*)?"/, `src="./firebase-launcher-entry.mjs?v=${release}"`)
      .replace(`href="./style-v800.css?v=813"`, `href="${assetBase}style-v800.css?v=${release}"`)
      .replace(`src="./startup-errors.mjs"`, `src="${assetBase}startup-errors.mjs?v=${release}"`)
      .replace(`  <script type="module" src="./game-v800.js?v=818"></script>`, '');
  }
  const required = [assetBase, 'firebase-launcher-entry.mjs', `${assetBase}style-v800.css`];
  if (isCombinedV9) required.push(`${assetBase}style-v900.css`);
  for (const requiredFile of required) {
    if (!html.includes(requiredFile)) throw new Error(`Firebase launcher build is missing ${requiredFile}`);
  }
  if (isCombinedV9 && /href="\.\/combat-v91\.css(?:\?[^"]*)?"/.test(html)) {
    throw new Error('Firebase launcher must not load the Pages-only Combat stylesheet locally');
  }
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(output, '404.html'), html, 'utf8');
  fs.copyFileSync(path.join(root, 'firebase-launcher-entry.mjs'), path.join(output, 'firebase-launcher-entry.mjs'));
  for (const module of ['firebase-auth-ui.mjs', 'firebase-runtime.mjs', 'firebase-config.mjs', 'server-auth.mjs', 'launch-bootstrap.mjs']) {
    fs.copyFileSync(path.join(root, module), path.join(output, module));
  }
  fs.writeFileSync(path.join(output, 'runtime-config.json'), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  return { output, assetBase, release: config.deployedRelease };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const result = buildFirebaseLauncher();
  console.log(`Built Firebase launcher in ${result.output}`);
  console.log(`Assets: ${result.assetBase} (${result.release})`);
}
