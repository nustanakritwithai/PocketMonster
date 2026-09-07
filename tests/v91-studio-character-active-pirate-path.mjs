import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as vendor from '../pirate-fruit-offline/assets/vendor-three-Bv6LZXUZ.js';
import { threeFromPirateFruitVendor } from '../asset-presentation/pirate-fruit-client-bridge.mjs';

// Static route coverage only; mobile visual QA remains the release gate.
const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const boot = read('boot-pirate-fruit-v900.mjs');
const client = read('pirate-fruit-offline/pocket-presentation.mjs');
const bridge = read('asset-presentation/pirate-fruit-client-bridge.mjs');

// The default combined-world route enters this boot module. The broker must
// remain outside the opaque Pirate iframe and must not weaken its sandbox.
assert.match(boot, /loadStudioCharacterFromEngine\(\)/);
assert.match(boot, /studioCapability/);
assert.match(boot, /PIRATE_STUDIO_CHARACTER_READY/);
assert.match(boot, /PIRATE_STUDIO_CHARACTER_PACKAGE/);
assert.match(boot, /frame\.contentWindow\?\.postMessage\([\s\S]*PIRATE_STUDIO_CHARACTER_PACKAGE/);
assert.doesNotMatch(boot, /allow-same-origin/);

// The sandboxed child admits only its authenticated parent + session
// capability, then hands the package to the live AssetEngine bridge.
assert.match(client, /event\.source !== window\.parent \|\| event\.origin !== parentOrigin/);
assert.match(client, /message\?\.capability === studioCapability && message\.type === PIRATE_STUDIO_CHARACTER_PACKAGE/);
assert.match(client, /receivePirateStudioCharacterPackage\(message\.package\)/);
assert.match(client, /PIRATE_STUDIO_CHARACTER_READY/);

// The active attachVisual path retains a Pirate fallback until a non-empty
// Studio root has been attached; Studio owns its own pose afterwards.
assert.match(bridge, /registerProvider\('studio-character'/);
assert.match(bridge, /assets\.spawn\('character\.human\.pirate-fruit\.v1'/);
assert.match(bridge, /visibleStudioRoot\(studio\)/);
assert.match(bridge, /item\.host\.add\(studio\.root\)/);
assert.match(bridge, /item\.handle\.root\.visible = false/);
assert.match(bridge, /item\.rigRetargeter = null/);

const kit = threeFromPirateFruitVendor(vendor);
for (const name of ['Group', 'Mesh', 'BufferGeometry', 'BufferAttribute', 'Vector3', 'Box3']) {
  assert.equal(typeof kit[name], 'function', `active vendor adapter must expose ${name}`);
}

console.log('V9.1 active Pirate Studio path gate passed');
