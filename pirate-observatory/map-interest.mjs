export const PIRATE_WORLD_VIEWBOX = Object.freeze({ x: -110, y: -160, width: 730, height: 760 });

export function normalizeViewBox(value, bounds = PIRATE_WORLD_VIEWBOX) {
  const source = value ?? bounds;
  let width = Number(source.width);
  let height = Number(source.height);
  let x = Number(source.x);
  let y = Number(source.y);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return { ...bounds };
  }

  width = Math.min(bounds.width, Math.max(70, width));
  height = Math.min(bounds.height, Math.max(70 * (bounds.height / bounds.width), height));
  x = Math.min(bounds.x + bounds.width - width, Math.max(bounds.x, x));
  y = Math.min(bounds.y + bounds.height - height, Math.max(bounds.y, y));
  return { x, y, width, height };
}

export function zoomForViewBox(viewBox, base = PIRATE_WORLD_VIEWBOX) {
  const view = normalizeViewBox(viewBox, base);
  return base.width / view.width;
}

export function lodForSemanticZoom(zoom) {
  if (!Number.isFinite(zoom) || zoom < 1.75) return 0;
  if (zoom < 3.5) return 1;
  if (zoom < 7) return 2;
  return 3;
}

export function wireZoomForSemanticZoom(zoom) {
  if (!Number.isFinite(zoom) || zoom <= 0) return 0.3;
  return zoom * 0.3;
}

export function entityBudgetForLod(lod) {
  if (lod <= 0) return 80;
  if (lod === 1) return 160;
  if (lod === 2) return 320;
  return 500;
}

export function viewportRequestFromViewBox(viewBox, {
  partition = 'pirate-fruit',
  selectedId = null,
  watchedIds = [],
  includeTypes = [],
  base = PIRATE_WORLD_VIEWBOX,
} = {}) {
  const view = normalizeViewBox(viewBox, base);
  const semanticZoom = zoomForViewBox(view, base);
  const lod = lodForSemanticZoom(semanticZoom);
  return Object.freeze({
    partition,
    viewport: Object.freeze({
      minX: view.x,
      maxX: view.x + view.width,
      minZ: view.y,
      maxZ: view.y + view.height,
    }),
    zoom: wireZoomForSemanticZoom(semanticZoom),
    semanticZoom,
    lod,
    selectedId,
    watchedIds: Object.freeze([...new Set(watchedIds.filter(Boolean))]),
    includeTypes: Object.freeze([...new Set(includeTypes.filter(Boolean))]),
    maxEntities: entityBudgetForLod(lod),
  });
}

function clusterKey(entity, size) {
  return `${entity.type ?? entity.kind ?? 'entity'}:${Math.floor(entity.x / size)}:${Math.floor(entity.z / size)}`;
}

export function buildMapRenderItems(entities, { lod = 3, viewBox = PIRATE_WORLD_VIEWBOX } = {}) {
  const source = Array.from(entities ?? []).filter(entity => entity?.id && Number.isFinite(entity.x) && Number.isFinite(entity.z));
  if (lod >= 2) return source.map(entity => Object.freeze({ kind: 'entity', entity }));

  const view = normalizeViewBox(viewBox);
  const grid = lod === 0 ? Math.max(55, view.width / 7) : Math.max(30, view.width / 10);
  const groups = new Map();
  for (const entity of source) {
    const key = clusterKey(entity, grid);
    let cluster = groups.get(key);
    if (!cluster) {
      cluster = { kind: 'cluster', id: `cluster:${key}`, type: entity.type ?? entity.kind ?? 'entity', count: 0, x: 0, z: 0, members: [] };
      groups.set(key, cluster);
    }
    cluster.count += 1;
    cluster.x += entity.x;
    cluster.z += entity.z;
    if (cluster.members.length < 8) cluster.members.push(entity.id);
  }

  return [...groups.values()].map(cluster => Object.freeze({
    ...cluster,
    x: cluster.x / cluster.count,
    z: cluster.z / cluster.count,
    members: Object.freeze(cluster.members),
  }));
}

export function zoomViewBoxAt(viewBox, factor, anchorX, anchorY, bounds = PIRATE_WORLD_VIEWBOX) {
  const current = normalizeViewBox(viewBox, bounds);
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const nextWidth = current.width / safeFactor;
  const nextHeight = current.height / safeFactor;
  const ratioX = current.width > 0 ? (anchorX - current.x) / current.width : .5;
  const ratioY = current.height > 0 ? (anchorY - current.y) / current.height : .5;
  return normalizeViewBox({
    x: anchorX - nextWidth * ratioX,
    y: anchorY - nextHeight * ratioY,
    width: nextWidth,
    height: nextHeight,
  }, bounds);
}

export function panViewBox(viewBox, dx, dy, bounds = PIRATE_WORLD_VIEWBOX) {
  const current = normalizeViewBox(viewBox, bounds);
  return normalizeViewBox({ ...current, x: current.x + dx, y: current.y + dy }, bounds);
}
