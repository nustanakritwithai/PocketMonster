export const CONTENT_ID_PATTERNS = Object.freeze({
  monsters: /^MON\d{3}$/,
  skills: /^SK\d{3}$/,
  passives: /^PASS\d{3}$/,
  statuses: /^ST\d{3}$/,
});

export const LEARNSET_METHODS = Object.freeze(['LevelUp', 'Evolution', 'Tutor', 'Breeding', 'RareManual']);
export const CONTENT_STATES = Object.freeze(['Active', 'Deferred']);

const REQUIRED_CATALOGS = Object.freeze(['monsters', 'skills', 'passives', 'statuses', 'learnsets', 'skillStatusLinks']);
const MASTER_CATALOGS = Object.freeze(['monsters', 'skills', 'passives', 'statuses']);
const RUNTIME_ONLY_FIELDS = new Set([
  'currentHp',
  'currentUses',
  'cooldownRemaining',
  'cooldownRemainingMs',
  'ownerState',
  'instanceId',
  'learnedSkills',
  'equippedSkills',
  'statusInstances',
  'runtime',
]);

function issue(code, catalog, index, field, detail = {}) {
  return Object.freeze({ code, catalog, index, field, ...detail });
}

function inspectRuntimeFields(value, catalog, index, path, issues, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, childIndex) => inspectRuntimeFields(entry, catalog, index, `${path}[${childIndex}]`, issues, seen));
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (RUNTIME_ONLY_FIELDS.has(key)) {
      issues.push(issue('runtime_field_in_static_catalog', catalog, index, childPath));
    }
    inspectRuntimeFields(child, catalog, index, childPath, issues, seen);
  }
}

function validateStableIds(catalog, records, issues) {
  const pattern = CONTENT_ID_PATTERNS[catalog];
  const seen = new Map();
  records.forEach((record, index) => {
    const id = record?.id;
    if (typeof id !== 'string' || !pattern.test(id)) {
      issues.push(issue('invalid_id', catalog, index, 'id', { id: id ?? null }));
      return;
    }
    if (seen.has(id)) {
      issues.push(issue('duplicate_id', catalog, index, 'id', { id, firstIndex: seen.get(id) }));
      return;
    }
    seen.set(id, index);
  });
  return new Set(seen.keys());
}

function validateReference(value, targets, catalog, index, field, issues) {
  if (typeof value !== 'string' || !targets.has(value)) {
    issues.push(issue('dangling_reference', catalog, index, field, { reference: value ?? null }));
  }
}

export function validateContentBundle(bundle) {
  const issues = [];
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    return Object.freeze({ ok: false, issues: Object.freeze([issue('invalid_bundle', 'root', -1, 'root')]) });
  }

  const catalogs = {};
  for (const name of REQUIRED_CATALOGS) {
    if (!Array.isArray(bundle[name])) {
      issues.push(issue('missing_catalog', name, -1, name));
      catalogs[name] = [];
    } else {
      catalogs[name] = bundle[name];
    }
  }

  const monsterIds = validateStableIds('monsters', catalogs.monsters, issues);
  const skillIds = validateStableIds('skills', catalogs.skills, issues);
  const passiveIds = validateStableIds('passives', catalogs.passives, issues);
  const statusIds = validateStableIds('statuses', catalogs.statuses, issues);

  for (const catalog of MASTER_CATALOGS) {
    catalogs[catalog].forEach((record, index) => {
      inspectRuntimeFields(record, catalog, index, '', issues, new Set());
    });
  }

  catalogs.monsters.forEach((record, index) => {
    if (record?.passiveId != null && record.passiveId !== '') {
      validateReference(record.passiveId, passiveIds, 'monsters', index, 'passiveId', issues);
    }
  });

  catalogs.learnsets.forEach((record, index) => {
    validateReference(record?.monsterId, monsterIds, 'learnsets', index, 'monsterId', issues);
    validateReference(record?.skillId, skillIds, 'learnsets', index, 'skillId', issues);
    if (!LEARNSET_METHODS.includes(record?.method)) {
      issues.push(issue('invalid_enum', 'learnsets', index, 'method', { value: record?.method ?? null }));
    }
    if (!CONTENT_STATES.includes(record?.state)) {
      issues.push(issue('invalid_enum', 'learnsets', index, 'state', { value: record?.state ?? null }));
    }
  });

  catalogs.skillStatusLinks.forEach((record, index) => {
    validateReference(record?.skillId, skillIds, 'skillStatusLinks', index, 'skillId', issues);
    validateReference(record?.statusId, statusIds, 'skillStatusLinks', index, 'statusId', issues);
  });

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertContentBundle(bundle) {
  const result = validateContentBundle(bundle);
  if (!result.ok) {
    const error = new TypeError(`Invalid content bundle: ${result.issues.map(entry => entry.code).join(', ')}`);
    error.code = 'content_bundle_invalid';
    error.issues = result.issues;
    throw error;
  }
  return bundle;
}
