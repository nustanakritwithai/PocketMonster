import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve('dist-pages');
const config = JSON.parse(fs.readFileSync(path.join(output, 'runtime-config.json'), 'utf8'));
const release = String(config.deployedRelease || '').trim();
assert.ok(release, 'built runtime config must expose deployedRelease');
const encoded = encodeURIComponent(release);

for (const entry of ['index.html', 'v900.html']) {
  const html = fs.readFileSync(path.join(output, entry), 'utf8');
  assert.match(html, new RegExp(`entry-preload-v900\\.mjs\\?release=${encoded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    `${entry} must bind entry-preload to the exact deployed release`);
  assert.doesNotMatch(html, /entry-preload-v900\.mjs\?v=972/,
    `${entry} must not publish the stale shared entry-preload cache key`);
}

const preload = fs.readFileSync(path.join(output, 'entry-preload-v900.mjs'), 'utf8');
assert.match(preload, /installReleaseBoundSceneFrames/,
  'entry preload must install the release-bound scene URL hook before shell boot');
assert.match(preload, /release:\s*config\.deployedRelease/,
  'scene release hook must use runtime-config deployedRelease');
const hookIndex = preload.indexOf('installReleaseBoundSceneFrames');
const shellIndex = preload.indexOf("await import('./online-world-shell-v900.mjs?v=65')");
assert.ok(hookIndex >= 0 && shellIndex > hookIndex,
  'scene release binding must be active before the cached shell can assign scene iframe src');

const sceneCache = fs.readFileSync(path.join(output, 'scene-release-cache-v1.mjs'), 'utf8');
assert.match(sceneCache, /url\.pathname\.endsWith\('\/scene-v900\.html'\)/,
  'release hook must target only the online scene HTML');
assert.match(sceneCache, /url\.searchParams\.set\('release', token\)/,
  'scene iframe URL must carry the exact release token');

const launcher = fs.readFileSync('firebase-launcher-entry.mjs', 'utf8');
assert.match(launcher, /releaseBoundLaunchUrl\(launch\.launchUrl, config\.deployedRelease\)/,
  'Firebase launcher must enter Pages through the same deployed release token');

console.log(`Release-bound Pages cache chain passed: ${release}`);
