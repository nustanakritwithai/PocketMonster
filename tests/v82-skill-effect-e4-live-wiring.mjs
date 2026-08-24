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
    if (parameterDepth === 0) { open = source.indexOf('{', index); break; }
  }
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

function assertDeferredDefeatFinalization(source) {
  const stableIdSource = functionSource(source, 'stableCombatIdCompare');
  const pendingSource = functionSource(source, 'finalizePendingWildDefeat');
  const committedSource = functionSource(source, 'finalizeCommittedWildDefeats');
  const settleSource = functionSource(source, 'settleCommittedSkillBattleTransaction');
  const defeatSnapshots = [];
  const finalize = Function(
    'defeatWild',
    `'use strict';${stableIdSource}${pendingSource}${committedSource};return finalizeCommittedWildDefeats;`,
  )((target, ownerId) => {
    defeatSnapshots.push({ id: target.id, ownerId });
    assert.equal(ownerId, 'owner-a');
    target.dead = true;
  });
  const targets = [
    { id: 'first', hp: 0, dead: false },
    { id: 'second', hp: 0, dead: false },
    { id: 'uncommitted', hp: 0, dead: false },
    { id: 'survivor', hp: 3, dead: false },
  ];
  finalize(targets, [true, true, false, true], 'owner-a');
  assert.deepEqual(defeatSnapshots, [
    { id: 'first', ownerId: 'owner-a' },
    { id: 'second', ownerId: 'owner-a' },
  ], 'multi-target defeat finalization uses stable identity order and explicit reward owner');
  assert.equal(targets[2].dead, false, 'an uncommitted stale lethal plan cannot finalize a target');
  assert.equal(targets[3].dead, false, 'a committed nonlethal target remains alive');

  const swappedOrder = [];
  const finalizeSwapped = Function(
    'defeatWild',
    `'use strict';${stableIdSource}${pendingSource}${committedSource};return finalizeCommittedWildDefeats;`,
  )(target => { swappedOrder.push(target.id); target.dead = true; });
  finalizeSwapped([
    { id: 'second', hp: 0, dead: false },
    { id: 'first', hp: 0, dead: false },
  ], [true, true], 'owner-a');
  assert.deepEqual(swappedOrder, ['first', 'second'],
    'swapping canonical area input cannot change stable defeat/reward order');

  const localeIndependentOrder = [];
  const finalizeLocaleIndependent = Function(
    'defeatWild',
    `'use strict';${stableIdSource}${pendingSource}${committedSource};return finalizeCommittedWildDefeats;`,
  )(target => { localeIndependentOrder.push(target.id); target.dead = true; });
  finalizeLocaleIndependent([
    { id: 'wild-a', hp: 0, dead: false },
    { id: 'wild-Z', hp: 0, dead: false },
  ], [true, true], 'owner-a');
  assert.deepEqual(localeIndependentOrder, ['wild-Z', 'wild-a'],
    'defeat order uses locale-independent stable combat IDs');

  const expectedFailure = new Error('first defeat save failed');
  const finalizedAfterFailure = [];
  const finalizeWithFailure = Function(
    'defeatWild',
    `'use strict';${stableIdSource}${pendingSource}${committedSource};return finalizeCommittedWildDefeats;`,
  )(target => {
    target.dead = true;
    finalizedAfterFailure.push(target.id);
    if (target.id === 'fault-first') throw expectedFailure;
  });
  const faultTargets = [
    { id: 'fault-first', hp: 0, dead: false },
    { id: 'fault-second', hp: 0, dead: false },
  ];
  assert.throws(() => finalizeWithFailure(faultTargets, [true, true], 'owner-a'), error => error === expectedFailure,
    'the first finalization failure is rethrown after deterministic cleanup');
  assert.deepEqual(finalizedAfterFailure, ['fault-first', 'fault-second'],
    'one defeat/save failure cannot leave later committed lethal targets pending');
  assert.deepEqual(faultTargets.map(target => target.dead), [true, true]);

  const loggingFailure = new Error('ledger logging failed');
  let finalizationAttempts = 0;
  const settleAfterLogFailure = Function(
    'logCommittedSkillTargetEvents', 'finalizeCommittedWildDefeats',
    `'use strict';${settleSource};return settleCommittedSkillBattleTransaction;`,
  )(() => { throw loggingFailure; }, () => { finalizationAttempts += 1; });
  assert.throws(() => settleAfterLogFailure([], [], [], 10, 'owner-a', []), error => error === loggingFailure);
  assert.equal(finalizationAttempts, 1, 'ledger failure cannot strand deferred lethal targets');
}

export function assertE4LiveWiring(source) {
  const targets = functionSource(source, 'canonicalSkillEffectTargets');
  const accepted = functionSource(source, 'applyAcceptedSkillCommand');
  const clampDestination = functionSource(source, 'clampSkillEffectDestination');
  const mobility = functionSource(source, 'applyPlannedMobilityEffects');
  const finalizeCommitted = functionSource(source, 'finalizeCommittedWildDefeats');
  const settleTransaction = functionSource(source, 'settleCommittedSkillBattleTransaction');
  assertDeferredDefeatFinalization(source);

  assert.match(targets, /position:Object\.freeze\(\{x:w\.mesh\.position\.x,z:w\.mesh\.position\.z\}\)/,
    'E4 planning receives immutable cast-time target positions');
  assert.match(clampDestination, /ZONES\[state\.currentZone\]\?\.bounds/);
  assert.match(clampDestination, /THREE\.MathUtils\.clamp\(destination\.x,bounds\.minX,bounds\.maxX\)/);
  assert.match(clampDestination, /THREE\.MathUtils\.clamp\(destination\.z,bounds\.minZ,bounds\.maxZ\)/);

  const planAt = accepted.indexOf('const planned=resolveReviewedSkillEffects(');
  const cooldownAt = accepted.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const mobilityAt = accepted.indexOf('applyPlannedMobilityEffects(a,move,planned.movementResult,planned.displacementResults,targets,targetDamageCommitted,actualHitCount)');
  assert.ok(planAt >= 0 && cooldownAt > planAt && mobilityAt > cooldownAt,
    'pure E4 planning precedes the sole cooldown commit and live mobility mutation');
  assert.equal((accepted.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1);
  assert.match(accepted, /mobilityAppliedCount/);
  assert.equal((accepted.match(/deferDefeat:true/g) ?? []).length, 2,
    'both manual single-target and area damage paths defer defeat finalization');
  const receiptAt = accepted.indexOf('receipt=Object.freeze(');
  const finalizationAt = accepted.indexOf('settleCommittedSkillBattleTransaction(targets,targetDamageCommitted,targetCommittedDamage,move.power||10,a.inst.instanceId,contributionEvents)');
  assert.ok(receiptAt >= 0 && finalizationAt > receiptAt,
    'actual logs, actor/field/closure effects, bond, mastery, and receipt commit before defeat/save');
  assert.match(accepted, /\}finally\{[\s\S]*?targetDamageReceipts\.length[\s\S]*?settleCommittedSkillBattleTransaction\(targets,targetDamageCommitted,targetCommittedDamage,move\.power\|\|10,a\.inst\.instanceId,contributionEvents\);\s*\}/,
    'accepted manual skill always closes pending lethal damage, including exceptional paths');
  assert.match(finalizeCommitted, /pending\.sort\(\(left,right\)=>stableCombatIdCompare\(left\.target\.id,right\.target\.id\)/,
    'multi-target defeat finalization uses stable target identity order');
  assert.match(finalizeCommitted, /targetDamageCommitted\[index\]===true/,
    'only successful live damage commits may finalize planned targets');
  assert.match(finalizeCommitted, /catch\(error\)\{if\(!hasFailure\)\{firstFailure=error;hasFailure=true;\}\}/,
    'one target finalization failure cannot strand later committed lethal targets');
  assert.match(finalizeCommitted, /if\(hasFailure\)throw firstFailure/,
    'the first finalization failure is surfaced after deterministic cleanup');
  assert.match(settleTransaction, /try\{logCommittedSkillTargetEvents/);
  assert.match(settleTransaction, /try\{finalizeCommittedWildDefeats/);

  assert.match(mobility, /if\(movementResult\?\.applied&&actualHitCount>0\)/,
    'actor movement requires a successful live target damage commit');
  assert.match(mobility, /a\.mesh\.position\.x=destination\.x;a\.mesh\.position\.z=destination\.z/);
  assert.match(mobility, /a\.aiDecision=null/, 'actor relocation invalidates the stale Basic AI decision');
  assert.match(mobility, /for\(let index=0;index<displacementResults\.length;index\+\+\)/);
  assert.match(mobility, /result=displacementResults\[index\],target=targets\[index\]/,
    'displacement preserves canonical command target order');
  assert.match(mobility, /targetDamageCommitted\[index\]!==true\|\|!result\?\.applied/,
    'displacement cannot replay a stale plan when live damage rejected and reset the target');
  assert.match(mobility, /target\.dead\|\|!\(target\.hp>0\)\|\|!target\.mesh\?\.position/,
    'lethal targets cannot be displaced after damage commits');
  assert.match(mobility, /if\(fieldBlocksPosition\(destination\)\)continue/,
    'wild displacement respects live wall collision');
  assert.match(mobility, /target\.mesh\.position\.x=destination\.x;target\.mesh\.position\.z=destination\.z/);
  assert.equal((mobility.match(/spawnSkillTrail\(/g) ?? []).length, 2);
  assert.doesNotMatch(mobility, /executeEquippedSkillCommand|consumeSkillUse|skillCds|currentUses/,
    'live movement and displacement cannot recommit Uses or Cooldown');
}

const source = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertE4LiveWiring(source);
  console.log('V8.2 E4 live Movement/Displacement wiring: PASS');
}
