// PocketMonster V8.1 A35 — immutable Monster_Profile AI metadata.
// Role, PreferredRange, and AIStyle are descriptive only. The workbook does
// not define numeric style weights or manual-skill priority behavior.

import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { MONSTER_CATALOG, monsterCatalogEntry } from './monster-catalog.mjs';
import { passiveSpeciesProfile } from './passive-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

const RAW_AI_METADATA = [
  ['normalooze', 'Balanced', 'Mid', 'Adaptive'],
  ['flameling', 'Burst', 'Mid', 'BurstWindow'],
  ['aquapuff', 'Sustain', 'Mid', 'KiteAndRecover'],
  ['voltkit', 'Speed', 'Close/Mid', 'HitAndRun'],
  ['mossbun', 'Support', 'Back', 'ProtectAndHeal'],
  ['frostowl', 'Control', 'Mid', 'ZoneControl'],
  ['punchcub', 'Combo', 'Close', 'ChaseCombo'],
  ['toxitoad', 'DoT', 'Mid', 'KeepDebuff'],
  ['sandmole', 'Bruiser', 'Close', 'Pressure'],
  ['galebird', 'Mobility', 'Mid', 'HitAndRun'],
  ['mindcoon', 'Control', 'Mid', 'ZoneControl'],
  ['buglet', 'Utility', 'Mid', 'Disrupt'],
  ['rockhorn', 'Tank', 'Close', 'HoldFront'],
  ['ghostpurr', 'Trickster', 'Mid', 'BaitAndBlink'],
  ['emberdrake', 'Scaler', 'Mid', 'SafeThenBurst'],
  ['voidhorn', 'Assassin', 'Close', 'Flank'],
  ['ironbug', 'Tank', 'Close', 'HoldFront'],
  ['fairimp', 'Healer', 'Back', 'StayBack'],
];

const AI_PROFILE_FIELDS = Object.freeze([
  'runtimeSpeciesId',
  'workbookBaseMonsterId',
  'workbookStage2MonsterId',
  'role',
  'preferredRange',
  'aiStyle',
  'passive1Id',
  'basePassive2Id',
  'stage2Passive2Id',
  'sourceWorkbookVersion',
]);
const AI_PROFILE_FIELD_SET = new Set(AI_PROFILE_FIELDS);
const FORBIDDEN_AI_RUNTIME_FIELDS = new Set([
  'weights',
  'styleWeights',
  'conditionWeights',
  'skillPriority',
  'skillWeights',
  'manualSkillSlot',
  'manualSkillSlots',
  'currentTargetId',
  'cooldownRemainingSec',
  'currentUses',
  'attackRangeM',
  'acquireRangeM',
  'retainRangeM',
]);
const EXPECTED_AI_METADATA = new Map(RAW_AI_METADATA.map(([
  runtimeSpeciesId,
  role,
  preferredRange,
  aiStyle,
]) => [runtimeSpeciesId, Object.freeze({ role, preferredRange, aiStyle })]));

export const AI_PROFILE_POLICY = Object.freeze({
  authorityRange: 'Monster_Profile!G,U:X',
  workbookRowCount: 36,
  familyProfileCount: 18,
  stagePairPolicy: 'identical_ai_metadata',
  profileMetadataOnly: true,
  numericStyleWeights: 'not_defined',
  skillPriority: 'deferred_AI_Skill_Priority_TODO',
  behaviorAuthority: 'runtime_compatibility_only',
  lightRuntimeActivation: 'deferred_D2',
  sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  sourceWorkbookSha256: CONTENT_PROVENANCE.sha256,
});

export const AI_PROFILE_CATALOG = Object.freeze(RAW_AI_METADATA.map(([
  runtimeSpeciesId,
  role,
  preferredRange,
  aiStyle,
]) => {
  const mapping = monsterCatalogEntry(runtimeSpeciesId);
  const passiveProfile = passiveSpeciesProfile(runtimeSpeciesId);
  if (!mapping || !passiveProfile) {
    throw new TypeError(`Missing A35 dependency mapping for ${runtimeSpeciesId}`);
  }
  return Object.freeze({
    runtimeSpeciesId,
    workbookBaseMonsterId: mapping.workbookBaseMonsterId,
    workbookStage2MonsterId: mapping.workbookStage2MonsterId,
    role,
    preferredRange,
    aiStyle,
    passive1Id: passiveProfile.passive1Id,
    basePassive2Id: null,
    stage2Passive2Id: passiveProfile.passive2Id,
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  });
}));

const AI_PROFILE_BY_SPECIES = new Map(AI_PROFILE_CATALOG.map(profile => [
  profile.runtimeSpeciesId,
  profile,
]));

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

function dataArraySnapshot(value) {
  if (!Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Array.prototype && prototype !== null) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || !keys.includes('length')) return null;
  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const field = String(index);
    if (!keys.includes(field)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    snapshot[index] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function inspectDataRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  const values = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    values[key] = descriptor.value;
  }
  return Object.freeze({ keys: Object.freeze([...keys]), values: Object.freeze(values) });
}

function validateAiProfileCatalogInternal(records) {
  const profiles = dataArraySnapshot(records);
  if (!profiles) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });
  }

  const issues = [];
  if (profiles.length !== MONSTER_CATALOG.length) {
    issues.push(issue('ai_profile_count_mismatch', -1, 'length', { value: profiles.length }));
  }

  const runtimeIds = new Set();
  const baseIds = new Set();
  const stage2Ids = new Set();

  for (let index = 0; index < profiles.length; index += 1) {
    const inspected = inspectDataRecord(profiles[index]);
    if (!inspected) {
      issues.push(issue('invalid_ai_profile', index, 'root'));
      continue;
    }
    const profile = inspected.values;

    for (const key of inspected.keys) {
      if (typeof key !== 'string') {
        issues.push(issue('invalid_ai_profile_field', index, 'root'));
      } else if (FORBIDDEN_AI_RUNTIME_FIELDS.has(key)) {
        issues.push(issue('forbidden_ai_runtime_field', index, key));
      } else if (!AI_PROFILE_FIELD_SET.has(key)) {
        issues.push(issue('unexpected_ai_profile_field', index, key));
      }
    }
    for (const field of AI_PROFILE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(profile, field)) {
        issues.push(issue('missing_ai_profile_field', index, field));
      }
    }

    if (runtimeIds.has(profile.runtimeSpeciesId)) {
      issues.push(issue('duplicate_runtime_species', index, 'runtimeSpeciesId', { id: profile.runtimeSpeciesId }));
    }
    runtimeIds.add(profile.runtimeSpeciesId);
    if (baseIds.has(profile.workbookBaseMonsterId)) {
      issues.push(issue('duplicate_base_monster', index, 'workbookBaseMonsterId', { id: profile.workbookBaseMonsterId }));
    }
    baseIds.add(profile.workbookBaseMonsterId);
    if (stage2Ids.has(profile.workbookStage2MonsterId)) {
      issues.push(issue('duplicate_stage2_monster', index, 'workbookStage2MonsterId', { id: profile.workbookStage2MonsterId }));
    }
    stage2Ids.add(profile.workbookStage2MonsterId);

    const mapping = monsterCatalogEntry(profile.runtimeSpeciesId);
    if (!mapping
      || profile.workbookBaseMonsterId !== mapping.workbookBaseMonsterId
      || profile.workbookStage2MonsterId !== mapping.workbookStage2MonsterId) {
      issues.push(issue('workbook_monster_mapping_mismatch', index, 'runtimeSpeciesId'));
    }

    const expectedMetadata = EXPECTED_AI_METADATA.get(profile.runtimeSpeciesId);
    if (!expectedMetadata
      || profile.role !== expectedMetadata.role
      || profile.preferredRange !== expectedMetadata.preferredRange
      || profile.aiStyle !== expectedMetadata.aiStyle) {
      issues.push(issue('workbook_ai_metadata_mismatch', index, 'aiMetadata'));
    }

    const passiveProfile = passiveSpeciesProfile(profile.runtimeSpeciesId);
    if (!passiveProfile
      || profile.passive1Id !== passiveProfile.passive1Id
      || profile.basePassive2Id !== null
      || profile.stage2Passive2Id !== passiveProfile.passive2Id) {
      issues.push(issue('workbook_passive_mapping_mismatch', index, 'passiveId'));
    }
    if (profile.sourceWorkbookVersion !== CONTENT_PROVENANCE.workbookVersion) {
      issues.push(issue('workbook_version_mismatch', index, 'sourceWorkbookVersion'));
    }
  }

  for (const mapping of MONSTER_CATALOG) {
    if (!runtimeIds.has(mapping.runtimeSpeciesId)) {
      issues.push(issue('missing_runtime_species', -1, 'runtimeSpeciesId', { id: mapping.runtimeSpeciesId }));
    }
  }

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function validateAiProfileCatalog(records) {
  try {
    return validateAiProfileCatalogInternal(records);
  } catch {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1, 'root')]) });
  }
}

export function aiProfileEntry(runtimeSpeciesId) {
  return AI_PROFILE_BY_SPECIES.get(runtimeSpeciesId) ?? null;
}

const validation = validateAiProfileCatalog(AI_PROFILE_CATALOG);
if (!validation.ok) {
  throw new TypeError(`Invalid AI profile catalog: ${validation.issues.map(entry => entry.code).join(', ')}`);
}
