import { getIndividualCombatActionState, type IndividualCombatActionStore } from "./individualCombatAction";
import {
  getActiveCasualtyDragGroups,
  getIndividualCasualtyAssistanceInspection,
  releaseReachedSafetyDragGroup,
  type CasualtyDragGroupStore,
  type IndividualCasualtyAssistanceStore,
  type IndividualDragHandCommitmentStore,
} from "./individualCasualtyAssistance";
import { getIndividualCharacterLifecycleState, type IndividualCasualtyLifecycleStore } from "./individualCasualtyLifecycle";
import {
  getIndividualMedicalUrgencyInspection,
  queryPreparedMedicalLocalEntityIdsWithinRadiusInto,
  type IndividualMedicalLocalQueryStore,
  type IndividualMedicalUrgencyStore,
} from "./individualMedicalReadModel";
import {
  getIndividualAvailableGenericHerbs,
  getTrustedIndividualMedicalProfile,
  type IndividualGenericHerbStore,
  type TrustedIndividualMedicalProfileStore,
} from "./individualMedicalProfile";
import { getIndividualTraumaticWoundInspection, type IndividualTraumaticWoundStore } from "./individualTraumaticWound";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import { getFactionIdForUnit, getUnitIdForEntity, type UnitIdentityStore } from "./unitIdentity";
import type { WorldState } from "./types";

export type IndividualMedicalClaimNeed = "dying" | "traumaticWound" | "livingMissingHits" | "limbDisability" | "terminalComfort";
export interface IndividualMedicalClaimStore { readonly entityCount: number; }
interface InternalClaimStore extends IndividualMedicalClaimStore {
  readonly patientByPhysick: Int32Array;
  readonly physickByPatient: Int32Array;
  readonly claimedTickByPatient: Float64Array;
  readonly needByPatient: Uint8Array;
}
export interface IndividualMedicalClaimInspection { readonly patientEntityId: number; readonly physickEntityId: number; readonly claimedTick: number; readonly need: IndividualMedicalClaimNeed | "none"; }
export interface IndividualMedicalClaimRecord { readonly physickEntityId: number; readonly patientEntityId: number; readonly need: IndividualMedicalClaimNeed; readonly tick: number; readonly origin: "triage" | "soloCarrier" | "handoff"; }
export interface IndividualMedicalHandoffRecord { readonly groupId: number; readonly patientEntityId: number; readonly physickEntityId: number; readonly releasedHelperEntityIds: readonly number[]; readonly tick: number; }
export interface IndividualMedicalSafeReleaseRecord { readonly groupId: number; readonly patientEntityId: number; readonly releasedHelperEntityIds: readonly number[]; readonly tick: number; }
export interface IndividualMedicalStaleClaimRecord { readonly physickEntityId: number; readonly patientEntityId: number; readonly tick: number; }
export interface IndividualMedicalClaimBuffers { readonly claimRecords: IndividualMedicalClaimRecord[]; readonly handoffRecords: IndividualMedicalHandoffRecord[]; readonly safeReleaseRecords: IndividualMedicalSafeReleaseRecord[]; readonly staleClaimRecords: IndividualMedicalStaleClaimRecord[]; }
export interface IndividualMedicalClaimResult { readonly claimRecords: readonly IndividualMedicalClaimRecord[]; readonly handoffRecords: readonly IndividualMedicalHandoffRecord[]; readonly safeReleaseRecords: readonly IndividualMedicalSafeReleaseRecord[]; readonly staleClaimRecords: readonly IndividualMedicalStaleClaimRecord[]; readonly activeClaimCount: number; readonly localCandidateCount: number; }
export interface IndividualMedicalClaimOptions { readonly isTreating?: (entityId: number) => boolean; }

const NONE = -1;
const CLAIM_RADIUS = 192;
const NEED_NONE = 0, NEED_DYING = 1, NEED_TRAUMA = 2, NEED_MISSING = 3;

export function createIndividualMedicalClaimStore(entityCount: number): IndividualMedicalClaimStore {
  if (!Number.isSafeInteger(entityCount) || entityCount <= 0) throw new RangeError("entityCount must be a positive safe integer.");
  const patientByPhysick = new Int32Array(entityCount); patientByPhysick.fill(NONE);
  const physickByPatient = new Int32Array(entityCount); physickByPatient.fill(NONE);
  const ticks = new Float64Array(entityCount); ticks.fill(NONE);
  return { entityCount, patientByPhysick, physickByPatient, claimedTickByPatient: ticks, needByPatient: new Uint8Array(entityCount) } as InternalClaimStore;
}
export function createIndividualMedicalClaimBuffers(): IndividualMedicalClaimBuffers { return { claimRecords: [], handoffRecords: [], safeReleaseRecords: [], staleClaimRecords: [] }; }
export function getIndividualMedicalClaimInspection(store: IndividualMedicalClaimStore, entityId: number): IndividualMedicalClaimInspection {
  const internal = store as InternalClaimStore; assertEntity(entityId, internal.entityCount);
  return { patientEntityId: internal.patientByPhysick[entityId]!, physickEntityId: internal.physickByPatient[entityId]!, claimedTick: internal.claimedTickByPatient[entityId]!, need: needFromId(internal.needByPatient[entityId]!) };
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
  trauma: IndividualTraumaticWoundStore, urgency: IndividualMedicalUrgencyStore,
  actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource,
  query: IndividualMedicalLocalQueryStore, assistance: IndividualCasualtyAssistanceStore,
  groups: CasualtyDragGroupStore, hands: IndividualDragHandCommitmentStore,
  claims: IndividualMedicalClaimStore, tick: number, buffers: IndividualMedicalClaimBuffers,
  options: IndividualMedicalClaimOptions = {},
): IndividualMedicalClaimResult {
  validateCounts(world.entityCount, identity, lifecycle, profiles, herbs, trauma, urgency, actions, query, assistance, groups, hands, claims);
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
      const selection = selectLocalPhysick(world, identity, lifecycle, profiles, herbs, trauma, actions, morale, query, assistance, store, patientId, need, scratch, options);
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

function selectLocalPhysick(world: WorldState, identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, query: IndividualMedicalLocalQueryStore, assistance: IndividualCasualtyAssistanceStore, claims: InternalClaimStore, patientId: number, need: IndividualMedicalClaimNeed | undefined, scratch: number[], options: IndividualMedicalClaimOptions): { entityId: number; candidateCount: number } {
  if (need === undefined) return { entityId: NONE, candidateCount: 0 };
  const nearby = queryPreparedMedicalLocalEntityIdsWithinRadiusInto(query, world, patientId, CLAIM_RADIUS, scratch);
  let best = NONE, bestDistance = Number.MAX_SAFE_INTEGER, count = 0;
  for (const entityId of nearby) {
    if (!canPhysickClaim(identity, lifecycle, profiles, herbs, trauma, actions, morale, assistance, claims, entityId, patientId, need, options)) continue;
    count += 1; const dx = world.positionsX[entityId]! - world.positionsX[patientId]!; const dy = world.positionsY[entityId]! - world.positionsY[patientId]!; const distance = dx * dx + dy * dy;
    if (distance < bestDistance || distance === bestDistance && entityId < best) { best = entityId; bestDistance = distance; }
  }
  return { entityId: best, candidateCount: count };
}
function canPhysickClaim(identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, assistance: IndividualCasualtyAssistanceStore, claims: InternalClaimStore, physickId: number, patientId: number, need: IndividualMedicalClaimNeed | undefined, options: IndividualMedicalClaimOptions, allowReservedCarrier = false): boolean {
  if (need === undefined || physickId === patientId || claims.patientByPhysick[physickId] !== NONE || getPreparedFaction(identity, physickId) !== getPreparedFaction(identity, patientId)) return false;
  if (getIndividualCharacterLifecycleState(lifecycle, physickId) !== "active" || !getTrustedIndividualMedicalProfile(profiles, physickId).hasPhysick || getIndividualTraumaticWoundInspection(trauma, physickId).state !== "none" || morale.get(getUnitIdForEntity(identity, physickId)) === "routing" || getIndividualCombatActionState(actions, physickId) !== "ready" || options.isTreating?.(physickId) === true || (!allowReservedCarrier && getIndividualCasualtyAssistanceInspection(assistance, physickId).dragGroupId !== NONE)) return false;
  return !requiresHerb(need) || getIndividualAvailableGenericHerbs(herbs, physickId) > 0;
}
function clearStaleClaims(identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, urgency: IndividualMedicalUrgencyStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, assistance: IndividualCasualtyAssistanceStore, claims: InternalClaimStore, tick: number, out: IndividualMedicalStaleClaimRecord[], options: IndividualMedicalClaimOptions): void {
  for (let physickId = 0; physickId < claims.entityCount; physickId += 1) { const patientId = claims.patientByPhysick[physickId]!; if (patientId === NONE) continue; const need = getClaimNeed(urgency, patientId); if (claims.physickByPatient[patientId] !== physickId || !canExistingClaimRemain(identity, lifecycle, profiles, herbs, trauma, actions, morale, assistance, physickId, patientId, need, options)) { clearClaim(claims, physickId, patientId); out.push({ physickEntityId: physickId, patientEntityId: patientId, tick }); } }
}
function canExistingClaimRemain(identity: UnitIdentityStore, lifecycle: IndividualCasualtyLifecycleStore, profiles: TrustedIndividualMedicalProfileStore, _herbs: IndividualGenericHerbStore, trauma: IndividualTraumaticWoundStore, actions: IndividualCombatActionStore, morale: UnitMoraleMovementStateSource, assistance: IndividualCasualtyAssistanceStore, physickId: number, patientId: number, need: IndividualMedicalClaimNeed | undefined, _options: IndividualMedicalClaimOptions): boolean {
  if (need === undefined || getPreparedFaction(identity, physickId) !== getPreparedFaction(identity, patientId)) return false;
  return getIndividualCharacterLifecycleState(lifecycle, physickId) === "active" && getTrustedIndividualMedicalProfile(profiles, physickId).hasPhysick && getIndividualTraumaticWoundInspection(trauma, physickId).state === "none" && morale.get(getUnitIdForEntity(identity, physickId)) !== "routing" && getIndividualCombatActionState(actions, physickId) === "ready" && getIndividualCasualtyAssistanceInspection(assistance, physickId).dragGroupId === NONE;
}
function getClaimNeed(urgency: IndividualMedicalUrgencyStore, entityId: number): IndividualMedicalClaimNeed | undefined { const kind = getIndividualMedicalUrgencyInspection(urgency, entityId).urgencyKind; if (kind === "dying") return "dying"; if (kind === "traumaticWound") return "traumaticWound"; if (kind === "dangerouslyLowHits" || kind === "belowHalfHits" || kind === "comfortableMissingHits") return "livingMissingHits"; return undefined; }
function requiresHerb(need: IndividualMedicalClaimNeed): boolean { return need === "traumaticWound" || need === "livingMissingHits" || need === "limbDisability"; }
function assignClaim(store: InternalClaimStore, physickId: number, patientId: number, need: IndividualMedicalClaimNeed, tick: number): void { store.patientByPhysick[physickId] = patientId; store.physickByPatient[patientId] = physickId; store.claimedTickByPatient[patientId] = tick; store.needByPatient[patientId] = needId(need); }
function clearClaim(store: InternalClaimStore, physickId: number, patientId: number): void { store.patientByPhysick[physickId] = NONE; store.physickByPatient[patientId] = NONE; store.claimedTickByPatient[patientId] = NONE; store.needByPatient[patientId] = NEED_NONE; }
function countClaims(store: InternalClaimStore): number { let count = 0; for (const patient of store.patientByPhysick) if (patient !== NONE) count += 1; return count; }
function needId(need: IndividualMedicalClaimNeed): number { return need === "dying" ? NEED_DYING : need === "traumaticWound" ? NEED_TRAUMA : need === "livingMissingHits" ? NEED_MISSING : NEED_NONE; }
function needFromId(id: number): IndividualMedicalClaimNeed | "none" { return id === NEED_DYING ? "dying" : id === NEED_TRAUMA ? "traumaticWound" : id === NEED_MISSING ? "livingMissingHits" : "none"; }
function getPreparedFaction(identity: UnitIdentityStore, entityId: number): number { return getFactionIdForUnit(identity, getUnitIdForEntity(identity, entityId)); }
function assertEntity(entityId: number, count: number): void { if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= count) throw new RangeError("Medical claim entity ID out of bounds."); }
function validateCounts(count: number, ...stores: readonly { readonly entityCount: number }[]): void { for (const store of stores) if (store.entityCount !== count) throw new RangeError("Medical claim stores must share entityCount."); }
