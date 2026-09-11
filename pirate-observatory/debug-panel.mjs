const snapshots = new Map();
const recentChanges = [];
const MAX_CHANGES = 80;
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

function latestSnapshot() {
  return [...snapshots.values()].sort((a, b) => b.tick - a.tick || b.sequence - a.sequence)[0] ?? null;
}

function valueText(value) {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function changedFields(change) {
  const before = change?.before && typeof change.before === 'object' ? change.before : {};
  const after = change?.after && typeof change.after === 'object' ? change.after : {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !['fingerprint'].includes(key));
  return keys
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, 12)
    .map(key => ({ key, before: before[key], after: after[key] }));
}

function renderChanges() {
  if (!els.changes) return;
  els.changes.replaceChildren();
  if (recentChanges.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'debug-empty';
    empty.textContent = 'No canonical journal changes received yet.';
    els.changes.append(empty);
    return;
  }

  for (const change of recentChanges.slice(0, 40)) {
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
  const change = recentChanges.find(item => item.entity === selected.id);
  if (!change) {
    const empty = document.createElement('div');
    empty.className = 'debug-empty';
    empty.textContent = 'No retained client-side delta for this selected entity yet.';
    els.diffBody.append(empty);
    return;
  }

  const meta = document.createElement('div');
  meta.className = 'debug-diff-meta';
  meta.textContent = `${change.type} · tick ${change.tick} · sequence ${change.sequence}`;
  els.diffBody.append(meta);
  const fields = changedFields(change);
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
  const snapshot = latestSnapshot();
  const selected = dashboard?.selected?.();
  const watched = dashboard?.watched?.() ?? [];
  if (els.partition) els.partition.textContent = snapshot?.partition ?? '—';
  if (els.tick) els.tick.textContent = Number.isSafeInteger(snapshot?.tick) ? snapshot.tick.toLocaleString() : '—';
  if (els.sequence) els.sequence.textContent = Number.isSafeInteger(snapshot?.sequence) ? snapshot.sequence.toLocaleString() : '—';
  if (els.snapshot) els.snapshot.textContent = snapshot?.snapshotId ?? '—';
  if (els.selected) els.selected.textContent = selected?.kind === 'entity' ? selected.id : '—';
  if (els.watches) els.watches.textContent = watched.length.toLocaleString();
  if (els.note) els.note.textContent = recentChanges.length
    ? `${recentChanges.length} recent canonical change${recentChanges.length === 1 ? '' : 's'} kept in this browser session.`
    : 'Waiting for canonical snapshot/delta evidence.';
  renderChanges();
  renderDiff();
}

function acceptSnapshot(snapshot) {
  if (!snapshot?.partition || !Number.isSafeInteger(snapshot.tick) || !Number.isSafeInteger(snapshot.sequence)) {
    return { ok: false, reason: 'INVALID_SNAPSHOT' };
  }
  snapshots.set(snapshot.partition, Object.freeze({
    partition: snapshot.partition,
    tick: snapshot.tick,
    sequence: snapshot.sequence,
    snapshotId: snapshot.snapshotId ?? null,
    entityCount: Array.isArray(snapshot.entities) ? snapshot.entities.length : 0,
  }));
  render();
  return { ok: true };
}

function acceptDelta(packet) {
  if (!packet?.partition || !Array.isArray(packet.changes)) return { ok: false, reason: 'INVALID_DELTA' };
  snapshots.set(packet.partition, Object.freeze({
    partition: packet.partition,
    tick: packet.tick,
    sequence: packet.sequence,
    snapshotId: snapshots.get(packet.partition)?.snapshotId ?? null,
    entityCount: snapshots.get(packet.partition)?.entityCount ?? null,
  }));
  for (const change of [...packet.changes].reverse()) recentChanges.unshift(Object.freeze({ ...change }));
  if (recentChanges.length > MAX_CHANGES) recentChanges.length = MAX_CHANGES;
  render();
  return { ok: true };
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
  recentChanges: () => [...recentChanges],
});
