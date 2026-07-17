import { CASUALTY_DRAG_PICKUP_RANGE } from "./individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  transitionIndividualDyingToTerminal,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";
import type { IndividualMeleeAttackAttemptRecord } from "./individualCombatAction";
import {
  recordIndividualExecutionTerminal,
  type IndividualDeathCountStore,
} from "./individualDeathCount";
import type { IndividualLandedHitGateDecisionRecord } from "./individualLandedHitGate";
import type { IndividualDefenceHandAvailabilitySource } from "./individualMeleeDefence";
import { setIndividualOrdinaryParticipationEligible, type IndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import type { WorldState } from "./types";

export const INDIVIDUAL_EXECUTION_COMMITMENT_TICKS = 100;
export const INDIVIDUAL_EXECUTION_RANGE = CASUALTY_DRAG_PICKUP_RANGE;

export interface IndividualExecutionIntent {
  readonly executorEntityId: number;
  readonly targetEntityId: number;
  readonly requestedTick: number;
}
interface ActiveExecutionAction {
  readonly actionId: number;
  readonly executorEntityId: number;
  readonly targetEntityId: number;
  readonly startedTick: number;
  progressTicks: number;
  lastProcessedTick: number;
}
export interface IndividualExecutionActionStore { readonly entityCount: number; }
interface InternalExecutionStore extends IndividualExecutionActionStore {
  readonly activeActions: ActiveExecutionAction[];
  readonly actionIndexByExecutor: Int32Array;
  readonly actionIndexByTarget: Int32Array;
  readonly pendingIntents: IndividualExecutionIntent[];
  readonly startedCountByExecutor: Uint32Array;
  readonly interruptedCountByExecutor: Uint32Array;
  readonly completedCountByExecutor: Uint32Array;
  nextActionId: number;
}
export interface IndividualExecutionActionInspection {
  readonly actionId: number;
  readonly executorEntityId: number;
  readonly targetEntityId: number;
  readonly startedTick: number;
  readonly progressTicks: number;
  readonly requiredProgressTicks: 100;
}
export type IndividualExecutionInterruptionReason =
  | "executorAttackAttempt" | "executorAcceptedHit" | "targetAcceptedHit"
  | "rangeLost" | "executorIncapacity" | "targetInvalid";
export interface IndividualExecutionStartedRecord extends IndividualExecutionActionInspection { readonly tick: number; }
export interface IndividualExecutionInterruptedRecord extends IndividualExecutionActionInspection { readonly tick: number; readonly reason: IndividualExecutionInterruptionReason; }
export interface IndividualExecutionCompletedRecord extends IndividualExecutionActionInspection { readonly tick: number; readonly terminalX: number; readonly terminalY: number; readonly cause: "execution"; }
export interface IndividualExecutionActionBuffers { readonly startedRecords: IndividualExecutionStartedRecord[]; readonly interruptedRecords: IndividualExecutionInterruptedRecord[]; readonly completedRecords: IndividualExecutionCompletedRecord[]; }
export interface IndividualExecutionActionResult { readonly startedRecords: readonly IndividualExecutionStartedRecord[]; readonly interruptedRecords: readonly IndividualExecutionInterruptedRecord[]; readonly completedRecords: readonly IndividualExecutionCompletedRecord[]; readonly activeActionCount: number; }
export interface IndividualExecutionEligibilityOptions {
  /** Reserved explicit consenting-target hook; ordinary active targets remain ineligible by default. */
  readonly isExplicitConsentingTarget?: (executorEntityId: number, targetEntityId: number) => boolean;
  /** Production-owned availability across routing, medicine, rescue, and ordinary participation. */
  readonly isExecutorAvailable?: (executorEntityId: number) => boolean;
  /** Narrow integration boundary for invalidating treatment after terminalisation. */
  readonly onTargetTerminalized?: (targetEntityId: number, tick: number) => void;
}

export function createIndividualExecutionActionStore(entityCount: number): IndividualExecutionActionStore {
  assertPositive(entityCount, "entityCount");
  const executor = new Int32Array(entityCount); executor.fill(-1);
  const target = new Int32Array(entityCount); target.fill(-1);
  return { entityCount, activeActions: [], actionIndexByExecutor: executor, actionIndexByTarget: target,
    pendingIntents: [], startedCountByExecutor: new Uint32Array(entityCount), interruptedCountByExecutor: new Uint32Array(entityCount), completedCountByExecutor: new Uint32Array(entityCount), nextActionId: 0 } as InternalExecutionStore;
}
export function createIndividualExecutionActionBuffers(): IndividualExecutionActionBuffers { return { startedRecords: [], interruptedRecords: [], completedRecords: [] }; }
export function submitIndividualExecutionIntent(store: IndividualExecutionActionStore, intent: IndividualExecutionIntent): void {
  const internal = asInternal(store); assertEntity(intent.executorEntityId, internal.entityCount); assertEntity(intent.targetEntityId, internal.entityCount); assertTick(intent.requestedTick);
  if (intent.executorEntityId === intent.targetEntityId) throw new RangeError("Execution executor and target must differ.");
  internal.pendingIntents.push({ ...intent });
}
export function getIndividualExecutionActionInspection(store: IndividualExecutionActionStore, executorEntityId: number): IndividualExecutionActionInspection | undefined {
  const internal = asInternal(store); assertEntity(executorEntityId, internal.entityCount);
  const index = internal.actionIndexByExecutor[executorEntityId]!; return index < 0 ? undefined : inspection(internal.activeActions[index]!);
}
export function hasActiveIndividualExecutionAction(store: IndividualExecutionActionStore, entityId: number): boolean {
  const internal = asInternal(store); assertEntity(entityId, internal.entityCount); return internal.actionIndexByExecutor[entityId]! >= 0;
}
export function projectIndividualExecutionOrdinaryParticipation(
  store: IndividualExecutionActionStore,
  snapshot: IndividualOrdinaryParticipationSnapshot,
): void {
  const internal = asInternal(store);
  validateCounts(internal.entityCount, snapshot);
  for (let index = 0; index < internal.activeActions.length; index += 1) {
    setIndividualOrdinaryParticipationEligible(
      snapshot,
      internal.activeActions[index]!.executorEntityId,
      false,
    );
  }
}
export function getIndividualExecutionDefenceHandAvailability(
  store: IndividualExecutionActionStore,
): IndividualDefenceHandAvailabilitySource {
  const internal = asInternal(store);
  return {
    entityCount: internal.entityCount,
    getFreeHands(entityId: number): number | undefined {
      assertEntity(entityId, internal.entityCount);
      return internal.actionIndexByExecutor[entityId]! < 0 ? undefined : 2;
    },
  };
}
export function advanceIndividualExecutionActionsOneTick(
  world: WorldState, lifecycle: IndividualCasualtyLifecycleStore, deathCounts: IndividualDeathCountStore,
  store: IndividualExecutionActionStore, tick: number,
  attackAttempts: readonly IndividualMeleeAttackAttemptRecord[], gateDecisions: readonly IndividualLandedHitGateDecisionRecord[],
  buffers: IndividualExecutionActionBuffers, options: IndividualExecutionEligibilityOptions = {},
): IndividualExecutionActionResult {
  const internal = asInternal(store); validateCounts(world.entityCount, lifecycle, deathCounts, internal); assertTick(tick);
  buffers.startedRecords.length = 0; buffers.interruptedRecords.length = 0; buffers.completedRecords.length = 0;
  internal.activeActions.sort((a, b) => a.executorEntityId - b.executorEntityId || a.targetEntityId - b.targetEntityId);
  rebuildIndexes(internal);
  for (let index = 0; index < internal.activeActions.length;) {
    const action = internal.activeActions[index]!;
    if (tick <= action.startedTick || tick === action.lastProcessedTick) { index += 1; continue; }
    if (tick < action.lastProcessedTick) throw new RangeError("Execution ticks cannot move backwards.");
    const reason = interruptionReason(world, lifecycle, action, attackAttempts, gateDecisions);
    if (reason !== undefined) {
      buffers.interruptedRecords.push({ ...inspection(action), tick, reason });
      internal.interruptedCountByExecutor[action.executorEntityId] = internal.interruptedCountByExecutor[action.executorEntityId]! + 1;
      removeAction(internal, index); continue;
    }
    action.progressTicks += 1; action.lastProcessedTick = tick;
    if (action.progressTicks === INDIVIDUAL_EXECUTION_COMMITMENT_TICKS) {
      const terminalX = world.positionsX[action.targetEntityId]!, terminalY = world.positionsY[action.targetEntityId]!;
      transitionIndividualDyingToTerminal(lifecycle, action.targetEntityId, tick, "execution");
      options.onTargetTerminalized?.(action.targetEntityId, tick);
      recordIndividualExecutionTerminal(deathCounts, action.targetEntityId, tick, terminalX, terminalY);
      buffers.completedRecords.push({ ...inspection(action), tick, terminalX, terminalY, cause: "execution" });
      internal.completedCountByExecutor[action.executorEntityId] = internal.completedCountByExecutor[action.executorEntityId]! + 1;
      removeAction(internal, index); continue;
    }
    index += 1;
  }
  internal.pendingIntents.sort((a, b) => a.requestedTick - b.requestedTick || a.executorEntityId - b.executorEntityId || a.targetEntityId - b.targetEntityId);
  let write = 0;
  for (let index = 0; index < internal.pendingIntents.length; index += 1) {
    const intent = internal.pendingIntents[index]!;
    if (intent.requestedTick > tick) { internal.pendingIntents[write++] = intent; continue; }
    if (!canStart(world, lifecycle, internal, intent, attackAttempts, gateDecisions, options)) continue;
    const action: ActiveExecutionAction = { actionId: internal.nextActionId++, executorEntityId: intent.executorEntityId, targetEntityId: intent.targetEntityId, startedTick: tick, progressTicks: 0, lastProcessedTick: tick };
    internal.activeActions.push(action); rebuildIndexes(internal);
    internal.startedCountByExecutor[action.executorEntityId] = internal.startedCountByExecutor[action.executorEntityId]! + 1;
    buffers.startedRecords.push({ ...inspection(action), tick });
  }
  internal.pendingIntents.length = write;
  buffers.startedRecords.sort(compareRecords); buffers.interruptedRecords.sort(compareRecords); buffers.completedRecords.sort(compareRecords);
  return { startedRecords: buffers.startedRecords, interruptedRecords: buffers.interruptedRecords, completedRecords: buffers.completedRecords, activeActionCount: internal.activeActions.length };
}

function canStart(world: WorldState, lifecycle: IndividualCasualtyLifecycleStore, store: InternalExecutionStore, intent: IndividualExecutionIntent, attacks: readonly IndividualMeleeAttackAttemptRecord[], gates: readonly IndividualLandedHitGateDecisionRecord[], options: IndividualExecutionEligibilityOptions): boolean {
  if (store.actionIndexByExecutor[intent.executorEntityId]! >= 0 || store.actionIndexByTarget[intent.targetEntityId]! >= 0 || getIndividualCharacterLifecycleState(lifecycle, intent.executorEntityId) !== "active") return false;
  if (options.isExecutorAvailable?.(intent.executorEntityId) === false) return false;
  for (const attack of attacks) {
    if (attack.attackerEntityId === intent.executorEntityId && attack.outcome === "attempted") return false;
  }
  for (const gate of gates) {
    if (gate.targetEntityId === intent.executorEntityId && gate.outcome === "accepted") return false;
  }
  const targetState = getIndividualCharacterLifecycleState(lifecycle, intent.targetEntityId);
  // The hook is reserved for a later lifecycle authority that can represent
  // consenting active targets; 6H-1 starts only against dying targets.
  void options.isExplicitConsentingTarget;
  if (targetState !== "dying") return false;
  return inRange(world, intent.executorEntityId, intent.targetEntityId);
}
function interruptionReason(world: WorldState, lifecycle: IndividualCasualtyLifecycleStore, action: ActiveExecutionAction, attacks: readonly IndividualMeleeAttackAttemptRecord[], gates: readonly IndividualLandedHitGateDecisionRecord[]): IndividualExecutionInterruptionReason | undefined {
  if (getIndividualCharacterLifecycleState(lifecycle, action.executorEntityId) !== "active") return "executorIncapacity";
  if (getIndividualCharacterLifecycleState(lifecycle, action.targetEntityId) !== "dying") return "targetInvalid";
  for (const attack of attacks) if (attack.attackerEntityId === action.executorEntityId) return "executorAttackAttempt";
  for (const gate of gates) if (gate.outcome === "accepted") { if (gate.targetEntityId === action.executorEntityId) return "executorAcceptedHit"; if (gate.targetEntityId === action.targetEntityId) return "targetAcceptedHit"; }
  if (!inRange(world, action.executorEntityId, action.targetEntityId)) return "rangeLost";
  return undefined;
}
function inRange(world: WorldState, a: number, b: number): boolean { const dx = world.positionsX[a]! - world.positionsX[b]!; const dy = world.positionsY[a]! - world.positionsY[b]!; return dx * dx + dy * dy <= INDIVIDUAL_EXECUTION_RANGE * INDIVIDUAL_EXECUTION_RANGE; }
function inspection(action: ActiveExecutionAction): IndividualExecutionActionInspection { return { actionId: action.actionId, executorEntityId: action.executorEntityId, targetEntityId: action.targetEntityId, startedTick: action.startedTick, progressTicks: action.progressTicks, requiredProgressTicks: 100 }; }
function removeAction(store: InternalExecutionStore, index: number): void { store.activeActions.splice(index, 1); rebuildIndexes(store); }
function rebuildIndexes(store: InternalExecutionStore): void { store.actionIndexByExecutor.fill(-1); store.actionIndexByTarget.fill(-1); for (let i = 0; i < store.activeActions.length; i += 1) { const action = store.activeActions[i]!; store.actionIndexByExecutor[action.executorEntityId] = i; store.actionIndexByTarget[action.targetEntityId] = i; } }
function compareRecords(a: { readonly executorEntityId: number; readonly targetEntityId: number }, b: { readonly executorEntityId: number; readonly targetEntityId: number }): number { return a.executorEntityId - b.executorEntityId || a.targetEntityId - b.targetEntityId; }
function asInternal(store: IndividualExecutionActionStore): InternalExecutionStore { return store as InternalExecutionStore; }
function validateCounts(count: number, ...stores: readonly { readonly entityCount: number }[]): void { for (const store of stores) if (store.entityCount !== count) throw new RangeError("Execution dependencies must share entityCount."); }
function assertEntity(value: number, count: number): void { if (!Number.isSafeInteger(value) || value < 0 || value >= count) throw new RangeError("Execution entity ID out of bounds."); }
function assertTick(value: number): void { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Execution tick must be a non-negative safe integer."); }
function assertPositive(value: number, name: string): void { if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive safe integer.`); }
