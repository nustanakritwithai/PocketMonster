import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skillCatalogEntry } from '../skill-catalog.mjs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';
import { assertE1LiveWiring } from './v82-skill-effect-e1-live-wiring.mjs';

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

function state(id) {
  return createEncounterStatusState({ encounterId: id, nowSec: 0 });
}

function pair(types = {}) {
  return {
    attacker: { id: 'actor', level: 30, types: [types.attack ?? 'Fire'], stats: { ATK: 100, SPATK: 100 }, critChancePct: 5 },
    defender: { id: 'target', level: 30, types: [types.defense ?? 'Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200, statusState: state('target') },
  };
}

function command(skillId, targetIds = ['target']) {
  return { ok: true, skillId, targetKind: skillCatalogEntry(skillId).targetType, targetIds };
}

function assertRuntime(module) {
  assert.equal(module.SKILL_DAMAGE_PROFILES.length, 108);
  assert.equal(module.E1_READY_SKILL_IDS.length, 87);

  const normal = pair({ attack: 'Normal', defense: 'Fire' });
  const normalDamage = module.resolveWorkbookDirectDamage(
    { skillId: 'SK_NORMAL_01', ...normal, nowSec: 0 },
    { rng: sequence(1, 0.5) },
  );
  assert.equal(normalDamage.damage, 13);
  assert.equal(normalDamage.stab, 1.2);

  const armor = pair({ attack: 'Fighting', defense: 'Normal' });
  const armorDamage = module.resolveWorkbookDirectDamage(
    { skillId: 'SK_FIGHTING_01', ...armor, nowSec: 0 },
    { rng: sequence(1, 0.5) },
  );
  assert.equal(armorDamage.armorPiercePct, 25);
  assert.equal(armorDamage.effectiveDefense, 75);

  const dark = pair({ attack: 'Fairy', defense: 'Dark' });
  const darkDamage = module.resolveWorkbookDirectDamage(
    { skillId: 'SK_LIGHT_01', ...dark, nowSec: 0 },
    { rng: sequence(1, 0.5) },
  );
  assert.equal(darkDamage.conditionalMultiplier, 1.25);

  const control = pair({ attack: 'Fire', defense: 'Normal' });
  control.attacker.critChancePct = 80;
  const controlDamage = module.resolveWorkbookDirectDamage(
    { skillId: 'SK_FIRE_05', ...control, nowSec: 0 },
    { rng: sequence(0, 0.5) },
  );
  assert.equal(controlDamage.critical, false);
  assert.equal(controlDamage.rngDraws, 2);

  const miss = pair({ attack: 'Fire', defense: 'Normal' });
  const missedDamage = module.resolveWorkbookDirectDamage(
    { skillId: 'SK_FIRE_04', ...miss, nowSec: 0 },
    { rng: sequence(1) },
  );
  assert.equal(missedDamage.ok, true);
  assert.equal(missedDamage.reason, 'attack_missed');
  assert.equal(missedDamage.damage, 0);

  const multi = pair({ attack: 'Fighting', defense: 'Fire' });
  const multiDamage = module.resolveWorkbookDirectDamage(
    { skillId: 'SK_FIGHTING_02', ...multi, nowSec: 0 },
    { rng: sequence(0, 1, 0.5) },
  );
  assert.equal(multiDamage.damage, 18);
  assert.equal(multiDamage.hitCount, 3);

  const burn = pair();
  const burnResult = module.resolveE1SkillEffects({
    command: command('SK_FIRE_01'), attacker: burn.attacker, targets: [burn.defender], nowSec: 0,
  }, { rng: sequence(1, 0.5, 0) });
  assert.equal(burnResult.statusAppliedCount, 1);
  assert.equal(burnResult.targetResults[0].nextStatusState.statuses[0].statusId, 'ST_BURN');

  const lethal = pair();
  lethal.defender.hp = 1;
  const lethalResult = module.resolveE1SkillEffects({
    command: command('SK_FIRE_01'), attacker: lethal.attacker, targets: [lethal.defender], nowSec: 0,
  }, { rng: sequence(1, 0.5) });
  assert.equal(lethalResult.targetResults[0].statusResults[0].reason, 'target_fainted');
  assert.equal(lethalResult.statusAppliedCount, 0);

  const dragon = pair({ attack: 'Dragon', defense: 'Normal' });
  const dragonResult = module.resolveE1SkillEffects({
    command: command('SK_DRAGON_04'), attacker: dragon.attacker, targets: [dragon.defender], nowSec: 0,
  }, { rng: sequence(0, 1, 0.5, 0, 0) });
  assert.deepEqual(dragonResult.targetResults[0].statusResults.map(result => result.statusId), ['ST_BURN', 'ST_PARALYZE']);

  const self = pair({ attack: 'Normal', defense: 'Fire' });
  const selfResult = module.resolveE1SkillEffects({
    command: command('SK_NORMAL_05'), attacker: self.attacker, targets: [self.defender], nowSec: 0,
  }, { rng: sequence(0, 0.5) });
  assert.deepEqual(selfResult.targetResults[0].statusResults, []);
  assert.deepEqual(selfResult.deferredComponentKinds, ['status']);

  const poison = pair({ attack: 'Poison', defense: 'Normal' });
  const poisonFirst = module.resolveE1SkillEffects({
    command: command('SK_POISON_01'), attacker: poison.attacker, targets: [poison.defender], nowSec: 0,
  }, { rng: sequence(1, 0.5, 0) });
  const poisonAgain = { ...poison.defender, statusState: poisonFirst.targetResults[0].nextStatusState };
  const poisonSecond = module.resolveE1SkillEffects({
    command: command('SK_POISON_01'), attacker: poison.attacker, targets: [poisonAgain], nowSec: 0.1,
  }, { rng: sequence(1, 0.5, 0) });
  assert.equal(poisonSecond.targetResults[0].nextStatusState.statuses[0].stacks, 2);

  const areaA = pair().defender;
  const areaB = { ...pair().defender, id: 'target-2', statusState: state('target-2') };
  const area = module.resolveE1SkillEffects({
    command: command('SK_FIRE_05', ['target', 'target-2']),
    attacker: pair().attacker,
    targets: [areaA, areaB],
    nowSec: 0,
  }, { rng: sequence(0, 0.5, 0, 0, 0.5, 0) });
  assert.deepEqual(area.targetResults.map(result => result.targetId), ['target', 'target-2']);
}

assertRuntime(await loadRuntime(runtimeSource, 'skill-effect-e1-current'));

const runtimeMutations = [
  ['change STAB', 'stabMultiplier: 1.2,', 'stabMultiplier: 1,'],
  ['change core divisor', 'baseFormulaDivisor: 50,', 'baseFormulaDivisor: 40,'],
  ['change variance floor', 'varianceMin: 0.9,', 'varianceMin: 0.8,'],
  ['remove armor pierce profile', 'armorPiercePct: skill.armorPiercePct,', 'armorPiercePct: 0,'],
  ['remove Dark conditional', "bonusVsDarkPct: skill.effect === 'BonusVsDark' ? WORKBOOK_DAMAGE_RULES.bonusVsDarkPct : 0,", 'bonusVsDarkPct: 0,'],
  ['allow Control crit', "canCrit: skill.category !== 'Control',", 'canCrit: true,'],
  ['multiply multi-hit power budget', '* effectivePower * effectiveAttack / effectiveDefense)', '* effectivePower * effectiveAttack * profile.hitCount / effectiveDefense)'],
  ['activate non-damage skills', ".filter(row => row.components.some(component => component.kind === 'direct_damage'))", '.filter(() => true)'],
  ['apply status after lethal damage', '} else if (fainted) {', '} else if (false) {'],
  ['drop second multi-status link', 'index < enemyStatuses.statusLinkIds.length; index += 1', 'index < 1; index += 1'],
  ['lose canonical status state', 'nextStatusState = lifecycle.state;', 'void lifecycle.state;'],
  ['reverse canonical target order', 'for (const target of targets) {\n    const targetNowSec = Number.isFinite(target.nowSec)', 'for (const target of [...targets].reverse()) {\n    const targetNowSec = Number.isFinite(target.nowSec)'],
  ['bypass accuracy miss', 'if (accuracyRoll >= accuracyPct / 100) {', 'if (false) {'],
  ['double-count Poison stacks', "stacks: resolved.stackRule === 'AddStackAndRefresh'\n                ? resolved.potencyStacks\n                : resolved.proposedStatus.stacks,", 'stacks: resolved.proposedStatus.stacks,'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertRuntime(await loadRuntime(mutant, `skill-effect-e1-mutant-${name}`)), undefined, `${name} must be killed`);
}

assertE1LiveWiring(gameSource);
const liveMutations = [
  ['enable every HUD skill', 'effectAvailable:canExecuteReviewedSkillEffect(definition.id),', 'effectAvailable:true,'],
  ['bypass pre-commit readiness', 'return validateReviewedSkillEffectRequest(canonicalSkillEffectRequest(a,move,command,materialized)).ok;', 'return true;'],
  ['commit cooldown before planning', 'const planned=resolveReviewedSkillEffects(effectRequest,{rng:Math.random});', 'a.skillCds[index]=command.startCooldownSec;\n  const planned=resolveReviewedSkillEffects(effectRequest,{rng:Math.random});'],
  ['duplicate cooldown commit', 'a.skillCds[index]=command.startCooldownSec;', 'a.skillCds[index]=command.startCooldownSec;\n  a.skillCds[index]=command.startCooldownSec;'],
  ['ignore rejected nearest damage commit', 'if(damageReceipt.committed){\n        targetDamageCommitted[0]=true;', 'if(true){\n        targetDamageCommitted[0]=true;'],
  ['nearest damage bypasses deferred defeat transaction', 'deferDefeat:true,commitReceipt:damageReceipt', 'deferDefeat:false,commitReceipt:damageReceipt'],
  ['drop nearest HP commit receipt', 'deferDefeat:true,commitReceipt:damageReceipt', 'deferDefeat:true,commitReceipt:null'],
  ['restore stale area status after reset', 'if(!damageReceipt.committed)continue;', 'if(false)continue;'],
  ['apply status to pending-defeat target', 'if(!target.dead&&target.hp>0&&effect.nextStatusState)', 'if(!target.dead&&effect.nextStatusState)'],
  ['drop live status commit', 'target.statusState=effect.nextStatusState;', 'void effect.nextStatusState;'],
  ['restore legacy effect receipt', 'effectMode:planned.effectMode', "effectMode:'legacy_damage_compatibility'"],
];

for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} live mutation must apply`);
  assert.throws(() => assertE1LiveWiring(mutant), undefined, `${name} live mutation must be killed`);
}

console.log(`V8.2 E1 skill effect mutants: PASS (${runtimeMutations.length + liveMutations.length}/${runtimeMutations.length + liveMutations.length} killed)`);
