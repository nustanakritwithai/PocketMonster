import { CHANGE_TYPES } from './protocol.mjs';
import { ChangeJournal } from './change-journal.mjs';
import { CanonicalReadModel } from './read-model.mjs';
import { SpatialIndex } from './spatial-index.mjs';
import { buildDeltaPacket } from './delta-builder.mjs';
import { buildPartitionSnapshot } from './snapshot-builder.mjs';

export class PirateObservatoryRuntime {
  constructor({ journalRetention = 50000, cellSize = 256 } = {}) {
    this.journal = new ChangeJournal({ retention: journalRetention });
    this.readModel = new CanonicalReadModel();
    this.spatialIndex = new SpatialIndex({ cellSize });
  }

  commit(change) {
    const result = this.journal.append(change);
    if (!result.appended) return result;

    const event = result.event;
    this.readModel.apply(event);
    if (event.type === CHANGE_TYPES.DESPAWN) {
      this.spatialIndex.remove(event.entity);
    } else if (event.type === CHANGE_TYPES.SPAWN || event.type === CHANGE_TYPES.MOVE) {
      const entity = this.readModel.entities.get(event.entity);
      if (entity && Number.isFinite(entity.x) && Number.isFinite(entity.z)) this.spatialIndex.update(entity);
    }
    return result;
  }

  deltaAfter(partition, baseSequence) {
    if (!this.journal.canCatchUpFrom(partition, baseSequence)) {
      return { complete: false, reason: 'RESYNC_REQUIRED', packet: null };
    }
    const events = this.journal.afterPartition(partition, baseSequence);
    return { complete: true, packet: buildDeltaPacket({ partition, baseSequence, events }) };
  }

  snapshot(partition, entityIds = null) {
    return buildPartitionSnapshot({ readModel: this.readModel, partition, entityIds });
  }
}
