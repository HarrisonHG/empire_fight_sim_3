import {
  INDIVIDUAL_COLLISION_RELATIONSHIP,
  INDIVIDUAL_COLLISION_RESOLUTION_FLAG,
  recordIndividualCollisionResolvedStep,
  type IndividualCollisionResolutionStore,
} from "./individualCollisionResolution";
import {
  INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS,
  getIndividualPhysicalOccupancyProjectionTick,
  type IndividualPhysicalOccupancyStore,
} from "./individualPhysicalOccupancy";
import {
  getIndividualMovementRightOfWayProjectionTick,
  type IndividualMovementRightOfWayStore,
} from "./individualMovementRightOfWay";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryNearbyEntitiesInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  type UnitIdentityStore,
} from "./unitIdentity";
import type { WorldState } from "./types";

const CELL_SIZE = 16;
const MAX_QUERY_RADIUS = 32;
const MAX_UINT16 = 0xffff;

export interface IndividualSpecialistCollisionResult {
  readonly requestedCount: number;
  readonly movedCount: number;
  readonly blockedCount: number;
  readonly redirectedCount: number;
  readonly downedSoftAvoidanceCount: number;
  readonly downedSoftCrossingCount: number;
  readonly localQueryCount: number;
  readonly localCandidateCount: number;
}

export interface IndividualSpecialistCollisionResolver {
  readonly entityCount: number;
  readonly resolvedDeltaX: number;
  readonly resolvedDeltaY: number;
  readonly principalBlockerByEntity: Int32Array;
  readonly result: IndividualSpecialistCollisionResult;
  prepareForMovement(tick: number): void;
  resolveStep(
    entityId: number,
    permittedDeltaX: number,
    permittedDeltaY: number,
    softContactEntityId?: number,
  ): void;
}

interface InternalResolver extends IndividualSpecialistCollisionResolver {
  resolvedDeltaX: number;
  resolvedDeltaY: number;
  preparedTick: number;
  readonly grid: SpatialGrid;
  readonly nearby: number[];
  readonly result: MutableResult;
}

interface MutableResult {
  requestedCount: number;
  movedCount: number;
  blockedCount: number;
  redirectedCount: number;
  downedSoftAvoidanceCount: number;
  downedSoftCrossingCount: number;
  localQueryCount: number;
  localCandidateCount: number;
}

export function createIndividualSpecialistCollisionResolver(
  world: WorldState,
  identity: UnitIdentityStore,
  occupancy: IndividualPhysicalOccupancyStore,
  rightOfWay: IndividualMovementRightOfWayStore,
  collision: IndividualCollisionResolutionStore,
): IndividualSpecialistCollisionResolver {
  validateCounts(world.entityCount, identity, occupancy, rightOfWay, collision);
  const principalBlockerByEntity = new Int32Array(world.entityCount);
  principalBlockerByEntity.fill(-1);
  const result: MutableResult = {
    requestedCount: 0,
    movedCount: 0,
    blockedCount: 0,
    redirectedCount: 0,
    downedSoftAvoidanceCount: 0,
    downedSoftCrossingCount: 0,
    localQueryCount: 0,
    localCandidateCount: 0,
  };
  const resolver: InternalResolver = {
    entityCount: world.entityCount,
    resolvedDeltaX: 0,
    resolvedDeltaY: 0,
    principalBlockerByEntity,
    result,
    preparedTick: -1,
    grid: createSpatialGrid({
      bounds: world.bounds,
      cellSize: CELL_SIZE,
      capacity: world.entityCount,
    }),
    nearby: [],
    prepareForMovement(tick: number): void {
      if (getIndividualPhysicalOccupancyProjectionTick(occupancy) !== tick ||
          getIndividualMovementRightOfWayProjectionTick(rightOfWay) !== tick) {
        throw new Error("Specialist collision requires current occupancy and right-of-way.");
      }
      const newTick = resolver.preparedTick !== tick;
      buildSpatialGrid(resolver.grid, world, (entityId) =>
        occupancy.occupancyClassCodes[entityId] !==
          INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield,
      );
      resolver.preparedTick = tick;
      if (newTick) {
        resolver.principalBlockerByEntity.fill(-1);
        resetResult(result);
      }
    },
    resolveStep(entityId, permittedDeltaX, permittedDeltaY,
      softContactEntityId = -1): void {
      resolveSpecialistStep(
        resolver, world, identity, occupancy, rightOfWay, collision,
        entityId, permittedDeltaX, permittedDeltaY, softContactEntityId,
      );
    },
  };
  return resolver;
}

function resolveSpecialistStep(
  resolver: InternalResolver,
  world: WorldState,
  identity: UnitIdentityStore,
  occupancy: IndividualPhysicalOccupancyStore,
  rightOfWay: IndividualMovementRightOfWayStore,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  permittedDeltaX: number,
  permittedDeltaY: number,
  softContactEntityId: number,
): void {
  if (resolver.preparedTick < 0 ||
      getIndividualMovementRightOfWayProjectionTick(rightOfWay) !==
        resolver.preparedTick) {
    throw new Error("Specialist collision must be prepared before movement.");
  }
  assertEntity(entityId, resolver.entityCount);
  resolver.resolvedDeltaX = 0;
  resolver.resolvedDeltaY = 0;
  resolver.result.requestedCount += 1;
  const budgetSquared = permittedDeltaX * permittedDeltaX +
    permittedDeltaY * permittedDeltaY;
  const startX = world.positionsX[entityId]! - permittedDeltaX;
  const startY = world.positionsY[entityId]! - permittedDeltaY;
  if (budgetSquared === 0) {
    commit(resolver, collision, entityId, permittedDeltaX, permittedDeltaY,
      0, 0, INDIVIDUAL_COLLISION_RELATIONSHIP.none, false, false,
      resolver.result.localCandidateCount);
    return;
  }
  const radius = occupancy.effectiveRadii[entityId]!;
  const queryRadius = absolute(permittedDeltaX) + absolute(permittedDeltaY) +
    radius + maximumRadius(occupancy);
  if (queryRadius > MAX_QUERY_RADIUS) {
    throw new RangeError("Specialist movement exceeds bounded collision query radius.");
  }
  const nearby = queryNearbyEntitiesInto(
    resolver.grid,
    startX,
    startY,
    queryRadius,
    resolver.nearby,
  );
  resolver.result.localQueryCount += 1;
  collision.localNeighbourCounts[entityId] = Math.min(
    MAX_UINT16, Math.max(0, nearby.length - 1),
  );
  const candidateCountAtStart = resolver.result.localCandidateCount;

  let blocker = -1;
  let relationship: number = INDIVIDUAL_COLLISION_RELATIONSHIP.none;
  const softContactOnPermittedStep = softContactEntityId >= 0 &&
    occupancy.occupancyClassCodes[softContactEntityId] ===
      INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.downedSoft &&
    movementPairCollides(
      startX, startY,
      permittedDeltaX, permittedDeltaY,
      world.positionsX[softContactEntityId]!, world.positionsY[softContactEntityId]!,
      occupancy.effectiveRadii[entityId]! +
        occupancy.effectiveRadii[softContactEntityId]!,
    );
  if (candidateLegal(resolver, world, identity, occupancy, entityId,
    permittedDeltaX, permittedDeltaY, budgetSquared, nearby, false,
    softContactEntityId, startX, startY)) {
    commit(resolver, collision, entityId, permittedDeltaX, permittedDeltaY,
      permittedDeltaX, permittedDeltaY, relationship, false,
      softContactOnPermittedStep,
      candidateCountAtStart);
    return;
  }
  blocker = resolver.principalBlockerByEntity[entityId]!;
  relationship = blocker < 0 ? INDIVIDUAL_COLLISION_RELATIONSHIP.none
    : relationshipFor(occupancy.occupancyClassCodes[blocker]!);
  const forwardX = sign(permittedDeltaX);
  const forwardY = sign(permittedDeltaY);
  const side = preferredSide(
    world, entityId, blocker, forwardX, forwardY, startX, startY,
  );
  const lateralX = -forwardY * side;
  const lateralY = forwardX * side;
  const blockerIsSoft = blocker >= 0 &&
    occupancy.occupancyClassCodes[blocker] ===
      INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.downedSoft;
  const allied = blocker >= 0 &&
    faction(identity, entityId) === faction(identity, blocker);
  const lowerPriority = allied &&
    rightOfWay.classCodes[entityId]! < rightOfWay.classCodes[blocker]!;
  const alternativeCount = lowerPriority ? 1 : 5;
  for (let index = 0; index < alternativeCount; index += 1) {
    let deltaX: number;
    let deltaY: number;
    switch (index) {
      case 0:
        deltaX = forwardX + lateralX;
        deltaY = forwardY + lateralY;
        break;
      case 1:
        deltaX = forwardX - lateralX;
        deltaY = forwardY - lateralY;
        break;
      case 2:
        deltaX = lateralX;
        deltaY = lateralY;
        break;
      case 3:
        deltaX = -lateralX;
        deltaY = -lateralY;
        break;
      default:
        deltaX = forwardX;
        deltaY = forwardY;
        break;
    }
    if (!candidateLegal(resolver, world, identity, occupancy, entityId,
      deltaX, deltaY, budgetSquared, nearby, false, softContactEntityId,
      startX, startY)) continue;
    commit(resolver, collision, entityId, permittedDeltaX, permittedDeltaY,
      deltaX, deltaY, relationship, blockerIsSoft, false,
      candidateCountAtStart);
    return;
  }
  // Soft bodies are avoidable rather than walls. Hard bodies remain absolute.
  if (candidateLegal(resolver, world, identity, occupancy, entityId,
    forwardX, forwardY, budgetSquared, nearby, true, softContactEntityId,
    startX, startY)) {
    commit(resolver, collision, entityId, permittedDeltaX, permittedDeltaY,
      forwardX, forwardY, relationship, false, true, candidateCountAtStart);
    return;
  }
  commit(resolver, collision, entityId, permittedDeltaX, permittedDeltaY,
    0, 0, relationship, false, false, candidateCountAtStart);
}

function candidateLegal(
  resolver: InternalResolver,
  world: WorldState,
  identity: UnitIdentityStore,
  occupancy: IndividualPhysicalOccupancyStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
  nearby: readonly number[],
  allowSoftCrossing: boolean,
  softContactEntityId: number,
  startX: number,
  startY: number,
): boolean {
  if (deltaX === 0 && deltaY === 0 ||
      deltaX * deltaX + deltaY * deltaY > budgetSquared) return false;
  const finalX = startX + deltaX;
  const finalY = startY + deltaY;
  if (finalX < 0 || finalY < 0 || finalX >= world.bounds.width ||
      finalY >= world.bounds.height) return false;
  let blocker = -1;
  let blockerDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < nearby.length; index += 1) {
    const otherId = nearby[index]!;
    if (otherId === entityId) continue;
    const otherClass = occupancy.occupancyClassCodes[otherId]!;
    if (otherClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield ||
        otherClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress) {
      continue;
    }
    resolver.result.localCandidateCount += 1;
    const soft = otherClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.downedSoft;
    if (soft && (allowSoftCrossing || otherId === softContactEntityId)) continue;
    if (!movementPairCollides(startX, startY, deltaX, deltaY,
      world.positionsX[otherId]!, world.positionsY[otherId]!,
      occupancy.effectiveRadii[entityId]! + occupancy.effectiveRadii[otherId]!)) {
      continue;
    }
    // Social priority is applied by the caller after this physical query. It
    // never makes an occupied destination legal, and hostiles remain hard.
    void identity;
    const relativeX = world.positionsX[otherId]! - startX;
    const relativeY = world.positionsY[otherId]! - startY;
    const distance = relativeX * relativeX + relativeY * relativeY;
    if (distance < blockerDistance ||
        (distance === blockerDistance && (blocker < 0 || otherId < blocker))) {
      blocker = otherId;
      blockerDistance = distance;
    }
  }
  resolver.principalBlockerByEntity[entityId] = blocker;
  return blocker < 0;
}

function commit(
  resolver: InternalResolver,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  permittedDeltaX: number,
  permittedDeltaY: number,
  resolvedDeltaX: number,
  resolvedDeltaY: number,
  relationship: number,
  avoidedSoft: boolean,
  crossedSoft: boolean,
  candidateCountAtStart: number,
): void {
  resolver.resolvedDeltaX = resolvedDeltaX;
  resolver.resolvedDeltaY = resolvedDeltaY;
  recordIndividualCollisionResolvedStep(collision, entityId,
    permittedDeltaX, permittedDeltaY, resolvedDeltaX, resolvedDeltaY);
  collision.principalOccupancyRelationshipCodes[entityId] = relationship;
  collision.localCandidateCounts[entityId] = Math.min(
    MAX_UINT16, resolver.result.localCandidateCount - candidateCountAtStart,
  );
  if (avoidedSoft) {
    collision.resolutionFlags[entityId] = collision.resolutionFlags[entityId]! |
      INDIVIDUAL_COLLISION_RESOLUTION_FLAG.downedSoftAvoidance;
    resolver.result.downedSoftAvoidanceCount += 1;
  }
  if (crossedSoft) {
    collision.resolutionFlags[entityId] = collision.resolutionFlags[entityId]! |
      INDIVIDUAL_COLLISION_RESOLUTION_FLAG.downedSoftCrossing;
    resolver.result.downedSoftCrossingCount += 1;
  }
  if (resolvedDeltaX === 0 && resolvedDeltaY === 0) {
    resolver.result.blockedCount += 1;
  } else {
    resolver.result.movedCount += 1;
    if (resolvedDeltaX !== permittedDeltaX || resolvedDeltaY !== permittedDeltaY) {
      resolver.result.redirectedCount += 1;
    }
  }
}

function movementPairCollides(
  startX: number, startY: number, deltaX: number, deltaY: number,
  otherX: number, otherY: number, combinedRadius: number,
): boolean {
  const relativeStartX = otherX - startX;
  const relativeStartY = otherY - startY;
  const endX = relativeStartX - deltaX;
  const endY = relativeStartY - deltaY;
  const radiusSquared = combinedRadius * combinedRadius;
  const startDistance = relativeStartX * relativeStartX +
    relativeStartY * relativeStartY;
  const endDistance = endX * endX + endY * endY;
  if (startDistance < radiusSquared) return endDistance <= startDistance;
  if (endDistance < radiusSquared) return true;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const projection = relativeStartX * deltaX + relativeStartY * deltaY;
  if (projection <= 0 || projection >= lengthSquared) return false;
  const cross = relativeStartX * deltaY - relativeStartY * deltaX;
  return cross * cross < radiusSquared * lengthSquared;
}

function preferredSide(
  world: WorldState, entityId: number, blockerId: number,
  forwardX: number, forwardY: number,
  startX: number, startY: number,
): number {
  if (blockerId >= 0) {
    const relativeX = world.positionsX[blockerId]! - startX;
    const relativeY = world.positionsY[blockerId]! - startY;
    const cross = forwardX * relativeY - forwardY * relativeX;
    if (cross !== 0) return cross > 0 ? -1 : 1;
    return ((entityId + blockerId) & 1) === 0 ? 1 : -1;
  }
  return 1;
}

function relationshipFor(occupancyClass: number): number {
  if (occupancyClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.downedSoft) {
    return INDIVIDUAL_COLLISION_RELATIONSHIP.downedSoft;
  }
  if (occupancyClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.assistedMoving) {
    return INDIVIDUAL_COLLISION_RELATIONSHIP.assistedMoving;
  }
  return INDIVIDUAL_COLLISION_RELATIONSHIP.activeStanding;
}

function maximumRadius(occupancy: IndividualPhysicalOccupancyStore): number {
  return Math.max(occupancy.geometry.activeStandingRadius,
    occupancy.geometry.assistedMovingRadius, occupancy.geometry.downedSoftRadius,
    occupancy.geometry.yieldingEgressRadius);
}

function faction(identity: UnitIdentityStore, entityId: number): number {
  return getFactionIdForUnit(identity, getUnitIdForEntity(identity, entityId));
}

function resetResult(result: MutableResult): void {
  result.requestedCount = 0;
  result.movedCount = 0;
  result.blockedCount = 0;
  result.redirectedCount = 0;
  result.downedSoftAvoidanceCount = 0;
  result.downedSoftCrossingCount = 0;
  result.localQueryCount = 0;
  result.localCandidateCount = 0;
}

function validateCounts(
  count: number, ...stores: readonly { readonly entityCount: number }[]
): void {
  for (const store of stores) {
    if (store.entityCount !== count) {
      throw new RangeError("Specialist collision stores must share entityCount.");
    }
  }
}

function assertEntity(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Specialist collision entity ID is out of bounds.");
  }
}

function sign(value: number): number {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function absolute(value: number): number {
  return value < 0 ? -value : value;
}
