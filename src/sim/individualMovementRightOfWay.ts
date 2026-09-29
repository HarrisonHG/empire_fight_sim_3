import type { FormationBehaviourStore } from "./formationBehaviour";
import { getUnitMovementStyle } from "./formationBehaviour";
import type {
  CasualtyDragGroupRecord,
  CasualtyDragGroupStore,
} from "./individualCasualtyAssistance";
import { getActiveCasualtyDragGroups } from "./individualCasualtyAssistance";
import type { IndividualMedicalClaimStore } from "./individualMedicalClaims";
import { isIndividualMedicalClaimApproachCommitted } from "./individualMedicalClaims";
import type { IndividualMedicalUrgencyStore } from "./individualMedicalReadModel";
import { isIndividualTraumaWithdrawalActive } from "./individualMedicalReadModel";
import {
  INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS,
  getIndividualPhysicalOccupancyProjectionTick,
  type IndividualPhysicalOccupancyStore,
} from "./individualPhysicalOccupancy";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import { getUnitIdForEntity, type UnitIdentityStore } from "./unitIdentity";

/**
 * Role-agnostic local social priority. Collision compares only these ordered
 * classes; projection remains responsible for interpreting current authority.
 */
export const INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS = Object.freeze({
  yielding: 0,
  baseline: 1,
  urgentSupport: 2,
  elevated: 3,
  high: 4,
  forceful: 5,
  urgentGroup: 6,
  forced: 7,
} as const);

export const INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE = Object.freeze({
  yieldingPresence: 0,
  ordinaryMovement: 1,
  urgentMedicalResponse: 2,
  pushThrough: 3,
  assistedRescue: 4,
  forcedRouting: 5,
} as const);

export interface IndividualMovementRightOfWayStore {
  readonly entityCount: number;
  readonly classCodes: Uint8Array;
  readonly sourceCodes: Uint8Array;
}

interface InternalStore extends IndividualMovementRightOfWayStore {
  projectionTick: number;
  readonly gatheringHelperFlags: Uint8Array;
}

export function createIndividualMovementRightOfWayStore(
  entityCount: number,
): IndividualMovementRightOfWayStore {
  if (!Number.isSafeInteger(entityCount) || entityCount <= 0) {
    throw new RangeError("Right-of-way entityCount must be positive.");
  }
  return {
    entityCount,
    classCodes: new Uint8Array(entityCount),
    sourceCodes: new Uint8Array(entityCount),
    gatheringHelperFlags: new Uint8Array(entityCount),
    projectionTick: -1,
  } as InternalStore;
}

export interface IndividualMovementRightOfWayProjectionInput {
  readonly occupancy: IndividualPhysicalOccupancyStore;
  readonly identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  readonly morale: UnitMoraleMovementStateSource;
  readonly medicalClaims: IndividualMedicalClaimStore;
  readonly medicalUrgency: IndividualMedicalUrgencyStore;
  readonly casualtyGroups: CasualtyDragGroupStore;
  readonly tick: number;
}

export function projectIndividualMovementRightOfWayOneTick(
  store: IndividualMovementRightOfWayStore,
  input: IndividualMovementRightOfWayProjectionInput,
): void {
  const internal = store as InternalStore;
  validateCounts(internal.entityCount, input.occupancy, input.identity,
    input.formation, input.medicalClaims, input.medicalUrgency,
    input.casualtyGroups);
  if (!Number.isSafeInteger(input.tick) || input.tick < 0) {
    throw new RangeError("Right-of-way projection tick must be non-negative.");
  }
  if (getIndividualPhysicalOccupancyProjectionTick(input.occupancy) !== input.tick) {
    throw new Error("Right-of-way requires current physical occupancy.");
  }
  if (input.tick < internal.projectionTick) {
    throw new Error("Right-of-way projection cannot move backwards.");
  }

  projectGatheringHelpers(internal.gatheringHelperFlags, input.casualtyGroups);

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const occupancyClass = input.occupancy.occupancyClassCodes[entityId]!;
    let priority: number = occupancyClass ===
      INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress
      ? INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.yielding
      : INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.baseline;
    let source: number = occupancyClass ===
      INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress
      ? INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.yieldingPresence
      : INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.ordinaryMovement;

    if (isIndividualMedicalClaimApproachCommitted(input.medicalClaims, entityId) ||
        isIndividualTraumaWithdrawalActive(input.medicalUrgency, entityId)) {
      priority = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.urgentSupport;
      source = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.urgentMedicalResponse;
    }
    const unitId = getUnitIdForEntity(input.identity, entityId);
    if (getUnitMovementStyle(input.formation, unitId) === "pushThrough") {
      priority = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.forceful;
      source = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.pushThrough;
    }
    if (isAssistedParticipant(input.occupancy, entityId) ||
        internal.gatheringHelperFlags[entityId] !== 0) {
      priority = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.urgentGroup;
      source = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.assistedRescue;
    }
    if (input.morale.get(unitId) === "routing") {
      priority = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.forced;
      source = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_SOURCE.forcedRouting;
    }
    internal.classCodes[entityId] = priority;
    internal.sourceCodes[entityId] = source;
  }
  internal.projectionTick = input.tick;
}

export function getIndividualMovementRightOfWayProjectionTick(
  store: IndividualMovementRightOfWayStore,
): number {
  return (store as InternalStore).projectionTick;
}

/** Returns the lower-priority local yielder, or -1 for an equal class. */
export function selectLocalRightOfWayYielder(
  store: IndividualMovementRightOfWayStore,
  leftEntityId: number,
  rightEntityId: number,
): number {
  assertEntity(leftEntityId, store.entityCount);
  assertEntity(rightEntityId, store.entityCount);
  const left = store.classCodes[leftEntityId]!;
  const right = store.classCodes[rightEntityId]!;
  if (left === right) return -1;
  return left < right ? leftEntityId : rightEntityId;
}

function isAssistedParticipant(
  occupancy: IndividualPhysicalOccupancyStore,
  entityId: number,
): boolean {
  return occupancy.occupancyClassCodes[entityId] ===
    INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.assistedMoving;
}

function projectGatheringHelpers(
  flags: Uint8Array,
  groups: CasualtyDragGroupStore,
): void {
  flags.fill(0);
  const active = getActiveCasualtyDragGroups(groups);
  for (let index = 0; index < active.length; index += 1) {
    const group: CasualtyDragGroupRecord = active[index]!;
    if (group.phase !== "gathering") continue;
    for (let helperIndex = 0; helperIndex < group.helperEntityIds.length;
      helperIndex += 1) {
      flags[group.helperEntityIds[helperIndex]!] = 1;
    }
  }
}

function validateCounts(
  count: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  for (const store of stores) {
    if (store.entityCount !== count) {
      throw new RangeError("Right-of-way stores must share entityCount.");
    }
  }
}

function assertEntity(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Right-of-way entity ID is out of bounds.");
  }
}
