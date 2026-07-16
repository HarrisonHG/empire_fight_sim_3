import {
  deriveMaximumGlobalHits,
  getIndividualCombatProfile,
  type IndividualArmourCategory,
  type IndividualCombatProfileStore,
  type IndividualWeaponCategory,
  type MaximumGlobalHitDerivation,
} from "./individualCombatProfile";
import {
  type IndividualMeleeDefenceRecord,
  type IndividualMeleeDefenceType,
  type IndividualMeleeLandedReason,
} from "./individualMeleeDefence";
import {
  getIndividualCharacterLifecycleState,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";

export type IndividualHitApplicationReason =
  | "ordinaryLandedStrike"
  | "alreadyAtZero";

export const MAX_REPRESENTABLE_GLOBAL_HITS = 0x7fffffff;

export interface IndividualGlobalHitStore {
  readonly entityCount: number;
}

export interface IndividualGlobalHitStoreConfig {
  readonly entityCount: number;
}

export interface IndividualLandedHitApplicationRecord {
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  readonly attackerWeaponCategory: IndividualWeaponCategory;
  readonly targetArmourCategory: IndividualArmourCategory;
  readonly targetMaximumGlobalHits: number;
  readonly currentHitsBefore: number;
  readonly requestedHitLoss: 1;
  readonly appliedHitLoss: number;
  readonly currentHitsAfter: number;
  readonly zeroReachedByApplication: boolean;
  readonly awkwardDistance: boolean;
  readonly availableDefenceType: IndividualMeleeDefenceType;
  readonly landedReason: IndividualMeleeLandedReason;
  readonly applicationReason: IndividualHitApplicationReason;
}

export interface IndividualZeroHitEvent {
  readonly entityId: number;
  readonly attackerEntityId: number;
  readonly previousHits: number;
}

export interface IndividualGlobalHitTickResult {
  readonly applications: readonly IndividualLandedHitApplicationRecord[];
  readonly zeroHitEvents: readonly IndividualZeroHitEvent[];
  readonly landedRecordCount: number;
  readonly totalAppliedHitLoss: number;
  readonly alreadyZeroApplicationCount: number;
}

export type IndividualGlobalHitRestorationReason = "chirurgeonTreatment";

export interface IndividualGlobalHitRestorationRecord {
  readonly entityId: number;
  readonly reason: IndividualGlobalHitRestorationReason;
  readonly requestedHitRestoration: number;
  readonly appliedHitRestoration: number;
  readonly maximumGlobalHits: number;
  readonly currentHitsBefore: number;
  readonly currentHitsAfter: number;
}

interface InternalIndividualGlobalHitStore extends IndividualGlobalHitStore {
  readonly maximumGlobalHitsByEntity: Int32Array;
  readonly currentGlobalHitsByEntity: Int32Array;
  readonly zeroReachedByEntity: Uint8Array;
  readonly armourCategoryByEntity: readonly IndividualArmourCategory[];
  readonly derivationsByEntity: readonly MaximumGlobalHitDerivation[];
}

export function createIndividualGlobalHitStore(
  profileStore: IndividualCombatProfileStore,
  config: IndividualGlobalHitStoreConfig,
): IndividualGlobalHitStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  if (profileStore.entityCount !== config.entityCount) {
    throw new RangeError(
      "Individual global hit store must match profile entity count.",
    );
  }

  const maximumGlobalHitsByEntity = new Int32Array(config.entityCount);
  const currentGlobalHitsByEntity = new Int32Array(config.entityCount);
  const zeroReachedByEntity = new Uint8Array(config.entityCount);
  const armourCategoryByEntity: IndividualArmourCategory[] = [];
  const derivationsByEntity: MaximumGlobalHitDerivation[] = [];

  for (let entityId = 0; entityId < config.entityCount; entityId += 1) {
    const profile = getIndividualCombatProfile(profileStore, entityId);
    const derivation = deriveMaximumGlobalHits(profile);
    if (derivation.maximumGlobalHits > MAX_REPRESENTABLE_GLOBAL_HITS) {
      throw new RangeError(
        "Derived maximum global hits exceed Int32 storage capacity.",
      );
    }
    maximumGlobalHitsByEntity[entityId] = derivation.maximumGlobalHits;
    currentGlobalHitsByEntity[entityId] = derivation.maximumGlobalHits;
    armourCategoryByEntity.push(profile.armourCategory);
    derivationsByEntity.push(derivation);
  }

  return {
    entityCount: config.entityCount,
    maximumGlobalHitsByEntity,
    currentGlobalHitsByEntity,
    zeroReachedByEntity,
    armourCategoryByEntity: Object.freeze(armourCategoryByEntity),
    derivationsByEntity: Object.freeze(derivationsByEntity),
  } as InternalIndividualGlobalHitStore;
}

export function getIndividualMaximumGlobalHits(
  store: IndividualGlobalHitStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.maximumGlobalHitsByEntity[entityId]!;
}

export function getIndividualCurrentGlobalHits(
  store: IndividualGlobalHitStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.currentGlobalHitsByEntity[entityId]!;
}

export function getIndividualGlobalHitDerivation(
  store: IndividualGlobalHitStore,
  entityId: number,
): MaximumGlobalHitDerivation {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.derivationsByEntity[entityId]!;
}

export function hasIndividualReachedZeroHits(
  store: IndividualGlobalHitStore,
  entityId: number,
): boolean {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.zeroReachedByEntity[entityId] !== 0;
}

export function restoreIndividualGlobalHits(
  store: IndividualGlobalHitStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  entityId: number,
  requestedHitRestoration: number,
  reason: IndividualGlobalHitRestorationReason,
): IndividualGlobalHitRestorationRecord {
  const internal = asInternal(store);
  if (internal.entityCount !== lifecycleStore.entityCount) {
    throw new RangeError("Global-hit restoration lifecycle must match entity count.");
  }
  assertEntityId(entityId, internal.entityCount);
  assertPositiveSafeInteger(requestedHitRestoration, "requestedHitRestoration");
  if (reason !== "chirurgeonTreatment") {
    throw new RangeError("Unknown individual global-hit restoration reason.");
  }
  if (getIndividualCharacterLifecycleState(lifecycleStore, entityId) === "terminal") {
    throw new Error("Terminal characters cannot have global hits restored.");
  }
  const maximumGlobalHits = internal.maximumGlobalHitsByEntity[entityId]!;
  const currentHitsBefore = internal.currentGlobalHitsByEntity[entityId]!;
  const currentHitsAfter = Math.min(
    maximumGlobalHits,
    currentHitsBefore + requestedHitRestoration,
  );
  const appliedHitRestoration = currentHitsAfter - currentHitsBefore;
  internal.currentGlobalHitsByEntity[entityId] = currentHitsAfter;
  if (currentHitsAfter > 0) internal.zeroReachedByEntity[entityId] = 0;
  return {
    entityId,
    reason,
    requestedHitRestoration,
    appliedHitRestoration,
    maximumGlobalHits,
    currentHitsBefore,
    currentHitsAfter,
  };
}

export function applyIndividualLandedHits(
  store: IndividualGlobalHitStore,
  defenceRecords: readonly IndividualMeleeDefenceRecord[],
  applicationsOut: IndividualLandedHitApplicationRecord[] = [],
  zeroHitEventsOut: IndividualZeroHitEvent[] = [],
): IndividualGlobalHitTickResult {
  const internal = asInternal(store);
  applicationsOut.length = 0;
  zeroHitEventsOut.length = 0;

  let totalAppliedHitLoss = 0;
  let alreadyZeroApplicationCount = 0;

  for (let index = 0; index < defenceRecords.length; index += 1) {
    const record = defenceRecords[index]!;
    if (record.outcome !== "landed") continue;
    assertEntityId(record.attackerEntityId, internal.entityCount);
    assertEntityId(record.defenderEntityId, internal.entityCount);
    const application = applyLandedRecord(internal, record, zeroHitEventsOut);
    applicationsOut.push(application);
    totalAppliedHitLoss += application.appliedHitLoss;
    if (application.applicationReason === "alreadyAtZero") {
      alreadyZeroApplicationCount += 1;
    }
  }

  return {
    applications: applicationsOut,
    zeroHitEvents: zeroHitEventsOut,
    landedRecordCount: applicationsOut.length,
    totalAppliedHitLoss,
    alreadyZeroApplicationCount,
  };
}

function applyLandedRecord(
  store: InternalIndividualGlobalHitStore,
  record: IndividualMeleeDefenceRecord & { readonly outcome: "landed" },
  zeroHitEventsOut: IndividualZeroHitEvent[],
): IndividualLandedHitApplicationRecord {
  const targetEntityId = record.defenderEntityId;
  const currentHitsBefore = store.currentGlobalHitsByEntity[targetEntityId]!;
  const targetMaximumGlobalHits =
    store.maximumGlobalHitsByEntity[targetEntityId]!;
  const alreadyAtZero = currentHitsBefore === 0;
  const appliedHitLoss = alreadyAtZero ? 0 : 1;
  const currentHitsAfter = currentHitsBefore - appliedHitLoss;
  const zeroReachedByApplication =
    currentHitsBefore > 0 && currentHitsAfter === 0;

  store.currentGlobalHitsByEntity[targetEntityId] = currentHitsAfter;
  if (
    zeroReachedByApplication &&
    store.zeroReachedByEntity[targetEntityId] === 0
  ) {
    zeroHitEventsOut.push({
      entityId: targetEntityId,
      attackerEntityId: record.attackerEntityId,
      previousHits: currentHitsBefore,
    });
    store.zeroReachedByEntity[targetEntityId] = 1;
  }

  return {
    attackerEntityId: record.attackerEntityId,
    targetEntityId,
    attackerWeaponCategory: record.attackerWeaponCategory,
    targetArmourCategory: store.armourCategoryByEntity[targetEntityId]!,
    targetMaximumGlobalHits,
    currentHitsBefore,
    requestedHitLoss: 1,
    appliedHitLoss,
    currentHitsAfter,
    zeroReachedByApplication,
    awkwardDistance: record.awkwardDistance,
    availableDefenceType: record.availableDefenceType,
    landedReason: record.landedReason,
    applicationReason: alreadyAtZero
      ? "alreadyAtZero"
      : "ordinaryLandedStrike",
  };
}

function asInternal(
  store: IndividualGlobalHitStore,
): InternalIndividualGlobalHitStore {
  return store as InternalIndividualGlobalHitStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Individual global-hit entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
