import {
  getUnitMovementStyle,
  isHostileContactMovementStyle,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
} from "./individualCasualtyLifecycle";
import {
  ENERGY_RATIO_FIXED_POINT_SCALE,
  INDIVIDUAL_VOLUNTARY_RESERVE_RATIO_FIXED_POINT,
  INDIVIDUAL_VOLUNTARY_SPRINT_RATIO_FIXED_POINT,
  getIndividualCurrentEnergy,
  getIndividualEnergyBand,
  getIndividualMaximumEnergy,
  getIndividualEnergyRatioFixedPoint,
  type IndividualEnergyStore,
} from "./individualEnergy";
import {
  calculateIndividualEnergyExertionAdjustedValue,
  INDIVIDUAL_ENERGY_SPRINTING_COST_PER_TICK,
} from "./individualEnergyActivity";
import {
  assertIndividualEnergyExertionModifierProjectionTick,
  getIndividualBurdenExertionMultiplierPercent,
  getIndividualInjuryExertionMultiplierPercent,
  type IndividualEnergyExertionModifierStore,
} from "./individualEnergyExertionModifier";
import {
  isIndividualOrdinaryParticipationEligible,
  type IndividualOrdinaryParticipationSnapshot,
} from "./individualOrdinaryParticipation";
import type { MoraleMovementState } from "./moraleMovement";
import type { IndividualPhysicalGait } from "./individualPhysicalGait";
import type { UnitRecoveryThreatSummary } from "./recoveryThreat";
import type { UnitEnergySummary } from "./unitEnergySummary";
import {
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export { INDIVIDUAL_VOLUNTARY_RESERVE_RATIO_FIXED_POINT } from "./individualEnergy";

export const UNIT_SAFE_REST_ENTER_RATIO_FIXED_POINT = 1_000;
export const UNIT_SAFE_REST_EXIT_RATIO_FIXED_POINT = 1_500;
export const UNIT_VOLUNTARY_JOG_RATIO_FIXED_POINT = 6_000;
export const UNIT_VOLUNTARY_SPRINT_RATIO_FIXED_POINT =
  INDIVIDUAL_VOLUNTARY_SPRINT_RATIO_FIXED_POINT;

export type UnitEnergyBehaviourRecommendation =
  | "normal"
  | "conserve"
  | "restWhenSafe";

export interface UnitEnergyBehaviourStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export interface UnitEnergyBehaviourInspection {
  readonly unitId: UnitId;
  readonly projectionTick: number | null;
  readonly recommendation: UnitEnergyBehaviourRecommendation;
  readonly resting: boolean;
  readonly maximumVoluntaryGait: IndividualPhysicalGait;
  readonly affordableSprintTicks: number;
}

export interface UnitEnergyRestSource {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly projectionTick: number | null;
  isUnitResting(unitId: UnitId): boolean;
  getMaximumVoluntaryGait(unitId: UnitId): IndividualPhysicalGait;
  getAffordableSprintTicks(unitId: UnitId): number;
}

export interface IndividualCombatConservationSource {
  readonly entityCount: number;
  readonly projectionTick: number | null;
  isReluctantToReacquireDistantCombat(entityId: number): boolean;
  canInitiateVoluntaryAttack(entityId: number): boolean;
}

export interface IndividualCombatConservationInput {
  readonly tick: number;
  readonly conservation: IndividualCombatConservationSource;
}

interface InternalUnitEnergyBehaviourStore extends UnitEnergyBehaviourStore {
  projectionTick: number | null;
  readonly unitIds: readonly UnitId[];
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly recommendationByUnit: Uint8Array;
  readonly restingByUnit: Uint8Array;
  readonly maximumVoluntaryGaitByUnit: Uint8Array;
  readonly affordableSprintTicksByUnit: Uint32Array;
  readonly reluctantByEntity: Uint8Array;
  readonly voluntaryAttackAvailableByEntity: Uint8Array;
  restSource: UnitEnergyRestSource;
  combatSource: IndividualCombatConservationSource;
  combatInput: IndividualCombatConservationInput;
}

const internals = new WeakMap<UnitEnergyBehaviourStore, InternalUnitEnergyBehaviourStore>();
const genuineCombatSources = new WeakSet<IndividualCombatConservationSource>();
const recommendationNames: readonly UnitEnergyBehaviourRecommendation[] =
  Object.freeze(["normal", "conserve", "restWhenSafe"]);

export function createUnitEnergyBehaviourStore(
  identity: UnitIdentityStore,
): UnitEnergyBehaviourStore {
  const unitIds = Object.freeze([...getUnitIds(identity)]);
  const unitIndexById = new Map<UnitId, number>();
  for (let index = 0; index < unitIds.length; index += 1) {
    unitIndexById.set(unitIds[index]!, index);
  }
  const store = Object.freeze({
    entityCount: identity.entityCount,
    unitCount: identity.unitCount,
  });
  let internal: InternalUnitEnergyBehaviourStore;
  const restSource: UnitEnergyRestSource = Object.freeze({
    entityCount: store.entityCount,
    unitCount: store.unitCount,
    get projectionTick() { return internal.projectionTick; },
    isUnitResting: (unitId: UnitId) => isUnitEnergyResting(store, unitId),
    getMaximumVoluntaryGait: (unitId: UnitId) =>
      getUnitMaximumVoluntaryGait(store, unitId),
    getAffordableSprintTicks: (unitId: UnitId) =>
      getUnitAffordableSprintTicks(store, unitId),
  });
  const combatSource: IndividualCombatConservationSource = Object.freeze({
    entityCount: store.entityCount,
    get projectionTick() { return internal.projectionTick; },
    isReluctantToReacquireDistantCombat: (entityId: number) =>
      isIndividualReluctantToReacquireDistantCombat(store, entityId),
    canInitiateVoluntaryAttack: (entityId: number) =>
      canIndividualInitiateVoluntaryAttack(store, entityId),
  });
  const combatInput: IndividualCombatConservationInput = Object.freeze({
    get tick() { return internal.projectionTick ?? -1; },
    conservation: combatSource,
  });
  internal = {
    ...store,
    projectionTick: null,
    unitIds,
    unitIndexById,
    recommendationByUnit: new Uint8Array(identity.unitCount),
    restingByUnit: new Uint8Array(identity.unitCount),
    maximumVoluntaryGaitByUnit: new Uint8Array(identity.unitCount),
    affordableSprintTicksByUnit: new Uint32Array(identity.unitCount),
    reluctantByEntity: new Uint8Array(identity.entityCount),
    voluntaryAttackAvailableByEntity: new Uint8Array(identity.entityCount),
    restSource,
    combatSource,
    combatInput,
  };
  genuineCombatSources.add(combatSource);
  internals.set(store, internal);
  return store;
}

export function projectUnitEnergyBehaviourOneTick(
  store: UnitEnergyBehaviourStore,
  identity: UnitIdentityStore,
  formation: FormationBehaviourStore,
  summaries: readonly UnitEnergySummary[],
  energy: IndividualEnergyStore,
  exertionModifiers: IndividualEnergyExertionModifierStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot,
  moraleMovementStates: ReadonlyMap<UnitId, MoraleMovementState>,
  recoveryThreats: readonly UnitRecoveryThreatSummary[],
  tick: number,
): void {
  const internal = requireStore(store);
  validateProjectionInputs(
    internal, identity, formation, summaries, energy, lifecycle, presence,
    ordinaryParticipation, recoveryThreats, exertionModifiers, tick,
  );

  for (let unitIndex = 0; unitIndex < internal.unitCount; unitIndex += 1) {
    const unitId = internal.unitIds[unitIndex]!;
    const summary = summaries[unitIndex]!;
    const ratio = summary.collectionTick === null
      ? initialActiveAverageRatio(
          identity, unitId, energy, lifecycle, presence,
        )
      : summary.averageEnergyRatioFixedPoint;
    const recommendation = deriveUnitEnergyBehaviourRecommendation(ratio);
    const members = getUnitMembers(identity, unitId);
    let hasCompulsoryCommitment = false;
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const entityId = members[memberIndex]!;
      if (
        getIndividualCharacterLifecycleState(lifecycle, entityId) === "active" &&
        getIndividualPlayerPresenceState(presence, entityId) === "activePresence" &&
        !isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId)
      ) {
        hasCompulsoryCommitment = true;
        break;
      }
    }
    const safeToRest =
      moraleMovementStates.get(unitId) !== "routing" &&
      !isHostileContactMovementStyle(getUnitMovementStyle(formation, unitId)) &&
      !recoveryThreats[unitIndex]!.hostileNearby &&
      !hasCompulsoryCommitment;
    const wasResting = internal.restingByUnit[unitIndex] !== 0;
    const resting = safeToRest && (
      recommendation === "restWhenSafe" ||
      (wasResting && ratio !== null &&
        ratio < UNIT_SAFE_REST_EXIT_RATIO_FIXED_POINT)
    );
    internal.recommendationByUnit[unitIndex] = recommendation === "normal"
      ? 0
      : recommendation === "conserve"
        ? 1
        : 2;
    internal.restingByUnit[unitIndex] = resting ? 1 : 0;
    internal.maximumVoluntaryGaitByUnit[unitIndex] = ratio === null
      ? 0
      : ratio < UNIT_VOLUNTARY_JOG_RATIO_FIXED_POINT
        ? 1
        : 2;
    internal.affordableSprintTicksByUnit[unitIndex] =
      ratio !== null && ratio >= UNIT_VOLUNTARY_SPRINT_RATIO_FIXED_POINT
        ? minimumAffordableSprintTicks(
            identity,
            unitId,
            energy,
            exertionModifiers,
            lifecycle,
            presence,
            ordinaryParticipation,
          )
        : 0;
  }

  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    const unitId = getUnitIdForEntity(identity, entityId);
    const unitIndex = requireUnitIndex(internal, unitId);
    internal.reluctantByEntity[entityId] =
      internal.restingByUnit[unitIndex] !== 0 ||
      getIndividualEnergyBand(energy, entityId) === "spent"
        ? 1
        : 0;
    internal.voluntaryAttackAvailableByEntity[entityId] =
      getIndividualEnergyRatioFixedPoint(energy, entityId) >=
        INDIVIDUAL_VOLUNTARY_RESERVE_RATIO_FIXED_POINT
        ? 1
        : 0;
  }
  internal.projectionTick = tick;
}

export function deriveUnitEnergyBehaviourRecommendation(
  averageEnergyRatioFixedPoint: number | null,
): UnitEnergyBehaviourRecommendation {
  if (averageEnergyRatioFixedPoint === null) return "normal";
  if (averageEnergyRatioFixedPoint < UNIT_SAFE_REST_ENTER_RATIO_FIXED_POINT) {
    return "restWhenSafe";
  }
  if (averageEnergyRatioFixedPoint < UNIT_VOLUNTARY_JOG_RATIO_FIXED_POINT) {
    return "conserve";
  }
  return "normal";
}

export function getUnitEnergyBehaviourProjectionTick(
  store: UnitEnergyBehaviourStore,
): number | null {
  return requireStore(store).projectionTick;
}

export function getUnitEnergyBehaviourRecommendation(
  store: UnitEnergyBehaviourStore,
  unitId: UnitId,
): UnitEnergyBehaviourRecommendation {
  const internal = requireStore(store);
  return recommendationNames[internal.recommendationByUnit[requireUnitIndex(internal, unitId)]!]!;
}

export function isUnitEnergyResting(
  store: UnitEnergyBehaviourStore,
  unitId: UnitId,
): boolean {
  const internal = requireStore(store);
  return internal.restingByUnit[requireUnitIndex(internal, unitId)] !== 0;
}

export function isIndividualReluctantToReacquireDistantCombat(
  store: UnitEnergyBehaviourStore,
  entityId: number,
): boolean {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.reluctantByEntity[entityId] !== 0;
}

export function canIndividualInitiateVoluntaryAttack(
  store: UnitEnergyBehaviourStore,
  entityId: number,
): boolean {
  const internal = requireStore(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.voluntaryAttackAvailableByEntity[entityId] !== 0;
}

export function getUnitMaximumVoluntaryGait(
  store: UnitEnergyBehaviourStore,
  unitId: UnitId,
): IndividualPhysicalGait {
  const internal = requireStore(store);
  const gait = internal.maximumVoluntaryGaitByUnit[
    requireUnitIndex(internal, unitId)
  ]!;
  return gait === 0 ? "stationary" : gait === 1 ? "walking" : "jogging";
}

export function getUnitAffordableSprintTicks(
  store: UnitEnergyBehaviourStore,
  unitId: UnitId,
): number {
  const internal = requireStore(store);
  return internal.affordableSprintTicksByUnit[
    requireUnitIndex(internal, unitId)
  ]!;
}

export function getUnitEnergyBehaviourInspection(
  store: UnitEnergyBehaviourStore,
  unitId: UnitId,
): UnitEnergyBehaviourInspection {
  const internal = requireStore(store);
  const unitIndex = requireUnitIndex(internal, unitId);
  return {
    unitId,
    projectionTick: internal.projectionTick,
    recommendation: recommendationNames[internal.recommendationByUnit[unitIndex]!]!,
    resting: internal.restingByUnit[unitIndex] !== 0,
    maximumVoluntaryGait: getUnitMaximumVoluntaryGait(store, unitId),
    affordableSprintTicks: internal.affordableSprintTicksByUnit[unitIndex]!,
  };
}

export function getUnitEnergyRestSource(
  store: UnitEnergyBehaviourStore,
): UnitEnergyRestSource {
  return requireStore(store).restSource;
}

export function getIndividualCombatConservationInput(
  store: UnitEnergyBehaviourStore,
  tick: number,
): IndividualCombatConservationInput {
  const internal = requireStore(store);
  if (internal.projectionTick !== tick) {
    throw new Error("Combat conservation requires the current behaviour projection.");
  }
  return internal.combatInput;
}

export function assertIndividualCombatConservationInput(
  input: IndividualCombatConservationInput | null | undefined,
  entityCount: number,
  currentTick: number,
): void {
  if (input === undefined) return;
  if (input === null) throw new TypeError("Combat conservation input cannot be null.");
  if (
    !genuineCombatSources.has(input.conservation) ||
    input.conservation.entityCount !== entityCount ||
    input.tick !== currentTick ||
    input.conservation.projectionTick !== currentTick
  ) {
    throw new Error("Combat conservation must project the current pipeline tick.");
  }
}

function initialActiveAverageRatio(
  identity: UnitIdentityStore,
  unitId: UnitId,
  energy: IndividualEnergyStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
): number | null {
  const members = getUnitMembers(identity, unitId);
  let count = 0;
  let total = 0;
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (
      getIndividualCharacterLifecycleState(lifecycle, entityId) !== "active" ||
      getIndividualPlayerPresenceState(presence, entityId) !== "activePresence"
    ) continue;
    count += 1;
    total += getIndividualEnergyRatioFixedPoint(energy, entityId);
  }
  return count === 0 ? null : Math.floor(total / count);
}

function validateProjectionInputs(
  store: InternalUnitEnergyBehaviourStore,
  identity: UnitIdentityStore,
  formation: FormationBehaviourStore,
  summaries: readonly UnitEnergySummary[],
  energy: IndividualEnergyStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  ordinary: IndividualOrdinaryParticipationSnapshot,
  threats: readonly UnitRecoveryThreatSummary[],
  exertionModifiers: IndividualEnergyExertionModifierStore,
  tick: number,
): void {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Behaviour tick must be non-negative.");
  if (store.projectionTick !== null && tick <= store.projectionTick) {
    throw new Error("Unit energy behaviour projection tick must advance monotonically.");
  }
  if (
    identity.entityCount !== store.entityCount || identity.unitCount !== store.unitCount ||
    formation.entityCount !== store.entityCount || formation.unitCount !== store.unitCount ||
    energy.entityCount !== store.entityCount || lifecycle.entityCount !== store.entityCount ||
    presence.entityCount !== store.entityCount || ordinary.entityCount !== store.entityCount ||
    exertionModifiers.entityCount !== store.entityCount ||
    summaries.length !== store.unitCount || threats.length !== store.unitCount
  ) throw new RangeError("Unit energy behaviour dependencies must match store counts.");
  assertIndividualEnergyExertionModifierProjectionTick(exertionModifiers, tick);
  for (let index = 0; index < store.unitCount; index += 1) {
    if (summaries[index]?.unitId !== store.unitIds[index] || threats[index]?.unitId !== store.unitIds[index]) {
      throw new Error("Unit energy behaviour evidence must preserve unit order.");
    }
    const collectionTick = summaries[index]!.collectionTick;
    if (collectionTick !== null && collectionTick !== tick - 1) {
      throw new Error("Unit energy behaviour requires the previous completed summary tick.");
    }
  }
}

function minimumAffordableSprintTicks(
  identity: UnitIdentityStore,
  unitId: UnitId,
  energy: IndividualEnergyStore,
  exertionModifiers: IndividualEnergyExertionModifierStore,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  ordinary: IndividualOrdinaryParticipationSnapshot,
): number {
  const members = getUnitMembers(identity, unitId);
  let minimumTicks = 0xffff_ffff;
  let participantCount = 0;
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (
      getIndividualCharacterLifecycleState(lifecycle, entityId) !== "active" ||
      getIndividualPlayerPresenceState(presence, entityId) !== "activePresence" ||
      !isIndividualOrdinaryParticipationEligible(ordinary, entityId)
    ) continue;
    if (getIndividualEnergyRatioFixedPoint(energy, entityId) <
        UNIT_VOLUNTARY_SPRINT_RATIO_FIXED_POINT) return 0;
    participantCount += 1;
    const maximum = getIndividualMaximumEnergy(energy, entityId);
    const reserve = Math.ceil(
      maximum * INDIVIDUAL_VOLUNTARY_RESERVE_RATIO_FIXED_POINT /
        ENERGY_RATIO_FIXED_POINT_SCALE,
    );
    const available = Math.max(
      0,
      getIndividualCurrentEnergy(energy, entityId) - reserve,
    );
    const sprintCost = calculateIndividualEnergyExertionAdjustedValue(
      INDIVIDUAL_ENERGY_SPRINTING_COST_PER_TICK,
      getIndividualBurdenExertionMultiplierPercent(exertionModifiers, entityId),
      getIndividualInjuryExertionMultiplierPercent(exertionModifiers, entityId),
      "voluntary sprint budget",
    );
    minimumTicks = Math.min(minimumTicks, Math.floor(available / sprintCost));
  }
  return participantCount === 0 ? 0 : minimumTicks;
}

function requireStore(store: UnitEnergyBehaviourStore): InternalUnitEnergyBehaviourStore {
  const internal = internals.get(store);
  if (internal === undefined) throw new TypeError("Unknown unit energy behaviour store.");
  return internal;
}

function requireUnitIndex(store: InternalUnitEnergyBehaviourStore, unitId: UnitId): number {
  const index = store.unitIndexById.get(unitId);
  if (index === undefined) throw new RangeError(`Unknown unit ID ${unitId} for energy behaviour.`);
  return index;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Energy behaviour entity ID is out of bounds.");
  }
}
