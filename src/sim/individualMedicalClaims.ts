import { getIndividualCombatActionState, type IndividualCombatActionStore } from "./individualCombatAction";
import { applyIndividualExternalMovementIntent, type FormationBehaviourStore } from "./formationBehaviour";
import {
  CASUALTY_DRAG_PICKUP_RANGE,
  getActiveCasualtyDragGroups,
  getIndividualCasualtyAssistanceInspection,
  releaseReachedSafetyDragGroup,
  type CasualtyDragGroupStore,
  type IndividualCasualtyAssistanceStore,
  type IndividualDragHandCommitmentStore,
} from "./individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
  type IndividualGlobalHitStore,
} from "./individualGlobalHits";
import type { IndividualDefenceHandAvailabilitySource } from "./individualMeleeDefence";
import {
  getAuthoritativeIndividualMedicalUrgency,
  getIndividualMedicalUrgencyInspection,
  queryPreparedMedicalLocalEntityIdsWithinRadiusInto,
  type IndividualMedicalLocalQueryStore,
  type IndividualMedicalUrgencyStore,
} from "./individualMedicalReadModel";
import type { IndividualTreatmentReassessmentRequest } from "./individualTreatmentAction";
import {
  getHighestPriorityIndividualLimbDisability,
  type IndividualLimbDisabilityStore,
} from "./individualLimbDisability";
import {
  getIndividualAvailableGenericHerbs,
  getTrustedIndividualMedicalProfile,
  type IndividualGenericHerbStore,
  type TrustedIndividualMedicalProfileStore,
} from "./individualMedicalProfile";
import { getIndividualTraumaticWoundInspection, type IndividualTraumaticWoundStore } from "./individualTraumaticWound";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import { setIndividualOrdinaryParticipationEligible, type IndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import { getFactionIdForUnit, getUnitIdForEntity, type UnitIdentityStore } from "./unitIdentity";
import type { WorldState } from "./types";

export type IndividualMedicalClaimNeed = "dying" | "traumaticWound" | "livingMissingHits" | "limbDisability" | "terminalComfort";
export interface IndividualMedicalClaimStore { readonly entityCount: number; }
interface InternalClaimStore extends IndividualMedicalClaimStore {
  readonly patientByPhysick: Int32Array;
  readonly physickByPatient: Int32Array;
  readonly claimedTickByPatient: Float64Array;
  readonly needByPatient: Uint8Array;
  readonly committedByPhysick: Uint8Array;
  readonly defenceHandAvailability: IndividualDefenceHandAvailabilitySource;
}
export interface IndividualMedicalClaimInspection { readonly patientEntityId: number; readonly physickEntityId: number; readonly claimedTick: number; readonly need: IndividualMedicalClaimNeed | "none"; }
export interface IndividualMedicalClaimRecord { readonly physickEntityId: number; readonly patientEntityId: number; readonly need: IndividualMedicalClaimNeed; readonly tick: number; readonly origin: "triage" | "soloCarrier" | "handoff"; }
export interface IndividualMedicalHandoffRecord { readonly groupId: number; readonly patientEntityId: number; readonly physickEntityId: number; readonly releasedHelperEntityIds: readonly number[]; readonly tick: number; }
export interface IndividualMedicalSafeReleaseRecord { readonly groupId: number; readonly patientEntityId: number; readonly releasedHelperEntityIds: readonly number[]; readonly tick: number; }
export interface IndividualMedicalStaleClaimRecord { readonly physickEntityId: number; readonly patientEntityId: number; readonly tick: number; }
export interface IndividualMedicalClaimBuffers { readonly claimRecords: IndividualMedicalClaimRecord[]; readonly handoffRecords: IndividualMedicalHandoffRecord[]; readonly safeReleaseRecords: IndividualMedicalSafeReleaseRecord[]; readonly staleClaimRecords: IndividualMedicalStaleClaimRecord[]; }
export interface IndividualMedicalClaimResult { readonly claimRecords: readonly IndividualMedicalClaimRecord[]; readonly handoffRecords: readonly IndividualMedicalHandoffRecord[]; readonly safeReleaseRecords: readonly IndividualMedicalSafeReleaseRecord[]; readonly staleClaimRecords: readonly IndividualMedicalStaleClaimRecord[]; readonly activeClaimCount: number; readonly localCandidateCount: number; }
export interface IndividualMedicalClaimOptions {
  readonly isTreating?: (entityId: number) => boolean;
  readonly isTreatmentParticipant?: (entityId: number) => boolean;
}
export interface IndividualMedicalClaimCommitmentOptions {
  readonly isTreating?: (entityId: number) => boolean;
  readonly isTreatmentParticipant?: (entityId: number) => boolean;
}

interface ActionBoundaryPatientCandidate {
  readonly entityId: number;
  readonly need: IndividualMedicalClaimNeed;
  readonly urgencyPriority: number;
  readonly distanceSquared: number;
  readonly previousPatient: boolean;
}

const NONE = -1;
const CLAIM_RADIUS = 192;
export const PHYSICK_HANDOFF_RANGE = CASUALTY_DRAG_PICKUP_RANGE;
const NEED_NONE = 0, NEED_DYING = 1, NEED_TRAUMA = 2, NEED_MISSING = 3,
  NEED_LIMB = 4;

export function createIndividualMedicalClaimStore(entityCount: number): IndividualMedicalClaimStore {
  if (!Number.isSafeInteger(entityCount) || entityCount <= 0) throw new RangeError("entityCount must be a positive safe integer.");
  const patientByPhysick = new Int32Array(entityCount); patientByPhysick.fill(NONE);
  const physickByPatient = new Int32Array(entityCount); physickByPatient.fill(NONE);
  const ticks = new Float64Array(entityCount); ticks.fill(NONE);
  const committedByPhysick = new Uint8Array(entityCount);
  const defenceHandAvailability: IndividualDefenceHandAvailabilitySource = {
    entityCount,
    getFreeHands(entityId: number): number | undefined {
      assertEntity(entityId, entityCount);
      return committedByPhysick[entityId] === 0 ? undefined : 2;
    },
  };
  return {
    entityCount,
    patientByPhysick,
    physickByPatient,
    claimedTickByPatient: ticks,
    needByPatient: new Uint8Array(entityCount),
    committedByPhysick,
    defenceHandAvailability,
  } as InternalClaimStore;
}
export function createIndividualMedicalClaimBuffers(): IndividualMedicalClaimBuffers { return { claimRecords: [], handoffRecords: [], safeReleaseRecords: [], staleClaimRecords: [] }; }
export function getIndividualMedicalClaimInspection(store: IndividualMedicalClaimStore, entityId: number): IndividualMedicalClaimInspection {
  const internal = store as InternalClaimStore; assertEntity(entityId, internal.entityCount);
  return { patientEntityId: internal.patientByPhysick[entityId]!, physickEntityId: internal.physickByPatient[entityId]!, claimedTick: internal.claimedTickByPatient[entityId]!, need: needFromId(internal.needByPatient[entityId]!) };
}
export function hasIndividualMedicalPatientClaim(store: IndividualMedicalClaimStore, physickEntityId: number): boolean {
  const internal = store as InternalClaimStore; assertEntity(physickEntityId, internal.entityCount);
  return internal.patientByPhysick[physickEntityId] !== NONE;
}
export function getIndividualMedicalClaimedPatientEntityId(store: IndividualMedicalClaimStore, healerEntityId: number): number {
  const internal = store as InternalClaimStore; assertEntity(healerEntityId, internal.entityCount);
  return internal.patientByPhysick[healerEntityId]!;
}
export function getIndividualMedicalClaimNeed(store: IndividualMedicalClaimStore, patientEntityId: number): IndividualMedicalClaimNeed | "none" {
  const internal = store as InternalClaimStore; assertEntity(patientEntityId, internal.entityCount);
  return needFromId(internal.needByPatient[patientEntityId]!);
}
export function isIndividualMedicalClaimOwnedBy(store: IndividualMedicalClaimStore, healerEntityId: number, patientEntityId: number): boolean {
  const internal = store as InternalClaimStore;
  assertEntity(healerEntityId, internal.entityCount); assertEntity(patientEntityId, internal.entityCount);
  return internal.patientByPhysick[healerEntityId] === patientEntityId && internal.physickByPatient[patientEntityId] === healerEntityId;
}
export function releaseIndividualMedicalClaim(
  store: IndividualMedicalClaimStore,
  healerEntityId: number,
  patientEntityId: number,
): void {
  const internal = store as InternalClaimStore;
  assertEntity(healerEntityId, internal.entityCount);
  assertEntity(patientEntityId, internal.entityCount);
  if (
    internal.patientByPhysick[healerEntityId] !== patientEntityId ||
    internal.physickByPatient[patientEntityId] !== healerEntityId
  ) throw new Error("Only the matching medical owner may release a claim.");
  clearClaim(internal, healerEntityId, patientEntityId);
}

export function getIndividualMedicalClaimCommitmentDefenceHandAvailability(
  store: IndividualMedicalClaimStore,
): IndividualDefenceHandAvailabilitySource {
  return (store as InternalClaimStore).defenceHandAvailability;
}

export function clearIndividualMedicalClaimCommitmentDefenceOverride(
  store: IndividualMedicalClaimStore,
  physickEntityId: number,
): void {
  const internal = store as InternalClaimStore;
  assertEntity(physickEntityId, internal.entityCount);
  internal.committedByPhysick[physickEntityId] = 0;
}

export function projectIndividualMedicalClaimCommitmentOrdinaryParticipation(
  world: WorldState,
  identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  hits: IndividualGlobalHitStore,
  profiles: TrustedIndividualMedicalProfileStore,
  herbs: IndividualGenericHerbStore,
  trauma: IndividualTraumaticWoundStore,
  limbs: IndividualLimbDisabilityStore,
  actions: IndividualCombatActionStore,
  morale: UnitMoraleMovementStateSource,
  assistance: IndividualCasualtyAssistanceStore,
  claims: IndividualMedicalClaimStore,
  tick: number,
  snapshot: IndividualOrdinaryParticipationSnapshot,
  options: IndividualMedicalClaimCommitmentOptions = {},
): void {
  validateCounts(world.entityCount, identity, lifecycle, presence, hits, profiles,
    herbs, trauma, limbs, actions, assistance, claims, snapshot);
  const internal = claims as InternalClaimStore;
  for (let physickId = 0; physickId < internal.entityCount; physickId += 1) {
    const committed = isClaimedPhysickCommitted(identity, lifecycle, presence, hits, profiles,
      herbs, trauma, limbs, actions, morale, assistance, internal, physickId, tick,
      options);
    internal.committedByPhysick[physickId] = committed ? 1 : 0;
    if (committed) {
      setIndividualOrdinaryParticipationEligible(snapshot, physickId, false);
    }
  }
}

export function advanceIndividualMedicalClaimApproachMovementOneTick(
  world: WorldState,
  formation: FormationBehaviourStore,
  identity: UnitIdentityStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  hits: IndividualGlobalHitStore,
  profiles: TrustedIndividualMedicalProfileStore,
  herbs: IndividualGenericHerbStore,
  trauma: IndividualTraumaticWoundStore,
  limbs: IndividualLimbDisabilityStore,
  actions: IndividualCombatActionStore,
  morale: UnitMoraleMovementStateSource,
  assistance: IndividualCasualtyAssistanceStore,
  claims: IndividualMedicalClaimStore,
  tick: number,
  options: IndividualMedicalClaimCommitmentOptions = {},
): number {
  validateCounts(world.entityCount, formation, identity, lifecycle, presence, hits,
    profiles, herbs, trauma, limbs, actions, assistance, claims);
  const internal = claims as InternalClaimStore;
  let movedCount = 0;
  for (let physickId = 0; physickId < internal.entityCount; physickId += 1) {
    if (!isClaimedPhysickCommitted(identity, lifecycle, presence, hits, profiles,
      herbs, trauma, limbs, actions, morale, assistance, internal, physickId, tick,
      options)) continue;
    const patientId = internal.patientByPhysick[physickId]!;
    if (isWithinTreatmentTouchRange(world, physickId, patientId)) continue;
    if (applyIndividualExternalMovementIntent(world, formation, physickId,
      world.positionsX[patientId]!, world.positionsY[patientId]!,
      "approachClaimedPatient")) movedCount += 1;
  }
  return movedCount;
}
export function hasIndividualMedicalClaimDecisionWork(
  urgency: IndividualMedicalUrgencyStore,
  claims: IndividualMedicalClaimStore,
  groups: CasualtyDragGroupStore,
): boolean {
  validateCounts(urgency.entityCount, claims, groups);
  if (getActiveCasualtyDragGroups(groups).some((group) => group.phase === "reachedSafety")) return true;
  const store = claims as InternalClaimStore;
  for (let entityId = 0; entityId < urgency.entityCount; entityId += 1) {
    if (store.patientByPhysick[entityId] !== NONE || getClaimNeed(urgency, entityId) !== undefined) return true;
  }
  return false;
}

export function decideIndividualMedicalClaimsAndHandoffs(
  world: WorldState, identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore,
  profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore,
  trauma: IndividualTraumaticWoundStore, limbs: IndividualLimbDisabilityStore,
  urgency: IndividualMedicalUrgencyStore,
  actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource,
  query: IndividualMedicalLocalQueryStore, assistance: IndividualCasualtyAssistanceStore,
  groups: CasualtyDragGroupStore, hands: IndividualDragHandCommitmentStore,
  claims: IndividualMedicalClaimStore, tick: number, buffers: IndividualMedicalClaimBuffers,
  options: IndividualMedicalClaimOptions = {},
): IndividualMedicalClaimResult {
  validateCounts(world.entityCount, identity, lifecycle, profiles, herbs, trauma, limbs, urgency, actions, query, assistance, groups, hands, claims);
  const store = claims as InternalClaimStore;
  buffers.claimRecords.length = 0; buffers.handoffRecords.length = 0; buffers.safeReleaseRecords.length = 0; buffers.staleClaimRecords.length = 0;
  clearStaleClaims(identity, lifecycle, profiles, herbs, trauma, urgency, actions, morale, assistance, store, tick, buffers.staleClaimRecords, options);
  let localCandidateCount = 0;
  const scratch: number[] = [];
  const reached = getActiveCasualtyDragGroups(groups).filter((group) => group.phase === "reachedSafety").slice().sort((a, b) => a.groupId - b.groupId);
  for (const group of reached) {
    const patientId = group.patientEntityId;
    const need = getClaimNeed(urgency, patientId);
    let physickId = NONE;
    let origin: IndividualMedicalClaimRecord["origin"] = "handoff";
    if (group.helperKind === "physick" && canPhysickClaim(identity, lifecycle, profiles, herbs, trauma, actions, morale, assistance, store, group.helperEntityIds[0]!, patientId, need, options, true)) {
      physickId = group.helperEntityIds[0]!; origin = "soloCarrier";
    } else {
      const selection = selectLocalPhysick(world, identity, lifecycle, profiles, herbs, trauma, actions, morale, query, assistance, store, patientId, need, scratch, options, PHYSICK_HANDOFF_RANGE);
      physickId = selection.entityId; localCandidateCount += selection.candidateCount;
    }
    const releasedHelpers = group.helperEntityIds.slice();
    if (physickId !== NONE && need !== undefined) {
      assignClaim(store, physickId, patientId, need, tick);
      buffers.claimRecords.push({ physickEntityId: physickId, patientEntityId: patientId, need, tick, origin });
      releaseReachedSafetyDragGroup(assistance, groups, hands, group.groupId);
      buffers.handoffRecords.push({ groupId: group.groupId, patientEntityId: patientId, physickEntityId: physickId, releasedHelperEntityIds: releasedHelpers, tick });
    } else {
      releaseReachedSafetyDragGroup(assistance, groups, hands, group.groupId);
      buffers.safeReleaseRecords.push({ groupId: group.groupId, patientEntityId: patientId, releasedHelperEntityIds: releasedHelpers, tick });
    }
  }
  const patients: { entityId: number; need: IndividualMedicalClaimNeed; priority: number }[] = [];
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    if (store.physickByPatient[entityId] !== NONE) continue;
    if (wasSafelyReleasedThisDecision(buffers.safeReleaseRecords, entityId)) continue;
    const need = getClaimNeed(urgency, entityId); if (need === undefined) continue;
    if (need === "dying" && getIndividualCasualtyAssistanceInspection(assistance, entityId).state !== "atTreatmentPosition") continue;
    patients.push({ entityId, need, priority: getIndividualMedicalUrgencyInspection(urgency, entityId).urgencyPriority });
  }
  patients.sort((a, b) => b.priority - a.priority || a.entityId - b.entityId);
  for (const patient of patients) {
    const selection = selectLocalPhysick(world, identity, lifecycle, profiles, herbs, trauma, actions, morale, query, assistance, store, patient.entityId, patient.need, scratch, options);
    localCandidateCount += selection.candidateCount;
    if (selection.entityId === NONE) continue;
    assignClaim(store, selection.entityId, patient.entityId, patient.need, tick);
    buffers.claimRecords.push({ physickEntityId: selection.entityId, patientEntityId: patient.entityId, need: patient.need, tick, origin: "triage" });
  }
  buffers.claimRecords.sort((a, b) => a.patientEntityId - b.patientEntityId);
  return { claimRecords: buffers.claimRecords, handoffRecords: buffers.handoffRecords, safeReleaseRecords: buffers.safeReleaseRecords, staleClaimRecords: buffers.staleClaimRecords, activeClaimCount: countClaims(store), localCandidateCount };
}

function selectLocalPhysick(world: WorldState, identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, query: IndividualMedicalLocalQueryStore, assistance: IndividualCasualtyAssistanceStore, claims: InternalClaimStore, patientId: number, need: IndividualMedicalClaimNeed | undefined, scratch: number[], options: IndividualMedicalClaimOptions, radius = CLAIM_RADIUS): { entityId: number; candidateCount: number } {
  if (need === undefined) return { entityId: NONE, candidateCount: 0 };
  const nearby = queryPreparedMedicalLocalEntityIdsWithinRadiusInto(query, world, patientId, radius, scratch);
  let best = NONE, bestDistance = Number.MAX_SAFE_INTEGER, count = 0;
  for (const entityId of nearby) {
    if (!canPhysickClaim(identity, lifecycle, profiles, herbs, trauma, actions, morale, assistance, claims, entityId, patientId, need, options)) continue;
    count += 1; const dx = world.positionsX[entityId]! - world.positionsX[patientId]!; const dy = world.positionsY[entityId]! - world.positionsY[patientId]!; const distance = dx * dx + dy * dy;
    if (distance < bestDistance || distance === bestDistance && entityId < best) { best = entityId; bestDistance = distance; }
  }
  return { entityId: best, candidateCount: count };
}
function canPhysickClaim(identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, assistance: IndividualCasualtyAssistanceStore, claims: InternalClaimStore, physickId: number, patientId: number, need: IndividualMedicalClaimNeed | undefined, options: IndividualMedicalClaimOptions, allowReservedCarrier = false): boolean {
  if (need === undefined || physickId === patientId ||
    claims.patientByPhysick[physickId] !== NONE ||
    getPreparedFaction(identity, physickId) !== getPreparedFaction(identity, patientId) ||
    options.isTreatmentParticipant?.(patientId) === true) return false;
  const profile = getTrustedIndividualMedicalProfile(profiles, physickId);
  if (getIndividualCharacterLifecycleState(lifecycle, physickId) !== "active" || !hasCapabilityForNeed(profile, need) || getIndividualTraumaticWoundInspection(trauma, physickId).state !== "none" || morale.get(getUnitIdForEntity(identity, physickId)) === "routing" || getIndividualCombatActionState(actions, physickId) !== "ready" || options.isTreating?.(physickId) === true || options.isTreatmentParticipant?.(physickId) === true || (!allowReservedCarrier && getIndividualCasualtyAssistanceInspection(assistance, physickId).dragGroupId !== NONE)) return false;
  return !requiresHerb(need) || getIndividualAvailableGenericHerbs(herbs, physickId) > 0;
}
function clearStaleClaims(identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, urgency: IndividualMedicalUrgencyStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, assistance: IndividualCasualtyAssistanceStore, claims: InternalClaimStore, tick: number, out: IndividualMedicalStaleClaimRecord[], options: IndividualMedicalClaimOptions): void {
  for (let physickId = 0; physickId < claims.entityCount; physickId += 1) { const patientId = claims.patientByPhysick[physickId]!; if (patientId === NONE) continue; if (claims.physickByPatient[patientId] === physickId && options.isTreating?.(physickId) === true) continue; const need = getClaimNeed(urgency, patientId); if (claims.physickByPatient[patientId] !== physickId || !canExistingClaimRemain(identity, lifecycle, profiles, herbs, trauma, actions, morale, assistance, physickId, patientId, need, options)) { clearClaim(claims, physickId, patientId); out.push({ physickEntityId: physickId, patientEntityId: patientId, tick }); } else { claims.needByPatient[patientId] = needId(need!); } }
}

export function reassessIndividualMedicalClaimsAtActionBoundaries(
  world: WorldState,
  identity: UnitIdentityStore,
  formation: FormationBehaviourStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  profiles: TrustedIndividualMedicalProfileStore,
  herbs: IndividualGenericHerbStore,
  trauma: IndividualTraumaticWoundStore,
  limbs: IndividualLimbDisabilityStore,
  hits: IndividualGlobalHitStore,
  actions: IndividualCombatActionStore,
  morale: UnitMoraleMovementStateSource,
  query: IndividualMedicalLocalQueryStore,
  assistance: IndividualCasualtyAssistanceStore,
  claims: IndividualMedicalClaimStore,
  requests: readonly IndividualTreatmentReassessmentRequest[],
  tick: number,
  options: IndividualMedicalClaimOptions = {},
): number {
  validateCounts(world.entityCount, identity, formation, lifecycle, profiles, herbs,
    trauma, limbs, hits, actions, query, assistance, claims);
  const store = claims as InternalClaimStore;
  const orderedRequests = requests.slice().sort((left, right) =>
    left.healerEntityId - right.healerEntityId || left.actionId - right.actionId);
  const nearbyScratch: number[] = [];
  let assignedCount = 0;
  for (let index = 0; index < orderedRequests.length; index += 1) {
    const request = orderedRequests[index]!;
    assertEntity(request.healerEntityId, store.entityCount);
    assertEntity(request.previousPatientEntityId, store.entityCount);
    if (request.tick !== tick) {
      throw new RangeError("Treatment reassessment requests must be handled on their action-boundary tick.");
    }
    const healerId = request.healerEntityId;
    const previousPatientId = request.previousPatientEntityId;
    const currentClaim = store.patientByPhysick[healerId]!;
    if (currentClaim !== NONE && currentClaim !== previousPatientId) {
      throw new Error("Treatment reassessment must begin from its authoritative previous patient claim.");
    }
    let best = getActionBoundaryCandidate(
      world, identity, formation, lifecycle, profiles, herbs, trauma, hits,
      limbs, actions, morale, assistance, store, healerId, previousPatientId,
      previousPatientId, options,
    );
    const nearby = queryPreparedMedicalLocalEntityIdsWithinRadiusInto(
      query, world, healerId, CLAIM_RADIUS, nearbyScratch,
    );
    for (let candidateIndex = 0; candidateIndex < nearby.length; candidateIndex += 1) {
      const patientId = nearby[candidateIndex]!;
      if (patientId === previousPatientId) continue;
      const candidate = getActionBoundaryCandidate(
        world, identity, formation, lifecycle, profiles, herbs, trauma, hits,
        limbs, actions, morale, assistance, store, healerId, patientId,
        previousPatientId, options,
      );
      if (candidate !== undefined &&
        (best === undefined || compareActionBoundaryCandidates(candidate, best) < 0)) {
        best = candidate;
      }
    }
    if (currentClaim !== NONE) clearClaim(store, healerId, currentClaim);
    if (best === undefined) continue;
    assignClaim(store, healerId, best.entityId, best.need, tick);
    assignedCount += 1;
  }
  return assignedCount;
}

function getActionBoundaryCandidate(
  world: WorldState,
  identity: UnitIdentityStore,
  formation: FormationBehaviourStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  profiles: TrustedIndividualMedicalProfileStore,
  herbs: IndividualGenericHerbStore,
  trauma: IndividualTraumaticWoundStore,
  hits: IndividualGlobalHitStore,
  limbs: IndividualLimbDisabilityStore,
  actions: IndividualCombatActionStore,
  morale: UnitMoraleMovementStateSource,
  assistance: IndividualCasualtyAssistanceStore,
  claims: InternalClaimStore,
  healerId: number,
  patientId: number,
  previousPatientId: number,
  options: IndividualMedicalClaimOptions,
): ActionBoundaryPatientCandidate | undefined {
  if (patientId === healerId ||
    (claims.physickByPatient[patientId] !== NONE &&
      claims.physickByPatient[patientId] !== healerId) ||
    options.isTreatmentParticipant?.(patientId) === true ||
    getPreparedFaction(identity, healerId) !== getPreparedFaction(identity, patientId) ||
    getIndividualCharacterLifecycleState(lifecycle, healerId) !== "active" ||
    getIndividualTraumaticWoundInspection(trauma, healerId).state !== "none" ||
    morale.get(getUnitIdForEntity(identity, healerId)) === "routing" ||
    getIndividualCombatActionState(actions, healerId) !== "ready" ||
    getIndividualCasualtyAssistanceInspection(assistance, healerId).dragGroupId !== NONE) {
    return undefined;
  }
  const urgency = getAuthoritativeIndividualMedicalUrgency(
    formation, hits, lifecycle, trauma, limbs, patientId,
  );
  const need = claimNeedFromUrgencyKind(urgency.urgencyKind);
  if (need === undefined ||
    !hasCapabilityForNeed(getTrustedIndividualMedicalProfile(profiles, healerId), need) ||
    requiresHerb(need) &&
    getIndividualAvailableGenericHerbs(herbs, healerId) < 1) return undefined;
  const dx = world.positionsX[healerId]! - world.positionsX[patientId]!;
  const dy = world.positionsY[healerId]! - world.positionsY[patientId]!;
  return {
    entityId: patientId,
    need,
    urgencyPriority: urgency.urgencyPriority,
    distanceSquared: dx * dx + dy * dy,
    previousPatient: patientId === previousPatientId,
  };
}

function compareActionBoundaryCandidates(
  left: ActionBoundaryPatientCandidate,
  right: ActionBoundaryPatientCandidate,
): number {
  if (left.urgencyPriority !== right.urgencyPriority) {
    return right.urgencyPriority - left.urgencyPriority;
  }
  if (left.previousPatient !== right.previousPatient) {
    return left.previousPatient ? -1 : 1;
  }
  return left.distanceSquared !== right.distanceSquared
    ? left.distanceSquared - right.distanceSquared
    : left.entityId - right.entityId;
}

function claimNeedFromUrgencyKind(
  kind: import("./individualMedicalReadModel").IndividualMedicalUrgencyKind,
): IndividualMedicalClaimNeed | undefined {
  if (kind === "dying") return "dying";
  if (kind === "disabledArm" || kind === "disabledLeg") return "limbDisability";
  if (kind === "traumaticWound") return "traumaticWound";
  if (kind === "dangerouslyLowHits" || kind === "belowHalfHits" ||
    kind === "comfortableMissingHits") return "livingMissingHits";
  return undefined;
}
function canExistingClaimRemain(identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, assistance: IndividualCasualtyAssistanceStore, physickId: number, patientId: number, need: IndividualMedicalClaimNeed | undefined, options: IndividualMedicalClaimOptions): boolean {
  if (need === undefined || getPreparedFaction(identity, physickId) !== getPreparedFaction(identity, patientId) || options.isTreatmentParticipant?.(physickId) === true || options.isTreatmentParticipant?.(patientId) === true) return false;
  return getIndividualCharacterLifecycleState(lifecycle, physickId) === "active" && hasCapabilityForNeed(getTrustedIndividualMedicalProfile(profiles, physickId), need) && getIndividualTraumaticWoundInspection(trauma, physickId).state === "none" && morale.get(getUnitIdForEntity(identity, physickId)) !== "routing" && getIndividualCombatActionState(actions, physickId) === "ready" && getIndividualCasualtyAssistanceInspection(assistance, physickId).dragGroupId === NONE && (!requiresHerb(need) || getIndividualAvailableGenericHerbs(herbs, physickId) > 0);
}
function isClaimedPhysickCommitted(identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, presence: IndividualPlayerPresenceStore, hits: IndividualGlobalHitStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, limbs: IndividualLimbDisabilityStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, assistance: IndividualCasualtyAssistanceStore, claims: InternalClaimStore, physickId: number, tick: number, options: IndividualMedicalClaimCommitmentOptions): boolean {
  const patientId = claims.patientByPhysick[physickId]!;
  const storedNeed = patientId === NONE ? "none" :
    needFromId(claims.needByPatient[patientId]!);
  if (patientId === NONE || claims.physickByPatient[patientId] !== physickId ||
    storedNeed === "none" ||
    tick <= claims.claimedTickByPatient[patientId]! ||
    options.isTreating?.(physickId) === true ||
    !canExistingClaimRemain(identity, lifecycle, profiles, herbs, trauma, actions,
      morale, assistance, physickId, patientId,
      storedNeed, options)) return false;
  const need = claims.needByPatient[patientId]!;
  const patientLifecycle = getIndividualCharacterLifecycleState(lifecycle, patientId);
  const patientPresence = getIndividualPlayerPresenceState(presence, patientId);
  const currentHits = getIndividualCurrentGlobalHits(hits, patientId);
  if (need === NEED_DYING) {
    return patientLifecycle === "dying" && patientPresence === "downedPresence" &&
      currentHits === 0;
  }
  if (patientLifecycle !== "active" || patientPresence !== "activePresence" ||
    currentHits <= 0) return false;
  if (need === NEED_TRAUMA) {
    return getIndividualTraumaticWoundInspection(trauma, patientId).state === "active";
  }
  if (need === NEED_LIMB) {
    return getHighestPriorityIndividualLimbDisability(limbs, patientId) !== undefined;
  }
  return need === NEED_MISSING &&
    currentHits < getIndividualMaximumGlobalHits(hits, patientId);
}
function isWithinTreatmentTouchRange(world: WorldState, physickId: number, patientId: number): boolean {
  const dx = world.positionsX[physickId]! - world.positionsX[patientId]!;
  const dy = world.positionsY[physickId]! - world.positionsY[patientId]!;
  return dx * dx + dy * dy <= PHYSICK_HANDOFF_RANGE * PHYSICK_HANDOFF_RANGE;
}
function getClaimNeed(urgency: IndividualMedicalUrgencyStore, entityId: number): IndividualMedicalClaimNeed | undefined { const kind = getIndividualMedicalUrgencyInspection(urgency, entityId).urgencyKind; if (kind === "dying") return "dying"; if (kind === "disabledArm" || kind === "disabledLeg") return "limbDisability"; if (kind === "traumaticWound") return "traumaticWound"; if (kind === "dangerouslyLowHits" || kind === "belowHalfHits" || kind === "comfortableMissingHits") return "livingMissingHits"; return undefined; }
function requiresHerb(need: IndividualMedicalClaimNeed): boolean { return need === "traumaticWound" || need === "livingMissingHits"; }
function hasCapabilityForNeed(
  profile: ReturnType<typeof getTrustedIndividualMedicalProfile>,
  need: IndividualMedicalClaimNeed,
): boolean {
  return need === "dying" ? profile.hasChirurgeon : profile.hasPhysick;
}
function assignClaim(store: InternalClaimStore, physickId: number, patientId: number, need: IndividualMedicalClaimNeed, tick: number): void { store.patientByPhysick[physickId] = patientId; store.physickByPatient[patientId] = physickId; store.claimedTickByPatient[patientId] = tick; store.needByPatient[patientId] = needId(need); store.committedByPhysick[physickId] = 0; }
function clearClaim(store: InternalClaimStore, physickId: number, patientId: number): void { store.patientByPhysick[physickId] = NONE; store.physickByPatient[patientId] = NONE; store.claimedTickByPatient[patientId] = NONE; store.needByPatient[patientId] = NEED_NONE; store.committedByPhysick[physickId] = 0; }
function countClaims(store: InternalClaimStore): number { let count = 0; for (const patient of store.patientByPhysick) if (patient !== NONE) count += 1; return count; }
function wasSafelyReleasedThisDecision(records: readonly IndividualMedicalSafeReleaseRecord[], patientId: number): boolean { for (const record of records) if (record.patientEntityId === patientId) return true; return false; }
function needId(need: IndividualMedicalClaimNeed): number { return need === "dying" ? NEED_DYING : need === "traumaticWound" ? NEED_TRAUMA : need === "livingMissingHits" ? NEED_MISSING : need === "limbDisability" ? NEED_LIMB : NEED_NONE; }
function needFromId(id: number): IndividualMedicalClaimNeed | "none" { return id === NEED_DYING ? "dying" : id === NEED_TRAUMA ? "traumaticWound" : id === NEED_MISSING ? "livingMissingHits" : id === NEED_LIMB ? "limbDisability" : "none"; }
function getPreparedFaction(identity: UnitIdentityStore, entityId: number): number { return getFactionIdForUnit(identity, getUnitIdForEntity(identity, entityId)); }
function assertEntity(entityId: number, count: number): void { if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= count) throw new RangeError("Medical claim entity ID out of bounds."); }
function validateCounts(count: number, ...stores: readonly { readonly entityCount: number }[]): void { for (const store of stores) if (store.entityCount !== count) throw new RangeError("Medical claim stores must share entityCount."); }
