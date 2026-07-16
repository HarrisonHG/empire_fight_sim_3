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
  readonly latestProcessedTickByEntity: Float64Array;
  readonly latestProcessedAttackerByEntity: Float64Array;
  readonly latestProcessedTriggerKindByEntity: Uint8Array;
  readonly orderedOpportunityBuffer: IndividualTraumaticWoundOpportunity[];
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
  const latestProcessedTickByEntity = new Float64Array(entityCount);
  const latestProcessedAttackerByEntity = new Float64Array(entityCount);
  latestEpisodeTickByEntity.fill(-1);
  latestAttackerByEntity.fill(-1);
  latestProcessedTickByEntity.fill(-1);
  latestProcessedAttackerByEntity.fill(-1);
  return {
    entityCount,
    stateByEntity: new Uint8Array(entityCount),
    episodeCountByEntity: new Uint32Array(entityCount),
    latestEpisodeTickByEntity,
    latestAttackerByEntity,
    latestTriggerKindByEntity: new Uint8Array(entityCount),
    latestProcessedTickByEntity,
    latestProcessedAttackerByEntity,
    latestProcessedTriggerKindByEntity: new Uint8Array(entityCount),
    orderedOpportunityBuffer: [],
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
  const ordered = internal.orderedOpportunityBuffer;
  ordered.length = opportunities.length;
  for (let index = 0; index < opportunities.length; index += 1) {
    const opportunity = opportunities[index]!;
    validateOpportunity(opportunity, internal.entityCount);
    ordered[index] = opportunity;
  }
  ordered.sort(compareOpportunitiesCanonically);
  let rollCount = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const opportunity = ordered[index]!;
    const entityId = opportunity.targetEntityId;
    if (!isNewerThanLatestProcessed(internal, opportunity)) continue;
    const profile = getIndividualCasualtyProcedureProfile(
      procedureStore,
      entityId,
    );
    markOpportunityProcessed(internal, opportunity);
    if (profile.procedureKind !== "citizen") continue;
    if (internal.stateByEntity[entityId] !== 0) continue;
    rollCount += 1;
    const roll = calculateTraumaticWoundOpportunityRoll(battleSeed, opportunity);
    if (roll >= TRAUMA_ROLL_SUCCESS_LIMIT) continue;
    const previousEpisodeCount = internal.episodeCountByEntity[entityId]!;
    if (previousEpisodeCount === 0xffffffff) {
      throw new RangeError(`traumatic-wound episode count overflow for entity ${entityId}`);
    }
    const episodeCount = previousEpisodeCount + 1;
    internal.stateByEntity[entityId] = 1;
    internal.episodeCountByEntity[entityId] = episodeCount;
    internal.latestEpisodeTickByEntity[entityId] = opportunity.tick;
    internal.latestAttackerByEntity[entityId] = opportunity.attackerEntityId;
    internal.latestTriggerKindByEntity[entityId] =
      triggerIdentity(opportunity.triggerKind);
    out.push({
      entityId,
      attackerEntityId: opportunity.attackerEntityId,
      tick: opportunity.tick,
      triggerKind: opportunity.triggerKind,
      roll,
      episodeCount,
    });
  }
  ordered.length = 0;
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

function compareOpportunitiesCanonically(
  left: IndividualTraumaticWoundOpportunity,
  right: IndividualTraumaticWoundOpportunity,
): number {
  if (left.targetEntityId !== right.targetEntityId) {
    return left.targetEntityId - right.targetEntityId;
  }
  return compareOpportunityIdentity(left, right);
}

function compareOpportunityIdentity(
  left: IndividualTraumaticWoundOpportunity,
  right: IndividualTraumaticWoundOpportunity,
): number {
  if (left.tick !== right.tick) return left.tick - right.tick;
  if (left.attackerEntityId !== right.attackerEntityId) {
    return left.attackerEntityId - right.attackerEntityId;
  }
  return triggerIdentity(left.triggerKind) - triggerIdentity(right.triggerKind);
}

function isNewerThanLatestProcessed(
  store: InternalIndividualTraumaticWoundStore,
  opportunity: IndividualTraumaticWoundOpportunity,
): boolean {
  const entityId = opportunity.targetEntityId;
  const latestTick = store.latestProcessedTickByEntity[entityId]!;
  if (opportunity.tick !== latestTick) return opportunity.tick > latestTick;
  const latestAttacker = store.latestProcessedAttackerByEntity[entityId]!;
  if (opportunity.attackerEntityId !== latestAttacker) {
    return opportunity.attackerEntityId > latestAttacker;
  }
  return triggerIdentity(opportunity.triggerKind) >
    store.latestProcessedTriggerKindByEntity[entityId]!;
}

function markOpportunityProcessed(
  store: InternalIndividualTraumaticWoundStore,
  opportunity: IndividualTraumaticWoundOpportunity,
): void {
  const entityId = opportunity.targetEntityId;
  store.latestProcessedTickByEntity[entityId] = opportunity.tick;
  store.latestProcessedAttackerByEntity[entityId] = opportunity.attackerEntityId;
  store.latestProcessedTriggerKindByEntity[entityId] =
    triggerIdentity(opportunity.triggerKind);
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
