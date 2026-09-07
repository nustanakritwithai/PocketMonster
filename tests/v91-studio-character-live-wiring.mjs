import assert from 'node:assert/strict';
import fs from 'node:fs';

const game = fs.readFileSync(new URL('../game-v900.js', import.meta.url), 'utf8');
const bridge = fs.readFileSync(new URL('../asset-presentation/studio-character-live-bridge.mjs', import.meta.url), 'utf8');
const packageLoader = fs.readFileSync(new URL('../asset-presentation/studio-character-package.mjs', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../asset-presentation/providers/studio-character.mjs', import.meta.url), 'utf8');

assert.match(game, /registerProvider\('studio-character',\s*createStudioCharacterProvider/);
assert.match(game, /loadStudioCharacterFromEngine\(/);
assert.match(game, /installStudioCharacterPackage\(assets, studioPackage/);
assert.match(game, /assets\.spawn\(studioPackage\.manifest\.id/);
assert.match(game, /playerVisualSource = 'studio-character'/);
assert.match(game, /const next = moving \? 'walk' : 'idle'/);
assert.match(game, /assets\.spawn\('character\.human\.pirate-fruit\.v1'/, 'Pirate fallback must remain available');
assert.doesNotMatch(game, /characterId\s*=\s*['"]character\.human\.pirate\.studio-live['"].*server/i, 'Studio id must not become gameplay authority');

assert.match(bridge, /POCKET_STUDIO_CHARACTER_REQUEST/);
assert.match(bridge, /POCKET_STUDIO_CHARACTER_PACKAGE/);
assert.match(bridge, /validateStudioCharacterPackage\(message\.package\)/);
assert.match(bridge, /event\.origin !== targetOrigin/);
assert.match(bridge, /frame\.contentWindow\?\.postMessage/);
assert.match(bridge, /Character Studio bridge timed out/);

assert.match(packageLoader, /gameplayPolicy\?\.included !== false/);
assert.match(packageLoader, /rig\?\.architecture !== 'THREE\.Group'/);
assert.match(packageLoader, /rig\.sockets\.throwOrigin/);
assert.match(provider, /buildSceneNode/);
assert.match(provider, /buildJointMap/);
assert.match(provider, /findClip\(pkg, action\)/);
assert.match(provider, /anchor\(name, target\)/);

console.log('V9.1 Studio character live bridge wiring gate passed');
