import assert from 'node:assert/strict';
import { createOnlineScenePresenceBridge } from '../online-world-bridge-v900.mjs';
import { monsterThrowAimFromPose } from '../monster-control-scene-binding-v900.mjs';
import { sanitizePirateLocalPresence } from '../pirate-presence-bridge-v900.mjs';
import { publishWorldState, registerExternalPose } from '../world-presence-v800.mjs';
import { createMonsterCommandAdapter } from '../monster-command-adapter.mjs';
import { createMonsterControlController } from '../monster-control-controller-v900.mjs';
import { createMonsterHttpProvider } from '../monster-command-http-provider-v900.mjs';

const target = {
  POCKETMONSTER_SCENE_PRESENCE: {
    state: () => ({ zone: 'pirate-fruit', x: 3, y: 1, z: -2, dir: 0.5, monsterIntents: [] }),
    accept: () => true,
  },
};
const bridge = createOnlineScenePresenceBridge({ getSceneWindow: () => target });
const pose = bridge.readPose();
assert.deepEqual({ zone: pose?.zone, x: pose?.x, y: pose?.y, z: pose?.z, dir: pose?.dir },
  { zone: 'pirate-fruit', x: 3, y: 1, z: -2, dir: 0.5 },
  'Pirate pose with the validated monsterIntents extension remains readable');
assert.deepEqual(monsterThrowAimFromPose(pose)?.targetPoint,
  { x: 4.917702154416812, y: 1, z: 1.510330247561491 },
  'aim derives from the native Pirate pose');

const validIntent = { schemaVersion: 1, intentId: 'monster-intent:2:9', zone: 'starter-island', kind: 'melee', category: 'sword', forwardX: 3, forwardZ: 4, range: 4.5, sequence: 9, targetActorId: 'monster:server-crab-1', expectedGeneration: 1, expectedStateSequence: 12 };
target.POCKETMONSTER_SCENE_PRESENCE.state = () => ({ zone: 'pirate-fruit', x: 3, z: -2, dir: 0.5, monsterIntents: [validIntent] });
assert.equal(bridge.readPose()?.monsterIntents[0].forwardX, .6, 'non-empty intents remain validated and normalized');
target.POCKETMONSTER_SCENE_PRESENCE.state = () => ({ zone: 'pirate-fruit', x: 3, z: -2, dir: 0.5, monsterIntents: {} });
assert.equal(bridge.readPose(), null, 'malformed monsterIntents remains rejected by the sanitizer');
console.log('Pirate presence aim with monster intents: PASS');

// Full bounded pipeline: native message -> Pirate sanitizer -> world-state
// producer -> bridge -> aim -> controller -> command adapter/provider POST.
const nativeMessage = { type: 'pocketmonster:pirate-presence-v1', zone: 'pirate-fruit', x: 3, y: 1, z: -2, dir: 0.5, monsterIntents: [] };
const nativePose = sanitizePirateLocalPresence(nativeMessage);
assert.ok(nativePose, 'native Pirate presence message is accepted');
const previousWindow = globalThis.window;
globalThis.window = {};
registerExternalPose(nativePose);
publishWorldState({ getZone: () => 'pirate-fruit', getPosition: () => null, getDir: () => undefined, allowActors: true });
globalThis.window.POCKETMONSTER_SCENE_PRESENCE = { state: () => globalThis.window.POCKETMONSTER_WORLD_STATE(), accept: () => true };
const fullBridge = createOnlineScenePresenceBridge({ getSceneWindow: () => globalThis.window });
const fullPose = fullBridge.readPose();
assert.deepEqual(monsterThrowAimFromPose(fullPose)?.targetPoint, { x: 4.917702154416812, y: 1, z: 1.510330247561491 });

const requests = [];
const provider = createMonsterHttpProvider({
  config: { apiBaseUrl: 'https://example.test', apiVersion: '1.1' }, sessionToken: 'session',
  getZone: () => 'pirate-fruit', isPresenceReady: zone => fullBridge.isReady(zone), pollMs: 0,
  fetchImpl: async (_url, init) => {
    requests.push(init.method);
    if (init.method === 'GET') return { ok: true, json: async () => ({ ok: true, monsterControl: { party: [{ instanceId: 'owned:aim', name: 'Aimmon' }], capabilities: {} } }) };
    const command = JSON.parse(init.body);
    return { ok: true, json: async () => ({ ok: true, commandId: command.commandId }) };
  },
});
assert.equal((await provider.refresh()).code, 'PRESENCE_NOT_READY');
assert.equal(requests.length, 0, 'no HTTP request before accepted scene presence');
assert.equal(fullBridge.acceptSnapshot({ zone: 'pirate-fruit', players: [] }), true);
await provider.refresh();
const commands = createMonsterCommandAdapter({ getZone: () => 'pirate-fruit', send: command => provider.send(command) });
const controller = createMonsterControlController({
  commands, getZone: () => 'pirate-fruit', getParty: () => provider.snapshot().party,
  getCapabilities: () => provider.snapshot().capabilities, getAim: () => monsterThrowAimFromPose(fullBridge.readPose())?.targetPoint || null,
});
assert.equal((await controller.activatePartySlot(0)).reason, 'prepared');
assert.equal((await controller.throwHeld()).ok, true, 'controller sends the throw after a valid scene aim');
assert.equal(requests[0], 'GET', 'control state was read before the throw');
assert.equal(requests[1], 'POST', 'real command provider reached the bounded POST path');
provider.dispose();
controller.dispose?.();
globalThis.window = previousWindow;
console.log('Publisher → accepted presence → aim → command POST: PASS; readiness and malformed checks retained');
