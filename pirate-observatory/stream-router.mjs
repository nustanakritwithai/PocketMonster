import { PIRATE_OBSERVATORY_SCHEMA_VERSION, STREAM_CHANNELS } from './protocol.mjs';

export function routeObservatoryEnvelope(envelope, handlers = {}) {
  if (!envelope || envelope.schemaVersion !== PIRATE_OBSERVATORY_SCHEMA_VERSION) {
    return { ok: false, reason: 'SCHEMA_MISMATCH' };
  }
  if (!Object.values(STREAM_CHANNELS).includes(envelope.channel)) {
    return { ok: false, reason: 'CHANNEL_UNSUPPORTED' };
  }
  if (typeof envelope.partition !== 'string' || !envelope.partition) {
    return { ok: false, reason: 'PARTITION_REQUIRED' };
  }
  if (!Number.isSafeInteger(envelope.tick) || envelope.tick < 0
    || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 0) {
    return { ok: false, reason: 'INVALID_CURSOR' };
  }

  const payload = envelope.payload ?? {};
  if (payload.partition !== undefined && payload.partition !== envelope.partition) {
    return { ok: false, reason: 'PARTITION_MISMATCH' };
  }
  if (payload.sequence !== undefined && payload.sequence !== envelope.sequence) {
    return { ok: false, reason: 'SEQUENCE_MISMATCH' };
  }

  const handler = {
    [STREAM_CHANNELS.WORLD_DELTA]: handlers.onDelta,
    [STREAM_CHANNELS.WORLD_EVENT]: handlers.onEvent,
    [STREAM_CHANNELS.ENTITY_WATCH]: handlers.onWatch,
    [STREAM_CHANNELS.SERVER_HEALTH]: handlers.onServerHealth,
    [STREAM_CHANNELS.WORLD_HEALTH]: handlers.onWorldHealth,
    [STREAM_CHANNELS.SYSTEM_ALERT]: handlers.onAlert,
  }[envelope.channel];

  if (typeof handler === 'function') handler(payload, envelope);
  return { ok: true, handled: typeof handler === 'function', channel: envelope.channel };
}
