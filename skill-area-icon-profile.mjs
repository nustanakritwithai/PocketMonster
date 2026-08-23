// Monster Life RPG V8.8 — EnemyArea elemental icon families.
// Profiles are presentation-only. Exact SkillID remains the cache/join identity.

import {
  LIVE_SKILL_ICON_CATALOG,
  skillButtonIconContract,
} from './skill-icon-runtime.mjs';

const PROFILE_ROWS = [
  ['NORMAL',   'impact-pulse',    '◉', '⋆', 'rings'],
  ['FIRE',     'flame-ring',      '🔥', '✹', 'flames'],
  ['WATER',    'water-ripple',    '💧', '≋', 'ripples'],
  ['GRASS',    'vine-bloom',      '☘', '❧', 'vines'],
  ['ELECTRIC', 'lightning-field', '⚡', '⌁', 'bolts'],
  ['ICE',      'frost-crystal',   '❄', '✶', 'crystals'],
  ['ROCK',     'stone-shards',    '◆', '▲', 'shards'],
  ['GROUND',   'earth-fissure',   '╳', '⌁', 'fissures'],
  ['FLYING',   'wind-cyclone',    '🌪', '≋', 'gusts'],
  ['POISON',   'toxic-pool',      '☠', '∴', 'bubbles'],
  ['DARK',     'shadow-vortex',   '☾', '●', 'vortex'],
  ['LIGHT',    'radiant-halo',    '✦', '☆', 'rays'],
  ['PSYCHIC',  'mind-wave',       '◉', '∿', 'waves'],
  ['BUG',      'swarm-hive',      '⬡', '∴', 'swarm'],
  ['DRAGON',   'dragon-crest',    '⛊', '✹', 'breath'],
  ['FIGHTING', 'combat-impact',   '✊', '✷', 'impacts'],
  ['STEEL',    'metal-grid',      '⚙', '▦', 'plates'],
  ['GHOST',    'spirit-ring',     '👻', '◌', 'spirits'],
];

export const AREA_TYPE_PROFILES = Object.freeze(Object.fromEntries(PROFILE_ROWS.map(([
  sourceType, familyId, familyGlyph, particleGlyph, drawPattern,
]) => [sourceType, Object.freeze({
  sourceType,
  familyId,
  familyGlyph,
  particleGlyph,
  drawPattern,
})])));

function areaRow(contract) {
  const profile = AREA_TYPE_PROFILES[contract.sourceType];
  if (!profile) throw new TypeError(`Missing EnemyArea family for ${contract.sourceType}`);
  return Object.freeze({
    skillId: contract.skillId,
    sourceType: contract.sourceType,
    runtimeType: contract.runtimeType,
    category: contract.category,
    categoryMarker: contract.categoryMarker,
    effect: contract.effect,
    effectOverlay: contract.effectOverlay,
    familyId: profile.familyId,
    familyGlyph: profile.familyGlyph,
    particleGlyph: profile.particleGlyph,
    drawPattern: profile.drawPattern,
    compositeCacheKey: [
      contract.skillId,
      profile.familyId,
      contract.category,
      contract.effect,
    ].join('|'),
  });
}

export const ENEMY_AREA_ICON_CATALOG = Object.freeze(
  LIVE_SKILL_ICON_CATALOG.filter(contract => contract.mainKind === 'area').map(areaRow),
);

const AREA_ICON_BY_SKILL_ID = new Map(ENEMY_AREA_ICON_CATALOG.map(row => [row.skillId, row]));

export function enemyAreaIconProfile(skillId) {
  return typeof skillId === 'string' ? AREA_ICON_BY_SKILL_ID.get(skillId) ?? null : null;
}

function issue(code, index, detail = {}) {
  return Object.freeze({ code, index, ...detail });
}

export function validateEnemyAreaIconCatalog(records) {
  if (!Array.isArray(records)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_catalog', -1)]) });
  }
  const issues = [];
  const skillIds = new Set();
  const cacheKeys = new Set();
  if (records.length !== 51) issues.push(issue('enemy_area_count_mismatch', -1, { value: records.length }));
  records.forEach((record, index) => {
    if (!record || typeof record !== 'object') {
      issues.push(issue('invalid_record', index));
      return;
    }
    const contract = skillButtonIconContract(record.skillId);
    const profile = AREA_TYPE_PROFILES[record.sourceType];
    if (!contract || contract.mainKind !== 'area') {
      issues.push(issue('not_enemy_area_skill', index, { skillId: record.skillId ?? null }));
      return;
    }
    if (!profile) issues.push(issue('unknown_type_family', index, { sourceType: record.sourceType }));
    if (skillIds.has(record.skillId)) issues.push(issue('duplicate_skill_id', index, { skillId: record.skillId }));
    if (cacheKeys.has(record.compositeCacheKey)) {
      issues.push(issue('duplicate_cache_key', index, { compositeCacheKey: record.compositeCacheKey }));
    }
    skillIds.add(record.skillId);
    cacheKeys.add(record.compositeCacheKey);
    const expected = areaRow(contract);
    for (const field of [
      'sourceType', 'runtimeType', 'category', 'categoryMarker', 'effect', 'effectOverlay',
      'familyId', 'familyGlyph', 'particleGlyph', 'drawPattern', 'compositeCacheKey',
    ]) {
      if (record[field] !== expected[field]) {
        issues.push(issue('profile_mismatch', index, { field, skillId: record.skillId }));
      }
    }
  });
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

const validation = validateEnemyAreaIconCatalog(ENEMY_AREA_ICON_CATALOG);
if (!validation.ok) throw new TypeError('Invalid EnemyArea elemental icon catalog');
