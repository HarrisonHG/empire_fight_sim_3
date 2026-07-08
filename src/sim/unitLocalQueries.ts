import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  type FactionId,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import { queryEntitiesWithinRadiusInto, type SpatialGrid } from "./spatialGrid";
import type { UnitSummary } from "./unitSummary";
import type { WorldState } from "./types";

export type UnitLocalEntityFilter =
  | "all"
  | "sameUnit"
  | "otherUnit"
  | "sameFaction"
  | "otherFaction";

export function queryUnitLocalEntitiesInto(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
  out: number[],
  filter: UnitLocalEntityFilter = "all",
): number[] {
  const sourceFactionId = validateLocalQueryInputs(
    world,
    identityStore,
    grid,
    summary,
  );

  queryEntitiesWithinRadiusInto(
    grid,
    summary.centreX,
    summary.centreY,
    radius,
    out,
  );

  if (filter === "all") {
    return out;
  }

  filterLocalEntitiesInto(
    identityStore,
    summary.unitId,
    sourceFactionId,
    filter,
    out,
  );

  return out;
}

export function queryUnitLocalEntities(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
  filter: UnitLocalEntityFilter = "all",
): number[] {
  return queryUnitLocalEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    [],
    filter,
  );
}

export function querySameUnitEntitiesInto(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
  out: number[],
): number[] {
  return queryUnitLocalEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    out,
    "sameUnit",
  );
}

export function querySameUnitEntities(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
): number[] {
  return querySameUnitEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    [],
  );
}

export function queryOtherUnitEntitiesInto(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
  out: number[],
): number[] {
  return queryUnitLocalEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    out,
    "otherUnit",
  );
}

export function queryOtherUnitEntities(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
): number[] {
  return queryOtherUnitEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    [],
  );
}

export function querySameFactionEntitiesInto(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
  out: number[],
): number[] {
  return queryUnitLocalEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    out,
    "sameFaction",
  );
}

export function querySameFactionEntities(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
): number[] {
  return querySameFactionEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    [],
  );
}

export function queryOtherFactionEntitiesInto(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
  out: number[],
): number[] {
  return queryUnitLocalEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    out,
    "otherFaction",
  );
}

export function queryOtherFactionEntities(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
  radius: number,
): number[] {
  return queryOtherFactionEntitiesInto(
    world,
    identityStore,
    grid,
    summary,
    radius,
    [],
  );
}

function filterLocalEntitiesInto(
  identityStore: UnitIdentityStore,
  sourceUnitId: UnitId,
  sourceFactionId: FactionId,
  filter: UnitLocalEntityFilter,
  out: number[],
): void {
  let writeIndex = 0;

  for (let readIndex = 0; readIndex < out.length; readIndex += 1) {
    const entityId = out[readIndex]!;
    const entityUnitId = getUnitIdForEntity(identityStore, entityId);

    if (
      shouldKeepEntity(
        identityStore,
        sourceUnitId,
        sourceFactionId,
        entityUnitId,
        filter,
      )
    ) {
      out[writeIndex] = entityId;
      writeIndex += 1;
    }
  }

  out.length = writeIndex;
}

function shouldKeepEntity(
  identityStore: UnitIdentityStore,
  sourceUnitId: UnitId,
  sourceFactionId: FactionId,
  entityUnitId: UnitId,
  filter: UnitLocalEntityFilter,
): boolean {
  if (filter === "sameUnit") {
    return entityUnitId === sourceUnitId;
  }

  if (filter === "otherUnit") {
    return entityUnitId !== sourceUnitId;
  }

  const entityFactionId = getFactionIdForUnit(identityStore, entityUnitId);

  if (filter === "sameFaction") {
    return entityFactionId === sourceFactionId;
  }

  if (filter === "otherFaction") {
    return entityFactionId !== sourceFactionId;
  }

  return true;
}

function validateLocalQueryInputs(
  world: WorldState,
  identityStore: UnitIdentityStore,
  grid: SpatialGrid,
  summary: UnitSummary,
): FactionId {
  if (world.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "World entity count must match unit identity entity count.",
    );
  }

  if (grid.entityCount !== world.entityCount) {
    throw new RangeError(
      "Spatial grid must be built from the current world entity count.",
    );
  }

  if (
    grid.bounds.width !== world.bounds.width ||
    grid.bounds.height !== world.bounds.height
  ) {
    throw new RangeError("Spatial grid bounds must match world bounds.");
  }

  const factionId = getFactionIdForUnit(identityStore, summary.unitId);
  if (factionId !== summary.factionId) {
    throw new RangeError(
      "Unit summary faction must match unit identity data.",
    );
  }

  return factionId;
}
