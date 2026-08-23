import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';
import { assertE4LiveWiring } from './v82-skill-effect-e4-live-wiring.mjs';

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
  return {
    id: 'actor', level: 30, types: ['Ground'], position: { x: 0, z: 0 }, stats: { ATK: 100, SPATK: 100 },
    hp: 180, maxHp: 200, statusState: createEncounterStatusState({ encounterId: 'actor', nowSec: 0 }), critChancePct: 5,
    ...overrides,
  };
}

function target(id, position) {
  return {
    id, level: 30, types: ['Normal'], position, stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: id, nowSec: 0 }), nowSec: 0,
  };
}

function command(skillId, targetKind, targets, targetPoint = targets[0]?.position) {
  return {
    ok: true, commandId: `cast:${skillId}`, castId: `cast:${skillId}`, skillId, targetKind,
    targetIds: targets.map(entry => entry.id), targetPoint, rangeM: 8, radiusM: targetKind === 'EnemyArea' ? 3.5 : 0,
  };
}

function hitResults(targets, overrides = {}) {
  return targets.map(entry => ({ targetId: entry.id, hit: true, fainted: false, ...overrides }));
}

function assertRuntime(module) {
  assert.equal(module.E4_READY_SKILL_IDS.length, 16);
  assert.equal(module.E4_READY_SKILL_IDS[0], 'SK_NORMAL_06');
  assert.equal(module.E4_READY_SKILL_IDS.at(-1), 'SK_GHOST_02');
  assert.deepEqual(module.E4_MOBILITY_EFFECT_POLICY.movementDistanceM, { Burrow: 3, Dash: 3, Blink: 4 });
  assert.equal(module.E4_MOBILITY_EFFECT_POLICY.nearestEnemyStopDistanceM, 1);
  assert.equal(module.E4_MOBILITY_EFFECT_POLICY.knockbackDistanceM, 1.5);
  assert.equal(module.E4_MOBILITY_EFFECT_POLICY.pullDistanceM, 2);
  assert.equal(module.E4_MOBILITY_EFFECT_POLICY.magnitudeSource,
    'runtime_fallback_workbook_mechanic_without_distance_magnitude');

  const enemy = target('enemy', { x: 5, z: 0 });
  const dig = module.resolveE4SkillEffects({
    command: command('SK_GROUND_02', 'NearestEnemy', [enemy]), attacker: actor(), targets: [enemy], hitResults: hitResults([enemy]),
  });
  assert.equal(dig.ok, true);
  assert.deepEqual(dig.movementResult.destination, { x: 3, z: 0 });
  assert.equal(dig.movementResult.applied, true);
  const missedDig = module.resolveE4SkillEffects({
    command: command('SK_GROUND_02', 'NearestEnemy', [enemy]), attacker: actor(), targets: [enemy],
    hitResults: hitResults([enemy], { hit: false }),
  });
  assert.equal(missedDig.movementResult.applied, false);
  assert.equal(missedDig.movementResult.reason, 'attack_missed');

  const blinkEnemy = target('blink', { x: 10, z: 0 });
  const blink = module.resolveE4SkillEffects({
    command: command('SK_DARK_02', 'NearestEnemy', [blinkEnemy]), attacker: actor({ types: ['Dark'] }),
    targets: [blinkEnemy], hitResults: hitResults([blinkEnemy]),
  });
  assert.deepEqual(blink.movementResult.destination, { x: 4, z: 0 });

  const airTargets = [target('air-a', { x: 0, z: 2 }), target('air-b', { x: 1, z: 2 })];
  const air = module.resolveE4SkillEffects({
    command: command('SK_FLYING_04', 'EnemyArea', airTargets, { x: 0, z: 5 }), attacker: actor({ types: ['Flying'] }),
    targets: airTargets, hitResults: hitResults(airTargets),
  }, { rng: sequence(0.19) });
  assert.equal(air.movementResult.applied, true);
  assert.deepEqual(air.movementResult.destination, { x: 0, z: 3 });
  const airFail = module.resolveE4SkillEffects({
    command: command('SK_FLYING_04', 'EnemyArea', airTargets, { x: 0, z: 5 }), attacker: actor({ types: ['Flying'] }),
    targets: airTargets, hitResults: hitResults(airTargets),
  }, { rng: sequence(0.2) });
  assert.equal(airFail.movementResult.applied, false);

  const pushTarget = target('push', { x: 2, z: 0 });
  const push = module.resolveE4SkillEffects({
    command: command('SK_WATER_02', 'NearestEnemy', [pushTarget]), attacker: actor({ types: ['Water'] }),
    targets: [pushTarget], hitResults: hitResults([pushTarget]),
  });
  assert.deepEqual(push.displacementResults[0].destination, { x: 3.5, z: 0 });

  const center = target('center', { x: 0, z: 0 });
  const fallback = module.resolveE4SkillEffects({
    command: command('SK_NORMAL_06', 'EnemyArea', [center], { x: 0, z: 0 }),
    attacker: actor({ position: { x: -2, z: 0 }, types: ['Normal'] }), targets: [center], hitResults: hitResults([center]),
  }, { rng: sequence(0.1) });
  assert.deepEqual(fallback.displacementResults[0].destination, { x: 1.5, z: 0 });

  const pullTarget = target('pull', { x: 4, z: 0 });
  const pull = module.resolveE4SkillEffects({
    command: command('SK_DARK_06', 'EnemyArea', [pullTarget], { x: 0, z: 0 }),
    attacker: actor({ types: ['Dark'] }), targets: [pullTarget], hitResults: hitResults([pullTarget]),
  }, { rng: sequence(0.1) });
  assert.deepEqual(pull.displacementResults[0].destination, { x: 2, z: 0 });

  const lethal = module.resolveE4SkillEffects({
    command: command('SK_WATER_02', 'NearestEnemy', [pushTarget]), attacker: actor({ types: ['Water'] }),
    targets: [pushTarget], hitResults: hitResults([pushTarget], { fainted: true }),
  });
  assert.equal(lethal.displacementResults[0].applied, false);
  assert.equal(lethal.displacementResults[0].reason, 'target_fainted');

  assert.equal(module.validateE4SkillEffectRequest({
    command: command('SK_GROUND_02', 'NearestEnemy', []), attacker: actor(), targets: [],
  }).reason, 'invalid_target_positions');

  const integrated = module.resolveReviewedSkillEffects({
    command: command('SK_GROUND_02', 'NearestEnemy', [enemy]), attacker: actor(), targets: [enemy], nowSec: 0,
  }, { rng: sequence(0, 1, 0.5) });
  assert.equal(integrated.ok, true);
  assert.deepEqual(integrated.activeComponentKinds, ['direct_damage', 'movement']);
  assert.deepEqual(integrated.deferredComponentKinds, []);
  assert.equal(integrated.movementResult.applied, true);
}

assertRuntime(await loadRuntime(runtimeSource, 'skill-effect-e4-current'));

const runtimeMutations = [
  ['drop E4 coverage', "component.slice === 'E4_MOVEMENT_DISPLACEMENT'", "component.slice === 'E3_GROUND_POINT_FIELD'"],
  ['change Burrow distance', 'Object.freeze({ Burrow: 3, Dash: 3, Blink: 4 })', 'Object.freeze({ Burrow: 2, Dash: 3, Blink: 4 })'],
  ['change Dash distance', 'Object.freeze({ Burrow: 3, Dash: 3, Blink: 4 })', 'Object.freeze({ Burrow: 3, Dash: 2, Blink: 4 })'],
  ['change Blink distance', 'Object.freeze({ Burrow: 3, Dash: 3, Blink: 4 })', 'Object.freeze({ Burrow: 3, Dash: 3, Blink: 3 })'],
  ['remove stop distance', 'nearestEnemyStopDistanceM: 1,', 'nearestEnemyStopDistanceM: 0,'],
  ['change knockback distance', 'knockbackDistanceM: 1.5,', 'knockbackDistanceM: 1,'],
  ['change pull distance', 'pullDistanceM: 2,', 'pullDistanceM: 1,'],
  ['hide distance fallback provenance', "magnitudeSource: 'runtime_fallback_workbook_mechanic_without_distance_magnitude',", "magnitudeSource: 'workbook_exact',"],
  ['allow empty targets', "|| command.targetIds.length === 0 || !Array.isArray(targets)", "|| false || !Array.isArray(targets)"],
  ['invert effect chance', 'draw.roll < effectChancePct / 100', 'draw.roll <= effectChancePct / 100'],
  ['move actor away', 'const dx = toward.x - from.x;', 'const dx = from.x - toward.x;'],
  ['drop centered knockback fallback', 'if (length <= Number.EPSILON && fallbackAnchor)', 'if (false && fallbackAnchor)'],
  ['move actor on miss', 'const successfulHit = hitResults.some(result => result.hit);', 'const successfulHit = true;'],
  ['displace lethal target', 'if (hit.hit && !hit.fainted) chance = resolveEffectChance', 'if (hit.hit) chance = resolveEffectChance'],
  ['skip E4 generic resolution', 'if (E4_READY_SKILLS.has(skillId)) {\n    e4 = resolveE4SkillEffects', 'if (false) {\n    e4 = resolveE4SkillEffects'],
  ['leave E4 component deferred', '|| component.slice === E4_MOBILITY_EFFECT_POLICY.phase;', '|| false;'],
  ['drop movement result receipt', 'movementResult: e4?.movementResult ?? null,', 'movementResult: null,'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertRuntime(await loadRuntime(mutant, `skill-effect-e4-mutant-${name}`)), undefined, `${name} must be killed`);
}

assertE4LiveWiring(gameSource);
const liveMutations = [
  ['drop target position snapshot', 'position:Object.freeze({x:w.mesh.position.x,z:w.mesh.position.z}),', 'position:null,'],
  ['drop world X clamp', 'THREE.MathUtils.clamp(destination.x,bounds.minX,bounds.maxX)', 'destination.x'],
  ['drop world Z clamp', 'THREE.MathUtils.clamp(destination.z,bounds.minZ,bounds.maxZ)', 'destination.z'],
  ['drop mobility application', 'applyPlannedMobilityEffects(a,move,planned.movementResult,planned.displacementResults,targets)', '0'],
  ['duplicate cooldown on mobility cast', 'a.skillCds[index]=command.startCooldownSec;', 'a.skillCds[index]=command.startCooldownSec;\n  a.skillCds[index]=command.startCooldownSec;'],
  ['disable actor movement', 'if(movementResult?.applied)', 'if(false)'],
  ['keep stale AI decision', 'a.aiDecision=null;', 'void a.aiDecision;'],
  ['reverse displacement order', 'result=displacementResults[index],target=targets[index]', 'result=displacementResults[index],target=targets.at(-1-index)'],
  ['move lethal target', 'target.dead||!target.mesh?.position', 'false'],
  ['bypass wall collision', 'if(fieldBlocksPosition(destination))continue;', 'if(false)continue;'],
  ['disable target displacement', 'target.mesh.position.x=destination.x;target.mesh.position.z=destination.z;', 'void destination;'],
  ['consume Uses during mobility', 'let appliedCount=0;', 'consumeSkillUse();let appliedCount=0;'],
];

for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} live mutation must apply`);
  assert.throws(() => assertE4LiveWiring(mutant), undefined, `${name} live mutation must be killed`);
}

console.log(`V8.2 E4 skill effect mutants: PASS (${runtimeMutations.length + liveMutations.length}/${runtimeMutations.length + liveMutations.length} killed)`);
