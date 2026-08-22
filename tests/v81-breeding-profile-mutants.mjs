import assert from 'node:assert/strict';
import fs from 'node:fs';

const sourceUrl = new URL('../breeding.mjs', import.meta.url);
const originalSource = fs.readFileSync(sourceUrl, 'utf8');

async function loadSource(source, tag) {
  const withAbsoluteImports = source.replaceAll(
    /from '(\.\/[^']+)'/g,
    (_, relativePath) => `from '${new URL(`../${relativePath.slice(2)}`, import.meta.url).href}'`,
  );
  return import(`data:text/javascript;base64,${Buffer.from(`${withAbsoluteImports}\n//# sourceURL=${tag}`).toString('base64')}`);
}

function compatibilityContract(module) {
  assert.equal(module.BREEDING_REQUIRED_STAGE, 2);
  assert.equal(module.BREEDING_MIN_LEVEL, 20);
  assert.equal(module.BREEDING_MIN_BOND, 50);
  assert.deepEqual(module.STANDARD_BREEDING_ROLES, { eggHolder: 'Female', partner: 'Male' });
  assert.deepEqual(module.BREEDING_GROUPS, [
    'Field', 'Water1', 'Mineral', 'Flying', 'Bug', 'Dragon', 'Humanlike', 'Amorphous',
  ]);
  assert.equal(Object.isFrozen(module.STANDARD_BREEDING_ROLES), true);
  assert.equal(Object.isFrozen(module.BREEDING_GROUPS), true);
  assert.equal(typeof module.evaluateStandardBreedingCompatibility, 'function');
  assert.equal(module.evaluateBreedingCompatibility, undefined, 'ambiguous positional API must stay absent');

  const speciesById = {
    flameling: { stage: 2, breedingGroup: 'Field', breedingEligibility: 'Yes' },
    normalooze: { stage: 2, breedingGroup: 'Field', breedingEligibility: true },
    galebird: { stage: 2, breedingGroup: 'Flying', breedingEligibility: 'Yes' },
    ironbug: { stage: 2, breedingGroup: 'Mineral', breedingEligibility: 'SpecialRecipeOnly' },
    voidhorn: { stage: 2, breedingGroup: 'Field', breedingEligibility: 'No' },
    fairimp: { stage: 2, breedingGroup: 'Field' },
    unknownStage: { stage: 2, breedingGroup: 'Field', breedingEligibility: 'Yes' },
  };
  const stage2Forms = {
    flameling: 'MON_020',
    normalooze: 'MON_019',
    galebird: 'MON_027',
    ironbug: 'MON_035',
    voidhorn: 'MON_029',
    fairimp: 'MON_030',
    unknownStage: 'unknownStage',
  };
  const makeParent = (instanceId, speciesId, gender, overrides = {}) => ({
    instanceId,
    speciesId,
    formId: stage2Forms[speciesId],
    level: 25,
    gender,
    mind: { bond: 70 },
    breedingCooldownUntil: 0,
    parents: { a: null, b: null },
    evolutionHistory: [],
    ...overrides,
  });
  const eggHolder = makeParent('parent-a', 'flameling', 'Female');
  const partner = makeParent('parent-b', 'normalooze', 'Male');
  const holderSnapshot = structuredClone(eggHolder);
  const partnerSnapshot = structuredClone(partner);

  const evaluate = (holderOverrides = {}, partnerOverrides = {}, options = {}) => (
    module.evaluateStandardBreedingCompatibility(
      { ...eggHolder, ...holderOverrides },
      { ...partner, ...partnerOverrides },
      { speciesById, now: 2000, ...options },
    )
  );

  const valid = evaluate();
  assert.deepEqual(
    {
      ok: valid.ok,
      reason: valid.reason,
      group: valid.breedingGroup,
      stage: valid.requiredStage,
      level: valid.minLevel,
      bond: valid.minBond,
      evidence: valid.stageEvidence,
    },
    {
      ok: true,
      reason: null,
      group: 'Field',
      stage: 2,
      level: 20,
      bond: 50,
      evidence: ['workbook_stage2_form', 'workbook_stage2_form'],
    },
  );
  assert.equal(Object.isFrozen(valid), true);
  assert.deepEqual(eggHolder, holderSnapshot);
  assert.deepEqual(partner, partnerSnapshot);

  assert.equal(evaluate({ instanceId: '' }).reason, 'invalid_state');
  assert.equal(evaluate({}, { instanceId: '   ' }).reason, 'invalid_state');
  assert.equal(evaluate({ formId: 'flameling', evolutionStage: 2, lifeStage: 'Mature' }).reason, 'breeding_stage_gate');
  assert.equal(evaluate({ speciesId: 'unknownStage', formId: 'unknownStage' }).reason, 'breeding_stage_gate');
  assert.equal(evaluate({ level: 20 }).ok, true);
  assert.equal(evaluate({ level: 19 }).reason, 'breeding_level_gate');
  assert.equal(evaluate({ level: 20.5 }).reason, 'breeding_level_gate');
  assert.equal(evaluate({ mind: { bond: 50 } }).ok, true);
  assert.equal(evaluate({ mind: { bond: 49 } }).reason, 'breeding_bond_gate');
  assert.equal(evaluate({ gender: 'Male' }, { gender: 'Female' }).reason, 'breeding_gender_gate');
  assert.equal(evaluate({}, { gender: 'Female' }).reason, 'breeding_gender_gate');
  assert.equal(evaluate({ gender: 'Genderless' }).reason, 'breeding_recipe_only');
  assert.equal(evaluate({}, { gender: 'Genderless' }).reason, 'breeding_recipe_only');
  assert.equal(evaluate({}, { speciesId: 'galebird', formId: 'MON_027' }).reason, 'breeding_group_gate');
  assert.equal(
    evaluate(
      { speciesId: 'ironbug', formId: 'MON_035' },
      {},
    ).reason,
    'breeding_recipe_only',
    'RecipeOnly must precede cross-group rejection',
  );
  const invalidGroups = {
    ...speciesById,
    flameling: { ...speciesById.flameling, breedingGroup: 'Mystic' },
    normalooze: { ...speciesById.normalooze, breedingGroup: 'Mystic' },
  };
  assert.equal(evaluate({}, {}, { speciesById: invalidGroups }).reason, 'breeding_group_gate');
  assert.equal(evaluate({}, { speciesId: 'voidhorn', formId: 'MON_029' }).reason, 'breeding_eligibility_gate');
  assert.equal(evaluate({}, { speciesId: 'fairimp', formId: 'MON_030' }).reason, 'breeding_eligibility_gate');
  assert.equal(evaluate({}, { breedingCooldownUntil: 2001 }).reason, 'breeding_cooldown');
  assert.equal(evaluate({}, { breedingCooldownUntil: 2000 }).ok, true);
  assert.equal(evaluate({}, { breedingCooldownUntil: Number.NaN }).reason, 'invalid_state');
  assert.equal(evaluate({}, {}, { now: Number.NaN }).reason, 'invalid_state');
  assert.equal(module.evaluateStandardBreedingCompatibility(eggHolder, eggHolder, { speciesById, now: 2000 }).reason, 'breeding_same_instance');
  const child = makeParent('child-b', 'normalooze', 'Male', { parents: { a: 'parent-a', b: 'other' } });
  assert.equal(module.evaluateStandardBreedingCompatibility(eggHolder, child, { speciesById, now: 2000 }).reason, 'breeding_relative_gate');
  assert.equal(module.evaluateStandardBreedingCompatibility(eggHolder, { ...partner, speciesId: 'unknown' }, { speciesById, now: 2000 }).reason, 'unknown_id');
  assert.equal(module.genderCompatible({ gender: 'Female' }, { gender: 'Male' }), true);
  assert.equal(module.genderCompatible({ gender: 'Female' }, { gender: 'Female' }), false);

  const liveStage2 = makeParent('live-a', 'flameling', 'Female', {
    formId: 'flameling_lv2',
    evolutionHistory: [{ evolutionId: 'flameling_lv2', from: 'flameling', to: 'flameling_lv2' }],
  });
  assert.equal(module.evaluateStandardBreedingCompatibility(liveStage2, partner, { speciesById, now: 2000 }).ok, true);

  const mapProfiles = new Map(Object.entries(speciesById));
  assert.equal(module.evaluateStandardBreedingCompatibility(eggHolder, partner, { speciesById: mapProfiles, now: 2000 }).ok, true);
  assert.equal(module.evaluateStandardBreedingCompatibility(eggHolder, partner, { speciesById: id => speciesById[id], now: 2000 }).ok, true);
  assert.equal(
    module.breed(partner, eggHolder, { species: { id: 'normalooze' }, seed: 'legacy' }).ok,
    true,
    'legacy generator remains symmetric',
  );
}

compatibilityContract(await loadSource(originalSource, 'breeding-profile-current'));

const mutants = [
  ['required Stage1', 'export const BREEDING_REQUIRED_STAGE = 2;', 'export const BREEDING_REQUIRED_STAGE = 1;'],
  ['minimum level 19', 'export const BREEDING_MIN_LEVEL = 20;', 'export const BREEDING_MIN_LEVEL = 19;'],
  ['minimum bond 49', 'export const BREEDING_MIN_BOND = 50;', 'export const BREEDING_MIN_BOND = 49;'],
  [
    'swap standard roles',
    "Object.freeze({ eggHolder: 'Female', partner: 'Male' })",
    "Object.freeze({ eggHolder: 'Male', partner: 'Female' })",
  ],
  ['change canonical group enum', "  'Amorphous',", "  'Mystic',"],
  [
    'allow missing holder id',
    "typeof a.instanceId !== 'string' || a.instanceId.trim().length === 0",
    'false',
  ],
  [
    'allow missing partner id',
    "typeof b.instanceId !== 'string' || b.instanceId.trim().length === 0",
    'false',
  ],
  [
    'trust profile stage instead of owned form',
    'resolveWorkbookEvolutionStage(eggHolder),',
    "{ ok: true, stage2: profileA.stage === 2, stageEvidence: 'profile_stage' },",
  ],
  [
    'bypass Stage2 evidence',
    'if (stageResolutions.some(result => !result.ok || !result.stage2)) {',
    'if (false) {',
  ],
  ['exclude level boundary', 'value < BREEDING_MIN_LEVEL', 'value <= BREEDING_MIN_LEVEL'],
  ['allow fractional level', '!Number.isInteger(value) || value < BREEDING_MIN_LEVEL', 'value < BREEDING_MIN_LEVEL'],
  ['exclude bond boundary', 'value < BREEDING_MIN_BOND', 'value <= BREEDING_MIN_BOND'],
  [
    'allow either gender role',
    'partner?.gender === STANDARD_BREEDING_ROLES.partner;',
    'partner?.gender === STANDARD_BREEDING_ROLES.partner || eggHolder?.gender === STANDARD_BREEDING_ROLES.eggHolder;',
  ],
  [
    'downgrade recipe-only',
    "|| eligibilities.includes('SpecialRecipeOnly')) {",
    ') {',
  ],
  ['bypass gender gate', 'if (!genderCompatible(eggHolder, partner)) {', 'if (false) {'],
  [
    'allow unknown equal group',
    'groups.some(group => !BREEDING_GROUPS.includes(group)) || groups[0] !== groups[1]',
    'groups[0] !== groups[1]',
  ],
  [
    'bypass group gate',
    'if (groups.some(group => !BREEDING_GROUPS.includes(group)) || groups[0] !== groups[1]) {',
    'if (false) {',
  ],
  [
    'bypass eligibility gate',
    "if (eligibilities.some(value => value !== 'Yes')) {",
    'if (false) {',
  ],
  ['treat missing eligibility as Yes', "return 'No';", "return 'Yes';"],
  ['bypass invalid cooldown', 'if (cooldowns.includes(null)) {', 'if (false) {'],
  ['exclude ready cooldown boundary', 'value > now', 'value >= now'],
  ['bypass invalid clock', 'if (!Number.isFinite(now))', 'if (false)'],
  [
    'bypass identity and kinship',
    'const base = canBreed(eggHolder, partner);',
    'const base = { ok: true, reason: null };',
  ],
];

for (const [name, before, after] of mutants) {
  const source = originalSource.replace(before, after);
  assert.notEqual(source, originalSource, `${name} mutation must alter source`);
  const module = await loadSource(source, `breeding-profile-mutant-${name.replaceAll(' ', '-')}`);
  assert.throws(() => compatibilityContract(module), undefined, `${name} must be killed`);
}

console.log(`V8.1 BRD_v1.0 breeding profile mutants: PASS (${mutants.length}/${mutants.length} killed)`);
