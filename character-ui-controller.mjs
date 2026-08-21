// Session Character UI controller.
// Holds overlay/navigation flags only. Monster HP/EXP/stats/equipment/skills
// stay on state.collection via getInst(id). This object is never save-schema.

export const CHARACTER_PANELS = Object.freeze(['closed', 'quick', 'full', 'tab']);
export const CHARACTER_TABS = Object.freeze([
  'info',
  'collection',
  'training',
  'skills',
  'equipment',
  'evolution',
  'breeding',
]);
export const PARTY_TAP_MODES = Object.freeze(['peek', 'switch']);
export const PARTY_SLOT_COUNT = 3;

export const ACTIVE_SUMMON_READONLY_REASON = 'กำลังซัมมอนอยู่ • ต้องเรียกกลับก่อนจึงจะปรับแต่งได้';
export const ACTIVE_SUMMON_SWITCH_REASON = 'Recall คู่หูก่อนจึงจะสลับตัวได้';
export const ACTIVE_SUMMON_RECALL_REASON = 'ต้องเรียกกลับก่อน';
export const FULL_MANAGER_NPC_REASON = 'กลับ Ranch Hub และเข้าใกล้ NPC ก่อน';
export const QUICK_MUTATE_TABS = Object.freeze(['skills', 'equipment', 'training']);

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

export function getFocusedCharacterPresentation({
  getInst,
  focusedMonsterId,
  describeRoster = () => ({ place: 'None', label: 'None' }),
  displayName = inst => inst?.instanceId || 'Monster',
  getTypes = () => [],
  getCr = () => null,
} = {}) {
  const inst = typeof getInst === 'function' && typeof focusedMonsterId === 'string'
    ? getInst(focusedMonsterId)
    : null;
  if (!inst) {
    return {
      id: null, name: '', level: null, exp: null, hp: null, maxHp: null,
      atk: null, def: null, spd: null, cr: null, bond: null, growth: null,
      types: [], place: 'None', placeLabel: 'None', isEmpty: true,
    };
  }
  const roster = describeRoster(inst.instanceId) || {};
  return {
    id: inst.instanceId,
    name: displayName(inst),
    level: inst.level ?? null,
    exp: inst.exp ?? null,
    hp: inst.hp ?? null,
    maxHp: inst.maxHp ?? null,
    atk: inst.atk ?? null,
    def: inst.def ?? null,
    spd: inst.spd ?? null,
    cr: getCr(inst),
    bond: inst.bond ?? null,
    growth: inst.growth ?? null,
    types: getTypes(inst) || [],
    place: roster.place ?? 'Unknown',
    placeLabel: roster.label ?? roster.place ?? 'Unknown',
    isEmpty: false,
  };
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
  const kind = typeof frame.kind === 'string' ? frame.kind : (resumePanel === 'closed' ? 'world' : resumePanel);
  const returnTo = frame.returnTo === 'quick' || frame.returnTo === 'world' || CHARACTER_PANELS.includes(frame.returnTo)
    ? frame.returnTo
    : (resumePanel === 'quick' || resumePanel === 'tab' ? 'quick' : 'world');
  return Object.freeze({
    resumePanel,
    focusedMonsterId: typeof frame.focusedMonsterId === 'string' ? frame.focusedMonsterId : null,
    selectedPartySlot: Number.isInteger(frame.selectedPartySlot) ? frame.selectedPartySlot : null,
    characterTab: tab,
    source: typeof frame.source === 'string' ? frame.source : 'world',
    zone: typeof frame.zone === 'string' ? frame.zone : null,
    kind,
    returnTo,
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

  function canOpenFullManager({ isNearNpc, source } = {}) {
    if (source === 'character') return true;
    return Boolean(isNearNpc);
  }

  function captureFrame(overrides = {}) {
    const current = ui();
    const panel = current.characterPanel;
    const returnTo = panel === 'quick' || panel === 'tab' ? 'quick' : (panel === 'closed' ? 'world' : panel);
    return freezeFrame({
      resumePanel: panel,
      focusedMonsterId: current.focusedMonsterId,
      selectedPartySlot: current.selectedPartySlot,
      characterTab: current.characterTab,
      source: current.source,
      zone: getZone(),
      kind: panel === 'closed' ? 'world' : panel,
      returnTo,
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

  function requestOpenFull({ isNearNpc, monsterId, tab, source } = {}) {
    const from = source === 'character' ? 'character' : 'npc';
    if (!canOpenFullManager({ isNearNpc, source: from })) {
      return {
        ok: false,
        reason: 'npc-required',
        reasonText: FULL_MANAGER_NPC_REASON,
        openedManager: false,
        focusedMonsterId: ui().focusedMonsterId,
        panel: ui().characterPanel,
      };
    }
    const id = typeof monsterId === 'string' ? monsterId : ui().focusedMonsterId;
    openPanel('full', { source: from, monsterId: id, tab });
    const stack = ui().characterStack;
    const returnFrame = stack.length ? stack[stack.length - 1] : null;
    return {
      ok: true,
      snapshot: snapshot(),
      openedManager: true,
      focusedMonsterId: ui().focusedMonsterId,
      panel: 'full',
      characterTab: ui().characterTab,
      source: from,
      kind: 'full-manager',
      returnTo: returnFrame?.returnTo || (returnFrame?.resumePanel === 'quick' ? 'quick' : 'world'),
    };
  }

  function blockedQuickMutate(tab) {
    if (QUICK_MUTATE_TABS.includes(tab) && !canMutate()) {
      return {
        ok: false,
        reason: 'active-summon',
        reasonText: ACTIVE_SUMMON_RECALL_REASON,
        focusedMonsterId: ui().focusedMonsterId,
        panel: ui().characterPanel,
        openedManager: false,
      };
    }
    return null;
  }

  function requestOpenFromQuick({ tab = 'collection', monsterId } = {}) {
    if (tab === 'breeding') {
      return {
        ok: false,
        reason: 'npc-required',
        reasonText: FULL_MANAGER_NPC_REASON,
        openedManager: false,
        focusedMonsterId: ui().focusedMonsterId,
        panel: ui().characterPanel,
      };
    }
    const mutateBlock = blockedQuickMutate(tab);
    if (mutateBlock) return mutateBlock;
    const nextTab = CHARACTER_TABS.includes(tab) ? tab : 'collection';
    return requestOpenFull({
      source: 'character',
      monsterId: monsterId ?? ui().focusedMonsterId,
      tab: nextTab,
    });
  }

  function focusMonster(monsterId) {
    const current = ui();
    current.focusedMonsterId = typeof monsterId === 'string' ? monsterId : null;
    if (current.focusedMonsterId) syncLegacySelection(current.focusedMonsterId);
    return snapshot();
  }

  function describeRoster(monsterId) {
    const state = getState();
    const id = typeof monsterId === 'string' ? monsterId : ui().focusedMonsterId;
    const party = Array.isArray(state.party) ? state.party : [];
    const partyIndex = id ? party.indexOf(id) : -1;
    const ranch = Boolean(id && Array.isArray(state.ranchActive) && state.ranchActive.includes(id));
    const storage = Boolean(id && Array.isArray(state.storage) && state.storage.includes(id));
    const summoned = Boolean(id && activeSummonId() === id);
    let place = 'Unknown';
    if (!id) place = 'None';
    else if (summoned) place = 'Active';
    else if (partyIndex >= 0) place = 'Party';
    else if (ranch) place = 'Ranch';
    else if (storage) place = 'Storage';
    let label = place;
    if (place === 'Active') label = partyIndex >= 0 ? `Party ช่อง ${partyIndex + 1} • Active` : 'Active';
    else if (place === 'Party' && partyIndex >= 0) label = `Party ช่อง ${partyIndex + 1}`;
    return {
      place,
      partyPosition: partyIndex >= 0 ? partyIndex + 1 : null,
      summoned,
      ranch,
      storage,
      label,
    };
  }

  function requestOpenTab(tab, details = {}) {
    if (!CHARACTER_TABS.includes(tab)) {
      return {
        ok: false,
        reason: 'invalid-tab',
        reasonText: 'แท็บนี้ไม่มี',
        focusedMonsterId: ui().focusedMonsterId,
        panel: ui().characterPanel,
      };
    }
    const mutateBlock = blockedQuickMutate(tab);
    if (mutateBlock) return mutateBlock;
    if (tab === 'collection') {
      const current = ui();
      if (current.characterPanel === 'tab') {
        back();
        current.characterTab = 'collection';
        current.readOnly = isSummonActive();
        if (details.monsterId !== undefined) current.focusedMonsterId = details.monsterId;
        if (current.focusedMonsterId) syncLegacySelection(current.focusedMonsterId);
        return {
          ok: true,
          snapshot: snapshot(),
          focusedMonsterId: current.focusedMonsterId,
          panel: current.characterPanel,
          openedManager: false,
        };
      }
      openPanel('quick', { ...details, tab: 'collection' });
      return {
        ok: true,
        snapshot: snapshot(),
        focusedMonsterId: ui().focusedMonsterId,
        panel: 'quick',
        openedManager: false,
      };
    }
    const focused = details.monsterId !== undefined ? details.monsterId : ui().focusedMonsterId;
    openPanel('tab', { ...details, tab, monsterId: focused });
    return {
      ok: true,
      snapshot: snapshot(),
      focusedMonsterId: ui().focusedMonsterId,
      panel: 'tab',
      characterTab: tab,
      openedManager: false,
    };
  }

  function requestGlobalAccess({ source = 'global-button', monsterId, partySlot } = {}) {
    const current = ui();
    if (current.characterPanel === 'full') {
      return {
        ok: false,
        switched: false,
        openedManager: false,
        reason: 'manager-open',
        reasonText: 'ปิดหน้าต่างผู้ดูแลก่อนใช้ทางเข้าตัวละคร',
        panel: 'full',
        monsterId: current.focusedMonsterId,
        readOnly: isSummonActive(),
        zone: getZone(),
      };
    }
    const state = getState();
    const party = Array.isArray(state.party) ? state.party : [];
    const slot = Number.isInteger(partySlot)
      ? partySlot
      : (Number.isInteger(state.selectedSlot) ? state.selectedSlot : 0);
    const id = typeof monsterId === 'string'
      ? monsterId
      : (typeof party[slot] === 'string' ? party[slot] : current.focusedMonsterId);
    openPanel('quick', { source, monsterId: id ?? null, partySlot: Number.isInteger(slot) ? slot : null });
    return {
      ok: true,
      switched: false,
      openedManager: false,
      reason: null,
      panel: 'quick',
      monsterId: id ?? null,
      partySlot: Number.isInteger(slot) ? slot : null,
      readOnly: isSummonActive(),
      zone: getZone(),
    };
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
    requestOpenFromQuick,
    requestGlobalAccess,
    requestOpenTab,
    describeRoster,
    focusMonster,
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
