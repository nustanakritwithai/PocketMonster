import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const output = path.join(root, 'dist-pages');
const manifestPath = path.join(output, 'patch-manifest.json');

assert.equal(fs.existsSync(manifestPath), true,
  'build the Pages artifact before checking the Combat V9.1 closure');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const published = new Set(manifest.files.map(entry => entry.path));
const clientModules = Object.freeze([
  'combat-v91-adapters.mjs',
  'combat-v91-client-store.mjs',
  'combat-v91-contract.mjs',
  'combat-v91-entry.mjs',
  'combat-v91-protocol.mjs',
  'combat-v91-rng.mjs',
  'combat-v91-rules.mjs',
  'combat-v91-status.mjs',
  'combat-v91-ui.mjs',
]);
const clientAssets = Object.freeze([...clientModules, 'combat-v91.css']);

for (const assetName of clientAssets) {
  assert.equal(published.has(assetName), true, `${assetName} must ship in the Pages artifact`);
}
assert.equal([...published].some(name => name.startsWith('combat-v91-server-')), false,
  'Server authority implementations must not be published as browser assets');
assert.equal([...published].some(name => name.startsWith('tests/v91-combat-')), false,
  'V9.1 tests must not ship in the public artifact');
assert.equal(published.has('docs/combat-v91-client-handoff.md'), false,
  'the implementation record is not a runtime asset');

const staticImportPattern = /(?:from\s+|import\s*\()(['"])(\.\.?\/[^'"?#]+)(?:\?[^'"]*)?\1/g;
for (const moduleName of clientModules) {
  const source = fs.readFileSync(path.join(output, moduleName), 'utf8');
  for (const match of source.matchAll(staticImportPattern)) {
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(moduleName), match[2]));
    assert.equal(published.has(dependency), true,
      `${moduleName} import closure is missing ${dependency}`);
  }
}

console.log(`V9.1 Pages artifact: PASS (${clientAssets.length} client assets, server authority excluded)`);
