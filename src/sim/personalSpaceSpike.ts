import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  PERSONAL_SPACE_OCCUPANCY_CLASS_CODE,
  PERSONAL_SPACE_DETOUR_PHASE,
  PERSONAL_SPACE_RELATIONSHIP_CODE,
  PERSONAL_SPACE_RESOLUTION_FLAG,
  type PersonalSpaceSpikeDebugSnapshot,
  type PersonalSpaceSpikeOccupancyClass,
  type PersonalSpaceSpikeScenario,
  type WorldState,
} from "./types";

const MAXIMUM_SPIKE_STEP_PER_AXIS = 2;
const MAXIMUM_CANDIDATES_PER_ENTITY = 10;
const INITIAL_DETOUR_TICKS = 2 * 20;
const OPPOSITE_DETOUR_TICKS = 5 * 20;
const WIDE_DETOUR_TICKS = 10 * 20;
const CANDIDATE_NORMAL = 0;
const CANDIDATE_AVOIDANCE = 1;
const CANDIDATE_REDUCED_FORWARD = 2;
const CANDIDATE_STATIONARY = 3;
const CANDIDATE_WIDE_ALTERNATIVE = 4;
const NO_RELATIONSHIP = PERSONAL_SPACE_RELATIONSHIP_CODE.none;

const occupancyClassNames = [
  "activeStanding",
  "downedSoft",
  "assistedMoving",
  "yieldingEgress",
  "nonBattlefield",
] as const satisfies readonly PersonalSpaceSpikeOccupancyClass[];

export interface PersonalSpaceSpikeStore {
  readonly entityCount: number;
  readonly debugSnapshot: PersonalSpaceSpikeDebugSnapshot;
}

interface MutablePersonalSpaceSpikeDebugSnapshot
  extends PersonalSpaceSpikeDebugSnapshot {
  resolutionPassCount: number;
  localQueryCount: number;
  localCandidateCount: number;
  unresolvedStandingOverlapCount: number;
  fallbackResetCount: number;
  blockedCount: number;
  reducedCount: number;
  redirectedCount: number;
  downedSoftCrossingCount: number;
  yieldingEgressYieldCount: number;
  detourStrategyChangeCount: number;
}

interface InternalPersonalSpaceSpikeStore extends PersonalSpaceSpikeStore {
  readonly occupancyClassByEntity: Uint8Array;
  readonly teamIdByEntity: Uint8Array;
  readonly requestedDeltaXByEntity: Int8Array;
  readonly requestedDeltaYByEntity: Int8Array;
  readonly startXByEntity: Int32Array;
  readonly startYByEntity: Int32Array;
  readonly proposedXByEntity: Int32Array;
  readonly proposedYByEntity: Int32Array;
  readonly candidateXBySlot: Int32Array;
  readonly candidateYBySlot: Int32Array;
  readonly candidateKindBySlot: Uint8Array;
  readonly candidateCountByEntity: Uint8Array;
  readonly selectedCandidateByEntity: Uint8Array;
  readonly desireOriginXByEntity: Int32Array;
  readonly desireOriginYByEntity: Int32Array;
  readonly detourAttemptStartProgressByEntity: Int32Array;
  readonly detourAttemptDurationByEntity: Uint16Array;
  readonly previousRequestedDeltaXByEntity: Int8Array;
  readonly previousRequestedDeltaYByEntity: Int8Array;
  readonly fallbackMarkedByEntity: Uint8Array;
  readonly fallbackQueue: Uint32Array;
  readonly normalProgressStreakByEntity: Uint8Array;
  readonly proposalWorld: WorldState;
  readonly proposalGrid: SpatialGrid;
  readonly nearbyEntityIds: number[];
  readonly debug: MutablePersonalSpaceSpikeDebugSnapshot;
  readonly maximumNeighbourQueryRadius: number;
}

const internals = new WeakMap<
  PersonalSpaceSpikeStore,
  InternalPersonalSpaceSpikeStore
>();

export function createPersonalSpaceSpikeStore(
  world: WorldState,
  scenario: PersonalSpaceSpikeScenario,
): PersonalSpaceSpikeStore {
  validateScenarioHeader(world, scenario);
  const entityCount = world.entityCount;
  const occupancyClassByEntity = new Uint8Array(entityCount);
  const teamIdByEntity = new Uint8Array(entityCount);
  const requestedDeltaXByEntity = new Int8Array(entityCount);
  const requestedDeltaYByEntity = new Int8Array(entityCount);
  const radii = new Uint8Array(entityCount);
  const seen = new Uint8Array(entityCount);

  for (let index = 0; index < scenario.entities.length; index += 1) {
    const entity = scenario.entities[index]!;
    validateEntityScenario(entity, world);
    if (seen[entity.entityId] !== 0) {
      throw new RangeError("Personal-space spike entity IDs must be unique.");
    }
    seen[entity.entityId] = 1;
    const classCode = PERSONAL_SPACE_OCCUPANCY_CLASS_CODE[
      entity.occupancyClass
    ];
    occupancyClassByEntity[entity.entityId] = classCode;
    teamIdByEntity[entity.entityId] = entity.teamId;
    requestedDeltaXByEntity[entity.entityId] = entity.requestedDeltaX;
    requestedDeltaYByEntity[entity.entityId] = entity.requestedDeltaY;
    radii[entity.entityId] = entity.occupancyClass === "downedSoft"
      ? scenario.downedSoftRadius
      : entity.occupancyClass === "nonBattlefield"
        ? 0
        : scenario.standingRadius;
    world.positionsX[entity.entityId] = entity.x;
    world.positionsY[entity.entityId] = entity.y;
    world.velocitiesX[entity.entityId] = 0;
    world.velocitiesY[entity.entityId] = 0;
  }
  for (let entityId = 0; entityId < entityCount; entityId += 1) {
    if (seen[entityId] === 0) {
      throw new RangeError(
        "Personal-space spike requires exactly one configuration per entity ID.",
      );
    }
  }

  const startXByEntity = new Int32Array(entityCount);
  const startYByEntity = new Int32Array(entityCount);
  const proposedXByEntity = new Int32Array(entityCount);
  const proposedYByEntity = new Int32Array(entityCount);
  proposedXByEntity.set(world.positionsX);
  proposedYByEntity.set(world.positionsY);
  const proposalWorld: WorldState = {
    entityCount,
    bounds: world.bounds,
    ids: world.ids,
    positionsX: proposedXByEntity,
    positionsY: proposedYByEntity,
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const proposalGrid = createSpatialGrid({
    bounds: world.bounds,
    cellSize: Math.max(
      scenario.standingRadius * 2,
      scenario.downedSoftRadius * 2,
    ),
    capacity: entityCount,
  });
  const occupancyClassCodes = occupancyClassByEntity.slice();
  const debug: MutablePersonalSpaceSpikeDebugSnapshot = {
    algorithm: "boundedDiscreteCandidateRelaxation",
    standingRadius: scenario.standingRadius,
    downedSoftRadius: scenario.downedSoftRadius,
    maximumResolutionPasses: scenario.maximumResolutionPasses,
    resolutionPassCount: 0,
    localQueryCount: 0,
    localCandidateCount: 0,
    unresolvedStandingOverlapCount: 0,
    fallbackResetCount: 0,
    blockedCount: 0,
    reducedCount: 0,
    redirectedCount: 0,
    downedSoftCrossingCount: 0,
    yieldingEgressYieldCount: 0,
    detourStrategyChangeCount: 0,
    occupancyClassCodes,
    radii,
    intendedDeltas: new Int32Array(entityCount * 2),
    resolvedDeltas: new Int32Array(entityCount * 2),
    localNeighbourCounts: new Uint16Array(entityCount),
    principalRelationshipCodes: new Uint8Array(entityCount),
    resolutionFlags: new Uint8Array(entityCount),
    detourPhaseCodes: new Uint8Array(entityCount),
    detourSideByEntity: new Int8Array(entityCount),
    detourTicksRemaining: new Uint16Array(entityCount),
  };
  const store: InternalPersonalSpaceSpikeStore = {
    entityCount,
    debugSnapshot: debug,
    occupancyClassByEntity,
    teamIdByEntity,
    requestedDeltaXByEntity,
    requestedDeltaYByEntity,
    startXByEntity,
    startYByEntity,
    proposedXByEntity,
    proposedYByEntity,
    candidateXBySlot: new Int32Array(
      entityCount * MAXIMUM_CANDIDATES_PER_ENTITY,
    ),
    candidateYBySlot: new Int32Array(
      entityCount * MAXIMUM_CANDIDATES_PER_ENTITY,
    ),
    candidateKindBySlot: new Uint8Array(
      entityCount * MAXIMUM_CANDIDATES_PER_ENTITY,
    ),
    candidateCountByEntity: new Uint8Array(entityCount),
    selectedCandidateByEntity: new Uint8Array(entityCount),
    desireOriginXByEntity: world.positionsX.slice(),
    desireOriginYByEntity: world.positionsY.slice(),
    detourAttemptStartProgressByEntity: new Int32Array(entityCount),
    detourAttemptDurationByEntity: new Uint16Array(entityCount),
    previousRequestedDeltaXByEntity: requestedDeltaXByEntity.slice(),
    previousRequestedDeltaYByEntity: requestedDeltaYByEntity.slice(),
    fallbackMarkedByEntity: new Uint8Array(entityCount),
    fallbackQueue: new Uint32Array(entityCount),
    normalProgressStreakByEntity: new Uint8Array(entityCount),
    proposalWorld,
    proposalGrid,
    nearbyEntityIds: [],
    debug,
    maximumNeighbourQueryRadius:
      scenario.standingRadius +
      Math.max(scenario.standingRadius, scenario.downedSoftRadius),
  };
  internals.set(store, store);
  assertInitialStandingSpace(store);
  return store;
}

export function advancePersonalSpaceSpikeOneTick(
  world: WorldState,
  store: PersonalSpaceSpikeStore,
): void {
  const internal = requireStore(store, world);
  resetTickDiagnostics(internal);
  internal.startXByEntity.set(world.positionsX);
  internal.startYByEntity.set(world.positionsY);

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    buildMovementCandidates(internal, world, entityId);
    internal.selectedCandidateByEntity[entityId] = 0;
    internal.proposedXByEntity[entityId] = candidateX(internal, entityId, 0);
    internal.proposedYByEntity[entityId] = candidateY(internal, entityId, 0);
  }

  for (
    let pass = 0;
    pass < internal.debug.maximumResolutionPasses;
    pass += 1
  ) {
    internal.debug.resolutionPassCount = pass + 1;
    buildSpatialGrid(internal.proposalGrid, internal.proposalWorld);
    let changedCount = 0;
    for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
      if (!isSelfPropelledClass(internal.occupancyClassByEntity[entityId]!)) {
        continue;
      }
      const currentCandidate = internal.selectedCandidateByEntity[entityId]!;
      const relationshipCode = evaluateCandidate(
        internal,
        entityId,
        currentCandidate,
        true,
      );
      if (relationshipCode === NO_RELATIONSHIP) continue;
      if (
        internal.debug.principalRelationshipCodes[entityId] === NO_RELATIONSHIP
      ) {
        internal.debug.principalRelationshipCodes[entityId] =
          relationshipCode;
      }
      const nextCandidate = findNextCandidate(
        internal,
        entityId,
        currentCandidate + 1,
        relationshipCode,
      );
      if (nextCandidate === currentCandidate) continue;
      internal.selectedCandidateByEntity[entityId] = nextCandidate;
      internal.proposedXByEntity[entityId] = candidateX(
        internal,
        entityId,
        nextCandidate,
      );
      internal.proposedYByEntity[entityId] = candidateY(
        internal,
        entityId,
        nextCandidate,
      );
      changedCount += 1;
    }
    if (changedCount === 0) break;
  }

  buildSpatialGrid(internal.proposalGrid, internal.proposalWorld);
  internal.debug.unresolvedStandingOverlapCount =
    countIllegalStandingOverlaps(internal);
  if (internal.debug.unresolvedStandingOverlapCount > 0) {
    applyConservativeOriginFallback(internal);
    buildSpatialGrid(internal.proposalGrid, internal.proposalWorld);
    internal.debug.unresolvedStandingOverlapCount =
      countIllegalStandingOverlaps(internal);
    if (internal.debug.unresolvedStandingOverlapCount > 0) {
      applyFullOriginFallback(internal);
      buildSpatialGrid(internal.proposalGrid, internal.proposalWorld);
      internal.debug.unresolvedStandingOverlapCount =
        countIllegalStandingOverlaps(internal);
    }
  }
  finalizeResolvedMovement(world, internal);
}

function buildMovementCandidates(
  store: InternalPersonalSpaceSpikeStore,
  world: WorldState,
  entityId: number,
): void {
  const classCode = store.occupancyClassByEntity[entityId]!;
  const startX = world.positionsX[entityId]!;
  const startY = world.positionsY[entityId]!;
  store.startXByEntity[entityId] = startX;
  store.startYByEntity[entityId] = startY;
  store.candidateCountByEntity[entityId] = 0;

  if (!isSelfPropelledClass(classCode)) {
    addCandidate(store, entityId, startX, startY, CANDIDATE_STATIONARY);
    setIntendedDelta(store, entityId, 0, 0);
    return;
  }

  const requestedDeltaX = store.requestedDeltaXByEntity[entityId]!;
  const requestedDeltaY = store.requestedDeltaYByEntity[entityId]!;
  if (
    requestedDeltaX !== store.previousRequestedDeltaXByEntity[entityId] ||
    requestedDeltaY !== store.previousRequestedDeltaYByEntity[entityId]
  ) {
    store.desireOriginXByEntity[entityId] = startX;
    store.desireOriginYByEntity[entityId] = startY;
    store.previousRequestedDeltaXByEntity[entityId] = requestedDeltaX;
    store.previousRequestedDeltaYByEntity[entityId] = requestedDeltaY;
    resetDetourEpisode(store, entityId);
  }
  const requestedX = startX + requestedDeltaX;
  const requestedY = startY + requestedDeltaY;
  const intendedX = clamp(requestedX, 0, world.bounds.width - 1);
  const intendedY = clamp(requestedY, 0, world.bounds.height - 1);
  const intendedDeltaX = intendedX - startX;
  const intendedDeltaY = intendedY - startY;
  setIntendedDelta(store, entityId, intendedDeltaX, intendedDeltaY);
  if (requestedX !== intendedX || requestedY !== intendedY) {
    store.debug.principalRelationshipCodes[entityId] =
      PERSONAL_SPACE_RELATIONSHIP_CODE.worldBounds;
  }
  const movementBudgetSquared =
    intendedDeltaX * intendedDeltaX + intendedDeltaY * intendedDeltaY;
  if (movementBudgetSquared === 0) {
    addCandidate(store, entityId, intendedX, intendedY, CANDIDATE_NORMAL);
    resetDetourEpisode(store, entityId);
    return;
  }

  const forwardX = Math.sign(intendedDeltaX);
  const forwardY = Math.sign(intendedDeltaY);
  const phase = store.debug.detourPhaseCodes[entityId]!;
  const crossTrack = desireLineCrossTrack(store, entityId, startX, startY);
  if (crossTrack !== 0 && phase === PERSONAL_SPACE_DETOUR_PHASE.none) {
    const reacquireSide = Math.sign(crossTrack);
    addBoundedDeltaCandidate(
      store,
      entityId,
      -forwardY * reacquireSide,
      forwardX * reacquireSide,
      movementBudgetSquared,
      CANDIDATE_AVOIDANCE,
    );
  }
  addCandidate(store, entityId, intendedX, intendedY, CANDIDATE_NORMAL);

  const baseSide = phase === PERSONAL_SPACE_DETOUR_PHASE.none
    ? ((entityId & 1) === 0 ? 1 : -1)
    : store.debug.detourSideByEntity[entityId]!;
  const preferredSide = baseSide === 0 ? 1 : baseSide;
  const perpendicularX = -forwardY * preferredSide;
  const perpendicularY = forwardX * preferredSide;
  addBoundedDeltaCandidate(
    store,
    entityId,
    forwardX + perpendicularX,
    forwardY + perpendicularY,
    movementBudgetSquared,
    CANDIDATE_AVOIDANCE,
  );
  addBoundedDeltaCandidate(
    store,
    entityId,
    perpendicularX,
    perpendicularY,
    movementBudgetSquared,
    CANDIDATE_AVOIDANCE,
  );
  addBoundedDeltaCandidate(
    store,
    entityId,
    forwardX,
    forwardY,
    movementBudgetSquared,
    CANDIDATE_REDUCED_FORWARD,
  );
  if (phase === PERSONAL_SPACE_DETOUR_PHASE.none) {
    addBoundedDeltaCandidate(
      store,
      entityId,
      forwardX - perpendicularX,
      forwardY - perpendicularY,
      movementBudgetSquared,
      CANDIDATE_AVOIDANCE,
    );
    addBoundedDeltaCandidate(
      store,
      entityId,
      -perpendicularX,
      -perpendicularY,
      movementBudgetSquared,
      CANDIDATE_AVOIDANCE,
    );
  }
  if (phase === PERSONAL_SPACE_DETOUR_PHASE.widerAlternative) {
    addBoundedDeltaCandidate(
      store,
      entityId,
      -forwardX + perpendicularX,
      -forwardY + perpendicularY,
      movementBudgetSquared,
      CANDIDATE_WIDE_ALTERNATIVE,
    );
    addBoundedDeltaCandidate(
      store,
      entityId,
      -forwardX,
      -forwardY,
      movementBudgetSquared,
      CANDIDATE_WIDE_ALTERNATIVE,
    );
  }
  if (classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress) {
    addBoundedDeltaCandidate(
      store,
      entityId,
      -forwardX,
      -forwardY,
      movementBudgetSquared,
      CANDIDATE_WIDE_ALTERNATIVE,
    );
  }
  addCandidate(store, entityId, startX, startY, CANDIDATE_STATIONARY);
}

function findNextCandidate(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  firstCandidate: number,
  relationshipCode: number,
): number {
  const candidateCount = store.candidateCountByEntity[entityId]!;
  if (
    relationshipCode === PERSONAL_SPACE_RELATIONSHIP_CODE.downedSoft &&
    (entityId % 3 === 0 ||
      store.debug.detourPhaseCodes[entityId]! >=
        PERSONAL_SPACE_DETOUR_PHASE.oppositeSide)
  ) {
    for (let candidateIndex = firstCandidate;
      candidateIndex < candidateCount;
      candidateIndex += 1) {
      if (
        candidateKind(store, entityId, candidateIndex) ===
          CANDIDATE_REDUCED_FORWARD &&
        evaluateCandidate(store, entityId, candidateIndex, false) ===
          NO_RELATIONSHIP
      ) return candidateIndex;
    }
  }
  for (
    let candidateIndex = firstCandidate;
    candidateIndex < candidateCount;
    candidateIndex += 1
  ) {
    const kind = candidateKind(store, entityId, candidateIndex);
    if (
      relationshipCode === PERSONAL_SPACE_RELATIONSHIP_CODE.hostileStanding &&
      kind !== CANDIDATE_REDUCED_FORWARD &&
      kind !== CANDIDATE_STATIONARY
    ) {
      continue;
    }
    if (
      evaluateCandidate(store, entityId, candidateIndex, false) ===
      NO_RELATIONSHIP
    ) {
      return candidateIndex;
    }
  }
  return Math.max(0, candidateCount - 1);
}

function evaluateCandidate(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  candidateIndex: number,
  captureNeighbourCount: boolean,
): number {
  const x = candidateX(store, entityId, candidateIndex);
  const y = candidateY(store, entityId, candidateIndex);
  const nearby = queryEntitiesWithinRadiusInto(
    store.proposalGrid,
    x,
    y,
    store.maximumNeighbourQueryRadius,
    store.nearbyEntityIds,
  );
  store.debug.localQueryCount += 1;
  store.debug.localCandidateCount += nearby.length;
  if (captureNeighbourCount) {
    store.debug.localNeighbourCounts[entityId] = Math.min(
      0xff_ff,
      Math.max(0, nearby.length - 1),
    );
  }

  const moverClass = store.occupancyClassByEntity[entityId]!;
  const moverRadius = store.debug.radii[entityId]!;
  const allowsSoftCrossing =
    candidateKind(store, entityId, candidateIndex) ===
      CANDIDATE_REDUCED_FORWARD &&
    moverClass !== PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress;
  for (let index = 0; index < nearby.length; index += 1) {
    const neighbourId = nearby[index]!;
    if (neighbourId === entityId) continue;
    const neighbourClass = store.occupancyClassByEntity[neighbourId]!;
    if (neighbourClass === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.nonBattlefield) {
      continue;
    }
    const deltaX = store.proposedXByEntity[neighbourId]! - x;
    const deltaY = store.proposedYByEntity[neighbourId]! - y;
    const minimumDistance = moverRadius + store.debug.radii[neighbourId]!;
    if (
      deltaX * deltaX + deltaY * deltaY >=
      minimumDistance * minimumDistance
    ) {
      continue;
    }
    if (neighbourClass === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.downedSoft) {
      if (allowsSoftCrossing) continue;
      return PERSONAL_SPACE_RELATIONSHIP_CODE.downedSoft;
    }
    if (moverClass === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.downedSoft) continue;
    const moverPriority = movementPriority(moverClass);
    const neighbourPriority = movementPriority(neighbourClass);
    if (moverPriority > neighbourPriority) continue;
    if (
      moverPriority === neighbourPriority &&
      (crossingDesireHasRightOfWay(store, entityId, neighbourId) ||
        sameDirectionLeaderHasRightOfWay(store, entityId, neighbourId))
    ) continue;
    return relationshipCodeFor(store, entityId, neighbourId);
  }
  return NO_RELATIONSHIP;
}

function countIllegalStandingOverlaps(
  store: InternalPersonalSpaceSpikeStore,
): number {
  let overlapCount = 0;
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    const entityClass = store.occupancyClassByEntity[entityId]!;
    if (!isHardStandingClass(entityClass)) continue;
    const nearby = queryEntitiesWithinRadiusInto(
      store.proposalGrid,
      store.proposedXByEntity[entityId]!,
      store.proposedYByEntity[entityId]!,
      store.maximumNeighbourQueryRadius,
      store.nearbyEntityIds,
    );
    store.debug.localQueryCount += 1;
    store.debug.localCandidateCount += nearby.length;
    for (let index = 0; index < nearby.length; index += 1) {
      const neighbourId = nearby[index]!;
      if (neighbourId <= entityId) continue;
      const neighbourClass = store.occupancyClassByEntity[neighbourId]!;
      if (!isHardStandingClass(neighbourClass)) continue;
      const deltaX = store.proposedXByEntity[neighbourId]! -
        store.proposedXByEntity[entityId]!;
      const deltaY = store.proposedYByEntity[neighbourId]! -
        store.proposedYByEntity[entityId]!;
      const minimumDistance = store.debug.radii[entityId]! +
        store.debug.radii[neighbourId]!;
      if (
        deltaX * deltaX + deltaY * deltaY <
        minimumDistance * minimumDistance
      ) overlapCount += 1;
    }
  }
  return overlapCount;
}

function applyConservativeOriginFallback(
  store: InternalPersonalSpaceSpikeStore,
): void {
  let resetCount = 0;
  const maximumLocalFallbackPasses = Math.min(
    2,
    store.debug.maximumResolutionPasses,
  );
  for (let pass = 0; pass < maximumLocalFallbackPasses; pass += 1) {
    store.fallbackMarkedByEntity.fill(0);
    markIllegalStandingOverlaps(store, store.fallbackMarkedByEntity);
    let markedCount = 0;
    for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
      if (store.fallbackMarkedByEntity[entityId] === 0) continue;
      markedCount += 1;
      if (
        store.proposedXByEntity[entityId] !== store.startXByEntity[entityId] ||
        store.proposedYByEntity[entityId] !== store.startYByEntity[entityId]
      ) resetCount += 1;
      store.proposedXByEntity[entityId] = store.startXByEntity[entityId]!;
      store.proposedYByEntity[entityId] = store.startYByEntity[entityId]!;
      store.selectedCandidateByEntity[entityId] =
        store.candidateCountByEntity[entityId]! - 1;
    }
    if (markedCount === 0) break;
    buildSpatialGrid(store.proposalGrid, store.proposalWorld);
  }
  store.debug.fallbackResetCount = resetCount;
}

function markIllegalStandingOverlaps(
  store: InternalPersonalSpaceSpikeStore,
  marked: Uint8Array,
): void {
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    if (!isHardStandingClass(store.occupancyClassByEntity[entityId]!)) continue;
    const nearby = queryEntitiesWithinRadiusInto(
      store.proposalGrid,
      store.proposedXByEntity[entityId]!,
      store.proposedYByEntity[entityId]!,
      store.maximumNeighbourQueryRadius,
      store.nearbyEntityIds,
    );
    store.debug.localQueryCount += 1;
    store.debug.localCandidateCount += nearby.length;
    for (let index = 0; index < nearby.length; index += 1) {
      const neighbourId = nearby[index]!;
      if (neighbourId <= entityId ||
        !isHardStandingClass(store.occupancyClassByEntity[neighbourId]!)) {
        continue;
      }
      const deltaX = store.proposedXByEntity[neighbourId]! -
        store.proposedXByEntity[entityId]!;
      const deltaY = store.proposedYByEntity[neighbourId]! -
        store.proposedYByEntity[entityId]!;
      const minimumDistance = store.debug.radii[entityId]! +
        store.debug.radii[neighbourId]!;
      if (deltaX * deltaX + deltaY * deltaY < minimumDistance * minimumDistance) {
        marked[entityId] = 1;
        marked[neighbourId] = 1;
      }
    }
  }
}

function applyFullOriginFallback(
  store: InternalPersonalSpaceSpikeStore,
): void {
  let resetCount = store.debug.fallbackResetCount;
  store.fallbackMarkedByEntity.fill(0);
  markIllegalStandingOverlaps(store, store.fallbackMarkedByEntity);
  let queueLength = 0;
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    if (store.fallbackMarkedByEntity[entityId] === 0) continue;
    store.fallbackQueue[queueLength] = entityId;
    queueLength += 1;
  }
  for (let queueIndex = 0; queueIndex < queueLength; queueIndex += 1) {
    const entityId = store.fallbackQueue[queueIndex]!;
    const x = store.proposedXByEntity[entityId]!;
    const y = store.proposedYByEntity[entityId]!;
    const nearby = queryEntitiesWithinRadiusInto(
      store.proposalGrid,
      x,
      y,
      store.maximumNeighbourQueryRadius + MAXIMUM_SPIKE_STEP_PER_AXIS * 2,
      store.nearbyEntityIds,
    );
    store.debug.localQueryCount += 1;
    store.debug.localCandidateCount += nearby.length;
    for (let index = 0; index < nearby.length; index += 1) {
      const neighbourId = nearby[index]!;
      if (store.fallbackMarkedByEntity[neighbourId] !== 0 ||
        !isHardStandingClass(store.occupancyClassByEntity[neighbourId]!)) {
        continue;
      }
      const dx = store.proposedXByEntity[neighbourId]! - x;
      const dy = store.proposedYByEntity[neighbourId]! - y;
      const connectedDistance = store.debug.radii[entityId]! +
        store.debug.radii[neighbourId]! + MAXIMUM_SPIKE_STEP_PER_AXIS * 2;
      if (dx * dx + dy * dy > connectedDistance * connectedDistance) continue;
      store.fallbackMarkedByEntity[neighbourId] = 1;
      store.fallbackQueue[queueLength] = neighbourId;
      queueLength += 1;
    }
  }
  for (let queueIndex = 0; queueIndex < queueLength; queueIndex += 1) {
    const entityId = store.fallbackQueue[queueIndex]!;
    if (
      store.proposedXByEntity[entityId] !== store.startXByEntity[entityId] ||
      store.proposedYByEntity[entityId] !== store.startYByEntity[entityId]
    ) resetCount += 1;
    store.proposedXByEntity[entityId] = store.startXByEntity[entityId]!;
    store.proposedYByEntity[entityId] = store.startYByEntity[entityId]!;
    store.selectedCandidateByEntity[entityId] =
      store.candidateCountByEntity[entityId]! - 1;
  }
  store.debug.fallbackResetCount = resetCount;
}

function finalizeResolvedMovement(
  world: WorldState,
  store: InternalPersonalSpaceSpikeStore,
): void {
  const debug = store.debug;
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    const offset = entityId * 2;
    const intendedDeltaX = debug.intendedDeltas[offset]!;
    const intendedDeltaY = debug.intendedDeltas[offset + 1]!;
    const resolvedDeltaX = store.proposedXByEntity[entityId]! -
      store.startXByEntity[entityId]!;
    const resolvedDeltaY = store.proposedYByEntity[entityId]! -
      store.startYByEntity[entityId]!;
    debug.resolvedDeltas[offset] = resolvedDeltaX;
    debug.resolvedDeltas[offset + 1] = resolvedDeltaY;
    let flags = 0;
    const intendedDistanceSquared =
      intendedDeltaX * intendedDeltaX + intendedDeltaY * intendedDeltaY;
    const resolvedDistanceSquared =
      resolvedDeltaX * resolvedDeltaX + resolvedDeltaY * resolvedDeltaY;
    if (intendedDistanceSquared > 0 && resolvedDistanceSquared === 0) {
      flags |= PERSONAL_SPACE_RESOLUTION_FLAG.blocked;
      debug.blockedCount += 1;
    } else if (resolvedDistanceSquared < intendedDistanceSquared) {
      flags |= PERSONAL_SPACE_RESOLUTION_FLAG.reduced;
      debug.reducedCount += 1;
    }
    if (
      resolvedDistanceSquared > 0 &&
      resolvedDeltaX * intendedDeltaY !== resolvedDeltaY * intendedDeltaX
    ) {
      flags |= PERSONAL_SPACE_RESOLUTION_FLAG.redirected;
      debug.redirectedCount += 1;
    }
    if (
      candidateKind(
        store,
        entityId,
        store.selectedCandidateByEntity[entityId]!,
      ) === CANDIDATE_REDUCED_FORWARD &&
      overlapsDownedSoftAtResolvedPosition(store, entityId)
    ) {
      flags |= PERSONAL_SPACE_RESOLUTION_FLAG.downedSoftCrossing;
      debug.downedSoftCrossingCount += 1;
    }
    if (
      store.occupancyClassByEntity[entityId] ===
        PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress &&
      (resolvedDeltaX !== intendedDeltaX || resolvedDeltaY !== intendedDeltaY)
    ) {
      flags |= PERSONAL_SPACE_RESOLUTION_FLAG.yieldingEgressYield;
      debug.yieldingEgressYieldCount += 1;
    }
    updateDetourEpisode(
      store,
      entityId,
      resolvedDeltaX,
      resolvedDeltaY,
      intendedDeltaX,
      intendedDeltaY,
    );
    if (
      debug.detourPhaseCodes[entityId] !== PERSONAL_SPACE_DETOUR_PHASE.none
    ) flags |= PERSONAL_SPACE_RESOLUTION_FLAG.detourActive;
    debug.resolutionFlags[entityId] = flags;
    world.positionsX[entityId] = store.proposedXByEntity[entityId]!;
    world.positionsY[entityId] = store.proposedYByEntity[entityId]!;
    world.velocitiesX[entityId] = resolvedDeltaX;
    world.velocitiesY[entityId] = resolvedDeltaY;
  }
}

function overlapsDownedSoftAtResolvedPosition(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
): boolean {
  const x = store.proposedXByEntity[entityId]!;
  const y = store.proposedYByEntity[entityId]!;
  const nearby = queryEntitiesWithinRadiusInto(
    store.proposalGrid,
    x,
    y,
    store.maximumNeighbourQueryRadius,
    store.nearbyEntityIds,
  );
  store.debug.localQueryCount += 1;
  store.debug.localCandidateCount += nearby.length;
  for (let index = 0; index < nearby.length; index += 1) {
    const neighbourId = nearby[index]!;
    if (
      store.occupancyClassByEntity[neighbourId] !==
        PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.downedSoft
    ) continue;
    const deltaX = store.proposedXByEntity[neighbourId]! - x;
    const deltaY = store.proposedYByEntity[neighbourId]! - y;
    const minimumDistance = store.debug.radii[entityId]! +
      store.debug.radii[neighbourId]!;
    if (
      deltaX * deltaX + deltaY * deltaY <
      minimumDistance * minimumDistance
    ) return true;
  }
  return false;
}

function resetTickDiagnostics(store: InternalPersonalSpaceSpikeStore): void {
  const debug = store.debug;
  debug.resolutionPassCount = 0;
  debug.localQueryCount = 0;
  debug.localCandidateCount = 0;
  debug.unresolvedStandingOverlapCount = 0;
  debug.fallbackResetCount = 0;
  debug.blockedCount = 0;
  debug.reducedCount = 0;
  debug.redirectedCount = 0;
  debug.downedSoftCrossingCount = 0;
  debug.yieldingEgressYieldCount = 0;
  debug.detourStrategyChangeCount = 0;
  debug.intendedDeltas.fill(0);
  debug.resolvedDeltas.fill(0);
  debug.localNeighbourCounts.fill(0);
  debug.principalRelationshipCodes.fill(NO_RELATIONSHIP);
  debug.resolutionFlags.fill(0);
}

function assertInitialStandingSpace(
  store: InternalPersonalSpaceSpikeStore,
): void {
  buildSpatialGrid(store.proposalGrid, store.proposalWorld);
  if (countIllegalStandingOverlaps(store) > 0) {
    throw new RangeError(
      "Personal-space spike initial standing positions must not overlap.",
    );
  }
  resetTickDiagnostics(store);
}

function addBoundedDeltaCandidate(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  movementBudgetSquared: number,
  kind: number,
): void {
  if (deltaX * deltaX + deltaY * deltaY > movementBudgetSquared) return;
  const x = store.startXByEntity[entityId]! + deltaX;
  const y = store.startYByEntity[entityId]! + deltaY;
  if (
    x < 0 || y < 0 ||
    x >= store.proposalWorld.bounds.width ||
    y >= store.proposalWorld.bounds.height
  ) return;
  if (
    (kind === CANDIDATE_AVOIDANCE ||
      kind === CANDIDATE_WIDE_ALTERNATIVE) &&
    exceedsDetourWidth(store, entityId, x, y)
  ) return;
  addCandidate(store, entityId, x, y, kind);
}

function exceedsDetourWidth(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  x: number,
  y: number,
): boolean {
  const currentCross = Math.abs(desireLineCrossTrack(
    store,
    entityId,
    store.startXByEntity[entityId]!,
    store.startYByEntity[entityId]!,
  ));
  const candidateCross = Math.abs(desireLineCrossTrack(store, entityId, x, y));
  if (candidateCross <= currentCross) return false;
  const desireScale = Math.max(
    1,
    Math.abs(store.requestedDeltaXByEntity[entityId]!) +
      Math.abs(store.requestedDeltaYByEntity[entityId]!),
  );
  const phase = store.debug.detourPhaseCodes[entityId]!;
  const widthMultiplier = phase === PERSONAL_SPACE_DETOUR_PHASE.widerAlternative
    ? 3
    : phase === PERSONAL_SPACE_DETOUR_PHASE.oppositeSide
      ? 2
      : 1;
  return candidateCross >
    store.debug.standingRadius * desireScale * widthMultiplier;
}

function addCandidate(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  x: number,
  y: number,
  kind: number,
): void {
  const count = store.candidateCountByEntity[entityId]!;
  for (let candidateIndex = 0; candidateIndex < count; candidateIndex += 1) {
    if (
      candidateX(store, entityId, candidateIndex) === x &&
      candidateY(store, entityId, candidateIndex) === y
    ) return;
  }
  if (count >= MAXIMUM_CANDIDATES_PER_ENTITY) return;
  const slot = candidateSlot(entityId, count);
  store.candidateXBySlot[slot] = x;
  store.candidateYBySlot[slot] = y;
  store.candidateKindBySlot[slot] = kind;
  store.candidateCountByEntity[entityId] = count + 1;
}

function candidateX(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  candidateIndex: number,
): number {
  return store.candidateXBySlot[candidateSlot(entityId, candidateIndex)]!;
}

function candidateY(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  candidateIndex: number,
): number {
  return store.candidateYBySlot[candidateSlot(entityId, candidateIndex)]!;
}

function candidateKind(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  candidateIndex: number,
): number {
  return store.candidateKindBySlot[candidateSlot(entityId, candidateIndex)]!;
}

function candidateSlot(entityId: number, candidateIndex: number): number {
  return entityId * MAXIMUM_CANDIDATES_PER_ENTITY + candidateIndex;
}

function setIntendedDelta(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
): void {
  const offset = entityId * 2;
  store.debug.intendedDeltas[offset] = deltaX;
  store.debug.intendedDeltas[offset + 1] = deltaY;
}

function desireLineCrossTrack(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  x: number,
  y: number,
): number {
  const fromOriginX = x - store.desireOriginXByEntity[entityId]!;
  const fromOriginY = y - store.desireOriginYByEntity[entityId]!;
  return fromOriginX * store.requestedDeltaYByEntity[entityId]! -
    fromOriginY * store.requestedDeltaXByEntity[entityId]!;
}

function desireProgressAt(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  x: number,
  y: number,
): number {
  return (x - store.desireOriginXByEntity[entityId]!) *
      store.requestedDeltaXByEntity[entityId]! +
    (y - store.desireOriginYByEntity[entityId]!) *
      store.requestedDeltaYByEntity[entityId]!;
}

function sameDirectionLeaderHasRightOfWay(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  neighbourId: number,
): boolean {
  if (store.teamIdByEntity[entityId] !== store.teamIdByEntity[neighbourId]) {
    return false;
  }
  const moverDesireX = store.requestedDeltaXByEntity[entityId]!;
  const moverDesireY = store.requestedDeltaYByEntity[entityId]!;
  const neighbourDesireX = store.requestedDeltaXByEntity[neighbourId]!;
  const neighbourDesireY = store.requestedDeltaYByEntity[neighbourId]!;
  if (
    moverDesireX * neighbourDesireX + moverDesireY * neighbourDesireY <= 0
  ) return false;
  const relativeX = store.startXByEntity[entityId]! -
    store.startXByEntity[neighbourId]!;
  const relativeY = store.startYByEntity[entityId]! -
    store.startYByEntity[neighbourId]!;
  return relativeX * moverDesireX + relativeY * moverDesireY > 0;
}

function crossingDesireHasRightOfWay(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  neighbourId: number,
): boolean {
  if (store.teamIdByEntity[entityId] !== store.teamIdByEntity[neighbourId]) {
    return false;
  }
  const moverX = store.requestedDeltaXByEntity[entityId]!;
  const moverY = store.requestedDeltaYByEntity[entityId]!;
  const neighbourX = store.requestedDeltaXByEntity[neighbourId]!;
  const neighbourY = store.requestedDeltaYByEntity[neighbourId]!;
  if (moverX * neighbourX + moverY * neighbourY !== 0) return false;
  const moverVerticalPriority = Math.abs(moverY) - Math.abs(moverX);
  const neighbourVerticalPriority = Math.abs(neighbourY) - Math.abs(neighbourX);
  if (moverVerticalPriority !== neighbourVerticalPriority) {
    return moverVerticalPriority > neighbourVerticalPriority;
  }
  return entityId < neighbourId;
}

function updateDetourEpisode(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  resolvedDeltaX: number,
  resolvedDeltaY: number,
  intendedDeltaX: number,
  intendedDeltaY: number,
): void {
  if (!isSelfPropelledClass(store.occupancyClassByEntity[entityId]!)) return;
  const relationship = store.debug.principalRelationshipCodes[entityId]!;
  const collisionSupportsDetour =
    relationship === PERSONAL_SPACE_RELATIONSHIP_CODE.alliedStanding ||
    relationship === PERSONAL_SPACE_RELATIONSHIP_CODE.yieldingEgress ||
    relationship === PERSONAL_SPACE_RELATIONSHIP_CODE.downedSoft;
  let phase = store.debug.detourPhaseCodes[entityId]!;
  const chosenKind = candidateKind(
    store,
    entityId,
    store.selectedCandidateByEntity[entityId]!,
  );
  const goalProgressThisTick =
    resolvedDeltaX * store.requestedDeltaXByEntity[entityId]! +
    resolvedDeltaY * store.requestedDeltaYByEntity[entityId]!;

  if (phase === PERSONAL_SPACE_DETOUR_PHASE.none) {
    if (
      collisionSupportsDetour &&
      (resolvedDeltaX !== intendedDeltaX || resolvedDeltaY !== intendedDeltaY)
    ) beginDetourPhase(
      store,
      entityId,
      PERSONAL_SPACE_DETOUR_PHASE.initialSide,
      (entityId & 1) === 0 ? 1 : -1,
      INITIAL_DETOUR_TICKS,
    );
    return;
  }

  if (chosenKind === CANDIDATE_NORMAL && goalProgressThisTick > 0) {
    store.normalProgressStreakByEntity[entityId] = Math.min(
      0xff,
      store.normalProgressStreakByEntity[entityId]! + 1,
    );
    if (store.normalProgressStreakByEntity[entityId]! >= 8) {
      resetDetourEpisode(store, entityId);
      return;
    }
  } else store.normalProgressStreakByEntity[entityId] = 0;
  if (store.debug.detourTicksRemaining[entityId]! > 0) {
    store.debug.detourTicksRemaining[entityId] =
      store.debug.detourTicksRemaining[entityId]! - 1;
  }
  if (store.debug.detourTicksRemaining[entityId]! > 0) return;

  const progressNow = desireProgressAt(
    store,
    entityId,
    store.proposedXByEntity[entityId]!,
    store.proposedYByEntity[entityId]!,
  );
  const attemptProgress = progressNow -
    store.detourAttemptStartProgressByEntity[entityId]!;
  const meaningfulProgress = Math.max(
    1,
    Math.floor(store.detourAttemptDurationByEntity[entityId]! / 5),
  );
  if (attemptProgress >= meaningfulProgress) {
    resetDetourEpisode(store, entityId);
    return;
  }

  if (phase === PERSONAL_SPACE_DETOUR_PHASE.initialSide) {
    beginDetourPhase(
      store,
      entityId,
      PERSONAL_SPACE_DETOUR_PHASE.oppositeSide,
      -store.debug.detourSideByEntity[entityId]!,
      OPPOSITE_DETOUR_TICKS,
    );
  } else if (phase === PERSONAL_SPACE_DETOUR_PHASE.oppositeSide) {
    beginDetourPhase(
      store,
      entityId,
      PERSONAL_SPACE_DETOUR_PHASE.widerAlternative,
      store.debug.detourSideByEntity[entityId]!,
      WIDE_DETOUR_TICKS,
    );
  } else {
    resetDetourEpisode(store, entityId);
  }
}

function beginDetourPhase(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  phase: number,
  side: number,
  duration: number,
): void {
  store.debug.detourPhaseCodes[entityId] = phase;
  store.debug.detourSideByEntity[entityId] = side;
  store.debug.detourTicksRemaining[entityId] = duration;
  store.detourAttemptDurationByEntity[entityId] = duration;
  store.detourAttemptStartProgressByEntity[entityId] = desireProgressAt(
    store,
    entityId,
    store.proposedXByEntity[entityId]!,
    store.proposedYByEntity[entityId]!,
  );
  store.debug.detourStrategyChangeCount += 1;
}

function resetDetourEpisode(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
): void {
  if (
    store.debug.detourPhaseCodes[entityId] !== PERSONAL_SPACE_DETOUR_PHASE.none
  ) store.debug.detourStrategyChangeCount += 1;
  store.debug.detourPhaseCodes[entityId] = PERSONAL_SPACE_DETOUR_PHASE.none;
  store.debug.detourSideByEntity[entityId] = 0;
  store.debug.detourTicksRemaining[entityId] = 0;
  store.detourAttemptDurationByEntity[entityId] = 0;
  store.detourAttemptStartProgressByEntity[entityId] = 0;
  store.normalProgressStreakByEntity[entityId] = 0;
}

function relationshipCodeFor(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  neighbourId: number,
): number {
  if (
    store.occupancyClassByEntity[entityId] ===
      PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress ||
    store.occupancyClassByEntity[neighbourId] ===
      PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress
  ) return PERSONAL_SPACE_RELATIONSHIP_CODE.yieldingEgress;
  return store.teamIdByEntity[entityId] === store.teamIdByEntity[neighbourId]
    ? PERSONAL_SPACE_RELATIONSHIP_CODE.alliedStanding
    : PERSONAL_SPACE_RELATIONSHIP_CODE.hostileStanding;
}

function movementPriority(classCode: number): number {
  if (classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.assistedMoving) return 3;
  if (classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.activeStanding) return 2;
  if (classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress) return 1;
  return 0;
}

function isSelfPropelledClass(classCode: number): boolean {
  return classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.activeStanding ||
    classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.assistedMoving ||
    classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress;
}

function isHardStandingClass(classCode: number): boolean {
  return isSelfPropelledClass(classCode);
}

function validateScenarioHeader(
  world: WorldState,
  scenario: PersonalSpaceSpikeScenario,
): void {
  if (scenario.kind !== "personalSpaceSpike") {
    throw new RangeError("Unknown personal-space spike kind.");
  }
  if (scenario.entities.length !== world.entityCount) {
    throw new RangeError(
      "Personal-space spike entity configuration must match world capacity.",
    );
  }
  assertPositiveByte(scenario.standingRadius, "standingRadius");
  assertPositiveByte(scenario.downedSoftRadius, "downedSoftRadius");
  if (
    !Number.isSafeInteger(scenario.maximumResolutionPasses) ||
    scenario.maximumResolutionPasses < 1 ||
    scenario.maximumResolutionPasses > 16
  ) {
    throw new RangeError(
      "Personal-space spike resolution passes must be in 1..16.",
    );
  }
}

function validateEntityScenario(
  entity: PersonalSpaceSpikeScenario["entities"][number],
  world: WorldState,
): void {
  if (
    !Number.isSafeInteger(entity.entityId) ||
    entity.entityId < 0 ||
    entity.entityId >= world.entityCount
  ) throw new RangeError("Invalid personal-space spike entity ID.");
  if (
    !Number.isSafeInteger(entity.x) ||
    !Number.isSafeInteger(entity.y) ||
    entity.x < 0 || entity.y < 0 ||
    entity.x >= world.bounds.width || entity.y >= world.bounds.height
  ) throw new RangeError("Personal-space spike positions must fit world bounds.");
  if (
    !Number.isSafeInteger(entity.requestedDeltaX) ||
    !Number.isSafeInteger(entity.requestedDeltaY) ||
    Math.abs(entity.requestedDeltaX) > MAXIMUM_SPIKE_STEP_PER_AXIS ||
    Math.abs(entity.requestedDeltaY) > MAXIMUM_SPIKE_STEP_PER_AXIS
  ) throw new RangeError("Personal-space spike movement must be bounded to two units per axis.");
  if (!occupancyClassNames.includes(entity.occupancyClass)) {
    throw new RangeError("Unknown personal-space spike occupancy class.");
  }
  if (
    !Number.isSafeInteger(entity.teamId) ||
    entity.teamId < 0 ||
    entity.teamId > 0xff
  ) throw new RangeError("Personal-space spike team IDs must fit Uint8.");
  if (
    (entity.occupancyClass === "downedSoft" ||
      entity.occupancyClass === "nonBattlefield") &&
    (entity.requestedDeltaX !== 0 || entity.requestedDeltaY !== 0)
  ) throw new RangeError("Immobile occupancy classes cannot request movement.");
}

function assertPositiveByte(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 0xff) {
    throw new RangeError(`${name} must be a positive Uint8 integer.`);
  }
}

function requireStore(
  store: PersonalSpaceSpikeStore,
  world: WorldState,
): InternalPersonalSpaceSpikeStore {
  const internal = internals.get(store);
  if (internal === undefined) throw new TypeError("Unknown personal-space spike store.");
  if (world.entityCount !== internal.entityCount) {
    throw new RangeError("Personal-space spike world entity count changed.");
  }
  return internal;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}
