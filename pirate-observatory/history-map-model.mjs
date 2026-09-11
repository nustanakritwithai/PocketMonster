import { PIRATE_WORLD_VIEWBOX, buildMapRenderItems } from './map-interest.mjs';

export function buildHistoricalMapItems(snapshot, {
  selectedId = null,
  viewBox = PIRATE_WORLD_VIEWBOX,
  maxDetailedEntities = 80,
} = {}) {
  const entities = Array.isArray(snapshot?.entities)
    ? snapshot.entities.filter(entity => entity?.id && Number.isFinite(entity.x) && Number.isFinite(entity.z))
    : [];
  const selected = selectedId ? entities.find(entity => entity.id === selectedId) ?? null : null;
  const remaining = selected ? entities.filter(entity => entity.id !== selected.id) : entities;

  const lod = remaining.length <= maxDetailedEntities ? 2 : remaining.length <= maxDetailedEntities * 2 ? 1 : 0;
  const items = buildMapRenderItems(remaining, { lod, viewBox });
  if (selected) items.push(Object.freeze({ kind: 'entity', entity: selected, selected: true }));
  return Object.freeze({
    lod,
    entityCount: entities.length,
    selectedFound: selected !== null,
    items: Object.freeze(items),
  });
}

export function historicalEntityTrail(previousSnapshot, currentSnapshot, entityId) {
  if (!entityId) return null;
  const before = Array.isArray(previousSnapshot?.entities)
    ? previousSnapshot.entities.find(entity => entity?.id === entityId) ?? null
    : null;
  const after = Array.isArray(currentSnapshot?.entities)
    ? currentSnapshot.entities.find(entity => entity?.id === entityId) ?? null
    : null;
  if (!before || !after || ![before.x, before.z, after.x, after.z].every(Number.isFinite)) return null;
  if (before.x === after.x && before.z === after.z) return null;
  return Object.freeze({
    entityId,
    from: Object.freeze({ x: before.x, z: before.z }),
    to: Object.freeze({ x: after.x, z: after.z }),
  });
}
