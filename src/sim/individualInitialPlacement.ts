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

const MAXIMUM_LOCAL_PLACEMENT_ADJUSTMENT = 128;

export interface IndividualInitialPlacementEvidence {
  readonly hardStandingParticipantCount: number;
  readonly illegalHardStandingOverlapCount: number;
  readonly localQueryCount: number;
  readonly localCandidateCount: number;
  readonly firstOverlapLeftEntityId: number;
  readonly firstOverlapRightEntityId: number;
}

/**
 * Setup-only deterministic legal placement. The authored coordinate remains
 * preferred; adjustment chooses the nearest legal integer coordinate with
 * stable y-then-x tie-breaking. Runtime collision has no such authority.
 */
export function findLegalInitialStandingCoordinate(
  world: WorldState,
  placedEntityCount: number,
  zone: Readonly<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>,
  preferredX: number,
  preferredY: number,
  minimumSeparation: number,
): { readonly x: number; readonly y: number } {
  let bestX = -1;
  let bestY = -1;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let y = zone.minY; y <= zone.maxY; y += 1) {
    for (let x = zone.minX; x <= zone.maxX; x += 1) {
      if (!isLegalInitialStandingCoordinate(
        world, placedEntityCount, x, y, minimumSeparation,
      )) continue;
      const distanceSquared = squaredDistance(x, y, preferredX, preferredY);
      if (distanceSquared < bestDistanceSquared) {
        bestX = x;
        bestY = y;
        bestDistanceSquared = distanceSquared;
      }
    }
  }
  if (bestX >= 0) return { x: bestX, y: bestY };

  for (let radius = 1;
    radius <= MAXIMUM_LOCAL_PLACEMENT_ADJUSTMENT;
    radius += 1) {
    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        if (absolute(xOffset) !== radius && absolute(yOffset) !== radius) continue;
        const distanceSquared = xOffset * xOffset + yOffset * yOffset;
        if (distanceSquared >= bestDistanceSquared) continue;
        const x = preferredX + xOffset;
        const y = preferredY + yOffset;
        if (x < 0 || y < 0 || x >= world.bounds.width ||
            y >= world.bounds.height ||
            !isLegalInitialStandingCoordinate(
              world, placedEntityCount, x, y, minimumSeparation,
            )) continue;
        bestX = x;
        bestY = y;
        bestDistanceSquared = distanceSquared;
      }
    }
    if ((radius + 1) * (radius + 1) > bestDistanceSquared) {
      return { x: bestX, y: bestY };
    }
  }
  throw new Error("Authored deployment zone cannot provide legal standing space.");
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

function isLegalInitialStandingCoordinate(
  world: WorldState,
  placedEntityCount: number,
  x: number,
  y: number,
  minimumSeparation: number,
): boolean {
  const minimumSquared = minimumSeparation * minimumSeparation;
  for (let otherId = 0; otherId < placedEntityCount; otherId += 1) {
    const deltaX = world.positionsX[otherId]! - x;
    const deltaY = world.positionsY[otherId]! - y;
    if (deltaX * deltaX + deltaY * deltaY < minimumSquared) return false;
  }
  return true;
}

function squaredDistance(
  leftX: number,
  leftY: number,
  rightX: number,
  rightY: number,
): number {
  const deltaX = leftX - rightX;
  const deltaY = leftY - rightY;
  return deltaX * deltaX + deltaY * deltaY;
}

function absolute(value: number): number {
  return value < 0 ? -value : value;
}
