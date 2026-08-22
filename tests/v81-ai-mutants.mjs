import assert from 'node:assert/strict';
import fs from 'node:fs';

const SOURCES = Object.freeze({
  catalog: ['ai-profile.mjs', fs.readFileSync(new URL('../ai-profile.mjs', import.meta.url), 'utf8')],
  policy: ['runtime-policies.mjs', fs.readFileSync(new URL('../runtime-policies.mjs', import.meta.url), 'utf8')],
  resolver: ['basic-ai-resolver.mjs', fs.readFileSync(new URL('../basic-ai-resolver.mjs', import.meta.url), 'utf8')],
});

async function loadSource(source, filename, tag) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(relativePath, fileUrl).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function assertCatalogContract(module) {
  const { AI_PROFILE_CATALOG, AI_PROFILE_POLICY, aiProfileEntry, validateAiProfileCatalog } = module;
  assert.equal(AI_PROFILE_CATALOG.length, 18);
  assert.equal(validateAiProfileCatalog(AI_PROFILE_CATALOG).ok, true);
  assert.equal(Object.isFrozen(AI_PROFILE_CATALOG), true);
  assert.ok(AI_PROFILE_CATALOG.every(Object.isFrozen));
  assert.deepEqual(AI_PROFILE_CATALOG.map(profile => [
    profile.runtimeSpeciesId,
    profile.workbookBaseMonsterId,
    profile.workbookStage2MonsterId,
    profile.role,
    profile.preferredRange,
    profile.aiStyle,
  ]), [
    ['normalooze', 'MON_001', 'MON_019', 'Balanced', 'Mid', 'Adaptive'],
    ['flameling', 'MON_002', 'MON_020', 'Burst', 'Mid', 'BurstWindow'],
    ['aquapuff', 'MON_003', 'MON_021', 'Sustain', 'Mid', 'KiteAndRecover'],
    ['voltkit', 'MON_005', 'MON_023', 'Speed', 'Close/Mid', 'HitAndRun'],
    ['mossbun', 'MON_004', 'MON_022', 'Support', 'Back', 'ProtectAndHeal'],
    ['frostowl', 'MON_006', 'MON_024', 'Control', 'Mid', 'ZoneControl'],
    ['punchcub', 'MON_016', 'MON_034', 'Combo', 'Close', 'ChaseCombo'],
    ['toxitoad', 'MON_010', 'MON_028', 'DoT', 'Mid', 'KeepDebuff'],
    ['sandmole', 'MON_008', 'MON_026', 'Bruiser', 'Close', 'Pressure'],
    ['galebird', 'MON_009', 'MON_027', 'Mobility', 'Mid', 'HitAndRun'],
    ['mindcoon', 'MON_013', 'MON_031', 'Control', 'Mid', 'ZoneControl'],
    ['buglet', 'MON_014', 'MON_032', 'Utility', 'Mid', 'Disrupt'],
    ['rockhorn', 'MON_007', 'MON_025', 'Tank', 'Close', 'HoldFront'],
    ['ghostpurr', 'MON_018', 'MON_036', 'Trickster', 'Mid', 'BaitAndBlink'],
    ['emberdrake', 'MON_015', 'MON_033', 'Scaler', 'Mid', 'SafeThenBurst'],
    ['voidhorn', 'MON_011', 'MON_029', 'Assassin', 'Close', 'Flank'],
    ['ironbug', 'MON_017', 'MON_035', 'Tank', 'Close', 'HoldFront'],
    ['fairimp', 'MON_012', 'MON_030', 'Healer', 'Back', 'StayBack'],
  ]);
  assert.deepEqual([
    aiProfileEntry('fairimp').passive1Id,
    aiProfileEntry('fairimp').basePassive2Id,
    aiProfileEntry('fairimp').stage2Passive2Id,
  ], ['PASS_LIGHT_01', null, 'PASS_LIGHT_02']);
  assert.equal(AI_PROFILE_POLICY.profileMetadataOnly, true);
  assert.equal(AI_PROFILE_POLICY.numericStyleWeights, 'not_defined');
  assert.equal(AI_PROFILE_POLICY.skillPriority, 'deferred_AI_Skill_Priority_TODO');
  assert.equal(AI_PROFILE_POLICY.lightRuntimeActivation, 'deferred_D2');

  const wrongRole = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
  wrongRole[0].role = 'Aggressive';
  assert.ok(validateAiProfileCatalog(wrongRole).issues.some(issue => issue.code === 'workbook_ai_metadata_mismatch'));
  const wrongBase = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
  wrongBase[0].workbookBaseMonsterId = 'MON_999';
  assert.ok(validateAiProfileCatalog(wrongBase).issues.some(issue => issue.code === 'workbook_monster_mapping_mismatch'));
  const wrongPassive = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
  wrongPassive[0].stage2Passive2Id = 'PASS_FIRE_02';
  assert.ok(validateAiProfileCatalog(wrongPassive).issues.some(issue => issue.code === 'workbook_passive_mapping_mismatch'));
  const runtimeLeak = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
  runtimeLeak[0].styleWeights = { attack: 1 };
  assert.ok(validateAiProfileCatalog(runtimeLeak).issues.some(issue => issue.code === 'forbidden_ai_runtime_field'));
  const hostile = new Proxy({}, { ownKeys() { throw new Error('hostile catalog'); } });
  assert.doesNotThrow(() => validateAiProfileCatalog([hostile]));
  assert.equal(validateAiProfileCatalog([hostile]).ok, false);
  let arrayReads = 0;
  const masquerade = new Proxy([], {
    get(target, property, receiver) {
      if (property === 'length') {
        arrayReads += 1;
        return 18;
      }
      if (property === 'forEach') {
        arrayReads += 1;
        return callback => AI_PROFILE_CATALOG.forEach(callback);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  assert.equal(validateAiProfileCatalog(masquerade).ok, false);
  assert.equal(arrayReads, 0);
  let profileReads = 0;
  const masked = new Proxy({ ...AI_PROFILE_CATALOG[0], role: 'Aggressive' }, {
    get(_target, property) {
      profileReads += 1;
      return AI_PROFILE_CATALOG[0][property];
    },
  });
  const maskedProfiles = AI_PROFILE_CATALOG.map((profile, index) => index === 0 ? masked : { ...profile });
  assert.ok(validateAiProfileCatalog(maskedProfiles).issues.some(issue => issue.code === 'workbook_ai_metadata_mismatch'));
  assert.equal(profileReads, 0);
}

function assertPolicyContract(module) {
  const policy = module.OWNED_BASIC_AI_POLICY;
  assert.deepEqual(policy.actionTypes, ['idle', 'move', 'basic_attack']);
  assert.equal(policy.acquireRangeM, 9);
  assert.equal(policy.retainRangeM, 12);
  assert.equal(policy.basicAttackRangeM, 1.35);
  assert.equal(policy.basicAttackCooldownSec, 0.9);
  assert.equal(policy.basicAttackPower, 15);
  assert.equal(policy.targetTieBreak, 'distance_then_stable_id');
  assert.equal(policy.commandSource, 'basicAI');
  assert.equal(policy.manualSkillSlots, 'never');
  assert.equal(policy.usesConsumed, 0);
  assert.equal(policy.skillPriority, 'deferred_AI_Skill_Priority_TODO');
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.actionTypes), true);
  assert.equal(module.tickCooldown(0.9, 0.1), 0.8);
}

function assertResolverContract(module) {
  const actor = Object.freeze({
    id: 'owned-1', speciesId: 'normalooze', alive: true,
    position: Object.freeze({ x: 0, z: 0 }),
  });
  const enemy = (id, x, z, extra = {}) => Object.freeze({
    id, alive: true, targetable: true,
    position: Object.freeze({ x, z }),
    ...extra,
  });
  const resolve = overrides => module.resolveOwnedBasicAiAction({
    actor, enemies: [], currentTargetId: null, attackReady: true, ...overrides,
  });

  const tiedInput = Object.freeze([
    enemy('wild-b', 3, 4),
    enemy('wild-a', -3, -4),
  ]);
  const before = JSON.stringify({ actor, tiedInput });
  const tied = resolve({ enemies: tiedInput });
  assert.equal(tied.targetId, 'wild-a');
  assert.equal(tied.action, 'move');
  assert.equal(Object.isFrozen(tied), true);
  assert.equal(Object.isFrozen(tied.direction), true);
  assert.equal(JSON.stringify({ actor, tiedInput }), before);
  assert.equal(resolve({ enemies: [...tiedInput].reverse() }).targetId, 'wild-a');

  assert.equal(resolve({ enemies: [enemy('boundary', 9, 0)] }).targetId, 'boundary');
  assert.equal(resolve({ enemies: [enemy('outside', 9.000001, 0)] }).targetId, null);
  assert.equal(resolve({
    enemies: [enemy('current', 12, 0), enemy('closer', 2, 0)], currentTargetId: 'current',
  }).targetId, 'current');
  assert.equal(resolve({
    enemies: [enemy('current', 12.000001, 0), enemy('closer', 2, 0)], currentTargetId: 'current',
  }).targetId, 'closer');
  assert.equal(resolve({ enemies: [enemy('attack-boundary', 1.35, 0)] }).action, 'basic_attack');
  assert.equal(resolve({ enemies: [enemy('move-boundary', 1.350001, 0)] }).action, 'move');
  assert.equal(resolve({ enemies: [enemy('cooldown', 1, 0)], attackReady: false }).reason, 'basic_attack_cooldown');
  assert.equal(resolve({
    enemies: [enemy('current', 1, 0, { alive: false }), enemy('alternate', 2, 0)], currentTargetId: 'current',
  }).targetId, 'alternate');
  assert.equal(resolve({
    enemies: [enemy('current', 1, 0, { targetable: false }), enemy('alternate', 2, 0)], currentTargetId: 'current',
  }).targetId, 'alternate');
  assert.equal(resolve({ enemies: [enemy('__proto__', 2, 0), enemy('constructor', -2, 0)] }).targetId, '__proto__');

  for (const [overrides, reason] of [
    [{ enemies: [enemy('dupe', 1, 0), enemy('dupe', 2, 0)] }, 'duplicate_target_id'],
    [{ enemies: [enemy(' ', 1, 0)] }, 'invalid_target'],
    [{ enemies: [enemy('nan', Number.NaN, 0)] }, 'invalid_target'],
    [{ enemies: [{ ...enemy('extra', 1, 0), hp: 1 }] }, 'invalid_target'],
    [{ enemies: [enemy('owned-1', 1, 0)] }, 'actor_target_id_collision'],
    [{ actor: { ...actor, speciesId: 'unknown' } }, 'unknown_ai_profile'],
    [{ actor: { ...actor, position: { x: Infinity, z: 0 } } }, 'invalid_actor'],
    [{ extra: true }, 'invalid_request_shape'],
  ]) {
    const result = resolve(overrides);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
  }
  const unavailable = resolve({ actor: { ...actor, alive: false }, enemies: [enemy('near', 1, 0)] });
  assert.equal(unavailable.action, 'idle');
  assert.equal(unavailable.targetId, null);

  for (const speciesId of [
    'normalooze', 'flameling', 'aquapuff', 'voltkit', 'mossbun', 'frostowl',
    'punchcub', 'toxitoad', 'sandmole', 'galebird', 'mindcoon', 'buglet',
    'rockhorn', 'ghostpurr', 'emberdrake', 'voidhorn', 'ironbug', 'fairimp',
  ]) {
    const result = resolve({ actor: { ...actor, speciesId }, enemies: [enemy('geometry', 2, 0)] });
    assert.equal(result.action, 'move');
    assert.equal(result.targetId, 'geometry');
  }

  const explosive = new Proxy({}, { getPrototypeOf() { throw new Error('hostile proxy'); } });
  assert.doesNotThrow(() => module.resolveOwnedBasicAiAction(explosive));
  assert.equal(module.resolveOwnedBasicAiAction(explosive).reason, 'invalid_request_shape');

  let idReads = 0;
  const volatile = new Proxy({
    id: 'descriptor-id', alive: true, targetable: true, position: { x: 1, z: 0 },
  }, {
    get(target, property, receiver) {
      if (property === 'id') {
        idReads += 1;
        return ' ';
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const volatileResult = resolve({ enemies: [volatile] });
  assert.equal(volatileResult.ok, true);
  assert.equal(volatileResult.targetId, 'descriptor-id');
  assert.equal(idReads, 0);
}

assertCatalogContract(await loadSource(SOURCES.catalog[1], SOURCES.catalog[0], 'ai-profile-current'));
assertPolicyContract(await loadSource(SOURCES.policy[1], SOURCES.policy[0], 'ai-policy-current'));
assertResolverContract(await loadSource(SOURCES.resolver[1], SOURCES.resolver[0], 'ai-resolver-current'));

const catalogMutants = [
  ['change workbook metadata', "['normalooze', 'Balanced', 'Mid', 'Adaptive']", "['normalooze', 'Aggressive', 'Mid', 'Adaptive']"],
  ['make metadata behavioral', 'profileMetadataOnly: true', 'profileMetadataOnly: false'],
  ['activate LIGHT at runtime', "lightRuntimeActivation: 'deferred_D2'", "lightRuntimeActivation: 'active'"],
  ['invent Stage1 Passive2', 'basePassive2Id: null', 'basePassive2Id: passiveProfile.passive2Id'],
  ['accept wrong role', 'profile.role !== expectedMetadata.role', 'false'],
  ['accept wrong workbook base ID', 'profile.workbookBaseMonsterId !== mapping.workbookBaseMonsterId', 'false'],
  ['accept wrong passive join', 'profile.stage2Passive2Id !== passiveProfile.passive2Id', 'false'],
  ['hide forbidden runtime fields', '} else if (FORBIDDEN_AI_RUNTIME_FIELDS.has(key)) {', '} else if (false && FORBIDDEN_AI_RUNTIME_FIELDS.has(key)) {'],
  ['leave profile records mutable', 'return Object.freeze({\n    runtimeSpeciesId,', 'return ({\n    runtimeSpeciesId,'],
  ['throw on hostile catalog', "  } catch {\n    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });\n  }", '  } catch (error) {\n    throw error;\n  }'],
  ['trust caller array methods', 'const profiles = dataArraySnapshot(records);', 'const profiles = [];\n  records.forEach((profile, index) => { profiles[index] = profile; });\n  Object.freeze(profiles);'],
  ['re-read masked profile values', 'const profile = inspected.values;', 'const profile = profiles[index];'],
];

const policyMutants = [
  ['change acquire range', 'acquireRangeM: 9,', 'acquireRangeM: 90,'],
  ['change retain range', 'retainRangeM: 12,', 'retainRangeM: 2,'],
  ['change Basic range', 'basicAttackRangeM: 1.35,', 'basicAttackRangeM: 13.5,'],
  ['change Basic cooldown', 'basicAttackCooldownSec: 0.9,', 'basicAttackCooldownSec: 0.1,'],
  ['change Basic power', 'basicAttackPower: 15,', 'basicAttackPower: 16,'],
  ['add manual action', "actionTypes: Object.freeze(['idle', 'move', 'basic_attack'])", "actionTypes: Object.freeze(['idle', 'move', 'basic_attack', 'skill'])"],
  ['make action list mutable', "actionTypes: Object.freeze(['idle', 'move', 'basic_attack'])", "actionTypes: ['idle', 'move', 'basic_attack']"],
  ['cross manual command source', "commandSource: 'basicAI'", "commandSource: 's1'"],
  ['claim manual slots', "manualSkillSlots: 'never'", "manualSkillSlots: 's1-s4'"],
  ['consume Uses', 'usesConsumed: 0,', 'usesConsumed: 1,'],
  ['invent skill priority', "skillPriority: 'deferred_AI_Skill_Priority_TODO'", "skillPriority: 'highest_power'"],
];

const resolverMutants = [
  ['allow padded ID', 'value.trim() === value', 'value.trim().length >= 0'],
  ['exclude exact acquire boundary', 'distanceM > OWNED_BASIC_AI_POLICY.acquireRangeM', 'distanceM >= OWNED_BASIC_AI_POLICY.acquireRangeM'],
  ['remove stable tie break', '(distanceM === selectedDistance && selected && stableIdCompare(candidate.id, selected.id) < 0)', 'false'],
  ['exclude exact retain boundary', 'currentDistance <= OWNED_BASIC_AI_POLICY.retainRangeM', 'currentDistance < OWNED_BASIC_AI_POLICY.retainRangeM'],
  ['exclude exact Basic boundary', 'distanceM > OWNED_BASIC_AI_POLICY.basicAttackRangeM', 'distanceM >= OWNED_BASIC_AI_POLICY.basicAttackRangeM'],
  ['attack during cooldown', 'if (!request.attackReady) {', 'if (false) {'],
  ['target dead enemy', 'if (!candidate.alive || !candidate.targetable) continue;', 'if (false || !candidate.targetable) continue;'],
  ['target untargetable enemy', 'if (!candidate.alive || !candidate.targetable) continue;', 'if (!candidate.alive || false) continue;'],
  ['allow duplicate target IDs', 'if (byId.has(candidate.id)) return failure(\'duplicate_target_id\');', 'if (false) return failure(\'duplicate_target_id\');'],
  ['allow actor target collision', 'if (candidate.id === actor.id) return failure(\'actor_target_id_collision\');', 'if (false) return failure(\'actor_target_id_collision\');'],
  ['allow extra data fields', "if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return null;", 'if (false) return null;'],
  ['ignore unavailable actor', 'if (!actor.alive) {', 'if (false) {'],
  ['allow unknown profile', "if (!profile) return failure('unknown_ai_profile');", "if (false) return failure('unknown_ai_profile');"],
  ['treat NaN as valid number', 'Number.isFinite(position.x)', "typeof position.x === 'number'"],
  ['make Style behavioral', 'if (!actor.alive) {', "if (profile.aiStyle === 'HoldFront') return validDecision({ reason: 'style', targetId: null, distanceM: null, profile });\n  if (!actor.alive) {"],
  ['re-read volatile candidate ID', 'id: candidateRecord.id,', 'id: candidateInput.id,'],
  ['emit manual skill action', "extra: { action: 'basic_attack' }", "extra: { action: 'skill' }"],
  ['throw on hostile input', "} catch {\n    return failure('invalid_request_shape');\n  }", '} catch (error) {\n    throw error;\n  }'],
];

let killed = 0;
for (const [sourceKey, mutants, contract] of [
  ['catalog', catalogMutants, assertCatalogContract],
  ['policy', policyMutants, assertPolicyContract],
  ['resolver', resolverMutants, assertResolverContract],
]) {
  const [filename, original] = SOURCES[sourceKey];
  for (const [name, before, after] of mutants) {
    const mutant = original.replace(before, after);
    assert.notEqual(mutant, original, `${name} mutation target must exist`);
    try {
      contract(await loadSource(mutant, filename, `ai-${sourceKey}-mutant-${killed}`));
    } catch {
      killed += 1;
      continue;
    }
    assert.fail(`${name} mutant survived`);
  }
}

const total = catalogMutants.length + policyMutants.length + resolverMutants.length;
assert.equal(killed, total);
console.log(`V8.1 A35 AI catalog/resolver mutants: PASS (${killed}/${total} killed)`);
