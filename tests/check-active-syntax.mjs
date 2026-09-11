import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { activeEntryUrl, activeJsUrl } from './active-assets.mjs';

for (const url of [activeEntryUrl, activeJsUrl]) {
  const target = fileURLToPath(url);
  const result = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`Active runtime syntax (${target.split('/').pop()}): PASS`);
}
