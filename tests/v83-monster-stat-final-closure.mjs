import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { BALANCE_CONFIG } from '../balance-config.mjs';
import { cumulativeExpToLevel, levelFromTotalExp } from '../balance-formulas.mjs';
import { CONTENT_PROVENANCE } from '../content-provenance.mjs';
import { previewWorkbookEvolution, WORKBOOK_EVOLUTION_PATHS } from '../evolution.mjs';
import {
  INSTANCE_EXP_SCHEMA_VERSION,
  addGrowthExp,
  createInstance,
} from '../monster-instance.mjs';
import { MONSTER_STAT_KEYS } from '../monster-stat-contract.mjs';
import { MONSTER_STAT_CATALOG } from '../monster-stat-catalog.mjs';
import {
  DEFAULT_MONSTER_POTENTIAL,
  EMPTY_MONSTER_TRAINING,
  calculateMonsterStats,
} from '../monster-stat-formula.mjs';
import { normalizeSavedState, sanitizeStateForPersistence } from '../save-schema.mjs';
import {
  SKILL_CATALOG,
  SKILL_RANGE_CATALOG,
  SKILL_RANGE_CATALOG_VERSION,
  skillRangeCatalogEntry,
  validateSkillRangeCatalog,
} from '../skill-catalog.mjs';
import { resolveSkillCommand } from '../targeting-resolver.mjs';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(CONTENT_PROVENANCE.sha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
assert.equal(SKILL_RANGE_CATALOG_VERSION, 'skill-range/v1');
assert.equal(SKILL_RANGE_CATALOG.length, 108);
assert.equal(validateSkillRangeCatalog(SKILL_RANGE_CATALOG).ok, true);
assert.equal(hash(SKILL_RANGE_CATALOG), '4a1569ef556a0784824dc0cdf8499096ba388978ebe29c74797ffcb05d1048e2');
assert.deepEqual(
  Object.fromEntries([...new Set(SKILL_RANGE_CATALOG.map(row => row.targetType))]
    .map(targetType => [targetType, SKILL_RANGE_CATALOG.filter(row => row.targetType === targetType).length])),
  { NearestEnemy: 36, Self: 20, EnemyArea: 51, GroundPoint: 1 },
);

const actor = Object.freeze({ id: 'range-actor', alive: true, position: Object.freeze({ x: 0, z: 0 }) });
const resources = Object.freeze({ currentUses: 1, cooldownRemainingSec: 0 });
for (const skill of SKILL_CATALOG) {
  const geometry = skillRangeCatalogEntry(skill.id);
  assert.ok(geometry, `${skill.id} has a per-skill Skill_Advanced range row`);
  assert.equal(geometry.targetType, skill.targetType);
  assert.equal(geometry.activation, 'runtime_live');
  assert.equal(geometry.sourceWorkbookSha256, CONTENT_PROVENANCE.sha256);
  if (skill.targetType === 'Self') {
    const self = resolveSkillCommand({ commandId: `self:${skill.id}`, skillId: skill.id, actor, ...resources });
    assert.equal(self.ok, true);
    assert.deepEqual(self.targetIds, [actor.id]);
    assert.equal(self.rangeM, 0);
    assert.equal(self.radiusM, 0);
  } else if (skill.targetType === 'GroundPoint') {
    const exact = resolveSkillCommand({
      commandId: `ground-edge:${skill.id}`, skillId: skill.id, actor,
      groundPoint: { x: geometry.rangeM, z: 0 }, ...resources,
    });
    assert.equal(exact.ok, true, `${skill.id} accepts the exact ${geometry.rangeM}m boundary`);
    const outside = resolveSkillCommand({
      commandId: `ground-out:${skill.id}`, skillId: skill.id, actor,
      groundPoint: { x: geometry.rangeM + 0.001, z: 0 }, ...resources,
    });
    assert.equal(outside.reason, 'ground_point_out_of_range');
  } else if (skill.targetType === 'NearestEnemy') {
    const exact = resolveSkillCommand({
      commandId: `nearest-edge:${skill.id}`, skillId: skill.id, actor,
      enemies: [{ id: 'edge', alive: true, targetable: true, position: { x: geometry.rangeM, z: 0 } }],
      ...resources,
    });
    assert.deepEqual(exact.targetIds, ['edge'], `${skill.id} accepts the exact ${geometry.rangeM}m boundary`);
    const outside = resolveSkillCommand({
      commandId: `nearest-out:${skill.id}`, skillId: skill.id, actor,
      enemies: [{ id: 'outside', alive: true, targetable: true, position: { x: geometry.rangeM + 0.001, z: 0 } }],
      ...resources,
    });
    assert.equal(outside.reason, 'no_valid_target');
  } else {
    const exact = resolveSkillCommand({
      commandId: `area-edge:${skill.id}`, skillId: skill.id, actor,
      enemies: [
        { id: 'anchor', alive: true, targetable: true, position: { x: geometry.rangeM, z: 0 } },
        { id: 'radius-edge', alive: true, targetable: true, position: { x: geometry.rangeM + geometry.radiusM, z: 0 } },
        { id: 'radius-out', alive: true, targetable: true, position: { x: geometry.rangeM + geometry.radiusM + 0.001, z: 0 } },
      ],
      ...resources,
    });
    assert.deepEqual(exact.targetIds, ['anchor', 'radius-edge'], `${skill.id} uses exact cast and AoE boundaries`);
    const outside = resolveSkillCommand({
      commandId: `area-out:${skill.id}`, skillId: skill.id, actor,
      enemies: [{ id: 'outside-anchor', alive: true, targetable: true, position: { x: geometry.rangeM + 0.001, z: 0 } }],
      ...resources,
    });
    assert.equal(outside.reason, 'no_valid_target');
  }
}

assert.equal(MONSTER_STAT_CATALOG.length, 36);
assert.equal(WORKBOOK_EVOLUTION_PATHS.length, 18);
const collection = [];
for (const form of MONSTER_STAT_CATALOG) {
  let previous = null;
  for (let level = 1; level <= 60; level += 1) {
    const calculated = calculateMonsterStats({
      formId: form.formId,
      level,
      potential: DEFAULT_MONSTER_POTENTIAL,
      training: EMPTY_MONSTER_TRAINING,
    });
    assert.equal(calculated.ok, true, `${form.formId} Lv.${level} resolves all six stats`);
    assert.deepEqual(Object.keys(calculated.stats), MONSTER_STAT_KEYS);
    assert.ok(MONSTER_STAT_KEYS.every(stat => Number.isInteger(calculated.stats[stat]) && calculated.stats[stat] > 0));
    if (previous) {
      assert.ok(MONSTER_STAT_KEYS.every(stat => calculated.stats[stat] >= previous[stat]), `${form.formId} stats never regress at Lv.${level}`);
    }
    previous = calculated.stats;
  }
  const totalExp = cumulativeExpToLevel(60, BALANCE_CONFIG, form.growthCurve);
  assert.equal(levelFromTotalExp(totalExp, BALANCE_CONFIG, form.growthCurve).level, 60);
  const instance = createInstance({
    instanceId: `closure-${form.formId}`,
    speciesId: form.runtimeSpeciesId,
    canonicalFormId: form.formId,
    formId: form.formId,
    level: 1,
    growthExp: 0,
  });
  addGrowthExp(instance, totalExp);
  assert.equal(instance.level, 60);
  assert.equal(instance.growthCurve, form.growthCurve);
  assert.equal(instance.growthExpSchemaVersion, INSTANCE_EXP_SCHEMA_VERSION);
  collection.push(instance);
}

for (const path of WORKBOOK_EVOLUTION_PATHS) {
  const preview = previewWorkbookEvolution(createInstance({
    instanceId: `evo-${path.runtimeSpeciesId}`,
    speciesId: path.runtimeSpeciesId,
    canonicalFormId: path.fromWorkbookMonsterId,
    formId: path.runtimeSpeciesId,
    level: 15,
    mind: { bond: 50 },
  }));
  assert.equal(preview.ok, true);
  assert.equal(preview.canCommit, true);
  assert.ok(MONSTER_STAT_KEYS.every(stat => preview.targetStats[stat] >= preview.sourceStats[stat]));
}

const state = normalizeSavedState({
  collection,
  party: collection.slice(0, 3).map(monster => monster.instanceId),
  storage: collection.slice(3).map(monster => monster.instanceId),
});
const persisted = sanitizeStateForPersistence(state);
const reloaded = normalizeSavedState(JSON.parse(JSON.stringify(persisted)));
assert.deepEqual(
  reloaded.collection.map(monster => [monster.instanceId, monster.canonicalFormId, monster.level, monster.growthCurve]),
  collection.map(monster => [monster.instanceId, monster.canonicalFormId, 60, monster.growthCurve]),
  'all 36 canonical forms survive save/reload at Lv.60',
);

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const androidAcceptance = fs.readFileSync(new URL('../ANDROID-ACCEPTANCE-V83.md', import.meta.url), 'utf8');
const dispatch = game.match(/function useSkill\(index,intent=\{\}\)\{[\s\S]*?\n\}/)?.[0] ?? '';
assert.match(dispatch, /executeEquippedSkillCommand/);
assert.doesNotMatch(dispatch, /rangeM\s*:|radiusM\s*:|move\.range/, 'live caller cannot override canonical skill range');
assert.match(game, /reticleGroundPoint\(\)/, 'GroundPoint uses the live center reticle ray');
assert.match(game, /จุดเล็งอยู่นอกระยะ/, 'out-of-range GroundPoint gives visible Thai feedback');
assert.match(game, /ระยะ \$\{row\.rangeText\}/, 'Character Skills displays canonical range');
assert.match(androidAcceptance, /PASS \(user-attested\)/);
assert.equal((androidAcceptance.match(/— PASS/g) ?? []).length, 11, 'all eleven Android landscape checks are recorded');
assert.match(androidAcceptance, /ไม่ใช่ผลจำลองจาก headless test/, 'manual evidence is not misrepresented as automation');

console.log('V8.3 final canonical closure: PASS (36 forms × Lv1-60 × six stats; 108 skill ranges)');
