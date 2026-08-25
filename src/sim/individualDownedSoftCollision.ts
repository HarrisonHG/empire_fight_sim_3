import type { IndividualActiveStandingCollisionWorkspace } from "./individualActiveStandingCollision";
import {
  INDIVIDUAL_COLLISION_RELATIONSHIP,
  type IndividualCollisionResolutionStore,
} from "./individualCollisionResolution";
import type { IndividualPhysicalOccupancyStore } from "./individualPhysicalOccupancy";
import { queryNearbyEntitiesInto } from "./spatialGrid";

const MAX_UINT16 = 0xffff;

/**
 * Gives ordinary movers a local soft-body choice: go around when a bounded
 * candidate is legal, otherwise make the smallest forward crossing step.
 */
export function resolveOrdinaryDownedSoftOccupancy(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
): void {
  for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
    if (workspace.ordinaryMoverFlags[entityId] === 0) continue;
    const offset = entityId * 2;
    const currentDeltaX = collision.resolvedDeltas[offset]!;
    const currentDeltaY = collision.resolvedDeltas[offset + 1]!;
    if (currentDeltaX === 0 && currentDeltaY === 0) continue;
    const startX = collision.tickStartXByEntity[entityId]!;
    const startY = collision.tickStartYByEntity[entityId]!;
    const queryRadius = absolute(currentDeltaX) + absolute(currentDeltaY) +
      occupancy.effectiveRadii[entityId]! + occupancy.geometry.downedSoftRadius;
    const nearby = queryNearbyEntitiesInto(
      workspace.grid,
      startX,
      startY,
      queryRadius,
      workspace.scratchNearbyEntityIds,
    );
    workspace.localQueryCount += 1;
    addNeighbourEvidence(collision, entityId, nearby.length - 1);
    const blockerId = firstSoftConflict(
      workspace,
      collision,
      occupancy,
      entityId,
      currentDeltaX,
      currentDeltaY,
      nearby,
    );
    if (blockerId < 0) continue;
    rememberSoftBlocker(workspace, collision, entityId, blockerId,
      currentDeltaX, currentDeltaY);

    const permittedX = collision.permittedDeltas[offset]!;
    const permittedY = collision.permittedDeltas[offset + 1]!;
    const budgetSquared = permittedX * permittedX + permittedY * permittedY;
    const forwardX = sign(permittedX);
    const forwardY = sign(permittedY);
    const side = preferredSide(
      collision,
      entityId,
      blockerId,
      forwardX,
      forwardY,
    );
    const lateralX = -forwardY * side;
    const lateralY = forwardX * side;

    if (tryAvoidanceCandidate(
      workspace, collision, occupancy, entityId,
      forwardX + lateralX, forwardY + lateralY,
      budgetSquared, nearby,
    ) || tryAvoidanceCandidate(
      workspace, collision, occupancy, entityId,
      forwardX - lateralX, forwardY - lateralY,
      budgetSquared, nearby,
    ) || tryAvoidanceCandidate(
      workspace, collision, occupancy, entityId,
      lateralX, lateralY,
      budgetSquared, nearby,
    ) || tryAvoidanceCandidate(
      workspace, collision, occupancy, entityId,
      -lateralX, -lateralY,
      budgetSquared, nearby,
    )) {
      workspace.downedSoftAvoidanceFlags[entityId] = 1;
      continue;
    }

    // Integer positions cannot express a smaller non-zero step than one unit.
    // This is the bounded careful-crossing fallback, never a hard-body bypass.
    if (candidateIsLegal(
      workspace,
      collision,
      occupancy,
      entityId,
      forwardX,
      forwardY,
      budgetSquared,
      nearby,
      true,
    )) {
      collision.resolvedDeltas[offset] = forwardX;
      collision.resolvedDeltas[offset + 1] = forwardY;
      workspace.downedSoftCrossingFlags[entityId] = 1;
      addCandidateEvidence(collision, entityId, 1);
      continue;
    }

    collision.resolvedDeltas[offset] = 0;
    collision.resolvedDeltas[offset + 1] = 0;
    addCandidateEvidence(collision, entityId, 1);
  }
}

function tryAvoidanceCandidate(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
  nearby: readonly number[],
): boolean {
  addCandidateEvidence(collision, entityId, 1);
  const offset = entityId * 2;
  const permittedX = collision.permittedDeltas[offset]!;
  const permittedY = collision.permittedDeltas[offset + 1]!;
  // Avoidance must still make useful progress toward the already-permitted
  // desire. A zero-progress lateral step can otherwise be reselected until a
  // soft body behaves like a permanent wall.
  if (deltaX * permittedX + deltaY * permittedY <= 0) return false;
  if (!candidateIsLegal(
    workspace,
    collision,
    occupancy,
    entityId,
    deltaX,
    deltaY,
    budgetSquared,
    nearby,
    false,
  )) return false;
  collision.resolvedDeltas[offset] = deltaX;
  collision.resolvedDeltas[offset + 1] = deltaY;
  return true;
}

function candidateIsLegal(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
  nearby: readonly number[],
  allowSoftCrossing: boolean,
): boolean {
  if (deltaX === 0 && deltaY === 0 ||
      deltaX * deltaX + deltaY * deltaY > budgetSquared) return false;
  const startX = collision.tickStartXByEntity[entityId]!;
  const startY = collision.tickStartYByEntity[entityId]!;
  const finalX = startX + deltaX;
  const finalY = startY + deltaY;
  if (finalX < 0 || finalY < 0 || finalX >= workspace.bounds.width ||
      finalY >= workspace.bounds.height) return false;
  for (let index = 0; index < nearby.length; index += 1) {
    const otherId = nearby[index]!;
    if (otherId === entityId) continue;
    const isSoft = workspace.downedSoftFlags[otherId] !== 0;
    if (isSoft && allowSoftCrossing) continue;
    // Moving ordinary peers retain the accepted simultaneous hard resolver.
    if (!isSoft && workspace.ordinaryMoverFlags[otherId] !== 0) continue;
    workspace.localCandidateCount += 1;
    if (movementPairCollides(
      startX,
      startY,
      deltaX,
      deltaY,
      workspace.queryPositionsX[otherId]!,
      workspace.queryPositionsY[otherId]!,
      occupancy.effectiveRadii[entityId]! +
        occupancy.effectiveRadii[otherId]!,
    )) return false;
  }
  return true;
}

function firstSoftConflict(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  nearby: readonly number[],
): number {
  let blockerId = -1;
  let blockerDistanceSquared = Number.POSITIVE_INFINITY;
  const startX = collision.tickStartXByEntity[entityId]!;
  const startY = collision.tickStartYByEntity[entityId]!;
  for (let index = 0; index < nearby.length; index += 1) {
    const otherId = nearby[index]!;
    if (workspace.downedSoftFlags[otherId] === 0) continue;
    workspace.localCandidateCount += 1;
    if (!movementPairCollides(
      startX,
      startY,
      deltaX,
      deltaY,
      workspace.queryPositionsX[otherId]!,
      workspace.queryPositionsY[otherId]!,
      occupancy.effectiveRadii[entityId]! +
        occupancy.effectiveRadii[otherId]!,
    )) continue;
    const relativeX = workspace.queryPositionsX[otherId]! - startX;
    const relativeY = workspace.queryPositionsY[otherId]! - startY;
    const distanceSquared = relativeX * relativeX + relativeY * relativeY;
    if (distanceSquared < blockerDistanceSquared ||
        (distanceSquared === blockerDistanceSquared && otherId < blockerId)) {
      blockerDistanceSquared = distanceSquared;
      blockerId = otherId;
    }
  }
  return blockerId;
}

function rememberSoftBlocker(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  blockerId: number,
  deltaX: number,
  deltaY: number,
): void {
  const finalX = collision.tickStartXByEntity[entityId]! + deltaX;
  const finalY = collision.tickStartYByEntity[entityId]! + deltaY;
  const distanceX = workspace.queryPositionsX[blockerId]! - finalX;
  const distanceY = workspace.queryPositionsY[blockerId]! - finalY;
  const distanceSquared = distanceX * distanceX + distanceY * distanceY;
  if (distanceSquared < workspace.principalBlockerDistanceSquared[entityId]! ||
      (distanceSquared === workspace.principalBlockerDistanceSquared[entityId]! &&
        blockerId < workspace.principalBlockerEntityIds[entityId]!)) {
    workspace.principalBlockerDistanceSquared[entityId] = distanceSquared;
    workspace.principalBlockerEntityIds[entityId] = blockerId;
    collision.principalOccupancyRelationshipCodes[entityId] =
      INDIVIDUAL_COLLISION_RELATIONSHIP.downedSoft;
  }
}

function preferredSide(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  blockerId: number,
  forwardX: number,
  forwardY: number,
): number {
  const relativeX = collision.tickStartXByEntity[blockerId]! -
    collision.tickStartXByEntity[entityId]!;
  const relativeY = collision.tickStartYByEntity[blockerId]! -
    collision.tickStartYByEntity[entityId]!;
  const cross = forwardX * relativeY - forwardY * relativeX;
  if (cross !== 0) return cross > 0 ? -1 : 1;
  return ((entityId + blockerId) & 1) === 0 ? 1 : -1;
}

function movementPairCollides(
  leftStartX: number,
  leftStartY: number,
  leftDeltaX: number,
  leftDeltaY: number,
  rightX: number,
  rightY: number,
  combinedRadius: number,
): boolean {
  const relativeStartX = rightX - leftStartX;
  const relativeStartY = rightY - leftStartY;
  const endX = relativeStartX - leftDeltaX;
  const endY = relativeStartY - leftDeltaY;
  const startDistanceSquared = relativeStartX * relativeStartX +
    relativeStartY * relativeStartY;
  const endDistanceSquared = endX * endX + endY * endY;
  const radiusSquared = combinedRadius * combinedRadius;
  if (startDistanceSquared < radiusSquared) {
    return endDistanceSquared < startDistanceSquared;
  }
  const lengthSquared = leftDeltaX * leftDeltaX + leftDeltaY * leftDeltaY;
  if (lengthSquared === 0) return false;
  const closestNumerator = relativeStartX * leftDeltaX +
    relativeStartY * leftDeltaY;
  if (closestNumerator <= 0) return false;
  if (closestNumerator >= lengthSquared) {
    return endDistanceSquared < radiusSquared;
  }
  const cross = relativeStartX * leftDeltaY -
    relativeStartY * leftDeltaX;
  return cross * cross < radiusSquared * lengthSquared;
}

function addNeighbourEvidence(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  count: number,
): void {
  if (count <= 0) return;
  collision.localNeighbourCounts[entityId] = Math.min(
    MAX_UINT16,
    Math.max(collision.localNeighbourCounts[entityId]!, count),
  );
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

function sign(value: number): number {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function absolute(value: number): number {
  return value < 0 ? -value : value;
}
