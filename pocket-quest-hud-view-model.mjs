/**
 * Unified HUD Task 4 — Pocket Quest view model.
 *
 * Pure presenter + bounded store for the quest feature of the unified
 * MMORPG HUD contract. game-v800.js stays the source of truth for stage
 * progression; this module only normalizes that state into immutable,
 * revision-ordered snapshots the Dock can subscribe to without touching
 * game closures or legacy quest DOM.
 */

const QUEST_STEP_STATE = new Set(['done', 'current', 'todo', 'locked']);
const QUEST_STEP_LIMIT = 32;
const QUEST_TEXT_LIMIT = 160;

function clampQuestText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, QUEST_TEXT_LIMIT) : fallback;
}

function normalizeQuestStep(candidate, index) {
  const id = clampQuestText(candidate?.id);
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)) return null;
  const state = QUEST_STEP_STATE.has(candidate?.state) ? candidate.state : 'locked';
  return Object.freeze({
    id,
    label: clampQuestText(candidate?.label),
    state,
    progress: 0,
    goal: 0,
  });
}

export const POCKET_QUEST_HUB_GUIDANCE = Object.freeze({
  title: 'เริ่มการผจญภัย',
  summary: 'เดินไปที่ประตูวาปเพื่อเข้าสู่ Grass Meadow และเริ่มเควส',
  step: Object.freeze({ id: 'goto-grass-meadow', label: 'ไป Grass Meadow', state: 'current' }),
});

/**
 * Build the contract-shaped quest feature input from live Pocket state.
 * `tracker` is the stage-objectives tracker view model; it is ignored on
 * the hub/no-stage branch so Ranch never shows a stale stage tracker.
 */
export function buildPocketQuestHudFeature({ hasStage, tracker, summary } = {}) {
  if (!hasStage) {
    return {
      available: true,
      title: POCKET_QUEST_HUB_GUIDANCE.title,
      summary: POCKET_QUEST_HUB_GUIDANCE.summary,
      steps: [{ ...POCKET_QUEST_HUB_GUIDANCE.step }],
      status: '',
    };
  }
  const steps = Array.isArray(tracker?.steps) ? tracker.steps : [];
  return {
    available: true,
    title: clampQuestText(tracker?.title, 'เควส'),
    summary: clampQuestText(summary),
    steps: steps.slice(0, QUEST_STEP_LIMIT).map(step => ({
      id: step?.id,
      label: step?.label,
      state: step?.state,
    })),
    status: clampQuestText(tracker?.status),
  };
}

function unavailableQuestFeature() {
  return Object.freeze({
    available: false,
    title: '',
    summary: '',
    steps: Object.freeze([]),
    status: 'unavailable',
  });
}

function featureKey(feature) {
  return JSON.stringify([feature.available, feature.title, feature.summary, feature.status,
    feature.steps.map(step => [step.id, step.label, step.state])]);
}

function freezeQuestSnapshot(revision, feature) {
  const steps = [];
  for (const candidate of feature.steps || []) {
    const normalized = normalizeQuestStep(candidate, steps.length);
    if (normalized && !steps.some(step => step.id === normalized.id)) steps.push(normalized);
  }
  return Object.freeze({
    revision,
    available: feature.available === true,
    title: clampQuestText(feature.title),
    summary: clampQuestText(feature.summary),
    steps: Object.freeze(steps),
    status: clampQuestText(feature.status, feature.available === true ? '' : 'unavailable'),
  });
}

/**
 * Bounded quest store: monotonic revisions, dirty publish, subscriber
 * notification, and an explicit reset used when the player leaves the
 * Pocket world so the Dock never renders stale quest state.
 */
export function createPocketQuestHudStore() {
  let revision = 0;
  let current = freezeQuestSnapshot(revision, unavailableQuestFeature());
  let lastKey = featureKey(unavailableQuestFeature());
  const subscribers = new Set();

  function snapshot() {
    return current;
  }

  function notify() {
    for (const listener of [...subscribers]) {
      try { listener(current); } catch {}
    }
  }

  function publish(featureInput) {
    const feature = featureInput && typeof featureInput === 'object'
      ? featureInput
      : unavailableQuestFeature();
    const key = featureKey(feature);
    if (key === lastKey) return current;
    revision += 1;
    lastKey = key;
    current = freezeQuestSnapshot(revision, feature);
    notify();
    return current;
  }

  function reset() {
    return publish(unavailableQuestFeature());
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return null;
    subscribers.add(listener);
    try { listener(current); } catch {}
    return () => { subscribers.delete(listener); };
  }

  return Object.freeze({
    subscribe,
    snapshot,
    publish,
    reset,
    diagnostics: () => Object.freeze({
      revision,
      subscribers: subscribers.size,
      available: current.available,
    }),
  });
}
