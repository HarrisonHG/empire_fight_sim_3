import type { CombatConsequenceApplication } from "./combatConsequences";
import type { IndividualCombatUnitConsequenceSummary } from "./individualCombatConsequences";
import {
  getIndividualPressure,
  getUnitCohesion,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import {
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export type CombatMoraleState =
  | "steady"
  | "pressured"
  | "wavering"
  | "breakRisk";

export type CombatMoraleReasonCode =
  | "pressureAverage"
  | "pressureMaximum"
  | "lowCohesion"
  | "recentCohesionDamage"
  | "capacityReached";

export interface CombatMoraleAssessment {
  readonly unitId: UnitId;
  readonly memberEntityIds: readonly number[];
  readonly pressureTotal: number;
  readonly pressureAverage: number;
  readonly pressureMaximum: number;
  readonly cohesion: number;
  readonly recentCohesionDamageValue: number;
  readonly recentCapacityReached: boolean;
  readonly moraleState: CombatMoraleState;
  readonly breakRiskReasonCodes: readonly CombatMoraleReasonCode[];
}

export interface CombatMoraleTickResult {
  readonly assessments: readonly CombatMoraleAssessment[];
}

const PRESSURED_AVERAGE_THRESHOLD = 20;
const WAVERING_AVERAGE_THRESHOLD = 50;
const BREAK_RISK_AVERAGE_THRESHOLD = 80;
const PRESSURED_MAXIMUM_THRESHOLD = 30;
const WAVERING_MAXIMUM_THRESHOLD = 70;
const BREAK_RISK_MAXIMUM_THRESHOLD = 100;
const PRESSURED_COHESION_THRESHOLD = 700;
const WAVERING_COHESION_THRESHOLD = 400;
const BREAK_RISK_COHESION_THRESHOLD = 200;

export function assessUnitCombatMorale(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  unitId: UnitId,
  recentConsequences: readonly CombatConsequenceApplication[] = [],
): CombatMoraleAssessment {
  validateCombatMoraleInputs(identityStore, formationStore);
  validateRecentConsequences(identityStore, recentConsequences);
  return assessValidatedUnitCombatMorale(
    identityStore,
    formationStore,
    unitId,
    recentConsequences,
  );
}

export function collectCombatMoraleAssessments(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  recentConsequences: readonly CombatConsequenceApplication[] = [],
  out: CombatMoraleAssessment[] = [],
): CombatMoraleTickResult {
  validateCombatMoraleInputs(identityStore, formationStore);
  validateRecentConsequences(identityStore, recentConsequences);

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let index = 0; index < unitIds.length; index += 1) {
    out.push(
      assessValidatedUnitCombatMorale(
        identityStore,
        formationStore,
        unitIds[index]!,
        recentConsequences,
      ),
    );
  }

  return { assessments: out };
}

export function collectCombatMoraleAssessmentsFromIndividualConsequences(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  individualConsequences: readonly IndividualCombatUnitConsequenceSummary[],
  out: CombatMoraleAssessment[] = [],
): CombatMoraleTickResult {
  validateCombatMoraleInputs(identityStore, formationStore);
  const contextByUnitId = new Map<UnitId, IndividualCombatUnitConsequenceSummary>();
  for (let index = 0; index < individualConsequences.length; index += 1) {
    const consequence = individualConsequences[index]!;
    getUnitMembers(identityStore, consequence.unitId);
    contextByUnitId.set(consequence.unitId, consequence);
  }

  out.length = 0;
  const unitIds = getUnitIds(identityStore);
  for (let index = 0; index < unitIds.length; index += 1) {
    const unitId = unitIds[index]!;
    out.push(
      assessValidatedUnitCombatMoraleFromIndividualContext(
        identityStore,
        formationStore,
        unitId,
        contextByUnitId.get(unitId),
      ),
    );
  }

  return { assessments: out };
}

function assessValidatedUnitCombatMorale(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  unitId: UnitId,
  recentConsequences: readonly CombatConsequenceApplication[],
): CombatMoraleAssessment {
  const memberEntityIds = getUnitMembers(identityStore, unitId);
  const pressure = computePressureSummary(formationStore, memberEntityIds);
  const cohesion = getUnitCohesion(formationStore, unitId);
  const recentContext = computeRecentContext(unitId, recentConsequences);
  const reasonCodes = collectReasonCodes(
    pressure.average,
    pressure.maximum,
    cohesion,
    recentContext.cohesionDamageValue,
    recentContext.capacityReached,
  );

  return {
    unitId,
    memberEntityIds: memberEntityIds.slice(),
    pressureTotal: pressure.total,
    pressureAverage: pressure.average,
    pressureMaximum: pressure.maximum,
    cohesion,
    recentCohesionDamageValue: recentContext.cohesionDamageValue,
    recentCapacityReached: recentContext.capacityReached,
    moraleState: determineMoraleState(
      pressure.average,
      pressure.maximum,
      cohesion,
      recentContext.cohesionDamageValue,
      recentContext.capacityReached,
    ),
    breakRiskReasonCodes: reasonCodes,
  };
}

function assessValidatedUnitCombatMoraleFromIndividualContext(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  unitId: UnitId,
  recentContext: IndividualCombatUnitConsequenceSummary | undefined,
): CombatMoraleAssessment {
  const memberEntityIds = getUnitMembers(identityStore, unitId);
  const pressure = computePressureSummary(formationStore, memberEntityIds);
  const cohesion = getUnitCohesion(formationStore, unitId);
  const recentCohesionDamageValue =
    recentContext?.incomingZeroHitTransitions ?? 0;
  const recentCapacityReached = recentCohesionDamageValue > 0;
  const reasonCodes = collectReasonCodes(
    pressure.average,
    pressure.maximum,
    cohesion,
    recentCohesionDamageValue,
    recentCapacityReached,
  );

  return {
    unitId,
    memberEntityIds: memberEntityIds.slice(),
    pressureTotal: pressure.total,
    pressureAverage: pressure.average,
    pressureMaximum: pressure.maximum,
    cohesion,
    recentCohesionDamageValue,
    recentCapacityReached,
    moraleState: determineMoraleState(
      pressure.average,
      pressure.maximum,
      cohesion,
      recentCohesionDamageValue,
      recentCapacityReached,
    ),
    breakRiskReasonCodes: reasonCodes,
  };
}

function computePressureSummary(
  formationStore: FormationBehaviourStore,
  memberEntityIds: readonly number[],
): {
  readonly total: number;
  readonly average: number;
  readonly maximum: number;
} {
  let total = 0;
  let maximum = 0;
  for (let index = 0; index < memberEntityIds.length; index += 1) {
    const pressure = getIndividualPressure(
      formationStore,
      memberEntityIds[index]!,
    );
    total = addSafeNonNegativeInteger(total, pressure, "pressureTotal");
    if (pressure > maximum) {
      maximum = pressure;
    }
  }

  return {
    total,
    average: total / memberEntityIds.length,
    maximum,
  };
}

function computeRecentContext(
  unitId: UnitId,
  recentConsequences: readonly CombatConsequenceApplication[],
): {
  readonly cohesionDamageValue: number;
  readonly capacityReached: boolean;
} {
  let cohesionDamageValue = 0;
  let capacityReached = false;

  for (let index = 0; index < recentConsequences.length; index += 1) {
    const consequence = recentConsequences[index]!;
    if (consequence.targetUnitId !== unitId) {
      continue;
    }

    cohesionDamageValue = addSafeNonNegativeInteger(
      cohesionDamageValue,
      consequence.cohesionDamageValue,
      "recentCohesionDamageValue",
    );
    if (consequence.capacityReached) {
      capacityReached = true;
    }
  }

  return { cohesionDamageValue, capacityReached };
}

function determineMoraleState(
  pressureAverage: number,
  pressureMaximum: number,
  cohesion: number,
  recentCohesionDamageValue: number,
  recentCapacityReached: boolean,
): CombatMoraleState {
  if (
    pressureAverage >= BREAK_RISK_AVERAGE_THRESHOLD ||
    pressureMaximum >= BREAK_RISK_MAXIMUM_THRESHOLD ||
    cohesion <= BREAK_RISK_COHESION_THRESHOLD ||
    recentCapacityReached
  ) {
    return "breakRisk";
  }
  if (
    pressureAverage >= WAVERING_AVERAGE_THRESHOLD ||
    pressureMaximum >= WAVERING_MAXIMUM_THRESHOLD ||
    cohesion <= WAVERING_COHESION_THRESHOLD
  ) {
    return "wavering";
  }
  if (
    pressureAverage >= PRESSURED_AVERAGE_THRESHOLD ||
    pressureMaximum >= PRESSURED_MAXIMUM_THRESHOLD ||
    recentCohesionDamageValue > 0 ||
    cohesion <= PRESSURED_COHESION_THRESHOLD
  ) {
    return "pressured";
  }
  return "steady";
}

function collectReasonCodes(
  pressureAverage: number,
  pressureMaximum: number,
  cohesion: number,
  recentCohesionDamageValue: number,
  recentCapacityReached: boolean,
): readonly CombatMoraleReasonCode[] {
  const reasonCodes: CombatMoraleReasonCode[] = [];
  if (pressureAverage >= PRESSURED_AVERAGE_THRESHOLD) {
    reasonCodes.push("pressureAverage");
  }
  if (pressureMaximum >= PRESSURED_MAXIMUM_THRESHOLD) {
    reasonCodes.push("pressureMaximum");
  }
  if (cohesion <= PRESSURED_COHESION_THRESHOLD) {
    reasonCodes.push("lowCohesion");
  }
  if (recentCohesionDamageValue > 0) {
    reasonCodes.push("recentCohesionDamage");
  }
  if (recentCapacityReached) {
    reasonCodes.push("capacityReached");
  }
  return reasonCodes;
}

function validateCombatMoraleInputs(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
): void {
  if (formationStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Formation behaviour entity count must match unit identity entity count.",
    );
  }
  if (formationStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Formation behaviour unit count must match unit identity unit count.",
    );
  }
}

function validateRecentConsequences(
  identityStore: UnitIdentityStore,
  recentConsequences: readonly CombatConsequenceApplication[],
): void {
  for (let index = 0; index < recentConsequences.length; index += 1) {
    const consequence = recentConsequences[index]!;
    getUnitMembers(identityStore, consequence.sourceUnitId);
    getUnitMembers(identityStore, consequence.targetUnitId);
    assertNonNegativeSafeInteger(
      consequence.incomingDamageValue,
      "incomingDamageValue",
    );
    assertNonNegativeSafeInteger(
      consequence.appliedDamageValue,
      "appliedDamageValue",
    );
    assertNonNegativeSafeInteger(
      consequence.pressureDeltaPerMember,
      "pressureDeltaPerMember",
    );
    assertNonNegativeSafeInteger(
      consequence.cohesionDamageValue,
      "cohesionDamageValue",
    );
    if (typeof consequence.capacityReached !== "boolean") {
      throw new RangeError("capacityReached must be a boolean.");
    }
  }
}

function addSafeNonNegativeInteger(
  left: number,
  right: number,
  name: string,
): number {
  if (left > Number.MAX_SAFE_INTEGER - right) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
  return left + right;
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
