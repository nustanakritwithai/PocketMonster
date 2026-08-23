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

export function assertE1LiveWiring(source) {
  assert.match(source, /import \{ canExecuteE1SkillEffect, resolveE1SkillEffects, skillDamageProfile, validateE1SkillEffectRequest \} from '\.\/skill-effect-runtime\.mjs'/);
  const catalogSkills = functionSource(source, 'canonicalCombatSkills');
  const attacker = functionSource(source, 'canonicalSkillEffectAttacker');
  const targets = functionSource(source, 'canonicalSkillEffectTargets');
  const readiness = functionSource(source, 'canApplyLiveSkill');
  const apply = functionSource(source, 'applyAcceptedSkillCommand');
  const useSkill = functionSource(source, 'useSkill');

  assert.match(catalogSkills, /effectAvailable:canExecuteE1SkillEffect\(definition\.id\)/,
    'HUD availability comes from the reviewed E1 coverage');
  assert.match(attacker, /skillDamageProfile\(move\.skillId\)/);
  assert.match(attacker, /stats:Object\.freeze\(\{ATK:attack,SPATK:specialAttack\}\)/,
    'live actor supplies both workbook scaling stats');
  assert.match(attacker, /masteryRawPower\(skillRec\.masteryRank\)\*100/,
    'mastery enters EffectivePower exactly once');
  assert.match(attacker, /trait==='Fierce'\?8:0/,
    'legacy Fierce trait is translated to the canonical DamageDealt layer');
  assert.match(targets, /materialized\.map\(entry=>/,
    'effect snapshots preserve canonical command target order');
  assert.match(targets, /stats:Object\.freeze\(\{DEF:defense,SPDEF:specialDefense\}\)/,
    'live targets supply both workbook defense stats');
  assert.match(targets, /statusState:w\.statusState/);
  assert.match(targets, /nowSec:w\.statusState\?\.currentTimeSec\?\?0/);

  assert.match(readiness, /canExecuteE1SkillEffect\(command\.skillId\)/);
  assert.match(readiness, /validateE1SkillEffectRequest\(canonicalE1SkillEffectRequest\(a,move,command,materialized\)\)\.ok/,
    'effect request is structurally validated before Uses commit');
  assert.match(useSkill, /canApply:\(command,targets\)=>canApplyLiveSkill\(a,move,command,targets\)/);
  assert.match(useSkill, /applyAccepted:\(command,targets\)=>applyAcceptedSkillCommand\(a,index,move,command,targets\)/);

  const planAt = apply.indexOf('const planned=resolveE1SkillEffects(');
  const cooldownAt = apply.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const damageAt = apply.indexOf('damageWild(');
  assert.ok(planAt >= 0 && cooldownAt > planAt && damageAt > cooldownAt,
    'pure effect planning precedes the sole cooldown commit and live damage');
  assert.equal((apply.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1,
    'cooldown commits exactly once');
  assert.doesNotMatch(apply, /monsterDamage\(/, 'manual skills no longer use legacy damage');
  assert.equal((apply.match(/target\.statusState=effect\.nextStatusState/g) ?? []).length, 2,
    'single and area branches commit canonical status state after hit');
  assert.ok(apply.indexOf('damageWild(target,res.damage', apply.indexOf("if(command.targetKind==='NearestEnemy')"))
    < apply.indexOf('target.statusState=effect.nextStatusState'),
  'direct damage resolves before status application');
  assert.match(apply, /effectMode:planned\.effectMode/);
  assert.match(apply, /statusAppliedCount:planned\.statusAppliedCount/);
  assert.match(apply, /rngDraws:planned\.rngDraws/);
  assert.doesNotMatch(apply, /legacy_damage_compatibility/);

  assert.match(source, /statusState:createEncounterStatusState\(\{encounterId:wildId,nowSec:0\}\)/,
    'wild encounters own canonical status state');
  assert.match(source, /advanceEncounterEffects\(w\.statusState,statusRequest\)/,
    'live frame loop retains canonical DoT ticking');
}

const source = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertE1LiveWiring(source);
  console.log('V8.2 E1 live DirectDamage/Status wiring: PASS');
}
