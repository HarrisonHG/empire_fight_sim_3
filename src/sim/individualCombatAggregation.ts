import {
  getIndividualCombatActionState,
  type IndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "./individualCombatAction";
import {
  isIndividualCombatEligible,
  type IndividualCombatEligibilitySnapshot,
} from "./individualCombatEligibility";
import {
  getIndividualCurrentGlobalHits,
  type IndividualGlobalHitStore,
  type IndividualLandedHitApplicationRecord,
  type IndividualZeroHitEvent,
} from "./individualGlobalHits";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import {
  getIndividualGuardState,
  type IndividualMeleeDefenceRecord,
  type IndividualMeleeDefenceStore,
} from "./individualMeleeDefence";
import type { IndividualSelectedTargetRecord } from "./individualMeleeTargetSelection";
import {
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export interface IndividualCombatUnitAggregationStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface IndividualCombatUnitSummary {
  readonly unitId: UnitId;
  readonly memberCount: number;
  readonly tickStartCombatEligibleMemberCount: number;
  readonly endOfTickCombatEligibleMemberCount: number;
  readonly endOfTickZeroHitMemberCount: number;
  readonly newlyZeroHitMemberCount: number;
  readonly eligibleSelectedTargetCount: number;
  readonly eligibleCommittingAttackCount: number;
  readonly eligibleRecoveringAttackCount: number;
  readonly eligibleReadyGuardCount: number;
  readonly eligibleRecoveringGuardCount: number;
  readonly attackAttemptCount: number;
  readonly invalidatedAttackCount: number;
  readonly parryCount: number;
  readonly bucklerBlockCount: number;
  readonly shieldBlockCount: number;
  readonly landedOutcomeCount: number;
  readonly gateAcceptedHitCount: number;
  readonly gateRejectedHitCount: number;
  readonly appliedHitLoss: number;
  readonly zeroHitTransitionCount: number;
  readonly tickStartCombatCapableNumerator: number;
  readonly tickStartCombatCapableDenominator: number;
  readonly endOfTickCombatCapableNumerator: number;
  readonly endOfTickCombatCapableDenominator: number;
}

export interface IndividualCombatAggregationTickResult {
  readonly summaries: readonly IndividualCombatUnitSummary[];
}

interface MutableIndividualCombatUnitSummary
  extends IndividualCombatUnitSummary {
  unitId: UnitId;
  memberCount: number;
  tickStartCombatEligibleMemberCount: number;
  endOfTickCombatEligibleMemberCount: number;
  endOfTickZeroHitMemberCount: number;
  newlyZeroHitMemberCount: number;
  eligibleSelectedTargetCount: number;
  eligibleCommittingAttackCount: number;
  eligibleRecoveringAttackCount: number;
  eligibleReadyGuardCount: number;
  eligibleRecoveringGuardCount: number;
  attackAttemptCount: number;
  invalidatedAttackCount: number;
  parryCount: number;
  bucklerBlockCount: number;
  shieldBlockCount: number;
  landedOutcomeCount: number;
  gateAcceptedHitCount: number;
  gateRejectedHitCount: number;
  appliedHitLoss: number;
  zeroHitTransitionCount: number;
  tickStartCombatCapableNumerator: number;
  tickStartCombatCapableDenominator: number;
  endOfTickCombatCapableNumerator: number;
  endOfTickCombatCapableDenominator: number;
}

interface InternalIndividualCombatUnitAggregationStore
  extends IndividualCombatUnitAggregationStore {
  readonly unitIds: readonly UnitId[];
  readonly entityUnitIndexByEntity: Int32Array;
  readonly summaries: MutableIndividualCombatUnitSummary[];
}

export function createIndividualCombatUnitAggregationStore(
  identityStore: UnitIdentityStore,
): IndividualCombatUnitAggregationStore {
  const unitIds = getUnitIds(identityStore).slice();
  const entityUnitIndexByEntity = new Int32Array(identityStore.entityCount);
  entityUnitIndexByEntity.fill(-1);
  const summaries: MutableIndividualCombatUnitSummary[] = [];

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const members = getUnitMembers(identityStore, unitId);
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      entityUnitIndexByEntity[members[memberIndex]!] = unitIndex;
    }
    summaries.push(createMutableSummary(unitId));
  }

  return {
    entityCount: identityStore.entityCount,
    unitCount: unitIds.length,
    unitIds: Object.freeze(unitIds),
    entityUnitIndexByEntity,
    summaries,
  } as InternalIndividualCombatUnitAggregationStore;
}

export function getIndividualCombatUnitSummaries(
  store: IndividualCombatUnitAggregationStore,
): readonly IndividualCombatUnitSummary[] {
  return asInternal(store).summaries;
}

export function collectIndividualCombatUnitSummaries(
  identityStore: UnitIdentityStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  globalHitStore: IndividualGlobalHitStore,
  actionStore: IndividualCombatActionStore,
  defenceStore: IndividualMeleeDefenceStore,
  selectedTargets: readonly IndividualSelectedTargetRecord[],
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  defenceRecords: readonly IndividualMeleeDefenceRecord[],
  gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  hitApplications: readonly IndividualLandedHitApplicationRecord[],
  zeroHitEvents: readonly IndividualZeroHitEvent[],
  store: IndividualCombatUnitAggregationStore,
): IndividualCombatAggregationTickResult {
  validateInputs(
    identityStore,
    eligibility,
    globalHitStore,
    actionStore,
    defenceStore,
    store,
  );
  const internal = asInternal(store);
  clearSummaries(internal);
  collectMemberState(
    identityStore,
    eligibility,
    globalHitStore,
    actionStore,
    defenceStore,
    internal,
  );
  collectSelections(internal, eligibility, selectedTargets);
  collectAttempts(internal, attackAttempts);
  collectDefences(internal, defenceRecords);
  collectGateDecisions(internal, gateDecisions);
  collectHitApplications(internal, hitApplications);
  collectZeroHitEvents(internal, zeroHitEvents);

  return { summaries: internal.summaries };
}

function collectMemberState(
  identityStore: UnitIdentityStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  globalHitStore: IndividualGlobalHitStore,
  actionStore: IndividualCombatActionStore,
  defenceStore: IndividualMeleeDefenceStore,
  store: InternalIndividualCombatUnitAggregationStore,
): void {
  for (let unitIndex = 0; unitIndex < store.unitIds.length; unitIndex += 1) {
    const unitId = store.unitIds[unitIndex]!;
    const summary = store.summaries[unitIndex]!;
    const members = getUnitMembers(identityStore, unitId);
    summary.memberCount = members.length;
    summary.tickStartCombatCapableDenominator = members.length;
    summary.endOfTickCombatCapableDenominator = members.length;

    for (let index = 0; index < members.length; index += 1) {
      const entityId = members[index]!;
      const tickStartEligible = isIndividualCombatEligible(eligibility, entityId);
      const endOfTickEligible =
        getIndividualCurrentGlobalHits(globalHitStore, entityId) > 0;

      if (tickStartEligible) {
        summary.tickStartCombatEligibleMemberCount += 1;
        collectEligibleStateCounts(summary, actionStore, defenceStore, entityId);
      }
      if (endOfTickEligible) {
        summary.endOfTickCombatEligibleMemberCount += 1;
      } else {
        summary.endOfTickZeroHitMemberCount += 1;
      }
    }

    summary.tickStartCombatCapableNumerator =
      summary.tickStartCombatEligibleMemberCount;
    summary.endOfTickCombatCapableNumerator =
      summary.endOfTickCombatEligibleMemberCount;
  }
}

function collectEligibleStateCounts(
  summary: MutableIndividualCombatUnitSummary,
  actionStore: IndividualCombatActionStore,
  defenceStore: IndividualMeleeDefenceStore,
  entityId: number,
): void {
  const actionState = getIndividualCombatActionState(actionStore, entityId);
  if (actionState === "committingAttack") {
    summary.eligibleCommittingAttackCount += 1;
  } else if (actionState === "recoveringAttack") {
    summary.eligibleRecoveringAttackCount += 1;
  }

  const guardState = getIndividualGuardState(defenceStore, entityId);
  if (guardState === "ready") {
    summary.eligibleReadyGuardCount += 1;
  } else {
    summary.eligibleRecoveringGuardCount += 1;
  }
}

function collectSelections(
  store: InternalIndividualCombatUnitAggregationStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  records: readonly IndividualSelectedTargetRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.targetEntityId < 0) continue;
    if (!isIndividualCombatEligible(eligibility, record.sourceEntityId)) continue;
    store.summaries[unitIndexForEntity(store, record.sourceEntityId)]!
      .eligibleSelectedTargetCount += 1;
  }
}

function collectAttempts(
  store: InternalIndividualCombatUnitAggregationStore,
  records: readonly IndividualMeleeAttackAttemptRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const summary =
      store.summaries[unitIndexForEntity(store, record.attackerEntityId)]!;
    summary.attackAttemptCount += 1;
    if (record.outcome === "invalidated") {
      summary.invalidatedAttackCount += 1;
    }
  }
}

function collectDefences(
  store: InternalIndividualCombatUnitAggregationStore,
  records: readonly IndividualMeleeDefenceRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const summary =
      store.summaries[unitIndexForEntity(store, record.defenderEntityId)]!;
    if (record.outcome === "parried") summary.parryCount += 1;
    else if (record.outcome === "bucklerBlocked") summary.bucklerBlockCount += 1;
    else if (record.outcome === "shieldBlocked") summary.shieldBlockCount += 1;
    else summary.landedOutcomeCount += 1;
  }
}

function collectGateDecisions(
  store: InternalIndividualCombatUnitAggregationStore,
  records: readonly IndividualLandedHitGateDecisionRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const summary = store.summaries[unitIndexForEntity(store, record.targetEntityId)]!;
    if (record.outcome === "accepted") summary.gateAcceptedHitCount += 1;
    else summary.gateRejectedHitCount += 1;
  }
}

function collectHitApplications(
  store: InternalIndividualCombatUnitAggregationStore,
  records: readonly IndividualLandedHitApplicationRecord[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    store.summaries[unitIndexForEntity(store, record.targetEntityId)]!
      .appliedHitLoss += record.appliedHitLoss;
  }
}

function collectZeroHitEvents(
  store: InternalIndividualCombatUnitAggregationStore,
  records: readonly IndividualZeroHitEvent[],
): void {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const summary = store.summaries[unitIndexForEntity(store, record.entityId)]!;
    summary.zeroHitTransitionCount += 1;
    summary.newlyZeroHitMemberCount += 1;
  }
}

function clearSummaries(
  store: InternalIndividualCombatUnitAggregationStore,
): void {
  for (let index = 0; index < store.summaries.length; index += 1) {
    resetSummary(store.summaries[index]!, store.unitIds[index]!);
  }
}

function createMutableSummary(unitId: UnitId): MutableIndividualCombatUnitSummary {
  return resetSummary({} as MutableIndividualCombatUnitSummary, unitId);
}

function resetSummary(
  summary: MutableIndividualCombatUnitSummary,
  unitId: UnitId,
): MutableIndividualCombatUnitSummary {
  summary.unitId = unitId;
  summary.memberCount = 0;
  summary.tickStartCombatEligibleMemberCount = 0;
  summary.endOfTickCombatEligibleMemberCount = 0;
  summary.endOfTickZeroHitMemberCount = 0;
  summary.newlyZeroHitMemberCount = 0;
  summary.eligibleSelectedTargetCount = 0;
  summary.eligibleCommittingAttackCount = 0;
  summary.eligibleRecoveringAttackCount = 0;
  summary.eligibleReadyGuardCount = 0;
  summary.eligibleRecoveringGuardCount = 0;
  summary.attackAttemptCount = 0;
  summary.invalidatedAttackCount = 0;
  summary.parryCount = 0;
  summary.bucklerBlockCount = 0;
  summary.shieldBlockCount = 0;
  summary.landedOutcomeCount = 0;
  summary.gateAcceptedHitCount = 0;
  summary.gateRejectedHitCount = 0;
  summary.appliedHitLoss = 0;
  summary.zeroHitTransitionCount = 0;
  summary.tickStartCombatCapableNumerator = 0;
  summary.tickStartCombatCapableDenominator = 0;
  summary.endOfTickCombatCapableNumerator = 0;
  summary.endOfTickCombatCapableDenominator = 0;
  return summary;
}

function unitIndexForEntity(
  store: InternalIndividualCombatUnitAggregationStore,
  entityId: number,
): number {
  assertEntityId(entityId, store.entityCount);
  const unitIndex = store.entityUnitIndexByEntity[entityId]!;
  if (unitIndex < 0) {
    throw new RangeError("Entity is missing unit aggregation membership.");
  }
  return unitIndex;
}

function validateInputs(
  identityStore: UnitIdentityStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  globalHitStore: IndividualGlobalHitStore,
  actionStore: IndividualCombatActionStore,
  defenceStore: IndividualMeleeDefenceStore,
  store: IndividualCombatUnitAggregationStore,
): void {
  if (
    identityStore.entityCount !== store.entityCount ||
    eligibility.entityCount !== store.entityCount ||
    globalHitStore.entityCount !== store.entityCount ||
    actionStore.entityCount !== store.entityCount ||
    defenceStore.entityCount !== store.entityCount
  ) {
    throw new RangeError(
      "Individual combat aggregation dependencies must match entity count.",
    );
  }
  if (identityStore.unitCount !== store.unitCount) {
    throw new RangeError(
      "Individual combat aggregation store must match unit count.",
    );
  }
}

function asInternal(
  store: IndividualCombatUnitAggregationStore,
): InternalIndividualCombatUnitAggregationStore {
  return store as InternalIndividualCombatUnitAggregationStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Individual combat aggregation entity ID is out of bounds.");
  }
}
