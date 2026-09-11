import { PirateObservatoryDebugModel, changedFieldsForObservatoryChange } from './debug-model.mjs';

const model = new PirateObservatoryDebugModel({ maxChanges: 80 });
let dashboard = null;

const els = {
  partition: document.getElementById('debugPartition'),
  tick: document.getElementById('debugTick'),
  sequence: document.getElementById('debugSequence'),
  snapshot: document.getElementById('debugSnapshotId'),
  selected: document.getElementById('debugSelectedEntity'),
  watches: document.getElementById('debugWatchCount'),
  changes: document.getElementById('debugRecentChanges'),
  diffTitle: document.getElementById('debugDiffTitle'),
  diffBody: document.getElementById('debugDiffBody'),
  note: document.getElementById('debugNote'),
};

function valueText(value) {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function renderChanges() {
  if (!els.changes) return;
  els.changes.replaceChildren();
  const changes = model.recentChanges(40);
  if (changes.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'debug-empty';
    empty.textContent = 'No canonical journal changes received since the latest snapshot/resync.';
    els.changes.append(empty);
    return;
  }

  for (const change of changes) {
    const row = document.createElement('div');
    row.className = 'debug-change';
    const cursor = document.createElement('span');
    cursor.className = 'debug-change-cursor';
    cursor.textContent = `T${change.tick} · #${change.sequence}`;
    const type = document.createElement('strong');
    type.textContent = change.type ?? 'CHANGE';
    const entity = document.createElement('span');
    entity.textContent = change.entity ?? change.eventId ?? 'world';
    row.append(cursor, type, entity);
    els.changes.append(row);
  }
}

function renderDiff() {
  if (!els.diffTitle || !els.diffBody) return;
  els.diffBody.replaceChildren();
  const selected = dashboard?.selected?.();
  if (selected?.kind !== 'entity') {
    els.diffTitle.textContent = 'No entity selected';
    const empty = document.createElement('div');
    empty.className = 'debug-empty';
    empty.textContent = 'Select a canonical entity in WORLD, then return here to inspect its most recent journal delta.';
    els.diffBody.append(empty);
    return;
  }

  els.diffTitle.textContent = selected.id;
  const change = model.latestChangeForEntity(selected.id);
  if (!change) {
    const empty = document.createElement('div');
    empty.className = 'debug-empty';
    empty.textContent = 'No post-snapshot delta for this selected entity is retained in this browser session.';
    els.diffBody.append(empty);
    return;
  }

  const meta = document.createElement('div');
  meta.className = 'debug-diff-meta';
  meta.textContent = `${change.type} · tick ${change.tick} · sequence ${change.sequence}`;
  els.diffBody.append(meta);
  const fields = changedFieldsForObservatoryChange(change);
  if (fields.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'debug-empty';
    empty.textContent = 'The latest journal entry has no object-field diff to display.';
    els.diffBody.append(empty);
    return;
  }

  for (const field of fields) {
    const row = document.createElement('div');
    row.className = 'debug-diff-row';
    const key = document.createElement('strong');
    key.textContent = field.key;
    const before = document.createElement('code');
    before.textContent = valueText(field.before);
    const arrow = document.createElement('span');
    arrow.textContent = '→';
    const after = document.createElement('code');
    after.textContent = valueText(field.after);
    row.append(key, before, arrow, after);
    els.diffBody.append(row);
  }
}

function render() {
  const snapshot = model.latestSnapshot();
  const selected = dashboard?.selected?.();
  const watched = dashboard?.watched?.() ?? [];
  if (els.partition) els.partition.textContent = snapshot?.partition ?? '—';
  if (els.tick) els.tick.textContent = Number.isSafeInteger(snapshot?.tick) ? snapshot.tick.toLocaleString() : '—';
  if (els.sequence) els.sequence.textContent = Number.isSafeInteger(snapshot?.sequence) ? snapshot.sequence.toLocaleString() : '—';
  if (els.snapshot) els.snapshot.textContent = snapshot?.snapshotId ?? '—';
  if (els.selected) els.selected.textContent = selected?.kind === 'entity' ? selected.id : '—';
  if (els.watches) els.watches.textContent = watched.length.toLocaleString();
  const retained = model.recentChanges().length;
  if (els.note) els.note.textContent = retained
    ? `${retained} post-snapshot canonical change${retained === 1 ? '' : 's'} kept in this browser session.`
    : 'Waiting for canonical snapshot/delta evidence.';
  renderChanges();
  renderDiff();
}

function acceptSnapshot(snapshot) {
  const result = model.acceptSnapshot(snapshot);
  if (result.ok) render();
  return result;
}

function acceptDelta(packet) {
  const result = model.acceptDelta(packet);
  if (result.ok) render();
  return result;
}

function attachDashboard(value) {
  dashboard = value;
  document.querySelector('[data-workspace="debug"]')?.addEventListener('click', render);
  document.getElementById('debugSelected')?.addEventListener('click', render);
  render();
}

export const PirateObservatoryDebugPanel = Object.freeze({
  attachDashboard,
  acceptSnapshot,
  acceptDelta,
  render,
  recentChanges: () => model.recentChanges(),
});
