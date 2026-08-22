const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function frozenIssue(code, field) {
  return Object.freeze({ code, field });
}

export const CONTENT_SOURCE_EXPECTATION = Object.freeze({
  sourceId: 'pocketmonster-skill-monster-workbook',
  workbookVersion: '2.1',
  sha256: 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c',
  normalizedSchemaVersion: 1,
});

export const CONTENT_PROVENANCE = Object.freeze({
  ...CONTENT_SOURCE_EXPECTATION,
  sourceType: 'xlsx',
  fileName: 'PocketMonster_Detailed_v2.1_SkillButtonIcons.xlsx',
  reviewedOn: '2026-08-22',
  normalizationMode: 'curated-static-catalog',
  catalogs: Object.freeze(['monsters', 'skills', 'learnsets', 'statuses', 'passives']),
});

export function validateContentProvenance(value, expected = CONTENT_SOURCE_EXPECTATION) {
  const issues = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({ ok: false, issues: Object.freeze([frozenIssue('invalid_metadata', 'root')]) });
  }

  if (typeof value.workbookVersion !== 'string' || value.workbookVersion.trim() === '') {
    issues.push(frozenIssue('missing_workbook_version', 'workbookVersion'));
  } else if (value.workbookVersion !== expected.workbookVersion) {
    issues.push(frozenIssue('workbook_version_mismatch', 'workbookVersion'));
  }

  if (typeof value.sha256 !== 'string' || value.sha256.trim() === '') {
    issues.push(frozenIssue('missing_sha256', 'sha256'));
  } else if (!SHA256_PATTERN.test(value.sha256)) {
    issues.push(frozenIssue('invalid_sha256', 'sha256'));
  } else if (value.sha256 !== expected.sha256) {
    issues.push(frozenIssue('sha256_mismatch', 'sha256'));
  }

  if (value.sourceId !== expected.sourceId) {
    issues.push(frozenIssue('source_id_mismatch', 'sourceId'));
  }
  if (value.normalizedSchemaVersion !== expected.normalizedSchemaVersion) {
    issues.push(frozenIssue('schema_version_mismatch', 'normalizedSchemaVersion'));
  }
  if (value.sourceType !== 'xlsx') {
    issues.push(frozenIssue('invalid_source_type', 'sourceType'));
  }
  if (typeof value.fileName !== 'string' || value.fileName.length === 0 || value.fileName.includes('/') || value.fileName.includes('\\')) {
    issues.push(frozenIssue('invalid_file_name', 'fileName'));
  }
  if (!Array.isArray(value.catalogs) || value.catalogs.length === 0 || value.catalogs.some(id => typeof id !== 'string' || id.length === 0)) {
    issues.push(frozenIssue('invalid_catalog_list', 'catalogs'));
  }

  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertContentProvenance(value, expected = CONTENT_SOURCE_EXPECTATION) {
  const result = validateContentProvenance(value, expected);
  if (!result.ok) {
    const error = new TypeError(`Invalid content provenance: ${result.issues.map(issue => issue.code).join(', ')}`);
    error.code = 'content_provenance_invalid';
    error.issues = result.issues;
    throw error;
  }
  return value;
}
