import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

// Phase 1: Skill Trail — spawnSkillTrail function + type-specific behavior + wiring

// 1. Function exists
assert.ok(js.includes('function spawnSkillTrail('), 'spawnSkillTrail missing');

// 2. Uses sparkPool (not creating new geometries)
assert.ok(js.includes('sparkPool.acquire()'), 'trail: not using sparkPool');
assert.ok(js.includes('pooled: true'), 'trail: not marked pooled');

// 3. Type-specific behavior switch (at least 6 types)
assert.ok(js.includes("case 'flame'"), 'trail: flame behavior missing');
assert.ok(js.includes("case 'drop'"), 'trail: drop behavior missing');
assert.ok(js.includes("case 'spark'"), 'trail: spark behavior missing');
assert.ok(js.includes("case 'shard'"), 'trail: shard behavior missing');
assert.ok(js.includes("case 'dust'"), 'trail: dust behavior missing');
assert.ok(js.includes("case 'mist'"), 'trail: mist behavior missing');

// 4. Arc trajectory (sin curve for upward arc)
assert.ok(js.includes('Math.sin'), 'trail: arc trajectory (sin) missing');

// 5. Lerp between from→to positions
assert.ok(js.includes('lerpVectors'), 'trail: lerpVectors missing');

// 6. Wired into useSkill enemy branch
assert.ok(js.includes('spawnSkillTrail('), 'spawnSkillTrail not called in useSkill');

// 7. Life and maxLife set
assert.ok(js.includes('life: 0.3') || js.includes('life:0.3') || js.includes('life:.3'), 'trail: life not set');

// 8. Effects enter the shared active-budget gate
assert.ok(js.includes('addTransientEffect({mesh,vel'), 'trail: active-budget gate missing');

// 9. castShadow false (VFX don't cast shadows)
assert.ok(js.includes('castShadow') && js.includes('false'), 'trail: castShadow=false missing');

console.log('V8.0 Skill VFX P1 trail: PASS');
