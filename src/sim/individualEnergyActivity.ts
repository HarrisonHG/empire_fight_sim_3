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
import {
  assertIndividualEnergyProfileOwnership,
  getIndividualCurrentEnergy,
  getIndividualEnergyLastStrenuousTick,
  getTrustedIndividualEnergyProfile,
  recoverIndividualEnergy,
  spendIndividualEnergy,
  type IndividualEnergyStore,
  type TrustedIndividualEnergyProfileStore,
} from "./individualEnergy";
import {
  assertIndividualEnergyCapabilityProjectionTick,
  getIndividualEnergyCapabilityProjectionTick,
  getIndividualMaximumActiveSpecialistGait,
  getIndividualMaximumRespawnEgressGait,
  type IndividualEnergyCapabilityStore,
} from "./individualEnergyCapability";
import {
  INDIVIDUAL_EXERTION_PERCENT_SCALE,
  assertIndividualEnergyExertionModifierInput,
  getIndividualBurdenExertionMultiplierPercent,
  getIndividualEnergyExertionModifierProjectionTick,
  getIndividualInjuryExertionMultiplierPercent,
  type IndividualEnergyExertionModifierInput,
} from "./individualEnergyExertionModifier";
import {
  clampPhysicalGait,
  INDIVIDUAL_PHYSICAL_GAITS,
  physicalGaitRank,
  requestedPhysicalGaitForMaximumStep,
  type IndividualPhysicalGait,
  type IndividualSpecialistMovementAuthority,
  type IndividualSpecialistPhysicalGaitAdapter,
} from "./individualPhysicalGait";
export type { IndividualPhysicalGait } from "./individualPhysicalGait";
import type { WorldState } from "./types";

export const INDIVIDUAL_ENERGY_WALKING_COST_PER_TICK = 1;
export const INDIVIDUAL_ENERGY_JOGGING_COST_PER_TICK = 8;
export const INDIVIDUAL_ENERGY_SPRINTING_COST_PER_TICK = 40;
export const INDIVIDUAL_ENERGY_VALID_ATTACK_IMPULSE = 80;
export const INDIVIDUAL_ENERGY_VALID_DEFENCE_IMPULSE = 50;
export const INDIVIDUAL_ENERGY_ACTIVE_DRAG_HELPER_SURCHARGE = 12;
export const INDIVIDUAL_ENERGY_ALERT_STATIONARY_RECOVERY = 2;
export const INDIVIDUAL_ENERGY_DOWNED_REST_RECOVERY = 4;
export const INDIVIDUAL_ENERGY_UNDER_TREATMENT_RECOVERY = 3;
export const INDIVIDUAL_ENERGY_WAITING_AT_RESPAWN_RECOVERY = 5;

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

/** Retained diagnostic name; physical gait is now the expenditure authority. */
export type IndividualEnergyMovementIntensity = IndividualPhysicalGait;

export type IndividualEnergyMovementAuthority =
  | "ordinaryMovement"
  | "routingMovement"
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
const INTENSITIES: readonly IndividualEnergyMovementIntensity[] =
  INDIVIDUAL_PHYSICAL_GAITS;

const AUTHORITY_BITS: Readonly<Record<IndividualEnergyMovementAuthority, number>> =
  Object.freeze({
    ordinaryMovement: 1 << 0,
    routingMovement: 1 << 1,
    casualtyGathering: 1 << 2,
    activeDragHelper: 1 << 3,
    draggedPatient: 1 << 4,
    medicalApproach: 1 << 5,
    traumaWithdrawal: 1 << 6,
    respawnEgress: 1 << 7,
    externalDisplacement: 1 << 8,
  });
const MOVEMENT_AUTHORITIES = Object.freeze(
  Object.keys(AUTHORITY_BITS) as IndividualEnergyMovementAuthority[],
);
const PERSONAL_MOVEMENT_AUTHORITY_MASK =
  AUTHORITY_BITS.ordinaryMovement |
  AUTHORITY_BITS.routingMovement |
  AUTHORITY_BITS.casualtyGathering |
  AUTHORITY_BITS.activeDragHelper |
  AUTHORITY_BITS.medicalApproach |
  AUTHORITY_BITS.traumaWithdrawal |
  AUTHORITY_BITS.respawnEgress;

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
  readonly requestedGaitByEntity: Uint8Array;
  readonly effectiveGaitByEntity: Uint8Array;
  readonly actualGaitByEntity: Uint8Array;
  readonly gaitReducedByCapabilityByEntity: Uint8Array;
  readonly gaitSourceByEntity: Int8Array;
  readonly gaitProducedDisplacementByEntity: Uint8Array;
  readonly displacementXByEntity: Float64Array;
  readonly displacementYByEntity: Float64Array;
  readonly distanceSquaredByEntity: Float64Array;
  readonly attackAttemptCountByEntity: Uint32Array;
  readonly defenceAttemptCountByEntity: Uint32Array;
  readonly movementAuthorityMaskByEntity: Uint16Array;
  readonly externallyMovedByEntity: Uint8Array;
  readonly actionEvidenceByEntity: Uint8Array;
  readonly movementExpenditureRequestedByEntity: Float64Array;
  readonly movementBaseExpenditureByEntity: Float64Array;
  readonly dragSurchargeByEntity: Uint8Array;
  readonly burdenMultiplierPercentByEntity: Uint16Array;
  readonly injuryMultiplierPercentByEntity: Uint16Array;
  readonly attackExpenditureRequestedByEntity: Float64Array;
  readonly attackBaseExpenditureByEntity: Float64Array;
  readonly defenceExpenditureRequestedByEntity: Float64Array;
  readonly defenceBaseExpenditureByEntity: Float64Array;
  readonly totalExpenditureRequestedByEntity: Float64Array;
  readonly expenditureAppliedByEntity: Uint32Array;
  readonly recoveryRequestedByEntity: Uint32Array;
  readonly recoveryAppliedByEntity: Uint32Array;
  readonly energyBeforeByEntity: Uint32Array;
  readonly energyAfterByEntity: Uint32Array;
  readonly expenditureClampedByEntity: Uint8Array;
  readonly recoveryClampedByEntity: Uint8Array;
  readonly exertionModifierProjectionTickByEntity: Float64Array;
  readonly applicationRequestScratch: MutableIndividualEnergyApplicationRequest;
  energyStore: IndividualEnergyStore | undefined;
  observationStartedTick: number;
  classificationCompletedTick: number;
  applicationCompletedTick: number;
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
  readonly requestedPhysicalGait: IndividualPhysicalGait;
  readonly effectivePhysicalGait: IndividualPhysicalGait;
  readonly actualPhysicalGait: IndividualPhysicalGait;
  readonly gaitReducedByCapability: boolean;
  readonly physicalGaitSource: IndividualEnergyMovementAuthority | null;
  readonly gaitProducedDisplacement: boolean;
  readonly validAttackAttemptCount: number;
  readonly validDefenceAttemptCount: number;
  readonly movementOccurred: boolean;
  readonly externallyMoved: boolean;
  readonly movementAuthorities: readonly IndividualEnergyMovementAuthority[];
  readonly observedTick: number;
  readonly classificationTick: number;
  readonly movementExpenditureRequested: number;
  readonly attackExpenditureRequested: number;
  readonly defenceExpenditureRequested: number;
  readonly totalExpenditureRequested: number;
  readonly expenditureApplied: number;
  readonly recoveryRequested: number;
  readonly recoveryApplied: number;
  readonly energyBefore: number;
  readonly energyAfter: number;
  readonly lastStrenuousTick: number | null;
  readonly expenditureClamped: boolean;
  readonly recoveryClamped: boolean;
  readonly applicationTick: number;
}

export interface IndividualEnergyExpenditureInspection {
  readonly movementBaseExpenditure: number;
  readonly dragSurcharge: number;
  readonly burdenExertionMultiplierPercent: number;
  readonly injuryExertionMultiplierPercent: number;
  readonly movementAdjustedExpenditure: number;
  readonly attackBaseExpenditure: number;
  readonly attackAdjustedExpenditure: number;
  readonly defenceBaseExpenditure: number;
  readonly defenceAdjustedExpenditure: number;
  readonly totalExpenditureRequested: number;
  readonly expenditureApplied: number;
  readonly expenditureClamped: boolean;
  readonly exertionModifierProjectionTickUsed: number | null;
  readonly applicationTick: number;
}

export interface IndividualEnergyApplicationRequest {
  readonly movementExpenditureRequested: number;
  readonly attackExpenditureRequested: number;
  readonly defenceExpenditureRequested: number;
  readonly totalExpenditureRequested: number;
  readonly recoveryRequested: number;
}

export interface IndividualEnergyApplicationRequestEvidence {
  readonly dominantContext: IndividualEnergyActivityContext;
  readonly movementOccurred: boolean;
  readonly movementIntensity: IndividualEnergyMovementIntensity;
  readonly actualPhysicalGait?: IndividualPhysicalGait;
  readonly personalMovementObserved: boolean;
  readonly beingDragged: boolean;
  readonly validAttackAttemptCount: number;
  readonly validDefenceAttemptCount: number;
  readonly safeRestRecoveryPerTick: number;
}

interface MutableIndividualEnergyApplicationRequest {
  movementExpenditureRequested: number;
  attackExpenditureRequested: number;
  defenceExpenditureRequested: number;
  totalExpenditureRequested: number;
  recoveryRequested: number;
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

export interface IndividualPhysicalGaitAuthorityEvidence {
  readonly source: IndividualEnergyMovementAuthority;
  readonly requestedGait: IndividualPhysicalGait;
}

export type IndividualPhysicalGaitEvidenceResolver = (
  entityId: number,
) => IndividualPhysicalGaitAuthorityEvidence | undefined;

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
    requestedGaitByEntity: new Uint8Array(entityCount),
    effectiveGaitByEntity: new Uint8Array(entityCount),
    actualGaitByEntity: new Uint8Array(entityCount),
    gaitReducedByCapabilityByEntity: new Uint8Array(entityCount),
    gaitSourceByEntity: new Int8Array(entityCount),
    gaitProducedDisplacementByEntity: new Uint8Array(entityCount),
    displacementXByEntity: new Float64Array(entityCount),
    displacementYByEntity: new Float64Array(entityCount),
    distanceSquaredByEntity: new Float64Array(entityCount),
    attackAttemptCountByEntity: new Uint32Array(entityCount),
    defenceAttemptCountByEntity: new Uint32Array(entityCount),
    movementAuthorityMaskByEntity: new Uint16Array(entityCount),
    externallyMovedByEntity: new Uint8Array(entityCount),
    actionEvidenceByEntity: new Uint8Array(entityCount),
    movementExpenditureRequestedByEntity: new Float64Array(entityCount),
    movementBaseExpenditureByEntity: new Float64Array(entityCount),
    dragSurchargeByEntity: new Uint8Array(entityCount),
    burdenMultiplierPercentByEntity: new Uint16Array(entityCount),
    injuryMultiplierPercentByEntity: new Uint16Array(entityCount),
    attackExpenditureRequestedByEntity: new Float64Array(entityCount),
    attackBaseExpenditureByEntity: new Float64Array(entityCount),
    defenceExpenditureRequestedByEntity: new Float64Array(entityCount),
    defenceBaseExpenditureByEntity: new Float64Array(entityCount),
    totalExpenditureRequestedByEntity: new Float64Array(entityCount),
    expenditureAppliedByEntity: new Uint32Array(entityCount),
    recoveryRequestedByEntity: new Uint32Array(entityCount),
    recoveryAppliedByEntity: new Uint32Array(entityCount),
    energyBeforeByEntity: new Uint32Array(entityCount),
    energyAfterByEntity: new Uint32Array(entityCount),
    expenditureClampedByEntity: new Uint8Array(entityCount),
    recoveryClampedByEntity: new Uint8Array(entityCount),
    exertionModifierProjectionTickByEntity: new Float64Array(entityCount),
    applicationRequestScratch: {
      movementExpenditureRequested: 0,
      attackExpenditureRequested: 0,
      defenceExpenditureRequested: 0,
      totalExpenditureRequested: 0,
      recoveryRequested: 0,
    },
    energyStore: undefined,
    observationStartedTick: -1,
    classificationCompletedTick: -1,
    applicationCompletedTick: -1,
  } as InternalIndividualEnergyActivityStore);
  const internal = activityStoreInternals.get(publicStore)!;
  internal.gaitSourceByEntity.fill(-1);
  internal.burdenMultiplierPercentByEntity.fill(
    INDIVIDUAL_EXERTION_PERCENT_SCALE,
  );
  internal.injuryMultiplierPercentByEntity.fill(
    INDIVIDUAL_EXERTION_PERCENT_SCALE,
  );
  internal.exertionModifierProjectionTickByEntity.fill(-1);
  return publicStore;
}

export function beginIndividualEnergyActivityObservation(
  store: IndividualEnergyActivityStore,
  world: WorldState,
  tick: number,
): void {
  const internal = requireStore(store, world.entityCount);
  assertTick(tick);
  if (tick < internal.observationStartedTick) {
    throw new Error("Energy activity observation cannot move backwards.");
  }
  if (internal.applicationCompletedTick === tick) {
    throw new Error("Energy activity observation cannot restart an applied tick.");
  }
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
  internal.contextByEntity.fill(0);
  internal.intensityByEntity.fill(0);
  internal.requestedGaitByEntity.fill(0);
  internal.effectiveGaitByEntity.fill(0);
  internal.actualGaitByEntity.fill(0);
  internal.gaitReducedByCapabilityByEntity.fill(0);
  internal.gaitSourceByEntity.fill(-1);
  internal.gaitProducedDisplacementByEntity.fill(0);
  resetApplicationOutputs(internal);
  internal.observationStartedTick = tick;
  internal.classificationCompletedTick = -1;
  internal.applicationCompletedTick = -1;
}

/**
 * Records which production authority changed a position since the preceding
 * checkpoint. Net tick displacement is still calculated exactly once at finalisation.
 */
export function observeIndividualEnergyMovementAuthority(
  store: IndividualEnergyActivityStore,
  world: WorldState,
  authority: IndividualEnergyMovementAuthority | IndividualPhysicalGaitEvidenceResolver,
  requestedGait?: IndividualPhysicalGait,
): void {
  const internal = requireStore(store, world.entityCount);
  assertObservationOpen(internal);
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const x = world.positionsX[entityId]!;
    const y = world.positionsY[entityId]!;
    const moved = x !== internal.checkpointXByEntity[entityId] ||
      y !== internal.checkpointYByEntity[entityId];
    const evidence = typeof authority === "function"
      ? authority(entityId)
      : moved
        ? {
            source: authority,
            requestedGait: requestedGait ?? deriveIndividualEnergyMovementIntensity(
              x - internal.checkpointXByEntity[entityId]!,
              y - internal.checkpointYByEntity[entityId]!,
            ),
          }
        : undefined;
    if (evidence === undefined) continue;
    const bit = AUTHORITY_BITS[evidence.source];
    internal.movementAuthorityMaskByEntity[entityId] =
      internal.movementAuthorityMaskByEntity[entityId]! | bit;
    if (evidence.source === "externalDisplacement" ||
        evidence.source === "draggedPatient") {
      internal.externallyMovedByEntity[entityId] = 1;
    }
    recordPhysicalGaitEvidence(
      internal,
      entityId,
      evidence.source,
      evidence.requestedGait,
      moved,
    );
  }
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const x = world.positionsX[entityId]!;
    const y = world.positionsY[entityId]!;
    internal.checkpointXByEntity[entityId] = x;
    internal.checkpointYByEntity[entityId] = y;
  }
}

export function checkpointIndividualEnergyMovementObservation(
  store: IndividualEnergyActivityStore,
  world: WorldState,
): void {
  const internal = requireStore(store, world.entityCount);
  assertObservationOpen(internal);
  internal.checkpointXByEntity.set(world.positionsX);
  internal.checkpointYByEntity.set(world.positionsY);
}

interface InternalSpecialistPhysicalGaitAdapter {
  readonly activity: IndividualEnergyActivityStore;
  readonly capabilities: IndividualEnergyCapabilityStore;
  readonly pendingSourceByEntity: Int8Array;
  readonly pendingRequestedGaitByEntity: Uint8Array;
  readonly pendingEffectiveGaitByEntity: Uint8Array;
  acceptedProjectionTick: number | null;
}

const specialistAdapterInternals = new WeakMap<
  IndividualSpecialistPhysicalGaitAdapter,
  InternalSpecialistPhysicalGaitAdapter
>();

export function createIndividualSpecialistPhysicalGaitAdapter(
  activity: IndividualEnergyActivityStore,
  capabilities: IndividualEnergyCapabilityStore,
): IndividualSpecialistPhysicalGaitAdapter {
  const internal: InternalSpecialistPhysicalGaitAdapter = {
    activity,
    capabilities,
    pendingSourceByEntity: new Int8Array(activity.entityCount),
    pendingRequestedGaitByEntity: new Uint8Array(activity.entityCount),
    pendingEffectiveGaitByEntity: new Uint8Array(activity.entityCount),
    acceptedProjectionTick: null,
  };
  internal.pendingSourceByEntity.fill(-1);
  let adapter: IndividualSpecialistPhysicalGaitAdapter;
  adapter = Object.freeze({
    entityCount: activity.entityCount,
    get acceptedProjectionTick() {
      return internal.acceptedProjectionTick;
    },
    acceptCapabilityProjection: (tick: number) =>
      acceptSpecialistCapabilityProjection(adapter, tick),
    validateCurrentTick: () => {
      validateSpecialistAdapterCurrentTick(adapter);
    },
    preflightActiveSpecialistMovement: (
      entityId: number,
      authority: IndividualSpecialistMovementAuthority,
      requestedGait: IndividualPhysicalGait,
    ) => preflightSpecialistMovement(
      adapter,
      entityId,
      authority,
      requestedGait,
    ),
    constrainPreflightedActiveDragHelperGait: (
      entityId: number,
      requestedGait: IndividualPhysicalGait,
      groupEffectiveGait: IndividualPhysicalGait,
    ) => constrainPreflightedActiveDragHelperGait(
      adapter,
      entityId,
      requestedGait,
      groupEffectiveGait,
    ),
    completeActiveSpecialistMovement: (
      entityId: number,
      authority: IndividualSpecialistMovementAuthority,
      requestedGait: IndividualPhysicalGait,
      actualGaitWhenDisplaced: IndividualPhysicalGait,
      producedDisplacement: boolean,
    ) => completeSpecialistMovement(
      adapter,
      entityId,
      authority,
      requestedGait,
      actualGaitWhenDisplaced,
      producedDisplacement,
      false,
    ),
    preflightRespawnEgressMovement: (entityId: number) =>
      preflightSpecialistMovement(
        adapter,
        entityId,
        "respawnEgress",
        "walking",
      ),
    completeRespawnEgressMovement: (
      entityId: number,
      actualGaitWhenDisplaced: IndividualPhysicalGait,
      producedDisplacement: boolean,
    ) => completeSpecialistMovement(
      adapter,
      entityId,
      "respawnEgress",
      "walking",
      actualGaitWhenDisplaced,
      producedDisplacement,
      false,
    ),
    preflightDraggedPatientMovement: (entityId: number) =>
      preflightSpecialistMovement(
        adapter,
        entityId,
        "draggedPatient",
        "stationary",
      ),
    completeDraggedPatientMovement: (
      entityId: number,
      producedDisplacement: boolean,
    ) => completeSpecialistMovement(
      adapter,
      entityId,
      "draggedPatient",
      "stationary",
      "stationary",
      producedDisplacement,
      true,
    ),
  });
  specialistAdapterInternals.set(adapter, internal);
  return adapter;
}

function acceptSpecialistCapabilityProjection(
  adapter: IndividualSpecialistPhysicalGaitAdapter,
  tick: number,
): void {
  const internal = requireSpecialistAdapter(adapter);
  assertTick(tick);
  if (internal.activity.entityCount !== internal.capabilities.entityCount) {
    throw new RangeError(
      "Specialist gait adapter dependencies must match entityCount.",
    );
  }
  if (internal.acceptedProjectionTick !== null) {
    if (tick === internal.acceptedProjectionTick) {
      throw new Error(
        "Specialist gait capability projection already accepted for this tick.",
      );
    }
    if (tick < internal.acceptedProjectionTick) {
      throw new Error(
        "Specialist gait capability projection cannot move backwards.",
      );
    }
  }
  const activity = requireStore(internal.activity);
  if (activity.observationStartedTick !== tick) {
    throw new Error(
      `Specialist gait capability requires activity observation tick ${tick}; ` +
      `received ${activity.observationStartedTick}.`,
    );
  }
  const projectionTick = getIndividualEnergyCapabilityProjectionTick(
    internal.capabilities,
  );
  if (projectionTick === null) {
    throw new Error("Specialist gait capability projection is null.");
  }
  if (projectionTick !== tick) {
    throw new Error(
      `Specialist gait capability projection must match tick ${tick}; ` +
      `received ${projectionTick}.`,
    );
  }
  assertIndividualEnergyCapabilityProjectionTick(internal.capabilities, tick);
  internal.acceptedProjectionTick = tick;
}

function validateSpecialistAdapterCurrentTick(
  adapter: IndividualSpecialistPhysicalGaitAdapter,
): InternalSpecialistPhysicalGaitAdapter {
  const internal = requireSpecialistAdapter(adapter);
  if (adapter.entityCount !== internal.activity.entityCount ||
      internal.activity.entityCount !== internal.capabilities.entityCount) {
    throw new RangeError(
      "Specialist gait adapter dependencies must match entityCount.",
    );
  }
  const activity = requireStore(internal.activity);
  assertObservationOpen(activity);
  if (internal.acceptedProjectionTick === null) {
    throw new Error("Specialist gait capability projection is unaccepted.");
  }
  if (activity.observationStartedTick !== internal.acceptedProjectionTick) {
    throw new Error(
      "Specialist gait capability requires the accepted current activity tick.",
    );
  }
  const capabilityTick = getIndividualEnergyCapabilityProjectionTick(
    internal.capabilities,
  );
  if (capabilityTick === null) {
    throw new Error("Specialist gait capability projection is null.");
  }
  if (capabilityTick !== internal.acceptedProjectionTick) {
    throw new Error(
      `Specialist gait capability projection must match accepted tick ` +
      `${internal.acceptedProjectionTick}; received ${capabilityTick}.`,
    );
  }
  assertIndividualEnergyCapabilityProjectionTick(
    internal.capabilities,
    internal.acceptedProjectionTick,
  );
  return internal;
}

function preflightSpecialistMovement(
  adapter: IndividualSpecialistPhysicalGaitAdapter,
  entityId: number,
  source: IndividualSpecialistMovementAuthority | "respawnEgress" | "draggedPatient",
  requestedGait: IndividualPhysicalGait,
): IndividualPhysicalGait {
  const adapterInternal = validateSpecialistAdapterCurrentTick(adapter);
  const activity = requireStore(adapterInternal.activity);
  assertEntityId(entityId, activity.entityCount);
  if (adapterInternal.pendingSourceByEntity[entityId] !== -1) {
    throw new Error(
      "Specialist gait movement already has an incomplete preflight.",
    );
  }
  const sourceIndex = MOVEMENT_AUTHORITIES.indexOf(source);
  const maximumGait = source === "respawnEgress"
    ? getIndividualMaximumRespawnEgressGait(
        adapterInternal.capabilities,
        entityId,
      )
    : source === "draggedPatient"
      ? "stationary"
      : getIndividualMaximumActiveSpecialistGait(
          adapterInternal.capabilities,
          entityId,
        );
  const effectiveGait = clampPhysicalGait(requestedGait, maximumGait);
  adapterInternal.pendingSourceByEntity[entityId] = sourceIndex;
  adapterInternal.pendingRequestedGaitByEntity[entityId] =
    INTENSITIES.indexOf(requestedGait);
  adapterInternal.pendingEffectiveGaitByEntity[entityId] =
    INTENSITIES.indexOf(effectiveGait);
  return effectiveGait;
}

function completeSpecialistMovement(
  adapter: IndividualSpecialistPhysicalGaitAdapter,
  entityId: number,
  source: IndividualSpecialistMovementAuthority | "respawnEgress" | "draggedPatient",
  requestedGait: IndividualPhysicalGait,
  actualGaitWhenDisplaced: IndividualPhysicalGait,
  producedDisplacement: boolean,
  external: boolean,
): void {
  const adapterInternal = validateSpecialistAdapterCurrentTick(adapter);
  const activity = requireStore(adapterInternal.activity);
  assertEntityId(entityId, activity.entityCount);
  const sourceIndex = MOVEMENT_AUTHORITIES.indexOf(source);
  const requestedGaitIndex = INTENSITIES.indexOf(requestedGait);
  if (adapterInternal.pendingSourceByEntity[entityId] !== sourceIndex ||
      adapterInternal.pendingRequestedGaitByEntity[entityId] !==
        requestedGaitIndex) {
    throw new Error(
      "Specialist gait completion requires a matching successful preflight.",
    );
  }
  const effectiveGait = INTENSITIES[
    adapterInternal.pendingEffectiveGaitByEntity[entityId]!
  ]!;
  activity.movementAuthorityMaskByEntity[entityId] =
    activity.movementAuthorityMaskByEntity[entityId]! | AUTHORITY_BITS[source];
  if (external) activity.externallyMovedByEntity[entityId] = 1;
  recordPhysicalGaitEvidence(
    activity,
    entityId,
    source,
    requestedGait,
    producedDisplacement,
    effectiveGait,
    actualGaitWhenDisplaced,
  );
  adapterInternal.pendingSourceByEntity[entityId] = -1;
}

function constrainPreflightedActiveDragHelperGait(
  adapter: IndividualSpecialistPhysicalGaitAdapter,
  entityId: number,
  requestedGait: IndividualPhysicalGait,
  groupEffectiveGait: IndividualPhysicalGait,
): void {
  const adapterInternal = validateSpecialistAdapterCurrentTick(adapter);
  const activity = requireStore(adapterInternal.activity);
  assertEntityId(entityId, activity.entityCount);
  const sourceIndex = MOVEMENT_AUTHORITIES.indexOf("activeDragHelper");
  const requestedGaitIndex = INTENSITIES.indexOf(requestedGait);
  if (adapterInternal.pendingSourceByEntity[entityId] !== sourceIndex ||
      adapterInternal.pendingRequestedGaitByEntity[entityId] !==
        requestedGaitIndex) {
    throw new Error(
      "Specialist drag-group gait requires a matching successful preflight.",
    );
  }
  const preflightEffectiveGait = INTENSITIES[
    adapterInternal.pendingEffectiveGaitByEntity[entityId]!
  ]!;
  if (physicalGaitRank(groupEffectiveGait) >
      physicalGaitRank(preflightEffectiveGait)) {
    throw new Error(
      "Specialist drag-group gait must not promote personal capability.",
    );
  }
  adapterInternal.pendingEffectiveGaitByEntity[entityId] =
    INTENSITIES.indexOf(groupEffectiveGait);
}

function requireSpecialistAdapter(
  adapter: IndividualSpecialistPhysicalGaitAdapter,
): InternalSpecialistPhysicalGaitAdapter {
  const internal = specialistAdapterInternals.get(adapter);
  if (internal === undefined) {
    throw new TypeError("Unknown specialist physical-gait adapter.");
  }
  return internal;
}

export function classifyIndividualEnergyActivityOneTick(
  store: IndividualEnergyActivityStore,
  dependencies: IndividualEnergyActivityClassificationDependencies,
): IndividualEnergyActivityStore {
  const { world } = dependencies;
  const internal = requireStore(store, world.entityCount);
  validateDependencies(internal.entityCount, dependencies);
  assertTick(dependencies.tick);
  if (dependencies.tick !== internal.observationStartedTick) {
    throw new Error("Energy activity classification requires observation for the same tick.");
  }
  if (internal.classificationCompletedTick === dependencies.tick) {
    throw new Error("Energy activity classification already completed for this observation.");
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
    if (distanceSquared === 0) {
      internal.actualGaitByEntity[entityId] = 0;
      internal.gaitProducedDisplacementByEntity[entityId] = 0;
    }
    internal.contextByEntity[entityId] = CONTEXTS.indexOf(classifyContext(
      internal,
      dependencies,
      entityId,
      distanceSquared,
      INTENSITIES[internal.actualGaitByEntity[entityId]!]!,
    ));
  }
  internal.classificationCompletedTick = dependencies.tick;
  return store;
}

export function initializeIndividualEnergyActivityApplicationState(
  activity: IndividualEnergyActivityStore,
  energy: IndividualEnergyStore,
): void {
  const internal = requireStore(activity, energy.entityCount);
  bindEnergyStore(internal, energy);
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const current = getIndividualCurrentEnergy(energy, entityId);
    internal.energyBeforeByEntity[entityId] = current;
    internal.energyAfterByEntity[entityId] = current;
  }
}

export function applyIndividualEnergyActivityOneTick(
  activity: IndividualEnergyActivityStore,
  profiles: TrustedIndividualEnergyProfileStore,
  energy: IndividualEnergyStore,
  tick: number,
  exertionModifiers?: IndividualEnergyExertionModifierInput | null,
): IndividualEnergyActivityStore {
  const internal = requireStore(activity, energy.entityCount);
  if (profiles.entityCount !== internal.entityCount) {
    throw new RangeError("Energy application stores must match entityCount.");
  }
  assertIndividualEnergyProfileOwnership(profiles, energy);
  assertTick(tick);
  if (internal.applicationCompletedTick === tick) {
    throw new Error("Energy activity application already completed for this tick.");
  }
  if (internal.observationStartedTick !== tick) {
    throw new Error("Energy activity application requires observation for the same tick.");
  }
  if (internal.classificationCompletedTick !== tick) {
    throw new Error("Energy activity application requires completed classification for the same tick.");
  }
  assertIndividualEnergyExertionModifierInput(
    exertionModifiers,
    internal.entityCount,
    tick,
  );
  bindEnergyStore(internal, energy);

  // Validate and stage every requested value before any current-energy mutation.
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const profile = getTrustedIndividualEnergyProfile(profiles, entityId);
    const request = internal.applicationRequestScratch;
    deriveIndividualEnergyApplicationRequestInto(
      CONTEXTS[internal.contextByEntity[entityId]!]!,
      internal.distanceSquaredByEntity[entityId] !== 0,
      INTENSITIES[internal.actualGaitByEntity[entityId]!]!,
      (internal.movementAuthorityMaskByEntity[entityId]! &
        PERSONAL_MOVEMENT_AUTHORITY_MASK) !== 0,
      (internal.movementAuthorityMaskByEntity[entityId]! &
        AUTHORITY_BITS.draggedPatient) !== 0,
      internal.attackAttemptCountByEntity[entityId]!,
      internal.defenceAttemptCountByEntity[entityId]!,
      profile.safeRestRecoveryPerTick,
      request,
    );
    const movementBaseExpenditure = request.movementExpenditureRequested;
    const movingDragHelper = exertionModifiers !== undefined &&
      movementBaseExpenditure > 0 &&
      (internal.movementAuthorityMaskByEntity[entityId]! &
        AUTHORITY_BITS.activeDragHelper) !== 0;
    const dragSurcharge = movingDragHelper
      ? INDIVIDUAL_ENERGY_ACTIVE_DRAG_HELPER_SURCHARGE
      : 0;
    const burdenMultiplier = exertionModifiers === undefined
      ? INDIVIDUAL_EXERTION_PERCENT_SCALE
      : getIndividualBurdenExertionMultiplierPercent(
          exertionModifiers.modifiers,
          entityId,
        );
    const injuryMultiplier = exertionModifiers === undefined
      ? INDIVIDUAL_EXERTION_PERCENT_SCALE
      : getIndividualInjuryExertionMultiplierPercent(
          exertionModifiers.modifiers,
          entityId,
        );
    const movementWithDrag = checkedAddition(
      movementBaseExpenditure,
      dragSurcharge,
      "movement and drag expenditure",
    );
    const movementExpenditure = calculateIndividualEnergyExertionAdjustedValue(
      movementWithDrag,
      burdenMultiplier,
      injuryMultiplier,
      "movement expenditure",
    );
    const attackExpenditure = calculateIndividualEnergyExertionAdjustedValue(
      request.attackExpenditureRequested,
      INDIVIDUAL_EXERTION_PERCENT_SCALE,
      injuryMultiplier,
      "attack expenditure",
    );
    const defenceExpenditure = calculateIndividualEnergyExertionAdjustedValue(
      request.defenceExpenditureRequested,
      INDIVIDUAL_EXERTION_PERCENT_SCALE,
      injuryMultiplier,
      "defence expenditure",
    );
    const totalExpenditure = checkedAddition(
      checkedAddition(
        movementExpenditure,
        attackExpenditure,
        "movement and attack expenditure",
      ),
      defenceExpenditure,
      "total expenditure",
    );
    const recoveryRequested = totalExpenditure === 0
      ? request.recoveryRequested
      : 0;
    internal.movementBaseExpenditureByEntity[entityId] =
      movementBaseExpenditure;
    internal.dragSurchargeByEntity[entityId] = dragSurcharge;
    internal.burdenMultiplierPercentByEntity[entityId] = burdenMultiplier;
    internal.injuryMultiplierPercentByEntity[entityId] = injuryMultiplier;
    internal.movementExpenditureRequestedByEntity[entityId] =
      movementExpenditure;
    internal.attackBaseExpenditureByEntity[entityId] =
      request.attackExpenditureRequested;
    internal.attackExpenditureRequestedByEntity[entityId] =
      attackExpenditure;
    internal.defenceBaseExpenditureByEntity[entityId] =
      request.defenceExpenditureRequested;
    internal.defenceExpenditureRequestedByEntity[entityId] =
      defenceExpenditure;
    internal.totalExpenditureRequestedByEntity[entityId] =
      totalExpenditure;
    internal.recoveryRequestedByEntity[entityId] = recoveryRequested;
    internal.expenditureAppliedByEntity[entityId] = 0;
    internal.recoveryAppliedByEntity[entityId] = 0;
    internal.expenditureClampedByEntity[entityId] = 0;
    internal.recoveryClampedByEntity[entityId] = 0;
    const current = getIndividualCurrentEnergy(energy, entityId);
    internal.energyBeforeByEntity[entityId] = current;
    internal.energyAfterByEntity[entityId] = current;
    internal.exertionModifierProjectionTickByEntity[entityId] =
      exertionModifiers === undefined
        ? -1
        : getIndividualEnergyExertionModifierProjectionTick(
            exertionModifiers.modifiers,
          )!;
  }

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const expenditureRequested =
      internal.totalExpenditureRequestedByEntity[entityId]!;
    const recoveryRequested = internal.recoveryRequestedByEntity[entityId]!;
    if (expenditureRequested > 0) {
      const result = spendIndividualEnergy(
        energy,
        entityId,
        expenditureRequested,
        tick,
      );
      internal.expenditureAppliedByEntity[entityId] = result.appliedAmount;
      internal.energyAfterByEntity[entityId] = result.currentEnergyAfter;
      internal.expenditureClampedByEntity[entityId] =
        result.appliedAmount < expenditureRequested ? 1 : 0;
    } else if (recoveryRequested > 0) {
      const result = recoverIndividualEnergy(
        energy,
        entityId,
        recoveryRequested,
        tick,
      );
      internal.recoveryAppliedByEntity[entityId] = result.appliedAmount;
      internal.energyAfterByEntity[entityId] = result.currentEnergyAfter;
      internal.recoveryClampedByEntity[entityId] =
        result.appliedAmount < recoveryRequested ? 1 : 0;
    }
  }
  internal.applicationCompletedTick = tick;
  return activity;
}

export function deriveIndividualEnergyApplicationRequest(
  evidence: IndividualEnergyApplicationRequestEvidence,
): IndividualEnergyApplicationRequest {
  const request: MutableIndividualEnergyApplicationRequest = {
    movementExpenditureRequested: 0,
    attackExpenditureRequested: 0,
    defenceExpenditureRequested: 0,
    totalExpenditureRequested: 0,
    recoveryRequested: 0,
  };
  deriveIndividualEnergyApplicationRequestInto(
    evidence.dominantContext,
    evidence.movementOccurred,
    evidence.actualPhysicalGait ?? evidence.movementIntensity,
    evidence.personalMovementObserved,
    evidence.beingDragged,
    evidence.validAttackAttemptCount,
    evidence.validDefenceAttemptCount,
    evidence.safeRestRecoveryPerTick,
    request,
  );
  return request;
}

function deriveIndividualEnergyApplicationRequestInto(
  dominantContext: IndividualEnergyActivityContext,
  movementOccurred: boolean,
  actualPhysicalGait: IndividualPhysicalGait,
  personalMovementObserved: boolean,
  beingDragged: boolean,
  validAttackAttemptCount: number,
  validDefenceAttemptCount: number,
  safeRestRecoveryPerTick: number,
  out: MutableIndividualEnergyApplicationRequest,
): void {
  assertNonNegativeSafeInteger(
    validAttackAttemptCount,
    "validAttackAttemptCount",
  );
  assertNonNegativeSafeInteger(
    validDefenceAttemptCount,
    "validDefenceAttemptCount",
  );
  assertNonNegativeSafeInteger(
    safeRestRecoveryPerTick,
    "safeRestRecoveryPerTick",
  );
  const movementExpenditureRequested =
    movementOccurred && personalMovementObserved && !beingDragged
      ? movementCostForIntensity(actualPhysicalGait)
      : 0;
  const attackExpenditureRequested = checkedMultiplication(
    validAttackAttemptCount,
    INDIVIDUAL_ENERGY_VALID_ATTACK_IMPULSE,
    "attack expenditure",
  );
  const defenceExpenditureRequested = checkedMultiplication(
    validDefenceAttemptCount,
    INDIVIDUAL_ENERGY_VALID_DEFENCE_IMPULSE,
    "defence expenditure",
  );
  const totalExpenditureRequested = checkedAddition(
    checkedAddition(
      movementExpenditureRequested,
      attackExpenditureRequested,
      "movement and attack expenditure",
    ),
    defenceExpenditureRequested,
    "total expenditure",
  );
  const recoveryRequested = totalExpenditureRequested === 0
    ? recoveryForContext(
        dominantContext,
        safeRestRecoveryPerTick,
      )
    : 0;
  out.movementExpenditureRequested = movementExpenditureRequested;
  out.attackExpenditureRequested = attackExpenditureRequested;
  out.defenceExpenditureRequested = defenceExpenditureRequested;
  out.totalExpenditureRequested = totalExpenditureRequested;
  out.recoveryRequested = recoveryRequested;
}

export function deriveIndividualEnergyMovementIntensity(
  displacementX: number,
  displacementY: number,
): IndividualEnergyMovementIntensity {
  if (!Number.isSafeInteger(displacementX) || !Number.isSafeInteger(displacementY)) {
    throw new RangeError("Movement intensity requires safe integer displacement.");
  }
  const maximumAxisDistance = Math.max(Math.abs(displacementX), Math.abs(displacementY));
  return requestedPhysicalGaitForMaximumStep(maximumAxisDistance);
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
    requestedPhysicalGait:
      INTENSITIES[internal.requestedGaitByEntity[entityId]!]!,
    effectivePhysicalGait:
      INTENSITIES[internal.effectiveGaitByEntity[entityId]!]!,
    actualPhysicalGait:
      INTENSITIES[internal.actualGaitByEntity[entityId]!]!,
    gaitReducedByCapability:
      internal.gaitReducedByCapabilityByEntity[entityId] !== 0,
    physicalGaitSource: nullableMovementAuthority(
      internal.gaitSourceByEntity[entityId]!,
    ),
    gaitProducedDisplacement:
      internal.gaitProducedDisplacementByEntity[entityId] !== 0,
    validAttackAttemptCount: internal.attackAttemptCountByEntity[entityId]!,
    validDefenceAttemptCount: internal.defenceAttemptCountByEntity[entityId]!,
    movementOccurred: internal.distanceSquaredByEntity[entityId] !== 0,
    externallyMoved: internal.externallyMovedByEntity[entityId] !== 0,
    movementAuthorities: movementAuthorities(mask),
    observedTick: internal.observationStartedTick,
    classificationTick: internal.classificationCompletedTick,
    movementExpenditureRequested:
      internal.movementExpenditureRequestedByEntity[entityId]!,
    attackExpenditureRequested:
      internal.attackExpenditureRequestedByEntity[entityId]!,
    defenceExpenditureRequested:
      internal.defenceExpenditureRequestedByEntity[entityId]!,
    totalExpenditureRequested:
      internal.totalExpenditureRequestedByEntity[entityId]!,
    expenditureApplied: internal.expenditureAppliedByEntity[entityId]!,
    recoveryRequested: internal.recoveryRequestedByEntity[entityId]!,
    recoveryApplied: internal.recoveryAppliedByEntity[entityId]!,
    energyBefore: internal.energyBeforeByEntity[entityId]!,
    energyAfter: internal.energyAfterByEntity[entityId]!,
    lastStrenuousTick: internal.energyStore === undefined
      ? null
      : getIndividualEnergyLastStrenuousTick(internal.energyStore, entityId),
    expenditureClamped: internal.expenditureClampedByEntity[entityId] !== 0,
    recoveryClamped: internal.recoveryClampedByEntity[entityId] !== 0,
    applicationTick: internal.applicationCompletedTick,
  };
}

export function getIndividualEnergyExpenditureInspection(
  store: IndividualEnergyActivityStore,
  entityId: number,
): IndividualEnergyExpenditureInspection {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    movementBaseExpenditure:
      internal.movementBaseExpenditureByEntity[entityId]!,
    dragSurcharge: internal.dragSurchargeByEntity[entityId]!,
    burdenExertionMultiplierPercent:
      internal.burdenMultiplierPercentByEntity[entityId]!,
    injuryExertionMultiplierPercent:
      internal.injuryMultiplierPercentByEntity[entityId]!,
    movementAdjustedExpenditure:
      internal.movementExpenditureRequestedByEntity[entityId]!,
    attackBaseExpenditure:
      internal.attackBaseExpenditureByEntity[entityId]!,
    attackAdjustedExpenditure:
      internal.attackExpenditureRequestedByEntity[entityId]!,
    defenceBaseExpenditure:
      internal.defenceBaseExpenditureByEntity[entityId]!,
    defenceAdjustedExpenditure:
      internal.defenceExpenditureRequestedByEntity[entityId]!,
    totalExpenditureRequested:
      internal.totalExpenditureRequestedByEntity[entityId]!,
    expenditureApplied: internal.expenditureAppliedByEntity[entityId]!,
    expenditureClamped:
      internal.expenditureClampedByEntity[entityId] !== 0,
    exertionModifierProjectionTickUsed:
      internal.exertionModifierProjectionTickByEntity[entityId]! < 0
        ? null
        : internal.exertionModifierProjectionTickByEntity[entityId]!,
    applicationTick: internal.applicationCompletedTick,
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
  for (const authority of MOVEMENT_AUTHORITIES) {
    if ((mask & AUTHORITY_BITS[authority]) !== 0) out.push(authority);
  }
  return out;
}

function recordPhysicalGaitEvidence(
  store: InternalIndividualEnergyActivityStore,
  entityId: number,
  source: IndividualEnergyMovementAuthority,
  requestedGait: IndividualPhysicalGait,
  producedDisplacement: boolean,
  effectiveGait: IndividualPhysicalGait = requestedGait,
  actualGaitWhenDisplaced: IndividualPhysicalGait = effectiveGait,
): void {
  const sourceIndex = MOVEMENT_AUTHORITIES.indexOf(source);
  const currentSource = nullableMovementAuthority(
    store.gaitSourceByEntity[entityId]!,
  );
  if (currentSource !== null &&
      gaitSourcePrecedence(source) < gaitSourcePrecedence(currentSource)) {
    return;
  }
  const externallyImposed = source === "externalDisplacement" ||
    source === "draggedPatient";
  store.gaitSourceByEntity[entityId] = sourceIndex;
  store.requestedGaitByEntity[entityId] = INTENSITIES.indexOf(requestedGait);
  store.effectiveGaitByEntity[entityId] = INTENSITIES.indexOf(effectiveGait);
  store.gaitReducedByCapabilityByEntity[entityId] =
    effectiveGait !== requestedGait ? 1 : 0;
  store.actualGaitByEntity[entityId] =
    producedDisplacement && !externallyImposed
      ? INTENSITIES.indexOf(actualGaitWhenDisplaced)
      : 0;
  store.gaitProducedDisplacementByEntity[entityId] =
    producedDisplacement && !externallyImposed ? 1 : 0;
}

function gaitSourcePrecedence(
  source: IndividualEnergyMovementAuthority,
): number {
  switch (source) {
    case "externalDisplacement": return 0;
    case "ordinaryMovement": return 1;
    case "routingMovement": return 2;
    case "traumaWithdrawal": return 3;
    case "medicalApproach": return 4;
    case "casualtyGathering": return 5;
    case "respawnEgress": return 6;
    case "activeDragHelper": return 7;
    case "draggedPatient": return 8;
  }
}

function nullableMovementAuthority(
  sourceIndex: number,
): IndividualEnergyMovementAuthority | null {
  return sourceIndex < 0 ? null : MOVEMENT_AUTHORITIES[sourceIndex] ?? null;
}

function movementCostForIntensity(
  intensity: IndividualEnergyMovementIntensity,
): number {
  switch (intensity) {
    case "walking": return INDIVIDUAL_ENERGY_WALKING_COST_PER_TICK;
    case "jogging": return INDIVIDUAL_ENERGY_JOGGING_COST_PER_TICK;
    case "sprinting": return INDIVIDUAL_ENERGY_SPRINTING_COST_PER_TICK;
    case "stationary": return 0;
  }
}

function recoveryForContext(
  context: IndividualEnergyActivityContext,
  safeRestRecoveryPerTick: number,
): number {
  switch (context) {
    case "safeStationaryRest": return safeRestRecoveryPerTick;
    case "alertStationary": return INDIVIDUAL_ENERGY_ALERT_STATIONARY_RECOVERY;
    case "downedRest": return INDIVIDUAL_ENERGY_DOWNED_REST_RECOVERY;
    case "underTreatment": return INDIVIDUAL_ENERGY_UNDER_TREATMENT_RECOVERY;
    case "waitingAtRespawn":
      return INDIVIDUAL_ENERGY_WAITING_AT_RESPAWN_RECOVERY;
    default: return 0;
  }
}

function checkedMultiplication(left: number, right: number, name: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${name} exceeds safe integer storage.`);
  }
  return result;
}

function checkedAddition(left: number, right: number, name: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`${name} exceeds safe integer storage.`);
  }
  return result;
}

export function calculateIndividualEnergyExertionAdjustedValue(
  base: number,
  burdenMultiplierPercent: number,
  injuryMultiplierPercent: number,
  name: string,
): number {
  assertNonNegativeSafeInteger(base, `${name} base`);
  assertPositiveSafeInteger(
    burdenMultiplierPercent,
    `${name} burden multiplier`,
  );
  assertPositiveSafeInteger(
    injuryMultiplierPercent,
    `${name} injury multiplier`,
  );
  if (base === 0) return 0;
  const burdenAdjustedNumerator = checkedMultiplication(
    base,
    burdenMultiplierPercent,
    `${name} burden numerator`,
  );
  const combinedNumerator = checkedMultiplication(
    burdenAdjustedNumerator,
    injuryMultiplierPercent,
    `${name} combined numerator`,
  );
  return Math.ceil(
    combinedNumerator /
      (INDIVIDUAL_EXERTION_PERCENT_SCALE *
        INDIVIDUAL_EXERTION_PERCENT_SCALE),
  );
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

function assertObservationOpen(
  store: InternalIndividualEnergyActivityStore,
): void {
  if (store.observationStartedTick < 0) {
    throw new Error("Energy activity observation must begin before recording evidence.");
  }
  if (store.classificationCompletedTick === store.observationStartedTick) {
    throw new Error("Energy activity observation is closed after classification.");
  }
}

function bindEnergyStore(
  activity: InternalIndividualEnergyActivityStore,
  energy: IndividualEnergyStore,
): void {
  if (activity.energyStore !== undefined && activity.energyStore !== energy) {
    throw new RangeError(
      "Energy activity inspection must use its bound individual energy store.",
    );
  }
  activity.energyStore = energy;
}

function resetApplicationOutputs(
  store: InternalIndividualEnergyActivityStore,
): void {
  store.movementExpenditureRequestedByEntity.fill(0);
  store.movementBaseExpenditureByEntity.fill(0);
  store.dragSurchargeByEntity.fill(0);
  store.burdenMultiplierPercentByEntity.fill(
    INDIVIDUAL_EXERTION_PERCENT_SCALE,
  );
  store.injuryMultiplierPercentByEntity.fill(
    INDIVIDUAL_EXERTION_PERCENT_SCALE,
  );
  store.attackExpenditureRequestedByEntity.fill(0);
  store.attackBaseExpenditureByEntity.fill(0);
  store.defenceExpenditureRequestedByEntity.fill(0);
  store.defenceBaseExpenditureByEntity.fill(0);
  store.totalExpenditureRequestedByEntity.fill(0);
  store.expenditureAppliedByEntity.fill(0);
  store.recoveryRequestedByEntity.fill(0);
  store.recoveryAppliedByEntity.fill(0);
  store.expenditureClampedByEntity.fill(0);
  store.recoveryClampedByEntity.fill(0);
  store.exertionModifierProjectionTickByEntity.fill(-1);
  if (store.energyStore === undefined) {
    store.energyBeforeByEntity.fill(0);
    store.energyAfterByEntity.fill(0);
    return;
  }
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    const current = getIndividualCurrentEnergy(store.energyStore, entityId);
    store.energyBeforeByEntity[entityId] = current;
    store.energyAfterByEntity[entityId] = current;
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

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
