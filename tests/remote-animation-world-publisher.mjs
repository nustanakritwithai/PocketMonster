import assert from 'node:assert/strict';
import { publishWorldState } from '../world-presence-v800.mjs';

const previousWindow = globalThis.window;

try {
  globalThis.window = {};
  publishWorldState({
    getZone: () => 'pirate-fruit',
    getPosition: () => ({
      x: 12,
      y: 3.25,
      z: -4,
      locomotion: 'run',
      animation: {
        combatState: 'attack2',
        category: 'sword',
        onGround: false,
        dashing: false,
        verticalVelocity: 7,
      },
    }),
    getDir: () => 0.75,
  });

  assert.deepEqual(globalThis.window.POCKETMONSTER_WORLD_STATE(), {
    zone: 'pirate-fruit',
    x: 12,
    y: 3.25,
    z: -4,
    dir: 0.75,
    locomotion: 'run',
    animation: {
      combatState: 'attack2',
      category: 'sword',
      onGround: false,
      dashing: false,
      verticalVelocity: 7,
    },
  });
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

console.log('remote animation world publisher test passed');
