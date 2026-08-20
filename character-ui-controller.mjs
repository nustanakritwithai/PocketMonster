// Session Character UI controller.
// Holds overlay/navigation flags only. Monster HP/EXP/stats/equipment/skills
// stay on state.collection via getInst(id). This object is never save-schema.

export const CHARACTER_PANELS = Object.freeze(['closed', 'quick', 'full', 'tab']);
export const CHARACTER_TABS = Object.freeze([
  'collection',
  'training',
  'skills',
  'equipment',
  'evolution',
  'breeding',
]);
export const PARTY_TAP_MODES = Object.freeze(['peek', 'switch']);
export const PARTY_SLOT_COUNT = 3;

export const ACTIVE_SUMMON_READONLY_REASON = 'กำลังซัมมอนอยู่ • ดูอย่างเดียว';
export const ACTIVE_SUMMON_SWITCH_REASON = 'Recall คู่หูก่อนจึงจะสลับตัวได้';
export const FULL_MANAGER_NPC_REASON = 'กลับ Ranch Hub และเข้าใกล้ NPC ก่อน';

const UI_KEYS = Object.freeze([
  'focusedMonsterId',
  'selectedPartySlot',
  'characterPanel',
  'characterTab',
  'partyTapMode',
  'characterStack',
  'pendingEquipItemId',
  'source',
  'readOnly',
]);

export function createCharacterUiState() {
  return {
    focusedMonsterId: null,
    selectedPartySlot: null,
    characterPanel: 'closed',
    characterTab: 'collection',
    partyTapMode: 'peek',
    characterStack: [],
    pendingEquipItemId: null,
    source: 'world',
    readOnly: false,
  };
}

export function persistableState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return state;
  const { ui: _ui, ...rest } = state;
  return rest;
}

export function attachCharacterUi(state, ui = createCharacterUiState()) {
  if (!state || typeof state !== 'object') throw new TypeError('game state is required');
  Object.defineProperty(state, 'ui', {
    configurable: true,
    enumerable: false,
    writable: true,
    value: ui,
  });
  return ui;
}

function freezeFrame(frame = {}) {
  const tab = CHARACTER_TABS.includes(frame.characterTab) ? frame.characterTab : 'collection';
  const resumePanel = CHARACTER_PANELS.includes(frame.resumePanel) ? frame.resumePanel : 'closed';
  return Object.freeze({
    resumePanel,
    focusedMonsterId: typeof frame.focusedMonsterId === 'string' ? frame.focusedMonsterId : null,
    selectedPartySlot: Number.isInteger(frame.selectedPartySlot) ? frame.selectedPartySlot : null,
    characterTab: tab,
    source: typeof frame.source === 'string' ? frame.source : 'world',
    zone: typeof frame.zone === 'string' ? frame.zone : null,
    kind: typeof frame.kind === 'string' ? frame.kind : (resumePanel === 'closed' ? 'world' : resumePanel),
  });
}

export function createCharacterUIController(options = {}) {
  const getState = options.getState;
  if (typeof getState !== 'function') throw new TypeError('getState is required');
  const getActiveSummonId = typeof options.getActiveSummonId === 'function' ? options.getActiveSummonId : () => null;
  const getZone = typeof options.getZone === 'function' ? options.getZone : () => getState().currentZone ?? null;
  const syncLegacySelection = typeof options.syncLegacySelection === 'function' ? options.syncLegacySelection : () => {};

  function ui() {
    const state = getState();
    if (!state.ui) attachCharacterUi(state);
    return state.ui;
  }

  function activeSummonId() {
    const id = getActiveSummonId();
    return typeof id === 'string' && id ? id : null;
  }

  function isSummonActive() {
    return Boolean(activeSummonId());
  }

  function canMutate() {
    return !isSummonActive();
  }

  function canSwitchParty() {
    return !isSummonActive();
  }

  function canOpenFullManager({ isNearNpc } = {}) {
    return Boolean(isNearNpc);
  }

  function captureFrame(overrides = {}) {
    const current = ui();
    return freezeFrame({
      resumePanel: current.characterPanel,
      focusedMonsterId: current.focusedMonsterId,
      selectedPartySlot: current.selectedPartySlot,
      characterTab: current.characterTab,
      source: current.source,
      zone: getZone(),
      kind: current.characterPanel === 'closed' ? 'world' : current.characterPanel,
      ...overrides,
    });
  }

  function applyFrame(frame) {
    const current = ui();
    if (!frame) {
      current.characterPanel = 'closed';
      current.source = 'world';
      current.readOnly = isSummonActive();
      return;
    }
    current.characterPanel = frame.resumePanel;
    current.focusedMonsterId = frame.focusedMonsterId;
    current.selectedPartySlot = frame.selectedPartySlot;
    current.characterTab = frame.characterTab;
    current.source = frame.source;
    current.readOnly = isSummonActive();
    if (current.focusedMonsterId) syncLegacySelection(current.focusedMonsterId);
  }

  function ensureReturnContext() {
    const current = ui();
    if (current.characterPanel === 'closed' && current.characterStack.length === 0) {
      current.characterStack.push(captureFrame({ resumePanel: 'closed', kind: 'world', source: current.source || 'world' }));
      return;
    }
    if (current.characterPanel !== 'closed') current.characterStack.push(captureFrame());
  }

  function snapshot() {
    const current = ui();
    return {
      focusedMonsterId: current.focusedMonsterId,
      selectedPartySlot: current.selectedPartySlot,
      characterPanel: current.characterPanel,
      characterTab: current.characterTab,
      partyTapMode: current.partyTapMode,
      characterStack: current.characterStack.map(frame => ({ ...frame })),
      pendingEquipItemId: current.pendingEquipItemId,
      source: current.source,
      readOnly: isSummonActive(),
      canMutate: canMutate(),
      canSwitchParty: canSwitchParty(),
    };
  }

  function openPanel(panel, details = {}) {
    if (!CHARACTER_PANELS.includes(panel) || panel === 'closed') return closeAll();
    const current = ui();
    if (current.characterPanel !== panel) ensureReturnContext();
    if (details.monsterId !== undefined) current.focusedMonsterId = details.monsterId;
    if (Number.isInteger(details.partySlot)) current.selectedPartySlot = details.partySlot;
    if (CHARACTER_TABS.includes(details.tab)) current.characterTab = details.tab;
    current.characterPanel = panel;
    current.source = details.source ?? current.source;
    current.readOnly = isSummonActive();
    if (current.focusedMonsterId) syncLegacySelection(current.focusedMonsterId);
    return snapshot();
  }

  function peekPartySlot(index) {
    if (!Number.isInteger(index) || index < 0 || index >= PARTY_SLOT_COUNT) {
      return { ok: false, switched: false, reason: 'invalid-slot', monsterId: null, partySlot: null };
    }
    const party = getState().party;
    const monsterId = Array.isArray(party) && typeof party[index] === 'string' ? party[index] : null;
    const current = ui();
    current.partyTapMode = 'peek';
    current.selectedPartySlot = index;
    current.focusedMonsterId = monsterId;
    current.readOnly = isSummonActive();
    openPanel('quick', { monsterId, partySlot: index, source: 'party' });
    if (monsterId) syncLegacySelection(monsterId);
    return {
      ok: true,
      switched: false,
      reason: null,
      monsterId,
      partySlot: index,
      panel: current.characterPanel,
      readOnly: current.readOnly,
    };
  }

  function requestSwitchParty(index) {
    const current = ui();
    current.partyTapMode = 'switch';
    if (!Number.isInteger(index) || index < 0 || index >= PARTY_SLOT_COUNT) {
      return { ok: false, switched: false, reason: 'invalid-slot', reasonText: 'Party ช่องนี้ไม่มี' };
    }
    if (!canSwitchParty()) {
      return { ok: false, switched: false, reason: 'active-summon', reasonText: ACTIVE_SUMMON_SWITCH_REASON };
    }
    return { ok: true, switched: false, reason: null, reasonText: '', index };
  }

  function requestMutate() {
    if (!canMutate()) {
      return { ok: false, reason: 'active-summon', reasonText: ACTIVE_SUMMON_READONLY_REASON };
    }
    return { ok: true, reason: null, reasonText: '' };
  }

  function requestOpenFull({ isNearNpc, monsterId, tab } = {}) {
    if (!canOpenFullManager({ isNearNpc })) {
      return { ok: false, reason: 'npc-required', reasonText: FULL_MANAGER_NPC_REASON };
    }
    openPanel('full', { source: 'npc', monsterId, tab });
    return { ok: true, snapshot: snapshot() };
  }

  function back() {
    const frame = ui().characterStack.pop() || null;
    applyFrame(frame);
    return frame;
  }

  function closeAll() {
    const current = ui();
    current.characterStack.length = 0;
    applyFrame(null);
    current.partyTapMode = 'peek';
    current.pendingEquipItemId = null;
    return snapshot();
  }

  function setTab(tab) {
    if (CHARACTER_TABS.includes(tab)) ui().characterTab = tab;
    return snapshot();
  }

  function isPeekedSlot(index) {
    const current = ui();
    return current.characterPanel !== 'closed' && current.selectedPartySlot === index;
  }

  return {
    peekPartySlot,
    requestSwitchParty,
    requestMutate,
    requestOpenFull,
    openPanel,
    back,
    closeAll,
    setTab,
    canMutate,
    canSwitchParty,
    canOpenFullManager,
    isPeekedSlot,
    isSummonActive,
    snapshot,
    ui,
    uiKeys: UI_KEYS,
  };
}
