import {
  getUnitAnchor,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import { LOCAL_HOSTILE_THREAT_RADIUS } from "./moraleMovement";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import type { WorldState } from "./types";
import {
  isIndividualCharacterActive,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";
import {
  isIndividualOrdinaryParticipationEligible,
  type IndividualOrdinaryParticipationSnapshot,
} from "./individualOrdinaryParticipation";

export interface UnitRecoveryThreatSummary {
  readonly unitId: UnitId;
  readonly hostileNearby: boolean;
}

export interface RecoveryThreatStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

interface InternalRecoveryThreatStore extends RecoveryThreatStore {
  readonly grid: SpatialGrid;
  readonly nearbyEntityIds: number[];
}

/**
 * Collects a compact local safety input for 4G. The shared 4E retreat range is
 * queried through the existing spatial grid; it does not compare all units.
 */
export function createRecoveryThreatStore(
  identityStore: UnitIdentityStore,
  world: WorldState,
): RecoveryThreatStore {
  const store: InternalRecoveryThreatStore = {
    entityCount: identityStore.entityCount,
    unitCount: identityStore.unitCount,
    grid: createSpatialGrid({
      bounds: world.bounds,
      cellSize: LOCAL_HOSTILE_THREAT_RADIUS,
      capacity: identityStore.entityCount,
    }),
    nearbyEntityIds: [],
  };
  return store;
}

export function collectRecoveryThreatSummaries(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: RecoveryThreatStore,
  out: UnitRecoveryThreatSummary[] = [],
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): readonly UnitRecoveryThreatSummary[] {
  const internal = asInternal(store);
  if (
    internal.entityCount !== identityStore.entityCount ||
    internal.unitCount !== identityStore.unitCount ||
    formationStore.entityCount !== identityStore.entityCount ||
    formationStore.unitCount !== identityStore.unitCount
  ) {
    throw new RangeError("Recovery threat stores must match unit identity.");
  }

  buildSpatialGrid(internal.grid, world, (entityId) =>
    (lifecycleStore === undefined ||
      isIndividualCharacterActive(lifecycleStore, entityId)) &&
    isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId),
  );
  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    if (
      lifecycleStore !== undefined &&
      !getUnitMembers(identityStore, unitId).some((entityId) =>
        isIndividualCharacterActive(lifecycleStore, entityId) &&
        isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId),
      )
    ) {
      out.push({ unitId, hostileNearby: false });
      continue;
    }
    const anchor = getUnitAnchor(formationStore, unitId);
    const nearbyEntityIds = queryEntitiesWithinRadiusInto(
      internal.grid,
      anchor.x,
      anchor.y,
      LOCAL_HOSTILE_THREAT_RADIUS,
      internal.nearbyEntityIds,
    );
    const factionId = getFactionIdForUnit(identityStore, unitId);
    let hostileNearby = false;
    for (let entityIndex = 0; entityIndex < nearbyEntityIds.length; entityIndex += 1) {
      const candidateUnitId = getUnitIdForEntity(
        identityStore,
        nearbyEntityIds[entityIndex]!,
      );
      if (getFactionIdForUnit(identityStore, candidateUnitId) !== factionId) {
        hostileNearby = true;
        break;
      }
    }
    out.push({ unitId, hostileNearby });
  }
  return out;
}

function asInternal(store: RecoveryThreatStore): InternalRecoveryThreatStore {
  return store as InternalRecoveryThreatStore;
}
