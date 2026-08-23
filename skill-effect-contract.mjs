import { CONTENT_PROVENANCE, assertContentProvenance } from './content-provenance.mjs';
import { SKILL_CATALOG } from './skill-catalog.mjs';
import { SKILL_STATUS_LINKS } from './status-catalog.mjs';

assertContentProvenance(CONTENT_PROVENANCE);

export const SKILL_EFFECT_CONTRACT_VERSION = 'skill-effect-coverage/v1';

export const SKILL_EFFECT_SLICES = Object.freeze({
  DIRECT_STATUS: 'E1_DIRECT_DAMAGE_STATUS',
  SELF_SURVIVAL: 'E2_SELF_HEAL_BUFF_SHIELD',
  GROUND_FIELD: 'E3_GROUND_POINT_FIELD',
  MOBILITY_CONTROL: 'E4_MOVEMENT_DISPLACEMENT',
});

export const SKILL_EFFECT_COMPONENT_KINDS = Object.freeze([
  'direct_damage',
  'status',
  'attack_modifier',
  'damage_modifier',
  'damage_shape',
  'self_heal',
  'field',
  'movement',
  'displacement',
  'summon',
  'heal_modifier',
]);

const EFFECT_CLASS_POLICY = Object.freeze({
  DirectMechanic: Object.freeze({ executorFamily: 'direct_damage', componentKind: null }),
  AttackModifier: Object.freeze({ executorFamily: 'attack_modifier', componentKind: 'attack_modifier' }),
  Status: Object.freeze({ executorFamily: 'status', componentKind: 'status' }),
  Displacement: Object.freeze({ executorFamily: 'displacement', componentKind: 'displacement' }),
  DamageShape: Object.freeze({ executorFamily: 'damage_shape', componentKind: 'damage_shape' }),
  Heal: Object.freeze({ executorFamily: 'self_heal', componentKind: 'self_heal' }),
  FieldMechanic: Object.freeze({ executorFamily: 'field', componentKind: 'field' }),
  Movement: Object.freeze({ executorFamily: 'movement', componentKind: 'movement' }),
  DamageModifier: Object.freeze({ executorFamily: 'damage_modifier', componentKind: 'damage_modifier' }),
  Summon: Object.freeze({ executorFamily: 'summon', componentKind: 'summon' }),
  MultiStatus: Object.freeze({ executorFamily: 'status', componentKind: 'status' }),
  HealModifier: Object.freeze({ executorFamily: 'heal_modifier', componentKind: 'heal_modifier' }),
});

export const KNOWN_SKILL_EFFECTS_BY_CLASS = Object.freeze({
  DirectMechanic: Object.freeze(['None']),
  AttackModifier: Object.freeze(['QuickHit', 'MultiHit']),
  Status: Object.freeze([
    'ATKUp', 'Stagger', 'CritUp', 'Burn', 'FireResist', 'BurnArea', 'DamageReduce',
    'Slow', 'DEFUp', 'Root', 'Paralyze', 'SPATKUp', 'ShockArea', 'FreezeChance',
    'Stun', 'ArmorBreak', 'SlowArea', 'SPDUp', 'Bleed', 'Poison', 'PoisonResist',
    'PoisonArea', 'DEFDown', 'StrongPoison', 'EvasionUp', 'Fear', 'DamageAmp',
    'ATKDEFUp', 'AccuracyDown', 'Confuse', 'DoT', 'ATKDown', 'FearArea',
  ]),
  Displacement: Object.freeze(['Knockback', 'Pull']),
  DamageShape: Object.freeze(['Splash', 'AreaBurst', 'LineShot', 'Pierce']),
  Heal: Object.freeze(['Heal']),
  FieldMechanic: Object.freeze(['Wall', 'AreaHazard']),
  Movement: Object.freeze(['Burrow', 'Dash', 'Blink']),
  DamageModifier: Object.freeze(['BonusVsDark', 'ArmorPierce']),
  Summon: Object.freeze(['SummonSwarm']),
  MultiStatus: Object.freeze(['BurnParalyze']),
  HealModifier: Object.freeze(['LifeSteal']),
});

const KNOWN_COMPONENT_KINDS = new Set(SKILL_EFFECT_COMPONENT_KINDS);
const KNOWN_EFFECTS = new Map(Object.entries(KNOWN_SKILL_EFFECTS_BY_CLASS)
  .map(([effectClass, effects]) => [effectClass, new Set(effects)]));

function contractError(code, detail = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, detail);
  return error;
}

function componentPolicy(kind, statusLinks = []) {
  if (kind === 'status') {
    const modes = new Set(statusLinks.map(link => link.applicationMode));
    const selfOnly = modes.size === 1 && modes.has('Self');
    return selfOnly
      ? { slice: SKILL_EFFECT_SLICES.SELF_SURVIVAL, targetChannel: 'actor' }
      : { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'command_targets' };
  }
  if (kind === 'self_heal') return { slice: SKILL_EFFECT_SLICES.SELF_SURVIVAL, targetChannel: 'actor' };
  if (kind === 'field') return { slice: SKILL_EFFECT_SLICES.GROUND_FIELD, targetChannel: 'target_point' };
  if (kind === 'movement') return { slice: SKILL_EFFECT_SLICES.MOBILITY_CONTROL, targetChannel: 'actor' };
  if (kind === 'displacement') return { slice: SKILL_EFFECT_SLICES.MOBILITY_CONTROL, targetChannel: 'command_targets' };
  if (kind === 'summon') return { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'target_point' };
  if (kind === 'heal_modifier') return { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'actor' };
  return { slice: SKILL_EFFECT_SLICES.DIRECT_STATUS, targetChannel: 'command_targets' };
}

function freezeComponent(kind, statusLinks = []) {
  const policy = componentPolicy(kind, statusLinks);
  return Object.freeze({ kind, ...policy });
}

function buildContractRow(skill, linksBySkill) {
  const policy = EFFECT_CLASS_POLICY[skill?.effectClass];
  if (!policy) throw contractError('unknown_effect_class', { skillId: skill?.id ?? null });
  if (!KNOWN_EFFECTS.get(skill.effectClass)?.has(skill.effect)) {
    throw contractError('unknown_effect', { skillId: skill.id, effect: skill.effect });
  }

  const statusLinks = linksBySkill.get(skill.id) ?? [];
  if (statusLinks.length !== skill.statusLinkCount) {
    throw contractError('status_link_count_mismatch', {
      skillId: skill.id,
      expected: skill.statusLinkCount,
      actual: statusLinks.length,
    });
  }
  const statusClass = skill.effectClass === 'Status' || skill.effectClass === 'MultiStatus';
  if (statusClass !== (statusLinks.length > 0)) {
    throw contractError('status_component_link_mismatch', { skillId: skill.id });
  }

  const components = [];
  if (skill.directDamage) components.push(freezeComponent('direct_damage'));
  if (policy.componentKind) components.push(freezeComponent(policy.componentKind, statusLinks));
  if (components.length === 0) throw contractError('effect_without_component', { skillId: skill.id });

  const slices = Object.freeze([...new Set(components.map(component => component.slice))]);
  const statusLinkIds = Object.freeze(statusLinks.map(link => link.id));
  const statusIds = Object.freeze(statusLinks.map(link => link.statusId));
  return Object.freeze({
    schemaVersion: SKILL_EFFECT_CONTRACT_VERSION,
    skillId: skill.id,
    effectClass: skill.effectClass,
    effect: skill.effect,
    targetType: skill.targetType,
    applicationMode: skill.applicationMode,
    directDamage: skill.directDamage,
    executorFamily: policy.executorFamily,
    components: Object.freeze(components),
    implementationSlices: slices,
    statusLinkIds,
    statusIds,
    activation: 'contract_only',
    sourceWorkbookVersion: CONTENT_PROVENANCE.workbookVersion,
  });
}

export function buildSkillEffectCoverageContract(skills = SKILL_CATALOG, links = SKILL_STATUS_LINKS) {
  if (!Array.isArray(skills) || !Array.isArray(links)) throw contractError('invalid_contract_source');
  const linksBySkill = new Map();
  for (const link of links) {
    const list = linksBySkill.get(link.skillId) ?? [];
    list.push(link);
    linksBySkill.set(link.skillId, list);
  }
  return Object.freeze(skills.map(skill => buildContractRow(skill, linksBySkill)));
}

export const SKILL_EFFECT_COVERAGE_CONTRACT = buildSkillEffectCoverageContract();

const CONTRACT_BY_SKILL_ID = new Map(SKILL_EFFECT_COVERAGE_CONTRACT.map(row => [row.skillId, row]));

function issue(code, index, field, detail = {}) {
  return Object.freeze({ code, index, field, ...detail });
}

export function validateSkillEffectCoverageContract(records, skills = SKILL_CATALOG, links = SKILL_STATUS_LINKS) {
  if (!Array.isArray(records) || !Array.isArray(skills) || !Array.isArray(links)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_contract', -1, 'root')]) });
  }

  const issues = [];
  let expected = null;
  try {
    expected = buildSkillEffectCoverageContract(skills, links);
  } catch (error) {
    issues.push(issue(error.code ?? 'invalid_contract_source', -1, 'source', {
      skillId: error.skillId ?? null,
    }));
  }
  if (records.length !== skills.length || records.length !== 108) {
    issues.push(issue('coverage_count_mismatch', -1, 'length', { value: records.length }));
  }

  const ids = new Set();
  records.forEach((row, index) => {
    if (!row || typeof row !== 'object') {
      issues.push(issue('invalid_contract_row', index, 'root'));
      return;
    }
    if (ids.has(row.skillId)) issues.push(issue('duplicate_skill_coverage', index, 'skillId', { skillId: row.skillId }));
    ids.add(row.skillId);
    if (row.activation !== 'contract_only') issues.push(issue('runtime_activation_forbidden', index, 'activation'));
    if (!Object.values(EFFECT_CLASS_POLICY).some(policy => policy.executorFamily === row.executorFamily)) {
      issues.push(issue('unknown_executor_family', index, 'executorFamily', { value: row.executorFamily ?? null }));
    }
    if (!Array.isArray(row.components) || row.components.length === 0) {
      issues.push(issue('missing_effect_components', index, 'components'));
    } else {
      for (const component of row.components) {
        if (!KNOWN_COMPONENT_KINDS.has(component?.kind)) {
          issues.push(issue('unknown_effect_component', index, 'components', { value: component?.kind ?? null }));
        }
      }
    }
    const expectedRow = expected?.find(candidate => candidate.skillId === row.skillId);
    if (!expectedRow) {
      issues.push(issue('unknown_skill_coverage', index, 'skillId', { skillId: row.skillId ?? null }));
    } else if (JSON.stringify(row) !== JSON.stringify(expectedRow)) {
      issues.push(issue('contract_row_mismatch', index, 'row', { skillId: row.skillId }));
    }
  });

  if (expected) {
    for (const row of expected) {
      if (!ids.has(row.skillId)) issues.push(issue('missing_skill_coverage', -1, 'skillId', { skillId: row.skillId }));
    }
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function skillEffectCoverageEntry(skillId) {
  return CONTRACT_BY_SKILL_ID.get(skillId) ?? null;
}
