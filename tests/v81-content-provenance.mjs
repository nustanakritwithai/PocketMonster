import assert from 'node:assert/strict';
import {
  CONTENT_PROVENANCE,
  CONTENT_SOURCE_EXPECTATION,
  assertContentProvenance,
  validateContentProvenance,
} from '../content-provenance.mjs';

const EXPECTED_SHA256 = 'fdda777b1cbb0eeaacb7e02ced3c1c9df1a3af2853bfdf8d1fe902370789e39c';

assert.equal(CONTENT_PROVENANCE.workbookVersion, '2.1', 'the reviewed workbook version stays explicit');
assert.equal(CONTENT_PROVENANCE.sha256, EXPECTED_SHA256, 'the exact reviewed workbook hash stays explicit');
assert.equal(CONTENT_SOURCE_EXPECTATION.sha256, EXPECTED_SHA256, 'validation pins the reviewed workbook hash');
assert.equal(validateContentProvenance(CONTENT_PROVENANCE).ok, true, 'complete reviewed metadata passes');
assert.equal(assertContentProvenance(CONTENT_PROVENANCE), CONTENT_PROVENANCE, 'assertion returns the validated metadata');

const withoutHash = { ...CONTENT_PROVENANCE, sha256: '' };
assert.deepEqual(
  validateContentProvenance(withoutHash).issues.map(issue => issue.code),
  ['missing_sha256'],
  'missing workbook hash is rejected with a stable reason code',
);

const malformedHash = { ...CONTENT_PROVENANCE, sha256: 'abc123' };
assert.deepEqual(
  validateContentProvenance(malformedHash).issues.map(issue => issue.code),
  ['invalid_sha256'],
  'malformed workbook hash is rejected',
);

const wrongHash = { ...CONTENT_PROVENANCE, sha256: `0${EXPECTED_SHA256.slice(1)}` };
assert.deepEqual(
  validateContentProvenance(wrongHash).issues.map(issue => issue.code),
  ['sha256_mismatch'],
  'a different valid hash is rejected',
);

const withoutVersion = { ...CONTENT_PROVENANCE, workbookVersion: '' };
assert.deepEqual(
  validateContentProvenance(withoutVersion).issues.map(issue => issue.code),
  ['missing_workbook_version'],
  'missing workbook version is rejected',
);

const wrongVersion = { ...CONTENT_PROVENANCE, workbookVersion: '2.2' };
assert.deepEqual(
  validateContentProvenance(wrongVersion).issues.map(issue => issue.code),
  ['workbook_version_mismatch'],
  'an unreviewed workbook version is rejected',
);

assert.throws(
  () => assertContentProvenance(wrongHash),
  error => error instanceof TypeError && error.code === 'content_provenance_invalid',
  'invalid provenance cannot cross the catalog boundary',
);

assert.equal(Object.isFrozen(CONTENT_PROVENANCE), true, 'provenance metadata is immutable');
assert.equal(Object.isFrozen(CONTENT_PROVENANCE.catalogs), true, 'nested catalog metadata is immutable');
assert.equal(CONTENT_PROVENANCE.fileName.includes('/'), false, 'runtime metadata does not retain a device-local source path');

console.log('V8.1 content provenance: PASS');
