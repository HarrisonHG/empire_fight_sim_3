import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import type { CasualtyDragGroupRecord } from "./individualCasualtyAssistance";

export type IndividualPhysicalOccupancyClass =
  | "activeStanding"
  | "downedSoft"
  | "assistedMoving"
  | "yieldingEgress"
  | "nonBattlefield";

export const INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS = Object.freeze({
  nonBattlefield: 0,
  activeStanding: 1,
  downedSoft: 2,
  assistedMoving: 3,
  yieldingEgress: 4,
} as const);

export const INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG = Object.freeze({
  participatesInCollision: 1 << 0,
  hardStanding: 1 << 1,
  softDowned: 1 << 2,
  assistedGroup: 1 << 3,
  stronglyYielding: 1 << 4,
} as const);

export interface IndividualPersonalSpaceGeometry {
  readonly activeStandingRadius: number;
  readonly downedSoftRadius: number;
  readonly assistedMovingRadius: number;
  readonly yieldingEgressRadius: number;
}

/** Accepted person-scale production geometry. Later content may select categories. */
export const PRODUCTION_PERSONAL_SPACE_GEOMETRY = Object.freeze({
  activeStandingRadius: 4,
  downedSoftRadius: 5,
  assistedMovingRadius: 4,
  yieldingEgressRadius: 4,
} satisfies IndividualPersonalSpaceGeometry);

export interface IndividualPhysicalOccupancyStore {
  readonly entityCount: number;
  readonly geometry: IndividualPersonalSpaceGeometry;
  readonly occupancyClassCodes: Uint8Array;
  readonly effectiveRadii: Uint8Array;
  readonly occupancyFlags: Uint8Array;
  readonly assistanceGroupIds: Int32Array;
}

interface InternalIndividualPhysicalOccupancyStore
  extends IndividualPhysicalOccupancyStore {
  projectionTick: number;
}

const OCCUPANCY_CLASS_NAMES = [
  "nonBattlefield",
  "activeStanding",
  "downedSoft",
  "assistedMoving",
  "yieldingEgress",
] as const;

export interface IndividualPhysicalOccupancyInspection {
  readonly occupancyClass: IndividualPhysicalOccupancyClass;
  readonly effectiveRadius: number;
  readonly participatesInCollision: boolean;
  readonly hardStanding: boolean;
  readonly softDowned: boolean;
  readonly assistedGroup: boolean;
  readonly stronglyYielding: boolean;
  readonly assistanceGroupId: number;
  readonly projectionTick: number;
}

export function createIndividualPhysicalOccupancyStore(
  entityCount: number,
  geometry: IndividualPersonalSpaceGeometry =
    PRODUCTION_PERSONAL_SPACE_GEOMETRY,
): IndividualPhysicalOccupancyStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  validateGeometry(geometry);
  const assistanceGroupIds = new Int32Array(entityCount);
  assistanceGroupIds.fill(-1);
  return {
    entityCount,
    geometry: Object.freeze({ ...geometry }),
    occupancyClassCodes: new Uint8Array(entityCount),
    effectiveRadii: new Uint8Array(entityCount),
    occupancyFlags: new Uint8Array(entityCount),
    assistanceGroupIds,
    projectionTick: -1,
  } as InternalIndividualPhysicalOccupancyStore;
}

export function projectIndividualPhysicalOccupancyOneTick(
  store: IndividualPhysicalOccupancyStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  activeAssistanceGroups: readonly CasualtyDragGroupRecord[],
  tick: number,
): void {
  const internal = asInternal(store);
  validateEntityCounts(internal.entityCount, lifecycle, presence);
  assertNonNegativeSafeInteger(tick, "occupancy projection tick");
  if (tick < internal.projectionTick) {
    throw new Error("Physical occupancy projection cannot move backwards.");
  }

  internal.assistanceGroupIds.fill(-1);
  for (let index = 0; index < activeAssistanceGroups.length; index += 1) {
    const group = activeAssistanceGroups[index]!;
    if (group.phase !== "dragging") continue;
    markAssistedParticipant(internal, group.patientEntityId, group.groupId);
    for (let helperIndex = 0;
      helperIndex < group.helperEntityIds.length;
      helperIndex += 1) {
      markAssistedParticipant(
        internal,
        group.helperEntityIds[helperIndex]!,
        group.groupId,
      );
    }
  }

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const lifecycleState = getIndividualCharacterLifecycleState(
      lifecycle,
      entityId,
    );
    const presenceState = getIndividualPlayerPresenceState(presence, entityId);
    if (
      presenceState === "waitingAtRespawn" ||
      presenceState === "removedFromBattlefield"
    ) {
      setOccupancy(internal, entityId, "nonBattlefield");
    } else if (presenceState === "respawnEgress") {
      setOccupancy(internal, entityId, "yieldingEgress");
    } else if (internal.assistanceGroupIds[entityId]! >= 0) {
      setOccupancy(internal, entityId, "assistedMoving");
    } else if (
      lifecycleState === "active" &&
      presenceState === "activePresence"
    ) {
      setOccupancy(internal, entityId, "activeStanding");
    } else if (
      presenceState === "downedPresence" ||
      presenceState === "terminalAwaitingComfort" ||
      presenceState === "terminalComforted"
    ) {
      setOccupancy(internal, entityId, "downedSoft");
    } else {
      setOccupancy(internal, entityId, "nonBattlefield");
    }
  }
  internal.projectionTick = tick;
}

export function getIndividualPhysicalOccupancyProjectionTick(
  store: IndividualPhysicalOccupancyStore,
): number {
  return asInternal(store).projectionTick;
}

export function getIndividualPhysicalOccupancyClass(
  store: IndividualPhysicalOccupancyStore,
  entityId: number,
): IndividualPhysicalOccupancyClass {
  assertEntityId(entityId, store.entityCount);
  return OCCUPANCY_CLASS_NAMES[store.occupancyClassCodes[entityId]!]!;
}

export function getIndividualPhysicalOccupancyInspection(
  store: IndividualPhysicalOccupancyStore,
  entityId: number,
): IndividualPhysicalOccupancyInspection {
  assertEntityId(entityId, store.entityCount);
  const flags = store.occupancyFlags[entityId]!;
  return {
    occupancyClass: getIndividualPhysicalOccupancyClass(store, entityId),
    effectiveRadius: store.effectiveRadii[entityId]!,
    participatesInCollision:
      (flags & INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.participatesInCollision) !== 0,
    hardStanding:
      (flags & INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.hardStanding) !== 0,
    softDowned:
      (flags & INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.softDowned) !== 0,
    assistedGroup:
      (flags & INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.assistedGroup) !== 0,
    stronglyYielding:
      (flags & INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.stronglyYielding) !== 0,
    assistanceGroupId: store.assistanceGroupIds[entityId]!,
    projectionTick: asInternal(store).projectionTick,
  };
}

function setOccupancy(
  store: InternalIndividualPhysicalOccupancyStore,
  entityId: number,
  occupancyClass: IndividualPhysicalOccupancyClass,
): void {
  const geometry = store.geometry;
  switch (occupancyClass) {
    case "activeStanding":
      store.occupancyClassCodes[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.activeStanding;
      store.effectiveRadii[entityId] = geometry.activeStandingRadius;
      store.occupancyFlags[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.participatesInCollision |
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.hardStanding;
      break;
    case "downedSoft":
      store.occupancyClassCodes[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.downedSoft;
      store.effectiveRadii[entityId] = geometry.downedSoftRadius;
      store.occupancyFlags[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.participatesInCollision |
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.softDowned;
      break;
    case "assistedMoving":
      store.occupancyClassCodes[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.assistedMoving;
      store.effectiveRadii[entityId] = geometry.assistedMovingRadius;
      store.occupancyFlags[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.participatesInCollision |
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.hardStanding |
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.assistedGroup;
      break;
    case "yieldingEgress":
      store.occupancyClassCodes[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress;
      store.effectiveRadii[entityId] = geometry.yieldingEgressRadius;
      store.occupancyFlags[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.participatesInCollision |
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.hardStanding |
        INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.stronglyYielding;
      break;
    case "nonBattlefield":
      store.occupancyClassCodes[entityId] =
        INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.nonBattlefield;
      store.effectiveRadii[entityId] = 0;
      store.occupancyFlags[entityId] = 0;
      store.assistanceGroupIds[entityId] = -1;
      break;
  }
}

function markAssistedParticipant(
  store: InternalIndividualPhysicalOccupancyStore,
  entityId: number,
  groupId: number,
): void {
  assertEntityId(entityId, store.entityCount);
  assertNonNegativeSafeInteger(groupId, "assistance group ID");
  if (store.assistanceGroupIds[entityId]! >= 0) {
    throw new Error("An entity cannot occupy more than one active drag group.");
  }
  store.assistanceGroupIds[entityId] = groupId;
}

function validateGeometry(geometry: IndividualPersonalSpaceGeometry): void {
  const values = [
    geometry.activeStandingRadius,
    geometry.downedSoftRadius,
    geometry.assistedMovingRadius,
    geometry.yieldingEgressRadius,
  ];
  for (let index = 0; index < values.length; index += 1) {
    const radius = values[index]!;
    if (!Number.isSafeInteger(radius) || radius <= 0 || radius > 0xff) {
      throw new RangeError(
        "Personal-space radii must be positive integers fitting Uint8Array.",
      );
    }
  }
}

function validateEntityCounts(
  entityCount: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  for (let index = 0; index < stores.length; index += 1) {
    if (stores[index]!.entityCount !== entityCount) {
      throw new RangeError("Physical occupancy stores must share entityCount.");
    }
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Physical occupancy entity ID is out of bounds.");
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
  store: IndividualPhysicalOccupancyStore,
): InternalIndividualPhysicalOccupancyStore {
  return store as InternalIndividualPhysicalOccupancyStore;
}
