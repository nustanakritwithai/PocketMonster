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

function assertCastTimeFieldSnapshot(source) {
  const presentationSource = functionSource(source, 'runBestEffortCombatPresentation');
  const activateSource = functionSource(source, 'activateSkillField');
  const liveSkillFields = [];
  const constructionRuntimeCounts = [];
  let failNextVisualConstruction = true;
  class Mesh {
    constructor() {
      constructionRuntimeCounts.push(liveSkillFields.length);
      if (failNextVisualConstruction) {
        failNextVisualConstruction = false;
        throw new Error('field-visual-construction-failure');
      }
      this.position = { set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
      this.rotation = { x: 0, y: 0 };
      this.castShadow = false;
    }
  }
  let sceneAdds = 0;
  const activate = Function(
    'liveSkillFields', 'THREE', 'scene',
    `'use strict';${presentationSource}${activateSource};return activateSkillField;`,
  )(
    liveSkillFields,
    Object.freeze({
      Mesh,
      BoxGeometry: class {}, RingGeometry: class {},
      MeshStandardMaterial: class {}, MeshBasicMaterial: class {},
      DoubleSide: 2,
    }),
    Object.freeze({ add() { sceneAdds += 1; } }),
  );
  const actor = { statusState: { currentTimeSec: 99 } };
  const castSnapshot = Object.freeze({ id: 'caster', level: 7, stats: Object.freeze({ ATK: 31 }) });
  const fieldResult = Object.freeze({
    kind: 'hazard', skillId: 'SK_FIRE_06', radiusM: 2, durationSec: 3,
    center: Object.freeze({ x: 1, z: 2 }), tickIntervalSec: 0.5,
  });
  assert.doesNotThrow(() => activate(actor, { type: 'Fire' }, fieldResult, castSnapshot, 4),
    'field visual construction is best-effort after the runtime field commits');
  assert.equal(liveSkillFields.length, 1,
    'a first visual construction failure cannot erase the accepted live field');
  assert.deepEqual(constructionRuntimeCounts, [1],
    'the field runtime is registered before its first visual constructor runs');
  assert.strictEqual(liveSkillFields[0].attacker, castSnapshot,
    'field stores the already accepted cast snapshot instead of recapturing after damage/growth');
  assert.equal(liveSkillFields[0].attackerNowSec, 4);
  assert.equal(liveSkillFields[0].mesh, null,
    'a failed optional visual leaves an executable headless field runtime');

  activate(actor, { type: 'Fire' }, fieldResult, castSnapshot, 4);
  assert.equal(liveSkillFields.length, 2);
  assert.deepEqual(constructionRuntimeCounts, [1, 2],
    'successful visual construction also observes its runtime registration first');
  assert.ok(liveSkillFields[1].mesh instanceof Mesh);
  assert.equal(sceneAdds, 1);
}

export function assertE3LiveWiring(source) {
  const attacker = functionSource(source, 'canonicalSkillEffectAttacker');
  const request = functionSource(source, 'canonicalSkillEffectRequest');
  const accepted = functionSource(source, 'applyAcceptedSkillCommand');
  const activate = functionSource(source, 'activateSkillField');
  const blocks = functionSource(source, 'fieldBlocksPosition');
  const move = functionSource(source, 'moveWildWithFieldCollision');
  const updateFields = functionSource(source, 'updateSkillFields');
  const applyWildMotion = functionSource(source, 'applyWildMotionAndPresentation');
  const switchZone = functionSource(source, 'switchZone');
  const loop = functionSource(source, 'loop');
  assertCastTimeFieldSnapshot(source);

  assert.match(source, /resolveWorkbookDirectDamage/);
  assert.match(attacker, /position:Object\.freeze\(\{x:a\.mesh\.position\.x,z:a\.mesh\.position\.z\}\)/,
    'field planning receives an immutable actor position');
  assert.match(request, /targets:command\.targetKind==='Self'\?Object\.freeze\(\[\]\):canonicalSkillEffectTargets\(materialized\)/);
  assert.match(request, /command,/);

  const requestAt = accepted.indexOf('const effectRequest=canonicalSkillEffectRequest(');
  const planAt = accepted.indexOf('const planned=resolveReviewedSkillEffects(effectRequest');
  const cooldownAt = accepted.indexOf('a.skillCds[index]=command.startCooldownSec;');
  const fieldAt = accepted.indexOf('activateSkillField(a,move,planned.fieldResult,effectRequest.attacker,effectRequest.nowSec);');
  assert.ok(requestAt >= 0 && planAt > requestAt && cooldownAt > planAt && fieldAt > cooldownAt,
    'field plan is pure before the sole cooldown and live field mutation');
  assert.equal((accepted.match(/a\.skillCds\[index\]=command\.startCooldownSec/g) ?? []).length, 1);
  assert.match(accepted, /else if\(command\.targetKind==='GroundPoint'\)/,
    'GroundPoint presentation cannot fall through the enemy-area damage branch');
  assert.match(accepted, /สร้างกำแพงที่จุดเล็ง/);

  assert.match(source, /const liveSkillFields=\[\]/);
  assert.match(activate, /new THREE\.BoxGeometry\(fieldResult\.lengthM,1\.8,fieldResult\.thicknessM\)/,
    'wall owns disposable geometry instead of corrupting the shared cache');
  assert.match(activate, /new THREE\.RingGeometry\(fieldResult\.radiusM\*\.72,fieldResult\.radiusM,32\)/);
  assert.match(activate, /attacker:attackerSnapshot/,
    'hazard stores a cast-time canonical attacker snapshot');
  assert.match(activate, /attackerNowSec,/);
  assert.match(activate, /liveSkillFields\.push\(field\);\s+runBestEffortCombatPresentation\(\(\)=>\{/,
    'field runtime registration precedes all optional visual construction');
  assert.match(blocks, /field\.kind!=='wall'/);
  assert.match(blocks, /Math\.abs\(along\)<=field\.lengthM\/2\+\.35/);
  assert.match(move, /if\(fieldBlocksPosition\(next\)\)return false/);
  assert.equal((applyWildMotion.match(/moveWildWithFieldCollision\(/g) ?? []).length, 2,
    'wall collision gates wander and all cached combat movement intents');

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
