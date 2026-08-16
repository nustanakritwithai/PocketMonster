// V8.0 — Master-plan completeness contract.
// Asserts the playable catalog and live runtime cover the remaining DoD items
// from the V8 Vertical Slice (food 6, skill candidate/mutation, multi-branch
// evolution, CR debug sources, personality, derived crit).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FOOD_CATEGORIES } from '../food-care.mjs';
import { normalizeInstance, addTrainingExp } from '../monster-instance.mjs';
import { evaluateSkillCandidate, applyMutation, learnSkill, addSkillExp } from '../skill-progression.mjs';
import { evaluateEvolution, commitEvolution } from '../evolution.mjs';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import {
  applySpeciesProgression,
  FOOD_CATALOG,
  EQUIPMENT_CATALOG,
  PERSONALITY_MODS,
  SKILL_CANDIDATES,
  SKILL_MUTATIONS,
  SPECIES_PROGRESSION,
  personalityTrainingMultiplier,
} from '../content-catalog.mjs';
import {
  evoDefFromPath,
  formatCrReport,
  liveMoveDamage,
  ranchTrainingGain,
} from '../live-progression.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style-v800.css', import.meta.url), 'utf8');

const categories = new Set(Object.values(FOOD_CATALOG).map(f => f.category));
for (const cat of FOOD_CATEGORIES) {
  assert.ok(categories.has(cat), `food catalog must include ${cat}`);
}
assert.ok(EQUIPMENT_CATALOG.length >= 6, 'equipment catalog has a real stash, not only 3 starter toggles');
assert.ok(PERSONALITY_MODS.Brave.training.power > 1, 'Brave raises Power training');
assert.ok(personalityTrainingMultiplier('Lazy', 'power') < 1, 'Lazy lowers all-line training');
assert.ok(SKILL_CANDIDATES.flameling.some(s => s.id === 'Flame Bite'), 'Flare Slime has the R22 Flame Bite candidate');
assert.ok(SKILL_MUTATIONS['Flame Bite'][0].tradeoffs.length >= 1, 'mutation has a measurable trade-off');
assert.ok(SPECIES_PROGRESSION.flameling.extraEvolutionPaths.some(p => p.id === 'flame_wolf'), 'Flame Wolf branch is catalogued');
assert.ok(SPECIES_PROGRESSION.flameling.extraEvolutionPaths.some(p => p.id === 'magma_bear'), 'Magma Bear branch is catalogued');

const species = applySpeciesProgression([
  { id: 'flameling', name: 'Flare Slime', types: ['Fire'], base: { hp: 74, atk: 15, def: 9, spd: 12 }, evolutionPaths: [{ id: 'flameling_lv2', name: 'Flameling', requires: { level: 2 }, statMods: { atk: 1.08 } }] },
]);
assert.equal(species[0].evolutionPaths.length, 3, 'overlay appends the two raising-profile branches');
assert.equal(species[0].evolutionPaths[0].fromFormId, 'flameling');
assert.equal(species[0].favoriteTags[0], 'spicy');

const wolf = evoDefFromPath(species[0].evolutionPaths.find(p => p.id === 'flame_wolf'), 'flameling');
assert.equal(wolf.fromFormId, 'flameling_lv2');
assert.deepEqual(wolf.requirements.required.map(r => r.field), ['level', 'training.power', 'career.eliteWins']);

const young = normalizeInstance({ instanceId: 'y', speciesId: 'flameling', formId: 'flameling_lv2', level: 10, training: { power: 10 } });
const ready = normalizeInstance({
  instanceId: 'r', speciesId: 'flameling', formId: 'flameling_lv2', level: 20,
  training: { power: 80, defense: 10, speed: 20, technique: 10, spirit: 5 },
  career: { eliteWins: 2 },
  genes: { hp: 'B', atk: 'A', def: 'C', spd: 'B' },
});
assert.equal(evaluateEvolution(wolf, young).eligible, false, 'under-raised Flare Slime cannot become Flame Wolf');
assert.equal(evaluateEvolution(wolf, ready).eligible, true, 'raising profile opens Flame Wolf');
const committed = commitEvolution(ready, wolf);
assert.equal(committed.ok, true);
assert.equal(ready.formId, 'flame_wolf');

const bite = SKILL_CANDIDATES.flameling[0];
assert.equal(evaluateSkillCandidate(bite, young).eligible, false, 'Flame Bite stays locked until Lv.5 + Power 18');
const trained = normalizeInstance({ instanceId: 't', level: 6, training: { power: 20 } });
assert.equal(evaluateSkillCandidate(bite, trained).eligible, true, 'Flame Bite unlocks from the raising profile');
learnSkill(trained, { skillId: 'Flame Bite', slot: 's1' });
addSkillExp(trained, 'Flame Bite', BALANCE_CONFIG.skill.masteryThresholds.master);
const mut = applyMutation(trained, {
  skillId: 'Flame Bite',
  baseSkillDef: { id: 'Flame Bite', damage: 100 },
  mutationDef: SKILL_MUTATIONS['Flame Bite'][0],
});
assert.equal(mut.ok, true, 'Master Flame Bite can mutate with a trade-off');

const report = formatCrReport(ready, species[0], species[0].evolutionPaths.find(p => p.id === 'flame_wolf'));
for (const source of ['speciesBase', 'levelGrowth', 'training', 'nutritionFlat', 'equipmentFlat', 'geneRank', 'evolutionProfile', 'conditionModifier']) {
  assert.ok(source in report.breakdown.atk, `CR report exposes ${source}`);
}
assert.ok(report.rated.cr > 0, 'CR debug has a numeric rating');

const noCrit = liveMoveDamage({ movePower: 24, atk: 20, def: 8, attackerLevel: 5, defenderLevel: 5, critRate: 0.25, critRoll: 0.9 });
const yesCrit = liveMoveDamage({ movePower: 24, atk: 20, def: 8, attackerLevel: 5, defenderLevel: 5, critRate: 0.25, critDamage: 1.5, critRoll: 0.1 });
assert.equal(noCrit.crit, false);
assert.equal(yesCrit.crit, true);
assert.ok(yesCrit.damage > noCrit.damage, 'derived crit increases live damage');

const lazy = normalizeInstance({ instanceId: 'lz', personalityId: 'Lazy', aptitude: { power: 3, defense: 3, speed: 3, technique: 3, spirit: 3 } });
const brave = normalizeInstance({ instanceId: 'br', personalityId: 'Brave', aptitude: { power: 3, defense: 3, speed: 3, technique: 3, spirit: 3 } });
assert.ok(ranchTrainingGain(brave, 'power', 15) > ranchTrainingGain(lazy, 'power', 15), 'personality changes ranch training gain');
addTrainingExp(brave, 'power', 1);

for (const needle of [
  'applySpeciesProgression(',
  'formatCrReport(',
  'renderCrDebug(',
  'learnCandidateSkill(',
  'mutateOwnedSkill(',
  'FOOD_CATALOG',
  'SKILL_CANDIDATES',
  'critRate:derived.critRate',
  'loadoutPreview(',
]) {
  assert.ok(js.includes(needle), `game-v800.js must wire ${needle}`);
}
assert.ok(js.includes("from './content-catalog.mjs'"), 'runtime loads the data-driven catalog');
assert.ok(html.includes('id="crDebugPanel"'), 'CR debug panel is in the manager');
assert.ok(html.includes('id="foodTraining"') && html.includes('id="foodMineral"') && html.includes('id="foodEmber"') && html.includes('id="foodMoon"'), 'all six food categories appear in the HUD');
assert.ok(css.includes('.cr-debug-panel'), 'CR debug panel has styles');

console.log('V8.0 master-plan completeness: PASS');
