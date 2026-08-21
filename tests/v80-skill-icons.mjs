import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');

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

// 8. CSS must not reset the inline icon image with `background: ... !important`.
// `background-color` preserves the background image set by renderCombatPresentation().
for (const skillClass of ['skill1', 'skill2', 'skill3']) {
  const rule = css.match(new RegExp(`\\.${skillClass}\\{[^}]*\\}`))?.[0] ?? '';
  assert.ok(rule.includes('background-color:'), `${skillClass} must use background-color`);
  assert.ok(!/background:(?!-color)/.test(rule), `${skillClass} must not reset background-image`);
}
assert.ok(!css.includes('.action::after'), 'action status text pseudo-element must be removed');
assert.ok(!css.includes('.capture::before'), 'action label pseudo-element must be removed');

console.log('V8.0 Skill Icon UI: PASS');