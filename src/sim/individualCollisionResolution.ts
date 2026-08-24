import {
  getIndividualPhysicalOccupancyProjectionTick,
  type IndividualPhysicalOccupancyStore,
} from "./individualPhysicalOccupancy";
import type { WorldState } from "./types";

/** 8B installs the boundary and evidence only; 8C owns first activation. */
export const PRODUCTION_COLLISION_RESOLUTION_ACTIVE = false;

export const INDIVIDUAL_COLLISION_RESOLUTION_FLAG = Object.freeze({
  blocked: 1 << 0,
  reduced: 1 << 1,
  redirected: 1 << 2,
  downedSoftCrossing: 1 << 3,
  yieldingEgressYield: 1 << 4,
} as const);

export const INDIVIDUAL_COLLISION_RELATIONSHIP = Object.freeze({
  none: 0,
  activeStanding: 1,
  downedSoft: 2,
  assistedMoving: 3,
  yieldingEgress: 4,
} as const);

export const INDIVIDUAL_COLLISION_LOCAL_DECISION = Object.freeze({
  none: 0,
  detour: 1,
  courtesyYield: 2,
  overtake: 3,
} as const);

/**
 * Current-tick production collision evidence and bounded local decision memory.
 * It is not a world-position, movement-intent, lifecycle, or target authority.
 */
export interface IndividualCollisionResolutionStore {
  readonly entityCount: number;
  readonly tickStartXByEntity: Int32Array;
  readonly tickStartYByEntity: Int32Array;
  readonly permittedDeltas: Int32Array;
  readonly resolvedDeltas: Int32Array;
  readonly localNeighbourCounts: Uint16Array;
  readonly localCandidateCounts: Uint16Array;
  readonly resolutionFlags: Uint8Array;
  readonly principalOccupancyRelationshipCodes: Uint8Array;
  readonly localDecisionCodes: Uint8Array;
  readonly localDecisionPartnerByEntity: Int32Array;
  readonly localDecisionSideByEntity: Int8Array;
  readonly localDecisionTicksRemaining: Uint16Array;
}

interface InternalIndividualCollisionResolutionStore
  extends IndividualCollisionResolutionStore {
  currentTick: number;
  finalizedTick: number;
}

export interface IndividualCollisionResolutionInspection {
  readonly permittedDeltaX: number;
  readonly permittedDeltaY: number;
  readonly resolvedDeltaX: number;
  readonly resolvedDeltaY: number;
  readonly blocked: boolean;
  readonly reduced: boolean;
  readonly redirected: boolean;
  readonly downedSoftCrossing: boolean;
  readonly yieldingEgressYield: boolean;
  readonly localNeighbourCount: number;
  readonly localCandidateCount: number;
  readonly principalOccupancyRelationshipCode: number;
  readonly localDecisionCode: number;
  readonly localDecisionPartnerEntityId: number;
  readonly localDecisionSide: number;
  readonly localDecisionTicksRemaining: number;
  readonly observedTick: number;
  readonly finalizedTick: number;
}

export function createIndividualCollisionResolutionStore(
  entityCount: number,
): IndividualCollisionResolutionStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const localDecisionPartnerByEntity = new Int32Array(entityCount);
  localDecisionPartnerByEntity.fill(-1);
  return {
    entityCount,
    tickStartXByEntity: new Int32Array(entityCount),
    tickStartYByEntity: new Int32Array(entityCount),
    permittedDeltas: new Int32Array(entityCount * 2),
    resolvedDeltas: new Int32Array(entityCount * 2),
    localNeighbourCounts: new Uint16Array(entityCount),
    localCandidateCounts: new Uint16Array(entityCount),
    resolutionFlags: new Uint8Array(entityCount),
    principalOccupancyRelationshipCodes: new Uint8Array(entityCount),
    localDecisionCodes: new Uint8Array(entityCount),
    localDecisionPartnerByEntity,
    localDecisionSideByEntity: new Int8Array(entityCount),
    localDecisionTicksRemaining: new Uint16Array(entityCount),
    currentTick: -1,
    finalizedTick: -1,
  } as InternalIndividualCollisionResolutionStore;
}

/** Opens the production boundary. Collision remains disabled during 8B. */
export function beginIndividualCollisionResolutionTick(
  store: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  world: WorldState,
  tick: number,
): void {
  const internal = asInternal(store);
  validateEntityCounts(internal.entityCount, occupancy, world);
  assertNonNegativeSafeInteger(tick, "collision tick");
  if (getIndividualPhysicalOccupancyProjectionTick(occupancy) !== tick) {
    throw new Error(
      "Collision requires a current-tick physical occupancy projection.",
    );
  }
  if (tick < internal.currentTick) {
    throw new Error("Collision resolution cannot move backwards.");
  }
  internal.tickStartXByEntity.set(world.positionsX);
  internal.tickStartYByEntity.set(world.positionsY);
  internal.permittedDeltas.fill(0);
  internal.resolvedDeltas.fill(0);
  internal.localNeighbourCounts.fill(0);
  internal.localCandidateCounts.fill(0);
  internal.resolutionFlags.fill(0);
  internal.principalOccupancyRelationshipCodes.fill(0);
  internal.currentTick = tick;
  internal.finalizedTick = -1;
}

/**
 * Records an already-permitted movement and its local collision result.
 * The result may preserve, shorten, redirect within the same distance budget,
 * or stop the step. It cannot grant additional movement distance.
 */
export function recordIndividualCollisionResolvedStep(
  store: IndividualCollisionResolutionStore,
  entityId: number,
  permittedDeltaX: number,
  permittedDeltaY: number,
  resolvedDeltaX: number,
  resolvedDeltaY: number,
): void {
  const internal = asInternal(store);
  assertOpen(internal);
  assertEntityId(entityId, internal.entityCount);
  assertIntegerDelta(permittedDeltaX, "permitted delta x");
  assertIntegerDelta(permittedDeltaY, "permitted delta y");
  assertIntegerDelta(resolvedDeltaX, "resolved delta x");
  assertIntegerDelta(resolvedDeltaY, "resolved delta y");
  const permittedDistanceSquared =
    permittedDeltaX * permittedDeltaX + permittedDeltaY * permittedDeltaY;
  const resolvedDistanceSquared =
    resolvedDeltaX * resolvedDeltaX + resolvedDeltaY * resolvedDeltaY;
  if (resolvedDistanceSquared > permittedDistanceSquared) {
    throw new RangeError(
      "Collision resolution cannot increase an already-permitted movement.",
    );
  }
  const offset = entityId * 2;
  internal.permittedDeltas[offset] = permittedDeltaX;
  internal.permittedDeltas[offset + 1] = permittedDeltaY;
  internal.resolvedDeltas[offset] = resolvedDeltaX;
  internal.resolvedDeltas[offset + 1] = resolvedDeltaY;
  internal.resolutionFlags[entityId] = deriveResolutionFlags(
    permittedDeltaX,
    permittedDeltaY,
    resolvedDeltaX,
    resolvedDeltaY,
  );
}

/**
 * Disabled 8B production adapter: observe final actual movement as an exact
 * pass-through result without mutating positions or enabling collision.
 */
export function finalizeDisabledIndividualCollisionResolutionTick(
  store: IndividualCollisionResolutionStore,
  world: WorldState,
  tick: number,
): void {
  const internal = asInternal(store);
  validateEntityCounts(internal.entityCount, world);
  if (internal.currentTick !== tick || internal.finalizedTick === tick) {
    throw new Error("Collision finalisation requires one open current tick.");
  }
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const deltaX = world.positionsX[entityId]! -
      internal.tickStartXByEntity[entityId]!;
    const deltaY = world.positionsY[entityId]! -
      internal.tickStartYByEntity[entityId]!;
    recordIndividualCollisionResolvedStep(
      internal,
      entityId,
      deltaX,
      deltaY,
      deltaX,
      deltaY,
    );
  }
  internal.finalizedTick = tick;
}

/** Applies only a previously validated resolved step at a caller-owned point. */
export function applyIndividualCollisionResolvedStep(
  store: IndividualCollisionResolutionStore,
  world: WorldState,
  entityId: number,
  originX: number,
  originY: number,
): void {
  const internal = asInternal(store);
  validateEntityCounts(internal.entityCount, world);
  assertOpen(internal);
  assertEntityId(entityId, internal.entityCount);
  assertIntegerDelta(originX, "movement origin x");
  assertIntegerDelta(originY, "movement origin y");
  if (
    world.positionsX[entityId] !== originX ||
    world.positionsY[entityId] !== originY
  ) {
    throw new Error("Collision must apply from the mover's current position.");
  }
  const offset = entityId * 2;
  const x = originX + internal.resolvedDeltas[offset]!;
  const y = originY + internal.resolvedDeltas[offset + 1]!;
  if (x < 0 || y < 0 || x >= world.bounds.width || y >= world.bounds.height) {
    throw new RangeError("Collision-resolved movement must remain in world bounds.");
  }
  world.positionsX[entityId] = x;
  world.positionsY[entityId] = y;
}

export function getIndividualCollisionResolutionInspection(
  store: IndividualCollisionResolutionStore,
  entityId: number,
): IndividualCollisionResolutionInspection {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  const offset = entityId * 2;
  const flags = internal.resolutionFlags[entityId]!;
  return {
    permittedDeltaX: internal.permittedDeltas[offset]!,
    permittedDeltaY: internal.permittedDeltas[offset + 1]!,
    resolvedDeltaX: internal.resolvedDeltas[offset]!,
    resolvedDeltaY: internal.resolvedDeltas[offset + 1]!,
    blocked: (flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.blocked) !== 0,
    reduced: (flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.reduced) !== 0,
    redirected: (flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.redirected) !== 0,
    downedSoftCrossing:
      (flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.downedSoftCrossing) !== 0,
    yieldingEgressYield:
      (flags & INDIVIDUAL_COLLISION_RESOLUTION_FLAG.yieldingEgressYield) !== 0,
    localNeighbourCount: internal.localNeighbourCounts[entityId]!,
    localCandidateCount: internal.localCandidateCounts[entityId]!,
    principalOccupancyRelationshipCode:
      internal.principalOccupancyRelationshipCodes[entityId]!,
    localDecisionCode: internal.localDecisionCodes[entityId]!,
    localDecisionPartnerEntityId:
      internal.localDecisionPartnerByEntity[entityId]!,
    localDecisionSide: internal.localDecisionSideByEntity[entityId]!,
    localDecisionTicksRemaining:
      internal.localDecisionTicksRemaining[entityId]!,
    observedTick: internal.currentTick,
    finalizedTick: internal.finalizedTick,
  };
}

function deriveResolutionFlags(
  permittedDeltaX: number,
  permittedDeltaY: number,
  resolvedDeltaX: number,
  resolvedDeltaY: number,
): number {
  const permittedDistanceSquared =
    permittedDeltaX * permittedDeltaX + permittedDeltaY * permittedDeltaY;
  if (permittedDistanceSquared === 0) return 0;
  const resolvedDistanceSquared =
    resolvedDeltaX * resolvedDeltaX + resolvedDeltaY * resolvedDeltaY;
  let flags = 0;
  if (resolvedDistanceSquared === 0) {
    flags |= INDIVIDUAL_COLLISION_RESOLUTION_FLAG.blocked;
  } else if (resolvedDistanceSquared < permittedDistanceSquared) {
    flags |= INDIVIDUAL_COLLISION_RESOLUTION_FLAG.reduced;
  }
  if (
    resolvedDistanceSquared > 0 &&
    (permittedDeltaX * resolvedDeltaY !== permittedDeltaY * resolvedDeltaX ||
      permittedDeltaX * resolvedDeltaX + permittedDeltaY * resolvedDeltaY < 0)
  ) {
    flags |= INDIVIDUAL_COLLISION_RESOLUTION_FLAG.redirected;
  }
  return flags;
}

function assertOpen(store: InternalIndividualCollisionResolutionStore): void {
  if (store.currentTick < 0 || store.finalizedTick === store.currentTick) {
    throw new Error("Collision resolution requires an open current tick.");
  }
}

function validateEntityCounts(
  entityCount: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  for (let index = 0; index < stores.length; index += 1) {
    if (stores[index]!.entityCount !== entityCount) {
      throw new RangeError("Collision boundary stores must share entityCount.");
    }
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Collision entity ID is out of bounds.");
  }
}

function assertIntegerDelta(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function asInternal(
  store: IndividualCollisionResolutionStore,
): InternalIndividualCollisionResolutionStore {
  return store as InternalIndividualCollisionResolutionStore;
}
