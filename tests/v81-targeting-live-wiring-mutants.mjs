import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertLiveTargetingWiring } from './v81-targeting-live-wiring.mjs';

const root = new URL('../', import.meta.url);
const original = {
  js: fs.readFileSync(new URL('game-v800.js', root), 'utf8'),
  html: fs.readFileSync(new URL('index.html', root), 'utf8'),
  versionedHtml: fs.readFileSync(new URL('v800.html', root), 'utf8'),
  css: fs.readFileSync(new URL('style-v800.css', root), 'utf8'),
  hud: fs.readFileSync(new URL('combat-ui-view-model.mjs', root), 'utf8'),
};

function mutate(field, before, after) {
  const source = original[field];
  assert.ok(source.includes(before), `${field} mutation target drifted: ${before}`);
  return { ...original, [field]: source.replace(before, after) };
}

const mutants = [
  ['three HUD slots', mutate('hud', 'Array.from({ length: 4 }', 'Array.from({ length: 3 }')],
  ['remove fourth DOM slot', mutate('html', '<button id="skill4Btn"', '<button id="removedSkill4Btn"')],
  ['remove fourth pointer binding', mutate('js', "bindActionPress(el('skill4Btn'),()=>dispatchSkill(3))", "bindActionPress(el('skill4Btn'),()=>dispatchSkill(2))")],
  ['three cooldown entries', mutate('js', 'skillCds:MANUAL_SKILL_SLOTS.map(()=>0)', 'skillCds:[0,0,0]')],
  ['three cooldown updates', mutate('js', 'i<MANUAL_SKILL_SLOTS.length', 'i<3')],
  ['legacy manual loadout', mutate('js', 'const a=activeSummon,slot=MANUAL_SKILL_SLOTS[index],move=canonicalCombatSkills(a.inst)[index];', 'const a=activeSummon,slot=MANUAL_SKILL_SLOTS[index],move=getMonsterSkills(a.inst)[index];')],
  ['bypass execution boundary', mutate('js', 'const result=executeEquippedSkillCommand(a.inst,{', 'const result=fakeSkillCommand(a.inst,{')],
  ['mint command ID inside useSkill', mutate('js', 'commandId:intent.commandId,', 'commandId:`cast:${++skillCommandSequence}`,')],
  ['legacy cooldown', mutate('js', 'a.skillCds[index]=command.startCooldownSec;', 'a.skillCds[index]=move.cooldown;')],
  ['target substitution query', mutate('js', 'const wild=byId.get(targetId);', 'const wild=nearestWild(99,a.mesh.position);')],
  ['area around actor', mutate('js', 'const anchor=new THREE.Vector3(command.targetPoint.x,0,command.targetPoint.z);', 'const anchor=a.mesh.position.clone();')],
  ['legacy area range', mutate('js', 'spawnAreaWave(move.type,anchor,command.radiusM)', 'spawnAreaWave(move.type,anchor,move.range)')],
  ['immune becomes normal hit', mutate('js', 'res&&Number.isFinite(res.eff)?res.eff:1', 'res&&res.eff?res.eff:1')],
  ['remove slot four geometry', mutate('css', '.skill4{right:198px!important;', '.removed-skill4{right:198px!important;')],
];

for (const [name, sources] of mutants) {
  assert.throws(() => assertLiveTargetingWiring(sources), undefined, `${name} must be killed`);
}

console.log(`V8.1 live targeting wiring mutants: PASS (${mutants.length}/${mutants.length} killed)`);
