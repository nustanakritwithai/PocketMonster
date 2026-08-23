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

export function assertE5LiveWiring(source) {
  const accepted = functionSource(source, 'applyAcceptedSkillCommand');
  const closure = functionSource(source, 'applyPlannedClosureEffects');
  const activate = functionSource(source, 'activateSkillSwarm');
  const update = functionSource(source, 'updateSkillSwarms');
  const switchZone = functionSource(source, 'switchZone');
  const recall = functionSource(source, 'recall');
  const faint = functionSource(source, 'faintActive');
  const loop = functionSource(source, 'loop');

  const planAt = accepted.indexOf('const planned=resolveReviewedSkillEffects(');
  const cooldownAt = accepted.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const closureAt = accepted.indexOf('applyPlannedClosureEffects(a,move,planned.healModifierResult,planned.summonResult)');
  assert.ok(planAt >= 0 && cooldownAt > planAt && closureAt > cooldownAt,
    'closure effects plan before the sole cooldown commit and mutate only after acceptance');
  assert.equal((accepted.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1);
  assert.match(accepted, /closureAppliedCount/);

  assert.match(closure, /a\.inst\.hp=healModifierResult\.predictedHp/,
    'LifeSteal commits only canonical capped healing');
  assert.match(closure, /label:'DRAIN'/);
  assert.match(closure, /activateSkillSwarm\(a,move,summonResult\)/);
  assert.doesNotMatch(closure, /executeEquippedSkillCommand|consumeSkillUse|skillCds|currentUses/);

  assert.match(source, /const liveSkillSwarms=\[\]/);
  assert.match(activate, /nextTickSec:summonResult\.tickIntervalSec/);
  assert.match(activate, /attacker:canonicalSkillEffectAttacker\(a,move\)/,
    'summon stores the cast-time canonical attacker snapshot');
  assert.match(update, /for\(let wildIndex=0;wildIndex<wilds\.length;wildIndex\+\+\)/,
    'summon targeting reuses the live array without a per-tick clone');
  assert.doesNotMatch(update, /\[\.\.\.wilds\]/);
  assert.match(update, /distance>swarm\.radiusM\|\|distance>nearestDistance/);
  assert.match(update, /candidate\.id\.localeCompare\(target\.id\)>=0/,
    'equal-distance swarm targets use deterministic ID tie-breaking');
  assert.match(update, /resolveWorkbookDirectDamage\(\{skillId:swarm\.skillId/);
  assert.match(update, /Math\.round\(resolved\.damage\*swarm\.tickDamageRatio\)/);
  assert.match(update, /swarm\.nextTickSec\+=swarm\.tickIntervalSec/);
  assert.doesNotMatch(update, /executeEquippedSkillCommand|consumeSkillUse|skillCds|currentUses/,
    'summon ticks cannot recommit Uses or Cooldown');

  assert.match(switchZone, /clearSkillSwarms\(\)/);
  assert.match(recall, /clearSkillSwarms\(\)/);
  assert.match(faint, /clearSkillSwarms\(\)/);
  assert.match(loop, /updateSkillSwarms\(dt\)/);
}

const source = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertE5LiveWiring(source);
  console.log('V8.2 E5 live SummonSwarm/LifeSteal wiring: PASS');
}
