import {
  getIndividualCasualtyProcedureProfile,
  type CasualtyProcedureKind,
  type IndividualCasualtyProcedureProfileStore,
} from "./individualCasualtyProcedureProfile";
import type { IndividualZeroHitEvent } from "./individualGlobalHits";

export type CharacterLifecycleState = "active" | "dying" | "terminal";
export type TerminalCause = "none" | "deathCountExpired" | "execution";

export interface IndividualCasualtyLifecycleStore {
  readonly entityCount: number;
}

interface InternalIndividualCasualtyLifecycleStore
  extends IndividualCasualtyLifecycleStore {
  readonly stateByEntity: Uint8Array;
  readonly enteredDyingTickByEntity: Float64Array;
  readonly terminalTickByEntity: Float64Array;
  readonly terminalCauseByEntity: Uint8Array;
  readonly downXByEntity: Int32Array;
  readonly downYByEntity: Int32Array;
  readonly zeroHitCandidatePresentByEntity: Uint8Array;
  readonly zeroHitCandidateAttackerByEntity: Float64Array;
  readonly zeroHitCandidatePreviousHitsByEntity: Float64Array;
}

const LIFECYCLE_STATES = ["active", "dying", "terminal"] as const;
const TERMINAL_CAUSES = ["none", "deathCountExpired", "execution"] as const;

export function createIndividualCasualtyLifecycleStore(
  entityCount: number,
): IndividualCasualtyLifecycleStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const enteredDyingTickByEntity = new Float64Array(entityCount);
  const terminalTickByEntity = new Float64Array(entityCount);
  enteredDyingTickByEntity.fill(-1);
  terminalTickByEntity.fill(-1);
  return {
    entityCount,
    stateByEntity: new Uint8Array(entityCount),
    enteredDyingTickByEntity,
    terminalTickByEntity,
    terminalCauseByEntity: new Uint8Array(entityCount),
    downXByEntity: new Int32Array(entityCount),
    downYByEntity: new Int32Array(entityCount),
    zeroHitCandidatePresentByEntity: new Uint8Array(entityCount),
    zeroHitCandidateAttackerByEntity: new Float64Array(entityCount),
    zeroHitCandidatePreviousHitsByEntity: new Float64Array(entityCount),
  } as InternalIndividualCasualtyLifecycleStore;
}

export function getIndividualCharacterLifecycleState(
  store: IndividualCasualtyLifecycleStore,
  entityId: number,
): CharacterLifecycleState {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Casualty lifecycle");
  return LIFECYCLE_STATES[internal.stateByEntity[entityId]!]!;
}

export function getIndividualEnteredDyingTick(
  store: IndividualCasualtyLifecycleStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Casualty lifecycle");
  return internal.enteredDyingTickByEntity[entityId]!;
}

export interface IndividualDownPosition {
  readonly x: number;
  readonly y: number;
}

export function getIndividualDownPosition(
  store: IndividualCasualtyLifecycleStore,
  entityId: number,
): IndividualDownPosition | undefined {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Casualty lifecycle");
  if (internal.stateByEntity[entityId] === 0) return undefined;
  return {
    x: internal.downXByEntity[entityId]!,
    y: internal.downYByEntity[entityId]!,
  };
}

export function getIndividualTerminalTick(
  store: IndividualCasualtyLifecycleStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Casualty lifecycle");
  return internal.terminalTickByEntity[entityId]!;
}

export function getIndividualTerminalCause(
  store: IndividualCasualtyLifecycleStore,
  entityId: number,
): TerminalCause {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Casualty lifecycle");
  return TERMINAL_CAUSES[internal.terminalCauseByEntity[entityId]!]!;
}

export type PlayerPresenceState =
  | "activePresence"
  | "downedPresence"
  | "terminalAwaitingComfort"
  | "terminalComforted"
  | "respawnEgress"
  | "waitingAtRespawn"
  | "removedFromBattlefield";

export interface IndividualPlayerPresenceStore {
  readonly entityCount: number;
}

interface InternalIndividualPlayerPresenceStore
  extends IndividualPlayerPresenceStore {
  readonly stateByEntity: Uint8Array;
  readonly lastTransitionTickByEntity: Float64Array;
}

const PRESENCE_STATES = [
  "activePresence",
  "downedPresence",
  "terminalAwaitingComfort",
  "terminalComforted",
  "respawnEgress",
  "waitingAtRespawn",
  "removedFromBattlefield",
] as const;

export function createIndividualPlayerPresenceStore(
  entityCount: number,
): IndividualPlayerPresenceStore {
  assertPositiveSafeInteger(entityCount, "entityCount");
  const lastTransitionTickByEntity = new Float64Array(entityCount);
  lastTransitionTickByEntity.fill(-1);
  return {
    entityCount,
    stateByEntity: new Uint8Array(entityCount),
    lastTransitionTickByEntity,
  } as InternalIndividualPlayerPresenceStore;
}

export function getIndividualPlayerPresenceState(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): PlayerPresenceState {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Player presence");
  return PRESENCE_STATES[internal.stateByEntity[entityId]!]!;
}

export function getIndividualPlayerPresenceTransitionTick(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): number {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Player presence");
  return internal.lastTransitionTickByEntity[entityId]!;
}

export interface CasualtyPositionSource {
  readonly entityCount: number;
  readonly positionsX: Int32Array;
  readonly positionsY: Int32Array;
}

export interface IndividualZeroHitLifecycleTransitionRecord {
  readonly entityId: number;
  readonly attackerEntityId: number;
  readonly tick: number;
  readonly previousHits: number;
  readonly procedureKind: CasualtyProcedureKind;
  readonly previousLifecycleState: "active";
  readonly lifecycleState: "dying";
  readonly previousPresenceState: "activePresence";
  readonly presenceState: "downedPresence";
  readonly downX: number;
  readonly downY: number;
}

export interface IndividualZeroHitLifecycleTransitionResult {
  readonly transitions: readonly IndividualZeroHitLifecycleTransitionRecord[];
  readonly transitionCount: number;
}

export function applyIndividualZeroHitLifecycleTransitions(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  presenceStore: IndividualPlayerPresenceStore,
  procedureStore: IndividualCasualtyProcedureProfileStore,
  positions: CasualtyPositionSource,
  zeroHitEvents: readonly IndividualZeroHitEvent[],
  tick: number,
  transitionsOut: IndividualZeroHitLifecycleTransitionRecord[] = [],
): IndividualZeroHitLifecycleTransitionResult {
  const lifecycle = asInternal(lifecycleStore);
  const presence = asInternalPresence(presenceStore);
  validateMatchingCounts(lifecycle, presence, procedureStore, positions);
  assertNonNegativeSafeInteger(tick, "tick");
  transitionsOut.length = 0;

  // Validate before staging candidates so an invalid event cannot leave scratch
  // state behind for a later call.
  for (let index = 0; index < zeroHitEvents.length; index += 1) {
    const event = zeroHitEvents[index]!;
    assertEntityId(event.entityId, lifecycle.entityCount, "Zero-hit target");
    assertEntityId(
      event.attackerEntityId,
      lifecycle.entityCount,
      "Zero-hit attacker",
    );
    assertPositiveSafeInteger(event.previousHits, "previousHits");
  }

  for (let index = 0; index < zeroHitEvents.length; index += 1) {
    const event = zeroHitEvents[index]!;
    if (lifecycle.stateByEntity[event.entityId] !== 0) continue;
    const hasCandidate =
      lifecycle.zeroHitCandidatePresentByEntity[event.entityId] !== 0;
    const candidateAttacker =
      lifecycle.zeroHitCandidateAttackerByEntity[event.entityId]!;
    const candidatePreviousHits =
      lifecycle.zeroHitCandidatePreviousHitsByEntity[event.entityId]!;
    if (
      !hasCandidate ||
      event.attackerEntityId < candidateAttacker ||
      (event.attackerEntityId === candidateAttacker &&
        event.previousHits < candidatePreviousHits)
    ) {
      lifecycle.zeroHitCandidatePresentByEntity[event.entityId] = 1;
      lifecycle.zeroHitCandidateAttackerByEntity[event.entityId] =
        event.attackerEntityId;
      lifecycle.zeroHitCandidatePreviousHitsByEntity[event.entityId] =
        event.previousHits;
    }
  }

  for (let entityId = 0; entityId < lifecycle.entityCount; entityId += 1) {
    if (lifecycle.zeroHitCandidatePresentByEntity[entityId] === 0) continue;
    if (presence.stateByEntity[entityId] !== 0) {
      throw new Error(
        "Active casualty lifecycle requires active player presence before a zero-hit transition.",
      );
    }
  }

  for (let entityId = 0; entityId < lifecycle.entityCount; entityId += 1) {
    if (lifecycle.zeroHitCandidatePresentByEntity[entityId] === 0) continue;
    lifecycle.zeroHitCandidatePresentByEntity[entityId] = 0;
    const attackerEntityId =
      lifecycle.zeroHitCandidateAttackerByEntity[entityId]!;
    const previousHits =
      lifecycle.zeroHitCandidatePreviousHitsByEntity[entityId]!;
    const downX = positions.positionsX[entityId];
    const downY = positions.positionsY[entityId];
    if (downX === undefined || downY === undefined) {
      throw new RangeError("Casualty position is missing for zero-hit target.");
    }
    const profile = getIndividualCasualtyProcedureProfile(
      procedureStore,
      entityId,
    );
    lifecycle.stateByEntity[entityId] = 1;
    lifecycle.enteredDyingTickByEntity[entityId] = tick;
    lifecycle.downXByEntity[entityId] = downX;
    lifecycle.downYByEntity[entityId] = downY;
    presence.stateByEntity[entityId] = 1;
    presence.lastTransitionTickByEntity[entityId] = tick;
    transitionsOut.push({
      entityId,
      attackerEntityId,
      tick,
      previousHits,
      procedureKind: profile.procedureKind,
      previousLifecycleState: "active",
      lifecycleState: "dying",
      previousPresenceState: "activePresence",
      presenceState: "downedPresence",
      downX,
      downY,
    });
  }

  return { transitions: transitionsOut, transitionCount: transitionsOut.length };
}

function validateMatchingCounts(
  lifecycle: InternalIndividualCasualtyLifecycleStore,
  presence: InternalIndividualPlayerPresenceStore,
  procedure: IndividualCasualtyProcedureProfileStore,
  positions: CasualtyPositionSource,
): void {
  if (
    lifecycle.entityCount !== presence.entityCount ||
    lifecycle.entityCount !== procedure.entityCount ||
    lifecycle.entityCount !== positions.entityCount ||
    positions.positionsX.length !== positions.entityCount ||
    positions.positionsY.length !== positions.entityCount
  ) {
    throw new RangeError(
      "Casualty lifecycle inputs must have matching entity counts and position storage.",
    );
  }
}

function asInternal(
  store: IndividualCasualtyLifecycleStore,
): InternalIndividualCasualtyLifecycleStore {
  return store as InternalIndividualCasualtyLifecycleStore;
}

function asInternalPresence(
  store: IndividualPlayerPresenceStore,
): InternalIndividualPlayerPresenceStore {
  return store as InternalIndividualPlayerPresenceStore;
}

function assertEntityId(
  entityId: number,
  entityCount: number,
  label: string,
): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError(`${label} entity ID is out of bounds.`);
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
