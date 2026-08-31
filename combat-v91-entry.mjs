import { resolveCombatV91Proposal } from './combat-v91-rules.mjs';
import { createDomainCombatProfile } from './combat-v91-adapters.mjs';
import {
  createCombatPredictionEnvelope,
  createCombatV91ClientState,
  enqueueCombatPrediction,
  reconcileCombatPrediction,
} from './combat-v91-client-store.mjs';
import {
  COMBAT_V91_STYLESHEET_HREF,
  COMBAT_V91_UI_MOUNT_POLICY,
  createCombatV91ViewModel,
  renderCombatV91Panel,
} from './combat-v91-ui.mjs';
import { createCombatStatusProjection } from './combat-v91-status.mjs';

export const COMBAT_V91_ENTRY_VERSION = 'combat-v91-entry/v1';
export const COMBAT_V91_ENTRY_POLICY = Object.freeze({
  activation: 'active_shell_adapter',
  monolithWiring: false,
  networkCreation: false,
  authoritativeWrites: false,
  shellMount: COMBAT_V91_UI_MOUNT_POLICY.shell,
  singleHtmlShell: true,
  singleActiveSession: true,
  standaloneDocument: false,
  iframeCreation: false,
  baseProfileCreation: 'pirate_pocket_domain_calculators_only',
  stylesheetHref: COMBAT_V91_STYLESHEET_HREF,
  stylesheetLoading: COMBAT_V91_UI_MOUNT_POLICY.stylesheetLoading,
});

export function createCombatV91BaseProfile(source = {}) {
  return createDomainCombatProfile(source);
}

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

export function createCombatV91Client({ combatId, profiles, statusSnapshots } = {}) {
  const initial = createCombatV91ClientState({ combatId, profiles, statusSnapshots });
  if (!initial.ok) return initial;
  let currentState = initial.state;

  const client = Object.freeze({
    version: COMBAT_V91_ENTRY_VERSION,
    policy: COMBAT_V91_ENTRY_POLICY,
    getState() {
      return currentState;
    },
    predict({
      intentId,
      actionSequence,
      actorEntityId,
      targetEntityId,
      action,
      worldSnapshot,
    } = {}) {
      const attacker = currentState.authoritativeBase[actorEntityId];
      const target = currentState.authoritativeBase[targetEntityId];
      if (!attacker || !target) return result(false, 'unknown_entity');
      const resolved = resolveCombatV91Proposal({
        combatId,
        actionSequence,
        attacker,
        target,
        action,
        worldSnapshot,
        attackerStatusSnapshot: currentState.authoritativeStatusByEntity[actorEntityId],
        targetStatusSnapshot: currentState.authoritativeStatusByEntity[targetEntityId],
      });
      if (!resolved.ok) return resolved;
      const envelope = createCombatPredictionEnvelope({ intentId, proposal: resolved.proposal });
      if (!envelope.ok) return envelope;
      const enqueued = enqueueCombatPrediction(currentState, {
        envelope: envelope.envelope,
        proposal: resolved.proposal,
      });
      if (!enqueued.ok) return enqueued;
      currentState = enqueued.state;
      return result(true, resolved.reason, {
        proposal: resolved.proposal,
        envelope: envelope.envelope,
        state: currentState,
      });
    },
    reconcile(response) {
      const reconciled = reconcileCombatPrediction(currentState, response);
      if (!reconciled.ok) return reconciled;
      currentState = reconciled.state;
      return result(true, reconciled.reason, { state: currentState });
    },
    view(entityId, options = {}) {
      const projection = currentState.displayProjection[entityId];
      if (!projection) return result(false, 'unknown_entity');
      const statusSnapshot = projection.pending.statusSnapshots.at(-1) ?? projection.statusSnapshot;
      const status = createCombatStatusProjection(statusSnapshot.state, {
        nowSec: statusSnapshot.state.currentTimeSec,
        incomingType: options.incomingType ?? null,
      });
      if (!status.ok) return status;
      return createCombatV91ViewModel(currentState, entityId, {
        ...options,
        statusProjection: status.projection,
      });
    },
    mount(container, entityId, options = {}) {
      if (!container?.ownerDocument || typeof container.replaceChildren !== 'function') {
        return result(false, 'invalid_active_shell_container');
      }
      const projected = client.view(entityId, options);
      if (!projected.ok) return projected;
      if (!renderCombatV91Panel(container, projected.viewModel)) return result(false, 'render_failed');
      return result(true, null, {
        viewModel: projected.viewModel,
        mount: COMBAT_V91_UI_MOUNT_POLICY.shell,
      });
    },
  });
  return result(true, null, { client });
}

export function createCombatV91Shell({ container } = {}) {
  if (!container?.ownerDocument || typeof container.replaceChildren !== 'function') {
    return result(false, 'invalid_active_shell_container');
  }
  let activeClient = null;
  let focusedEntityId = null;

  function render(options = {}) {
    if (!activeClient || !focusedEntityId) return result(false, 'combat_session_inactive');
    const mounted = activeClient.mount(container, focusedEntityId, options);
    if (!mounted.ok) return mounted;
    container.hidden = false;
    return result(true, null, {
      entityId: focusedEntityId,
      viewModel: mounted.viewModel,
      state: activeClient.getState(),
    });
  }

  const shell = Object.freeze({
    version: COMBAT_V91_ENTRY_VERSION,
    policy: COMBAT_V91_ENTRY_POLICY,
    getState() {
      return activeClient?.getState() ?? null;
    },
    openSession({ combatId, profiles, statusSnapshots, focusedEntityId: requestedEntityId } = {}) {
      const created = createCombatV91Client({ combatId, profiles, statusSnapshots });
      if (!created.ok) return created;
      const firstEntityId = requestedEntityId ?? profiles?.[0]?.entityId;
      if (!created.client.getState().authoritativeBase[firstEntityId]) return result(false, 'unknown_entity');
      activeClient = created.client;
      focusedEntityId = firstEntityId;
      return render();
    },
    predict(command = {}, { focusEntityId = command.targetEntityId } = {}) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      if (focusEntityId !== undefined
        && !activeClient.getState().authoritativeBase[focusEntityId]) return result(false, 'unknown_entity');
      const predicted = activeClient.predict(command);
      if (!predicted.ok) return predicted;
      if (focusEntityId !== undefined) focusedEntityId = focusEntityId;
      const rendered = render();
      if (!rendered.ok) return rendered;
      return result(true, predicted.reason, {
        proposal: predicted.proposal,
        envelope: predicted.envelope,
        state: predicted.state,
        viewModel: rendered.viewModel,
      });
    },
    reconcile(response, { focusEntityId } = {}) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      if (focusEntityId !== undefined
        && !activeClient.getState().authoritativeBase[focusEntityId]) return result(false, 'unknown_entity');
      const reconciled = activeClient.reconcile(response);
      if (!reconciled.ok) return reconciled;
      if (focusEntityId !== undefined) focusedEntityId = focusEntityId;
      const rendered = render();
      if (!rendered.ok) return rendered;
      return result(true, reconciled.reason, {
        state: reconciled.state,
        viewModel: rendered.viewModel,
      });
    },
    focus(entityId, options = {}) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      if (!activeClient.getState().authoritativeBase[entityId]) return result(false, 'unknown_entity');
      focusedEntityId = entityId;
      return render(options);
    },
    closeSession() {
      activeClient = null;
      focusedEntityId = null;
      container.replaceChildren();
      container.hidden = true;
      return result(true, null);
    },
  });

  container.hidden = true;
  return result(true, null, { shell });
}
