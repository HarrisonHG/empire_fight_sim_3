import type { CombatMoraleAssessment } from "./combatMorale";
import {
  getIndividualConfidence,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import {
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export type PersistentUnitMoraleState =
  | "steady"
  | "strained"
  | "shaken"
  | "wavering"
  | "routing"
  | "recovering";

/**
 * A read model of a unit's current morale inputs plus its persistent
 * transition history. Pressure, confidence, and cohesion are sampled from
 * their existing owners; this store never mutates those authoritative values.
 */
export interface PersistentUnitMorale {
  readonly unitId: UnitId;
  readonly pressure: number;
  readonly confidence: number;
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

interface InternalPersistentMoraleStore extends PersistentMoraleStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly pressure: number[];
  readonly confidence: number[];
  readonly cohesion: Int32Array;
  readonly states: PersistentUnitMoraleState[];
  readonly stateTicks: Int32Array;
  readonly routingRisk: Int32Array;
  readonly recoveryProgress: Int32Array;
}

const ROUTING_RISK_THRESHOLD = 100;
const MAX_INTEGER_STATE_VALUE = 0x7fff_ffff;

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
    cohesion: new Int32Array(unitIds.length),
    states: new Array<PersistentUnitMoraleState>(unitIds.length).fill("steady"),
    stateTicks: new Int32Array(unitIds.length),
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
  }

  return store;
}

/**
 * Applies only the 4A persistent interpretation layer. It deliberately does
 * not decay pressure, recover units, or affect formation/movement behaviour.
 */
export function advancePersistentMoraleOneTick(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  assessments: readonly CombatMoraleAssessment[],
  store: PersistentMoraleStore,
  out: PersistentMoraleEvent[] = [],
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

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const assessment = assessments[unitIndex]!;
    refreshObservedInputs(
      identityStore,
      formationStore,
      internal,
      unitIndex,
      assessment,
    );

    const previousState = internal.states[unitIndex]!;
    internal.routingRisk[unitIndex] = increaseBounded(
      internal.routingRisk[unitIndex]!,
      calculateRoutingRiskIncrease(assessment),
    );
    const nextState = determineNextState(
      previousState,
      assessment,
      internal.routingRisk[unitIndex]!,
    );

    if (nextState === previousState) {
      internal.stateTicks[unitIndex] = increaseBounded(
        internal.stateTicks[unitIndex]!,
        1,
      );
      continue;
    }

    internal.states[unitIndex] = nextState;
    internal.stateTicks[unitIndex] = 1;
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
    cohesion: internal.cohesion[unitIndex]!,
    state: internal.states[unitIndex]!,
    stateTicks: internal.stateTicks[unitIndex]!,
    routingRisk: internal.routingRisk[unitIndex]!,
    recoveryProgress: internal.recoveryProgress[unitIndex]!,
  };
}

function refreshObservedInputs(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalPersistentMoraleStore,
  unitIndex: number,
  assessment: CombatMoraleAssessment,
): void {
  store.pressure[unitIndex] = assessment.pressureAverage;
  store.cohesion[unitIndex] = assessment.cohesion;
  store.confidence[unitIndex] = calculateAverageConfidence(
    formationStore,
    getUnitMembers(identityStore, assessment.unitId),
  );
}

function calculateAverageConfidence(
  formationStore: FormationBehaviourStore,
  memberEntityIds: readonly number[],
): number {
  let total = 0;
  for (let index = 0; index < memberEntityIds.length; index += 1) {
    total += getIndividualConfidence(formationStore, memberEntityIds[index]!);
  }
  return total / memberEntityIds.length;
}

function calculateRoutingRiskIncrease(
  assessment: CombatMoraleAssessment,
): number {
  switch (assessment.moraleState) {
    case "steady":
      return 0;
    case "pressured":
      return 1;
    case "wavering":
      return 4;
    case "breakRisk":
      return assessment.recentCapacityReached ? 16 : 12;
  }
}

function determineNextState(
  currentState: PersistentUnitMoraleState,
  assessment: CombatMoraleAssessment,
  routingRisk: number,
): PersistentUnitMoraleState {
  if (currentState === "routing" || currentState === "recovering") {
    return currentState;
  }

  let assessedState: PersistentUnitMoraleState;
  switch (assessment.moraleState) {
    case "steady":
      assessedState = "steady";
      break;
    case "pressured":
      assessedState = "strained";
      break;
    case "wavering":
      assessedState = "shaken";
      break;
    case "breakRisk":
      assessedState =
        routingRisk >= ROUTING_RISK_THRESHOLD ? "routing" : "wavering";
      break;
  }

  return moraleStateRank(assessedState) > moraleStateRank(currentState)
    ? assessedState
    : currentState;
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
