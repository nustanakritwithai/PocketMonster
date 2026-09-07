// Canonical world presence protocol. One vocabulary, one sanitizer, one self-filter.
// Bridges and renderers may add structural guards, but must not declare a second
// locomotion/combat enum or drop validated action fields.

export const WORLD_PRESENCE_PROTOCOL_VERSION = 'world-presence-protocol/v2';
export const MAX_REMOTE_PLAYERS = 100;
export const MAX_REMOTE_ACTORS = 128;
export const MAX_SNAPSHOT_CANDIDATES = 400;
export const MAX_WORLD_ROUTE_GENERATION = 2_147_483_647;
export const MAX_PLAYER_ID_LENGTH = 80;
export const MAX_PLAYER_NAME_LENGTH = 32;
export const ZONE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const PRESENCE_COORDINATE_LIMIT = 10000;
export const LOCOMOTION_VALUES = Object.freeze(['idle', 'walk', 'run', 'swim']);
export const COMBAT_STATE_VALUES = Object.freeze([
  'idle', 'attack1', 'attack2', 'attack3', 'attack4', 'casting', 'blocking',
  'stunned', 'knockback', 'knockdown', 'dead',
]);
export const ANIMATION_CATEGORY_VALUES = Object.freeze(['style', 'sword', 'gun', 'fruit', 'utility']);
export const SKILL_ANIMATION_TYPE_VALUES = Object.freeze([
  'projectile', 'beam', 'aoe', 'ground', 'dash', 'flurry', 'buff', 'summon', 'homing', 'teleport',
]);
export const ACTION_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_ACTION_SEQUENCE = 2147483647;
export const MIN_ACTION_DURATION_MS = 80;
export const MAX_ACTION_DURATION_MS = 5000;
export const PRESENTATION_SCHEMA_VERSION = 1;
export const VISUAL_SCHEMA_VERSION = 1;
export const MAX_PRESENTATION_ITEMS = 16;
export const MAX_VISUAL_EVENTS = 32;
export const MAX_VISUAL_SNAPSHOT_EVENTS = 512;
export const MAX_VISUAL_PROJECTILES = 32;
export const MAX_VISUAL_QUEUE_EVENTS = 256;
export const PRESENTATION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;
export const MONSTER_INSTANCE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,96}$/;
export const ACTOR_KIND_VALUES = Object.freeze(['monster', 'summon']);
export const ACTOR_LIFECYCLE_VALUES = Object.freeze(['spawn', 'active', 'despawn']);
export const VISUAL_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const VISUAL_KINDS = Object.freeze([
  'slash', 'blade-trail', 'gun-shot', 'energy-launch', 'shockwave', 'beam',
  'hit-spark', 'energy-impact', 'projectile-start', 'projectile-end',
]);
export const SPELL_FX_ASSET_IDS = Object.freeze([
  'fireball', 'lightning-hands', 'magic-rock', 'earth-bending', 'water-element',
  'ice-block', 'fire-grenade', 'smoke', 'fire-hands',
]);

const LOCOMOTION_SET = new Set(LOCOMOTION_VALUES);
const COMBAT_STATE_SET = new Set(COMBAT_STATE_VALUES);
const ANIMATION_CATEGORY_SET = new Set(ANIMATION_CATEGORY_VALUES);
const SKILL_ANIMATION_TYPE_SET = new Set(SKILL_ANIMATION_TYPE_VALUES);
const VISUAL_KIND_SET = new Set(VISUAL_KINDS);
const CATEGORY_SET = ANIMATION_CATEGORY_SET;
const SPELL_FX_ASSET_SET = new Set(SPELL_FX_ASSET_IDS);
const ACTOR_KIND_SET = new Set(ACTOR_KIND_VALUES);
const ACTOR_LIFECYCLE_SET = new Set(ACTOR_LIFECYCLE_VALUES);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function optionalBoundedNumber(value, minimum, maximum) {
  return isFiniteNumber(value) ? clamp(value, minimum, maximum) : undefined;
}

function optionalBoundedInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : undefined;
}

function optionalClampedInteger(value, minimum, maximum) {
  return isFiniteNumber(value) ? clamp(Math.floor(value), minimum, maximum) : undefined;
}

function sanitizeId(value) {
  return typeof value === 'string' && PRESENTATION_ID_PATTERN.test(value) ? value : null;
}

function sanitizeVec3(value, limit = 10000) {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z)) return null;
  if (Math.abs(value.x) > limit || Math.abs(value.y) > limit || Math.abs(value.z) > limit) return null;
  return Object.freeze({ x: value.x, y: value.y, z: value.z });
}

function sanitizeDirection(value) {
  const direction = sanitizeVec3(value, 1);
  if (!direction) return null;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  return length > 0 ? direction : null;
}

function boundedColor(value) {
  return Number.isInteger(value) && value >= 0 && value <= 0xffffff ? value : null;
}

function boundedId(value) {
  return sanitizeId(value);
}

function sanitizeAssetId(value) {
  return typeof value === 'string' && SPELL_FX_ASSET_SET.has(value) ? value : null;
}

function sanitizeMonsterInstanceId(value) {
  return typeof value === 'string' && MONSTER_INSTANCE_ID_PATTERN.test(value) ? value : null;
}

export function sanitizePresentation(value) {
  if (!isRecord(value) || value.schemaVersion !== PRESENTATION_SCHEMA_VERSION) return null;
  if (value.avatarId !== 'pirate-v1' || value.appearanceId !== 'player-orange') return null;
  const list = name => {
    if (!Array.isArray(value[name]) || value[name].length > MAX_PRESENTATION_ITEMS) return null;
    const result = [];
    const seen = new Set();
    for (const item of value[name]) {
      const id = sanitizeId(item);
      if (!id || seen.has(id)) return null;
      seen.add(id); result.push(id);
    }
    return Object.freeze(result);
  };
  const clothingIds = list('clothingIds');
  const equipmentIds = list('equipmentIds');
  if (!clothingIds || !equipmentIds) return null;
  let activeItem = null;
  if (value.activeItem !== null) {
    if (!isRecord(value.activeItem) || !CATEGORY_SET.has(value.activeItem.category)) return null;
    const itemId = sanitizeId(value.activeItem.itemId);
    if (!itemId) return null;
    activeItem = Object.freeze({ category: value.activeItem.category, itemId });
  }
  return Object.freeze({ schemaVersion: 1, avatarId: 'pirate-v1', appearanceId: 'player-orange', clothingIds, equipmentIds, activeItem });
}

export function sanitizeVisualEvent(value) {
  if (!isRecord(value) || !Number.isInteger(value.sequence) || value.sequence < 1 || value.sequence > Number.MAX_SAFE_INTEGER
    || !VISUAL_KIND_SET.has(value.kind) || !Number.isInteger(value.ageMs) || value.ageMs < 0 || value.ageMs > 3000) return null;
  const event = { sequence: value.sequence, kind: value.kind, ageMs: value.ageMs };
  const position = sanitizeVec3(value.position);
  if (value.kind !== 'projectile-start' && !position) return null;
  if (position) event.position = position;
  const optionalId = name => value[name] === undefined ? undefined : boundedId(value[name]);
  for (const name of ['itemId', 'skillId']) {
    const id = optionalId(name); if (value[name] !== undefined && !id) return null; if (id) event[name] = id;
  }
  if (value.assetId !== undefined) {
    if (value.kind !== 'slash' && value.kind !== 'shockwave') return null;
    const assetId = sanitizeAssetId(value.assetId); if (!assetId) return null; event.assetId = assetId;
  }
  if (value.kind === 'slash') {
    if (!Number.isFinite(value.heading) || Math.abs(value.heading) > Math.PI || boundedColor(value.color) === null || !Number.isFinite(value.scale) || value.scale < .01 || value.scale > 20) return null;
    Object.assign(event, { heading: value.heading, color: value.color, scale: value.scale });
  } else if (value.kind === 'blade-trail') {
    const bladeBase = sanitizeVec3(value.bladeBase), bladeTip = sanitizeVec3(value.bladeTip);
    if (!bladeBase || !bladeTip || !Number.isFinite(value.heading) || Math.abs(value.heading) > Math.PI || !Number.isInteger(value.comboIndex) || value.comboIndex < 0 || value.comboIndex > 3 || boundedColor(value.color) === null || typeof value.finisher !== 'boolean') return null;
    Object.assign(event, { bladeBase, bladeTip, heading: value.heading, comboIndex: value.comboIndex, color: value.color, finisher: value.finisher });
  } else if (value.kind === 'gun-shot') {
    const endpoint = sanitizeVec3(value.endpoint);
    if (!endpoint || boundedColor(value.color) === null || typeof value.impacted !== 'boolean' || !Number.isFinite(value.power) || value.power < .01 || value.power > 20) return null;
    Object.assign(event, { endpoint, color: value.color, impacted: value.impacted, power: value.power });
  } else if (value.kind === 'energy-launch') {
    const direction = sanitizeDirection(value.direction);
    if (!direction || boundedColor(value.color) === null || !Number.isFinite(value.scale) || value.scale < .01 || value.scale > 20) return null;
    Object.assign(event, { direction, color: value.color, scale: value.scale });
  } else if (value.kind === 'shockwave') {
    if (!Number.isFinite(value.radius) || value.radius < .01 || value.radius > 200 || boundedColor(value.color) === null) return null;
    Object.assign(event, { radius: value.radius, color: value.color });
  } else if (value.kind === 'beam') {
    const direction = sanitizeDirection(value.direction);
    if (!direction || !Number.isFinite(value.length) || value.length < .01 || value.length > 1000 || boundedColor(value.color) === null) return null;
    Object.assign(event, { direction, length: value.length, color: value.color });
  } else if (value.kind === 'hit-spark') {
    if (boundedColor(value.color) === null) return null;
    event.color = value.color;
  } else if (value.kind === 'energy-impact') {
    if (boundedColor(value.color) === null || !Number.isFinite(value.scale) || value.scale < .01 || value.scale > 20) return null;
    Object.assign(event, { color: value.color, scale: value.scale });
  } else if (value.kind === 'projectile-start') {
    const projectile = sanitizeProjectile(value.projectile);
    if (!projectile) return null;
    event.projectile = projectile;
  } else if (value.kind === 'projectile-end') {
    const projectileId = boundedId(value.projectileId);
    if (!projectileId || boundedColor(value.color) === null || !Number.isFinite(value.scale) || value.scale < .01 || value.scale > 20
      || !Number.isFinite(value.burstScale) || value.burstScale < 0.01 || value.burstScale > 20) return null;
    Object.assign(event, { projectileId, color: value.color, scale: value.scale, burstScale: value.burstScale });
  }
  return Object.freeze(event);
}

export function sanitizeProjectile(value) {
  if (!isRecord(value) || !boundedId(value.id) || !sanitizeVec3(value.position) || !sanitizeDirection(value.direction) || !sanitizeVec3(value.velocity, 200)
    || boundedColor(value.color) === null || !Number.isFinite(value.scale) || value.scale < .01 || value.scale > 20
    || !Number.isFinite(value.elapsed) || value.elapsed < 0 || value.elapsed > 120 || !Number.isFinite(value.lifeFraction) || value.lifeFraction < 0 || value.lifeFraction > 1
    || !Number.isFinite(value.remainingMs) || value.remainingMs < 0 || value.remainingMs > 120000) return null;
  const projectile = { id: value.id, position: sanitizeVec3(value.position), direction: sanitizeDirection(value.direction), velocity: sanitizeVec3(value.velocity, 200), color: value.color, scale: value.scale, elapsed: value.elapsed, lifeFraction: value.lifeFraction, remainingMs: value.remainingMs };
  for (const name of ['itemId', 'skillId']) { if (value[name] !== undefined) { const id = boundedId(value[name]); if (!id) return null; projectile[name] = id; } }
  return Object.freeze(projectile);
}

export function sanitizeVisual(value, { maxEvents = MAX_VISUAL_SNAPSHOT_EVENTS } = {}) {
  if (!isRecord(value) || value.schemaVersion !== VISUAL_SCHEMA_VERSION || !VISUAL_SESSION_ID_PATTERN.test(value.sessionId)
    || !Number.isInteger(value.stateSequence) || value.stateSequence < 1 || value.stateSequence > Number.MAX_SAFE_INTEGER
    || !Array.isArray(value.events) || value.events.length > maxEvents || !Array.isArray(value.projectiles) || value.projectiles.length > MAX_VISUAL_PROJECTILES) return null;
  const events = value.events.map(sanitizeVisualEvent);
  if (events.some(event => !event)) return null;
  for (let index = 1; index < events.length; index += 1) {
    if (events[index].sequence <= events[index - 1].sequence) return null;
  }
  const projectiles = value.projectiles.map(sanitizeProjectile);
  if (projectiles.some(projectile => !projectile)) return null;
  if (new Set(projectiles.map(projectile => projectile.id)).size !== projectiles.length) return null;
  let shield;
  if (value.shield !== undefined) {
    if (!isRecord(value.shield) || typeof value.shield.active !== 'boolean' || !Number.isFinite(value.shield.opacity) || value.shield.opacity < 0 || value.shield.opacity > 1) return null;
    shield = Object.freeze({ active: value.shield.active, opacity: value.shield.opacity });
  }
  const result = { schemaVersion: 1, sessionId: value.sessionId, stateSequence: value.stateSequence, events: Object.freeze(events), projectiles: Object.freeze(projectiles) };
  if (shield) result.shield = shield;
  return Object.freeze(result);
}

export function sanitizeActorPresentation(value) {
  if (!isRecord(value) || !Array.isArray(value.events) || value.events.length > MAX_VISUAL_EVENTS
    || !Array.isArray(value.projectiles) || value.projectiles.length > MAX_VISUAL_PROJECTILES) return null;
  const events = value.events.map(sanitizeVisualEvent);
  if (events.some(event => !event)) return null;
  for (let index = 1; index < events.length; index += 1) if (events[index].sequence <= events[index - 1].sequence) return null;
  const projectiles = value.projectiles.map(sanitizeProjectile);
  if (projectiles.some(projectile => !projectile) || new Set(projectiles.map(projectile => projectile.id)).size !== projectiles.length) return null;
  return Object.freeze({ events: Object.freeze(events), projectiles: Object.freeze(projectiles) });
}

export function sanitizePresenceActor(value, expectedZone, expectedGeneration, { maxVisualEvents = MAX_VISUAL_SNAPSHOT_EVENTS } = {}) {
  if (!isRecord(value)) return null;
  const actorId = sanitizeMonsterInstanceId(value.actorId);
  const ownerId = value.ownerId === undefined ? null : sanitizeMonsterInstanceId(value.ownerId);
  const monsterType = sanitizeMonsterInstanceId(value.monsterType);
  const zone = safeZone(value.zone);
  if (!actorId || (value.ownerId !== undefined && !ownerId) || !monsterType || zone !== expectedZone || value.kind !== 'monster' || !ACTOR_LIFECYCLE_SET.has(value.lifecycle)) return null;
  if (!Number.isSafeInteger(value.spawnSequence) || value.spawnSequence < 1
    || !Number.isSafeInteger(value.stateSequence) || value.stateSequence < 1
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || (expectedGeneration !== undefined && value.generation !== expectedGeneration)) return null;
  const pose = value.pose;
  if (!isRecord(pose) || !isFiniteNumber(pose.x) || !isFiniteNumber(pose.y) || !isFiniteNumber(pose.z) || !isFiniteNumber(pose.dir)) return null;
  const actor = {
    actorId, kind: 'monster', ...(ownerId === null ? {} : { ownerId }), monsterType, zone, generation: value.generation, lifecycle: value.lifecycle,
    spawnSequence: value.spawnSequence, stateSequence: value.stateSequence,
    pose: Object.freeze({
      x: clamp(pose.x, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT),
      y: clamp(pose.y, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT),
      z: clamp(pose.z, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT),
      dir: pose.dir,
    }),
    locomotion: sanitizeLocomotion(value.locomotion),
    animation: sanitizeAnimation(value.animation),
  };
  if (value.presentation !== undefined) {
    const presentation = sanitizeActorPresentation(value.presentation);
    if (presentation) actor.presentation = presentation;
  }
  return Object.freeze(actor);
}

function sanitizePresenceActors(value, expectedZone, expectedGeneration, options) {
  if (!Array.isArray(value) || value.length > MAX_REMOTE_ACTORS) return null;
  const actors = [];
  const seen = new Set();
  for (const candidate of value) {
    const actor = sanitizePresenceActor(candidate, expectedZone, expectedGeneration, options);
    if (!actor || seen.has(actor.actorId)) return null;
    seen.add(actor.actorId);
    actors.push(actor);
  }
  return Object.freeze(actors);
}

export function createVisualEventQueue(maxEvents = MAX_VISUAL_QUEUE_EVENTS, { now = () => Date.now(), ttlMs = 3000 } = {}) {
  const queue = [];
  let dropped = 0;
  let tokenSequence = 0;
  const expire = () => {
    const current = Number(now());
    const retained = queue.filter(record => record.originalAgeMs + Math.max(0, current - record.queuedAt) <= ttlMs);
    const removed = queue.length - retained.length;
    if (removed) {
      queue.splice(0, queue.length, ...retained);
      dropped += removed;
    }
    return removed;
  };
  const aged = record => {
    const event = { ...record.event, ageMs: record.originalAgeMs + Math.max(0, Number(now()) - record.queuedAt) };
    Object.defineProperty(event, '__queueToken', { value: record.token, enumerable: false });
    return event;
  };
  return Object.freeze({
    push(events) {
      const incoming = Array.isArray(events) ? events : [events];
      expire();
      for (const event of incoming) {
        const sanitized = sanitizeVisualEvent(event);
        if (!sanitized) {
          dropped += 1;
          continue;
        }
        if (queue.length >= maxEvents) { dropped += 1; continue; }
        queue.push({ event: sanitized, originalAgeMs: sanitized.ageMs, queuedAt: Number(now()), token: ++tokenSequence });
      }
      return queue.length;
    },
    peek(limit = MAX_VISUAL_EVENTS, accept = null) {
      expire();
      const count = Math.max(0, Math.min(limit, MAX_VISUAL_EVENTS));
      const batch = [];
      while (batch.length < count && batch.length < queue.length) {
        const next = aged(queue[batch.length]);
        const candidate = [...batch, next];
        if (typeof accept === 'function' && accept(candidate) !== true) break;
        batch.push(next);
      }
      return batch;
    },
    commit(count, sentBatch = null) {
      const requested = Math.max(0, Math.min(queue.length, Number.isInteger(count) ? count : 0));
      if (!requested) return;
      if (Array.isArray(sentBatch)) {
        const tokens = sentBatch.slice(0, requested).map(event => event?.__queueToken);
        if (tokens.length !== requested || tokens.some((token, index) => token !== queue[index]?.token)) return;
      }
      queue.splice(0, requested);
      expire();
    },
    drain(limit = MAX_VISUAL_EVENTS, accept = null) {
      const batch = this.peek(limit, accept);
      this.commit(batch.length, batch);
      return batch;
    },
    clear() { queue.length = 0; },
    diagnostics() { expire(); return Object.freeze({ pending: queue.length, dropped }); },
  });
}

export function safeZone(value) {
  return typeof value === 'string' && ZONE_PATTERN.test(value) ? value : null;
}

export function sanitizeLocomotion(value) {
  return typeof value === 'string' && LOCOMOTION_SET.has(value) ? value : 'idle';
}

export function sanitizeAnimation(value) {
  if (!isRecord(value)) return null;
  if (typeof value.combatState !== 'string' || !COMBAT_STATE_SET.has(value.combatState)) return null;
  if (typeof value.category !== 'string' || !ANIMATION_CATEGORY_SET.has(value.category)) return null;
  const animation = {
    combatState: value.combatState,
    category: value.category,
    onGround: typeof value.onGround === 'boolean' ? value.onGround : true,
    dashing: typeof value.dashing === 'boolean' ? value.dashing : false,
    verticalVelocity: isFiniteNumber(value.verticalVelocity) ? clamp(value.verticalVelocity, -100, 100) : 0,
  };
  const attackProgress = optionalBoundedNumber(value.attackProgress, 0, 1);
  const hitReactionId = optionalClampedInteger(value.hitReactionId, 0, 2147483647);
  const hitReactionAngle = optionalBoundedNumber(value.hitReactionAngle, -Math.PI, Math.PI);
  const skillAnimationProgress = optionalBoundedNumber(value.skillAnimationProgress, 0, 1);
  const skillAnimationReleaseProgress = optionalBoundedNumber(value.skillAnimationReleaseProgress, 0, 1);
  const skillAnimationVariant = optionalClampedInteger(value.skillAnimationVariant, 0, 16);
  if (attackProgress !== undefined) animation.attackProgress = attackProgress;
  if (hitReactionId !== undefined) animation.hitReactionId = hitReactionId;
  if (hitReactionAngle !== undefined) animation.hitReactionAngle = hitReactionAngle;
  if (skillAnimationProgress !== undefined) animation.skillAnimationProgress = skillAnimationProgress;
  if (skillAnimationReleaseProgress !== undefined) animation.skillAnimationReleaseProgress = skillAnimationReleaseProgress;
  if (typeof value.skillAnimationType === 'string' && SKILL_ANIMATION_TYPE_SET.has(value.skillAnimationType)) {
    animation.skillAnimationType = value.skillAnimationType;
  }
  if (skillAnimationVariant !== undefined) animation.skillAnimationVariant = skillAnimationVariant;
  if (typeof value.skillAnimationUltimate === 'boolean') animation.skillAnimationUltimate = value.skillAnimationUltimate;
  if (typeof value.skillAnimationCategory === 'string' && ANIMATION_CATEGORY_SET.has(value.skillAnimationCategory)) {
    animation.skillAnimationCategory = value.skillAnimationCategory;
  }

  const actionSessionId = typeof value.actionSessionId === 'string' && ACTION_SESSION_ID_PATTERN.test(value.actionSessionId)
    ? value.actionSessionId : undefined;
  const actionSequence = optionalBoundedInteger(value.actionSequence, 1, MAX_ACTION_SEQUENCE);
  const actionDurationMs = optionalBoundedInteger(value.actionDurationMs, MIN_ACTION_DURATION_MS, MAX_ACTION_DURATION_MS);
  if (actionSessionId !== undefined && actionSequence !== undefined && actionDurationMs !== undefined) {
    animation.actionSessionId = actionSessionId;
    animation.actionSequence = actionSequence;
    animation.actionDurationMs = actionDurationMs;
  }
  return Object.freeze(animation);
}

export function sanitizeOnlineWorldPose(value, { maxVisualEvents = MAX_VISUAL_EVENTS } = {}) {
  if (!isRecord(value)) return null;
  const zone = safeZone(value.zone);
  if (!zone || !isFiniteNumber(value.x) || !isFiniteNumber(value.z) || !isFiniteNumber(value.dir)) return null;
  const pose = {
    zone,
    x: clamp(value.x, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT),
    z: clamp(value.z, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT),
    dir: value.dir,
    locomotion: sanitizeLocomotion(value.locomotion),
    animation: sanitizeAnimation(value.animation),
  };
  if (isFiniteNumber(value.y)) pose.y = clamp(value.y, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT);
  if (value.presentation !== undefined) { const presentation = sanitizePresentation(value.presentation); if (presentation) pose.presentation = presentation; }
  if (value.visual !== undefined) { const visual = sanitizeVisual(value.visual, { maxEvents: maxVisualEvents }); if (visual) pose.visual = visual; }
  if (value.actors !== undefined) { const actors = sanitizePresenceActors(value.actors, zone, undefined, { maxVisualEvents }); if (actors) pose.actors = actors; }
  return Object.freeze(pose);
}

export function buildWorldPosFrame(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const dir = snapshot.dir === undefined ? 0 : snapshot.dir;
  return sanitizeOnlineWorldPose({ ...snapshot, dir });
}

export function sanitizePresencePlayer(candidate, seen = null, { maxVisualEvents = MAX_VISUAL_SNAPSHOT_EVENTS } = {}) {
  if (!isRecord(candidate)) return null;
  const id = typeof candidate.id === 'string'
    ? candidate.id.trim().slice(0, MAX_PLAYER_ID_LENGTH)
    : '';
  if (!id || (seen && seen.has(id)) || !isFiniteNumber(candidate.x) || !isFiniteNumber(candidate.z)) return null;
  if (seen) seen.add(id);
  const player = {
    id,
    name: typeof candidate.name === 'string'
      ? candidate.name.trim().slice(0, MAX_PLAYER_NAME_LENGTH) || 'ผู้เล่นออนไลน์'
      : 'ผู้เล่นออนไลน์',
    x: clamp(candidate.x, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT),
    z: clamp(candidate.z, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT),
    dir: isFiniteNumber(candidate.dir) ? candidate.dir : 0,
    locomotion: sanitizeLocomotion(candidate.locomotion),
    animation: sanitizeAnimation(candidate.animation),
  };
  if (isFiniteNumber(candidate.y)) player.y = clamp(candidate.y, -PRESENCE_COORDINATE_LIMIT, PRESENCE_COORDINATE_LIMIT);
  if (candidate.presentation !== undefined) { const presentation = sanitizePresentation(candidate.presentation); if (presentation) player.presentation = presentation; }
  if (candidate.visual !== undefined) { const visual = sanitizeVisual(candidate.visual, { maxEvents: maxVisualEvents }); if (visual) player.visual = visual; }
  return Object.freeze(player);
}

export function sanitizeOnlineWorldSnapshot(payload, expectedZone) {
  if (!isRecord(payload) || !Array.isArray(payload.players)) return null;
  const zone = safeZone(payload.zone);
  if (!zone) return null;
  if (expectedZone !== undefined && zone !== expectedZone) return null;
  const generation = payload.generation;
  if (generation !== undefined
    && (!Number.isSafeInteger(generation) || generation < 1 || generation > MAX_WORLD_ROUTE_GENERATION)) return null;
  if (payload.players.length > MAX_SNAPSHOT_CANDIDATES) return null;
  const players = [];
  const seen = new Set();
  for (const candidate of payload.players) {
    if (players.length >= MAX_REMOTE_PLAYERS) break;
    const player = sanitizePresencePlayer(candidate, seen);
    if (player) players.push(player);
  }
  let actors = [];
  if (payload.actors !== undefined) {
    // `generation` on the snapshot is the viewer's world-route generation.
    // Actor lifecycle generations belong to the actor stream and may advance
    // independently during reconnect/despawn/re-spawn. Never compare these
    // two domains or a valid actor snapshot is lost after a route reconnect.
    actors = sanitizePresenceActors(payload.actors, zone, undefined, { maxVisualEvents: MAX_VISUAL_SNAPSHOT_EVENTS });
    if (!actors) return null;
  }
  return Object.freeze({
    zone,
    ...(generation === undefined ? {} : { generation }),
    players: Object.freeze(players),
    ...(payload.actors === undefined ? {} : { actors }),
  });
}

export function worldSnapshotPayload(message) {
  if (!message || message.type !== 'world-snapshot') return null;
  return sanitizeOnlineWorldSnapshot(message.payload);
}

export function isRemoteWorldPlayer(item, selfId) {
  if (!item?.id || !isFiniteNumber(item.x) || !isFiniteNumber(item.z)) return false;
  if (selfId != null && selfId !== '' && String(item.id).toLowerCase() === String(selfId).toLowerCase()) return false;
  return true;
}

export function filterRemotePlayers(players, selfId) {
  if (!Array.isArray(players)) return [];
  return players.filter(item => isRemoteWorldPlayer(item, selfId));
}

export function selfPresenceId(profile, explicitId) {
  return explicitId || profile?.id || profile?.accountId || profile?.username || null;
}

export function currentSelfPresenceId() {
  if (typeof window === 'undefined') return null;
  return selfPresenceId(window.POCKETMONSTER_AUTH_PROFILE_BRIDGE?.profile, window.POCKETMONSTER_SELF_PRESENCE_ID);
}
