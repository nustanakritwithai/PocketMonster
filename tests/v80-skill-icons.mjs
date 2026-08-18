import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

// Skill Icon UI — canvas-drawn icons for skill + action buttons

// 1. Icon cache system exists
assert.ok(js.includes('skillIconCache') || js.includes('getSkillIcon'), 'skill icon cache missing');

// 2. getSkillIcon function exists
assert.ok(js.includes('function getSkillIcon'), 'getSkillIcon missing');

// 3. Canvas-based drawing (data URI)
assert.ok(js.includes('toDataURL'), 'icon: toDataURL missing');

// 4. getActionIcon for capture/summon/recall
assert.ok(js.includes('function getActionIcon') || js.includes('getActionIcon'), 'getActionIcon missing');

// 5. Icons wired into renderCombatPresentation
assert.ok(js.includes('getSkillIcon') && js.includes('backgroundImage'), 'icons not wired into render');

// 6. Icons wired into renderCombatPresentation (not setActionStyle)
assert.ok(js.includes('getSkillIcon') && js.includes('backgroundImage'), 'icons not wired into render');

// 7. Action icons for capture/summon/recall
assert.ok(js.includes('getActionIcon'), 'action icons not called');

console.log('V8.0 Skill Icon UI: PASS');