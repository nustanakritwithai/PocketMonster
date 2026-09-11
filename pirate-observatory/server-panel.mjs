import { PIRATE_OBSERVATORY_SCHEMA_VERSION } from './protocol.mjs';

const els = {
  state: document.getElementById('serverHealthState'),
  worldState: document.getElementById('serverWorldHealthStatus'),
  mode: document.getElementById('serverHealthMode'),
  source: document.getElementById('serverHealthSource'),
  partition: document.getElementById('serverHealthPartition'),
  tick: document.getElementById('serverHealthTick'),
  latest: document.getElementById('serverHealthLatest'),
  oldest: document.getElementById('serverHealthOldest'),
  retained: document.getElementById('serverHealthRetained'),
  capacity: document.getElementById('serverHealthCapacity'),
  utilization: document.getElementById('serverHealthUtilization'),
  utilizationBar: document.getElementById('serverHealthUtilizationBar'),
  entities: document.getElementById('serverHealthEntities'),
  generated: document.getElementById('serverHealthGenerated'),
  notice: document.getElementById('serverHealthNotice'),
  issues: document.getElementById('serverWorldHealthIssues'),
};

let lastHealth = null;
let lastWorldHealth = null;
let lastSource = '—';

function safeInt(value, fallback = '—') {
  return Number.isSafeInteger(value) ? value.toLocaleString() : fallback;
}

function formatTime(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderIssues() {
  if (els.worldState) {
    const status = lastWorldHealth?.status ?? null;
    els.worldState.textContent = status ? status.toUpperCase() : 'NO DATA';
    els.worldState.dataset.tone = status === 'ok' ? 'ok' : status === 'critical' ? 'danger' : status === 'warning' ? 'warn' : 'muted';
  }

  if (els.issues) {
    els.issues.replaceChildren();
    if (!lastWorldHealth) {
      const empty = document.createElement('div');
      empty.className = 'health-issue health-issue-empty';
      empty.textContent = 'Awaiting server-owned World Health evaluation.';
      els.issues.append(empty);
    } else if (lastWorldHealth.issueCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'health-issue health-issue-ok';
      empty.textContent = 'No evidence-based Observatory issues.';
      els.issues.append(empty);
    } else {
      for (const issue of lastWorldHealth.issues ?? []) {
        const item = document.createElement('div');
        item.className = 'health-issue';
        item.dataset.tone = issue.severity === 'critical' ? 'danger' : 'warn';
        const code = document.createElement('strong');
        code.textContent = issue.code;
        const message = document.createElement('span');
        message.textContent = issue.message;
        item.append(code, message);
        els.issues.append(item);
      }
    }
  }

  if (els.notice) {
    if (!lastWorldHealth) {
      els.notice.textContent = 'Awaiting authenticated World Health data.';
      els.notice.dataset.tone = 'muted';
    } else if (lastWorldHealth.issueCount === 0) {
      els.notice.textContent = 'Canonical Observatory health evaluator reports no current issues.';
      els.notice.dataset.tone = 'ok';
    } else {
      els.notice.textContent = `${lastWorldHealth.issueCount} evidence-based issue${lastWorldHealth.issueCount === 1 ? '' : 's'} reported by the server evaluator.`;
      els.notice.dataset.tone = lastWorldHealth.status === 'critical' ? 'danger' : 'warn';
    }
  }
}

function render() {
  const health = lastHealth;
  const ready = health?.ready === true;
  if (els.state) {
    els.state.textContent = health ? (ready ? '● READY' : '↻ WAITING AUTHORITY') : '○ NO DATA';
    els.state.dataset.tone = health ? (ready ? 'ok' : 'warn') : 'muted';
  }
  if (els.mode) els.mode.textContent = health?.mode ?? '—';
  if (els.source) els.source.textContent = lastSource;
  if (els.partition) els.partition.textContent = health?.partition ?? '—';
  if (els.tick) els.tick.textContent = health?.lastObservedTick >= 0 ? safeInt(health.lastObservedTick) : '—';
  if (els.latest) els.latest.textContent = safeInt(health?.latestSequence);
  if (els.oldest) els.oldest.textContent = safeInt(health?.oldestRetainedSequence);
  if (els.retained) els.retained.textContent = safeInt(health?.retainedEvents);
  if (els.capacity) els.capacity.textContent = safeInt(health?.retentionCapacity);
  if (els.entities) els.entities.textContent = safeInt(health?.entityCount);
  if (els.generated) els.generated.textContent = formatTime(health?.generatedAt);

  const utilization = Number.isFinite(health?.journalUtilization)
    ? Math.max(0, Math.min(1, health.journalUtilization))
    : 0;
  if (els.utilization) els.utilization.textContent = health ? `${(utilization * 100).toFixed(1)}%` : '—';
  if (els.utilizationBar) {
    els.utilizationBar.style.width = `${utilization * 100}%`;
    els.utilizationBar.dataset.tone = lastWorldHealth?.status === 'critical'
      ? 'danger'
      : lastWorldHealth?.status === 'warning' ? 'warn' : 'ok';
  }
  renderIssues();
}

function acceptHealth(health, { source = 'rest' } = {}) {
  const valid = health?.schemaVersion === PIRATE_OBSERVATORY_SCHEMA_VERSION
    && typeof health.ready === 'boolean'
    && typeof health.partition === 'string' && health.partition.length > 0
    && Number.isSafeInteger(health.lastObservedTick) && health.lastObservedTick >= -1
    && Number.isSafeInteger(health.latestSequence) && health.latestSequence >= 0
    && Number.isSafeInteger(health.oldestRetainedSequence) && health.oldestRetainedSequence >= 0
    && Number.isInteger(health.retainedEvents) && health.retainedEvents >= 0
    && Number.isInteger(health.retentionCapacity) && health.retentionCapacity > 0
    && Number.isFinite(health.journalUtilization) && health.journalUtilization >= 0 && health.journalUtilization <= 1
    && Number.isInteger(health.entityCount) && health.entityCount >= 0;
  if (!valid) return { ok: false, reason: 'INVALID_HEALTH_RESPONSE' };
  lastHealth = Object.freeze({ ...health });
  lastSource = source;
  render();
  return { ok: true };
}

function acceptWorldHealth(worldHealth, { source = 'server' } = {}) {
  const valid = worldHealth?.schemaVersion === PIRATE_OBSERVATORY_SCHEMA_VERSION
    && typeof worldHealth.partition === 'string' && worldHealth.partition.length > 0
    && Number.isSafeInteger(worldHealth.tick) && worldHealth.tick >= 0
    && Number.isSafeInteger(worldHealth.sequence) && worldHealth.sequence >= 0
    && ['ok', 'warning', 'critical'].includes(worldHealth.status)
    && Number.isInteger(worldHealth.issueCount) && worldHealth.issueCount >= 0
    && Array.isArray(worldHealth.issues) && worldHealth.issues.length === worldHealth.issueCount;
  if (!valid) return { ok: false, reason: 'INVALID_WORLD_HEALTH_RESPONSE' };
  lastWorldHealth = Object.freeze({ ...worldHealth, issues: Object.freeze([...worldHealth.issues]) });
  if (source === 'websocket') lastSource = 'websocket';
  render();
  return { ok: true };
}

function clear(reason = null) {
  lastHealth = null;
  lastWorldHealth = null;
  lastSource = reason ?? '—';
  render();
}

render();

export const PirateObservatoryServerPanel = Object.freeze({
  acceptHealth,
  acceptWorldHealth,
  clear,
  current: () => lastHealth,
  currentWorldHealth: () => lastWorldHealth,
});
