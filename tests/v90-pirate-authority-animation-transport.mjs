import assert from 'node:assert/strict';
import {
  sanitizeOnlineWorldSnapshot,
  sanitizePresenceActor,
} from '../world-presence-protocol.mjs';

function wireActor(actionSessionId) {
  return {
    actorId: 'owned:monster-1',
    ownerId: 'player-1',
    kind: 'monster',
    monsterType: 'crab',
    zone: 'pirate-fruit',
    generation: 1,
    spawnSequence: 1,
    stateSequence: 4,
    lifecycle: 'active',
    pose: { x: 2, y: 0, z: 3, dir: 0 },
    locomotion: 'idle',
    animation: {
      combatState: 'attack1',
      category: 'utility',
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
      actionSessionId,
      actionSequence: 3,
      actionDurationMs: 450,
    },
    authority: {
      authorityVersion: 'monster-authority/1',
      serverTimeUtc: '2026-09-20T00:00:00Z',
      generation: 1,
      hp: { current: 80, max: 100, revision: 2 },
      resultRevision: 5,
      actionSequence: 3,
      actionId: 'melee',
      hit: true,
      damage: 4,
      death: false,
      attack: {
        attackId: 'owned-attack-1',
        spawnId: 'owned:monster-1',
        monsterId: 'owned:monster-1',
        islandId: 'pirate-fruit',
        targetId: 'owned:target-1',
        action: 'melee',
        damage: 4,
        hitDelayMs: 0,
      },
    },
  };
}

const valid = wireActor('owned-action-1');
const retaliation = { ...wireActor('owned-action-2'), actorId: 'monster:crab-1', ownerId: undefined };
retaliation.authority.attack.spawnId = retaliation.actorId;
retaliation.authority.attack.monsterId = 'crab';
const direct = sanitizePresenceActor(valid, 'pirate-fruit', 1, { allowAuthority: true });
assert.ok(direct, 'valid owned action identity is accepted by the actor sanitizer');
assert.equal(direct.animation.actionSessionId, 'owned-action-1');
assert.equal(direct.authority.attack.targetId, 'owned:target-1', 'owned retaliation target survives actor sanitization');

const snapshot = sanitizeOnlineWorldSnapshot({
  zone: 'pirate-fruit', generation: 8, players: [], actors: [valid, retaliation],
}, 'pirate-fruit');
assert.ok(snapshot, 'valid owned authority actor survives the world snapshot transport');
assert.equal(snapshot.actors[0].animation.actionSessionId, 'owned-action-1');
assert.equal(snapshot.actors[0].authority.attack.targetId, 'owned:target-1');
assert.equal(snapshot.actors[1].authority.attack.spawnId, 'monster:crab-1');
assert.equal(snapshot.actors[1].authority.attack.targetId, 'owned:target-1');
assert.equal(snapshot.actors[0].animation.actionSequence, 3);
assert.equal(snapshot.actors[0].animation.actionDurationMs, 450);

// ค่าเก่า owned3 สั้นกว่า protocol ขั้นต่ำ จึงต้องถูกตัดเฉพาะ metadata identity
// แต่ไม่ทำให้ animation/authority attack ที่เหลือทั้งก้อนหายไป
const legacy = sanitizeOnlineWorldSnapshot({
  zone: 'pirate-fruit', generation: 8, players: [], actors: [wireActor('owned3')],
}, 'pirate-fruit');
assert.ok(legacy, 'legacy short action session does not reject the whole actor');
assert.equal(legacy.actors[0].animation.actionSessionId, undefined);
assert.equal(legacy.actors[0].animation.actionSequence, undefined);
assert.equal(legacy.actors[0].authority.attack.targetId, 'owned:target-1');

console.log('V90 Pirate authority animation transport: PASS');
