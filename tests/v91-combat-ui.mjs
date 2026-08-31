import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCombatV91Client } from '../combat-v91-entry.mjs';
import {
  COMBAT_STAT_LABELS,
  COMBAT_V91_STYLESHEET_HREF,
  COMBAT_V91_UI_MOUNT_POLICY,
  combatV91PanelText,
  renderCombatV91Panel,
} from '../combat-v91-ui.mjs';
import {
  TEST_RNG_SEEDS,
  TEST_STATS,
  fixtureAction,
  fixtureAuthorityResponse,
  fixtureCombat,
  fixtureProfile,
  fixtureWorld,
} from './v91-combat-fixtures.mjs';

const actor = fixtureProfile({
  entityId: 'human:ui:actor', ownerDomain: 'Pirate', entityKind: 'Human',
  stats: { ...TEST_STATS, hpMax: 180, hpCurrent: 180 },
});
const target = fixtureProfile({
  entityId: 'monster:ui:target', ownerDomain: 'Pocket', entityKind: 'Monster',
  stats: { ...TEST_STATS, hpMax: 250, hpCurrent: 250 },
});
const fixture = fixtureCombat({
  combatId: 'combat:ui:shared-shell',
  actor,
  target,
  action: fixtureAction({
    actionId: 'shared:ui:self-buff',
    power: 35,
    statusApplications: [{ linkId: 'SL_0001', target: 'actor' }],
  }),
  world: fixtureWorld({
    actor,
    target,
    seed: TEST_RNG_SEEDS.beta,
    actorMultipliers: { atk: 0.5, spd: 0.75 },
  }),
});

assert.equal(createCombatV91Client({
  combatId: fixture.combatId,
  profiles: [fixture.actor, fixture.target],
  statusSnapshots: [fixture.actorStatus],
}).reason, 'missing_initial_status_snapshot', 'entry requires Server status for every profile');

const created = createCombatV91Client({
  combatId: fixture.combatId,
  profiles: [fixture.actor, fixture.target],
  statusSnapshots: [fixture.actorStatus, fixture.targetStatus],
});
assert.equal(created.ok, true, created.reason);
const { client } = created;
assert.equal(client.policy.authoritativeWrites, false);
assert.equal(client.policy.networkCreation, false);
assert.equal(client.policy.monolithWiring, false);
assert.equal(client.policy.activation, 'active_shell_adapter');
assert.equal(client.policy.singleHtmlShell, true);
assert.equal(client.policy.singleActiveSession, true);
assert.equal(client.policy.shellMount, 'active_shell_container_only');
assert.equal(client.policy.standaloneDocument, false);
assert.equal(client.policy.iframeCreation, false);
assert.equal(client.policy.stylesheetHref, COMBAT_V91_STYLESHEET_HREF);
assert.deepEqual(COMBAT_V91_UI_MOUNT_POLICY, {
  shell: 'active_shell_container_only',
  standaloneDocument: false,
  iframeCreation: false,
  interactiveControls: false,
  stylesheetLoading: 'active_shell_managed',
});

const stateBeforeInitialView = client.getState();
const initialViewResult = client.view(fixture.actor.entityId);
assert.equal(initialViewResult.ok, true, initialViewResult.reason);
const initialView = initialViewResult.viewModel;
assert.equal(client.getState(), stateBeforeInitialView, 'view cannot replace or mutate client state');
assert.equal(initialView.rows.length, 12);
assert.deepEqual(initialView.rows.map(row => row.key), Object.keys(COMBAT_STAT_LABELS));
assert.equal(initialView.authority, 'read_only_projection');
assert.deepEqual(initialView.statuses, []);
assert.equal(Object.isFrozen(initialView), true);
assert.equal(client.view('missing:entity').reason, 'unknown_entity');

const predicted = client.predict({
  intentId: 'intent:ui:self-buff',
  actionSequence: 1,
  actorEntityId: fixture.actor.entityId,
  targetEntityId: fixture.target.entityId,
  action: fixture.action,
  worldSnapshot: fixture.world,
});
assert.equal(predicted.ok, true, predicted.reason);
assert.ok(predicted.proposal.totalDamage > 0);
assert.equal(predicted.proposal.targetStateVersionAfter, fixture.target.stateVersion + 1);
assert.equal(predicted.proposal.rngVersion, 'combat-rng/sha256-counter-v1');
assert.equal(predicted.proposal.rngTicketId, fixture.world.rngTicketId);
assert.equal(predicted.proposal.predictedStatusTransitions[0].changed, true);
assert.equal(predicted.proposal.predictedStatusTransitions[1].changed, false);

const stateBeforePendingView = client.getState();
const pendingView = client.view(fixture.actor.entityId, {
  statusProjection: {
    descriptors: [{ statusId: 'FORGED_STATUS', nameEN: 'forged', stacks: 999 }],
  },
}).viewModel;
assert.equal(client.getState(), stateBeforePendingView, 'pending view is read-only');
assert.equal(pendingView.pending.count, 1);
assert.equal(pendingView.pending.damage, 0);
assert.equal(pendingView.effectiveSource, 'pending_world_status_projection');
assert.equal(pendingView.rows.every(row => row.changedByPending === false), true,
  'an actor prediction cannot fabricate incoming HP damage');
const actorAtk = pendingView.rows.find(row => row.key === 'atk');
const actorSpd = pendingView.rows.find(row => row.key === 'spd');
assert.deepEqual(
  { base: actorAtk.base, effective: actorAtk.effective, pending: actorAtk.pending },
  { base: TEST_STATS.atk, effective: TEST_STATS.atk * 0.5, pending: TEST_STATS.atk * 0.5 },
  'World-owned ATK modifier is visible without replacing Pirate Base ATK',
);
assert.equal(actorAtk.changedByEffective, true);
assert.equal(actorSpd.effective, TEST_STATS.spd * 0.75);
assert.equal(client.getState().authoritativeBase[fixture.actor.entityId].stats.atk, TEST_STATS.atk);
assert.deepEqual(pendingView.statuses.map(status => status.statusId), ['ST_ATK_UP'],
  'entry derives status projection from store; caller cannot inject a fake projection');
assert.equal(pendingView.statuses[0].stacks, 1);
assert.match(combatV91PanelText(pendingView), /PENDING: 1/);
assert.match(combatV91PanelText(pendingView), /ATK: BASE 48 · EFFECTIVE 24 · PENDING 24/);
assert.match(combatV91PanelText(pendingView), /ST\.ATK|โจมตี|ATK/i);

const pendingTargetView = client.view(fixture.target.entityId).viewModel;
const targetHp = pendingTargetView.rows.find(row => row.key === 'hpCurrent');
assert.equal(pendingTargetView.pending.count, 1);
assert.equal(pendingTargetView.pending.damage, predicted.proposal.totalDamage);
assert.equal(targetHp.base, fixture.target.stats.hpCurrent);
assert.equal(targetHp.effective, fixture.target.stats.hpCurrent);
assert.equal(targetHp.pending, fixture.target.stats.hpCurrent - predicted.proposal.totalDamage);
assert.equal(targetHp.changedByPending, true);
assert.match(combatV91PanelText(pendingTargetView),
  new RegExp(`PENDING: 1 / -${predicted.proposal.totalDamage} HP`));

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.attributes = {};
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

const fakeDocument = {
  createElement(tagName) {
    return new FakeElement(fakeDocument, tagName);
  },
};
const container = new FakeElement(fakeDocument, 'div');
const pendingJson = JSON.stringify(pendingView);
assert.equal(renderCombatV91Panel(container, pendingView), true);
assert.equal(JSON.stringify(pendingView), pendingJson, 'renderer cannot mutate the projection');
assert.equal(container.children.length, 1);
const panel = container.children[0];
assert.equal(panel.dataset.authority, 'read_only_projection');
assert.equal(panel.dataset.mount, 'active_shell_container_only');
assert.equal(panel.ownerDocument, fakeDocument, 'renderer uses the supplied active shell document');
assert.equal(panel.children[1].className, 'combat-v91-pending-summary');
assert.equal(panel.children[1].children[0].textContent, 'Pending 1');
assert.equal(panel.children[1].children[1].textContent, 'Damage -0 HP');
assert.equal(panel.children[2].children.length, 24, '12 dt/dd stat pairs are rendered');
assert.equal(panel.children[2].children[5].children.length, 3,
  'ATK visibly renders Base, Effective and Pending columns');
assert.deepEqual(panel.children[2].children[5].children.map(child => child.dataset.layer),
  ['base', 'effective', 'pending']);
assert.deepEqual(panel.children[2].children[5].children.map(child => child.children[1].textContent),
  ['48', '24', '24']);
assert.equal(panel.children[3].children.length, 1, 'predicted shared status is rendered separately');
assert.equal(panel.children[3].children[0].dataset.statusId, 'ST_ATK_UP');
assert.equal(renderCombatV91Panel({}, pendingView), false);
assert.equal(renderCombatV91Panel(container, {}), false);

const stateBeforeMount = client.getState();
const mounted = client.mount(container, fixture.target.entityId);
assert.equal(mounted.ok, true, mounted.reason);
assert.equal(mounted.mount, 'active_shell_container_only');
assert.equal(client.getState(), stateBeforeMount, 'active-shell mount is read-only');
assert.equal(container.children[0].children[1].children[0].textContent, 'Pending 1');
assert.equal(container.children[0].children[1].children[1].textContent,
  `Damage -${predicted.proposal.totalDamage} HP`);
assert.equal(client.mount({}, fixture.actor.entityId).reason, 'invalid_active_shell_container');

function allNodes(node) {
  return [node, ...node.children.flatMap(allNodes)];
}

const mountedNodes = allNodes(container.children[0]);
assert.equal(mountedNodes.every(node => node.ownerDocument === fakeDocument), true,
  'mount creates elements only through the active shell ownerDocument');
assert.equal(mountedNodes.some(node => [
  'html', 'body', 'iframe', 'button', 'input', 'select', 'textarea', 'a',
].includes(node.tagName)), false, 'read-only mount creates no document, frame, link or input controls');

const stylesheet = await readFile(new URL('../combat-v91.css', import.meta.url), 'utf8');
assert.match(stylesheet, /@media \(max-width: 640px\)/, 'mobile breakpoint is shipped');
assert.match(stylesheet, /min-block-size: 44px/, 'touch-sized rows and summaries are shipped');
assert.match(stylesheet, /touch-action: pan-y/, 'touch scrolling remains available');
assert.doesNotMatch(stylesheet, /pointer-events:\s*none/, 'read-only content remains selectable and accessible');

const authoritative = fixtureAuthorityResponse({
  fixture,
  proposal: predicted.proposal,
  envelope: predicted.envelope,
});
const reconciled = client.reconcile(authoritative.response);
assert.equal(reconciled.ok, true, reconciled.reason);
assert.equal(reconciled.reason, 'confirmed');
const confirmedState = client.getState();
const confirmedView = client.view(fixture.actor.entityId).viewModel;
assert.equal(client.getState(), confirmedState, 'confirmed view remains read-only');
assert.equal(confirmedView.pending.count, 0);
assert.deepEqual(confirmedView.statuses.map(status => status.statusId), ['ST_ATK_UP']);
assert.equal(confirmedState.authoritativeStatusByEntity[fixture.actor.entityId].statusStateVersion, 1);
assert.equal(confirmedState.authoritativeBase[fixture.target.entityId].fingerprint,
  authoritative.authoritativeProfile.fingerprint, 'only the Server response commits target HP');
assert.equal(fixture.actorStatus.statusStateVersion, 0, 'entry never mutates the supplied Server snapshot');
assert.equal(fixture.actor.stats.hpCurrent, 180, 'entry never mutates Pirate profile input');
assert.equal(fixture.target.stats.hpCurrent, 250, 'entry never mutates Pocket profile input');

console.log('V9.1 client UI/entry: PASS (base/effective/pending, active-shell mobile read-only mount)');
