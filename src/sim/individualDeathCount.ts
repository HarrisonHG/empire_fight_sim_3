import {
  getIndividualCharacterLifecycleState,
  transitionIndividualDyingToTerminal,
  type IndividualCasualtyLifecycleStore,
  type IndividualZeroHitLifecycleTransitionRecord,
  type TerminalCause,
} from "./individualCasualtyLifecycle";
import {
  getIndividualCasualtyProcedureProfile,
  type DeathCountPolicy,
  type IndividualCasualtyProcedureProfileStore,
} from "./individualCasualtyProcedureProfile";
import {
  getIndividualCombatProfile,
  type IndividualCombatProfileStore,
} from "./individualCombatProfile";

export const DEATH_COUNT_TICKS_PER_SECOND = 20;
export const MAX_DEATH_COUNT_TICKS = 0x7fff_ffff;

export interface IndividualDeathCountStore {
  readonly entityCount: number;
}

interface InternalIndividualDeathCountStore extends IndividualDeathCountStore {
  readonly durationByEntity: Int32Array;
  readonly remainingByEntity: Int32Array;
  readonly initializedByEntity: Uint8Array;
  readonly pausedByEntity: Uint8Array;
  readonly lastDecrementTickByEntity: Float64Array;
  readonly firstZeroHitTickByEntity: Float64Array;
  readonly latestZeroHitTickByEntity: Float64Array;
  readonly dyingTransitionCountByEntity: Uint32Array;
  readonly terminalTickByEntity: Float64Array;
  readonly terminalCauseByEntity: Uint8Array;
  readonly terminalXByEntity: Int32Array;
  readonly terminalYByEntity: Int32Array;
}

export interface IndividualDeathCountInspection {
  readonly durationTicks: number;
  readonly remainingTicks: number;
  readonly paused: boolean;
}

export interface IndividualCasualtyHistoryInspection {
  readonly firstZeroHitTick: number;
  readonly latestZeroHitTick: number;
  readonly dyingTransitionCount: number;
  readonly terminalTick: number;
  readonly terminalCause: TerminalCause;
  readonly terminalX: number;
  readonly terminalY: number;
}

export interface IndividualDeathCountTerminalTransitionRecord {
  readonly entityId: number;
  readonly tick: number;
  readonly previousLifecycleState: "dying";
  readonly lifecycleState: "terminal";
  readonly cause: "deathCountExpired";
  readonly terminalX: number;
  readonly terminalY: number;
}

const TERMINAL_CAUSES: readonly TerminalCause[] = [
  "none",
  "deathCountExpired",
  "execution",
];

export function createIndividualDeathCountStore(
  entityCount: number,
): IndividualDeathCountStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const firstZeroHitTickByEntity = new Float64Array(entityCount);
  const latestZeroHitTickByEntity = new Float64Array(entityCount);
  const terminalTickByEntity = new Float64Array(entityCount);
  const lastDecrementTickByEntity = new Float64Array(entityCount);
  firstZeroHitTickByEntity.fill(-1);
  latestZeroHitTickByEntity.fill(-1);
  terminalTickByEntity.fill(-1);
  lastDecrementTickByEntity.fill(-1);
  return {
    entityCount,
    durationByEntity: new Int32Array(entityCount),
    remainingByEntity: new Int32Array(entityCount),
    initializedByEntity: new Uint8Array(entityCount),
    pausedByEntity: new Uint8Array(entityCount),
    lastDecrementTickByEntity,
    firstZeroHitTickByEntity,
    latestZeroHitTickByEntity,
    dyingTransitionCountByEntity: new Uint32Array(entityCount),
    terminalTickByEntity,
    terminalCauseByEntity: new Uint8Array(entityCount),
    terminalXByEntity: new Int32Array(entityCount),
    terminalYByEntity: new Int32Array(entityCount),
  } as InternalIndividualDeathCountStore;
}

export function resolveIndividualDeathCountDurationTicks(
  policy: DeathCountPolicy,
  fortitudeLevels: number,
): number {
  assertNonNegativeSafeInteger(fortitudeLevels, "fortitudeLevels");
  let durationTicks: number;
  if (policy.kind === "fixedTicks") {
    durationTicks = policy.durationTicks;
  } else {
    const triangular = fortitudeLevels * (fortitudeLevels + 1) / 2;
    const minutes = 3 + triangular;
    durationTicks = minutes * 60 * DEATH_COUNT_TICKS_PER_SECOND;
  }
  if (
    !Number.isSafeInteger(durationTicks) ||
    durationTicks <= 0 ||
    durationTicks > MAX_DEATH_COUNT_TICKS
  ) {
    throw new RangeError(
      `Death-count duration must be an integer from 1 to ${MAX_DEATH_COUNT_TICKS} ticks.`,
    );
  }
  return durationTicks;
}

export function initializeIndividualDeathCountsFromZeroHitTransitions(
  store: IndividualDeathCountStore,
  procedureStore: IndividualCasualtyProcedureProfileStore,
  combatProfileStore: IndividualCombatProfileStore,
  transitions: readonly IndividualZeroHitLifecycleTransitionRecord[],
): void {
  const internal = asInternal(store);
  validateCounts(internal, procedureStore, combatProfileStore);
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index]!;
    assertEntityId(transition.entityId, internal.entityCount);
    if (internal.initializedByEntity[transition.entityId] !== 0) {
      throw new Error("A death count cannot be restarted without an explicit future new-life reset boundary.");
    }
    const procedure = getIndividualCasualtyProcedureProfile(
      procedureStore,
      transition.entityId,
    );
    const combatProfile = getIndividualCombatProfile(
      combatProfileStore,
      transition.entityId,
    );
    const duration = resolveIndividualDeathCountDurationTicks(
      procedure.deathCountPolicy,
      combatProfile.qualifications.fortitudeLevels,
    );
    internal.durationByEntity[transition.entityId] = duration;
    internal.remainingByEntity[transition.entityId] = duration;
    internal.initializedByEntity[transition.entityId] = 1;
    internal.pausedByEntity[transition.entityId] = 0;
    internal.lastDecrementTickByEntity[transition.entityId] = transition.tick;
    if (internal.firstZeroHitTickByEntity[transition.entityId] === -1) {
      internal.firstZeroHitTickByEntity[transition.entityId] = transition.tick;
    }
    internal.latestZeroHitTickByEntity[transition.entityId] = transition.tick;
    internal.dyingTransitionCountByEntity[transition.entityId] =
      internal.dyingTransitionCountByEntity[transition.entityId]! + 1;
  }
}

/** Future treatment may call this before advancement in the production tick. */
export function setIndividualDeathCountPaused(
  store: IndividualDeathCountStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  entityId: number,
  paused: boolean,
): void {
  const internal = asInternal(store);
  validateLifecycleCount(internal, lifecycleStore);
  assertEntityId(entityId, internal.entityCount);
  if (getIndividualCharacterLifecycleState(lifecycleStore, entityId) !== "dying") {
    throw new Error("Only a dying character's death count may be paused or resumed.");
  }
  if (internal.initializedByEntity[entityId] === 0) {
    throw new Error("Cannot pause an uninitialized death count.");
  }
  internal.pausedByEntity[entityId] = paused ? 1 : 0;
}

export function advanceIndividualDeathCountsOneTick(
  store: IndividualDeathCountStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
  positions: { readonly entityCount: number; readonly positionsX: Int32Array; readonly positionsY: Int32Array },
  tick: number,
  out: IndividualDeathCountTerminalTransitionRecord[] = [],
): readonly IndividualDeathCountTerminalTransitionRecord[] {
  const internal = asInternal(store);
  validateLifecycleCount(internal, lifecycleStore);
  if (
    positions.entityCount !== internal.entityCount ||
    positions.positionsX.length !== internal.entityCount ||
    positions.positionsY.length !== internal.entityCount
  ) throw new RangeError("Death-count positions must match entity count.");
  assertNonNegativeSafeInteger(tick, "tick");
  out.length = 0;
  for (let entityId = 0; entityId < internal.entityCount; entityId += 1) {
    if (getIndividualCharacterLifecycleState(lifecycleStore, entityId) !== "dying") continue;
    if (internal.initializedByEntity[entityId] === 0) {
      throw new Error("Every dying character must have an initialized death count.");
    }
    if (internal.pausedByEntity[entityId] !== 0) continue;
    const enteredTick = internal.latestZeroHitTickByEntity[entityId]!;
    if (tick <= enteredTick) continue;
    const lastDecrementTick = internal.lastDecrementTickByEntity[entityId]!;
    if (tick < lastDecrementTick) {
      throw new RangeError("Death-count ticks must not move backwards.");
    }
    if (tick === lastDecrementTick) continue;
    const remaining = internal.remainingByEntity[entityId]!;
    if (remaining <= 0) throw new Error("Dying death count reached an invalid stored value.");
    const nextRemaining = remaining - 1;
    internal.remainingByEntity[entityId] = nextRemaining;
    internal.lastDecrementTickByEntity[entityId] = tick;
    if (nextRemaining !== 0) continue;
    const terminalX = positions.positionsX[entityId]!;
    const terminalY = positions.positionsY[entityId]!;
    transitionIndividualDyingToTerminal(
      lifecycleStore,
      entityId,
      tick,
      "deathCountExpired",
    );
    internal.pausedByEntity[entityId] = 0;
    internal.terminalTickByEntity[entityId] = tick;
    internal.terminalCauseByEntity[entityId] = 1;
    internal.terminalXByEntity[entityId] = terminalX;
    internal.terminalYByEntity[entityId] = terminalY;
    out.push({
      entityId,
      tick,
      previousLifecycleState: "dying",
      lifecycleState: "terminal",
      cause: "deathCountExpired",
      terminalX,
      terminalY,
    });
  }
  return out;
}

export function getIndividualDeathCountInspection(
  store: IndividualDeathCountStore,
  entityId: number,
): IndividualDeathCountInspection {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    durationTicks: internal.durationByEntity[entityId]!,
    remainingTicks: internal.remainingByEntity[entityId]!,
    paused: internal.pausedByEntity[entityId] !== 0,
  };
}

export function getIndividualCasualtyHistoryInspection(
  store: IndividualDeathCountStore,
  entityId: number,
): IndividualCasualtyHistoryInspection {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    firstZeroHitTick: internal.firstZeroHitTickByEntity[entityId]!,
    latestZeroHitTick: internal.latestZeroHitTickByEntity[entityId]!,
    dyingTransitionCount: internal.dyingTransitionCountByEntity[entityId]!,
    terminalTick: internal.terminalTickByEntity[entityId]!,
    terminalCause: TERMINAL_CAUSES[internal.terminalCauseByEntity[entityId]!]!,
    terminalX: internal.terminalXByEntity[entityId]!,
    terminalY: internal.terminalYByEntity[entityId]!,
  };
}

function validateCounts(
  store: InternalIndividualDeathCountStore,
  procedureStore: IndividualCasualtyProcedureProfileStore,
  combatProfileStore: IndividualCombatProfileStore,
): void {
  if (
    store.entityCount !== procedureStore.entityCount ||
    store.entityCount !== combatProfileStore.entityCount
  ) throw new RangeError("Death-count dependencies must match entity count.");
}

function validateLifecycleCount(
  store: InternalIndividualDeathCountStore,
  lifecycleStore: IndividualCasualtyLifecycleStore,
): void {
  if (store.entityCount !== lifecycleStore.entityCount) {
    throw new RangeError("Death-count lifecycle store must match entity count.");
  }
}

function asInternal(store: IndividualDeathCountStore): InternalIndividualDeathCountStore {
  return store as InternalIndividualDeathCountStore;
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Death-count entity ID is out of bounds.");
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
