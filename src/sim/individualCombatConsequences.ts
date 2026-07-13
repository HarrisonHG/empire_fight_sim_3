import type { CombatConsequenceApplication } from "./combatConsequences";
import type { IndividualCombatUnitSummary } from "./individualCombatAggregation";
import type { IndividualMeleeAttackAttemptRecord } from "./individualCombatAction";
import type { IndividualLandedHitApplicationRecord, IndividualZeroHitEvent } from "./individualGlobalHits";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import type { IndividualMeleeDefenceRecord } from "./individualMeleeDefence";
import type { IndividualSelectedTargetRecord } from "./individualMeleeTargetSelection";
import {
  getUnitIdForEntity,
  getUnitIds,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export interface IndividualCombatConsequenceProjectionStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface IndividualCombatUnitConsequenceSummary {
  readonly unitId: UnitId;
  readonly tickStartEligibleMembers: number;
  readonly endOfTickEligibleMembers: number;
  readonly newlyZeroMembers: number;
  readonly outgoingSelectedTargets: number;
  readonly outgoingAttackAttempts: number;
  readonly outgoingInvalidatedAttempts: number;
  readonly outgoingGateAcceptedHits: number;
  readonly incomingAttackAttempts: number;
  readonly incomingPreventedAttacks: number;
  readonly incomingParries: number;
  readonly incomingBucklerBlocks: number;
  readonly incomingShieldBlocks: number;
  readonly incomingLandedOutcomes: number;
  readonly incomingGateAcceptedHits: number;
  readonly incomingGateRejectedHits: number;
  readonly incomingAppliedHitLoss: number;
  readonly incomingZeroHitTransitions: number;
  readonly hasOutgoingEngagement: boolean;
  readonly hasIncomingEngagement: boolean;
  readonly hasFreshIndividualCombatPressure: boolean;
}

export interface IndividualCombatShadowComparison {
  readonly unitId: UnitId;
  readonly legacyConsideredEngaged: boolean;
  readonly individualOutgoingEngagement: boolean;
  readonly individualIncomingEngagement: boolean;
  readonly legacyConsequenceCount: number;
  readonly individualAppliedHitLoss: number;
  readonly individualNewlyZeroCount: number;
}

export interface IndividualCombatConsequenceProjectionResult {
  readonly summaries: readonly IndividualCombatUnitConsequenceSummary[];
}

export interface IndividualCombatShadowComparisonResult {
  readonly comparisons: readonly IndividualCombatShadowComparison[];
}

interface MutableIndividualCombatUnitConsequenceSummary
  extends IndividualCombatUnitConsequenceSummary {
  unitId: UnitId;
  tickStartEligibleMembers: number;
  endOfTickEligibleMembers: number;
  newlyZeroMembers: number;
  outgoingSelectedTargets: number;
  outgoingAttackAttempts: number;
  outgoingInvalidatedAttempts: number;
  outgoingGateAcceptedHits: number;
  incomingAttackAttempts: number;
  incomingPreventedAttacks: number;
  incomingParries: number;
  incomingBucklerBlocks: number;
  incomingShieldBlocks: number;
  incomingLandedOutcomes: number;
  incomingGateAcceptedHits: number;
  incomingGateRejectedHits: number;
  incomingAppliedHitLoss: number;
  incomingZeroHitTransitions: number;
  hasOutgoingEngagement: boolean;
  hasIncomingEngagement: boolean;
  hasFreshIndividualCombatPressure: boolean;
}

interface MutableIndividualCombatShadowComparison
  extends IndividualCombatShadowComparison {
  unitId: UnitId;
  legacyConsideredEngaged: boolean;
  individualOutgoingEngagement: boolean;
  individualIncomingEngagement: boolean;
  legacyConsequenceCount: number;
  individualAppliedHitLoss: number;
  individualNewlyZeroCount: number;
}

interface InternalIndividualCombatConsequenceProjectionStore
  extends IndividualCombatConsequenceProjectionStore {
  readonly unitIds: readonly UnitId[];
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly entityUnitIndexByEntity: Int32Array;
  readonly summaries: MutableIndividualCombatUnitConsequenceSummary[];
  readonly comparisons: MutableIndividualCombatShadowComparison[];
}

export function createIndividualCombatConsequenceProjectionStore(
  identityStore: UnitIdentityStore,
): IndividualCombatConsequenceProjectionStore {
  const unitIds = getUnitIds(identityStore).slice();
  const unitIndexById = new Map<UnitId, number>();
  const entityUnitIndexByEntity = new Int32Array(identityStore.entityCount);
  entityUnitIndexByEntity.fill(-1);
  const summaries: MutableIndividualCombatUnitConsequenceSummary[] = [];
  const comparisons: MutableIndividualCombatShadowComparison[] = [];

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    unitIndexById.set(unitId, unitIndex);
    summaries.push(createMutableSummary(unitId));
    comparisons.push(createMutableComparison(unitId));
  }
  for (let entityId = 0; entityId < identityStore.entityCount; entityId += 1) {
    entityUnitIndexByEntity[entityId] = unitIndexForUnitId(
      unitIndexById,
      getUnitIdForEntity(identityStore, entityId),
    );
  }

  return {
    entityCount: identityStore.entityCount,
    unitCount: unitIds.length,
    unitIds: Object.freeze(unitIds),
    unitIndexById,
    entityUnitIndexByEntity,
    summaries,
    comparisons,
  } as InternalIndividualCombatConsequenceProjectionStore;
}

export function getIndividualCombatConsequenceSummaries(
  store: IndividualCombatConsequenceProjectionStore,
): readonly IndividualCombatUnitConsequenceSummary[] {
  return asInternal(store).summaries;
}

export function getIndividualCombatShadowComparisons(
  store: IndividualCombatConsequenceProjectionStore,
): readonly IndividualCombatShadowComparison[] {
  return asInternal(store).comparisons;
}

export function projectIndividualCombatConsequences(
  identityStore: UnitIdentityStore,
  unitSummaries: readonly IndividualCombatUnitSummary[],
  selectedTargets: readonly IndividualSelectedTargetRecord[],
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  defenceRecords: readonly IndividualMeleeDefenceRecord[],
  gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  hitApplications: readonly IndividualLandedHitApplicationRecord[],
  zeroHitEvents: readonly IndividualZeroHitEvent[],
  store: IndividualCombatConsequenceProjectionStore,
): IndividualCombatConsequenceProjectionResult {
  validateStore(identityStore, store);
  const internal = asInternal(store);
  clearConsequenceSummaries(internal);
  copyEligibilityFields(internal, unitSummaries);
  collectSelectedTargets(internal, selectedTargets);
  collectAttackAttempts(internal, attackAttempts);
  collectDefenceRecords(internal, defenceRecords);
  collectGateDecisions(internal, gateDecisions);
  collectHitApplications(internal, hitApplications);
  collectZeroHitEvents(internal, zeroHitEvents);
  finalizeSummaryBooleans(internal);

  return { summaries: internal.summaries };
}

export function compareIndividualCombatShadow(
  identityStore: UnitIdentityStore,
  legacyConsequences: readonly CombatConsequenceApplication[],
  individualSummaries: readonly IndividualCombatUnitConsequenceSummary[],
  store: IndividualCombatConsequenceProjectionStore,
): IndividualCombatShadowComparisonResult {
  validateStore(identityStore, store);
  const internal = asInternal(store);
  clearShadowComparisons(internal);
  copyIndividualComparisonFields(internal, individualSummaries);
  collectLegacyConsequences(internal, legacyConsequences);

  return { comparisons: internal.comparisons };
}

function copyEligibilityFields(
  store: InternalIndividualCombatConsequenceProjectionStore,
  unitSummaries: readonly IndividualCombatUnitSummary[],
): void {
  for (let index = 0; index < unitSummaries.length; index += 1) {
    const unitSummary = unitSummaries[index]!;
    const summary = store.summaries[unitIndexForUnitId(
      store.unitIndexById,
      unitSummary.unitId,
    )]!;
    summary.tickStartEligibleMembers =
      unitSummary.tickStartCombatEligibleMemberCount;
    summary.endOfTickEligibleMembers =
      unitSummary.endOfTickCombatEligibleMemberCount;
    summary.newlyZeroMembers = unitSummary.newlyZeroHitMemberCount;
  }
}

function collectSelectedTargets(
  store: InternalIndividualCombatConsequenceProjectionStore,
  records: readonly IndividualSelectedTargetRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.targetEntityId < 0) continue;
    store.summaries[unitIndexForEntity(store, record.sourceEntityId)]!
      .outgoingSelectedTargets += 1;
  }
}

function collectAttackAttempts(
  store: InternalIndividualCombatConsequenceProjectionStore,
  records: readonly IndividualMeleeAttackAttemptRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const outgoing =
      store.summaries[unitIndexForEntity(store, record.attackerEntityId)]!;
    const incoming =
      store.summaries[unitIndexForEntity(store, record.targetEntityId)]!;
    outgoing.outgoingAttackAttempts += 1;
    incoming.incomingAttackAttempts += 1;
    if (record.outcome === "invalidated") {
      outgoing.outgoingInvalidatedAttempts += 1;
    }
  }
}

function collectDefenceRecords(
  store: InternalIndividualCombatConsequenceProjectionStore,
  records: readonly IndividualMeleeDefenceRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const incoming =
      store.summaries[unitIndexForEntity(store, record.defenderEntityId)]!;
    if (record.outcome === "parried") {
      incoming.incomingParries += 1;
      incoming.incomingPreventedAttacks += 1;
    } else if (record.outcome === "bucklerBlocked") {
      incoming.incomingBucklerBlocks += 1;
      incoming.incomingPreventedAttacks += 1;
    } else if (record.outcome === "shieldBlocked") {
      incoming.incomingShieldBlocks += 1;
      incoming.incomingPreventedAttacks += 1;
    } else {
      incoming.incomingLandedOutcomes += 1;
    }
  }
}

function collectGateDecisions(
  store: InternalIndividualCombatConsequenceProjectionStore,
  records: readonly IndividualLandedHitGateDecisionRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const outgoing =
      store.summaries[unitIndexForEntity(store, record.attackerEntityId)]!;
    const incoming =
      store.summaries[unitIndexForEntity(store, record.targetEntityId)]!;
    if (record.outcome === "accepted") {
      outgoing.outgoingGateAcceptedHits += 1;
      incoming.incomingGateAcceptedHits += 1;
    } else {
      incoming.incomingGateRejectedHits += 1;
    }
  }
}

function collectHitApplications(
  store: InternalIndividualCombatConsequenceProjectionStore,
  records: readonly IndividualLandedHitApplicationRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    store.summaries[unitIndexForEntity(store, record.targetEntityId)]!
      .incomingAppliedHitLoss += record.appliedHitLoss;
  }
}

function collectZeroHitEvents(
  store: InternalIndividualCombatConsequenceProjectionStore,
  records: readonly IndividualZeroHitEvent[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    store.summaries[unitIndexForEntity(store, record.entityId)]!
      .incomingZeroHitTransitions += 1;
  }
}

function finalizeSummaryBooleans(
  store: InternalIndividualCombatConsequenceProjectionStore,
): void {
  for (let index = 0; index < store.summaries.length; index += 1) {
    const summary = store.summaries[index]!;
    summary.hasOutgoingEngagement =
      summary.outgoingSelectedTargets > 0 ||
      summary.outgoingAttackAttempts > 0 ||
      summary.outgoingGateAcceptedHits > 0;
    summary.hasIncomingEngagement =
      summary.incomingAttackAttempts > 0 ||
      summary.incomingPreventedAttacks > 0 ||
      summary.incomingLandedOutcomes > 0 ||
      summary.incomingGateAcceptedHits > 0 ||
      summary.incomingGateRejectedHits > 0 ||
      summary.incomingAppliedHitLoss > 0 ||
      summary.incomingZeroHitTransitions > 0;
    summary.hasFreshIndividualCombatPressure = summary.hasIncomingEngagement;
  }
}

function copyIndividualComparisonFields(
  store: InternalIndividualCombatConsequenceProjectionStore,
  summaries: readonly IndividualCombatUnitConsequenceSummary[],
): void {
  for (let index = 0; index < summaries.length; index += 1) {
    const summary = summaries[index]!;
    const comparison = store.comparisons[unitIndexForUnitId(
      store.unitIndexById,
      summary.unitId,
    )]!;
    comparison.individualOutgoingEngagement = summary.hasOutgoingEngagement;
    comparison.individualIncomingEngagement = summary.hasIncomingEngagement;
    comparison.individualAppliedHitLoss = summary.incomingAppliedHitLoss;
    comparison.individualNewlyZeroCount = summary.newlyZeroMembers;
  }
}

function collectLegacyConsequences(
  store: InternalIndividualCombatConsequenceProjectionStore,
  records: readonly CombatConsequenceApplication[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const source = store.comparisons[unitIndexForUnitId(
      store.unitIndexById,
      record.sourceUnitId,
    )]!;
    const target = store.comparisons[unitIndexForUnitId(
      store.unitIndexById,
      record.targetUnitId,
    )]!;
    source.legacyConsideredEngaged = true;
    target.legacyConsideredEngaged = true;
    target.legacyConsequenceCount += 1;
  }
}

function clearConsequenceSummaries(
  store: InternalIndividualCombatConsequenceProjectionStore,
): void {
  for (let index = 0; index < store.summaries.length; index += 1) {
    resetSummary(store.summaries[index]!, store.unitIds[index]!);
  }
}

function clearShadowComparisons(
  store: InternalIndividualCombatConsequenceProjectionStore,
): void {
  for (let index = 0; index < store.comparisons.length; index += 1) {
    resetComparison(store.comparisons[index]!, store.unitIds[index]!);
  }
}

function createMutableSummary(
  unitId: UnitId,
): MutableIndividualCombatUnitConsequenceSummary {
  return resetSummary({} as MutableIndividualCombatUnitConsequenceSummary, unitId);
}

function resetSummary(
  summary: MutableIndividualCombatUnitConsequenceSummary,
  unitId: UnitId,
): MutableIndividualCombatUnitConsequenceSummary {
  summary.unitId = unitId;
  summary.tickStartEligibleMembers = 0;
  summary.endOfTickEligibleMembers = 0;
  summary.newlyZeroMembers = 0;
  summary.outgoingSelectedTargets = 0;
  summary.outgoingAttackAttempts = 0;
  summary.outgoingInvalidatedAttempts = 0;
  summary.outgoingGateAcceptedHits = 0;
  summary.incomingAttackAttempts = 0;
  summary.incomingPreventedAttacks = 0;
  summary.incomingParries = 0;
  summary.incomingBucklerBlocks = 0;
  summary.incomingShieldBlocks = 0;
  summary.incomingLandedOutcomes = 0;
  summary.incomingGateAcceptedHits = 0;
  summary.incomingGateRejectedHits = 0;
  summary.incomingAppliedHitLoss = 0;
  summary.incomingZeroHitTransitions = 0;
  summary.hasOutgoingEngagement = false;
  summary.hasIncomingEngagement = false;
  summary.hasFreshIndividualCombatPressure = false;
  return summary;
}

function createMutableComparison(
  unitId: UnitId,
): MutableIndividualCombatShadowComparison {
  return resetComparison({} as MutableIndividualCombatShadowComparison, unitId);
}

function resetComparison(
  comparison: MutableIndividualCombatShadowComparison,
  unitId: UnitId,
): MutableIndividualCombatShadowComparison {
  comparison.unitId = unitId;
  comparison.legacyConsideredEngaged = false;
  comparison.individualOutgoingEngagement = false;
  comparison.individualIncomingEngagement = false;
  comparison.legacyConsequenceCount = 0;
  comparison.individualAppliedHitLoss = 0;
  comparison.individualNewlyZeroCount = 0;
  return comparison;
}

function unitIndexForEntity(
  store: InternalIndividualCombatConsequenceProjectionStore,
  entityId: number,
): number {
  assertEntityId(entityId, store.entityCount);
  return store.entityUnitIndexByEntity[entityId]!;
}

function unitIndexForUnitId(
  unitIndexById: ReadonlyMap<UnitId, number>,
  unitId: UnitId,
): number {
  const unitIndex = unitIndexById.get(unitId);
  if (unitIndex === undefined) {
    throw new RangeError("Unknown individual combat consequence unit ID.");
  }
  return unitIndex;
}

function validateStore(
  identityStore: UnitIdentityStore,
  store: IndividualCombatConsequenceProjectionStore,
): void {
  if (
    identityStore.entityCount !== store.entityCount ||
    identityStore.unitCount !== store.unitCount
  ) {
    throw new RangeError(
      "Individual combat consequence projection store must match identity store.",
    );
  }
}

function asInternal(
  store: IndividualCombatConsequenceProjectionStore,
): InternalIndividualCombatConsequenceProjectionStore {
  return store as InternalIndividualCombatConsequenceProjectionStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError(
      "Individual combat consequence entity ID is out of bounds.",
    );
  }
}
