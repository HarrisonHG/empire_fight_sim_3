import type {
  IndividualMeleeDefenceRecord,
} from "./individualMeleeDefence";

export const LANDED_HIT_GATE_TICKS_PER_SECOND = 20;

export type IndividualLandedHitGateOutcome = "accepted" | "rejected";
export type IndividualLandedHitGateReason =
  | "accepted"
  | "relationshipCooldown";

export interface IndividualLandedHitGateStore {
  readonly entityCount: number;
}

export interface IndividualLandedHitGateStoreConfig {
  readonly entityCount: number;
}

export interface IndividualLandedHitGateDecisionRecord {
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  readonly currentTick: number;
  readonly outcome: IndividualLandedHitGateOutcome;
  readonly reason: IndividualLandedHitGateReason;
  readonly previousNextAllowedTick: number | null;
  readonly resultingNextAllowedTick: number;
  readonly cooldownTicksRemaining: number;
}

export interface IndividualLandedHitGateTickResult {
  readonly decisions: readonly IndividualLandedHitGateDecisionRecord[];
  readonly acceptedRecords: readonly IndividualMeleeDefenceRecord[];
  readonly landedRecordsConsidered: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly relationshipCreatedCount: number;
  readonly expiredRelationshipCount: number;
  readonly activeRelationshipCount: number;
}

interface GateRelationship {
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  nextAllowedTick: number;
}

interface InternalIndividualLandedHitGateStore
  extends IndividualLandedHitGateStore {
  readonly relationshipsByKey: Map<number, GateRelationship>;
  readonly landedScratch: IndividualMeleeDefenceRecord[];
  readonly touchedRelationshipKeys: Set<number>;
  lastProcessedTick: number;
}

export function createIndividualLandedHitGateStore(
  config: IndividualLandedHitGateStoreConfig,
): IndividualLandedHitGateStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  return {
    entityCount: config.entityCount,
    relationshipsByKey: new Map<number, GateRelationship>(),
    landedScratch: [],
    touchedRelationshipKeys: new Set<number>(),
    lastProcessedTick: -1,
  } as InternalIndividualLandedHitGateStore;
}

export function filterIndividualLandedHitsThroughGate(
  store: IndividualLandedHitGateStore,
  currentTick: number,
  defenceRecords: readonly IndividualMeleeDefenceRecord[],
  decisionsOut: IndividualLandedHitGateDecisionRecord[] = [],
  acceptedRecordsOut: IndividualMeleeDefenceRecord[] = [],
): IndividualLandedHitGateTickResult {
  const internal = asInternal(store);
  assertNonNegativeSafeInteger(currentTick, "currentTick");
  if (currentTick < internal.lastProcessedTick) {
    throw new RangeError("Landed-hit gate current tick cannot decrease.");
  }
  internal.lastProcessedTick = currentTick;
  decisionsOut.length = 0;
  acceptedRecordsOut.length = 0;
  internal.touchedRelationshipKeys.clear();
  let expiredRelationshipCount = expireRelationshipsBeforeTick(
    internal,
    currentTick,
  );

  prepareCanonicalLandedRecords(internal, defenceRecords);
  let acceptedCount = 0;
  let rejectedCount = 0;
  let relationshipCreatedCount = 0;

  for (let index = 0; index < internal.landedScratch.length; index += 1) {
    const record = internal.landedScratch[index]!;
    const attackerEntityId = record.attackerEntityId;
    const targetEntityId = record.defenderEntityId;
    const key = relationshipKey(internal, attackerEntityId, targetEntityId);
    const relationship = internal.relationshipsByKey.get(key);
    const previousNextAllowedTick = relationship?.nextAllowedTick ?? null;

    if (
      relationship === undefined ||
      currentTick >= relationship.nextAllowedTick
    ) {
      const resultingNextAllowedTick =
        currentTick + LANDED_HIT_GATE_TICKS_PER_SECOND;
      if (relationship === undefined) {
        internal.relationshipsByKey.set(key, {
          attackerEntityId,
          targetEntityId,
          nextAllowedTick: resultingNextAllowedTick,
        });
        relationshipCreatedCount += 1;
      } else {
        relationship.nextAllowedTick = resultingNextAllowedTick;
      }
      internal.touchedRelationshipKeys.add(key);
      acceptedRecordsOut.push(record);
      decisionsOut.push({
        attackerEntityId,
        targetEntityId,
        currentTick,
        outcome: "accepted",
        reason: "accepted",
        previousNextAllowedTick,
        resultingNextAllowedTick,
        cooldownTicksRemaining: LANDED_HIT_GATE_TICKS_PER_SECOND,
      });
      acceptedCount += 1;
    } else {
      decisionsOut.push({
        attackerEntityId,
        targetEntityId,
        currentTick,
        outcome: "rejected",
        reason: "relationshipCooldown",
        previousNextAllowedTick,
        resultingNextAllowedTick: relationship.nextAllowedTick,
        cooldownTicksRemaining: relationship.nextAllowedTick - currentTick,
      });
      rejectedCount += 1;
    }
  }

  expiredRelationshipCount += expireUntouchedRelationshipsAtTick(
    internal,
    currentTick,
  );

  return {
    decisions: decisionsOut,
    acceptedRecords: acceptedRecordsOut,
    landedRecordsConsidered: decisionsOut.length,
    acceptedCount,
    rejectedCount,
    relationshipCreatedCount,
    expiredRelationshipCount,
    activeRelationshipCount: internal.relationshipsByKey.size,
  };
}

function prepareCanonicalLandedRecords(
  store: InternalIndividualLandedHitGateStore,
  defenceRecords: readonly IndividualMeleeDefenceRecord[],
): void {
  store.landedScratch.length = 0;
  for (let index = 0; index < defenceRecords.length; index += 1) {
    const record = defenceRecords[index]!;
    if (record.outcome !== "landed") continue;
    assertEntityId(record.attackerEntityId, store.entityCount);
    assertEntityId(record.defenderEntityId, store.entityCount);
    store.landedScratch.push(record);
  }
  store.landedScratch.sort(
    (left, right) =>
      left.defenderEntityId - right.defenderEntityId ||
      left.attackerEntityId - right.attackerEntityId,
  );
}

function expireRelationshipsBeforeTick(
  store: InternalIndividualLandedHitGateStore,
  currentTick: number,
): number {
  let expiredCount = 0;
  for (const [key, relationship] of store.relationshipsByKey) {
    if (relationship.nextAllowedTick < currentTick) {
      store.relationshipsByKey.delete(key);
      expiredCount += 1;
    }
  }
  return expiredCount;
}

function expireUntouchedRelationshipsAtTick(
  store: InternalIndividualLandedHitGateStore,
  currentTick: number,
): number {
  let expiredCount = 0;
  for (const [key, relationship] of store.relationshipsByKey) {
    if (
      relationship.nextAllowedTick <= currentTick &&
      !store.touchedRelationshipKeys.has(key)
    ) {
      store.relationshipsByKey.delete(key);
      expiredCount += 1;
    }
  }
  return expiredCount;
}

function relationshipKey(
  store: InternalIndividualLandedHitGateStore,
  attackerEntityId: number,
  targetEntityId: number,
): number {
  assertEntityId(attackerEntityId, store.entityCount);
  assertEntityId(targetEntityId, store.entityCount);
  return attackerEntityId * store.entityCount + targetEntityId;
}

function asInternal(
  store: IndividualLandedHitGateStore,
): InternalIndividualLandedHitGateStore {
  return store as InternalIndividualLandedHitGateStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Individual landed-hit gate entity ID is out of bounds.");
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
