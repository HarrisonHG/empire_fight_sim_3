import {
  getIndividualCasualtyProcedureProfile,
  type IndividualCasualtyProcedureProfileStore,
} from "./individualCasualtyProcedureProfile";

export type TraumaticWoundState = "none" | "active";
export type TraumaticWoundTriggerKind = "zeroHit" | "limbCleave";

export interface IndividualTraumaticWoundOpportunity {
  readonly targetEntityId: number;
  readonly attackerEntityId: number;
  readonly tick: number;
  readonly triggerKind: TraumaticWoundTriggerKind;
}

export interface IndividualTraumaticWoundStore {
  readonly entityCount: number;
}

interface InternalIndividualTraumaticWoundStore
  extends IndividualTraumaticWoundStore {
  readonly stateByEntity: Uint8Array;
  readonly episodeCountByEntity: Uint32Array;
  readonly latestEpisodeTickByEntity: Float64Array;
  readonly latestAttackerByEntity: Float64Array;
  readonly latestTriggerKindByEntity: Uint8Array;
  readonly candidatePresentByEntity: Uint8Array;
  readonly candidateTickByEntity: Float64Array;
  readonly candidateAttackerByEntity: Float64Array;
  readonly candidateTriggerKindByEntity: Uint8Array;
  readonly candidateRollByEntity: Uint16Array;
}

export interface IndividualTraumaticWoundInspection {
  readonly state: TraumaticWoundState;
  readonly episodeCount: number;
  readonly latestEpisodeTick: number;
  readonly latestAttackerEntityId: number;
  readonly latestTriggerKind: TraumaticWoundTriggerKind | "none";
}

export interface IndividualTraumaticWoundAppliedRecord {
  readonly entityId: number;
  readonly attackerEntityId: number;
  readonly tick: number;
  readonly triggerKind: TraumaticWoundTriggerKind;
  readonly roll: number;
  readonly episodeCount: number;
}

export interface IndividualTraumaticWoundResolutionResult {
  readonly records: readonly IndividualTraumaticWoundAppliedRecord[];
  readonly opportunityCount: number;
  readonly rollCount: number;
  readonly appliedCount: number;
}

const TRAUMA_ROLL_RANGE = 1_000;
const TRAUMA_ROLL_SUCCESS_LIMIT = 100;

export function createIndividualTraumaticWoundStore(
  entityCount: number,
): IndividualTraumaticWoundStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const latestEpisodeTickByEntity = new Float64Array(entityCount);
  const latestAttackerByEntity = new Float64Array(entityCount);
  latestEpisodeTickByEntity.fill(-1);
  latestAttackerByEntity.fill(-1);
  return {
    entityCount,
    stateByEntity: new Uint8Array(entityCount),
    episodeCountByEntity: new Uint32Array(entityCount),
    latestEpisodeTickByEntity,
    latestAttackerByEntity,
    latestTriggerKindByEntity: new Uint8Array(entityCount),
    candidatePresentByEntity: new Uint8Array(entityCount),
    candidateTickByEntity: new Float64Array(entityCount),
    candidateAttackerByEntity: new Float64Array(entityCount),
    candidateTriggerKindByEntity: new Uint8Array(entityCount),
    candidateRollByEntity: new Uint16Array(entityCount),
  } as InternalIndividualTraumaticWoundStore;
}

export function getIndividualTraumaticWoundInspection(
  store: IndividualTraumaticWoundStore,
  entityId: number,
): IndividualTraumaticWoundInspection {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Traumatic wound");
  const triggerIdentity = internal.latestTriggerKindByEntity[entityId]!;
  return {
    state: internal.stateByEntity[entityId] === 0 ? "none" : "active",
    episodeCount: internal.episodeCountByEntity[entityId]!,
    latestEpisodeTick: internal.latestEpisodeTickByEntity[entityId]!,
    latestAttackerEntityId: internal.latestAttackerByEntity[entityId]!,
    latestTriggerKind:
      triggerIdentity === 0
        ? "none"
        : triggerIdentity === 1
          ? "zeroHit"
          : "limbCleave",
  };
}

/** Future successful treatment may clear the condition through this boundary. */
export function clearIndividualTraumaticWound(
  store: IndividualTraumaticWoundStore,
  entityId: number,
): boolean {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Traumatic wound");
  if (internal.stateByEntity[entityId] === 0) return false;
  internal.stateByEntity[entityId] = 0;
  return true;
}

export function calculateTraumaticWoundOpportunityRoll(
  battleSeed: number,
  opportunity: IndividualTraumaticWoundOpportunity,
): number {
  assertNonNegativeSafeInteger(battleSeed, "battleSeed");
  assertNonNegativeSafeInteger(opportunity.tick, "opportunity tick");
  let hash = 0x811c9dc5;
  hash = mixSafeInteger(hash, battleSeed);
  hash = mixSafeInteger(hash, opportunity.targetEntityId);
  hash = mixSafeInteger(hash, opportunity.attackerEntityId);
  hash = mixSafeInteger(hash, opportunity.tick);
  hash = mixHash(hash, triggerIdentity(opportunity.triggerKind));
  return hash % TRAUMA_ROLL_RANGE;
}

/** Shared zero-hit/limb-cleave boundary; callers retain and reuse `out`. */
export function resolveIndividualTraumaticWoundOpportunities(
  battleSeed: number,
  procedureStore: IndividualCasualtyProcedureProfileStore,
  store: IndividualTraumaticWoundStore,
  opportunities: readonly IndividualTraumaticWoundOpportunity[],
  out: IndividualTraumaticWoundAppliedRecord[] = [],
): IndividualTraumaticWoundResolutionResult {
  const internal = asInternal(store);
  if (procedureStore.entityCount !== internal.entityCount) {
    throw new RangeError("Traumatic-wound stores must match entity count.");
  }
  assertNonNegativeSafeInteger(battleSeed, "battleSeed");
  out.length = 0;
  if (opportunities.length === 0) {
    return { records: out, opportunityCount: 0, rollCount: 0, appliedCount: 0 };
  }
  internal.candidatePresentByEntity.fill(0);
  let rollCount = 0;
  for (let index = 0; index < opportunities.length; index += 1) {
    const opportunity = opportunities[index]!;
    validateOpportunity(opportunity, internal.entityCount);
    const profile = getIndividualCasualtyProcedureProfile(
      procedureStore,
      opportunity.targetEntityId,
    );
    if (
      profile.procedureKind !== "citizen" ||
      internal.stateByEntity[opportunity.targetEntityId] !== 0
    ) continue;
    rollCount += 1;
    const roll = calculateTraumaticWoundOpportunityRoll(battleSeed, opportunity);
    if (roll >= TRAUMA_ROLL_SUCCESS_LIMIT) continue;
    if (isEarlierCanonicalCandidate(internal, opportunity)) {
      const entityId = opportunity.targetEntityId;
      internal.candidatePresentByEntity[entityId] = 1;
      internal.candidateTickByEntity[entityId] = opportunity.tick;
      internal.candidateAttackerByEntity[entityId] = opportunity.attackerEntityId;
      internal.candidateTriggerKindByEntity[entityId] =
        triggerIdentity(opportunity.triggerKind);
      internal.candidateRollByEntity[entityId] = roll;
    }
  }

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    if (internal.candidatePresentByEntity[entityId] === 0) continue;
    internal.stateByEntity[entityId] = 1;
    const previousEpisodeCount = internal.episodeCountByEntity[entityId]!;
    if (previousEpisodeCount === 0xffffffff) {
      throw new RangeError(`traumatic-wound episode count overflow for entity ${entityId}`);
    }
    const episodeCount = previousEpisodeCount + 1;
    internal.episodeCountByEntity[entityId] = episodeCount;
    const triggerKind = internal.candidateTriggerKindByEntity[entityId] === 1
      ? "zeroHit"
      : "limbCleave";
    internal.latestEpisodeTickByEntity[entityId] =
      internal.candidateTickByEntity[entityId]!;
    internal.latestAttackerByEntity[entityId] =
      internal.candidateAttackerByEntity[entityId]!;
    internal.latestTriggerKindByEntity[entityId] =
      internal.candidateTriggerKindByEntity[entityId]!;
    out.push({
      entityId,
      attackerEntityId: internal.candidateAttackerByEntity[entityId]!,
      tick: internal.candidateTickByEntity[entityId]!,
      triggerKind,
      roll: internal.candidateRollByEntity[entityId]!,
      episodeCount,
    });
  }
  return {
    records: out,
    opportunityCount: opportunities.length,
    rollCount,
    appliedCount: out.length,
  };
}

export function createLimbCleaveTraumaticWoundOpportunity(
  targetEntityId: number,
  attackerEntityId: number,
  tick: number,
): IndividualTraumaticWoundOpportunity {
  return { targetEntityId, attackerEntityId, tick, triggerKind: "limbCleave" };
}

function isEarlierCanonicalCandidate(
  store: InternalIndividualTraumaticWoundStore,
  opportunity: IndividualTraumaticWoundOpportunity,
): boolean {
  const entityId = opportunity.targetEntityId;
  if (store.candidatePresentByEntity[entityId] === 0) return true;
  const candidateTick = store.candidateTickByEntity[entityId]!;
  if (opportunity.tick !== candidateTick) return opportunity.tick < candidateTick;
  const candidateAttacker = store.candidateAttackerByEntity[entityId]!;
  if (opportunity.attackerEntityId !== candidateAttacker) {
    return opportunity.attackerEntityId < candidateAttacker;
  }
  return triggerIdentity(opportunity.triggerKind) <
    store.candidateTriggerKindByEntity[entityId]!;
}

function validateOpportunity(
  opportunity: IndividualTraumaticWoundOpportunity,
  entityCount: number,
): void {
  assertEntityId(opportunity.targetEntityId, entityCount, "Trauma target");
  assertEntityId(opportunity.attackerEntityId, entityCount, "Trauma attacker");
  assertNonNegativeSafeInteger(opportunity.tick, "opportunity tick");
  triggerIdentity(opportunity.triggerKind);
}

function triggerIdentity(kind: TraumaticWoundTriggerKind): 1 | 2 {
  if (kind === "zeroHit") return 1;
  if (kind === "limbCleave") return 2;
  throw new RangeError("Unknown traumatic-wound trigger kind.");
}

function mixSafeInteger(hash: number, value: number): number {
  hash = mixHash(hash, value >>> 0);
  return mixHash(hash, Math.floor(value / 0x1_0000_0000) >>> 0);
}

function mixHash(hash: number, value: number): number {
  hash ^= value;
  return Math.imul(hash, 0x01000193) >>> 0;
}

function asInternal(
  store: IndividualTraumaticWoundStore,
): InternalIndividualTraumaticWoundStore {
  return store as InternalIndividualTraumaticWoundStore;
}

function assertEntityId(
  entityId: number,
  entityCount: number,
  label: string,
): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError(`${label} entity ID is out of bounds.`);
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
