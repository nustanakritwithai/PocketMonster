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
  if (className) node.classList.add(className);
  return node;
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
    else if (featureName === 'target') renderRoster();
    else if (featureName === 'banner') renderBanner(snapshot);
    else if (featureName === 'utilities') renderUtilities(snapshot);
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

  function renderParty(snapshot) {
    const available = snapshot?.available === true;
    const slots = available ? snapshot.slots || [] : [];
    const roster = node('mmorpgRoster');
    if (roster) {
      const rows = [];
      const target = pocketAdapter()?.target?.snapshot?.();
      if (target?.available === true && target.name) {
        const row = el(documentLike, 'div', '', 'mmorpg-roster-row target');
        row.textContent = `${target.name} • Lv.${target.level} • HP ${target.hp}/${target.hpMax}`;
        rows.push(row);
      }
      for (const slot of slots) {
        if (slot?.available !== true) continue;
        const row = el(documentLike, 'div', '', 'mmorpg-roster-row');
        row.dataset.partySlot = String(slot.slot);
        row.textContent = `${slot.name} • Lv.${slot.level} • HP ${slot.hp}/${slot.hpMax}${slot.active ? ' • สู้' : ''}${slot.fainted ? ' • Fainted' : ''}`;
        rows.push(row);
      }
      roster.replaceChildren(...rows);
    }
    const companions = node('mmorpgCompanions');
    if (companions) {
      const portraits = slots.map(slot => {
        const portrait = el(documentLike, 'div', '', 'mmorpg-companion');
        portrait.dataset.partySlot = String(slot.slot);
        portrait.textContent = slot.available === true ? (slot.name || '?').slice(0, 1) : '＋';
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
    const snapshot = partyAdapter()?.snapshot?.();
    if (snapshot) renderParty(snapshot);
  }

  function renderPlayer(snapshot) {
    const panel = node('mmorpgPlayerStatus');
    if (!panel) return;
    if (snapshot?.available !== true) {
      panel.replaceChildren();
      return;
    }
    const name = el(documentLike, 'div', '', 'mmorpg-player-name');
    name.textContent = `${snapshot.displayName || 'ผู้เล่น'}${snapshot.level ? ` • Lv.${snapshot.level}` : ''}`;
    const hp = el(documentLike, 'div', '', 'mmorpg-player-hp');
    hp.setAttribute('role', 'progressbar');
    hp.setAttribute('aria-valuemin', '0');
    hp.setAttribute('aria-valuemax', String(snapshot.hpMax));
    hp.setAttribute('aria-valuenow', String(snapshot.hp));
    hp.textContent = `HP ${snapshot.hp}/${snapshot.hpMax}`;
    const resource = el(documentLike, 'div', '', 'mmorpg-player-resource');
    resource.textContent = snapshot.resourceKind ? `${snapshot.resourceKind}: ${snapshot.resource}/${snapshot.resourceMax}` : '';
    const mode = el(documentLike, 'div', '', 'mmorpg-player-mode');
    mode.textContent = snapshot.modeLabel || '';
    panel.replaceChildren(name, hp, resource, mode);
    const buffRow = node('mmorpgBuffRow');
    if (buffRow) {
      const buffs = (snapshot.buffs || []).map(buff => {
        const icon = el(documentLike, 'span', '', `mmorpg-buff ${buff.visualKey || ''}`);
        icon.textContent = buff.label || '?';
        icon.setAttribute('title', buff.description || buff.label || '');
        return icon;
      });
      buffRow.replaceChildren(...buffs);
    }
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

  function mount() {
    if (shell) return shell;
    shell = buildShell();
    documentLike.body.append(shell);
    subscribeFeature('chat', chatAdapter());
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
    setTab(activeTab);
    setExpanded(expanded);
    return shell;
  }

  function unmount() {
    for (const unsubscribe of unsubscribers.splice(0)) {
      try { unsubscribe(); } catch {}
    }
    lastRevisions.clear();
    if (shell?.parentNode?.children) {
      shell.parentNode.children = shell.parentNode.children.filter(child => child !== shell);
    }
    nodes.clear();
    shell = null;
  }

  return Object.freeze({
    kind: UNIFIED_MMORPG_HUD_KIND,
    mount,
    unmount,
    setTab,
    setExpanded,
  });
}
