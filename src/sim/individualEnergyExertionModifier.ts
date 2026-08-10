import {
  getIndividualCombatProfile,
  type IndividualArmourCategory,
  type IndividualCombatProfileStore,
  type IndividualWeaponCategory,
} from "./individualCombatProfile";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
  type IndividualGlobalHitStore,
} from "./individualGlobalHits";

export const INDIVIDUAL_EXERTION_PERCENT_SCALE = 100;
export const INDIVIDUAL_EXERTION_PERCENT_PER_BURDEN_POINT = 10;
export const INDIVIDUAL_EXERTION_PERCENT_PER_MISSING_HIT = 10;
export const INDIVIDUAL_INJURY_EXERTION_PERCENT_MAX = 150;

export const INDIVIDUAL_ARMOUR_BURDEN_POINTS = Object.freeze({
  none: 0,
  light: 1,
  mageArmour: 1,
  medium: 2,
  heavy: 4,
} satisfies Readonly<Record<IndividualArmourCategory, number>>);

export const INDIVIDUAL_HELD_SHIELD_BURDEN_POINTS = Object.freeze({
  none: 0,
  buckler: 1,
  shield: 2,
} as const);

export const INDIVIDUAL_PRIMARY_WEAPON_BURDEN_POINTS = Object.freeze({
  unarmed: 0,
  dagger: 0,
  oneHanded: 1,
  rod: 1,
  greatWeapon: 2,
  polearm: 2,
  pike: 2,
  ranged: 2,
  staff: 2,
  thrown: 1,
} satisfies Readonly<Record<IndividualWeaponCategory, number>>);

export interface IndividualEnergyExertionModifierStore {
  readonly entityCount: number;
}

export interface IndividualEnergyExertionModifierInput {
  readonly modifiers: IndividualEnergyExertionModifierStore;
  readonly tick: number;
}

export interface IndividualEnergyExertionModifierInspection {
  readonly projectionTick: number | null;
  readonly armourBurdenPoints: number;
  readonly heldShieldBurdenPoints: number;
  readonly primaryWeaponBurdenPoints: number;
  readonly totalBurdenPoints: number;
  readonly burdenExertionMultiplierPercent: number;
  readonly currentGlobalHits: number;
  readonly maximumGlobalHits: number;
  readonly missingGlobalHits: number;
  readonly injuryExertionMultiplierPercent: number;
}

interface InternalIndividualEnergyExertionModifierStore
  extends IndividualEnergyExertionModifierStore {
  readonly armourBurdenPointsByEntity: Uint8Array;
  readonly heldShieldBurdenPointsByEntity: Uint8Array;
  readonly primaryWeaponBurdenPointsByEntity: Uint8Array;
  readonly totalBurdenPointsByEntity: Uint8Array;
  readonly burdenMultiplierPercentByEntity: Uint16Array;
  readonly currentGlobalHitsByEntity: Uint32Array;
  readonly maximumGlobalHitsByEntity: Uint32Array;
  readonly missingGlobalHitsByEntity: Uint32Array;
  readonly injuryMultiplierPercentByEntity: Uint16Array;
  projectionTick: number | null;
}

const modifierStoreInternals = new WeakMap<
  IndividualEnergyExertionModifierStore,
  InternalIndividualEnergyExertionModifierStore
>();

export function createIndividualEnergyExertionModifierStore(
  entityCount: number,
): IndividualEnergyExertionModifierStore {
  assertEntityCount(entityCount);
  const store = Object.freeze({ entityCount });
  const burdenMultiplierPercentByEntity = new Uint16Array(entityCount);
  const injuryMultiplierPercentByEntity = new Uint16Array(entityCount);
  burdenMultiplierPercentByEntity.fill(INDIVIDUAL_EXERTION_PERCENT_SCALE);
  injuryMultiplierPercentByEntity.fill(INDIVIDUAL_EXERTION_PERCENT_SCALE);
  modifierStoreInternals.set(store, {
    entityCount,
    armourBurdenPointsByEntity: new Uint8Array(entityCount),
    heldShieldBurdenPointsByEntity: new Uint8Array(entityCount),
    primaryWeaponBurdenPointsByEntity: new Uint8Array(entityCount),
    totalBurdenPointsByEntity: new Uint8Array(entityCount),
    burdenMultiplierPercentByEntity,
    currentGlobalHitsByEntity: new Uint32Array(entityCount),
    maximumGlobalHitsByEntity: new Uint32Array(entityCount),
    missingGlobalHitsByEntity: new Uint32Array(entityCount),
    injuryMultiplierPercentByEntity,
    projectionTick: null,
  });
  return store;
}

export function projectIndividualEnergyExertionModifiersOneTick(
  store: IndividualEnergyExertionModifierStore,
  profiles: IndividualCombatProfileStore,
  hits: IndividualGlobalHitStore,
  tick: number,
): IndividualEnergyExertionModifierStore {
  const internal = requireStore(store);
  assertTick(tick);
  if (profiles.entityCount !== internal.entityCount ||
      hits.entityCount !== internal.entityCount) {
    throw new RangeError("Exertion modifier dependencies must match entityCount.");
  }
  if (internal.projectionTick !== null && tick <= internal.projectionTick) {
    throw new Error(
      tick === internal.projectionTick
        ? "Exertion modifiers already projected for this tick."
        : "Exertion modifier projection cannot move backwards.",
    );
  }

  // Validate all mutable hit evidence before writing any projected output.
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const profile = getIndividualCombatProfile(profiles, entityId);
    const armour = INDIVIDUAL_ARMOUR_BURDEN_POINTS[profile.armourCategory];
    const shield = INDIVIDUAL_HELD_SHIELD_BURDEN_POINTS[profile.shieldCategory];
    const weapon = INDIVIDUAL_PRIMARY_WEAPON_BURDEN_POINTS[profile.primaryWeapon];
    if (armour === undefined || shield === undefined || weapon === undefined) {
      throw new RangeError("Combat profile has no approved exertion burden value.");
    }
    const currentHits = getIndividualCurrentGlobalHits(hits, entityId);
    const maximumHits = getIndividualMaximumGlobalHits(hits, entityId);
    if (!Number.isSafeInteger(currentHits) || !Number.isSafeInteger(maximumHits) ||
        currentHits < 0 || currentHits > maximumHits || maximumHits > 0xffffffff) {
      throw new RangeError(
        "Tick-start global hits must be bounded integers representable by Uint32.",
      );
    }
  }

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const profile = getIndividualCombatProfile(profiles, entityId);
    const armour = INDIVIDUAL_ARMOUR_BURDEN_POINTS[profile.armourCategory];
    const heldShield = profile.shieldCarriedState === "held"
      ? INDIVIDUAL_HELD_SHIELD_BURDEN_POINTS[profile.shieldCategory]
      : 0;
    const weapon = INDIVIDUAL_PRIMARY_WEAPON_BURDEN_POINTS[profile.primaryWeapon];
    const total = armour + heldShield + weapon;
    const currentHits = getIndividualCurrentGlobalHits(hits, entityId);
    const maximumHits = getIndividualMaximumGlobalHits(hits, entityId);
    const missingHits = maximumHits - currentHits;

    internal.armourBurdenPointsByEntity[entityId] = armour;
    internal.heldShieldBurdenPointsByEntity[entityId] = heldShield;
    internal.primaryWeaponBurdenPointsByEntity[entityId] = weapon;
    internal.totalBurdenPointsByEntity[entityId] = total;
    internal.burdenMultiplierPercentByEntity[entityId] =
      calculateIndividualBurdenExertionMultiplierPercent(total);
    internal.currentGlobalHitsByEntity[entityId] = currentHits;
    internal.maximumGlobalHitsByEntity[entityId] = maximumHits;
    internal.missingGlobalHitsByEntity[entityId] = missingHits;
    internal.injuryMultiplierPercentByEntity[entityId] = Math.min(
      INDIVIDUAL_INJURY_EXERTION_PERCENT_MAX,
      INDIVIDUAL_EXERTION_PERCENT_SCALE +
        INDIVIDUAL_EXERTION_PERCENT_PER_MISSING_HIT * missingHits,
    );
  }
  internal.projectionTick = tick;
  return store;
}

export function assertIndividualEnergyExertionModifierInput(
  input: IndividualEnergyExertionModifierInput | null | undefined,
  entityCount: number,
  currentTick: number,
): asserts input is IndividualEnergyExertionModifierInput | undefined {
  if (input === null) {
    throw new TypeError("Individual exertion modifier input cannot be null.");
  }
  if (input === undefined) return;
  if (typeof input !== "object" || input.modifiers === null ||
      typeof input.modifiers !== "object") {
    throw new TypeError("Invalid individual exertion modifier input.");
  }
  assertEntityCount(entityCount);
  assertTick(currentTick);
  const internal = requireStore(input.modifiers);
  if (internal.entityCount !== entityCount) {
    throw new RangeError("Individual exertion modifiers must match entityCount.");
  }
  assertTick(input.tick);
  assertIndividualEnergyExertionModifierProjectionTick(input.modifiers, input.tick);
  if (input.tick !== currentTick) {
    throw new Error(
      `Exertion modifier input must match current tick ${currentTick}; ` +
      `received ${input.tick}.`,
    );
  }
}

export function assertIndividualEnergyExertionModifierProjectionTick(
  store: IndividualEnergyExertionModifierStore,
  tick: number,
): void {
  const internal = requireStore(store);
  assertTick(tick);
  if (internal.projectionTick !== tick) {
    throw new Error(
      `Exertion modifier projection is stale: expected tick ${tick}, ` +
      `received ${internal.projectionTick}.`,
    );
  }
}

export function getIndividualEnergyExertionModifierProjectionTick(
  store: IndividualEnergyExertionModifierStore,
): number | null {
  return requireStore(store).projectionTick;
}

export function calculateIndividualBurdenExertionMultiplierPercent(
  totalBurdenPoints: number,
): number {
  if (!Number.isSafeInteger(totalBurdenPoints) ||
      totalBurdenPoints < 0 || totalBurdenPoints > 8) {
    throw new RangeError("Total exertion burden points must be in range 0..8.");
  }
  return INDIVIDUAL_EXERTION_PERCENT_SCALE +
    INDIVIDUAL_EXERTION_PERCENT_PER_BURDEN_POINT * totalBurdenPoints;
}

export function getIndividualArmourBurdenPoints(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "armourBurdenPointsByEntity");
}

export function getIndividualHeldShieldBurdenPoints(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "heldShieldBurdenPointsByEntity");
}

export function getIndividualPrimaryWeaponBurdenPoints(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "primaryWeaponBurdenPointsByEntity");
}

export function getIndividualTotalBurdenPoints(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "totalBurdenPointsByEntity");
}

export function getIndividualBurdenExertionMultiplierPercent(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "burdenMultiplierPercentByEntity");
}

export function getIndividualMissingGlobalHits(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "missingGlobalHitsByEntity");
}

export function getIndividualExertionSourceCurrentGlobalHits(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "currentGlobalHitsByEntity");
}

export function getIndividualExertionSourceMaximumGlobalHits(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "maximumGlobalHitsByEntity");
}

export function getIndividualInjuryExertionMultiplierPercent(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): number {
  return getEntityValue(store, entityId, "injuryMultiplierPercentByEntity");
}

export function getIndividualEnergyExertionModifierInspection(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
): IndividualEnergyExertionModifierInspection {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    projectionTick: internal.projectionTick,
    armourBurdenPoints: internal.armourBurdenPointsByEntity[entityId]!,
    heldShieldBurdenPoints: internal.heldShieldBurdenPointsByEntity[entityId]!,
    primaryWeaponBurdenPoints:
      internal.primaryWeaponBurdenPointsByEntity[entityId]!,
    totalBurdenPoints: internal.totalBurdenPointsByEntity[entityId]!,
    burdenExertionMultiplierPercent:
      internal.burdenMultiplierPercentByEntity[entityId]!,
    currentGlobalHits: internal.currentGlobalHitsByEntity[entityId]!,
    maximumGlobalHits: internal.maximumGlobalHitsByEntity[entityId]!,
    missingGlobalHits: internal.missingGlobalHitsByEntity[entityId]!,
    injuryExertionMultiplierPercent:
      internal.injuryMultiplierPercentByEntity[entityId]!,
  };
}

type EntityArrayKey = Exclude<{
  [K in keyof InternalIndividualEnergyExertionModifierStore]:
    InternalIndividualEnergyExertionModifierStore[K] extends
      Uint8Array | Uint16Array | Uint32Array
      ? K : never;
}[keyof InternalIndividualEnergyExertionModifierStore], undefined>;

function getEntityValue(
  store: IndividualEnergyExertionModifierStore,
  entityId: number,
  key: EntityArrayKey,
): number {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal[key][entityId]!;
}

function requireStore(
  store: IndividualEnergyExertionModifierStore,
): InternalIndividualEnergyExertionModifierStore {
  const internal = modifierStoreInternals.get(store);
  if (internal === undefined) {
    throw new TypeError("Unknown individual energy exertion modifier store.");
  }
  return internal;
}

function assertEntityCount(entityCount: number): void {
  if (!Number.isSafeInteger(entityCount) || entityCount < 0) {
    throw new RangeError(
      "Exertion modifier entityCount must be a non-negative safe integer.",
    );
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError(`Invalid exertion modifier entity ID ${entityId}.`);
  }
}

function assertTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(
      "Exertion modifier tick must be a non-negative safe integer.",
    );
  }
}
