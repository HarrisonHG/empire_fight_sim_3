import {
  CASUALTY_DRAG_PICKUP_RANGE,
  isIndividualAtTreatmentPosition,
  releaseIndividualTreatmentPositionReservation,
  type IndividualCasualtyAssistanceStore,
} from "./individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  transitionIndividualTerminalAwaitingComfortToComforted,
  transitionIndividualDyingToActive,
  type IndividualCasualtyLifecycleStore,
  type IndividualDyingRestorationRecord,
  type IndividualPlayerPresenceStore,
  type IndividualTerminalComfortTransitionRecord,
} from "./individualCasualtyLifecycle";
import {
  getIndividualCombatActionState,
  type IndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "./individualCombatAction";
import {
  pauseIndividualDeathCount,
  releaseIndividualDeathCountPause,
  resumeIndividualDeathCount,
  recordIndividualTerminalComfortCompleted,
  recordIndividualTerminalComfortStarted,
  type IndividualDeathCountPauseSource,
  type IndividualDeathCountStore,
} from "./individualDeathCount";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
  restoreIndividualGlobalHits,
  type IndividualGlobalHitRestorationRecord,
  type IndividualGlobalHitStore,
} from "./individualGlobalHits";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import {
  clearIndividualMedicalClaimCommitmentDefenceOverride,
  getIndividualMedicalClaimInspection,
  getIndividualMedicalClaimedPatientEntityId,
  getIndividualMedicalClaimNeed,
  isIndividualMedicalClaimOwnedBy,
  releaseIndividualMedicalClaim,
  type IndividualMedicalClaimStore,
} from "./individualMedicalClaims";
import {
  consumeIndividualGenericHerbTreatmentReservation,
  getIndividualAvailableGenericHerbs,
  getTrustedIndividualMedicalProfile,
  releaseIndividualGenericHerbTreatmentReservation,
  reserveIndividualGenericHerbForTreatment,
  type IndividualGenericHerbStore,
  type TrustedIndividualMedicalProfileStore,
} from "./individualMedicalProfile";
import { setIndividualOrdinaryParticipationEligible, type IndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import {
  clearIndividualTraumaticWound,
  getIndividualTraumaticWoundInspection,
  type IndividualTraumaticWoundStore,
} from "./individualTraumaticWound";
import {
  clearIndividualLimbDisability,
  getHighestPriorityIndividualLimbDisability,
  hasIndividualLimbDisability,
  type IndividualLimbDisabilityKind,
  type IndividualLimbDisabilityStore,
} from "./individualLimbDisability";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import { getUnitIdForEntity, type UnitIdentityStore } from "./unitIdentity";
import type { WorldState } from "./types";

export const CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS = 600;
export const PHYSICK_LIMB_NO_HERB_TREATMENT_PROGRESS_TICKS = 2_400;
export const PHYSICK_TERMINAL_COMFORT_PROGRESS_TICKS = 2_400;
export const INDIVIDUAL_TREATMENT_TOUCH_RANGE = CASUALTY_DRAG_PICKUP_RANGE;

export type IndividualTreatmentActionKind =
  | "chirurgeonDying"
  | "physickRestoreGlobalHit"
  | "physickTraumaticWound"
  | "physickLimbWithHerb"
  | "physickLimbWithoutHerb"
  | "physickTerminalComfort";
export type IndividualTreatmentInterruptionReason =
  | "healerAttackAttempt"
  | "patientAttackAttempt"
  | "healerAcceptedHit"
  | "patientAcceptedHit"
  | "rangeLost"
  | "patientLifecycleIncompatible"
  | "healerIncapacity"
  | "healerRouting"
  | "healerTrauma"
  | "patientNoLongerNeedsAction"
  | "claimLost"
  | "patientTerminalExecution";

interface ActiveTreatmentAction {
  readonly actionId: number;
  readonly kind: IndividualTreatmentActionKind;
  readonly healerEntityId: number;
  readonly patientEntityId: number;
  readonly startedTick: number;
  readonly reservedGenericHerbs: 0 | 1;
  readonly selectedLimbDisability: IndividualLimbDisabilityKind | "none";
  readonly requiredProgressTicks: number;
  progressTicks: number;
  lastProcessedTick: number;
}

export interface IndividualTreatmentActionStore { readonly entityCount: number; }
interface InternalTreatmentActionStore extends IndividualTreatmentActionStore {
  readonly activeActions: ActiveTreatmentAction[];
  readonly actionIndexByHealer: Int32Array;
  readonly actionIndexByPatient: Int32Array;
  readonly attackAttemptTickByEntity: Float64Array;
  readonly acceptedHitTickByEntity: Float64Array;
  readonly startedCountByEntity: Uint32Array;
  readonly interruptedCountByEntity: Uint32Array;
  readonly completedCountByEntity: Uint32Array;
  readonly restoredHitCountByEntity: Uint32Array;
  readonly clearedTraumaCountByEntity: Uint32Array;
  readonly clearedLimbCountByEntity: Uint32Array;
  readonly actionBoundaryTickByHealer: Float64Array;
  nextActionId: number;
}

export interface IndividualTreatmentActionInspection {
  readonly actionId: number;
  readonly kind: IndividualTreatmentActionKind;
  readonly healerEntityId: number;
  readonly patientEntityId: number;
  readonly startedTick: number;
  readonly progressTicks: number;
  readonly requiredProgressTicks: number;
  readonly reservedGenericHerbs: 0 | 1;
  readonly selectedLimbDisability: IndividualLimbDisabilityKind | "none";
}

export interface IndividualTreatmentStartedRecord extends IndividualTreatmentActionInspection {
  readonly tick: number;
}
export interface IndividualTreatmentInterruptedRecord extends IndividualTreatmentActionInspection {
  readonly tick: number;
  readonly reason: IndividualTreatmentInterruptionReason;
  readonly progressTicksLost: number;
  readonly releasedGenericHerbs: 0 | 1;
}
export interface IndividualTreatmentCompletedRecord extends IndividualTreatmentActionInspection {
  readonly tick: number;
  readonly hitRestoration?: IndividualGlobalHitRestorationRecord;
  readonly lifecycleRestoration?: IndividualDyingRestorationRecord;
  readonly traumaCleared: boolean;
  readonly clearedLimbDisability: IndividualLimbDisabilityKind | "none";
  readonly consumedGenericHerbs: 0 | 1;
  readonly comfortTransition?: IndividualTerminalComfortTransitionRecord;
}

export interface IndividualTreatmentReassessmentRequest {
  readonly actionId: number;
  readonly healerEntityId: number;
  readonly previousPatientEntityId: number;
  readonly tick: number;
  readonly boundary: "completed" | "interrupted";
}

export interface IndividualTreatmentHistoryInspection {
  readonly startedCount: number;
  readonly interruptedCount: number;
  readonly completedCount: number;
  readonly restoredHitCount: number;
  readonly clearedTraumaCount: number;
  readonly clearedLimbCount: number;
}

export interface IndividualTreatmentActionBuffers {
  readonly startedRecords: IndividualTreatmentStartedRecord[];
  readonly interruptedRecords: IndividualTreatmentInterruptedRecord[];
  readonly completedRecords: IndividualTreatmentCompletedRecord[];
  readonly reassessmentRequests: IndividualTreatmentReassessmentRequest[];
}
export interface IndividualTreatmentActionResult {
  readonly startedRecords: readonly IndividualTreatmentStartedRecord[];
  readonly interruptedRecords: readonly IndividualTreatmentInterruptedRecord[];
  readonly completedRecords: readonly IndividualTreatmentCompletedRecord[];
  readonly reassessmentRequests: readonly IndividualTreatmentReassessmentRequest[];
  readonly activeActionCount: number;
  readonly progressedActionCount: number;
}

const NONE = -1;

export function createIndividualTreatmentActionStore(entityCount: number): IndividualTreatmentActionStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const actionIndexByHealer = new Int32Array(entityCount); actionIndexByHealer.fill(NONE);
  const actionIndexByPatient = new Int32Array(entityCount); actionIndexByPatient.fill(NONE);
  const attackAttemptTickByEntity = new Float64Array(entityCount); attackAttemptTickByEntity.fill(NONE);
  const acceptedHitTickByEntity = new Float64Array(entityCount); acceptedHitTickByEntity.fill(NONE);
  const actionBoundaryTickByHealer = new Float64Array(entityCount);
  actionBoundaryTickByHealer.fill(NONE);
  return {
    entityCount,
    activeActions: [],
    actionIndexByHealer,
    actionIndexByPatient,
    attackAttemptTickByEntity,
    acceptedHitTickByEntity,
    startedCountByEntity: new Uint32Array(entityCount),
    interruptedCountByEntity: new Uint32Array(entityCount),
    completedCountByEntity: new Uint32Array(entityCount),
    restoredHitCountByEntity: new Uint32Array(entityCount),
    clearedTraumaCountByEntity: new Uint32Array(entityCount),
    clearedLimbCountByEntity: new Uint32Array(entityCount),
    actionBoundaryTickByHealer,
    nextActionId: 0,
  } as InternalTreatmentActionStore;
}

export function createIndividualTreatmentActionBuffers(): IndividualTreatmentActionBuffers {
  return {
    startedRecords: [],
    interruptedRecords: [],
    completedRecords: [],
    reassessmentRequests: [],
  };
}

export function getIndividualTreatmentActionInspection(
  store: IndividualTreatmentActionStore,
  entityId: number,
): IndividualTreatmentActionInspection | undefined {
  const internal = asInternal(store); assertEntityId(entityId, internal.entityCount);
  const healerIndex = internal.actionIndexByHealer[entityId]!;
  const index = healerIndex !== NONE ? healerIndex : internal.actionIndexByPatient[entityId]!;
  if (index === NONE) return undefined;
  return inspect(internal.activeActions[index]!);
}

export function isIndividualTreating(store: IndividualTreatmentActionStore, healerEntityId: number): boolean {
  const internal = asInternal(store); assertEntityId(healerEntityId, internal.entityCount);
  return internal.actionIndexByHealer[healerEntityId] !== NONE;
}

export function isIndividualReceivingTreatment(
  store: IndividualTreatmentActionStore,
  patientEntityId: number,
): boolean {
  const internal = asInternal(store);
  assertEntityId(patientEntityId, internal.entityCount);
  return internal.actionIndexByPatient[patientEntityId] !== NONE;
}

export function isIndividualTreatmentParticipant(
  store: IndividualTreatmentActionStore,
  entityId: number,
): boolean {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.actionIndexByHealer[entityId] !== NONE ||
    internal.actionIndexByPatient[entityId] !== NONE;
}

export function getActiveIndividualTreatmentActionCount(store: IndividualTreatmentActionStore): number {
  return asInternal(store).activeActions.length;
}

/**
 * Execution owns terminalisation; treatment owns releasing its claim, pause,
 * and participant indexes after that terminal transition has occurred.
 */
export function interruptIndividualTreatmentForExecutedPatient(
  lifecycle: IndividualCasualtyLifecycleStore,
  deathCounts: IndividualDeathCountStore,
  herbs: IndividualGenericHerbStore,
  claims: IndividualMedicalClaimStore,
  store: IndividualTreatmentActionStore,
  patientEntityId: number,
  tick: number,
  buffers: IndividualTreatmentActionBuffers,
): boolean {
  const internal = asInternal(store);
  validateCounts(internal.entityCount, lifecycle, deathCounts, herbs, claims);
  assertEntityId(patientEntityId, internal.entityCount);
  assertNonNegativeSafeInteger(tick, "tick");
  const index = internal.actionIndexByPatient[patientEntityId]!;
  if (index === NONE) return false;
  const action = internal.activeActions[index]!;
  if (action.kind !== "chirurgeonDying") {
    throw new Error("Only Chirurgeon dying treatment may be invalidated by execution.");
  }
  interruptAction(
    lifecycle,
    deathCounts,
    herbs,
    claims,
    internal,
    index,
    action,
    tick,
    "patientTerminalExecution",
    buffers.interruptedRecords,
    buffers.reassessmentRequests,
    false,
  );
  sortRecords(buffers);
  return true;
}

export function getIndividualTreatmentHistoryInspection(
  store: IndividualTreatmentActionStore,
  healerEntityId: number,
): IndividualTreatmentHistoryInspection {
  const internal = asInternal(store);
  assertEntityId(healerEntityId, internal.entityCount);
  return {
    startedCount: internal.startedCountByEntity[healerEntityId]!,
    interruptedCount: internal.interruptedCountByEntity[healerEntityId]!,
    completedCount: internal.completedCountByEntity[healerEntityId]!,
    restoredHitCount: internal.restoredHitCountByEntity[healerEntityId]!,
    clearedTraumaCount: internal.clearedTraumaCountByEntity[healerEntityId]!,
    clearedLimbCount: internal.clearedLimbCountByEntity[healerEntityId]!,
  };
}

export function projectIndividualTreatmentOrdinaryParticipation(
  store: IndividualTreatmentActionStore,
  snapshot: IndividualOrdinaryParticipationSnapshot,
): void {
  const internal = asInternal(store); validateCounts(internal.entityCount, snapshot);
  for (let index = 0; index < internal.activeActions.length; index += 1) {
    const action = internal.activeActions[index]!;
    setIndividualOrdinaryParticipationEligible(snapshot, action.healerEntityId, false);
    setIndividualOrdinaryParticipationEligible(snapshot, action.patientEntityId, false);
  }
}

export function advanceIndividualTreatmentActionsOneTick(
  world: WorldState,
  identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  profiles: TrustedIndividualMedicalProfileStore,
  herbs: IndividualGenericHerbStore,
  trauma: IndividualTraumaticWoundStore,
  limbs: IndividualLimbDisabilityStore,
  combatActions: IndividualCombatActionStore,
  morale: UnitMoraleMovementStateSource,
  deathCounts: IndividualDeathCountStore,
  hits: IndividualGlobalHitStore,
  claims: IndividualMedicalClaimStore,
  assistance: IndividualCasualtyAssistanceStore,
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  tick: number,
  store: IndividualTreatmentActionStore,
  buffers: IndividualTreatmentActionBuffers,
): IndividualTreatmentActionResult {
  const internal = asInternal(store);
  validateCounts(world.entityCount, identity, lifecycle, presence, profiles, herbs, trauma, limbs,
    combatActions, deathCounts, hits, claims, assistance, internal);
  assertNonNegativeSafeInteger(tick, "tick");
  buffers.startedRecords.length = 0;
  buffers.interruptedRecords.length = 0;
  buffers.completedRecords.length = 0;
  buffers.reassessmentRequests.length = 0;
  prepareInterruptionEvidence(internal, attackAttempts, gateDecisions, tick);
  let progressedActionCount = 0;

  for (let index = 0; index < internal.activeActions.length;) {
    const action = internal.activeActions[index]!;
    if (tick < action.lastProcessedTick) throw new RangeError("Treatment ticks must not move backwards.");
    if (tick === action.lastProcessedTick) { index += 1; continue; }
    const reason = getInterruptionReason(world, identity, lifecycle, presence, profiles,
      trauma, limbs, combatActions, morale, hits, claims, internal, action, tick);
    if (reason !== undefined) {
      interruptAction(lifecycle, deathCounts, herbs, claims, internal, index, action, tick,
        reason, buffers.interruptedRecords, buffers.reassessmentRequests);
      continue;
    }
    action.lastProcessedTick = tick;
    action.progressTicks += 1;
    progressedActionCount += 1;
    if (action.progressTicks < action.requiredProgressTicks) {
      index += 1;
      continue;
    }
    completeAction(lifecycle, presence, deathCounts, hits, herbs, trauma, limbs, claims, assistance, internal, index,
      action, tick, buffers.completedRecords, buffers.reassessmentRequests);
  }

  for (let healerEntityId = 0; healerEntityId < internal.entityCount; healerEntityId += 1) {
    if (internal.actionIndexByHealer[healerEntityId] !== NONE ||
      internal.actionIndexByPatient[healerEntityId] !== NONE ||
      internal.actionBoundaryTickByHealer[healerEntityId] === tick) continue;
    const patientEntityId = getIndividualMedicalClaimedPatientEntityId(claims, healerEntityId);
    if (patientEntityId === NONE ||
      internal.actionIndexByHealer[patientEntityId] !== NONE ||
      internal.actionIndexByPatient[patientEntityId] !== NONE ||
      !canStartAction(world, identity, lifecycle, presence, profiles, herbs,
        trauma, limbs, combatActions, morale, hits, claims, internal, healerEntityId,
        patientEntityId, tick)) continue;
    const kind = treatmentKindForClaim(
      claims, herbs, limbs, healerEntityId, patientEntityId,
    );
    if (kind === undefined) continue;
    const actionId = internal.nextActionId;
    const reservedGenericHerbs = treatmentKindRequiresHerb(kind) ? 1 : 0;
    if (reservedGenericHerbs === 1 &&
      !reserveIndividualGenericHerbForTreatment(herbs, healerEntityId, actionId)) continue;
    const action: ActiveTreatmentAction = {
      actionId,
      kind,
      healerEntityId,
      patientEntityId,
      startedTick: tick,
      reservedGenericHerbs,
      selectedLimbDisability: isLimbTreatmentKind(kind)
        ? getHighestPriorityIndividualLimbDisability(limbs, patientEntityId) ?? "none"
        : "none",
      requiredProgressTicks: requiredProgressTicksForKind(kind),
      progressTicks: 0,
      lastProcessedTick: tick,
    };
    const incomingClaimOwner = getIndividualMedicalClaimInspection(
      claims, healerEntityId,
    ).physickEntityId;
    if (incomingClaimOwner !== NONE) {
      releaseIndividualMedicalClaim(claims, incomingClaimOwner, healerEntityId);
    }
    if (kind === "chirurgeonDying") {
      pauseIndividualDeathCount(deathCounts, lifecycle, patientEntityId, pauseSource(action));
    }
    if (kind === "physickTerminalComfort") {
      recordIndividualTerminalComfortStarted(deathCounts, patientEntityId);
    }
    internal.nextActionId += 1;
    addAction(internal, action);
    clearIndividualMedicalClaimCommitmentDefenceOverride(claims, healerEntityId);
    incrementBounded(internal.startedCountByEntity, healerEntityId, "treatment started count");
    buffers.startedRecords.push({ ...inspect(action), tick });
  }

  sortRecords(buffers);
  return {
    startedRecords: buffers.startedRecords,
    interruptedRecords: buffers.interruptedRecords,
    completedRecords: buffers.completedRecords,
    reassessmentRequests: buffers.reassessmentRequests,
    activeActionCount: internal.activeActions.length,
    progressedActionCount,
  };
}

function canStartAction(
  world: WorldState, identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore, presence: IndividualPlayerPresenceStore,
  profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore,
  trauma: IndividualTraumaticWoundStore, limbs: IndividualLimbDisabilityStore,
  combatActions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource,
  hits: IndividualGlobalHitStore, claims: IndividualMedicalClaimStore,
  evidence: InternalTreatmentActionStore, healer: number, patient: number, tick: number,
): boolean {
  if (healer === patient ||
    evidence.actionIndexByHealer[healer] !== NONE ||
    evidence.actionIndexByPatient[healer] !== NONE ||
    evidence.actionIndexByHealer[patient] !== NONE ||
    evidence.actionIndexByPatient[patient] !== NONE ||
    !isIndividualMedicalClaimOwnedBy(claims, healer, patient) ||
    getIndividualCharacterLifecycleState(lifecycle, healer) !== "active" ||
    getIndividualTraumaticWoundInspection(trauma, healer).state !== "none" ||
    morale.get(getUnitIdForEntity(identity, healer)) === "routing" ||
    getIndividualCombatActionState(combatActions, healer) !== "ready" ||
    evidence.attackAttemptTickByEntity[healer] === tick ||
    evidence.attackAttemptTickByEntity[patient] === tick ||
    evidence.acceptedHitTickByEntity[healer] === tick ||
    evidence.acceptedHitTickByEntity[patient] === tick ||
    !withinTouchRange(world, healer, patient)) return false;
  const kind = treatmentKindForClaim(claims, herbs, limbs, healer, patient);
  if (kind === undefined) return false;
  const profile = getTrustedIndividualMedicalProfile(profiles, healer);
  if (kind === "chirurgeonDying") {
    return profile.hasChirurgeon &&
      getIndividualCharacterLifecycleState(lifecycle, patient) === "dying" &&
      getIndividualPlayerPresenceState(presence, patient) === "downedPresence" &&
      getIndividualCurrentGlobalHits(hits, patient) === 0;
  }
  if (kind === "physickTerminalComfort") {
    return profile.hasPhysick &&
      getIndividualCharacterLifecycleState(lifecycle, patient) === "terminal" &&
      getIndividualPlayerPresenceState(presence, patient) === "terminalAwaitingComfort";
  }
  if (!profile.hasPhysick || treatmentKindRequiresHerb(kind) &&
    getIndividualAvailableGenericHerbs(herbs, healer) < 1 ||
    getIndividualCharacterLifecycleState(lifecycle, patient) !== "active" ||
    getIndividualPlayerPresenceState(presence, patient) !== "activePresence") return false;
  if (kind === "physickTraumaticWound") {
    return getIndividualTraumaticWoundInspection(trauma, patient).state === "active";
  }
  if (isLimbTreatmentKind(kind)) {
    return getHighestPriorityIndividualLimbDisability(limbs, patient) !== undefined;
  }
  const currentHits = getIndividualCurrentGlobalHits(hits, patient);
  return currentHits > 0 && currentHits < getIndividualMaximumGlobalHits(hits, patient);
}

function getInterruptionReason(
  world: WorldState, identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore, presence: IndividualPlayerPresenceStore,
  profiles: TrustedIndividualMedicalProfileStore, trauma: IndividualTraumaticWoundStore,
  limbs: IndividualLimbDisabilityStore,
  combatActions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource,
  hits: IndividualGlobalHitStore, claims: IndividualMedicalClaimStore,
  evidence: InternalTreatmentActionStore, action: ActiveTreatmentAction, tick: number,
): IndividualTreatmentInterruptionReason | undefined {
  const healer = action.healerEntityId, patient = action.patientEntityId;
  if (evidence.attackAttemptTickByEntity[healer] === tick) return "healerAttackAttempt";
  if (evidence.attackAttemptTickByEntity[patient] === tick) return "patientAttackAttempt";
  if (evidence.acceptedHitTickByEntity[healer] === tick) return "healerAcceptedHit";
  if (evidence.acceptedHitTickByEntity[patient] === tick) return "patientAcceptedHit";
  if (!withinTouchRange(world, healer, patient)) return "rangeLost";
  const patientLifecycle = getIndividualCharacterLifecycleState(lifecycle, patient);
  const patientPresence = getIndividualPlayerPresenceState(presence, patient);
  const patientIncompatible = action.kind === "chirurgeonDying"
    ? patientLifecycle !== "dying" || patientPresence !== "downedPresence"
    : action.kind === "physickTerminalComfort"
      ? patientLifecycle !== "terminal" || patientPresence !== "terminalAwaitingComfort"
      : patientLifecycle !== "active" || patientPresence !== "activePresence";
  if (patientIncompatible) {
    return "patientLifecycleIncompatible";
  }
  const medicalProfile = getTrustedIndividualMedicalProfile(profiles, healer);
  if (getIndividualCharacterLifecycleState(lifecycle, healer) !== "active" ||
    (action.kind === "chirurgeonDying"
      ? !medicalProfile.hasChirurgeon
      : !medicalProfile.hasPhysick) ||
    getIndividualCombatActionState(combatActions, healer) !== "ready") {
    return "healerIncapacity";
  }
  if (morale.get(getUnitIdForEntity(identity, healer)) === "routing") return "healerRouting";
  if (getIndividualTraumaticWoundInspection(trauma, healer).state !== "none") return "healerTrauma";
  if (!patientStillNeedsAction(action, presence, hits, trauma, limbs, patient)) {
    return "patientNoLongerNeedsAction";
  }
  if (!isIndividualMedicalClaimOwnedBy(claims, healer, patient) ||
    getIndividualMedicalClaimNeed(claims, patient) !== claimNeedForKind(action.kind)) {
    return "claimLost";
  }
  return undefined;
}

function interruptAction(
  lifecycle: IndividualCasualtyLifecycleStore, deathCounts: IndividualDeathCountStore,
  herbs: IndividualGenericHerbStore, claims: IndividualMedicalClaimStore,
  store: InternalTreatmentActionStore,
  index: number, action: ActiveTreatmentAction, tick: number,
  reason: IndividualTreatmentInterruptionReason,
  out: IndividualTreatmentInterruptedRecord[],
  reassessmentOut: IndividualTreatmentReassessmentRequest[],
  requestReassessment = true,
): void {
  if (action.kind === "chirurgeonDying") {
    if (getIndividualCharacterLifecycleState(lifecycle, action.patientEntityId) === "dying") {
      resumeIndividualDeathCount(deathCounts, lifecycle, action.patientEntityId, pauseSource(action));
    } else {
      releaseIndividualDeathCountPause(deathCounts, action.patientEntityId, pauseSource(action));
    }
  } else if (action.reservedGenericHerbs === 1) {
    releaseIndividualGenericHerbTreatmentReservation(
      herbs, action.healerEntityId, action.actionId,
    );
  }
  if (action.kind === "chirurgeonDying" &&
    isIndividualMedicalClaimOwnedBy(claims, action.healerEntityId, action.patientEntityId)) {
    releaseIndividualMedicalClaim(claims, action.healerEntityId, action.patientEntityId);
  }
  incrementBounded(store.interruptedCountByEntity, action.healerEntityId,
    "treatment interrupted count");
  out.push({ ...inspect(action), tick, reason, progressTicksLost: action.progressTicks,
    releasedGenericHerbs: action.reservedGenericHerbs });
  store.actionBoundaryTickByHealer[action.healerEntityId] = tick;
  if (requestReassessment) {
    reassessmentOut.push({
      actionId: action.actionId,
      healerEntityId: action.healerEntityId,
      previousPatientEntityId: action.patientEntityId,
      tick,
      boundary: "interrupted",
    });
  }
  removeAction(store, index);
}

function completeAction(
  lifecycle: IndividualCasualtyLifecycleStore, presence: IndividualPlayerPresenceStore,
  deathCounts: IndividualDeathCountStore, hits: IndividualGlobalHitStore,
  herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore,
  limbs: IndividualLimbDisabilityStore,
  claims: IndividualMedicalClaimStore, assistance: IndividualCasualtyAssistanceStore,
  store: InternalTreatmentActionStore,
  index: number, action: ActiveTreatmentAction, tick: number,
  out: IndividualTreatmentCompletedRecord[],
  reassessmentOut: IndividualTreatmentReassessmentRequest[],
): void {
  let hitRestoration: IndividualGlobalHitRestorationRecord | undefined;
  let lifecycleRestoration: IndividualDyingRestorationRecord | undefined;
  let traumaCleared = false;
  let clearedLimbDisability: IndividualLimbDisabilityKind | "none" = "none";
  let comfortTransition: IndividualTerminalComfortTransitionRecord | undefined;
  if (action.kind === "chirurgeonDying") {
    resumeIndividualDeathCount(deathCounts, lifecycle, action.patientEntityId, pauseSource(action));
    hitRestoration = restoreIndividualGlobalHits(
      hits, lifecycle, action.patientEntityId, 1, "chirurgeonTreatment",
    );
    if (hitRestoration.appliedHitRestoration !== 1) {
      throw new Error("Chirurgeon dying treatment must restore exactly one hit.");
    }
    incrementBounded(store.restoredHitCountByEntity, action.healerEntityId,
      "treatment restored-hit count");
    lifecycleRestoration = transitionIndividualDyingToActive(
      lifecycle, presence, action.patientEntityId, tick,
    );
    if (isIndividualAtTreatmentPosition(assistance, action.patientEntityId)) {
      releaseIndividualTreatmentPositionReservation(assistance, action.patientEntityId);
    }
    releaseIndividualMedicalClaim(claims, action.healerEntityId, action.patientEntityId);
  } else if (action.kind === "physickTerminalComfort") {
    comfortTransition = transitionIndividualTerminalAwaitingComfortToComforted(
      lifecycle, presence, action.patientEntityId, tick,
    );
    recordIndividualTerminalComfortCompleted(
      deathCounts, action.patientEntityId, tick,
    );
    if (isIndividualAtTreatmentPosition(assistance, action.patientEntityId)) {
      releaseIndividualTreatmentPositionReservation(assistance, action.patientEntityId);
    }
    releaseIndividualMedicalClaim(claims, action.healerEntityId, action.patientEntityId);
  } else if (action.kind === "physickRestoreGlobalHit") {
    hitRestoration = restoreIndividualGlobalHits(
      hits, lifecycle, action.patientEntityId, 1, "physickTreatment",
    );
    if (hitRestoration.appliedHitRestoration !== 1) {
      throw new Error("Physick missing-hit treatment must restore exactly one hit.");
    }
    incrementBounded(store.restoredHitCountByEntity, action.healerEntityId,
      "treatment restored-hit count");
    consumeIndividualGenericHerbTreatmentReservation(
      herbs, action.healerEntityId, action.actionId,
    );
  } else if (action.kind === "physickTraumaticWound") {
    traumaCleared = clearIndividualTraumaticWound(trauma, action.patientEntityId);
    if (!traumaCleared) throw new Error("Physick trauma treatment must clear one active wound.");
    incrementBounded(store.clearedTraumaCountByEntity, action.healerEntityId,
      "treatment cleared-trauma count");
    consumeIndividualGenericHerbTreatmentReservation(
      herbs, action.healerEntityId, action.actionId,
    );
  } else {
    if (action.selectedLimbDisability === "none" ||
      !clearIndividualLimbDisability(
        limbs, action.patientEntityId, action.selectedLimbDisability,
      )) {
      throw new Error("Physick limb treatment must clear its selected disability.");
    }
    clearedLimbDisability = action.selectedLimbDisability;
    incrementBounded(store.clearedLimbCountByEntity, action.healerEntityId,
      "treatment cleared-limb count");
    if (action.reservedGenericHerbs === 1) {
      consumeIndividualGenericHerbTreatmentReservation(
        herbs, action.healerEntityId, action.actionId,
      );
    }
  }
  incrementBounded(store.completedCountByEntity, action.healerEntityId,
    "treatment completed count");
  out.push({ ...inspect(action), tick,
    ...(hitRestoration === undefined ? {} : { hitRestoration }),
    ...(lifecycleRestoration === undefined ? {} : { lifecycleRestoration }),
    traumaCleared,
    clearedLimbDisability,
    consumedGenericHerbs: action.reservedGenericHerbs,
    ...(comfortTransition === undefined ? {} : { comfortTransition }),
  });
  store.actionBoundaryTickByHealer[action.healerEntityId] = tick;
  reassessmentOut.push({
    actionId: action.actionId,
    healerEntityId: action.healerEntityId,
    previousPatientEntityId: action.patientEntityId,
    tick,
    boundary: "completed",
  });
  removeAction(store, index);
}

function prepareInterruptionEvidence(
  store: InternalTreatmentActionStore,
  attempts: readonly IndividualMeleeAttackAttemptRecord[],
  decisions: readonly IndividualLandedHitGateDecisionRecord[],
  tick: number,
): void {
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index]!;
    if (attempt.outcome !== "attempted") continue;
    assertEntityId(attempt.attackerEntityId, store.entityCount);
    store.attackAttemptTickByEntity[attempt.attackerEntityId] = tick;
  }
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index]!;
    if (decision.outcome !== "accepted") continue;
    assertEntityId(decision.targetEntityId, store.entityCount);
    store.acceptedHitTickByEntity[decision.targetEntityId] = tick;
  }
}

function withinTouchRange(world: WorldState, left: number, right: number): boolean {
  const dx = world.positionsX[left]! - world.positionsX[right]!;
  const dy = world.positionsY[left]! - world.positionsY[right]!;
  return dx * dx + dy * dy <= INDIVIDUAL_TREATMENT_TOUCH_RANGE * INDIVIDUAL_TREATMENT_TOUCH_RANGE;
}

function treatmentKindForClaim(
  claims: IndividualMedicalClaimStore,
  herbs: IndividualGenericHerbStore,
  limbs: IndividualLimbDisabilityStore,
  healerEntityId: number,
  patientEntityId: number,
): IndividualTreatmentActionKind | undefined {
  const need = getIndividualMedicalClaimNeed(claims, patientEntityId);
  if (need === "dying") return "chirurgeonDying";
  if (need === "terminalComfort") return "physickTerminalComfort";
  if (need === "livingMissingHits") return "physickRestoreGlobalHit";
  if (need === "traumaticWound") return "physickTraumaticWound";
  if (need === "limbDisability" &&
    getHighestPriorityIndividualLimbDisability(limbs, patientEntityId) !== undefined) {
    return getIndividualAvailableGenericHerbs(herbs, healerEntityId) > 0
      ? "physickLimbWithHerb"
      : "physickLimbWithoutHerb";
  }
  return undefined;
}

function claimNeedForKind(
  kind: IndividualTreatmentActionKind,
): "dying" | "livingMissingHits" | "traumaticWound" | "limbDisability" | "terminalComfort" {
  if (kind === "chirurgeonDying") return "dying";
  if (kind === "physickTerminalComfort") return "terminalComfort";
  if (kind === "physickRestoreGlobalHit") return "livingMissingHits";
  return kind === "physickTraumaticWound" ? "traumaticWound" : "limbDisability";
}

function patientStillNeedsAction(
  action: ActiveTreatmentAction,
  presence: IndividualPlayerPresenceStore,
  hits: IndividualGlobalHitStore,
  trauma: IndividualTraumaticWoundStore,
  limbs: IndividualLimbDisabilityStore,
  patientEntityId: number,
): boolean {
  const kind = action.kind;
  if (kind === "chirurgeonDying") {
    return getIndividualCurrentGlobalHits(hits, patientEntityId) === 0;
  }
  if (kind === "physickTerminalComfort") {
    return getIndividualPlayerPresenceState(presence, patientEntityId) ===
      "terminalAwaitingComfort";
  }
  if (kind === "physickTraumaticWound") {
    return getIndividualTraumaticWoundInspection(trauma, patientEntityId).state === "active";
  }
  if (isLimbTreatmentKind(kind)) {
    return action.selectedLimbDisability !== "none" &&
      hasIndividualLimbDisability(
        limbs, patientEntityId, action.selectedLimbDisability,
      );
  }
  const currentHits = getIndividualCurrentGlobalHits(hits, patientEntityId);
  return currentHits > 0 && currentHits < getIndividualMaximumGlobalHits(hits, patientEntityId);
}

function isLimbTreatmentKind(kind: IndividualTreatmentActionKind): boolean {
  return kind === "physickLimbWithHerb" || kind === "physickLimbWithoutHerb";
}

function treatmentKindRequiresHerb(kind: IndividualTreatmentActionKind): boolean {
  return kind === "physickRestoreGlobalHit" ||
    kind === "physickTraumaticWound" ||
    kind === "physickLimbWithHerb";
}

function requiredProgressTicksForKind(kind: IndividualTreatmentActionKind): number {
  if (kind === "physickTerminalComfort") {
    return PHYSICK_TERMINAL_COMFORT_PROGRESS_TICKS;
  }
  return kind === "physickLimbWithoutHerb"
    ? PHYSICK_LIMB_NO_HERB_TREATMENT_PROGRESS_TICKS
    : CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS;
}

function pauseSource(action: ActiveTreatmentAction): IndividualDeathCountPauseSource {
  return { kind: "chirurgeonTreatment", healerEntityId: action.healerEntityId,
    treatmentStartTick: action.startedTick };
}

function addAction(store: InternalTreatmentActionStore, action: ActiveTreatmentAction): void {
  if (action.healerEntityId === action.patientEntityId ||
    store.actionIndexByHealer[action.healerEntityId] !== NONE ||
    store.actionIndexByPatient[action.healerEntityId] !== NONE ||
    store.actionIndexByHealer[action.patientEntityId] !== NONE ||
    store.actionIndexByPatient[action.patientEntityId] !== NONE) {
    throw new Error("An entity may participate in at most one active treatment action.");
  }
  const index = store.activeActions.length;
  store.activeActions.push(action);
  store.actionIndexByHealer[action.healerEntityId] = index;
  store.actionIndexByPatient[action.patientEntityId] = index;
}

function removeAction(store: InternalTreatmentActionStore, index: number): void {
  const removed = store.activeActions[index]!;
  const lastIndex = store.activeActions.length - 1;
  const last = store.activeActions[lastIndex]!;
  store.actionIndexByHealer[removed.healerEntityId] = NONE;
  store.actionIndexByPatient[removed.patientEntityId] = NONE;
  store.activeActions.pop();
  if (index === lastIndex) return;
  store.activeActions[index] = last;
  store.actionIndexByHealer[last.healerEntityId] = index;
  store.actionIndexByPatient[last.patientEntityId] = index;
}

function inspect(action: ActiveTreatmentAction): IndividualTreatmentActionInspection {
  return { actionId: action.actionId, kind: action.kind,
    healerEntityId: action.healerEntityId, patientEntityId: action.patientEntityId,
    startedTick: action.startedTick, progressTicks: action.progressTicks,
    requiredProgressTicks: action.requiredProgressTicks,
    reservedGenericHerbs: action.reservedGenericHerbs,
    selectedLimbDisability: action.selectedLimbDisability };
}

function incrementBounded(array: Uint32Array, entityId: number, label: string): void {
  const current = array[entityId]!;
  if (current === 0xffffffff) throw new RangeError(`${label} overflow.`);
  array[entityId] = current + 1;
}

function sortRecords(buffers: IndividualTreatmentActionBuffers): void {
  const compare = (left: { readonly healerEntityId: number }, right: { readonly healerEntityId: number }) =>
    left.healerEntityId - right.healerEntityId;
  buffers.startedRecords.sort(compare);
  buffers.interruptedRecords.sort(compare);
  buffers.completedRecords.sort(compare);
  buffers.reassessmentRequests.sort(compare);
}

function asInternal(store: IndividualTreatmentActionStore): InternalTreatmentActionStore {
  return store as InternalTreatmentActionStore;
}
function validateCounts(count: number, ...stores: readonly { readonly entityCount: number }[]): void {
  for (const store of stores) if (store.entityCount !== count) {
    throw new RangeError("Treatment-action stores must share entityCount.");
  }
}
function assertEntityId(entityId: number, count: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= count) {
    throw new RangeError("Treatment-action entity ID is out of bounds.");
  }
}
function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
}
function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
}
