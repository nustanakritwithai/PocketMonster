import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const sources = Object.freeze({
  skill: ['skill-catalog.mjs', fs.readFileSync(new URL('../skill-catalog.mjs', import.meta.url), 'utf8')],
  targeting: ['targeting-resolver.mjs', fs.readFileSync(new URL('../targeting-resolver.mjs', import.meta.url), 'utf8')],
  character: ['character-skills-view-model.mjs', fs.readFileSync(new URL('../character-skills-view-model.mjs', import.meta.url), 'utf8')],
  game: ['game-v800.js', fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8')],
});

async function loadModule(source, filename, label) {
  const fileUrl = new URL(`../${filename}`, import.meta.url);
  const absolute = source.replaceAll(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, fileUrl).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertSkill(module) {
  assert.equal(module.SKILL_RANGE_CATALOG_VERSION, 'skill-range/v1');
  assert.equal(module.SKILL_RANGE_CATALOG.length, 108);
  assert.equal(module.validateSkillRangeCatalog(module.SKILL_RANGE_CATALOG).ok, true);
  assert.equal(createHash('sha256').update(JSON.stringify(module.SKILL_RANGE_CATALOG)).digest('hex'),
    '4a1569ef556a0784824dc0cdf8499096ba388978ebe29c74797ffcb05d1048e2');
  assert.deepEqual(module.skillRangeCatalogEntry('SK_FIRE_01'), {
    skillId: 'SK_FIRE_01', targetType: 'NearestEnemy', rangeM: 2.2, radiusM: 0.8,
    geometrySource: 'Skill_Advanced!I:J', activation: 'runtime_live', sourceWorkbookVersion: '2.1',
    sourceWorkbookSha256: 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c',
  });
  assert.deepEqual(
    ['SK_NORMAL_03', 'SK_FIRE_04', 'SK_ICE_04'].map(id => {
      const row = module.skillRangeCatalogEntry(id);
      return [row.targetType, row.rangeM, row.radiusM];
    }),
    [['Self', 0, 0], ['EnemyArea', 7.5, 3.5], ['GroundPoint', 5, 0]],
  );
  const changed = module.SKILL_RANGE_CATALOG.map(row => ({ ...row }));
  changed[0].rangeM += 1;
  assert.equal(module.validateSkillRangeCatalog(changed).ok, false);
  assert.equal(module.skillRangeCatalogEntry('SK_UNKNOWN_99'), null);
}

function command(module, skillId, input = {}) {
  return module.resolveSkillCommand({
    commandId: `mut:${skillId}:${JSON.stringify(input)}`,
    skillId,
    actor: { id: 'actor', alive: true, position: { x: 0, z: 0 } },
    currentUses: 1,
    cooldownRemainingSec: 0,
    ...input,
  });
}

function enemy(id, x) {
  return { id, alive: true, targetable: true, position: { x, z: 0 } };
}

function assertTargeting(module) {
  assert.deepEqual(command(module, 'SK_FIRE_01', { enemies: [enemy('edge', 2.2)] }).targetIds, ['edge']);
  assert.equal(command(module, 'SK_FIRE_01', { enemies: [enemy('out', 2.201)] }).reason, 'no_valid_target');
  assert.deepEqual(command(module, 'SK_FIRE_04', {
    enemies: [enemy('anchor', 7.5), enemy('edge', 11), enemy('out', 11.001)],
  }).targetIds, ['anchor', 'edge']);
  assert.deepEqual(command(module, 'SK_ICE_04', { groundPoint: { x: 5, z: 0 } }).targetPoint, { x: 5, z: 0 });
  assert.equal(command(module, 'SK_ICE_04', { groundPoint: { x: 5.001, z: 0 } }).reason, 'ground_point_out_of_range');
  assert.equal(command(module, 'SK_NORMAL_03').rangeM, 0);
}

function skillsInstance() {
  return {
    instanceId: 'character-range',
    skills: [
      { skillId: 'SK_FIRE_01', slot: 's1', currentUses: 1 },
      { skillId: 'SK_FIRE_04', slot: 's2', currentUses: 1 },
      { skillId: 'SK_ICE_04', slot: 's3', currentUses: 1 },
      { skillId: 'SK_NORMAL_03', slot: 's4', currentUses: 1 },
    ],
  };
}

function assertCharacter(module) {
  const rows = module.createCharacterSkillsViewModel(skillsInstance(), { monsterName: 'Range' }).manualSlots;
  assert.deepEqual(rows.map(row => row.rangeText), ['2.2m', '7.5m / AoE 3.5m', '5m', 'Self']);
  assert.deepEqual(rows.map(row => [row.rangeM, row.radiusM]), [[2.2, 0.8], [7.5, 3.5], [5, 0], [0, 0]]);
  assert.match(rows[0].accessibilityLabelTH, /ระยะ 2\.2 เมตร/);
  assert.doesNotMatch(rows[0].accessibilityLabelTH, /รัศมี/);
  assert.match(rows[1].accessibilityLabelTH, /รัศมี 3\.5 เมตร/);
}

function assertGame(source) {
  assert.match(source, /\$\{row\.targetType\} • ระยะ \$\{row\.rangeText\}/);
  const dispatch = source.match(/function useSkill\(index,intent=\{\}\)\{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(dispatch, /rangeM\s*:|radiusM\s*:|move\.range/);
  assert.match(source, /ground_point_out_of_range:`\$\{move\?\.name\|\|'สกิล'\}: จุดเล็งอยู่นอกระยะ`/);
}

assertSkill(await loadModule(sources.skill[1], sources.skill[0], 'm8-skill-current'));
assertTargeting(await loadModule(sources.targeting[1], sources.targeting[0], 'm8-targeting-current'));
assertCharacter(await loadModule(sources.character[1], sources.character[0], 'm8-character-current'));
assertGame(sources.game[1]);

const mutations = [
  ['skill', 'change range catalog version', "'skill-range/v1'", "'skill-range/legacy'", assertSkill],
  ['skill', 'extend nearest range', 'rangeM: 2.2, radiusM: 0.8', 'rangeM: 6, radiusM: 0.8', assertSkill],
  ['skill', 'extend self range', 'Self: Object.freeze({ rangeM: 0, radiusM: 0 })', 'Self: Object.freeze({ rangeM: 1, radiusM: 0 })', assertSkill],
  ['skill', 'extend area cast range', 'EnemyArea: Object.freeze({ rangeM: 7.5, radiusM: 3.5 })', 'EnemyArea: Object.freeze({ rangeM: 8, radiusM: 3.5 })', assertSkill],
  ['skill', 'shrink area radius', 'EnemyArea: Object.freeze({ rangeM: 7.5, radiusM: 3.5 })', 'EnemyArea: Object.freeze({ rangeM: 7.5, radiusM: 2 })', assertSkill],
  ['skill', 'extend GroundPoint range', 'GroundPoint: Object.freeze({ rangeM: 5, radiusM: 0 })', 'GroundPoint: Object.freeze({ rangeM: 6, radiusM: 0 })', assertSkill],
  ['skill', 'hide range provenance', "geometrySource: 'Skill_Advanced!I:J'", "geometrySource: 'runtime_guess'", assertSkill],
  ['skill', 'deactivate range rows', "activation: 'runtime_live'", "activation: 'catalog_only'", assertSkill],
  ['skill', 'drop range source hash', 'sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,', 'sourceWorkbookSha256: null,', assertSkill],
  ['skill', 'mis-key per-skill row', 'return Object.freeze({\n    skillId: skill.id,', 'return Object.freeze({\n    skillId: skill.nameEN,', assertSkill],
  ['skill', 'accept geometry drift', 'if (!expected || range.rangeM !== expected.rangeM || range.radiusM !== expected.radiusM) {', 'if (false) {', assertSkill],
  ['targeting', 'force Fire range for every skill', 'skillRangeCatalogEntry(skillId)', "skillRangeCatalogEntry('SK_FIRE_01')", assertTargeting],
  ['targeting', 'reject exact ground boundary', 'distance(actor.position, groundPoint) > geometry.rangeM', 'distance(actor.position, groundPoint) >= geometry.rangeM', assertTargeting],
  ['targeting', 'reject exact enemy boundary', 'enemy.distance <= geometry.rangeM', 'enemy.distance < geometry.rangeM', assertTargeting],
  ['targeting', 'reject exact AoE boundary', 'enemy.distance <= geometry.radiusM', 'enemy.distance < geometry.radiusM', assertTargeting],
  ['targeting', 'accept outside ground point', 'distance(actor.position, groundPoint) > geometry.rangeM', 'distance(actor.position, groundPoint) > geometry.rangeM + 1', assertTargeting],
  ['character', 'label nearest hit radius as AoE', "geometry?.targetType === 'EnemyArea'", 'geometry?.radiusM > 0', assertCharacter],
  ['character', 'hide per-skill cast range', 'rangeM: geometry?.rangeM ?? null', 'rangeM: null', assertCharacter],
  ['character', 'hide per-skill radius', 'radiusM: geometry?.radiusM ?? null', 'radiusM: null', assertCharacter],
  ['character', 'hard-code visible range', "geometry ? `${geometry.rangeM}m` : '—'", "geometry ? '5m' : '—'", assertCharacter],
  ['character', 'drop accessible AoE radius', "geometry?.targetType === 'EnemyArea' ? `, รัศมี ${geometry.radiusM} เมตร` : ''", "''", assertCharacter],
  ['game', 'hide range from Character Skills', ' • ระยะ ${row.rangeText}', '', assertGame],
  ['game', 'allow caller range override', 'cooldownRemainingSec:a.skillCds[index]||0,', 'cooldownRemainingSec:a.skillCds[index]||0,rangeM:move.range,', assertGame],
];

let killed = 0;
for (const [sourceKey, name, from, to, contract] of mutations) {
  const [filename, source] = sources[sourceKey];
  const mutant = source.replace(from, to);
  assert.notEqual(mutant, source, `${name} mutation must apply`);
  try {
    const target = sourceKey === 'game' ? mutant : await loadModule(mutant, filename, `m8-mutant-${sourceKey}-${name}`);
    contract(target);
  } catch {
    killed += 1;
    continue;
  }
  assert.fail(`${name} mutant survived`);
}

assert.equal(killed, mutations.length);
console.log(`V8.3 final closure mutants: PASS (${killed}/${mutations.length} killed)`);
