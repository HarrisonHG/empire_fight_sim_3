import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  transitionIndividualDyingToTerminal,
  type IndividualCasualtyLifecycleStore,
  type IndividualPlayerPresenceStore,
  type IndividualTerminalTransitionRecord,
} from "./individualCasualtyLifecycle";
import {
  recordIndividualTerminalTransitionInCasualtyHistory,
  type IndividualDeathCountStore,
} from "./individualDeathCount";
import {
  getIndividualCombatActionState,
  type IndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "./individualCombatAction";
import {
  isIndividualCombatEligible,
  type IndividualCombatEligibilitySnapshot,
} from "./individualCombatEligibility";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import { CASUALTY_DRAG_PICKUP_RANGE } from "./individualCasualtyAssistance";
import type { WorldState } from "./types";

export const INDIVIDUAL_EXECUTION_PROGRESS_TICKS = 100;
export const INDIVIDUAL_EXECUTION_RANGE = CASUALTY_DRAG_PICKUP_RANGE;

export type IndividualExecutionIntentTargetBasis = "dying" | "explicitConsent";

export interface IndividualExecutionIntent {
  readonly executorEntityId: number;
  readonly targetEntityId: number;
  readonly requestedTick: number;
  /** Reserved for a future explicit consent authority; 6H-1 accepts only dying. */
  readonly targetBasis: IndividualExecutionIntentTargetBasis;
}

export type IndividualExecutionIntentRejectionReason =
  | "staleIntent"
  | "selfTarget"
  | "executorBusy"
  | "targetBusy"
  | "executorIneligible"
  | "targetNotDying"
  | "consentingTargetHookUnavailable"
  | "outOfRange"
  | "executorAttack"
  | "executorAcceptedHit"
  | "targetAcceptedHit"
  | "forcedSeparation";

export type IndividualExecutionInterruptionReason =
  | "executorAttack"
  | "executorAcceptedHit"
  | "targetAcceptedHit"
  | "forcedSeparation"
  | "rangeLost"
  | "executorIncapacity"
  | "targetInvalid";

export interface IndividualExecutionActionStore {
  readonly entityCount: number;
}

interface ActiveExecutionAction {
  readonly actionId: number;
  readonly executorEntityId: number;
  readonly targetEntityId: number;
  readonly startedTick: number;
  progressTicks: number;
  lastProcessedTick: number;
}

interface InternalExecutionActionStore extends IndividualExecutionActionStore {
  readonly activeActions: ActiveExecutionAction[];
  readonly actionIndexByExecutor: Int32Array;
  readonly actionIndexByTarget: Int32Array;
  readonly pendingIntents: IndividualExecutionIntent[];
  readonly pendingIntentIndexByExecutor: Int32Array;
  readonly attackAttemptTickByEntity: Float64Array;
  readonly acceptedHitTickByEntity: Float64Array;
  readonly forcedSeparationScratch: Uint8Array;
  readonly forcedSeparationTouched: number[];
  readonly startedCountByEntity: Uint32Array;
  readonly interruptedCountByEntity: Uint32Array;
  readonly completedCountByEntity: Uint32Array;
  readonly terminalizedCountByEntity: Uint32Array;
  nextActionId: number;
  lastAdvancedTick: number;
}

export interface IndividualExecutionActionInspection {
  readonly actionId: number;
  readonly executorEntityId: number;
  readonly targetEntityId: number;
  readonly startedTick: number;
  readonly progressTicks: number;
  readonly requiredProgressTicks: number;
}

export interface IndividualExecutionStartedRecord
  extends IndividualExecutionActionInspection {
  readonly tick: number;
}

export interface IndividualExecutionInterruptedRecord
  extends IndividualExecutionActionInspection {
  readonly tick: number;
  readonly reason: IndividualExecutionInterruptionReason;
  readonly progressTicksLost: number;
}

export interface IndividualExecutionCompletedRecord
  extends IndividualExecutionActionInspection {
  readonly tick: number;
  readonly terminalTransition: IndividualTerminalTransitionRecord;
}

export interface IndividualExecutionIntentRejectedRecord {
  readonly executorEntityId: number;
  readonly targetEntityId: number;
  readonly requestedTick: number;
  readonly targetBasis: IndividualExecutionIntentTargetBasis;
  readonly tick: number;
  readonly reason: IndividualExecutionIntentRejectionReason;
}

export interface IndividualExecutionHistoryInspection {
  readonly startedCount: number;
  readonly interruptedCount: number;
  readonly completedCount: number;
  readonly terminalizedAsTargetCount: number;
}

export interface IndividualExecutionActionBuffers {
  readonly startedRecords: IndividualExecutionStartedRecord[];
  readonly interruptedRecords: IndividualExecutionInterruptedRecord[];
  readonly completedRecords: IndividualExecutionCompletedRecord[];
  readonly rejectedIntentRecords: IndividualExecutionIntentRejectedRecord[];
  readonly terminalTransitions: IndividualTerminalTransitionRecord[];
}

export interface IndividualExecutionActionResult {
  readonly startedRecords: readonly IndividualExecutionStartedRecord[];
  readonly interruptedRecords: readonly IndividualExecutionInterruptedRecord[];
  readonly completedRecords: readonly IndividualExecutionCompletedRecord[];
  readonly rejectedIntentRecords: readonly IndividualExecutionIntentRejectedRecord[];
  readonly terminalTransitions: readonly IndividualTerminalTransitionRecord[];
  readonly activeActionCount: number;
  readonly pendingIntentCount: number;
  readonly progressedActionCount: number;
}

export interface IndividualExecutionAdvanceOptions {
  readonly forcedSeparatedEntityIds?: readonly number[];
  readonly isExecutorOtherwiseCommitted?: (entityId: number) => boolean;
}

const NONE = -1;

export function createIndividualExecutionActionStore(
  entityCount: number,
): IndividualExecutionActionStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const actionIndexByExecutor = new Int32Array(entityCount);
  const actionIndexByTarget = new Int32Array(entityCount);
  const pendingIntentIndexByExecutor = new Int32Array(entityCount);
  const attackAttemptTickByEntity = new Float64Array(entityCount);
  const acceptedHitTickByEntity = new Float64Array(entityCount);
  actionIndexByExecutor.fill(NONE);
  actionIndexByTarget.fill(NONE);
  pendingIntentIndexByExecutor.fill(NONE);
  attackAttemptTickByEntity.fill(NONE);
  acceptedHitTickByEntity.fill(NONE);
  return {
    entityCount,
    activeActions: [],
    actionIndexByExecutor,
    actionIndexByTarget,
    pendingIntents: [],
    pendingIntentIndexByExecutor,
    attackAttemptTickByEntity,
    acceptedHitTickByEntity,
    forcedSeparationScratch: new Uint8Array(entityCount),
    forcedSeparationTouched: [],
    startedCountByEntity: new Uint32Array(entityCount),
    interruptedCountByEntity: new Uint32Array(entityCount),
    completedCountByEntity: new Uint32Array(entityCount),
    terminalizedCountByEntity: new Uint32Array(entityCount),
    nextActionId: 0,
    lastAdvancedTick: NONE,
  } as InternalExecutionActionStore;
}

export function createIndividualExecutionActionBuffers(): IndividualExecutionActionBuffers {
  return {
    startedRecords: [],
    interruptedRecords: [],
    completedRecords: [],
    rejectedIntentRecords: [],
    terminalTransitions: [],
  };
}

export function submitIndividualExecutionIntent(
  store: IndividualExecutionActionStore,
  intent: IndividualExecutionIntent,
): void {
  const internal = asInternal(store);
  assertEntityId(intent.executorEntityId, internal.entityCount);
  assertEntityId(intent.targetEntityId, internal.entityCount);
  assertNonNegativeSafeInteger(intent.requestedTick, "execution requestedTick");
  if (intent.targetBasis !== "dying" && intent.targetBasis !== "explicitConsent") {
    throw new RangeError("Unknown execution intent target basis.");
  }
  if (intent.requestedTick <= internal.lastAdvancedTick) {
    throw new RangeError("Execution intent must target a future unprocessed tick.");
  }
  if (internal.pendingIntentIndexByExecutor[intent.executorEntityId] !== NONE) {
    throw new Error("An executor may own at most one pending execution intent.");
  }
  const index = internal.pendingIntents.length;
  internal.pendingIntents.push(Object.freeze({ ...intent }));
  internal.pendingIntentIndexByExecutor[intent.executorEntityId] = index;
}

export function getIndividualExecutionActionInspection(
  store: IndividualExecutionActionStore,
  entityId: number,
): IndividualExecutionActionInspection | undefined {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  const executorIndex = internal.actionIndexByExecutor[entityId]!;
  const index = executorIndex !== NONE
    ? executorIndex
    : internal.actionIndexByTarget[entityId]!;
  return index === NONE ? undefined : inspect(internal.activeActions[index]!);
}

export function getIndividualExecutionHistoryInspection(
  store: IndividualExecutionActionStore,
  entityId: number,
): IndividualExecutionHistoryInspection {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount);
  return {
    startedCount: internal.startedCountByEntity[entityId]!,
    interruptedCount: internal.interruptedCountByEntity[entityId]!,
    completedCount: internal.completedCountByEntity[entityId]!,
    terminalizedAsTargetCount: internal.terminalizedCountByEntity[entityId]!,
  };
}

export function getActiveIndividualExecutionActionCount(
  store: IndividualExecutionActionStore,
): number {
  return asInternal(store).activeActions.length;
}

export function advanceIndividualExecutionActionsOneTick(
  world: WorldState,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  deathCounts: IndividualDeathCountStore,
  combatActions: IndividualCombatActionStore,
  combatEligibility: IndividualCombatEligibilitySnapshot,
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[],
  gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  tick: number,
  store: IndividualExecutionActionStore,
  buffers: IndividualExecutionActionBuffers,
  options: IndividualExecutionAdvanceOptions = {},
): IndividualExecutionActionResult {
  const internal = asInternal(store);
  validateCounts(world.entityCount, lifecycle, presence, deathCounts, combatActions,
    combatEligibility, internal);
  assertNonNegativeSafeInteger(tick, "tick");
  if (tick < internal.lastAdvancedTick) {
    throw new RangeError("Execution action ticks must not move backwards.");
  }
  resetBuffers(buffers);
  prepareEvidence(internal, attackAttempts, gateDecisions, tick);
  const forced = prepareForcedSeparationEvidence(
    internal, options.forcedSeparatedEntityIds,
  );
  let progressedActionCount = 0;

  for (let index = 0; index < internal.activeActions.length;) {
    const action = internal.activeActions[index]!;
    if (tick === action.lastProcessedTick) { index += 1; continue; }
    const interruption = getInterruptionReason(
      world, lifecycle, presence, combatActions, combatEligibility,
      internal, forced, action, tick, options,
    );
    if (interruption !== undefined) {
      buffers.interruptedRecords.push({
        ...inspect(action),
        tick,
        reason: interruption,
        progressTicksLost: action.progressTicks,
      });
      incrementBounded(internal.interruptedCountByEntity, action.executorEntityId,
        "execution interrupted count");
      removeAction(internal, index);
      continue;
    }
    action.lastProcessedTick = tick;
    action.progressTicks += 1;
    progressedActionCount += 1;
    if (action.progressTicks < INDIVIDUAL_EXECUTION_PROGRESS_TICKS) {
      index += 1;
      continue;
    }
    const terminalTransition = completeAction(
      world, lifecycle, deathCounts, internal, action, tick,
    );
    buffers.terminalTransitions.push(terminalTransition);
    buffers.completedRecords.push({
      ...inspect(action), tick, terminalTransition,
    });
    incrementBounded(internal.completedCountByEntity, action.executorEntityId,
      "execution completed count");
    incrementBounded(internal.terminalizedCountByEntity, action.targetEntityId,
      "execution terminalized-target count");
    removeAction(internal, index);
  }

  processPendingIntents(
    world, lifecycle, presence, combatActions, combatEligibility, tick,
    internal, forced, buffers, options,
  );
  internal.lastAdvancedTick = tick;
  sortBuffers(buffers);
  return {
    startedRecords: buffers.startedRecords,
    interruptedRecords: buffers.interruptedRecords,
    completedRecords: buffers.completedRecords,
    rejectedIntentRecords: buffers.rejectedIntentRecords,
    terminalTransitions: buffers.terminalTransitions,
    activeActionCount: internal.activeActions.length,
    pendingIntentCount: internal.pendingIntents.length,
    progressedActionCount,
  };
}

function processPendingIntents(
  world: WorldState,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  combatActions: IndividualCombatActionStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  tick: number,
  store: InternalExecutionActionStore,
  forced: Uint8Array,
  buffers: IndividualExecutionActionBuffers,
  options: IndividualExecutionAdvanceOptions,
): void {
  if (store.pendingIntents.length === 0) return;
  const ordered = store.pendingIntents.slice().sort((left, right) =>
    left.requestedTick - right.requestedTick ||
    left.executorEntityId - right.executorEntityId ||
    left.targetEntityId - right.targetEntityId);
  for (let index = 0; index < ordered.length; index += 1) {
    const intent = ordered[index]!;
    if (intent.requestedTick > tick) continue;
    const reason = intent.requestedTick < tick
      ? "staleIntent"
      : getIntentRejectionReason(
        world, lifecycle, presence, combatActions, eligibility, store,
        forced, intent, tick, options,
      );
    if (reason !== undefined) {
      buffers.rejectedIntentRecords.push({ ...intent, tick, reason });
    } else {
      const action: ActiveExecutionAction = {
        actionId: store.nextActionId,
        executorEntityId: intent.executorEntityId,
        targetEntityId: intent.targetEntityId,
        startedTick: tick,
        progressTicks: 0,
        lastProcessedTick: tick,
      };
      store.nextActionId += 1;
      addAction(store, action);
      incrementBounded(store.startedCountByEntity, intent.executorEntityId,
        "execution started count");
      buffers.startedRecords.push({ ...inspect(action), tick });
    }
    removePendingIntent(store, intent.executorEntityId);
  }
}

function getIntentRejectionReason(
  world: WorldState,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  combatActions: IndividualCombatActionStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  store: InternalExecutionActionStore,
  forced: Uint8Array,
  intent: IndividualExecutionIntent,
  tick: number,
  options: IndividualExecutionAdvanceOptions,
): IndividualExecutionIntentRejectionReason | undefined {
  const executor = intent.executorEntityId;
  const target = intent.targetEntityId;
  if (executor === target) return "selfTarget";
  if (store.actionIndexByExecutor[executor] !== NONE ||
    store.actionIndexByTarget[executor] !== NONE) return "executorBusy";
  if (store.actionIndexByExecutor[target] !== NONE ||
    store.actionIndexByTarget[target] !== NONE) return "targetBusy";
  if (!executorValid(lifecycle, presence, combatActions, eligibility, executor,
    options)) return "executorIneligible";
  if (intent.targetBasis === "explicitConsent") {
    return "consentingTargetHookUnavailable";
  }
  if (!targetValid(lifecycle, presence, target)) return "targetNotDying";
  if (store.attackAttemptTickByEntity[executor] === tick) return "executorAttack";
  if (store.acceptedHitTickByEntity[executor] === tick) return "executorAcceptedHit";
  if (store.acceptedHitTickByEntity[target] === tick) return "targetAcceptedHit";
  if (forced[executor] !== 0 || forced[target] !== 0) return "forcedSeparation";
  if (!withinRange(world, executor, target)) return "outOfRange";
  return undefined;
}

function getInterruptionReason(
  world: WorldState,
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  combatActions: IndividualCombatActionStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  store: InternalExecutionActionStore,
  forced: Uint8Array,
  action: ActiveExecutionAction,
  tick: number,
  options: IndividualExecutionAdvanceOptions,
): IndividualExecutionInterruptionReason | undefined {
  const executor = action.executorEntityId;
  const target = action.targetEntityId;
  if (store.attackAttemptTickByEntity[executor] === tick) return "executorAttack";
  if (store.acceptedHitTickByEntity[executor] === tick) return "executorAcceptedHit";
  if (store.acceptedHitTickByEntity[target] === tick) return "targetAcceptedHit";
  if (forced[executor] !== 0 || forced[target] !== 0) return "forcedSeparation";
  if (!withinRange(world, executor, target)) return "rangeLost";
  if (!executorValid(lifecycle, presence, combatActions, eligibility, executor,
    options)) return "executorIncapacity";
  return targetValid(lifecycle, presence, target) ? undefined : "targetInvalid";
}

function executorValid(
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  combatActions: IndividualCombatActionStore,
  eligibility: IndividualCombatEligibilitySnapshot,
  entityId: number,
  options: IndividualExecutionAdvanceOptions,
): boolean {
  return getIndividualCharacterLifecycleState(lifecycle, entityId) === "active" &&
    getIndividualPlayerPresenceState(presence, entityId) === "activePresence" &&
    getIndividualCombatActionState(combatActions, entityId) === "ready" &&
    isIndividualCombatEligible(eligibility, entityId) &&
    options.isExecutorOtherwiseCommitted?.(entityId) !== true;
}

function targetValid(
  lifecycle: IndividualCasualtyLifecycleStore,
  presence: IndividualPlayerPresenceStore,
  entityId: number,
): boolean {
  return getIndividualCharacterLifecycleState(lifecycle, entityId) === "dying" &&
    getIndividualPlayerPresenceState(presence, entityId) === "downedPresence";
}

function completeAction(
  world: WorldState,
  lifecycle: IndividualCasualtyLifecycleStore,
  deathCounts: IndividualDeathCountStore,
  store: InternalExecutionActionStore,
  action: ActiveExecutionAction,
  tick: number,
): IndividualTerminalTransitionRecord {
  transitionIndividualDyingToTerminal(
    lifecycle, action.targetEntityId, tick, "execution",
  );
  const transition: IndividualTerminalTransitionRecord = {
    entityId: action.targetEntityId,
    tick,
    previousLifecycleState: "dying",
    lifecycleState: "terminal",
    cause: "execution",
    terminalX: world.positionsX[action.targetEntityId]!,
    terminalY: world.positionsY[action.targetEntityId]!,
  };
  recordIndividualTerminalTransitionInCasualtyHistory(
    deathCounts, lifecycle, transition,
  );
  if (store.actionIndexByTarget[action.targetEntityId] === NONE) {
    throw new Error("Execution completion lost target ownership.");
  }
  return transition;
}

function prepareEvidence(
  store: InternalExecutionActionStore,
  attempts: readonly IndividualMeleeAttackAttemptRecord[],
  decisions: readonly IndividualLandedHitGateDecisionRecord[],
  tick: number,
): void {
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index]!;
    if (attempt.outcome !== "attempted") continue;
    assertEntityId(attempt.attackerEntityId, store.entityCount);
    store.attackAttemptTickByEntity[attempt.attackerEntityId] = tick;
  }
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index]!;
    if (decision.outcome !== "accepted") continue;
    assertEntityId(decision.targetEntityId, store.entityCount);
    store.acceptedHitTickByEntity[decision.targetEntityId] = tick;
  }
}

function prepareForcedSeparationEvidence(
  store: InternalExecutionActionStore,
  entityIds: readonly number[] | undefined,
): Uint8Array {
  const forced = store.forcedSeparationScratch;
  for (let index = 0; index < store.forcedSeparationTouched.length; index += 1) {
    forced[store.forcedSeparationTouched[index]!] = 0;
  }
  store.forcedSeparationTouched.length = 0;
  if (entityIds === undefined) return forced;
  for (let index = 0; index < entityIds.length; index += 1) {
    const entityId = entityIds[index]!;
    assertEntityId(entityId, store.entityCount);
    if (forced[entityId] !== 0) continue;
    forced[entityId] = 1;
    store.forcedSeparationTouched.push(entityId);
  }
  return forced;
}

function withinRange(world: WorldState, left: number, right: number): boolean {
  const dx = world.positionsX[left]! - world.positionsX[right]!;
  const dy = world.positionsY[left]! - world.positionsY[right]!;
  return dx * dx + dy * dy <= INDIVIDUAL_EXECUTION_RANGE * INDIVIDUAL_EXECUTION_RANGE;
}

function addAction(
  store: InternalExecutionActionStore,
  action: ActiveExecutionAction,
): void {
  if (action.executorEntityId === action.targetEntityId ||
    store.actionIndexByExecutor[action.executorEntityId] !== NONE ||
    store.actionIndexByTarget[action.executorEntityId] !== NONE ||
    store.actionIndexByExecutor[action.targetEntityId] !== NONE ||
    store.actionIndexByTarget[action.targetEntityId] !== NONE) {
    throw new Error("An entity may participate in at most one execution action.");
  }
  const index = store.activeActions.length;
  store.activeActions.push(action);
  store.actionIndexByExecutor[action.executorEntityId] = index;
  store.actionIndexByTarget[action.targetEntityId] = index;
}

function removeAction(store: InternalExecutionActionStore, index: number): void {
  const removed = store.activeActions[index]!;
  const lastIndex = store.activeActions.length - 1;
  const last = store.activeActions[lastIndex]!;
  store.actionIndexByExecutor[removed.executorEntityId] = NONE;
  store.actionIndexByTarget[removed.targetEntityId] = NONE;
  store.activeActions.pop();
  if (index === lastIndex) return;
  store.activeActions[index] = last;
  store.actionIndexByExecutor[last.executorEntityId] = index;
  store.actionIndexByTarget[last.targetEntityId] = index;
}

function removePendingIntent(
  store: InternalExecutionActionStore,
  executorEntityId: number,
): void {
  const index = store.pendingIntentIndexByExecutor[executorEntityId]!;
  if (index === NONE) throw new Error("Pending execution intent ownership was lost.");
  const lastIndex = store.pendingIntents.length - 1;
  const last = store.pendingIntents[lastIndex]!;
  store.pendingIntentIndexByExecutor[executorEntityId] = NONE;
  store.pendingIntents.pop();
  if (index === lastIndex) return;
  store.pendingIntents[index] = last;
  store.pendingIntentIndexByExecutor[last.executorEntityId] = index;
}

function inspect(action: ActiveExecutionAction): IndividualExecutionActionInspection {
  return {
    actionId: action.actionId,
    executorEntityId: action.executorEntityId,
    targetEntityId: action.targetEntityId,
    startedTick: action.startedTick,
    progressTicks: action.progressTicks,
    requiredProgressTicks: INDIVIDUAL_EXECUTION_PROGRESS_TICKS,
  };
}

function resetBuffers(buffers: IndividualExecutionActionBuffers): void {
  buffers.startedRecords.length = 0;
  buffers.interruptedRecords.length = 0;
  buffers.completedRecords.length = 0;
  buffers.rejectedIntentRecords.length = 0;
  buffers.terminalTransitions.length = 0;
}

function sortBuffers(buffers: IndividualExecutionActionBuffers): void {
  buffers.startedRecords.sort((left, right) =>
    left.executorEntityId - right.executorEntityId || left.actionId - right.actionId);
  buffers.interruptedRecords.sort((left, right) =>
    left.executorEntityId - right.executorEntityId || left.actionId - right.actionId);
  buffers.completedRecords.sort((left, right) =>
    left.executorEntityId - right.executorEntityId || left.actionId - right.actionId);
  buffers.rejectedIntentRecords.sort((left, right) =>
    left.executorEntityId - right.executorEntityId ||
    left.targetEntityId - right.targetEntityId);
  buffers.terminalTransitions.sort((left, right) => left.entityId - right.entityId);
}

function asInternal(store: IndividualExecutionActionStore): InternalExecutionActionStore {
  return store as InternalExecutionActionStore;
}

function incrementBounded(array: Uint32Array, entityId: number, label: string): void {
  const current = array[entityId]!;
  if (current === 0xffffffff) throw new RangeError(`${label} overflow.`);
  array[entityId] = current + 1;
}

function validateCounts(
  entityCount: number,
  ...stores: readonly { readonly entityCount: number }[]
): void {
  for (const store of stores) {
    if (store.entityCount !== entityCount) {
      throw new RangeError("Execution action dependencies must match entity count.");
    }
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Execution action entity ID is out of bounds.");
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
