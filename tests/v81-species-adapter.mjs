import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MONSTER_CATALOG, createSpeciesCatalogAdapter } from '../monster-catalog.mjs';
import { instanceSpeciesIdentity, normalizeInstance } from '../monster-instance.mjs';

const runtimeSpecies = MONSTER_CATALOG.map(entry => ({
  id: entry.runtimeSpeciesId,
  name: entry.runtimeName,
  types: [entry.runtimeType],
}));
const adapter = createSpeciesCatalogAdapter(runtimeSpecies);
assert.equal(adapter.diagnostics.length, 0, 'all 18 live runtime species resolve without diagnostics');
assert.equal(Object.keys(adapter.byId).length, 18, 'adapter indexes all live species');

const fire = adapter.resolve('flameling');
assert.equal(fire.ok, true);
assert.equal(fire.species, runtimeSpecies[1], 'adapter preserves the existing runtime species object');
assert.equal(fire.mapping.workbookBaseMonsterId, 'MON_002');
assert.equal(fire.mapping.workbookStage2MonsterId, 'MON_020');

const unknown = adapter.resolve('missing-species');
assert.deepEqual(
  { ok: unknown.ok, reason: unknown.reason, runtimeSpeciesId: unknown.runtimeSpeciesId },
  { ok: false, reason: 'unknown_species_id', runtimeSpeciesId: 'missing-species' },
  'unknown species return a stable diagnostic instead of inventing a mapping',
);

const mismatchRecords = runtimeSpecies.map(species => ({ ...species, types: [...species.types] }));
mismatchRecords[1].types[0] = 'Water';
const mismatch = createSpeciesCatalogAdapter(mismatchRecords);
assert.ok(mismatch.diagnostics.some(issue => issue.code === 'runtime_type_mismatch' && issue.runtimeSpeciesId === 'flameling'), 'type drift is diagnostic');

const instance = normalizeInstance({ instanceId: 'known-1', speciesId: 'flameling' }, { now: 1000 });
const identity = instanceSpeciesIdentity(instance);
assert.equal(identity.ok, true);
assert.equal(identity.runtimeSpeciesId, 'flameling');
assert.equal(identity.workbookBaseMonsterId, 'MON_002');

const legacy = normalizeInstance({ instanceId: 'legacy-1', speciesId: 'flame_slime' }, { now: 1000 });
const legacyIdentity = instanceSpeciesIdentity(legacy);
assert.equal(legacy.speciesId, 'flame_slime', 'unknown legacy identity is preserved for migration diagnostics');
assert.equal(legacyIdentity.ok, false);
assert.equal(legacyIdentity.reason, 'unknown_species_id');

const game = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
assert.match(game, /import\s*\{[^}]*\bcreateSpeciesCatalogAdapter\b[^}]*\}\s*from '\.\/monster-catalog\.mjs'/s, 'live runtime imports the catalog adapter');
assert.match(game, /const speciesCatalogAdapter=createSpeciesCatalogAdapter\(species\)/, 'live runtime validates the current species roster');
assert.match(game, /const spById=speciesCatalogAdapter\.byId/, 'live lookups use the adapter index');
assert.doesNotMatch(game, /const spById=Object\.fromEntries\(species\.map/, 'legacy direct index construction is removed');

console.log('V8.1 species adapter: PASS');
