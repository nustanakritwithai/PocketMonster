import { PirateObservatoryHistorySession } from './history-session.mjs';
import { PirateObservatoryEvidencePlayback } from './evidence-playback.mjs';

const els = {
  status: document.getElementById('debugHistoryStatus'),
  checkpoint: document.getElementById('debugHistoryCheckpoint'),
  sequence: document.getElementById('debugHistorySequence'),
  refresh: document.getElementById('debugHistoryRefresh'),
  load: document.getElementById('debugHistoryLoad'),
  prev: document.getElementById('debugPlaybackPrev'),
  play: document.getElementById('debugPlaybackPlay'),
  pause: document.getElementById('debugPlaybackPause'),
  next: document.getElementById('debugPlaybackNext'),
  playbackState: document.getElementById('debugPlaybackState'),
  playbackRange: document.getElementById('debugPlaybackRange'),
  tick: document.getElementById('debugHistoryTick'),
  loadedSequence: document.getElementById('debugHistoryLoadedSequence'),
  entities: document.getElementById('debugHistoryEntityCount'),
  body: document.getElementById('debugHistoryEntities'),
};

let session = null;
let playback = null;
let dashboard = null;
let configured = false;
let checkpointsLoaded = false;

function setStatus(text, tone = 'muted') {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.dataset.tone = tone;
}

function renderPlaybackState(state = null) {
  const value = state ?? playback?.status?.() ?? null;
  if (els.playbackState) {
    const label = value?.state ? value.state.toUpperCase() : 'IDLE';
    els.playbackState.textContent = label;
    els.playbackState.dataset.state = value?.state ?? 'idle';
  }
  if (els.playbackRange) {
    els.playbackRange.textContent = Number.isSafeInteger(value?.minSequence) && Number.isSafeInteger(value?.maxSequence)
      ? `#${value.minSequence.toLocaleString()} → #${value.maxSequence.toLocaleString()}`
      : 'NO RETAINED RANGE';
  }
  if (els.play) els.play.disabled = !value || value.minSequence === null || value.state === 'playing';
  if (els.pause) els.pause.disabled = !value || value.state !== 'playing';
  if (els.prev) els.prev.disabled = !value || value.minSequence === null || (value.currentSequence !== null && value.currentSequence <= value.minSequence);
  if (els.next) els.next.disabled = !value || value.maxSequence === null || (value.currentSequence !== null && value.currentSequence >= value.maxSequence);
}

function renderCheckpoints(sequences) {
  if (els.checkpoint) {
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
  playback?.configureBounds(sequences);
  renderPlaybackState();
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
  if (els.sequence && Number.isSafeInteger(snapshot?.sequence)) els.sequence.value = String(snapshot.sequence);
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
  els.prev?.addEventListener('click', () => { void playback?.step(-1); });
  els.next?.addEventListener('click', () => { void playback?.step(1); });
  els.play?.addEventListener('click', () => { void playback?.play(); });
  els.pause?.addEventListener('click', () => playback?.pause());
  document.querySelector('[data-workspace="debug"]')?.addEventListener('click', () => {
    if (configured && !checkpointsLoaded) void refresh();
  });
}

async function refresh() {
  if (!session) {
    setStatus('HISTORY UNAVAILABLE', 'warn');
    return { ok: false, reason: 'HISTORY_UNAVAILABLE' };
  }
  playback?.pause();
  const result = await session.refreshCheckpoints();
  if (result.ok) checkpointsLoaded = true;
  return result;
}

async function load() {
  if (!session || !playback) {
    setStatus('HISTORY UNAVAILABLE', 'warn');
    return { ok: false, reason: 'HISTORY_UNAVAILABLE' };
  }
  const raw = els.sequence?.value?.trim() ?? '';
  const sequence = Number(raw);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    setStatus('ENTER A VALID SEQUENCE', 'warn');
    return { ok: false, reason: 'INVALID_HISTORY_SEQUENCE' };
  }
  const result = await playback.jump(sequence);
  if (!result.ok && result.reason === 'HISTORY_OUT_OF_RANGE') setStatus('SEQUENCE OUTSIDE RETAINED RANGE', 'warn');
  return result;
}

function configure({ transport, partition = 'pirate-fruit', dashboard: dashboardValue = null } = {}) {
  dashboard = dashboardValue ?? dashboard;
  checkpointsLoaded = false;
  playback?.clear();
  playback = null;
  clearSnapshot();
  if (!transport?.getHistoryCheckpoints || !transport?.getHistoricalSnapshot) {
    session = null;
    configured = false;
    renderCheckpoints([]);
    renderPlaybackState();
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
  playback = new PirateObservatoryEvidencePlayback({
    historySession: session,
    stepMs: 500,
    onState: state => {
      renderPlaybackState(state);
      if (Number.isSafeInteger(state.currentSequence) && els.sequence) els.sequence.value = String(state.currentSequence);
      if (state.state === 'error') setStatus(state.reason ?? 'PLAYBACK ERROR', 'warn');
      if (state.state === 'ended') setStatus(`EVIDENCE END #${state.currentSequence ?? '—'}`, 'history');
    },
  });
  configured = true;
  renderPlaybackState(playback.status());
  setStatus('HISTORY READY TO QUERY', 'muted');
}

function clear() {
  playback?.clear();
  playback = null;
  session?.clear();
  session = null;
  configured = false;
  checkpointsLoaded = false;
  renderCheckpoints([]);
  clearSnapshot();
  renderPlaybackState();
  setStatus('HISTORY UNAVAILABLE', 'muted');
}

bindControls();
renderCheckpoints([]);
clearSnapshot();
renderPlaybackState();
setStatus('HISTORY UNAVAILABLE', 'muted');

export const PirateObservatoryHistoryPanel = Object.freeze({
  configure,
  clear,
  refresh,
  load,
  pause: () => playback?.pause(),
  current: () => session?.snapshot ?? null,
  playbackStatus: () => playback?.status() ?? null,
});
