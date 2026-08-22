import assert from 'node:assert/strict';
import {
  AI_PROFILE_CATALOG,
  AI_PROFILE_POLICY,
  aiProfileEntry,
  validateAiProfileCatalog,
} from '../ai-profile.mjs';

const EXPECTED_PROFILES = [
  ['normalooze', 'MON_001', 'MON_019', 'Balanced', 'Mid', 'Adaptive'],
  ['flameling', 'MON_002', 'MON_020', 'Burst', 'Mid', 'BurstWindow'],
  ['aquapuff', 'MON_003', 'MON_021', 'Sustain', 'Mid', 'KiteAndRecover'],
  ['voltkit', 'MON_005', 'MON_023', 'Speed', 'Close/Mid', 'HitAndRun'],
  ['mossbun', 'MON_004', 'MON_022', 'Support', 'Back', 'ProtectAndHeal'],
  ['frostowl', 'MON_006', 'MON_024', 'Control', 'Mid', 'ZoneControl'],
  ['punchcub', 'MON_016', 'MON_034', 'Combo', 'Close', 'ChaseCombo'],
  ['toxitoad', 'MON_010', 'MON_028', 'DoT', 'Mid', 'KeepDebuff'],
  ['sandmole', 'MON_008', 'MON_026', 'Bruiser', 'Close', 'Pressure'],
  ['galebird', 'MON_009', 'MON_027', 'Mobility', 'Mid', 'HitAndRun'],
  ['mindcoon', 'MON_013', 'MON_031', 'Control', 'Mid', 'ZoneControl'],
  ['buglet', 'MON_014', 'MON_032', 'Utility', 'Mid', 'Disrupt'],
  ['rockhorn', 'MON_007', 'MON_025', 'Tank', 'Close', 'HoldFront'],
  ['ghostpurr', 'MON_018', 'MON_036', 'Trickster', 'Mid', 'BaitAndBlink'],
  ['emberdrake', 'MON_015', 'MON_033', 'Scaler', 'Mid', 'SafeThenBurst'],
  ['voidhorn', 'MON_011', 'MON_029', 'Assassin', 'Close', 'Flank'],
  ['ironbug', 'MON_017', 'MON_035', 'Tank', 'Close', 'HoldFront'],
  ['fairimp', 'MON_012', 'MON_030', 'Healer', 'Back', 'StayBack'],
];

assert.equal(AI_PROFILE_CATALOG.length, 18, '36 workbook rows reduce to 18 identical Stage1/Stage2 family profiles');
assert.equal(validateAiProfileCatalog(AI_PROFILE_CATALOG).ok, true);
assert.deepEqual(AI_PROFILE_CATALOG.map(profile => [
  profile.runtimeSpeciesId,
  profile.workbookBaseMonsterId,
  profile.workbookStage2MonsterId,
  profile.role,
  profile.preferredRange,
  profile.aiStyle,
]), EXPECTED_PROFILES, 'Monster_Profile Role/PreferredRange/AIStyle projection must be exact');

assert.deepEqual(
  Object.fromEntries(Object.entries(Object.groupBy(AI_PROFILE_CATALOG, profile => profile.preferredRange))
    .map(([range, profiles]) => [range, profiles.length])),
  { Mid: 10, 'Close/Mid': 1, Back: 2, Close: 5 },
  '18 family counts correspond to workbook row counts Mid20/Close-Mid2/Back4/Close10',
);

assert.equal(AI_PROFILE_POLICY.workbookRowCount, 36);
assert.equal(AI_PROFILE_POLICY.profileMetadataOnly, true);
assert.equal(AI_PROFILE_POLICY.numericStyleWeights, 'not_defined');
assert.equal(AI_PROFILE_POLICY.skillPriority, 'deferred_AI_Skill_Priority_TODO');
assert.equal(AI_PROFILE_POLICY.lightRuntimeActivation, 'deferred_D2');
assert.equal(AI_PROFILE_POLICY.sourceWorkbookSha256, 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c');
assert.equal(Object.isFrozen(AI_PROFILE_CATALOG), true);
assert.ok(AI_PROFILE_CATALOG.every(Object.isFrozen));
assert.equal(aiProfileEntry('rockhorn').aiStyle, 'HoldFront');
assert.equal(aiProfileEntry('unknown'), null);
assert.deepEqual(
  AI_PROFILE_CATALOG.map(profile => [
    profile.runtimeSpeciesId,
    profile.passive1Id,
    profile.basePassive2Id,
    profile.stage2Passive2Id,
  ]),
  [
    ['normalooze', 'PASS_NORMAL_01', null, 'PASS_NORMAL_02'],
    ['flameling', 'PASS_FIRE_01', null, 'PASS_FIRE_02'],
    ['aquapuff', 'PASS_WATER_01', null, 'PASS_WATER_02'],
    ['voltkit', 'PASS_ELECTRIC_01', null, 'PASS_ELECTRIC_02'],
    ['mossbun', 'PASS_GRASS_01', null, 'PASS_GRASS_02'],
    ['frostowl', 'PASS_ICE_01', null, 'PASS_ICE_02'],
    ['punchcub', 'PASS_FIGHTING_01', null, 'PASS_FIGHTING_02'],
    ['toxitoad', 'PASS_POISON_01', null, 'PASS_POISON_02'],
    ['sandmole', 'PASS_GROUND_01', null, 'PASS_GROUND_02'],
    ['galebird', 'PASS_FLYING_01', null, 'PASS_FLYING_02'],
    ['mindcoon', 'PASS_PSYCHIC_01', null, 'PASS_PSYCHIC_02'],
    ['buglet', 'PASS_BUG_01', null, 'PASS_BUG_02'],
    ['rockhorn', 'PASS_ROCK_01', null, 'PASS_ROCK_02'],
    ['ghostpurr', 'PASS_GHOST_01', null, 'PASS_GHOST_02'],
    ['emberdrake', 'PASS_DRAGON_01', null, 'PASS_DRAGON_02'],
    ['voidhorn', 'PASS_DARK_01', null, 'PASS_DARK_02'],
    ['ironbug', 'PASS_STEEL_01', null, 'PASS_STEEL_02'],
    ['fairimp', 'PASS_LIGHT_01', null, 'PASS_LIGHT_02'],
  ],
  'Monster_Profile U/V join preserves blank Stage1 Passive2 and Stage2 LIGHT metadata',
);

const duplicate = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
duplicate[1].runtimeSpeciesId = duplicate[0].runtimeSpeciesId;
assert.ok(validateAiProfileCatalog(duplicate).issues.some(issue => issue.code === 'duplicate_runtime_species'));

const changedWorkbookMetadata = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
changedWorkbookMetadata.find(profile => profile.runtimeSpeciesId === 'rockhorn').aiStyle = 'BurstWindow';
assert.ok(validateAiProfileCatalog(changedWorkbookMetadata).issues.some(issue => issue.code === 'workbook_ai_metadata_mismatch'));

const changedWorkbookJoin = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
changedWorkbookJoin.find(profile => profile.runtimeSpeciesId === 'fairimp').stage2Passive2Id = 'PASS_FAIRY_02';
assert.ok(validateAiProfileCatalog(changedWorkbookJoin).issues.some(issue => issue.code === 'workbook_passive_mapping_mismatch'));

const inventedWeights = AI_PROFILE_CATALOG.map(profile => ({ ...profile }));
inventedWeights[0].styleWeights = { attack: 0.8 };
inventedWeights[0].skillPriority = ['s1'];
assert.ok(validateAiProfileCatalog(inventedWeights).issues.some(issue => issue.code === 'forbidden_ai_runtime_field'));

const hostileProfile = new Proxy({}, {
  ownKeys() { throw new Error('hostile ownKeys trap'); },
});
assert.doesNotThrow(() => validateAiProfileCatalog([hostileProfile]));
assert.equal(validateAiProfileCatalog([hostileProfile]).ok, false, 'hostile catalog input fails closed');

let arrayPropertyReads = 0;
const masqueradingArray = new Proxy([], {
  get(target, property, receiver) {
    if (property === 'length') {
      arrayPropertyReads += 1;
      return 18;
    }
    if (property === 'forEach') {
      arrayPropertyReads += 1;
      return callback => AI_PROFILE_CATALOG.forEach(callback);
    }
    return Reflect.get(target, property, receiver);
  },
});
assert.equal(validateAiProfileCatalog(masqueradingArray).ok, false,
  'catalog validation uses own dense array descriptors, not caller methods');
assert.equal(arrayPropertyReads, 0);

let maskedProfileReads = 0;
const maskedProfile = new Proxy({ ...AI_PROFILE_CATALOG[0], role: 'Aggressive' }, {
  get(_target, property) {
    maskedProfileReads += 1;
    return AI_PROFILE_CATALOG[0][property];
  },
});
const maskedRecords = AI_PROFILE_CATALOG.map((profile, index) => index === 0 ? maskedProfile : { ...profile });
assert.ok(validateAiProfileCatalog(maskedRecords).issues.some(issue => issue.code === 'workbook_ai_metadata_mismatch'),
  'profile validation uses captured descriptor values');
assert.equal(maskedProfileReads, 0);

console.log('V8.1 A35 AI profile catalog: PASS');
