import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadRuntimeConfig } from '../runtime-config.mjs';
import {
  WORLD_GROUND_DEFAULT_ZONE,
  WORLD_GROUND_LIVE_SCHEMA,
  worldSimulatorGroundEnabled,
} from '../world-simulator-ground-live-v1.mjs';

assert.equal(WORLD_GROUND_LIVE_SCHEMA, 'pocketmonster.world-ground-live.v1');
assert.equal(WORLD_GROUND_DEFAULT_ZONE, 'emerald-forest');
assert.equal(worldSimulatorGroundEnabled({}), false);
assert.equal(worldSimulatorGroundEnabled({ featureFlags: { vpsEnabled: true, vpsReads: true, worldSimGround: true }, apiBaseUrl: '' }), false);
assert.equal(worldSimulatorGroundEnabled({ featureFlags: { vpsEnabled: true, vpsReads: false, worldSimGround: true }, apiBaseUrl: 'https://world.example' }), false);
assert.equal(worldSimulatorGroundEnabled({ featureFlags: { vpsEnabled: true, vpsReads: true, worldSimGround: true }, apiBaseUrl: 'https://world.example' }), true);

const disabled = await loadRuntimeConfig({
  manifest: {
    configVersion: 1,
    environment: 'firebase-only',
    featureFlags: { worldSimGround: true },
  },
});
assert.equal(disabled.featureFlags.worldSimGround, false, 'ground read path is clamped off unless VPS reads are explicitly enabled');

const enabled = await loadRuntimeConfig({
  manifest: {
    configVersion: 1,
    environment: 'vps-readonly',
    apiBaseUrl: 'https://world.example/',
    featureFlags: { vpsEnabled: true, vpsReads: true, worldSimGround: true },
  },
});
assert.equal(enabled.featureFlags.worldSimGround, true);
assert.equal(enabled.apiBaseUrl, 'https://world.example');
assert.equal(enabled.featureFlags.vpsWrites, false, 'ground does not imply write authority');
assert.equal(enabled.canWritePlayerData, false, 'ground does not imply player-data writes');

const liveSource = fs.readFileSync(new URL('../world-simulator-ground-live-v1.mjs', import.meta.url), 'utf8');
const sceneSource = fs.readFileSync(new URL('../world-living-v900.mjs', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../runtime-config.mjs', import.meta.url), 'utf8');
const packUrl = new URL('../assets/world-ground/material-pack-v1.json', import.meta.url);
const pack = JSON.parse(fs.readFileSync(packUrl, 'utf8'));

assert.match(liveSource, /fetchWorldMapFrame/, 'live bridge fetches through the validated WorldSim adapter');
assert.match(liveSource, /fallbackMesh\.visible = !ground\.getFrame\(\)/, 'fallback remains until a valid frame exists');
assert.match(liveSource, /state: ground\.getFrame\(\) \? 'stale' : 'fallback'/, 'failed refresh keeps the last valid frame or fallback');
assert.doesNotMatch(liveSource, /setInterval\(|setTimeout\(/, 'P1 live bridge must not poll full snapshots');
assert.doesNotMatch(liveSource, /method:\s*['"]POST|method:\s*['"]PUT|method:\s*['"]PATCH|method:\s*['"]DELETE/, 'ground live bridge is read-only');

assert.match(configSource, /worldSimGround:\s*false/, 'checked-in ground feature flag defaults off');
assert.match(sceneSource, /createWorldSimulatorGroundLive/, 'Living World scene wires the WorldSim ground controller');
assert.match(sceneSource, /fallbackMesh:\s*plaza/, 'existing plaza is the safe fallback');
assert.match(sceneSource, /zoneId:\s*'emerald-forest'/, 'first integration zone is explicit');
assert.match(sceneSource, /if \(worldGroundLive\.enabled\) \{\s*void worldGroundLive\.refresh\(\)/s, 'snapshot load starts only when deployment enables it');
assert.match(sceneSource, /const BOUNDS = Object\.freeze\(\{ minX: -6\.4, maxX: 6\.4, minZ: -5\.4, maxZ: 5\.8 \}\)/,
  'presentation patch must not silently replace gameplay/navigation bounds');

assert.equal(pack.schema, 'pocketmonster.world-ground-material-pack.v1');
assert.equal(pack.installed, true, 'high-quality local ground material pack must be vendored before merge');
assert.equal(pack.runtimeApiDependency, false, 'deployed game must not depend on Poly Haven API');
assert.equal(pack.license, 'CC0');
assert.equal(pack.resolution, '1k');
assert.equal(pack.normalConvention, 'opengl');

const uniqueFiles = new Set();
for (const material of ['grass', 'forest-floor', 'mud', 'sand', 'rock', 'dry-soil', 'burned']) {
  assert.ok(pack.materials[material], `material pack declares ${material}`);
  for (const slot of ['albedo', 'normal', 'roughness', 'ao']) {
    const relative = pack.materials[material][slot];
    assert.ok(relative, `${material} declares ${slot}`);
    const assetUrl = new URL(relative, packUrl);
    const stat = fs.statSync(assetUrl);
    assert.ok(stat.isFile(), `${material}.${slot} is a local file`);
    assert.ok(stat.size > 1024, `${material}.${slot} is not an empty/placeholder asset`);
    uniqueFiles.add(assetUrl.href);
  }
}
assert.equal(uniqueFiles.size, 24, 'material pack should vendor 24 unique local JPEG PBR maps');

console.log('world-simulator-ground-live-v1: PASS');
