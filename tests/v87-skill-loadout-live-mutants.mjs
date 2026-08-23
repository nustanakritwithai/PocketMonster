import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertSkillLoadoutLiveWiring } from './v87-skill-loadout-live.mjs';

const root = new URL('../', import.meta.url);
const original = Object.freeze({
  source: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  css: fs.readFileSync(new URL('style-v800.css', root), 'utf8'),
});

function mutant(field, before, after) {
  assert.ok(original[field].includes(before), `${field} mutation target drifted`);
  return Object.freeze({ ...original, [field]: original[field].replace(before, after) });
}

const mutants = [
  mutant('source', 'data-skill-loadout="${s.skillId}"', 'data-removed-loadout="${s.skillId}"'),
  mutant('source', "select.onchange=()=>setMonsterSkillLoadout", "select.onchange=()=>removedLoadoutCommand"),
  mutant('source', 'if(!assertCharacterMutable(id)){renderSkills();return;}', 'if(false){renderSkills();return;}'),
  mutant('source', 'setManualSkillSlot(inst,{skillId,slot:requestedSlot})', 'directSlotMutation(inst,skillId,requestedSlot)'),
  mutant('source', 'setManualSkillSlot(inst,{skillId:null,slot:currentSlot})', 'directSlotClear(inst,currentSlot)'),
  mutant('source', 'renderManager();renderSkills();saveGame(false);', 'renderManager();renderSkills();'),
  mutant('source', 'committed.unlockedSkill?.newlyLearned', 'false'),
  mutant('css', '.skill-loadout-control{', '.removed-skill-loadout-control{'),
];

let killed = 0;
for (const candidate of mutants) {
  try {
    assertSkillLoadoutLiveWiring(candidate);
  } catch {
    killed += 1;
  }
}
assert.equal(killed, mutants.length);
console.log(`V8.7 skill loadout live mutants: PASS (${killed}/${mutants.length} killed)`);
