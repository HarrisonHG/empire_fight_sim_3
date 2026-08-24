import {
  getUnitCohesion,
  getUnitMovementStyle,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import type { IndividualActiveStandingCollisionWorkspace } from "./individualActiveStandingCollision";
import {
  INDIVIDUAL_COLLISION_LOCAL_DECISION,
  type IndividualCollisionResolutionStore,
} from "./individualCollisionResolution";
import type { IndividualPhysicalOccupancyStore } from "./individualPhysicalOccupancy";
import { queryNearbyEntitiesInto } from "./spatialGrid";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  type UnitIdentityStore,
} from "./unitIdentity";

const COURTESY_TICKS = 20;
const DETOUR_INITIAL_TICKS = 40;
const DETOUR_SWITCHED_TICKS = 100;
const DETOUR_WIDE_TICKS = 200;
const OVERTAKE_MARGIN = 1;

/** Reads the existing formation authority; it does not create discipline. */
export function hasLooseCrowdLateralFreedom(
  formation: FormationBehaviourStore,
  unitId: number,
  query: "loose" | "pushThrough",
): boolean {
  const style = getUnitMovementStyle(formation, unitId);
  if (query === "pushThrough") return style === "pushThrough";
  return style === "looseFlow" || getUnitCohesion(formation, unitId) <= 350;
}

/**
 * Chooses only bounded local alternatives to the already-permitted step.
 * The hard resolver remains responsible for final legality.
 */
export function prepareAlliedCrowdFlow(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  identity: UnitIdentityStore,
  formation: FormationBehaviourStore,
  queryRadius: number,
): void {
  refreshDecisions(workspace, collision, occupancy, identity);

  for (let leftId = 0; leftId < workspace.entityCount; leftId += 1) {
    if (!canBegin(workspace, collision, leftId)) continue;
    const nearby = queryNearbyEntitiesInto(
      workspace.grid,
      collision.tickStartXByEntity[leftId]!,
      collision.tickStartYByEntity[leftId]!,
      queryRadius + COURTESY_TICKS * 2,
      workspace.scratchNearbyEntityIds,
    );
    workspace.localQueryCount += 1;
    addNeighbourEvidence(collision, leftId, nearby.length - 1);
    for (let index = 0; index < nearby.length; index += 1) {
      const rightId = nearby[index]!;
      if (rightId <= leftId || !canBegin(workspace, collision, rightId) ||
          faction(identity, leftId) !== faction(identity, rightId)) continue;
      // Formation already owns slot order and within-unit rear-rank yielding.
      // Crowd negotiation is for traffic between distinct allied units.
      if (getUnitIdForEntity(identity, leftId) ===
          getUnitIdForEntity(identity, rightId)) continue;
      workspace.localCandidateCount += 1;
      const crossing = crossingDesires(collision, leftId, rightId);
      const leftCourtesyClearance = crossing
        ? courtesyClearanceTicks(collision, occupancy, leftId, rightId)
        : 0;
      const rightCourtesyClearance = crossing
        ? courtesyClearanceTicks(collision, occupancy, rightId, leftId)
        : 0;
      if (!requestedPairConflicts(collision, occupancy, leftId, rightId) &&
          leftCourtesyClearance === 0 && rightCourtesyClearance === 0) {
        continue;
      }

      if (workspace.routingFlags[leftId] !== workspace.routingFlags[rightId]) {
        const yielder = workspace.routingFlags[leftId] !== 0 ? rightId : leftId;
        const router = yielder === leftId ? rightId : leftId;
        beginDetour(workspace, collision, yielder, router, sideFor(
          collision, yielder, router,
        ), true);
        applyDecision(workspace, collision, yielder);
        workspace.routerPriorityCount += 1;
        continue;
      }
      if (workspace.pushThroughFlags[leftId] !==
          workspace.pushThroughFlags[rightId]) {
        const yielder = workspace.pushThroughFlags[leftId] !== 0
          ? rightId
          : leftId;
        const pusher = yielder === leftId ? rightId : leftId;
        beginDetour(workspace, collision, yielder, pusher, sideFor(
          collision, yielder, pusher,
        ), true);
        applyDecision(workspace, collision, yielder);
        workspace.pushThroughYieldCount += 1;
        continue;
      }

      const follower = fasterRearFollower(collision, leftId, rightId);
      if (follower >= 0) {
        const leader = follower === leftId ? rightId : leftId;
        const clearance = occupancy.effectiveRadii[follower]! +
          occupancy.effectiveRadii[leader]! + OVERTAKE_MARGIN;
        const side = openOvertakeSide(
          workspace,
          collision,
          occupancy,
          follower,
          leader,
          clearance,
        );
        if (side !== 0) {
          beginOvertake(collision, follower, leader, side, clearance);
        } else {
          beginDetour(workspace, collision, follower, leader, sideFor(
            collision, follower, leader,
          ), false);
        }
        applyDecision(workspace, collision, follower);
        continue;
      }

      if (crossing) {
        const leftClearance = leftCourtesyClearance;
        const rightClearance = rightCourtesyClearance;
        if (leftClearance > 0 || rightClearance > 0) {
          const yielder = courtesyYielder(
            collision,
            leftId,
            rightId,
            leftClearance,
            rightClearance,
          );
          const recipient = yielder === leftId ? rightId : leftId;
          if (workspace.courtesyRecipientByEntity[yielder]! < 0 &&
              workspace.courtesyRecipientByEntity[recipient]! < 0 &&
              collision.courtesyAttemptedPartnerByEntity[yielder]! < 0) {
            beginCourtesy(
              workspace,
              collision,
              yielder,
              recipient,
              yielder === leftId ? leftClearance : rightClearance,
            );
            applyDecision(workspace, collision, yielder);
            continue;
          }
        }
      }

      const yielder = ordinaryYielder(
        workspace,
        collision,
        formation,
        identity,
        leftId,
        rightId,
      );
      const blocker = yielder === leftId ? rightId : leftId;
      beginDetour(workspace, collision, yielder, blocker, sideFor(
        collision, yielder, blocker,
      ), false);
      applyDecision(workspace, collision, yielder);
    }
  }

  for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
    const code = collision.localDecisionCodes[entityId]!;
    if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.courtesyYield) {
      workspace.courtesyYieldCount += 1;
    } else if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.overtake) {
      workspace.overtakeCount += 1;
    } else if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.detour) {
      workspace.detourCount += 1;
    }
  }
}

/** The hard resolver uses the same pair-local priority, never a global rank. */
export function selectAlliedPhysicalYielder(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  leftId: number,
  rightId: number,
): number {
  if (decisionYieldsTo(collision, leftId, rightId)) return leftId;
  if (decisionYieldsTo(collision, rightId, leftId)) return rightId;
  if (workspace.routingFlags[leftId] !== workspace.routingFlags[rightId]) {
    return workspace.routingFlags[leftId] !== 0 ? rightId : leftId;
  }
  if (workspace.pushThroughFlags[leftId] !==
      workspace.pushThroughFlags[rightId]) {
    return workspace.pushThroughFlags[leftId] !== 0 ? rightId : leftId;
  }
  return fasterRearFollower(collision, leftId, rightId);
}

function refreshDecisions(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  identity: UnitIdentityStore,
): void {
  workspace.courtesyRecipientByEntity.fill(-1);
  for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
    const code = collision.localDecisionCodes[entityId]!;
    if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.none) continue;
    const partner = collision.localDecisionPartnerByEntity[entityId]!;
    if (!validPartner(workspace, identity, entityId, partner) ||
        desireChanged(collision, entityId) ||
        rememberedYieldConflictsWithCurrentAuthority(
          workspace,
          entityId,
          partner,
        )) {
      clearDecision(collision, entityId, false);
      continue;
    }
    if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.courtesyYield) {
      const clearance = courtesyClearanceTicks(
        collision, occupancy, entityId, partner,
      );
      if (clearance === 0 ||
          collision.localDecisionTicksRemaining[entityId]! === 0) {
        clearDecision(collision, entityId, true);
        continue;
      }
      collision.localDecisionTicksRemaining[entityId] =
        collision.localDecisionTicksRemaining[entityId]! - 1;
      workspace.courtesyRecipientByEntity[partner] = entityId;
      applyDecision(workspace, collision, entityId);
      continue;
    }
    if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.overtake) {
      if (!overtakePairStillValid(collision, entityId, partner) ||
          overtakeCleared(collision, occupancy, entityId, partner) ||
          collision.localDecisionTicksRemaining[entityId]! === 0) {
        clearDecision(collision, entityId, false);
        continue;
      }
      collision.localDecisionTicksRemaining[entityId] =
        collision.localDecisionTicksRemaining[entityId]! - 1;
      applyDecision(workspace, collision, entityId);
      continue;
    }
    if (!requestedPairConflicts(collision, occupancy, entityId, partner)) {
      clearDecision(collision, entityId, false);
      continue;
    }
    if (collision.localDecisionTicksRemaining[entityId]! > 0) {
      collision.localDecisionTicksRemaining[entityId] =
        collision.localDecisionTicksRemaining[entityId]! - 1;
    } else if (madeMeaningfulDetourProgress(collision, entityId)) {
      clearDecision(collision, entityId, false);
      continue;
    } else {
      advanceDetourPhase(collision, entityId);
    }
    applyDecision(workspace, collision, entityId);
  }

  for (let entityId = 0; entityId < workspace.entityCount; entityId += 1) {
    const attempted = collision.courtesyAttemptedPartnerByEntity[entityId]!;
    if (attempted >= 0 &&
        (!validPartner(workspace, identity, entityId, attempted) ||
          !requestedPairConflicts(collision, occupancy, entityId, attempted))) {
      collision.courtesyAttemptedPartnerByEntity[entityId] = -1;
    }
  }
}

/**
 * Persistence cannot let a prior voluntary yield outrank current forced or
 * explicit movement authority. Equal-priority peers retain ordinary memory.
 */
function rememberedYieldConflictsWithCurrentAuthority(
  workspace: IndividualActiveStandingCollisionWorkspace,
  entityId: number,
  partner: number,
): boolean {
  const entityRoutes = workspace.routingFlags[entityId] !== 0;
  const partnerRoutes = workspace.routingFlags[partner] !== 0;
  if (entityRoutes) return !partnerRoutes;
  if (partnerRoutes) return false;

  const entityPushes = workspace.pushThroughFlags[entityId] !== 0;
  const partnerPushes = workspace.pushThroughFlags[partner] !== 0;
  return entityPushes && !partnerPushes;
}

function canBegin(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
): boolean {
  const offset = entityId * 2;
  return workspace.ordinaryMoverFlags[entityId] !== 0 &&
    collision.localDecisionCodes[entityId] ===
      INDIVIDUAL_COLLISION_LOCAL_DECISION.none &&
    workspace.courtesyRecipientByEntity[entityId]! < 0 &&
    (collision.permittedDeltas[offset] !== 0 ||
      collision.permittedDeltas[offset + 1] !== 0);
}

function beginCourtesy(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  yielder: number,
  recipient: number,
  ticks: number,
): void {
  collision.localDecisionCodes[yielder] =
    INDIVIDUAL_COLLISION_LOCAL_DECISION.courtesyYield;
  collision.localDecisionPartnerByEntity[yielder] = recipient;
  collision.localDecisionTicksRemaining[yielder] = Math.max(
    1, Math.min(COURTESY_TICKS, ticks),
  );
  collision.courtesyAttemptedPartnerByEntity[yielder] = recipient;
  setDecisionDesire(collision, yielder);
  workspace.courtesyRecipientByEntity[recipient] = yielder;
}

function beginOvertake(
  collision: IndividualCollisionResolutionStore,
  follower: number,
  leader: number,
  side: number,
  clearance: number,
): void {
  collision.localDecisionCodes[follower] =
    INDIVIDUAL_COLLISION_LOCAL_DECISION.overtake;
  collision.localDecisionPartnerByEntity[follower] = leader;
  collision.localDecisionSideByEntity[follower] = side;
  collision.localDecisionTicksRemaining[follower] = DETOUR_WIDE_TICKS;
  collision.localDecisionStartXByEntity[follower] =
    collision.tickStartXByEntity[follower]!;
  collision.localDecisionStartYByEntity[follower] =
    collision.tickStartYByEntity[follower]!;
  collision.overtakeClearanceByEntity[follower] = clearance;
  setDecisionDesire(collision, follower);
}

function beginDetour(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  yielder: number,
  blocker: number,
  side: number,
  urgent: boolean,
): void {
  collision.localDecisionCodes[yielder] =
    INDIVIDUAL_COLLISION_LOCAL_DECISION.detour;
  collision.localDecisionPartnerByEntity[yielder] = blocker;
  collision.localDecisionSideByEntity[yielder] = side;
  collision.localDecisionPhaseByEntity[yielder] = urgent ? 2 : 1;
  collision.localDecisionTicksRemaining[yielder] = urgent
    ? DETOUR_SWITCHED_TICKS
    : DETOUR_INITIAL_TICKS;
  collision.localDecisionStartXByEntity[yielder] =
    collision.tickStartXByEntity[yielder]!;
  collision.localDecisionStartYByEntity[yielder] =
    collision.tickStartYByEntity[yielder]!;
  setDecisionDesire(collision, yielder);
  void workspace;
}

function applyDecision(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
): void {
  const code = collision.localDecisionCodes[entityId]!;
  const offset = entityId * 2;
  if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.courtesyYield) {
    collision.resolvedDeltas[offset] = 0;
    collision.resolvedDeltas[offset + 1] = 0;
    return;
  }
  if (code === INDIVIDUAL_COLLISION_LOCAL_DECISION.overtake) {
    applyOvertakeDelta(workspace, collision, entityId);
    return;
  }
  if (code !== INDIVIDUAL_COLLISION_LOCAL_DECISION.detour) return;
  const phase = collision.localDecisionPhaseByEntity[entityId]!;
  if (workspace.looseLateralFreedomFlags[entityId] === 0 && phase === 1) {
    collision.resolvedDeltas[offset] = 0;
    collision.resolvedDeltas[offset + 1] = 0;
    return;
  }
  applyDetourDelta(workspace, collision, entityId, phase);
}

function applyDetourDelta(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  phase: number,
): void {
  const offset = entityId * 2;
  const permittedX = collision.permittedDeltas[offset]!;
  const permittedY = collision.permittedDeltas[offset + 1]!;
  const budget = permittedX * permittedX + permittedY * permittedY;
  const forwardX = sign(permittedX);
  const forwardY = sign(permittedY);
  const side = collision.localDecisionSideByEntity[entityId]! || 1;
  const lateralX = -forwardY * side;
  const lateralY = forwardX * side;
  if (phase >= 3 || !setCandidate(
    workspace, collision, entityId,
    forwardX + lateralX, forwardY + lateralY, budget,
  )) {
    setCandidate(
      workspace, collision, entityId, lateralX, lateralY, budget,
    );
  }
}

function applyOvertakeDelta(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  follower: number,
): void {
  const offset = follower * 2;
  const permittedX = collision.permittedDeltas[offset]!;
  const permittedY = collision.permittedDeltas[offset + 1]!;
  const budget = permittedX * permittedX + permittedY * permittedY;
  const forwardX = collision.localDecisionDesireXByEntity[follower]!;
  const forwardY = collision.localDecisionDesireYByEntity[follower]!;
  const side = collision.localDecisionSideByEntity[follower]! || 1;
  const lateralX = -forwardY * side;
  const lateralY = forwardX * side;
  const crossTrack =
    (collision.tickStartXByEntity[follower]! -
      collision.localDecisionStartXByEntity[follower]!) * lateralX +
    (collision.tickStartYByEntity[follower]! -
      collision.localDecisionStartYByEntity[follower]!) * lateralY;
  if (crossTrack < collision.overtakeClearanceByEntity[follower]!) {
    if (!setCandidate(
      workspace, collision, follower,
      forwardX + lateralX, forwardY + lateralY, budget,
    )) setCandidate(workspace, collision, follower, lateralX, lateralY, budget);
  }
}

function setCandidate(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  deltaX: number,
  deltaY: number,
  budgetSquared: number,
): boolean {
  if (deltaX * deltaX + deltaY * deltaY > budgetSquared) return false;
  const x = collision.tickStartXByEntity[entityId]! + deltaX;
  const y = collision.tickStartYByEntity[entityId]! + deltaY;
  if (x < 0 || y < 0 || x >= workspace.bounds.width ||
      y >= workspace.bounds.height) return false;
  const offset = entityId * 2;
  collision.resolvedDeltas[offset] = deltaX;
  collision.resolvedDeltas[offset + 1] = deltaY;
  return true;
}

function advanceDetourPhase(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
): void {
  const phase = collision.localDecisionPhaseByEntity[entityId]!;
  const next = phase >= 3 ? 1 : phase + 1;
  if (next === 2) {
    collision.localDecisionSideByEntity[entityId] =
      -collision.localDecisionSideByEntity[entityId]!;
  }
  collision.localDecisionPhaseByEntity[entityId] = next;
  collision.localDecisionTicksRemaining[entityId] = next === 1
    ? DETOUR_INITIAL_TICKS
    : next === 2 ? DETOUR_SWITCHED_TICKS : DETOUR_WIDE_TICKS;
  collision.localDecisionStartXByEntity[entityId] =
    collision.tickStartXByEntity[entityId]!;
  collision.localDecisionStartYByEntity[entityId] =
    collision.tickStartYByEntity[entityId]!;
}

function requestedPairConflicts(
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  leftId: number,
  rightId: number,
): boolean {
  const left = leftId * 2;
  const right = rightId * 2;
  return pairCollides(
    collision.tickStartXByEntity[leftId]!,
    collision.tickStartYByEntity[leftId]!,
    collision.permittedDeltas[left]!,
    collision.permittedDeltas[left + 1]!,
    collision.tickStartXByEntity[rightId]!,
    collision.tickStartYByEntity[rightId]!,
    collision.permittedDeltas[right]!,
    collision.permittedDeltas[right + 1]!,
    occupancy.effectiveRadii[leftId]! + occupancy.effectiveRadii[rightId]!,
  );
}

function crossingDesires(
  collision: IndividualCollisionResolutionStore,
  leftId: number,
  rightId: number,
): boolean {
  const left = leftId * 2;
  const right = rightId * 2;
  const lx = collision.permittedDeltas[left]!;
  const ly = collision.permittedDeltas[left + 1]!;
  const rx = collision.permittedDeltas[right]!;
  const ry = collision.permittedDeltas[right + 1]!;
  const lm = lx * lx + ly * ly;
  const rm = rx * rx + ry * ry;
  if (lm === 0 || rm === 0) return false;
  const dot = lx * rx + ly * ry;
  return dot * dot * 4 <= lm * rm;
}

function sameDirection(
  collision: IndividualCollisionResolutionStore,
  leftId: number,
  rightId: number,
): boolean {
  const left = leftId * 2;
  const right = rightId * 2;
  const lx = collision.permittedDeltas[left]!;
  const ly = collision.permittedDeltas[left + 1]!;
  const rx = collision.permittedDeltas[right]!;
  const ry = collision.permittedDeltas[right + 1]!;
  const dot = lx * rx + ly * ry;
  const cross = lx * ry - ly * rx;
  return dot > 0 && cross * cross * 4 <=
    (lx * lx + ly * ly) * (rx * rx + ry * ry);
}

function fasterRearFollower(
  collision: IndividualCollisionResolutionStore,
  leftId: number,
  rightId: number,
): number {
  if (!sameDirection(collision, leftId, rightId)) return -1;
  const left = leftId * 2;
  const right = rightId * 2;
  const lx = collision.permittedDeltas[left]!;
  const ly = collision.permittedDeltas[left + 1]!;
  const rx = collision.permittedDeltas[right]!;
  const ry = collision.permittedDeltas[right + 1]!;
  const ls = lx * lx + ly * ly;
  const rs = rx * rx + ry * ry;
  if (ls === rs) return -1;
  const progress =
    (collision.tickStartXByEntity[leftId]! -
      collision.tickStartXByEntity[rightId]!) * (lx + rx) +
    (collision.tickStartYByEntity[leftId]! -
      collision.tickStartYByEntity[rightId]!) * (ly + ry);
  const rear = progress < 0 ? leftId : rightId;
  const faster = ls > rs ? leftId : rightId;
  return rear === faster ? faster : -1;
}

function courtesyClearanceTicks(
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  yielder: number,
  mover: number,
): number {
  if (!crossingDesires(collision, yielder, mover)) return 0;
  const yielderOffset = yielder * 2;
  const moverOffset = mover * 2;
  const radius = occupancy.effectiveRadii[yielder]! +
    occupancy.effectiveRadii[mover]!;
  const radiusSquared = radius * radius;
  let lastConflict = 0;
  for (let tick = 1; tick <= COURTESY_TICKS; tick += 1) {
    const movingX = collision.tickStartXByEntity[yielder]! +
        collision.permittedDeltas[yielderOffset]! * tick -
      collision.tickStartXByEntity[mover]! -
        collision.permittedDeltas[moverOffset]! * tick;
    const movingY = collision.tickStartYByEntity[yielder]! +
        collision.permittedDeltas[yielderOffset + 1]! * tick -
      collision.tickStartYByEntity[mover]! -
        collision.permittedDeltas[moverOffset + 1]! * tick;
    if (movingX * movingX + movingY * movingY < radiusSquared) {
      lastConflict = tick;
    }
    const waitingX = collision.tickStartXByEntity[yielder]! -
      collision.tickStartXByEntity[mover]! -
        collision.permittedDeltas[moverOffset]! * tick;
    const waitingY = collision.tickStartYByEntity[yielder]! -
      collision.tickStartYByEntity[mover]! -
        collision.permittedDeltas[moverOffset + 1]! * tick;
    if (waitingX * waitingX + waitingY * waitingY < radiusSquared) return 0;
  }
  return lastConflict > 0 && lastConflict < COURTESY_TICKS
    ? lastConflict + 1
    : 0;
}

function courtesyYielder(
  collision: IndividualCollisionResolutionStore,
  leftId: number,
  rightId: number,
  leftClearance: number,
  rightClearance: number,
): number {
  if (leftClearance === 0) return rightId;
  if (rightClearance === 0) return leftId;
  if (leftClearance !== rightClearance) {
    return leftClearance < rightClearance ? leftId : rightId;
  }
  const left = leftId * 2;
  const right = rightId * 2;
  const leftCost = leftClearance * (
    collision.permittedDeltas[left]! ** 2 +
    collision.permittedDeltas[left + 1]! ** 2
  );
  const rightCost = rightClearance * (
    collision.permittedDeltas[right]! ** 2 +
    collision.permittedDeltas[right + 1]! ** 2
  );
  if (leftCost !== rightCost) return leftCost < rightCost ? leftId : rightId;
  return leftId > rightId ? leftId : rightId;
}

function ordinaryYielder(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  formation: FormationBehaviourStore,
  identity: UnitIdentityStore,
  leftId: number,
  rightId: number,
): number {
  const leftLoose = workspace.looseLateralFreedomFlags[leftId]!;
  const rightLoose = workspace.looseLateralFreedomFlags[rightId]!;
  if (leftLoose !== rightLoose) return leftLoose !== 0 ? leftId : rightId;
  const leftCohesion = getUnitCohesion(
    formation, getUnitIdForEntity(identity, leftId),
  );
  const rightCohesion = getUnitCohesion(
    formation, getUnitIdForEntity(identity, rightId),
  );
  if (leftCohesion !== rightCohesion) {
    return leftCohesion < rightCohesion ? leftId : rightId;
  }
  const left = leftId * 2;
  const right = rightId * 2;
  const leftBudget = collision.permittedDeltas[left]! ** 2 +
    collision.permittedDeltas[left + 1]! ** 2;
  const rightBudget = collision.permittedDeltas[right]! ** 2 +
    collision.permittedDeltas[right + 1]! ** 2;
  if (leftBudget !== rightBudget) return leftBudget < rightBudget ? leftId : rightId;
  return leftId > rightId ? leftId : rightId;
}

function sideFor(
  collision: IndividualCollisionResolutionStore,
  mover: number,
  blocker: number,
): number {
  const offset = mover * 2;
  const forwardX = sign(collision.permittedDeltas[offset]!);
  const forwardY = sign(collision.permittedDeltas[offset + 1]!);
  const relativeX = collision.tickStartXByEntity[blocker]! -
    collision.tickStartXByEntity[mover]!;
  const relativeY = collision.tickStartYByEntity[blocker]! -
    collision.tickStartYByEntity[mover]!;
  const cross = forwardX * relativeY - forwardY * relativeX;
  if (cross !== 0) return cross > 0 ? -1 : 1;
  return ((mover + blocker) & 1) === 0 ? 1 : -1;
}

function openOvertakeSide(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  follower: number,
  leader: number,
  clearance: number,
): number {
  const offset = follower * 2;
  const forwardX = sign(collision.permittedDeltas[offset]!);
  const forwardY = sign(collision.permittedDeltas[offset + 1]!);
  const positiveX = collision.tickStartXByEntity[follower]! -
    forwardY * clearance;
  const positiveY = collision.tickStartYByEntity[follower]! +
    forwardX * clearance;
  const negativeX = collision.tickStartXByEntity[follower]! +
    forwardY * clearance;
  const negativeY = collision.tickStartYByEntity[follower]! -
    forwardX * clearance;
  const positive = overtakeClearanceScore(
    workspace, collision, occupancy, follower, leader,
    positiveX, positiveY, clearance,
  );
  const negative = overtakeClearanceScore(
    workspace, collision, occupancy, follower, leader,
    negativeX, negativeY, clearance,
  );
  if (positive < 0 && negative < 0) return 0;
  if (positive !== negative) return positive > negative ? 1 : -1;
  return sideFor(collision, follower, leader);
}

function overtakeClearanceScore(
  workspace: IndividualActiveStandingCollisionWorkspace,
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  follower: number,
  leader: number,
  targetX: number,
  targetY: number,
  clearance: number,
): number {
  if (!inBounds(workspace, targetX, targetY)) return -1;
  const nearby = queryNearbyEntitiesInto(
    workspace.grid,
    targetX,
    targetY,
    clearance + occupancy.geometry.activeStandingRadius * 2,
    workspace.scratchClearanceEntityIds,
  );
  workspace.localQueryCount += 1;
  let minimumDistanceSquared = 0x7fff_ffff;
  for (let index = 0; index < nearby.length; index += 1) {
    const otherId = nearby[index]!;
    if (otherId === follower || otherId === leader ||
        workspace.activeStandingFlags[otherId] === 0) continue;
    workspace.localCandidateCount += 1;
    const deltaX = collision.tickStartXByEntity[otherId]! - targetX;
    const deltaY = collision.tickStartYByEntity[otherId]! - targetY;
    const minimum = occupancy.effectiveRadii[follower]! +
      occupancy.effectiveRadii[otherId]! + OVERTAKE_MARGIN;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared < minimum * minimum) return -1;
    if (distanceSquared < minimumDistanceSquared) {
      minimumDistanceSquared = distanceSquared;
    }
  }
  return minimumDistanceSquared;
}

function overtakeCleared(
  collision: IndividualCollisionResolutionStore,
  occupancy: IndividualPhysicalOccupancyStore,
  follower: number,
  leader: number,
): boolean {
  const ahead =
    (collision.tickStartXByEntity[follower]! -
      collision.tickStartXByEntity[leader]!) *
        collision.localDecisionDesireXByEntity[follower]! +
    (collision.tickStartYByEntity[follower]! -
      collision.tickStartYByEntity[leader]!) *
        collision.localDecisionDesireYByEntity[follower]!;
  return ahead > occupancy.effectiveRadii[follower]! +
    occupancy.effectiveRadii[leader]! + OVERTAKE_MARGIN;
}

function overtakePairStillValid(
  collision: IndividualCollisionResolutionStore,
  follower: number,
  leader: number,
): boolean {
  const followerOffset = follower * 2;
  const leaderOffset = leader * 2;
  const desireX = collision.localDecisionDesireXByEntity[follower]!;
  const desireY = collision.localDecisionDesireYByEntity[follower]!;
  return collision.permittedDeltas[followerOffset]! * desireX +
      collision.permittedDeltas[followerOffset + 1]! * desireY > 0 &&
    collision.permittedDeltas[leaderOffset]! * desireX +
      collision.permittedDeltas[leaderOffset + 1]! * desireY > 0;
}

function validPartner(
  workspace: IndividualActiveStandingCollisionWorkspace,
  identity: UnitIdentityStore,
  entityId: number,
  partner: number,
): boolean {
  return partner >= 0 && partner < workspace.entityCount &&
    workspace.ordinaryMoverFlags[partner] !== 0 &&
    faction(identity, entityId) === faction(identity, partner);
}

function desireChanged(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
): boolean {
  const offset = entityId * 2;
  const x = sign(collision.permittedDeltas[offset]!);
  const y = sign(collision.permittedDeltas[offset + 1]!);
  return (x === 0 && y === 0) ||
    x * collision.localDecisionDesireXByEntity[entityId]! +
      y * collision.localDecisionDesireYByEntity[entityId]! <= 0;
}

function madeMeaningfulDetourProgress(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
): boolean {
  const progress =
    (collision.tickStartXByEntity[entityId]! -
      collision.localDecisionStartXByEntity[entityId]!) *
        collision.localDecisionDesireXByEntity[entityId]! +
    (collision.tickStartYByEntity[entityId]! -
      collision.localDecisionStartYByEntity[entityId]!) *
        collision.localDecisionDesireYByEntity[entityId]!;
  const phase = collision.localDecisionPhaseByEntity[entityId]!;
  const duration = phase === 1
    ? DETOUR_INITIAL_TICKS
    : phase === 2 ? DETOUR_SWITCHED_TICKS : DETOUR_WIDE_TICKS;
  return progress >= Math.max(2, Math.floor(duration / 5));
}

function setDecisionDesire(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
): void {
  const offset = entityId * 2;
  collision.localDecisionDesireXByEntity[entityId] =
    sign(collision.permittedDeltas[offset]!);
  collision.localDecisionDesireYByEntity[entityId] =
    sign(collision.permittedDeltas[offset + 1]!);
}

function clearDecision(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  retainCourtesyAttempt: boolean,
): void {
  collision.localDecisionCodes[entityId] =
    INDIVIDUAL_COLLISION_LOCAL_DECISION.none;
  collision.localDecisionPartnerByEntity[entityId] = -1;
  collision.localDecisionSideByEntity[entityId] = 0;
  collision.localDecisionTicksRemaining[entityId] = 0;
  collision.localDecisionPhaseByEntity[entityId] = 0;
  collision.overtakeClearanceByEntity[entityId] = 0;
  if (!retainCourtesyAttempt) {
    collision.courtesyAttemptedPartnerByEntity[entityId] = -1;
  }
}

function decisionYieldsTo(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  partner: number,
): boolean {
  return collision.localDecisionCodes[entityId] !==
      INDIVIDUAL_COLLISION_LOCAL_DECISION.none &&
    collision.localDecisionPartnerByEntity[entityId] === partner;
}

function pairCollides(
  leftStartX: number,
  leftStartY: number,
  leftDeltaX: number,
  leftDeltaY: number,
  rightStartX: number,
  rightStartY: number,
  rightDeltaX: number,
  rightDeltaY: number,
  radius: number,
): boolean {
  const startX = rightStartX - leftStartX;
  const startY = rightStartY - leftStartY;
  const deltaX = rightDeltaX - leftDeltaX;
  const deltaY = rightDeltaY - leftDeltaY;
  const startDistance = startX * startX + startY * startY;
  const endX = startX + deltaX;
  const endY = startY + deltaY;
  const endDistance = endX * endX + endY * endY;
  const radiusSquared = radius * radius;
  if (startDistance < radiusSquared) return endDistance < startDistance;
  const length = deltaX * deltaX + deltaY * deltaY;
  if (length === 0) return false;
  const closest = -(startX * deltaX + startY * deltaY);
  if (closest <= 0) return false;
  if (closest >= length) return endDistance < radiusSquared;
  const cross = startX * deltaY - startY * deltaX;
  return cross * cross < radiusSquared * length;
}

function addNeighbourEvidence(
  collision: IndividualCollisionResolutionStore,
  entityId: number,
  count: number,
): void {
  if (count > collision.localNeighbourCounts[entityId]!) {
    collision.localNeighbourCounts[entityId] = Math.min(0xffff, count);
  }
}

function faction(identity: UnitIdentityStore, entityId: number): number {
  return getFactionIdForUnit(identity, getUnitIdForEntity(identity, entityId));
}

function inBounds(
  workspace: IndividualActiveStandingCollisionWorkspace,
  x: number,
  y: number,
): boolean {
  return x >= 0 && y >= 0 && x < workspace.bounds.width &&
    y < workspace.bounds.height;
}

function sign(value: number): number {
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}
