import assert from 'node:assert/strict';
import { normalizeInstance } from '../monster-instance.mjs';
import { learnSkill, addSkillExp, getSkill } from '../skill-progression.mjs';
import { equipItem } from '../equipment.mjs';
import {
  evaluateEvolution,
  listEligibleBranches,
  checkEvolutionBudget,
  previewEvolution,
  commitEvolution,
} from '../evolution.mjs';

const mk = (over = {}) => normalizeInstance({ instanceId: 'evo1', level: 20, formId: 'ember_cub', ...over });

// Branch definitions (data-driven, R10). Flame Wolf needs Power+Speed+wins.
const flameWolf = {
  id: 'to_flame_wolf', fromFormId: 'ember_cub', toFormId: 'flame_wolf',
  requirements: { required: [
    { field: 'level', op: 'gte', value: 20 },
    { field: 'training.power', op: 'gte', value: 70 },
    { field: 'career.eliteWins', op: 'gte', value: 2 },
  ] },
  profile: { atk: 1.08, def: 0.96, hp: 1.0, spd: 1.02 },
  skillMapping: { flame_bite: { to: 'flame_fang', carry: 0.8 } },
  addsSecondaryType: null,
};
const magmaBear = {
  id: 'to_magma_bear', fromFormId: 'ember_cub', toFormId: 'magma_bear',
  requirements: { required: [{ field: 'level', op: 'gte', value: 20 }, { field: 'training.defense', op: 'gte', value: 80 }] },
  profile: { atk: 0.98, def: 1.1, hp: 1.04 },
};

// Not eligible until the raising profile matches.
const young = mk({ level: 18, training: { power: 20 }, career: { eliteWins: 0 } });
assert.equal(evaluateEvolution(flameWolf, young).eligible, false, 'under-developed monster cannot evolve');

// A Power/Speed raising profile opens Flame Wolf, not Magma Bear (Locked).
const wolfRaised = mk({ training: { power: 90, speed: 60 }, career: { eliteWins: 3 } });
const branches = listEligibleBranches(wolfRaised, [flameWolf, magmaBear]);
assert.deepEqual(branches, ['to_flame_wolf'], 'only the matching branch is eligible; the system does not auto-pick');
assert.equal(evaluateEvolution(magmaBear, wolfRaised).eligible, false, 'Magma Bear stays Locked (defense not raised)');

// Budget: evolution adds only ~5-8% total power (R10).
const build = {
  level: 20, species: { base: { hp: 120, atk: 30, def: 25, spd: 28 }, growthPerLevel: { hp: 8, atk: 2, def: 1.5, spd: 1.6 } },
  genes: { hp: 'B', atk: 'A', def: 'C', spd: 'B' }, training: { power: 90, speed: 60 }, condition: 'good',
};
const budget = checkEvolutionBudget(build, flameWolf.profile);
assert.ok(budget.withinBudget, `evolution CR gain ${(budget.share * 100).toFixed(1)}% must be within 5-8%`);

// Preview reports carried skills and profile before committing.
learnSkill(wolfRaised, { skillId: 'flame_bite', slot: 's1' });
addSkillExp(wolfRaised, 'flame_bite', 1500); // Master.
const preview = previewEvolution(wolfRaised, flameWolf, build);
assert.equal(preview.toFormId, 'flame_wolf', 'preview shows the target form');
assert.equal(preview.skillCarry[0].to, 'flame_fang', 'preview shows skill remap');
assert.ok(preview.skillCarry[0].carry >= 0.7, 'skill carry is within 70-100%');

// Commit preserves identity + history and only redistributes power (R10, P1).
equipItem(wolfRaised, { id: 'runner_band', slot: 'gear', affixes: [{ group: 'spd', stat: 'spd', value: 4 }] });
equipItem(wolfRaised, { id: 'heavy_shell', slot: 'charm', affixes: [{ group: 'def', stat: 'def', value: 8 }] });
const idBefore = wolfRaised.instanceId;
const genesBefore = JSON.stringify(wolfRaised.genes);
const genBefore = wolfRaised.generation;
const historyLenBefore = wolfRaised.lifeHistory.length;
const masteryExpBefore = getSkill(wolfRaised, 'flame_bite').masteryExp;

const commit = commitEvolution(wolfRaised, flameWolf, { ownedItemCompat: { runner_band: true, heavy_shell: false } });
assert.equal(commit.ok, true, 'eligible evolution commits');
assert.equal(wolfRaised.formId, 'flame_wolf', 'form changed');
assert.equal(wolfRaised.instanceId, idBefore, 'instanceId preserved');
assert.equal(JSON.stringify(wolfRaised.genes), genesBefore, 'genes preserved');
assert.equal(wolfRaised.generation, genBefore, 'generation preserved');
assert.equal(wolfRaised.evolutionProfile.atk, 1.08, 'evolution profile applied');
assert.ok(wolfRaised.lifeHistory.length > historyLenBefore, 'evolution appended to life history (never reset)');
assert.equal(wolfRaised.evolutionHistory.length, 1, 'evolution history recorded');

// Skill remapped with carried (not full) mastery.
assert.ok(getSkill(wolfRaised, 'flame_fang'), 'skill remapped to evolved name');
assert.equal(getSkill(wolfRaised, 'flame_bite'), null, 'old skill id replaced');
assert.equal(getSkill(wolfRaised, 'flame_fang').masteryExp, Math.round(masteryExpBefore * 0.8), 'mastery carried at 80%');

// Incompatible equipment unequipped; compatible kept.
assert.equal(wolfRaised.equipment.gear.id, 'runner_band', 'compatible equipment kept');
assert.equal(wolfRaised.equipment.charm, null, 'incompatible equipment unequipped');
assert.deepEqual(commit.unequipped, ['heavy_shell'], 'unequipped items reported');

console.log('V7.7 evolution regression: PASS');
