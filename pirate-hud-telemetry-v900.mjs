import {
  HUD_LIMITS,
  normalizeUnifiedHudSnapshot,
  validateUnifiedHudSnapshot,
} from './unified-hud-contract-v900.mjs';

export const PIRATE_HUD_SNAPSHOT_MESSAGE = 'pocketmonster:pirate-hud-snapshot-v1';
export const PIRATE_HUD_INIT_MESSAGE = 'pocketmonster:pirate-hud-init-v1';
export const PIRATE_HUD_MAX_UPDATES_PER_SECOND = 10;
export const PIRATE_HUD_MAX_PAYLOAD_BYTES = 16_384;
const TELEMETRY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

const ACTION_SOURCES = Object.freeze([
  ['capture', '.tc-attack'],
  ['summon', '.tc-dash'],
  ['recall', '.tc-jump'],
  ['skill1', '.tc-skill1'],
  ['skill2', '.tc-skill2'],
  ['skill3', '.tc-skill3'],
  ['skill4', '.tc-ult'],
  ['block', '.tc-block'],
  ['weapon', '.tc-weapon'],
  ['potion1', '.tc-potion1'],
  ['potion2', '.tc-potion2'],
  ['zoomIn', '.tc-zoom-in'],
  ['zoomOut', '.tc-zoom-out'],
]);
const UTILITY_SOURCES = Object.freeze([
  ['stats', '.stats-open-button'],
  ['audio', '.audio-toggle'],
  ['graphics', '.graphics-setting'],
]);
const ACTION_SOURCE_IDS = Object.freeze(ACTION_SOURCES.map(([id]) => id));
const UTILITY_SOURCE_IDS = Object.freeze(UTILITY_SOURCES.map(([id]) => id));

function cleanText(value) {
  return typeof value === 'string' ? value.trim().slice(0, HUD_LIMITS.string) : '';
}

function visible(documentLike, node) {
  if (!node) return false;
  try {
    const style = documentLike.defaultView?.getComputedStyle?.(node);
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  } catch {
    return false;
  }
}

function readText(documentLike, selector) {
  const node = documentLike.querySelector(selector);
  return visible(documentLike, node) ? cleanText(node.textContent) : '';
}

function parseInteger(text) {
  const match = cleanText(text).match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function parseRange(text) {
  const values = cleanText(text).match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length < 2 || !values.slice(0, 2).every(Number.isFinite)) return null;
  const maximum = Math.max(0, values[1]);
  return { value: Math.min(maximum, Math.max(0, values[0])), maximum };
}

function nodeLabel(node) {
  try {
    return cleanText(node?.getAttribute?.('aria-label'))
      || cleanText(node?.getAttribute?.('title'))
      || cleanText(node?.textContent);
  } catch {
    return '';
  }
}

function hasClass(node, name) {
  try { return node?.classList?.contains?.(name) === true; } catch { return true; }
}

function readAction(documentLike, id, selector) {
  const node = documentLike.querySelector(selector);
  const isVisible = visible(documentLike, node);
  const cooling = hasClass(node, 'tc-cooling');
  const countNode = node?.querySelector?.('.tc-potion-count');
  const observedCount = parseInteger(countNode?.textContent);
  const countUnavailable = id.startsWith('potion') && observedCount === null;
  const unavailable = !isVisible || countUnavailable || node?.disabled === true
    || cooling || hasClass(node, 'tc-skill-locked') || hasClass(node, 'tc-potion-empty');
  return {
    id,
    visualKey: id,
    label: nodeLabel(node),
    enabled: !unavailable,
    pressed: hasClass(node, 'tc-on') || hasClass(node, 'tc-aiming') || hasClass(node, 'tc-armed'),
    cooldownRemaining: 0,
    cooldownTotal: 0,
    count: observedCount ?? 0,
    state: isVisible ? (cooling ? 'cooling' : (unavailable ? 'unavailable' : 'ready')) : 'unavailable',
    reason: !isVisible ? 'source-unavailable'
      : (countUnavailable ? 'count-unavailable'
        : (cooling ? 'cooldown-values-unavailable'
          : (unavailable ? 'disabled-by-child-hud' : 'cooldown-values-unavailable'))),
  };
}

function readUtility(documentLike, id, selector) {
  const node = documentLike.querySelector(selector);
  const isVisible = visible(documentLike, node);
  return {
    id,
    label: nodeLabel(node),
    visualKey: id,
    enabled: isVisible && node?.disabled !== true,
    badge: '',
    reason: isVisible ? '' : 'source-unavailable',
  };
}

export function readPirateHudDom(documentLike) {
  try {
    if (!documentLike?.querySelector) return null;
    const level = parseInteger(readText(documentLike, '.progression-hud-level')) ?? 0;
    const hp = parseRange(readText(documentLike, '.progression-hp-text'));
    const resource = parseRange(readText(documentLike, '.progression-mp-text'));
    const mode = parseRange(readText(documentLike, '.progression-energy-text'));
    const playerAvailable = visible(documentLike, documentLike.querySelector('.progression-hud')) && Boolean(hp);
    const questRoot = documentLike.querySelector('.quest-tracker');
    const questAvailable = visible(documentLike, questRoot);
    const status = documentLike.querySelector('[data-testid="server-status"]');
    const connected = visible(documentLike, status) && status?.dataset?.mode === 'presence-online';
    const onboardingActive = visible(documentLike, documentLike.querySelector('.onboarding-root'));
    return {
      context: {
        worldId: 'pirate-fruit', controlMode: 'pirate-fruit', onboardingActive,
        connected, loading: false, revision: 1,
      },
      player: {
        revision: 1, available: playerAvailable, portraitKey: '', displayName: '', level, title: '',
        hp: hp?.value ?? 0, hpMax: hp?.maximum ?? 0,
        resourceKind: resource ? 'MP' : '', resource: resource?.value ?? 0, resourceMax: resource?.maximum ?? 0,
        modeLabel: mode ? 'Energy' : '',
        modePercent: mode?.maximum ? mode.value / mode.maximum * 100 : 0,
        buffs: [],
      },
      chat: { revision: 1, channel: 'WORLD', channels: ['WORLD', 'ZONE'], rows: [], unread: 0, status: 'unavailable', canSend: false },
      quest: {
        revision: 1, available: questAvailable,
        title: questAvailable ? readText(documentLike, '.quest-tracker-title') : '',
        summary: questAvailable ? readText(documentLike, '.quest-tracker-objective') : '',
        steps: [], status: questAvailable ? 'active' : 'unavailable',
      },
      party: {
        revision: 1, available: false, selectedSlot: null, activeInstanceId: '', canSwitch: false, slots: [],
      },
      target: { revision: 1, available: false, id: '', portraitKey: '', name: '', level: 0, hp: 0, hpMax: 0, states: [] },
      map: { revision: 1, available: false, bounds: {}, local: {}, markers: [], zoneLabel: '' },
      actions: { revision: 1, items: ACTION_SOURCES.map(([id, selector]) => readAction(documentLike, id, selector)) },
      utilities: { revision: 1, items: UTILITY_SOURCES.map(([id, selector]) => readUtility(documentLike, id, selector)) },
      banner: { revision: 1, kind: '', text: '', expiresAt: 0 },
    };
  } catch {
    return null;
  }
}

function safePayloadSize(value) {
  try { return new TextEncoder().encode(JSON.stringify(value)).byteLength; } catch { return Infinity; }
}

function strictlySafeTree(value, depth = 0, budget = { nodes: 0 }) {
  try {
    budget.nodes += 1;
    if (budget.nodes > 512 || depth > 10) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= HUD_LIMITS.timestampMax;
    if (typeof value === 'string') return value.length <= HUD_LIMITS.string;
    if (typeof value !== 'object') return false;
    if (Array.isArray(value)) {
      if (value.length > HUD_LIMITS.chatRows) return false;
      return value.every(item => strictlySafeTree(item, depth + 1, budget));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const keys = Object.keys(value);
    if (keys.length > 40) return false;
    return keys.every(key => key.length <= HUD_LIMITS.string
      && strictlySafeTree(value[key], depth + 1, budget));
  } catch {
    return false;
  }
}

function validRevision(feature) {
  return feature && typeof feature === 'object'
    && Number.isSafeInteger(feature.revision) && feature.revision >= 0;
}

function validArray(value, limit) {
  return Array.isArray(value) && value.length <= limit;
}

function fieldsHaveType(record, fields, type) {
  return fields.every(field => typeof record?.[field] === type);
}

function hasExactKeys(record, fields) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const actual = Object.keys(record).sort();
  const expected = [...fields].sort();
  return actual.length === expected.length && actual.every((field, index) => field === expected[index]);
}

function finiteBetween(value, minimum, maximum) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function safeRevision(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function stableTelemetryId(value, allowEmpty = false) {
  return (allowEmpty && value === '') || (typeof value === 'string' && TELEMETRY_ID_PATTERN.test(value));
}

function uniqueStableIds(items) {
  const ids = items.map(item => item?.id);
  return ids.every(id => stableTelemetryId(id)) && new Set(ids).size === ids.length;
}

function hasExactOrderedIds(items, expectedIds) {
  return items.length === expectedIds.length && items.every((item, index) => item?.id === expectedIds[index]);
}

function emptyOrFieldsHaveType(record, fields, type) {
  return record && typeof record === 'object'
    && (Object.keys(record).length === 0 || (hasExactKeys(record, fields) && fieldsHaveType(record, fields, type)));
}

function validTelemetryShape(snapshot) {
  try {
    const featureNames = ['player', 'chat', 'quest', 'party', 'target', 'map', 'actions', 'utilities', 'banner'];
    const context = snapshot?.context;
    if (!hasExactKeys(snapshot, ['context', ...featureNames])
      || !hasExactKeys(context, ['worldId', 'controlMode', 'onboardingActive', 'connected', 'loading', 'revision'])
      || context.worldId !== 'pirate-fruit' || typeof context.controlMode !== 'string'
      || !safeRevision(context.revision)
      || !['onboardingActive', 'connected', 'loading'].every(field => typeof context[field] === 'boolean')
      || !featureNames.every(feature => validRevision(snapshot[feature]))) return false;
    if (!hasExactKeys(snapshot.player, ['revision', 'available', 'portraitKey', 'displayName', 'level', 'title', 'hp', 'hpMax', 'resourceKind', 'resource', 'resourceMax', 'modeLabel', 'modePercent', 'buffs'])
      || typeof snapshot.player.available !== 'boolean'
      || !fieldsHaveType(snapshot.player, ['portraitKey', 'displayName', 'title', 'resourceKind', 'modeLabel'], 'string')
      || !fieldsHaveType(snapshot.player, ['level', 'hp', 'hpMax', 'resource', 'resourceMax', 'modePercent'], 'number')
      || !Number.isInteger(snapshot.player.level) || !finiteBetween(snapshot.player.level, 0, HUD_LIMITS.levelMax)
      || !finiteBetween(snapshot.player.hpMax, 0, HUD_LIMITS.numericMax)
      || !finiteBetween(snapshot.player.hp, 0, snapshot.player.hpMax)
      || !finiteBetween(snapshot.player.resourceMax, 0, HUD_LIMITS.numericMax)
      || !finiteBetween(snapshot.player.resource, 0, snapshot.player.resourceMax)
      || !finiteBetween(snapshot.player.modePercent, 0, 100)
      || !validArray(snapshot.player.buffs, HUD_LIMITS.buffs)
      || snapshot.player.buffs.length !== 0
      || !uniqueStableIds(snapshot.player.buffs)
      || !snapshot.player.buffs.every(buff => hasExactKeys(buff, ['id', 'label', 'visualKey', 'description', 'expiresAt'])
        && fieldsHaveType(buff, ['id', 'label', 'visualKey', 'description'], 'string')
        && finiteBetween(buff.expiresAt, 0, HUD_LIMITS.timestampMax))) return false;
    if (!hasExactKeys(snapshot.chat, ['revision', 'channel', 'channels', 'rows', 'unread', 'status', 'canSend'])
      || !validArray(snapshot.chat.channels, 2) || !validArray(snapshot.chat.rows, HUD_LIMITS.chatRows)
      || snapshot.chat.rows.length !== 0 || snapshot.chat.canSend !== false
      || !uniqueStableIds(snapshot.chat.rows)
      || !snapshot.chat.channels.every(value => value === 'WORLD' || value === 'ZONE')
      || new Set(snapshot.chat.channels).size !== snapshot.chat.channels.length
      || !snapshot.chat.channels.includes(snapshot.chat.channel)
      || !snapshot.chat.rows.every(row => hasExactKeys(row, ['id', 'channel', 'author', 'text', 'timestamp', 'kind'])
        && fieldsHaveType(row, ['id', 'channel', 'author', 'text', 'kind'], 'string')
        && finiteBetween(row.timestamp, 0, HUD_LIMITS.timestampMax))
      || !fieldsHaveType(snapshot.chat, ['channel', 'status'], 'string')
      || !Number.isInteger(snapshot.chat.unread) || !finiteBetween(snapshot.chat.unread, 0, HUD_LIMITS.numericMax)
      || typeof snapshot.chat.canSend !== 'boolean') return false;
    if (!hasExactKeys(snapshot.quest, ['revision', 'available', 'title', 'summary', 'steps', 'status'])
      || typeof snapshot.quest.available !== 'boolean'
      || !fieldsHaveType(snapshot.quest, ['title', 'summary', 'status'], 'string')
      || !validArray(snapshot.quest.steps, HUD_LIMITS.questSteps)
      || !uniqueStableIds(snapshot.quest.steps)
      || !snapshot.quest.steps.every(step => hasExactKeys(step, ['id', 'label', 'state', 'progress', 'goal'])
        && fieldsHaveType(step, ['id', 'label', 'state'], 'string')
        && finiteBetween(step.goal, 0, HUD_LIMITS.numericMax)
        && finiteBetween(step.progress, 0, step.goal))) return false;
    if (!hasExactKeys(snapshot.party, ['revision', 'available', 'selectedSlot', 'activeInstanceId', 'canSwitch', 'slots'])
      || typeof snapshot.party.available !== 'boolean' || !validArray(snapshot.party.slots, HUD_LIMITS.partySlots)
      || snapshot.party.available !== false || snapshot.party.slots.length !== 0
      || snapshot.party.selectedSlot !== null || snapshot.party.activeInstanceId !== '' || snapshot.party.canSwitch !== false
      || !uniqueStableIds(snapshot.party.slots)
      || new Set(snapshot.party.slots.map(slot => slot?.slot)).size !== snapshot.party.slots.length
      || !(snapshot.party.selectedSlot === null || (Number.isInteger(snapshot.party.selectedSlot)
        && snapshot.party.selectedSlot >= 0 && snapshot.party.selectedSlot < HUD_LIMITS.partySlots))
      || !stableTelemetryId(snapshot.party.activeInstanceId, true) || typeof snapshot.party.canSwitch !== 'boolean'
      || !snapshot.party.slots.every(slot => hasExactKeys(slot, ['id', 'slot', 'available', 'instanceId', 'portraitKey', 'name', 'level', 'hp', 'hpMax', 'condition', 'fainted', 'selected', 'active'])
        && stableTelemetryId(slot.id) && stableTelemetryId(slot.instanceId, true)
        && Number.isInteger(slot.slot) && slot.slot >= 0 && slot.slot < HUD_LIMITS.partySlots
        && slot.id === `slot-${slot.slot + 1}`
        && fieldsHaveType(slot, ['instanceId', 'portraitKey', 'name', 'condition'], 'string')
        && Number.isInteger(slot.level) && finiteBetween(slot.level, 0, HUD_LIMITS.levelMax)
        && finiteBetween(slot.hpMax, 0, HUD_LIMITS.numericMax) && finiteBetween(slot.hp, 0, slot.hpMax)
        && fieldsHaveType(slot, ['available', 'fainted', 'selected', 'active'], 'boolean'))) return false;
    if (!hasExactKeys(snapshot.target, ['revision', 'available', 'id', 'portraitKey', 'name', 'level', 'hp', 'hpMax', 'states'])
      || typeof snapshot.target.available !== 'boolean' || !validArray(snapshot.target.states, HUD_LIMITS.targetStates)
      || snapshot.target.available !== false || snapshot.target.id !== '' || snapshot.target.states.length !== 0
      || snapshot.target.portraitKey !== '' || snapshot.target.name !== '' || snapshot.target.level !== 0
      || snapshot.target.hp !== 0 || snapshot.target.hpMax !== 0
      || !fieldsHaveType(snapshot.target, ['id', 'portraitKey', 'name'], 'string')
      || !stableTelemetryId(snapshot.target.id, true)
      || !Number.isInteger(snapshot.target.level) || !finiteBetween(snapshot.target.level, 0, HUD_LIMITS.levelMax)
      || !finiteBetween(snapshot.target.hpMax, 0, HUD_LIMITS.numericMax)
      || !finiteBetween(snapshot.target.hp, 0, snapshot.target.hpMax)
      || !snapshot.target.states.every(value => typeof value === 'string')) return false;
    if (!hasExactKeys(snapshot.map, ['revision', 'available', 'bounds', 'local', 'markers', 'zoneLabel'])
      || typeof snapshot.map.available !== 'boolean' || typeof snapshot.map.zoneLabel !== 'string'
      || !validArray(snapshot.map.markers, HUD_LIMITS.mapMarkers)
      || snapshot.map.available !== false || Object.keys(snapshot.map.bounds).length !== 0
      || Object.keys(snapshot.map.local).length !== 0 || snapshot.map.markers.length !== 0 || snapshot.map.zoneLabel !== ''
      || !uniqueStableIds(snapshot.map.markers)
      || !emptyOrFieldsHaveType(snapshot.map.bounds, ['minX', 'maxX', 'minZ', 'maxZ'], 'number')
      || !emptyOrFieldsHaveType(snapshot.map.local, ['x', 'z', 'heading'], 'number')
      || !Object.values(snapshot.map.bounds).every(value => finiteBetween(value, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax))
      || !Object.values(snapshot.map.local).every(value => finiteBetween(value, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax))
      || !snapshot.map.markers.every(marker => hasExactKeys(marker, ['id', 'kind', 'label', 'x', 'z'])
        && fieldsHaveType(marker, ['id', 'kind', 'label'], 'string')
        && finiteBetween(marker.x, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax)
        && finiteBetween(marker.z, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax))) return false;
    if (!hasExactKeys(snapshot.actions, ['revision', 'items']) || !validArray(snapshot.actions.items, HUD_LIMITS.actions)
      || !hasExactOrderedIds(snapshot.actions.items, ACTION_SOURCE_IDS)
      || !uniqueStableIds(snapshot.actions.items)
      || !snapshot.actions.items.every(item => hasExactKeys(item, ['id', 'visualKey', 'label', 'enabled', 'pressed', 'cooldownRemaining', 'cooldownTotal', 'count', 'state', 'reason'])
        && typeof item.id === 'string'
        && fieldsHaveType(item, ['visualKey', 'label', 'state', 'reason'], 'string')
        && finiteBetween(item.cooldownTotal, 0, HUD_LIMITS.numericMax)
        && finiteBetween(item.cooldownRemaining, 0, item.cooldownTotal)
        && Number.isInteger(item.count) && finiteBetween(item.count, 0, HUD_LIMITS.numericMax)
        && typeof item.enabled === 'boolean' && typeof item.pressed === 'boolean')) return false;
    if (!hasExactKeys(snapshot.utilities, ['revision', 'items']) || !validArray(snapshot.utilities.items, HUD_LIMITS.utilities)
      || !hasExactOrderedIds(snapshot.utilities.items, UTILITY_SOURCE_IDS)
      || !uniqueStableIds(snapshot.utilities.items)
      || !snapshot.utilities.items.every(item => hasExactKeys(item, ['id', 'label', 'visualKey', 'enabled', 'badge', 'reason'])
        && typeof item.id === 'string'
        && fieldsHaveType(item, ['label', 'visualKey', 'badge', 'reason'], 'string')
        && typeof item.enabled === 'boolean')) return false;
    if (!hasExactKeys(snapshot.banner, ['revision', 'kind', 'text', 'expiresAt'])
      || !fieldsHaveType(snapshot.banner, ['kind', 'text'], 'string')
      || snapshot.banner.kind !== '' || snapshot.banner.text !== '' || snapshot.banner.expiresAt !== 0
      || !finiteBetween(snapshot.banner.expiresAt, 0, HUD_LIMITS.timestampMax)) return false;
    return true;
  } catch {
    return false;
  }
}

export function sanitizePirateHudMessage(message) {
  try {
    const candidate = globalThis.structuredClone(message);
    if (!candidate || typeof candidate !== 'object'
      || !hasExactKeys(candidate, ['type', 'schemaVersion', 'frameGeneration', 'revision', 'snapshot'])
      || candidate.type !== PIRATE_HUD_SNAPSHOT_MESSAGE
      || candidate.schemaVersion !== 1
      || !Number.isSafeInteger(candidate.frameGeneration) || candidate.frameGeneration < 0
      || !Number.isSafeInteger(candidate.revision) || candidate.revision < 1
      || !strictlySafeTree(candidate)
      || safePayloadSize(candidate) > PIRATE_HUD_MAX_PAYLOAD_BYTES
      || !validTelemetryShape(candidate.snapshot)
      || !['context', 'player', 'chat', 'quest', 'party', 'target', 'map', 'actions', 'utilities', 'banner']
        .every(feature => candidate.snapshot[feature].revision === candidate.revision)) return null;
    const snapshot = normalizeUnifiedHudSnapshot(candidate.snapshot);
    if (!validateUnifiedHudSnapshot(snapshot).ok) return null;
    return Object.freeze({
      frameGeneration: candidate.frameGeneration,
      revision: candidate.revision,
      snapshot,
    });
  } catch {
    return null;
  }
}

export function createPirateHudTelemetryCollector({
  frameWindow,
  frameGeneration = 0,
  onSnapshot = () => {},
  now = () => Date.now(),
} = {}) {
  let currentFrameWindow = frameWindow;
  let generation = frameGeneration;
  let latestRevision = 0;
  let latestFeatureRevisions = null;
  let lastAcceptedAt = -Infinity;
  let snapshot = null;
  let active = true;
  const featureNames = Object.freeze([
    'context', 'player', 'chat', 'quest', 'party', 'target', 'map', 'actions', 'utilities', 'banner',
  ]);
  const minimumInterval = 1000 / PIRATE_HUD_MAX_UPDATES_PER_SECOND;
  const publish = (value, reason) => {
    snapshot = value;
    try { onSnapshot(value, Object.freeze({ frameGeneration: generation, reason })); } catch {}
  };
  return Object.freeze({
    accept(event) {
      if (!active || event?.source !== currentFrameWindow || event?.origin !== 'null') return null;
      const message = sanitizePirateHudMessage(event.data);
      if (!message || message.frameGeneration !== generation || message.revision <= latestRevision) return null;
      const nextFeatureRevisions = Object.fromEntries(featureNames.map(feature => [
        feature,
        message.snapshot[feature].revision,
      ]));
      if (latestFeatureRevisions && featureNames.some(
        feature => nextFeatureRevisions[feature] < latestFeatureRevisions[feature],
      )) return null;
      const acceptedAt = now();
      if (!Number.isFinite(acceptedAt) || acceptedAt - lastAcceptedAt < minimumInterval) return null;
      latestRevision = message.revision;
      latestFeatureRevisions = nextFeatureRevisions;
      lastAcceptedAt = acceptedAt;
      publish(message.snapshot, 'snapshot');
      return message.snapshot;
    },
    current: () => snapshot,
    reset(next = {}) {
      currentFrameWindow = next.frameWindow ?? currentFrameWindow;
      generation = Number.isSafeInteger(next.frameGeneration) && next.frameGeneration >= 0
        ? next.frameGeneration : generation + 1;
      latestRevision = 0;
      latestFeatureRevisions = null;
      lastAcceptedAt = -Infinity;
      active = true;
      publish(null, cleanText(next.reason) || 'reset');
    },
    invalidate(reason = 'invalidated') {
      if (!active && snapshot === null) return;
      active = false;
      latestRevision = 0;
      latestFeatureRevisions = null;
      lastAcceptedAt = -Infinity;
      publish(null, cleanText(reason) || 'invalidated');
    },
  });
}

export function startPirateHudTelemetryPublisher({
  document: documentLike = globalThis.document,
  frameGeneration,
  parentOrigin,
  postMessage = (message, origin) => globalThis.parent?.postMessage?.(message, origin),
  MutationObserver: MutationObserverLike = globalThis.MutationObserver,
  setTimeout: setTimeoutLike = globalThis.setTimeout,
  clearTimeout: clearTimeoutLike = globalThis.clearTimeout,
} = {}) {
  if (!Number.isSafeInteger(frameGeneration) || frameGeneration < 0 || !parentOrigin || !documentLike) return null;
  let revision = 0;
  let lastSignature = '';
  let lastSentAt = -Infinity;
  let timer = null;
  let stopped = false;
  const minimumInterval = 1000 / PIRATE_HUD_MAX_UPDATES_PER_SECOND;
  const emit = () => {
    timer = null;
    if (stopped) return;
    const sourceSnapshot = readPirateHudDom(documentLike);
    if (!sourceSnapshot) return;
    const signature = JSON.stringify(sourceSnapshot);
    if (signature === lastSignature) return;
    const now = Date.now();
    const wait = minimumInterval - (now - lastSentAt);
    if (wait > 0) {
      timer = setTimeoutLike(emit, wait);
      return;
    }
    const nextRevision = revision + 1;
    const snapshot = {
      ...sourceSnapshot,
      context: { ...sourceSnapshot.context, revision: nextRevision },
    };
    for (const feature of ['player', 'chat', 'quest', 'party', 'target', 'map', 'actions', 'utilities', 'banner']) {
      snapshot[feature] = { ...sourceSnapshot[feature], revision: nextRevision };
    }
    lastSignature = signature;
    lastSentAt = now;
    postMessage({
      type: PIRATE_HUD_SNAPSHOT_MESSAGE,
      schemaVersion: 1,
      frameGeneration,
      revision: ++revision,
      snapshot,
    }, parentOrigin);
  };
  const schedule = () => {
    if (stopped || timer !== null) return;
    timer = setTimeoutLike(emit, Math.max(0, minimumInterval - (Date.now() - lastSentAt)));
  };
  const observer = typeof MutationObserverLike === 'function'
    ? new MutationObserverLike(schedule)
    : null;
  observer?.observe?.(documentLike.documentElement, {
    attributes: true, childList: true, characterData: true, subtree: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'aria-pressed'],
  });
  emit();
  return Object.freeze({
    flush: emit,
    stop() {
      stopped = true;
      observer?.disconnect?.();
      if (timer !== null) clearTimeoutLike(timer);
      timer = null;
    },
  });
}
