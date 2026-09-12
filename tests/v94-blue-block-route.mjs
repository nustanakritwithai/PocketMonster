import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const boot = read('boot-pirate-fruit-v900.mjs');
const child = read('pirate-fruit-offline/pocket-presentation.mjs');
const bridge = read('asset-presentation/pirate-fruit-client-bridge.mjs');
const studio = read('asset-presentation/studio-character-live-bridge.mjs');
const input = read('unified-mobile-controls-v900.mjs');
const presence = read('world-presence-v800.mjs');
const game = read('game-v800.js');

// Local Pirate is the reviewed blocky/Blue default; remote Render remains an
// explicit diagnostic choice and must not silently become the production path.
assert.match(boot, /PIRATE_FRUIT_OFFLINE_ENTRY/);
assert.match(boot, /searchParams\.get\('pirateClient'\) !== 'online'/);
assert.match(boot, /new URL\(live \? PIRATE_FRUIT_ONLINE_ENTRY : PIRATE_FRUIT_OFFLINE_ENTRY\)/);
assert.match(boot, /frameUrl\.searchParams\.set\('parentOrigin', location\.origin\)/);
assert.match(boot, /frameUrl\.searchParams\.set\('studioCapability', studioCapability\)/);
assert.match(boot, /frame\.setAttribute\('sandbox'/);
assert.doesNotMatch(boot, /frame\.style\.display\s*=\s*['"]none/);
assert.doesNotMatch(boot, /frame\.hidden\s*=\s*true/);

// The child must be able to complete the Studio handshake without exposing
// gameplay state or accepting an unauthenticated cross-origin message.
assert.match(child, /event\.source !== window\.parent \|\| event\.origin !== parentOrigin/);
assert.match(child, /message\?\.capability === studioCapability && message\.type === PIRATE_STUDIO_CHARACTER_PACKAGE/);
assert.match(child, /receivePirateStudioCharacterPackage\(message\.package\)/);
assert.match(child, /PIRATE_STUDIO_CHARACTER_READY/);
assert.match(child, /PIRATE_STUDIO_CHARACTER_ACCEPTED/);
assert.match(bridge, /registerProvider\('studio-character'/);
assert.match(bridge, /blocky-ground/);
assert.match(studio, /blue-explorer-primary-v1/);
assert.match(studio, /inspectBlueExplorerPrimaryPackage/);

// Route change is presentation-only: existing input, presence and animal
// control surfaces remain part of the active graph.
assert.match(boot, /createPirateIframeInputTransport/);
assert.match(boot, /publishWorldState|registerExternalPose/);
assert.match(boot, /POCKETMONSTER_ANIMAL_CONTROL/);
assert.match(input, /pocketmonster:unified-mobile-input-v1/);
assert.match(presence, /registerExternalPose|publishWorldState/);
assert.match(game, /functions:Object\.freeze\(\['captureThrow','summonThrow','recall','useSkill','switchPartySlot'\]\)/);

console.log('V9.4 Pirate local Blue block route contract: PASS');
