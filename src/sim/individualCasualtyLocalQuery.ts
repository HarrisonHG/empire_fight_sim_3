import {
  getIndividualCharacterLifecycleState,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import type { SimulationBounds, WorldState } from "./types";

export interface IndividualCasualtyLocalQueryStore {
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
}

export function prepareIndividualCasualtyLocalQuery(
  world: WorldState,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  store: IndividualCasualtyLocalQueryStore,
): void {
  const internal = validateDependencies(world, lifecycleStore, store);
  buildSpatialGrid(internal.grid, world, (entityId) =>
    getIndividualCharacterLifecycleState(lifecycleStore, entityId) !== "active",
  );
  internal.prepared = true;
  internal.preparationCount += 1;
}

export function getIndividualCasualtyLocalQueryPreparationCount(
  store: IndividualCasualtyLocalQueryStore,
): number {
  return (store as InternalIndividualCasualtyLocalQueryStore).preparationCount;
}

interface InternalIndividualCasualtyLocalQueryStore
  extends IndividualCasualtyLocalQueryStore {
  readonly grid: SpatialGrid;
  readonly candidateScratch: number[];
  prepared: boolean;
  preparationCount: number;
}

const CASUALTY_QUERY_CELL_SIZE = 32;

export function createIndividualCasualtyLocalQueryStore(
  entityCount: number,
  bounds: SimulationBounds,
): IndividualCasualtyLocalQueryStore {
  if (!Number.isSafeInteger(entityCount) || entityCount <= 0) {
    throw new RangeError("entityCount must be a positive safe integer.");
  }
  return {
    entityCount,
    bounds: Object.freeze({ width: bounds.width, height: bounds.height }),
    grid: createSpatialGrid({
      bounds,
      cellSize: CASUALTY_QUERY_CELL_SIZE,
      capacity: entityCount,
    }),
    candidateScratch: [],
    prepared: false,
    preparationCount: 0,
  } as InternalIndividualCasualtyLocalQueryStore;
}

/**
 * Dedicated casualty discovery boundary. Results contain only non-active
 * characters and remain in canonical entity-ID order.
 */
export function queryIndividualCasualtiesWithinRadiusInto(
  store: IndividualCasualtyLocalQueryStore,
  x: number,
  y: number,
  radius: number,
  out: number[] = [],
): number[] {
  const internal = store as InternalIndividualCasualtyLocalQueryStore;
  if (!internal.prepared) {
    throw new Error("Casualty local query store must be prepared before querying.");
  }
  const candidates = queryEntitiesWithinRadiusInto(
    internal.grid,
    x,
    y,
    radius,
    internal.candidateScratch,
  );
  out.length = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    out.push(candidates[index]!);
  }
  return out;
}


function validateDependencies(
  world: WorldState,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  store: IndividualCasualtyLocalQueryStore,
): InternalIndividualCasualtyLocalQueryStore {
  const internal = store as InternalIndividualCasualtyLocalQueryStore;
  if (
    world.entityCount !== internal.entityCount ||
    lifecycleStore.entityCount !== internal.entityCount
  ) {
    throw new RangeError(
      "Casualty local query dependencies must match entity count.",
    );
  }
  return internal;
}
