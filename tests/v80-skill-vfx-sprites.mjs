import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

// Skill VFX Sprites — CanvasTexture glow instead of box particles

// 1. Skill sprite texture cache exists
assert.ok(js.includes('skillSpriteCache') || js.includes('skillSpriteTextures') || js.includes('SkillSprite'), 'skill sprite texture system missing');

// 2. Uses CanvasTexture (drawn on canvas, not box geometry)
assert.ok(js.includes('CanvasTexture') || js.includes('canvas') || js.includes('Canvas'), 'canvas texture missing');

// 3. Uses THREE.Sprite or SpriteMaterial for billboarding
assert.ok(js.includes('Sprite') || js.includes('SpriteMaterial'), 'sprite/spriteMaterial missing');

// 4. Additive blending for glow effect
assert.ok(js.includes('AdditiveBlending'), 'additive blending missing');

// 5. Radial gradient (soft glow, not hard box)
assert.ok(js.includes('createRadialGradient') || js.includes('radialGradient'), 'radial gradient missing');

// 6. spawnSkillSprite function exists
assert.ok(js.includes('function spawnSkillSprite') || js.includes('spawnSkillSprite('), 'spawnSkillSprite missing');

// 7. Wired into skill VFX (trail or elemental FX)
assert.ok(js.includes('spawnSkillSprite('), 'spawnSkillSprite not called');

console.log('V8.0 Skill VFX sprites: PASS');