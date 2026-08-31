import assert from 'node:assert/strict';
import { createCombatV91Shell } from '../combat-v91-entry.mjs';
import {
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

const predicted = shell.predict({
  intentId: 'intent:single-html-shell',
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  action: fixture.action,
  worldSnapshot: fixture.world,
});
assert.equal(predicted.ok, true, predicted.reason);
assert.equal(predicted.viewModel.entityId, fixture.target.entityId);
assert.equal(container.children.length, 1, 'prediction replaces the same panel instead of adding HTML fragments');
assert.equal(shell.getState().authoritativeBase[fixture.target.entityId].stats.hpCurrent,
  fixture.target.stats.hpCurrent, 'Client shell cannot commit predicted HP');

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
assert.equal(createCombatV91Shell({ container: {} }).reason, 'invalid_active_shell_container');

console.log('V9.1 single HTML shell: PASS (one container, one state, Server-only commit)');
