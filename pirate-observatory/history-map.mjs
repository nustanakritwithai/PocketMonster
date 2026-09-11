import { PIRATE_FRUIT_ISLAND_CENTERS } from '../pirate-fruit-island-map-v900.mjs';
import { PIRATE_WORLD_VIEWBOX } from './map-interest.mjs';
import { buildHistoricalMapItems, historicalEntityTrail } from './history-map-model.mjs';

const ns = 'http://www.w3.org/2000/svg';
let previousSnapshot = null;
let dom = null;

function svg(tag, attrs = {}) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function ensureDom() {
  if (dom) return dom;
  const host = document.querySelector('.debug-history');
  if (!host) return null;

  let shell = document.getElementById('debugHistoryMapShell');
  if (!shell) {
    shell = document.createElement('div');
    shell.id = 'debugHistoryMapShell';
    shell.className = 'history-map-shell';

    const head = document.createElement('div');
    head.className = 'history-map-head';
    const label = document.createElement('strong');
    label.textContent = 'HISTORICAL MAP · DETACHED';
    const meta = document.createElement('span');
    meta.id = 'debugHistoryMapMeta';
    meta.textContent = 'NO HISTORICAL SNAPSHOT';
    head.append(label, meta);

    const map = svg('svg', {
      id: 'debugHistoryMap',
      class: 'history-map',
      viewBox: `${PIRATE_WORLD_VIEWBOX.x} ${PIRATE_WORLD_VIEWBOX.y} ${PIRATE_WORLD_VIEWBOX.width} ${PIRATE_WORLD_VIEWBOX.height}`,
      role: 'img',
      'aria-label': 'Detached historical Pirate world map',
    });
    map.append(
      svg('rect', {
        class: 'history-map-ocean',
        x: PIRATE_WORLD_VIEWBOX.x,
        y: PIRATE_WORLD_VIEWBOX.y,
        width: PIRATE_WORLD_VIEWBOX.width,
        height: PIRATE_WORLD_VIEWBOX.height,
      }),
      svg('g', { id: 'debugHistoryMapIslands' }),
      svg('g', { id: 'debugHistoryMapTrail' }),
      svg('g', { id: 'debugHistoryMapEntities' }),
    );
    shell.append(head, map);
    const summary = host.querySelector('.history-summary');
    host.insertBefore(shell, summary ?? host.querySelector('.history-entities'));
  }

  dom = {
    islands: document.getElementById('debugHistoryMapIslands'),
    trail: document.getElementById('debugHistoryMapTrail'),
    entities: document.getElementById('debugHistoryMapEntities'),
    meta: document.getElementById('debugHistoryMapMeta'),
  };
  renderIslands();
  return dom;
}

function renderIslands() {
  const els = dom;
  if (!els?.islands || els.islands.childNodes.length > 0) return;
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
  const els = ensureDom();
  if (!els) return;
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
    els.trail.append(
      svg('line', {
        class: 'history-map-trail-line',
        x1: trail.from.x,
        y1: trail.from.z,
        x2: trail.to.x,
        y2: trail.to.z,
      }),
      svg('circle', { class: 'history-map-trail-from', cx: trail.from.x, cy: trail.from.z, r: 3 }),
    );
  }

  if (els.meta) {
    els.meta.textContent = `TICK ${snapshot.tick} · SEQ #${snapshot.sequence} · LOD ${model.lod} · ${model.entityCount} ENTITIES`;
  }
  previousSnapshot = snapshot;
}

function clear() {
  const els = ensureDom();
  els?.entities?.replaceChildren();
  els?.trail?.replaceChildren();
  if (els?.meta) els.meta.textContent = 'NO HISTORICAL SNAPSHOT';
  previousSnapshot = null;
}

export const PirateObservatoryHistoryMap = Object.freeze({ render, clear });
