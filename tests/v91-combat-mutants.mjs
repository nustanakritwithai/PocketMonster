import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TEST_RNG_SEEDS,
  fixtureAction,
  fixtureCombat,
  fixtureProfile,
  fixtureStatusSnapshot,
  fixtureWorld,
} from './v91-combat-fixtures.mjs';

const sourceUrl = new URL('../combat-v91-rules.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  const encoded = Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

const actorStats = {
  hpMax: 100,
  hpCurrent: 100,
  atk: 40,
  def: 30,
  spAtk: 35,
  spDef: 30,
  spd: 25,
  accuracy: 1,
  crit: 1,
  evasion: 0,
  resistance: 0,
  penetration: 0.9,
};
const targetStats = {
  ...actorStats,
  def: 100,
  crit: 0,
  penetration: 0,
};
const actor = fixtureProfile({
  entityId: 'mutant:actor', ownerDomain: 'Pirate', entityKind: 'Human',
  level: 20, types: ['Fire'], stats: actorStats,
});
const target = fixtureProfile({
  entityId: 'mutant:target', ownerDomain: 'Pocket', entityKind: 'Monster',
  level: 20, types: ['Fire'], stats: targetStats,
});
const action = fixtureAction({
  actionId: 'mutant:action',
  definitionVersion: 'mutant/action-v1',
  channel: 'physical',
  power: 40,
  accuracy: 1,
  element: 'Fire',
  hitCount: 1,
  criticalAllowed: true,
  armorPierce: 0.9,
});
const baseFixture = fixtureCombat({
  combatId: 'mutant:combat',
  actor,
  target,
  action,
  world: fixtureWorld({
    actor,
    target,
    tick: 1,
    seed: TEST_RNG_SEEDS.alpha,
    actorMultipliers: { atk: 0.8 },
    targetMultipliers: { def: 1.1 },
  }),
});
const safeWorld = fixtureWorld({
  actor,
  target,
  tick: 2,
  seed: TEST_RNG_SEEDS.alpha,
  actorMultipliers: { atk: 0.8 },
  targetMultipliers: { def: 1.1 },
  validation: {
    targetExists: true,
    permission: true,
    inRange: true,
    lineOfSight: true,
    safeZone: true,
  },
});

const buffCombatId = 'mutant:status-combat';
const buffActorStatus = fixtureStatusSnapshot({ combatId: buffCombatId, profile: actor });
const buffTargetStatus = fixtureStatusSnapshot({ combatId: buffCombatId, profile: target });
const buffAction = fixtureAction({
  actionId: 'mutant:self-buff',
  definitionVersion: 'mutant/self-buff-v1',
  power: 0,
  statusApplications: [{ linkId: 'SL_0001', target: 'actor' }],
});
const buffWorld = fixtureWorld({
  actor,
  target,
  tick: 3,
  seed: TEST_RNG_SEEDS.beta,
});

function resolve(module, {
  worldSnapshot = baseFixture.world,
  attackerStatusSnapshot = baseFixture.actorStatus,
  targetStatusSnapshot = baseFixture.targetStatus,
} = {}) {
  return module.resolveCombatV91Proposal({
    combatId: baseFixture.combatId,
    actionSequence: 1,
    attacker: actor,
    target,
    action,
    worldSnapshot,
    attackerStatusSnapshot,
    targetStatusSnapshot,
  });
}

function resolveBuff(module) {
  return module.resolveCombatV91Proposal({
    combatId: buffCombatId,
    actionSequence: 1,
    attacker: actor,
    target,
    action: buffAction,
    worldSnapshot: buffWorld,
    attackerStatusSnapshot: buffActorStatus,
    targetStatusSnapshot: buffTargetStatus,
  });
}

function assertRules(module) {
  assert.equal(module.COMBAT_V91_RULES_POLICY.authority, 'deterministic_proposal_only');
  assert.equal(module.COMBAT_V91_RULES_POLICY.sharedPath, 'all_entity_kinds');
  assert.equal(module.COMBAT_V91_RULES_POLICY.stab, 1.2);
  assert.equal(module.COMBAT_V91_RULES_POLICY.criticalMultiplier, 1.5);
  assert.equal(module.COMBAT_V91_RULES_POLICY.varianceMin, 0.9);
  assert.equal(module.COMBAT_V91_RULES_POLICY.maximumCombinedPenetration, 0.95);

  const resolved = resolve(module);
  assert.equal(resolved.ok, true, resolved.reason);
  const proposal = resolved.proposal;
  assert.equal(proposal.committed, false);
  assert.equal(proposal.effectiveActorStats.atk, 32);
  assert.ok(Math.abs(proposal.effectiveDefense - 5.5) < 1e-9);
  assert.equal(proposal.stabMultiplier, 1.2);
  assert.equal(proposal.critical, true);
  assert.equal(proposal.varianceMultiplier, 0.9492365127651381);
  assert.equal(proposal.totalDamage, 41);
  assert.equal(proposal.rngVersion, 'combat-rng/sha256-counter-v1');
  assert.equal(proposal.rngStreamFingerprint,
    '640ceed7068f5ed6888116ee59a0afae96a7d0f41e360d7b93e3b18b52d5bb0e');
  assert.deepEqual(proposal.rngTrace.map(entry => entry.label), ['hit', 'critical', 'variance']);
  assert.equal(proposal.actorStatusFingerprint, baseFixture.actorStatus.fingerprint);
  assert.equal(proposal.targetStatusFingerprint, baseFixture.targetStatus.fingerprint);
  assert.deepEqual(proposal.predictedStatusSnapshots.map(snapshot => snapshot.entityId),
    [actor.entityId, target.entityId]);
  assert.deepEqual(proposal.predictedStatusTransitions.map(transition => transition.changed), [false, false]);

  const mandatory = module.resolveCombatV91Proposal({
    combatId: baseFixture.combatId,
    actionSequence: 1,
    attacker: actor,
    target,
    action,
    worldSnapshot: baseFixture.world,
    targetStatusSnapshot: baseFixture.targetStatus,
  });
  assert.equal(mandatory.reason, 'invalid_attacker_status');
  const safe = resolve(module, { worldSnapshot: safeWorld });
  assert.equal(safe.reason, 'safe_zone');
  assert.equal(safe.rngDraws, 0);

  const buff = resolveBuff(module);
  assert.equal(buff.ok, true, buff.reason);
  assert.equal(buff.proposal.totalDamage, 0);
  assert.equal(buff.proposal.targetStateVersionAfter, target.stateVersion);
  assert.deepEqual(buff.proposal.predictedStatusSnapshots.map(snapshot => snapshot.entityId),
    [actor.entityId, target.entityId]);
  const [actorTransition, targetTransition] = buff.proposal.predictedStatusTransitions;
  assert.equal(actorTransition.changed, true);
  assert.equal(actorTransition.statusStateVersionBefore, 0);
  assert.equal(actorTransition.statusStateVersionAfter, 1);
  assert.equal(actorTransition.statusFingerprintBefore, buffActorStatus.fingerprint);
  assert.equal(actorTransition.statusFingerprintAfter,
    buff.proposal.predictedStatusSnapshots[0].fingerprint);
  assert.equal(actorTransition.attempts.length, 1);
  assert.deepEqual(actorTransition.attempts[0], {
    applicationIndex: 0,
    linkId: 'SL_0001',
    statusId: 'ST_ATK_UP',
    targetEntityId: actor.entityId,
    applied: true,
    reason: null,
    stacksAfter: 1,
    appliedDurationSec: 8,
    removedStatusIds: [],
    interaction: 'Coexist',
  });
  assert.equal(targetTransition.changed, false);
  assert.equal(targetTransition.statusStateVersionAfter, targetTransition.statusStateVersionBefore);
  assert.equal(targetTransition.statusFingerprintAfter, targetTransition.statusFingerprintBefore);
  assert.deepEqual(buff.proposal.predictedStatusApplied,
    [{ statusId: 'ST_ATK_UP', targetEntityId: actor.entityId }]);
  assert.deepEqual(buff.proposal.predictedStatusSnapshots[0].state.statuses
    .map(status => status.statusId), ['ST_ATK_UP']);
}

assertRules(await loadSource(originalSource, 'combat-v91-rules-current'));

const mutations = [
  ['claim runtime authority', "authority: 'deterministic_proposal_only'", "authority: 'client_authority'"],
  ['branch per domain', "sharedPath: 'all_entity_kinds'", "sharedPath: 'per_domain'"],
  ['change STAB', 'stab: 1.2', 'stab: 1'],
  ['change critical multiplier', 'criticalMultiplier: 1.5', 'criticalMultiplier: 2'],
  ['change variance floor', 'varianceMin: 0.9', 'varianceMin: 0.5'],
  ['weaken penetration safety cap', 'maximumCombinedPenetration: 0.95', 'maximumCombinedPenetration: 0.5'],
  ['replace World multiplier with addition', 'values[key] *= worldMultipliers[key]', 'values[key] += worldMultipliers[key]'],
  ['ignore safe zone', 'if (snapshot.validation.safeZone)', 'if (false)'],
  ['claim committed outcome', 'committed: false,', 'committed: true,'],
  [
    'swap physical attack channel',
    "canonicalAction.channel === 'physical' ? actorStats.atk : actorStats.spAtk",
    "canonicalAction.channel === 'special' ? actorStats.atk : actorStats.spAtk",
  ],
  ['ignore Server RNG seed', 'seed: snapshot.rngSeed,', "seed: '0'.repeat(64),"],
  ['unbind RNG from ticket', 'rngTicketId: snapshot.rngTicketId,', "rngTicketId: 'rng:fixed',"],
  ['unbind RNG from action definition', 'actionFingerprint: canonicalAction.fingerprint,', "actionFingerprint: '0'.repeat(64),"],
  ['unbind RNG from World snapshot', 'worldSnapshotFingerprint: snapshot.fingerprint,', "worldSnapshotFingerprint: '0'.repeat(64),"],
  ['hide status transition change', 'changed: plan.changed,', 'changed: false,'],
  [
    'report pre-commit status version',
    'statusStateVersionAfter: plan.after.statusStateVersion,',
    'statusStateVersionAfter: plan.before.statusStateVersion,',
  ],
  ['drop exact status attempts', 'attempts: plan.attempts,', 'attempts: [],'],
  [
    'swap authoritative status snapshot order',
    'Object.freeze([actorStatusPlan.after, targetStatusPlan.after])',
    'Object.freeze([targetStatusPlan.after, actorStatusPlan.after])',
  ],
  [
    'misreport actor status fingerprint',
    'actorStatusFingerprint: actorStatusSnapshot.fingerprint,',
    'actorStatusFingerprint: defenderStatusSnapshot.fingerprint,',
  ],
];

let killed = 0;
for (const [name, from, to] of mutations) {
  const mutant = originalSource.replace(from, to);
  assert.notEqual(mutant, originalSource, `${name} mutation must apply`);
  let survived = true;
  try {
    assertRules(await loadSource(mutant, `combat-v91-mutant-${killed}`));
  } catch {
    survived = false;
  }
  assert.equal(survived, false, `${name} must be killed`);
  killed += 1;
}
assert.equal(killed, mutations.length);

console.log(`V9.1 shared CombatRules mutants: PASS (${killed}/${mutations.length} killed)`);
