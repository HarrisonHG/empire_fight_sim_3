import {
  getActiveIndividualRespawnEgressEntityIds,
  compactCompletedIndividualRespawnEgressEntities,
  getIndividualRespawnDestinationX,
  getIndividualRespawnDestinationY,
  getIndividualRespawnEgressStartedTick,
  getIndividualPlayerPresenceState,
  recordIndividualRespawnEgressMovement,
  transitionIndividualRespawnEgressToWaiting,
  hasIndividualRespawnDestination,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import type { WorldState } from "./types";
import {
  physicalGaitCoordinateCeiling,
  type IndividualSpecialistPhysicalGaitAdapter,
} from "./individualPhysicalGait";

export const INDIVIDUAL_RESPAWN_EGRESS_ARRIVAL_TOLERANCE = 0;

export interface IndividualRespawnEgressMovementRecord {
  readonly entityId: number;
  readonly tick: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly remainingDistanceSquared: number;
}

export interface IndividualRespawnEgressArrivalRecord {
  readonly entityId: number;
  readonly tick: number;
  readonly previousPresenceState: "respawnEgress";
  readonly presenceState: "waitingAtRespawn";
  readonly arrivalX: number;
  readonly arrivalY: number;
}

export interface IndividualRespawnEgressBuffers {
  readonly movementRecords: IndividualRespawnEgressMovementRecord[];
  readonly arrivalRecords: IndividualRespawnEgressArrivalRecord[];
}

export interface IndividualRespawnEgressResult {
  readonly movementRecords: readonly IndividualRespawnEgressMovementRecord[];
  readonly arrivalRecords: readonly IndividualRespawnEgressArrivalRecord[];
  readonly activeEgressCount: number;
  readonly missingDestinationCount: number;
}

/** Collision remains subordinate to the existing egress destination/step. */
export interface IndividualRespawnEgressCollisionResolver {
  readonly resolvedDeltaX: number;
  readonly resolvedDeltaY: number;
  prepareForMovement(tick: number, activeEntityIds: readonly number[]): void;
  resolveEgressStep(
    entityId: number,
    destinationX: number,
    destinationY: number,
    permittedDeltaX: number,
    permittedDeltaY: number,
  ): void;
  presenceStateChanged(entityId: number, tick: number): void;
}

export function createIndividualRespawnEgressBuffers(): IndividualRespawnEgressBuffers {
  return { movementRecords: [], arrivalRecords: [] };
}

export function advanceIndividualRespawnEgressOneTick(
  world: WorldState,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  tick: number,
  buffers: IndividualRespawnEgressBuffers,
  gaitAdapter?: IndividualSpecialistPhysicalGaitAdapter,
  collisionResolver?: IndividualRespawnEgressCollisionResolver,
): IndividualRespawnEgressResult {
  if (world.entityCount !== lifecycle.entityCount || world.entityCount !== presence.entityCount) {
    throw new RangeError("Respawn egress dependencies must match entity count.");
  }
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError("Respawn egress tick must be a non-negative safe integer.");
  }
  gaitAdapter?.validateCurrentTick();
  buffers.movementRecords.length = 0;
  buffers.arrivalRecords.length = 0;
  let missingDestinationCount = 0;
  const activeEntityIds = getActiveIndividualRespawnEgressEntityIds(presence);
  const activeCountAtStart = activeEntityIds.length;
  collisionResolver?.prepareForMovement(tick, activeEntityIds);
  for (let index = 0; index < activeCountAtStart; index += 1) {
    const entityId = activeEntityIds[index]!;
    if (getIndividualPlayerPresenceState(presence, entityId) !== "respawnEgress") {
      throw new Error("Active respawn egress index contains an incompatible presence.");
    }
    if (!hasIndividualRespawnDestination(presence, entityId)) {
      missingDestinationCount += 1;
      continue;
    }
    const destinationX = getIndividualRespawnDestinationX(presence, entityId);
    const destinationY = getIndividualRespawnDestinationY(presence, entityId);
    if (tick <= getIndividualRespawnEgressStartedTick(presence, entityId)) {
      continue;
    }
    const effectiveGait = gaitAdapter?.preflightRespawnEgressMovement(entityId)
      ?? "walking";
    const coordinateCeiling = physicalGaitCoordinateCeiling(effectiveGait);
    const maximumStep = coordinateCeiling ?? Number.MAX_SAFE_INTEGER;
    const fromX = world.positionsX[entityId]!;
    const fromY = world.positionsY[entityId]!;
    const deltaX = destinationX - fromX;
    const deltaY = destinationY - fromY;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared <= INDIVIDUAL_RESPAWN_EGRESS_ARRIVAL_TOLERANCE ** 2) {
      arrive(lifecycle, presence, entityId, tick, fromX, fromY, buffers);
      collisionResolver?.presenceStateChanged(entityId, tick);
      gaitAdapter?.completeRespawnEgressMovement(
        entityId,
        effectiveGait,
        false,
      );
      continue;
    }
    if (maximumStep === 0) {
      gaitAdapter?.completeRespawnEgressMovement(entityId, effectiveGait, false);
      continue;
    }
    const distance = Math.sqrt(distanceSquared);
    const travel = Math.min(maximumStep, distance);
    let moveX = Math.trunc(deltaX * travel / distance);
    let moveY = Math.trunc(deltaY * travel / distance);
    if (moveX === 0 && moveY === 0) {
      if (Math.abs(deltaX) >= Math.abs(deltaY)) moveX = Math.sign(deltaX);
      else moveY = Math.sign(deltaY);
    }
    collisionResolver?.resolveEgressStep(
      entityId,
      destinationX,
      destinationY,
      moveX,
      moveY,
    );
    if (collisionResolver !== undefined) {
      moveX = collisionResolver.resolvedDeltaX;
      moveY = collisionResolver.resolvedDeltaY;
    }
    const toX = fromX + moveX;
    const toY = fromY + moveY;
    world.positionsX[entityId] = toX;
    world.positionsY[entityId] = toY;
    const producedDisplacement = moveX !== 0 || moveY !== 0;
    if (producedDisplacement) {
      recordIndividualRespawnEgressMovement(presence, entityId);
    }
    const remainingX = destinationX - toX;
    const remainingY = destinationY - toY;
    const remainingDistanceSquared = remainingX * remainingX + remainingY * remainingY;
    if (producedDisplacement) {
      buffers.movementRecords.push({
        entityId, tick, fromX, fromY, toX, toY,
        destinationX,
        destinationY,
        remainingDistanceSquared,
      });
    }
    if (remainingDistanceSquared <= INDIVIDUAL_RESPAWN_EGRESS_ARRIVAL_TOLERANCE ** 2) {
      arrive(lifecycle, presence, entityId, tick, toX, toY, buffers);
      collisionResolver?.presenceStateChanged(entityId, tick);
    }
    gaitAdapter?.completeRespawnEgressMovement(
      entityId,
      effectiveGait,
      producedDisplacement,
    );
  }
  compactCompletedIndividualRespawnEgressEntities(presence);
  return {
    movementRecords: buffers.movementRecords,
    arrivalRecords: buffers.arrivalRecords,
    activeEgressCount: activeEntityIds.length,
    missingDestinationCount,
  };
}

function arrive(
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  entityId: number,
  tick: number,
  x: number,
  y: number,
  buffers: IndividualRespawnEgressBuffers,
): void {
  transitionIndividualRespawnEgressToWaiting(lifecycle, presence, entityId, tick, x, y);
  buffers.arrivalRecords.push({
    entityId,
    tick,
    previousPresenceState: "respawnEgress",
    presenceState: "waitingAtRespawn",
    arrivalX: x,
    arrivalY: y,
  });
}
