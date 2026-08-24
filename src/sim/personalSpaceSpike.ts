import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  PERSONAL_SPACE_OCCUPANCY_CLASS_CODE,
  PERSONAL_SPACE_RELATIONSHIP_CODE,
  PERSONAL_SPACE_RESOLUTION_FLAG,
  type PersonalSpaceSpikeDebugSnapshot,
  type PersonalSpaceSpikeOccupancyClass,
  type PersonalSpaceSpikeScenario,
  type WorldState,
} from "./types";

const MAXIMUM_SPIKE_STEP_PER_AXIS = 2;
const MAXIMUM_CANDIDATES_PER_ENTITY = 7;
const CANDIDATE_NORMAL = 0;
const CANDIDATE_AVOIDANCE = 1;
const CANDIDATE_REDUCED_FORWARD = 2;
const CANDIDATE_STATIONARY = 3;
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
    occupancyClassCodes,
    radii,
    intendedDeltas: new Int32Array(entityCount * 2),
    resolvedDeltas: new Int32Array(entityCount * 2),
    localNeighbourCounts: new Uint16Array(entityCount),
    principalRelationshipCodes: new Uint8Array(entityCount),
    resolutionFlags: new Uint8Array(entityCount),
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
        relationshipCode ===
          PERSONAL_SPACE_RELATIONSHIP_CODE.hostileStanding,
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
  addCandidate(store, entityId, intendedX, intendedY, CANDIDATE_NORMAL);
  if (movementBudgetSquared === 0) return;

  const forwardX = Math.sign(intendedDeltaX);
  const forwardY = Math.sign(intendedDeltaY);
  const preferredSide = (entityId & 1) === 0 ? 1 : -1;
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
    forwardX - perpendicularX,
    forwardY - perpendicularY,
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
    -perpendicularX,
    -perpendicularY,
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
  addCandidate(store, entityId, startX, startY, CANDIDATE_STATIONARY);
}

function findNextCandidate(
  store: InternalPersonalSpaceSpikeStore,
  entityId: number,
  firstCandidate: number,
  hostileForwardOnly: boolean,
): number {
  const candidateCount = store.candidateCountByEntity[entityId]!;
  for (
    let candidateIndex = firstCandidate;
    candidateIndex < candidateCount;
    candidateIndex += 1
  ) {
    const kind = candidateKind(store, entityId, candidateIndex);
    if (
      hostileForwardOnly &&
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
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    if (!isHardStandingClass(store.occupancyClassByEntity[entityId]!)) continue;
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
  addCandidate(store, entityId, x, y, kind);
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
