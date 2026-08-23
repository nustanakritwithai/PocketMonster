import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../skill-effect-contract.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, label) {
  const absolute = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${absolute}\n//# sourceURL=${label}`).toString('base64')}`);
}

function assertCoverage(module) {
  const rows = module.SKILL_EFFECT_COVERAGE_CONTRACT;
  assert.equal(rows.length, 108);
  assert.equal(new Set(rows.map(row => row.skillId)).size, 108);
  assert.equal(module.validateSkillEffectCoverageContract(rows).ok, true);
  assert.equal(rows.every(row => row.activation === 'contract_only'), true);
  assert.equal(rows.every(row => row.components.length > 0), true);
  assert.equal(rows.flatMap(row => row.statusLinkIds).length, 69);
  assert.deepEqual(module.skillEffectCoverageEntry('SK_NORMAL_05').components, [
    { kind: 'direct_damage', slice: 'E1_DIRECT_DAMAGE_STATUS', targetChannel: 'command_targets' },
    { kind: 'status', slice: 'E2_SELF_HEAL_BUFF_SHIELD', targetChannel: 'actor' },
  ]);
  assert.deepEqual(module.skillEffectCoverageEntry('SK_ICE_04').components, [
    { kind: 'field', slice: 'E3_GROUND_POINT_FIELD', targetChannel: 'target_point' },
  ]);
  assert.deepEqual(module.skillEffectCoverageEntry('SK_GROUND_02').components, [
    { kind: 'direct_damage', slice: 'E1_DIRECT_DAMAGE_STATUS', targetChannel: 'command_targets' },
    { kind: 'movement', slice: 'E4_MOVEMENT_DISPLACEMENT', targetChannel: 'actor' },
  ]);
  assert.deepEqual(module.skillEffectCoverageEntry('SK_NORMAL_06').components, [
    { kind: 'direct_damage', slice: 'E1_DIRECT_DAMAGE_STATUS', targetChannel: 'command_targets' },
    { kind: 'displacement', slice: 'E4_MOVEMENT_DISPLACEMENT', targetChannel: 'command_targets' },
  ]);
  assert.deepEqual(module.skillEffectCoverageEntry('SK_GRASS_05').components.map(component => component.kind), ['self_heal']);
  const unknown = {
    id: 'SK_MUTANT_01',
    effectClass: 'ScriptEval',
    effect: 'Eval',
    statusLinkCount: 0,
    directDamage: true,
    targetType: 'NearestEnemy',
    applicationMode: 'None',
  };
  assert.throws(() => module.buildSkillEffectCoverageContract([unknown], []), /unknown_effect_class/);
  assert.throws(() => module.buildSkillEffectCoverageContract([{ ...unknown, effectClass: 'DirectMechanic' }], []), /unknown_effect/);
}

assertCoverage(await loadSource(originalSource, 'effect-contract-current'));

const mutations = [
  ['drop direct damage component', "if (skill.directDamage) components.push(freezeComponent('direct_damage'));", 'if (false) components.push(freezeComponent(\'direct_damage\'));'],
  ['misroute self status', "? { slice: SKILL_EFFECT_SLICES.SELF_SURVIVAL, targetChannel: 'actor' }", "? { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'command_targets' }"],
  ['misroute field', "if (kind === 'field') return { slice: SKILL_EFFECT_SLICES.GROUND_FIELD, targetChannel: 'target_point' };", "if (kind === 'field') return { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'command_targets' };"],
  ['misroute movement', "if (kind === 'movement') return { slice: SKILL_EFFECT_SLICES.MOBILITY_CONTROL, targetChannel: 'actor' };", "if (kind === 'movement') return { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'actor' };"],
  ['misroute displacement', "if (kind === 'displacement') return { slice: SKILL_EFFECT_SLICES.MOBILITY_CONTROL, targetChannel: 'command_targets' };", "if (kind === 'displacement') return { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'command_targets' };"],
  ['drop status links', 'const statusLinks = linksBySkill.get(skill.id) ?? [];', 'const statusLinks = [];'],
  ['allow unknown effect', "if (!KNOWN_EFFECTS.get(skill.effectClass)?.has(skill.effect)) {", 'if (false) {'],
  ['claim runtime activation', "activation: 'contract_only',", "activation: 'runtime_live',"],
  ['make component kind unknown', "executorFamily: 'direct_damage', componentKind: null", "executorFamily: 'direct_damage', componentKind: 'script_eval'"],
];

for (const [name, from, to] of mutations) {
  const mutant = originalSource.replace(from, to);
  assert.notEqual(mutant, originalSource, `${name} mutation must apply`);
  await assert.rejects(async () => assertCoverage(await loadSource(mutant, `effect-contract-mutant-${name}`)), undefined, `${name} must be killed`);
}

console.log(`V8.2 skill effect contract mutants: PASS (${mutations.length}/${mutations.length} killed)`);
