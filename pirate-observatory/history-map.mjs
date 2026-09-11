import { PIRATE_FRUIT_ISLAND_CENTERS } from '../pirate-fruit-island-map-v900.mjs';
import { buildHistoricalMapItems, historicalEntityTrail } from './history-map-model.mjs';

const ns = 'http://www.w3.org/2000/svg';
const els = {
  islands: document.getElementById('debugHistoryMapIslands'),
  trail: document.getElementById('debugHistoryMapTrail'),
  entities: document.getElementById('debugHistoryMapEntities'),
  meta: document.getElementById('debugHistoryMapMeta'),
};
let previousSnapshot = null;

function svg(tag, attrs = {}) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function renderIslands() {
  if (!els.islands || els.islands.childNodes.length > 0) return;
  for (const [id, island] of Object.entries(PIRATE_FRUIT_ISLAND_CENTERS)) {
    const radius = Math.max(10, island.radius * .38);
    const group = svg('g', { class: 'history-map-island', 'data-id': id });
    group.append(svg('circle', { cx: island.x, cy: island.z, r: radius }));
    const label = svg('text', { x: island.x, y: island.z + radius + 12 });
    label.textContent = id.replaceAll('-', ' ');
    group.append(label);
    els.islands.append(group);
  }
}

function render(snapshot, { selectedId = null } = {}) {
  renderIslands();
  els.entities?.replaceChildren();
  els.trail?.replaceChildren();
  if (!snapshot) {
    if (els.meta) els.meta.textContent = 'NO HISTORICAL SNAPSHOT';
    previousSnapshot = null;
    return;
  }

  const model = buildHistoricalMapItems(snapshot, { selectedId });
  for (const item of model.items) {
    if (item.kind === 'cluster') {
      const group = svg('g', { class: 'history-map-cluster', 'data-kind': item.type });
      const radius = Math.min(15, 7 + Math.log2(Math.max(1, item.count)) * 2);
      group.append(svg('circle', { cx: item.x, cy: item.z, r: radius }));
      const count = svg('text', { x: item.x, y: item.z + 3 });
      count.textContent = String(item.count);
      group.append(count);
      els.entities?.append(group);
      continue;
    }

    const entity = item.entity;
    const group = svg('g', {
      class: `history-map-entity${item.selected ? ' is-selected' : ''}`,
      'data-kind': entity.type ?? 'entity',
      'data-id': entity.id,
    });
    group.append(svg('circle', { cx: entity.x, cy: entity.z, r: item.selected ? 6.5 : 4 }));
    if (item.selected) {
      const label = svg('text', { x: entity.x + 9, y: entity.z - 7 });
      label.textContent = entity.id;
      group.append(label);
    }
    els.entities?.append(group);
  }

  const trail = historicalEntityTrail(previousSnapshot, snapshot, selectedId);
  if (trail && els.trail) {
    const line = svg('line', {
      class: 'history-map-trail-line',
      x1: trail.from.x,
      y1: trail.from.z,
      x2: trail.to.x,
      y2: trail.to.z,
    });
    const from = svg('circle', { class: 'history-map-trail-from', cx: trail.from.x, cy: trail.from.z, r: 3 });
    els.trail.append(line, from);
  }

  if (els.meta) {
    els.meta.textContent = `TICK ${snapshot.tick} · SEQ #${snapshot.sequence} · LOD ${model.lod} · ${model.entityCount} ENTITIES`;
  }
  previousSnapshot = snapshot;
}

function clear() {
  els.entities?.replaceChildren();
  els.trail?.replaceChildren();
  if (els.meta) els.meta.textContent = 'NO HISTORICAL SNAPSHOT';
  previousSnapshot = null;
}

renderIslands();
clear();

export const PirateObservatoryHistoryMap = Object.freeze({ render, clear });
