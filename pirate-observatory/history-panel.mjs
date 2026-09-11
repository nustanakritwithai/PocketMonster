import { PirateObservatoryHistorySession } from './history-session.mjs';

const els = {
  status: document.getElementById('debugHistoryStatus'),
  checkpoint: document.getElementById('debugHistoryCheckpoint'),
  sequence: document.getElementById('debugHistorySequence'),
  refresh: document.getElementById('debugHistoryRefresh'),
  load: document.getElementById('debugHistoryLoad'),
  tick: document.getElementById('debugHistoryTick'),
  loadedSequence: document.getElementById('debugHistoryLoadedSequence'),
  entities: document.getElementById('debugHistoryEntityCount'),
  body: document.getElementById('debugHistoryEntities'),
};

let session = null;
let dashboard = null;
let configured = false;
let checkpointsLoaded = false;

function setStatus(text, tone = 'muted') {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

function renderCheckpoints(sequences) {
  if (!els.checkpoint) return;
  els.checkpoint.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = sequences.length ? 'Select checkpoint…' : 'No checkpoints';
  els.checkpoint.append(placeholder);
  for (const sequence of sequences) {
    const option = document.createElement('option');
    option.value = String(sequence);
    option.textContent = `#${sequence.toLocaleString()}`;
    els.checkpoint.append(option);
  }
}

function renderEntities(snapshot) {
  if (!els.body) return;
  els.body.replaceChildren();
  const entities = Array.isArray(snapshot?.entities) ? snapshot.entities : [];
  const selected = dashboard?.selected?.();
  const ordered = selected?.kind === 'entity'
    ? [...entities].sort((a, b) => (a.id === selected.id ? -1 : b.id === selected.id ? 1 : String(a.id).localeCompare(String(b.id))))
    : [...entities].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if (ordered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'debug-empty';
    empty.textContent = 'Historical snapshot contains no entities.';
    els.body.append(empty);
    return;
  }

  for (const entity of ordered.slice(0, 20)) {
    const row = document.createElement('div');
    row.className = `history-entity${selected?.kind === 'entity' && selected.id === entity.id ? ' is-selected' : ''}`;
    const id = document.createElement('strong');
    id.textContent = entity.id ?? 'unknown';
    const type = document.createElement('span');
    type.textContent = entity.type ?? 'entity';
    const hp = document.createElement('span');
    hp.textContent = Number.isFinite(entity.hp) && Number.isFinite(entity.hpMax)
      ? `HP ${Math.round(entity.hp)} / ${Math.round(entity.hpMax)}`
      : 'HP —';
    const position = document.createElement('code');
    position.textContent = Number.isFinite(entity.x) && Number.isFinite(entity.z)
      ? `${entity.x.toFixed(1)}, ${entity.z.toFixed(1)}`
      : '—';
    row.append(id, type, hp, position);
    els.body.append(row);
  }
  if (ordered.length > 20) {
    const more = document.createElement('div');
    more.className = 'debug-empty';
    more.textContent = `+ ${ordered.length - 20} more historical entities`;
    els.body.append(more);
  }
}

function renderSnapshot(snapshot) {
  if (els.tick) els.tick.textContent = Number.isSafeInteger(snapshot?.tick) ? snapshot.tick.toLocaleString() : '—';
  if (els.loadedSequence) els.loadedSequence.textContent = Number.isSafeInteger(snapshot?.sequence) ? snapshot.sequence.toLocaleString() : '—';
  if (els.entities) els.entities.textContent = Array.isArray(snapshot?.entities) ? snapshot.entities.length.toLocaleString() : '—';
  renderEntities(snapshot);
}

function clearSnapshot() {
  if (els.tick) els.tick.textContent = '—';
  if (els.loadedSequence) els.loadedSequence.textContent = '—';
  if (els.entities) els.entities.textContent = '—';
  if (els.body) {
    els.body.innerHTML = '<div class="debug-empty">Load a committed historical sequence to inspect detached evidence.</div>';
  }
}

function bindControls() {
  els.checkpoint?.addEventListener('change', () => {
    if (els.checkpoint.value && els.sequence) els.sequence.value = els.checkpoint.value;
  });
  els.refresh?.addEventListener('click', () => { void refresh(); });
  els.load?.addEventListener('click', () => { void load(); });
  document.querySelector('[data-workspace="debug"]')?.addEventListener('click', () => {
    if (configured && !checkpointsLoaded) void refresh();
  });
}

async function refresh() {
  if (!session) {
    setStatus('HISTORY UNAVAILABLE', 'warn');
    return { ok: false, reason: 'HISTORY_UNAVAILABLE' };
  }
  const result = await session.refreshCheckpoints();
  if (result.ok) checkpointsLoaded = true;
  return result;
}

async function load() {
  if (!session) {
    setStatus('HISTORY UNAVAILABLE', 'warn');
    return { ok: false, reason: 'HISTORY_UNAVAILABLE' };
  }
  const raw = els.sequence?.value?.trim() ?? '';
  const sequence = Number(raw);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    setStatus('ENTER A VALID SEQUENCE', 'warn');
    return { ok: false, reason: 'INVALID_HISTORY_SEQUENCE' };
  }
  return session.loadSequence(sequence);
}

function configure({ transport, partition = 'pirate-fruit', dashboard: dashboardValue = null } = {}) {
  dashboard = dashboardValue ?? dashboard;
  checkpointsLoaded = false;
  clearSnapshot();
  if (!transport?.getHistoryCheckpoints || !transport?.getHistoricalSnapshot) {
    session = null;
    configured = false;
    renderCheckpoints([]);
    setStatus('HISTORY UNAVAILABLE', 'muted');
    return;
  }

  session = new PirateObservatoryHistorySession({
    transport,
    partition,
    onCheckpoints: sequences => renderCheckpoints(sequences),
    onSnapshot: snapshot => renderSnapshot(snapshot),
    onStatus: state => {
      const code = state.code ?? '';
      if (state.state === 'loading-checkpoints') return setStatus('LOADING CHECKPOINTS…', 'muted');
      if (state.state === 'loading-snapshot') return setStatus(`LOADING #${state.targetSequence}…`, 'muted');
      if (state.state === 'historical') return setStatus(`HISTORY #${state.targetSequence} · DETACHED`, 'history');
      if (state.state === 'ready') return setStatus(`${state.checkpointCount ?? 0} CHECKPOINTS`, 'ok');
      if (state.state === 'error') return setStatus(code || 'HISTORY ERROR', code === 'HISTORY_DISABLED' ? 'muted' : 'warn');
      setStatus('HISTORY IDLE', 'muted');
    },
  });
  configured = true;
  setStatus('HISTORY READY TO QUERY', 'muted');
}

function clear() {
  session?.clear();
  session = null;
  configured = false;
  checkpointsLoaded = false;
  renderCheckpoints([]);
  clearSnapshot();
  setStatus('HISTORY UNAVAILABLE', 'muted');
}

bindControls();
renderCheckpoints([]);
clearSnapshot();
setStatus('HISTORY UNAVAILABLE', 'muted');

export const PirateObservatoryHistoryPanel = Object.freeze({
  configure,
  clear,
  refresh,
  load,
  current: () => session?.snapshot ?? null,
});
