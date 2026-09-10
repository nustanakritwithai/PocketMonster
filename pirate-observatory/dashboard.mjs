import { PIRATE_FRUIT_ISLAND_CENTERS } from '../pirate-fruit-island-map-v900.mjs';
import { PartitionSync, SYNC_STATES } from './index.mjs';

const ns = 'http://www.w3.org/2000/svg';
const syncs = new Map();
const watched = new Set();
const eventTimeline = [];
let selected = null;
let serverStatus = { connected: false, tps: null, tick: null, issues: 0, reason: null, waitingForAuthority: false };

const els = {
  syncStatus: document.getElementById('syncStatus'),
  tickStatus: document.getElementById('tickStatus'),
  tpsStatus: document.getElementById('tpsStatus'),
  issueButton: document.getElementById('issueButton'),
  islandLayer: document.getElementById('islandLayer'),
  entityLayer: document.getElementById('entityLayer'),
  mapEmpty: document.getElementById('mapEmpty'),
  inspectorTitle: document.getElementById('inspectorTitle'),
  inspectorSubtitle: document.getElementById('inspectorSubtitle'),
  inspectorBody: document.getElementById('inspectorBody'),
  watchSelected: document.getElementById('watchSelected'),
  debugSelected: document.getElementById('debugSelected'),
  searchInput: document.getElementById('searchInput'),
  timelineMode: document.getElementById('timelineMode'),
  timelineEvents: document.getElementById('timelineEvents'),
};

function svg(tag, attrs = {}) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function titleCase(id) {
  return String(id).split(/[-_]/g).filter(Boolean).map(part => part[0]?.toUpperCase() + part.slice(1)).join(' ');
}

function getSync(partition) {
  let sync = syncs.get(partition);
  if (!sync) {
    sync = new PartitionSync(partition);
    syncs.set(partition, sync);
  }
  return sync;
}

function entityValues() {
  const entities = [];
  for (const sync of syncs.values()) for (const entity of sync.entities.values()) entities.push(entity);
  return entities;
}

function overallSyncState() {
  if (!serverStatus.connected) return SYNC_STATES.OFFLINE;
  const states = [...syncs.values()].map(sync => sync.state);
  if (states.some(state => state === SYNC_STATES.DESYNC)) return SYNC_STATES.DESYNC;
  if (states.some(state => state === SYNC_STATES.SYNCING || state === SYNC_STATES.CATCHING_UP)) return SYNC_STATES.SYNCING;
  if (states.some(state => state === SYNC_STATES.DELAYED)) return SYNC_STATES.DELAYED;
  if (states.length > 0 && states.every(state => state === SYNC_STATES.LIVE)) return SYNC_STATES.LIVE;
  return SYNC_STATES.OFFLINE;
}

function emptyMapCopy(state) {
  if (serverStatus.waitingForAuthority || serverStatus.reason === 'OBSERVATORY_NOT_READY') {
    return ['Server reachable', 'Waiting for authoritative WorldTickSnapshot; combat/HP is not fabricated.'];
  }
  if (state === SYNC_STATES.DESYNC) {
    return ['Partition desynchronized', 'Canonical state is paused while a clean snapshot resync is requested.'];
  }
  if (state === SYNC_STATES.SYNCING) {
    return ['Synchronizing canonical state', 'Server is reachable; validating snapshot and sequence cursors.'];
  }
  if (state === SYNC_STATES.DELAYED) {
    return ['Live data delayed', 'Showing the last verified canonical state while transport catches up.'];
  }
  if (state === SYNC_STATES.OFFLINE) {
    return ['Static geography ready', serverStatus.reason === 'SERVER_SESSION_UNAVAILABLE'
      ? 'An active Monster Life server session is required.'
      : 'Waiting for an authenticated Observatory server connection.'];
  }
  return ['Canonical world connected', 'No streamed entities are currently visible in this partition.'];
}

function renderStatus() {
  const state = overallSyncState();
  const icon = state === SYNC_STATES.LIVE ? '●' : state === SYNC_STATES.OFFLINE ? '○' : '↻';
  els.syncStatus.textContent = `${icon} ${state}`;
  els.syncStatus.className = `status status-${state.toLowerCase()}`;
  els.timelineMode.textContent = `${icon} ${state}`;
  const maxTick = Math.max(serverStatus.tick ?? 0, ...[...syncs.values()].map(sync => sync.tick));
  els.tickStatus.textContent = maxTick > 0 ? `Tick ${maxTick.toLocaleString()}` : 'Tick —';
  els.tpsStatus.textContent = Number.isFinite(serverStatus.tps) ? `TPS ${serverStatus.tps.toFixed(1)}` : 'TPS —';
  const issues = Math.max(0, Number(serverStatus.issues) || 0);
  els.issueButton.textContent = issues ? `⚠ ${issues} ISSUE${issues === 1 ? '' : 'S'}` : '✓ NO ISSUES';
  els.issueButton.style.color = issues ? 'var(--amber)' : 'var(--green)';
  els.mapEmpty.hidden = state === SYNC_STATES.LIVE && entityValues().length > 0;
  if (!els.mapEmpty.hidden) {
    const [heading, detail] = emptyMapCopy(state);
    const strong = els.mapEmpty.querySelector('strong');
    const span = els.mapEmpty.querySelector('span');
    if (strong) strong.textContent = heading;
    if (span) span.textContent = detail;
  }
}

function selectIsland(id) {
  selected = { kind: 'island', id, data: PIRATE_FRUIT_ISLAND_CENTERS[id] };
  renderSelection();
}

function selectEntity(entity) {
  selected = { kind: 'entity', id: entity.id, data: entity };
  renderSelection();
}

function renderIslands() {
  els.islandLayer.replaceChildren();
  for (const [id, island] of Object.entries(PIRATE_FRUIT_ISLAND_CENTERS)) {
    const group = svg('g', { class: `island-node${selected?.kind === 'island' && selected.id === id ? ' is-selected' : ''}`, 'data-id': id, tabindex: 0 });
    const displayRadius = Math.max(20, island.radius * .55);
    group.append(
      svg('circle', { class: 'island-halo', cx: island.x, cy: island.z, r: displayRadius + 14 }),
      svg('circle', { class: 'island-land', cx: island.x, cy: island.z, r: displayRadius }),
      svg('circle', { class: 'island-coast', cx: island.x, cy: island.z, r: displayRadius + 4 }),
    );
    const label = svg('text', { class: 'island-label', x: island.x, y: island.z + displayRadius + 22 });
    label.textContent = titleCase(id);
    const meta = svg('text', { class: 'island-meta', x: island.x, y: island.z + displayRadius + 35 });
    meta.textContent = `r ${island.radius}`;
    group.append(label, meta);
    group.addEventListener('click', () => selectIsland(id));
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') selectIsland(id); });
    els.islandLayer.append(group);
  }
}

function renderEntities() {
  els.entityLayer.replaceChildren();
  for (const entity of entityValues()) {
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.z)) continue;
    const kind = entity.type ?? entity.kind ?? 'entity';
    const group = svg('g', { class: `entity-node${selected?.kind === 'entity' && selected.id === entity.id ? ' is-selected' : ''}`, 'data-kind': kind, 'data-id': entity.id, tabindex: 0 });
    group.append(svg('circle', { class: 'entity-dot', cx: entity.x, cy: entity.z, r: watched.has(entity.id) ? 7 : 5 }));
    const label = svg('text', { class: 'entity-label', x: entity.x + 9, y: entity.z - 7 });
    label.textContent = watched.has(entity.id) ? `★ ${entity.id}` : entity.id;
    group.append(label);
    group.addEventListener('click', () => selectEntity(entity));
    group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') selectEntity(entity); });
    els.entityLayer.append(group);
  }
}

function renderSelection() {
  renderIslands();
  renderEntities();
  if (!selected) {
    els.inspectorTitle.textContent = 'No selection';
    els.inspectorSubtitle.textContent = 'Select an island or stream entity.';
    els.inspectorBody.innerHTML = '<div class="empty-card">Observatory is read-only. No world state is edited from this panel.</div>';
    els.watchSelected.disabled = true;
    els.debugSelected.disabled = true;
    return;
  }

  els.watchSelected.disabled = selected.kind !== 'entity';
  els.debugSelected.disabled = false;
  els.inspectorTitle.textContent = selected.kind === 'island' ? titleCase(selected.id) : selected.id;
  els.inspectorSubtitle.textContent = selected.kind === 'island' ? 'Canonical Pirate Fruit geography' : `${selected.data.partition ?? 'world'} • ${selected.data.type ?? selected.data.kind ?? 'entity'}`;
  const data = selected.data ?? {};
  const rows = selected.kind === 'island'
    ? [['X', data.x], ['Z', data.z], ['Radius', data.radius]]
    : [['State', data.state ?? '—'], ['HP', Number.isFinite(data.hp) ? data.hp : '—'], ['X', Number.isFinite(data.x) ? data.x.toFixed(1) : '—'], ['Z', Number.isFinite(data.z) ? data.z.toFixed(1) : '—'], ['Partition', data.partition ?? 'world']];
  els.inspectorBody.innerHTML = `<div class="data-card">${rows.map(([key, value]) => `<span>${key}</span><strong>${String(value)}</strong>`).join('')}</div><div class="empty-card">Read-only canonical view. Detailed history and AI state remain on-demand.</div>`;
  els.watchSelected.textContent = watched.has(selected.id) ? '★ WATCHING' : '☆ WATCH';
}

function addTimelineEvent(event) {
  eventTimeline.unshift({ ...event, at: event.at ?? Date.now() });
  if (eventTimeline.length > 30) eventTimeline.length = 30;
  els.timelineEvents.replaceChildren();
  for (const item of eventTimeline) {
    const row = document.createElement('span');
    row.className = 'timeline-item';
    const time = document.createElement('time');
    time.textContent = new Date(item.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const label = document.createElement('span');
    label.textContent = item.label ?? item.type ?? 'world event';
    row.append(time, label);
    row.addEventListener('click', () => {
      if (item.entity) {
        const entity = entityValues().find(candidate => candidate.id === item.entity);
        if (entity) selectEntity(entity);
      }
    });
    els.timelineEvents.append(row);
  }
}

function setWorkspace(workspace) {
  document.querySelectorAll('[data-workspace]').forEach(button => button.classList.toggle('is-active', button.dataset.workspace === workspace));
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== workspace; });
}

document.querySelectorAll('[data-workspace]').forEach(button => button.addEventListener('click', () => setWorkspace(button.dataset.workspace)));
document.querySelectorAll('[data-layer]').forEach(button => button.addEventListener('click', () => {
  button.classList.toggle('is-on');
  const enabled = button.classList.contains('is-on');
  if (button.dataset.layer === 'islands') els.islandLayer.style.display = enabled ? '' : 'none';
  if (button.dataset.layer === 'entities') els.entityLayer.style.display = enabled ? '' : 'none';
}));

els.watchSelected.addEventListener('click', () => {
  if (selected?.kind !== 'entity') return;
  if (watched.has(selected.id)) watched.delete(selected.id); else watched.add(selected.id);
  renderSelection();
});
els.debugSelected.addEventListener('click', () => setWorkspace('debug'));
els.searchInput.addEventListener('input', () => {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) return;
  const islandId = Object.keys(PIRATE_FRUIT_ISLAND_CENTERS).find(id => id.includes(query) || titleCase(id).toLowerCase().includes(query));
  if (islandId) return selectIsland(islandId);
  const entity = entityValues().find(item => String(item.id).toLowerCase().includes(query));
  if (entity) selectEntity(entity);
});

renderIslands();
renderEntities();
renderSelection();
renderStatus();

export const PirateObservatoryDashboard = Object.freeze({
  acceptSnapshot(snapshot) {
    if (!snapshot?.partition) return { ok: false, reason: 'PARTITION_REQUIRED' };
    const result = getSync(snapshot.partition).applySnapshot(snapshot);
    if (result.ok) {
      serverStatus.connected = true;
      serverStatus.reason = null;
      serverStatus.waitingForAuthority = false;
      renderEntities();
      renderSelection();
      renderStatus();
    }
    return result;
  },
  acceptDelta(packet) {
    if (!packet?.partition) return { ok: false, reason: 'PARTITION_REQUIRED' };
    const result = getSync(packet.partition).applyDelta(packet);
    serverStatus.connected = true;
    if (result.ok) {
      renderEntities();
      if (selected?.kind === 'entity') {
        const current = entityValues().find(item => item.id === selected.id);
        if (current) selected.data = current;
      }
      renderSelection();
    }
    renderStatus();
    return result;
  },
  acceptEvent(event) { addTimelineEvent(event ?? {}); },
  setServerStatus(next = {}) { serverStatus = { ...serverStatus, ...next }; renderStatus(); },
  markPartition(partition, state) {
    const sync = getSync(partition);
    if (Object.values(SYNC_STATES).includes(state)) sync.state = state;
    renderStatus();
  },
  selected: () => selected,
  watched: () => [...watched],
});

if (typeof window !== 'undefined') window.PIRATE_OBSERVATORY_DASHBOARD = PirateObservatoryDashboard;
