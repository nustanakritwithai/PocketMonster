import { resolveCombatV91Proposal } from './combat-v91-rules.mjs';
import { createDomainCombatProfile } from './combat-v91-adapters.mjs';
import { createCombatActionDefinition } from './combat-v91-contract.mjs';
import { createCombatActionDynamicsBinding } from './combat-v91-action-dynamics-binding.mjs';
import {
  advanceCombatDynamicsSchedule,
  createCombatDynamicsSchedule,
} from './combat-v91-dynamics-scheduler.mjs';
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

export {
  createPirateComboDynamicsDefinition,
  createPirateSkillDynamicsDefinition,
} from './combat-v91-pirate-dynamics-adapter.mjs';

export const COMBAT_V91_ENTRY_VERSION = 'combat-v91-entry/v3';
const CLIENT_ACTION_RECORD_LIMIT = 128;
export const COMBAT_V91_ENTRY_POLICY = Object.freeze({
  activation: 'active_shell_adapter',
  monolithWiring: false,
  networkCreation: false,
  authoritativeWrites: false,
  hpWriteAuthority: 'server_target_owner_only_client_projection_never_commits',
  statusWriteAuthority: 'server_entity_owner_only_client_projection_never_commits',
  worldPositionWriteAuthority: 'world_server_only_client_never_commits_transform',
  productionTransport: 'shared_authenticated_chat_socket_v1_opt_in',
  authorityResponseIngress: 'private_transport_binding_only',
  shellMount: COMBAT_V91_UI_MOUNT_POLICY.shell,
  singleHtmlShell: true,
  singleActiveSession: true,
  standaloneDocument: false,
  iframeCreation: false,
  baseProfileCreation: 'pirate_pocket_domain_calculators_only',
  actionDynamics: 'bound_fixed_60hz_client_proposal_plus_server_permit',
  scheduledPredictionGate: 'mandatory_single_direct_impact',
  multiHitResolution: 'fail_closed_until_per_impact_protocol',
  projectileCollisionAuthority: 'fail_closed_until_world_collision_receipt',
  actorOccupancy: 'single_nonterminal_schedule_per_actor',
  confirmedMotionEffects: 'released_only_after_authoritative_outcome',
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
  const dynamicsBySequence = new Map();

  function pruneTerminalDynamicsRecords() {
    if (dynamicsBySequence.size < CLIENT_ACTION_RECORD_LIMIT) return;
    for (const [sequence, record] of dynamicsBySequence) {
      if (record.state.terminal !== null) dynamicsBySequence.delete(sequence);
      if (dynamicsBySequence.size < CLIENT_ACTION_RECORD_LIMIT) return;
    }
  }

  function activeScheduleForActor(actorEntityId) {
    return [...dynamicsBySequence.values()].find(record => (
      record.actorEntityId === actorEntityId && record.state.terminal === null
    )) ?? null;
  }

  function liveResolutionSupported(bound) {
    if (bound.action.hitCount !== 1 || bound.dynamics.hitCount !== 1) return false;
    const hits = bound.dynamics.impactWindows.flatMap(window => window.hits);
    return hits.length === 1 && hits[0].hitOrdinal === 0 && hits[0].delivery === 'direct';
  }

  function dynamicsView(record) {
    if (!record) return null;
    return Object.freeze({
      binding: record.binding,
      state: record.state,
      actorEntityId: record.actorEntityId,
      targetEntityId: record.targetEntityId,
      startTick: record.startTick,
      predictionEnqueued: record.predictionEnqueued,
      consumedImpactKey: record.consumedImpactKey,
      sourceProvenanceFingerprint: record.binding.sourceProvenanceFingerprint,
      availableImpactKeys: Object.freeze([...record.availableImpactKeys].sort()),
    });
  }

  const client = Object.freeze({
    version: COMBAT_V91_ENTRY_VERSION,
    policy: COMBAT_V91_ENTRY_POLICY,
    getState() {
      return currentState;
    },
    scheduleAction({
      actionSequence,
      actorEntityId,
      targetEntityId,
      startTick,
      bindingVersion,
      sourceProvenanceFingerprint,
      action,
      dynamics,
    } = {}) {
      if (!currentState.authoritativeBase[actorEntityId]
        || !currentState.authoritativeBase[targetEntityId]) return result(false, 'unknown_entity');
      if (dynamicsBySequence.has(actionSequence)) return result(false, 'duplicate_action_schedule');
      if (activeScheduleForActor(actorEntityId)) return result(false, 'actor_action_in_progress');
      pruneTerminalDynamicsRecords();
      if (dynamicsBySequence.size >= CLIENT_ACTION_RECORD_LIMIT) {
        return result(false, 'action_schedule_capacity_reached');
      }
      const bound = createCombatActionDynamicsBinding({
        bindingVersion,
        sourceProvenanceFingerprint,
        action,
        dynamics,
      });
      if (!bound.ok) return bound;
      if (!liveResolutionSupported(bound)) {
        return result(false, 'action_dynamics_resolution_unsupported');
      }
      const scheduled = createCombatDynamicsSchedule({
        combatId,
        actionSequence,
        actorEntityId,
        targetEntityId,
        startTick,
        definition: bound.dynamics,
      });
      if (!scheduled.ok) return scheduled;
      const record = {
        binding: bound.binding,
        action: bound.action,
        dynamics: bound.dynamics,
        actorEntityId,
        targetEntityId,
        startTick,
        state: scheduled.state,
        predictionEnqueued: false,
        consumedImpactKey: null,
        intentId: null,
        confirmedEffectsReleased: false,
        impactEventByKey: new Map(),
        availableImpactKeys: new Set(),
      };
      dynamicsBySequence.set(actionSequence, record);
      return result(true, null, { dynamics: dynamicsView(record) });
    },
    advanceAction({ actionSequence, throughTick, transitionRequests = [] } = {}) {
      const record = dynamicsBySequence.get(actionSequence);
      if (!record) return result(false, 'unknown_action_schedule');
      const advanced = advanceCombatDynamicsSchedule({
        state: record.state,
        definition: record.dynamics,
        throughTick,
        transitionRequests,
      });
      if (!advanced.ok) return advanced;
      record.state = advanced.state;
      for (const event of advanced.events) {
        if (event.type === 'impact.requested'
          && event.payload.delivery === 'direct'
          && event.payload.hitOrdinal === 0) {
          record.availableImpactKeys.add(event.payload.idempotencyKey);
          record.impactEventByKey.set(event.payload.idempotencyKey, event);
        }
      }
      return result(true, null, {
        events: advanced.events,
        dynamics: dynamicsView(record),
      });
    },
    readActionDynamics(actionSequence) {
      const record = dynamicsBySequence.get(actionSequence);
      return record
        ? result(true, null, { dynamics: dynamicsView(record) })
        : result(false, 'unknown_action_schedule');
    },
    predict({
      intentId,
      actionSequence,
      actorEntityId,
      targetEntityId,
      action,
      actionStatProjection = null,
      dynamicsImpactKey = null,
      worldSnapshot,
    } = {}) {
      const attacker = currentState.authoritativeBase[actorEntityId];
      const target = currentState.authoritativeBase[targetEntityId];
      if (!attacker || !target) return result(false, 'unknown_entity');
      const dynamicsRecord = dynamicsBySequence.get(actionSequence);
      if (!dynamicsRecord) return result(false, 'action_schedule_required');
      if (dynamicsRecord.actorEntityId !== actorEntityId
        || dynamicsRecord.targetEntityId !== targetEntityId) {
        return result(false, 'action_dynamics_entity_binding_mismatch');
      }
      const canonicalAction = createCombatActionDefinition(action);
      if (!canonicalAction.ok
        || canonicalAction.action.fingerprint !== dynamicsRecord.binding.actionFingerprint) {
        return result(false, 'action_dynamics_binding_mismatch');
      }
      if (dynamicsRecord.predictionEnqueued) {
        return result(false, 'action_prediction_already_enqueued');
      }
      if (typeof dynamicsImpactKey !== 'string'
        || !dynamicsRecord.availableImpactKeys.has(dynamicsImpactKey)) {
        return result(false, 'action_impact_not_reached');
      }
      const resolved = resolveCombatV91Proposal({
        combatId,
        actionSequence,
        attacker,
        target,
        action,
        actionStatProjection,
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
      dynamicsRecord.availableImpactKeys.delete(dynamicsImpactKey);
      dynamicsRecord.predictionEnqueued = true;
      dynamicsRecord.consumedImpactKey = dynamicsImpactKey;
      dynamicsRecord.intentId = intentId;
      return result(true, resolved.reason, {
        proposal: resolved.proposal,
        envelope: envelope.envelope,
        dynamicsClaim: Object.freeze({
          authority: 'client_prediction_only',
          combatId,
          actionSequence,
          actorEntityId,
          targetEntityId,
          actionDynamicsBindingFingerprint: dynamicsRecord.binding.fingerprint,
          sourceProvenanceFingerprint: dynamicsRecord.binding.sourceProvenanceFingerprint,
          impactIdempotencyKey: dynamicsImpactKey,
          impactCombatTick: dynamicsRecord.impactEventByKey.get(dynamicsImpactKey).tick,
        }),
        state: currentState,
      });
    },
    reconcile(response) {
      const reconciled = reconcileCombatPrediction(currentState, response);
      if (!reconciled.ok) return reconciled;
      currentState = reconciled.state;
      const authoritativeResponse = reconciled.response;
      const dynamicsRecord = [...dynamicsBySequence.values()]
        .find(record => record.intentId === authoritativeResponse.intentId) ?? null;
      const confirmedDynamicsEffects = [];
      let dynamicsEffectsDisposition = 'not_applicable';
      if (dynamicsRecord && !dynamicsRecord.confirmedEffectsReleased
        && authoritativeResponse.committed === true
        && authoritativeResponse.authoritativeOutcome?.damage > 0) {
        const impact = dynamicsRecord.impactEventByKey.get(dynamicsRecord.consumedImpactKey);
        const effect = authoritativeResponse.executionReceipt
          ?.authoritativeDynamicsEffectReceipt ?? null;
        const bindingMatches = effect !== null
          && effect.actionDynamicsBindingFingerprint === dynamicsRecord.binding.fingerprint
          && effect.sourceProvenanceFingerprint
            === dynamicsRecord.binding.sourceProvenanceFingerprint
          && effect.combatId === combatId
          && effect.actionSequence === impact?.actionSequence
          && effect.actorEntityId === dynamicsRecord.actorEntityId
          && effect.targetEntityId === dynamicsRecord.targetEntityId
          && effect.actionId === dynamicsRecord.action.actionId
          && effect.hitOrdinal === impact?.payload.hitOrdinal
          && effect.impactCombatTick === impact?.tick;
        dynamicsEffectsDisposition = bindingMatches
          ? 'authoritative_effect_applied'
          : effect === null ? 'authoritative_effect_absent' : 'authoritative_effect_binding_mismatch';
        if (bindingMatches && effect.impulse) {
          confirmedDynamicsEffects.push(Object.freeze({
            type: 'world.impulse_commit_requested',
            authority: 'server_confirmed_world_commit_required',
            combatId,
            actionSequence: impact.actionSequence,
            actorEntityId: dynamicsRecord.actorEntityId,
            targetEntityId: dynamicsRecord.targetEntityId,
            authoritativeOutcomeFingerprint:
              authoritativeResponse.authoritativeOutcome.outcomeFingerprint,
            authoritativeEffectFingerprint: effect.fingerprint,
            impulse: effect.impulse,
          }));
        }
        if (bindingMatches && effect.hitstopPresentation) {
          confirmedDynamicsEffects.push(Object.freeze({
            type: 'presentation.hitstop_requested',
            authority: 'server_confirmed_presentation_only',
            combatId,
            actionSequence: impact.actionSequence,
            authoritativeOutcomeFingerprint:
              authoritativeResponse.authoritativeOutcome.outcomeFingerprint,
            authoritativeEffectFingerprint: effect.fingerprint,
            hitstop: effect.hitstopPresentation,
          }));
        }
        dynamicsRecord.confirmedEffectsReleased = true;
      }
      return result(true, reconciled.reason, {
        state: currentState,
        confirmedDynamicsEffects: Object.freeze(confirmedDynamicsEffects),
        dynamicsEffectsDisposition,
      });
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

export function createCombatV91Shell({ container, transport = null } = {}) {
  if (!container?.ownerDocument || typeof container.replaceChildren !== 'function') {
    return result(false, 'invalid_active_shell_container');
  }
  if (transport !== null
    && (typeof transport?.bindReconcile !== 'function'
      || typeof transport?.canAcceptIntent !== 'function'
      || typeof transport?.canEnqueue !== 'function'
      || typeof transport?.enqueue !== 'function'
      || typeof transport?.clearSession !== 'function')) {
    return result(false, 'invalid_combat_transport');
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
      transport?.clearSession('combat-session-replaced');
      activeClient = created.client;
      focusedEntityId = firstEntityId;
      return render();
    },
    predict(command = {}, { focusEntityId = command.targetEntityId } = {}) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      if (focusEntityId !== undefined
        && !activeClient.getState().authoritativeBase[focusEntityId]) return result(false, 'unknown_entity');
      if (transport) {
        const transportCapacity = transport.canAcceptIntent(command.intentId);
        if (!transportCapacity.ok) return transportCapacity;
      }
      const predicted = activeClient.predict(command);
      if (!predicted.ok) return predicted;
      const transportCapacity = transport?.canEnqueue(predicted.envelope) ?? result(true, 'transport_not_bound');
      if (!transportCapacity.ok) return transportCapacity;
      if (focusEntityId !== undefined) focusedEntityId = focusEntityId;
      const rendered = render();
      if (!rendered.ok) return rendered;
      const transportResult = transport?.enqueue(predicted.envelope) ?? null;
      return result(true, predicted.reason, {
        proposal: predicted.proposal,
        envelope: predicted.envelope,
        state: predicted.state,
        viewModel: rendered.viewModel,
        transport: transportResult,
      });
    },
    scheduleAction(command = {}) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      return activeClient.scheduleAction(command);
    },
    advanceAction(command = {}) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      return activeClient.advanceAction(command);
    },
    readActionDynamics(actionSequence) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      return activeClient.readActionDynamics(actionSequence);
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
        confirmedDynamicsEffects: reconciled.confirmedDynamicsEffects,
        dynamicsEffectsDisposition: reconciled.dynamicsEffectsDisposition,
      });
    },
    focus(entityId, options = {}) {
      if (!activeClient) return result(false, 'combat_session_inactive');
      if (!activeClient.getState().authoritativeBase[entityId]) return result(false, 'unknown_entity');
      focusedEntityId = entityId;
      return render(options);
    },
    closeSession() {
      transport?.clearSession('combat-session-closed');
      activeClient = null;
      focusedEntityId = null;
      container.replaceChildren();
      container.hidden = true;
      return result(true, null);
    },
  });

  if (transport) {
    const bound = transport.bindReconcile(response => shell.reconcile(response));
    if (!bound?.ok) return bound;
  }

  container.hidden = true;
  return result(true, null, { shell });
}
