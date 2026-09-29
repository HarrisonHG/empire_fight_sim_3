import {
  INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG,
  type IndividualPhysicalOccupancyStore,
} from "./individualPhysicalOccupancy";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryNearbyEntitiesInto,
} from "./spatialGrid";
import type { WorldState } from "./types";

export interface IndividualInitialPlacementEvidence {
  readonly hardStandingParticipantCount: number;
  readonly illegalHardStandingOverlapCount: number;
  readonly localQueryCount: number;
  readonly localCandidateCount: number;
  readonly firstOverlapLeftEntityId: number;
  readonly firstOverlapRightEntityId: number;
}

/** Setup-only validation; runtime collision never manufactures depenetration. */
export function validateIndividualInitialHardStandingPlacement(
  world: WorldState,
  occupancy: IndividualPhysicalOccupancyStore,
): IndividualInitialPlacementEvidence {
  if (world.entityCount !== occupancy.entityCount) {
    throw new RangeError("Initial-placement stores must share entityCount.");
  }
  const grid = createSpatialGrid({
    bounds: world.bounds,
    cellSize: 16,
    capacity: world.entityCount,
  });
  const hardStanding = (entityId: number): boolean =>
    (occupancy.occupancyFlags[entityId]! &
      INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.hardStanding) !== 0;
  buildSpatialGrid(grid, world, hardStanding);
  const nearby: number[] = [];
  let participantCount = 0;
  let overlapCount = 0;
  let localQueryCount = 0;
  let localCandidateCount = 0;
  let firstLeft = -1;
  let firstRight = -1;
  const maximumRadius = Math.max(
    occupancy.geometry.activeStandingRadius,
    occupancy.geometry.assistedMovingRadius,
    occupancy.geometry.yieldingEgressRadius,
  );
  for (let leftId = 0; leftId < world.entityCount; leftId += 1) {
    if (!hardStanding(leftId)) continue;
    participantCount += 1;
    const candidates = queryNearbyEntitiesInto(
      grid,
      world.positionsX[leftId]!,
      world.positionsY[leftId]!,
      occupancy.effectiveRadii[leftId]! + maximumRadius,
      nearby,
    );
    localQueryCount += 1;
    for (let index = 0; index < candidates.length; index += 1) {
      const rightId = candidates[index]!;
      if (rightId <= leftId || !hardStanding(rightId)) continue;
      localCandidateCount += 1;
      const deltaX = world.positionsX[rightId]! - world.positionsX[leftId]!;
      const deltaY = world.positionsY[rightId]! - world.positionsY[leftId]!;
      const minimum = occupancy.effectiveRadii[leftId]! +
        occupancy.effectiveRadii[rightId]!;
      if (deltaX * deltaX + deltaY * deltaY >= minimum * minimum) continue;
      overlapCount += 1;
      if (firstLeft < 0) {
        firstLeft = leftId;
        firstRight = rightId;
      }
    }
  }
  return Object.freeze({
    hardStandingParticipantCount: participantCount,
    illegalHardStandingOverlapCount: overlapCount,
    localQueryCount,
    localCandidateCount,
    firstOverlapLeftEntityId: firstLeft,
    firstOverlapRightEntityId: firstRight,
  });
}
