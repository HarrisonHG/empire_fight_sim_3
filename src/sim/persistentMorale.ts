import {
  isBreakRiskCombatShock,
  type CombatMoraleAssessment,
} from "./combatMorale";
import type { UnitPressureUpdate } from "./combatPressure";
import type { UnitRoutingContagionSummary } from "./routingContagion";
import type { MoraleMovementState } from "./moraleMovement";
import {
  getIndividualConfidence,
  getIndividualRole,
  getUnitCohesion,
  getUnitMaximumCohesion,
  restoreUnitCohesion,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import type { UnitRecoveryThreatSummary } from "./recoveryThreat";
import {
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  isIndividualCharacterActive,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";

export type PersistentUnitMoraleState = MoraleMovementState;

/**
 * A read model of a unit's current morale inputs plus its persistent
 * transition history. Pressure, confidence, and cohesion are sampled from
 * their existing owners; recovery requests cohesion restoration through the
 * formation API without taking cohesion ownership.
 */
export interface PersistentUnitMorale {
  readonly unitId: UnitId;
  readonly pressure: number;
  readonly confidence: number;
  readonly experienceAdjustment: number;
  readonly cohesion: number;
  readonly state: PersistentUnitMoraleState;
  readonly stateTicks: number;
  readonly routingRisk: number;
  readonly recoveryProgress: number;
}

export interface PersistentMoraleStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export type PersistentMoraleEvent = {
  readonly kind: "unit_morale_changed";
  readonly unitId: UnitId;
  readonly previousState: PersistentUnitMoraleState;
  readonly state: PersistentUnitMoraleState;
};

export interface PersistentMoraleTickResult {
  readonly events: readonly PersistentMoraleEvent[];
}

export interface PersistentMoraleContext {
  /** Latest 4B source summaries in deterministic unit order. */
  readonly pressureUpdates?: readonly UnitPressureUpdate[];
  /** Latest 4F effects, used only to preserve fresh-pressure recovery gates. */
  readonly routingContagionSummaries?: readonly UnitRoutingContagionSummary[];
  /** Compact 4G local hostile safety summaries in deterministic unit order. */
  readonly recoveryThreatSummaries?: readonly UnitRecoveryThreatSummary[];
  readonly lifecycleStore?: IndividualCasualtyLifecycleStore;
}

interface InternalPersistentMoraleStore extends PersistentMoraleStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly pressure: number[];
  readonly confidence: number[];
  readonly experienceAdjustment: Int8Array;
  readonly cohesion: Int32Array;
  readonly states: PersistentUnitMoraleState[];
  readonly stateTicks: Int32Array;
  readonly upwardTicks: Int32Array;
  readonly downwardTicks: Int32Array;
  readonly routingRisk: Int32Array;
  readonly recoveryProgress: Int32Array;
}

const MAX_INTEGER_STATE_VALUE = 0x7fff_ffff;
const STRAINED_STRESS_THRESHOLD = 30;
const SHAKEN_STRESS_THRESHOLD = 60;
const WAVERING_STRESS_THRESHOLD = 90;
const ROUTING_STRESS_THRESHOLD = 120;
const ROUTING_RISK_THRESHOLD = 40;
const DOWNWARD_TRANSITION_TICKS = 4;
export const RECOVERY_CONSTANTS = {
  minimumRoutingTicks: 6,
  /** Five visible seconds at the simulation's fixed 20 Hz tick rate. */
  minimumRecoveringTicks: 100,
  maximumPressure: 60,
  /** Routing cannot stop until both durable indicators have fallen this far. */
  routingStopPressure: 30,
  routingStopRisk: 20,
  minimumCohesion: 550,
  progressRequired: 240,
  baseProgressPerTick: 2,
  highConfidenceProgressBonus: 1,
  baseCohesionRestorePerTick: 2,
  highConfidenceCohesionRestoreBonus: 1,
} as const;

/** Durable routing-risk decay while no current source has refreshed it. */
export const ROUTING_RISK_DECAY = {
  veteran: 6,
  regular: 4,
  recruit: 2,
  highConfidenceBonus: 1,
} as const;

export function createPersistentMoraleStore(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  assessments: readonly CombatMoraleAssessment[],
): PersistentMoraleStore {
  validateStores(identityStore, formationStore);
  validateAssessments(identityStore, assessments);

  const unitIds = getUnitIds(identityStore);
  const store: InternalPersistentMoraleStore = {
    entityCount: identityStore.entityCount,
    unitCount: identityStore.unitCount,
    unitIndexById: new Map(
      unitIds.map((unitId, unitIndex) => [unitId, unitIndex]),
    ),
    pressure: new Array<number>(unitIds.length).fill(0),
    confidence: new Array<number>(unitIds.length).fill(0),
    experienceAdjustment: new Int8Array(unitIds.length),
    cohesion: new Int32Array(unitIds.length),
    states: new Array<PersistentUnitMoraleState>(unitIds.length).fill("steady"),
    stateTicks: new Int32Array(unitIds.length),
    upwardTicks: new Int32Array(unitIds.length),
    downwardTicks: new Int32Array(unitIds.length),
    routingRisk: new Int32Array(unitIds.length),
    recoveryProgress: new Int32Array(unitIds.length),
  };

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    refreshObservedInputs(
      identityStore,
      formationStore,
      store,
      unitIndex,
      assessments[unitIndex]!,
    );
    store.experienceAdjustment[unitIndex] = collectUnitMoraleProfile(
      formationStore,
      unitIds[unitIndex]!,
      getUnitMembers(identityStore, unitIds[unitIndex]!),
      assessments[unitIndex]!,
    ).experienceAdjustment;
  }

  return store;
}

/**
 * Interprets 4B pressure through durable 4C state transitions. It reads
 * existing stores only and deliberately does not affect formation/movement.
 */
export function advancePersistentMoraleOneTick(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  assessments: readonly CombatMoraleAssessment[],
  store: PersistentMoraleStore,
  out: PersistentMoraleEvent[] = [],
  context: PersistentMoraleContext = {},
): PersistentMoraleTickResult {
  validateStores(identityStore, formationStore);
  const internal = asInternal(store);
  if (
    internal.entityCount !== identityStore.entityCount ||
    internal.unitCount !== identityStore.unitCount
  ) {
    throw new RangeError(
      "Persistent morale store must match unit identity entity and unit counts.",
    );
  }
  validateAssessments(identityStore, assessments);
  validateContext(identityStore, context);

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const assessment = assessments[unitIndex]!;
    const members = getUnitMembers(identityStore, unitId);
    const activeMemberCount = countActiveMembers(members, context.lifecycleStore);
    if (activeMemberCount === 0 && assessment.recentCombatShockValue === 0) {
      continue;
    }
    refreshObservedInputs(
      identityStore,
      formationStore,
      internal,
      unitIndex,
      assessment,
      context.lifecycleStore,
    );

    const profile = collectUnitMoraleProfile(
      formationStore,
      unitId,
      members,
      assessment,
      context.lifecycleStore,
    );
    internal.experienceAdjustment[unitIndex] = profile.experienceAdjustment;
    const pressureUpdate = context.pressureUpdates?.[unitIndex];
    const hasFreshPressure =
      (pressureUpdate !== undefined && pressureUpdate.unitId === unitId
        ? pressureUpdate.hasFreshPressure
        : inferFreshPressure(assessment)) ||
      hasFreshContagion(context.routingContagionSummaries?.[unitIndex], unitId);
    const hostileNearby =
      context.recoveryThreatSummaries?.[unitIndex]?.unitId === unitId &&
      context.recoveryThreatSummaries[unitIndex]!.hostileNearby;
    const previousState = internal.states[unitIndex]!;
    const candidateState = determineCandidateState(profile.stressScore);
    internal.routingRisk[unitIndex] =
      previousState === "routing" && !hasFreshPressure
        ? decreaseBounded(
            internal.routingRisk[unitIndex]!,
            routingRiskDecayPerTick(profile),
          )
        : updateRoutingRisk(
            internal.routingRisk[unitIndex]!,
            candidateState,
            profile.recentCombatShockBreakRisk,
          );
    const nextState = determineNextState(
      internal,
      unitIndex,
      previousState,
      candidateState,
      hasFreshPressure,
      hostileNearby,
      profile,
    );

    if (previousState === "recovering" && nextState === "recovering") {
      restoreUnitCohesion(
        formationStore,
        unitId,
        recoveryCohesionRestorePerTick(profile),
      );
      // Keep this tick's compact persistent read model aligned with the
      // formation-owned value that the recovery action just changed.
      internal.cohesion[unitIndex] = getUnitCohesion(formationStore, unitId);
    }

    if (nextState === previousState) {
      internal.stateTicks[unitIndex] = increaseBounded(
        internal.stateTicks[unitIndex]!,
        1,
      );
      continue;
    }

    internal.states[unitIndex] = nextState;
    internal.stateTicks[unitIndex] = 1;
    internal.upwardTicks[unitIndex] = 0;
    internal.downwardTicks[unitIndex] = 0;
    if (nextState !== "recovering") {
      internal.recoveryProgress[unitIndex] = 0;
    }
    out.push({
      kind: "unit_morale_changed",
      unitId,
      previousState,
      state: nextState,
    });
  }

  return { events: out };
}

export function getPersistentUnitMorale(
  store: PersistentMoraleStore,
  unitId: UnitId,
): PersistentUnitMorale {
  const internal = asInternal(store);
  const unitIndex = requireUnitIndex(internal, unitId);
  return {
    unitId,
    pressure: internal.pressure[unitIndex]!,
    confidence: internal.confidence[unitIndex]!,
    experienceAdjustment: internal.experienceAdjustment[unitIndex]!,
    cohesion: internal.cohesion[unitIndex]!,
    state: internal.states[unitIndex]!,
    stateTicks: internal.stateTicks[unitIndex]!,
    routingRisk: internal.routingRisk[unitIndex]!,
    recoveryProgress: internal.recoveryProgress[unitIndex]!,
  };
}

export function getPersistentUnitMoraleState(
  store: PersistentMoraleStore,
  unitId: UnitId,
): PersistentUnitMoraleState {
  const internal = asInternal(store);
  return internal.states[requireUnitIndex(internal, unitId)]!;
}

function refreshObservedInputs(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalPersistentMoraleStore,
  unitIndex: number,
  assessment: CombatMoraleAssessment,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
): void {
  store.pressure[unitIndex] = assessment.pressureAverage;
  store.cohesion[unitIndex] = assessment.cohesion;
  store.confidence[unitIndex] = calculateAverageConfidence(
    formationStore,
    getUnitMembers(identityStore, assessment.unitId),
    lifecycleStore,
  );
}

function calculateAverageConfidence(
  formationStore: FormationBehaviourStore,
  memberEntityIds: readonly number[],
  lifecycleStore?: IndividualCasualtyLifecycleStore,
): number {
  let total = 0;
  let activeCount = 0;
  for (let index = 0; index < memberEntityIds.length; index += 1) {
    if (
      lifecycleStore !== undefined &&
      !isIndividualCharacterActive(lifecycleStore, memberEntityIds[index]!)
    ) continue;
    total += getIndividualConfidence(formationStore, memberEntityIds[index]!);
    activeCount += 1;
  }
  return activeCount === 0 ? 0 : total / activeCount;
}

function countActiveMembers(
  members: readonly number[],
  lifecycleStore?: IndividualCasualtyLifecycleStore,
): number {
  if (lifecycleStore === undefined) return members.length;
  let count = 0;
  for (let index = 0; index < members.length; index += 1) {
    if (isIndividualCharacterActive(lifecycleStore, members[index]!)) count += 1;
  }
  return count;
}

function determineNextState(
  store: InternalPersistentMoraleStore,
  unitIndex: number,
  currentState: PersistentUnitMoraleState,
  candidateState: PersistentUnitMoraleState,
  hasFreshPressure: boolean,
  hostileNearby: boolean,
  profile: UnitMoraleProfile,
): PersistentUnitMoraleState {
  if (currentState === "routing") {
    return determineRoutingTransition(
      store,
      unitIndex,
      candidateState,
      hasFreshPressure,
      hostileNearby,
      profile,
    );
  }
  if (currentState === "recovering") {
    return determineRecoveryTransition(
      store,
      unitIndex,
      candidateState,
      hasFreshPressure,
      hostileNearby,
      profile,
    );
  }

  const candidateRank = moraleStateRank(candidateState);
  const currentRank = moraleStateRank(currentState);
  if (candidateRank > currentRank) {
    store.upwardTicks[unitIndex] = increaseBounded(
      store.upwardTicks[unitIndex]!,
      1,
    );
    store.downwardTicks[unitIndex] = 0;
    const nextState = nextEscalatingState(currentState);
    const durationMet =
      store.upwardTicks[unitIndex]! >= requiredUpwardTicks(nextState, profile);
    const routingRiskMet =
      nextState !== "routing" ||
      store.routingRisk[unitIndex]! >= ROUTING_RISK_THRESHOLD;
    return durationMet && routingRiskMet ? nextState : currentState;
  }
  if (candidateRank < currentRank) {
    store.downwardTicks[unitIndex] = increaseBounded(
      store.downwardTicks[unitIndex]!,
      1,
    );
    store.upwardTicks[unitIndex] = 0;
    return store.downwardTicks[unitIndex]! >= DOWNWARD_TRANSITION_TICKS
      ? nextDeescalatingState(currentState)
      : currentState;
  }

  store.upwardTicks[unitIndex] = 0;
  store.downwardTicks[unitIndex] = 0;
  return currentState;
}

function moraleStateRank(state: PersistentUnitMoraleState): number {
  switch (state) {
    case "steady":
      return 0;
    case "strained":
      return 1;
    case "shaken":
      return 2;
    case "wavering":
      return 3;
    case "routing":
      return 4;
    case "recovering":
      return 4;
  }
}

interface UnitMoraleProfile {
  readonly stressScore: number;
  readonly pressure: number;
  readonly experienceAdjustment: number;
  readonly confidence: number;
  readonly cohesion: number;
  readonly maximumCohesion: number;
  readonly recentCombatShockBreakRisk: boolean;
}

function collectUnitMoraleProfile(
  formationStore: FormationBehaviourStore,
  unitId: UnitId,
  members: readonly number[],
  assessment: CombatMoraleAssessment,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
): UnitMoraleProfile {
  let confidenceTotal = 0;
  let experienceTotal = 0;
  let activeCount = 0;
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (
      lifecycleStore !== undefined &&
      !isIndividualCharacterActive(lifecycleStore, entityId)
    ) continue;
    confidenceTotal += getIndividualConfidence(formationStore, entityId);
    experienceTotal += experienceAdjustmentForRole(
      getIndividualRole(formationStore, entityId),
    );
    activeCount += 1;
  }
  const confidence = activeCount === 0 ? 500 : Math.trunc(confidenceTotal / activeCount);
  const experienceAdjustment = activeCount === 0 ? 0 : Math.trunc(experienceTotal / activeCount);
  let stressScore = Math.trunc(assessment.pressureAverage);
  stressScore += Math.min(20, assessment.recentCombatShockValue * 4);
  if (isBreakRiskCombatShock(assessment.recentCombatShockSource)) {
    stressScore += 40;
  }
  if (assessment.cohesion < 700) stressScore += 10;
  if (assessment.cohesion < 400) stressScore += 20;
  if (assessment.cohesion < 200) stressScore += 20;
  // Profile adjusts observed stress; it must not manufacture a non-steady
  // candidate after all pressure, damage, and cohesion penalties are gone.
  if (stressScore > 0) {
    stressScore -= Math.trunc((confidence - 500) / 50);
    stressScore -= experienceAdjustment * 15;
  }

  return {
    stressScore: stressScore > 0 ? stressScore : 0,
    pressure: assessment.pressureAverage,
    experienceAdjustment,
    confidence,
    cohesion: assessment.cohesion,
    maximumCohesion: getUnitMaximumCohesion(formationStore, unitId),
    recentCombatShockBreakRisk: isBreakRiskCombatShock(
      assessment.recentCombatShockSource,
    ),
  };
}

function experienceAdjustmentForRole(role: "recruit" | "regular" | "veteran"): number {
  switch (role) {
    case "recruit":
      return -1;
    case "regular":
      return 0;
    case "veteran":
      return 1;
  }
}

function determineCandidateState(stressScore: number): PersistentUnitMoraleState {
  if (stressScore >= ROUTING_STRESS_THRESHOLD) return "routing";
  if (stressScore >= WAVERING_STRESS_THRESHOLD) return "wavering";
  if (stressScore >= SHAKEN_STRESS_THRESHOLD) return "shaken";
  if (stressScore >= STRAINED_STRESS_THRESHOLD) return "strained";
  return "steady";
}

function determineRoutingTransition(
  store: InternalPersistentMoraleStore,
  unitIndex: number,
  candidateState: PersistentUnitMoraleState,
  hasFreshPressure: boolean,
  hostileNearby: boolean,
  profile: UnitMoraleProfile,
): PersistentUnitMoraleState {
  if (
    hasFreshPressure ||
    hostileNearby ||
    profile.pressure >= RECOVERY_CONSTANTS.routingStopPressure ||
    store.routingRisk[unitIndex]! >= RECOVERY_CONSTANTS.routingStopRisk ||
    moraleStateRank(candidateState) > 1
  ) {
    return "routing";
  }
  return store.stateTicks[unitIndex]! >= RECOVERY_CONSTANTS.minimumRoutingTicks
    ? "recovering"
    : "routing";
}

function determineRecoveryTransition(
  store: InternalPersistentMoraleStore,
  unitIndex: number,
  candidateState: PersistentUnitMoraleState,
  hasFreshPressure: boolean,
  hostileNearby: boolean,
  profile: UnitMoraleProfile,
): PersistentUnitMoraleState {
  if (hasFreshPressure || hostileNearby) {
    store.recoveryProgress[unitIndex] = 0;
    return "routing";
  }
  if (
    profile.pressure >= RECOVERY_CONSTANTS.maximumPressure ||
    moraleStateRank(candidateState) >= 2
  ) {
    store.recoveryProgress[unitIndex] = 0;
    return "wavering";
  }
  store.recoveryProgress[unitIndex] = increaseBounded(
    store.recoveryProgress[unitIndex]!,
    recoveryProgressPerTick(profile),
  );
  const hasCompletedMinimumDuration =
    store.stateTicks[unitIndex]! >= RECOVERY_CONSTANTS.minimumRecoveringTicks;
  const hasRecoveredCohesion =
    profile.cohesion >=
    Math.min(profile.maximumCohesion, RECOVERY_CONSTANTS.minimumCohesion);
  return hasCompletedMinimumDuration &&
    store.recoveryProgress[unitIndex]! >= RECOVERY_CONSTANTS.progressRequired &&
    hasRecoveredCohesion
    ? "steady"
    : "recovering";
}

function recoveryProgressPerTick(profile: UnitMoraleProfile): number {
  const confidenceBonus =
    profile.confidence >= 750
      ? RECOVERY_CONSTANTS.highConfidenceProgressBonus
      : 0;
  return Math.max(
    1,
    RECOVERY_CONSTANTS.baseProgressPerTick +
      confidenceBonus +
      profile.experienceAdjustment,
  );
}

function routingRiskDecayPerTick(profile: UnitMoraleProfile): number {
  const role =
    profile.experienceAdjustment > 0
      ? "veteran"
      : profile.experienceAdjustment < 0
        ? "recruit"
        : "regular";
  return (
    ROUTING_RISK_DECAY[role] +
    (profile.confidence >= 750 ? ROUTING_RISK_DECAY.highConfidenceBonus : 0)
  );
}

function recoveryCohesionRestorePerTick(profile: UnitMoraleProfile): number {
  const confidenceBonus =
    profile.confidence >= 750
      ? RECOVERY_CONSTANTS.highConfidenceCohesionRestoreBonus
      : 0;
  return Math.max(
    1,
    RECOVERY_CONSTANTS.baseCohesionRestorePerTick +
      confidenceBonus +
      profile.experienceAdjustment,
  );
}

function requiredUpwardTicks(
  nextState: PersistentUnitMoraleState,
  profile: UnitMoraleProfile,
): number {
  const base =
    nextState === "strained"
      ? 3
      : nextState === "shaken"
        ? 3
        : nextState === "wavering"
          ? 4
          : 5;
  const confidenceAdjustment =
    profile.confidence >= 750 ? 1 : profile.confidence < 250 ? -1 : 0;
  const cohesionAdjustment = profile.cohesion < 400 ? -1 : 0;
  const combatShockAdjustment = profile.recentCombatShockBreakRisk ? -1 : 0;
  const result =
    base +
    profile.experienceAdjustment +
    confidenceAdjustment +
    cohesionAdjustment +
    combatShockAdjustment;
  return result > 0 ? result : 1;
}

function nextEscalatingState(
  state: PersistentUnitMoraleState,
): PersistentUnitMoraleState {
  switch (state) {
    case "steady":
      return "strained";
    case "strained":
      return "shaken";
    case "shaken":
      return "wavering";
    case "wavering":
      return "routing";
    case "routing":
    case "recovering":
      return state;
  }
}

function nextDeescalatingState(
  state: PersistentUnitMoraleState,
): PersistentUnitMoraleState {
  switch (state) {
    case "strained":
      return "steady";
    case "shaken":
      return "strained";
    case "wavering":
      return "shaken";
    case "steady":
    case "routing":
    case "recovering":
      return state;
  }
}

function updateRoutingRisk(
  current: number,
  candidateState: PersistentUnitMoraleState,
  recentCombatShockBreakRisk: boolean,
): number {
  const rank = moraleStateRank(candidateState);
  if (rank >= 4) {
    return increaseBounded(current, recentCombatShockBreakRisk ? 14 : 10);
  }
  if (rank >= 3) return increaseBounded(current, 5);
  if (rank >= 2) return increaseBounded(current, 1);
  return current > 4 ? current - 4 : 0;
}

function decreaseBounded(current: number, amount: number): number {
  return current > amount ? current - amount : 0;
}

function inferFreshPressure(assessment: CombatMoraleAssessment): boolean {
  return (
    assessment.moraleState !== "steady" ||
    assessment.recentCombatShockValue > 0 ||
    isBreakRiskCombatShock(assessment.recentCombatShockSource)
  );
}

function hasFreshContagion(
  summary: UnitRoutingContagionSummary | undefined,
  unitId: UnitId,
): boolean {
  return (
    summary !== undefined &&
    summary.unitId === unitId &&
    summary.pressureAppliedPerMember > 0
  );
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

function validateAssessments(
  identityStore: UnitIdentityStore,
  assessments: readonly CombatMoraleAssessment[],
): void {
  const unitIds = getUnitIds(identityStore);
  if (assessments.length !== unitIds.length) {
    throw new RangeError("Persistent morale requires one assessment per unit.");
  }
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    if (assessments[unitIndex]?.unitId !== unitIds[unitIndex]) {
      throw new RangeError(
        "Persistent morale assessments must be in deterministic unit order.",
      );
    }
  }
}

function validateContext(
  identityStore: UnitIdentityStore,
  context: PersistentMoraleContext,
): void {
  if (
    context.pressureUpdates !== undefined &&
    context.pressureUpdates.length !== identityStore.unitCount
  ) {
    throw new RangeError(
      "Persistent morale requires one pressure update per unit when provided.",
    );
  }
  if (context.pressureUpdates !== undefined) {
    const unitIds = getUnitIds(identityStore);
    for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
      if (context.pressureUpdates[unitIndex]?.unitId !== unitIds[unitIndex]) {
        throw new RangeError(
          "Persistent morale pressure updates must be in deterministic unit order.",
        );
      }
    }
  }
  if (
    context.routingContagionSummaries !== undefined &&
    context.routingContagionSummaries.length !== identityStore.unitCount
  ) {
    throw new RangeError(
      "Persistent morale requires one routing contagion summary per unit when provided.",
    );
  }
  if (context.routingContagionSummaries !== undefined) {
    const unitIds = getUnitIds(identityStore);
    for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
      if (
        context.routingContagionSummaries[unitIndex]?.unitId !==
        unitIds[unitIndex]
      ) {
        throw new RangeError(
          "Persistent morale routing contagion summaries must be in deterministic unit order.",
        );
      }
    }
  }
  if (
    context.recoveryThreatSummaries !== undefined &&
    context.recoveryThreatSummaries.length !== identityStore.unitCount
  ) {
    throw new RangeError(
      "Persistent morale requires one recovery threat summary per unit when provided.",
    );
  }
  if (context.recoveryThreatSummaries !== undefined) {
    const unitIds = getUnitIds(identityStore);
    for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
      if (
        context.recoveryThreatSummaries[unitIndex]?.unitId !==
        unitIds[unitIndex]
      ) {
        throw new RangeError(
          "Persistent morale recovery threat summaries must be in deterministic unit order.",
        );
      }
    }
  }
}

function increaseBounded(current: number, amount: number): number {
  if (current > MAX_INTEGER_STATE_VALUE - amount) {
    return MAX_INTEGER_STATE_VALUE;
  }
  return current + amount;
}

function requireUnitIndex(
  store: InternalPersistentMoraleStore,
  unitId: UnitId,
): number {
  const unitIndex = store.unitIndexById.get(unitId);
  if (unitIndex === undefined) {
    throw new RangeError("Unknown unit ID for persistent morale store.");
  }
  return unitIndex;
}

function asInternal(
  store: PersistentMoraleStore,
): InternalPersistentMoraleStore {
  return store as InternalPersistentMoraleStore;
}
