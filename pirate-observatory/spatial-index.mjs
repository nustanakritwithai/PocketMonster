export class SpatialIndex {
  constructor({ cellSize = 256 } = {}) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new TypeError('cellSize must be > 0');
    this.cellSize = cellSize;
    this.cells = new Map();
    this.entityCells = new Map();
    this.positions = new Map();
  }

  key(x, z, partition = 'world') {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${partition}:${cx}:${cz}`;
  }

  update(entity) {
    if (!entity?.id) throw new TypeError('entity.id is required');
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.z)) throw new TypeError('entity.x and entity.z must be finite numbers');
    const partition = entity.partition ?? 'world';
    const nextKey = this.key(entity.x, entity.z, partition);
    const previousKey = this.entityCells.get(entity.id);

    if (previousKey && previousKey !== nextKey) {
      const previousCell = this.cells.get(previousKey);
      previousCell?.delete(entity.id);
      if (previousCell?.size === 0) this.cells.delete(previousKey);
    }

    if (!this.cells.has(nextKey)) this.cells.set(nextKey, new Set());
    this.cells.get(nextKey).add(entity.id);
    this.entityCells.set(entity.id, nextKey);
    this.positions.set(entity.id, { x: entity.x, z: entity.z, partition });
  }

  remove(entityId) {
    const key = this.entityCells.get(entityId);
    if (key) {
      const cell = this.cells.get(key);
      cell?.delete(entityId);
      if (cell?.size === 0) this.cells.delete(key);
    }
    this.entityCells.delete(entityId);
    this.positions.delete(entityId);
  }

  queryBounds({ partition = 'world', minX, maxX, minZ, maxZ }) {
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) throw new TypeError('bounds must be finite numbers');
    const minCellX = Math.floor(minX / this.cellSize);
    const maxCellX = Math.floor(maxX / this.cellSize);
    const minCellZ = Math.floor(minZ / this.cellSize);
    const maxCellZ = Math.floor(maxZ / this.cellSize);
    const result = new Set();

    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
        const cell = this.cells.get(`${partition}:${cx}:${cz}`);
        if (!cell) continue;
        for (const id of cell) {
          const position = this.positions.get(id);
          if (!position) continue;
          if (position.x < minX || position.x > maxX || position.z < minZ || position.z > maxZ) continue;
          result.add(id);
        }
      }
    }
    return result;
  }
}
