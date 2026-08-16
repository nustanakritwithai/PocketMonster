import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAssetEngine } from '../asset-presentation/engine.mjs';
import { loadCatalog, resetCatalog } from '../asset-presentation/catalog.mjs';
import { createLegacyHumanoidProvider } from '../asset-presentation/providers/legacy-humanoid.mjs';

const js = fs.readFileSync(new URL('../game-v800.js', import.meta.url), 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../assets/catalog/humanoid-core.json', import.meta.url), 'utf8'));

assert.match(js, /from '\.\/asset-presentation\/engine\.mjs'/, 'game must import the presentation engine');
assert.match(js, /assets\.spawn\('character\.human\.(legacy-capsule|blocky-bighead)\.v1'/, 'live Player/Keeper must spawn through the engine');
assert.match(js, /playerVisual\.play\('throw',\{duration:\.34\}\)/, 'throw action goes through the handle');
assert.match(js, /playerThrowOrigin\(\)/, 'projectile start uses the presentation anchor helper');
assert.match(js, /start=playerThrowOrigin\(\)\.clone\(\)/, 'aim line uses the same throwOrigin helper');
assert.match(js, /playerHitText\(\)/, 'player damage numbers use hitText');
assert.match(js, /playerVisual\.update\(dt,\{moving\}\)/, 'locomotion updates the handle');
assert.match(js, /sphereGeometry\(\.22/, 'AE1 keeps the legacy sphere head');
assert.doesNotMatch(js, /const player=buildPlayerCharacter\(\)/, 'gameplay must not construct the player mesh directly');
assert.doesNotMatch(js, /const npc=buildKeeperCharacter\(\)/, 'gameplay must not construct the keeper mesh directly');
assert.doesNotMatch(js, /mesh\.position\.copy\(player\.position\)\.add\(new THREE\.Vector3\(0,1\.15,0\)\)/, 'projectile must not hard-code y+1.15');
assert.doesNotMatch(js, /start=player\.position\.clone\(\)\.add\(new THREE\.Vector3\(0,1\.15,0\)\)/, 'aim line must not hard-code y+1.15');

resetCatalog();
loadCatalog(bundle);
const plays = [];
const engine = createAssetEngine();
engine.registerProvider('legacy', createLegacyHumanoidProvider({
  buildPlayer: () => ({ position: { x: 2, y: 0, z: 4 }, userData: { animRig: { action: 'idle' } } }),
  buildKeeper: () => ({ position: { x: 4, y: 0, z: 3 }, userData: { animRig: { action: 'idle' } } }),
  animate: (root, dt, moving) => { root.moved = { dt, moving }; },
  setAction: (root, action, duration) => { plays.push({ action, duration }); root.userData.animRig.action = action; },
}));
const player = engine.spawn('character.human.legacy-capsule.v1', { role: 'player', appearanceId: 'appearance.human.player-orange.v1' });
const keeper = engine.spawn('character.human.legacy-capsule.v1', { role: 'keeper', appearanceId: 'appearance.human.keeper-green.v1' });
const origin = player.anchor('throwOrigin');
const again = player.anchor('throwOrigin', origin);
assert.equal(origin, again);
assert.equal(origin.y, 1.15);
assert.equal(origin.x, 2);
player.play('throw', { duration: 0.34 });
player.update(0.016, { moving: true });
assert.equal(plays[0].action, 'throw');
assert.equal(plays[0].duration, 0.34);
assert.equal(player.root.moved.moving, true);
assert.equal(keeper.root.position.x, 4);
player.dispose();
player.dispose();
assert.ok(engine.diagnostics().providers.includes('legacy'));

console.log('V8.0 AE1 legacy adapter: PASS');
