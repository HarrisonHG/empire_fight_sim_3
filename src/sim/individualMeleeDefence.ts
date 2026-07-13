import {
  areEightDirectionsWithinOctants,
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
import type { UnitIdentityStore } from "./unitIdentity";

export type IndividualGuardState = "ready" | "recovering";

export type IndividualMeleeDefenceType =
  | "weaponParry"
  | "bucklerBlock"
  | "shieldBlock"
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
  | "noActiveDefence";

export interface IndividualMeleeDefenceTiming {
  readonly recoveryTicks: number;
}

export interface IndividualMeleeDefenceStore {
  readonly entityCount: number;
}

export interface IndividualMeleeDefenceStoreConfig {
  readonly entityCount: number;
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
}

interface InternalIndividualMeleeDefenceStore
  extends IndividualMeleeDefenceStore {
  readonly guardStateByEntity: IndividualGuardState[];
  readonly defenceRecoveryTicksRemainingByEntity: Int16Array;
  readonly lastEmittedGuardStateByEntity: IndividualGuardState[];
  readonly snapshottedActionStateByEntity: IndividualCombatActionState[];
  readonly snapshottedFacingXByEntity: Int8Array;
  readonly snapshottedFacingYByEntity: Int8Array;
  readonly snapshottedActiveWeaponByEntity: IndividualWeaponCategory[];
  readonly snapshottedShieldCategoryByEntity: IndividualShieldCategory[];
  readonly snapshottedShieldStateByEntity: IndividualShieldCarriedState[];
  readonly attemptScratch: IndividualMeleeAttackAttemptRecord[];
}

export const INDIVIDUAL_MELEE_DEFENCE_TIMING: Readonly<
  Record<Exclude<IndividualMeleeDefenceType, "none">, IndividualMeleeDefenceTiming>
> = Object.freeze({
  weaponParry: Object.freeze({ recoveryTicks: 4 }),
  bucklerBlock: Object.freeze({ recoveryTicks: 3 }),
  shieldBlock: Object.freeze({ recoveryTicks: 4 }),
});

export function createIndividualMeleeDefenceStore(
  config: IndividualMeleeDefenceStoreConfig,
): IndividualMeleeDefenceStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");

  return {
    entityCount: config.entityCount,
    guardStateByEntity: new Array<IndividualGuardState>(
      config.entityCount,
    ).fill("ready"),
    defenceRecoveryTicksRemainingByEntity: new Int16Array(config.entityCount),
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
  } as InternalIndividualMeleeDefenceStore;
}

export function getIndividualGuardState(
  store: IndividualMeleeDefenceStore,
  entityId: number,
): IndividualGuardState {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.guardStateByEntity[entityId]!;
}

export function getDefenceRecoveryTicksRemaining(
  store: IndividualMeleeDefenceStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.defenceRecoveryTicksRemainingByEntity[entityId]!;
}

export function resolveIndividualMeleeDefences(
  world: WorldState,
  identityStore: UnitIdentityStore,
  actionStore: IndividualCombatActionStore,
  profileStore: IndividualCombatProfileStore,
  defenceStore: IndividualMeleeDefenceStore,
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  recordsOut: IndividualMeleeDefenceRecord[] = [],
  guardStateEventsOut: IndividualGuardStateEvent[] = [],
  eligibility?: IndividualCombatEligibilitySnapshot,
): IndividualMeleeDefenceTickResult {
  validateStores(world, identityStore, actionStore, profileStore, defenceStore);
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

  advanceRecoveryTimers(internal, guardStateEventsOut);
  snapshotDefenders(actionStore, profileStore, internal);
  prepareCanonicalAttempts(internal, attackAttempts, eligibility);

  for (let index = 0; index < internal.attemptScratch.length; index += 1) {
    const attempt = internal.attemptScratch[index]!;
    recordsOut.push(
      resolveAttempt(
        world,
        profileStore,
        internal,
        attempt,
        guardStateEventsOut,
        eligibility,
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
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    if (internal.guardStateByEntity[entityId] === "recovering") {
      recoveringGuardCount += 1;
    }
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
  };
}

function resolveAttempt(
  world: WorldState,
  profileStore: IndividualCombatProfileStore,
  store: InternalIndividualMeleeDefenceStore,
  attempt: IndividualMeleeAttackAttemptRecord,
  eventsOut: IndividualGuardStateEvent[],
  eligibility: IndividualCombatEligibilitySnapshot | undefined,
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
    store.guardStateByEntity[defenderEntityId]!;
  const availableDefence = chooseAvailableDefence(
    defenderProfile,
    defenderActiveWeapon,
    shieldCategory,
    shieldCarriedState,
    defenderFacing,
    incomingDirection,
  );
  const legalActiveDefenceExists = hasLegalActiveDefence(
    defenderProfile,
    defenderActiveWeapon,
    shieldCategory,
    shieldCarriedState,
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
  if (defenderActionState !== "ready") {
    return landedRecord(common, availableDefence, "defenderBusy");
  }
  if (availableDefence === "none") {
    return landedRecord(
      common,
      "none",
      legalActiveDefenceExists ? "outsideDefenceArc" : "noActiveDefence",
    );
  }
  if (guardStateBeforeResolution !== "ready") {
    return landedRecord(common, availableDefence, "guardRecovering");
  }

  const recoveryTicks =
    INDIVIDUAL_MELEE_DEFENCE_TIMING[availableDefence].recoveryTicks;
  store.defenceRecoveryTicksRemainingByEntity[defenderEntityId] =
    recoveryTicks;
  transitionGuardState(store, defenderEntityId, "recovering", eventsOut);

  if (availableDefence === "shieldBlock") {
    return {
      ...common,
      availableDefenceType: "shieldBlock",
      outcome: "shieldBlocked",
      defenceRecoveryTicksAssigned: recoveryTicks,
    };
  }
  if (availableDefence === "bucklerBlock") {
    return {
      ...common,
      availableDefenceType: "bucklerBlock",
      outcome: "bucklerBlocked",
      defenceRecoveryTicksAssigned: recoveryTicks,
    };
  }

  return {
    ...common,
    availableDefenceType: "weaponParry",
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
  if (
    shieldCategory === "shield" &&
    shieldCarriedState === "held" &&
    areEightDirectionsWithinOctants(defenderFacing, incomingDirection, 2)
  ) {
    return "shieldBlock";
  }
  if (
    shieldCategory === "buckler" &&
    shieldCarriedState === "held" &&
    areEightDirectionsWithinOctants(defenderFacing, incomingDirection, 1)
  ) {
    return "bucklerBlock";
  }
  if (
    weaponCanParry(profile, activeWeapon) &&
    areEightDirectionsWithinOctants(defenderFacing, incomingDirection, 1)
  ) {
    return "weaponParry";
  }

  if (
    shieldCategory === "shield" ||
    shieldCategory === "buckler" ||
    weaponCanParry(profile, activeWeapon)
  ) {
    return "none";
  }
  return "none";
}

function landedRecord(
  common: Omit<
    IndividualMeleeDefenceRecordBase,
    "availableDefenceType" | "outcome" | "defenceRecoveryTicksAssigned"
  >,
  availableDefenceType: IndividualMeleeDefenceType,
  landedReason: IndividualMeleeLandedReason,
): IndividualMeleeDefenceRecord {
  return {
    ...common,
    availableDefenceType,
    outcome: "landed",
    landedReason,
    defenceRecoveryTicksAssigned: 0,
  };
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

function advanceRecoveryTimers(
  store: InternalIndividualMeleeDefenceStore,
  eventsOut: IndividualGuardStateEvent[],
): void {
  for (let entityId = 0; entityId < store.entityCount; entityId += 1) {
    if (store.guardStateByEntity[entityId] !== "recovering") continue;
    const remaining =
      store.defenceRecoveryTicksRemainingByEntity[entityId]!;
    if (remaining > 1) {
      store.defenceRecoveryTicksRemainingByEntity[entityId] = remaining - 1;
    } else {
      store.defenceRecoveryTicksRemainingByEntity[entityId] = 0;
      transitionGuardState(store, entityId, "ready", eventsOut);
    }
  }
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


function transitionGuardState(
  store: InternalIndividualMeleeDefenceStore,
  entityId: number,
  nextGuardState: IndividualGuardState,
  eventsOut: IndividualGuardStateEvent[],
): void {
  const previousGuardState = store.guardStateByEntity[entityId]!;
  store.guardStateByEntity[entityId] = nextGuardState;
  if (store.lastEmittedGuardStateByEntity[entityId] === nextGuardState) return;

  eventsOut.push({
    entityId,
    previousGuardState,
    guardState: nextGuardState,
  });
  store.lastEmittedGuardStateByEntity[entityId] = nextGuardState;
}

function validateStores(
  world: WorldState,
  identityStore: UnitIdentityStore,
  actionStore: IndividualCombatActionStore,
  profileStore: IndividualCombatProfileStore,
  defenceStore: IndividualMeleeDefenceStore,
): void {
  if (
    identityStore.entityCount !== world.entityCount ||
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
