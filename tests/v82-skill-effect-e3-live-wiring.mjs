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

export function assertE3LiveWiring(source) {
  const attacker = functionSource(source, 'canonicalSkillEffectAttacker');
  const request = functionSource(source, 'canonicalSkillEffectRequest');
  const accepted = functionSource(source, 'applyAcceptedSkillCommand');
  const activate = functionSource(source, 'activateSkillField');
  const blocks = functionSource(source, 'fieldBlocksPosition');
  const move = functionSource(source, 'moveWildWithFieldCollision');
  const updateFields = functionSource(source, 'updateSkillFields');
  const updateWild = functionSource(source, 'updateWild');
  const switchZone = functionSource(source, 'switchZone');
  const loop = functionSource(source, 'loop');

  assert.match(source, /resolveWorkbookDirectDamage/);
  assert.match(attacker, /position:Object\.freeze\(\{x:a\.mesh\.position\.x,z:a\.mesh\.position\.z\}\)/,
    'field planning receives an immutable actor position');
  assert.match(request, /targets:command\.targetKind==='Self'\?Object\.freeze\(\[\]\):canonicalSkillEffectTargets\(materialized\)/);
  assert.match(request, /command,/);

  const planAt = accepted.indexOf('const planned=resolveReviewedSkillEffects(');
  const cooldownAt = accepted.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const fieldAt = accepted.indexOf('activateSkillField(a,move,planned.fieldResult);');
  assert.ok(planAt >= 0 && cooldownAt > planAt && fieldAt > cooldownAt,
    'field plan is pure before the sole cooldown and live field mutation');
  assert.equal((accepted.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1);
  assert.match(accepted, /else if\(command\.targetKind==='GroundPoint'\)/,
    'GroundPoint presentation cannot fall through the enemy-area damage branch');
  assert.match(accepted, /สร้างกำแพงที่จุดเล็ง/);

  assert.match(source, /const liveSkillFields=\[\]/);
  assert.match(activate, /new THREE\.BoxGeometry\(fieldResult\.lengthM,1\.8,fieldResult\.thicknessM\)/,
    'wall owns disposable geometry instead of corrupting the shared cache');
  assert.match(activate, /new THREE\.RingGeometry\(fieldResult\.radiusM\*\.72,fieldResult\.radiusM,32\)/);
  assert.match(activate, /attacker:canonicalSkillEffectAttacker\(a,move\)/,
    'hazard stores a cast-time canonical attacker snapshot');
  assert.match(blocks, /field\.kind!=='wall'/);
  assert.match(blocks, /Math\.abs\(along\)<=field\.lengthM\/2\+\.35/);
  assert.match(move, /if\(fieldBlocksPosition\(next\)\)return false/);
  assert.equal((updateWild.match(/moveWildWithFieldCollision\(/g) ?? []).length, 3,
    'wall collision gates wander, chase, and forced-retreat movement');

  assert.match(updateFields, /field\.nextTickSec<=Math\.min\(field\.ageSec,field\.durationSec\)/);
  assert.match(updateFields, /distXZ\(field\.center,w\.mesh\.position\)>field\.radiusM/,
    'hazard ticks current occupants only');
  assert.match(updateFields, /resolveWorkbookDirectDamage\(\{skillId:field\.skillId/,
    'hazard reuses canonical workbook damage without recommitting the skill command');
  assert.match(updateFields, /Math\.round\(resolved\.damage\*field\.tickDamageRatio\)/);
  assert.match(updateFields, /field\.nextTickSec\+=field\.tickIntervalSec/);
  assert.doesNotMatch(updateFields, /executeEquippedSkillCommand|consumeSkillUse|skillCds/,
    'field ticks cannot consume Uses or recommit cooldown');

  assert.match(switchZone, /clearSkillFields\(\)/, 'zone change clears all live fields');
  assert.match(loop, /updateSkillFields\(dt\)/, 'live frame loop advances field lifetime and hazard ticks');
}

const source = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertE3LiveWiring(source);
  console.log('V8.2 E3 live GroundPoint/Field wiring: PASS');
}
