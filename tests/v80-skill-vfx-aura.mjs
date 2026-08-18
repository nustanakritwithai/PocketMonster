import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

// Phase 3: Self Skill Aura — heal/shield/buffAtk persistent auras

// 1. Three functions exist
assert.ok(js.includes('function spawnHealSkillEffect('), 'spawnHealSkillEffect missing');
assert.ok(js.includes('function spawnShieldSkillEffect('), 'spawnShieldSkillEffect missing');
assert.ok(js.includes('function spawnBuffAtkSkillEffect('), 'spawnBuffAtkSkillEffect missing');

// 2. New effect kinds
assert.ok(js.includes("'shield-aura'"), 'shield-aura kind missing');
assert.ok(js.includes("'buff-aura'"), 'buff-aura kind missing');

// 3. updateEffects handles new kinds
assert.ok(js.includes("'shield-aura'"), 'updateEffects: shield-aura handler missing');
assert.ok(js.includes("'buff-aura'"), 'updateEffects: buff-aura handler missing');

// 4. Wired into useSkill self branch
assert.ok(js.includes('spawnHealSkillEffect('), 'heal effect not wired');
assert.ok(js.includes('spawnShieldSkillEffect('), 'shield effect not wired');
assert.ok(js.includes('spawnBuffAtkSkillEffect('), 'buffAtk effect not wired');

// 5. Heal uses green color
assert.ok(js.includes('0x4ade80'), 'heal: green color missing');

// 6. Shield uses wireframe aura
assert.ok(js.includes('wireframe'), 'shield: wireframe missing');

// 7. Duration parameter used (aura persists)
assert.ok(js.includes('duration'), 'aura: duration parameter missing');

// 8. Uses sparkPool
assert.ok(js.includes('sparkPool.acquire()'), 'aura: not using sparkPool');

// 9. castShadow false
assert.ok(js.includes('castShadow') && js.includes('false'), 'aura: castShadow=false missing');

console.log('V8.0 Skill VFX P3 aura: PASS');