import {
  getUnitIds,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export type WeaponCategory =
  | "unarmed"
  | "oneHanded"
  | "dualWield"
  | "twoHanded"
  | "polearm"
  | "pike"
  | "bow"
  | "thrown"
  | "rod"
  | "staff";

export type WeaponReachBand =
  | "none"
  | "close"
  | "short"
  | "medium"
  | "long"
  | "veryLong"
  | "ranged";

export type ArmourClass =
  | "none"
  | "light"
  | "medium"
  | "heavy"
  | "mageArmour"
  | "dreadnought";

export type ShieldClass = "none" | "buckler" | "shield";

export type UnitTrainingTag =
  | "formed"
  | "skirmisher"
  | "heavy"
  | "archer"
  | "healer"
  | "mage"
  | "captain"
  | "banner"
  | "routing";

export type SpecialCallCapability =
  | "repel"
  | "strikedown"
  | "entangle"
  | "weakness"
  | "heal"
  | "restore"
  | "venom"
  | "cleave"
  | "impale"
  | "fixWeapon";

export interface UnitLoadoutConfig {
  readonly entityCount: number;
  readonly units: readonly UnitLoadoutUnitConfig[];
}

export interface UnitLoadoutUnitConfig {
  readonly unitId: UnitId;
  readonly weaponCategory?: WeaponCategory;
  readonly weaponReachBand?: WeaponReachBand;
  readonly armourClass?: ArmourClass;
  readonly shieldClass?: ShieldClass;
  readonly trainingTags?: readonly UnitTrainingTag[];
  readonly specialCallCapabilities?: readonly SpecialCallCapability[];
}

export interface UnitLoadoutStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface UnitLoadoutSummary {
  readonly unitId: UnitId;
  readonly weaponCategory: WeaponCategory;
  readonly weaponReachBand: WeaponReachBand;
  readonly armourClass: ArmourClass;
  readonly shieldClass: ShieldClass;
  readonly trainingTags: readonly UnitTrainingTag[];
  readonly specialCallCapabilities: readonly SpecialCallCapability[];
}

interface InternalUnitLoadoutStore extends UnitLoadoutStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly weaponCategories: readonly WeaponCategory[];
  readonly weaponReachBands: readonly WeaponReachBand[];
  readonly armourClasses: readonly ArmourClass[];
  readonly shieldClasses: readonly ShieldClass[];
  readonly trainingTags: readonly (readonly UnitTrainingTag[])[];
  readonly specialCallCapabilities: readonly (readonly SpecialCallCapability[])[];
}

const DEFAULT_WEAPON_CATEGORY: WeaponCategory = "unarmed";
const DEFAULT_WEAPON_REACH_BAND: WeaponReachBand = "none";
const DEFAULT_ARMOUR_CLASS: ArmourClass = "none";
const DEFAULT_SHIELD_CLASS: ShieldClass = "none";
const DEFAULT_TRAINING_TAGS: readonly UnitTrainingTag[] = Object.freeze([]);
const DEFAULT_SPECIAL_CALL_CAPABILITIES: readonly SpecialCallCapability[] =
  Object.freeze([]);

export function createUnitLoadoutStore(
  identityStore: UnitIdentityStore,
  config: UnitLoadoutConfig,
): UnitLoadoutStore {
  assertPositiveInteger(config.entityCount, "entityCount");

  if (identityStore.entityCount !== config.entityCount) {
    throw new RangeError(
      "Unit loadout entity count must match identity store entity count.",
    );
  }

  const unitIds = getUnitIds(identityStore);
  const unitIndexById = new Map<UnitId, number>();
  for (let index = 0; index < unitIds.length; index += 1) {
    unitIndexById.set(unitIds[index]!, index);
  }

  const weaponCategories = new Array<WeaponCategory>(unitIds.length).fill(
    DEFAULT_WEAPON_CATEGORY,
  );
  const weaponReachBands = new Array<WeaponReachBand>(unitIds.length).fill(
    DEFAULT_WEAPON_REACH_BAND,
  );
  const armourClasses = new Array<ArmourClass>(unitIds.length).fill(
    DEFAULT_ARMOUR_CLASS,
  );
  const shieldClasses = new Array<ShieldClass>(unitIds.length).fill(
    DEFAULT_SHIELD_CLASS,
  );
  const trainingTags = new Array<readonly UnitTrainingTag[]>(
    unitIds.length,
  ).fill(DEFAULT_TRAINING_TAGS);
  const specialCallCapabilities = new Array<
    readonly SpecialCallCapability[]
  >(unitIds.length).fill(DEFAULT_SPECIAL_CALL_CAPABILITIES);

  const seenConfiguredUnitIds = new Set<UnitId>();
  for (let index = 0; index < config.units.length; index += 1) {
    const unitConfig = config.units[index]!;
    if (seenConfiguredUnitIds.has(unitConfig.unitId)) {
      throw new RangeError("Duplicate unit loadout config.");
    }
    seenConfiguredUnitIds.add(unitConfig.unitId);

    const unitIndex = unitIndexById.get(unitConfig.unitId);
    if (unitIndex === undefined) {
      throw new RangeError("Unknown unit ID in unit loadout config.");
    }

    weaponCategories[unitIndex] =
      unitConfig.weaponCategory ?? DEFAULT_WEAPON_CATEGORY;
    weaponReachBands[unitIndex] =
      unitConfig.weaponReachBand ?? DEFAULT_WEAPON_REACH_BAND;
    armourClasses[unitIndex] = unitConfig.armourClass ?? DEFAULT_ARMOUR_CLASS;
    shieldClasses[unitIndex] = unitConfig.shieldClass ?? DEFAULT_SHIELD_CLASS;
    trainingTags[unitIndex] = freezeArrayCopy(
      unitConfig.trainingTags ?? DEFAULT_TRAINING_TAGS,
    );
    specialCallCapabilities[unitIndex] = freezeArrayCopy(
      unitConfig.specialCallCapabilities ?? DEFAULT_SPECIAL_CALL_CAPABILITIES,
    );
  }

  const store: InternalUnitLoadoutStore = {
    entityCount: config.entityCount,
    unitCount: unitIds.length,
    unitIndexById,
    weaponCategories: Object.freeze(weaponCategories),
    weaponReachBands: Object.freeze(weaponReachBands),
    armourClasses: Object.freeze(armourClasses),
    shieldClasses: Object.freeze(shieldClasses),
    trainingTags: Object.freeze(trainingTags),
    specialCallCapabilities: Object.freeze(specialCallCapabilities),
  };

  return Object.freeze(store);
}

export function getUnitWeaponCategory(
  store: UnitLoadoutStore,
  unitId: UnitId,
): WeaponCategory {
  const internalStore = asInternalStore(store);
  return internalStore.weaponCategories[requireUnitIndex(internalStore, unitId)]!;
}

export function getUnitWeaponReachBand(
  store: UnitLoadoutStore,
  unitId: UnitId,
): WeaponReachBand {
  const internalStore = asInternalStore(store);
  return internalStore.weaponReachBands[requireUnitIndex(internalStore, unitId)]!;
}

export function getUnitArmourClass(
  store: UnitLoadoutStore,
  unitId: UnitId,
): ArmourClass {
  const internalStore = asInternalStore(store);
  return internalStore.armourClasses[requireUnitIndex(internalStore, unitId)]!;
}

export function getUnitShieldClass(
  store: UnitLoadoutStore,
  unitId: UnitId,
): ShieldClass {
  const internalStore = asInternalStore(store);
  return internalStore.shieldClasses[requireUnitIndex(internalStore, unitId)]!;
}

export function getUnitTrainingTags(
  store: UnitLoadoutStore,
  unitId: UnitId,
): readonly UnitTrainingTag[] {
  const internalStore = asInternalStore(store);
  return internalStore.trainingTags[requireUnitIndex(internalStore, unitId)]!;
}

export function getUnitSpecialCallCapabilities(
  store: UnitLoadoutStore,
  unitId: UnitId,
): readonly SpecialCallCapability[] {
  const internalStore = asInternalStore(store);
  return internalStore.specialCallCapabilities[
    requireUnitIndex(internalStore, unitId)
  ]!;
}

export function hasUnitTrainingTag(
  store: UnitLoadoutStore,
  unitId: UnitId,
  tag: UnitTrainingTag,
): boolean {
  return getUnitTrainingTags(store, unitId).includes(tag);
}

export function hasUnitSpecialCallCapability(
  store: UnitLoadoutStore,
  unitId: UnitId,
  capability: SpecialCallCapability,
): boolean {
  return getUnitSpecialCallCapabilities(store, unitId).includes(capability);
}

export function getUnitLoadoutSummary(
  store: UnitLoadoutStore,
  unitId: UnitId,
): UnitLoadoutSummary {
  const internalStore = asInternalStore(store);
  const unitIndex = requireUnitIndex(internalStore, unitId);
  return {
    unitId,
    weaponCategory: internalStore.weaponCategories[unitIndex]!,
    weaponReachBand: internalStore.weaponReachBands[unitIndex]!,
    armourClass: internalStore.armourClasses[unitIndex]!,
    shieldClass: internalStore.shieldClasses[unitIndex]!,
    trainingTags: internalStore.trainingTags[unitIndex]!,
    specialCallCapabilities: internalStore.specialCallCapabilities[unitIndex]!,
  };
}

function freezeArrayCopy<T>(values: readonly T[]): readonly T[] {
  return Object.freeze(values.slice());
}

function requireUnitIndex(
  store: InternalUnitLoadoutStore,
  unitId: UnitId,
): number {
  assertValidIdentity(unitId, "unitId");

  const index = store.unitIndexById.get(unitId);
  if (index === undefined) {
    throw new RangeError("Unknown unit ID for unit loadout store.");
  }
  return index;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertValidIdentity(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
  if (value < 0) {
    throw new RangeError(`${name} must be non-negative.`);
  }
}

function asInternalStore(store: UnitLoadoutStore): InternalUnitLoadoutStore {
  return store as InternalUnitLoadoutStore;
}
