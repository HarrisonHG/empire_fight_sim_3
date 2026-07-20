export const DEFAULT_MAXIMUM_ENERGY = 10_000;
export const DEFAULT_STARTING_ENERGY = 10_000;
export const DEFAULT_SAFE_REST_RECOVERY_PER_TICK = 5;
export const MAX_REPRESENTABLE_ENERGY = 0xffff_ffff;
export const MAX_ENERGY_HISTORY_TOTAL = 0xffff_ffff;
export const ENERGY_RATIO_FIXED_POINT_SCALE = 10_000;

export const FRESH_ENERGY_THRESHOLD_PERCENT = 60;
export const WORKING_ENERGY_THRESHOLD_PERCENT = 30;
export const WINDED_ENERGY_THRESHOLD_PERCENT = 10;

export type IndividualEnergyBand =
  | "fresh"
  | "working"
  | "winded"
  | "spent";

/** Trusted authored values. Omitted values use the Milestone 7 defaults. */
export interface TrustedIndividualEnergyProfileValues {
  readonly maximumEnergy?: number;
  readonly startingEnergy?: number;
  readonly safeRestRecoveryPerTick?: number;
}

export interface TrustedIndividualEnergyProfileConfig
  extends TrustedIndividualEnergyProfileValues {
  readonly entityId: number;
}

export interface TrustedIndividualEnergyProfile {
  readonly entityId: number;
  readonly maximumEnergy: number;
  readonly startingEnergy: number;
  readonly safeRestRecoveryPerTick: number;
}

export interface TrustedIndividualEnergyProfileStore {
  readonly entityCount: number;
}

export interface IndividualEnergyStore {
  readonly entityCount: number;
}

export interface IndividualEnergyHistoryInspection {
  readonly startingEnergy: number;
  readonly minimumEnergyReached: number;
  readonly firstWindedTick: number | null;
  readonly firstSpentTick: number | null;
  readonly totalEnergySpent: number;
  readonly totalEnergyRecovered: number;
}

export interface IndividualEnergyInspection
  extends IndividualEnergyHistoryInspection {
  readonly entityId: number;
  readonly currentEnergy: number;
  readonly maximumEnergy: number;
  readonly safeRestRecoveryPerTick: number;
  readonly ratioFixedPoint: number;
  readonly band: IndividualEnergyBand;
}

export interface IndividualEnergyChangeResult {
  readonly entityId: number;
  readonly requestedAmount: number;
  readonly appliedAmount: number;
  readonly currentEnergyBefore: number;
  readonly currentEnergyAfter: number;
}

interface TrustedProfileInternal {
  readonly profilesByEntity: readonly TrustedIndividualEnergyProfile[];
}

interface EnergyStoreInternal {
  readonly profiles: TrustedIndividualEnergyProfileStore;
  readonly currentEnergyByEntity: Uint32Array;
  readonly minimumEnergyByEntity: Uint32Array;
  readonly firstWindedTickByEntity: Float64Array;
  readonly firstSpentTickByEntity: Float64Array;
  readonly totalEnergySpentByEntity: Uint32Array;
  readonly totalEnergyRecoveredByEntity: Uint32Array;
}

const trustedProfileInternals = new WeakMap<
  TrustedIndividualEnergyProfileStore,
  TrustedProfileInternal
>();
const energyStoreInternals = new WeakMap<
  IndividualEnergyStore,
  EnergyStoreInternal
>();

export function createTrustedIndividualEnergyProfileStore(config: {
  readonly entityCount: number;
  readonly profiles: readonly TrustedIndividualEnergyProfileConfig[];
}): TrustedIndividualEnergyProfileStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  if (config.profiles.length !== config.entityCount) {
    throw new RangeError(
      "Trusted energy profiles must contain exactly one profile per entity.",
    );
  }

  const profilesByEntity = new Array<TrustedIndividualEnergyProfile>(
    config.entityCount,
  );
  for (let index = 0; index < config.profiles.length; index += 1) {
    const configured = config.profiles[index];
    if (configured === undefined) {
      throw new RangeError("Trusted energy profile input cannot contain holes.");
    }
    assertEntityId(configured.entityId, config.entityCount);
    if (profilesByEntity[configured.entityId] !== undefined) {
      throw new RangeError("Duplicate trusted energy profile entity ID.");
    }

    const maximumEnergy = configured.maximumEnergy ?? DEFAULT_MAXIMUM_ENERGY;
    const startingEnergy = configured.startingEnergy ?? DEFAULT_STARTING_ENERGY;
    const safeRestRecoveryPerTick = configured.safeRestRecoveryPerTick ??
      DEFAULT_SAFE_REST_RECOVERY_PER_TICK;
    assertEnergyStorageValue(maximumEnergy, "maximumEnergy", true);
    assertEnergyStorageValue(startingEnergy, "startingEnergy", false);
    assertEnergyStorageValue(
      safeRestRecoveryPerTick,
      "safeRestRecoveryPerTick",
      false,
    );
    if (startingEnergy > maximumEnergy) {
      throw new RangeError(
        "startingEnergy must be between 0 and maximumEnergy.",
      );
    }

    profilesByEntity[configured.entityId] = Object.freeze({
      entityId: configured.entityId,
      maximumEnergy,
      startingEnergy,
      safeRestRecoveryPerTick,
    });
  }

  for (let entityId = 0; entityId < config.entityCount; entityId += 1) {
    if (profilesByEntity[entityId] === undefined) {
      throw new RangeError(`Missing trusted energy profile for entity ${entityId}.`);
    }
  }

  const store = Object.freeze({
    entityCount: config.entityCount,
  });
  trustedProfileInternals.set(store, {
    profilesByEntity: Object.freeze(profilesByEntity),
  });
  return store;
}

export function getTrustedIndividualEnergyProfile(
  store: TrustedIndividualEnergyProfileStore,
  entityId: number,
): TrustedIndividualEnergyProfile {
  const internal = requireTrustedProfileInternal(store);
  assertEntityId(entityId, store.entityCount);
  return internal.profilesByEntity[entityId]!;
}

export function createIndividualEnergyStore(
  profiles: TrustedIndividualEnergyProfileStore,
): IndividualEnergyStore {
  const currentEnergyByEntity = new Uint32Array(profiles.entityCount);
  const minimumEnergyByEntity = new Uint32Array(profiles.entityCount);
  const firstWindedTickByEntity = new Float64Array(profiles.entityCount);
  const firstSpentTickByEntity = new Float64Array(profiles.entityCount);
  firstWindedTickByEntity.fill(-1);
  firstSpentTickByEntity.fill(-1);

  for (let entityId = 0; entityId < profiles.entityCount; entityId += 1) {
    const profile = getTrustedIndividualEnergyProfile(profiles, entityId);
    currentEnergyByEntity[entityId] = profile.startingEnergy;
    minimumEnergyByEntity[entityId] = profile.startingEnergy;
    recordFirstLowEnergyTicks(
      profile.startingEnergy,
      profile.maximumEnergy,
      0,
      entityId,
      firstWindedTickByEntity,
      firstSpentTickByEntity,
    );
  }

  const store = Object.freeze({ entityCount: profiles.entityCount });
  energyStoreInternals.set(store, {
    profiles,
    currentEnergyByEntity,
    minimumEnergyByEntity,
    firstWindedTickByEntity,
    firstSpentTickByEntity,
    totalEnergySpentByEntity: new Uint32Array(profiles.entityCount),
    totalEnergyRecoveredByEntity: new Uint32Array(profiles.entityCount),
  });
  return store;
}

export function getIndividualCurrentEnergy(
  store: IndividualEnergyStore,
  entityId: number,
): number {
  const internal = requireEnergyStoreInternal(store);
  assertEntityId(entityId, store.entityCount);
  return internal.currentEnergyByEntity[entityId]!;
}

export function getIndividualMaximumEnergy(
  store: IndividualEnergyStore,
  entityId: number,
): number {
  const internal = requireEnergyStoreInternal(store);
  assertEntityId(entityId, store.entityCount);
  return getTrustedIndividualEnergyProfile(
    internal.profiles,
    entityId,
  ).maximumEnergy;
}

export function getIndividualEnergyRatioFixedPoint(
  store: IndividualEnergyStore,
  entityId: number,
): number {
  const current = getIndividualCurrentEnergy(store, entityId);
  const maximum = getIndividualMaximumEnergy(store, entityId);
  return Math.floor(current * ENERGY_RATIO_FIXED_POINT_SCALE / maximum);
}

export function getIndividualEnergyBand(
  store: IndividualEnergyStore,
  entityId: number,
): IndividualEnergyBand {
  return deriveIndividualEnergyBand(
    getIndividualCurrentEnergy(store, entityId),
    getIndividualMaximumEnergy(store, entityId),
  );
}

export function deriveIndividualEnergyBand(
  currentEnergy: number,
  maximumEnergy: number,
): IndividualEnergyBand {
  assertEnergyStorageValue(maximumEnergy, "maximumEnergy", true);
  assertEnergyStorageValue(currentEnergy, "currentEnergy", false);
  if (currentEnergy > maximumEnergy) {
    throw new RangeError("currentEnergy cannot exceed maximumEnergy.");
  }
  const scaledCurrent = currentEnergy * 100;
  if (scaledCurrent >= maximumEnergy * FRESH_ENERGY_THRESHOLD_PERCENT) {
    return "fresh";
  }
  if (scaledCurrent >= maximumEnergy * WORKING_ENERGY_THRESHOLD_PERCENT) {
    return "working";
  }
  if (scaledCurrent >= maximumEnergy * WINDED_ENERGY_THRESHOLD_PERCENT) {
    return "winded";
  }
  return "spent";
}

export function setIndividualCurrentEnergyForTrustedSetup(
  store: IndividualEnergyStore,
  entityId: number,
  currentEnergy: number,
  tick = 0,
): void {
  const internal = requireEnergyStoreInternal(store);
  assertEntityId(entityId, store.entityCount);
  assertNonNegativeSafeInteger(tick, "tick");
  assertEnergyStorageValue(currentEnergy, "currentEnergy", false);
  const maximumEnergy = getTrustedIndividualEnergyProfile(
    internal.profiles,
    entityId,
  ).maximumEnergy;
  if (currentEnergy > maximumEnergy) {
    throw new RangeError("currentEnergy cannot exceed maximumEnergy.");
  }
  internal.currentEnergyByEntity[entityId] = currentEnergy;
  updateMinimumAndThresholdHistory(internal, entityId, currentEnergy, tick);
}

export function spendIndividualEnergy(
  store: IndividualEnergyStore,
  entityId: number,
  requestedAmount: number,
  tick: number,
): IndividualEnergyChangeResult {
  const internal = requireEnergyStoreInternal(store);
  assertEntityId(entityId, store.entityCount);
  assertNonNegativeSafeInteger(requestedAmount, "requestedAmount");
  assertNonNegativeSafeInteger(tick, "tick");
  const currentEnergyBefore = internal.currentEnergyByEntity[entityId]!;
  const appliedAmount = Math.min(currentEnergyBefore, requestedAmount);
  const currentEnergyAfter = currentEnergyBefore - appliedAmount;
  const totalEnergySpent = checkedBoundedAddition(
    internal.totalEnergySpentByEntity[entityId]!,
    appliedAmount,
    "totalEnergySpent",
  );
  internal.currentEnergyByEntity[entityId] = currentEnergyAfter;
  internal.totalEnergySpentByEntity[entityId] = totalEnergySpent;
  updateMinimumAndThresholdHistory(
    internal,
    entityId,
    currentEnergyAfter,
    tick,
  );
  return energyChangeResult(
    entityId,
    requestedAmount,
    appliedAmount,
    currentEnergyBefore,
    currentEnergyAfter,
  );
}

export function recoverIndividualEnergy(
  store: IndividualEnergyStore,
  entityId: number,
  requestedAmount: number,
  tick: number,
): IndividualEnergyChangeResult {
  const internal = requireEnergyStoreInternal(store);
  assertEntityId(entityId, store.entityCount);
  assertNonNegativeSafeInteger(requestedAmount, "requestedAmount");
  assertNonNegativeSafeInteger(tick, "tick");
  const currentEnergyBefore = internal.currentEnergyByEntity[entityId]!;
  const maximumEnergy = getTrustedIndividualEnergyProfile(
    internal.profiles,
    entityId,
  ).maximumEnergy;
  const appliedAmount = Math.min(
    maximumEnergy - currentEnergyBefore,
    requestedAmount,
  );
  const currentEnergyAfter = currentEnergyBefore + appliedAmount;
  const totalEnergyRecovered = checkedBoundedAddition(
    internal.totalEnergyRecoveredByEntity[entityId]!,
    appliedAmount,
    "totalEnergyRecovered",
  );
  internal.currentEnergyByEntity[entityId] = currentEnergyAfter;
  internal.totalEnergyRecoveredByEntity[entityId] = totalEnergyRecovered;
  return energyChangeResult(
    entityId,
    requestedAmount,
    appliedAmount,
    currentEnergyBefore,
    currentEnergyAfter,
  );
}

export function getIndividualEnergyHistoryInspection(
  store: IndividualEnergyStore,
  entityId: number,
): IndividualEnergyHistoryInspection {
  const internal = requireEnergyStoreInternal(store);
  assertEntityId(entityId, store.entityCount);
  const profile = getTrustedIndividualEnergyProfile(internal.profiles, entityId);
  return {
    startingEnergy: profile.startingEnergy,
    minimumEnergyReached: internal.minimumEnergyByEntity[entityId]!,
    firstWindedTick: nullableTick(internal.firstWindedTickByEntity[entityId]!),
    firstSpentTick: nullableTick(internal.firstSpentTickByEntity[entityId]!),
    totalEnergySpent: internal.totalEnergySpentByEntity[entityId]!,
    totalEnergyRecovered: internal.totalEnergyRecoveredByEntity[entityId]!,
  };
}

export function getIndividualEnergyInspection(
  profiles: TrustedIndividualEnergyProfileStore,
  store: IndividualEnergyStore,
  entityId: number,
): IndividualEnergyInspection {
  const internal = requireEnergyStoreInternal(store);
  if (profiles !== internal.profiles) {
    throw new RangeError(
      "Energy inspection must use the profile store that owns current energy.",
    );
  }
  const profile = getTrustedIndividualEnergyProfile(profiles, entityId);
  const currentEnergy = internal.currentEnergyByEntity[entityId]!;
  return {
    entityId,
    currentEnergy,
    maximumEnergy: profile.maximumEnergy,
    safeRestRecoveryPerTick: profile.safeRestRecoveryPerTick,
    ratioFixedPoint: Math.floor(
      currentEnergy * ENERGY_RATIO_FIXED_POINT_SCALE / profile.maximumEnergy,
    ),
    band: deriveIndividualEnergyBand(currentEnergy, profile.maximumEnergy),
    startingEnergy: profile.startingEnergy,
    minimumEnergyReached: internal.minimumEnergyByEntity[entityId]!,
    firstWindedTick: nullableTick(internal.firstWindedTickByEntity[entityId]!),
    firstSpentTick: nullableTick(internal.firstSpentTickByEntity[entityId]!),
    totalEnergySpent: internal.totalEnergySpentByEntity[entityId]!,
    totalEnergyRecovered: internal.totalEnergyRecoveredByEntity[entityId]!,
  };
}

/** Verifies that a mutable energy store belongs to the supplied trusted profiles. */
export function assertIndividualEnergyProfileOwnership(
  profiles: TrustedIndividualEnergyProfileStore,
  store: IndividualEnergyStore,
): void {
  const internal = requireEnergyStoreInternal(store);
  if (profiles !== internal.profiles) {
    throw new RangeError(
      "Energy application must use the profile store that owns current energy.",
    );
  }
}

function updateMinimumAndThresholdHistory(
  internal: EnergyStoreInternal,
  entityId: number,
  currentEnergy: number,
  tick: number,
): void {
  if (currentEnergy < internal.minimumEnergyByEntity[entityId]!) {
    internal.minimumEnergyByEntity[entityId] = currentEnergy;
  }
  const maximumEnergy = getTrustedIndividualEnergyProfile(
    internal.profiles,
    entityId,
  ).maximumEnergy;
  recordFirstLowEnergyTicks(
    currentEnergy,
    maximumEnergy,
    tick,
    entityId,
    internal.firstWindedTickByEntity,
    internal.firstSpentTickByEntity,
  );
}

function recordFirstLowEnergyTicks(
  currentEnergy: number,
  maximumEnergy: number,
  tick: number,
  entityId: number,
  firstWindedTickByEntity: Float64Array,
  firstSpentTickByEntity: Float64Array,
): void {
  const band = deriveIndividualEnergyBand(currentEnergy, maximumEnergy);
  if (
    (band === "winded" || band === "spent") &&
    firstWindedTickByEntity[entityId] === -1
  ) {
    firstWindedTickByEntity[entityId] = tick;
  }
  if (band === "spent" && firstSpentTickByEntity[entityId] === -1) {
    firstSpentTickByEntity[entityId] = tick;
  }
}

function energyChangeResult(
  entityId: number,
  requestedAmount: number,
  appliedAmount: number,
  currentEnergyBefore: number,
  currentEnergyAfter: number,
): IndividualEnergyChangeResult {
  return {
    entityId,
    requestedAmount,
    appliedAmount,
    currentEnergyBefore,
    currentEnergyAfter,
  };
}

function checkedBoundedAddition(
  current: number,
  addition: number,
  name: string,
): number {
  const next = current + addition;
  if (!Number.isSafeInteger(next) || next > MAX_ENERGY_HISTORY_TOTAL) {
    throw new RangeError(`${name} exceeds bounded history storage.`);
  }
  return next;
}

function nullableTick(value: number): number | null {
  return value < 0 ? null : value;
}

function requireTrustedProfileInternal(
  store: TrustedIndividualEnergyProfileStore,
): TrustedProfileInternal {
  const internal = trustedProfileInternals.get(store);
  if (internal === undefined) {
    throw new TypeError("Unknown trusted individual energy profile store.");
  }
  return internal;
}

function requireEnergyStoreInternal(
  store: IndividualEnergyStore,
): EnergyStoreInternal {
  const internal = energyStoreInternals.get(store);
  if (internal === undefined) {
    throw new TypeError("Unknown individual energy store.");
  }
  return internal;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Energy profile entity ID is out of bounds.");
  }
}

function assertEnergyStorageValue(
  value: number,
  name: string,
  positive: boolean,
): void {
  const minimum = positive ? 1 : 0;
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > MAX_REPRESENTABLE_ENERGY
  ) {
    throw new RangeError(
      `${name} must be an integer from ${minimum} to ${MAX_REPRESENTABLE_ENERGY}.`,
    );
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
