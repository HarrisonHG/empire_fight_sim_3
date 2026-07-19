import {
  getIndividualCasualtyProcedureProfile,
  type CasualtyProcedureKind,
  type IndividualCasualtyProcedureProfileStore,
} from "./individualCasualtyProcedureProfile";
import type { IndividualZeroHitEvent } from "./individualGlobalHits";

export type CharacterLifecycleState = "active" | "dying" | "terminal";
export type TerminalCause = "none" | "deathCountExpired" | "execution";

export interface IndividualTerminalTransitionRecord {
  readonly entityId: number;
  readonly tick: number;
  readonly previousLifecycleState: "dying";
  readonly lifecycleState: "terminal";
  readonly cause: Exclude<TerminalCause, "none">;
  readonly terminalX: number;
  readonly terminalY: number;
}

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

export function isIndividualCharacterActive(
  store: IndividualCasualtyLifecycleStore,
  entityId: number,
): boolean {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Casualty lifecycle");
  return internal.stateByEntity[entityId] === 0;
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

export function transitionIndividualDyingToTerminal(
  store: IndividualCasualtyLifecycleStore,
  entityId: number,
  tick: number,
  cause: Exclude<TerminalCause, "none">,
): void {
  const internal = asInternal(store);
  assertEntityId(entityId, internal.entityCount, "Casualty lifecycle");
  assertNonNegativeSafeInteger(tick, "tick");
  if (internal.stateByEntity[entityId] !== 1) {
    throw new Error("Only a dying character may transition to terminal.");
  }
  if (cause !== "deathCountExpired" && cause !== "execution") {
    throw new RangeError("Terminal transition requires a terminal cause.");
  }
  internal.stateByEntity[entityId] = 2;
  internal.terminalTickByEntity[entityId] = tick;
  internal.terminalCauseByEntity[entityId] =
    cause === "deathCountExpired" ? 1 : 2;
}

export interface IndividualDyingRestorationRecord {
  readonly entityId: number;
  readonly tick: number;
  readonly previousLifecycleState: "dying";
  readonly lifecycleState: "active";
  readonly previousPresenceState: "downedPresence";
  readonly presenceState: "activePresence";
}

export function transitionIndividualDyingToActive(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  presenceStore: IndividualPlayerPresenceStore,
  entityId: number,
  tick: number,
): IndividualDyingRestorationRecord {
  const lifecycle = asInternal(lifecycleStore);
  const presence = asInternalPresence(presenceStore);
  if (lifecycle.entityCount !== presence.entityCount) {
    throw new RangeError("Restored lifecycle and presence stores must match entity count.");
  }
  assertEntityId(entityId, lifecycle.entityCount, "Casualty restoration");
  assertNonNegativeSafeInteger(tick, "tick");
  if (lifecycle.stateByEntity[entityId] !== 1) {
    throw new Error("Only a dying character may be restored to active.");
  }
  if (presence.stateByEntity[entityId] !== 1) {
    throw new Error("Dying restoration requires downed player presence.");
  }
  lifecycle.stateByEntity[entityId] = 0;
  presence.stateByEntity[entityId] = 0;
  presence.lastTransitionTickByEntity[entityId] = tick;
  return {
    entityId,
    tick,
    previousLifecycleState: "dying",
    lifecycleState: "active",
    previousPresenceState: "downedPresence",
    presenceState: "activePresence",
  };
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

export interface IndividualRespawnDestination {
  readonly x: number;
  readonly y: number;
}

export interface IndividualPlayerPresenceProcedureConfig {
  readonly entityId: number;
  readonly procedureKind: CasualtyProcedureKind;
  readonly respawnDestination?: IndividualRespawnDestination;
}

export interface IndividualPlayerPresenceStoreConfig {
  readonly entityCount: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly procedures: readonly IndividualPlayerPresenceProcedureConfig[];
}

interface InternalIndividualPlayerPresenceStore
  extends IndividualPlayerPresenceStore {
  readonly stateByEntity: Uint8Array;
  readonly lastTransitionTickByEntity: Float64Array;
  readonly barbarianProcedureByEntity: Uint8Array;
  readonly respawnDestinationPresentByEntity: Uint8Array;
  readonly respawnDestinationXByEntity: Int32Array;
  readonly respawnDestinationYByEntity: Int32Array;
  readonly respawnEgressStartedTickByEntity: Float64Array;
  readonly waitingAtRespawnArrivalTickByEntity: Float64Array;
  readonly waitingAtRespawnArrivalXByEntity: Int32Array;
  readonly waitingAtRespawnArrivalYByEntity: Int32Array;
  readonly respawnEgressMovementCountByEntity: Uint32Array;
  readonly activeRespawnEgressEntityIds: number[];
  readonly activeRespawnEgressIndexByEntity: Int32Array;
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
  configOrEntityCount: number | IndividualPlayerPresenceStoreConfig,
): IndividualPlayerPresenceStore {
  const entityCount = typeof configOrEntityCount === "number"
    ? configOrEntityCount
    : configOrEntityCount.entityCount;
  assertPositiveSafeInteger(entityCount, "entityCount");
  const lastTransitionTickByEntity = new Float64Array(entityCount);
  const respawnEgressStartedTickByEntity = new Float64Array(entityCount);
  const waitingAtRespawnArrivalTickByEntity = new Float64Array(entityCount);
  const activeRespawnEgressIndexByEntity = new Int32Array(entityCount);
  lastTransitionTickByEntity.fill(-1);
  respawnEgressStartedTickByEntity.fill(-1);
  waitingAtRespawnArrivalTickByEntity.fill(-1);
  activeRespawnEgressIndexByEntity.fill(-1);
  const store = {
    entityCount,
    stateByEntity: new Uint8Array(entityCount),
    lastTransitionTickByEntity,
    barbarianProcedureByEntity: new Uint8Array(entityCount),
    respawnDestinationPresentByEntity: new Uint8Array(entityCount),
    respawnDestinationXByEntity: new Int32Array(entityCount),
    respawnDestinationYByEntity: new Int32Array(entityCount),
    respawnEgressStartedTickByEntity,
    waitingAtRespawnArrivalTickByEntity,
    waitingAtRespawnArrivalXByEntity: new Int32Array(entityCount),
    waitingAtRespawnArrivalYByEntity: new Int32Array(entityCount),
    respawnEgressMovementCountByEntity: new Uint32Array(entityCount),
    activeRespawnEgressEntityIds: [],
    activeRespawnEgressIndexByEntity,
  } as InternalIndividualPlayerPresenceStore;
  if (typeof configOrEntityCount !== "number") {
    configureIndividualPlayerPresenceProcedures(store, configOrEntityCount);
  }
  return store;
}

function configureIndividualPlayerPresenceProcedures(
  store: InternalIndividualPlayerPresenceStore,
  config: IndividualPlayerPresenceStoreConfig,
): void {
  assertPositiveSafeInteger(config.worldWidth, "worldWidth");
  assertPositiveSafeInteger(config.worldHeight, "worldHeight");
  if (config.procedures.length !== store.entityCount) {
    throw new RangeError("Player-presence procedures must configure every entity exactly once.");
  }
  const configured = new Uint8Array(store.entityCount);
  for (const procedure of config.procedures) {
    assertEntityId(procedure.entityId, store.entityCount, "Player-presence procedure");
    if (configured[procedure.entityId] !== 0) {
      throw new RangeError("Player-presence procedure entity IDs must be unique.");
    }
    configured[procedure.entityId] = 1;
    if (procedure.procedureKind === "citizen") {
      if (procedure.respawnDestination !== undefined) {
        throw new RangeError("Citizen casualty procedures cannot configure a respawn destination.");
      }
      continue;
    }
    if (procedure.procedureKind !== "barbarian") {
      throw new RangeError("Unknown player-presence procedure kind.");
    }
    store.barbarianProcedureByEntity[procedure.entityId] = 1;
    const destination = procedure.respawnDestination;
    if (destination === undefined) continue;
    assertWorldCoordinate(destination.x, config.worldWidth, "respawn destination x");
    assertWorldCoordinate(destination.y, config.worldHeight, "respawn destination y");
    store.respawnDestinationPresentByEntity[procedure.entityId] = 1;
    store.respawnDestinationXByEntity[procedure.entityId] = destination.x;
    store.respawnDestinationYByEntity[procedure.entityId] = destination.y;
  }
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

export type IndividualRespawnDestinationState =
  | "notApplicable"
  | "missing"
  | "configured";

export type IndividualRespawnEgressState =
  | "notStarted"
  | "missingDestination"
  | "moving"
  | "waitingAtRespawn";

export interface IndividualRespawnEgressInspection {
  readonly destinationState: IndividualRespawnDestinationState;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly egressState: IndividualRespawnEgressState;
  readonly egressStartedTick: number;
  readonly waitingArrivalTick: number;
  readonly waitingArrivalX: number;
  readonly waitingArrivalY: number;
  readonly movementRecordCount: number;
}

export function getIndividualRespawnEgressInspection(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): IndividualRespawnEgressInspection {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Respawn egress inspection");
  const isBarbarian = internal.barbarianProcedureByEntity[entityId] !== 0;
  const hasDestination = internal.respawnDestinationPresentByEntity[entityId] !== 0;
  const presenceState = PRESENCE_STATES[internal.stateByEntity[entityId]!]!;
  return {
    destinationState: !isBarbarian
      ? "notApplicable"
      : hasDestination ? "configured" : "missing",
    destinationX: hasDestination ? internal.respawnDestinationXByEntity[entityId]! : -1,
    destinationY: hasDestination ? internal.respawnDestinationYByEntity[entityId]! : -1,
    egressState: presenceState === "waitingAtRespawn"
      ? "waitingAtRespawn"
      : presenceState === "respawnEgress"
        ? hasDestination ? "moving" : "missingDestination"
        : "notStarted",
    egressStartedTick: internal.respawnEgressStartedTickByEntity[entityId]!,
    waitingArrivalTick: internal.waitingAtRespawnArrivalTickByEntity[entityId]!,
    waitingArrivalX: internal.waitingAtRespawnArrivalTickByEntity[entityId] === -1
      ? -1 : internal.waitingAtRespawnArrivalXByEntity[entityId]!,
    waitingArrivalY: internal.waitingAtRespawnArrivalTickByEntity[entityId] === -1
      ? -1 : internal.waitingAtRespawnArrivalYByEntity[entityId]!,
    movementRecordCount: internal.respawnEgressMovementCountByEntity[entityId]!,
  };
}

export function getActiveIndividualRespawnEgressEntityIds(
  store: IndividualPlayerPresenceStore,
): readonly number[] {
  return asInternalPresence(store).activeRespawnEgressEntityIds;
}

export function hasIndividualRespawnDestination(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): boolean {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Respawn destination");
  return internal.respawnDestinationPresentByEntity[entityId] !== 0;
}

export function getIndividualRespawnDestinationX(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): number {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Respawn destination");
  if (internal.respawnDestinationPresentByEntity[entityId] === 0) {
    throw new Error("Respawn destination is not configured.");
  }
  return internal.respawnDestinationXByEntity[entityId]!;
}

export function getIndividualRespawnDestinationY(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): number {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Respawn destination");
  if (internal.respawnDestinationPresentByEntity[entityId] === 0) {
    throw new Error("Respawn destination is not configured.");
  }
  return internal.respawnDestinationYByEntity[entityId]!;
}

export function getIndividualRespawnEgressStartedTick(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): number {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Respawn egress");
  return internal.respawnEgressStartedTickByEntity[entityId]!;
}

export function recordIndividualRespawnEgressMovement(
  store: IndividualPlayerPresenceStore,
  entityId: number,
): void {
  const internal = asInternalPresence(store);
  assertEntityId(entityId, internal.entityCount, "Respawn egress movement");
  if (internal.stateByEntity[entityId] !== 4) {
    throw new Error("Respawn egress movement requires respawnEgress presence.");
  }
  if (internal.respawnEgressMovementCountByEntity[entityId] === 0xffffffff) {
    throw new RangeError("Respawn egress movement history overflowed.");
  }
  internal.respawnEgressMovementCountByEntity[entityId] =
    internal.respawnEgressMovementCountByEntity[entityId]! + 1;
}

export function transitionIndividualRespawnEgressToWaiting(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  presenceStore: IndividualPlayerPresenceStore,
  entityId: number,
  tick: number,
  x: number,
  y: number,
): void {
  const lifecycle = asInternal(lifecycleStore);
  const presence = asInternalPresence(presenceStore);
  if (lifecycle.entityCount !== presence.entityCount) {
    throw new RangeError("Respawn arrival stores must match entity count.");
  }
  assertEntityId(entityId, presence.entityCount, "Respawn arrival");
  assertNonNegativeSafeInteger(tick, "respawn arrival tick");
  if (lifecycle.stateByEntity[entityId] !== 2 || presence.stateByEntity[entityId] !== 4) {
    throw new Error("Respawn arrival requires terminal respawnEgress presence.");
  }
  presence.stateByEntity[entityId] = 5;
  presence.lastTransitionTickByEntity[entityId] = tick;
  presence.waitingAtRespawnArrivalTickByEntity[entityId] = tick;
  presence.waitingAtRespawnArrivalXByEntity[entityId] = x;
  presence.waitingAtRespawnArrivalYByEntity[entityId] = y;
}

/** Compacts completed egress entries once after a movement pass. */
export function compactCompletedIndividualRespawnEgressEntities(
  store: IndividualPlayerPresenceStore,
): void {
  const internal = asInternalPresence(store);
  let writeIndex = 0;
  for (let readIndex = 0;
    readIndex < internal.activeRespawnEgressEntityIds.length;
    readIndex += 1) {
    const entityId = internal.activeRespawnEgressEntityIds[readIndex]!;
    if (internal.stateByEntity[entityId] !== 4) {
      internal.activeRespawnEgressIndexByEntity[entityId] = -1;
      continue;
    }
    internal.activeRespawnEgressEntityIds[writeIndex] = entityId;
    internal.activeRespawnEgressIndexByEntity[entityId] = writeIndex;
    writeIndex += 1;
  }
  internal.activeRespawnEgressEntityIds.length = writeIndex;
}

export interface IndividualTerminalComfortTransitionRecord {
  readonly entityId: number;
  readonly tick: number;
  readonly previousPresenceState: "terminalAwaitingComfort";
  readonly presenceState: "terminalComforted";
}

export function transitionIndividualTerminalAwaitingComfortToComforted(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  presenceStore: IndividualPlayerPresenceStore,
  entityId: number,
  tick: number,
): IndividualTerminalComfortTransitionRecord {
  const lifecycle = asInternal(lifecycleStore);
  const presence = asInternalPresence(presenceStore);
  if (lifecycle.entityCount !== presence.entityCount) {
    throw new RangeError(
      "Comfort lifecycle and presence stores must share entityCount.",
    );
  }
  assertEntityId(entityId, lifecycle.entityCount, "Terminal comfort");
  assertNonNegativeSafeInteger(tick, "tick");
  if (lifecycle.stateByEntity[entityId] !== 2) {
    throw new Error("Terminal comfort requires terminal character lifecycle.");
  }
  if (presence.stateByEntity[entityId] !== 2) {
    throw new Error(
      "Terminal comfort requires terminalAwaitingComfort presence.",
    );
  }
  presence.stateByEntity[entityId] = 3;
  presence.lastTransitionTickByEntity[entityId] = tick;
  return {
    entityId,
    tick,
    previousPresenceState: "terminalAwaitingComfort",
    presenceState: "terminalComforted",
  };
}

export interface IndividualTerminalPresenceTransitionRecord {
  readonly entityId: number;
  readonly tick: number;
  readonly terminalCause: Exclude<TerminalCause, "none">;
  readonly procedureKind: CasualtyProcedureKind;
  readonly previousPresenceState: "downedPresence";
  readonly presenceState: "terminalAwaitingComfort" | "respawnEgress";
}

export function applyIndividualTerminalPresenceTransitions(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  presenceStore: IndividualPlayerPresenceStore,
  procedureStore: IndividualCasualtyProcedureProfileStore,
  transitions: readonly IndividualTerminalTransitionRecord[],
  out: IndividualTerminalPresenceTransitionRecord[] = [],
): readonly IndividualTerminalPresenceTransitionRecord[] {
  const lifecycle = asInternal(lifecycleStore);
  const presence = asInternalPresence(presenceStore);
  if (lifecycle.entityCount !== presence.entityCount ||
    lifecycle.entityCount !== procedureStore.entityCount) {
    throw new RangeError("Terminal presence dependencies must match entity count.");
  }
  out.length = 0;
  let addedRespawnEgress = false;
  let previousEntityId = -1;
  for (let index = 0; index < transitions.length; index += 1) {
    const transition = transitions[index]!;
    assertEntityId(transition.entityId, lifecycle.entityCount, "Terminal presence");
    assertNonNegativeSafeInteger(transition.tick, "terminal transition tick");
    if (transition.entityId <= previousEntityId) {
      throw new RangeError(
        "Terminal transitions must be unique and ordered by entity ID.",
      );
    }
    previousEntityId = transition.entityId;
    if (lifecycle.stateByEntity[transition.entityId] !== 2 ||
      lifecycle.terminalTickByEntity[transition.entityId] !== transition.tick ||
      getIndividualTerminalCause(lifecycleStore, transition.entityId) !==
        transition.cause) {
      throw new Error("Terminal presence classification requires its canonical lifecycle transition.");
    }
    if (presence.stateByEntity[transition.entityId] !== 1) {
      throw new Error("Terminal presence classification requires downed player presence.");
    }
    const profile = getIndividualCasualtyProcedureProfile(
      procedureStore, transition.entityId,
    );
    const presenceState = profile.procedureKind === "citizen"
      ? "terminalAwaitingComfort"
      : "respawnEgress";
    presence.stateByEntity[transition.entityId] =
      presenceState === "terminalAwaitingComfort" ? 2 : 4;
    presence.lastTransitionTickByEntity[transition.entityId] = transition.tick;
    if (presenceState === "respawnEgress") {
      presence.barbarianProcedureByEntity[transition.entityId] = 1;
      presence.respawnEgressStartedTickByEntity[transition.entityId] = transition.tick;
      addActiveRespawnEgressEntity(presence, transition.entityId);
      addedRespawnEgress = true;
    }
    out.push({
      entityId: transition.entityId,
      tick: transition.tick,
      terminalCause: transition.cause,
      procedureKind: profile.procedureKind,
      previousPresenceState: "downedPresence",
      presenceState,
    });
  }
  if (addedRespawnEgress) canonicalizeActiveRespawnEgressEntities(presence);
  return out;
}

/**
 * Compatibility entry point for trusted terminal hooks that retain only
 * entity/tick identity. Production should pass canonical transition records
 * to applyIndividualTerminalPresenceTransitions directly.
 */
export function classifyIndividualTerminalPlayerPresences(
  lifecycleStore: IndividualCasualtyLifecycleStore,
  presenceStore: IndividualPlayerPresenceStore,
  procedureStore: IndividualCasualtyProcedureProfileStore,
  terminalTransitions: readonly {
    readonly entityId: number;
    readonly tick: number;
  }[],
  out: IndividualTerminalPresenceTransitionRecord[] = [],
): readonly IndividualTerminalPresenceTransitionRecord[] {
  const lifecycle = asInternal(lifecycleStore);
  const canonical = terminalTransitions.map((transition) => ({
    entityId: transition.entityId,
    tick: transition.tick,
    previousLifecycleState: "dying" as const,
    lifecycleState: "terminal" as const,
    cause: getIndividualTerminalCause(lifecycleStore, transition.entityId) as
      Exclude<TerminalCause, "none">,
    terminalX: lifecycle.downXByEntity[transition.entityId]!,
    terminalY: lifecycle.downYByEntity[transition.entityId]!,
  })).sort((left, right) =>
    left.entityId - right.entityId || left.tick - right.tick);
  return applyIndividualTerminalPresenceTransitions(
    lifecycleStore,
    presenceStore,
    procedureStore,
    canonical,
    out,
  );
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
  if (zeroHitEvents.length === 0) {
    return { transitions: transitionsOut, transitionCount: 0 };
  }

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

function addActiveRespawnEgressEntity(
  store: InternalIndividualPlayerPresenceStore,
  entityId: number,
): void {
  if (store.activeRespawnEgressIndexByEntity[entityId] !== -1) {
    throw new Error("Respawn egress presence may be activated only once.");
  }
  store.activeRespawnEgressIndexByEntity[entityId] =
    store.activeRespawnEgressEntityIds.length;
  store.activeRespawnEgressEntityIds.push(entityId);
}

function canonicalizeActiveRespawnEgressEntities(
  store: InternalIndividualPlayerPresenceStore,
): void {
  store.activeRespawnEgressEntityIds.sort((left, right) => left - right);
  for (let index = 0;
    index < store.activeRespawnEgressEntityIds.length;
    index += 1) {
    store.activeRespawnEgressIndexByEntity[
      store.activeRespawnEgressEntityIds[index]!
    ] = index;
  }
}

function assertWorldCoordinate(value: number, exclusiveMaximum: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value >= exclusiveMaximum) {
    throw new RangeError(`${name} must be an integer inside world bounds.`);
  }
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
