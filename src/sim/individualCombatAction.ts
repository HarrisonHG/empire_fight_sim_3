import {
  areSameOrAdjacentEightDirections,
  quantizeEightDirection,
  tryQuantizeEightDirection,
  type EightDirectionComponent,
} from "./eightDirection";
import { getUnitHeading, type FormationBehaviourStore } from "./formationBehaviour";
import {
  getIndividualCombatProfile,
  type IndividualCombatProfile,
  type IndividualCombatProfileStore,
  type IndividualWeaponCategory,
} from "./individualCombatProfile";
import {
  isIndividualCombatEligible,
  type IndividualCombatEligibilitySnapshot,
} from "./individualCombatEligibility";
import {
  NO_INDIVIDUAL_TARGET,
  type IndividualSelectedTargetRecord,
} from "./individualMeleeTargetSelection";
import type { WorldState } from "./types";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  type UnitIdentityStore,
} from "./unitIdentity";

export type IndividualCombatActionState =
  | "ready"
  | "committingAttack"
  | "recoveringAttack";

export type IndividualMeleeAttackOutcome = "attempted" | "invalidated";

export type IndividualMeleeAttackInvalidationReason =
  | "targetMissing"
  | "alliedTarget"
  | "outOfThreatDistance"
  | "outsideAttackFacingArc"
  | "sourceCannotFaceTarget"
  | "noActiveMeleeMode";

export interface IndividualCombatActionTiming {
  readonly commitmentTicks: number;
  readonly recoveryTicks: number;
}

export interface IndividualCombatActionStore {
  readonly entityCount: number;
}

export interface IndividualCombatActionStoreConfig {
  readonly entityCount: number;
}

export interface IndividualCombatActionStateEvent {
  readonly entityId: number;
  readonly previousState: IndividualCombatActionState;
  readonly actionState: IndividualCombatActionState;
}

interface IndividualMeleeAttackAttemptRecordBase {
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  readonly weaponCategory: IndividualWeaponCategory;
  readonly commitmentDurationTicks: number;
  readonly recoveryDurationTicks: number;
  readonly distanceSquaredAtResolution: number;
  readonly threatDistance: number;
  readonly preferredMinimumDistance: number;
  readonly awkwardDistance: boolean;
  readonly facingX: EightDirectionComponent;
  readonly facingY: EightDirectionComponent;
  readonly outcome: IndividualMeleeAttackOutcome;
}

export type IndividualMeleeAttackAttemptRecord =
  | (IndividualMeleeAttackAttemptRecordBase & {
      readonly outcome: "attempted";
    })
  | (IndividualMeleeAttackAttemptRecordBase & {
      readonly outcome: "invalidated";
      readonly invalidationReason: IndividualMeleeAttackInvalidationReason;
    });

export interface IndividualCombatActionTickResult {
  readonly attackAttempts: readonly IndividualMeleeAttackAttemptRecord[];
  readonly actionStateEvents: readonly IndividualCombatActionStateEvent[];
  readonly activeCommitmentCount: number;
  readonly completedAttemptCount: number;
  readonly invalidatedAttemptCount: number;
  readonly recoveringEntityCount: number;
}

interface InternalIndividualCombatActionStore
  extends IndividualCombatActionStore {
  readonly facingXByEntity: Int8Array;
  readonly facingYByEntity: Int8Array;
  readonly actionStateByEntity: IndividualCombatActionState[];
  readonly lockedTargetByEntity: Int32Array;
  readonly commitmentTicksRemainingByEntity: Int16Array;
  readonly recoveryTicksRemainingByEntity: Int16Array;
  readonly activeWeaponByEntity: IndividualWeaponCategory[];
  readonly lastEmittedActionStateByEntity: IndividualCombatActionState[];
  readonly selectedTargetScratch: Int32Array;
  readonly selectedTargetSeenScratch: Uint8Array;
}

export const INDIVIDUAL_COMBAT_ACTION_TIMING: Readonly<
  Record<IndividualWeaponCategory, IndividualCombatActionTiming>
> = Object.freeze({
  unarmed: Object.freeze({ commitmentTicks: 0, recoveryTicks: 0 }),
  dagger: Object.freeze({ commitmentTicks: 2, recoveryTicks: 2 }),
  oneHanded: Object.freeze({ commitmentTicks: 3, recoveryTicks: 3 }),
  greatWeapon: Object.freeze({ commitmentTicks: 4, recoveryTicks: 4 }),
  polearm: Object.freeze({ commitmentTicks: 5, recoveryTicks: 4 }),
  pike: Object.freeze({ commitmentTicks: 6, recoveryTicks: 5 }),
  thrown: Object.freeze({ commitmentTicks: 3, recoveryTicks: 3 }),
  ranged: Object.freeze({ commitmentTicks: 0, recoveryTicks: 0 }),
  rod: Object.freeze({ commitmentTicks: 3, recoveryTicks: 3 }),
  staff: Object.freeze({ commitmentTicks: 5, recoveryTicks: 4 }),
});

export function createIndividualCombatActionStore(
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
  config: IndividualCombatActionStoreConfig,
): IndividualCombatActionStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  validateStoreCounts(config.entityCount, identityStore, formationStore, profileStore);

  const facingXByEntity = new Int8Array(config.entityCount);
  const facingYByEntity = new Int8Array(config.entityCount);
  const actionStateByEntity = new Array<IndividualCombatActionState>(
    config.entityCount,
  ).fill("ready");
  const lockedTargetByEntity = new Int32Array(config.entityCount);
  lockedTargetByEntity.fill(NO_INDIVIDUAL_TARGET);
  const commitmentTicksRemainingByEntity = new Int16Array(config.entityCount);
  const recoveryTicksRemainingByEntity = new Int16Array(config.entityCount);
  const activeWeaponByEntity = new Array<IndividualWeaponCategory>(
    config.entityCount,
  );
  const lastEmittedActionStateByEntity =
    new Array<IndividualCombatActionState>(config.entityCount).fill("ready");

  for (let entityId = 0; entityId < config.entityCount; entityId += 1) {
    const unitId = getUnitIdForEntity(identityStore, entityId);
    const heading = getUnitHeading(formationStore, unitId);
    const facing = normalizeFacing(heading.x, heading.y);
    facingXByEntity[entityId] = facing.x;
    facingYByEntity[entityId] = facing.y;
    activeWeaponByEntity[entityId] =
      getIndividualCombatProfile(profileStore, entityId).primaryWeapon;
  }

  return {
    entityCount: config.entityCount,
    facingXByEntity,
    facingYByEntity,
    actionStateByEntity,
    lockedTargetByEntity,
    commitmentTicksRemainingByEntity,
    recoveryTicksRemainingByEntity,
    activeWeaponByEntity,
    lastEmittedActionStateByEntity,
    selectedTargetScratch: new Int32Array(config.entityCount),
    selectedTargetSeenScratch: new Uint8Array(config.entityCount),
  } as InternalIndividualCombatActionStore;
}

export function getIndividualCombatFacing(
  store: IndividualCombatActionStore,
  entityId: number,
): { readonly x: EightDirectionComponent; readonly y: EightDirectionComponent } {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    x: internal.facingXByEntity[entityId] as EightDirectionComponent,
    y: internal.facingYByEntity[entityId] as EightDirectionComponent,
  };
}

export function getIndividualCombatActionState(
  store: IndividualCombatActionStore,
  entityId: number,
): IndividualCombatActionState {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.actionStateByEntity[entityId]!;
}

export function getLockedAttackTargetEntityId(
  store: IndividualCombatActionStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.lockedTargetByEntity[entityId]!;
}

export function getAttackCommitmentTicksRemaining(
  store: IndividualCombatActionStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.commitmentTicksRemainingByEntity[entityId]!;
}

export function getAttackRecoveryTicksRemaining(
  store: IndividualCombatActionStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.recoveryTicksRemainingByEntity[entityId]!;
}

export function getActiveMeleeWeaponCategory(
  store: IndividualCombatActionStore,
  entityId: number,
): IndividualWeaponCategory {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return internal.activeWeaponByEntity[entityId]!;
}

export function advanceIndividualCombatActions(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
  selectedTargetRecords: readonly IndividualSelectedTargetRecord[],
  store: IndividualCombatActionStore,
  attackAttemptsOut: IndividualMeleeAttackAttemptRecord[] = [],
  actionStateEventsOut: IndividualCombatActionStateEvent[] = [],
  eligibility?: IndividualCombatEligibilitySnapshot,
): IndividualCombatActionTickResult {
  validateWorldAndStores(
    world,
    identityStore,
    formationStore,
    profileStore,
    store,
  );
  if (
    eligibility !== undefined &&
    eligibility.entityCount !== world.entityCount
  ) {
    throw new RangeError(
      "Individual combat action eligibility must match world entity count.",
    );
  }
  const internal = asInternal(store);
  prepareSelectedTargets(internal, selectedTargetRecords);
  attackAttemptsOut.length = 0;
  actionStateEventsOut.length = 0;

  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    const state = internal.actionStateByEntity[entityId]!;
    if (!isIndividualCombatEligible(eligibility, entityId)) {
      if (state === "committingAttack") {
        cancelCommitmentIfActive(internal, entityId, actionStateEventsOut);
      } else if (state === "recoveringAttack") {
        advanceRecovery(internal, entityId, actionStateEventsOut);
      }
      continue;
    }
    if (state === "ready") {
      tryBeginCommitment(
        world,
        identityStore,
        profileStore,
        internal,
        entityId,
        actionStateEventsOut,
        eligibility,
      );
    } else if (state === "committingAttack") {
      const targetEntityId = internal.lockedTargetByEntity[entityId]!;
      if (
        !targetExists(targetEntityId, world.entityCount) ||
        !isIndividualCombatEligible(eligibility, targetEntityId)
      ) {
        cancelCommitmentIfActive(internal, entityId, actionStateEventsOut);
        continue;
      }
      advanceCommitment(
        world,
        identityStore,
        profileStore,
        internal,
        entityId,
        attackAttemptsOut,
        actionStateEventsOut,
        eligibility,
      );
    } else {
      advanceRecovery(internal, entityId, actionStateEventsOut);
    }
  }

  let activeCommitmentCount = 0;
  let recoveringEntityCount = 0;
  for (let entityId = 0; entityId < world.entityCount; entityId += 1) {
    const state = internal.actionStateByEntity[entityId]!;
    if (state === "committingAttack") activeCommitmentCount += 1;
    if (state === "recoveringAttack") recoveringEntityCount += 1;
  }

  let completedAttemptCount = 0;
  let invalidatedAttemptCount = 0;
  for (let index = 0; index < attackAttemptsOut.length; index += 1) {
    if (attackAttemptsOut[index]!.outcome === "attempted") {
      completedAttemptCount += 1;
    } else {
      invalidatedAttemptCount += 1;
    }
  }

  return {
    attackAttempts: attackAttemptsOut,
    actionStateEvents: actionStateEventsOut,
    activeCommitmentCount,
    completedAttemptCount,
    invalidatedAttemptCount,
    recoveringEntityCount,
  };
}

function tryBeginCommitment(
  world: WorldState,
  identityStore: UnitIdentityStore,
  profileStore: IndividualCombatProfileStore,
  store: InternalIndividualCombatActionStore,
  entityId: number,
  eventsOut: IndividualCombatActionStateEvent[],
  eligibility: IndividualCombatEligibilitySnapshot | undefined,
): void {
  const targetEntityId = store.selectedTargetScratch[entityId]!;
  if (targetEntityId === NO_INDIVIDUAL_TARGET) return;
  if (
    !isIndividualCombatEligible(eligibility, entityId) ||
    !isIndividualCombatEligible(eligibility, targetEntityId)
  ) {
    return;
  }

  const profile = getIndividualCombatProfile(profileStore, entityId);
  const weaponCategory = store.activeWeaponByEntity[entityId]!;
  const distances = getMeleeDistances(profile, weaponCategory);
  if (distances.threat === 0 || !targetExists(targetEntityId, world.entityCount)) {
    return;
  }
  if (!isHostile(identityStore, entityId, targetEntityId)) return;

  const sourceX = world.positionsX[entityId]!;
  const sourceY = world.positionsY[entityId]!;
  const deltaX = world.positionsX[targetEntityId]! - sourceX;
  const deltaY = world.positionsY[targetEntityId]! - sourceY;
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;
  const facing = tryQuantizeEightDirection(deltaX, deltaY);
  if (
    facing === undefined ||
    distanceSquared > distances.threat * distances.threat
  ) {
    return;
  }

  store.facingXByEntity[entityId] = facing.x;
  store.facingYByEntity[entityId] = facing.y;
  store.lockedTargetByEntity[entityId] = targetEntityId;
  store.commitmentTicksRemainingByEntity[entityId] =
    INDIVIDUAL_COMBAT_ACTION_TIMING[weaponCategory].commitmentTicks;
  store.recoveryTicksRemainingByEntity[entityId] = 0;
  transitionState(store, entityId, "committingAttack", eventsOut);
}

function advanceCommitment(
  world: WorldState,
  identityStore: UnitIdentityStore,
  profileStore: IndividualCombatProfileStore,
  store: InternalIndividualCombatActionStore,
  entityId: number,
  attackAttemptsOut: IndividualMeleeAttackAttemptRecord[],
  eventsOut: IndividualCombatActionStateEvent[],
  eligibility: IndividualCombatEligibilitySnapshot | undefined,
): void {
  const remaining = store.commitmentTicksRemainingByEntity[entityId]!;
  if (remaining > 1) {
    store.commitmentTicksRemainingByEntity[entityId] = remaining - 1;
    return;
  }

  store.commitmentTicksRemainingByEntity[entityId] = 0;
  const targetEntityId = store.lockedTargetByEntity[entityId]!;
  const weaponCategory = store.activeWeaponByEntity[entityId]!;
  const timing = INDIVIDUAL_COMBAT_ACTION_TIMING[weaponCategory];
  const resolved = resolveCommittedAttack(
    world,
    identityStore,
    profileStore,
    store,
    entityId,
    targetEntityId,
    weaponCategory,
    timing,
    eligibility,
  );
  attackAttemptsOut.push(resolved);
  store.lockedTargetByEntity[entityId] = NO_INDIVIDUAL_TARGET;
  store.recoveryTicksRemainingByEntity[entityId] = timing.recoveryTicks;
  transitionState(store, entityId, "recoveringAttack", eventsOut);
}

function advanceRecovery(
  store: InternalIndividualCombatActionStore,
  entityId: number,
  eventsOut: IndividualCombatActionStateEvent[],
): void {
  const remaining = store.recoveryTicksRemainingByEntity[entityId]!;
  if (remaining > 1) {
    store.recoveryTicksRemainingByEntity[entityId] = remaining - 1;
    return;
  }

  store.recoveryTicksRemainingByEntity[entityId] = 0;
  transitionState(store, entityId, "ready", eventsOut);
}

function resolveCommittedAttack(
  world: WorldState,
  identityStore: UnitIdentityStore,
  profileStore: IndividualCombatProfileStore,
  store: InternalIndividualCombatActionStore,
  attackerEntityId: number,
  targetEntityId: number,
  weaponCategory: IndividualWeaponCategory,
  timing: IndividualCombatActionTiming,
  eligibility: IndividualCombatEligibilitySnapshot | undefined,
): IndividualMeleeAttackAttemptRecord {
  const profile = getIndividualCombatProfile(profileStore, attackerEntityId);
  const distances = getMeleeDistances(profile, weaponCategory);
  const facingX = store.facingXByEntity[
    attackerEntityId
  ] as EightDirectionComponent;
  const facingY = store.facingYByEntity[
    attackerEntityId
  ] as EightDirectionComponent;
  const common = {
    attackerEntityId,
    targetEntityId,
    weaponCategory,
    commitmentDurationTicks: timing.commitmentTicks,
    recoveryDurationTicks: timing.recoveryTicks,
    threatDistance: distances.threat,
    preferredMinimumDistance: distances.preferredMinimum,
    facingX,
    facingY,
  };

  if (!targetExists(targetEntityId, world.entityCount)) {
    return invalidatedRecord(common, -1, false, "targetMissing");
  }
  if (
    !isIndividualCombatEligible(eligibility, attackerEntityId) ||
    !isIndividualCombatEligible(eligibility, targetEntityId)
  ) {
    return invalidatedRecord(common, -1, false, "targetMissing");
  }
  if (distances.threat === 0) {
    return invalidatedRecord(common, -1, false, "noActiveMeleeMode");
  }

  const deltaX =
    world.positionsX[targetEntityId]! - world.positionsX[attackerEntityId]!;
  const deltaY =
    world.positionsY[targetEntityId]! - world.positionsY[attackerEntityId]!;
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;
  const awkwardDistance =
    distanceSquared < distances.preferredMinimum * distances.preferredMinimum;

  if (!isHostile(identityStore, attackerEntityId, targetEntityId)) {
    return invalidatedRecord(common, distanceSquared, awkwardDistance, "alliedTarget");
  }
  if (distanceSquared > distances.threat * distances.threat) {
    return invalidatedRecord(
      common,
      distanceSquared,
      awkwardDistance,
      "outOfThreatDistance",
    );
  }
  if (facingX === 0 && facingY === 0) {
    return invalidatedRecord(
      common,
      distanceSquared,
      awkwardDistance,
      "sourceCannotFaceTarget",
    );
  }
  const lockedDirection = tryQuantizeEightDirection(facingX, facingY);
  const currentDirection = tryQuantizeEightDirection(deltaX, deltaY);
  if (lockedDirection === undefined || currentDirection === undefined) {
    return invalidatedRecord(
      common,
      distanceSquared,
      awkwardDistance,
      "sourceCannotFaceTarget",
    );
  }
  if (!areSameOrAdjacentEightDirections(lockedDirection, currentDirection)) {
    return invalidatedRecord(
      common,
      distanceSquared,
      awkwardDistance,
      "outsideAttackFacingArc",
    );
  }

  return {
    ...common,
    distanceSquaredAtResolution: distanceSquared,
    awkwardDistance,
    outcome: "attempted",
  };
}

function cancelCommitmentIfActive(
  store: InternalIndividualCombatActionStore,
  entityId: number,
  eventsOut: IndividualCombatActionStateEvent[],
): void {
  if (store.actionStateByEntity[entityId] !== "committingAttack") return;
  store.lockedTargetByEntity[entityId] = NO_INDIVIDUAL_TARGET;
  store.commitmentTicksRemainingByEntity[entityId] = 0;
  store.recoveryTicksRemainingByEntity[entityId] = 0;
  transitionState(store, entityId, "ready", eventsOut);
}

function invalidatedRecord(
  common: Omit<
    IndividualMeleeAttackAttemptRecordBase,
    "distanceSquaredAtResolution" | "awkwardDistance" | "outcome"
  >,
  distanceSquaredAtResolution: number,
  awkwardDistance: boolean,
  invalidationReason: IndividualMeleeAttackInvalidationReason,
): IndividualMeleeAttackAttemptRecord {
  return {
    ...common,
    distanceSquaredAtResolution,
    awkwardDistance,
    outcome: "invalidated",
    invalidationReason,
  };
}

function transitionState(
  store: InternalIndividualCombatActionStore,
  entityId: number,
  nextState: IndividualCombatActionState,
  eventsOut: IndividualCombatActionStateEvent[],
): void {
  const previousState = store.actionStateByEntity[entityId]!;
  store.actionStateByEntity[entityId] = nextState;
  if (store.lastEmittedActionStateByEntity[entityId] === nextState) return;

  eventsOut.push({
    entityId,
    previousState,
    actionState: nextState,
  });
  store.lastEmittedActionStateByEntity[entityId] = nextState;
}

function prepareSelectedTargets(
  store: InternalIndividualCombatActionStore,
  selectedTargetRecords: readonly IndividualSelectedTargetRecord[],
): void {
  store.selectedTargetScratch.fill(NO_INDIVIDUAL_TARGET);
  store.selectedTargetSeenScratch.fill(0);

  for (let index = 0; index < selectedTargetRecords.length; index += 1) {
    const record = selectedTargetRecords[index]!;
    assertEntityId(record.sourceEntityId, store.entityCount);
    if (store.selectedTargetSeenScratch[record.sourceEntityId] !== 0) {
      throw new RangeError("Duplicate selected-target record for source entity.");
    }
    store.selectedTargetSeenScratch[record.sourceEntityId] = 1;
    store.selectedTargetScratch[record.sourceEntityId] = record.targetEntityId;
  }
}

function getMeleeDistances(
  profile: IndividualCombatProfile,
  weaponCategory: IndividualWeaponCategory,
): { readonly threat: number; readonly preferredMinimum: number } {
  if (
    profile.primaryWeapon !== weaponCategory ||
    !profile.supportedAttackModes.includes("melee")
  ) {
    return { threat: 0, preferredMinimum: 0 };
  }

  switch (weaponCategory) {
    case "dagger":
      return { threat: 8, preferredMinimum: 0 };
    case "oneHanded":
    case "thrown":
    case "rod":
      return { threat: 12, preferredMinimum: 4 };
    case "greatWeapon":
      return { threat: 16, preferredMinimum: 8 };
    case "polearm":
    case "staff":
      return { threat: 20, preferredMinimum: 12 };
    case "pike":
      return { threat: 24, preferredMinimum: 16 };
    default:
      return { threat: 0, preferredMinimum: 0 };
  }
}

function targetExists(targetEntityId: number, entityCount: number): boolean {
  return (
    Number.isSafeInteger(targetEntityId) &&
    targetEntityId >= 0 &&
    targetEntityId < entityCount
  );
}

function isHostile(
  identityStore: UnitIdentityStore,
  sourceEntityId: number,
  targetEntityId: number,
): boolean {
  const sourceUnitId = getUnitIdForEntity(identityStore, sourceEntityId);
  const targetUnitId = getUnitIdForEntity(identityStore, targetEntityId);
  return (
    getFactionIdForUnit(identityStore, sourceUnitId) !==
    getFactionIdForUnit(identityStore, targetUnitId)
  );
}

function normalizeFacing(
  facingX: number,
  facingY: number,
): { readonly x: EightDirectionComponent; readonly y: EightDirectionComponent } {
  return quantizeEightDirection(facingX, facingY);
}

function validateWorldAndStores(
  world: WorldState,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
  store: IndividualCombatActionStore,
): void {
  validateStoreCounts(world.entityCount, identityStore, formationStore, profileStore);
  if (store.entityCount !== world.entityCount) {
    throw new RangeError(
      "Individual combat action store must match world entity count.",
    );
  }
}

function validateStoreCounts(
  entityCount: number,
  identityStore: UnitIdentityStore,
  formationStore: FormationBehaviourStore,
  profileStore: IndividualCombatProfileStore,
): void {
  if (
    identityStore.entityCount !== entityCount ||
    formationStore.entityCount !== entityCount ||
    profileStore.entityCount !== entityCount
  ) {
    throw new RangeError(
      "Individual combat action dependencies must match entity count.",
    );
  }
}

function asInternal(
  store: IndividualCombatActionStore,
): InternalIndividualCombatActionStore {
  return store as InternalIndividualCombatActionStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Individual combat action entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}
