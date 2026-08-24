import {
  INDIVIDUAL_COLLISION_RELATIONSHIP,
  INDIVIDUAL_COLLISION_RESOLUTION_FLAG,
  recordIndividualCollisionResolvedStep,
  type IndividualCollisionResolutionStore,
} from "./individualCollisionResolution";
import {
  INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS,
  type IndividualPhysicalOccupancyStore,
} from "./individualPhysicalOccupancy";
import {
  isIndividualOrdinaryParticipationEligible,
  type IndividualOrdinaryParticipationSnapshot,
} from "./individualOrdinaryParticipation";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import {
  observeIndividualCollisionProgress,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import {
  hasLooseCrowdLateralFreedom,
  prepareAlliedCrowdFlow,
  selectAlliedPhysicalYielder,
} from "./individualAlliedCrowdFlow";
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
import type { SimulationBounds, WorldState } from "./types";

export const ACTIVE_STANDING_COLLISION_CELL_SIZE = 16;
export const ACTIVE_STANDING_COLLISION_MAX_QUERY_RADIUS = 32;
export const ACTIVE_STANDING_COLLISION_MAX_PASSES = 8;
const MAX_UINT16 = 0xffff;

export interface IndividualActiveStandingCollisionWorkspace {
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
  readonly ordinaryMoverFlags: Uint8Array;
  readonly activeStandingFlags: Uint8Array;
  readonly conflictFlags: Uint8Array;
  readonly routingFlags: Uint8Array;
  readonly pushThroughFlags: Uint8Array;
  readonly looseLateralFreedomFlags: Uint8Array;
  readonly courtesyRecipientByEntity: Int32Array;
  readonly queryPositionsX: Int32Array;
  readonly queryPositionsY: Int32Array;
  readonly principalBlockerEntityIds: Int32Array;
  readonly principalBlockerDistanceSquared: Float64Array;
  readonly grid: SpatialGrid;
  readonly scratchNearbyEntityIds: number[];
  readonly scratchClearanceEntityIds: number[];
  readonly queryWorld: WorldState;
  readonly includeActiveStanding: (entityId: number) => boolean;
  readonly result: IndividualActiveStandingCollisionResult;
  passCount: number;
  localQueryCount: number;
  localCandidateCount: number;
  unresolvedOverlapCount: number;
  courtesyYieldCount: number;
  overtakeCount: number;
  detourCount: number;
  routerPriorityCount: number;
  pushThroughYieldCount: number;
}

export interface IndividualActiveStandingCollisionResult {
  readonly moverCount: number;
  readonly movedCount: number;
  readonly blockedCount: number;
  readonly reducedCount: number;
  readonly redirectedCount: number;
  readonly passCount: number;
  readonly localQueryCount: number;
  readonly localCandidateCount: number;
  readonly unresolvedOverlapCount: number;
  readonly courtesyYieldCount: number;
  readonly overtakeCount: number;
  readonly detourCount: number;
  readonly routerPriorityCount: number;
  readonly pushThroughYieldCount: number;
}

export function createIndividualActiveStandingCollisionWorkspace(
  entityCount: number,
  bounds: SimulationBounds,
  worldIds: Uint32Array,
): IndividualActiveStandingCollisionWorkspace {
  assertPositiveSafeInteger(entityCount, "entityCount");
  assertBounds(bounds);
  if (worldIds.length !== entityCount) {
    throw new RangeError("Collision workspace IDs must match entityCount.");
  }
  const activeStandingFlags = new Uint8Array(entityCount);
  const queryPositionsX = new Int32Array(entityCount);
  const queryPositionsY = new Int32Array(entityCount);
  const principalBlockerEntityIds = new Int32Array(entityCount);
  principalBlockerEntityIds.fill(-1);
  const principalBlockerDistanceSquared = new Float64Array(entityCount);
  principalBlockerDistanceSquared.fill(Number.POSITIVE_INFINITY);
  const queryWorld: WorldState = {
    entityCount,
    bounds: { width: bounds.width, height: bounds.height },
    ids: worldIds,
    positionsX: queryPositionsX,
    positionsY: queryPositionsY,
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const workspace: IndividualActiveStandingCollisionWorkspace = {
    entityCount,
    bounds: queryWorld.bounds,
    ordinaryMoverFlags: new Uint8Array(entityCount),
    activeStandingFlags,
    conflictFlags: new Uint8Array(entityCount),
    routingFlags: new Uint8Array(entityCount),
    pushThroughFlags: new Uint8Array(entityCount),
    looseLateralFreedomFlags: new Uint8Array(entityCount),
    courtesyRecipientByEntity: filledInt32(entityCount, -1),
    queryPositionsX,
    queryPositionsY,
    principalBlockerEntityIds,
    principalBlockerDistanceSquared,
    grid: createSpatialGrid({
      bounds: queryWorld.bounds,
      cellSize: ACTIVE_STANDING_COLLISION_CELL_SIZE,
      capacity: entityCount,
    }),
    scratchNearbyEntityIds: [],
    scratchClearanceEntityIds: [],
    queryWorld,
    includeActiveStanding: (entityId) =>
      activeStandingFlags[entityId] !== 0,
    result: {
      moverCount: 0,
      movedCount: 0,
      blockedCount: 0,
      reducedCount: 0,
      redirectedCount: 0,
      passCount: 0,
      localQueryCount: 0,
      localCandidateCount: 0,
      unresolvedOverlapCount: 0,
      courtesyYieldCount: 0,
      overtakeCount: 0,
      detourCount: 0,
      routerPriorityCount: 0,
      pushThroughYieldCount: 0,
    },
    passCount: 0,
    localQueryCount: 0,
    localCandidateCount: 0,
    unresolvedOverlapCount: 0,
    courtesyYieldCount: 0,
    overtakeCount: 0,
    detourCount: 0,
    routerPriorityCount: 0,
    pushThroughYieldCount: 0,
  };
  return workspace;
}

/**
 * Resolves ordinary and routing active-standing formation movement.
 * Formation has already selected, bounded, and energy-limited every step.
 */
export function resolveOrdinaryActiveStandingFormationMovementOneTick(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  world: WorldState,
  identity: UnitIdentityStore,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot,
  moraleMovementStates: UnitMoraleMovementStateSource,
  formation?: FormationBehaviourStore,
): IndividualActiveStandingCollisionResult {
  validateInputs(workspace, collision, occupancy, world, identity,
    ordinaryParticipation, formation);
  resetWorkspace(workspace);

  let moverCount = 0;
  let maximumPermittedManhattanDistance = 0;
  const standingRadius = occupancy.geometry.activeStandingRadius;
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    const activeStanding = occupancy.occupancyClassCodes[entityId] ===
      INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.activeStanding;
    workspace.activeStandingFlags[entityId] = activeStanding ? 1 : 0;
    const unitId = getUnitIdForEntity(identity, entityId);
    const routing = moraleMovementStates.get(unitId) === "routing";
    const ordinaryMover = activeStanding &&
      isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId);
    workspace.ordinaryMoverFlags[entityId] = ordinaryMover ? 1 : 0;
    workspace.routingFlags[entityId] = routing ? 1 : 0;
    workspace.pushThroughFlags[entityId] = formation !== undefined &&
      hasLooseCrowdLateralFreedom(formation, unitId, "pushThrough") ? 1 : 0;
    workspace.looseLateralFreedomFlags[entityId] = formation !== undefined &&
      hasLooseCrowdLateralFreedom(formation, unitId, "loose") ? 1 : 0;
    const currentX = world.positionsX[entityId]!;
    const currentY = world.positionsY[entityId]!;
    workspace.queryPositionsX[entityId] = ordinaryMover
      ? collision.tickStartXByEntity[entityId]!
      : currentX;
    workspace.queryPositionsY[entityId] = ordinaryMover
      ? collision.tickStartYByEntity[entityId]!
      : currentY;
    if (!ordinaryMover) continue;
    moverCount += 1;
    const offset = entityId * 2;
    const deltaX = currentX - collision.tickStartXByEntity[entityId]!;
    const deltaY = currentY - collision.tickStartYByEntity[entityId]!;
    collision.permittedDeltas[offset] = deltaX;
    collision.permittedDeltas[offset + 1] = deltaY;
    collision.resolvedDeltas[offset] = deltaX;
    collision.resolvedDeltas[offset + 1] = deltaY;
    const manhattanDistance = absolute(deltaX) + absolute(deltaY);
    if (manhattanDistance > maximumPermittedManhattanDistance) {
      maximumPermittedManhattanDistance = manhattanDistance;
    }
  }

  const pairQueryRadius = maximumPermittedManhattanDistance * 2 +
    standingRadius * 2;
  if (pairQueryRadius > ACTIVE_STANDING_COLLISION_MAX_QUERY_RADIUS) {
    throw new RangeError(
      "Ordinary formation movement exceeds the bounded collision query radius.",
    );
  }

  buildSpatialGrid(
    workspace.grid,
    workspace.queryWorld,
    workspace.includeActiveStanding,
  );
  if (formation !== undefined) {
    prepareAlliedCrowdFlow(
      workspace,
      collision,
      occupancy,
      identity,
      formation,
      pairQueryRadius,
    );
  }
  constrainAgainstTickStartOccupancy(workspace, collision, occupancy);
  relaxMovingPairs(
    workspace,
    collision,
    occupancy,
    identity,
    pairQueryRadius,
  );

  let movedCount = 0;
  let blockedCount = 0;
  let reducedCount = 0;
  let redirectedCount = 0;
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    if (workspace.ordinaryMoverFlags[entityId] === 0) continue;
    const offset = entityId * 2;
    const permittedDeltaX = collision.permittedDeltas[offset]!;
    const permittedDeltaY = collision.permittedDeltas[offset + 1]!;
    const resolvedDeltaX = collision.resolvedDeltas[offset]!;
    const resolvedDeltaY = collision.resolvedDeltas[offset + 1]!;
    recordIndividualCollisionResolvedStep(
      collision,
      entityId,
      permittedDeltaX,
      permittedDeltaY,
      resolvedDeltaX,
      resolvedDeltaY,
    );
    if (formation !== undefined) {
      observeIndividualCollisionProgress(
        formation,
        entityId,
        permittedDeltaX,
        permittedDeltaY,
        resolvedDeltaX,
        resolvedDeltaY,
      );
    }
    world.positionsX[entityId] =
      collision.tickStartXByEntity[entityId]! + resolvedDeltaX;
    world.positionsY[entityId] =
      collision.tickStartYByEntity[entityId]! + resolvedDeltaY;
    const flags = collision.resolutionFlags[entityId]!;
    if (resolvedDeltaX !== 0 || resolvedDeltaY !== 0) movedCount += 1;
    if ((flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.blocked) !== 0) {
      blockedCount += 1;
    }
    if ((flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.reduced) !== 0) {
      reducedCount += 1;
    }
    if ((flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.redirected) !== 0) {
      redirectedCount += 1;
    }
  }

  const result = workspace.result as MutableCollisionResult;
  result.moverCount = moverCount;
  result.movedCount = movedCount;
  result.blockedCount = blockedCount;
  result.reducedCount = reducedCount;
  result.redirectedCount = redirectedCount;
  result.passCount = workspace.passCount;
  result.localQueryCount = workspace.localQueryCount;
  result.localCandidateCount = workspace.localCandidateCount;
  result.unresolvedOverlapCount = workspace.unresolvedOverlapCount;
  result.courtesyYieldCount = workspace.courtesyYieldCount;
  result.overtakeCount = workspace.overtakeCount;
  result.detourCount = workspace.detourCount;
  result.routerPriorityCount = workspace.routerPriorityCount;
  result.pushThroughYieldCount = workspace.pushThroughYieldCount;
  return result;
}

interface MutableCollisionResult {
  moverCount: number;
  movedCount: number;
  blockedCount: number;
  reducedCount: number;
  redirectedCount: number;
  passCount: number;
  localQueryCount: number;
  localCandidateCount: number;
  unresolvedOverlapCount: number;
  courtesyYieldCount: number;
  overtakeCount: number;
  detourCount: number;
  routerPriorityCount: number;
  pushThroughYieldCount: number;
}

function constrainAgainstTickStartOccupancy(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
): void {
  for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
    if (workspace.ordinaryMoverFlags[entityId] === 0) continue;
    const offset = entityId * 2;
    let deltaX = collision.resolvedDeltas[offset]!;
    let deltaY = collision.resolvedDeltas[offset + 1]!;
    if (deltaX === 0 && deltaY === 0) continue;
    const radius = occupancy.effectiveRadii[entityId]!;
    const queryRadius = absolute(deltaX) + absolute(deltaY) + radius +
      occupancy.geometry.activeStandingRadius;
    const nearby = queryNearbyEntitiesInto(
      workspace.grid,
      collision.tickStartXByEntity[entityId]!,
      collision.tickStartYByEntity[entityId]!,
      queryRadius,
      workspace.scratchNearbyEntityIds,
    );
    workspace.localQueryCount += 1;
    addNeighbourEvidence(collision, entityId, nearby.length - 1);
    let candidateCount = 0;
    while (deltaX !== 0 || deltaY !== 0) {
      candidateCount += 1;
      let legal = true;
      for (let index = 0; index < nearby.length; index += 1) {
        const blockerId = nearby[index]!;
        if (blockerId === entityId) continue;
        // Simultaneously moving ordinary members are resolved from relative
        // trajectories below; treating their origins as static would stall a
        // whole formation translating coherently.
        if (workspace.ordinaryMoverFlags[blockerId] !== 0) continue;
        workspace.localCandidateCount += 1;
        if (movementPairCollides(
          collision.tickStartXByEntity[entityId]!,
          collision.tickStartYByEntity[entityId]!,
          deltaX,
          deltaY,
          workspace.queryPositionsX[blockerId]!,
          workspace.queryPositionsY[blockerId]!,
          0,
          0,
          radius + occupancy.effectiveRadii[blockerId]!,
        )) {
          legal = false;
          rememberBlocker(workspace, collision, entityId, blockerId,
            deltaX, deltaY);
          break;
        }
      }
      if (legal) break;
      deltaX = reduceComponentTowardZero(deltaX);
      deltaY = reduceComponentTowardZero(deltaY);
    }
    addCandidateEvidence(collision, entityId, candidateCount);
    collision.resolvedDeltas[offset] = deltaX;
    collision.resolvedDeltas[offset + 1] = deltaY;
  }
}

function relaxMovingPairs(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  identity: UnitIdentityStore,
  queryRadius: number,
): void {
  for (let pass = 0; pass < ACTIVE_STANDING_COLLISION_MAX_PASSES; pass += 1) {
    workspace.conflictFlags.fill(0);
    let conflictCount = 0;
    for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
      if (workspace.ordinaryMoverFlags[entityId] === 0) continue;
      const nearby = queryNearbyEntitiesInto(
        workspace.grid,
        collision.tickStartXByEntity[entityId]!,
        collision.tickStartYByEntity[entityId]!,
        queryRadius,
        workspace.scratchNearbyEntityIds,
      );
      workspace.localQueryCount += 1;
      addNeighbourEvidence(collision, entityId, nearby.length - 1);
      for (let index = 0; index < nearby.length; index += 1) {
        const otherId = nearby[index]!;
        if (otherId <= entityId ||
            workspace.ordinaryMoverFlags[otherId] === 0) continue;
        workspace.localCandidateCount += 1;
        const offset = entityId * 2;
        const otherOffset = otherId * 2;
        if (!movementPairCollides(
          collision.tickStartXByEntity[entityId]!,
          collision.tickStartYByEntity[entityId]!,
          collision.resolvedDeltas[offset]!,
          collision.resolvedDeltas[offset + 1]!,
          collision.tickStartXByEntity[otherId]!,
          collision.tickStartYByEntity[otherId]!,
          collision.resolvedDeltas[otherOffset]!,
          collision.resolvedDeltas[otherOffset + 1]!,
          occupancy.effectiveRadii[entityId]! +
            occupancy.effectiveRadii[otherId]!,
        )) continue;
        conflictCount += 1;
        markPairForReduction(
          workspace,
          collision,
          identity,
          entityId,
          otherId,
        );
      }
    }
    if (conflictCount === 0) {
      workspace.passCount = pass;
      workspace.unresolvedOverlapCount = 0;
      return;
    }
    workspace.passCount = pass + 1;
    for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
      if (workspace.conflictFlags[entityId] === 0) continue;
      const offset = entityId * 2;
      collision.resolvedDeltas[offset] = reduceComponentTowardZero(
        collision.resolvedDeltas[offset]!,
      );
      collision.resolvedDeltas[offset + 1] = reduceComponentTowardZero(
        collision.resolvedDeltas[offset + 1]!,
      );
      addCandidateEvidence(collision, entityId, 1);
    }
  }

  workspace.conflictFlags.fill(0);
  workspace.routingFlags.fill(0);
  workspace.pushThroughFlags.fill(0);
  workspace.looseLateralFreedomFlags.fill(0);
  workspace.courtesyRecipientByEntity.fill(-1);
  const unresolved = findMovingPairConflicts(
    workspace,
    collision,
    occupancy,
    identity,
    queryRadius,
  );
  if (unresolved > 0) {
    for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
      if (workspace.conflictFlags[entityId] === 0) continue;
      const offset = entityId * 2;
      collision.resolvedDeltas[offset] = 0;
      collision.resolvedDeltas[offset + 1] = 0;
      addCandidateEvidence(collision, entityId, 1);
    }
  }
  workspace.conflictFlags.fill(0);
  workspace.unresolvedOverlapCount = findMovingPairConflicts(
    workspace,
    collision,
    occupancy,
    identity,
    queryRadius,
  );
}

function findMovingPairConflicts(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  identity: UnitIdentityStore,
  queryRadius: number,
): number {
  let conflictCount = 0;
  for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
    if (workspace.ordinaryMoverFlags[entityId] === 0) continue;
    const nearby = queryNearbyEntitiesInto(
      workspace.grid,
      collision.tickStartXByEntity[entityId]!,
      collision.tickStartYByEntity[entityId]!,
      queryRadius,
      workspace.scratchNearbyEntityIds,
    );
    workspace.localQueryCount += 1;
    for (let index = 0; index < nearby.length; index += 1) {
      const otherId = nearby[index]!;
      if (otherId <= entityId ||
          workspace.ordinaryMoverFlags[otherId] === 0) continue;
      workspace.localCandidateCount += 1;
      const offset = entityId * 2;
      const otherOffset = otherId * 2;
      if (!movementPairCollides(
        collision.tickStartXByEntity[entityId]!,
        collision.tickStartYByEntity[entityId]!,
        collision.resolvedDeltas[offset]!,
        collision.resolvedDeltas[offset + 1]!,
        collision.tickStartXByEntity[otherId]!,
        collision.tickStartYByEntity[otherId]!,
        collision.resolvedDeltas[otherOffset]!,
        collision.resolvedDeltas[otherOffset + 1]!,
        occupancy.effectiveRadii[entityId]! +
          occupancy.effectiveRadii[otherId]!,
      )) continue;
      conflictCount += 1;
      markPairForReduction(
        workspace,
        collision,
        identity,
        entityId,
        otherId,
      );
    }
  }
  return conflictCount;
}

function markPairForReduction(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  identity: UnitIdentityStore,
  leftId: number,
  rightId: number,
): void {
  const leftOffset = leftId * 2;
  const rightOffset = rightId * 2;
  const leftMoves = collision.resolvedDeltas[leftOffset] !== 0 ||
    collision.resolvedDeltas[leftOffset + 1] !== 0;
  const rightMoves = collision.resolvedDeltas[rightOffset] !== 0 ||
    collision.resolvedDeltas[rightOffset + 1] !== 0;
  const allied = getFactionIdForUnit(
    identity,
    getUnitIdForEntity(identity, leftId),
  ) === getFactionIdForUnit(
    identity,
    getUnitIdForEntity(identity, rightId),
  );
  const alliedYielder = allied
    ? selectAlliedPhysicalYielder(workspace, collision, leftId, rightId)
    : -1;
  if (alliedYielder >= 0) {
    if (alliedYielder === leftId && leftMoves) {
      workspace.conflictFlags[leftId] = 1;
    } else if (alliedYielder === rightId && rightMoves) {
      workspace.conflictFlags[rightId] = 1;
    } else {
      if (leftMoves) workspace.conflictFlags[leftId] = 1;
      if (rightMoves) workspace.conflictFlags[rightId] = 1;
    }
  } else {
    if (leftMoves) workspace.conflictFlags[leftId] = 1;
    if (rightMoves) workspace.conflictFlags[rightId] = 1;
  }
  rememberBlocker(workspace, collision, leftId, rightId,
    collision.resolvedDeltas[leftOffset]!,
    collision.resolvedDeltas[leftOffset + 1]!);
  rememberBlocker(workspace, collision, rightId, leftId,
    collision.resolvedDeltas[rightOffset]!,
    collision.resolvedDeltas[rightOffset + 1]!);
}

function movementPairCollides(
  leftStartX: number,
  leftStartY: number,
  leftDeltaX: number,
  leftDeltaY: number,
  rightStartX: number,
  rightStartY: number,
  rightDeltaX: number,
  rightDeltaY: number,
  combinedRadius: number,
): boolean {
  const relativeStartX = rightStartX - leftStartX;
  const relativeStartY = rightStartY - leftStartY;
  const relativeDeltaX = rightDeltaX - leftDeltaX;
  const relativeDeltaY = rightDeltaY - leftDeltaY;
  const startDistanceSquared = relativeStartX * relativeStartX +
    relativeStartY * relativeStartY;
  const endX = relativeStartX + relativeDeltaX;
  const endY = relativeStartY + relativeDeltaY;
  const endDistanceSquared = endX * endX + endY * endY;
  const radiusSquared = combinedRadius * combinedRadius;
  if (startDistanceSquared < radiusSquared) {
    return endDistanceSquared < startDistanceSquared;
  }
  const relativeLengthSquared = relativeDeltaX * relativeDeltaX +
    relativeDeltaY * relativeDeltaY;
  if (relativeLengthSquared === 0) return false;
  const closestNumerator = -(
    relativeStartX * relativeDeltaX +
    relativeStartY * relativeDeltaY
  );
  if (closestNumerator <= 0) return false;
  if (closestNumerator >= relativeLengthSquared) {
    return endDistanceSquared < radiusSquared;
  }
  const cross = relativeStartX * relativeDeltaY -
    relativeStartY * relativeDeltaX;
  return cross * cross < radiusSquared * relativeLengthSquared;
}

function rememberBlocker(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  blockerId: number,
  deltaX: number,
  deltaY: number,
): void {
  const finalX = collision.tickStartXByEntity[entityId]! + deltaX;
  const finalY = collision.tickStartYByEntity[entityId]! + deltaY;
  const blockerOffset = blockerId * 2;
  const blockerX = workspace.ordinaryMoverFlags[blockerId] !== 0
    ? collision.tickStartXByEntity[blockerId]! +
      collision.resolvedDeltas[blockerOffset]!
    : workspace.queryPositionsX[blockerId]!;
  const blockerY = workspace.ordinaryMoverFlags[blockerId] !== 0
    ? collision.tickStartYByEntity[blockerId]! +
      collision.resolvedDeltas[blockerOffset + 1]!
    : workspace.queryPositionsY[blockerId]!;
  const distanceX = blockerX - finalX;
  const distanceY = blockerY - finalY;
  const distanceSquared = distanceX * distanceX + distanceY * distanceY;
  if (distanceSquared < workspace.principalBlockerDistanceSquared[entityId]! ||
      (distanceSquared ===
        workspace.principalBlockerDistanceSquared[entityId]! &&
        blockerId < workspace.principalBlockerEntityIds[entityId]!)) {
    workspace.principalBlockerDistanceSquared[entityId] = distanceSquared;
    workspace.principalBlockerEntityIds[entityId] = blockerId;
    collision.principalOccupancyRelationshipCodes[entityId] =
      INDIVIDUAL_COLLISION_RELATIONSHIP.activeStanding;
  }
}

function addNeighbourEvidence(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  count: number,
): void {
  if (count <= 0) return;
  collision.localNeighbourCounts[entityId] = Math.min(MAX_UINT16, Math.max(
    collision.localNeighbourCounts[entityId]!,
    count,
  ));
}

function addCandidateEvidence(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  count: number,
): void {
  collision.localCandidateCounts[entityId] = Math.min(
    MAX_UINT16,
    collision.localCandidateCounts[entityId]! + count,
  );
}

function reduceComponentTowardZero(value: number): number {
  return value > 0 ? value - 1 : value < 0 ? value + 1 : 0;
}

function resetWorkspace(
  workspace: IndividualActiveStandingCollisionWorkspace,
): void {
  workspace.ordinaryMoverFlags.fill(0);
  workspace.activeStandingFlags.fill(0);
  workspace.conflictFlags.fill(0);
  workspace.principalBlockerEntityIds.fill(-1);
  workspace.principalBlockerDistanceSquared.fill(Number.POSITIVE_INFINITY);
  workspace.passCount = 0;
  workspace.localQueryCount = 0;
  workspace.localCandidateCount = 0;
  workspace.unresolvedOverlapCount = 0;
  workspace.courtesyYieldCount = 0;
  workspace.overtakeCount = 0;
  workspace.detourCount = 0;
  workspace.routerPriorityCount = 0;
  workspace.pushThroughYieldCount = 0;
}

function validateInputs(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  world: WorldState,
  identity: UnitIdentityStore,
  ordinary: IndividualOrdinaryParticipationSnapshot,
  formation: FormationBehaviourStore | undefined,
): void {
  const entityCount = workspace.entityCount;
  if (collision.entityCount !== entityCount ||
      occupancy.entityCount !== entityCount ||
      world.entityCount !== entityCount ||
      identity.entityCount !== entityCount ||
      ordinary.entityCount !== entityCount ||
      (formation !== undefined && formation.entityCount !== entityCount)) {
    throw new RangeError("Active-standing collision inputs must share entityCount.");
  }
  if (world.bounds.width !== workspace.bounds.width ||
      world.bounds.height !== workspace.bounds.height) {
    throw new RangeError("Active-standing collision bounds must remain stable.");
  }
}

function filledInt32(length: number, value: number): Int32Array {
  const result = new Int32Array(length);
  result.fill(value);
  return result;
}

function absolute(value: number): number {
  return value < 0 ? -value : value;
}

function assertBounds(bounds: SimulationBounds): void {
  assertPositiveSafeInteger(bounds.width, "bounds.width");
  assertPositiveSafeInteger(bounds.height, "bounds.height");
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
