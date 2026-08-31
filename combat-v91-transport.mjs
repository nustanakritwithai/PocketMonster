import {
  COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA,
  COMBAT_V91_PREDICTION_SCHEMA,
} from './combat-v91-protocol.mjs';

export const COMBAT_V91_TRANSPORT_VERSION = 'combat-v91-production-transport/v1';
export const COMBAT_V91_TRANSPORT_POLICY = Object.freeze({
  physicalSocket: 'existing_authenticated_chat_socket_only',
  networkCreation: false,
  envelopeEgress: COMBAT_V91_PREDICTION_SCHEMA,
  authorityIngress: COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA,
  reconnect: 'bounded_idempotent_pending_replay',
  responseRouting: 'intent_and_combat_bound',
  authoritativeWrites: false,
});

const DEFAULT_MAX_PENDING = 128;

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validIdentity(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function validEnvelope(envelope) {
  return isRecord(envelope)
    && envelope.schemaVersion === COMBAT_V91_PREDICTION_SCHEMA
    && validIdentity(envelope.intentId)
    && validIdentity(envelope.combatId)
    && Number.isSafeInteger(envelope.actionSequence)
    && envelope.actionSequence >= 0
    && typeof envelope.envelopeFingerprint === 'string'
    && /^[0-9a-f]{64}$/.test(envelope.envelopeFingerprint);
}

function validAuthorityResponse(response) {
  return isRecord(response)
    && response.schemaVersion === COMBAT_V91_AUTHORITY_RESPONSE_SCHEMA
    && validIdentity(response.intentId)
    && validIdentity(response.combatId);
}

export function createCombatV91ProductionTransport({ maxPending = DEFAULT_MAX_PENDING } = {}) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 1_024) {
    return result(false, 'invalid_transport_capacity');
  }

  const pending = new Map();
  let chatRuntime = null;
  let reconcileResponse = null;
  let unsubscribeAuthority = null;
  let unsubscribeStatus = null;
  let started = false;
  let stopped = false;
  let connected = false;
  let sentCount = 0;
  let replayCount = 0;
  let reconciledCount = 0;
  let ignoredResponseCount = 0;
  let lastFailure = null;

  function orderedPending() {
    return [...pending.values()].sort((left, right) => (
      left.envelope.actionSequence - right.envelope.actionSequence
      || left.envelope.intentId.localeCompare(right.envelope.intentId)
    ));
  }

  function sendRecord(record, replay = false) {
    const sent = chatRuntime?.combat?.sendPrediction?.(record.envelope);
    if (!sent?.ok) {
      lastFailure = sent?.reason || 'combat_transport_unavailable';
      return result(false, lastFailure);
    }
    record.sendCount += 1;
    record.lastSocketGeneration = sent.socketGeneration;
    sentCount += 1;
    if (replay) replayCount += 1;
    lastFailure = null;
    return result(true, replay ? 'replayed' : 'sent', {
      socketGeneration: sent.socketGeneration,
    });
  }

  function flushPending() {
    if (!started || stopped || !connected) return result(false, 'combat_transport_disconnected');
    let flushed = 0;
    for (const record of orderedPending()) {
      const replay = record.sendCount > 0;
      const sent = sendRecord(record, replay);
      if (!sent.ok) break;
      flushed += 1;
    }
    return result(true, flushed > 0 ? 'pending_flushed' : 'no_pending_predictions', { flushed });
  }

  function acceptAuthorityResponse(response) {
    if (stopped || !validAuthorityResponse(response)) {
      ignoredResponseCount += 1;
      return result(false, 'invalid_authority_response_route');
    }
    const record = pending.get(response.intentId);
    if (!record || record.envelope.combatId !== response.combatId) {
      ignoredResponseCount += 1;
      return result(false, 'unmatched_authority_response');
    }
    let reconciled;
    try {
      reconciled = reconcileResponse?.(response);
    } catch {
      reconciled = null;
    }
    if (!reconciled?.ok) {
      lastFailure = reconciled?.reason || 'authority_reconcile_failed';
      return result(false, lastFailure);
    }
    pending.delete(response.intentId);
    reconciledCount += 1;
    lastFailure = null;
    return result(true, reconciled.reason || 'reconciled');
  }

  const transport = Object.freeze({
    version: COMBAT_V91_TRANSPORT_VERSION,
    policy: COMBAT_V91_TRANSPORT_POLICY,
    bindReconcile(callback) {
      if (stopped) return result(false, 'combat_transport_stopped');
      if (typeof callback !== 'function') return result(false, 'invalid_reconcile_callback');
      if (reconcileResponse && reconcileResponse !== callback) {
        return result(false, 'combat_reconcile_already_bound');
      }
      reconcileResponse = callback;
      return result(true, 'combat_reconcile_bound');
    },
    start({ runtime } = {}) {
      if (stopped) return result(false, 'combat_transport_stopped');
      if (started) return runtime === chatRuntime
        ? result(true, 'combat_transport_already_started')
        : result(false, 'combat_transport_runtime_conflict');
      if (!reconcileResponse) return result(false, 'combat_reconcile_not_bound');
      const combat = runtime?.combat;
      if (typeof combat?.sendPrediction !== 'function'
        || typeof combat?.subscribeAuthority !== 'function'
        || typeof combat?.subscribeStatus !== 'function') {
        return result(false, 'invalid_shared_socket_runtime');
      }
      chatRuntime = runtime;
      started = true;
      unsubscribeAuthority = combat.subscribeAuthority(acceptAuthorityResponse);
      unsubscribeStatus = combat.subscribeStatus(status => {
        connected = status?.connected === true;
        if (connected) flushPending();
      });
      if (typeof unsubscribeAuthority !== 'function' || typeof unsubscribeStatus !== 'function') {
        transport.stop('invalid_shared_socket_subscription');
        return result(false, 'invalid_shared_socket_subscription');
      }
      return result(true, 'combat_transport_started', { connected });
    },
    canAcceptIntent(intentId) {
      if (stopped) return result(false, 'combat_transport_stopped');
      if (!validIdentity(intentId)) return result(false, 'invalid_prediction_intent');
      if (pending.has(intentId)) return result(false, 'prediction_intent_collision');
      return pending.size < maxPending
        ? result(true, 'prediction_capacity_available')
        : result(false, 'prediction_transport_capacity_reached');
    },
    canEnqueue(envelope) {
      if (stopped) return result(false, 'combat_transport_stopped');
      if (!validEnvelope(envelope)) return result(false, 'invalid_prediction_envelope');
      const existing = pending.get(envelope.intentId);
      if (existing) {
        return existing.envelope.envelopeFingerprint === envelope.envelopeFingerprint
          && existing.envelope.combatId === envelope.combatId
          ? result(true, 'prediction_already_pending')
          : result(false, 'prediction_intent_collision');
      }
      return pending.size < maxPending
        ? result(true, 'prediction_capacity_available')
        : result(false, 'prediction_transport_capacity_reached');
    },
    enqueue(envelope) {
      const accepted = transport.canEnqueue(envelope);
      if (!accepted.ok) return accepted;
      let record = pending.get(envelope.intentId);
      if (!record) {
        record = {
          envelope: Object.freeze({ ...envelope }),
          sendCount: 0,
          lastSocketGeneration: null,
        };
        pending.set(envelope.intentId, record);
      }
      if (!started || !connected) {
        return result(true, 'prediction_queued', { pendingCount: pending.size });
      }
      const sent = sendRecord(record, record.sendCount > 0);
      return sent.ok
        ? result(true, sent.reason, { pendingCount: pending.size, socketGeneration: sent.socketGeneration })
        : result(true, 'prediction_queued', { pendingCount: pending.size, sendFailure: sent.reason });
    },
    clearSession(reason = 'combat-session-closed') {
      const cleared = pending.size;
      pending.clear();
      lastFailure = null;
      return result(true, String(reason || 'combat-session-closed'), { cleared });
    },
    stop(reason = 'combat-transport-stopped') {
      if (stopped) return result(true, 'combat_transport_already_stopped');
      stopped = true;
      started = false;
      connected = false;
      try { unsubscribeAuthority?.(); } catch {}
      try { unsubscribeStatus?.(); } catch {}
      unsubscribeAuthority = null;
      unsubscribeStatus = null;
      chatRuntime = null;
      pending.clear();
      lastFailure = String(reason || 'combat-transport-stopped');
      return result(true, lastFailure);
    },
    diagnostics() {
      return Object.freeze({
        started,
        stopped,
        connected,
        pendingCount: pending.size,
        sentCount,
        replayCount,
        reconciledCount,
        ignoredResponseCount,
        lastFailure,
      });
    },
  });

  return result(true, null, { transport });
}
