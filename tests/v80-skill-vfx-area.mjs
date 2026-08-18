import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

// Phase 2: Area Wave — spawnAreaWave + updateEffects handler + wiring

// 1. Function exists
assert.ok(js.includes('function spawnAreaWave('), 'spawnAreaWave missing');

// 2. Box wireframe wave mesh
assert.ok(js.includes('wireframe'), 'area-wave: wireframe missing');

// 3. Kind 'area-wave' in effects push
assert.ok(js.includes("'area-wave'"), 'area-wave: kind missing');

// 4. expandTo property
assert.ok(js.includes('expandTo'), 'area-wave: expandTo missing');

// 5. updateEffects handles 'area-wave' kind
assert.ok(js.includes("'area-wave'"), 'updateEffects: area-wave handler missing');

// 6. Scale expands over time
assert.ok(js.includes('e.mesh.scale'), 'area-wave: scale update missing');

// 7. Opacity fades
assert.ok(js.includes('opacity'), 'area-wave: opacity fade missing');

// 8. Uses sparkPool for particles
assert.ok(js.includes('sparkPool.acquire()'), 'area-wave: not using sparkPool');

// 9. Wired into useSkill area branch
assert.ok(js.includes('spawnAreaWave('), 'spawnAreaWave not called in useSkill');

// 10. castShadow false
assert.ok(js.includes('castShadow') && js.includes('false'), 'area-wave: castShadow=false missing');

console.log('V8.0 Skill VFX P2 area wave: PASS');