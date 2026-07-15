import {
  getIndividualCurrentGlobalHits,
  type IndividualGlobalHitStore,
} from "./individualGlobalHits";
import {
  isIndividualCharacterActive,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";

export interface IndividualCombatEligibilitySnapshot {
  readonly entityCount: number;
}

export interface IndividualCombatEligibilitySnapshotConfig {
  readonly entityCount: number;
}

export interface IndividualCombatEligibilityProjectionResult {
  readonly eligibleCount: number;
  readonly ineligibleCount: number;
}

interface InternalIndividualCombatEligibilitySnapshot
  extends IndividualCombatEligibilitySnapshot {
  readonly eligibleByEntity: Uint8Array;
}

export function createIndividualCombatEligibilitySnapshot(
  config: IndividualCombatEligibilitySnapshotConfig,
): IndividualCombatEligibilitySnapshot {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  const eligibleByEntity = new Uint8Array(config.entityCount);
  eligibleByEntity.fill(1);
  return {
    entityCount: config.entityCount,
    eligibleByEntity,
  } as InternalIndividualCombatEligibilitySnapshot;
}

export function projectIndividualCombatEligibilityFromHits(
  globalHitStore: IndividualGlobalHitStore,
  snapshot: IndividualCombatEligibilitySnapshot,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
): IndividualCombatEligibilityProjectionResult {
  const internal = asInternal(snapshot);
  if (globalHitStore.entityCount !== internal.entityCount) {
    throw new RangeError(
      "Individual combat eligibility snapshot must match global-hit entity count.",
    );
  }
  if (
    lifecycleStore !== undefined &&
    lifecycleStore.entityCount !== internal.entityCount
  ) {
    throw new RangeError(
      "Individual combat eligibility snapshot must match lifecycle entity count.",
    );
  }

  let eligibleCount = 0;
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const eligible =
      getIndividualCurrentGlobalHits(globalHitStore, entityId) > 0 &&
      (lifecycleStore === undefined ||
        isIndividualCharacterActive(lifecycleStore, entityId))
        ? 1
        : 0;
    internal.eligibleByEntity[entityId] = eligible;
    eligibleCount += eligible;
  }

  return {
    eligibleCount,
    ineligibleCount: internal.entityCount - eligibleCount,
  };
}

export function isIndividualCombatEligible(
  snapshot: IndividualCombatEligibilitySnapshot | undefined,
  entityId: number,
): boolean {
  if (snapshot === undefined) return true;
  const internal = asInternal(snapshot);
  assertEntityId(entityId, internal.entityCount);
  return internal.eligibleByEntity[entityId] !== 0;
}

function asInternal(
  snapshot: IndividualCombatEligibilitySnapshot,
): InternalIndividualCombatEligibilitySnapshot {
  return snapshot as InternalIndividualCombatEligibilitySnapshot;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Individual combat eligibility entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
