import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEncounterStatusState } from '../status-lifecycle.mjs';
import { assertE3LiveWiring } from './v82-skill-effect-e3-live-wiring.mjs';

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
    id, level: 30, types: ['Ice'], position: { x: 0, z: 0 }, stats: { ATK: 100, SPATK: 100 }, hp: 150, maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: `owned:${id}`, nowSec: 0 }), critChancePct: 5,
    ...overrides,
  };
}

function wallCommand(overrides = {}) {
  return {
    ok: true, commandId: 'wall', castId: 'wall', skillId: 'SK_ICE_04', targetKind: 'GroundPoint', targetIds: [],
    targetPoint: { x: 3, z: 4 }, rangeM: 5, radiusM: 0, ...overrides,
  };
}

function assertRuntime(module) {
  assert.deepEqual(module.E3_READY_SKILL_IDS, ['SK_ICE_04', 'SK_ROCK_05']);
  assert.equal(module.REVIEWED_SKILL_EFFECT_IDS.length, 108);
  assert.equal(module.E3_FIELD_EFFECT_POLICY.wallDurationSec, 5);
  assert.equal(module.E3_FIELD_EFFECT_POLICY.wallLengthM, 3);
  assert.equal(module.E3_FIELD_EFFECT_POLICY.wallThicknessM, 0.6);
  assert.equal(module.E3_FIELD_EFFECT_POLICY.hazardDurationSec, 4);
  assert.equal(module.E3_FIELD_EFFECT_POLICY.hazardTickIntervalSec, 1);
  assert.equal(module.E3_FIELD_EFFECT_POLICY.hazardTickDamageRatio, 0.2);
  assert.equal(module.E3_FIELD_EFFECT_POLICY.magnitudeSource, 'runtime_fallback_workbook_mechanic_without_duration_or_tick_magnitude');

  const wall = module.resolveE3SkillEffects({ command: wallCommand(), attacker: actor() });
  assert.equal(wall.ok, true);
  assert.equal(wall.fieldResult.fieldId, 'field:wall');
  assert.deepEqual(wall.fieldResult.center, { x: 3, z: 4 });
  assert.deepEqual(wall.fieldResult.normal, { x: 0.6, z: 0.8 });
  assert.deepEqual(wall.fieldResult.tangent, { x: -0.8, z: 0.6 });
  assert.equal(wall.fieldResult.lengthM, 3);
  assert.equal(wall.fieldResult.thicknessM, 0.6);

  assert.equal(module.validateE3SkillEffectRequest({
    command: wallCommand({ castId: '', commandId: '' }), attacker: actor(),
  }).reason, 'invalid_cast_id');
  assert.equal(module.validateE3SkillEffectRequest({
    command: wallCommand({ targetPoint: null }), attacker: actor(),
  }).reason, 'invalid_target_point');

  const rockActor = actor({ id: 'rock', types: ['Rock'] });
  const target = {
    id: 'enemy', level: 30, types: ['Normal'], stats: { DEF: 100, SPDEF: 100 }, hp: 200, maxHp: 200,
    statusState: createEncounterStatusState({ encounterId: 'enemy', nowSec: 0 }), nowSec: 0,
  };
  const command = {
    ok: true, commandId: 'rock', castId: 'rock', skillId: 'SK_ROCK_05', targetKind: 'EnemyArea', targetIds: ['enemy'],
    targetPoint: { x: 2, z: 0 }, radiusM: 3.5, rangeM: 7.5,
  };
  const rock = module.resolveReviewedSkillEffects({ command, attacker: rockActor, targets: [target], nowSec: 0 }, { rng: sequence(0, 0.5) });
  assert.equal(rock.ok, true);
  assert.ok(rock.totalDamage > 0);
  assert.equal(rock.fieldResult.kind, 'hazard');
  assert.equal(rock.fieldResult.radiusM, 3.5);
  assert.deepEqual(rock.activeComponentKinds, ['direct_damage', 'field']);
  assert.deepEqual(rock.deferredComponentKinds, []);
}

assertRuntime(await loadRuntime(runtimeSource, 'skill-effect-e3-current'));

const runtimeMutations = [
  ['drop E3 coverage', "component.slice === 'E3_GROUND_POINT_FIELD'", "component.slice === 'E4_MOVEMENT_DISPLACEMENT'"],
  ['drop E3 cumulative readiness', '|| E3_READY_SKILLS.has(row.skillId)', '|| false'],
  ['change wall duration', 'wallDurationSec: 5,', 'wallDurationSec: 4,'],
  ['change wall length', 'wallLengthM: 3,', 'wallLengthM: 2,'],
  ['change wall thickness', 'wallThicknessM: 0.6,', 'wallThicknessM: 0.2,'],
  ['change hazard duration', 'hazardDurationSec: 4,', 'hazardDurationSec: 3,'],
  ['change hazard tick interval', 'hazardTickIntervalSec: 1,', 'hazardTickIntervalSec: 2,'],
  ['change hazard damage ratio', 'hazardTickDamageRatio: 0.2,', 'hazardTickDamageRatio: 1,'],
  ['hide field fallback provenance', "magnitudeSource: 'runtime_fallback_workbook_mechanic_without_duration_or_tick_magnitude',", "magnitudeSource: 'workbook_exact',"],
  ['accept empty cast id', "if (typeof (command.castId ?? command.commandId) !== 'string'\n    || (command.castId ?? command.commandId).length === 0) return 'invalid_cast_id';", "if (false) return 'invalid_cast_id';"],
  ['accept missing target point', "if (!validFieldPoint(command.targetPoint)) return 'invalid_target_point';", "if (false) return 'invalid_target_point';"],
  ['swap wall normal axes', 'Object.freeze({ x: dx / length, z: dz / length })', 'Object.freeze({ x: dz / length, z: dx / length })'],
  ['break wall tangent', 'Object.freeze({ x: -normal.z, z: normal.x })', 'Object.freeze({ x: normal.x, z: normal.z })'],
  ['discard hazard radius', 'radiusM: command.radiusM,', 'radiusM: 1,'],
  ['skip E3 generic resolution', 'if (E3_READY_SKILLS.has(skillId)) {\n    e3 = resolveE3SkillEffects', 'if (false) {\n    e3 = resolveE3SkillEffects'],
  ['leave field component deferred', '|| component.slice === E3_FIELD_EFFECT_POLICY.phase;', '|| false;'],
];

for (const [name, from, to] of runtimeMutations) {
  const mutant = runtimeSource.replace(from, to);
  assert.notEqual(mutant, runtimeSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertRuntime(await loadRuntime(mutant, `skill-effect-e3-mutant-${name}`)), undefined, `${name} must be killed`);
}

assertE3LiveWiring(gameSource);
const liveMutations = [
  ['drop field activation', 'activateSkillField(a,move,planned.fieldResult);', 'void planned.fieldResult;'],
  ['route GroundPoint through enemy area', "else if(command.targetKind==='GroundPoint')", 'else if(false)'],
  ['reuse shared wall geometry', 'new THREE.BoxGeometry(fieldResult.lengthM,1.8,fieldResult.thicknessM)', 'boxGeometry(fieldResult.lengthM,1.8,fieldResult.thicknessM)'],
  ['drop cast-time attacker snapshot', 'attacker:canonicalSkillEffectAttacker(a,move),\n    attackerNowSec', 'attacker:null,\n    attackerNowSec'],
  ['bypass wall collision', 'if(fieldBlocksPosition(next))return false;', 'if(false)return false;'],
  ['remove one wild collision path', 'moving=moveWildWithFieldCollision(w,w.dir,dt*.9);', 'w.mesh.position.addScaledVector(w.dir,dt*.9);'],
  ['tick targets outside hazard', 'distXZ(field.center,w.mesh.position)>field.radiusM', 'false'],
  ['bypass canonical hazard damage', 'const resolved=resolveWorkbookDirectDamage(', 'const resolved=mutantWorkbookDirectDamage('],
  ['drop hazard damage ratio', 'Math.round(resolved.damage*field.tickDamageRatio)', 'Math.round(resolved.damage)'],
  ['stop hazard cadence advance', 'field.nextTickSec+=field.tickIntervalSec;', 'field.nextTickSec=Infinity;'],
  ['consume Uses on hazard tick', 'const damage=Math.max(1,', 'consumeSkillUse();const damage=Math.max(1,'],
  ['leave fields across zone change', 'clearSkillFields();', 'void liveSkillFields;'],
  ['stop live field loop', 'updateSkillFields(dt);', 'void dt;'],
  ['duplicate cooldown on field cast', 'a.skillCds[index]=command.startCooldownSec;', 'a.skillCds[index]=command.startCooldownSec;\n  a.skillCds[index]=command.startCooldownSec;'],
];

for (const [name, from, to] of liveMutations) {
  const mutant = gameSource.replace(from, to);
  assert.notEqual(mutant, gameSource, `${name} live mutation must apply`);
  assert.throws(() => assertE3LiveWiring(mutant), undefined, `${name} live mutation must be killed`);
}

console.log(`V8.2 E3 skill effect mutants: PASS (${runtimeMutations.length + liveMutations.length}/${runtimeMutations.length + liveMutations.length} killed)`);
