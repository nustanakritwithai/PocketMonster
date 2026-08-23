import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import { SKILL_STATUS_LINKS } from '../status-catalog.mjs';
import {
  KNOWN_SKILL_EFFECTS_BY_CLASS,
  SKILL_EFFECT_COMPONENT_KINDS,
  SKILL_EFFECT_COVERAGE_CONTRACT,
  SKILL_EFFECT_SLICES,
  buildSkillEffectCoverageContract,
  skillEffectCoverageEntry,
  validateSkillEffectCoverageContract,
} from '../skill-effect-contract.mjs';

assert.equal(SKILL_EFFECT_COVERAGE_CONTRACT.length, 108, 'all 108 skills have an effect coverage row');
assert.equal(new Set(SKILL_EFFECT_COVERAGE_CONTRACT.map(row => row.skillId)).size, 108, 'coverage is one-to-one by SkillID');
assert.equal(validateSkillEffectCoverageContract(SKILL_EFFECT_COVERAGE_CONTRACT).ok, true, 'canonical coverage passes');
assert.deepEqual(
  SKILL_EFFECT_COVERAGE_CONTRACT.map(row => row.skillId),
  SKILL_CATALOG.map(skill => skill.id),
  'coverage order remains tied to the reviewed catalog',
);
assert.equal(SKILL_EFFECT_COVERAGE_CONTRACT.every(row => row.components.length > 0), true, 'no valid skill has an empty effect plan');
assert.equal(SKILL_EFFECT_COVERAGE_CONTRACT.every(row => row.executorFamily !== 'not_ready'), true, 'no contract row uses not_ready as an executor');
assert.equal(SKILL_EFFECT_COVERAGE_CONTRACT.every(row => row.activation === 'contract_only'), true, 'E0 does not claim live runtime activation');

const coveredStatusLinks = SKILL_EFFECT_COVERAGE_CONTRACT.flatMap(row => row.statusLinkIds);
assert.equal(coveredStatusLinks.length, 69, 'all status links are represented');
assert.equal(new Set(coveredStatusLinks).size, 69, 'status links are not duplicated across skills');
assert.deepEqual(coveredStatusLinks, SKILL_STATUS_LINKS.map(link => link.id), 'status-link ordering stays canonical');

const coveredClasses = new Set(SKILL_EFFECT_COVERAGE_CONTRACT.map(row => row.effectClass));
assert.deepEqual(coveredClasses, new Set(Object.keys(KNOWN_SKILL_EFFECTS_BY_CLASS)), 'all twelve effect classes are recognized');
const usedKinds = new Set(SKILL_EFFECT_COVERAGE_CONTRACT.flatMap(row => row.components.map(component => component.kind)));
assert.deepEqual(usedKinds, new Set(SKILL_EFFECT_COMPONENT_KINDS), 'all component executors are exercised by the 108-skill catalog');

const selfBuffDamage = skillEffectCoverageEntry('SK_NORMAL_05');
assert.deepEqual(selfBuffDamage.components, [
  { kind: 'direct_damage', slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'command_targets' },
  { kind: 'status', slice: SKILL_EFFECT_SLICES.SELF_SURVIVAL, targetChannel: 'actor' },
], 'a composite damage + self-buff skill spans E1 and E2 without splitting the command');

const dragonBreath = skillEffectCoverageEntry('SK_DRAGON_04');
assert.deepEqual(dragonBreath.statusIds, ['ST_BURN', 'ST_PARALYZE'], 'multi-status coverage retains both canonical links');
assert.deepEqual(dragonBreath.components.map(component => component.kind), ['direct_damage', 'status']);

const iceWall = skillEffectCoverageEntry('SK_ICE_04');
assert.deepEqual(iceWall.components, [
  { kind: 'field', slice: SKILL_EFFECT_SLICES.GROUND_FIELD, targetChannel: 'target_point' },
], 'GroundPoint field coverage is explicit');

const movement = skillEffectCoverageEntry('SK_GROUND_02');
assert.deepEqual(movement.components.map(component => component.kind), ['direct_damage', 'movement']);
assert.deepEqual(movement.implementationSlices, [SKILL_EFFECT_SLICES.DIRECT_STATUS, SKILL_EFFECT_SLICES.MOBILITY_CONTROL]);

const heal = skillEffectCoverageEntry('SK_GRASS_05');
assert.deepEqual(heal.components, [
  { kind: 'self_heal', slice: SKILL_EFFECT_SLICES.SELF_SURVIVAL, targetChannel: 'actor' },
]);

assert.equal(Object.isFrozen(SKILL_EFFECT_COVERAGE_CONTRACT), true, 'contract collection is immutable');
assert.equal(Object.isFrozen(iceWall), true, 'contract rows are immutable');
assert.equal(Object.isFrozen(iceWall.components), true, 'component collections are immutable');
assert.equal(Object.isFrozen(iceWall.components[0]), true, 'components are immutable');
assert.equal(skillEffectCoverageEntry('SK_UNKNOWN_99'), null, 'unknown skills fail closed');

const rebuilt = buildSkillEffectCoverageContract(SKILL_CATALOG, SKILL_STATUS_LINKS);
assert.deepEqual(rebuilt, SKILL_EFFECT_COVERAGE_CONTRACT, 'coverage derivation is deterministic');
const digest = createHash('sha256').update(JSON.stringify(SKILL_EFFECT_COVERAGE_CONTRACT)).digest('hex');
assert.equal(digest, 'd03a12e69d53058db8f1a20d989623582db4fe67b9df9a98c3442b0095a210f3', 'effect coverage stays tied to this reviewed 108-skill contract');

console.log('V8.2 108-skill effect coverage contract: PASS');
