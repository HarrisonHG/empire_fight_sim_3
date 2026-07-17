import {
  getIndividualCharacterLifecycleState,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";
import {
  getIndividualCasualtyProcedureProfile,
  type IndividualCasualtyProcedureProfileStore,
} from "./individualCasualtyProcedureProfile";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
  type IndividualGlobalHitStore,
} from "./individualGlobalHits";
import {
  getIndividualAvailableGenericHerbs,
  getTrustedIndividualMedicalProfile,
  type IndividualGenericHerbStore,
  type TrustedIndividualMedicalProfileStore,
} from "./individualMedicalProfile";
import {
  isIndividualOrdinaryParticipationEligible,
  setIndividualOrdinaryParticipationEligible,
  type IndividualOrdinaryParticipationSnapshot,
} from "./individualOrdinaryParticipation";
import {
  getIndividualTraumaticWoundInspection,
  type IndividualTraumaticWoundStore,
} from "./individualTraumaticWound";
import {
  getHighestPriorityIndividualLimbDisability,
  type IndividualLimbDisabilityStore,
} from "./individualLimbDisability";
import {
  applyIndividualExternalMovementIntent,
  getIndividualPressure,
  getIndividualRole,
  getUnitHeading,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  type UnitIdentityStore,
} from "./unitIdentity";
import type { SimulationBounds, WorldState } from "./types";

export type IndividualMedicalUrgencyKind =
  | "none"
  | "comfortableMissingHits"
  | "belowHalfHits"
  | "dangerouslyLowHits"
  | "traumaticWound"
  | "disabledArm"
  | "disabledLeg"
  | "dying"
  | "terminalComfort";

export type IndividualTraumaWithdrawalGoalKind =
  | "none"
  | "availablePhysick"
  | "lowThreatRear";

export interface IndividualMedicalUrgencyStore {
  readonly entityCount: number;
}

interface InternalIndividualMedicalUrgencyStore
  extends IndividualMedicalUrgencyStore {
  readonly urgencyKindByEntity: Uint8Array;
  readonly urgencyPriorityByEntity: Int16Array;
  readonly withdrawingByEntity: Uint8Array;
  readonly withdrawalGoalKindByEntity: Uint8Array;
  readonly withdrawalTargetPhysickByEntity: Float64Array;
  readonly withdrawalGoalXByEntity: Float64Array;
  readonly withdrawalGoalYByEntity: Float64Array;
  readonly localPatientCandidateCountByEntity: Uint16Array;
  readonly localPhysickCandidateCountByEntity: Uint16Array;
  readonly withdrawalThreatCountByEntity: Uint16Array;
  readonly patientQueryScratch: IndividualMedicalPatientCandidate[];
  readonly physickQueryScratch: IndividualAvailablePhysickCandidate[];
}

export interface IndividualMedicalUrgencyInspection {
  readonly urgencyKind: IndividualMedicalUrgencyKind;
  readonly urgencyPriority: number;
  readonly traumaWithdrawalActive: boolean;
  readonly withdrawalGoalKind: IndividualTraumaWithdrawalGoalKind;
  readonly withdrawalTargetPhysickEntityId: number;
  readonly withdrawalGoalX: number;
  readonly withdrawalGoalY: number;
  readonly localPatientCandidateCount: number;
  readonly localPhysickCandidateCount: number;
  readonly withdrawalThreatCount: number;
}

export interface IndividualAuthoritativeMedicalUrgency {
  readonly urgencyKind: IndividualMedicalUrgencyKind;
  readonly urgencyPriority: number;
}

export function getAuthoritativeIndividualMedicalUrgency(
  formationStore: FormationBehaviourStore,
  hitStore: IndividualGlobalHitStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  traumaStore: IndividualTraumaticWoundStore,
  limbStore: IndividualLimbDisabilityStore,
  entityId: number,
): IndividualAuthoritativeMedicalUrgency {
  validateMatchingEntityCounts(formationStore.entityCount, hitStore,
    lifecycleStore, traumaStore, limbStore);
  assertEntityId(entityId, formationStore.entityCount);
  const lifecycle = getIndividualCharacterLifecycleState(lifecycleStore, entityId);
  const currentHits = getIndividualCurrentGlobalHits(hitStore, entityId);
  if (lifecycle === "dying") {
    return currentHits === 0
      ? { urgencyKind: "dying", urgencyPriority: 500 }
      : { urgencyKind: "none", urgencyPriority: 0 };
  }
  if (lifecycle !== "active") return { urgencyKind: "none", urgencyPriority: 0 };
  const limb = getHighestPriorityIndividualLimbDisability(limbStore, entityId);
  if (limb === "disabledLeg") {
    return { urgencyKind: "disabledLeg", urgencyPriority: 450 };
  }
  if (limb === "disabledArm") {
    return { urgencyKind: "disabledArm", urgencyPriority: 425 };
  }
  if (getIndividualTraumaticWoundInspection(traumaStore, entityId).state === "active") {
    return { urgencyKind: "traumaticWound", urgencyPriority: 400 };
  }
  const maximumHits = getIndividualMaximumGlobalHits(hitStore, entityId);
  if (currentHits <= 0) return { urgencyKind: "none", urgencyPriority: 0 };
  const roleAdjustment = lowHitRoleAdjustment(formationStore, entityId);
  if (currentHits === 1 && maximumHits > 1) {
    return { urgencyKind: "dangerouslyLowHits", urgencyPriority: 300 + roleAdjustment };
  }
  if (currentHits * 2 < maximumHits) {
    return { urgencyKind: "belowHalfHits", urgencyPriority: 200 + roleAdjustment };
  }
  if (currentHits < maximumHits) {
    return { urgencyKind: "comfortableMissingHits", urgencyPriority: 100 + roleAdjustment };
  }
  return { urgencyKind: "none", urgencyPriority: 0 };
}

export interface IndividualMedicalLocalQueryStore {
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
}

interface InternalIndividualMedicalLocalQueryStore
  extends IndividualMedicalLocalQueryStore {
  readonly grid: SpatialGrid;
  readonly factionByEntity: Float64Array;
  readonly patientEligibleByEntity: Uint8Array;
  readonly physickEligibleByEntity: Uint8Array;
  readonly threatEligibleByEntity: Uint8Array;
  readonly candidateScratch: number[];
  prepared: boolean;
  preparationCount: number;
}

export interface IndividualMedicalPatientCandidate {
  readonly entityId: number;
  readonly distanceSquared: number;
  readonly urgencyKind: IndividualMedicalUrgencyKind;
  readonly urgencyPriority: number;
}

export interface IndividualAvailablePhysickCandidate {
  readonly entityId: number;
  readonly distanceSquared: number;
  readonly availableGenericHerbs: number;
}

export interface IndividualMedicalLocalQueryResult<T> {
  readonly records: readonly T[];
  readonly candidateCount: number;
}

/** Canonical local entity IDs from the already-prepared medical spatial grid. */
export function queryPreparedMedicalLocalEntityIdsWithinRadiusInto(
  store: IndividualMedicalLocalQueryStore,
  world: WorldState,
  sourceEntityId: number,
  radius: number,
  out: number[] = [],
): readonly number[] {
  assertEntityId(sourceEntityId, world.entityCount);
  return queryPreparedMedicalLocalEntityIdsNearPointInto(
    store,
    world,
    world.positionsX[sourceEntityId]!,
    world.positionsY[sourceEntityId]!,
    radius,
    out,
  );
}

/** Bounded point query used by local casualty decisions; never rebuilds the grid. */
export function queryPreparedMedicalLocalEntityIdsNearPointInto(
  store: IndividualMedicalLocalQueryStore,
  world: WorldState,
  x: number,
  y: number,
  radius: number,
  out: number[] = [],
): readonly number[] {
  const internal = requirePrepared(store, world.entityCount);
  const records = queryEntitiesWithinRadiusInto(
    internal.grid,
    Math.round(x),
    Math.round(y),
    radius,
    out,
  );
  records.sort(compareEntityIds);
  return records;
}

export function getPreparedMedicalFactionId(
  store: IndividualMedicalLocalQueryStore,
  entityId: number,
): number {
  const internal = requirePrepared(store, store.entityCount);
  assertEntityId(entityId, internal.entityCount);
  return internal.factionByEntity[entityId]!;
}

export function isPreparedMedicalThreatEligible(
  store: IndividualMedicalLocalQueryStore,
  entityId: number,
): boolean {
  const internal = requirePrepared(store, store.entityCount);
  assertEntityId(entityId, internal.entityCount);
  return internal.threatEligibleByEntity[entityId] !== 0;
}

export function isPreparedMedicalPhysickAvailable(
  store: IndividualMedicalLocalQueryStore,
  entityId: number,
): boolean {
  const internal = requirePrepared(store, store.entityCount);
  assertEntityId(entityId, internal.entityCount);
  return internal.physickEligibleByEntity[entityId] !== 0;
}

const URGENCY_NONE = 0;
const URGENCY_COMFORTABLE = 1;
const URGENCY_BELOW_HALF = 2;
const URGENCY_DANGEROUS = 3;
const URGENCY_TRAUMA = 4;
const URGENCY_DYING = 5;
const URGENCY_TERMINAL_COMFORT = 6;
const URGENCY_DISABLED_ARM = 7;
const URGENCY_DISABLED_LEG = 8;
const MEDICAL_QUERY_CELL_SIZE = 64;
export const LOCAL_MEDICAL_DISCOVERY_RADIUS = 192;
const WITHDRAWAL_GOAL_DISTANCE = 64;
const HIGH_PRESSURE_DUTY_THRESHOLD = 70;

export function createIndividualMedicalUrgencyStore(
  entityCount: number,
): IndividualMedicalUrgencyStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const target = new Float64Array(entityCount);
  const goalX = new Float64Array(entityCount);
  const goalY = new Float64Array(entityCount);
  target.fill(-1);
  goalX.fill(-1);
  goalY.fill(-1);
  return {
    entityCount,
    urgencyKindByEntity: new Uint8Array(entityCount),
    urgencyPriorityByEntity: new Int16Array(entityCount),
    withdrawingByEntity: new Uint8Array(entityCount),
    withdrawalGoalKindByEntity: new Uint8Array(entityCount),
    withdrawalTargetPhysickByEntity: target,
    withdrawalGoalXByEntity: goalX,
    withdrawalGoalYByEntity: goalY,
    localPatientCandidateCountByEntity: new Uint16Array(entityCount),
    localPhysickCandidateCountByEntity: new Uint16Array(entityCount),
    withdrawalThreatCountByEntity: new Uint16Array(entityCount),
    patientQueryScratch: [],
    physickQueryScratch: [],
  } as InternalIndividualMedicalUrgencyStore;
}

export function createIndividualMedicalLocalQueryStore(
  entityCount: number,
  bounds: SimulationBounds,
): IndividualMedicalLocalQueryStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  return {
    entityCount,
    bounds: Object.freeze({ width: bounds.width, height: bounds.height }),
    grid: createSpatialGrid({
      bounds,
      cellSize: MEDICAL_QUERY_CELL_SIZE,
      capacity: entityCount,
    }),
    factionByEntity: new Float64Array(entityCount),
    patientEligibleByEntity: new Uint8Array(entityCount),
    physickEligibleByEntity: new Uint8Array(entityCount),
    threatEligibleByEntity: new Uint8Array(entityCount),
    candidateScratch: [],
    prepared: false,
    preparationCount: 0,
  } as InternalIndividualMedicalLocalQueryStore;
}

export function projectIndividualMedicalUrgency(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  hitStore: IndividualGlobalHitStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  procedureStore: IndividualCasualtyProcedureProfileStore,
  traumaStore: IndividualTraumaticWoundStore,
  limbStore: IndividualLimbDisabilityStore,
  participation: IndividualOrdinaryParticipationSnapshot,
  store: IndividualMedicalUrgencyStore,
): void {
  const internal = requireUrgencyStore(store, identityStore.entityCount);
  validateMatchingEntityCounts(identityStore.entityCount, formationStore, hitStore,
    lifecycleStore, procedureStore, traumaStore, limbStore, participation);
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const lifecycle = getIndividualCharacterLifecycleState(lifecycleStore, entityId);
    const traumaActive = getIndividualTraumaticWoundInspection(
      traumaStore,
      entityId,
    ).state === "active";
    const citizen = getIndividualCasualtyProcedureProfile(
      procedureStore,
      entityId,
    ).procedureKind === "citizen";
    const withdrawing = lifecycle === "active" && citizen && traumaActive;
    internal.withdrawingByEntity[entityId] = withdrawing ? 1 : 0;
    setIndividualOrdinaryParticipationEligible(
      participation,
      entityId,
      lifecycle === "active" && !withdrawing,
    );

    const urgency = getAuthoritativeIndividualMedicalUrgency(
      formationStore, hitStore, lifecycleStore, traumaStore, limbStore, entityId,
    );
    internal.urgencyKindByEntity[entityId] = urgencyIdentityFromKind(
      urgency.urgencyKind,
    );
    internal.urgencyPriorityByEntity[entityId] = urgency.urgencyPriority;
    internal.withdrawalGoalKindByEntity[entityId] = 0;
    internal.withdrawalTargetPhysickByEntity[entityId] = -1;
    internal.withdrawalGoalXByEntity[entityId] = -1;
    internal.withdrawalGoalYByEntity[entityId] = -1;
    internal.localPatientCandidateCountByEntity[entityId] = 0;
    internal.localPhysickCandidateCountByEntity[entityId] = 0;
    internal.withdrawalThreatCountByEntity[entityId] = 0;
  }
}

export function prepareIndividualMedicalLocalQueries(
  world: WorldState,
  identityStore: UnitIdentityStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  medicalProfiles: TrustedIndividualMedicalProfileStore,
  herbs: IndividualGenericHerbStore,
  traumaStore: IndividualTraumaticWoundStore,
  urgencyStore: IndividualMedicalUrgencyStore,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot,
  moraleStates: UnitMoraleMovementStateSource,
  store: IndividualMedicalLocalQueryStore,
  options: IndividualMedicalLocalQueryPreparationOptions = {},
): void {
  const internal = requireQueryStore(store, world.entityCount);
  validateMatchingEntityCounts(world.entityCount, identityStore, lifecycleStore,
    medicalProfiles, herbs, traumaStore, urgencyStore, ordinaryParticipation);
  const urgency = urgencyStore as InternalIndividualMedicalUrgencyStore;
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    const unitId = getUnitIdForEntity(identityStore, entityId);
    internal.factionByEntity[entityId] = getFactionIdForUnit(identityStore, unitId);
    const lifecycle = getIndividualCharacterLifecycleState(lifecycleStore, entityId);
    const active = lifecycle === "active";
    internal.threatEligibleByEntity[entityId] =
      active && isIndividualOrdinaryParticipationEligible(
        ordinaryParticipation,
        entityId,
      ) ? 1 : 0;
    internal.patientEligibleByEntity[entityId] =
      lifecycle !== "terminal" &&
      options.isUnavailable?.(entityId) !== true &&
      urgency.urgencyKindByEntity[entityId] !== URGENCY_NONE
        ? 1
        : 0;
    const medical = getTrustedIndividualMedicalProfile(medicalProfiles, entityId);
    internal.physickEligibleByEntity[entityId] =
      active &&
      medical.hasPhysick &&
      getIndividualAvailableGenericHerbs(herbs, entityId) > 0 &&
      getIndividualTraumaticWoundInspection(traumaStore, entityId).state === "none" &&
      moraleStates.get(unitId) !== "routing" &&
      options.isTreating?.(entityId) !== true &&
      options.isUnavailable?.(entityId) !== true
        ? 1
        : 0;
  }
  buildSpatialGrid(internal.grid, world);
  internal.prepared = true;
  internal.preparationCount += 1;
}

export interface IndividualMedicalLocalQueryPreparationOptions {
  readonly isTreating?: (entityId: number) => boolean;
  readonly isUnavailable?: (entityId: number) => boolean;
}

export function queryIndividualAlliedPatientsWithinRadiusInto(
  store: IndividualMedicalLocalQueryStore,
  urgencyStore: IndividualMedicalUrgencyStore,
  world: WorldState,
  seekerEntityId: number,
  radius: number,
  out: IndividualMedicalPatientCandidate[] = [],
): IndividualMedicalLocalQueryResult<IndividualMedicalPatientCandidate> {
  const internal = requirePrepared(store, world.entityCount);
  const urgency = requireUrgencyStore(urgencyStore, world.entityCount);
  assertEntityId(seekerEntityId, world.entityCount);
  const candidates = queryEntitiesWithinRadiusInto(
    internal.grid,
    world.positionsX[seekerEntityId]!,
    world.positionsY[seekerEntityId]!,
    radius,
    internal.candidateScratch,
  );
  out.length = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const entityId = candidates[index]!;
    if (
      entityId === seekerEntityId ||
      internal.patientEligibleByEntity[entityId] === 0 ||
      internal.factionByEntity[entityId] !== internal.factionByEntity[seekerEntityId]
    ) continue;
    out.push({
      entityId,
      distanceSquared: distanceSquared(world, seekerEntityId, entityId),
      urgencyKind: urgencyKindFromIdentity(urgency.urgencyKindByEntity[entityId]!),
      urgencyPriority: urgency.urgencyPriorityByEntity[entityId]!,
    });
  }
  out.sort(comparePatients);
  return { records: out, candidateCount: out.length };
}

export function queryIndividualAvailableAlliedPhysicksWithinRadiusInto(
  store: IndividualMedicalLocalQueryStore,
  herbs: IndividualGenericHerbStore,
  world: WorldState,
  seekerEntityId: number,
  radius: number,
  out: IndividualAvailablePhysickCandidate[] = [],
): IndividualMedicalLocalQueryResult<IndividualAvailablePhysickCandidate> {
  const internal = requirePrepared(store, world.entityCount);
  validateMatchingEntityCounts(world.entityCount, herbs);
  assertEntityId(seekerEntityId, world.entityCount);
  const candidates = queryEntitiesWithinRadiusInto(
    internal.grid,
    world.positionsX[seekerEntityId]!,
    world.positionsY[seekerEntityId]!,
    radius,
    internal.candidateScratch,
  );
  out.length = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const entityId = candidates[index]!;
    if (
      entityId === seekerEntityId ||
      internal.physickEligibleByEntity[entityId] === 0 ||
      internal.factionByEntity[entityId] !== internal.factionByEntity[seekerEntityId]
    ) continue;
    out.push({
      entityId,
      distanceSquared: distanceSquared(world, seekerEntityId, entityId),
      availableGenericHerbs: getIndividualAvailableGenericHerbs(herbs, entityId),
    });
  }
  out.sort(compareDistanceThenEntity);
  return { records: out, candidateCount: out.length };
}

export function updateIndividualMedicalDiscoveryAndWithdrawalIntents(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  medicalProfiles: TrustedIndividualMedicalProfileStore,
  herbs: IndividualGenericHerbStore,
  urgencyStore: IndividualMedicalUrgencyStore,
  queryStore: IndividualMedicalLocalQueryStore,
): void {
  const urgency = requireUrgencyStore(urgencyStore, world.entityCount);
  const query = requirePrepared(queryStore, world.entityCount);
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    if (
      getTrustedIndividualMedicalProfile(medicalProfiles, entityId).hasPhysick &&
      query.physickEligibleByEntity[entityId] !== 0
    ) {
      const result = queryIndividualAlliedPatientsWithinRadiusInto(
        queryStore,
        urgencyStore,
        world,
        entityId,
        LOCAL_MEDICAL_DISCOVERY_RADIUS,
        urgency.patientQueryScratch,
      );
      urgency.localPatientCandidateCountByEntity[entityId] =
        clampUint16(result.candidateCount);
    }
    if (urgency.withdrawingByEntity[entityId] === 0) continue;
    const result = queryIndividualAvailableAlliedPhysicksWithinRadiusInto(
      queryStore,
      herbs,
      world,
      entityId,
      LOCAL_MEDICAL_DISCOVERY_RADIUS,
      urgency.physickQueryScratch,
    );
    urgency.localPhysickCandidateCountByEntity[entityId] =
      clampUint16(result.candidateCount);
    if (result.records.length > 0) {
      const targetEntityId = result.records[0]!.entityId;
      urgency.withdrawalGoalKindByEntity[entityId] = 1;
      urgency.withdrawalTargetPhysickByEntity[entityId] = targetEntityId;
      urgency.withdrawalGoalXByEntity[entityId] = world.positionsX[targetEntityId]!;
      urgency.withdrawalGoalYByEntity[entityId] = world.positionsY[targetEntityId]!;
      continue;
    }
    const unitId = getUnitIdForEntity(identityStore, entityId);
    const heading = getUnitHeading(formationStore, unitId);
    const goals = calculateTraumaWithdrawalCandidateGoals(
      world.positionsX[entityId]!,
      world.positionsY[entityId]!,
      heading.x,
      heading.y,
      world.bounds,
    );
    let bestX = goals[0]!.x;
    let bestY = goals[0]!.y;
    let bestThreatCount = Number.MAX_SAFE_INTEGER;
    for (let directionIndex = 0; directionIndex < goals.length; directionIndex += 1) {
      const goalX = goals[directionIndex]!.x;
      const goalY = goals[directionIndex]!.y;
      const threatCount = countHostilesNearPoint(
        query,
        entityId,
        Math.round(goalX),
        Math.round(goalY),
        LOCAL_MEDICAL_DISCOVERY_RADIUS,
      );
      if (threatCount < bestThreatCount) {
        bestThreatCount = threatCount;
        bestX = goalX;
        bestY = goalY;
      }
    }
    urgency.withdrawalGoalKindByEntity[entityId] = 2;
    urgency.withdrawalGoalXByEntity[entityId] = bestX;
    urgency.withdrawalGoalYByEntity[entityId] = bestY;
    urgency.withdrawalThreatCountByEntity[entityId] =
      clampUint16(bestThreatCount);
  }
}

export function getIndividualMedicalUrgencyInspection(
  store: IndividualMedicalUrgencyStore,
  entityId: number,
): IndividualMedicalUrgencyInspection {
  const internal = requireUrgencyStore(store, store.entityCount);
  assertEntityId(entityId, internal.entityCount);
  return {
    urgencyKind: urgencyKindFromIdentity(internal.urgencyKindByEntity[entityId]!),
    urgencyPriority: internal.urgencyPriorityByEntity[entityId]!,
    traumaWithdrawalActive: internal.withdrawingByEntity[entityId] !== 0,
    withdrawalGoalKind: withdrawalGoalFromIdentity(
      internal.withdrawalGoalKindByEntity[entityId]!,
    ),
    withdrawalTargetPhysickEntityId:
      internal.withdrawalTargetPhysickByEntity[entityId]!,
    withdrawalGoalX: internal.withdrawalGoalXByEntity[entityId]!,
    withdrawalGoalY: internal.withdrawalGoalYByEntity[entityId]!,
    localPatientCandidateCount:
      internal.localPatientCandidateCountByEntity[entityId]!,
    localPhysickCandidateCount:
      internal.localPhysickCandidateCountByEntity[entityId]!,
    withdrawalThreatCount:
      internal.withdrawalThreatCountByEntity[entityId]!,
  };
}

export function calculateTraumaWithdrawalCandidateGoals(
  patientX: number,
  patientY: number,
  headingX: number,
  headingY: number,
  bounds: SimulationBounds,
): readonly [
  { readonly x: number; readonly y: number },
  { readonly x: number; readonly y: number },
  { readonly x: number; readonly y: number },
] {
  const rearX = -headingX;
  const rearY = -headingY;
  const leftX = -rearY;
  const leftY = rearX;
  const diagonalScale = Math.SQRT1_2;
  return [
    {
      x: clampCoordinate(
        patientX + rearX * WITHDRAWAL_GOAL_DISTANCE,
        bounds.width,
      ),
      y: clampCoordinate(
        patientY + rearY * WITHDRAWAL_GOAL_DISTANCE,
        bounds.height,
      ),
    },
    {
      x: clampCoordinate(
        patientX +
          (rearX + leftX) * diagonalScale * WITHDRAWAL_GOAL_DISTANCE,
        bounds.width,
      ),
      y: clampCoordinate(
        patientY +
          (rearY + leftY) * diagonalScale * WITHDRAWAL_GOAL_DISTANCE,
        bounds.height,
      ),
    },
    {
      x: clampCoordinate(
        patientX +
          (rearX - leftX) * diagonalScale * WITHDRAWAL_GOAL_DISTANCE,
        bounds.width,
      ),
      y: clampCoordinate(
        patientY +
          (rearY - leftY) * diagonalScale * WITHDRAWAL_GOAL_DISTANCE,
        bounds.height,
      ),
    },
  ];
}

export function advanceIndividualTraumaWithdrawalMovementOneTick(
  world: WorldState,
  formationStore: FormationBehaviourStore,
  urgencyStore: IndividualMedicalUrgencyStore,
  isReceivingTreatment: (entityId: number) => boolean = () => false,
): number {
  const internal = requireUrgencyStore(urgencyStore, world.entityCount);
  let movedCount = 0;
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    if (internal.withdrawingByEntity[entityId] === 0) continue;
    if (isReceivingTreatment(entityId)) continue;
    if (applyIndividualExternalMovementIntent(
      world,
      formationStore,
      entityId,
      Math.round(internal.withdrawalGoalXByEntity[entityId]!),
      Math.round(internal.withdrawalGoalYByEntity[entityId]!),
      "withdrawForTreatment",
    )) movedCount += 1;
  }
  return movedCount;
}

export function isIndividualTraumaWithdrawalActive(
  store: IndividualMedicalUrgencyStore,
  entityId: number,
): boolean {
  const internal = requireUrgencyStore(store, store.entityCount);
  assertEntityId(entityId, internal.entityCount);
  return internal.withdrawingByEntity[entityId] !== 0;
}

export function getIndividualTraumaWithdrawalGoal(
  store: IndividualMedicalUrgencyStore,
  entityId: number,
): { readonly x: number; readonly y: number } | undefined {
  const internal = requireUrgencyStore(store, store.entityCount);
  assertEntityId(entityId, internal.entityCount);
  return internal.withdrawingByEntity[entityId] === 0
    ? undefined
    : {
        x: internal.withdrawalGoalXByEntity[entityId]!,
        y: internal.withdrawalGoalYByEntity[entityId]!,
      };
}

export function getIndividualMedicalLocalQueryPreparationCount(
  store: IndividualMedicalLocalQueryStore,
): number {
  return (store as InternalIndividualMedicalLocalQueryStore).preparationCount;
}

function lowHitRoleAdjustment(
  formationStore: FormationBehaviourStore,
  entityId: number,
): number {
  const role = getIndividualRole(formationStore, entityId);
  if (role === "recruit") return 10;
  if (
    role === "veteran" &&
    getIndividualPressure(formationStore, entityId) >= HIGH_PRESSURE_DUTY_THRESHOLD
  ) return -20;
  return role === "veteran" ? -10 : 0;
}

function countHostilesNearPoint(
  store: InternalIndividualMedicalLocalQueryStore,
  sourceEntityId: number,
  x: number,
  y: number,
  radius: number,
): number {
  const candidates = queryEntitiesWithinRadiusInto(
    store.grid,
    x,
    y,
    radius,
    store.candidateScratch,
  );
  let count = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const entityId = candidates[index]!;
    if (
      store.threatEligibleByEntity[entityId] !== 0 &&
      store.factionByEntity[entityId] !== store.factionByEntity[sourceEntityId]
    ) count += 1;
  }
  return count;
}

function comparePatients(
  left: IndividualMedicalPatientCandidate,
  right: IndividualMedicalPatientCandidate,
): number {
  if (left.urgencyPriority !== right.urgencyPriority) {
    return right.urgencyPriority - left.urgencyPriority;
  }
  return compareDistanceThenEntity(left, right);
}

function compareDistanceThenEntity(
  left: { readonly entityId: number; readonly distanceSquared: number },
  right: { readonly entityId: number; readonly distanceSquared: number },
): number {
  return left.distanceSquared !== right.distanceSquared
    ? left.distanceSquared - right.distanceSquared
    : left.entityId - right.entityId;
}

function compareEntityIds(left: number, right: number): number {
  return left - right;
}

function distanceSquared(world: WorldState, left: number, right: number): number {
  const dx = world.positionsX[left]! - world.positionsX[right]!;
  const dy = world.positionsY[left]! - world.positionsY[right]!;
  return dx * dx + dy * dy;
}

function urgencyKindFromIdentity(identity: number): IndividualMedicalUrgencyKind {
  switch (identity) {
    case URGENCY_COMFORTABLE: return "comfortableMissingHits";
    case URGENCY_BELOW_HALF: return "belowHalfHits";
    case URGENCY_DANGEROUS: return "dangerouslyLowHits";
    case URGENCY_TRAUMA: return "traumaticWound";
    case URGENCY_DYING: return "dying";
    case URGENCY_TERMINAL_COMFORT: return "terminalComfort";
    case URGENCY_DISABLED_ARM: return "disabledArm";
    case URGENCY_DISABLED_LEG: return "disabledLeg";
    default: return "none";
  }
}

function urgencyIdentityFromKind(kind: IndividualMedicalUrgencyKind): number {
  switch (kind) {
    case "comfortableMissingHits": return URGENCY_COMFORTABLE;
    case "belowHalfHits": return URGENCY_BELOW_HALF;
    case "dangerouslyLowHits": return URGENCY_DANGEROUS;
    case "traumaticWound": return URGENCY_TRAUMA;
    case "dying": return URGENCY_DYING;
    case "terminalComfort": return URGENCY_TERMINAL_COMFORT;
    case "disabledArm": return URGENCY_DISABLED_ARM;
    case "disabledLeg": return URGENCY_DISABLED_LEG;
    default: return URGENCY_NONE;
  }
}

function withdrawalGoalFromIdentity(identity: number): IndividualTraumaWithdrawalGoalKind {
  return identity === 1 ? "availablePhysick" : identity === 2 ? "lowThreatRear" : "none";
}

function requirePrepared(
  store: IndividualMedicalLocalQueryStore,
  entityCount: number,
): InternalIndividualMedicalLocalQueryStore {
  const internal = requireQueryStore(store, entityCount);
  if (!internal.prepared) {
    throw new Error("Medical local query store must be prepared before querying.");
  }
  return internal;
}

function requireUrgencyStore(
  store: IndividualMedicalUrgencyStore,
  entityCount: number,
): InternalIndividualMedicalUrgencyStore {
  if (store.entityCount !== entityCount) {
    throw new RangeError("Medical read-model dependencies must match entity count.");
  }
  return store as InternalIndividualMedicalUrgencyStore;
}

function requireQueryStore(
  store: IndividualMedicalLocalQueryStore,
  entityCount: number,
): InternalIndividualMedicalLocalQueryStore {
  if (store.entityCount !== entityCount) {
    throw new RangeError("Medical read-model dependencies must match entity count.");
  }
  return store as InternalIndividualMedicalLocalQueryStore;
}

function validateMatchingEntityCounts(
  entityCount: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  for (let index = 0; index < stores.length; index += 1) {
    if (stores[index]!.entityCount !== entityCount) {
      throw new RangeError("Medical read-model dependencies must match entity count.");
    }
  }
}

function clampCoordinate(value: number, extent: number): number {
  return Math.max(0, Math.min(extent - 1, value));
}

function clampUint16(value: number): number {
  return value > 0xffff ? 0xffff : value;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Medical read-model entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
