export const PRESENCE_ZONE = 'pirate-fruit';
export const ISLAND_ID = 'leaf-island';
export const REMOTE_PLAYER_ID = 'player-a';

export const movementSamples = Object.freeze([
  Object.freeze({
    x: 1,
    y: 2.25,
    z: 2,
    dir: 0.7,
    locomotion: 'run',
    animation: Object.freeze({
      combatState: 'idle',
      category: 'style',
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
    }),
  }),
  Object.freeze({
    x: 2,
    y: 2.25,
    z: 2,
    dir: -0.45,
    locomotion: 'run',
    animation: Object.freeze({
      combatState: 'idle',
      category: 'style',
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
    }),
  }),
]);

// This is shorter than the documented ~250 ms Server snapshot interval and
// carries the complete transient identity trio accepted at G1.
export const shortAttackSample = Object.freeze({
  x: 4,
  y: 3.5,
  z: -3,
  dir: 1.2,
  locomotion: 'idle',
  animation: Object.freeze({
    combatState: 'attack1',
    category: 'sword',
    onGround: true,
    dashing: false,
    verticalVelocity: 0,
    attackProgress: 0.35,
    actionSessionId: 'session_a_20260905',
    actionSequence: 1,
    actionDurationMs: 100,
  }),
  observedDurationMs: 100,
});

export const idleAfterShortAttack = Object.freeze({
  x: shortAttackSample.x,
  y: shortAttackSample.y,
  z: shortAttackSample.z,
  dir: shortAttackSample.dir,
  locomotion: 'idle',
  animation: Object.freeze({
    combatState: 'idle',
    category: 'style',
    onGround: true,
    dashing: false,
    verticalVelocity: 0,
  }),
});

export const shortActionTimeline = Object.freeze([
  Object.freeze({ atMs: 0, pose: shortAttackSample }),
  Object.freeze({ atMs: 100, pose: idleAfterShortAttack }),
  Object.freeze({ atMs: 700, pose: idleAfterShortAttack }),
  Object.freeze({ atMs: 800, pose: idleAfterShortAttack }),
]);

export const richCastingSample = Object.freeze({
  x: -5,
  y: 6.25,
  z: 8,
  dir: -2.2,
  locomotion: 'swim',
  animation: Object.freeze({
    combatState: 'casting',
    category: 'fruit',
    onGround: false,
    dashing: true,
    verticalVelocity: -12.5,
    hitReactionId: 17,
    hitReactionAngle: -2.4,
    skillAnimationProgress: 0.45,
    skillAnimationReleaseProgress: 0.2,
    skillAnimationType: 'projectile',
    skillAnimationVariant: 3,
    skillAnimationUltimate: true,
    skillAnimationCategory: 'fruit',
    actionSessionId: 'session_a_20260905',
    actionSequence: 2,
    actionDurationMs: 900,
  }),
});

/**
 * A deliberately neutral relay: it JSON-round-trips the frame and adds only
 * Server-owned identity. It never invents locomotion, animation, or pose data.
 */
export function snapshotFromPublishedFrame(frame, overrides = {}) {
  const { zone, ...publishedPlayer } = frame;
  return JSON.parse(JSON.stringify({
    zone,
    players: [{
      id: overrides.id ?? REMOTE_PLAYER_ID,
      name: overrides.name ?? 'Player A',
      ...publishedPlayer,
    }],
  }));
}
