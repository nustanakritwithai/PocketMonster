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
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced body`);
}

export function assertE2LiveWiring(source) {
  const catalogSkills = functionSource(source, 'canonicalCombatSkills');
  const spawnOwned = functionSource(source, 'spawnOwned');
  const recall = functionSource(source, 'recall');
  const faint = functionSource(source, 'faintActive');
  const request = functionSource(source, 'canonicalSkillEffectRequest');
  const readiness = functionSource(source, 'canApplyLiveSkill');
  const actorApply = functionSource(source, 'applyPlannedActorEffect');
  const acceptedApply = functionSource(source, 'applyAcceptedSkillCommand');
  const updateOwned = functionSource(source, 'updateOwned');
  const wildDamage = functionSource(source, 'wildDamage');
  const updateWild = functionSource(source, 'updateWild');

  assert.match(catalogSkills, /effectAvailable:canExecuteReviewedSkillEffect\(definition\.id\)/);
  assert.match(spawnOwned, /statusState:createEncounterStatusState\(\{encounterId:`owned:\$\{inst\.instanceId\}`,nowSec:0\}\)/,
    'owned encounter creates canonical actor status state');
  assert.match(recall, /endEncounterEffects\(activeSummon\.statusState/,
    'Recall clears all actor encounter statuses');
  assert.match(faint, /endEncounterEffects\(activeSummon\.statusState/,
    'Faint clears all actor encounter statuses');

  assert.match(request, /targets:command\.targetKind==='Self'\?Object\.freeze\(\[\]\):canonicalSkillEffectTargets\(materialized\)/,
    'Self requests cannot reinterpret the actor as an enemy target');
  assert.match(request, /nowSec:a\.statusState\.currentTimeSec/);
  assert.match(readiness, /validateReviewedSkillEffectRequest\(canonicalSkillEffectRequest/,
    'full E1+E2 plan validates before Uses commit');

  const planAt = acceptedApply.indexOf('const planned=resolveReviewedSkillEffects(');
  const cooldownAt = acceptedApply.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const actorAt = acceptedApply.indexOf('applyPlannedActorEffect(a,move,planned.actorResult);');
  assert.ok(planAt >= 0 && cooldownAt > planAt && actorAt > cooldownAt,
    'pure full-effect planning precedes the sole cooldown and actor mutations');
  assert.equal((acceptedApply.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1);
  assert.match(acceptedApply, /if\(command\.targetKind==='Self'\)/,
    'Self skills have a live accepted presentation branch');

  assert.match(actorApply, /a\.inst\.hp=actorResult\.predictedHp/);
  assert.match(actorApply, /a\.statusState=actorResult\.nextStatusState/);
  assert.match(actorApply, /spawnHealSkillEffect\(/);
  assert.match(actorApply, /spawnShieldSkillEffect\(/);
  assert.match(actorApply, /spawnBuffAtkSkillEffect\(/);
  assert.doesNotMatch(source, /attackBuff|buffTimer|shieldReduction|shieldTimer/,
    'legacy self-effect timers cannot compete with canonical status lifecycle');

  assert.match(updateOwned, /advanceEncounterEffects\(a\.statusState/,
    'owned status duration advances in the live frame loop');
  assert.match(updateOwned, /resolveActiveSelfStatusModifiers\(a\.statusState\)/);
  assert.match(updateOwned, /monsterDamage\(a\.inst,basic,liveTarget,attackMultiplier,\{allowSkillMastery:false,critBonusPct\}\)/,
    'ATK and Crit buffs affect owned Basic AI attacks');
  assert.match(updateOwned, /\*speedMultiplier\*dt/,
    'SPD buff affects owned movement');
  assert.equal((source.match(/\*speedMultiplier\*dt/g) ?? []).length, 2,
    'SPD applies to chase and forced-retreat movement');
  assert.match(wildDamage, /def:\(inst\.def\|\|10\)\*defenseMultiplier/,
    'DEF buff enters incoming damage defense');
  assert.match(updateWild, /resolveActiveSelfStatusModifiers\(activeSummon\.statusState,\{incomingType\}\)/);
  assert.match(updateWild, /guard\.evasionChancePct\/100/,
    'Evasion buff can avoid incoming wild attacks');
  assert.match(updateWild, /guard\.damageTakenMultiplier\*guard\.elementDamageTakenMultiplier/,
    'DamageReduce and elemental shield layers both affect incoming damage');
  assert.equal((source.match(/guard\.damageTakenMultiplier\*guard\.elementDamageTakenMultiplier/g) ?? []).length, 2,
    'elemental shield layers affect Basic and wild incoming damage paths');
}

const source = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertE2LiveWiring(source);
  console.log('V8.2 E2 live Self Heal/Buff/Shield wiring: PASS');
}
