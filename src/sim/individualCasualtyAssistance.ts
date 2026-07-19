import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import { getIndividualCombatActionState, type IndividualCombatActionStore } from "./individualCombatAction";
import {
  applyIndividualExternalMovementIntent,
  applyIndividualExternalSharedMovementDelta,
  getIndividualConfiguredMaxStep,
  getIndividualPressure,
  getUnitHeading,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import {
  getPreparedMedicalFactionId,
  isPreparedMedicalThreatEligible,
  queryPreparedMedicalLocalEntityIdsNearPointInto,
  queryPreparedMedicalLocalEntityIdsWithinRadiusInto,
  type IndividualMedicalLocalQueryStore,
} from "./individualMedicalReadModel";
import {
  getTrustedIndividualMedicalProfile,
  type TrustedIndividualMedicalProfileStore,
} from "./individualMedicalProfile";
import { isIndividualOrdinaryParticipationEligible, setIndividualOrdinaryParticipationEligible, type IndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import { getIndividualTraumaticWoundInspection, type IndividualTraumaticWoundStore } from "./individualTraumaticWound";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import { getUnitIdForEntity, type UnitIdentityStore } from "./unitIdentity";
import type { WorldState } from "./types";

export type IndividualCasualtyAssistanceState =
  | "none"
  | "rescueRequested"
  | "reservedPatient"
  | "reservedHelper"
  | "atTreatmentPosition";

export type CasualtyDragHelperKind = "physick" | "twoOrdinaryFighters";

export interface IndividualCasualtyAssistanceStore {
  readonly entityCount: number;
}

interface InternalIndividualCasualtyAssistanceStore
  extends IndividualCasualtyAssistanceStore {
  readonly stateByEntity: Uint8Array;
  readonly dragGroupIdByEntity: Int32Array;
  readonly destinationXByEntity: Float64Array;
  readonly destinationYByEntity: Float64Array;
  readonly claimedPhysickByEntity: Int32Array;
  readonly rescueRequestedTickByEntity: Float64Array;
  readonly reservedTickByEntity: Float64Array;
  readonly blockedReformationTickByEntity: Float64Array;
}

export interface IndividualCasualtyAssistanceInspection {
  readonly state: IndividualCasualtyAssistanceState;
  readonly dragGroupId: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly claimedPhysickEntityId: number;
  readonly rescueRequestedTick: number;
  readonly reservedTick: number;
}

export type CasualtyDragGroupPhase = "gathering" | "dragging" | "reachedSafety" | "cancelled";

export interface CasualtyDragGroupRecord {
  readonly groupId: number;
  readonly patientEntityId: number;
  readonly patientKind: "dying" | "terminalComfort";
  readonly helperKind: CasualtyDragHelperKind;
  readonly helperEntityIds: readonly number[];
  readonly destinationX: number;
  readonly destinationY: number;
  readonly createdTick: number;
  readonly phase: CasualtyDragGroupPhase;
  readonly phaseEnteredTick: number;
}

interface InternalCasualtyDragGroupRecord extends Omit<CasualtyDragGroupRecord, "phase" | "phaseEnteredTick" | "destinationX" | "destinationY" | "patientKind"> {
  patientKind: "dying" | "terminalComfort";
  phase: CasualtyDragGroupPhase;
  phaseEnteredTick: number;
  destinationX: number;
  destinationY: number;
  dragSpeedRemainder: number;
}

export interface CasualtyDragGroupStore {
  readonly entityCount: number;
}

interface InternalCasualtyDragGroupStore extends CasualtyDragGroupStore {
  readonly activeGroups: InternalCasualtyDragGroupRecord[];
  nextGroupId: number;
}

export interface CasualtyRescueRequestedRecord {
  readonly patientEntityId: number;
  readonly tick: number;
}

export interface CasualtyDragGroupStartedRecord {
  readonly groupId: number;
  readonly patientEntityId: number;
  readonly helperKind: CasualtyDragHelperKind;
  readonly helperEntityIds: readonly number[];
  readonly destinationX: number;
  readonly destinationY: number;
  readonly tick: number;
}

export type CasualtyNoRescueReason =
  | "noEligibleHelpers"
  | "onlyOneOrdinaryHelper";

export interface CasualtyNoRescueRecord {
  readonly patientEntityId: number;
  readonly reason: CasualtyNoRescueReason;
  readonly tick: number;
}

export interface CasualtyAssistanceDecisionBuffers {
  readonly rescueRequestedRecords: CasualtyRescueRequestedRecord[];
  readonly groupStartedRecords: CasualtyDragGroupStartedRecord[];
  readonly noRescueRecords: CasualtyNoRescueRecord[];
}

export interface CasualtyAssistanceDecisionResult {
  readonly rescueRequestedRecords: readonly CasualtyRescueRequestedRecord[];
  readonly groupStartedRecords: readonly CasualtyDragGroupStartedRecord[];
  readonly noRescueRecords: readonly CasualtyNoRescueRecord[];
  readonly dragEligiblePatientCount: number;
  readonly localCandidateCount: number;
}

export interface IndividualDragHandCommitmentStore {
  readonly entityCount: number;
  getFreeHands(entityId: number): number | undefined;
}
interface InternalIndividualDragHandCommitmentStore extends IndividualDragHandCommitmentStore {
  readonly occupiedByEntity: Uint8Array;
  readonly committedHandsByEntity: Uint8Array;
}

export type CasualtyDragCancellationReason = "patientInvalid" | "helperInvalid" | "helperHit";
export interface CasualtyDragCancellationRecord { readonly groupId: number; readonly patientEntityId: number; readonly reason: CasualtyDragCancellationReason; readonly tick: number; }
export interface CasualtyDraggingStartedRecord { readonly groupId: number; readonly patientEntityId: number; readonly helperEntityIds: readonly number[]; readonly tick: number; }
export interface CasualtyDragReachedSafetyRecord { readonly groupId: number; readonly patientEntityId: number; readonly tick: number; }
export interface CasualtyDragMovementBuffers { readonly cancellationRecords: CasualtyDragCancellationRecord[]; readonly draggingStartedRecords: CasualtyDraggingStartedRecord[]; readonly reachedSafetyRecords: CasualtyDragReachedSafetyRecord[]; }
export interface CasualtyDragMovementResult { readonly cancellationRecords: readonly CasualtyDragCancellationRecord[]; readonly draggingStartedRecords: readonly CasualtyDraggingStartedRecord[]; readonly reachedSafetyRecords: readonly CasualtyDragReachedSafetyRecord[]; readonly gatheringGroupCount: number; readonly draggingGroupCount: number; readonly reachedSafetyGroupCount: number; readonly movedParticipantCount: number; }

export interface CasualtyAssistanceDecisionOptions {
  /** Reserved integration hook until IndividualTreatmentActionStore exists. */
  readonly isTreating?: (entityId: number) => boolean;
  /** Any healer or patient currently owned by the treatment-action store. */
  readonly isTreatmentParticipant?: (entityId: number) => boolean;
  /** Current 6F ownership gate supplied by the medical-claim system. */
  readonly hasClaimedPatient?: (physickEntityId: number) => boolean;
  /** Cross-system commitment such as an active execution action. */
  readonly isUnavailable?: (entityId: number) => boolean;
  readonly isTerminalAwaitingComfort?: (entityId: number) => boolean;
}

interface HelperCandidate {
  readonly entityId: number;
  readonly isPhysick: boolean;
  readonly sameUnit: boolean;
  readonly distanceSquared: number;
  readonly pressure: number;
}

interface PatientCandidate {
  readonly entityId: number;
  readonly exposure: number;
}

const STATE_NONE = 0;
const STATE_RESCUE_REQUESTED = 1;
const STATE_RESERVED_PATIENT = 2;
const STATE_RESERVED_HELPER = 3;
const STATE_AT_TREATMENT_POSITION = 4;
const NO_ENTITY = -1;
export const LOCAL_CASUALTY_RESCUE_RADIUS = 192;
export const MAXIMUM_CASUALTY_EXTRACTION_DISTANCE = 96;
export const CASUALTY_DRAG_PICKUP_RANGE = 8;
export const INITIAL_DRAG_SPEED_FACTOR_NUMERATOR = 1;
export const INITIAL_DRAG_SPEED_FACTOR_DENOMINATOR = 2;
const SAFE_DESTINATION_QUERY_RADIUS = 96;

export function createIndividualCasualtyAssistanceStore(
  entityCount: number,
): IndividualCasualtyAssistanceStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const groupIds = new Int32Array(entityCount);
  const destinationX = new Float64Array(entityCount);
  const destinationY = new Float64Array(entityCount);
  const claimedPhysicks = new Int32Array(entityCount);
  const requestedTicks = new Float64Array(entityCount);
  const reservedTicks = new Float64Array(entityCount);
  groupIds.fill(NO_ENTITY);
  destinationX.fill(NO_ENTITY);
  destinationY.fill(NO_ENTITY);
  claimedPhysicks.fill(NO_ENTITY);
  requestedTicks.fill(NO_ENTITY);
  reservedTicks.fill(NO_ENTITY);
  const blockedTicks = new Float64Array(entityCount);
  blockedTicks.fill(NO_ENTITY);
  return {
    entityCount,
    stateByEntity: new Uint8Array(entityCount),
    dragGroupIdByEntity: groupIds,
    destinationXByEntity: destinationX,
    destinationYByEntity: destinationY,
    claimedPhysickByEntity: claimedPhysicks,
    rescueRequestedTickByEntity: requestedTicks,
    reservedTickByEntity: reservedTicks,
    blockedReformationTickByEntity: blockedTicks,
  } as InternalIndividualCasualtyAssistanceStore;
}

export function createIndividualDragHandCommitmentStore(entityCount: number): IndividualDragHandCommitmentStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const store: InternalIndividualDragHandCommitmentStore = {
    entityCount,
    occupiedByEntity: new Uint8Array(entityCount),
    committedHandsByEntity: new Uint8Array(entityCount),
    getFreeHands(entityId: number): number | undefined {
      assertEntityId(entityId, entityCount);
      return store.occupiedByEntity[entityId] === 0 ? undefined : 2 - store.committedHandsByEntity[entityId]!;
    },
  };
  return store;
}

export function createCasualtyDragMovementBuffers(): CasualtyDragMovementBuffers { return { cancellationRecords: [], draggingStartedRecords: [], reachedSafetyRecords: [] }; }

export function createCasualtyDragGroupStore(
  entityCount: number,
): CasualtyDragGroupStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  return {
    entityCount,
    activeGroups: [],
    nextGroupId: 0,
  } as InternalCasualtyDragGroupStore;
}

export function createCasualtyAssistanceDecisionBuffers(): CasualtyAssistanceDecisionBuffers {
  return {
    rescueRequestedRecords: [],
    groupStartedRecords: [],
    noRescueRecords: [],
  };
}

export function getIndividualCasualtyAssistanceInspection(
  store: IndividualCasualtyAssistanceStore,
  entityId: number,
): IndividualCasualtyAssistanceInspection {
  const internal = asAssistanceStore(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    state: assistanceStateFromIdentity(internal.stateByEntity[entityId]!),
    dragGroupId: internal.dragGroupIdByEntity[entityId]!,
    destinationX: internal.destinationXByEntity[entityId]!,
    destinationY: internal.destinationYByEntity[entityId]!,
    claimedPhysickEntityId: internal.claimedPhysickByEntity[entityId]!,
    rescueRequestedTick: internal.rescueRequestedTickByEntity[entityId]!,
    reservedTick: internal.reservedTickByEntity[entityId]!,
  };
}

export function getActiveCasualtyDragGroups(
  store: CasualtyDragGroupStore,
): readonly CasualtyDragGroupRecord[] {
  return asGroupStore(store).activeGroups;
}

export function isIndividualDragEligiblePatient(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  entityId: number,
  presenceStore?: IndividualPlayerPresenceStore,
): boolean {
  const lifecycle = getIndividualCharacterLifecycleState(lifecycleStore, entityId);
  if (lifecycle === "dying") return true;
  if (presenceStore === undefined) return false;
  if (presenceStore.entityCount !== lifecycleStore.entityCount) {
    throw new RangeError("Drag eligibility presence store must match entityCount.");
  }
  return lifecycle === "terminal" &&
    getIndividualPlayerPresenceState(presenceStore, entityId) ===
      "terminalAwaitingComfort";
}

export function isIndividualAtTreatmentPosition(
  store: IndividualCasualtyAssistanceStore,
  entityId: number,
): boolean {
  const internal = asAssistanceStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.stateByEntity[entityId] === STATE_AT_TREATMENT_POSITION;
}

export function hasUnreservedDragEligiblePatient(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  assistanceStore: IndividualCasualtyAssistanceStore,
  isTerminalAwaitingComfort?: (entityId: number) => boolean,
): boolean {
  validateEntityCounts(
    lifecycleStore.entityCount,
    lifecycleStore,
    assistanceStore,
  );
  const assistance = asAssistanceStore(assistanceStore);
  for (let entityId = 0; entityId < lifecycleStore.entityCount; entityId += 1) {
    if (
      assistance.dragGroupIdByEntity[entityId] === NO_ENTITY &&
      assistance.stateByEntity[entityId] !== STATE_AT_TREATMENT_POSITION &&
      (isIndividualDragEligiblePatient(lifecycleStore, entityId) ||
        isTerminalAwaitingComfort?.(entityId) === true)
    ) return true;
  }
  return false;
}

export function queryDragEligibleAlliedPatientsWithinRadiusInto(
  world: WorldState,
  identityStore: UnitIdentityStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  assistanceStore: IndividualCasualtyAssistanceStore,
  queryStore: IndividualMedicalLocalQueryStore,
  seekerEntityId: number,
  radius: number,
  out: number[] = [],
  isTerminalAwaitingComfort?: (entityId: number) => boolean,
): readonly number[] {
  validateEntityCounts(world.entityCount, identityStore, lifecycleStore,
    assistanceStore, queryStore);
  const assistance = asAssistanceStore(assistanceStore);
  const seekerFaction = getPreparedMedicalFactionId(queryStore, seekerEntityId);
  const candidates = queryPreparedMedicalLocalEntityIdsWithinRadiusInto(
    queryStore,
    world,
    seekerEntityId,
    radius,
    out,
  );
  let writeIndex = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const entityId = candidates[index]!;
    if (
      entityId !== seekerEntityId &&
      getPreparedMedicalFactionId(queryStore, entityId) === seekerFaction &&
      (isIndividualDragEligiblePatient(lifecycleStore, entityId) ||
        isTerminalAwaitingComfort?.(entityId) === true) &&
      assistance.dragGroupIdByEntity[entityId] === NO_ENTITY
      && assistance.stateByEntity[entityId] !== STATE_AT_TREATMENT_POSITION
    ) {
      out[writeIndex] = entityId;
      writeIndex += 1;
    }
  }
  out.length = writeIndex;
  return out;
}

export function decideIndividualCasualtyAssistance(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  medicalProfiles: TrustedIndividualMedicalProfileStore,
  traumaStore: IndividualTraumaticWoundStore,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot,
  actionStore: IndividualCombatActionStore,
  moraleStates: UnitMoraleMovementStateSource,
  queryStore: IndividualMedicalLocalQueryStore,
  assistanceStore: IndividualCasualtyAssistanceStore,
  groupStore: CasualtyDragGroupStore,
  tick: number,
  buffers: CasualtyAssistanceDecisionBuffers,
  options: CasualtyAssistanceDecisionOptions = {},
): CasualtyAssistanceDecisionResult {
  validateEntityCounts(world.entityCount, identityStore, formationStore,
    lifecycleStore, medicalProfiles, traumaStore, ordinaryParticipation,
    actionStore, queryStore, assistanceStore, groupStore);
  assertNonNegativeSafeInteger(tick, "tick");
  const assistance = asAssistanceStore(assistanceStore);
  const groups = asGroupStore(groupStore);
  const requested = buffers.rescueRequestedRecords;
  const started = buffers.groupStartedRecords;
  const noRescue = buffers.noRescueRecords;
  requested.length = 0;
  started.length = 0;
  noRescue.length = 0;
  const patients: PatientCandidate[] = [];
  const pointScratch: number[] = [];
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    if (
      (isIndividualDragEligiblePatient(lifecycleStore, entityId) ||
        options.isTerminalAwaitingComfort?.(entityId) === true) &&
      assistance.dragGroupIdByEntity[entityId] === NO_ENTITY &&
      assistance.stateByEntity[entityId] !== STATE_AT_TREATMENT_POSITION &&
      assistance.blockedReformationTickByEntity[entityId] !== tick
    ) {
      patients.push({
        entityId,
        exposure: countHostileThreatsNearPoint(
          world,
          queryStore,
          entityId,
          world.positionsX[entityId]!,
          world.positionsY[entityId]!,
          SAFE_DESTINATION_QUERY_RADIUS,
          pointScratch,
        ),
      });
    }
  }
  patients.sort(comparePatients);

  const localScratch: number[] = [];
  const helperScratch: HelperCandidate[] = [];
  let localCandidateCount = 0;
  for (let patientIndex = 0; patientIndex < patients.length; patientIndex += 1) {
    const patientEntityId = patients[patientIndex]!.entityId;
    if (assistance.stateByEntity[patientEntityId] === STATE_NONE) {
      assistance.stateByEntity[patientEntityId] = STATE_RESCUE_REQUESTED;
      assistance.rescueRequestedTickByEntity[patientEntityId] = tick;
      requested.push({ patientEntityId, tick });
    }
    const nearby = queryPreparedMedicalLocalEntityIdsWithinRadiusInto(
      queryStore,
      world,
      patientEntityId,
      LOCAL_CASUALTY_RESCUE_RADIUS,
      localScratch,
    );
    localCandidateCount += nearby.length;
    collectEligibleHelpers(
      world,
      identityStore,
      formationStore,
      lifecycleStore,
      medicalProfiles,
      traumaStore,
      ordinaryParticipation,
      actionStore,
      moraleStates,
      queryStore,
      assistance,
      patientEntityId,
      nearby,
      options,
      helperScratch,
    );
    helperScratch.sort(compareHelpers);
    const sameUnitPhysick = firstPhysick(helperScratch, true);
    const sameUnitOrdinary = firstTwoOrdinary(helperScratch, true);
    const localPhysick = firstPhysick(helperScratch, false);
    const localOrdinary = firstTwoOrdinary(helperScratch, false);
    let helperKind: CasualtyDragHelperKind | undefined;
    let helperEntityIds: readonly number[] | undefined;
    if (sameUnitPhysick !== undefined) {
      helperKind = "physick";
      helperEntityIds = [sameUnitPhysick.entityId];
    } else if (sameUnitOrdinary.length >= 2) {
      helperKind = "twoOrdinaryFighters";
      helperEntityIds = [
        sameUnitOrdinary[0]!.entityId,
        sameUnitOrdinary[1]!.entityId,
      ];
    } else if (localPhysick !== undefined) {
      helperKind = "physick";
      helperEntityIds = [localPhysick.entityId];
    } else if (localOrdinary.length >= 2) {
      helperKind = "twoOrdinaryFighters";
      helperEntityIds = [localOrdinary[0]!.entityId, localOrdinary[1]!.entityId];
    } else {
      noRescue.push({
        patientEntityId,
        reason: localOrdinary.length === 1
          ? "onlyOneOrdinaryHelper"
          : "noEligibleHelpers",
        tick,
      });
      continue;
    }
    helperEntityIds = helperEntityIds.slice().sort((left, right) => left - right);
    const destination = selectSafeDestination(
      world,
      identityStore,
      formationStore,
      lifecycleStore,
      medicalProfiles,
      traumaStore,
      actionStore,
      moraleStates,
      queryStore,
      assistance,
      patientEntityId,
      helperKind === "physick" ? helperEntityIds[0]! : NO_ENTITY,
      options,
      pointScratch,
    );
    const groupId = groups.nextGroupId;
    groups.nextGroupId += 1;
    const group: InternalCasualtyDragGroupRecord = {
      groupId,
      patientEntityId,
      patientKind: getIndividualCharacterLifecycleState(lifecycleStore, patientEntityId) === "dying"
        ? "dying"
        : "terminalComfort",
      helperKind,
      helperEntityIds: Object.freeze(helperEntityIds.slice()),
      destinationX: destination.x,
      destinationY: destination.y,
      createdTick: tick,
      phase: "gathering",
      phaseEnteredTick: tick,
      dragSpeedRemainder: 0,
    };
    groups.activeGroups.push(group);
    reserveParticipant(
      assistance,
      patientEntityId,
      STATE_RESERVED_PATIENT,
      groupId,
      destination.x,
      destination.y,
      helperKind === "physick" ? helperEntityIds[0]! : NO_ENTITY,
      tick,
    );
    for (let helperIndex = 0; helperIndex < helperEntityIds.length; helperIndex += 1) {
      reserveParticipant(
        assistance,
        helperEntityIds[helperIndex]!,
        STATE_RESERVED_HELPER,
        groupId,
        destination.x,
        destination.y,
        NO_ENTITY,
        tick,
      );
    }
    started.push({
      groupId,
      patientEntityId,
      helperKind,
      helperEntityIds: group.helperEntityIds,
      destinationX: destination.x,
      destinationY: destination.y,
      tick,
    });
  }
  requested.sort(comparePatientRecords);
  started.sort(comparePatientRecords);
  noRescue.sort(comparePatientRecords);
  return {
    rescueRequestedRecords: requested,
    groupStartedRecords: started,
    noRescueRecords: noRescue,
    dragEligiblePatientCount: patients.length,
    localCandidateCount,
  };
}

export function releaseReachedSafetyDragGroup(
  assistanceStore: IndividualCasualtyAssistanceStore,
  groupStore: CasualtyDragGroupStore,
  handStore: IndividualDragHandCommitmentStore,
  groupId: number,
): CasualtyDragGroupRecord {
  const assistance = asAssistanceStore(assistanceStore);
  const groups = asGroupStore(groupStore);
  const hands = asHandStore(handStore);
  validateEntityCounts(assistance.entityCount, groups, hands);
  const index = groups.activeGroups.findIndex((group) => group.groupId === groupId);
  if (index < 0) throw new RangeError("Reached-safety drag group does not exist.");
  const group = groups.activeGroups[index]!;
  if (group.phase !== "reachedSafety") throw new RangeError("Only reached-safety drag groups may be released.");
  for (const helperId of group.helperEntityIds) {
    releaseParticipant(assistance, helperId);
    hands.occupiedByEntity[helperId] = 0;
    hands.committedHandsByEntity[helperId] = 0;
  }
  releaseParticipant(assistance, group.patientEntityId);
  assistance.stateByEntity[group.patientEntityId] = STATE_AT_TREATMENT_POSITION;
  assistance.destinationXByEntity[group.patientEntityId] = group.destinationX;
  assistance.destinationYByEntity[group.patientEntityId] = group.destinationY;
  groups.activeGroups.splice(index, 1);
  return group;
}

/** Clears a completed patient's treatment-position reservation without changing another participant. */
export function releaseIndividualTreatmentPositionReservation(
  store: IndividualCasualtyAssistanceStore,
  patientEntityId: number,
): void {
  const internal = asAssistanceStore(store);
  assertEntityId(patientEntityId, internal.entityCount);
  if (internal.stateByEntity[patientEntityId] !== STATE_AT_TREATMENT_POSITION) {
    throw new Error("Only a patient at a treatment position may release that reservation.");
  }
  releaseParticipant(internal, patientEntityId);
  internal.rescueRequestedTickByEntity[patientEntityId] = NO_ENTITY;
  internal.blockedReformationTickByEntity[patientEntityId] = NO_ENTITY;
}

export function projectCasualtyDragOrdinaryParticipation(
  groupStore: CasualtyDragGroupStore,
  snapshot: IndividualOrdinaryParticipationSnapshot,
): void {
  validateEntityCounts(snapshot.entityCount, groupStore);
  const groups = asGroupStore(groupStore).activeGroups;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex]!;
    if (group.phase === "cancelled") continue;
    for (let helperIndex = 0; helperIndex < group.helperEntityIds.length; helperIndex += 1) {
      setIndividualOrdinaryParticipationEligible(snapshot, group.helperEntityIds[helperIndex]!, false);
    }
  }
}

export function advanceCasualtyDragGroupsBeforeCombat(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  traumaStore: IndividualTraumaticWoundStore,
  moraleStates: UnitMoraleMovementStateSource,
  assistanceStore: IndividualCasualtyAssistanceStore,
  groupStore: CasualtyDragGroupStore,
  handStore: IndividualDragHandCommitmentStore,
  tick: number,
  buffers: CasualtyDragMovementBuffers,
  presenceStore: IndividualPlayerPresenceStore,
): CasualtyDragMovementResult {
  validateEntityCounts(world.entityCount, identityStore, formationStore, lifecycleStore,
    traumaStore, assistanceStore, groupStore, handStore);
  validateEntityCounts(world.entityCount, presenceStore);
  assertNonNegativeSafeInteger(tick, "tick");
  buffers.cancellationRecords.length = 0;
  buffers.draggingStartedRecords.length = 0;
  buffers.reachedSafetyRecords.length = 0;
  const groups = asGroupStore(groupStore);
  const assistance = asAssistanceStore(assistanceStore);
  const hands = asHandStore(handStore);
  let movedParticipantCount = 0;
  for (let index = 0; index < groups.activeGroups.length;) {
    const group = groups.activeGroups[index]!;
    for (const helperId of group.helperEntityIds) {
      hands.occupiedByEntity[helperId] = 1;
      hands.committedHandsByEntity[helperId] = group.phase === "gathering" ? 0 : group.helperKind === "physick" ? 2 : 1;
    }
    const invalidReason = validateGroup(group, identityStore, lifecycleStore, presenceStore, traumaStore, moraleStates);
    if (invalidReason !== undefined) {
      cancelGroup(group, invalidReason, tick, assistance, hands, groups, index, buffers.cancellationRecords);
      continue;
    }
    if (group.phase === "reachedSafety" || group.createdTick === tick) { index += 1; continue; }
    if (group.phase === "gathering") {
      let allReady = true;
      for (let helperIndex = 0; helperIndex < group.helperEntityIds.length; helperIndex += 1) {
        const helperId = group.helperEntityIds[helperIndex]!;
        if (!withinPickupRange(world, helperId, group.patientEntityId)) {
          if (applyIndividualExternalMovementIntent(world, formationStore, helperId,
            world.positionsX[group.patientEntityId]!, world.positionsY[group.patientEntityId]!, "gatherForCasualty")) movedParticipantCount += 1;
        }
        if (!withinPickupRange(world, helperId, group.patientEntityId)) allReady = false;
      }
      if (allReady) {
        resolveEffectiveGatheredDestination(world, group, assistance);
        group.phase = "dragging";
        group.phaseEnteredTick = tick;
        setGroupHandCommitment(group, hands);
        buffers.draggingStartedRecords.push({
          groupId: group.groupId,
          patientEntityId: group.patientEntityId,
          helperEntityIds: group.helperEntityIds,
          tick,
        });
      }
      index += 1;
      continue;
    }
    if (group.phase === "dragging" && group.phaseEnteredTick !== tick) {
      const destinationX = Math.round(group.destinationX);
      const destinationY = Math.round(group.destinationY);
      const patientId = group.patientEntityId;
      if (world.positionsX[patientId] === destinationX && world.positionsY[patientId] === destinationY) {
        reachSafety(group, tick, assistance, buffers.reachedSafetyRecords);
        index += 1;
        continue;
      }
      let slowestStep = Number.MAX_SAFE_INTEGER;
      for (const helperId of group.helperEntityIds) slowestStep = Math.min(slowestStep, getIndividualConfiguredMaxStep(formationStore, helperId));
      const scaled = slowestStep * INITIAL_DRAG_SPEED_FACTOR_NUMERATOR + group.dragSpeedRemainder;
      const maxStep = Math.floor(scaled / INITIAL_DRAG_SPEED_FACTOR_DENOMINATOR);
      group.dragSpeedRemainder = scaled % INITIAL_DRAG_SPEED_FACTOR_DENOMINATOR;
      const delta = sharedDragDelta(world, group, destinationX, destinationY, maxStep);
      if (delta.x !== 0 || delta.y !== 0) {
        const participants = [patientId, ...group.helperEntityIds];
        for (const entityId of participants) {
          if (applyIndividualExternalSharedMovementDelta(world, formationStore, entityId, delta.x, delta.y, "dragCasualty")) movedParticipantCount += 1;
        }
      }
      if (world.positionsX[patientId] === destinationX && world.positionsY[patientId] === destinationY) {
        reachSafety(group, tick, assistance, buffers.reachedSafetyRecords);
      }
    }
    index += 1;
  }
  let gatheringGroupCount = 0, draggingGroupCount = 0, reachedSafetyGroupCount = 0;
  for (const group of groups.activeGroups) {
    if (group.phase === "gathering") gatheringGroupCount += 1;
    else if (group.phase === "dragging") draggingGroupCount += 1;
    else if (group.phase === "reachedSafety") reachedSafetyGroupCount += 1;
  }
  return { cancellationRecords: buffers.cancellationRecords, draggingStartedRecords: buffers.draggingStartedRecords,
    reachedSafetyRecords: buffers.reachedSafetyRecords,
    gatheringGroupCount, draggingGroupCount, reachedSafetyGroupCount, movedParticipantCount };
}

export function refreshCasualtyDragMovementFinalPhaseCounts(
  groupStore: CasualtyDragGroupStore,
  result: CasualtyDragMovementResult,
): CasualtyDragMovementResult {
  let gatheringGroupCount = 0, draggingGroupCount = 0, reachedSafetyGroupCount = 0;
  for (const group of asGroupStore(groupStore).activeGroups) {
    if (group.phase === "gathering") gatheringGroupCount += 1;
    else if (group.phase === "dragging") draggingGroupCount += 1;
    else if (group.phase === "reachedSafety") reachedSafetyGroupCount += 1;
  }
  return { ...result, gatheringGroupCount, draggingGroupCount, reachedSafetyGroupCount };
}

export function cancelCasualtyDragGroupsFromPostCombatEvidence(
  identityStore: UnitIdentityStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  traumaStore: IndividualTraumaticWoundStore,
  moraleStates: UnitMoraleMovementStateSource,
  assistanceStore: IndividualCasualtyAssistanceStore,
  groupStore: CasualtyDragGroupStore,
  handStore: IndividualDragHandCommitmentStore,
  gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  tick: number,
  cancellationRecords: CasualtyDragCancellationRecord[],
  presenceStore: IndividualPlayerPresenceStore,
): void {
  const groups = asGroupStore(groupStore);
  const assistance = asAssistanceStore(assistanceStore);
  const hands = asHandStore(handStore);
  for (let index = 0; index < groups.activeGroups.length;) {
    const group = groups.activeGroups[index]!;
    let reason = validateGroup(group, identityStore, lifecycleStore, presenceStore, traumaStore, moraleStates);
    if (reason === undefined && hasAcceptedHelperHit(group, gateDecisions)) reason = "helperHit";
    if (reason !== undefined) { cancelGroup(group, reason, tick, assistance, hands, groups, index, cancellationRecords); continue; }
    index += 1;
  }
}

export function promoteTerminalCitizenCasualtyDragGroups(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  presenceStore: IndividualPlayerPresenceStore,
  groupStore: CasualtyDragGroupStore,
): number {
  validateEntityCounts(lifecycleStore.entityCount, lifecycleStore, presenceStore, groupStore);
  let promotedCount = 0;
  for (const group of asGroupStore(groupStore).activeGroups) {
    if (group.patientKind !== "dying") continue;
    if (getIndividualCharacterLifecycleState(lifecycleStore, group.patientEntityId) !== "terminal" ||
      getIndividualPlayerPresenceState(presenceStore, group.patientEntityId) !== "terminalAwaitingComfort") continue;
    group.patientKind = "terminalComfort";
    promotedCount += 1;
  }
  return promotedCount;
}

function validateGroup(group: InternalCasualtyDragGroupRecord, identityStore: UnitIdentityStore, lifecycleStore: IndividualCasualtyLifecycleStore, presenceStore: IndividualPlayerPresenceStore, traumaStore: IndividualTraumaticWoundStore, moraleStates: UnitMoraleMovementStateSource): CasualtyDragCancellationReason | undefined {
  const patientLifecycle = getIndividualCharacterLifecycleState(lifecycleStore, group.patientEntityId);
  if (group.patientKind === "dying" ? patientLifecycle !== "dying" :
    patientLifecycle !== "terminal" ||
      getIndividualPlayerPresenceState(presenceStore, group.patientEntityId) !== "terminalAwaitingComfort") return "patientInvalid";
  for (const helperId of group.helperEntityIds) {
    if (getIndividualCharacterLifecycleState(lifecycleStore, helperId) !== "active" ||
      getIndividualTraumaticWoundInspection(traumaStore, helperId).state !== "none" ||
      moraleStates.get(getUnitIdForEntity(identityStore, helperId)) === "routing") return "helperInvalid";
  }
  return undefined;
}

function withinPickupRange(world: WorldState, left: number, right: number): boolean {
  const dx = world.positionsX[left]! - world.positionsX[right]!;
  const dy = world.positionsY[left]! - world.positionsY[right]!;
  return dx * dx + dy * dy <= CASUALTY_DRAG_PICKUP_RANGE * CASUALTY_DRAG_PICKUP_RANGE;
}

function resolveEffectiveGatheredDestination(
  world: WorldState,
  group: InternalCasualtyDragGroupRecord,
  assistance: InternalIndividualCasualtyAssistanceStore,
): void {
  const patientX = world.positionsX[group.patientEntityId]!;
  const patientY = world.positionsY[group.patientEntityId]!;
  let minimumDeltaX = -patientX;
  let maximumDeltaX = world.bounds.width - 1 - patientX;
  let minimumDeltaY = -patientY;
  let maximumDeltaY = world.bounds.height - 1 - patientY;
  for (const helperId of group.helperEntityIds) {
    const helperX = world.positionsX[helperId]!;
    const helperY = world.positionsY[helperId]!;
    minimumDeltaX = Math.max(minimumDeltaX, -helperX);
    maximumDeltaX = Math.min(maximumDeltaX, world.bounds.width - 1 - helperX);
    minimumDeltaY = Math.max(minimumDeltaY, -helperY);
    maximumDeltaY = Math.min(maximumDeltaY, world.bounds.height - 1 - helperY);
  }
  const requestedDeltaX = Math.round(group.destinationX) - patientX;
  const requestedDeltaY = Math.round(group.destinationY) - patientY;
  group.destinationX = patientX + Math.max(minimumDeltaX, Math.min(maximumDeltaX, requestedDeltaX));
  group.destinationY = patientY + Math.max(minimumDeltaY, Math.min(maximumDeltaY, requestedDeltaY));
  assistance.destinationXByEntity[group.patientEntityId] = group.destinationX;
  assistance.destinationYByEntity[group.patientEntityId] = group.destinationY;
  for (const helperId of group.helperEntityIds) {
    assistance.destinationXByEntity[helperId] = group.destinationX;
    assistance.destinationYByEntity[helperId] = group.destinationY;
  }
}

function sharedDragDelta(world: WorldState, group: InternalCasualtyDragGroupRecord, goalX: number, goalY: number, maxStep: number): { x: number; y: number } {
  if (maxStep <= 0) return { x: 0, y: 0 };
  const px = world.positionsX[group.patientEntityId]!, py = world.positionsY[group.patientEntityId]!;
  const dx = goalX - px, dy = goalY - py;
  const distance = Math.hypot(dx, dy);
  let x = distance <= maxStep ? dx : Math.trunc(dx / distance * maxStep);
  let y = distance <= maxStep ? dy : Math.trunc(dy / distance * maxStep);
  if (x === 0 && y === 0 && distance > 0) Math.abs(dx) >= Math.abs(dy) ? x = Math.sign(dx) : y = Math.sign(dy);
  const participantIds = [group.patientEntityId, ...group.helperEntityIds];
  for (const entityId of participantIds) {
    x = Math.max(x, -world.positionsX[entityId]!);
    x = Math.min(x, world.bounds.width - 1 - world.positionsX[entityId]!);
    y = Math.max(y, -world.positionsY[entityId]!);
    y = Math.min(y, world.bounds.height - 1 - world.positionsY[entityId]!);
  }
  return { x, y };
}

function setGroupHandCommitment(group: InternalCasualtyDragGroupRecord, hands: InternalIndividualDragHandCommitmentStore): void {
  for (const helperId of group.helperEntityIds) { hands.occupiedByEntity[helperId] = 1; hands.committedHandsByEntity[helperId] = group.helperKind === "physick" ? 2 : 1; }
}
function reachSafety(group: InternalCasualtyDragGroupRecord, tick: number, assistance: InternalIndividualCasualtyAssistanceStore, records: CasualtyDragReachedSafetyRecord[]): void {
  group.phase = "reachedSafety"; group.phaseEnteredTick = tick;
  assistance.stateByEntity[group.patientEntityId] = STATE_AT_TREATMENT_POSITION;
  for (const helperId of group.helperEntityIds) assistance.stateByEntity[helperId] = STATE_AT_TREATMENT_POSITION;
  records.push({ groupId: group.groupId, patientEntityId: group.patientEntityId, tick });
}
function hasAcceptedHelperHit(group: InternalCasualtyDragGroupRecord, decisions: readonly IndividualLandedHitGateDecisionRecord[]): boolean {
  for (const decision of decisions) if (decision.outcome === "accepted" && group.helperEntityIds.includes(decision.targetEntityId)) return true;
  return false;
}
function cancelGroup(group: InternalCasualtyDragGroupRecord, reason: CasualtyDragCancellationReason, tick: number, assistance: InternalIndividualCasualtyAssistanceStore, hands: InternalIndividualDragHandCommitmentStore, groups: InternalCasualtyDragGroupStore, index: number, records: CasualtyDragCancellationRecord[]): void {
  group.phase = "cancelled"; group.phaseEnteredTick = tick;
  for (const helperId of group.helperEntityIds) { releaseParticipant(assistance, helperId); hands.occupiedByEntity[helperId] = 0; hands.committedHandsByEntity[helperId] = 0; }
  releaseParticipant(assistance, group.patientEntityId);
  assistance.stateByEntity[group.patientEntityId] = STATE_RESCUE_REQUESTED;
  assistance.blockedReformationTickByEntity[group.patientEntityId] = tick;
  groups.activeGroups.splice(index, 1);
  records.push({ groupId: group.groupId, patientEntityId: group.patientEntityId, reason, tick });
}
function releaseParticipant(store: InternalIndividualCasualtyAssistanceStore, entityId: number): void {
  store.stateByEntity[entityId] = STATE_NONE; store.dragGroupIdByEntity[entityId] = NO_ENTITY;
  store.destinationXByEntity[entityId] = NO_ENTITY; store.destinationYByEntity[entityId] = NO_ENTITY;
  store.claimedPhysickByEntity[entityId] = NO_ENTITY; store.reservedTickByEntity[entityId] = NO_ENTITY;
}
function asHandStore(store: IndividualDragHandCommitmentStore): InternalIndividualDragHandCommitmentStore { return store as InternalIndividualDragHandCommitmentStore; }

function collectEligibleHelpers(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  medicalProfiles: TrustedIndividualMedicalProfileStore,
  traumaStore: IndividualTraumaticWoundStore,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot,
  actionStore: IndividualCombatActionStore,
  moraleStates: UnitMoraleMovementStateSource,
  queryStore: IndividualMedicalLocalQueryStore,
  assistance: InternalIndividualCasualtyAssistanceStore,
  patientEntityId: number,
  nearby: readonly number[],
  options: CasualtyAssistanceDecisionOptions,
  out: HelperCandidate[],
): void {
  out.length = 0;
  const patientFaction = getPreparedMedicalFactionId(queryStore, patientEntityId);
  const patientUnit = getUnitIdForEntity(identityStore, patientEntityId);
  const patientX = world.positionsX[patientEntityId]!;
  const patientY = world.positionsY[patientEntityId]!;
  for (let index = 0; index < nearby.length; index += 1) {
    const entityId = nearby[index]!;
    if (entityId === patientEntityId) continue;
    const unitId = getUnitIdForEntity(identityStore, entityId);
    if (
      getPreparedMedicalFactionId(queryStore, entityId) !== patientFaction ||
      getIndividualCharacterLifecycleState(lifecycleStore, entityId) !== "active" ||
      getIndividualTraumaticWoundInspection(traumaStore, entityId).state !== "none" ||
      moraleStates.get(unitId) === "routing" ||
      getIndividualCombatActionState(actionStore, entityId) !== "ready" ||
      options.isTreating?.(entityId) === true ||
      options.isTreatmentParticipant?.(entityId) === true ||
      options.isUnavailable?.(entityId) === true ||
      assistance.dragGroupIdByEntity[entityId] !== NO_ENTITY
    ) continue;
    const isPhysick = getTrustedIndividualMedicalProfile(
      medicalProfiles,
      entityId,
    ).hasPhysick;
    if (isPhysick && options.hasClaimedPatient?.(entityId) === true) continue;
    if (
      !isPhysick &&
      !isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId)
    ) continue;
    const deltaX = world.positionsX[entityId]! - patientX;
    const deltaY = world.positionsY[entityId]! - patientY;
    out.push({
      entityId,
      isPhysick,
      sameUnit: unitId === patientUnit,
      distanceSquared: deltaX * deltaX + deltaY * deltaY,
      pressure: getIndividualPressure(formationStore, entityId),
    });
  }
}

function selectSafeDestination(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  medicalProfiles: TrustedIndividualMedicalProfileStore,
  traumaStore: IndividualTraumaticWoundStore,
  actionStore: IndividualCombatActionStore,
  moraleStates: UnitMoraleMovementStateSource,
  queryStore: IndividualMedicalLocalQueryStore,
  assistance: InternalIndividualCasualtyAssistanceStore,
  patientEntityId: number,
  travellingPhysickEntityId: number,
  options: CasualtyAssistanceDecisionOptions,
  scratch: number[],
): { readonly x: number; readonly y: number } {
  const unitId = getUnitIdForEntity(identityStore, patientEntityId);
  const heading = getUnitHeading(formationStore, unitId);
  const rearX = -heading.x;
  const rearY = -heading.y;
  const leftX = -rearY;
  const leftY = rearX;
  const diagonalScale = Math.SQRT1_2;
  const directions = [
    [0, 0],
    [rearX, rearY],
    [(rearX + leftX) * diagonalScale, (rearY + leftY) * diagonalScale],
    [(rearX - leftX) * diagonalScale, (rearY - leftY) * diagonalScale],
  ] as const;
  const patientX = world.positionsX[patientEntityId]!;
  const patientY = world.positionsY[patientEntityId]!;
  let bestX = patientX;
  let bestY = patientY;
  let bestExposure = Number.MAX_SAFE_INTEGER;
  let bestSupport = -1;
  let bestDistanceSquared = Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < directions.length; index += 1) {
    const direction = directions[index]!;
    const x = clampCoordinate(
      patientX + direction[0] * MAXIMUM_CASUALTY_EXTRACTION_DISTANCE,
      world.bounds.width,
    );
    const y = clampCoordinate(
      patientY + direction[1] * MAXIMUM_CASUALTY_EXTRACTION_DISTANCE,
      world.bounds.height,
    );
    const exposure = countHostileThreatsNearPoint(
      world, queryStore, patientEntityId, x, y,
      SAFE_DESTINATION_QUERY_RADIUS, scratch,
    );
    const support = countAvailableAlliedPhysicksNearPoint(
      world, identityStore, lifecycleStore, medicalProfiles, traumaStore,
      actionStore, moraleStates, queryStore, assistance, patientEntityId,
      travellingPhysickEntityId, x, y, SAFE_DESTINATION_QUERY_RADIUS,
      options, scratch,
    );
    const deltaX = x - patientX;
    const deltaY = y - patientY;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (
      exposure < bestExposure ||
      (exposure === bestExposure && support > bestSupport) ||
      (exposure === bestExposure && support === bestSupport &&
        distanceSquared < bestDistanceSquared)
    ) {
      bestExposure = exposure;
      bestSupport = support;
      bestDistanceSquared = distanceSquared;
      bestX = x;
      bestY = y;
    }
  }
  return { x: bestX, y: bestY };
}

function countHostileThreatsNearPoint(
  world: WorldState,
  queryStore: IndividualMedicalLocalQueryStore,
  sourceEntityId: number,
  x: number,
  y: number,
  radius: number,
  scratch: number[],
): number {
  const sourceFaction = getPreparedMedicalFactionId(queryStore, sourceEntityId);
  const candidates = queryPreparedMedicalLocalEntityIdsNearPointInto(
    queryStore, world, x, y, radius, scratch,
  );
  let count = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const entityId = candidates[index]!;
    if (
      getPreparedMedicalFactionId(queryStore, entityId) !== sourceFaction &&
      isPreparedMedicalThreatEligible(queryStore, entityId)
    ) count += 1;
  }
  return count;
}

function countAvailableAlliedPhysicksNearPoint(
  world: WorldState,
  identityStore: UnitIdentityStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  medicalProfiles: TrustedIndividualMedicalProfileStore,
  traumaStore: IndividualTraumaticWoundStore,
  actionStore: IndividualCombatActionStore,
  moraleStates: UnitMoraleMovementStateSource,
  queryStore: IndividualMedicalLocalQueryStore,
  assistance: InternalIndividualCasualtyAssistanceStore,
  sourceEntityId: number,
  travellingPhysickEntityId: number,
  x: number,
  y: number,
  radius: number,
  options: CasualtyAssistanceDecisionOptions,
  scratch: number[],
): number {
  const sourceFaction = getPreparedMedicalFactionId(queryStore, sourceEntityId);
  const candidates = queryPreparedMedicalLocalEntityIdsNearPointInto(
    queryStore, world, x, y, radius, scratch,
  );
  const terminalComfort = getIndividualCharacterLifecycleState(
    lifecycleStore,
    sourceEntityId,
  ) === "terminal";
  let count = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const entityId = candidates[index]!;
    if (
      entityId !== travellingPhysickEntityId &&
      getPreparedMedicalFactionId(queryStore, entityId) === sourceFaction &&
      getIndividualCharacterLifecycleState(lifecycleStore, entityId) === "active" &&
      (terminalComfort
        ? getTrustedIndividualMedicalProfile(medicalProfiles, entityId).hasPhysick
        : getTrustedIndividualMedicalProfile(medicalProfiles, entityId).hasChirurgeon) &&
      moraleStates.get(getUnitIdForEntity(identityStore, entityId)) !== "routing" &&
      getIndividualTraumaticWoundInspection(traumaStore, entityId).state === "none" &&
      getIndividualCombatActionState(actionStore, entityId) === "ready" &&
      options.isTreating?.(entityId) !== true &&
      options.isTreatmentParticipant?.(entityId) !== true &&
      options.hasClaimedPatient?.(entityId) !== true &&
      options.isUnavailable?.(entityId) !== true &&
      assistance.dragGroupIdByEntity[entityId] === NO_ENTITY
    ) count += 1;
  }
  return count;
}

function reserveParticipant(
  store: InternalIndividualCasualtyAssistanceStore,
  entityId: number,
  state: number,
  groupId: number,
  destinationX: number,
  destinationY: number,
  claimedPhysick: number,
  tick: number,
): void {
  store.stateByEntity[entityId] = state;
  store.dragGroupIdByEntity[entityId] = groupId;
  store.destinationXByEntity[entityId] = destinationX;
  store.destinationYByEntity[entityId] = destinationY;
  store.claimedPhysickByEntity[entityId] = claimedPhysick;
  store.reservedTickByEntity[entityId] = tick;
}

function firstPhysick(
  candidates: readonly HelperCandidate[],
  sameUnitOnly: boolean,
): HelperCandidate | undefined {
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    if (candidate.isPhysick && (!sameUnitOnly || candidate.sameUnit)) {
      return candidate;
    }
  }
  return undefined;
}

function firstTwoOrdinary(
  candidates: readonly HelperCandidate[],
  sameUnitOnly: boolean,
): HelperCandidate[] {
  const result: HelperCandidate[] = [];
  for (let index = 0; index < candidates.length && result.length < 2; index += 1) {
    const candidate = candidates[index]!;
    if (
      !candidate.isPhysick &&
      (!sameUnitOnly || candidate.sameUnit)
    ) result.push(candidate);
  }
  return result;
}

function compareHelpers(left: HelperCandidate, right: HelperCandidate): number {
  if (left.distanceSquared !== right.distanceSquared) {
    return left.distanceSquared - right.distanceSquared;
  }
  if (left.pressure !== right.pressure) return left.pressure - right.pressure;
  return left.entityId - right.entityId;
}

function comparePatients(left: PatientCandidate, right: PatientCandidate): number {
  if (left.exposure !== right.exposure) return right.exposure - left.exposure;
  return left.entityId - right.entityId;
}

function comparePatientRecords(
  left: { readonly patientEntityId: number },
  right: { readonly patientEntityId: number },
): number {
  return left.patientEntityId - right.patientEntityId;
}

function assistanceStateFromIdentity(identity: number): IndividualCasualtyAssistanceState {
  if (identity === STATE_NONE) return "none";
  if (identity === STATE_RESCUE_REQUESTED) return "rescueRequested";
  if (identity === STATE_RESERVED_PATIENT) return "reservedPatient";
  if (identity === STATE_RESERVED_HELPER) return "reservedHelper";
  if (identity === STATE_AT_TREATMENT_POSITION) return "atTreatmentPosition";
  throw new RangeError("Unknown casualty-assistance state identity.");
}

function asAssistanceStore(
  store: IndividualCasualtyAssistanceStore,
): InternalIndividualCasualtyAssistanceStore {
  return store as InternalIndividualCasualtyAssistanceStore;
}

function asGroupStore(store: CasualtyDragGroupStore): InternalCasualtyDragGroupStore {
  return store as InternalCasualtyDragGroupStore;
}

function clampCoordinate(value: number, extent: number): number {
  return Math.max(0, Math.min(extent - 1, value));
}

function validateEntityCounts(entityCount: number, ...stores: readonly { readonly entityCount: number }[]): void {
  for (let index = 0; index < stores.length; index += 1) {
    if (stores[index]!.entityCount !== entityCount) {
      throw new RangeError("Casualty-assistance stores must share entityCount.");
    }
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Casualty-assistance entity ID is out of bounds.");
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
