import type {
  CasualtyDragCollisionResolver,
  CasualtyDragGroupRecord,
  CasualtyDragGroupStore,
} from "./individualCasualtyAssistance";
import { getActiveCasualtyDragGroups } from "./individualCasualtyAssistance";
import type {
  IndividualCasualtyLifecycleStore,
  IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import {
  INDIVIDUAL_COLLISION_RELATIONSHIP,
  INDIVIDUAL_COLLISION_RESOLUTION_FLAG,
  recordIndividualCollisionResolvedStep,
  type IndividualCollisionResolutionStore,
} from "./individualCollisionResolution";
import {
  getIndividualPhysicalOccupancyProjectionTick,
  INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS,
  projectIndividualPhysicalOccupancyOneTick,
  type IndividualPhysicalOccupancyStore,
} from "./individualPhysicalOccupancy";
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

const CASUALTY_GROUP_COLLISION_CELL_SIZE = 16;
const CASUALTY_GROUP_MAX_QUERY_RADIUS = 32;
const MAX_UINT16 = 0xffff;

export interface IndividualCasualtyGroupCollisionResult {
  readonly requestedGroupCount: number;
  readonly movedGroupCount: number;
  readonly blockedGroupCount: number;
  readonly redirectedGroupCount: number;
  readonly downedSoftAvoidanceCount: number;
  readonly downedSoftCrossingCount: number;
  readonly alliedBlockerCount: number;
  readonly hostileBlockerCount: number;
  readonly localQueryCount: number;
  readonly localCandidateCount: number;
  readonly sameTickOccupancyRefreshCount: number;
  readonly destinationContactCount: number;
}

interface MutableIndividualCasualtyGroupCollisionResult {
  requestedGroupCount: number;
  movedGroupCount: number;
  blockedGroupCount: number;
  redirectedGroupCount: number;
  downedSoftAvoidanceCount: number;
  downedSoftCrossingCount: number;
  alliedBlockerCount: number;
  hostileBlockerCount: number;
  localQueryCount: number;
  localCandidateCount: number;
  sameTickOccupancyRefreshCount: number;
  destinationContactCount: number;
}

export interface IndividualCasualtyGroupCollisionResolver
  extends CasualtyDragCollisionResolver {
  readonly entityCount: number;
  readonly includedOccupancyFlags: Uint8Array;
  readonly queryPositionsX: Int32Array;
  readonly queryPositionsY: Int32Array;
  readonly grid: SpatialGrid;
  readonly result: IndividualCasualtyGroupCollisionResult;
}

interface InternalIndividualCasualtyGroupCollisionResolver
  extends IndividualCasualtyGroupCollisionResolver {
  resolvedDeltaX: number;
  resolvedDeltaY: number;
  destinationContactSatisfied: boolean;
  preparedTick: number;
  evaluationRelationship: number;
  evaluationBlockerEntityId: number;
  evaluationAlliedBlocker: boolean;
  evaluationHostileBlocker: boolean;
  readonly nearbyEntityIds: number[];
  readonly queryWorld: WorldState;
}

export function createIndividualCasualtyGroupCollisionResolver(
  world: WorldState,
  identity: UnitIdentityStore,
  occupancy: IndividualPhysicalOccupancyStore,
  collision: IndividualCollisionResolutionStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  groups: CasualtyDragGroupStore,
): IndividualCasualtyGroupCollisionResolver {
  validateEntityCounts(
    world.entityCount,
    identity,
    occupancy,
    collision,
    lifecycle,
    presence,
    groups,
  );
  const includedOccupancyFlags = new Uint8Array(world.entityCount);
  const queryPositionsX = new Int32Array(world.entityCount);
  const queryPositionsY = new Int32Array(world.entityCount);
  const queryWorld: WorldState = {
    entityCount: world.entityCount,
    bounds: { width: world.bounds.width, height: world.bounds.height },
    ids: world.ids,
    positionsX: queryPositionsX,
    positionsY: queryPositionsY,
    velocitiesX: world.velocitiesX,
    velocitiesY: world.velocitiesY,
  };
  const result: MutableIndividualCasualtyGroupCollisionResult = {
    requestedGroupCount: 0,
    movedGroupCount: 0,
    blockedGroupCount: 0,
    redirectedGroupCount: 0,
    downedSoftAvoidanceCount: 0,
    downedSoftCrossingCount: 0,
    alliedBlockerCount: 0,
    hostileBlockerCount: 0,
    localQueryCount: 0,
    localCandidateCount: 0,
    sameTickOccupancyRefreshCount: 0,
    destinationContactCount: 0,
  };
  const resolver: InternalIndividualCasualtyGroupCollisionResolver = {
    entityCount: world.entityCount,
    includedOccupancyFlags,
    queryPositionsX,
    queryPositionsY,
    grid: createSpatialGrid({
      bounds: queryWorld.bounds,
      cellSize: CASUALTY_GROUP_COLLISION_CELL_SIZE,
      capacity: world.entityCount,
    }),
    result,
    resolvedDeltaX: 0,
    resolvedDeltaY: 0,
    destinationContactSatisfied: false,
    preparedTick: -1,
    evaluationRelationship: INDIVIDUAL_COLLISION_RELATIONSHIP.none,
    evaluationBlockerEntityId: -1,
    evaluationAlliedBlocker: false,
    evaluationHostileBlocker: false,
    nearbyEntityIds: [],
    queryWorld,
    prepareForMovement(tick) {
      if (getIndividualPhysicalOccupancyProjectionTick(occupancy) !== tick) {
        throw new Error(
          "Casualty collision requires current-tick physical occupancy.",
        );
      }
      resetResult(result);
      resolver.preparedTick = tick;
      resolver.resolvedDeltaX = 0;
      resolver.resolvedDeltaY = 0;
      resolver.destinationContactSatisfied = false;
      syncQuerySnapshot(resolver, world, occupancy);
    },
    assistanceStateChanged(tick) {
      assertPrepared(resolver, tick);
      projectIndividualPhysicalOccupancyOneTick(
        occupancy,
        lifecycle,
        presence,
        getActiveCasualtyDragGroups(groups),
        tick,
      );
      result.sameTickOccupancyRefreshCount += 1;
      refreshIncludedFlags(resolver, occupancy);
    },
    resolveDraggingGroupStep(group, permittedDeltaX, permittedDeltaY) {
      resolveDraggingGroupStep(
        resolver,
        world,
        identity,
        occupancy,
        collision,
        group,
        permittedDeltaX,
        permittedDeltaY,
      );
    },
  };
  return resolver;
}

function resolveDraggingGroupStep(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  world: WorldState,
  identity: UnitIdentityStore,
  occupancy: IndividualPhysicalOccupancyStore,
  collision: IndividualCollisionResolutionStore,
  group: CasualtyDragGroupRecord,
  permittedDeltaX: number,
  permittedDeltaY: number,
): void {
  if (resolver.preparedTick < 0) {
    throw new Error("Casualty collision must be prepared before group movement.");
  }
  resolver.resolvedDeltaX = 0;
  resolver.resolvedDeltaY = 0;
  resolver.destinationContactSatisfied = false;
  if (permittedDeltaX === 0 && permittedDeltaY === 0) return;
  const result = resolver.result as MutableIndividualCasualtyGroupCollisionResult;
  result.requestedGroupCount += 1;
  const budgetSquared = permittedDeltaX * permittedDeltaX +
    permittedDeltaY * permittedDeltaY;
  const forwardX = sign(permittedDeltaX);
  const forwardY = sign(permittedDeltaY);

  let firstRelationship: number = INDIVIDUAL_COLLISION_RELATIONSHIP.none;
  let firstBlocker = -1;
  let sawAlliedBlocker = false;
  let sawHostileBlocker = false;
  if (candidateIsLegal(
    resolver, world, identity, occupancy, collision, group,
    permittedDeltaX, permittedDeltaY, budgetSquared, false,
  )) {
    commitGroupEvidence(
      resolver, collision, group, permittedDeltaX, permittedDeltaY,
      permittedDeltaX, permittedDeltaY, firstRelationship,
      false, false,
    );
    result.movedGroupCount += 1;
    return;
  }
  firstRelationship = resolver.evaluationRelationship;
  firstBlocker = resolver.evaluationBlockerEntityId;
  sawAlliedBlocker = resolver.evaluationAlliedBlocker;
  sawHostileBlocker = resolver.evaluationHostileBlocker;

  if (sawAlliedBlocker && firstBlocker >= 0 &&
      alliedBlockerSatisfiesDestinationContact(
        world,
        occupancy,
        group,
        firstBlocker,
      )) {
    commitGroupEvidence(
      resolver,
      collision,
      group,
      permittedDeltaX,
      permittedDeltaY,
      0,
      0,
      firstRelationship,
      false,
      false,
    );
    resolver.destinationContactSatisfied = true;
    result.destinationContactCount += 1;
    result.alliedBlockerCount += 1;
    return;
  }

  const side = preferredGroupSide(
    resolver,
    collision,
    group,
    firstBlocker,
    forwardX,
    forwardY,
  );
  const lateralX = -forwardY * side;
  const lateralY = forwardX * side;
  const requireDesireProgress = firstRelationship ===
    INDIVIDUAL_COLLISION_RELATIONSHIP.downedSoft;
  const selected = tryGroupCandidate(
    resolver, world, identity, occupancy, collision, group,
    forwardX + lateralX, forwardY + lateralY, budgetSquared,
    permittedDeltaX, permittedDeltaY, requireDesireProgress,
  ) || tryGroupCandidate(
    resolver, world, identity, occupancy, collision, group,
    forwardX - lateralX, forwardY - lateralY, budgetSquared,
    permittedDeltaX, permittedDeltaY, requireDesireProgress,
  ) || tryGroupCandidate(
    resolver, world, identity, occupancy, collision, group,
    lateralX, lateralY, budgetSquared,
    permittedDeltaX, permittedDeltaY, requireDesireProgress,
  ) || tryGroupCandidate(
    resolver, world, identity, occupancy, collision, group,
    -lateralX, -lateralY, budgetSquared,
    permittedDeltaX, permittedDeltaY, requireDesireProgress,
  ) || tryGroupCandidate(
    resolver, world, identity, occupancy, collision, group,
    forwardX, forwardY, budgetSquared,
    permittedDeltaX, permittedDeltaY, requireDesireProgress,
  );
  let chosenX = selected ? resolver.resolvedDeltaX : 0;
  let chosenY = selected ? resolver.resolvedDeltaY : 0;

  let softCrossing = false;
  if (chosenX === 0 && chosenY === 0 &&
      firstRelationship === INDIVIDUAL_COLLISION_RELATIONSHIP.downedSoft &&
      candidateIsLegal(
        resolver, world, identity, occupancy, collision, group,
        forwardX, forwardY, budgetSquared, true,
      )) {
    chosenX = forwardX;
    chosenY = forwardY;
    softCrossing = true;
  }

  const softAvoidance = firstRelationship ===
      INDIVIDUAL_COLLISION_RELATIONSHIP.downedSoft &&
    !softCrossing && (chosenX !== 0 || chosenY !== 0);
  commitGroupEvidence(
    resolver,
    collision,
    group,
    permittedDeltaX,
    permittedDeltaY,
    chosenX,
    chosenY,
    firstRelationship,
    softAvoidance,
    softCrossing,
  );
  resolver.resolvedDeltaX = chosenX;
  resolver.resolvedDeltaY = chosenY;
  if (chosenX === 0 && chosenY === 0) {
    result.blockedGroupCount += 1;
  } else {
    result.movedGroupCount += 1;
    if (permittedDeltaX * chosenY !== permittedDeltaY * chosenX) {
      result.redirectedGroupCount += 1;
    }
  }
  if (softAvoidance) result.downedSoftAvoidanceCount += 1;
  if (softCrossing) result.downedSoftCrossingCount += 1;
  if (sawAlliedBlocker) result.alliedBlockerCount += 1;
  if (sawHostileBlocker) result.hostileBlockerCount += 1;
}

function candidateIsLegal(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  world: WorldState,
  identity: UnitIdentityStore,
  occupancy: IndividualPhysicalOccupancyStore,
  collision: IndividualCollisionResolutionStore,
  group: CasualtyDragGroupRecord,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
  allowSoftCrossing: boolean,
): boolean {
  resolver.evaluationRelationship = INDIVIDUAL_COLLISION_RELATIONSHIP.none;
  resolver.evaluationBlockerEntityId = -1;
  resolver.evaluationAlliedBlocker = false;
  resolver.evaluationHostileBlocker = false;
  if (deltaX === 0 && deltaY === 0 ||
      deltaX * deltaX + deltaY * deltaY > budgetSquared) return false;
  const groupFaction = faction(identity, group.patientEntityId);
  for (let participantIndex = 0;
    participantIndex <= group.helperEntityIds.length;
    participantIndex += 1) {
    const participantId = participantIndex === 0
      ? group.patientEntityId
      : group.helperEntityIds[participantIndex - 1]!;
    const startX = world.positionsX[participantId]!;
    const startY = world.positionsY[participantId]!;
    const finalX = startX + deltaX;
    const finalY = startY + deltaY;
    if (finalX < 0 || finalY < 0 || finalX >= world.bounds.width ||
        finalY >= world.bounds.height) return false;
    const nearby = queryNearbyEntitiesInto(
      resolver.grid,
      startX,
      startY,
      CASUALTY_GROUP_MAX_QUERY_RADIUS,
      resolver.nearbyEntityIds,
    );
    const result = resolver.result as MutableIndividualCasualtyGroupCollisionResult;
    result.localQueryCount += 1;
    addNeighbourEvidence(collision, participantId, nearby.length - 1);
    for (let index = 0; index < nearby.length; index += 1) {
      const otherId = nearby[index]!;
      if (otherId === participantId ||
          occupancy.assistanceGroupIds[otherId] === group.groupId) continue;
      const occupancyClass = occupancy.occupancyClassCodes[otherId]!;
      if (occupancyClass ===
          INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield ||
          occupancyClass ===
          INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress) continue;
      result.localCandidateCount += 1;
      if (!movementPairCollides(
        startX,
        startY,
        deltaX,
        deltaY,
        world.positionsX[otherId]!,
        world.positionsY[otherId]!,
        occupancy.effectiveRadii[participantId]! +
          occupancy.effectiveRadii[otherId]!,
      )) continue;
      if (occupancyClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.downedSoft &&
          allowSoftCrossing) continue;
      resolver.evaluationRelationship = relationshipFor(occupancyClass);
      resolver.evaluationBlockerEntityId = otherId;
      if (occupancyClass ===
          INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.activeStanding) {
        if (faction(identity, otherId) === groupFaction) {
          resolver.evaluationAlliedBlocker = true;
        } else {
          resolver.evaluationHostileBlocker = true;
        }
      }
      return false;
    }
  }
  return true;
}

function tryGroupCandidate(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  world: WorldState,
  identity: UnitIdentityStore,
  occupancy: IndividualPhysicalOccupancyStore,
  collision: IndividualCollisionResolutionStore,
  group: CasualtyDragGroupRecord,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
  permittedDeltaX: number,
  permittedDeltaY: number,
  requireDesireProgress: boolean,
): boolean {
  if (requireDesireProgress &&
      deltaX * permittedDeltaX + deltaY * permittedDeltaY <= 0) return false;
  if (!candidateIsLegal(
    resolver,
    world,
    identity,
    occupancy,
    collision,
    group,
    deltaX,
    deltaY,
    budgetSquared,
    false,
  )) return false;
  resolver.resolvedDeltaX = deltaX;
  resolver.resolvedDeltaY = deltaY;
  return true;
}

function commitGroupEvidence(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  collision: IndividualCollisionResolutionStore,
  group: CasualtyDragGroupRecord,
  permittedDeltaX: number,
  permittedDeltaY: number,
  resolvedDeltaX: number,
  resolvedDeltaY: number,
  relationship: number,
  softAvoidance: boolean,
  softCrossing: boolean,
): void {
  resolver.resolvedDeltaX = resolvedDeltaX;
  resolver.resolvedDeltaY = resolvedDeltaY;
  recordParticipant(group.patientEntityId);
  for (let index = 0; index < group.helperEntityIds.length; index += 1) {
    recordParticipant(group.helperEntityIds[index]!);
  }

  function recordParticipant(entityId: number): void {
    recordIndividualCollisionResolvedStep(
      collision,
      entityId,
      permittedDeltaX,
      permittedDeltaY,
      resolvedDeltaX,
      resolvedDeltaY,
    );
    let flags = collision.resolutionFlags[entityId]!;
    if (softAvoidance) {
      flags |= INDIVIDUAL_COLLISION_RESOLUTION_FLAG.downedSoftAvoidance;
    }
    if (softCrossing) {
      flags |= INDIVIDUAL_COLLISION_RESOLUTION_FLAG.downedSoftCrossing;
    }
    collision.resolutionFlags[entityId] = flags;
    if (relationship !== INDIVIDUAL_COLLISION_RELATIONSHIP.none) {
      collision.principalOccupancyRelationshipCodes[entityId] = relationship;
    }
  }
}

function syncQuerySnapshot(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  world: WorldState,
  occupancy: IndividualPhysicalOccupancyStore,
): void {
  resolver.queryPositionsX.set(world.positionsX);
  resolver.queryPositionsY.set(world.positionsY);
  refreshIncludedFlags(resolver, occupancy);
  buildSpatialGrid(
    resolver.grid,
    resolver.queryWorld,
    (entityId) => resolver.includedOccupancyFlags[entityId] !== 0,
  );
}

function refreshIncludedFlags(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  occupancy: IndividualPhysicalOccupancyStore,
): void {
  for (let entityId = 0; entityId < resolver.entityCount; entityId += 1) {
    const occupancyClass = occupancy.occupancyClassCodes[entityId]!;
    resolver.includedOccupancyFlags[entityId] = occupancyClass ===
        INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield ||
      occupancyClass === INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress
      ? 0
      : 1;
  }
}

function preferredGroupSide(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  collision: IndividualCollisionResolutionStore,
  group: CasualtyDragGroupRecord,
  blockerId: number,
  forwardX: number,
  forwardY: number,
): number {
  if (blockerId >= 0) {
    const relativeX = resolver.queryPositionsX[blockerId]! -
      collision.tickStartXByEntity[group.patientEntityId]!;
    const relativeY = resolver.queryPositionsY[blockerId]! -
      collision.tickStartYByEntity[group.patientEntityId]!;
    const cross = forwardX * relativeY - forwardY * relativeX;
    if (cross !== 0) return cross > 0 ? -1 : 1;
  }
  return (group.groupId & 1) === 0 ? 1 : -1;
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

function alliedBlockerSatisfiesDestinationContact(
  world: WorldState,
  occupancy: IndividualPhysicalOccupancyStore,
  group: CasualtyDragGroupRecord,
  blockerId: number,
): boolean {
  const destinationX = Math.round(group.destinationX);
  const destinationY = Math.round(group.destinationY);
  if (world.positionsX[blockerId] !== destinationX ||
      world.positionsY[blockerId] !== destinationY) return false;
  const patientId = group.patientEntityId;
  const deltaX = world.positionsX[blockerId]! - world.positionsX[patientId]!;
  const deltaY = world.positionsY[blockerId]! - world.positionsY[patientId]!;
  const contactRadius = occupancy.effectiveRadii[patientId]! +
    occupancy.effectiveRadii[blockerId]!;
  return deltaX * deltaX + deltaY * deltaY <= contactRadius * contactRadius;
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
    Math.max(
      collision.localNeighbourCounts[entityId]!,
      count,
    ),
  );
}

function faction(identity: UnitIdentityStore, entityId: number): number {
  return getFactionIdForUnit(identity, getUnitIdForEntity(identity, entityId));
}

function assertPrepared(
  resolver: InternalIndividualCasualtyGroupCollisionResolver,
  tick: number,
): void {
  if (resolver.preparedTick !== tick) {
    throw new Error("Casualty collision state change requires prepared tick.");
  }
}

function resetResult(result: MutableIndividualCasualtyGroupCollisionResult): void {
  result.requestedGroupCount = 0;
  result.movedGroupCount = 0;
  result.blockedGroupCount = 0;
  result.redirectedGroupCount = 0;
  result.downedSoftAvoidanceCount = 0;
  result.downedSoftCrossingCount = 0;
  result.alliedBlockerCount = 0;
  result.hostileBlockerCount = 0;
  result.localQueryCount = 0;
  result.localCandidateCount = 0;
  result.sameTickOccupancyRefreshCount = 0;
  result.destinationContactCount = 0;
}

function validateEntityCounts(
  entityCount: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  for (let index = 0; index < stores.length; index += 1) {
    if (stores[index]!.entityCount !== entityCount) {
      throw new RangeError("Casualty collision stores must share entityCount.");
    }
  }
}

function sign(value: number): number {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}
