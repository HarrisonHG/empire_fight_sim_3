import {
  getActiveCasualtyDragGroups,
  type CasualtyAssistanceDecisionResult,
  type CasualtyDragGroupStore,
} from "./individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  getIndividualRespawnEgressInspection,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import {
  getIndividualCasualtyHistoryInspection as getDeathCountHistory,
  type IndividualDeathCountStore,
} from "./individualDeathCount";
import {
  getIndividualExecutionHistoryInspection,
  type IndividualExecutionActionResult,
  type IndividualExecutionActionStore,
} from "./individualExecutionAction";
import {
  getIndividualCurrentGenericHerbs,
  getIndividualReservedGenericHerbs,
  type IndividualGenericHerbStore,
} from "./individualMedicalProfile";
import {
  getIndividualMedicalClaimedPatientEntityId,
  hasIndividualMedicalPatientClaim,
  type IndividualMedicalClaimResult,
  type IndividualMedicalClaimStore,
} from "./individualMedicalClaims";
import {
  isIndividualTraumaWithdrawalActive,
  type IndividualMedicalUrgencyStore,
} from "./individualMedicalReadModel";
import {
  INDIVIDUAL_TREATMENT_TOUCH_RANGE,
  getIndividualTreatmentActionInspection,
  isIndividualReceivingTreatment,
  isIndividualTreating,
  type IndividualTreatmentActionKind,
  type IndividualTreatmentActionResult,
  type IndividualTreatmentActionStore,
} from "./individualTreatmentAction";
import {
  getIndividualTraumaticWoundInspection,
  hasActiveIndividualTraumaticWound,
  type IndividualTraumaticWoundStore,
} from "./individualTraumaticWound";
import type { IndividualRespawnEgressResult } from "./individualRespawnEgress";
import {
  getUnitIdForEntity,
  getUnitIds,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import type { WorldState } from "./types";

export interface IndividualCasualtyHistoryStore {
  readonly entityCount: number;
}

interface InternalIndividualCasualtyHistoryStore extends IndividualCasualtyHistoryStore {
  readonly wasDraggedByEntity: Uint8Array;
  readonly firstDragTickByEntity: Float64Array;
  readonly dragPatientEpisodeCountByEntity: Uint32Array;
  readonly dragHelperParticipationCountByEntity: Uint32Array;
  readonly handoffCountByEntity: Uint32Array;
  readonly treatmentStartedCountByPatient: Uint32Array;
  readonly treatmentCompletedCountByPatient: Uint32Array;
  readonly treatmentInterruptedCountByPatient: Uint32Array;
  readonly treatmentStartedCountByHealer: Uint32Array;
  readonly treatmentCompletedCountByHealer: Uint32Array;
  readonly treatmentInterruptedCountByHealer: Uint32Array;
  readonly hitRestorationCountByEntity: Uint32Array;
  readonly traumaticWoundTreatmentCountByEntity: Uint32Array;
  readonly limbTreatmentCountByEntity: Uint32Array;
  readonly herbsConsumedCountByEntity: Uint32Array;
  readonly executionTargetedCountByEntity: Uint32Array;
  readonly executionTargetInterruptionCountByEntity: Uint32Array;
  lastRecordedTick: number;
}

export interface IndividualCasualtyHistoryInspection {
  readonly firstZeroHitTick: number;
  readonly latestZeroHitTick: number;
  readonly dyingTransitionCount: number;
  readonly terminalTick: number;
  readonly terminalCause: "none" | "deathCountExpired" | "execution";
  readonly terminalX: number;
  readonly terminalY: number;
  readonly wasDragged: boolean;
  readonly firstDragTick: number;
  readonly dragPatientEpisodeCount: number;
  readonly dragHelperParticipationCount: number;
  readonly handoffCount: number;
  readonly treatmentStartedCount: number;
  readonly treatmentCompletedCount: number;
  readonly treatmentInterruptedCount: number;
  readonly treatmentPerformedStartedCount: number;
  readonly treatmentPerformedCompletedCount: number;
  readonly treatmentPerformedInterruptedCount: number;
  readonly hitRestorationCount: number;
  readonly traumaticWoundEpisodeCount: number;
  readonly latestTraumaticWoundTick: number;
  readonly traumaticWoundTreatmentCount: number;
  readonly limbTreatmentCount: number;
  readonly executionStartedCount: number;
  readonly executionCompletedCount: number;
  readonly executionInterruptedCount: number;
  readonly executionTargetedCount: number;
  readonly executionTargetInterruptionCount: number;
  readonly terminalizedByExecutionCount: number;
  readonly comfortStartedCount: number;
  readonly comfortCompletedTick: number;
  readonly respawnEgressStartedTick: number;
  readonly waitingAtRespawnArrivalTick: number;
  readonly waitingAtRespawnArrivalX: number;
  readonly waitingAtRespawnArrivalY: number;
  readonly genericHerbsConsumedCount: number;
}

export interface IndividualCasualtyHistoryTickRecords {
  readonly assistance: CasualtyAssistanceDecisionResult;
  readonly claims: IndividualMedicalClaimResult;
  readonly treatment: IndividualTreatmentActionResult;
  readonly execution: IndividualExecutionActionResult;
  readonly egress: IndividualRespawnEgressResult;
}

export function createIndividualCasualtyHistoryStore(
  entityCount: number,
): IndividualCasualtyHistoryStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const firstDragTickByEntity = new Float64Array(entityCount);
  firstDragTickByEntity.fill(-1);
  return {
    entityCount,
    wasDraggedByEntity: new Uint8Array(entityCount),
    firstDragTickByEntity,
    dragPatientEpisodeCountByEntity: new Uint32Array(entityCount),
    dragHelperParticipationCountByEntity: new Uint32Array(entityCount),
    handoffCountByEntity: new Uint32Array(entityCount),
    treatmentStartedCountByPatient: new Uint32Array(entityCount),
    treatmentCompletedCountByPatient: new Uint32Array(entityCount),
    treatmentInterruptedCountByPatient: new Uint32Array(entityCount),
    treatmentStartedCountByHealer: new Uint32Array(entityCount),
    treatmentCompletedCountByHealer: new Uint32Array(entityCount),
    treatmentInterruptedCountByHealer: new Uint32Array(entityCount),
    hitRestorationCountByEntity: new Uint32Array(entityCount),
    traumaticWoundTreatmentCountByEntity: new Uint32Array(entityCount),
    limbTreatmentCountByEntity: new Uint32Array(entityCount),
    herbsConsumedCountByEntity: new Uint32Array(entityCount),
    executionTargetedCountByEntity: new Uint32Array(entityCount),
    executionTargetInterruptionCountByEntity: new Uint32Array(entityCount),
    lastRecordedTick: -1,
  } as InternalIndividualCasualtyHistoryStore;
}

export function recordIndividualCasualtyHistoryOneTick(
  store: IndividualCasualtyHistoryStore,
  tick: number,
  records: IndividualCasualtyHistoryTickRecords,
): void {
  const internal = asHistoryInternal(store);
  assertNonNegativeSafeInteger(tick, "history tick");
  if (tick <= internal.lastRecordedTick) {
    throw new RangeError("Casualty history must be recorded exactly once in increasing tick order.");
  }
  for (const record of records.assistance.groupStartedRecords) {
    assertCurrentRecord(record.patientEntityId, record.tick, tick, internal.entityCount);
    internal.wasDraggedByEntity[record.patientEntityId] = 1;
    if (internal.firstDragTickByEntity[record.patientEntityId] === -1) {
      internal.firstDragTickByEntity[record.patientEntityId] = tick;
    }
    increment(internal.dragPatientEpisodeCountByEntity, record.patientEntityId, "drag patient episode count");
    for (const helperEntityId of record.helperEntityIds) {
      assertEntityId(helperEntityId, internal.entityCount);
      increment(internal.dragHelperParticipationCountByEntity, helperEntityId, "drag helper participation count");
    }
  }
  for (const record of records.claims.handoffRecords) {
    assertCurrentRecord(record.patientEntityId, record.tick, tick, internal.entityCount);
    increment(internal.handoffCountByEntity, record.patientEntityId, "medical handoff count");
  }
  for (const record of records.treatment.startedRecords) {
    assertTreatmentRecord(record.healerEntityId, record.patientEntityId, record.tick, tick, internal.entityCount);
    increment(internal.treatmentStartedCountByPatient, record.patientEntityId, "patient treatment start count");
    increment(internal.treatmentStartedCountByHealer, record.healerEntityId, "healer treatment start count");
  }
  for (const record of records.treatment.interruptedRecords) {
    assertTreatmentRecord(record.healerEntityId, record.patientEntityId, record.tick, tick, internal.entityCount);
    increment(internal.treatmentInterruptedCountByPatient, record.patientEntityId, "patient treatment interruption count");
    increment(internal.treatmentInterruptedCountByHealer, record.healerEntityId, "healer treatment interruption count");
  }
  for (const record of records.treatment.completedRecords) {
    assertTreatmentRecord(record.healerEntityId, record.patientEntityId, record.tick, tick, internal.entityCount);
    increment(internal.treatmentCompletedCountByPatient, record.patientEntityId, "patient treatment completion count");
    increment(internal.treatmentCompletedCountByHealer, record.healerEntityId, "healer treatment completion count");
    if (record.hitRestoration !== undefined) {
      increment(internal.hitRestorationCountByEntity, record.patientEntityId, "hit restoration count");
    }
    if (record.traumaCleared) {
      increment(internal.traumaticWoundTreatmentCountByEntity, record.patientEntityId, "traumatic-wound treatment count");
    }
    if (record.clearedLimbDisability !== "none") {
      increment(internal.limbTreatmentCountByEntity, record.patientEntityId, "limb treatment count");
    }
    if (record.consumedGenericHerbs > 0) {
      increment(internal.herbsConsumedCountByEntity, record.healerEntityId, "generic herbs consumed count");
    }
  }
  for (const record of records.execution.startedRecords) {
    assertTreatmentRecord(record.executorEntityId, record.targetEntityId, record.tick, tick, internal.entityCount);
    increment(internal.executionTargetedCountByEntity, record.targetEntityId, "execution target count");
  }
  for (const record of records.execution.completedRecords) {
    assertTreatmentRecord(record.executorEntityId, record.targetEntityId, record.tick, tick, internal.entityCount);
  }
  for (const record of records.execution.interruptedRecords) {
    assertTreatmentRecord(record.executorEntityId, record.targetEntityId, record.tick, tick, internal.entityCount);
    increment(internal.executionTargetInterruptionCountByEntity, record.targetEntityId, "execution target interruption count");
  }
  validateEgressRecords(records.egress, tick, internal.entityCount);
  internal.lastRecordedTick = tick;
}

export function getIndividualCasualtyHistoryInspection(
  store: IndividualCasualtyHistoryStore,
  deathCounts: IndividualDeathCountStore,
  trauma: IndividualTraumaticWoundStore,
  execution: IndividualExecutionActionStore,
  presence: IndividualPlayerPresenceStore,
  entityId: number,
): IndividualCasualtyHistoryInspection {
  const internal = asHistoryInternal(store);
  validateEntityCounts(internal.entityCount, deathCounts, trauma, execution, presence);
  assertEntityId(entityId, internal.entityCount);
  const death = getDeathCountHistory(deathCounts, entityId);
  const wound = getIndividualTraumaticWoundInspection(trauma, entityId);
  const executionHistory = getIndividualExecutionHistoryInspection(execution, entityId);
  const egress = getIndividualRespawnEgressInspection(presence, entityId);
  return {
    firstZeroHitTick: death.firstZeroHitTick,
    latestZeroHitTick: death.latestZeroHitTick,
    dyingTransitionCount: death.dyingTransitionCount,
    terminalTick: death.terminalTick,
    terminalCause: death.terminalCause,
    terminalX: death.terminalX,
    terminalY: death.terminalY,
    wasDragged: internal.wasDraggedByEntity[entityId] !== 0,
    firstDragTick: internal.firstDragTickByEntity[entityId]!,
    dragPatientEpisodeCount: internal.dragPatientEpisodeCountByEntity[entityId]!,
    dragHelperParticipationCount: internal.dragHelperParticipationCountByEntity[entityId]!,
    handoffCount: internal.handoffCountByEntity[entityId]!,
    treatmentStartedCount: internal.treatmentStartedCountByPatient[entityId]!,
    treatmentCompletedCount: internal.treatmentCompletedCountByPatient[entityId]!,
    treatmentInterruptedCount: internal.treatmentInterruptedCountByPatient[entityId]!,
    treatmentPerformedStartedCount: internal.treatmentStartedCountByHealer[entityId]!,
    treatmentPerformedCompletedCount: internal.treatmentCompletedCountByHealer[entityId]!,
    treatmentPerformedInterruptedCount: internal.treatmentInterruptedCountByHealer[entityId]!,
    hitRestorationCount: internal.hitRestorationCountByEntity[entityId]!,
    traumaticWoundEpisodeCount: wound.episodeCount,
    latestTraumaticWoundTick: wound.latestEpisodeTick,
    traumaticWoundTreatmentCount: internal.traumaticWoundTreatmentCountByEntity[entityId]!,
    limbTreatmentCount: internal.limbTreatmentCountByEntity[entityId]!,
    executionStartedCount: executionHistory.startedCount,
    executionCompletedCount: executionHistory.completedCount,
    executionInterruptedCount: executionHistory.interruptedCount,
    executionTargetedCount: internal.executionTargetedCountByEntity[entityId]!,
    executionTargetInterruptionCount:
      internal.executionTargetInterruptionCountByEntity[entityId]!,
    terminalizedByExecutionCount: executionHistory.terminalizedAsTargetCount,
    comfortStartedCount: death.comfortStartedCount,
    comfortCompletedTick: death.comfortCompletedTick,
    respawnEgressStartedTick: egress.egressStartedTick,
    waitingAtRespawnArrivalTick: egress.waitingArrivalTick,
    waitingAtRespawnArrivalX: egress.waitingArrivalX,
    waitingAtRespawnArrivalY: egress.waitingArrivalY,
    genericHerbsConsumedCount: internal.herbsConsumedCountByEntity[entityId]!,
  };
}

export function getIndividualGenericHerbsConsumedHistory(
  store: IndividualCasualtyHistoryStore,
  entityId: number,
): number {
  const internal = asHistoryInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.herbsConsumedCountByEntity[entityId]!;
}

export interface IndividualCasualtyUnitSummaryStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface IndividualCasualtyUnitSummary {
  readonly unitId: UnitId;
  readonly memberCount: number;
  readonly activeCharacterCount: number;
  readonly dyingCharacterCount: number;
  readonly terminalCharacterCount: number;
  readonly downedPresenceCount: number;
  readonly activeDragHelperCount: number;
  readonly draggedPatientCount: number;
  readonly claimedMedicalSupportCount: number;
  readonly approachingMedicalSupportCount: number;
  readonly patientsUnderTreatmentCount: number;
  readonly activeTraumaticWoundCount: number;
  readonly traumaWithdrawalCount: number;
  readonly treatmentCompletionCount: number;
  readonly chirurgeonDyingCompletionCount: number;
  readonly missingHitCompletionCount: number;
  readonly traumaticWoundCompletionCount: number;
  readonly limbWithHerbCompletionCount: number;
  readonly limbWithoutHerbCompletionCount: number;
  readonly terminalComfortCompletionCount: number;
  readonly terminalTransitionCount: number;
  readonly executionStartedCount: number;
  readonly executionCompletedCount: number;
  readonly executionInterruptedCount: number;
  readonly terminalAwaitingComfortCount: number;
  readonly activeTerminalComfortActionCount: number;
  readonly terminalComfortedCount: number;
  readonly respawnEgressCount: number;
  readonly waitingAtRespawnCount: number;
  readonly currentGenericHerbCount: number;
  readonly reservedGenericHerbCount: number;
  readonly genericHerbsConsumedThisTick: number;
  readonly genericHerbsConsumedHistory: number;
}

type MutableIndividualCasualtyUnitSummary = {
  -readonly [Key in keyof IndividualCasualtyUnitSummary]: IndividualCasualtyUnitSummary[Key];
};

interface InternalIndividualCasualtyUnitSummaryStore extends IndividualCasualtyUnitSummaryStore {
  readonly unitIds: readonly UnitId[];
  readonly unitIndexByEntity: Int32Array;
  readonly summaries: MutableIndividualCasualtyUnitSummary[];
}

export interface IndividualCasualtyUnitSummaryDependencies {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly lifecycle: IndividualCasualtyLifecycleStore;
  readonly presence: IndividualPlayerPresenceStore;
  readonly assistanceGroups: CasualtyDragGroupStore;
  readonly claims: IndividualMedicalClaimStore;
  readonly treatments: IndividualTreatmentActionStore;
  readonly trauma: IndividualTraumaticWoundStore;
  readonly urgency: IndividualMedicalUrgencyStore;
  readonly herbs: IndividualGenericHerbStore;
  readonly history: IndividualCasualtyHistoryStore;
  readonly treatmentResult: IndividualTreatmentActionResult;
  readonly executionResult: IndividualExecutionActionResult;
  readonly terminalTransitions: readonly { readonly entityId: number }[];
}

export function createIndividualCasualtyUnitSummaryStore(
  identity: UnitIdentityStore,
): IndividualCasualtyUnitSummaryStore {
  const unitIds = getUnitIds(identity).slice();
  const unitIndexByEntity = new Int32Array(identity.entityCount);
  const unitIndexById = new Map<UnitId, number>();
  const summaries: MutableIndividualCasualtyUnitSummary[] = [];
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    unitIndexById.set(unitIds[unitIndex]!, unitIndex);
    summaries.push(createSummary(unitIds[unitIndex]!));
  }
  for (let entityId = 0; entityId < identity.entityCount; entityId += 1) {
    unitIndexByEntity[entityId] = unitIndexById.get(
      getUnitIdForEntity(identity, entityId),
    )!;
  }
  return {
    entityCount: identity.entityCount,
    unitCount: identity.unitCount,
    unitIds: Object.freeze(unitIds),
    unitIndexByEntity,
    summaries,
  } as InternalIndividualCasualtyUnitSummaryStore;
}

export function getIndividualCasualtyUnitSummaries(
  store: IndividualCasualtyUnitSummaryStore,
): readonly IndividualCasualtyUnitSummary[] {
  return asSummaryInternal(store).summaries;
}

export function collectIndividualCasualtyUnitSummaries(
  store: IndividualCasualtyUnitSummaryStore,
  dependencies: IndividualCasualtyUnitSummaryDependencies,
): readonly IndividualCasualtyUnitSummary[] {
  const internal = asSummaryInternal(store);
  validateSummaryCounts(internal, dependencies);
  for (let unitIndex = 0; unitIndex < internal.summaries.length; unitIndex += 1) {
    resetSummary(internal.summaries[unitIndex]!, internal.unitIds[unitIndex]!);
  }
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const summary = summaryForEntity(internal, entityId);
    summary.memberCount += 1;
    const lifecycle = getIndividualCharacterLifecycleState(dependencies.lifecycle, entityId);
    if (lifecycle === "active") summary.activeCharacterCount += 1;
    else if (lifecycle === "dying") summary.dyingCharacterCount += 1;
    else summary.terminalCharacterCount += 1;
    const presence = getIndividualPlayerPresenceState(dependencies.presence, entityId);
    if (presence === "downedPresence") summary.downedPresenceCount += 1;
    else if (presence === "terminalAwaitingComfort") summary.terminalAwaitingComfortCount += 1;
    else if (presence === "terminalComforted") summary.terminalComfortedCount += 1;
    else if (presence === "respawnEgress") summary.respawnEgressCount += 1;
    else if (presence === "waitingAtRespawn") summary.waitingAtRespawnCount += 1;
    if (hasIndividualMedicalPatientClaim(dependencies.claims, entityId)) {
      summary.claimedMedicalSupportCount += 1;
      if (!isIndividualTreating(dependencies.treatments, entityId)) {
        const patientEntityId = getIndividualMedicalClaimedPatientEntityId(
          dependencies.claims, entityId,
        );
        const dx = dependencies.world.positionsX[entityId]! -
          dependencies.world.positionsX[patientEntityId]!;
        const dy = dependencies.world.positionsY[entityId]! -
          dependencies.world.positionsY[patientEntityId]!;
        if (dx * dx + dy * dy > INDIVIDUAL_TREATMENT_TOUCH_RANGE ** 2) {
          summary.approachingMedicalSupportCount += 1;
        }
      }
    }
    if (isIndividualReceivingTreatment(dependencies.treatments, entityId)) {
      summary.patientsUnderTreatmentCount += 1;
    }
    if (isIndividualTreating(dependencies.treatments, entityId)) {
      const treatment = getIndividualTreatmentActionInspection(
        dependencies.treatments, entityId,
      );
      if (treatment?.kind === "physickTerminalComfort") {
        summary.activeTerminalComfortActionCount += 1;
      }
    }
    const hasActiveTrauma = hasActiveIndividualTraumaticWound(
      dependencies.trauma, entityId,
    );
    if (hasActiveTrauma) {
      summary.activeTraumaticWoundCount += 1;
    }
    if (hasActiveTrauma &&
      isIndividualTraumaWithdrawalActive(dependencies.urgency, entityId)) {
      summary.traumaWithdrawalCount += 1;
    }
    summary.currentGenericHerbCount += getIndividualCurrentGenericHerbs(
      dependencies.herbs, entityId,
    );
    summary.reservedGenericHerbCount += getIndividualReservedGenericHerbs(
      dependencies.herbs, entityId,
    );
    summary.genericHerbsConsumedHistory += getIndividualGenericHerbsConsumedHistory(
      dependencies.history, entityId,
    );
  }
  for (const group of getActiveCasualtyDragGroups(dependencies.assistanceGroups)) {
    for (const helperEntityId of group.helperEntityIds) {
      summaryForEntity(internal, helperEntityId).activeDragHelperCount += 1;
    }
    if (group.phase === "dragging") {
      summaryForEntity(internal, group.patientEntityId).draggedPatientCount += 1;
    }
  }
  for (const record of dependencies.treatmentResult.completedRecords) {
    const summary = summaryForEntity(internal, record.patientEntityId);
    summary.treatmentCompletionCount += 1;
    incrementTreatmentKind(summary, record.kind);
    summaryForEntity(internal, record.healerEntityId).genericHerbsConsumedThisTick +=
      record.consumedGenericHerbs;
  }
  for (const transition of dependencies.terminalTransitions) {
    summaryForEntity(internal, transition.entityId).terminalTransitionCount += 1;
  }
  for (const record of dependencies.executionResult.startedRecords) {
    summaryForEntity(internal, record.executorEntityId).executionStartedCount += 1;
  }
  for (const record of dependencies.executionResult.completedRecords) {
    summaryForEntity(internal, record.executorEntityId).executionCompletedCount += 1;
  }
  for (const record of dependencies.executionResult.interruptedRecords) {
    summaryForEntity(internal, record.executorEntityId).executionInterruptedCount += 1;
  }
  return internal.summaries;
}

function incrementTreatmentKind(
  summary: MutableIndividualCasualtyUnitSummary,
  kind: IndividualTreatmentActionKind,
): void {
  if (kind === "chirurgeonDying") summary.chirurgeonDyingCompletionCount += 1;
  else if (kind === "physickRestoreGlobalHit") summary.missingHitCompletionCount += 1;
  else if (kind === "physickTraumaticWound") summary.traumaticWoundCompletionCount += 1;
  else if (kind === "physickLimbWithHerb") summary.limbWithHerbCompletionCount += 1;
  else if (kind === "physickLimbWithoutHerb") summary.limbWithoutHerbCompletionCount += 1;
  else summary.terminalComfortCompletionCount += 1;
}

function validateEgressRecords(
  records: IndividualRespawnEgressResult,
  tick: number,
  entityCount: number,
): void {
  for (const record of records.movementRecords) {
    assertCurrentRecord(record.entityId, record.tick, tick, entityCount);
  }
  for (const record of records.arrivalRecords) {
    assertCurrentRecord(record.entityId, record.tick, tick, entityCount);
  }
}

function createSummary(unitId: UnitId): MutableIndividualCasualtyUnitSummary {
  return resetSummary({} as MutableIndividualCasualtyUnitSummary, unitId);
}

function resetSummary(
  summary: MutableIndividualCasualtyUnitSummary,
  unitId: UnitId,
): MutableIndividualCasualtyUnitSummary {
  summary.unitId = unitId;
  for (const key of SUMMARY_NUMBER_KEYS) summary[key] = 0;
  return summary;
}

const SUMMARY_NUMBER_KEYS = [
  "memberCount", "activeCharacterCount", "dyingCharacterCount",
  "terminalCharacterCount", "downedPresenceCount", "activeDragHelperCount",
  "draggedPatientCount", "claimedMedicalSupportCount",
  "approachingMedicalSupportCount", "patientsUnderTreatmentCount",
  "activeTraumaticWoundCount", "traumaWithdrawalCount",
  "treatmentCompletionCount", "chirurgeonDyingCompletionCount",
  "missingHitCompletionCount", "traumaticWoundCompletionCount",
  "limbWithHerbCompletionCount", "limbWithoutHerbCompletionCount",
  "terminalComfortCompletionCount", "terminalTransitionCount",
  "executionStartedCount", "executionCompletedCount", "executionInterruptedCount",
  "terminalAwaitingComfortCount", "activeTerminalComfortActionCount",
  "terminalComfortedCount", "respawnEgressCount", "waitingAtRespawnCount",
  "currentGenericHerbCount", "reservedGenericHerbCount",
  "genericHerbsConsumedThisTick", "genericHerbsConsumedHistory",
] as const satisfies readonly (Exclude<keyof IndividualCasualtyUnitSummary, "unitId">)[];

function summaryForEntity(
  store: InternalIndividualCasualtyUnitSummaryStore,
  entityId: number,
): MutableIndividualCasualtyUnitSummary {
  assertEntityId(entityId, store.entityCount);
  return store.summaries[store.unitIndexByEntity[entityId]!]!;
}

function validateSummaryCounts(
  store: InternalIndividualCasualtyUnitSummaryStore,
  dependencies: IndividualCasualtyUnitSummaryDependencies,
): void {
  const sources = [
    dependencies.world, dependencies.identity, dependencies.lifecycle,
    dependencies.presence, dependencies.assistanceGroups, dependencies.claims,
    dependencies.treatments, dependencies.trauma, dependencies.urgency,
    dependencies.herbs, dependencies.history,
  ];
  if (sources.some((source) => source.entityCount !== store.entityCount) ||
    dependencies.identity.unitCount !== store.unitCount) {
    throw new RangeError("Casualty unit summary dependencies must match entity and unit counts.");
  }
}

function assertTreatmentRecord(
  firstEntityId: number,
  secondEntityId: number,
  recordTick: number,
  tick: number,
  entityCount: number,
): void {
  assertCurrentRecord(firstEntityId, recordTick, tick, entityCount);
  assertEntityId(secondEntityId, entityCount);
}

function assertCurrentRecord(
  entityId: number,
  recordTick: number,
  tick: number,
  entityCount: number,
): void {
  assertEntityId(entityId, entityCount);
  if (recordTick !== tick) throw new Error("Casualty history accepts current-tick records only.");
}

function validateEntityCounts(
  entityCount: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  if (stores.some((store) => store.entityCount !== entityCount)) {
    throw new RangeError("Casualty history dependencies must match entity count.");
  }
}

function increment(array: Uint32Array, entityId: number, label: string): void {
  const value = array[entityId]!;
  if (value === 0xffff_ffff) throw new RangeError(`${label} overflowed.`);
  array[entityId] = value + 1;
}

function asHistoryInternal(store: IndividualCasualtyHistoryStore): InternalIndividualCasualtyHistoryStore {
  return store as InternalIndividualCasualtyHistoryStore;
}

function asSummaryInternal(store: IndividualCasualtyUnitSummaryStore): InternalIndividualCasualtyUnitSummaryStore {
  return store as InternalIndividualCasualtyUnitSummaryStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Casualty consolidation entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}
