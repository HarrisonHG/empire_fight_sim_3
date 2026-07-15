import type { CombatConsequenceApplication } from "./combatConsequences";
import type { IndividualCombatUnitConsequenceSummary } from "./individualCombatConsequences";
import type { IndividualMeleeAttackAttemptRecord } from "./individualCombatAction";
import {
  isIndividualCombatEligible,
  type IndividualCombatEligibilitySnapshot,
} from "./individualCombatEligibility";
import type {
  IndividualLandedHitApplicationRecord,
  IndividualZeroHitEvent,
} from "./individualGlobalHits";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import type { IndividualMeleeDefenceRecord } from "./individualMeleeDefence";
import type { CombatAttackOpportunity } from "./combatTempo";
import {
  applyUnitCohesionLoss,
  getIndividualConfidence,
  getIndividualMovementMode,
  getIndividualPressure,
  getIndividualRole,
  getUnitCohesion,
  getUnitMaximumCohesion,
  getUnitMovementStyle,
  isHostileContactMovementStyle,
  setIndividualPressure,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import type { UnitMoraleMovementStateSource } from "./moraleMovement";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import type { WorldState } from "./types";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export interface CombatPressureConfig {
  readonly engagedPressureDeltaPerMember?: number;
  readonly contactPressureDeltaPerMember?: number;
  readonly cohesionLossPressureScale?: number;
  readonly pressureDecayPerMember?: number;
  readonly highConfidenceThreshold?: number;
  readonly highConfidenceEngagementReduction?: number;
  readonly highConfidenceDecayBonus?: number;
}

export interface CombatPressureStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

/** Compact per-unit explanation for the latest pressure stage. */
export interface UnitPressureUpdate {
  readonly unitId: UnitId;
  readonly engaged: boolean;
  readonly inContact: boolean;
  readonly hasFreshPressure: boolean;
  readonly pressureBeforeAverage: number;
  readonly pressureAfterAverage: number;
  readonly confidenceAverage: number;
  readonly engagedPressureDeltaPerMember: number;
  readonly contactPressureDeltaPerMember: number;
  /** Already applied by the combat-consequence stage; never applied again here. */
  readonly consequencePressureDeltaPerMember: number;
  readonly appliedHitPressureDeltaPerMember: number;
  readonly zeroHitCohesionLossValue: number;
  readonly cohesionLossValue: number;
  readonly cohesionPressureDeltaPerMember: number;
  readonly decayPerMember: number;
  readonly individualProximityFloorAverage?: number;
  readonly individualIncomingAttackImpulseAverage?: number;
  readonly individualIncomingHitImpulseAverage?: number;
  readonly individualBlockedStrikeImpulseAverage?: number;
  readonly individualRecoveredPressureAverage?: number;
}

export interface CombatPressureTickResult {
  readonly updates: readonly UnitPressureUpdate[];
}

interface InternalCombatPressureStore extends CombatPressureStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly previousCohesion: Int32Array;
  readonly engagedByUnit: Uint8Array;
  readonly consequencePressureByUnit: Int32Array;
  readonly hasConsequenceByUnit: Uint8Array;
  readonly applyConsequencePressureByUnit: Uint8Array;
  readonly zeroHitCohesionLossByUnit: Int32Array;
  readonly proximityFloorByEntity: Int32Array;
  readonly nearbyHostileCountByEntity: Int16Array;
  readonly nearbyAllyCountByEntity: Int16Array;
  readonly incomingAttackImpulseByEntity: Int32Array;
  readonly incomingHitImpulseByEntity: Int32Array;
  readonly blockedStrikeImpulseByEntity: Int32Array;
  readonly recoveryPauseTicksByEntity: Int16Array;
  readonly recoveryCreditByEntity: Int16Array;
  readonly recoveryCreditAppliedByEntity: Int16Array;
  readonly pressureRecoveredByEntity: Int32Array;
  individualPressureGrid: SpatialGrid | undefined;
  readonly individualPressureNearbyScratch: number[];
}

interface ResolvedCombatPressureConfig {
  readonly engagedPressureDeltaPerMember: number;
  readonly contactPressureDeltaPerMember: number;
  readonly cohesionLossPressureScale: number;
  readonly pressureDecayPerMember: number;
  readonly highConfidenceThreshold: number;
  readonly highConfidenceEngagementReduction: number;
  readonly highConfidenceDecayBonus: number;
}

const DEFAULT_ENGAGED_PRESSURE_DELTA_PER_MEMBER = 4;
const DEFAULT_CONTACT_PRESSURE_DELTA_PER_MEMBER = 2;
const DEFAULT_COHESION_LOSS_PRESSURE_SCALE = 1;
const DEFAULT_PRESSURE_DECAY_PER_MEMBER = 2;
const DEFAULT_HIGH_CONFIDENCE_THRESHOLD = 750;
const DEFAULT_HIGH_CONFIDENCE_ENGAGEMENT_REDUCTION = 1;
const DEFAULT_HIGH_CONFIDENCE_DECAY_BONUS = 1;
/** Additional formation-owned pressure decay while a unit is routing safely. */
export const ROUTING_PRESSURE_DECAY_BONUS = {
  veteran: 2,
  regular: 1,
  recruit: 0,
} as const;
const MAX_INTEGER_STATE_VALUE = 0x7fff_ffff;
const INDIVIDUAL_PROXIMITY_RADIUS = 40;
const INDIVIDUAL_PROXIMITY_GRID_CELL_SIZE = 40;
const HOSTILE_PROXIMITY_FLOOR = 2;
const ALLIED_PROXIMITY_REDUCTION = 1;
const INCOMING_ATTACK_PRESSURE_IMPULSE = 12;
const INCOMING_HIT_PRESSURE_IMPULSE = 8;
const BLOCKED_STRIKE_PRESSURE_IMPULSE = 1;
const INCOMING_ATTACK_RECOVERY_PAUSE_TICKS = 20;
const RECOVERY_CREDITS_PER_PRESSURE = 4;
const DEFAULT_RESOLVED_CONFIG: ResolvedCombatPressureConfig = {
  engagedPressureDeltaPerMember: DEFAULT_ENGAGED_PRESSURE_DELTA_PER_MEMBER,
  contactPressureDeltaPerMember: DEFAULT_CONTACT_PRESSURE_DELTA_PER_MEMBER,
  cohesionLossPressureScale: DEFAULT_COHESION_LOSS_PRESSURE_SCALE,
  pressureDecayPerMember: DEFAULT_PRESSURE_DECAY_PER_MEMBER,
  highConfidenceThreshold: DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
  highConfidenceEngagementReduction:
    DEFAULT_HIGH_CONFIDENCE_ENGAGEMENT_REDUCTION,
  highConfidenceDecayBonus: DEFAULT_HIGH_CONFIDENCE_DECAY_BONUS,
};

export function createCombatPressureStore(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
): CombatPressureStore {
  validateStores(identityStore, formationStore);
  const unitIds = getUnitIds(identityStore);
  const previousCohesion = new Int32Array(unitIds.length);
  const unitIndexById = new Map<UnitId, number>();

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    unitIndexById.set(unitId, unitIndex);
    previousCohesion[unitIndex] = getUnitCohesion(formationStore, unitId);
  }

  return {
    entityCount: identityStore.entityCount,
    unitCount: identityStore.unitCount,
    unitIndexById,
    previousCohesion,
    engagedByUnit: new Uint8Array(unitIds.length),
    consequencePressureByUnit: new Int32Array(unitIds.length),
    hasConsequenceByUnit: new Uint8Array(unitIds.length),
    applyConsequencePressureByUnit: new Uint8Array(unitIds.length),
    zeroHitCohesionLossByUnit: new Int32Array(unitIds.length),
    proximityFloorByEntity: new Int32Array(identityStore.entityCount),
    nearbyHostileCountByEntity: new Int16Array(identityStore.entityCount),
    nearbyAllyCountByEntity: new Int16Array(identityStore.entityCount),
    incomingAttackImpulseByEntity: new Int32Array(identityStore.entityCount),
    incomingHitImpulseByEntity: new Int32Array(identityStore.entityCount),
    blockedStrikeImpulseByEntity: new Int32Array(identityStore.entityCount),
    recoveryPauseTicksByEntity: new Int16Array(identityStore.entityCount),
    recoveryCreditByEntity: new Int16Array(identityStore.entityCount),
    recoveryCreditAppliedByEntity: new Int16Array(identityStore.entityCount),
    pressureRecoveredByEntity: new Int32Array(identityStore.entityCount),
    individualPressureGrid: undefined,
    individualPressureNearbyScratch: [],
  } as InternalCombatPressureStore;
}

export type IndividualCombatPressureRecoveryContext =
  | "hostileNearby"
  | "noHostileMoving"
  | "noHostileStationary";

export interface IndividualCombatPressureInspection {
  readonly currentPressure: number;
  readonly proximityFloor: number;
  readonly nearbyHostileCount: number;
  readonly nearbyAllyCount: number;
  readonly incomingAttackImpulse: number;
  readonly incomingHitImpulse: number;
  readonly blockedStrikeImpulse: number;
  readonly recoveryPauseTicksRemaining: number;
  readonly recoveryContext: IndividualCombatPressureRecoveryContext;
  readonly recoveryCreditApplied: number;
  readonly recoveredPressureAmount: number;
}

export function getIndividualCombatPressureInspection(
  formationStore: FormationBehaviourStore,
  store: CombatPressureStore,
  entityId: number,
): IndividualCombatPressureInspection {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    currentPressure: getIndividualPressure(formationStore, entityId),
    proximityFloor: internal.proximityFloorByEntity[entityId]!,
    nearbyHostileCount: internal.nearbyHostileCountByEntity[entityId]!,
    nearbyAllyCount: internal.nearbyAllyCountByEntity[entityId]!,
    incomingAttackImpulse: internal.incomingAttackImpulseByEntity[entityId]!,
    incomingHitImpulse: internal.incomingHitImpulseByEntity[entityId]!,
    blockedStrikeImpulse: internal.blockedStrikeImpulseByEntity[entityId]!,
    recoveryPauseTicksRemaining:
      internal.recoveryPauseTicksByEntity[entityId]!,
    recoveryContext: recoveryContextForEntity(
      formationStore,
      internal,
      entityId,
    ),
    recoveryCreditApplied: internal.recoveryCreditAppliedByEntity[entityId]!,
    recoveredPressureAmount: internal.pressureRecoveredByEntity[entityId]!,
  };
}

/**
 * Runs after combat consequences and before morale assessment. Consequence
 * pressure was already applied by applyCombatConsequences; this stage records
 * that source and deliberately does not apply it a second time.
 */
export function advanceCombatPressureOneTick(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  attackOpportunities: readonly CombatAttackOpportunity[],
  consequenceApplications: readonly CombatConsequenceApplication[],
  store: CombatPressureStore,
  out: UnitPressureUpdate[] = [],
  config: CombatPressureConfig = {},
  tickStartMoraleStates?: UnitMoraleMovementStateSource,
): CombatPressureTickResult {
  validateStores(identityStore, formationStore);
  const internal = asInternal(store);
  if (
    internal.entityCount !== identityStore.entityCount ||
    internal.unitCount !== identityStore.unitCount
  ) {
    throw new RangeError(
      "Combat pressure store must match unit identity entity and unit counts.",
    );
  }
  const resolvedConfig = resolveConfig(config);
  prepareSourceScratch(
    identityStore,
    internal,
    attackOpportunities,
    consequenceApplications,
  );

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    out.push(
      applyUnitPressureUpdate(
        identityStore,
        formationStore,
        internal,
        unitId,
        unitIndex,
        resolvedConfig,
        tickStartMoraleStates,
      ),
    );
  }

  return { updates: out };
}

export function advanceIndividualCombatPressureOneTick(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  individualConsequences: readonly IndividualCombatUnitConsequenceSummary[],
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  defenceRecords: readonly IndividualMeleeDefenceRecord[],
  gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  hitApplications: readonly IndividualLandedHitApplicationRecord[],
  zeroHitEvents: readonly IndividualZeroHitEvent[],
  eligibility: IndividualCombatEligibilitySnapshot,
  store: CombatPressureStore,
  out: UnitPressureUpdate[] = [],
  config: CombatPressureConfig & {
    readonly appliedDamagePressureScale?: number;
  } = {},
  tickStartMoraleStates?: UnitMoraleMovementStateSource,
): CombatPressureTickResult {
  validateStores(identityStore, formationStore);
  if (
    world.entityCount !== identityStore.entityCount ||
    eligibility.entityCount !== identityStore.entityCount
  ) {
    throw new RangeError(
      "Individual combat pressure dependencies must match entity count.",
    );
  }
  const internal = asInternal(store);
  if (
    internal.entityCount !== identityStore.entityCount ||
    internal.unitCount !== identityStore.unitCount
  ) {
    throw new RangeError(
      "Combat pressure store must match unit identity entity and unit counts.",
    );
  }
  const appliedDamagePressureScale =
    config.appliedDamagePressureScale ?? 10;
  assertNonNegativeInteger(
    appliedDamagePressureScale,
    "appliedDamagePressureScale",
  );
  prepareIndividualSourceScratch(
    world,
    identityStore,
    formationStore,
    internal,
    individualConsequences,
    attackAttempts,
    defenceRecords,
    gateDecisions,
    hitApplications,
    zeroHitEvents,
    eligibility,
    appliedDamagePressureScale,
  );

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    out.push(
      applyIndividualUnitPressureUpdate(
        identityStore,
        formationStore,
        internal,
        unitId,
        unitIndex,
        tickStartMoraleStates,
      ),
    );
  }

  return { updates: out };
}

function prepareIndividualProximityFloors(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: InternalCombatPressureStore,
  eligibility: IndividualCombatEligibilitySnapshot,
): void {
  if (
    store.individualPressureGrid === undefined ||
    store.individualPressureGrid.capacity !== world.entityCount ||
    store.individualPressureGrid.bounds.width !== world.bounds.width ||
    store.individualPressureGrid.bounds.height !== world.bounds.height
  ) {
    store.individualPressureGrid = createSpatialGrid({
      bounds: world.bounds,
      cellSize: INDIVIDUAL_PROXIMITY_GRID_CELL_SIZE,
      capacity: world.entityCount,
    });
  }
  buildSpatialGrid(store.individualPressureGrid, world);

  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    if (!isIndividualCombatEligible(eligibility, entityId)) continue;
    const sourceUnitId = getUnitIdForEntity(identityStore, entityId);
    const sourceFactionId = getFactionIdForUnit(identityStore, sourceUnitId);
    const nearby = queryEntitiesWithinRadiusInto(
      store.individualPressureGrid,
      world.positionsX[entityId]!,
      world.positionsY[entityId]!,
      INDIVIDUAL_PROXIMITY_RADIUS,
      store.individualPressureNearbyScratch,
    );
    let hostileCount = 0;
    let allyCount = 0;
    for (let index = 0; index < nearby.length; index += 1) {
      const otherEntityId = nearby[index]!;
      if (
        otherEntityId === entityId ||
        !isIndividualCombatEligible(eligibility, otherEntityId)
      ) {
        continue;
      }
      const otherUnitId = getUnitIdForEntity(identityStore, otherEntityId);
      const otherFactionId = getFactionIdForUnit(identityStore, otherUnitId);
      if (otherFactionId === sourceFactionId) {
        allyCount += 1;
      } else {
        hostileCount += 1;
      }
    }
    store.nearbyHostileCountByEntity[entityId] = hostileCount;
    store.nearbyAllyCountByEntity[entityId] = allyCount;
    store.proximityFloorByEntity[entityId] = Math.max(
      0,
      hostileCount * HOSTILE_PROXIMITY_FLOOR -
        allyCount * ALLIED_PROXIMITY_REDUCTION,
    );
  }
}

function applyIndividualUnitPressureUpdate(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalCombatPressureStore,
  unitId: UnitId,
  unitIndex: number,
  tickStartMoraleStates: UnitMoraleMovementStateSource | undefined,
): UnitPressureUpdate {
  const members = getUnitMembers(identityStore, unitId);
  const confidenceAverage = calculateAverageConfidence(formationStore, members);
  const engaged = store.engagedByUnit[unitIndex] === 1;
  const inContact = isHostileContactMovementStyle(
    getUnitMovementStyle(formationStore, unitId),
  );
  const currentCohesion = getUnitCohesion(formationStore, unitId);
  const previousCohesion = store.previousCohesion[unitIndex]!;
  const cohesionLossValue =
    previousCohesion > currentCohesion
      ? previousCohesion - currentCohesion
      : 0;
  store.previousCohesion[unitIndex] = currentCohesion;

  const zeroHitCohesionLossValue = store.zeroHitCohesionLossByUnit[unitIndex]!;
  const pressureBearingCohesionLoss =
    cohesionLossValue > zeroHitCohesionLossValue
      ? cohesionLossValue - zeroHitCohesionLossValue
      : 0;
  const cohesionPressureDeltaPerMember = pressureBearingCohesionLoss;

  let pressureBeforeTotal = 0;
  let pressureAfterTotal = 0;
  let floorTotal = 0;
  let attackImpulseTotal = 0;
  let hitImpulseTotal = 0;
  let blockImpulseTotal = 0;
  let recoveredPressureTotal = 0;

  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    const entityId = members[memberIndex]!;
    const before = getIndividualPressure(formationStore, entityId);
    const after = applyIndividualPressureForEntity(
      formationStore,
      store,
      entityId,
      cohesionPressureDeltaPerMember,
    );
    pressureBeforeTotal += before;
    pressureAfterTotal += after;
    floorTotal += store.proximityFloorByEntity[entityId]!;
    attackImpulseTotal += store.incomingAttackImpulseByEntity[entityId]!;
    hitImpulseTotal += store.incomingHitImpulseByEntity[entityId]!;
    blockImpulseTotal += store.blockedStrikeImpulseByEntity[entityId]!;
    recoveredPressureTotal += store.pressureRecoveredByEntity[entityId]!;
  }

  const hasFreshPressure =
    attackImpulseTotal > 0 ||
    hitImpulseTotal > 0 ||
    blockImpulseTotal > 0 ||
    cohesionPressureDeltaPerMember > 0 ||
    store.applyConsequencePressureByUnit[unitIndex] === 1;

  return {
    unitId,
    engaged,
    inContact,
    hasFreshPressure,
    pressureBeforeAverage: pressureBeforeTotal / members.length,
    pressureAfterAverage: pressureAfterTotal / members.length,
    confidenceAverage,
    engagedPressureDeltaPerMember: 0,
    contactPressureDeltaPerMember: 0,
    consequencePressureDeltaPerMember:
      store.consequencePressureByUnit[unitIndex]!,
    appliedHitPressureDeltaPerMember:
      store.applyConsequencePressureByUnit[unitIndex] === 1
        ? Math.trunc(store.consequencePressureByUnit[unitIndex]! / members.length)
        : 0,
    zeroHitCohesionLossValue,
    cohesionLossValue,
    cohesionPressureDeltaPerMember,
    decayPerMember:
      tickStartMoraleStates?.get(unitId) === "routing"
        ? routingPressureDecayBonus(formationStore, members)
        : 0,
    individualProximityFloorAverage: Math.trunc(floorTotal / members.length),
    individualIncomingAttackImpulseAverage: Math.trunc(
      attackImpulseTotal / members.length,
    ),
    individualIncomingHitImpulseAverage: Math.trunc(
      hitImpulseTotal / members.length,
    ),
    individualBlockedStrikeImpulseAverage: Math.trunc(
      blockImpulseTotal / members.length,
    ),
    individualRecoveredPressureAverage: Math.trunc(
      recoveredPressureTotal / members.length,
    ),
  };
}

function applyIndividualPressureForEntity(
  formationStore: FormationBehaviourStore,
  store: InternalCombatPressureStore,
  entityId: number,
  cohesionPressureDelta: number,
): number {
  const floor = store.proximityFloorByEntity[entityId]!;
  const incomingAttackImpulse = store.incomingAttackImpulseByEntity[entityId]!;
  const incomingHitImpulse = store.incomingHitImpulseByEntity[entityId]!;
  const blockedStrikeImpulse = store.blockedStrikeImpulseByEntity[entityId]!;
  let pressure = getIndividualPressure(formationStore, entityId);
  const beforeImpulsePressure = pressure;
  pressure = Math.max(pressure, floor);
  pressure = increaseBounded(pressure, incomingAttackImpulse);
  pressure = increaseBounded(pressure, incomingHitImpulse);
  pressure = increaseBounded(pressure, blockedStrikeImpulse);
  pressure = increaseBounded(pressure, cohesionPressureDelta);

  if (incomingAttackImpulse > 0) {
    store.recoveryPauseTicksByEntity[entityId] =
      INCOMING_ATTACK_RECOVERY_PAUSE_TICKS;
    store.recoveryCreditByEntity[entityId] = 0;
  } else if (store.recoveryPauseTicksByEntity[entityId]! > 0) {
    store.recoveryPauseTicksByEntity[entityId] =
      store.recoveryPauseTicksByEntity[entityId]! - 1;
  } else if (pressure > floor) {
    const credit = recoveryCreditForEntity(formationStore, store, entityId);
    store.recoveryCreditByEntity[entityId] =
      store.recoveryCreditByEntity[entityId]! + credit;
    store.recoveryCreditAppliedByEntity[entityId] = credit;
    while (
      pressure > floor &&
      store.recoveryCreditByEntity[entityId]! >= RECOVERY_CREDITS_PER_PRESSURE
    ) {
      store.recoveryCreditByEntity[entityId] =
        store.recoveryCreditByEntity[entityId]! - RECOVERY_CREDITS_PER_PRESSURE;
      pressure -= 1;
      store.pressureRecoveredByEntity[entityId] =
        store.pressureRecoveredByEntity[entityId]! + 1;
    }
  }

  if (pressure < floor) {
    pressure = floor;
  }
  setIndividualPressure(formationStore, entityId, pressure);
  if (pressure <= beforeImpulsePressure && blockedStrikeImpulse > 0) {
    store.recoveryCreditByEntity[entityId] = Math.max(
      0,
      store.recoveryCreditByEntity[entityId]!,
    );
  }
  return pressure;
}

function recoveryCreditForEntity(
  formationStore: FormationBehaviourStore,
  store: InternalCombatPressureStore,
  entityId: number,
): number {
  const role = getIndividualRole(formationStore, entityId);
  if (store.nearbyHostileCountByEntity[entityId]! > 0) {
    if (role === "veteran") return 4;
    if (role === "regular") return 2;
    return 1;
  }
  if (getIndividualMovementMode(formationStore, entityId) !== "holdPosition") {
    if (role === "veteran") return 6;
    if (role === "regular") return 4;
    return 2;
  }
  if (role === "veteran") return 8;
  if (role === "regular") return 6;
  return 4;
}

function recoveryContextForEntity(
  formationStore: FormationBehaviourStore,
  store: InternalCombatPressureStore,
  entityId: number,
): IndividualCombatPressureRecoveryContext {
  if (store.nearbyHostileCountByEntity[entityId]! > 0) {
    return "hostileNearby";
  }
  return getIndividualMovementMode(formationStore, entityId) === "holdPosition"
    ? "noHostileStationary"
    : "noHostileMoving";
}

function prepareSourceScratch(
  identityStore: UnitIdentityStore,
  store: InternalCombatPressureStore,
  attackOpportunities: readonly CombatAttackOpportunity[],
  consequenceApplications: readonly CombatConsequenceApplication[],
): void {
  store.engagedByUnit.fill(0);
  store.consequencePressureByUnit.fill(0);
  store.hasConsequenceByUnit.fill(0);
  store.applyConsequencePressureByUnit.fill(0);
  store.zeroHitCohesionLossByUnit.fill(0);

  for (let index = 0; index < attackOpportunities.length; index += 1) {
    const opportunity = attackOpportunities[index]!;
    store.engagedByUnit[requireUnitIndex(store, opportunity.sourceUnitId)] = 1;
    store.engagedByUnit[requireUnitIndex(store, opportunity.targetUnitId)] = 1;
  }

  for (let index = 0; index < consequenceApplications.length; index += 1) {
    const consequence = consequenceApplications[index]!;
    const unitIndex = requireUnitIndex(store, consequence.targetUnitId);
    getUnitMembers(identityStore, consequence.sourceUnitId);
    store.hasConsequenceByUnit[unitIndex] = 1;
    store.consequencePressureByUnit[unitIndex] = increaseBounded(
      store.consequencePressureByUnit[unitIndex]!,
      consequence.pressureDeltaPerMember,
    );
  }
}

function prepareIndividualSourceScratch(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalCombatPressureStore,
  individualConsequences: readonly IndividualCombatUnitConsequenceSummary[],
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  defenceRecords: readonly IndividualMeleeDefenceRecord[],
  _gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  hitApplications: readonly IndividualLandedHitApplicationRecord[],
  _zeroHitEvents: readonly IndividualZeroHitEvent[],
  eligibility: IndividualCombatEligibilitySnapshot,
  appliedDamagePressureScale: number,
): void {
  store.engagedByUnit.fill(0);
  store.consequencePressureByUnit.fill(0);
  store.hasConsequenceByUnit.fill(0);
  store.applyConsequencePressureByUnit.fill(0);
  store.zeroHitCohesionLossByUnit.fill(0);
  store.proximityFloorByEntity.fill(0);
  store.nearbyHostileCountByEntity.fill(0);
  store.nearbyAllyCountByEntity.fill(0);
  store.incomingAttackImpulseByEntity.fill(0);
  store.incomingHitImpulseByEntity.fill(0);
  store.blockedStrikeImpulseByEntity.fill(0);
  store.recoveryCreditAppliedByEntity.fill(0);
  store.pressureRecoveredByEntity.fill(0);

  prepareIndividualProximityFloors(world, identityStore, store, eligibility);

  for (let index = 0; index < individualConsequences.length; index += 1) {
    const consequence = individualConsequences[index]!;
    const unitIndex = requireUnitIndex(store, consequence.unitId);
    const members = getUnitMembers(identityStore, consequence.unitId);
    if (consequence.outgoingValidAttackAttempts > 0 ||
      consequence.incomingValidAttackAttempts > 0) {
      store.engagedByUnit[unitIndex] = 1;
    }
    if (consequence.newlyZeroMembers > 0) {
      const maximumCohesion = getUnitMaximumCohesion(
        formationStore,
        consequence.unitId,
      );
      const requestedLoss = Math.ceil(
        (maximumCohesion * consequence.newlyZeroMembers) / members.length,
      );
      const appliedLoss = applyUnitCohesionLoss(
        formationStore,
        consequence.unitId,
        requestedLoss,
      );
      store.zeroHitCohesionLossByUnit[unitIndex] = appliedLoss;
    }
  }

  for (let index = 0; index < attackAttempts.length; index += 1) {
    const record = attackAttempts[index]!;
    if (record.outcome !== "attempted") continue;
    store.hasConsequenceByUnit[
      requireUnitIndex(store, getUnitIdForEntity(identityStore, record.targetEntityId))
    ] = 1;
    store.incomingAttackImpulseByEntity[record.targetEntityId] =
      increaseBounded(
        store.incomingAttackImpulseByEntity[record.targetEntityId]!,
        INCOMING_ATTACK_PRESSURE_IMPULSE,
      );
  }

  for (let index = 0; index < hitApplications.length; index += 1) {
    const record = hitApplications[index]!;
    if (record.appliedHitLoss <= 0) continue;
    const hitImpulse = multiplyBounded(
      record.appliedHitLoss,
      INCOMING_HIT_PRESSURE_IMPULSE,
    );
    store.incomingHitImpulseByEntity[record.targetEntityId] = increaseBounded(
      store.incomingHitImpulseByEntity[record.targetEntityId]!,
      hitImpulse,
    );
    const unitIndex = requireUnitIndex(
      store,
      getUnitIdForEntity(identityStore, record.targetEntityId),
    );
    store.applyConsequencePressureByUnit[unitIndex] = 1;
    store.consequencePressureByUnit[unitIndex] = increaseBounded(
      store.consequencePressureByUnit[unitIndex]!,
      multiplyBounded(record.appliedHitLoss, appliedDamagePressureScale),
    );
  }

  for (let index = 0; index < defenceRecords.length; index += 1) {
    const record = defenceRecords[index]!;
    if (
      record.outcome !== "parried" &&
      record.outcome !== "bucklerBlocked" &&
      record.outcome !== "shieldBlocked"
    ) {
      continue;
    }
    store.blockedStrikeImpulseByEntity[record.attackerEntityId] =
      increaseBounded(
        store.blockedStrikeImpulseByEntity[record.attackerEntityId]!,
        BLOCKED_STRIKE_PRESSURE_IMPULSE,
      );
  }
}

function applyUnitPressureUpdate(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalCombatPressureStore,
  unitId: UnitId,
  unitIndex: number,
  config: ResolvedCombatPressureConfig,
  tickStartMoraleStates: UnitMoraleMovementStateSource | undefined,
): UnitPressureUpdate {
  const members = getUnitMembers(identityStore, unitId);
  const confidenceAverage = calculateAverageConfidence(formationStore, members);
  const highConfidence = confidenceAverage >= config.highConfidenceThreshold;
  const engaged = store.engagedByUnit[unitIndex] === 1;
  // Until a dedicated contact snapshot exists, formation's hostile-contact
  // movement styles are the authoritative current-contact signal.
  const inContact = isHostileContactMovementStyle(
    getUnitMovementStyle(formationStore, unitId),
  );
  const currentCohesion = getUnitCohesion(formationStore, unitId);
  const previousCohesion = store.previousCohesion[unitIndex]!;
  const cohesionLossValue =
    previousCohesion > currentCohesion
      ? previousCohesion - currentCohesion
      : 0;
  store.previousCohesion[unitIndex] = currentCohesion;

  const engagedPressureDeltaPerMember = reduceForHighConfidence(
    engaged ? config.engagedPressureDeltaPerMember : 0,
    highConfidence,
    config.highConfidenceEngagementReduction,
  );
  const contactPressureDeltaPerMember = reduceForHighConfidence(
    !engaged && inContact ? config.contactPressureDeltaPerMember : 0,
    highConfidence,
    config.highConfidenceEngagementReduction,
  );
  const consequencePressureDeltaPerMember =
    store.consequencePressureByUnit[unitIndex]!;
  const appliedHitPressureDeltaPerMember =
    store.applyConsequencePressureByUnit[unitIndex] === 1
      ? consequencePressureDeltaPerMember
      : 0;
  const zeroHitCohesionLossValue = store.zeroHitCohesionLossByUnit[unitIndex]!;
  const pressureBearingCohesionLoss =
    cohesionLossValue > zeroHitCohesionLossValue
      ? cohesionLossValue - zeroHitCohesionLossValue
      : 0;
  const cohesionPressureDeltaPerMember = multiplyBounded(
    pressureBearingCohesionLoss,
    config.cohesionLossPressureScale,
  );
  const hasFreshPressure =
    engagedPressureDeltaPerMember > 0 ||
    contactPressureDeltaPerMember > 0 ||
    store.hasConsequenceByUnit[unitIndex] === 1 ||
    cohesionPressureDeltaPerMember > 0;
  const decayPerMember = hasFreshPressure
    ? 0
    : config.pressureDecayPerMember +
      (highConfidence ? config.highConfidenceDecayBonus : 0) +
      (tickStartMoraleStates?.get(unitId) === "routing"
        ? routingPressureDecayBonus(formationStore, members)
        : 0);
  const appliedPressureDeltaPerMember =
    engagedPressureDeltaPerMember +
    contactPressureDeltaPerMember +
    appliedHitPressureDeltaPerMember +
    cohesionPressureDeltaPerMember;

  let pressureBeforeTotal = 0;
  let pressureAfterTotal = 0;
  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    const entityId = members[memberIndex]!;
    const before = getIndividualPressure(formationStore, entityId);
    const after =
      appliedPressureDeltaPerMember > 0
        ? increaseBounded(before, appliedPressureDeltaPerMember)
        : decreaseBounded(before, decayPerMember);
    setIndividualPressure(formationStore, entityId, after);
    pressureBeforeTotal += before;
    pressureAfterTotal += after;
  }

  return {
    unitId,
    engaged,
    inContact,
    hasFreshPressure,
    pressureBeforeAverage: Math.trunc(pressureBeforeTotal / members.length),
    pressureAfterAverage: Math.trunc(pressureAfterTotal / members.length),
    confidenceAverage,
    engagedPressureDeltaPerMember,
    contactPressureDeltaPerMember,
    consequencePressureDeltaPerMember,
    appliedHitPressureDeltaPerMember,
    zeroHitCohesionLossValue,
    cohesionLossValue,
    cohesionPressureDeltaPerMember,
    decayPerMember,
    individualProximityFloorAverage: 0,
    individualIncomingAttackImpulseAverage: 0,
    individualIncomingHitImpulseAverage: 0,
    individualBlockedStrikeImpulseAverage: 0,
    individualRecoveredPressureAverage: 0,
  };
}

function routingPressureDecayBonus(
  formationStore: FormationBehaviourStore,
  members: readonly number[],
): number {
  let total = 0;
  for (let index = 0; index < members.length; index += 1) {
    total += ROUTING_PRESSURE_DECAY_BONUS[
      getIndividualRole(formationStore, members[index]!)
    ];
  }
  return Math.trunc(total / members.length);
}

function calculateAverageConfidence(
  formationStore: FormationBehaviourStore,
  members: readonly number[],
): number {
  let total = 0;
  for (let index = 0; index < members.length; index += 1) {
    total += getIndividualConfidence(formationStore, members[index]!);
  }
  return Math.trunc(total / members.length);
}

function reduceForHighConfidence(
  value: number,
  highConfidence: boolean,
  reduction: number,
): number {
  if (!highConfidence || value === 0) {
    return value;
  }
  return value > reduction ? value - reduction : 0;
}

function resolveConfig(config: CombatPressureConfig): ResolvedCombatPressureConfig {
  if (
    config.engagedPressureDeltaPerMember === undefined &&
    config.contactPressureDeltaPerMember === undefined &&
    config.cohesionLossPressureScale === undefined &&
    config.pressureDecayPerMember === undefined &&
    config.highConfidenceThreshold === undefined &&
    config.highConfidenceEngagementReduction === undefined &&
    config.highConfidenceDecayBonus === undefined
  ) {
    return DEFAULT_RESOLVED_CONFIG;
  }
  const resolved = {
    engagedPressureDeltaPerMember:
      config.engagedPressureDeltaPerMember ??
      DEFAULT_ENGAGED_PRESSURE_DELTA_PER_MEMBER,
    contactPressureDeltaPerMember:
      config.contactPressureDeltaPerMember ??
      DEFAULT_CONTACT_PRESSURE_DELTA_PER_MEMBER,
    cohesionLossPressureScale:
      config.cohesionLossPressureScale ?? DEFAULT_COHESION_LOSS_PRESSURE_SCALE,
    pressureDecayPerMember:
      config.pressureDecayPerMember ?? DEFAULT_PRESSURE_DECAY_PER_MEMBER,
    highConfidenceThreshold:
      config.highConfidenceThreshold ?? DEFAULT_HIGH_CONFIDENCE_THRESHOLD,
    highConfidenceEngagementReduction:
      config.highConfidenceEngagementReduction ??
      DEFAULT_HIGH_CONFIDENCE_ENGAGEMENT_REDUCTION,
    highConfidenceDecayBonus:
      config.highConfidenceDecayBonus ?? DEFAULT_HIGH_CONFIDENCE_DECAY_BONUS,
  };
  assertNonNegativeInteger(
    resolved.engagedPressureDeltaPerMember,
    "engagedPressureDeltaPerMember",
  );
  assertNonNegativeInteger(
    resolved.contactPressureDeltaPerMember,
    "contactPressureDeltaPerMember",
  );
  assertNonNegativeInteger(
    resolved.cohesionLossPressureScale,
    "cohesionLossPressureScale",
  );
  assertNonNegativeInteger(
    resolved.pressureDecayPerMember,
    "pressureDecayPerMember",
  );
  assertNonNegativeInteger(
    resolved.highConfidenceThreshold, "highConfidenceThreshold");
  assertNonNegativeInteger(
    resolved.highConfidenceEngagementReduction,
    "highConfidenceEngagementReduction",
  );
  assertNonNegativeInteger(
    resolved.highConfidenceDecayBonus,
    "highConfidenceDecayBonus",
  );
  return resolved;
}

function validateStores(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
): void {
  if (
    formationStore.entityCount !== identityStore.entityCount ||
    formationStore.unitCount !== identityStore.unitCount
  ) {
    throw new RangeError(
      "Formation behaviour store must match unit identity entity and unit counts.",
    );
  }
}

function increaseBounded(current: number, amount: number): number {
  if (current > MAX_INTEGER_STATE_VALUE - amount) {
    return MAX_INTEGER_STATE_VALUE;
  }
  return current + amount;
}

function decreaseBounded(current: number, amount: number): number {
  return current > amount ? current - amount : 0;
}

function multiplyBounded(left: number, right: number): number {
  if (right !== 0 && left > Math.floor(MAX_INTEGER_STATE_VALUE / right)) {
    return MAX_INTEGER_STATE_VALUE;
  }
  return left * right;
}

function requireUnitIndex(
  store: InternalCombatPressureStore,
  unitId: UnitId,
): number {
  const unitIndex = store.unitIndexById.get(unitId);
  if (unitIndex === undefined) {
    throw new RangeError("Unknown unit ID for combat pressure store.");
  }
  return unitIndex;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Combat pressure entity ID is out of bounds.");
  }
}

function asInternal(store: CombatPressureStore): InternalCombatPressureStore {
  return store as InternalCombatPressureStore;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
