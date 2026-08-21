import assert from 'node:assert/strict';
import { activeJs as js } from './active-assets.mjs';

const renderer=js.match(/function renderFocusedSkillLoadoutV2\(\)\{([\s\S]*?)\n\}\nfunction renderSkills\(\)/)?.[1]||'';
assert.ok(renderer, 'Phase 8 needs a focused Skill Loadout V2 renderer');
assert.match(renderer, /focusedCharacterPresentation\(\)/, 'loadout must resolve the same focused monster as Status/Overview');
for (const slot of ['Basic AI', 'S1', 'S2', 'S3', 'Passive', 'Evolution Trait']) {
  assert.match(js, new RegExp(slot), `loadout must label ${slot}`);
}
for (const detail of ['Power', 'CD', 'targetType', 'masteryRank', 'masteryExp']) {
  assert.match(js, new RegExp(detail), `loadout must expose existing ${detail} data`);
}
assert.match(js, /rank==='master'[\s\S]*SKILL_MUTATIONS/, 'Mutation affordance must remain gated by Master and existing mutation catalog');
assert.doesNotMatch(renderer, /(?:state\.ui\.(?:skills|skillLoadout)|inst\.skills\s*=)/, 'loadout must not duplicate or overwrite skill data');

console.log('V8.2 Character UI Phase 8 focused Skill Loadout V2: PASS');
