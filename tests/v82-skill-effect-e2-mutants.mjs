import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';
import { assertE2LiveWiring } from './v82-skill-effect-e2-live-wiring.mjs';

const runtimeSource = fs.readFileSync(new URL('../skill-effect-runtime.mjs', import.meta.url), 'utf8');
const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

async function loadRuntime(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function sequence(...values) {
  let index = 0;
  return () => values[index++];
}

function actor(overrides = {}) {
  const id = overrides.id ?? 'actor';
  return {
    id, level: 30, types: ['Normal'], stats: { ATK: 100, SPATK: 100 }, hp: 100, maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: `owned:${id}`, nowSec: 0 }),
    critChancePct: 5,
    ...overrides,
  };
}

function command(skillId, actorId = 'actor') {
  const skill = skillCatalogEntry(skillId);
  return { ok: true, skillId, targetKind: skill.targetType, targetIds: skill.targetType === 'Self' ? [actorId] : ['enemy'] };
}

function applySelf(module, skillId, overrides = {}) {
  const self = actor({ types: [skillCatalogEntry(skillId).runtimeType], ...overrides });
  const result = module.resolveE2SkillEffects({ command: command(skillId, self.id), actor: self, nowSec: 0 });
  assert.equal(result.ok, true);
  return result;
}

function assertRuntime(module) {
  assert.equal(module.E2_READY_SKILL_IDS.length, 27);
  assert.equal(module.REVIEWED_SKILL_EFFECT_IDS.length, 108);
  assert.equal(module.E2_SELF_EFFECT_POLICY.healPercentMaxHp, 25);
  assert.equal(module.E2_SELF_EFFECT_POLICY.healMagnitudeSource, 'runtime_fallback_workbook_percentage_unspecified');
  assert.equal(module.canExecuteReviewedSkillEffect('SK_GRASS_05'), true);

  const heal = applySelf(module, 'SK_GRASS_05');
  assert.equal(heal.actorResult.requestedHealing, 50);
  assert.equal(heal.actorResult.predictedHp, 150);
  const capped = applySelf(module, 'SK_LIGHT_04', { hp: 190 });
  assert.equal(capped.healing, 10);
  assert.equal(capped.actorResult.predictedHp, 200);

  const attack = applySelf(module, 'SK_NORMAL_03');
  assert.equal(attack.statusAppliedCount, 1);
  assert.equal(attack.actorResult.nextStatusState.statuses[0].statusId, 'ST_ATK_UP');
  assert.equal(module.resolveActiveSelfStatusModifiers(attack.actorResult.nextStatusState).attackMultiplier, 1.15);

  const combined = applySelf(module, 'SK_LIGHT_05', { types: ['Fairy'] });
  const combinedModifiers = module.resolveActiveSelfStatusModifiers(combined.actorResult.nextStatusState);
  assert.equal(combinedModifiers.attackMultiplier, 1.12);
  assert.equal(combinedModifiers.defenseMultiplier, 1.12);

  const fire = applySelf(module, 'SK_FIRE_03', { types: ['Fire'] });
  assert.equal(module.resolveActiveSelfStatusModifiers(fire.actorResult.nextStatusState, { incomingType: 'Fire' }).elementDamageTakenMultiplier, 0.75);
  assert.equal(module.resolveActiveSelfStatusModifiers(fire.actorResult.nextStatusState, { incomingType: 'Water' }).elementDamageTakenMultiplier, 1);

  const evade = applySelf(module, 'SK_DARK_03', { types: ['Dark'] });
  assert.equal(module.resolveActiveSelfStatusModifiers(evade.actorResult.nextStatusState).evasionChancePct, 15);
  const crit = applySelf(module, 'SK_DARK_01', { types: ['Dark'] });
  assert.equal(module.resolveActiveSelfStatusModifiers(crit.actorResult.nextStatusState).critChancePct, 15);

  const laterActor = actor();
  const laterBuff = module.resolveE2SkillEffects({ command: command('SK_NORMAL_03'), actor: laterActor, nowSec: 10 });
  const earlyTarget = {
    id: 'early', level: 30, types: ['Fire'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: 'early', nowSec: 0 }),
  };
  const crossClock = module.resolveWorkbookDirectDamage({
    skillId: 'SK_NORMAL_01', attacker: { ...laterActor, statusState: laterBuff.actorResult.nextStatusState }, defender: earlyTarget,
    attackerNowSec: 10, defenderNowSec: 0,
  }, { rng: sequence(1, 0.5) });
  assert.equal(crossClock.attackModifier, 1.15);

  const mismatch = module.validateE2SkillEffectRequest({
    command: { ...command('SK_NORMAL_03'), targetIds: ['other'] }, actor: actor(), nowSec: 0,
  });
  assert.equal(mismatch.reason, 'actor_mismatch');

  const compositeActor = actor({ id: 'composite', types: ['Dark'] });
  const target = {
    id: 'enemy', level: 30, types: ['Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: 'enemy', nowSec: 0 }),
  };
  const composite = module.resolveReviewedSkillEffects({
    command: command('SK_DARK_01', compositeActor.id), attacker: compositeActor, targets: [target], nowSec: 0,
  }, { rng: sequence(1, 0.5) });
  assert.equal(composite.ok, true);
  assert.ok(composite.totalDamage > 0);
  assert.equal(composite.actorResult.statusResults[0].statusId, 'ST_CRIT_UP');
  assert.deepEqual(composite.activeComponentKinds, ['direct_damage', 'status']);
  assert.deepEqual(composite.deferredComponentKinds, []);
}

assertRuntime(await loadRuntime(runtimeSource, 'skill-effect-e2-current'));

const runtimeMutations = [
  ['change heal percentage', 'healPercentMaxHp: 25,', 'healPercentMaxHp: 30,'],
  ['hide heal fallback provenance', "healMagnitudeSource: 'runtime_fallback_workbook_percentage_unspecified',", "healMagnitudeSource: 'workbook_exact',"],
  ['drop E2 coverage', "component.slice === 'E2_SELF_HEAL_BUFF_SHIELD'", "component.slice === 'E3_GROUND_POINT_FIELD'"],
  ['remove E2 from cumulative readiness', '|| E2_READY_SKILLS.has(row.skillId)', '|| false'],
  ['lose actor lifecycle state', 'let nextStatusState = actor.statusState;', 'let nextStatusState = null;'],
  ['lose status application count', 'if (applied) statusAppliedCount += 1;\n      }\n      statusResults.push', 'if (applied) statusAppliedCount += 0;\n      }\n      statusResults.push'],
  ['heal from current HP', 'Math.round(actor.maxHp * E2_SELF_EFFECT_POLICY.healPercentMaxHp / 100)', 'Math.round(actor.hp * E2_SELF_EFFECT_POLICY.healPercentMaxHp / 100)'],
  ['remove max-HP heal cap', 'Math.min(actor.maxHp - actor.hp, requestedHealing)', 'requestedHealing'],
  ['accept substitute Self actor', "if (command.targetKind === 'Self'", "if (false && command.targetKind === 'Self'"],
  ['drop ATK_DEF attack layer', "const attackPct = magnitudeFor('ATK') + magnitudeFor('ATK_DEF');", "const attackPct = magnitudeFor('ATK');"],
  ['drop ATK_DEF defense layer', "const defensePct = magnitudeFor('DEF') + magnitudeFor('ATK_DEF');", "const defensePct = magnitudeFor('DEF');"],
  ['apply fire resist to every type', "incomingType === 'Fire' ? magnitudeFor('FireDamageTaken') : 0", "magnitudeFor('FireDamageTaken')"],
  ['disable evasion modifier', "evasionChancePct: clamp(magnitudeFor('Evasion'), 0, 100),", 'evasionChancePct: 0,'],
  ['disable crit modifier', "critChancePct: clamp(magnitudeFor('CritChance'), 0, WORKBOOK_DAMAGE_RULES.critChanceCapPct),", 'critChancePct: 0,'],
  ['use defender clock for actor buffs', 'const attackerStatuses = activeStatusIds(attacker, attackerNowSec);', 'const attackerStatuses = activeStatusIds(attacker, defenderNowSec);'],
  ['skip composite actor resolution', 'if (E2_READY_SKILLS.has(skillId)) {\n    e2 = resolveE2SkillEffects', 'if (false) {\n    e2 = resolveE2SkillEffects'],
  ['leave E2 component deferred', '|| component.slice === E2_SELF_EFFECT_POLICY.phase\n    || component.slice === E3_FIELD_EFFECT_POLICY.phase;', '|| false\n    || component.slice === E3_FIELD_EFFECT_POLICY.phase;'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertRuntime(await loadRuntime(mutant, `skill-effect-e2-mutant-${name}`)), undefined, `${name} must be killed`);
}

assertE2LiveWiring(gameSource);
const liveMutations = [
  ['drop owned status creation', 'statusState:createEncounterStatusState({encounterId:`owned:${inst.instanceId}`,nowSec:0})', 'statusState:null'],
  ['keep statuses after Recall', 'activeSummon.statusState=endEncounterEffects(activeSummon.statusState,{nowSec:activeSummon.statusState.currentTimeSec});', 'void activeSummon.statusState;'],
  ['drop actor HP commit', 'a.inst.hp=actorResult.predictedHp;', 'void actorResult.predictedHp;'],
  ['drop actor status commit', 'a.statusState=actorResult.nextStatusState;', 'void actorResult.nextStatusState;'],
  ['drop owned lifecycle advance', 'const statusAdvance=advanceEncounterEffects(a.statusState,', 'const statusAdvance=mutantEncounterEffects(a.statusState,'],
  ['drop Basic AI attack buff', 'monsterDamage(a.inst,basic,liveTarget,attackMultiplier', 'monsterDamage(a.inst,basic,liveTarget,1'],
  ['drop Basic AI crit buff', '{allowSkillMastery:false,critBonusPct}', '{allowSkillMastery:false,critBonusPct:0}'],
  ['drop movement speed buff', '*speedMultiplier*dt', '*1*dt'],
  ['drop defense buff', 'def:(inst.def||10)*defenseMultiplier', 'def:(inst.def||10)'],
  ['drop evasion', 'guard.evasionChancePct/100', '0'],
  ['drop elemental shield layer', 'guard.damageTakenMultiplier*guard.elementDamageTakenMultiplier', 'guard.damageTakenMultiplier'],
];

for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} live mutation must apply`);
  assert.throws(() => assertE2LiveWiring(mutant), undefined, `${name} live mutation must be killed`);
}

console.log(`V8.2 E2 skill effect mutants: PASS (${runtimeMutations.length + liveMutations.length}/${runtimeMutations.length + liveMutations.length} killed)`);
