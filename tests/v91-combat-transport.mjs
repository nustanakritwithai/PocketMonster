import assert from 'node:assert/strict';

import {
  COMBAT_V91_TRANSPORT_POLICY,
  COMBAT_V91_TRANSPORT_VERSION,
  createCombatV91ProductionTransport,
} from '../combat-v91-transport.mjs';

function envelope(intentId, actionSequence = 1, combatId = 'combat:transport') {
  return Object.freeze({
    schemaVersion: 'combat-prediction-envelope/v9.1',
    intentId,
    combatId,
    actionSequence,
    envelopeFingerprint: `${String(actionSequence).padStart(64, '0')}`,
  });
}

function response(intentId, combatId = 'combat:transport') {
  return Object.freeze({
    schemaVersion: 'combat-authority-response/v9.1.2',
    intentId,
    combatId,
  });
}

function fakeRuntime() {
  const authorityListeners = new Set();
  const statusListeners = new Set();
  const sent = [];
  let connected = false;
  let generation = 1;
  return {
    sent,
    emitAuthority(value) {
      for (const listener of [...authorityListeners]) listener(value);
    },
    setConnected(value, nextGeneration = generation) {
      connected = value === true;
      generation = nextGeneration;
      for (const listener of [...statusListeners]) listener({ connected, socketGeneration: generation });
    },
    combat: {
      sendPrediction(value) {
        if (!connected) return { ok: false, reason: 'combat_transport_disconnected' };
        sent.push(value);
        return { ok: true, socketGeneration: generation };
      },
      subscribeAuthority(listener) {
        authorityListeners.add(listener);
        return () => authorityListeners.delete(listener);
      },
      subscribeStatus(listener) {
        statusListeners.add(listener);
        listener({ connected, socketGeneration: generation });
        return () => statusListeners.delete(listener);
      },
    },
  };
}

assert.equal(COMBAT_V91_TRANSPORT_VERSION, 'combat-v91-production-transport/v1');
assert.equal(COMBAT_V91_TRANSPORT_POLICY.networkCreation, false);
assert.equal(COMBAT_V91_TRANSPORT_POLICY.physicalSocket, 'existing_authenticated_chat_socket_only');
assert.equal(createCombatV91ProductionTransport({ maxPending: 0 }).reason, 'invalid_transport_capacity');

const created = createCombatV91ProductionTransport({ maxPending: 2 });
assert.equal(created.ok, true, created.reason);
const { transport } = created;
const reconciled = [];
assert.equal(transport.bindReconcile(value => {
  reconciled.push(value);
  return { ok: true, reason: 'confirmed' };
}).ok, true);

const first = envelope('intent:transport:1', 1);
assert.equal(transport.enqueue(first).reason, 'prediction_queued', 'prediction queues before the shared socket starts');
assert.equal(transport.diagnostics().pendingCount, 1);

const runtime = fakeRuntime();
assert.equal(transport.start({ runtime }).ok, true);
assert.equal(runtime.sent.length, 0, 'disconnected start does not fabricate a send');
runtime.setConnected(true, 1);
assert.deepEqual(runtime.sent, [first], 'connect flushes the pending prediction once');
runtime.setConnected(false, 1);
runtime.setConnected(true, 2);
assert.deepEqual(runtime.sent, [first, first], 'reconnect replays the exact idempotent envelope');
assert.equal(transport.diagnostics().replayCount, 1);

runtime.emitAuthority(response('intent:foreign'));
runtime.emitAuthority(response('intent:transport:1', 'combat:foreign'));
assert.equal(reconciled.length, 0, 'foreign intent/combat responses cannot reach reconciliation');
assert.equal(transport.diagnostics().pendingCount, 1);
runtime.emitAuthority(response('intent:transport:1'));
assert.equal(reconciled.length, 1);
assert.equal(transport.diagnostics().pendingCount, 0);
runtime.emitAuthority(response('intent:transport:1'));
assert.equal(reconciled.length, 1, 'duplicate response is ignored after settlement');

const second = envelope('intent:transport:2', 2);
const third = envelope('intent:transport:3', 3);
assert.equal(transport.enqueue(second).ok, true);
assert.equal(transport.enqueue(third).ok, true);
assert.equal(transport.canAcceptIntent('intent:transport:4').reason,
  'prediction_transport_capacity_reached');
assert.equal(transport.canEnqueue({ ...second, envelopeFingerprint: 'f'.repeat(64) }).reason,
  'prediction_intent_collision');
assert.equal(transport.clearSession().cleared, 2);
assert.equal(transport.diagnostics().pendingCount, 0);
assert.equal(transport.stop().ok, true);
assert.equal(transport.enqueue(envelope('intent:after-stop')).reason, 'combat_transport_stopped');

console.log('V9.1 production Combat transport: PASS (shared socket, reconnect replay, bound ingress)');
