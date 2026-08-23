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

export function assertE4LiveWiring(source) {
  const targets = functionSource(source, 'canonicalSkillEffectTargets');
  const accepted = functionSource(source, 'applyAcceptedSkillCommand');
  const clampDestination = functionSource(source, 'clampSkillEffectDestination');
  const mobility = functionSource(source, 'applyPlannedMobilityEffects');

  assert.match(targets, /position:Object\.freeze\(\{x:w\.mesh\.position\.x,z:w\.mesh\.position\.z\}\)/,
    'E4 planning receives immutable cast-time target positions');
  assert.match(clampDestination, /ZONES\[state\.currentZone\]\?\.bounds/);
  assert.match(clampDestination, /THREE\.MathUtils\.clamp\(destination\.x,bounds\.minX,bounds\.maxX\)/);
  assert.match(clampDestination, /THREE\.MathUtils\.clamp\(destination\.z,bounds\.minZ,bounds\.maxZ\)/);

  const planAt = accepted.indexOf('const planned=resolveReviewedSkillEffects(');
  const cooldownAt = accepted.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const mobilityAt = accepted.indexOf('applyPlannedMobilityEffects(a,move,planned.movementResult,planned.displacementResults,targets)');
  assert.ok(planAt >= 0 && cooldownAt > planAt && mobilityAt > cooldownAt,
    'pure E4 planning precedes the sole cooldown commit and live mobility mutation');
  assert.equal((accepted.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1);
  assert.match(accepted, /mobilityAppliedCount/);

  assert.match(mobility, /if\(movementResult\?\.applied\)/);
  assert.match(mobility, /a\.mesh\.position\.x=destination\.x;a\.mesh\.position\.z=destination\.z/);
  assert.match(mobility, /a\.aiDecision=null/, 'actor relocation invalidates the stale Basic AI decision');
  assert.match(mobility, /for\(let index=0;index<displacementResults\.length;index\+\+\)/);
  assert.match(mobility, /result=displacementResults\[index\],target=targets\[index\]/,
    'displacement preserves canonical command target order');
  assert.match(mobility, /target\.dead\|\|!target\.mesh\?\.position/,
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
