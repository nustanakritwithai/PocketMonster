import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { activeEntryUrl, activeJsUrl } from './active-assets.mjs';

const adapterUrl = new URL('../world-simulator-map-adapter-v1.mjs', import.meta.url);
for (const url of [activeEntryUrl, activeJsUrl, adapterUrl]) {
  const target = fileURLToPath(url);
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Active runtime syntax (${target.split('/').pop()}): PASS`);
}

const adapterTest = fileURLToPath(new URL('./world-simulator-map-adapter-v1.mjs', import.meta.url));
const adapterResult = spawnSync(process.execPath, [adapterTest], { encoding: 'utf8' });
if (adapterResult.stdout) process.stdout.write(adapterResult.stdout);
if (adapterResult.stderr) process.stderr.write(adapterResult.stderr);
if (adapterResult.status !== 0) process.exit(adapterResult.status ?? 1);
