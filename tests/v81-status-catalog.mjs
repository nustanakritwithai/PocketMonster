import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SKILL_CATALOG } from '../skill-catalog.mjs';
import {
  SKILL_STATUS_LINKS,
  STATUS_CATALOG,
  statusCatalogEntry,
  validateStatusCatalog,
} from '../status-catalog.mjs';

assert.equal(STATUS_CATALOG.length, 26, 'all 26 reviewed statuses are normalized');
assert.equal(SKILL_STATUS_LINKS.length, 69, 'all 69 reviewed skill-status links are normalized');
assert.equal(new Set(STATUS_CATALOG.map(status => status.id)).size, 26, 'status IDs are unique');
assert.equal(new Set(SKILL_STATUS_LINKS.map(link => link.id)).size, 69, 'link IDs are unique');
assert.equal(validateStatusCatalog(STATUS_CATALOG, SKILL_STATUS_LINKS).ok, true, 'the reviewed status graph passes');

const digest = createHash('sha256')
  .update(JSON.stringify({ statuses: STATUS_CATALOG, links: SKILL_STATUS_LINKS }))
  .digest('hex');
assert.equal(digest, '953223e46d6cf2498d96b416d73779918ed1b29504a211948d93264c95c2c4a2', 'the normalized status graph stays tied to its provenance review');

const burn = statusCatalogEntry('ST_BURN');
assert.equal(burn.nameEN, 'Burn');
assert.equal(burn.category, 'DoT');
assert.equal(burn.baseDurationSec, 5);
assert.equal(burn.tickIntervalSec, 1);
assert.equal(burn.activation, 'catalog_only', 'status mechanics are not activated by catalog import');
assert.equal(statusCatalogEntry('ST_UNKNOWN'), null, 'unknown status IDs resolve to null');

const actualLinkCounts = new Map();
for (const link of SKILL_STATUS_LINKS) actualLinkCounts.set(link.skillId, (actualLinkCounts.get(link.skillId) ?? 0) + 1);
for (const skill of SKILL_CATALOG) {
  assert.equal(actualLinkCounts.get(skill.id) ?? 0, skill.statusLinkCount, `${skill.id} link count matches Skill_Master`);
}

assert.equal(Object.isFrozen(STATUS_CATALOG), true, 'status catalog is immutable');
assert.equal(Object.isFrozen(STATUS_CATALOG[0]), true, 'status records are immutable');
assert.equal(Object.isFrozen(SKILL_STATUS_LINKS[0]), true, 'link records are immutable');
assert.equal('remainingDurationSec' in burn, false, 'encounter duration state does not leak into masters');
assert.equal('currentStacks' in burn, false, 'encounter stacks do not leak into masters');

const unknownStatus = SKILL_STATUS_LINKS.map(link => ({ ...link }));
unknownStatus[0].statusId = 'ST_UNKNOWN';
assert.ok(validateStatusCatalog(STATUS_CATALOG, unknownStatus).issues.some(issue => issue.code === 'unknown_status_reference'), 'unknown status links fail');

const unknownSkill = SKILL_STATUS_LINKS.map(link => ({ ...link }));
unknownSkill[0].skillId = 'SK_NORMAL_99';
assert.ok(validateStatusCatalog(STATUS_CATALOG, unknownSkill).issues.some(issue => issue.code === 'unknown_skill_reference'), 'unknown skill links fail');

const badChance = SKILL_STATUS_LINKS.map(link => ({ ...link }));
badChance[0].finalBaseChancePct = 101;
assert.ok(validateStatusCatalog(STATUS_CATALOG, badChance).issues.some(issue => issue.code === 'invalid_link_chance'), 'out-of-range status chance fails');

const runtimeLeak = STATUS_CATALOG.map(status => ({ ...status }));
runtimeLeak[0].remainingDurationSec = 3;
assert.ok(validateStatusCatalog(runtimeLeak, SKILL_STATUS_LINKS).issues.some(issue => issue.code === 'runtime_field_in_status_master'), 'runtime encounter state fails');

console.log('V8.1 status catalog: PASS');
