import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const parameters = source.indexOf('(', start);
  let parameterDepth = 0;
  let open = -1;
  for (let index = parameters; index < source.length; index += 1) {
    if (source[index] === '(') parameterDepth += 1;
    else if (source[index] === ')') parameterDepth -= 1;
    if (parameterDepth === 0) {
      open = source.indexOf('{', index);
      break;
    }
  }
  assert.ok(open >= 0, `${name} must have a body`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

function materializerFromSource(gameSource, wilds) {
  const source = functionSource(gameSource, 'materializeOwnedBasicAiTarget');
  return Function(
    'wilds',
    'distXZ',
    'OWNED_BASIC_AI_POLICY',
    `'use strict';${source};return materializeOwnedBasicAiTarget;`,
  )(
    wilds,
    (left, right) => Math.hypot(right.x - left.x, right.z - left.z),
    Object.freeze({ retainRangeM: 12, basicAttackRangeM: 1.35 }),
  );
}

function enemySnapshotsFromSource(gameSource, wilds) {
  const source = functionSource(gameSource, 'ownedBasicAiEnemySnapshots');
  return Function('wilds', `'use strict';${source};return ownedBasicAiEnemySnapshots;`)(wilds);
}

function monsterDamageFromSource(gameSource, forgedSkill, calls = { count: 0 }) {
  const source = functionSource(gameSource, 'monsterDamage');
  return Function(
    'monsterTypes',
    'wildTypes',
    'typeEffectiveness',
    'getSkill',
    'masteryRawPower',
    'derivedStats',
    'instanceCombatBuildSafe',
    'liveMoveDamage',
    'spById',
    `'use strict';${source};return monsterDamage;`,
  )(
    () => ['Normal'],
    () => ['Normal'],
    () => 1,
    (_instance, skillId) => {
      calls.count += 1;
      return skillId === forgedSkill.skillId ? forgedSkill : null;
    },
    rank => rank === 'master' ? 0.11 : 0,
    () => ({ critRate: 0, critDamage: 1.5 }),
    () => ({}),
    input => Object.freeze({ ...input }),
    Object.freeze({ normalooze: Object.freeze({ base: Object.freeze({ atk: 10 }) }) }),
  );
}

export function assertBasicAiLiveWiring(gameSource) {
  const updateOwned = functionSource(gameSource, 'updateOwned');
  assert.match(gameSource, /resolveOwnedBasicAiAction/);
  assert.match(gameSource, /function ownedBasicAiActorSnapshot\(/);
  assert.match(gameSource, /function ownedBasicAiEnemySnapshots\(/);
  assert.match(gameSource, /function materializeOwnedBasicAiTarget\(/);
  assert.match(gameSource, /alive:wild\?\.dead===false&&Number\.isFinite\(wild\?\.hp\)&&wild\.hp>0/);
  assert.match(gameSource, /targetable:wild\?\.capturing===undefined\|\|wild\.capturing===false/);
  assert.match(gameSource, /matches\.length!==1/);
  assert.match(gameSource, /target\.dead!==false/);
  assert.match(gameSource, /!\(target\.capturing===undefined\|\|target\.capturing===false\)/);
  assert.match(gameSource, /target\.hp\)|target\.hp<=0/);
  assert.match(updateOwned, /resolveOwnedBasicAiAction\(/);
  assert.match(updateOwned, /attackReady:a\.attackCd<=0/);
  assert.equal((updateOwned.match(/tickCooldown\(a\.attackCd,dt\)/g) ?? []).length, 1,
    'Basic attack cooldown ticks exactly once per frame');
  assert.match(updateOwned, /a\.attackCd=tickCooldown\(a\.attackCd,dt\);/);
  assert.doesNotMatch(updateOwned, /tickCooldown\(tickCooldown/);
  assert.doesNotMatch(updateOwned, /nearestWild\(/, 'owned AI no longer uses order-dependent legacy targeting');

  for (const forbidden of [
    'useSkill(',
    'dispatchSkill(',
    'executeEquippedSkillCommand(',
    'consumeSkillUse(',
    'currentUses',
    'skillId',
    '.skills',
  ]) {
    assert.equal(updateOwned.includes(forbidden), false, `Basic AI must not cross manual skill boundary: ${forbidden}`);
  }
  assert.match(updateOwned, /name:'Basic Attack'/);
  assert.match(updateOwned, /power:OWNED_BASIC_AI_POLICY\.basicAttackPower/);
  assert.match(updateOwned, /commandSource:OWNED_BASIC_AI_POLICY\.commandSource/);
  assert.match(updateOwned, /allowSkillMastery:false/);
  assert.match(updateOwned, /decision\.action==='basic_attack'/);
  assert.match(updateOwned, /decision\.action==='basic_attack'&&a\.attackCd<=0/,
    'live Basic branch rechecks cooldown after resolving');
  assert.match(updateOwned, /decision\.action==='move'/);
  assert.equal((updateOwned.match(/materializeOwnedBasicAiTarget\(a,decision\)/g) ?? []).length, 2,
    'target is materialized once after resolve and again immediately before Basic damage');
  const cooldownCommit = updateOwned.indexOf('a.attackCd=OWNED_BASIC_AI_POLICY.basicAttackCooldownSec');
  assert.ok(cooldownCommit >= 0, 'accepted Basic attack commits its cooldown');
  assert.ok(cooldownCommit < updateOwned.indexOf('triggerMonsterAction('),
    'cooldown commits before the first Basic side effect');
  assert.ok(cooldownCommit < updateOwned.indexOf('monsterDamage('),
    'cooldown commits before Basic damage');

  const monsterDamageSource = functionSource(gameSource, 'monsterDamage');
  assert.match(monsterDamageSource, /allowSkillMastery=true/);
  assert.match(monsterDamageSource, /allowSkillMastery\?\(getSkill/);

  const actor = Object.freeze({ mesh: Object.freeze({ position: Object.freeze({ x: 0, z: 0 }) }) });
  const decision = Object.freeze({ ok: true, action: 'basic_attack', targetId: 'wild-1' });
  const world = overrides => ({
    id: 'wild-1', dead: false, hp: 10, capturing: false,
    mesh: { position: { x: 1, z: 0 } },
    ...overrides,
  });
  const valid = world();
  const snapshots = enemySnapshotsFromSource(gameSource, [
    { id: 'normal', dead: false, hp: 10, mesh: { position: { x: 1, z: 0 } } },
    { id: 'hp-zero', dead: false, hp: 0, mesh: { position: { x: 2, z: 0 } } },
  ])();
  assert.equal(snapshots.length, 2, 'malformed or unavailable world records are not silently filtered');
  assert.equal(snapshots[0].alive, true);
  assert.equal(snapshots[0].targetable, true, 'undefined capturing is the normal targetable state');
  assert.equal(snapshots[1].alive, false, 'zero-HP world records are not eligible');
  assert.equal(Object.isFrozen(snapshots), true);
  assert.ok(snapshots.every(snapshot => Object.isFrozen(snapshot) && Object.isFrozen(snapshot.position)));
  for (const malformed of [
    { dead: 1 },
    { dead: 'yes' },
    { capturing: 1 },
    { capturing: 'active' },
    { capturing: null },
  ]) {
    const [snapshot] = enemySnapshotsFromSource(gameSource, [world(malformed)])();
    if (Object.prototype.hasOwnProperty.call(malformed, 'dead')) assert.equal(snapshot.alive, false);
    else assert.equal(snapshot.targetable, false);
  }

  assert.equal(materializerFromSource(gameSource, [valid])(actor, decision), valid);
  for (const wilds of [
    [world({ dead: true })],
    [world({ dead: 1 })],
    [world({ dead: 'yes' })],
    [world({ hp: 0 })],
    [world({ capturing: true })],
    [world({ capturing: 1 })],
    [world({ capturing: 'active' })],
    [world({ capturing: null })],
    [world({ mesh: null })],
    [world({ mesh: { position: { x: Number.NaN, z: 0 } } })],
    [world({ id: 'changed-id' })],
    [],
    [world(), world()],
    [world({ mesh: { position: { x: 13, z: 0 } } })],
    [world({ mesh: { position: { x: 1.36, z: 0 } } })],
  ]) {
    assert.equal(materializerFromSource(gameSource, wilds)(actor, decision), null,
      'post-resolution target mutation fails closed');
  }
  assert.equal(materializerFromSource(gameSource, [world({ id: 'alternate' })])(actor, decision), null,
    'materialization never substitutes another valid target');
  assert.equal(materializerFromSource(gameSource, [world()])(
    { mesh: { position: { x: Number.NaN, z: 0 } } },
    decision,
  ), null, 'non-finite live actor position fails closed');

  const actorSnapshotSource = functionSource(gameSource, 'ownedBasicAiActorSnapshot');
  const actorSnapshot = Function(`'use strict';${actorSnapshotSource};return ownedBasicAiActorSnapshot;`)();
  for (const fainted of [1, 'true', null]) {
    assert.equal(actorSnapshot({
      inst: { instanceId: 'owned', speciesId: 'normalooze', fainted, hp: 10 },
      mesh: { position: { x: 0, z: 0 } },
    }).alive, false, 'malformed fainted state fails closed');
  }

  const retainedMove = world({ mesh: { position: { x: 12, z: 0 } } });
  const moveDecision = Object.freeze({ ok: true, action: 'move', targetId: 'wild-1' });
  assert.equal(materializerFromSource(gameSource, [retainedMove])(actor, moveDecision), retainedMove);
  assert.equal(materializerFromSource(gameSource, [
    world({ mesh: { position: { x: 12.000001, z: 0 } } }),
  ])(actor, moveDecision), null, 'move target is rechecked against retain distance');

  const forgedSkill = { skillId: 'Basic Attack', slot: 's1', masteryRank: 'master', currentUses: 0 };
  const before = structuredClone(forgedSkill);
  const calls = { count: 0 };
  const damage = monsterDamageFromSource(gameSource, forgedSkill, calls);
  const attacker = { speciesId: 'normalooze', atk: 10, level: 1 };
  const defender = { def: 10, level: 1 };
  const basic = { name: 'Basic Attack', type: 'Normal', power: 15 };
  assert.equal(damage(attacker, basic, defender).masteryPower, 0.11,
    'manual compatibility path still recognizes legacy name-based mastery');
  const manualLookupCalls = calls.count;
  assert.equal(damage(attacker, basic, defender, 1, { allowSkillMastery: false }).masteryPower, 0,
    'basicAI explicitly excludes manual mastery');
  assert.equal(calls.count, manualLookupCalls, 'basicAI does not query the manual skill collection');
  assert.deepEqual(forgedSkill, before, 'basicAI damage does not consume or mutate manual Uses');

  const canonical = { skillId: 'SK_NORMAL_01', slot: 's1', masteryRank: 'master', currentUses: 3 };
  const canonicalBefore = structuredClone(canonical);
  const manualDamage = monsterDamageFromSource(gameSource, canonical);
  assert.equal(manualDamage(attacker, {
    skillId: 'SK_NORMAL_01', name: 'Manual Strike', type: 'Normal', power: 15,
  }, defender).masteryPower, 0.11, 'manual skill mastery path remains active');
  assert.deepEqual(canonical, canonicalBefore);
}

const gameSource = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertBasicAiLiveWiring(gameSource);
  console.log('V8.1 A35 live Basic AI wiring: PASS');
}
