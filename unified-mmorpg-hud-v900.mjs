/**
 * Unified HUD Task 6 — the single MMORPG Monitor Dock.
 *
 * The parent V9 document owns every visible HUD panel through this module.
 * Chat/Quest/Party live in one bottom console with ARIA tabs; quest keeps a
 * pinned left panel, target/party roster keeps the right-middle stack, per
 * the golden reference layout. All state arrives through the immutable
 * feature adapters (chat runtime + Pocket HUD globals); the Dock never
 * touches gameplay closures and re-renders only on revision changes.
 */

export const UNIFIED_MMORPG_HUD_KIND = 'pocketmonster:unified-mmorpg-hud-v1';

const TABS = Object.freeze(['chat', 'quest', 'party']);

function el(documentLike, tag, id = '', className = '') {
  const node = documentLike.createElement(tag);
  if (id) node.id = id;
  if (className) for (const name of String(className).split(/\s+/).filter(Boolean)) node.classList.add(name);
  return node;
}

function clampPercent(value, maximum) {
  if (!(typeof maximum === 'number' && Number.isFinite(maximum) && maximum > 0)) return 0;
  if (!(typeof value === 'number' && Number.isFinite(value))) return 0;
  return Math.max(0, Math.min(100, (value / maximum) * 100));
}

function portraitGlyph(snapshot) {
  const key = typeof snapshot?.portraitKey === 'string' ? snapshot.portraitKey.trim() : '';
  const remote = !key || /^https?:/i.test(key) || key.startsWith('//') || key.includes('://');
  const source = remote
    ? (typeof snapshot?.displayName === 'string' ? snapshot.displayName : '')
    : key;
  const glyph = source.trim().slice(0, 1).toUpperCase();
  return glyph || '?';
}

function fillBar(documentLike, className, value, maximum, label) {
  const bar = el(documentLike, 'div', '', className);
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', label);
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', String(Number.isFinite(maximum) ? maximum : 0));
  bar.setAttribute('aria-valuenow', String(Number.isFinite(value) ? value : 0));
  const fill = el(documentLike, 'span', '', 'mmorpg-bar-fill');
  fill.style.width = `${clampPercent(value, maximum)}%`;
  bar.append(fill);
  return bar;
}

export function createUnifiedMmorpgHud({ windowLike, documentLike } = {}) {
  if (!windowLike || !documentLike) {
    throw new TypeError('createUnifiedMmorpgHud requires windowLike and documentLike');
  }

  let shell = null;
  let activeTab = 'chat';
  let expanded = true;
  const unsubscribers = [];
  const lastRevisions = new Map();
  const nodes = new Map();

  function node(id) {
    return nodes.get(id) || null;
  }

  function register(id, element) {
    element.id = id;
    nodes.set(id, element);
    return element;
  }

  function changed(featureName, snapshot) {
    const revision = Number(snapshot?.revision);
    if (!Number.isFinite(revision)) return false;
    if (lastRevisions.get(featureName) === revision) return false;
    lastRevisions.set(featureName, revision);
    return true;
  }

  // ---------- Region builders ----------

  function buildShell() {
    const root = el(documentLike, 'div', 'mmorpgHud', 'mmorpg-hud');

    const player = register('mmorpgPlayerStatus', el(documentLike, 'div', '', 'mmorpg-player-status'));
    player.setAttribute('aria-label', 'Player status');
    root.append(player);

    root.append(register('mmorpgBuffRow', el(documentLike, 'div', '', 'mmorpg-buff-row')));
    const quick = register('mmorpgQuickIndicators', el(documentLike, 'div', '', 'mmorpg-quick-indicators'));
    quick.setAttribute('aria-label', 'Quick actions');
    root.append(quick);
    root.append(register('mmorpgQuestPanel', el(documentLike, 'aside', '', 'mmorpg-quest-panel')));

    const minimap = register('mmorpgMinimap', el(documentLike, 'div', '', 'mmorpg-minimap'));
    minimap.setAttribute('aria-label', 'Minimap');
    root.append(minimap);

    root.append(register('mmorpgRoster', el(documentLike, 'div', '', 'mmorpg-roster')));
    root.append(register('mmorpgCompanions', el(documentLike, 'div', '', 'mmorpg-companions')));
    root.append(register('mmorpgUtilities', el(documentLike, 'div', '', 'mmorpg-utilities')));
    root.append(register('mmorpgBanner', el(documentLike, 'div', '', 'mmorpg-banner')));

    const dock = register('mmorpgDock', el(documentLike, 'section', '', 'mmorpg-dock'));
    dock.append(register('mmorpgDockSummary', el(documentLike, 'div', '', 'mmorpg-dock-summary')));

    const tabs = register('mmorpgDockTabs', el(documentLike, 'div', '', 'mmorpg-dock-tabs'));
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Chat Quest Party');
    for (const tab of TABS) {
      const tabNode = register(`mmorpgTab${tab[0].toUpperCase()}${tab.slice(1)}`, el(documentLike, 'button', '', 'mmorpg-tab'));
      tabNode.setAttribute('role', 'tab');
      tabNode.setAttribute('type', 'button');
      tabNode.setAttribute('aria-controls', `mmorpg${tab[0].toUpperCase()}${tab.slice(1)}Panel`);
      tabNode.textContent = tab === 'chat' ? 'แชท' : tab === 'quest' ? 'เควส' : 'Party';
      if (tab === 'chat') tabNode.append(register('mmorpgChatUnread', el(documentLike, 'span', '', 'mmorpg-unread')));
      tabNode.addEventListener('click', () => setTab(tab));
      tabs.append(tabNode);
    }
    dock.append(tabs);

    const chatPanel = register('mmorpgChatPanel', el(documentLike, 'div', '', 'mmorpg-panel'));
    chatPanel.setAttribute('role', 'tabpanel');
    chatPanel.append(register('mmorpgChatLog', el(documentLike, 'div', '', 'mmorpg-chat-log')));
    const form = register('mmorpgChatForm', el(documentLike, 'form', '', 'mmorpg-chat-form'));
    const channelSelect = register('mmorpgChatChannel', el(documentLike, 'select', '', 'mmorpg-chat-channel'));
    channelSelect.value = 'WORLD';
    channelSelect.addEventListener('change', () => {
      chatAdapter()?.setChatChannel?.(channelSelect.value);
    });
    const input = register('mmorpgChatInput', el(documentLike, 'input', '', 'mmorpg-chat-input'));
    input.setAttribute('maxlength', '160');
    const send = el(documentLike, 'button', '', 'mmorpg-chat-send');
    send.setAttribute('type', 'submit');
    send.textContent = 'ส่ง';
    form.append(channelSelect, input, send);
    form.addEventListener('submit', event => {
      event?.preventDefault?.();
      const text = typeof input.value === 'string' ? input.value.trim() : '';
      const adapter = chatAdapter();
      if (!text || !adapter?.sendChat) return;
      input.value = '';
      void adapter.sendChat(text).catch(() => {});
    });
    chatPanel.append(form);
    dock.append(chatPanel);

    const questPanel = register('mmorpgQuestDockPanel', el(documentLike, 'div', '', 'mmorpg-panel'));
    questPanel.setAttribute('role', 'tabpanel');
    dock.append(questPanel);

    const partyPanel = register('mmorpgPartyPanel', el(documentLike, 'div', '', 'mmorpg-panel'));
    partyPanel.setAttribute('role', 'tabpanel');
    dock.append(partyPanel);

    root.append(dock);
    root.append(register('mmorpgBottomStrip', el(documentLike, 'div', '', 'mmorpg-bottom-strip')));
    return root;
  }

  // ---------- Adapters ----------

  function chatAdapter() {
    return windowLike.POCKETMONSTER_CHAT_RUNTIME?.chat || null;
  }

  function questAdapter() {
    return windowLike.POCKETMONSTER_QUEST_HUD || null;
  }

  function partyAdapter() {
    return windowLike.POCKETMONSTER_PARTY_HUD || null;
  }

  function pocketAdapter() {
    return windowLike.POCKETMONSTER_POCKET_HUD || null;
  }

  function minimapAdapter() {
    return windowLike.POCKETMONSTER_MINIMAP_HUD || null;
  }

  function subscribeFeature(featureName, adapter) {
    if (!adapter?.subscribe) return;
    const unsubscribe = adapter.subscribe(snapshot => renderFeature(featureName, snapshot));
    if (typeof unsubscribe === 'function') unsubscribers.push(unsubscribe);
  }

  // ---------- Renderers (revision-gated) ----------

  function renderFeature(featureName, snapshot) {
    if (!shell) return;
    if (!changed(featureName, snapshot)) return;
    if (featureName === 'chat') renderChat(snapshot);
    else if (featureName === 'quest') renderQuest(snapshot);
    else if (featureName === 'party') renderParty(snapshot);
    else if (featureName === 'player') renderPlayer(snapshot);
    else if (featureName === 'actions') renderQuickIndicators(snapshot);
    else if (featureName === 'target') renderRoster();
    else if (featureName === 'banner') renderBanner(snapshot);
    else if (featureName === 'utilities') renderUtilities(snapshot);
    else if (featureName === 'minimap') renderMinimap(snapshot);
  }

  function renderChat(snapshot) {
    const log = node('mmorpgChatLog');
    if (log) {
      const rows = [];
      for (const row of snapshot?.rows || []) {
        const line = el(documentLike, 'div', '', 'mmorpg-chat-row');
        line.dataset.kind = row.kind || 'message';
        line.textContent = row.kind === 'error'
          ? `⚠ ${row.text}`
          : `${row.author || 'ผู้เล่น'}: ${row.text}`;
        rows.push(line);
      }
      log.replaceChildren(...rows);
    }
    const badge = node('mmorpgChatUnread');
    if (badge) {
      const unread = Number(snapshot?.unread) || 0;
      badge.textContent = String(unread);
      badge.classList.toggle('hidden', unread <= 0);
    }
    const select = node('mmorpgChatChannel');
    if (select && snapshot?.channel && select.value !== snapshot.channel) select.value = snapshot.channel;
  }

  function renderQuest(snapshot) {
    const available = snapshot?.available === true;
    const side = node('mmorpgQuestPanel');
    const dockPanel = node('mmorpgQuestDockPanel');
    const build = target => {
      if (!target) return;
      const children = [];
      const title = el(documentLike, 'div', '', 'mmorpg-quest-title');
      title.textContent = available ? (snapshot.title || 'เควส') : 'ไม่มีเควสที่ติดตาม';
      children.push(title);
      if (available) {
        for (const step of snapshot.steps || []) {
          const item = el(documentLike, 'div', '', `mmorpg-quest-step ${step.state || 'todo'}`);
          item.textContent = `${step.label}`;
          children.push(item);
        }
        if (snapshot.summary) {
          const summary = el(documentLike, 'div', '', 'mmorpg-quest-summary');
          summary.textContent = snapshot.summary;
          children.push(summary);
        }
        if (snapshot.status) {
          const status = el(documentLike, 'div', '', 'mmorpg-quest-status');
          status.textContent = snapshot.status;
          children.push(status);
        }
      }
      target.replaceChildren(...children);
    };
    build(side);
    build(dockPanel);
    if (side) side.classList.toggle('hidden', !available);
  }

  function padPartySlots(slots) {
    const padded = Array.isArray(slots) ? slots.slice(0, 3) : [];
    while (padded.length < 3) {
      padded.push({
        slot: padded.length, available: false, name: '', hp: 0, hpMax: 0,
        fainted: false, selected: false, active: false, instanceId: '',
      });
    }
    return padded;
  }

  function isDanger(entity) {
    if (entity?.fainted === true) return true;
    const hp = entity?.hp;
    const hpMax = entity?.hpMax;
    return typeof hp === 'number' && typeof hpMax === 'number' && hpMax > 0 && (hp / hpMax) <= 0.25;
  }

  function rosterGlyph(entity) {
    return portraitGlyph({
      portraitKey: entity?.portraitKey,
      displayName: entity?.name || entity?.displayName || '',
    });
  }

  function buildRosterEntries(partySnapshot) {
    const target = pocketAdapter()?.target?.snapshot?.();
    const partyAvailable = partySnapshot?.available === true;
    const slots = padPartySlots(partyAvailable ? partySnapshot.slots : []);
    const entries = [];
    const used = new Set();
    if (target?.available === true && (target.name || target.id)) {
      entries.push({ kind: 'target', key: `target:${target.id || target.name}`, entity: target });
      if (target.id) used.add(String(target.id));
    }
    for (const slot of slots) {
      if (entries.length >= 3) break;
      if (slot.available === true) {
        const identity = slot.instanceId ? String(slot.instanceId) : '';
        if (identity && used.has(identity)) continue;
        if (identity) used.add(identity);
        entries.push({ kind: 'party', key: `party:${slot.slot}`, entity: slot });
      } else if (partyAvailable) {
        entries.push({ kind: 'placeholder', key: `empty:${slot.slot}`, entity: slot });
      }
    }
    while (entries.length < 3) {
      entries.push({ kind: 'placeholder', key: `pad:${entries.length}`, entity: { slot: entries.length, available: false } });
    }
    return entries.slice(0, 3);
  }

  function renderRosterRow(entry) {
    const entity = entry.entity || {};
    const row = el(documentLike, 'div', '', 'mmorpg-roster-row');
    row.dataset.rosterKey = entry.key;
    if (entry.kind === 'target') {
      row.classList.add('target');
      row.classList.add('selected');
    }
    if (entity.selected === true) row.classList.add('selected');
    if (isDanger(entity)) row.classList.add('danger');
    if (entry.kind === 'placeholder' || entity.available === false && entry.kind !== 'target') {
      row.classList.add('placeholder');
    }
    if (typeof entity.slot === 'number') row.dataset.partySlot = String(entity.slot);
    const icon = el(documentLike, 'span', '', 'mmorpg-roster-icon');
    icon.textContent = entry.kind === 'placeholder' || (entity.available === false && entry.kind !== 'target')
      ? '＋'
      : rosterGlyph(entity);
    const meta = el(documentLike, 'div', '', 'mmorpg-roster-meta');
    const name = el(documentLike, 'div', '', 'mmorpg-roster-name');
    name.textContent = entity.name || (entry.kind === 'placeholder' ? '' : '—');
    const state = el(documentLike, 'div', '', 'mmorpg-roster-state');
    const bits = [];
    if (entity.level) bits.push(`Lv.${entity.level}`);
    if (entity.condition) bits.push(entity.condition);
    if (Array.isArray(entity.states) && entity.states[0]) bits.push(entity.states[0]);
    if (entity.active === true) bits.push('สู้');
    if (entity.fainted === true) bits.push('Fainted');
    state.textContent = bits.join(' • ');
    meta.append(name, state);
    const hp = fillBar(documentLike, 'mmorpg-roster-hp', entity.hp, entity.hpMax, 'HP');
    row.append(icon, meta, hp);
    return row;
  }

  function bindCompanion(portrait, slot) {
    let pressTimer = 0;
    let suppressClick = false;
    const clearPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = 0;
      }
    };
    portrait.addEventListener('pointerdown', () => {
      suppressClick = false;
      clearPress();
      pressTimer = setTimeout(() => {
        pressTimer = 0;
        suppressClick = true;
        partyAdapter()?.openCharacter?.(slot.slot);
      }, 450);
    });
    portrait.addEventListener('pointerup', clearPress);
    portrait.addEventListener('pointercancel', clearPress);
    portrait.addEventListener('click', () => {
      if (suppressClick) return;
      partyAdapter()?.selectPartySlot?.(slot.slot);
    });
    portrait.addEventListener('contextmenu', event => {
      event?.preventDefault?.();
      clearPress();
      partyAdapter()?.openCharacter?.(slot.slot);
    });
  }

  function renderParty(snapshot) {
    const slots = padPartySlots(snapshot?.available === true ? snapshot.slots : []);
    const roster = node('mmorpgRoster');
    if (roster) {
      roster.replaceChildren(...buildRosterEntries(snapshot).map(entry => renderRosterRow(entry)));
    }
    const companions = node('mmorpgCompanions');
    if (companions) {
      const portraits = slots.map(slot => {
        const portrait = el(documentLike, 'button', '', 'mmorpg-companion');
        portrait.setAttribute('type', 'button');
        portrait.dataset.partySlot = String(slot.slot);
        if (slot.available !== true) portrait.classList.add('empty');
        if (slot.selected === true) portrait.classList.add('selected');
        if (slot.active === true) portrait.classList.add('active');
        if (slot.fainted === true) portrait.classList.add('fainted');
        portrait.textContent = slot.available === true ? rosterGlyph(slot) : '＋';
        portrait.setAttribute('aria-label', slot.available === true
          ? `${slot.name || 'Party'} slot ${slot.slot + 1}`
          : `Party ช่อง ${slot.slot + 1} ว่าง`);
        bindCompanion(portrait, slot);
        return portrait;
      });
      companions.replaceChildren(...portraits);
    }
    const partyPanel = node('mmorpgPartyPanel');
    if (partyPanel) {
      const controls = slots.map(slot => {
        const button = el(documentLike, 'button', '', 'mmorpg-party-slot');
        button.setAttribute('type', 'button');
        button.dataset.partySlot = String(slot.slot);
        button.textContent = slot.available === true
          ? `${slot.slot + 1}. ${slot.name} • HP ${slot.hp}/${slot.hpMax}`
          : `${slot.slot + 1}. ว่าง`;
        if (slot.selected === true) button.classList.add('selected');
        button.addEventListener('click', () => {
          partyAdapter()?.selectPartySlot?.(slot.slot);
        });
        return button;
      });
      partyPanel.replaceChildren(...controls);
    }
    const summary = node('mmorpgDockSummary');
    if (summary) {
      const active = slots.find(slot => slot.active === true) || slots.find(slot => slot.available === true);
      summary.textContent = active?.available === true
        ? `${active.name} • HP ${active.hp}/${active.hpMax}`
        : 'Party ว่าง';
    }
  }

  function renderRoster() {
    renderParty(partyAdapter()?.snapshot?.() || { available: false, slots: [] });
  }

  function renderPlayer(snapshot) {
    const panel = node('mmorpgPlayerStatus');
    if (!panel) return;
    if (snapshot?.available !== true) {
      panel.classList.add('skeleton');
      panel.replaceChildren();
      const status = el(documentLike, 'div', '', 'mmorpg-player-connecting');
      status.textContent = 'กำลังเชื่อมต่อ…';
      panel.append(status);
      node('mmorpgBuffRow')?.replaceChildren();
      return;
    }
    panel.classList.remove('skeleton');
    const portrait = el(documentLike, 'div', '', 'mmorpg-player-portrait');
    portrait.textContent = portraitGlyph(snapshot);
    portrait.setAttribute('aria-hidden', 'true');
    const identity = el(documentLike, 'div', '', 'mmorpg-player-identity');
    const level = el(documentLike, 'span', '', 'mmorpg-player-level');
    level.textContent = snapshot.level ? `Lv.${snapshot.level}` : '';
    const name = el(documentLike, 'div', '', 'mmorpg-player-name');
    name.textContent = snapshot.displayName || 'ผู้เล่น';
    const title = el(documentLike, 'div', '', 'mmorpg-player-title');
    title.textContent = snapshot.title || '';
    identity.append(level, name, title);
    const hpText = el(documentLike, 'div', '', 'mmorpg-player-hp-text');
    hpText.textContent = `HP ${snapshot.hp}/${snapshot.hpMax}`;
    const hp = fillBar(documentLike, 'mmorpg-player-hp', snapshot.hp, snapshot.hpMax, 'HP');
    const resourceText = el(documentLike, 'div', '', 'mmorpg-player-resource-text');
    resourceText.textContent = snapshot.resourceKind
      ? `${snapshot.resourceKind} ${snapshot.resource}/${snapshot.resourceMax}`
      : '';
    const resource = fillBar(
      documentLike, 'mmorpg-player-resource', snapshot.resource, snapshot.resourceMax,
      snapshot.resourceKind || 'resource',
    );
    const mode = el(documentLike, 'div', '', 'mmorpg-player-mode');
    const percent = Number.isFinite(snapshot.modePercent) ? ` ${Math.round(snapshot.modePercent)}%` : '';
    mode.textContent = `${snapshot.modeLabel || ''}${percent}`.trim();
    panel.replaceChildren(portrait, identity, hpText, hp, resourceText, resource, mode);
    const buffRow = node('mmorpgBuffRow');
    if (buffRow) {
      const all = Array.isArray(snapshot.buffs) ? snapshot.buffs : [];
      const shown = all.slice(0, 7);
      const nodes = shown.map(buff => {
        const icon = el(documentLike, 'button', '', 'mmorpg-buff');
        icon.setAttribute('type', 'button');
        icon.textContent = (buff.label || buff.visualKey || '?').slice(0, 2);
        const detail = [buff.label, buff.description, buff.expiresAt ? `หมดอายุ ${buff.expiresAt}` : '']
          .filter(Boolean).join(' — ');
        icon.setAttribute('aria-label', detail || buff.id || 'buff');
        icon.setAttribute('title', detail);
        return icon;
      });
      if (all.length > 7) {
        const extra = el(documentLike, 'button', '', 'mmorpg-buff mmorpg-buff-more');
        extra.setAttribute('type', 'button');
        extra.textContent = `+${all.length - 7}`;
        extra.setAttribute('aria-label', `บัฟเพิ่มอีก ${all.length - 7}`);
        extra.setAttribute('title', all.slice(7).map(buff => buff.label || buff.id).join(', '));
        nodes.push(extra);
      }
      buffRow.replaceChildren(...nodes);
    }
  }

  function renderQuickIndicators(snapshot) {
    const row = node('mmorpgQuickIndicators');
    if (!row) return;
    const items = Array.isArray(snapshot?.items) ? snapshot.items.slice(0, 5) : [];
    row.classList.toggle('hidden', items.length === 0);
    const nodes = items.map(item => {
      const badge = el(documentLike, 'div', '', 'mmorpg-quick-indicator');
      badge.setAttribute('role', 'img');
      badge.setAttribute('aria-label', item.label || item.id || 'action');
      if (item.pressed === true || item.state === 'selected') badge.classList.add('selected');
      if (item.enabled === false) badge.classList.add('disabled');
      const cooldown = clampPercent(item.cooldownRemaining, item.cooldownTotal);
      if (cooldown > 0) badge.classList.add('cooling');
      badge.style?.setProperty?.('--cooldown', `${cooldown}%`);
      badge.textContent = (item.label || item.id || '?').slice(0, 2);
      return badge;
    });
    row.replaceChildren(...nodes);
  }

  function renderMinimap(snapshot) {
    const map = node('mmorpgMinimap');
    if (!map) return;
    const available = snapshot?.available === true;
    map.classList.toggle('unavailable', !available);
    if (!available) {
      map.replaceChildren();
      return;
    }
    const dots = [];
    for (const marker of snapshot.markers || []) {
      const dot = el(documentLike, 'span', '', `mmorpg-minimap-marker ${marker.kind}`);
      dot.dataset.markerId = marker.id;
      dot.style.left = `${((marker.x + 1) / 2 * 100).toFixed(2)}%`;
      dot.style.top = `${((marker.z + 1) / 2 * 100).toFixed(2)}%`;
      dots.push(dot);
    }
    if (snapshot.player) {
      const playerDot = el(documentLike, 'span', '', 'mmorpg-minimap-player');
      playerDot.style.left = `${((snapshot.player.x + 1) / 2 * 100).toFixed(2)}%`;
      playerDot.style.top = `${((snapshot.player.z + 1) / 2 * 100).toFixed(2)}%`;
      playerDot.style.transform = `translate(-50%,-50%) rotate(${snapshot.player.heading}deg)`;
      dots.push(playerDot);
    }
    map.replaceChildren(...dots);
  }

  function renderBanner(snapshot) {
    const banner = node('mmorpgBanner');
    if (!banner) return;
    const text = snapshot?.text || '';
    banner.textContent = text;
    banner.classList.toggle('hidden', !text);
  }

  function renderUtilities(snapshot) {
    const utilities = node('mmorpgUtilities');
    if (!utilities) return;
    const buttons = (snapshot?.items || []).map(item => {
      const button = el(documentLike, 'button', '', 'mmorpg-utility');
      button.setAttribute('type', 'button');
      button.dataset.utility = item.id;
      button.textContent = item.label || item.id;
      button.disabled = item.enabled !== true;
      return button;
    });
    utilities.replaceChildren(...buttons);
  }

  // ---------- Tab control ----------

  function setTab(tab) {
    if (!TABS.includes(tab) || !shell) return;
    activeTab = tab;
    for (const candidate of TABS) {
      const tabNode = node(`mmorpgTab${candidate[0].toUpperCase()}${candidate.slice(1)}`);
      const panelNode = node(`mmorpg${candidate[0].toUpperCase()}${candidate.slice(1)}Panel`);
      const selected = candidate === tab;
      if (tabNode) tabNode.setAttribute('aria-selected', String(selected));
      if (panelNode) panelNode.classList.toggle('hidden', !selected);
    }
    if (tab === 'chat') chatAdapter()?.markRead?.();
  }

  function setExpanded(next) {
    expanded = next === true;
    node('mmorpgDock')?.classList.toggle('collapsed', !expanded);
  }

  // ---------- Lifecycle ----------

  function bindFeatures() {
    for (const unsubscribe of unsubscribers.splice(0)) {
      try { unsubscribe(); } catch {}
    }
    lastRevisions.clear();
    subscribeFeature('chat', chatAdapter());
    subscribeFeature('minimap', minimapAdapter());
    subscribeFeature('quest', questAdapter());
    subscribeFeature('party', partyAdapter());
    const pocket = pocketAdapter();
    if (pocket) {
      subscribeFeature('player', pocket.player);
      subscribeFeature('target', pocket.target);
      subscribeFeature('actions', pocket.actions);
      subscribeFeature('utilities', pocket.utilities);
      subscribeFeature('banner', pocket.banner);
    }
  }

  function mount() {
    if (shell) return shell;
    shell = buildShell();
    documentLike.body.append(shell);
    documentLike.body.classList.add('unified-hud-active');
    bindFeatures();
    setTab(activeTab);
    setExpanded(expanded);
    return shell;
  }

  function rebind() {
    if (!shell) return null;
    bindFeatures();
    setTab(activeTab);
    return shell;
  }

  function unmount() {
    for (const unsubscribe of unsubscribers.splice(0)) {
      try { unsubscribe(); } catch {}
    }
    lastRevisions.clear();
    try { shell?.remove?.(); } catch {}
    if (Array.isArray(shell?.parentNode?.children)) {
      shell.parentNode.children = shell.parentNode.children.filter(child => child !== shell);
    }
    documentLike.body.classList.remove('unified-hud-active');
    nodes.clear();
    shell = null;
  }

  return Object.freeze({
    kind: UNIFIED_MMORPG_HUD_KIND,
    mount,
    rebind,
    unmount,
    setTab,
    setExpanded,
  });
}
