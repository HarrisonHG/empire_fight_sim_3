import {
  areEightDirectionsWithinOctants,
  getEightDirectionOctantDistance,
  quantizeEightDirection,
  type EightDirectionComponent,
  type EightDirectionName,
} from "./eightDirection";
import {
  getActiveMeleeWeaponCategory,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
  type IndividualCombatActionState,
  type IndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "./individualCombatAction";
import {
  getIndividualCombatProfile,
  type IndividualCombatProfile,
  type IndividualCombatProfileStore,
  type IndividualShieldCarriedState,
  type IndividualShieldCategory,
  type IndividualWeaponCategory,
} from "./individualCombatProfile";
import {
  isIndividualCombatEligible,
  type IndividualCombatEligibilitySnapshot,
} from "./individualCombatEligibility";
import type { WorldState } from "./types";
import {
  getIndividualRole,
  type FormationBehaviourStore,
} from "./formationBehaviour";
import type { UnitIdentityStore } from "./unitIdentity";

export type IndividualGuardState = "ready" | "recovering";

export type IndividualMeleeDefenceType =
  | "weaponParry"
  | "bucklerBlock"
  | "shieldBlock"
  | "desperateRearDefence"
  | "none";

export type IndividualMeleeDefenceOutcome =
  | "parried"
  | "bucklerBlocked"
  | "shieldBlocked"
  | "landed";

export type IndividualMeleeLandedReason =
  | "defenderBusy"
  | "guardRecovering"
  | "outsideDefenceArc"
  | "noActiveDefence"
  | "failedDefence";

export type DefenceCoverageTier =
  | "none"
  | "tiny"
  | "small"
  | "medium"
  | "large"
  | "huge";

export type IndividualMeleeDefenceResolution =
  | "successfulParry"
  | "successfulBucklerBlock"
  | "successfulShieldBlock"
  | "successfulDesperateRearDefence"
  | "failedDefence"
  | "outsideDefenceArc"
  | "noDefenceSource";

export interface IndividualMeleeDefenceTiming {
  readonly recoveryTicks: number;
}

export interface IndividualMeleeDefenceStore {
  readonly entityCount: number;
}

export interface IndividualMeleeDefenceStoreConfig {
  readonly entityCount: number;
  readonly battleSeed?: number;
}

export interface IndividualGuardStateEvent {
  readonly entityId: number;
  readonly previousGuardState: IndividualGuardState;
  readonly guardState: IndividualGuardState;
}

interface IndividualMeleeDefenceRecordBase {
  readonly attackerEntityId: number;
  readonly defenderEntityId: number;
  readonly attackerWeaponCategory: IndividualWeaponCategory;
  readonly defenderActiveWeaponCategory: IndividualWeaponCategory;
  readonly defenderShieldCategory: IndividualShieldCategory;
  readonly defenderShieldCarriedState: IndividualShieldCarriedState;
  readonly defenderActionState: IndividualCombatActionState;
  readonly guardStateBeforeResolution: IndividualGuardState;
  readonly defenderFacingX: EightDirectionComponent;
  readonly defenderFacingY: EightDirectionComponent;
  readonly incomingDirectionName: EightDirectionName;
  readonly incomingDirectionOctantIndex: number;
  /** Equipment-and-arc defence available before guard/action-state checks. */
  readonly availableDefenceType: IndividualMeleeDefenceType;
  readonly defenceCoverageTier?: DefenceCoverageTier;
  readonly defenceReadinessFixedPoint?: number;
  readonly storedGuardReadinessFixedPoint?: number;
  readonly effectiveGuardReadinessFixedPoint?: number;
  readonly readinessRecoveryPerTick?: number;
  readonly readinessSpentThisTick?: number;
  readonly readinessRecoveredThisTick?: number;
  readonly offensivelySuppressed?: boolean;
  readonly rearDesperateDefenceApplied?: boolean;
  readonly calculatedDefenceChanceFixedPoint?: number;
  readonly deterministicDefenceRollFixedPoint?: number;
  readonly defenceResolution?: IndividualMeleeDefenceResolution;
  readonly outcome: IndividualMeleeDefenceOutcome;
  readonly defenceRecoveryTicksAssigned: number;
  readonly awkwardDistance: boolean;
}

export type IndividualMeleeDefenceRecord =
  | (IndividualMeleeDefenceRecordBase & {
      readonly outcome: "parried" | "bucklerBlocked" | "shieldBlocked";
    })
  | (IndividualMeleeDefenceRecordBase & {
      readonly outcome: "landed";
      readonly landedReason: IndividualMeleeLandedReason;
    });

export interface IndividualMeleeDefenceTickResult {
  readonly records: readonly IndividualMeleeDefenceRecord[];
  readonly guardStateEvents: readonly IndividualGuardStateEvent[];
  readonly attemptsConsumed: number;
  readonly parryCount: number;
  readonly bucklerBlockCount: number;
  readonly shieldBlockCount: number;
  readonly landedCount: number;
  readonly recoveringGuardCount: number;
  readonly readinessUpdates: number;
  readonly readinessSpending: number;
  readonly offensiveSuppressions: number;
  readonly rearDefenceAttempts: number;
}

interface InternalIndividualMeleeDefenceStore
  extends IndividualMeleeDefenceStore {
  readonly guardReadinessByEntity: Int16Array;
  readonly readinessSpentThisTickByEntity: Int16Array;
  readonly readinessRecoveredThisTickByEntity: Int16Array;
  readonly lastEmittedGuardStateByEntity: IndividualGuardState[];
  readonly snapshottedActionStateByEntity: IndividualCombatActionState[];
  readonly snapshottedFacingXByEntity: Int8Array;
  readonly snapshottedFacingYByEntity: Int8Array;
  readonly snapshottedActiveWeaponByEntity: IndividualWeaponCategory[];
  readonly snapshottedShieldCategoryByEntity: IndividualShieldCategory[];
  readonly snapshottedShieldStateByEntity: IndividualShieldCarriedState[];
  readonly attemptScratch: IndividualMeleeAttackAttemptRecord[];
  readonly battleSeed: number;
}

export const INDIVIDUAL_MELEE_DEFENCE_TIMING: Readonly<
  Record<Exclude<IndividualMeleeDefenceType, "none">, IndividualMeleeDefenceTiming>
> = Object.freeze({
  weaponParry: Object.freeze({ recoveryTicks: 4 }),
  bucklerBlock: Object.freeze({ recoveryTicks: 3 }),
  shieldBlock: Object.freeze({ recoveryTicks: 4 }),
  desperateRearDefence: Object.freeze({ recoveryTicks: 0 }),
});

export const DEFENCE_CHANCE_SCALE = 10_000;
export const DEFENCE_FULL_READINESS_CHANCE = 9_500;
export const GUARD_READINESS_MAX = 10_000;
export const GUARD_READINESS_COST_PER_ATTEMPT = 2_000;
export const REAR_DESPERATE_DEFENCE_CHANCE = 500;
export const GUARD_READINESS_RECOVERY = Object.freeze({
  recruit: 50,
  regular: 100,
  veteran: 150,
});

const DEFENCE_TIER_MINIMUM_CHANCE: Readonly<
  Record<DefenceCoverageTier, number>
> = Object.freeze({
  none: 0,
  tiny: 1_000,
  small: 1_500,
  medium: 2_500,
  large: 4_000,
  huge: 5_500,
});

const DEFENCE_COVERAGE_TIER_RANK: Readonly<
  Record<DefenceCoverageTier, number>
> = Object.freeze({
  none: 0,
  tiny: 1,
  small: 2,
  medium: 3,
  large: 4,
  huge: 5,
});

const WEAPON_DEFENCE_COVERAGE: Readonly<
  Record<IndividualWeaponCategory, DefenceCoverageTier>
> = Object.freeze({
  unarmed: "none",
  dagger: "tiny",
  oneHanded: "small",
  greatWeapon: "small",
  polearm: "medium",
  pike: "small",
  thrown: "none",
  ranged: "none",
  rod: "small",
  staff: "medium",
});

export function createIndividualMeleeDefenceStore(
  config: IndividualMeleeDefenceStoreConfig,
): IndividualMeleeDefenceStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  const battleSeed = config.battleSeed ?? 0;
  assertNonNegativeSafeInteger(battleSeed, "battleSeed");

  return {
    entityCount: config.entityCount,
    guardReadinessByEntity: new Int16Array(config.entityCount).fill(
      GUARD_READINESS_MAX,
    ),
    readinessSpentThisTickByEntity: new Int16Array(config.entityCount),
    readinessRecoveredThisTickByEntity: new Int16Array(config.entityCount),
    lastEmittedGuardStateByEntity: new Array<IndividualGuardState>(
      config.entityCount,
    ).fill("ready"),
    snapshottedActionStateByEntity: new Array<IndividualCombatActionState>(
      config.entityCount,
    ).fill("ready"),
    snapshottedFacingXByEntity: new Int8Array(config.entityCount),
    snapshottedFacingYByEntity: new Int8Array(config.entityCount),
    snapshottedActiveWeaponByEntity: new Array<IndividualWeaponCategory>(
      config.entityCount,
    ).fill("unarmed"),
    snapshottedShieldCategoryByEntity: new Array<IndividualShieldCategory>(
      config.entityCount,
    ).fill("none"),
    snapshottedShieldStateByEntity: new Array<IndividualShieldCarriedState>(
      config.entityCount,
    ).fill("none"),
    attemptScratch: [],
    battleSeed,
  } as InternalIndividualMeleeDefenceStore;
}

export function getIndividualGuardState(
  store: IndividualMeleeDefenceStore,
  entityId: number,
): IndividualGuardState {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.guardReadinessByEntity[entityId] === GUARD_READINESS_MAX
    ? "ready"
    : "recovering";
}

export function getStoredGuardReadinessFixedPoint(
  store: IndividualMeleeDefenceStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.guardReadinessByEntity[entityId]!;
}

export function getReadinessSpentThisTick(
  store: IndividualMeleeDefenceStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.readinessSpentThisTickByEntity[entityId]!;
}

export function getReadinessRecoveredThisTick(
  store: IndividualMeleeDefenceStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.readinessRecoveredThisTickByEntity[entityId]!;
}

export function getDefenceRecoveryTicksRemaining(
  store: IndividualMeleeDefenceStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return 0;
}

export function resolveIndividualMeleeDefences(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  actionStore: IndividualCombatActionStore,
  profileStore: IndividualCombatProfileStore,
  defenceStore: IndividualMeleeDefenceStore,
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  recordsOut: IndividualMeleeDefenceRecord[] = [],
  guardStateEventsOut: IndividualGuardStateEvent[] = [],
  eligibility?: IndividualCombatEligibilitySnapshot,
  currentTick = 0,
): IndividualMeleeDefenceTickResult {
  validateStores(
    world,
    identityStore,
    formationStore,
    actionStore,
    profileStore,
    defenceStore,
  );
  if (
    eligibility !== undefined &&
    eligibility.entityCount !== world.entityCount
  ) {
    throw new RangeError(
      "Individual melee defence eligibility must match world entity count.",
    );
  }
  const internal = asInternal(defenceStore);
  recordsOut.length = 0;
  guardStateEventsOut.length = 0;

  recoverGuardReadiness(formationStore, internal, guardStateEventsOut);
  snapshotDefenders(actionStore, profileStore, internal);
  prepareCanonicalAttempts(internal, attackAttempts, eligibility);

  for (let index = 0; index < internal.attemptScratch.length; index += 1) {
    const attempt = internal.attemptScratch[index]!;
    recordsOut.push(
      resolveAttempt(
        world,
        formationStore,
        profileStore,
        internal,
        attempt,
        guardStateEventsOut,
        eligibility,
        currentTick,
      ),
    );
  }

  let parryCount = 0;
  let bucklerBlockCount = 0;
  let shieldBlockCount = 0;
  let landedCount = 0;
  for (let index = 0; index < recordsOut.length; index += 1) {
    const record = recordsOut[index]!;
    if (record.outcome === "parried") parryCount += 1;
    else if (record.outcome === "bucklerBlocked") bucklerBlockCount += 1;
    else if (record.outcome === "shieldBlocked") shieldBlockCount += 1;
    else landedCount += 1;
  }

  let recoveringGuardCount = 0;
  let readinessSpending = 0;
  let offensiveSuppressions = 0;
  let rearDefenceAttempts = 0;
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    if (internal.guardReadinessByEntity[entityId]! < GUARD_READINESS_MAX) {
      recoveringGuardCount += 1;
    }
    readinessSpending += internal.readinessSpentThisTickByEntity[entityId]!;
  }
  for (const record of recordsOut) {
    if (record.offensivelySuppressed) offensiveSuppressions += 1;
    if (record.rearDesperateDefenceApplied) rearDefenceAttempts += 1;
  }

  return {
    records: recordsOut,
    guardStateEvents: guardStateEventsOut,
    attemptsConsumed: recordsOut.length,
    parryCount,
    bucklerBlockCount,
    shieldBlockCount,
    landedCount,
    recoveringGuardCount,
    readinessUpdates: internal.entityCount,
    readinessSpending,
    offensiveSuppressions,
    rearDefenceAttempts,
  };
}

function resolveAttempt(
  world: WorldState,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
  store: InternalIndividualMeleeDefenceStore,
  attempt: IndividualMeleeAttackAttemptRecord,
  eventsOut: IndividualGuardStateEvent[],
  eligibility: IndividualCombatEligibilitySnapshot | undefined,
  currentTick: number,
): IndividualMeleeDefenceRecord {
  const defenderEntityId = attempt.targetEntityId;
  const attackerEntityId = attempt.attackerEntityId;
  const defenderProfile = getIndividualCombatProfile(profileStore, defenderEntityId);
  const incomingDirection = quantizeEightDirection(
    world.positionsX[attackerEntityId]! - world.positionsX[defenderEntityId]!,
    world.positionsY[attackerEntityId]! - world.positionsY[defenderEntityId]!,
  );
  const defenderFacing = quantizeEightDirection(
    store.snapshottedFacingXByEntity[defenderEntityId]!,
    store.snapshottedFacingYByEntity[defenderEntityId]!,
  );
  const defenderActiveWeapon =
    store.snapshottedActiveWeaponByEntity[defenderEntityId]!;
  const shieldCategory =
    store.snapshottedShieldCategoryByEntity[defenderEntityId]!;
  const shieldCarriedState =
    store.snapshottedShieldStateByEntity[defenderEntityId]!;
  const defenderActionState =
    store.snapshottedActionStateByEntity[defenderEntityId]!;
  const guardStateBeforeResolution =
    getIndividualGuardState(store, defenderEntityId);
  const legalActiveDefenceExists = hasLegalActiveDefence(
    defenderProfile,
    defenderActiveWeapon,
    shieldCategory,
    shieldCarriedState,
  );
  const rearDesperateDefence =
    legalActiveDefenceExists &&
    getEightDirectionOctantDistance(defenderFacing, incomingDirection) >= 3;
  const availableDefence = rearDesperateDefence
    ? "desperateRearDefence"
    : chooseAvailableDefence(
        defenderProfile,
        defenderActiveWeapon,
        shieldCategory,
        shieldCarriedState,
        defenderFacing,
        incomingDirection,
      );
  const common = {
    attackerEntityId,
    defenderEntityId,
    attackerWeaponCategory: attempt.weaponCategory,
    defenderActiveWeaponCategory: defenderActiveWeapon,
    defenderShieldCategory: shieldCategory,
    defenderShieldCarriedState: shieldCarriedState,
    defenderActionState,
    guardStateBeforeResolution,
    defenderFacingX: defenderFacing.x,
    defenderFacingY: defenderFacing.y,
    incomingDirectionName: incomingDirection.name,
    incomingDirectionOctantIndex: incomingDirection.octantIndex,
    awkwardDistance: attempt.awkwardDistance,
  };

  if (!isIndividualCombatEligible(eligibility, defenderEntityId)) {
    return landedRecord(common, "none", "noActiveDefence");
  }
  if (availableDefence === "none") {
    return landedRecord(
      common,
      "none",
      legalActiveDefenceExists ? "outsideDefenceArc" : "noActiveDefence",
    );
  }

  const recoveryTicks =
    INDIVIDUAL_MELEE_DEFENCE_TIMING[availableDefence].recoveryTicks;
  const storedReadiness = store.guardReadinessByEntity[defenderEntityId]!;
  const offensivelySuppressed = defenderActionState !== "ready";
  const effectiveReadiness = offensivelySuppressed ? 0 : storedReadiness;
  const coverageTier = rearDesperateDefence
    ? "none"
    : defenceCoverageTierForType(availableDefence, defenderActiveWeapon);
  const chanceFixedPoint = rearDesperateDefence
    ? REAR_DESPERATE_DEFENCE_CHANCE
    : calculateDefenceChanceFixedPoint(coverageTier, effectiveReadiness);
  const rollFixedPoint = deterministicDefenceRollFixedPoint(
    store.battleSeed,
    currentTick,
    attempt,
    availableDefence,
  );
  spendGuardReadiness(store, defenderEntityId, eventsOut);
  const readinessRecoveryPerTick = readinessRecoveryForRole(
    getIndividualRole(formationStore, defenderEntityId),
  );
  const diagnostic = {
    defenceCoverageTier: coverageTier,
    defenceReadinessFixedPoint: effectiveReadiness,
    storedGuardReadinessFixedPoint: storedReadiness,
    effectiveGuardReadinessFixedPoint: effectiveReadiness,
    readinessRecoveryPerTick,
    readinessSpentThisTick: GUARD_READINESS_COST_PER_ATTEMPT,
    readinessRecoveredThisTick:
      store.readinessRecoveredThisTickByEntity[defenderEntityId]!,
    offensivelySuppressed,
    rearDesperateDefenceApplied: rearDesperateDefence,
    calculatedDefenceChanceFixedPoint: chanceFixedPoint,
    deterministicDefenceRollFixedPoint: rollFixedPoint,
  };

  if (rollFixedPoint >= chanceFixedPoint) {
    return landedRecord(
      common,
      availableDefence,
      "failedDefence",
      coverageTier,
      effectiveReadiness,
      chanceFixedPoint,
      rollFixedPoint,
      diagnostic,
    );
  }

  if (rearDesperateDefence) {
    return successfulDefenceRecord(
      common,
      successfulDefenceOutcome(
        defenderProfile,
        defenderActiveWeapon,
        shieldCategory,
        shieldCarriedState,
      ),
      "desperateRearDefence",
      "successfulDesperateRearDefence",
      recoveryTicks,
      diagnostic,
    );
  }

  if (availableDefence === "shieldBlock") {
    return {
      ...common,
      availableDefenceType: "shieldBlock",
      ...diagnostic,
      defenceResolution: "successfulShieldBlock",
      outcome: "shieldBlocked",
      defenceRecoveryTicksAssigned: recoveryTicks,
    };
  }
  if (availableDefence === "bucklerBlock") {
    return {
      ...common,
      availableDefenceType: "bucklerBlock",
      ...diagnostic,
      defenceResolution: "successfulBucklerBlock",
      outcome: "bucklerBlocked",
      defenceRecoveryTicksAssigned: recoveryTicks,
    };
  }

  return {
    ...common,
    availableDefenceType: "weaponParry",
    ...diagnostic,
    defenceResolution: "successfulParry",
    outcome: "parried",
    defenceRecoveryTicksAssigned: recoveryTicks,
  };
}

function chooseAvailableDefence(
  profile: IndividualCombatProfile,
  activeWeapon: IndividualWeaponCategory,
  shieldCategory: IndividualShieldCategory,
  shieldCarriedState: IndividualShieldCarriedState,
  defenderFacing: ReturnType<typeof quantizeEightDirection>,
  incomingDirection: ReturnType<typeof quantizeEightDirection>,
): Exclude<IndividualMeleeDefenceType, "none"> | "none" {
  let selected: Exclude<IndividualMeleeDefenceType, "none"> | "none" = "none";
  let selectedTier: DefenceCoverageTier = "none";
  if (
    shieldCategory === "shield" &&
    shieldCarriedState === "held" &&
    areEightDirectionsWithinOctants(defenderFacing, incomingDirection, 2)
  ) {
    selected = "shieldBlock";
    selectedTier = "huge";
  }
  if (
    shieldCategory === "buckler" &&
    shieldCarriedState === "held" &&
    areEightDirectionsWithinOctants(defenderFacing, incomingDirection, 1) &&
    isCoverageTierBetter("medium", selectedTier)
  ) {
    selected = "bucklerBlock";
    selectedTier = "medium";
  }
  if (
    weaponCanParry(profile, activeWeapon) &&
    areEightDirectionsWithinOctants(defenderFacing, incomingDirection, 1)
  ) {
    const weaponTier = WEAPON_DEFENCE_COVERAGE[activeWeapon];
    if (isCoverageTierBetter(weaponTier, selectedTier)) {
      selected = "weaponParry";
    }
  }
  return selected;
}

function landedRecord(
  common: Omit<
    IndividualMeleeDefenceRecordBase,
    | "availableDefenceType"
    | "defenceCoverageTier"
    | "defenceReadinessFixedPoint"
    | "calculatedDefenceChanceFixedPoint"
    | "deterministicDefenceRollFixedPoint"
    | "defenceResolution"
    | "outcome"
    | "defenceRecoveryTicksAssigned"
  >,
  availableDefenceType: IndividualMeleeDefenceType,
  landedReason: IndividualMeleeLandedReason,
  coverageTier: DefenceCoverageTier = "none",
  readinessFixedPoint = 0,
  chanceFixedPoint = 0,
  rollFixedPoint = 0,
  diagnostic: Partial<IndividualMeleeDefenceRecordBase> = {},
): IndividualMeleeDefenceRecord {
  return {
    ...common,
    ...diagnostic,
    availableDefenceType,
    defenceCoverageTier: coverageTier,
    defenceReadinessFixedPoint: readinessFixedPoint,
    calculatedDefenceChanceFixedPoint: chanceFixedPoint,
    deterministicDefenceRollFixedPoint: rollFixedPoint,
    defenceResolution: landedResolution(landedReason),
    outcome: "landed",
    landedReason,
    defenceRecoveryTicksAssigned:
      availableDefenceType === "none"
        ? 0
        : INDIVIDUAL_MELEE_DEFENCE_TIMING[availableDefenceType].recoveryTicks,
  };
}

function successfulDefenceRecord(
  common: Omit<
    IndividualMeleeDefenceRecordBase,
    | "availableDefenceType"
    | "defenceCoverageTier"
    | "defenceReadinessFixedPoint"
    | "calculatedDefenceChanceFixedPoint"
    | "deterministicDefenceRollFixedPoint"
    | "defenceResolution"
    | "outcome"
    | "defenceRecoveryTicksAssigned"
  >,
  outcome: "parried" | "bucklerBlocked" | "shieldBlocked",
  availableDefenceType: Exclude<IndividualMeleeDefenceType, "none">,
  defenceResolution: IndividualMeleeDefenceResolution,
  defenceRecoveryTicksAssigned: number,
  diagnostic: Partial<IndividualMeleeDefenceRecordBase>,
): IndividualMeleeDefenceRecord {
  return {
    ...common,
    ...diagnostic,
    availableDefenceType,
    defenceResolution,
    outcome,
    defenceRecoveryTicksAssigned,
  } as IndividualMeleeDefenceRecord;
}

function successfulDefenceOutcome(
  profile: IndividualCombatProfile,
  activeWeapon: IndividualWeaponCategory,
  shieldCategory: IndividualShieldCategory,
  shieldCarriedState: IndividualShieldCarriedState,
): "parried" | "bucklerBlocked" | "shieldBlocked" {
  if (shieldCarriedState === "held" && shieldCategory === "shield") {
    return "shieldBlocked";
  }
  if (shieldCarriedState === "held" && shieldCategory === "buckler") {
    return "bucklerBlocked";
  }
  if (weaponCanParry(profile, activeWeapon)) return "parried";
  throw new Error("Rear desperate defence requires a usable defence source.");
}

function weaponCanParry(
  profile: IndividualCombatProfile,
  activeWeapon: IndividualWeaponCategory,
): boolean {
  return (
    activeWeapon !== "unarmed" &&
    activeWeapon !== "ranged" &&
    profile.primaryWeapon === activeWeapon &&
    profile.supportedAttackModes.includes("melee")
  );
}

function hasLegalActiveDefence(
  profile: IndividualCombatProfile,
  activeWeapon: IndividualWeaponCategory,
  shieldCategory: IndividualShieldCategory,
  shieldCarriedState: IndividualShieldCarriedState,
): boolean {
  return (
    (shieldCarriedState === "held" &&
      (shieldCategory === "shield" || shieldCategory === "buckler")) ||
    weaponCanParry(profile, activeWeapon)
  );
}

function defenceCoverageTierForType(
  defenceType: Exclude<IndividualMeleeDefenceType, "none">,
  activeWeapon: IndividualWeaponCategory,
): DefenceCoverageTier {
  if (defenceType === "shieldBlock") return "huge";
  if (defenceType === "bucklerBlock") return "medium";
  return WEAPON_DEFENCE_COVERAGE[activeWeapon];
}

export function calculateDefenceChanceFixedPoint(
  coverageTier: DefenceCoverageTier,
  readinessFixedPoint: number,
): number {
  const minimum = DEFENCE_TIER_MINIMUM_CHANCE[coverageTier];
  return (
    minimum +
    Math.trunc(
      (readinessFixedPoint * (DEFENCE_FULL_READINESS_CHANCE - minimum)) /
        DEFENCE_CHANCE_SCALE,
    )
  );
}

function deterministicDefenceRollFixedPoint(
  battleSeed: number,
  currentTick: number,
  attempt: IndividualMeleeAttackAttemptRecord,
  defenceType: Exclude<IndividualMeleeDefenceType, "none">,
): number {
  let hash = 0x811c9dc5;
  hash = mixHash(hash, battleSeed);
  hash = mixHash(hash, currentTick);
  hash = mixHash(hash, attempt.commitmentDurationTicks);
  hash = mixHash(hash, attempt.recoveryDurationTicks);
  hash = mixHash(hash, attempt.attackerEntityId);
  hash = mixHash(hash, attempt.targetEntityId);
  hash = mixHash(hash, weaponIdentity(attempt.weaponCategory));
  hash = mixHash(hash, defenceIdentity(defenceType));
  return (hash >>> 0) % DEFENCE_CHANCE_SCALE;
}

function mixHash(hash: number, value: number): number {
  let mixed = (hash ^ (value >>> 0)) >>> 0;
  mixed = Math.imul(mixed, 0x01000193) >>> 0;
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function weaponIdentity(weapon: IndividualWeaponCategory): number {
  switch (weapon) {
    case "unarmed":
      return 0;
    case "dagger":
      return 1;
    case "oneHanded":
      return 2;
    case "greatWeapon":
      return 3;
    case "polearm":
      return 4;
    case "pike":
      return 5;
    case "thrown":
      return 6;
    case "ranged":
      return 7;
    case "rod":
      return 8;
    case "staff":
      return 9;
  }
}

function defenceIdentity(
  defenceType: Exclude<IndividualMeleeDefenceType, "none">,
): number {
  switch (defenceType) {
    case "weaponParry":
      return 1;
    case "bucklerBlock":
      return 2;
    case "shieldBlock":
      return 3;
    case "desperateRearDefence":
      return 4;
  }
}

function isCoverageTierBetter(
  candidate: DefenceCoverageTier,
  current: DefenceCoverageTier,
): boolean {
  return DEFENCE_COVERAGE_TIER_RANK[candidate] > DEFENCE_COVERAGE_TIER_RANK[current];
}

function landedResolution(
  reason: IndividualMeleeLandedReason,
): IndividualMeleeDefenceResolution {
  if (reason === "outsideDefenceArc") return "outsideDefenceArc";
  if (reason === "noActiveDefence") return "noDefenceSource";
  if (reason === "failedDefence") return "failedDefence";
  return "noDefenceSource";
}

function recoverGuardReadiness(
  formationStore: FormationBehaviourStore,
  store: InternalIndividualMeleeDefenceStore,
  eventsOut: IndividualGuardStateEvent[],
): void {
  store.readinessSpentThisTickByEntity.fill(0);
  store.readinessRecoveredThisTickByEntity.fill(0);
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    const before = store.guardReadinessByEntity[entityId]!;
    const recovery = readinessRecoveryForRole(
      getIndividualRole(formationStore, entityId),
    );
    const after = Math.min(GUARD_READINESS_MAX, before + recovery);
    store.guardReadinessByEntity[entityId] = after;
    store.readinessRecoveredThisTickByEntity[entityId] = after - before;
    emitGuardStateTransition(store, entityId, before, after, eventsOut);
  }
}

function spendGuardReadiness(
  store: InternalIndividualMeleeDefenceStore,
  entityId: number,
  eventsOut: IndividualGuardStateEvent[],
): void {
  const before = store.guardReadinessByEntity[entityId]!;
  const after = Math.max(0, before - GUARD_READINESS_COST_PER_ATTEMPT);
  store.guardReadinessByEntity[entityId] = after;
  store.readinessSpentThisTickByEntity[entityId] =
    store.readinessSpentThisTickByEntity[entityId]! + (before - after);
  emitGuardStateTransition(store, entityId, before, after, eventsOut);
}

function readinessRecoveryForRole(
  role: "recruit" | "regular" | "veteran",
): number {
  return GUARD_READINESS_RECOVERY[role];
}

function emitGuardStateTransition(
  store: InternalIndividualMeleeDefenceStore,
  entityId: number,
  beforeReadiness: number,
  afterReadiness: number,
  eventsOut: IndividualGuardStateEvent[],
): void {
  const previousGuardState =
    beforeReadiness === GUARD_READINESS_MAX ? "ready" : "recovering";
  const guardState =
    afterReadiness === GUARD_READINESS_MAX ? "ready" : "recovering";
  if (store.lastEmittedGuardStateByEntity[entityId] === guardState) return;
  eventsOut.push({ entityId, previousGuardState, guardState });
  store.lastEmittedGuardStateByEntity[entityId] = guardState;
}

function snapshotDefenders(
  actionStore: IndividualCombatActionStore,
  profileStore: IndividualCombatProfileStore,
  store: InternalIndividualMeleeDefenceStore,
): void {
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    const facing = getIndividualCombatFacing(actionStore, entityId);
    const profile = getIndividualCombatProfile(profileStore, entityId);
    store.snapshottedActionStateByEntity[entityId] =
      getIndividualCombatActionState(actionStore, entityId);
    store.snapshottedFacingXByEntity[entityId] = facing.x;
    store.snapshottedFacingYByEntity[entityId] = facing.y;
    store.snapshottedActiveWeaponByEntity[entityId] =
      getActiveMeleeWeaponCategory(actionStore, entityId);
    store.snapshottedShieldCategoryByEntity[entityId] =
      profile.shieldCategory;
    store.snapshottedShieldStateByEntity[entityId] =
      profile.shieldCarriedState;
  }
}

function prepareCanonicalAttempts(
  store: InternalIndividualMeleeDefenceStore,
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  eligibility: IndividualCombatEligibilitySnapshot | undefined,
): void {
  store.attemptScratch.length = 0;
  for (let index = 0; index < attackAttempts.length; index += 1) {
    const attempt = attackAttempts[index]!;
    if (attempt.outcome === "attempted") {
      assertEntityId(attempt.attackerEntityId, store.entityCount);
      assertEntityId(attempt.targetEntityId, store.entityCount);
      if (!isIndividualCombatEligible(eligibility, attempt.attackerEntityId)) {
        continue;
      }
      store.attemptScratch.push(attempt);
    }
  }
  store.attemptScratch.sort(
    (left, right) =>
      left.targetEntityId - right.targetEntityId ||
      left.attackerEntityId - right.attackerEntityId,
  );
}


function validateStores(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  actionStore: IndividualCombatActionStore,
  profileStore: IndividualCombatProfileStore,
  defenceStore: IndividualMeleeDefenceStore,
): void {
  if (
    identityStore.entityCount !== world.entityCount ||
    formationStore.entityCount !== world.entityCount ||
    actionStore.entityCount !== world.entityCount ||
    profileStore.entityCount !== world.entityCount ||
    defenceStore.entityCount !== world.entityCount
  ) {
    throw new RangeError(
      "Individual melee defence dependencies must match entity count.",
    );
  }
}

function asInternal(
  store: IndividualMeleeDefenceStore,
): InternalIndividualMeleeDefenceStore {
  return store as InternalIndividualMeleeDefenceStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Individual melee defence entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
