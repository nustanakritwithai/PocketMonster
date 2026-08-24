import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertBasicAiLiveWiring } from './v81-basic-ai-live-wiring.mjs';

const original = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');

function mutate(before, after) {
  assert.ok(original.includes(before), `live mutation target drifted: ${before}`);
  return original.replace(before, after);
}

function replaceNth(source, before, after, occurrence) {
  let from = 0;
  let index = -1;
  for (let count = 0; count < occurrence; count += 1) {
    index = source.indexOf(before, from);
    assert.ok(index >= 0, `live mutation occurrence ${occurrence} drifted: ${before}`);
    from = index + before.length;
  }
  return `${source.slice(0, index)}${after}${source.slice(index + before.length)}`;
}

function moveOwnedCooldownAfterFirstSideEffect() {
  const cooldown = 'a.attackCd=OWNED_BASIC_AI_POLICY.basicAttackCooldownSec;';
  const sideEffect = "runBestEffortCombatPresentation(()=>triggerMonsterAction(a.mesh,'attack',0.22));";
  const withoutCooldown = mutate(cooldown, '');
  assert.ok(withoutCooldown.includes(sideEffect), 'owned Basic side-effect target drifted');
  return withoutCooldown.replace(
    sideEffect,
    `${sideEffect}${cooldown}`,
  );
}

const materializeCall = 'materializeOwnedBasicAiTarget(a,decision)';
const mutants = [
  ['snapshot accepts malformed dead state', mutate(
    'target.alive=wild?.dead===false&&Number.isFinite(wild?.hp)&&wild.hp>0',
    'target.alive=wild?.dead!==true&&Number.isFinite(wild?.hp)&&wild.hp>0',
  )],
  ['snapshot accepts HP-zero target', mutate(
    'target.alive=wild?.dead===false&&Number.isFinite(wild?.hp)&&wild.hp>0',
    'target.alive=wild?.dead===false',
  )],
  ['snapshot accepts malformed capturing state', mutate(
    'target.targetable=(wild?.capturing===undefined||wild.capturing===false)&&isWildDamageReady(wild);',
    'target.targetable=wild?.capturing!==true;',
  )],
  ['snapshot bypasses damage readiness', mutate(
    'target.targetable=(wild?.capturing===undefined||wild.capturing===false)&&isWildDamageReady(wild);',
    'target.targetable=(wild?.capturing===undefined||wild.capturing===false);',
  )],
  ['snapshot accepts malformed fainted actor', mutate(
    'actor.alive=(a?.inst?.fainted===undefined||a.inst.fainted===false)&&Number.isFinite(a?.inst?.hp)&&a.inst.hp>0',
    'actor.alive=a?.inst?.fainted!==true&&Number.isFinite(a?.inst?.hp)&&a.inst.hp>0',
  )],
  ['materialize duplicate target', mutate('if(matchCount!==1)return null;', 'if(matchCount===0)return null;')],
  ['materialize malformed dead target', mutate('target.dead!==false||', 'target.dead===true||')],
  ['materialize HP-zero target', mutate('!Number.isFinite(target.hp)||target.hp<=0', 'false')],
  ['materialize malformed capturing target', mutate(
    '!(target.capturing===undefined||target.capturing===false)',
    'target.capturing===true',
  )],
  ['materialize bypasses damage readiness', mutate(
    '||!isWildDamageReady(target)',
    '||false',
  )],
  ['materialize non-finite actor', mutate(
    '||!Number.isFinite(actorPosition?.x)||!Number.isFinite(actorPosition?.z)',
    '||false||false',
  ).replace('if(!Number.isFinite(distanceM)||', 'if(false||')],
  ['materialize non-finite target', mutate(
    '||!Number.isFinite(targetPosition?.x)||!Number.isFinite(targetPosition?.z)',
    '||false||false',
  ).replace('if(!Number.isFinite(distanceM)||', 'if(false||')],
  ['ignore retain distance', mutate(
    'distanceM>OWNED_BASIC_AI_POLICY.retainRangeM',
    'distanceM>999',
  )],
  ['ignore Basic distance recheck', mutate(
    "decision.action==='basic_attack'&&distanceM>OWNED_BASIC_AI_POLICY.basicAttackRangeM",
    "decision.action==='basic_attack'&&distanceM>999",
  )],
  ['remove pre-damage rematerialization', replaceNth(original, materializeCall, 't', 2)],
  ['remove live cooldown recheck', mutate(
    "decision.action==='basic_attack'&&a.attackCd<=0",
    "decision.action==='basic_attack'",
  )],
  ['remove Basic cooldown commit', mutate(
    'a.attackCd=OWNED_BASIC_AI_POLICY.basicAttackCooldownSec;',
    '',
  )],
  ['commit cooldown after first side effect', moveOwnedCooldownAfterFirstSideEffect()],
  ['cross legacy nearest targeting', mutate(
    'const t=materializeOwnedBasicAiTarget(a,decision);',
    'const t=nearestWild(9,a.mesh.position);',
  )],
  ['call manual skill boundary', mutate(
    'a.aiDecision=resolveOwnedBasicAiAction(',
    'useSkill(0);a.aiDecision=resolveOwnedBasicAiAction(',
  )],
  ['allow manual mastery in Basic call', mutate(
    '{allowSkillMastery:false,critBonusPct}',
    '{allowSkillMastery:true,critBonusPct}',
  )],
  ['restore unconditional mastery lookup', mutate(
    'const skillRec=allowSkillMastery?(getSkill(attackerInst,move.skillId)||getSkill(attackerInst,move.name)||getSkill(attackerInst,move.name?.split(\' • \')[0])):null;',
    'const skillRec=getSkill(attackerInst,move.skillId)||getSkill(attackerInst,move.name)||getSkill(attackerInst,move.name?.split(\' • \')[0]);',
  )],
  ['double-tick Basic cooldown', mutate(
    'a.attackCd=tickCooldown(a.attackCd,cooldownElapsed);',
    'a.attackCd=tickCooldown(tickCooldown(a.attackCd,cooldownElapsed),cooldownElapsed);',
  )],
  ['change Basic power source', mutate(
    'power:OWNED_BASIC_AI_POLICY.basicAttackPower',
    'power:16',
  )],
  ['change Basic command source', mutate(
    'commandSource:OWNED_BASIC_AI_POLICY.commandSource',
    "commandSource:'s1'",
  )],
];

let killed = 0;
for (const [name, source] of mutants) {
  try {
    assertBasicAiLiveWiring(source);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutants.length);
console.log(`V8.1 A35 live Basic AI mutants: PASS (${killed}/${mutants.length} killed)`);
