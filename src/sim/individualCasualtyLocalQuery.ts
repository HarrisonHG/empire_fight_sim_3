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

interface InternalIndividualCasualtyLocalQueryStore
  extends IndividualCasualtyLocalQueryStore {
  readonly grid: SpatialGrid;
  readonly candidateScratch: number[];
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
  } as InternalIndividualCasualtyLocalQueryStore;
}

/**
 * Dedicated casualty discovery boundary. Results contain only non-active
 * characters and remain in canonical entity-ID order.
 */
export function queryIndividualCasualtiesWithinRadiusInto(
  world: WorldState,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  store: IndividualCasualtyLocalQueryStore,
  x: number,
  y: number,
  radius: number,
  out: number[] = [],
): number[] {
  const internal = store as InternalIndividualCasualtyLocalQueryStore;
  if (
    world.entityCount !== internal.entityCount ||
    lifecycleStore.entityCount !== internal.entityCount
  ) {
    throw new RangeError(
      "Casualty local query dependencies must match entity count.",
    );
  }
  buildSpatialGrid(internal.grid, world, (entityId) =>
    getIndividualCharacterLifecycleState(lifecycleStore, entityId) !== "active",
  );
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
