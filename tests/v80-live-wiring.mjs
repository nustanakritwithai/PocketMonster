// V8.0 — Live-loop wiring contract.
// Unit-tests the playable adapters and statically asserts that game-v800.js
// actually calls the V7.x modules (not just imports them).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defenseMitigation } from '../balance-formulas.mjs';
import { normalizeInstance, addTrainingExp, trainingUsed } from '../monster-instance.mjs';
import { applyChoice } from '../raising-events.mjs';
import { evolutionContext } from '../evolution.mjs';
import {
  applyComputedStats,
  computeCoreStats,
  evoDefFromPath,
  growthExpForLevel,
  liveCaptureChance,
  liveMoveDamage,
  ranchTrainingGain,
  refreshCoreStats,
} from '../live-progression.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');

const species = {
  id: 'flameling',
  base: { hp: 74, atk: 15, def: 9, spd: 12 },
};

function mk(over = {}) {
  return normalizeInstance({
    instanceId: 'live-1',
    speciesId: species.id,
    formId: species.id,
    level: 5,
    genes: { hp: 'B', atk: 'B', def: 'B', spd: 'B' },
    aptitude: { power: 4, defense: 3, speed: 3, technique: 3, spirit: 2 },
    ...over,
  });
}

// Capture: boss / disabled is zero; a weakened wild is catchable.
assert.equal(liveCaptureChance({ speciesRate: 0.5, hpRatio: 0.1, uncapturable: true }), 0, 'boss/disabled capture is 0');
const wildChance = liveCaptureChance({ speciesRate: 0.5, hpRatio: 0.1, elite: false });
assert.ok(wildChance > 0 && wildChance < 1, 'weakened wild has a real capture chance');
const eliteChance = liveCaptureChance({ speciesRate: 0.5, hpRatio: 0.1, elite: true, eliteModifier: 0.34 });
assert.ok(eliteChance < wildChance, 'elite modifier reduces capture chance');

// Damage uses defense mitigation + mastery.
const soft = liveMoveDamage({ movePower: 24, atk: 20, def: 8, attackerLevel: 5, defenderLevel: 5 });
const hard = liveMoveDamage({ movePower: 24, atk: 20, def: 40, attackerLevel: 5, defenderLevel: 5 });
assert.ok(hard.damage < soft.damage, 'higher DEF mitigates live damage');
assert.equal(hard.mitigation.damageMultiplier, defenseMitigation(40, 5).damageMultiplier, 'live damage uses defenseMitigation');
const mastered = liveMoveDamage({ movePower: 24, atk: 20, def: 8, attackerLevel: 5, defenderLevel: 5, masteryPower: 0.11 });
assert.ok(mastered.damage > soft.damage, 'skill mastery increases live damage');

// Growth EXP for a captured Lv.N monster cannot collapse back to 1.
assert.equal(growthExpForLevel(1), 0, 'Lv.1 starts at 0 accumulated EXP');
assert.ok(growthExpForLevel(5) > growthExpForLevel(4), 'higher levels need more accumulated EXP');

// Core stats include the training pool (not just species base + level).
const plain = mk();
const trained = mk({ training: { power: 40, defense: 0, speed: 0, technique: 0, spirit: 0 } });
const plainStats = computeCoreStats(plain, species, null);
const trainedStats = computeCoreStats(trained, species, null);
assert.ok(trainedStats.stats.atk > plainStats.stats.atk, 'training power raises computed ATK');
assert.ok(trainedStats.breakdown.atk.training > 0, 'ATK breakdown exposes the training source');
const applied = applyComputedStats({ hp: 10, maxHp: 10 }, trainedStats.stats, { heal: true });
assert.equal(applied.maxHp, trainedStats.stats.hp, 'applyComputedStats writes the rated HP');
assert.equal(applied.hp, trainedStats.stats.hp, 'heal fills to the new max');
const revived = mk({ speciesId: 'rockhorn', passiveId: 'PASS_ROCK_01', hp: 0, maxHp: 100, fainted: true, _condition: 'normal' });
const revivedStats = refreshCoreStats(revived, {
  id: 'rockhorn',
  base: { hp: 100, atk: 100, def: 100, spd: 100 },
  growthPerLevel: { hp: 0, atk: 0, def: 0, spd: 0 },
}, null, null, { heal: true });
assert.equal(revivedStats.stats.def, 110, 'heal/revive recomputes alive passive stats atomically');
assert.equal(revived.fainted, false);

// Ranch training respects aptitude + remaining capacity.
const ranch = mk({ level: 1, training: { power: 0, defense: 0, speed: 0, technique: 0, spirit: 0 } });
const firstGain = ranchTrainingGain(ranch, 'power', 15);
assert.ok(firstGain > 0, 'an empty pool accepts ranch training');
addTrainingExp(ranch, 'power', 1000);
assert.equal(ranchTrainingGain(ranch, 'power', 15), 0, 'a full pool gains nothing');
assert.ok(trainingUsed(ranch) > 0, 'training was written into the shared pool');

// Evolution adapter maps the live path shape onto the V7.7 requirement engine.
const def = evoDefFromPath({
  id: 'flameling_lv2',
  name: 'Flameling',
  statMods: { hp: 1.08, atk: 1.18, def: 1.06, spd: 1.10 },
  requires: { level: 2, bond: 20, trainingFocus: 'power' },
}, 'flameling');
assert.equal(def.fromFormId, 'flameling');
assert.equal(def.toFormId, 'flameling_lv2');
assert.deepEqual(def.requirements.required.map(r => r.field), ['level', 'bond', 'trainingFocus']);
assert.equal(evolutionContext({ ...mk(), trainingFocus: 'power' }).trainingFocus, 'power', 'evolution context exposes trainingFocus');

// Raising-event consequences also write discipline + body energy.
const actor = mk({ mind: { mood: 70, bond: 30, discipline: 20 }, body: { energy: 20, hunger: 70, fitness: 50, health: 100 } });
const eventDef = {
  id: 'playful_bond',
  choices: [{ id: 'scold', effects: { mood: -10, discipline: 5, energy: 8 } }],
};
const choice = applyChoice(actor, eventDef, 'scold');
assert.equal(choice.ok, true);
assert.equal(actor.mind.discipline, 25, 'event choices can raise discipline');
assert.equal(actor.body.energy, 28, 'event choices can restore body energy');

// Static live-loop contract: the playable JS must call these, not just import them.
for (const needle of [
  'migrateState(',
  'commitEvolution(',
  'evaluateStandardBreedingCompatibility(',
  'createStandardBreedingEggTransaction(',
  'hatchBreedingEggTransaction(',
  'resolveWorkbookCapture(',
  'beginCaptureAttempt(',
  'liveMoveDamage(',
  'computeCoreStats(',
  'refreshCanonicalOwnedStats(',
  'ranchTrainingGain(',
  'let res=null',
  'renderRaisingEventBanner',
  'toggleStarterEquip',
  'careRest(',
  'carePlay(',
  'milestoneId:w.boss?\'first_boss\'',
]) {
  assert.ok(js.includes(needle), `game-v800.js must wire ${needle}`);
}
const useSkillStart = js.indexOf('function useSkill(');
const useSkillOpen = js.indexOf('{', js.indexOf(')', useSkillStart) + 1);
let useSkillDepth = 0;
let useSkillEnd = -1;
for (let i = useSkillOpen; i < js.length; i += 1) {
  if (js[i] === '{') useSkillDepth += 1;
  if (js[i] === '}') useSkillDepth -= 1;
  if (useSkillDepth === 0) { useSkillEnd = i; break; }
}
const useSkillSrc = js.slice(useSkillStart, useSkillEnd + 1);
assert.ok(useSkillSrc.includes('executeEquippedSkillCommand('), 'manual useSkill enters the canonical A25 execution boundary');
assert.ok(!useSkillSrc.includes('getMonsterSkills('), 'manual useSkill cannot read legacy species moves');
const applySkillStart = js.indexOf('function applyAcceptedSkillCommand(');
const applySkillEnd = js.indexOf('\nfunction skillFailureMessage(', applySkillStart);
const applySkillSrc = js.slice(applySkillStart, applySkillEnd);
assert.ok(applySkillSrc.includes('let res=null'), 'accepted compatibility executor hoists res for mastery EXP');
assert.ok(!applySkillSrc.includes('const res=monsterDamage'), 'accepted executor must not shadow the mastery result');
assert.ok(html.includes('game-v800.js?v=810'), 'active HTML loads the v800 runtime');
assert.ok(html.includes('style-v800.css?v=810'), 'active HTML loads the v800 stylesheet');
assert.ok(html.includes('id="raisingEventBanner"'), 'raising event banner is in the manager');
assert.ok(html.includes('id="crDebugPanel"'), 'CR debug panel is in the manager');
assert.ok(js.includes("scrollIntoView({block:'nearest'"), 'ดู CR must scroll the debug panel into view');
assert.ok(js.includes("setManagerTab('evolution')"), 'ดู Evolution must switch to the Evolution tab');
assert.ok(css.includes('.stat-breakdown'), 'breakdown line has styles');
assert.ok(css.includes('.care-actions'), 'care buttons have styles');
assert.ok(css.includes('.equip-actions'), 'equipment buttons have styles');
assert.ok(css.includes('#raisingEventBanner'), 'event banner has styles');

console.log('V8.0 live-loop wiring: PASS');
