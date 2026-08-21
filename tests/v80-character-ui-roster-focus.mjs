import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

assert.match(js, /function bindRosterFocus\(wrap,inst\)/, 'Roster cards need a dedicated navigation-only focus binding');
const body=js.match(/function bindRosterFocus\(wrap,inst\)\{([\s\S]*?)\n\}\nfunction monsterCard/ )?.[1]||'';
assert.ok(body, 'Roster focus binding body is required');
for (const expected of ['pointerdown', "event.target.closest('button')", 'event.preventDefault()', 'event.stopPropagation()', 'characterUI.focusMonster(inst.instanceId)', 'renderManager()']) {
  assert.ok(body.includes(expected), `Roster focus must include ${expected}`);
}
assert.doesNotMatch(body, /(?:switchPartySlot|summonThrow|recall\(|state\.selectedSlot\s*=)/, 'Roster focus must not mutate combat selection or summon state');
assert.match(js, /bindRosterFocus\(wrap,inst\);/, 'monsterCard must bind navigation-only roster focus');

console.log('V8.2 Character UI roster focus UX: PASS');
