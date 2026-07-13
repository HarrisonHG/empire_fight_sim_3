import type { CombatConsequenceApplication } from "./combatConsequences";
import type { IndividualCombatUnitConsequenceSummary } from "./individualCombatConsequences";
import type { CombatAttackOpportunity } from "./combatTempo";
import {
  applyUnitCohesionLoss,
  getIndividualConfidence,
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
  } as InternalCombatPressureStore;
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
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  individualConsequences: readonly IndividualCombatUnitConsequenceSummary[],
  store: CombatPressureStore,
  out: UnitPressureUpdate[] = [],
  config: CombatPressureConfig & {
    readonly appliedDamagePressureScale?: number;
  } = {},
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
  const appliedDamagePressureScale =
    config.appliedDamagePressureScale ?? 10;
  assertNonNegativeInteger(
    appliedDamagePressureScale,
    "appliedDamagePressureScale",
  );
  prepareIndividualSourceScratch(
    identityStore,
    formationStore,
    internal,
    individualConsequences,
    appliedDamagePressureScale,
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
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  store: InternalCombatPressureStore,
  individualConsequences: readonly IndividualCombatUnitConsequenceSummary[],
  appliedDamagePressureScale: number,
): void {
  store.engagedByUnit.fill(0);
  store.consequencePressureByUnit.fill(0);
  store.hasConsequenceByUnit.fill(0);
  store.applyConsequencePressureByUnit.fill(0);
  store.zeroHitCohesionLossByUnit.fill(0);

  for (let index = 0; index < individualConsequences.length; index += 1) {
    const consequence = individualConsequences[index]!;
    const unitIndex = requireUnitIndex(store, consequence.unitId);
    const members = getUnitMembers(identityStore, consequence.unitId);
    if (
      consequence.outgoingSelectedTargets > 0 ||
      consequence.incomingSelectedByHostiles > 0 ||
      consequence.outgoingValidAttackAttempts > 0 ||
      consequence.incomingValidAttackAttempts > 0
    ) {
      store.engagedByUnit[unitIndex] = 1;
    }
    if (consequence.incomingAppliedHitLoss > 0) {
      store.hasConsequenceByUnit[unitIndex] = 1;
      store.applyConsequencePressureByUnit[unitIndex] = 1;
      store.consequencePressureByUnit[unitIndex] = multiplyBounded(
        consequence.incomingAppliedHitLoss,
        appliedDamagePressureScale,
      );
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

function asInternal(store: CombatPressureStore): InternalCombatPressureStore {
  return store as InternalCombatPressureStore;
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
