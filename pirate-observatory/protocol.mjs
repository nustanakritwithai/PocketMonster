export const PIRATE_OBSERVATORY_SCHEMA_VERSION = 1;

export const CHANGE_TYPES = Object.freeze({
  MOVE: 'MOVE',
  SPAWN: 'SPAWN',
  DESPAWN: 'DESPAWN',
  DAMAGE: 'DAMAGE',
  HEAL: 'HEAL',
  STATE_CHANGE: 'STATE_CHANGE',
  EVENT_START: 'EVENT_START',
  EVENT_END: 'EVENT_END',
  FACTION_CHANGE: 'FACTION_CHANGE',
  RESOURCE_CHANGE: 'RESOURCE_CHANGE',
  AI_ACTION: 'AI_ACTION',
  ADMIN_ACTION: 'ADMIN_ACTION',
});

export const CHANGE_TYPE_SET = new Set(Object.values(CHANGE_TYPES));

export const SYNC_STATES = Object.freeze({
  LIVE: 'LIVE',
  DELAYED: 'DELAYED',
  DESYNC: 'DESYNC',
  CATCHING_UP: 'CATCHING_UP',
  SYNCING: 'SYNCING',
  OFFLINE: 'OFFLINE',
});

export const STREAM_CHANNELS = Object.freeze({
  WORLD_DELTA: 'world.delta',
  WORLD_EVENT: 'world.event',
  ENTITY_WATCH: 'entity.watch',
  SERVER_HEALTH: 'server.health',
  WORLD_HEALTH: 'world.health',
  SYSTEM_ALERT: 'system.alert',
});

export function assertPartition(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError('partition must be a non-empty string');
  }
  return value;
}

export function assertTick(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('tick must be a non-negative safe integer');
  }
  return value;
}

export function createStreamEnvelope({ channel, partition = 'world', tick, sequence, payload, serverTime = Date.now() }) {
  if (!Object.values(STREAM_CHANNELS).includes(channel)) {
    throw new TypeError(`unsupported stream channel: ${channel}`);
  }
  assertPartition(partition);
  assertTick(tick);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new TypeError('sequence must be a non-negative safe integer');
  }
  return Object.freeze({
    channel,
    schemaVersion: PIRATE_OBSERVATORY_SCHEMA_VERSION,
    serverTime,
    partition,
    tick,
    sequence,
    payload,
  });
}
