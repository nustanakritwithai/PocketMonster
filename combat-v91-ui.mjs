import { COMBAT_STAT_KEYS } from './combat-v91-contract.mjs';
import { combatClientProjection } from './combat-v91-client-store.mjs';

export const COMBAT_V91_UI_VERSION = 'combat-v91-ui/v1';
export const COMBAT_V91_STYLESHEET_HREF = './combat-v91.css';
export const COMBAT_V91_UI_MOUNT_POLICY = Object.freeze({
  shell: 'active_shell_container_only',
  standaloneDocument: false,
  iframeCreation: false,
  interactiveControls: false,
  stylesheetLoading: 'active_shell_managed',
});
export const COMBAT_STAT_LABELS = Object.freeze({
  hpMax: 'HP MAX',
  hpCurrent: 'HP',
  atk: 'ATK',
  def: 'DEF',
  spAtk: 'SP.ATK',
  spDef: 'SP.DEF',
  spd: 'SPD',
  accuracy: 'ACCURACY',
  crit: 'CRIT',
  evasion: 'EVASION',
  resistance: 'RESISTANCE',
  penetration: 'PENETRATION',
});

const RATIO_KEYS = new Set(['accuracy', 'crit', 'evasion', 'resistance', 'penetration']);

function result(ok, reason, detail = {}) {
  return Object.freeze({ ok, reason, ...detail });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function displayValue(key, value) {
  if (RATIO_KEYS.has(key)) return `${Math.round(value * 10_000) / 100}%`;
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function createCombatV91ViewModel(clientState, entityId, { statusProjection = null } = {}) {
  const projection = combatClientProjection(clientState, entityId);
  if (!projection) return result(false, 'unknown_entity');
  const rows = COMBAT_STAT_KEYS.map(key => ({
    key,
    label: COMBAT_STAT_LABELS[key],
    base: projection.base[key],
    effective: projection.effective[key],
    pending: projection.stats[key],
    display: projection.stats[key],
    baseText: displayValue(key, projection.base[key]),
    effectiveText: displayValue(key, projection.effective[key]),
    pendingText: displayValue(key, projection.stats[key]),
    displayText: displayValue(key, projection.stats[key]),
    changedByEffective: projection.base[key] !== projection.effective[key],
    changedByPending: projection.effective[key] !== projection.stats[key],
  }));
  const statuses = Array.isArray(statusProjection?.descriptors)
    ? statusProjection.descriptors.map(descriptor => ({
      statusId: descriptor.statusId,
      name: descriptor.nameTH || descriptor.nameEN || descriptor.statusId,
      glyph: descriptor.glyph || '•',
      stacks: descriptor.stacks,
      remainingText: descriptor.remainingText,
      polarity: descriptor.polarity,
    }))
    : [];
  return result(true, null, {
    viewModel: deepFreeze({
      version: COMBAT_V91_UI_VERSION,
      entityId,
      authority: 'read_only_projection',
      mountPolicy: COMBAT_V91_UI_MOUNT_POLICY,
      effectiveSource: projection.effectiveSource,
      rows,
      pending: {
        count: projection.pending.count,
        damage: projection.pending.damage,
        countText: String(projection.pending.count),
        damageText: displayValue('hpCurrent', projection.pending.damage),
        intentIds: [...projection.pending.intentIds],
      },
      statuses,
    }),
  });
}

export function combatV91PanelText(viewModel) {
  if (!viewModel || viewModel.version !== COMBAT_V91_UI_VERSION) return '';
  const lines = [`Combat V9.1 · ${viewModel.entityId}`];
  for (const row of viewModel.rows) {
    lines.push(`${row.label}: BASE ${row.baseText} · EFFECTIVE ${row.effectiveText} · PENDING ${row.pendingText}`);
  }
  lines.push(`PENDING: ${viewModel.pending.countText} / -${viewModel.pending.damageText} HP`);
  for (const status of viewModel.statuses) {
    lines.push(`${status.glyph} ${status.name} x${status.stacks} ${status.remainingText}s`);
  }
  return lines.join('\n');
}

export function renderCombatV91Panel(container, viewModel) {
  const documentRef = container?.ownerDocument;
  if (!documentRef || typeof documentRef.createElement !== 'function'
    || typeof container.replaceChildren !== 'function'
    || !viewModel || viewModel.version !== COMBAT_V91_UI_VERSION) return false;
  const panel = documentRef.createElement('section');
  panel.className = 'combat-v91-panel';
  panel.dataset.entityId = viewModel.entityId;
  panel.dataset.authority = viewModel.authority;
  panel.dataset.mount = COMBAT_V91_UI_MOUNT_POLICY.shell;
  panel.setAttribute('aria-label', `Combat V9.1 stats for ${viewModel.entityId}`);
  const heading = documentRef.createElement('h3');
  heading.className = 'combat-v91-heading';
  heading.textContent = `Combat V9.1 · ${viewModel.entityId}`;
  panel.append(heading);

  const pendingSummary = documentRef.createElement('p');
  pendingSummary.className = 'combat-v91-pending-summary';
  pendingSummary.dataset.pending = String(viewModel.pending.count > 0);
  pendingSummary.setAttribute('role', 'status');
  pendingSummary.setAttribute('aria-live', 'polite');
  const pendingCount = documentRef.createElement('span');
  pendingCount.className = 'combat-v91-pending-count';
  pendingCount.textContent = `Pending ${viewModel.pending.countText}`;
  const pendingDamage = documentRef.createElement('span');
  pendingDamage.className = 'combat-v91-pending-damage';
  pendingDamage.textContent = `Damage -${viewModel.pending.damageText} HP`;
  pendingSummary.append(pendingCount, pendingDamage);
  panel.append(pendingSummary);

  const statList = documentRef.createElement('dl');
  statList.className = 'combat-v91-stat-list';
  for (const row of viewModel.rows) {
    const label = documentRef.createElement('dt');
    label.className = 'combat-v91-stat-label';
    label.textContent = row.label;
    const value = documentRef.createElement('dd');
    value.className = 'combat-v91-stat-values';
    value.dataset.base = row.baseText;
    value.dataset.effective = row.effectiveText;
    value.dataset.pending = row.pendingText;
    for (const [layer, text] of [
      ['base', row.baseText],
      ['effective', row.effectiveText],
      ['pending', row.pendingText],
    ]) {
      const group = documentRef.createElement('span');
      group.className = `combat-v91-stat-value combat-v91-stat-${layer}`;
      group.dataset.layer = layer;
      const layerLabel = documentRef.createElement('small');
      layerLabel.textContent = layer.toUpperCase();
      const layerValue = documentRef.createElement('span');
      layerValue.textContent = text;
      group.append(layerLabel, layerValue);
      value.append(group);
    }
    statList.append(label, value);
  }
  panel.append(statList);
  if (viewModel.statuses.length > 0) {
    const statusList = documentRef.createElement('ul');
    statusList.className = 'combat-v91-statuses';
    statusList.setAttribute('aria-label', 'Combat statuses');
    for (const status of viewModel.statuses) {
      const item = documentRef.createElement('li');
      item.textContent = `${status.glyph} ${status.name} x${status.stacks} ${status.remainingText}s`;
      item.dataset.statusId = status.statusId;
      item.dataset.polarity = status.polarity;
      statusList.append(item);
    }
    panel.append(statusList);
  }
  container.replaceChildren(panel);
  return true;
}
