import assert from 'node:assert/strict';

import { sanitizeAnimation, sanitizeOnlineWorldPose } from '../world-presence-protocol.mjs';
import {
  PIRATE_LOCAL_PRESENCE_MESSAGE,
  sanitizePirateLocalPresence,
  sanitizePirateWorldSnapshot,
} from '../pirate-presence-bridge-v900.mjs';

const canonicalAnimation = Object.freeze({
  combatState: 'attack2',
  category: 'sword',
  onGround: false,
  dashing: true,
  verticalVelocity: -12.5,
  attackProgress: 0.45,
  hitReactionId: 7,
  hitReactionAngle: -1.25,
  skillAnimationProgress: 0.35,
  skillAnimationReleaseProgress: 0.6,
  skillAnimationType: 'beam',
  skillAnimationVariant: 3,
  skillAnimationUltimate: true,
  skillAnimationCategory: 'fruit',
  actionSessionId: 'runtime_A1',
  actionSequence: 7,
  actionDurationMs: 320,
});

assert.deepEqual(
  sanitizeAnimation(canonicalAnimation),
  canonicalAnimation,
  'the protocol must preserve the Server/Pirate animator vocabulary and every consumed animation field',
);

const localPose = {
  zone: 'pirate-fruit',
  x: 1,
  z: 2,
  dir: 0.5,
  locomotion: 'run',
  animation: canonicalAnimation,
};
assert.deepEqual(
  sanitizeOnlineWorldPose(localPose),
  localPose,
  'the canonical pose must survive the parent protocol before world-pos publication',
);

assert.deepEqual(
  sanitizePirateLocalPresence({
    type: PIRATE_LOCAL_PRESENCE_MESSAGE,
    ...localPose,
  }),
  {
    x: localPose.x,
    z: localPose.z,
    dir: localPose.dir,
    locomotion: localPose.locomotion,
    animation: canonicalAnimation,
  },
  'the iframe-to-parent bridge must preserve the canonical animation',
);

const remoteSnapshot = sanitizePirateWorldSnapshot({
  zone: 'pirate-fruit',
  players: [{
    id: 'remote-player',
    name: 'Remote Player',
    x: 3,
    z: 4,
    dir: -0.75,
    locomotion: 'walk',
    animation: canonicalAnimation,
  }],
});
assert.deepEqual(
  remoteSnapshot?.players[0]?.animation,
  canonicalAnimation,
  'the Server-to-iframe bridge must preserve the canonical animation',
);

const {
  actionSessionId: _actionSessionId,
  actionSequence: _actionSequence,
  actionDurationMs: _actionDurationMs,
  ...canonicalWithoutActionMetadata
} = canonicalAnimation;
assert.deepEqual(
  sanitizeAnimation({
    ...canonicalAnimation,
    actionSessionId: 42,
    actionSequence: 'bad',
    actionDurationMs: 79,
  }),
  canonicalWithoutActionMetadata,
  'invalid short-action metadata must not drop an otherwise valid animation',
);

console.log('Remote animation canonical protocol baseline: PASS');
