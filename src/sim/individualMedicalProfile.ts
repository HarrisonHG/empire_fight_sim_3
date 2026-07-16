export const DEFAULT_PHYSICK_GENERIC_HERBS = 12;
export const MAX_GENERIC_HERBS = 0xffff;

export interface TrustedIndividualMedicalProfileConfig {
  readonly entityId: number;
  readonly hasChirurgeon: boolean;
  readonly hasPhysick: boolean;
  readonly startingGenericHerbs?: number;
}

export interface TrustedIndividualMedicalProfile {
  readonly entityId: number;
  readonly hasChirurgeon: boolean;
  readonly hasPhysick: boolean;
  readonly startingGenericHerbs: number;
}

export interface TrustedIndividualMedicalProfileStore {
  readonly entityCount: number;
}

interface InternalTrustedIndividualMedicalProfileStore
  extends TrustedIndividualMedicalProfileStore {
  readonly profiles: readonly TrustedIndividualMedicalProfile[];
}

export interface IndividualGenericHerbStore {
  readonly entityCount: number;
}

interface InternalIndividualGenericHerbStore extends IndividualGenericHerbStore {
  readonly currentByEntity: Uint16Array;
  readonly maximumByEntity: Uint16Array;
  readonly reservedByEntity: Uint16Array;
  readonly reservationActionIdByEntity: Float64Array;
}

export interface IndividualGenericHerbInspection {
  readonly current: number;
  readonly maximum: number;
  readonly reserved: number;
}

export interface IndividualGenericHerbReservationInspection {
  readonly reserved: number;
  readonly treatmentActionId: number;
}

export function createTrustedIndividualMedicalProfileStore(config: {
  readonly entityCount: number;
  readonly profiles: readonly TrustedIndividualMedicalProfileConfig[];
}): TrustedIndividualMedicalProfileStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  if (config.profiles.length !== config.entityCount) {
    throw new RangeError(
      "Trusted medical profiles must contain exactly one profile per entity.",
    );
  }
  const profiles = new Array<TrustedIndividualMedicalProfile>(config.entityCount);
  for (let index = 0; index < config.profiles.length; index += 1) {
    const profile = config.profiles[index]!;
    assertEntityId(profile.entityId, config.entityCount);
    if (profiles[profile.entityId] !== undefined) {
      throw new RangeError("Duplicate trusted medical profile entity ID.");
    }
    assertBoolean(profile.hasChirurgeon, "hasChirurgeon");
    assertBoolean(profile.hasPhysick, "hasPhysick");
    if (profile.hasPhysick && !profile.hasChirurgeon) {
      throw new RangeError("A Physick medical profile must also have Chirurgeon.");
    }
    const startingGenericHerbs = profile.startingGenericHerbs ??
      (profile.hasPhysick ? DEFAULT_PHYSICK_GENERIC_HERBS : 0);
    assertGenericHerbCount(startingGenericHerbs, "startingGenericHerbs");
    profiles[profile.entityId] = Object.freeze({
      entityId: profile.entityId,
      hasChirurgeon: profile.hasChirurgeon,
      hasPhysick: profile.hasPhysick,
      startingGenericHerbs,
    });
  }
  return Object.freeze({
    entityCount: config.entityCount,
    profiles: Object.freeze(profiles),
  }) as InternalTrustedIndividualMedicalProfileStore;
}

export function getTrustedIndividualMedicalProfile(
  store: TrustedIndividualMedicalProfileStore,
  entityId: number,
): TrustedIndividualMedicalProfile {
  const internal = store as InternalTrustedIndividualMedicalProfileStore;
  assertEntityId(entityId, internal.entityCount);
  return internal.profiles[entityId]!;
}

export function createIndividualGenericHerbStore(
  profiles: TrustedIndividualMedicalProfileStore,
): IndividualGenericHerbStore {
  const currentByEntity = new Uint16Array(profiles.entityCount);
  const maximumByEntity = new Uint16Array(profiles.entityCount);
  for (let entityId = 0; entityId < profiles.entityCount; entityId += 1) {
    const count = getTrustedIndividualMedicalProfile(
      profiles,
      entityId,
    ).startingGenericHerbs;
    currentByEntity[entityId] = count;
    maximumByEntity[entityId] = count;
  }
  const reservationActionIdByEntity = new Float64Array(profiles.entityCount);
  reservationActionIdByEntity.fill(-1);
  return {
    entityCount: profiles.entityCount,
    currentByEntity,
    maximumByEntity,
    reservedByEntity: new Uint16Array(profiles.entityCount),
    reservationActionIdByEntity,
  } as InternalIndividualGenericHerbStore;
}

export function getIndividualGenericHerbReservationInspection(
  store: IndividualGenericHerbStore,
  entityId: number,
): IndividualGenericHerbReservationInspection {
  const internal = store as InternalIndividualGenericHerbStore;
  assertEntityId(entityId, internal.entityCount);
  return {
    reserved: internal.reservedByEntity[entityId]!,
    treatmentActionId: internal.reservationActionIdByEntity[entityId]!,
  };
}

export function reserveIndividualGenericHerbForTreatment(
  store: IndividualGenericHerbStore,
  entityId: number,
  treatmentActionId: number,
): boolean {
  const internal = store as InternalIndividualGenericHerbStore;
  assertEntityId(entityId, internal.entityCount);
  assertNonNegativeSafeInteger(treatmentActionId, "treatmentActionId");
  if (internal.reservedByEntity[entityId] !== 0) {
    throw new Error("A Physick may own only one generic-herb reservation.");
  }
  if (getIndividualAvailableGenericHerbs(store, entityId) < 1) return false;
  internal.reservedByEntity[entityId] = 1;
  internal.reservationActionIdByEntity[entityId] = treatmentActionId;
  return true;
}

export function releaseIndividualGenericHerbTreatmentReservation(
  store: IndividualGenericHerbStore,
  entityId: number,
  treatmentActionId: number,
): void {
  const internal = requireMatchingTreatmentReservation(
    store, entityId, treatmentActionId,
  );
  internal.reservedByEntity[entityId] = 0;
  internal.reservationActionIdByEntity[entityId] = -1;
}

export function consumeIndividualGenericHerbTreatmentReservation(
  store: IndividualGenericHerbStore,
  entityId: number,
  treatmentActionId: number,
): void {
  const internal = requireMatchingTreatmentReservation(
    store, entityId, treatmentActionId,
  );
  const current = internal.currentByEntity[entityId]!;
  if (current < 1) {
    throw new Error("Reserved generic herb inventory cannot be empty.");
  }
  internal.currentByEntity[entityId] = current - 1;
  internal.reservedByEntity[entityId] = 0;
  internal.reservationActionIdByEntity[entityId] = -1;
}

export function getIndividualGenericHerbInspection(
  store: IndividualGenericHerbStore,
  entityId: number,
): IndividualGenericHerbInspection {
  const internal = store as InternalIndividualGenericHerbStore;
  assertEntityId(entityId, internal.entityCount);
  return {
    current: internal.currentByEntity[entityId]!,
    maximum: internal.maximumByEntity[entityId]!,
    reserved: internal.reservedByEntity[entityId]!,
  };
}

export function getIndividualAvailableGenericHerbs(
  store: IndividualGenericHerbStore,
  entityId: number,
): number {
  const internal = store as InternalIndividualGenericHerbStore;
  assertEntityId(entityId, internal.entityCount);
  return internal.currentByEntity[entityId]! - internal.reservedByEntity[entityId]!;
}

function assertGenericHerbCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_GENERIC_HERBS) {
    throw new RangeError(`${name} must be an integer from 0 to ${MAX_GENERIC_HERBS}.`);
  }
}

function requireMatchingTreatmentReservation(
  store: IndividualGenericHerbStore,
  entityId: number,
  treatmentActionId: number,
): InternalIndividualGenericHerbStore {
  const internal = store as InternalIndividualGenericHerbStore;
  assertEntityId(entityId, internal.entityCount);
  assertNonNegativeSafeInteger(treatmentActionId, "treatmentActionId");
  if (internal.reservedByEntity[entityId] !== 1 ||
    internal.reservationActionIdByEntity[entityId] !== treatmentActionId) {
    throw new Error("Only the matching treatment action may use its generic-herb reservation.");
  }
  return internal;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Medical profile entity ID is out of bounds.");
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

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be boolean.`);
  }
}
