import type {
  IndividualCasualtyLifecycleStore,
  IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import {
  INDIVIDUAL_COLLISION_LOCAL_DECISION,
  INDIVIDUAL_COLLISION_RELATIONSHIP,
  INDIVIDUAL_COLLISION_RESOLUTION_FLAG,
  recordIndividualCollisionResolvedStep,
  type IndividualCollisionResolutionStore,
} from "./individualCollisionResolution";
import {
  getIndividualPhysicalOccupancyProjectionTick,
  INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS,
  refreshIndividualPhysicalOccupancyForPresenceTransition,
  type IndividualPhysicalOccupancyStore,
} from "./individualPhysicalOccupancy";
import type { IndividualRespawnEgressCollisionResolver } from "./individualRespawnEgress";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryNearbyEntitiesInto,
  type SpatialGrid,
} from "./spatialGrid";
import type { WorldState } from "./types";

export const INDIVIDUAL_EGRESS_DETOUR_PHASE = Object.freeze({
  none: 0,
  initialSide: 1,
  oppositeSide: 2,
  widerAlternative: 3,
} as const);

export const INDIVIDUAL_EGRESS_INITIAL_DETOUR_TICKS = 40;
export const INDIVIDUAL_EGRESS_OPPOSITE_DETOUR_TICKS = 100;
export const INDIVIDUAL_EGRESS_WIDE_DETOUR_TICKS = 200;

const EGRESS_COLLISION_CELL_SIZE = 16;
const EGRESS_COLLISION_MAX_QUERY_RADIUS = 32;
const EGRESS_NORMAL_PROGRESS_RESET_TICKS = 8;
const EGRESS_WIDE_INITIAL_WAIT_TICKS = 20;
const MAX_UINT16 = 0xffff;

export interface IndividualRespawnEgressCollisionResult {
  readonly requestedCount: number;
  readonly movedCount: number;
  readonly yieldedCount: number;
  readonly waitCount: number;
  readonly sidestepCount: number;
  readonly backtrackCount: number;
  readonly downedSoftAvoidanceCount: number;
  readonly downedSoftCrossingCount: number;
  readonly egressPairNegotiationCount: number;
  readonly strategyChangeCount: number;
  readonly localQueryCount: number;
  readonly localCandidateCount: number;
  readonly sameTickOccupancyRefreshCount: number;
}

interface MutableIndividualRespawnEgressCollisionResult {
  requestedCount: number;
  movedCount: number;
  yieldedCount: number;
  waitCount: number;
  sidestepCount: number;
  backtrackCount: number;
  downedSoftAvoidanceCount: number;
  downedSoftCrossingCount: number;
  egressPairNegotiationCount: number;
  strategyChangeCount: number;
  localQueryCount: number;
  localCandidateCount: number;
  sameTickOccupancyRefreshCount: number;
}

export interface IndividualRespawnEgressCollisionStore
  extends IndividualRespawnEgressCollisionResolver {
  readonly entityCount: number;
  readonly includedOccupancyFlags: Uint8Array;
  readonly detourPhaseByEntity: Uint8Array;
  readonly detourSideByEntity: Int8Array;
  readonly detourTicksRemainingByEntity: Uint16Array;
  readonly detourBlockerByEntity: Int32Array;
  readonly destinationXByEntity: Int32Array;
  readonly destinationYByEntity: Int32Array;
  readonly attemptStartDistanceByEntity: Int32Array;
  readonly normalProgressStreakByEntity: Uint8Array;
  readonly principalBlockerByEntity: Int32Array;
  readonly grid: SpatialGrid;
  readonly result: IndividualRespawnEgressCollisionResult;
}

interface InternalIndividualRespawnEgressCollisionStore
  extends IndividualRespawnEgressCollisionStore {
  resolvedDeltaX: number;
  resolvedDeltaY: number;
  preparedTick: number;
  evaluationRelationship: number;
  evaluationBlockerEntityId: number;
  evaluationSoftConflict: boolean;
  readonly nearbyEntityIds: number[];
}

export function createIndividualRespawnEgressCollisionStore(
  world: WorldState,
  occupancy: IndividualPhysicalOccupancyStore,
  collision: IndividualCollisionResolutionStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
): IndividualRespawnEgressCollisionStore {
  validateEntityCounts(
    world.entityCount,
    occupancy,
    collision,
    lifecycle,
    presence,
  );
  const detourBlockerByEntity = filledInt32(world.entityCount, -1);
  const principalBlockerByEntity = filledInt32(world.entityCount, -1);
  const destinationXByEntity = filledInt32(world.entityCount, -1);
  const destinationYByEntity = filledInt32(world.entityCount, -1);
  const result: MutableIndividualRespawnEgressCollisionResult = {
    requestedCount: 0,
    movedCount: 0,
    yieldedCount: 0,
    waitCount: 0,
    sidestepCount: 0,
    backtrackCount: 0,
    downedSoftAvoidanceCount: 0,
    downedSoftCrossingCount: 0,
    egressPairNegotiationCount: 0,
    strategyChangeCount: 0,
    localQueryCount: 0,
    localCandidateCount: 0,
    sameTickOccupancyRefreshCount: 0,
  };
  const store: InternalIndividualRespawnEgressCollisionStore = {
    entityCount: world.entityCount,
    includedOccupancyFlags: new Uint8Array(world.entityCount),
    detourPhaseByEntity: new Uint8Array(world.entityCount),
    detourSideByEntity: new Int8Array(world.entityCount),
    detourTicksRemainingByEntity: new Uint16Array(world.entityCount),
    detourBlockerByEntity,
    destinationXByEntity,
    destinationYByEntity,
    attemptStartDistanceByEntity: new Int32Array(world.entityCount),
    normalProgressStreakByEntity: new Uint8Array(world.entityCount),
    principalBlockerByEntity,
    grid: createSpatialGrid({
      bounds: world.bounds,
      cellSize: EGRESS_COLLISION_CELL_SIZE,
      capacity: world.entityCount,
    }),
    result,
    resolvedDeltaX: 0,
    resolvedDeltaY: 0,
    preparedTick: -1,
    evaluationRelationship: INDIVIDUAL_COLLISION_RELATIONSHIP.none,
    evaluationBlockerEntityId: -1,
    evaluationSoftConflict: false,
    nearbyEntityIds: [],
    prepareForMovement(tick, activeEntityIds) {
      if (getIndividualPhysicalOccupancyProjectionTick(occupancy) !== tick) {
        throw new Error("Egress collision requires current-tick occupancy.");
      }
      resetResult(result);
      store.preparedTick = tick;
      store.resolvedDeltaX = 0;
      store.resolvedDeltaY = 0;
      if (activeEntityIds.length === 0) return;
      for (let index = 0; index < activeEntityIds.length; index += 1) {
        const entityId = activeEntityIds[index]!;
        if (occupancy.occupancyClassCodes[entityId] ===
            INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress) continue;
        refreshIndividualPhysicalOccupancyForPresenceTransition(
          occupancy,
          lifecycle,
          presence,
          entityId,
          tick,
        );
        result.sameTickOccupancyRefreshCount += 1;
      }
      for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
        const occupancyClass = occupancy.occupancyClassCodes[entityId]!;
        store.includedOccupancyFlags[entityId] = occupancyClass ===
          INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield ? 0 : 1;
        store.principalBlockerByEntity[entityId] = -1;
        if (occupancyClass !==
            INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress) {
          clearDetour(store, entityId, false);
        }
      }
      buildSpatialGrid(
        store.grid,
        world,
        (entityId) => store.includedOccupancyFlags[entityId] !== 0,
      );
    },
    resolveEgressStep(
      entityId,
      destinationX,
      destinationY,
      permittedDeltaX,
      permittedDeltaY,
    ) {
      resolveEgressStep(
        store,
        world,
        occupancy,
        collision,
        entityId,
        destinationX,
        destinationY,
        permittedDeltaX,
        permittedDeltaY,
      );
    },
    presenceStateChanged(entityId, tick) {
      assertPrepared(store, tick);
      refreshIndividualPhysicalOccupancyForPresenceTransition(
        occupancy,
        lifecycle,
        presence,
        entityId,
        tick,
      );
      result.sameTickOccupancyRefreshCount += 1;
      store.includedOccupancyFlags[entityId] =
        occupancy.occupancyClassCodes[entityId] ===
          INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield ? 0 : 1;
      if (store.includedOccupancyFlags[entityId] === 0) {
        clearDetour(store, entityId, false);
        store.principalBlockerByEntity[entityId] = -1;
      }
    },
  };
  return store;
}

function resolveEgressStep(
  store: InternalIndividualRespawnEgressCollisionStore,
  world: WorldState,
  occupancy: IndividualPhysicalOccupancyStore,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  destinationX: number,
  destinationY: number,
  permittedDeltaX: number,
  permittedDeltaY: number,
): void {
  if (store.preparedTick < 0) {
    throw new Error("Egress collision must be prepared before movement.");
  }
  store.resolvedDeltaX = 0;
  store.resolvedDeltaY = 0;
  const result = store.result as MutableIndividualRespawnEgressCollisionResult;
  result.requestedCount += 1;
  const candidateCountAtStart = result.localCandidateCount;
  if (
    store.destinationXByEntity[entityId] !== destinationX ||
    store.destinationYByEntity[entityId] !== destinationY
  ) {
    clearDetour(store, entityId, false);
    store.destinationXByEntity[entityId] = destinationX;
    store.destinationYByEntity[entityId] = destinationY;
  }
  const budgetSquared = permittedDeltaX * permittedDeltaX +
    permittedDeltaY * permittedDeltaY;
  if (budgetSquared === 0) {
    commitEvidence(
      store,
      collision,
      entityId,
      permittedDeltaX,
      permittedDeltaY,
      0,
      0,
      INDIVIDUAL_COLLISION_RELATIONSHIP.none,
      false,
      false,
    );
    return;
  }
  const queryRadius = absolute(permittedDeltaX) + absolute(permittedDeltaY) +
    occupancy.effectiveRadii[entityId]! +
    maximumOccupancyRadius(occupancy);
  if (queryRadius > EGRESS_COLLISION_MAX_QUERY_RADIUS) {
    throw new RangeError("Egress step exceeds the bounded collision query radius.");
  }
  const nearby = queryNearbyEntitiesInto(
    store.grid,
    world.positionsX[entityId]!,
    world.positionsY[entityId]!,
    queryRadius,
    store.nearbyEntityIds,
  );
  result.localQueryCount += 1;
  addNeighbourEvidence(collision, entityId, nearby.length - 1);

  if (candidateIsLegal(
    store,
    world,
    occupancy,
    entityId,
    permittedDeltaX,
    permittedDeltaY,
    budgetSquared,
    nearby,
    false,
  )) {
    const hadDetour = store.detourPhaseByEntity[entityId] !==
      INDIVIDUAL_EGRESS_DETOUR_PHASE.none;
    if (hadDetour) {
      store.normalProgressStreakByEntity[entityId] = Math.min(
        0xff,
        store.normalProgressStreakByEntity[entityId]! + 1,
      );
      if (store.normalProgressStreakByEntity[entityId]! >=
          EGRESS_NORMAL_PROGRESS_RESET_TICKS) {
        clearDetour(store, entityId, true);
      }
    }
    commitEvidence(
      store,
      collision,
      entityId,
      permittedDeltaX,
      permittedDeltaY,
      permittedDeltaX,
      permittedDeltaY,
      INDIVIDUAL_COLLISION_RELATIONSHIP.none,
      false,
      false,
    );
    addCandidateEvidence(
      collision,
      entityId,
      result.localCandidateCount - candidateCountAtStart,
    );
    result.movedCount += 1;
    return;
  }

  const relationship = store.evaluationRelationship;
  const blockerId = store.evaluationBlockerEntityId;
  const softConflict = store.evaluationSoftConflict;
  store.principalBlockerByEntity[entityId] = blockerId;
  store.normalProgressStreakByEntity[entityId] = 0;
  if (relationship === INDIVIDUAL_COLLISION_RELATIONSHIP.yieldingEgress) {
    result.egressPairNegotiationCount += 1;
  }
  if (store.detourPhaseByEntity[entityId] ===
      INDIVIDUAL_EGRESS_DETOUR_PHASE.none) {
    beginPhase(
      store,
      world,
      entityId,
      blockerId,
      permittedDeltaX,
      permittedDeltaY,
      INDIVIDUAL_EGRESS_DETOUR_PHASE.initialSide,
      preferredSide(
        world,
        entityId,
        blockerId,
        permittedDeltaX,
        permittedDeltaY,
      ),
      INDIVIDUAL_EGRESS_INITIAL_DETOUR_TICKS,
    );
  }
  store.detourBlockerByEntity[entityId] = blockerId;

  const forwardX = sign(permittedDeltaX);
  const forwardY = sign(permittedDeltaY);
  const side = store.detourSideByEntity[entityId]!;
  const lateralX = -forwardY * side;
  const lateralY = forwardX * side;
  const phase = store.detourPhaseByEntity[entityId]!;
  let chosenX = 0;
  let chosenY = 0;
  let selected = false;

  if (phase === INDIVIDUAL_EGRESS_DETOUR_PHASE.initialSide ||
      phase === INDIVIDUAL_EGRESS_DETOUR_PHASE.oppositeSide) {
    selected = tryCandidate(
      store, world, occupancy, entityId,
      forwardX + lateralX, forwardY + lateralY,
      budgetSquared, nearby, false,
    ) || tryCandidate(
      store, world, occupancy, entityId,
      lateralX, lateralY,
      budgetSquared, nearby, false,
    ) || tryCandidate(
      store, world, occupancy, entityId,
      forwardX, forwardY,
      budgetSquared, nearby, false,
    );
  } else {
    const elapsed = INDIVIDUAL_EGRESS_WIDE_DETOUR_TICKS -
      store.detourTicksRemainingByEntity[entityId]!;
    if (elapsed >= EGRESS_WIDE_INITIAL_WAIT_TICKS) {
      selected = tryCandidate(
        store, world, occupancy, entityId,
        -forwardX + lateralX, -forwardY + lateralY,
        budgetSquared, nearby, false,
      ) || tryCandidate(
        store, world, occupancy, entityId,
        -forwardX, -forwardY,
        budgetSquared, nearby, false,
      ) || tryCandidate(
        store, world, occupancy, entityId,
        lateralX, lateralY,
        budgetSquared, nearby, false,
      );
    }
  }
  if (selected) {
    chosenX = store.resolvedDeltaX;
    chosenY = store.resolvedDeltaY;
  }

  let softCrossing = false;
  if (!selected && softConflict && candidateIsLegal(
    store,
    world,
    occupancy,
    entityId,
    forwardX,
    forwardY,
    budgetSquared,
    nearby,
    true,
  )) {
    chosenX = forwardX;
    chosenY = forwardY;
    selected = true;
    softCrossing = true;
  }
  const softAvoidance = softConflict && selected && !softCrossing;
  addCandidateEvidence(
    collision,
    entityId,
    result.localCandidateCount - candidateCountAtStart,
  );
  commitEvidence(
    store,
    collision,
    entityId,
    permittedDeltaX,
    permittedDeltaY,
    chosenX,
    chosenY,
    relationship,
    softAvoidance,
    softCrossing,
  );
  result.yieldedCount += 1;
  if (!selected) result.waitCount += 1;
  else {
    result.movedCount += 1;
    const goalDot = chosenX * permittedDeltaX + chosenY * permittedDeltaY;
    if (goalDot < 0) result.backtrackCount += 1;
    else if (chosenX * permittedDeltaY !== chosenY * permittedDeltaX) {
      result.sidestepCount += 1;
    }
  }
  if (softAvoidance) result.downedSoftAvoidanceCount += 1;
  if (softCrossing) result.downedSoftCrossingCount += 1;
  advanceDetourTimer(store, world, entityId);
}

function tryCandidate(
  store: InternalIndividualRespawnEgressCollisionStore,
  world: WorldState,
  occupancy: IndividualPhysicalOccupancyStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
  nearby: readonly number[],
  allowSoftCrossing: boolean,
): boolean {
  if (!candidateIsLegal(
    store,
    world,
    occupancy,
    entityId,
    deltaX,
    deltaY,
    budgetSquared,
    nearby,
    allowSoftCrossing,
  )) return false;
  store.resolvedDeltaX = deltaX;
  store.resolvedDeltaY = deltaY;
  return true;
}

function candidateIsLegal(
  store: InternalIndividualRespawnEgressCollisionStore,
  world: WorldState,
  occupancy: IndividualPhysicalOccupancyStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
  nearby: readonly number[],
  allowSoftCrossing: boolean,
): boolean {
  store.evaluationRelationship = INDIVIDUAL_COLLISION_RELATIONSHIP.none;
  store.evaluationBlockerEntityId = -1;
  store.evaluationSoftConflict = false;
  if (deltaX === 0 && deltaY === 0 ||
      deltaX * deltaX + deltaY * deltaY > budgetSquared) return false;
  const startX = world.positionsX[entityId]!;
  const startY = world.positionsY[entityId]!;
  const finalX = startX + deltaX;
  const finalY = startY + deltaY;
  if (finalX < 0 || finalY < 0 || finalX >= world.bounds.width ||
      finalY >= world.bounds.height) return false;
  let blockerId = -1;
  let blockerDistanceSquared = Number.POSITIVE_INFINITY;
  let blockerRelationship: number = INDIVIDUAL_COLLISION_RELATIONSHIP.none;
  let softConflict = false;
  const result = store.result as MutableIndividualRespawnEgressCollisionResult;
  for (let index = 0; index < nearby.length; index += 1) {
    const otherId = nearby[index]!;
    if (otherId === entityId) continue;
    const otherClass = occupancy.occupancyClassCodes[otherId]!;
    if (otherClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield) {
      continue;
    }
    result.localCandidateCount += 1;
    const isSoft = otherClass ===
      INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.downedSoft;
    if (isSoft && allowSoftCrossing) continue;
    const otherX = world.positionsX[otherId]!;
    const otherY = world.positionsY[otherId]!;
    const combinedRadius = occupancy.effectiveRadii[entityId]! +
      occupancy.effectiveRadii[otherId]!;
    if (!movementPairCollides(
      startX,
      startY,
      deltaX,
      deltaY,
      otherX,
      otherY,
      combinedRadius,
    )) continue;
    const relativeX = otherX - startX;
    const relativeY = otherY - startY;
    const distanceSquared = relativeX * relativeX + relativeY * relativeY;
    if (distanceSquared < blockerDistanceSquared ||
        (distanceSquared === blockerDistanceSquared && otherId < blockerId)) {
      blockerId = otherId;
      blockerDistanceSquared = distanceSquared;
      blockerRelationship = relationshipFor(otherClass);
      softConflict = isSoft;
    }
  }
  if (blockerId < 0) return true;
  store.evaluationRelationship = blockerRelationship;
  store.evaluationBlockerEntityId = blockerId;
  store.evaluationSoftConflict = softConflict;
  return false;
}

function commitEvidence(
  store: InternalIndividualRespawnEgressCollisionStore,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  permittedDeltaX: number,
  permittedDeltaY: number,
  resolvedDeltaX: number,
  resolvedDeltaY: number,
  relationship: number,
  softAvoidance: boolean,
  softCrossing: boolean,
): void {
  store.resolvedDeltaX = resolvedDeltaX;
  store.resolvedDeltaY = resolvedDeltaY;
  recordIndividualCollisionResolvedStep(
    collision,
    entityId,
    permittedDeltaX,
    permittedDeltaY,
    resolvedDeltaX,
    resolvedDeltaY,
  );
  if (resolvedDeltaX !== permittedDeltaX || resolvedDeltaY !== permittedDeltaY) {
    collision.resolutionFlags[entityId] = collision.resolutionFlags[entityId]! |
      INDIVIDUAL_COLLISION_RESOLUTION_FLAG.yieldingEgressYield;
  }
  if (softAvoidance) {
    collision.resolutionFlags[entityId] = collision.resolutionFlags[entityId]! |
      INDIVIDUAL_COLLISION_RESOLUTION_FLAG.downedSoftAvoidance;
  }
  if (softCrossing) {
    collision.resolutionFlags[entityId] = collision.resolutionFlags[entityId]! |
      INDIVIDUAL_COLLISION_RESOLUTION_FLAG.downedSoftCrossing;
  }
  collision.principalOccupancyRelationshipCodes[entityId] = relationship;
  const phase = store.detourPhaseByEntity[entityId]!;
  collision.localDecisionCodes[entityId] = phase ===
      INDIVIDUAL_EGRESS_DETOUR_PHASE.none
    ? INDIVIDUAL_COLLISION_LOCAL_DECISION.none
    : INDIVIDUAL_COLLISION_LOCAL_DECISION.detour;
  collision.localDecisionPartnerByEntity[entityId] =
    store.detourBlockerByEntity[entityId]!;
  collision.localDecisionSideByEntity[entityId] =
    store.detourSideByEntity[entityId]!;
  collision.localDecisionTicksRemaining[entityId] =
    store.detourTicksRemainingByEntity[entityId]!;
  collision.localDecisionPhaseByEntity[entityId] = phase;
}

function advanceDetourTimer(
  store: InternalIndividualRespawnEgressCollisionStore,
  world: WorldState,
  entityId: number,
): void {
  if (store.detourTicksRemainingByEntity[entityId]! > 0) {
    store.detourTicksRemainingByEntity[entityId] =
      store.detourTicksRemainingByEntity[entityId]! - 1;
  }
  if (store.detourTicksRemainingByEntity[entityId]! > 0) return;
  const destinationDistance = manhattanDistance(
    world.positionsX[entityId]! + store.resolvedDeltaX,
    world.positionsY[entityId]! + store.resolvedDeltaY,
    store.destinationXByEntity[entityId]!,
    store.destinationYByEntity[entityId]!,
  );
  const progress = store.attemptStartDistanceByEntity[entityId]! -
    destinationDistance;
  const phase = store.detourPhaseByEntity[entityId]!;
  const duration = phase === INDIVIDUAL_EGRESS_DETOUR_PHASE.initialSide
    ? INDIVIDUAL_EGRESS_INITIAL_DETOUR_TICKS
    : phase === INDIVIDUAL_EGRESS_DETOUR_PHASE.oppositeSide
      ? INDIVIDUAL_EGRESS_OPPOSITE_DETOUR_TICKS
      : INDIVIDUAL_EGRESS_WIDE_DETOUR_TICKS;
  if (progress >= Math.max(2, Math.floor(duration / 10))) {
    clearDetour(store, entityId, true);
    return;
  }
  if (phase === INDIVIDUAL_EGRESS_DETOUR_PHASE.initialSide) {
    beginPhase(
      store,
      world,
      entityId,
      store.detourBlockerByEntity[entityId]!,
      0,
      0,
      INDIVIDUAL_EGRESS_DETOUR_PHASE.oppositeSide,
      -store.detourSideByEntity[entityId]!,
      INDIVIDUAL_EGRESS_OPPOSITE_DETOUR_TICKS,
    );
  } else if (phase === INDIVIDUAL_EGRESS_DETOUR_PHASE.oppositeSide) {
    beginPhase(
      store,
      world,
      entityId,
      store.detourBlockerByEntity[entityId]!,
      0,
      0,
      INDIVIDUAL_EGRESS_DETOUR_PHASE.widerAlternative,
      store.detourSideByEntity[entityId]!,
      INDIVIDUAL_EGRESS_WIDE_DETOUR_TICKS,
    );
  } else {
    store.detourTicksRemainingByEntity[entityId] =
      INDIVIDUAL_EGRESS_WIDE_DETOUR_TICKS;
    store.attemptStartDistanceByEntity[entityId] = destinationDistance;
  }
}

function beginPhase(
  store: InternalIndividualRespawnEgressCollisionStore,
  world: WorldState,
  entityId: number,
  blockerId: number,
  _desireX: number,
  _desireY: number,
  phase: number,
  side: number,
  duration: number,
): void {
  store.detourPhaseByEntity[entityId] = phase;
  store.detourSideByEntity[entityId] = side;
  store.detourTicksRemainingByEntity[entityId] = duration;
  store.detourBlockerByEntity[entityId] = blockerId;
  store.attemptStartDistanceByEntity[entityId] = manhattanDistance(
    world.positionsX[entityId]!,
    world.positionsY[entityId]!,
    store.destinationXByEntity[entityId]!,
    store.destinationYByEntity[entityId]!,
  );
  (store.result as MutableIndividualRespawnEgressCollisionResult)
    .strategyChangeCount += 1;
}

function clearDetour(
  store: InternalIndividualRespawnEgressCollisionStore,
  entityId: number,
  recordChange: boolean,
): void {
  if (recordChange && store.detourPhaseByEntity[entityId] !==
      INDIVIDUAL_EGRESS_DETOUR_PHASE.none) {
    (store.result as MutableIndividualRespawnEgressCollisionResult)
      .strategyChangeCount += 1;
  }
  store.detourPhaseByEntity[entityId] =
    INDIVIDUAL_EGRESS_DETOUR_PHASE.none;
  store.detourSideByEntity[entityId] = 0;
  store.detourTicksRemainingByEntity[entityId] = 0;
  store.detourBlockerByEntity[entityId] = -1;
  store.attemptStartDistanceByEntity[entityId] = 0;
  store.normalProgressStreakByEntity[entityId] = 0;
}

function preferredSide(
  world: WorldState,
  entityId: number,
  blockerId: number,
  forwardX: number,
  forwardY: number,
): number {
  if (blockerId >= 0) {
    const relativeX = world.positionsX[blockerId]! -
      world.positionsX[entityId]!;
    const relativeY = world.positionsY[blockerId]! -
      world.positionsY[entityId]!;
    const cross = forwardX * relativeY - forwardY * relativeX;
    if (cross !== 0) return cross > 0 ? -1 : 1;
    return ((Math.min(entityId, blockerId) + Math.max(entityId, blockerId)) & 1)
      === 0 ? 1 : -1;
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
  if (occupancyClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress) {
    return INDIVIDUAL_COLLISION_RELATIONSHIP.yieldingEgress;
  }
  return INDIVIDUAL_COLLISION_RELATIONSHIP.activeStanding;
}

function movementPairCollides(
  startX: number,
  startY: number,
  deltaX: number,
  deltaY: number,
  otherX: number,
  otherY: number,
  combinedRadius: number,
): boolean {
  const relativeStartX = otherX - startX;
  const relativeStartY = otherY - startY;
  const endX = relativeStartX - deltaX;
  const endY = relativeStartY - deltaY;
  const radiusSquared = combinedRadius * combinedRadius;
  const startDistanceSquared = relativeStartX * relativeStartX +
    relativeStartY * relativeStartY;
  const endDistanceSquared = endX * endX + endY * endY;
  if (startDistanceSquared < radiusSquared) {
    return endDistanceSquared <= startDistanceSquared;
  }
  if (endDistanceSquared < radiusSquared) return true;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const closestNumerator = relativeStartX * deltaX + relativeStartY * deltaY;
  if (closestNumerator <= 0 || closestNumerator >= lengthSquared) return false;
  const cross = relativeStartX * deltaY - relativeStartY * deltaX;
  return cross * cross < radiusSquared * lengthSquared;
}

function maximumOccupancyRadius(
  occupancy: IndividualPhysicalOccupancyStore,
): number {
  return Math.max(
    occupancy.geometry.activeStandingRadius,
    occupancy.geometry.assistedMovingRadius,
    occupancy.geometry.downedSoftRadius,
    occupancy.geometry.yieldingEgressRadius,
  );
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
  if (count <= 0) return;
  collision.localCandidateCounts[entityId] = Math.min(
    MAX_UINT16,
    collision.localCandidateCounts[entityId]! + count,
  );
}

function manhattanDistance(
  x: number,
  y: number,
  destinationX: number,
  destinationY: number,
): number {
  return absolute(destinationX - x) + absolute(destinationY - y);
}

function resetResult(result: MutableIndividualRespawnEgressCollisionResult): void {
  result.requestedCount = 0;
  result.movedCount = 0;
  result.yieldedCount = 0;
  result.waitCount = 0;
  result.sidestepCount = 0;
  result.backtrackCount = 0;
  result.downedSoftAvoidanceCount = 0;
  result.downedSoftCrossingCount = 0;
  result.egressPairNegotiationCount = 0;
  result.strategyChangeCount = 0;
  result.localQueryCount = 0;
  result.localCandidateCount = 0;
  result.sameTickOccupancyRefreshCount = 0;
}

function assertPrepared(
  store: InternalIndividualRespawnEgressCollisionStore,
  tick: number,
): void {
  if (store.preparedTick !== tick) {
    throw new Error("Egress occupancy transition requires the prepared tick.");
  }
}

function validateEntityCounts(
  entityCount: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  for (let index = 0; index < stores.length; index += 1) {
    if (stores[index]!.entityCount !== entityCount) {
      throw new RangeError("Egress collision stores must share entityCount.");
    }
  }
}

function filledInt32(length: number, value: number): Int32Array {
  const array = new Int32Array(length);
  array.fill(value);
  return array;
}

function sign(value: number): number {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}

function absolute(value: number): number {
  return value < 0 ? -value : value;
}
