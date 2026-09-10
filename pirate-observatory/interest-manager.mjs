function entityAllowed(entity, includeTypes) {
  if (!entity) return false;
  if (!includeTypes || includeTypes.size === 0) return true;
  return includeTypes.has(entity.type) || includeTypes.has(entity.kind);
}

export function createInterestSet({
  spatialIndex,
  entities,
  viewport,
  partition = 'world',
  selectedId = null,
  watchedIds = [],
  includeTypes = null,
  maxEntities = 500,
}) {
  if (!spatialIndex?.queryBounds) throw new TypeError('spatialIndex.queryBounds is required');
  if (!(entities instanceof Map)) throw new TypeError('entities must be a Map');
  if (!Number.isSafeInteger(maxEntities) || maxEntities < 1) throw new TypeError('maxEntities must be a positive safe integer');

  const selected = new Set();
  const pushPriority = id => {
    const entity = entities.get(id);
    if (entity && entityAllowed(entity, includeTypes)) selected.add(id);
  };

  if (selectedId) pushPriority(selectedId);
  for (const id of watchedIds) pushPriority(id);
  if (selected.size >= maxEntities) return new Set([...selected].slice(0, maxEntities));

  const visibleIds = [...spatialIndex.queryBounds({ partition, ...viewport })];
  const centerX = (viewport.minX + viewport.maxX) / 2;
  const centerZ = (viewport.minZ + viewport.maxZ) / 2;
  visibleIds.sort((a, b) => {
    const ea = entities.get(a);
    const eb = entities.get(b);
    const da = ea ? ((ea.x - centerX) ** 2 + (ea.z - centerZ) ** 2) : Infinity;
    const db = eb ? ((eb.x - centerX) ** 2 + (eb.z - centerZ) ** 2) : Infinity;
    return da - db;
  });

  for (const id of visibleIds) {
    if (selected.size >= maxEntities) break;
    pushPriority(id);
  }
  return selected;
}

export function lodForZoom(zoom) {
  if (!Number.isFinite(zoom)) return 0;
  if (zoom < 0.35) return 0;
  if (zoom < 0.7) return 1;
  if (zoom < 1.4) return 2;
  return 3;
}
