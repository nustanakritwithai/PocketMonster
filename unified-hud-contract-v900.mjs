export const HUD_CONTRACT_VERSION = 'pocketmonster:unified-hud-snapshot-v1';

export const HUD_COMMANDS = Object.freeze([
  'setTab', 'setExpanded', 'setChatChannel', 'sendChat', 'selectPartySlot', 'switchPartySlot',
  'openCharacter', 'invokeAction', 'invokeUtility', 'toggleQuest', 'toggleParty', 'toggleMap',
]);

export const HUD_LIMITS = Object.freeze({
  string: 160,
  chatRows: 100,
  questSteps: 32,
  partySlots: 3,
  buffs: 16,
  targetStates: 16,
  mapMarkers: 100,
  actions: 16,
  utilities: 16,
  levelMax: 999,
  numericMax: 1_000_000_000,
  timestampMax: 8_640_000_000_000_000,
});

const WORLD_IDS = new Set(['pocket-monster', 'pirate-fruit', 'living-world']);
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const trustedSnapshots = new WeakSet();

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, HUD_LIMITS.string) : fallback;
}

function stableId(value) {
  const clean = text(value);
  return ID_PATTERN.test(clean) ? clean : null;
}

function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  return Math.min(maximum, Math.max(minimum, finite(value, fallback)));
}

function bounded(value, fallback = 0) {
  return clamp(value, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax, fallback);
}

function integer(value, minimum = 0, maximum = HUD_LIMITS.numericMax, fallback = minimum) {
  return Math.trunc(clamp(value, minimum, maximum, fallback));
}

function revision(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function immutableArray(items) {
  return Object.freeze(items);
}

function isTrustedPrevious(value) {
  return Boolean(value) && typeof value === 'object' && trustedSnapshots.has(value);
}

function trustSnapshot(snapshot) {
  trustedSnapshots.add(snapshot);
  return snapshot;
}

function featureRevision(source) {
  return revision(isRecord(source) ? source.revision : 0);
}

function keepPrevious(next, previous) {
  return previous && next.revision <= previous.revision ? previous : next;
}

function uniqueRecords(candidates, limit, normalize) {
  if (!Array.isArray(candidates)) return immutableArray([]);
  const output = [];
  const seen = new Set();
  for (const candidate of candidates.slice(0, limit)) {
    const normalized = normalize(candidate, output.length);
    if (!normalized?.id || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    output.push(normalized);
  }
  return immutableArray(output);
}

function normalizeContext(source) {
  const input = isRecord(source) ? source : {};
  const worldId = WORLD_IDS.has(input.worldId) ? input.worldId : 'unknown';
  return Object.freeze({
    worldId,
    controlMode: worldId === 'unknown' ? 'unavailable' : text(input.controlMode, 'unavailable'),
    onboardingActive: input.onboardingActive === true,
    connected: input.connected === true,
    loading: input.loading === true,
    revision: revision(input.revision),
  });
}

function normalizeBuff(candidate) {
  if (!isRecord(candidate)) return null;
  const id = stableId(candidate.id);
  if (!id) return null;
  return Object.freeze({
    id,
    label: text(candidate.label),
    visualKey: text(candidate.visualKey),
    description: text(candidate.description),
    expiresAt: clamp(candidate.expiresAt, 0, HUD_LIMITS.timestampMax, 0),
  });
}

function normalizePlayer(source) {
  const input = isRecord(source) ? source : {};
  const hpMax = clamp(input.hpMax, 0, HUD_LIMITS.numericMax, 0);
  const resourceMax = clamp(input.resourceMax, 0, HUD_LIMITS.numericMax, 0);
  const expMax = clamp(input.expMax, 0, HUD_LIMITS.numericMax, 0);
  return Object.freeze({
    revision: featureRevision(input),
    available: input.available === true,
    portraitKey: text(input.portraitKey),
    displayName: text(input.displayName),
    level: integer(input.level, 0, HUD_LIMITS.levelMax, 0),
    title: text(input.title),
    hp: clamp(input.hp, 0, hpMax, 0),
    hpMax,
    resourceKind: text(input.resourceKind),
    resource: clamp(input.resource, 0, resourceMax, 0),
    resourceMax,
    modeLabel: text(input.modeLabel),
    modePercent: clamp(input.modePercent, 0, 100, 0),
    exp: clamp(input.exp, 0, expMax, 0),
    expMax,
    buffs: immutableArray((Array.isArray(input.buffs) ? input.buffs : [])
      .slice(0, HUD_LIMITS.buffs).map(normalizeBuff).filter(Boolean)),
  });
}

function normalizeChatRow(candidate, index) {
  if (!isRecord(candidate)) return null;
  const id = stableId(candidate.id) || `row-${index}`;
  return Object.freeze({
    id,
    channel: text(candidate.channel, 'WORLD').toUpperCase(),
    author: text(candidate.author),
    text: text(candidate.text),
    timestamp: clamp(candidate.timestamp, 0, HUD_LIMITS.timestampMax, 0),
    kind: text(candidate.kind, 'message'),
  });
}

function normalizeChat(source) {
  const input = isRecord(source) ? source : {};
  const channels = immutableArray([...new Set((Array.isArray(input.channels) ? input.channels : [])
    .map(value => text(value).toUpperCase()).filter(value => value === 'WORLD' || value === 'ZONE'))]);
  const availableChannels = channels.length ? channels : immutableArray(['WORLD', 'ZONE']);
  const requestedChannel = text(input.channel, 'WORLD').toUpperCase();
  return Object.freeze({
    revision: featureRevision(input),
    channel: availableChannels.includes(requestedChannel) ? requestedChannel : availableChannels[0],
    channels: availableChannels,
    rows: uniqueRecords(input.rows, HUD_LIMITS.chatRows, normalizeChatRow),
    unread: integer(input.unread, 0),
    status: text(input.status, 'unavailable'),
    canSend: input.canSend === true,
  });
}

function normalizeQuestStep(candidate) {
  if (!isRecord(candidate)) return null;
  const id = stableId(candidate.id);
  if (!id) return null;
  const goal = clamp(candidate.goal, 0, HUD_LIMITS.numericMax, 0);
  return Object.freeze({
    id,
    label: text(candidate.label),
    state: text(candidate.state, 'locked'),
    progress: clamp(candidate.progress, 0, goal || HUD_LIMITS.numericMax, 0),
    goal,
  });
}

function normalizeQuest(source) {
  const input = isRecord(source) ? source : {};
  return Object.freeze({
    revision: featureRevision(input),
    available: input.available === true,
    title: text(input.title),
    summary: text(input.summary),
    steps: uniqueRecords(input.steps, HUD_LIMITS.questSteps, normalizeQuestStep),
    status: text(input.status, 'unavailable'),
  });
}

function emptyPartySlot(slot) {
  return Object.freeze({
    id: `slot-${slot + 1}`, slot, available: false, instanceId: '', portraitKey: '', name: '',
    level: 0, hp: 0, hpMax: 0, condition: '', fainted: false, selected: false, active: false,
  });
}

function normalizePartySlot(candidate, slot) {
  if (!isRecord(candidate)) return emptyPartySlot(slot);
  const hpMax = clamp(candidate.hpMax, 0, HUD_LIMITS.numericMax, 0);
  return Object.freeze({
    id: `slot-${slot + 1}`,
    slot,
    available: candidate.available !== false,
    instanceId: stableId(candidate.instanceId) || '',
    portraitKey: text(candidate.portraitKey),
    name: text(candidate.name),
    level: integer(candidate.level, 0, HUD_LIMITS.levelMax, 0),
    hp: clamp(candidate.hp, 0, hpMax, 0),
    hpMax,
    condition: text(candidate.condition),
    fainted: candidate.fainted === true,
    selected: candidate.selected === true,
    active: candidate.active === true,
  });
}

function normalizeParty(source) {
  const input = isRecord(source) ? source : {};
  const candidates = Array.isArray(input.slots) ? input.slots : [];
  const bySlot = new Map();
  for (const candidate of candidates.slice(0, HUD_LIMITS.partySlots)) {
    const slot = integer(candidate?.slot, 0, HUD_LIMITS.partySlots - 1, bySlot.size);
    if (!bySlot.has(slot)) bySlot.set(slot, candidate);
  }
  const slots = immutableArray(Array.from(
    { length: HUD_LIMITS.partySlots },
    (_, slot) => normalizePartySlot(bySlot.get(slot), slot),
  ));
  const selectedSlot = Number.isInteger(input.selectedSlot)
    && input.selectedSlot >= 0 && input.selectedSlot < HUD_LIMITS.partySlots ? input.selectedSlot : null;
  return Object.freeze({
    revision: featureRevision(input),
    available: input.available === true,
    selectedSlot,
    activeInstanceId: stableId(input.activeInstanceId) || '',
    canSwitch: input.canSwitch === true,
    slots,
  });
}

function normalizeTarget(source) {
  const input = isRecord(source) ? source : {};
  const hpMax = clamp(input.hpMax, 0, HUD_LIMITS.numericMax, 0);
  return Object.freeze({
    revision: featureRevision(input),
    available: input.available === true,
    id: stableId(input.id) || '',
    portraitKey: text(input.portraitKey),
    name: text(input.name),
    level: integer(input.level, 0, HUD_LIMITS.levelMax, 0),
    hp: clamp(input.hp, 0, hpMax, 0),
    hpMax,
    states: immutableArray((Array.isArray(input.states) ? input.states : [])
      .slice(0, HUD_LIMITS.targetStates).map(value => text(value)).filter(Boolean)),
  });
}

function normalizeBounds(source) {
  const input = isRecord(source) ? source : {};
  return Object.freeze({
    minX: bounded(input.minX), maxX: bounded(input.maxX),
    minZ: bounded(input.minZ), maxZ: bounded(input.maxZ),
  });
}

function normalizeLocal(source) {
  const input = isRecord(source) ? source : {};
  return Object.freeze({ x: bounded(input.x), z: bounded(input.z), heading: bounded(input.heading) });
}

function normalizeMarker(candidate) {
  if (!isRecord(candidate)) return null;
  const id = stableId(candidate.id);
  if (!id) return null;
  return Object.freeze({
    id, kind: text(candidate.kind), label: text(candidate.label),
    x: bounded(candidate.x), z: bounded(candidate.z),
  });
}

function normalizeMap(source) {
  const input = isRecord(source) ? source : {};
  return Object.freeze({
    revision: featureRevision(input),
    available: input.available === true,
    bounds: normalizeBounds(input.bounds),
    local: normalizeLocal(input.local),
    markers: uniqueRecords(input.markers, HUD_LIMITS.mapMarkers, normalizeMarker),
    zoneLabel: text(input.zoneLabel),
  });
}

function normalizeAction(candidate) {
  if (!isRecord(candidate)) return null;
  const id = stableId(candidate.id);
  if (!id) return null;
  const cooldownTotal = clamp(candidate.cooldownTotal, 0, HUD_LIMITS.numericMax, 0);
  return Object.freeze({
    id,
    visualKey: text(candidate.visualKey),
    label: text(candidate.label),
    enabled: candidate.enabled === true,
    pressed: candidate.pressed === true,
    cooldownRemaining: clamp(candidate.cooldownRemaining, 0, cooldownTotal, 0),
    cooldownTotal,
    count: integer(candidate.count, 0),
    state: text(candidate.state, 'unavailable'),
    reason: text(candidate.reason),
  });
}

function normalizeUtility(candidate) {
  if (!isRecord(candidate)) return null;
  const id = stableId(candidate.id);
  if (!id) return null;
  return Object.freeze({
    id,
    label: text(candidate.label),
    visualKey: text(candidate.visualKey),
    enabled: candidate.enabled === true,
    badge: text(candidate.badge),
    reason: text(candidate.reason),
  });
}

function normalizeCollection(source, limit, normalizer) {
  const input = isRecord(source) ? source : {};
  return Object.freeze({
    revision: featureRevision(input),
    items: uniqueRecords(input.items, limit, normalizer),
  });
}

function normalizeBanner(source) {
  const input = isRecord(source) ? source : {};
  return Object.freeze({
    revision: featureRevision(input),
    kind: text(input.kind),
    text: text(input.text),
    expiresAt: clamp(input.expiresAt, 0, HUD_LIMITS.timestampMax, 0),
  });
}

function unavailableSnapshot(context) {
  return trustSnapshot(Object.freeze({
    schemaVersion: HUD_CONTRACT_VERSION,
    context,
    player: normalizePlayer({ revision: 0 }),
    chat: normalizeChat({ revision: 0, channels: [] }),
    quest: normalizeQuest({ revision: 0 }),
    party: normalizeParty({ revision: 0 }),
    target: normalizeTarget({ revision: 0 }),
    map: normalizeMap({ revision: 0 }),
    actions: normalizeCollection({ revision: 0 }, HUD_LIMITS.actions, normalizeAction),
    utilities: normalizeCollection({ revision: 0 }, HUD_LIMITS.utilities, normalizeUtility),
    banner: normalizeBanner({ revision: 0 }),
  }));
}

export function normalizeUnifiedHudSnapshot(source, previous = null) {
  const input = isRecord(source) ? source : {};
  const context = normalizeContext(input.context);
  const previousIsTrusted = isTrustedPrevious(previous);
  if (previousIsTrusted) {
    if (context.revision < previous.context.revision) return previous;
    if (context.revision === previous.context.revision && context.worldId !== previous.context.worldId) return previous;
  }
  if (context.worldId === 'unknown') return unavailableSnapshot(context);
  const prior = previousIsTrusted && previous.context.worldId === context.worldId
    ? previous
    : null;
  const nextContext = prior && context.revision === prior.context.revision ? prior.context : context;
  const player = keepPrevious(normalizePlayer(input.player), prior?.player);
  const chat = keepPrevious(normalizeChat(input.chat), prior?.chat);
  const quest = keepPrevious(normalizeQuest(input.quest), prior?.quest);
  const party = keepPrevious(normalizeParty(input.party), prior?.party);
  const target = keepPrevious(normalizeTarget(input.target), prior?.target);
  const map = keepPrevious(normalizeMap(input.map), prior?.map);
  const actions = keepPrevious(normalizeCollection(input.actions, HUD_LIMITS.actions, normalizeAction), prior?.actions);
  const utilities = keepPrevious(normalizeCollection(input.utilities, HUD_LIMITS.utilities, normalizeUtility), prior?.utilities);
  const banner = keepPrevious(normalizeBanner(input.banner), prior?.banner);
  return trustSnapshot(Object.freeze({
    schemaVersion: HUD_CONTRACT_VERSION,
    context: nextContext,
    player,
    chat,
    quest,
    party,
    target,
    map,
    actions,
    utilities,
    banner,
  }));
}

function issue(code, field) {
  return Object.freeze({ code, field });
}

function checkFrozen(value, path, issues) {
  try {
    if (!value || typeof value !== 'object' || !Object.isFrozen(value)) issues.push(issue('mutable_snapshot', path));
  } catch {
    issues.push(issue('mutable_snapshot', path));
  }
}

function checkString(record, field, path, issues) {
  if (typeof record?.[field] !== 'string') issues.push(issue('invalid_string', `${path}.${field}`));
  else if (record[field].length > HUD_LIMITS.string) issues.push(issue('string_limit_exceeded', `${path}.${field}`));
}

function checkBoolean(record, field, path, issues) {
  if (typeof record?.[field] !== 'boolean') issues.push(issue('invalid_boolean', `${path}.${field}`));
}

function checkNumber(record, field, path, issues, minimum = 0, maximum = HUD_LIMITS.numericMax, code = 'invalid_number') {
  const value = record?.[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    issues.push(issue(code, `${path}.${field}`));
  }
}

function checkRevision(record, path, issues) {
  if (!Number.isSafeInteger(record?.revision) || record.revision < 0) issues.push(issue('invalid_feature_revision', `${path}.revision`));
}

function checkCollection(items, limit, path, issues) {
  if (!Array.isArray(items)) {
    issues.push(issue('invalid_collection', path));
    return [];
  }
  checkFrozen(items, path, issues);
  if (items.length > limit) issues.push(issue('collection_limit_exceeded', path));
  return items.slice(0, limit);
}

function checkId(record, path, issues) {
  checkFrozen(record, path, issues);
  if (!stableId(record?.id)) issues.push(issue('invalid_item_id', `${path}.id`));
}

function validateUnifiedHudSnapshotUnsafe(snapshot) {
  const issues = [];
  checkFrozen(snapshot, 'root', issues);
  if (!isRecord(snapshot)) issues.push(issue('invalid_snapshot', 'root'));
  if (snapshot?.schemaVersion !== HUD_CONTRACT_VERSION) issues.push(issue('invalid_schema_version', 'schemaVersion'));
  if (!isRecord(snapshot?.context) || !(WORLD_IDS.has(snapshot?.context?.worldId) || snapshot?.context?.worldId === 'unknown')) {
    issues.push(issue('invalid_context', 'context'));
  } else {
    checkFrozen(snapshot.context, 'context', issues);
    checkString(snapshot.context, 'controlMode', 'context', issues);
    for (const field of ['onboardingActive', 'connected', 'loading']) checkBoolean(snapshot.context, field, 'context', issues);
    if (!Number.isSafeInteger(snapshot.context.revision) || snapshot.context.revision < 0) issues.push(issue('invalid_context_revision', 'context.revision'));
  }
  for (const feature of ['player', 'chat', 'quest', 'party', 'target', 'map', 'actions', 'utilities', 'banner']) {
    if (!isRecord(snapshot?.[feature])) {
      issues.push(issue('invalid_feature', feature));
    } else {
      checkFrozen(snapshot[feature], feature, issues);
      checkRevision(snapshot[feature], feature, issues);
    }
  }

  if (isRecord(snapshot?.player)) {
    checkBoolean(snapshot.player, 'available', 'player', issues);
    for (const field of ['portraitKey', 'displayName', 'title', 'resourceKind', 'modeLabel']) checkString(snapshot.player, field, 'player', issues);
    checkNumber(snapshot.player, 'level', 'player', issues, 0, HUD_LIMITS.levelMax);
    for (const field of ['hp', 'hpMax', 'resource', 'resourceMax', 'exp', 'expMax']) checkNumber(snapshot.player, field, 'player', issues);
    checkNumber(snapshot.player, 'modePercent', 'player', issues, 0, 100);
    for (const [index, buff] of checkCollection(snapshot.player.buffs, HUD_LIMITS.buffs, 'player.buffs', issues).entries()) {
      const path = `player.buffs[${index}]`;
      if (!isRecord(buff)) { issues.push(issue('invalid_item', path)); continue; }
      checkId(buff, path, issues);
      for (const field of ['label', 'visualKey', 'description']) checkString(buff, field, path, issues);
      checkNumber(buff, 'expiresAt', path, issues, 0, HUD_LIMITS.timestampMax, 'invalid_timestamp');
    }
  }

  if (isRecord(snapshot?.chat)) {
    for (const field of ['channel', 'status']) checkString(snapshot.chat, field, 'chat', issues);
    checkBoolean(snapshot.chat, 'canSend', 'chat', issues);
    checkNumber(snapshot.chat, 'unread', 'chat', issues, 0, HUD_LIMITS.numericMax);
    for (const [index, channel] of checkCollection(snapshot.chat.channels, 2, 'chat.channels', issues).entries()) {
      if (typeof channel !== 'string' || channel.length > HUD_LIMITS.string) issues.push(issue('invalid_string', `chat.channels[${index}]`));
    }
    for (const [index, row] of checkCollection(snapshot.chat.rows, HUD_LIMITS.chatRows, 'chat.rows', issues).entries()) {
      const path = `chat.rows[${index}]`;
      if (!isRecord(row)) { issues.push(issue('invalid_item', path)); continue; }
      checkId(row, path, issues);
      for (const field of ['channel', 'author', 'text', 'kind']) checkString(row, field, path, issues);
      checkNumber(row, 'timestamp', path, issues, 0, HUD_LIMITS.timestampMax, 'invalid_timestamp');
    }
  }

  if (isRecord(snapshot?.quest)) {
    checkBoolean(snapshot.quest, 'available', 'quest', issues);
    for (const field of ['title', 'summary', 'status']) checkString(snapshot.quest, field, 'quest', issues);
    for (const [index, step] of checkCollection(snapshot.quest.steps, HUD_LIMITS.questSteps, 'quest.steps', issues).entries()) {
      const path = `quest.steps[${index}]`;
      if (!isRecord(step)) { issues.push(issue('invalid_item', path)); continue; }
      checkId(step, path, issues);
      for (const field of ['label', 'state']) checkString(step, field, path, issues);
      for (const field of ['progress', 'goal']) checkNumber(step, field, path, issues);
    }
  }

  if (isRecord(snapshot?.party)) {
    checkBoolean(snapshot.party, 'available', 'party', issues);
    checkBoolean(snapshot.party, 'canSwitch', 'party', issues);
    if (snapshot.party.selectedSlot !== null && (!Number.isInteger(snapshot.party.selectedSlot) || snapshot.party.selectedSlot < 0 || snapshot.party.selectedSlot >= HUD_LIMITS.partySlots)) issues.push(issue('invalid_party_slot', 'party.selectedSlot'));
    checkString(snapshot.party, 'activeInstanceId', 'party', issues);
    const slots = checkCollection(snapshot.party.slots, HUD_LIMITS.partySlots, 'party.slots', issues);
    if (slots.length !== HUD_LIMITS.partySlots) issues.push(issue('invalid_party_slots', 'party.slots'));
    slots.forEach((slot, index) => {
      const path = `party.slots[${index}]`;
      if (!isRecord(slot) || slot.id !== `slot-${index + 1}` || slot.slot !== index) { issues.push(issue('invalid_party_slot', path)); return; }
      checkFrozen(slot, path, issues);
      for (const field of ['available', 'fainted', 'selected', 'active']) checkBoolean(slot, field, path, issues);
      for (const field of ['instanceId', 'portraitKey', 'name', 'condition']) checkString(slot, field, path, issues);
      checkNumber(slot, 'level', path, issues, 0, HUD_LIMITS.levelMax);
      for (const field of ['hp', 'hpMax']) checkNumber(slot, field, path, issues);
    });
  }

  if (isRecord(snapshot?.target)) {
    checkBoolean(snapshot.target, 'available', 'target', issues);
    for (const field of ['id', 'portraitKey', 'name']) checkString(snapshot.target, field, 'target', issues);
    if ((snapshot.target.available || snapshot.target.id) && !stableId(snapshot.target.id)) {
      issues.push(issue('invalid_item_id', 'target.id'));
    }
    checkNumber(snapshot.target, 'level', 'target', issues, 0, HUD_LIMITS.levelMax);
    for (const field of ['hp', 'hpMax']) checkNumber(snapshot.target, field, 'target', issues);
    for (const [index, state] of checkCollection(snapshot.target.states, HUD_LIMITS.targetStates, 'target.states', issues).entries()) {
      if (typeof state !== 'string' || state.length > HUD_LIMITS.string) issues.push(issue('invalid_string', `target.states[${index}]`));
    }
  }

  if (isRecord(snapshot?.map)) {
    checkBoolean(snapshot.map, 'available', 'map', issues);
    checkString(snapshot.map, 'zoneLabel', 'map', issues);
    checkFrozen(snapshot.map.bounds, 'map.bounds', issues);
    checkFrozen(snapshot.map.local, 'map.local', issues);
    for (const field of ['minX', 'maxX', 'minZ', 'maxZ']) checkNumber(snapshot.map.bounds, field, 'map.bounds', issues, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax);
    for (const field of ['x', 'z', 'heading']) checkNumber(snapshot.map.local, field, 'map.local', issues, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax);
    for (const [index, marker] of checkCollection(snapshot.map.markers, HUD_LIMITS.mapMarkers, 'map.markers', issues).entries()) {
      const path = `map.markers[${index}]`;
      if (!isRecord(marker)) { issues.push(issue('invalid_item', path)); continue; }
      checkId(marker, path, issues);
      for (const field of ['kind', 'label']) checkString(marker, field, path, issues);
      for (const field of ['x', 'z']) checkNumber(marker, field, path, issues, -HUD_LIMITS.numericMax, HUD_LIMITS.numericMax);
    }
  }

  for (const [feature, limit, stringFields, booleanFields] of [
    ['actions', HUD_LIMITS.actions, ['visualKey', 'label', 'state', 'reason'], ['enabled', 'pressed']],
    ['utilities', HUD_LIMITS.utilities, ['label', 'visualKey', 'badge', 'reason'], ['enabled']],
  ]) {
    if (!isRecord(snapshot?.[feature])) continue;
    for (const [index, item] of checkCollection(snapshot[feature].items, limit, `${feature}.items`, issues).entries()) {
      const path = `${feature}.items[${index}]`;
      if (!isRecord(item)) { issues.push(issue('invalid_item', path)); continue; }
      checkId(item, path, issues);
      for (const field of stringFields) checkString(item, field, path, issues);
      for (const field of booleanFields) checkBoolean(item, field, path, issues);
      if (feature === 'actions') {
        for (const field of ['cooldownRemaining', 'cooldownTotal', 'count']) checkNumber(item, field, path, issues);
      }
    }
  }

  if (isRecord(snapshot?.banner)) {
    for (const field of ['kind', 'text']) checkString(snapshot.banner, field, 'banner', issues);
    checkNumber(snapshot.banner, 'expiresAt', 'banner', issues, 0, HUD_LIMITS.timestampMax, 'invalid_timestamp');
  }
  return Object.freeze({ ok: issues.length === 0, issues: immutableArray(issues) });
}

export function validateUnifiedHudSnapshot(snapshot) {
  try {
    return validateUnifiedHudSnapshotUnsafe(snapshot);
  } catch {
    return Object.freeze({
      ok: false,
      issues: immutableArray([issue('invalid_snapshot', 'root')]),
    });
  }
}

export function createHudCommandResult(source) {
  if (!isRecord(source) || typeof source.ok !== 'boolean') {
    return Object.freeze({ ok: false, reason: 'invalid-command-result', message: '' });
  }
  return Object.freeze({
    ok: source.ok,
    reason: source.ok ? text(source.reason) : text(source.reason) || 'command-failed',
    message: text(source.message),
  });
}
