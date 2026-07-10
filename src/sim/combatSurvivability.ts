import type { CombatStrikeResolution } from "./combatResolution";
import {
  getFactionIdForUnit,
  getUnitIds,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  getUnitArmourClass,
  getUnitShieldClass,
  type ArmourClass,
  type ShieldClass,
  type UnitLoadoutStore,
} from "./unitLoadout";

export interface CombatSurvivabilityConfig {
  readonly entityCount: number;
  readonly units?: readonly CombatSurvivabilityUnitConfig[];
}

export interface CombatSurvivabilityUnitConfig {
  readonly unitId: UnitId;
  readonly maxDamageCapacity?: number;
  readonly initialAccumulatedDamage?: number;
}

export interface CombatSurvivabilityStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface CombatSurvivabilityApplication {
  readonly sourceUnitId: UnitId;
  readonly targetUnitId: UnitId;
  readonly incomingDamageValue: number;
  readonly armourReduction: number;
  readonly shieldReduction: number;
  readonly appliedDamageValue: number;
  readonly accumulatedDamageBefore: number;
  readonly accumulatedDamageAfter: number;
  readonly capacityReached: boolean;
}

export interface CombatSurvivabilityTickResult {
  readonly applications: readonly CombatSurvivabilityApplication[];
}

interface InternalCombatSurvivabilityStore
  extends CombatSurvivabilityStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly maxDamageCapacity: readonly number[];
  readonly accumulatedDamage: number[];
}

const DEFAULT_MAX_DAMAGE_CAPACITY = 10;
const DEFAULT_ACCUMULATED_DAMAGE = 0;
const MAX_SURVIVABILITY_STATE_VALUE = Number.MAX_SAFE_INTEGER;

const ARMOUR_DAMAGE_REDUCTION: Readonly<Record<ArmourClass, number>> = {
  none: 0,
  light: 0,
  medium: 1,
  heavy: 1,
  mageArmour: 0,
  dreadnought: 2,
};

const SHIELD_DAMAGE_REDUCTION: Readonly<Record<ShieldClass, number>> = {
  none: 0,
  buckler: 0,
  shield: 1,
};

export function createCombatSurvivabilityStore(
  identityStore: UnitIdentityStore,
  config: CombatSurvivabilityConfig,
): CombatSurvivabilityStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  if (identityStore.entityCount !== config.entityCount) {
    throw new RangeError(
      "Combat survivability entity count must match identity store entity count.",
    );
  }

  const unitIds = getUnitIds(identityStore);
  const unitIndexById = new Map<UnitId, number>();
  for (let index = 0; index < unitIds.length; index += 1) {
    unitIndexById.set(unitIds[index]!, index);
  }

  const maxDamageCapacity = new Array<number>(unitIds.length).fill(
    DEFAULT_MAX_DAMAGE_CAPACITY,
  );
  const accumulatedDamage = new Array<number>(unitIds.length).fill(
    DEFAULT_ACCUMULATED_DAMAGE,
  );

  const seenConfiguredUnitIds = new Set<UnitId>();
  const configuredUnits = config.units ?? [];
  for (let index = 0; index < configuredUnits.length; index += 1) {
    const unitConfig = configuredUnits[index]!;
    if (seenConfiguredUnitIds.has(unitConfig.unitId)) {
      throw new RangeError("Duplicate combat survivability unit config.");
    }
    seenConfiguredUnitIds.add(unitConfig.unitId);

    const unitIndex = unitIndexById.get(unitConfig.unitId);
    if (unitIndex === undefined) {
      throw new RangeError("Unknown unit ID in combat survivability config.");
    }

    const configuredMaxDamageCapacity =
      unitConfig.maxDamageCapacity ?? DEFAULT_MAX_DAMAGE_CAPACITY;
    assertPositiveSafeInteger(
      configuredMaxDamageCapacity,
      "maxDamageCapacity",
    );
    maxDamageCapacity[unitIndex] = configuredMaxDamageCapacity;

    const configuredAccumulatedDamage =
      unitConfig.initialAccumulatedDamage ?? DEFAULT_ACCUMULATED_DAMAGE;
    assertNonNegativeSafeInteger(
      configuredAccumulatedDamage,
      "initialAccumulatedDamage",
    );
    accumulatedDamage[unitIndex] = clampSurvivabilityState(
      configuredAccumulatedDamage,
    );
  }

  return {
    entityCount: config.entityCount,
    unitCount: unitIds.length,
    unitIndexById,
    maxDamageCapacity: Object.freeze(maxDamageCapacity),
    accumulatedDamage,
  } as InternalCombatSurvivabilityStore;
}

export function getUnitAccumulatedDamage(
  store: CombatSurvivabilityStore,
  unitId: UnitId,
): number {
  const internal = asInternal(store);
  return internal.accumulatedDamage[requireUnitIndex(internal, unitId)]!;
}

export function getUnitMaxDamageCapacity(
  store: CombatSurvivabilityStore,
  unitId: UnitId,
): number {
  const internal = asInternal(store);
  return internal.maxDamageCapacity[requireUnitIndex(internal, unitId)]!;
}

export function isUnitDamageCapacityReached(
  store: CombatSurvivabilityStore,
  unitId: UnitId,
): boolean {
  const internal = asInternal(store);
  const unitIndex = requireUnitIndex(internal, unitId);
  return (
    internal.accumulatedDamage[unitIndex]! >=
    internal.maxDamageCapacity[unitIndex]!
  );
}

export function applyCombatStrikeResolution(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  survivabilityStore: CombatSurvivabilityStore,
  strike: CombatStrikeResolution,
): CombatSurvivabilityApplication {
  const internal = asInternal(survivabilityStore);
  validateSurvivabilityInputs(identityStore, loadoutStore, internal);
  return applyValidatedCombatStrikeResolution(
    identityStore,
    loadoutStore,
    internal,
    strike,
  );
}

export function applyCombatStrikeResolutions(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  survivabilityStore: CombatSurvivabilityStore,
  strikes: readonly CombatStrikeResolution[],
  out: CombatSurvivabilityApplication[] = [],
): CombatSurvivabilityTickResult {
  const internal = asInternal(survivabilityStore);
  validateSurvivabilityInputs(identityStore, loadoutStore, internal);

  out.length = 0;
  for (let index = 0; index < strikes.length; index += 1) {
    out.push(
      applyValidatedCombatStrikeResolution(
        identityStore,
        loadoutStore,
        internal,
        strikes[index]!,
      ),
    );
  }

  return { applications: out };
}

function applyValidatedCombatStrikeResolution(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  store: InternalCombatSurvivabilityStore,
  strike: CombatStrikeResolution,
): CombatSurvivabilityApplication {
  validateStrike(identityStore, strike);

  requireUnitIndex(store, strike.sourceUnitId);
  const targetIndex = requireUnitIndex(store, strike.targetUnitId);
  const armourReduction = getArmourDamageReduction(
    getUnitArmourClass(loadoutStore, strike.targetUnitId),
  );
  const shieldReduction = getShieldDamageReduction(
    getUnitShieldClass(loadoutStore, strike.targetUnitId),
  );
  const appliedDamageValue = computeAppliedDamageValue(
    strike.damageValue,
    armourReduction,
    shieldReduction,
  );
  const accumulatedDamageBefore = store.accumulatedDamage[targetIndex]!;
  const accumulatedDamageAfter = increaseSurvivabilityState(
    accumulatedDamageBefore,
    appliedDamageValue,
  );
  store.accumulatedDamage[targetIndex] = accumulatedDamageAfter;

  return {
    sourceUnitId: strike.sourceUnitId,
    targetUnitId: strike.targetUnitId,
    incomingDamageValue: strike.damageValue,
    armourReduction,
    shieldReduction,
    appliedDamageValue,
    accumulatedDamageBefore,
    accumulatedDamageAfter,
    capacityReached:
      accumulatedDamageAfter >= store.maxDamageCapacity[targetIndex]!,
  };
}

function getArmourDamageReduction(armourClass: ArmourClass): number {
  const reduction = ARMOUR_DAMAGE_REDUCTION[armourClass];
  if (reduction === undefined) {
    throw new RangeError("Unknown armour class for combat survivability.");
  }
  return reduction;
}

function getShieldDamageReduction(shieldClass: ShieldClass): number {
  const reduction = SHIELD_DAMAGE_REDUCTION[shieldClass];
  if (reduction === undefined) {
    throw new RangeError("Unknown shield class for combat survivability.");
  }
  return reduction;
}

function computeAppliedDamageValue(
  incomingDamageValue: number,
  armourReduction: number,
  shieldReduction: number,
): number {
  const mitigatedDamage =
    incomingDamageValue - armourReduction - shieldReduction;
  return mitigatedDamage > 0 ? mitigatedDamage : 0;
}

function validateSurvivabilityInputs(
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  survivabilityStore: CombatSurvivabilityStore,
): void {
  if (loadoutStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Unit loadout entity count must match unit identity entity count.",
    );
  }
  if (survivabilityStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Combat survivability entity count must match unit identity entity count.",
    );
  }
  if (loadoutStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Unit loadout unit count must match unit identity unit count.",
    );
  }
  if (survivabilityStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Combat survivability unit count must match unit identity unit count.",
    );
  }
}

function validateStrike(
  identityStore: UnitIdentityStore,
  strike: CombatStrikeResolution,
): void {
  getFactionIdForUnit(identityStore, strike.sourceUnitId);
  getFactionIdForUnit(identityStore, strike.targetUnitId);
  assertNonNegativeSafeInteger(strike.damageValue, "damageValue");
}

function requireUnitIndex(
  store: InternalCombatSurvivabilityStore,
  unitId: UnitId,
): number {
  const index = store.unitIndexById.get(unitId);
  if (index === undefined) {
    throw new RangeError("Unknown unit ID for combat survivability store.");
  }
  return index;
}

function increaseSurvivabilityState(current: number, amount: number): number {
  const clampedCurrent = clampSurvivabilityState(current);
  if (amount <= 0) {
    return clampedCurrent;
  }
  if (clampedCurrent > MAX_SURVIVABILITY_STATE_VALUE - amount) {
    return MAX_SURVIVABILITY_STATE_VALUE;
  }
  return clampedCurrent + amount;
}

function clampSurvivabilityState(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Survivability state values must be safe integers.");
  }
  if (value < 0) {
    return 0;
  }
  if (value > MAX_SURVIVABILITY_STATE_VALUE) {
    return MAX_SURVIVABILITY_STATE_VALUE;
  }
  return value;
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
  store: CombatSurvivabilityStore,
): InternalCombatSurvivabilityStore {
  return store as InternalCombatSurvivabilityStore;
}
