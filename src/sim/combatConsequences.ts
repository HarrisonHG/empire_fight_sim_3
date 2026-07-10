import type { CombatSurvivabilityApplication } from "./combatSurvivability";
import {
  getIndividualPressure,
  setIndividualPressure,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import {
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";

export interface CombatConsequenceConfig {
  readonly appliedDamagePressureScale?: number;
  readonly mitigatedHitPressureDelta?: number;
  readonly capacityReachedPressureBonus?: number;
  readonly capacityReachedCohesionBonus?: number;
}

export interface CombatConsequenceApplication {
  readonly sourceUnitId: UnitId;
  readonly targetUnitId: UnitId;
  readonly affectedMemberEntityIds: readonly number[];
  readonly incomingDamageValue: number;
  readonly appliedDamageValue: number;
  readonly capacityReached: boolean;
  readonly pressureDeltaPerMember: number;
  readonly pressureBeforeByMember: readonly number[];
  readonly pressureAfterByMember: readonly number[];
  readonly cohesionDamageValue: number;
}

export interface CombatConsequenceTickResult {
  readonly applications: readonly CombatConsequenceApplication[];
}

interface ResolvedCombatConsequenceConfig {
  readonly appliedDamagePressureScale: number;
  readonly mitigatedHitPressureDelta: number;
  readonly capacityReachedPressureBonus: number;
  readonly capacityReachedCohesionBonus: number;
}

const DEFAULT_APPLIED_DAMAGE_PRESSURE_SCALE = 10;
const DEFAULT_MITIGATED_HIT_PRESSURE_DELTA = 2;
const DEFAULT_CAPACITY_REACHED_PRESSURE_BONUS = 5;
const DEFAULT_CAPACITY_REACHED_COHESION_BONUS = 1;
const MAX_FORMATION_INTEGER_STATE_VALUE = 0x7fff_ffff;

export function applyCombatConsequence(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  application: CombatSurvivabilityApplication,
  config: CombatConsequenceConfig = {},
): CombatConsequenceApplication {
  validateConsequenceInputs(identityStore, formationStore);
  return applyValidatedCombatConsequence(
    identityStore,
    formationStore,
    application,
    resolveCombatConsequenceConfig(config),
  );
}

export function applyCombatConsequences(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  survivabilityApplications: readonly CombatSurvivabilityApplication[],
  out: CombatConsequenceApplication[] = [],
  config: CombatConsequenceConfig = {},
): CombatConsequenceTickResult {
  validateConsequenceInputs(identityStore, formationStore);
  const resolvedConfig = resolveCombatConsequenceConfig(config);

  out.length = 0;
  for (let index = 0; index < survivabilityApplications.length; index += 1) {
    out.push(
      applyValidatedCombatConsequence(
        identityStore,
        formationStore,
        survivabilityApplications[index]!,
        resolvedConfig,
      ),
    );
  }

  return { applications: out };
}

function applyValidatedCombatConsequence(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  application: CombatSurvivabilityApplication,
  config: ResolvedCombatConsequenceConfig,
): CombatConsequenceApplication {
  validateSurvivabilityApplication(identityStore, application);

  const targetMembers = getUnitMembers(identityStore, application.targetUnitId);
  const pressureDeltaPerMember = computePressureDeltaPerMember(
    application,
    config,
  );
  const cohesionDamageValue = computeCohesionDamageValue(application, config);
  const affectedMemberEntityIds = new Array<number>(targetMembers.length);
  const pressureBeforeByMember = new Array<number>(targetMembers.length);
  const pressureAfterByMember = new Array<number>(targetMembers.length);

  for (let index = 0; index < targetMembers.length; index += 1) {
    const entityId = targetMembers[index]!;
    affectedMemberEntityIds[index] = entityId;
    pressureBeforeByMember[index] = getIndividualPressure(
      formationStore,
      entityId,
    );
  }

  if (pressureDeltaPerMember > 0) {
    for (let index = 0; index < targetMembers.length; index += 1) {
      const entityId = targetMembers[index]!;
      const pressureBefore = pressureBeforeByMember[index]!;
      setIndividualPressure(
        formationStore,
        entityId,
        increaseFormationPressure(pressureBefore, pressureDeltaPerMember),
      );
    }
  }

  for (let index = 0; index < targetMembers.length; index += 1) {
    pressureAfterByMember[index] = getIndividualPressure(
      formationStore,
      targetMembers[index]!,
    );
  }

  return {
    sourceUnitId: application.sourceUnitId,
    targetUnitId: application.targetUnitId,
    affectedMemberEntityIds,
    incomingDamageValue: application.incomingDamageValue,
    appliedDamageValue: application.appliedDamageValue,
    capacityReached: application.capacityReached,
    pressureDeltaPerMember,
    pressureBeforeByMember,
    pressureAfterByMember,
    cohesionDamageValue,
  };
}

function computePressureDeltaPerMember(
  application: CombatSurvivabilityApplication,
  config: ResolvedCombatConsequenceConfig,
): number {
  let pressureDelta = 0;
  if (application.appliedDamageValue > 0) {
    pressureDelta = multiplySafeNonNegativeInteger(
      application.appliedDamageValue,
      config.appliedDamagePressureScale,
      "pressureDeltaPerMember",
    );
  } else if (application.incomingDamageValue > 0) {
    pressureDelta = config.mitigatedHitPressureDelta;
  }

  if (application.capacityReached) {
    pressureDelta = addSafeNonNegativeInteger(
      pressureDelta,
      config.capacityReachedPressureBonus,
      "pressureDeltaPerMember",
    );
  }
  return pressureDelta;
}

function computeCohesionDamageValue(
  application: CombatSurvivabilityApplication,
  config: ResolvedCombatConsequenceConfig,
): number {
  let cohesionDamageValue = application.appliedDamageValue;
  if (application.capacityReached) {
    cohesionDamageValue = addSafeNonNegativeInteger(
      cohesionDamageValue,
      config.capacityReachedCohesionBonus,
      "cohesionDamageValue",
    );
  }
  return cohesionDamageValue;
}

function validateConsequenceInputs(
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

function validateSurvivabilityApplication(
  identityStore: UnitIdentityStore,
  application: CombatSurvivabilityApplication,
): void {
  getUnitMembers(identityStore, application.sourceUnitId);
  getUnitMembers(identityStore, application.targetUnitId);
  assertNonNegativeSafeInteger(
    application.incomingDamageValue,
    "incomingDamageValue",
  );
  assertNonNegativeSafeInteger(
    application.armourReduction,
    "armourReduction",
  );
  assertNonNegativeSafeInteger(
    application.shieldReduction,
    "shieldReduction",
  );
  assertNonNegativeSafeInteger(
    application.appliedDamageValue,
    "appliedDamageValue",
  );
  assertNonNegativeSafeInteger(
    application.accumulatedDamageBefore,
    "accumulatedDamageBefore",
  );
  assertNonNegativeSafeInteger(
    application.accumulatedDamageAfter,
    "accumulatedDamageAfter",
  );
  if (typeof application.capacityReached !== "boolean") {
    throw new RangeError("capacityReached must be a boolean.");
  }
}

function resolveCombatConsequenceConfig(
  config: CombatConsequenceConfig,
): ResolvedCombatConsequenceConfig {
  const resolvedConfig = {
    appliedDamagePressureScale:
      config.appliedDamagePressureScale ??
      DEFAULT_APPLIED_DAMAGE_PRESSURE_SCALE,
    mitigatedHitPressureDelta:
      config.mitigatedHitPressureDelta ??
      DEFAULT_MITIGATED_HIT_PRESSURE_DELTA,
    capacityReachedPressureBonus:
      config.capacityReachedPressureBonus ??
      DEFAULT_CAPACITY_REACHED_PRESSURE_BONUS,
    capacityReachedCohesionBonus:
      config.capacityReachedCohesionBonus ??
      DEFAULT_CAPACITY_REACHED_COHESION_BONUS,
  };

  assertNonNegativeSafeInteger(
    resolvedConfig.appliedDamagePressureScale,
    "appliedDamagePressureScale",
  );
  assertNonNegativeSafeInteger(
    resolvedConfig.mitigatedHitPressureDelta,
    "mitigatedHitPressureDelta",
  );
  assertNonNegativeSafeInteger(
    resolvedConfig.capacityReachedPressureBonus,
    "capacityReachedPressureBonus",
  );
  assertNonNegativeSafeInteger(
    resolvedConfig.capacityReachedCohesionBonus,
    "capacityReachedCohesionBonus",
  );
  return resolvedConfig;
}

function increaseFormationPressure(current: number, amount: number): number {
  if (amount <= 0) {
    return current;
  }
  if (current > MAX_FORMATION_INTEGER_STATE_VALUE - amount) {
    return MAX_FORMATION_INTEGER_STATE_VALUE;
  }
  return current + amount;
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

function multiplySafeNonNegativeInteger(
  left: number,
  right: number,
  name: string,
): number {
  if (right !== 0 && left > Math.floor(Number.MAX_SAFE_INTEGER / right)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
  return left * right;
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
