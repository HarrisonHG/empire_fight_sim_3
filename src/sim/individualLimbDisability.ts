export type IndividualLimbDisabilityKind = "disabledArm" | "disabledLeg";

export interface IndividualLimbDisabilityStore {
  readonly entityCount: number;
}

interface InternalIndividualLimbDisabilityStore
  extends IndividualLimbDisabilityStore {
  readonly disabledArmByEntity: Uint8Array;
  readonly disabledLegByEntity: Uint8Array;
  readonly armEpisodeCountByEntity: Uint32Array;
  readonly legEpisodeCountByEntity: Uint32Array;
  readonly armClearedCountByEntity: Uint32Array;
  readonly legClearedCountByEntity: Uint32Array;
}

export interface IndividualLimbDisabilityInspection {
  readonly disabledArm: boolean;
  readonly disabledLeg: boolean;
  readonly armEpisodeCount: number;
  readonly legEpisodeCount: number;
  readonly armClearedCount: number;
  readonly legClearedCount: number;
}

export interface IndividualLimbDisabilityApplicationRecord {
  readonly entityId: number;
  readonly kind: IndividualLimbDisabilityKind;
  readonly applied: boolean;
}

export function createIndividualLimbDisabilityStore(
  entityCount: number,
): IndividualLimbDisabilityStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  return {
    entityCount,
    disabledArmByEntity: new Uint8Array(entityCount),
    disabledLegByEntity: new Uint8Array(entityCount),
    armEpisodeCountByEntity: new Uint32Array(entityCount),
    legEpisodeCountByEntity: new Uint32Array(entityCount),
    armClearedCountByEntity: new Uint32Array(entityCount),
    legClearedCountByEntity: new Uint32Array(entityCount),
  } as InternalIndividualLimbDisabilityStore;
}

/** Trusted/test hook until Milestone 13 supplies CLEAVE/IMPALE sources. */
export function applyTrustedIndividualLimbDisability(
  store: IndividualLimbDisabilityStore,
  entityId: number,
  kind: IndividualLimbDisabilityKind,
): IndividualLimbDisabilityApplicationRecord {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  assertKind(kind);
  const state = kind === "disabledLeg"
    ? internal.disabledLegByEntity
    : internal.disabledArmByEntity;
  const episodes = kind === "disabledLeg"
    ? internal.legEpisodeCountByEntity
    : internal.armEpisodeCountByEntity;
  const applied = state[entityId] === 0;
  if (applied) {
    state[entityId] = 1;
    incrementBounded(episodes, entityId, `${kind} episode count`);
  }
  return { entityId, kind, applied };
}

export function clearIndividualLimbDisability(
  store: IndividualLimbDisabilityStore,
  entityId: number,
  kind: IndividualLimbDisabilityKind,
): boolean {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  assertKind(kind);
  const state = kind === "disabledLeg"
    ? internal.disabledLegByEntity
    : internal.disabledArmByEntity;
  if (state[entityId] === 0) return false;
  state[entityId] = 0;
  incrementBounded(
    kind === "disabledLeg"
      ? internal.legClearedCountByEntity
      : internal.armClearedCountByEntity,
    entityId,
    `${kind} cleared count`,
  );
  return true;
}

export function hasIndividualLimbDisability(
  store: IndividualLimbDisabilityStore,
  entityId: number,
  kind: IndividualLimbDisabilityKind,
): boolean {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  assertKind(kind);
  return (kind === "disabledLeg"
    ? internal.disabledLegByEntity[entityId]
    : internal.disabledArmByEntity[entityId]) !== 0;
}

export function getHighestPriorityIndividualLimbDisability(
  store: IndividualLimbDisabilityStore,
  entityId: number,
): IndividualLimbDisabilityKind | undefined {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  if (internal.disabledLegByEntity[entityId] !== 0) return "disabledLeg";
  return internal.disabledArmByEntity[entityId] !== 0
    ? "disabledArm"
    : undefined;
}

export function getIndividualLimbDisabilityInspection(
  store: IndividualLimbDisabilityStore,
  entityId: number,
): IndividualLimbDisabilityInspection {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    disabledArm: internal.disabledArmByEntity[entityId] !== 0,
    disabledLeg: internal.disabledLegByEntity[entityId] !== 0,
    armEpisodeCount: internal.armEpisodeCountByEntity[entityId]!,
    legEpisodeCount: internal.legEpisodeCountByEntity[entityId]!,
    armClearedCount: internal.armClearedCountByEntity[entityId]!,
    legClearedCount: internal.legClearedCountByEntity[entityId]!,
  };
}

function asInternal(
  store: IndividualLimbDisabilityStore,
): InternalIndividualLimbDisabilityStore {
  return store as InternalIndividualLimbDisabilityStore;
}

function incrementBounded(array: Uint32Array, entityId: number, label: string): void {
  const current = array[entityId]!;
  if (current === 0xffffffff) throw new RangeError(`${label} overflow.`);
  array[entityId] = current + 1;
}

function assertKind(kind: IndividualLimbDisabilityKind): void {
  if (kind !== "disabledArm" && kind !== "disabledLeg") {
    throw new RangeError("Unknown individual limb-disability kind.");
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Limb-disability entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
