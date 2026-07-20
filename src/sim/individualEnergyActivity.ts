import {
  getActiveCasualtyDragGroups,
  type CasualtyDragGroupStore,
} from "./individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
  type CharacterLifecycleState,
  type PlayerPresenceState,
} from "./individualCasualtyLifecycle";
import type { IndividualMeleeAttackAttemptRecord } from "./individualCombatAction";
import type { IndividualMeleeDefenceRecord } from "./individualMeleeDefence";
import {
  getIndividualExecutionActionInspection,
  type IndividualExecutionActionResult,
  type IndividualExecutionActionStore,
} from "./individualExecutionAction";
import {
  getIndividualTreatmentActionInspection,
  type IndividualTreatmentActionResult,
  type IndividualTreatmentActionStore,
} from "./individualTreatmentAction";
import type { WorldState } from "./types";

export type IndividualEnergyActivityContext =
  | "safeStationaryRest"
  | "alertStationary"
  | "downedRest"
  | "walking"
  | "jogging"
  | "sprinting"
  | "dragging"
  | "beingDragged"
  | "medicalApproach"
  | "treating"
  | "underTreatment"
  | "executionCommitment"
  | "respawnEgress"
  | "waitingAtRespawn"
  | "inactiveTerminal";

export type IndividualEnergyMovementIntensity =
  | "stationary"
  | "walking"
  | "jogging"
  | "sprinting";

export type IndividualEnergyMovementAuthority =
  | "ordinaryMovement"
  | "casualtyGathering"
  | "activeDragHelper"
  | "draggedPatient"
  | "medicalApproach"
  | "traumaWithdrawal"
  | "respawnEgress"
  | "externalDisplacement";

const CONTEXTS: readonly IndividualEnergyActivityContext[] = Object.freeze([
  "safeStationaryRest", "alertStationary", "downedRest", "walking",
  "jogging", "sprinting", "dragging", "beingDragged", "medicalApproach",
  "treating", "underTreatment", "executionCommitment", "respawnEgress",
  "waitingAtRespawn", "inactiveTerminal",
]);
const INTENSITIES: readonly IndividualEnergyMovementIntensity[] = Object.freeze([
  "stationary", "walking", "jogging", "sprinting",
]);

const AUTHORITY_BITS: Readonly<Record<IndividualEnergyMovementAuthority, number>> =
  Object.freeze({
    ordinaryMovement: 1 << 0,
    casualtyGathering: 1 << 1,
    activeDragHelper: 1 << 2,
    draggedPatient: 1 << 3,
    medicalApproach: 1 << 4,
    traumaWithdrawal: 1 << 5,
    respawnEgress: 1 << 6,
    externalDisplacement: 1 << 7,
  });

const TREATING = 1 << 0;
const UNDER_TREATMENT = 1 << 1;
const EXECUTION_COMMITMENT = 1 << 2;

export interface IndividualEnergyActivityStore {
  readonly entityCount: number;
}

interface InternalIndividualEnergyActivityStore
  extends IndividualEnergyActivityStore {
  readonly tickStartXByEntity: Int32Array;
  readonly tickStartYByEntity: Int32Array;
  readonly checkpointXByEntity: Int32Array;
  readonly checkpointYByEntity: Int32Array;
  readonly contextByEntity: Uint8Array;
  readonly intensityByEntity: Uint8Array;
  readonly displacementXByEntity: Float64Array;
  readonly displacementYByEntity: Float64Array;
  readonly distanceSquaredByEntity: Float64Array;
  readonly attackAttemptCountByEntity: Uint32Array;
  readonly defenceAttemptCountByEntity: Uint32Array;
  readonly movementAuthorityMaskByEntity: Uint16Array;
  readonly externallyMovedByEntity: Uint8Array;
  readonly actionEvidenceByEntity: Uint8Array;
  observedTick: number;
}

const activityStoreInternals = new WeakMap<
  IndividualEnergyActivityStore,
  InternalIndividualEnergyActivityStore
>();

export interface IndividualEnergyActivityInspection {
  readonly dominantContext: IndividualEnergyActivityContext;
  readonly displacementX: number;
  readonly displacementY: number;
  /** Exact squared integer displacement; no floating-point square root is charged. */
  readonly actualMovementDistanceSquared: number;
  readonly movementIntensity: IndividualEnergyMovementIntensity;
  readonly validAttackAttemptCount: number;
  readonly validDefenceAttemptCount: number;
  readonly movementOccurred: boolean;
  readonly externallyMoved: boolean;
  readonly movementAuthorities: readonly IndividualEnergyMovementAuthority[];
  readonly observedTick: number;
}

export interface IndividualEnergyActivityClassificationDependencies {
  readonly world: WorldState;
  readonly lifecycle: IndividualCasualtyLifecycleStore;
  readonly presence: IndividualPlayerPresenceStore;
  readonly treatments: IndividualTreatmentActionStore;
  readonly treatmentResult: IndividualTreatmentActionResult;
  readonly executions: IndividualExecutionActionStore;
  readonly executionResult: IndividualExecutionActionResult;
  readonly attackAttempts: readonly IndividualMeleeAttackAttemptRecord[];
  readonly defenceAttempts: readonly IndividualMeleeDefenceRecord[];
  readonly isAlert: (entityId: number) => boolean;
  readonly tick: number;
}

export interface IndividualEnergyActivityContextEvidence {
  readonly lifecycle: CharacterLifecycleState;
  readonly presence: PlayerPresenceState;
  readonly movementOccurred: boolean;
  readonly movementIntensity: IndividualEnergyMovementIntensity;
  readonly beingDragged: boolean;
  readonly activeDragHelper: boolean;
  readonly treating: boolean;
  readonly underTreatment: boolean;
  readonly executionCommitted: boolean;
  readonly medicalApproach: boolean;
  readonly alert: boolean;
}

export function createIndividualEnergyActivityStore(
  entityCount: number,
): IndividualEnergyActivityStore {
  if (!Number.isSafeInteger(entityCount) || entityCount < 0) {
    throw new RangeError("Energy activity entityCount must be a non-negative safe integer.");
  }
  const publicStore = Object.freeze({ entityCount });
  activityStoreInternals.set(publicStore, {
    entityCount,
    tickStartXByEntity: new Int32Array(entityCount),
    tickStartYByEntity: new Int32Array(entityCount),
    checkpointXByEntity: new Int32Array(entityCount),
    checkpointYByEntity: new Int32Array(entityCount),
    contextByEntity: new Uint8Array(entityCount),
    intensityByEntity: new Uint8Array(entityCount),
    displacementXByEntity: new Float64Array(entityCount),
    displacementYByEntity: new Float64Array(entityCount),
    distanceSquaredByEntity: new Float64Array(entityCount),
    attackAttemptCountByEntity: new Uint32Array(entityCount),
    defenceAttemptCountByEntity: new Uint32Array(entityCount),
    movementAuthorityMaskByEntity: new Uint16Array(entityCount),
    externallyMovedByEntity: new Uint8Array(entityCount),
    actionEvidenceByEntity: new Uint8Array(entityCount),
    observedTick: 0,
  } as InternalIndividualEnergyActivityStore);
  return publicStore;
}

export function beginIndividualEnergyActivityObservation(
  store: IndividualEnergyActivityStore,
  world: WorldState,
  tick: number,
): void {
  const internal = requireStore(store, world.entityCount);
  assertTick(tick);
  internal.tickStartXByEntity.set(world.positionsX);
  internal.tickStartYByEntity.set(world.positionsY);
  internal.checkpointXByEntity.set(world.positionsX);
  internal.checkpointYByEntity.set(world.positionsY);
  internal.displacementXByEntity.fill(0);
  internal.displacementYByEntity.fill(0);
  internal.distanceSquaredByEntity.fill(0);
  internal.attackAttemptCountByEntity.fill(0);
  internal.defenceAttemptCountByEntity.fill(0);
  internal.movementAuthorityMaskByEntity.fill(0);
  internal.externallyMovedByEntity.fill(0);
  internal.actionEvidenceByEntity.fill(0);
  internal.intensityByEntity.fill(0);
  internal.observedTick = tick;
}

/**
 * Records which production authority changed a position since the preceding
 * checkpoint. Net tick displacement is still calculated exactly once at finalisation.
 */
export function observeIndividualEnergyMovementAuthority(
  store: IndividualEnergyActivityStore,
  world: WorldState,
  authority: IndividualEnergyMovementAuthority,
): void {
  const internal = requireStore(store, world.entityCount);
  const bit = AUTHORITY_BITS[authority];
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const x = world.positionsX[entityId]!;
    const y = world.positionsY[entityId]!;
    if (x === internal.checkpointXByEntity[entityId] &&
        y === internal.checkpointYByEntity[entityId]) continue;
    internal.movementAuthorityMaskByEntity[entityId] =
      internal.movementAuthorityMaskByEntity[entityId]! | bit;
    if (authority === "externalDisplacement" || authority === "draggedPatient") {
      internal.externallyMovedByEntity[entityId] = 1;
    }
    internal.checkpointXByEntity[entityId] = x;
    internal.checkpointYByEntity[entityId] = y;
  }
}

export function observeIndividualEnergyCasualtyMovement(
  store: IndividualEnergyActivityStore,
  world: WorldState,
  groups: CasualtyDragGroupStore,
): void {
  const internal = requireStore(store, world.entityCount);
  if (groups.entityCount !== internal.entityCount) {
    throw new RangeError("Energy activity drag store must match entityCount.");
  }
  for (const group of getActiveCasualtyDragGroups(groups)) {
    const helperAuthority = group.phase === "gathering"
      ? "casualtyGathering"
      : group.phase === "dragging" || group.phase === "reachedSafety"
        ? "activeDragHelper"
        : undefined;
    if (helperAuthority !== undefined) {
      for (const helperEntityId of group.helperEntityIds) {
        if (group.phase !== "reachedSafety" ||
            entityChangedSinceCheckpoint(internal, world, helperEntityId)) {
          internal.movementAuthorityMaskByEntity[helperEntityId] =
            internal.movementAuthorityMaskByEntity[helperEntityId]! |
            AUTHORITY_BITS[helperAuthority];
        }
        markChangedEntity(internal, world, helperEntityId, helperAuthority, false);
      }
    }
    if (group.phase === "dragging" ||
        (group.phase === "reachedSafety" &&
          entityChangedSinceCheckpoint(internal, world, group.patientEntityId))) {
      internal.movementAuthorityMaskByEntity[group.patientEntityId] =
          internal.movementAuthorityMaskByEntity[group.patientEntityId]! |
          AUTHORITY_BITS.draggedPatient;
      markChangedEntity(internal, world, group.patientEntityId, "draggedPatient", true);
    }
  }
  // A cancelled group may have moved before combat. Preserve its already-marked
  // authority, while advancing every checkpoint before the next movement system.
  internal.checkpointXByEntity.set(world.positionsX);
  internal.checkpointYByEntity.set(world.positionsY);
}

export function classifyIndividualEnergyActivityOneTick(
  store: IndividualEnergyActivityStore,
  dependencies: IndividualEnergyActivityClassificationDependencies,
): IndividualEnergyActivityStore {
  const { world } = dependencies;
  const internal = requireStore(store, world.entityCount);
  validateDependencies(internal.entityCount, dependencies);
  assertTick(dependencies.tick);
  if (dependencies.tick !== internal.observedTick) {
    throw new Error("Energy activity finalisation must match its observation tick.");
  }

  addTreatmentEvidence(internal, dependencies);
  addExecutionEvidence(internal, dependencies);
  for (const attempt of dependencies.attackAttempts) {
    incrementChecked(internal.attackAttemptCountByEntity, attempt.attackerEntityId,
      "attack-attempt");
  }
  for (const attempt of dependencies.defenceAttempts) {
    incrementChecked(internal.defenceAttemptCountByEntity, attempt.defenderEntityId,
      "defence-attempt");
  }

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const dx = world.positionsX[entityId]! - internal.tickStartXByEntity[entityId]!;
    const dy = world.positionsY[entityId]! - internal.tickStartYByEntity[entityId]!;
    const distanceSquared = dx * dx + dy * dy;
    if (!Number.isSafeInteger(dx) || !Number.isSafeInteger(dy) ||
        !Number.isSafeInteger(distanceSquared)) {
      throw new RangeError("Energy activity displacement exceeds safe integer storage.");
    }
    internal.displacementXByEntity[entityId] = dx;
    internal.displacementYByEntity[entityId] = dy;
    internal.distanceSquaredByEntity[entityId] = distanceSquared;
    const intensity = deriveIndividualEnergyMovementIntensity(dx, dy);
    internal.intensityByEntity[entityId] = INTENSITIES.indexOf(intensity);
    internal.contextByEntity[entityId] = CONTEXTS.indexOf(classifyContext(
      internal, dependencies, entityId, distanceSquared, intensity,
    ));
  }
  return store;
}

export function deriveIndividualEnergyMovementIntensity(
  displacementX: number,
  displacementY: number,
): IndividualEnergyMovementIntensity {
  if (!Number.isSafeInteger(displacementX) || !Number.isSafeInteger(displacementY)) {
    throw new RangeError("Movement intensity requires safe integer displacement.");
  }
  const maximumAxisDistance = Math.max(Math.abs(displacementX), Math.abs(displacementY));
  if (maximumAxisDistance === 0) return "stationary";
  if (maximumAxisDistance === 1) return "walking";
  if (maximumAxisDistance === 2) return "jogging";
  return "sprinting";
}

export function getIndividualEnergyActivityInspection(
  store: IndividualEnergyActivityStore,
  entityId: number,
): IndividualEnergyActivityInspection {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  const mask = internal.movementAuthorityMaskByEntity[entityId]!;
  return {
    dominantContext: getIndividualEnergyActivityContext(store, entityId),
    displacementX: internal.displacementXByEntity[entityId]!,
    displacementY: internal.displacementYByEntity[entityId]!,
    actualMovementDistanceSquared: internal.distanceSquaredByEntity[entityId]!,
    movementIntensity: INTENSITIES[internal.intensityByEntity[entityId]!]!,
    validAttackAttemptCount: internal.attackAttemptCountByEntity[entityId]!,
    validDefenceAttemptCount: internal.defenceAttemptCountByEntity[entityId]!,
    movementOccurred: internal.distanceSquaredByEntity[entityId] !== 0,
    externallyMoved: internal.externallyMovedByEntity[entityId] !== 0,
    movementAuthorities: movementAuthorities(mask),
    observedTick: internal.observedTick,
  };
}

export function getIndividualEnergyActivityContext(
  store: IndividualEnergyActivityStore,
  entityId: number,
): IndividualEnergyActivityContext {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return CONTEXTS[internal.contextByEntity[entityId]!]!;
}

export function getIndividualEnergyActualMovementDistanceSquared(
  store: IndividualEnergyActivityStore,
  entityId: number,
): number {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.distanceSquaredByEntity[entityId]!;
}

export function getIndividualEnergyMovementIntensity(
  store: IndividualEnergyActivityStore,
  entityId: number,
): IndividualEnergyMovementIntensity {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return INTENSITIES[internal.intensityByEntity[entityId]!]!;
}

export function getIndividualEnergyAttackAttemptCount(
  store: IndividualEnergyActivityStore,
  entityId: number,
): number {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.attackAttemptCountByEntity[entityId]!;
}

export function getIndividualEnergyDefenceAttemptCount(
  store: IndividualEnergyActivityStore,
  entityId: number,
): number {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.defenceAttemptCountByEntity[entityId]!;
}

export function wasIndividualEnergyExternallyMoved(
  store: IndividualEnergyActivityStore,
  entityId: number,
): boolean {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.externallyMovedByEntity[entityId] !== 0;
}

function classifyContext(
  store: InternalIndividualEnergyActivityStore,
  dependencies: IndividualEnergyActivityClassificationDependencies,
  entityId: number,
  distanceSquared: number,
  intensity: IndividualEnergyMovementIntensity,
): IndividualEnergyActivityContext {
  const presence = getIndividualPlayerPresenceState(dependencies.presence, entityId);
  const lifecycle = getIndividualCharacterLifecycleState(dependencies.lifecycle, entityId);
  const sources = store.movementAuthorityMaskByEntity[entityId]!;
  const actions = store.actionEvidenceByEntity[entityId]!;

  return selectIndividualEnergyActivityContext({
    lifecycle,
    presence,
    movementOccurred: distanceSquared !== 0,
    movementIntensity: intensity,
    beingDragged: (sources & AUTHORITY_BITS.draggedPatient) !== 0,
    activeDragHelper: (sources & AUTHORITY_BITS.activeDragHelper) !== 0,
    treating: (actions & TREATING) !== 0,
    underTreatment: (actions & UNDER_TREATMENT) !== 0,
    executionCommitted: (actions & EXECUTION_COMMITMENT) !== 0,
    medicalApproach: (sources & AUTHORITY_BITS.medicalApproach) !== 0,
    alert: dependencies.isAlert(entityId),
  });
}

/** Named, deterministic precedence shared by production and focused tests. */
export function selectIndividualEnergyActivityContext(
  evidence: IndividualEnergyActivityContextEvidence,
): IndividualEnergyActivityContext {
  // Final procedure state is strongest. The terminal-awaiting-comfort presence is
  // deliberately allowed to be carried or treated before becoming inactive.
  if (evidence.presence === "waitingAtRespawn") return "waitingAtRespawn";
  if (evidence.presence === "respawnEgress") return "respawnEgress";
  if (evidence.presence === "terminalComforted" ||
      evidence.presence === "removedFromBattlefield") return "inactiveTerminal";
  if (evidence.beingDragged) return "beingDragged";
  if (evidence.activeDragHelper) return "dragging";
  if (evidence.treating) return "treating";
  if (evidence.underTreatment) return "underTreatment";
  if (evidence.executionCommitted) return "executionCommitment";
  if (evidence.lifecycle === "terminal") return "inactiveTerminal";
  if (evidence.movementOccurred && evidence.medicalApproach) return "medicalApproach";
  if (evidence.lifecycle === "dying" || evidence.presence === "downedPresence") {
    return "downedRest";
  }
  if (evidence.movementOccurred) {
    if (evidence.movementIntensity === "walking") return "walking";
    if (evidence.movementIntensity === "jogging") return "jogging";
    return "sprinting";
  }
  return evidence.alert ? "alertStationary" : "safeStationaryRest";
}

function addTreatmentEvidence(
  store: InternalIndividualEnergyActivityStore,
  dependencies: IndividualEnergyActivityClassificationDependencies,
): void {
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    const action = getIndividualTreatmentActionInspection(dependencies.treatments, entityId);
    if (action === undefined) continue;
    orActionEvidence(store, action.healerEntityId, TREATING);
    orActionEvidence(store, action.patientEntityId, UNDER_TREATMENT);
  }
  addTreatmentRecords(store, dependencies.treatmentResult.startedRecords);
  addTreatmentRecords(store, dependencies.treatmentResult.interruptedRecords);
  addTreatmentRecords(store, dependencies.treatmentResult.completedRecords);
}

function addExecutionEvidence(
  store: InternalIndividualEnergyActivityStore,
  dependencies: IndividualEnergyActivityClassificationDependencies,
): void {
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    const action = getIndividualExecutionActionInspection(dependencies.executions, entityId);
    if (action !== undefined) {
      orActionEvidence(store, action.executorEntityId, EXECUTION_COMMITMENT);
    }
  }
  addExecutionRecords(store, dependencies.executionResult.startedRecords);
  addExecutionRecords(store, dependencies.executionResult.interruptedRecords);
  addExecutionRecords(store, dependencies.executionResult.completedRecords);
}

function addTreatmentRecords(
  store: InternalIndividualEnergyActivityStore,
  records: readonly { readonly healerEntityId: number; readonly patientEntityId: number }[],
): void {
  for (const action of records) {
    orActionEvidence(store, action.healerEntityId, TREATING);
    orActionEvidence(store, action.patientEntityId, UNDER_TREATMENT);
  }
}

function addExecutionRecords(
  store: InternalIndividualEnergyActivityStore,
  records: readonly { readonly executorEntityId: number }[],
): void {
  for (const action of records) {
    orActionEvidence(store, action.executorEntityId, EXECUTION_COMMITMENT);
  }
}

function markChangedEntity(
  store: InternalIndividualEnergyActivityStore,
  world: WorldState,
  entityId: number,
  authority: IndividualEnergyMovementAuthority,
  external: boolean,
): void {
  assertEntityId(entityId, store.entityCount);
  if (world.positionsX[entityId] === store.checkpointXByEntity[entityId] &&
      world.positionsY[entityId] === store.checkpointYByEntity[entityId]) return;
  store.movementAuthorityMaskByEntity[entityId] =
    store.movementAuthorityMaskByEntity[entityId]! | AUTHORITY_BITS[authority];
  if (external) store.externallyMovedByEntity[entityId] = 1;
}

function entityChangedSinceCheckpoint(
  store: InternalIndividualEnergyActivityStore,
  world: WorldState,
  entityId: number,
): boolean {
  return world.positionsX[entityId] !== store.checkpointXByEntity[entityId] ||
    world.positionsY[entityId] !== store.checkpointYByEntity[entityId];
}

function orActionEvidence(
  store: InternalIndividualEnergyActivityStore,
  entityId: number,
  evidence: number,
): void {
  assertEntityId(entityId, store.entityCount);
  store.actionEvidenceByEntity[entityId] =
    store.actionEvidenceByEntity[entityId]! | evidence;
}

function movementAuthorities(mask: number): readonly IndividualEnergyMovementAuthority[] {
  const out: IndividualEnergyMovementAuthority[] = [];
  for (const authority of Object.keys(AUTHORITY_BITS) as IndividualEnergyMovementAuthority[]) {
    if ((mask & AUTHORITY_BITS[authority]) !== 0) out.push(authority);
  }
  return out;
}

function incrementChecked(array: Uint32Array, entityId: number, label: string): void {
  assertEntityId(entityId, array.length);
  const current = array[entityId]!;
  if (current === 0xffff_ffff) throw new RangeError(`Energy ${label} count overflow.`);
  array[entityId] = current + 1;
}

function validateDependencies(
  entityCount: number,
  dependencies: IndividualEnergyActivityClassificationDependencies,
): void {
  const stores = [dependencies.lifecycle, dependencies.presence,
    dependencies.treatments, dependencies.executions];
  if (stores.some((store) => store.entityCount !== entityCount)) {
    throw new RangeError("Energy activity dependencies must match entityCount.");
  }
}

function requireStore(
  store: IndividualEnergyActivityStore,
  entityCount = store.entityCount,
): InternalIndividualEnergyActivityStore {
  if (store.entityCount !== entityCount) {
    throw new RangeError("Energy activity store must match entityCount.");
  }
  const internal = activityStoreInternals.get(store);
  if (internal === undefined) {
    throw new TypeError("Unknown individual energy activity store.");
  }
  return internal;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError(`Invalid energy activity entity ID ${entityId}.`);
  }
}

function assertTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError("Energy activity tick must be a non-negative safe integer.");
  }
}
