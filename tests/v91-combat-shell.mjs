import assert from 'node:assert/strict';
import { createCombatV91Shell } from '../combat-v91-entry.mjs';
import { createCombatV91ProductionTransport } from '../combat-v91-transport.mjs';
import {
  TEST_DYNAMICS_SOURCE_PROVENANCE_FINGERPRINT,
  fixtureDirectDynamics,
  fixtureAuthorityResponse,
  fixtureCombat,
} from './v91-combat-fixtures.mjs';

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.className = '';
    this.hidden = false;
    this.textContent = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
}

const documentRef = {
  createElement(tagName) {
    return new FakeElement(documentRef, tagName);
  },
};
const container = new FakeElement(documentRef, 'aside');
const created = createCombatV91Shell({ container });
assert.equal(created.ok, true, created.reason);
const { shell } = created;
assert.equal(container.hidden, true);
assert.equal(shell.policy.singleHtmlShell, true);
assert.equal(shell.policy.singleActiveSession, true);
assert.equal(shell.policy.networkCreation, false);
assert.equal(shell.policy.authoritativeWrites, false);
assert.equal(shell.policy.hpWriteAuthority,
  'server_target_owner_only_client_projection_never_commits');
assert.equal(shell.policy.statusWriteAuthority,
  'server_entity_owner_only_client_projection_never_commits');
assert.equal(shell.policy.worldPositionWriteAuthority,
  'world_server_only_client_never_commits_transform');
assert.equal(shell.policy.productionTransport,
  'shared_authenticated_chat_socket_v1_opt_in');
assert.equal(shell.policy.authorityResponseIngress, 'private_transport_binding_only');
assert.equal(shell.getState(), null);
assert.equal(shell.predict().reason, 'combat_session_inactive');
assert.equal(shell.reconcile({}).reason, 'combat_session_inactive');

const fixture = fixtureCombat({ combatId: 'combat:single-html-shell' });
const opened = shell.openSession({
  combatId: fixture.combatId,
  profiles: [fixture.actor, fixture.target],
  statusSnapshots: [fixture.actorStatus, fixture.targetStatus],
  focusedEntityId: fixture.actor.entityId,
});
assert.equal(opened.ok, true, opened.reason);
assert.equal(container.hidden, false);
assert.equal(container.children.length, 1, 'one active shell owns one Combat panel');
assert.equal(container.children[0].ownerDocument, documentRef);

const scheduled = shell.scheduleAction({
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  startTick: 0,
  bindingVersion: 'test-shell-action-dynamics/v1',
  sourceProvenanceFingerprint: TEST_DYNAMICS_SOURCE_PROVENANCE_FINGERPRINT,
  action: fixture.action,
  dynamics: fixtureDirectDynamics(fixture.action),
});
assert.equal(scheduled.ok, true, scheduled.reason);
const advanced = shell.advanceAction({ actionSequence: 1, throughTick: 2 });
assert.equal(advanced.ok, true, advanced.reason);
const impact = advanced.events.find(event => event.type === 'impact.requested');
assert.ok(impact);

const predicted = shell.predict({
  intentId: 'intent:single-html-shell',
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  action: fixture.action,
  dynamicsImpactKey: impact.payload.idempotencyKey,
  worldSnapshot: fixture.world,
});
assert.equal(predicted.ok, true, predicted.reason);
assert.equal(predicted.viewModel.entityId, fixture.target.entityId);
assert.equal(container.children.length, 1, 'prediction replaces the same panel instead of adding HTML fragments');
assert.equal(shell.getState().authoritativeBase[fixture.target.entityId].stats.hpCurrent,
  fixture.target.stats.hpCurrent, 'Client shell cannot commit predicted HP');
assert.equal(shell.getState().authoritativeStatusByEntity[fixture.target.entityId].fingerprint,
  fixture.targetStatus.fingerprint, 'Client shell cannot commit predicted Status');

const stateBeforeInvalidFocus = shell.getState();
assert.equal(shell.predict({
  intentId: 'intent:invalid-focus',
  actionSequence: 2,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  action: fixture.action,
  worldSnapshot: fixture.world,
}, { focusEntityId: 'unknown' }).reason, 'unknown_entity');
assert.equal(shell.getState(), stateBeforeInvalidFocus,
  'invalid presentation focus cannot enqueue a prediction');

const authority = fixtureAuthorityResponse({
  fixture,
  proposal: predicted.proposal,
  envelope: predicted.envelope,
});
const reconciled = shell.reconcile(authority.response);
assert.equal(reconciled.ok, true, reconciled.reason);
assert.deepEqual(reconciled.confirmedDynamicsEffects, [],
  'shell exposes the authoritative dynamics-effect hook without fabricating effects');
assert.equal(container.children.length, 1, 'Server reconciliation remains in the same HTML shell');
assert.equal(shell.getState().authoritativeBase[fixture.target.entityId].stats.hpCurrent,
  authority.authoritativeProfile.stats.hpCurrent);

assert.equal(shell.focus(fixture.actor.entityId).ok, true);
assert.equal(container.children.length, 1);
assert.equal(shell.focus('unknown').reason, 'unknown_entity');
assert.equal(shell.closeSession().ok, true);
assert.equal(container.hidden, true);
assert.deepEqual(container.children, []);
assert.equal(shell.getState(), null);

const transportedContainer = new FakeElement(documentRef, 'aside');
const transportCreated = createCombatV91ProductionTransport();
assert.equal(transportCreated.ok, true, transportCreated.reason);
const authorityListeners = new Set();
const sentPredictions = [];
const sharedRuntime = {
  combat: {
    sendPrediction(envelope) {
      sentPredictions.push(envelope);
      return { ok: true, socketGeneration: 1 };
    },
    subscribeAuthority(listener) {
      authorityListeners.add(listener);
      return () => authorityListeners.delete(listener);
    },
    subscribeStatus(listener) {
      listener({ connected: true, socketGeneration: 1 });
      return () => {};
    },
  },
};
const transportedCreated = createCombatV91Shell({
  container: transportedContainer,
  transport: transportCreated.transport,
});
assert.equal(transportedCreated.ok, true, transportedCreated.reason);
const transportedShell = transportedCreated.shell;
assert.equal(transportCreated.transport.start({ runtime: sharedRuntime }).ok, true);
assert.equal(transportedShell.openSession({
  combatId: fixture.combatId,
  profiles: [fixture.actor, fixture.target],
  statusSnapshots: [fixture.actorStatus, fixture.targetStatus],
  focusedEntityId: fixture.actor.entityId,
}).ok, true);
assert.equal(transportedShell.scheduleAction({
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  startTick: 0,
  bindingVersion: 'test-shell-action-dynamics/v1',
  sourceProvenanceFingerprint: TEST_DYNAMICS_SOURCE_PROVENANCE_FINGERPRINT,
  action: fixture.action,
  dynamics: fixtureDirectDynamics(fixture.action),
}).ok, true);
const transportedAdvance = transportedShell.advanceAction({ actionSequence: 1, throughTick: 2 });
const transportedImpact = transportedAdvance.events.find(event => event.type === 'impact.requested');
const transportedPrediction = transportedShell.predict({
  intentId: 'intent:single-html-shell:transported',
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  action: fixture.action,
  dynamicsImpactKey: transportedImpact.payload.idempotencyKey,
  worldSnapshot: fixture.world,
});
assert.equal(transportedPrediction.ok, true, transportedPrediction.reason);
assert.equal(sentPredictions[0].intentId, transportedPrediction.envelope.intentId,
  'shell egresses the exact prediction over the injected shared transport');
const transportedAuthority = fixtureAuthorityResponse({
  fixture,
  proposal: transportedPrediction.proposal,
  envelope: transportedPrediction.envelope,
});
for (const listener of authorityListeners) listener(transportedAuthority.response);
assert.equal(transportedShell.getState().authoritativeBase[fixture.target.entityId].stats.hpCurrent,
  transportedAuthority.authoritativeProfile.stats.hpCurrent,
  'private transport ingress reconciles the Server response into the active shell');
assert.equal(transportCreated.transport.diagnostics().pendingCount, 0);
transportCreated.transport.stop();

assert.equal(createCombatV91Shell({ container: {} }).reason, 'invalid_active_shell_container');

console.log('V9.1 single HTML shell: PASS (one container, one state, Server-only commit)');
