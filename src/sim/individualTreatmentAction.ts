import {
  CASUALTY_DRAG_PICKUP_RANGE,
  releaseIndividualTreatmentPositionReservation,
  type IndividualCasualtyAssistanceStore,
} from "./individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  transitionIndividualDyingToActive,
  type IndividualCasualtyLifecycleStore,
  type IndividualDyingRestorationRecord,
  type IndividualPlayerPresenceStore,
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
  type IndividualDeathCountPauseSource,
  type IndividualDeathCountStore,
} from "./individualDeathCount";
import {
  getIndividualCurrentGlobalHits,
  restoreIndividualGlobalHits,
  type IndividualGlobalHitRestorationRecord,
  type IndividualGlobalHitStore,
} from "./individualGlobalHits";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import {
  clearIndividualMedicalClaimCommitmentDefenceOverride,
  getIndividualMedicalClaimedPatientEntityId,
  getIndividualMedicalClaimNeed,
  isIndividualMedicalClaimOwnedBy,
  releaseIndividualMedicalClaim,
  type IndividualMedicalClaimStore,
} from "./individualMedicalClaims";
import {
  getTrustedIndividualMedicalProfile,
  type TrustedIndividualMedicalProfileStore,
} from "./individualMedicalProfile";
import { setIndividualOrdinaryParticipationEligible, type IndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import { getIndividualTraumaticWoundInspection, type IndividualTraumaticWoundStore } from "./individualTraumaticWound";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import { getUnitIdForEntity, type UnitIdentityStore } from "./unitIdentity";
import type { WorldState } from "./types";

export const CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS = 600;
export const INDIVIDUAL_TREATMENT_TOUCH_RANGE = CASUALTY_DRAG_PICKUP_RANGE;

export type IndividualTreatmentActionKind = "chirurgeonDying";
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
  | "claimLost";

interface ActiveTreatmentAction {
  readonly actionId: number;
  readonly kind: "chirurgeonDying";
  readonly healerEntityId: number;
  readonly patientEntityId: number;
  readonly startedTick: number;
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
}

export interface IndividualTreatmentStartedRecord extends IndividualTreatmentActionInspection {
  readonly tick: number;
}
export interface IndividualTreatmentInterruptedRecord extends IndividualTreatmentActionInspection {
  readonly tick: number;
  readonly reason: IndividualTreatmentInterruptionReason;
  readonly progressTicksLost: number;
}
export interface IndividualTreatmentCompletedRecord extends IndividualTreatmentActionInspection {
  readonly tick: number;
  readonly hitRestoration: IndividualGlobalHitRestorationRecord;
  readonly lifecycleRestoration: IndividualDyingRestorationRecord;
}

export interface IndividualTreatmentActionBuffers {
  readonly startedRecords: IndividualTreatmentStartedRecord[];
  readonly interruptedRecords: IndividualTreatmentInterruptedRecord[];
  readonly completedRecords: IndividualTreatmentCompletedRecord[];
}
export interface IndividualTreatmentActionResult {
  readonly startedRecords: readonly IndividualTreatmentStartedRecord[];
  readonly interruptedRecords: readonly IndividualTreatmentInterruptedRecord[];
  readonly completedRecords: readonly IndividualTreatmentCompletedRecord[];
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
  return {
    entityCount,
    activeActions: [],
    actionIndexByHealer,
    actionIndexByPatient,
    attackAttemptTickByEntity,
    acceptedHitTickByEntity,
    nextActionId: 0,
  } as InternalTreatmentActionStore;
}

export function createIndividualTreatmentActionBuffers(): IndividualTreatmentActionBuffers {
  return { startedRecords: [], interruptedRecords: [], completedRecords: [] };
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

export function getActiveIndividualTreatmentActionCount(store: IndividualTreatmentActionStore): number {
  return asInternal(store).activeActions.length;
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
  trauma: IndividualTraumaticWoundStore,
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
  validateCounts(world.entityCount, identity, lifecycle, presence, profiles, trauma,
    combatActions, deathCounts, hits, claims, assistance, internal);
  assertNonNegativeSafeInteger(tick, "tick");
  buffers.startedRecords.length = 0;
  buffers.interruptedRecords.length = 0;
  buffers.completedRecords.length = 0;
  prepareInterruptionEvidence(internal, attackAttempts, gateDecisions, tick);
  let progressedActionCount = 0;

  for (let index = 0; index < internal.activeActions.length;) {
    const action = internal.activeActions[index]!;
    if (tick < action.lastProcessedTick) throw new RangeError("Treatment ticks must not move backwards.");
    if (tick === action.lastProcessedTick) { index += 1; continue; }
    const reason = getInterruptionReason(world, identity, lifecycle, presence, profiles,
      trauma, combatActions, morale, hits, claims, internal, action, tick);
    if (reason !== undefined) {
      interruptAction(lifecycle, deathCounts, claims, internal, index, action, tick,
        reason, buffers.interruptedRecords);
      continue;
    }
    action.lastProcessedTick = tick;
    action.progressTicks += 1;
    progressedActionCount += 1;
    if (action.progressTicks < CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS) {
      index += 1;
      continue;
    }
    completeAction(lifecycle, presence, deathCounts, hits, claims, assistance, internal, index,
      action, tick, buffers.completedRecords);
  }

  for (let healerEntityId = 0; healerEntityId < internal.entityCount; healerEntityId += 1) {
    if (internal.actionIndexByHealer[healerEntityId] !== NONE ||
      internal.actionIndexByPatient[healerEntityId] !== NONE) continue;
    const patientEntityId = getIndividualMedicalClaimedPatientEntityId(claims, healerEntityId);
    if (patientEntityId === NONE || internal.actionIndexByPatient[patientEntityId] !== NONE ||
      !canStartAction(world, identity, lifecycle, presence, profiles, trauma,
        combatActions, morale, hits, claims, internal, healerEntityId,
        patientEntityId, tick)) continue;
    const action: ActiveTreatmentAction = {
      actionId: internal.nextActionId,
      kind: "chirurgeonDying",
      healerEntityId,
      patientEntityId,
      startedTick: tick,
      progressTicks: 0,
      lastProcessedTick: tick,
    };
    pauseIndividualDeathCount(deathCounts, lifecycle, patientEntityId, pauseSource(action));
    internal.nextActionId += 1;
    addAction(internal, action);
    clearIndividualMedicalClaimCommitmentDefenceOverride(claims, healerEntityId);
    buffers.startedRecords.push({ ...inspect(action), tick });
  }

  sortRecords(buffers);
  return {
    startedRecords: buffers.startedRecords,
    interruptedRecords: buffers.interruptedRecords,
    completedRecords: buffers.completedRecords,
    activeActionCount: internal.activeActions.length,
    progressedActionCount,
  };
}

function canStartAction(
  world: WorldState, identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore, presence: IndividualPlayerPresenceStore,
  profiles: TrustedIndividualMedicalProfileStore, trauma: IndividualTraumaticWoundStore,
  combatActions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource,
  hits: IndividualGlobalHitStore, claims: IndividualMedicalClaimStore,
  evidence: InternalTreatmentActionStore, healer: number, patient: number, tick: number,
): boolean {
  return healer !== patient &&
    isIndividualMedicalClaimOwnedBy(claims, healer, patient) &&
    getIndividualMedicalClaimNeed(claims, patient) === "dying" &&
    getTrustedIndividualMedicalProfile(profiles, healer).hasChirurgeon &&
    getIndividualCharacterLifecycleState(lifecycle, healer) === "active" &&
    getIndividualCharacterLifecycleState(lifecycle, patient) === "dying" &&
    getIndividualPlayerPresenceState(presence, patient) === "downedPresence" &&
    getIndividualCurrentGlobalHits(hits, patient) === 0 &&
    getIndividualTraumaticWoundInspection(trauma, healer).state === "none" &&
    morale.get(getUnitIdForEntity(identity, healer)) !== "routing" &&
    getIndividualCombatActionState(combatActions, healer) === "ready" &&
    evidence.attackAttemptTickByEntity[healer] !== tick &&
    evidence.attackAttemptTickByEntity[patient] !== tick &&
    evidence.acceptedHitTickByEntity[healer] !== tick &&
    evidence.acceptedHitTickByEntity[patient] !== tick &&
    withinTouchRange(world, healer, patient);
}

function getInterruptionReason(
  world: WorldState, identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore, presence: IndividualPlayerPresenceStore,
  profiles: TrustedIndividualMedicalProfileStore, trauma: IndividualTraumaticWoundStore,
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
  if (getIndividualCharacterLifecycleState(lifecycle, patient) !== "dying" ||
    getIndividualPlayerPresenceState(presence, patient) !== "downedPresence") {
    return "patientLifecycleIncompatible";
  }
  if (getIndividualCharacterLifecycleState(lifecycle, healer) !== "active" ||
    !getTrustedIndividualMedicalProfile(profiles, healer).hasChirurgeon ||
    getIndividualCombatActionState(combatActions, healer) !== "ready") {
    return "healerIncapacity";
  }
  if (morale.get(getUnitIdForEntity(identity, healer)) === "routing") return "healerRouting";
  if (getIndividualTraumaticWoundInspection(trauma, healer).state !== "none") return "healerTrauma";
  if (getIndividualCurrentGlobalHits(hits, patient) !== 0) return "patientNoLongerNeedsAction";
  if (!isIndividualMedicalClaimOwnedBy(claims, healer, patient) ||
    getIndividualMedicalClaimNeed(claims, patient) !== "dying") return "claimLost";
  return undefined;
}

function interruptAction(
  lifecycle: IndividualCasualtyLifecycleStore, deathCounts: IndividualDeathCountStore,
  claims: IndividualMedicalClaimStore, store: InternalTreatmentActionStore,
  index: number, action: ActiveTreatmentAction, tick: number,
  reason: IndividualTreatmentInterruptionReason,
  out: IndividualTreatmentInterruptedRecord[],
): void {
  if (getIndividualCharacterLifecycleState(lifecycle, action.patientEntityId) === "dying") {
    resumeIndividualDeathCount(deathCounts, lifecycle, action.patientEntityId, pauseSource(action));
  } else {
    releaseIndividualDeathCountPause(deathCounts, action.patientEntityId, pauseSource(action));
  }
  if (isIndividualMedicalClaimOwnedBy(claims, action.healerEntityId, action.patientEntityId)) {
    releaseIndividualMedicalClaim(claims, action.healerEntityId, action.patientEntityId);
  }
  out.push({ ...inspect(action), tick, reason, progressTicksLost: action.progressTicks });
  removeAction(store, index);
}

function completeAction(
  lifecycle: IndividualCasualtyLifecycleStore, presence: IndividualPlayerPresenceStore,
  deathCounts: IndividualDeathCountStore, hits: IndividualGlobalHitStore,
  claims: IndividualMedicalClaimStore, assistance: IndividualCasualtyAssistanceStore,
  store: InternalTreatmentActionStore,
  index: number, action: ActiveTreatmentAction, tick: number,
  out: IndividualTreatmentCompletedRecord[],
): void {
  resumeIndividualDeathCount(deathCounts, lifecycle, action.patientEntityId, pauseSource(action));
  const hitRestoration = restoreIndividualGlobalHits(
    hits, lifecycle, action.patientEntityId, 1, "chirurgeonTreatment",
  );
  if (hitRestoration.appliedHitRestoration !== 1) {
    throw new Error("Chirurgeon dying treatment must restore exactly one hit.");
  }
  const lifecycleRestoration = transitionIndividualDyingToActive(
    lifecycle, presence, action.patientEntityId, tick,
  );
  releaseIndividualTreatmentPositionReservation(assistance, action.patientEntityId);
  releaseIndividualMedicalClaim(claims, action.healerEntityId, action.patientEntityId);
  out.push({ ...inspect(action), tick, hitRestoration, lifecycleRestoration });
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

function pauseSource(action: ActiveTreatmentAction): IndividualDeathCountPauseSource {
  return { kind: "chirurgeonTreatment", healerEntityId: action.healerEntityId,
    treatmentStartTick: action.startedTick };
}

function addAction(store: InternalTreatmentActionStore, action: ActiveTreatmentAction): void {
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
    requiredProgressTicks: CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS };
}

function sortRecords(buffers: IndividualTreatmentActionBuffers): void {
  const compare = (left: { readonly healerEntityId: number }, right: { readonly healerEntityId: number }) =>
    left.healerEntityId - right.healerEntityId;
  buffers.startedRecords.sort(compare);
  buffers.interruptedRecords.sort(compare);
  buffers.completedRecords.sort(compare);
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
