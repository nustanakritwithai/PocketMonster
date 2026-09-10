import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { activeEntryUrl, activeJsUrl } from './active-assets.mjs';

const checkedModules = [
  activeEntryUrl,
  activeJsUrl,
  new URL('../world-living-v900.mjs', import.meta.url),
  new URL('../runtime-config.mjs', import.meta.url),
  new URL('../world-simulator-map-adapter-v1.mjs', import.meta.url),
  new URL('../world-simulator-ground-renderer-v1.mjs', import.meta.url),
  new URL('../world-simulator-ground-live-v1.mjs', import.meta.url),
  new URL('../scripts/vendor-world-ground-polyhaven.mjs', import.meta.url),
  new URL('./world-simulator-map-adapter-v1.mjs', import.meta.url),
  new URL('./world-simulator-ground-renderer-v1.mjs', import.meta.url),
  new URL('./world-simulator-ground-live-v1.mjs', import.meta.url),
];

for (const url of checkedModules) {
  const target = fileURLToPath(url);
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Active runtime syntax (${target.split('/').pop()}): PASS`);
}

for (const testUrl of [
  new URL('./world-simulator-map-adapter-v1.mjs', import.meta.url),
  new URL('./world-simulator-ground-renderer-v1.mjs', import.meta.url),
  new URL('./world-simulator-ground-live-v1.mjs', import.meta.url),
]) {
  const target = fileURLToPath(testUrl);
  const result = spawnSync(process.execPath, [target], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
