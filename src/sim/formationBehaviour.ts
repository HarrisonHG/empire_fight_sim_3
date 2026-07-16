import { SeededRng } from "./rng";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadiusInto,
  type SpatialGrid,
} from "./spatialGrid";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import {
  LOCAL_HOSTILE_THREAT_RADIUS,
  ROUTING_PASS_THROUGH_PROXIMITY_DISTANCE,
} from "./moraleMovement";
import type {
  MoraleMovementState,
  UnitMoraleMovementStateSource,
} from "./moraleMovement";
import type { WorldState } from "./types";
import {
  isIndividualCharacterActive,
  type IndividualCasualtyLifecycleStore,
} from "./individualCasualtyLifecycle";
import {
  isIndividualOrdinaryParticipationEligible,
  type IndividualOrdinaryParticipationSnapshot,
} from "./individualOrdinaryParticipation";

export type UnitOrder = "hold" | "advance" | "advanceCautious";
export type IndividualRole = "recruit" | "regular" | "veteran";
export type MovementMode =
  | "holdPosition"
  | "moveToFormationSlot"
  | "advanceWithUnit"
  | "withdrawForTreatment";

export type UnitMovementStyle =
  | "formedMarch" // Normal advancing style when no blocker changes movement.
  | "orderedHalt" // Explicit hold-order style, distinct from blocker haltAndWait.
  | "formedDetour" // Emitted by Milestone 2B blocker arbitration.
  | "looseFlow" // Emitted by Milestone 2B blocker arbitration.
  | "pushThrough" // Emitted by Milestone 2B blocker arbitration.
  | "haltAndWait" // Emitted by Milestone 2B blocker arbitration.
  | "engageFront" // 2B style selection only; does not implement combat.
  | "strainedEngage" // 4H-3: contact line holds with subtle raggedness.
  | "shakenEngage" // 4H-3: contact line holds with pronounced raggedness.
  | "giveGround" // 4H-3: wavering contact response; retreat without routing.
  | "routeAway"; // 4E temporary routing movement; stored order remains intact.

export interface UnitFormationConfig {
  readonly unitId: UnitId;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly spacing: number;
  readonly rows: number;
  readonly cols: number;
  readonly unitSpeed: number;
  readonly order: UnitOrder;
  readonly cohesion?: number;
}

export interface IndividualBehaviourConfig {
  readonly entityId: number;
  readonly role: IndividualRole;
  readonly slotRow: number;
  readonly slotCol: number;
  readonly memberMaxStep: number;
  readonly pressure?: number;
  readonly confidence?: number;
}

export interface FormationBehaviourConfig {
  readonly entityCount: number;
  readonly rngSeed: number;
  readonly units: readonly UnitFormationConfig[];
  readonly individuals: readonly IndividualBehaviourConfig[];
}

export interface FormationBehaviourStore {
  readonly entityCount: number;
  readonly unitCount: number;
}

export type FormationEvent =
  | {
      readonly kind: "unit_movement_choice";
      readonly unitId: UnitId;
      readonly style: UnitMovementStyle;
    }
  | {
      readonly kind: "individual_movement_mode";
      readonly entityId: number;
      readonly mode: MovementMode;
    }
  | { readonly kind: "stuck_entered"; readonly entityId: number }
  | { readonly kind: "stuck_recovered"; readonly entityId: number };

/** Tick-local movement evidence for 4F; formation never applies morale effects. */
export interface RoutingPassThroughInteraction {
  readonly routerUnitId: UnitId;
  readonly targetUnitId: UnitId;
}

export interface FormationTickResult {
  readonly events: readonly FormationEvent[];
  readonly routingPassThroughInteractions: readonly RoutingPassThroughInteraction[];
}

export interface FormationTickDiagnostics {
  runStage?<T>(stage: "blockerGridBuild", run: () => T): T;
  blockerGridBuilds: number;
  blockerDetectionQueries: number;
  blockerDetectionCandidateEntities: number;
  blockerDetectionUniqueCandidateUnits: number;
  hostileContactQueries: number;
  hostileContactCandidateEntities: number;
  sameUnitOvertakingComparisons: number;
  memberSlotEvaluations: number;
  routingUnitCount: number;
  recoveringUnitCount: number;
  routingPassThroughInteractions: number;
}

export function createFormationTickDiagnostics(): FormationTickDiagnostics {
  return {
    blockerGridBuilds: 0,
    blockerDetectionQueries: 0,
    blockerDetectionCandidateEntities: 0,
    blockerDetectionUniqueCandidateUnits: 0,
    hostileContactQueries: 0,
    hostileContactCandidateEntities: 0,
    sameUnitOvertakingComparisons: 0,
    memberSlotEvaluations: 0,
    routingUnitCount: 0,
    recoveringUnitCount: 0,
    routingPassThroughInteractions: 0,
  };
}

export function resetFormationTickDiagnostics(
  diagnostics: FormationTickDiagnostics,
): void {
  diagnostics.blockerGridBuilds = 0;
  diagnostics.blockerDetectionQueries = 0;
  diagnostics.blockerDetectionCandidateEntities = 0;
  diagnostics.blockerDetectionUniqueCandidateUnits = 0;
  diagnostics.hostileContactQueries = 0;
  diagnostics.hostileContactCandidateEntities = 0;
  diagnostics.sameUnitOvertakingComparisons = 0;
  diagnostics.memberSlotEvaluations = 0;
  diagnostics.routingUnitCount = 0;
  diagnostics.recoveringUnitCount = 0;
  diagnostics.routingPassThroughInteractions = 0;
}

interface InternalFormationBehaviourStore extends FormationBehaviourStore {
  readonly unitIndexById: ReadonlyMap<UnitId, number>;
  readonly anchorX: Int32Array;
  readonly anchorY: Int32Array;
  readonly headingX: Int8Array;
  readonly headingY: Int8Array;
  readonly spacing: Int32Array;
  readonly rows: Int32Array;
  readonly cols: Int32Array;
  readonly unitSpeed: Int32Array;
  /** Fixed-point carry for morale-reduced anchor movement. */
  readonly anchorMovementRemainder: Int32Array;
  readonly orders: UnitOrder[];
  readonly cohesion: Int32Array;
  /** Semantic ceiling set from the unit's configured initial cohesion. */
  readonly maximumCohesion: Int32Array;
  readonly unitMovementStyle: UnitMovementStyle[];
  readonly styleCommitmentTicksRemaining: Int32Array;
  readonly blockerReleaseTicksRemaining: Int32Array;
  readonly activeBlockerUnitId: Int32Array;
  readonly activeBlockerDistance: Int32Array;
  readonly activeBlockerLateralOffset: Int32Array;
  /** Temporary 4E routing intent; never replaces the configured heading. */
  readonly routingHeadingX: Int8Array;
  readonly routingHeadingY: Int8Array;

  readonly roles: IndividualRole[];
  readonly slotRow: Int32Array;
  readonly slotCol: Int32Array;
  readonly memberMaxStep: Int32Array;
  /** Fixed-point carry for morale-reduced member slot correction. */
  readonly slotCorrectionRemainder: Int32Array;
  readonly pressure: Int32Array;
  readonly confidence: Int32Array;
  readonly stuckTicks: Int32Array;
  readonly isStuck: Uint8Array;
  readonly movementMode: MovementMode[];
  readonly lastEmittedMovementMode: (MovementMode | null)[];
  readonly lastEmittedUnitStyle: (UnitMovementStyle | null)[];

  blockerGrid: SpatialGrid | undefined;
  readonly scratchNearbyEntityIds: number[];
  readonly scratchCandidateUnitIds: UnitId[];
  /** Fixed tick-start positions used for symmetric hostile contact limits. */
  readonly contactSnapshotPositionsX: Int32Array;
  readonly contactSnapshotPositionsY: Int32Array;
  /** Tick-start anchors used for order-independent 4E retreat choices. */
  readonly anchorSnapshotX: Int32Array;
  readonly anchorSnapshotY: Int32Array;
  readonly routingPassThroughRouterUnitIds: Int32Array;
  readonly routingPassThroughTargetUnitIds: Int32Array;
  routingPassThroughCount: number;

  readonly rng: SeededRng;
}

const DEFAULT_COHESION = 1000;
const DEFAULT_CONFIDENCE = 500;
const STUCK_TICK_THRESHOLD = 5;
const BLOCKER_GRID_CELL_SIZE = 32;
const LOW_CONFIDENCE_THRESHOLD = 250;
const HIGH_CONFIDENCE_THRESHOLD = 900;
const HIGH_PRESSURE_THRESHOLD = 800;
const LOW_COHESION_THRESHOLD = 350;
const FORMED_COHESION_THRESHOLD = 700;
const PUSH_THROUGH_COHESION_THRESHOLD = 500;
const BLOCKER_STYLE_COMMITMENT_TICKS = 3;
const BLOCKER_STYLE_RELEASE_TICKS = 2;
const NO_ACTIVE_BLOCKER_UNIT_ID = -1;
const NO_ACTIVE_BLOCKER_DISTANCE = -1;
const FRONT_CONTACT_GAP = 1;
const RAGGED_CONTACT_GAP = 2;
const HOSTILE_CONTACT_LATERAL_SPACING_MULTIPLIER = 2;
const MAX_INTEGER_STATE_VALUE = 0x7fff_ffff;
const PUSH_THROUGH_SOURCE_COHESION_LOSS = 5;
const PUSH_THROUGH_BLOCKER_COHESION_LOSS = 3;
const PUSH_THROUGH_SOURCE_PRESSURE_GAIN = 20;
const PUSH_THROUGH_BLOCKER_PRESSURE_GAIN = 10;
const MORALE_MOVEMENT_SCALE = 1_000;
const STRAINED_MOVEMENT_SCALE = 850;
const SHAKEN_MOVEMENT_SCALE = 650;
const WAVERING_CORRECTION_SCALE = 500;
const RECOVERING_CORRECTION_SCALE = 700;
const WAVERING_GIVE_GROUND_SCALE = 50;
const STRAINED_SLOT_LATERAL_OFFSET = 1;
const STRAINED_SLOT_BACKSTEP = 1;
const SHAKEN_SLOT_LATERAL_OFFSET = 2;
const SHAKEN_SLOT_BACKSTEP = 2;
const ROUTING_LATERAL_CORRECTION_MAX_STEP = 1;
const MAX_ROUTING_PASS_THROUGH_INTERACTIONS_PER_TICK = 256;
const NO_ROUTING_PASS_THROUGH_INTERACTIONS: readonly RoutingPassThroughInteraction[] =
  Object.freeze([]);

export function createFormationBehaviourStore(
  identityStore: UnitIdentityStore,
  config: FormationBehaviourConfig,
): FormationBehaviourStore {
  assertPositiveInteger(config.entityCount, "entityCount");

  if (identityStore.entityCount !== config.entityCount) {
    throw new RangeError(
      "Formation behaviour entity count must match identity store entity count.",
    );
  }

  const unitIdList = getUnitIds(identityStore);
  const unitCount = unitIdList.length;

  const configByUnitId = new Map<UnitId, UnitFormationConfig>();
  for (let index = 0; index < config.units.length; index += 1) {
    const unitConfig = config.units[index]!;
    if (configByUnitId.has(unitConfig.unitId)) {
      throw new RangeError("Duplicate unit formation config.");
    }
    configByUnitId.set(unitConfig.unitId, unitConfig);
  }

  const unitIndexById = new Map<UnitId, number>();
  for (let index = 0; index < unitCount; index += 1) {
    unitIndexById.set(unitIdList[index]!, index);
  }

  const store: InternalFormationBehaviourStore = {
    entityCount: config.entityCount,
    unitCount,
    unitIndexById,
    anchorX: new Int32Array(unitCount),
    anchorY: new Int32Array(unitCount),
    headingX: new Int8Array(unitCount),
    headingY: new Int8Array(unitCount),
    spacing: new Int32Array(unitCount),
    rows: new Int32Array(unitCount),
    cols: new Int32Array(unitCount),
    unitSpeed: new Int32Array(unitCount),
    anchorMovementRemainder: new Int32Array(unitCount),
    orders: new Array<UnitOrder>(unitCount).fill("hold"),
    cohesion: new Int32Array(unitCount),
    maximumCohesion: new Int32Array(unitCount),
    unitMovementStyle: new Array<UnitMovementStyle>(unitCount).fill(
      "orderedHalt",
    ),
    styleCommitmentTicksRemaining: new Int32Array(unitCount),
    blockerReleaseTicksRemaining: new Int32Array(unitCount),
    activeBlockerUnitId: new Int32Array(unitCount),
    activeBlockerDistance: new Int32Array(unitCount),
    activeBlockerLateralOffset: new Int32Array(unitCount),
    routingHeadingX: new Int8Array(unitCount),
    routingHeadingY: new Int8Array(unitCount),
    roles: new Array<IndividualRole>(config.entityCount).fill("regular"),
    slotRow: new Int32Array(config.entityCount),
    slotCol: new Int32Array(config.entityCount),
    memberMaxStep: new Int32Array(config.entityCount),
    slotCorrectionRemainder: new Int32Array(config.entityCount),
    pressure: new Int32Array(config.entityCount),
    confidence: new Int32Array(config.entityCount),
    stuckTicks: new Int32Array(config.entityCount),
    isStuck: new Uint8Array(config.entityCount),
    movementMode: new Array<MovementMode>(config.entityCount).fill(
      "holdPosition",
    ),
    lastEmittedMovementMode: new Array<MovementMode | null>(
      config.entityCount,
    ).fill(null),
    lastEmittedUnitStyle: new Array<UnitMovementStyle | null>(unitCount).fill(
      null,
    ),
    blockerGrid: undefined,
    scratchNearbyEntityIds: [],
    scratchCandidateUnitIds: [],
    contactSnapshotPositionsX: new Int32Array(config.entityCount),
    contactSnapshotPositionsY: new Int32Array(config.entityCount),
    anchorSnapshotX: new Int32Array(unitCount),
    anchorSnapshotY: new Int32Array(unitCount),
    routingPassThroughRouterUnitIds: new Int32Array(
      MAX_ROUTING_PASS_THROUGH_INTERACTIONS_PER_TICK,
    ),
    routingPassThroughTargetUnitIds: new Int32Array(
      MAX_ROUTING_PASS_THROUGH_INTERACTIONS_PER_TICK,
    ),
    routingPassThroughCount: 0,
    rng: new SeededRng(config.rngSeed),
  };
  store.activeBlockerUnitId.fill(NO_ACTIVE_BLOCKER_UNIT_ID);
  store.activeBlockerDistance.fill(NO_ACTIVE_BLOCKER_DISTANCE);

  for (let index = 0; index < unitCount; index += 1) {
    const unitId = unitIdList[index]!;
    const unitConfig = configByUnitId.get(unitId);
    if (unitConfig === undefined) {
      throw new RangeError(
        "Formation behaviour config must define every unit in the identity store.",
      );
    }

    assertCardinalHeading(unitConfig.headingX, unitConfig.headingY);
    assertPositiveInteger(unitConfig.spacing, "spacing");
    assertPositiveInteger(unitConfig.rows, "rows");
    assertPositiveInteger(unitConfig.cols, "cols");
    assertNonNegativeInteger(unitConfig.unitSpeed, "unitSpeed");

    store.anchorX[index] = unitConfig.anchorX;
    store.anchorY[index] = unitConfig.anchorY;
    store.headingX[index] = unitConfig.headingX;
    store.headingY[index] = unitConfig.headingY;
    store.spacing[index] = unitConfig.spacing;
    store.rows[index] = unitConfig.rows;
    store.cols[index] = unitConfig.cols;
    store.unitSpeed[index] = unitConfig.unitSpeed;
    store.orders[index] = unitConfig.order;
    const configuredCohesion = clampIntegerState(
      unitConfig.cohesion ?? DEFAULT_COHESION,
    );
    store.cohesion[index] = configuredCohesion;
    store.maximumCohesion[index] = configuredCohesion;
  }

  const seenIndividualEntities = new Set<number>();
  for (let index = 0; index < config.individuals.length; index += 1) {
    const individual = config.individuals[index]!;
    assertEntityIdInRange(individual.entityId, config.entityCount);
    if (seenIndividualEntities.has(individual.entityId)) {
      throw new RangeError(
        "Duplicate individual behaviour config for entity ID.",
      );
    }
    seenIndividualEntities.add(individual.entityId);
    assertNonNegativeInteger(individual.slotRow, "slotRow");
    assertNonNegativeInteger(individual.slotCol, "slotCol");
    assertNonNegativeInteger(individual.memberMaxStep, "memberMaxStep");

    store.roles[individual.entityId] = individual.role;
    store.slotRow[individual.entityId] = individual.slotRow;
    store.slotCol[individual.entityId] = individual.slotCol;
    store.memberMaxStep[individual.entityId] = individual.memberMaxStep;
    store.pressure[individual.entityId] = clampIntegerState(
      individual.pressure ?? 0,
    );
    store.confidence[individual.entityId] =
      individual.confidence ?? DEFAULT_CONFIDENCE;
  }

  return store;
}

export function getUnitAnchor(
  store: FormationBehaviourStore,
  unitId: UnitId,
): { readonly x: number; readonly y: number } {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  return { x: internal.anchorX[index]!, y: internal.anchorY[index]! };
}

export function getUnitHeading(
  store: FormationBehaviourStore,
  unitId: UnitId,
): { readonly x: number; readonly y: number } {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  return { x: internal.headingX[index]!, y: internal.headingY[index]! };
}

export function getUnitOrder(
  store: FormationBehaviourStore,
  unitId: UnitId,
): UnitOrder {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  return internal.orders[index]!;
}

export function getUnitMovementStyle(
  store: FormationBehaviourStore,
  unitId: UnitId,
): UnitMovementStyle {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  return internal.unitMovementStyle[index]!;
}

export function getUnitCohesion(
  store: FormationBehaviourStore,
  unitId: UnitId,
): number {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  return internal.cohesion[index]!;
}

/** The configured initial cohesion is the semantic recovery ceiling. */
export function getUnitMaximumCohesion(
  store: FormationBehaviourStore,
  unitId: UnitId,
): number {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  return internal.maximumCohesion[index]!;
}

/** Applies a bounded cohesion loss while formation retains cohesion ownership. */
export function applyUnitCohesionLoss(
  store: FormationBehaviourStore,
  unitId: UnitId,
  amount: number,
): number {
  const internal = asInternal(store);
  const unitIndex = requireUnitIndex(internal, unitId);
  assertNonNegativeInteger(amount, "cohesion loss amount");
  const before = internal.cohesion[unitIndex]!;
  reduceUnitCohesion(internal, unitIndex, amount);
  return before - internal.cohesion[unitIndex]!;
}

/** Restores bounded cohesion while the formation store remains authoritative. */
export function restoreUnitCohesion(
  store: FormationBehaviourStore,
  unitId: UnitId,
  amount: number,
): number {
  const internal = asInternal(store);
  const unitIndex = requireUnitIndex(internal, unitId);
  assertNonNegativeInteger(amount, "cohesion restoration amount");
  const before = internal.cohesion[unitIndex]!;
  const maximum = internal.maximumCohesion[unitIndex]!;
  internal.cohesion[unitIndex] = Math.min(
    maximum,
    increaseIntegerState(before, amount),
  );
  return internal.cohesion[unitIndex]! - before;
}

export function setUnitOrder(
  store: FormationBehaviourStore,
  unitId: UnitId,
  order: UnitOrder,
): void {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  internal.orders[index] = order;
}

export function getIndividualMovementMode(
  store: FormationBehaviourStore,
  entityId: number,
): MovementMode {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  return internal.movementMode[entityId]!;
}

export function getIndividualPressure(
  store: FormationBehaviourStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  return internal.pressure[entityId]!;
}

/** Returns the temporary 4E retreat direction without exposing mutable state. */
export function getUnitRoutingHeading(
  store: FormationBehaviourStore,
  unitId: UnitId,
): { readonly x: number; readonly y: number } {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  return {
    x: internal.routingHeadingX[index]!,
    y: internal.routingHeadingY[index]!,
  };
}

export function getUnitConfiguredSpeed(
  store: FormationBehaviourStore,
  unitId: UnitId,
): number {
  const internal = asInternal(store);
  return internal.unitSpeed[requireUnitIndex(internal, unitId)]!;
}

export function getIndividualConfidence(
  store: FormationBehaviourStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  return internal.confidence[entityId]!;
}

export function getIndividualRole(
  store: FormationBehaviourStore,
  entityId: number,
): IndividualRole {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  return internal.roles[entityId]!;
}

export function getIndividualConfiguredMaxStep(
  store: FormationBehaviourStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  return internal.memberMaxStep[entityId]!;
}

/** Applies one already-arbitrated individual intent through formation-owned movement limits. */
export function applyIndividualExternalMovementIntent(
  world: WorldState,
  store: FormationBehaviourStore,
  entityId: number,
  goalX: number,
  goalY: number,
  mode: MovementMode,
): boolean {
  const internal = asInternal(store);
  if (world.entityCount !== internal.entityCount) {
    throw new RangeError("External movement world must match formation entity count.");
  }
  assertEntityIdInRange(entityId, internal.entityCount);
  if (!Number.isFinite(goalX) || !Number.isFinite(goalY)) {
    throw new RangeError("External movement goal must be finite.");
  }
  const currentX = world.positionsX[entityId]!;
  const currentY = world.positionsY[entityId]!;
  const maxStep = internal.memberMaxStep[entityId]!;
  const nextX = clampWorldCoordinate(
    currentX + clampComponent(goalX - currentX, maxStep),
    world.bounds.width,
  );
  const nextY = clampWorldCoordinate(
    currentY + clampComponent(goalY - currentY, maxStep),
    world.bounds.height,
  );
  world.positionsX[entityId] = nextX;
  world.positionsY[entityId] = nextY;
  internal.movementMode[entityId] =
    nextX === currentX && nextY === currentY ? "holdPosition" : mode;
  internal.stuckTicks[entityId] = 0;
  internal.isStuck[entityId] = 0;
  return nextX !== currentX || nextY !== currentY;
}

export function setIndividualPressure(
  store: FormationBehaviourStore,
  entityId: number,
  pressure: number,
): void {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  assertNonNegativeInteger(pressure, "pressure");
  internal.pressure[entityId] = clampIntegerState(pressure);
}

export function getIndividualStuckTicks(
  store: FormationBehaviourStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  return internal.stuckTicks[entityId]!;
}

export function computeSlotWorldPosition(
  store: FormationBehaviourStore,
  unitId: UnitId,
  slotRow: number,
  slotCol: number,
): { readonly x: number; readonly y: number } {
  const internal = asInternal(store);
  const index = requireUnitIndex(internal, unitId);
  const spacing = internal.spacing[index]!;
  const cols = internal.cols[index]!;
  const centerCol = Math.floor(cols / 2);
  const anchorX = internal.anchorX[index]!;
  const anchorY = internal.anchorY[index]!;
  const headingX = internal.headingX[index]!;
  const headingY = internal.headingY[index]!;
  const perpX = -headingY;
  const perpY = headingX;
  const backward = slotRow * spacing;
  const lateral = (slotCol - centerCol) * spacing;
  return {
    x: anchorX - headingX * backward + perpX * lateral,
    y: anchorY - headingY * backward + perpY * lateral,
  };
}

export function advanceFormationOneTick(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: FormationBehaviourStore,
  moraleMovementStates?: UnitMoraleMovementStateSource,
  diagnostics?: FormationTickDiagnostics,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): FormationTickResult {
  const internal = asInternal(store);
  validateWorldForBehaviour(world, internal, identityStore);
  if (
    lifecycleStore !== undefined &&
    lifecycleStore.entityCount !== world.entityCount
  ) {
    throw new RangeError("Formation lifecycle store must match world entity count.");
  }
  if (
    ordinaryParticipation !== undefined &&
    ordinaryParticipation.entityCount !== world.entityCount
  ) {
    throw new RangeError("Formation ordinary participation must match world entity count.");
  }

  const events: FormationEvent[] = [];
  internal.routingPassThroughCount = 0;
  const unitIds = getUnitIds(identityStore);
  const blockerGrid =
    unitIds.length > 1
      ? runFormationDiagnosticStage(diagnostics, "blockerGridBuild", () =>
          prepareBlockerGrid(internal, world, lifecycleStore, ordinaryParticipation),
        )
      : undefined;
  if (blockerGrid !== undefined) {
    diagnostics !== undefined && (diagnostics.blockerGridBuilds += 1);
  }
  if (blockerGrid === undefined) {
    snapshotFormationTickStart(internal, world);
  }
  if (diagnostics !== undefined && moraleMovementStates !== undefined) {
    for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
      const state = moraleMovementStates.get(unitIds[unitIndex]!);
      if (state === "routing") diagnostics.routingUnitCount += 1;
      if (state === "recovering") diagnostics.recoveringUnitCount += 1;
    }
  }
  prepareRoutingHeadings(
    world,
    identityStore,
    internal,
    blockerGrid,
    unitIds,
    moraleMovementStates,
  );

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const storeUnitIndex = requireUnitIndex(internal, unitId);
    processUnit(
      world,
      identityStore,
      internal,
      blockerGrid,
      unitId,
      storeUnitIndex,
      moraleMovementStates?.get(unitId) ?? "steady",
      events,
      diagnostics,
      lifecycleStore,
      ordinaryParticipation,
    );
  }
  if (diagnostics !== undefined) {
    diagnostics.routingPassThroughInteractions =
      internal.routingPassThroughCount;
  }

  return {
    events,
    routingPassThroughInteractions: collectRoutingPassThroughInteractions(
      internal,
    ),
  };
}

function runFormationDiagnosticStage<T>(
  diagnostics: FormationTickDiagnostics | undefined,
  stage: "blockerGridBuild",
  run: () => T,
): T {
  return diagnostics?.runStage === undefined
    ? run()
    : diagnostics.runStage(stage, run);
}

function processUnit(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitId: UnitId,
  unitIndex: number,
  moraleMovementState: MoraleMovementState,
  events: FormationEvent[],
  diagnostics: FormationTickDiagnostics | undefined,
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot | undefined,
): void {
  const unitMembers = getUnitMembers(identityStore, unitId);
  if (!hasFormationParticipant(unitMembers, lifecycleStore, ordinaryParticipation)) {
    store.anchorMovementRemainder[unitIndex] = 0;
    store.routingHeadingX[unitIndex] = 0;
    store.routingHeadingY[unitIndex] = 0;
    for (let index = 0; index < unitMembers.length; index += 1) {
      const entityId = unitMembers[index]!;
      store.movementMode[entityId] = "holdPosition";
      store.stuckTicks[entityId] = 0;
      store.isStuck[entityId] = 0;
    }
    return;
  }
  const storedOrder = store.orders[unitIndex]!;
  // 4G recovery preserves but temporarily suspends the configured order.
  const order: UnitOrder =
    moraleMovementState === "recovering" ? "hold" : storedOrder;
  const headingX = store.headingX[unitIndex]!;
  const headingY = store.headingY[unitIndex]!;
  const unitSpeed = store.unitSpeed[unitIndex]!;
  const configuredSpacing = store.spacing[unitIndex]!;
  // Keep the existing slot-following path but use a wider, transient recovery
  // footprint. Configuration remains immutable.
  const spacing =
    moraleMovementState === "recovering"
      ? configuredSpacing + Math.floor(configuredSpacing / 2)
      : configuredSpacing;
  const cols = store.cols[unitIndex]!;
  const centerCol = Math.floor(cols / 2);
  const isAdvancing = order === "advance" || order === "advanceCautious";
  if (moraleMovementState === "routing") {
    processRoutingUnit(
      world,
      identityStore,
      store,
      blockerGrid,
      unitId,
      unitIndex,
      events,
      diagnostics,
      lifecycleStore,
      ordinaryParticipation,
    );
    return;
  }
  const anchorMovementScale = anchorMovementScaleForMorale(
    moraleMovementState,
  );
  const correctionMovementScale = correctionMovementScaleForMorale(
    moraleMovementState,
  );
  if (
    anchorMovementScale === MORALE_MOVEMENT_SCALE ||
    (anchorMovementScale === 0 && moraleMovementState !== "wavering")
  ) {
    store.anchorMovementRemainder[unitIndex] = 0;
  }

  const style = chooseUnitMovementStyle(
    identityStore,
    store,
    blockerGrid,
    unitId,
    unitIndex,
    isAdvancing,
    moraleMovementState,
    diagnostics,
    lifecycleStore,
    ordinaryParticipation,
  );
  store.unitMovementStyle[unitIndex] = style;
  if (store.lastEmittedUnitStyle[unitIndex] !== style) {
    store.lastEmittedUnitStyle[unitIndex] = style;
    events.push({ kind: "unit_movement_choice", unitId, style });
  }

  if (style === "pushThrough") {
    applyPushThroughDisruption(identityStore, store, unitId, unitIndex);
  }

  if (style === "giveGround") {
    const effectiveUnitSpeed = scaleMovementStepWithRemainder(
      unitSpeed,
      WAVERING_GIVE_GROUND_SCALE,
      store.anchorMovementRemainder,
      unitIndex,
    );
    moveAnchorBackward(
      world,
      store,
      unitIndex,
      effectiveUnitSpeed,
      headingX,
      headingY,
    );
  } else if (shouldAdvanceUnitAnchor(isAdvancing, style)) {
    const effectiveUnitSpeed = scaleMovementStepWithRemainder(
      unitSpeed,
      anchorMovementScale,
      store.anchorMovementRemainder,
      unitIndex,
    );
    store.anchorX[unitIndex] =
      store.anchorX[unitIndex]! + headingX * effectiveUnitSpeed;
    store.anchorY[unitIndex] =
      store.anchorY[unitIndex]! + headingY * effectiveUnitSpeed;
  } else if (isAdvancing && style === "formedDetour") {
    const effectiveUnitSpeed = scaleMovementStepWithRemainder(
      unitSpeed,
      anchorMovementScale,
      store.anchorMovementRemainder,
      unitIndex,
    );
    sidestepFormedDetourAnchor(
      world,
      store,
      unitId,
      unitIndex,
      effectiveUnitSpeed,
      headingX,
      headingY,
    );
  }

  const anchorX = store.anchorX[unitIndex]!;
  const anchorY = store.anchorY[unitIndex]!;

  const members = unitMembers;
  if (members.length === 0) {
    return;
  }
  const sourceFactionId = getFactionIdForUnit(identityStore, unitId);

  // Compute max forward progress across allies at the start of this tick.
  // Used to hesitate recruits so they do not become the foremost fighter.
  let maxForwardProgress = -Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (!isFormationParticipant(lifecycleStore, entityId, ordinaryParticipation)) continue;
    diagnostics !== undefined && (diagnostics.memberSlotEvaluations += 1);
    const fp = forwardProgress(
      world.positionsX[entityId]!,
      world.positionsY[entityId]!,
      anchorX,
      anchorY,
      headingX,
      headingY,
    );
    if (fp > maxForwardProgress) {
      maxForwardProgress = fp;
    }
  }

  const perpX = -headingY;
  const perpY = headingX;
  const halfSpacing = Math.floor(spacing / 2);
  const blockerForwardLimit = getActiveBlockerForwardLimit(
    store,
    unitIndex,
    style,
  );
  const hostileContactGap = hostileContactGapForStyle(style);

  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (!isFormationParticipant(lifecycleStore, entityId, ordinaryParticipation)) {
      store.movementMode[entityId] = "holdPosition";
      store.stuckTicks[entityId] = 0;
      store.isStuck[entityId] = 0;
      continue;
    }
    const role = store.roles[entityId]!;
    const slotRow = store.slotRow[entityId]!;
    const slotCol = store.slotCol[entityId]!;
    const memberMaxStep = store.memberMaxStep[entityId]!;
    const effectiveMemberMaxStep = scaleMovementStepWithRemainder(
      memberMaxStep,
      correctionMovementScale,
      store.slotCorrectionRemainder,
      entityId,
    );
    const pressure = store.pressure[entityId]!;

    const backward = slotRow * spacing;
    const lateral = (slotCol - centerCol) * spacing;
    let memberForwardLimit = blockerForwardLimit;
    if (style === "haltAndWait" && blockerForwardLimit >= 0) {
      memberForwardLimit = Math.min(blockerForwardLimit, -backward);
    }

    let slotX = anchorX - headingX * backward + perpX * lateral;
    let slotY = anchorY - headingY * backward + perpY * lateral;
    if (
      isHostileContactMovementStyle(style) &&
      slotRow === 0 &&
      blockerForwardLimit >= 0
    ) {
      slotX += headingX * blockerForwardLimit;
      slotY += headingY * blockerForwardLimit;
    } else if (style === "looseFlow") {
      const looseLateralOffset = computeLooseFlowLateralOffset(
        world,
        store,
        unitIndex,
        entityId,
        slotCol,
        centerCol,
        spacing,
        slotX,
        slotY,
        perpX,
        perpY,
      );
      slotX += perpX * looseLateralOffset;
      slotY += perpY * looseLateralOffset;
    }

    const moraleLateralDisruption = getMoraleSlotLateralDisruption(
      moraleMovementState,
      entityId,
      slotRow,
      slotCol,
    );
    const moraleBackwardDisruption = getMoraleSlotBackwardDisruption(
      moraleMovementState,
      entityId,
      slotRow,
      slotCol,
    );
    slotX +=
      perpX * moraleLateralDisruption - headingX * moraleBackwardDisruption;
    slotY +=
      perpY * moraleLateralDisruption - headingY * moraleBackwardDisruption;

    const jitterMag = computePressureJitter(role, pressure);
    if (jitterMag > 0) {
      slotX += store.rng.nextIntInclusive(-jitterMag, jitterMag);
      slotY += store.rng.nextIntInclusive(-jitterMag, jitterMag);
    }

    const posX = world.positionsX[entityId]!;
    const posY = world.positionsY[entityId]!;
    const deltaX = slotX - posX;
    const deltaY = slotY - posY;

    let stepX = clampComponent(deltaX, effectiveMemberMaxStep);
    let stepY = clampComponent(deltaY, effectiveMemberMaxStep);

    let mode: MovementMode = decideMode(order, stepX, stepY);

    if (
      (order === "advanceCautious" || order === "hold") &&
      role === "recruit"
    ) {
      const currentFp = forwardProgress(
        posX,
        posY,
        anchorX,
        anchorY,
        headingX,
        headingY,
      );
      const allowedForward = maxForwardProgress - currentFp;
      const forwardStep = stepX * headingX + stepY * headingY;
      if (forwardStep > allowedForward) {
        const reduction = forwardStep - Math.max(0, allowedForward);
        stepX -= headingX * reduction;
        stepY -= headingY * reduction;
        if (stepX === 0 && stepY === 0) {
          mode = "holdPosition";
        }
      }
    }

    if (blockerForwardLimit >= 0) {
      const currentFp = forwardProgress(
        posX,
        posY,
        anchorX,
        anchorY,
        headingX,
        headingY,
      );
      const allowedForward = Math.max(0, memberForwardLimit - currentFp);
      const forwardStep = stepX * headingX + stepY * headingY;
      if (forwardStep > allowedForward) {
        const reduction = forwardStep - allowedForward;
        stepX -= headingX * reduction;
        stepY -= headingY * reduction;
        if (stepX === 0 && stepY === 0) {
          mode = "holdPosition";
        }
      }
    }

    const forwardStep = stepX * headingX + stepY * headingY;
    const hostileContactForwardLimit = getHostileContactForwardStepLimit(
      identityStore,
      store,
      blockerGrid,
      entityId,
      sourceFactionId,
      headingX,
      headingY,
      perpX,
      perpY,
      spacing,
      memberMaxStep,
      forwardStep,
      hostileContactGap,
      diagnostics,
    );
    if (forwardStep > hostileContactForwardLimit) {
      const reduction = forwardStep - hostileContactForwardLimit;
      stepX -= headingX * reduction;
      stepY -= headingY * reduction;
      if (stepX === 0 && stepY === 0) {
        mode = "holdPosition";
      }
    }

    // Prevent overtaking or pushing through same-unit allies in front rows.
    for (let otherIndex = 0; otherIndex < members.length; otherIndex += 1) {
      const otherId = members[otherIndex]!;
      if (otherId === entityId) continue;
      if (!isFormationParticipant(lifecycleStore, otherId, ordinaryParticipation)) continue;
      diagnostics !== undefined &&
        (diagnostics.sameUnitOvertakingComparisons += 1);
      const otherRow = store.slotRow[otherId]!;
      if (otherRow >= slotRow) continue;

      const otherPosX = world.positionsX[otherId]!;
      const otherPosY = world.positionsY[otherId]!;
      const lateralDelta =
        (otherPosX - posX) * perpX + (otherPosY - posY) * perpY;
      const lateralAbs = lateralDelta < 0 ? -lateralDelta : lateralDelta;
      if (lateralAbs > spacing) continue;

      const otherAhead =
        (otherPosX - posX) * headingX + (otherPosY - posY) * headingY;
      if (otherAhead <= 0) continue;

      const forwardStep = stepX * headingX + stepY * headingY;
      const maxAllowedForwardStep = otherAhead - halfSpacing;
      if (forwardStep > maxAllowedForwardStep) {
        const cappedForward = Math.max(0, maxAllowedForwardStep);
        const reduction = forwardStep - cappedForward;
        stepX -= headingX * reduction;
        stepY -= headingY * reduction;
        if (stepX === 0 && stepY === 0) {
          mode = "holdPosition";
        }
      }
    }

    world.positionsX[entityId] = posX + stepX;
    world.positionsY[entityId] = posY + stepY;
    store.movementMode[entityId] = mode;
    if (store.lastEmittedMovementMode[entityId] !== mode) {
      store.lastEmittedMovementMode[entityId] = mode;
      events.push({
        kind: "individual_movement_mode",
        entityId,
        mode,
      });
    }

    const wasStuck = store.isStuck[entityId] === 1;
    if (
      mode === "holdPosition" &&
      (order === "advance" || order === "advanceCautious")
    ) {
      store.stuckTicks[entityId] = store.stuckTicks[entityId]! + 1;
      if (
        !wasStuck &&
        store.stuckTicks[entityId]! >= STUCK_TICK_THRESHOLD
      ) {
        store.isStuck[entityId] = 1;
        events.push({ kind: "stuck_entered", entityId });
      }
    } else {
      store.stuckTicks[entityId] = 0;
      if (wasStuck) {
        store.isStuck[entityId] = 0;
        events.push({ kind: "stuck_recovered", entityId });
      }
    }
  }
}

interface RoutingHeading {
  readonly x: number;
  readonly y: number;
}

function prepareRoutingHeadings(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitIds: readonly UnitId[],
  moraleMovementStates: UnitMoraleMovementStateSource | undefined,
): void {
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    if (moraleMovementStates?.get(unitId) !== "routing") {
      store.routingHeadingX[unitIndex] = 0;
      store.routingHeadingY[unitIndex] = 0;
      continue;
    }

    const heading = selectRoutingHeading(
      world,
      identityStore,
      store,
      blockerGrid,
      unitId,
      unitIndex,
    );
    store.routingHeadingX[unitIndex] = heading.x;
    store.routingHeadingY[unitIndex] = heading.y;
  }
}

function selectRoutingHeading(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitId: UnitId,
  unitIndex: number,
): RoutingHeading {
  const fallback = {
    x: -store.headingX[unitIndex]!,
    y: -store.headingY[unitIndex]!,
  };
  const primaryHostileUnitId = findPrimaryRoutingHostileUnit(
    identityStore,
    store,
    blockerGrid,
    unitId,
    unitIndex,
  );
  if (primaryHostileUnitId === undefined) {
    return selectValidRoutingHeading(world, store, unitIndex, fallback);
  }

  const hostileIndex = requireUnitIndex(store, primaryHostileUnitId);
  const deltaX =
    store.anchorSnapshotX[unitIndex]! - store.anchorSnapshotX[hostileIndex]!;
  const deltaY =
    store.anchorSnapshotY[unitIndex]! - store.anchorSnapshotY[hostileIndex]!;
  const preferred = directionAwayFromHostile(deltaX, deltaY, fallback);
  return selectValidRoutingHeading(world, store, unitIndex, preferred);
}

function findPrimaryRoutingHostileUnit(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitId: UnitId,
  unitIndex: number,
): UnitId | undefined {
  if (blockerGrid === undefined) {
    return undefined;
  }

  const nearbyEntityIds = queryEntitiesWithinRadiusInto(
    blockerGrid,
    store.anchorSnapshotX[unitIndex]!,
    store.anchorSnapshotY[unitIndex]!,
    LOCAL_HOSTILE_THREAT_RADIUS,
    store.scratchNearbyEntityIds,
  );
  const candidateUnitIds = collectCandidateUnitIds(
    identityStore,
    unitId,
    nearbyEntityIds,
    store.scratchCandidateUnitIds,
  );
  const sourceFactionId = getFactionIdForUnit(identityStore, unitId);
  let primaryUnitId: UnitId | undefined;
  let primaryDistanceSquared = Number.MAX_SAFE_INTEGER;

  for (let candidateIndex = 0; candidateIndex < candidateUnitIds.length; candidateIndex += 1) {
    const candidateUnitId = candidateUnitIds[candidateIndex]!;
    if (getFactionIdForUnit(identityStore, candidateUnitId) === sourceFactionId) {
      continue;
    }
    const hostileIndex = requireUnitIndex(store, candidateUnitId);
    const deltaX =
      store.anchorSnapshotX[hostileIndex]! - store.anchorSnapshotX[unitIndex]!;
    const deltaY =
      store.anchorSnapshotY[hostileIndex]! - store.anchorSnapshotY[unitIndex]!;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (
      distanceSquared < primaryDistanceSquared ||
      (distanceSquared === primaryDistanceSquared &&
        (primaryUnitId === undefined || candidateUnitId < primaryUnitId))
    ) {
      primaryUnitId = candidateUnitId;
      primaryDistanceSquared = distanceSquared;
    }
  }

  return primaryUnitId;
}

function directionAwayFromHostile(
  deltaX: number,
  deltaY: number,
  fallback: RoutingHeading,
): RoutingHeading {
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);
  if (absoluteX === 0 && absoluteY === 0) {
    return fallback;
  }
  if (absoluteX >= absoluteY) {
    return { x: deltaX < 0 ? -1 : 1, y: 0 };
  }
  return { x: 0, y: deltaY < 0 ? -1 : 1 };
}

function selectValidRoutingHeading(
  world: WorldState,
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  preferred: RoutingHeading,
): RoutingHeading {
  const candidates: readonly RoutingHeading[] = [
    preferred,
    { x: -preferred.y, y: preferred.x },
    { x: preferred.y, y: -preferred.x },
    { x: -preferred.x, y: -preferred.y },
  ];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex]!;
    if (canAdvanceRoutingAnchor(world, store, unitIndex, candidate)) {
      return candidate;
    }
  }

  return preferred;
}

function canAdvanceRoutingAnchor(
  world: WorldState,
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  heading: RoutingHeading,
): boolean {
  const speed = store.unitSpeed[unitIndex]!;
  const nextX = store.anchorSnapshotX[unitIndex]! + heading.x * speed;
  const nextY = store.anchorSnapshotY[unitIndex]! + heading.y * speed;
  return (
    nextX >= 0 &&
    nextY >= 0 &&
    nextX < world.bounds.width &&
    nextY < world.bounds.height
  );
}

function processRoutingUnit(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitId: UnitId,
  unitIndex: number,
  events: FormationEvent[],
  diagnostics: FormationTickDiagnostics | undefined,
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot | undefined,
): void {
  const routeHeadingX = store.routingHeadingX[unitIndex]!;
  const routeHeadingY = store.routingHeadingY[unitIndex]!;
  const unitSpeed = store.unitSpeed[unitIndex]!;
  const spacing = store.spacing[unitIndex]!;
  const perpX = -routeHeadingY;
  const perpY = routeHeadingX;

  store.styleCommitmentTicksRemaining[unitIndex] = 0;
  store.blockerReleaseTicksRemaining[unitIndex] = 0;
  clearActiveBlocker(store, unitIndex);
  store.unitMovementStyle[unitIndex] = "routeAway";
  if (store.lastEmittedUnitStyle[unitIndex] !== "routeAway") {
    store.lastEmittedUnitStyle[unitIndex] = "routeAway";
    events.push({ kind: "unit_movement_choice", unitId, style: "routeAway" });
  }

  const sourceFactionId = getFactionIdForUnit(identityStore, unitId);
  const members = getUnitMembers(identityStore, unitId);
  const anchorForwardStep = getRoutingAnchorForwardStep(
    identityStore,
    store,
    blockerGrid,
    sourceFactionId,
    members,
    routeHeadingX,
    routeHeadingY,
    perpX,
    perpY,
    spacing,
    unitSpeed,
    diagnostics,
    lifecycleStore,
    ordinaryParticipation,
  );
  store.anchorX[unitIndex] = clampWorldCoordinate(
    store.anchorX[unitIndex]! + routeHeadingX * anchorForwardStep,
    world.bounds.width,
  );
  store.anchorY[unitIndex] = clampWorldCoordinate(
    store.anchorY[unitIndex]! + routeHeadingY * anchorForwardStep,
    world.bounds.height,
  );

  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    const entityId = members[memberIndex]!;
    if (!isFormationParticipant(lifecycleStore, entityId, ordinaryParticipation)) {
      store.movementMode[entityId] = "holdPosition";
      store.stuckTicks[entityId] = 0;
      store.isStuck[entityId] = 0;
      continue;
    }
    const memberMaxStep = store.memberMaxStep[entityId]!;
    const requestedForwardStep = memberMaxStep;
    const allowedForwardStep = getHostileContactForwardStepLimit(
      identityStore,
      store,
      blockerGrid,
      entityId,
      sourceFactionId,
      routeHeadingX,
      routeHeadingY,
      perpX,
      perpY,
      spacing,
      memberMaxStep,
      requestedForwardStep,
      undefined,
      diagnostics,
    );
    const currentX = world.positionsX[entityId]!;
    const currentY = world.positionsY[entityId]!;
    const lateralStep = routingLateralStep(
      store,
      unitIndex,
      unitId,
      entityId,
      currentX,
      currentY,
      perpX,
      perpY,
      spacing,
      memberMaxStep,
    );
    const nextX = clampWorldCoordinate(
      currentX + routeHeadingX * allowedForwardStep + perpX * lateralStep,
      world.bounds.width,
    );
    const nextY = clampWorldCoordinate(
      currentY + routeHeadingY * allowedForwardStep + perpY * lateralStep,
      world.bounds.height,
    );
    const moved = nextX !== currentX || nextY !== currentY;

    if (moved) {
      recordRoutingMemberPassThroughInteractions(
        identityStore,
        store,
        blockerGrid,
        unitId,
        sourceFactionId,
        entityId,
        nextX,
        nextY,
      );
    }

    world.positionsX[entityId] = nextX;
    world.positionsY[entityId] = nextY;
    store.movementMode[entityId] = moved
      ? "advanceWithUnit"
      : "holdPosition";
    if (store.lastEmittedMovementMode[entityId] !== store.movementMode[entityId]) {
      store.lastEmittedMovementMode[entityId] = store.movementMode[entityId];
      events.push({
        kind: "individual_movement_mode",
        entityId,
        mode: store.movementMode[entityId],
      });
    }
    if (store.isStuck[entityId] === 1) {
      store.isStuck[entityId] = 0;
      events.push({ kind: "stuck_recovered", entityId });
    }
    store.stuckTicks[entityId] = 0;
  }
}

function getRoutingAnchorForwardStep(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  sourceFactionId: number,
  members: readonly number[],
  routeHeadingX: number,
  routeHeadingY: number,
  perpX: number,
  perpY: number,
  spacing: number,
  requestedAnchorStep: number,
  diagnostics?: FormationTickDiagnostics,
  lifecycleStore?: IndividualCasualtyLifecycleStore,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): number {
  let allowedAnchorStep = requestedAnchorStep;
  for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
    const entityId = members[memberIndex]!;
    if (!isFormationParticipant(lifecycleStore, entityId, ordinaryParticipation)) continue;
    const hostileQueryStep = Math.max(
      store.memberMaxStep[entityId]!,
      requestedAnchorStep,
    );
    const allowedMemberAnchorStep = getHostileContactForwardStepLimit(
      identityStore,
      store,
      blockerGrid,
      entityId,
      sourceFactionId,
      routeHeadingX,
      routeHeadingY,
      perpX,
      perpY,
      spacing,
      hostileQueryStep,
      requestedAnchorStep,
      undefined,
      diagnostics,
    );
    if (allowedMemberAnchorStep < allowedAnchorStep) {
      allowedAnchorStep = allowedMemberAnchorStep;
    }
  }
  return allowedAnchorStep;
}

function routingLateralStep(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  unitId: UnitId,
  entityId: number,
  currentX: number,
  currentY: number,
  perpX: number,
  perpY: number,
  spacing: number,
  memberMaxStep: number,
): number {
  if (memberMaxStep === 0) {
    return 0;
  }
  const halfSpread = Math.max(1, Math.floor(spacing / 2));
  const phase = (unitId + entityId) % 3;
  const targetLateral = phase === 0 ? -halfSpread : phase === 1 ? 0 : halfSpread;
  const currentLateral =
    (currentX - store.anchorX[unitIndex]!) * perpX +
    (currentY - store.anchorY[unitIndex]!) * perpY;
  return clampComponent(
    targetLateral - currentLateral,
    Math.min(memberMaxStep, ROUTING_LATERAL_CORRECTION_MAX_STEP),
  );
}

function clampWorldCoordinate(coordinate: number, extent: number): number {
  if (coordinate < 0) return 0;
  const maximum = extent - 1;
  return coordinate > maximum ? maximum : coordinate;
}

function recordRoutingMemberPassThroughInteractions(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  routerUnitId: UnitId,
  routerFactionId: number,
  routerEntityId: number,
  endX: number,
  endY: number,
): void {
  if (blockerGrid === undefined) {
    return;
  }
  const startX = store.contactSnapshotPositionsX[routerEntityId]!;
  const startY = store.contactSnapshotPositionsY[routerEntityId]!;
  const queryRadius = Math.ceil(
    Math.hypot(endX - startX, endY - startY) +
      ROUTING_PASS_THROUGH_PROXIMITY_DISTANCE,
  );
  const nearbyEntityIds = queryEntitiesWithinRadiusInto(
    blockerGrid,
    startX,
    startY,
    queryRadius,
    store.scratchNearbyEntityIds,
  );

  for (let index = 0; index < nearbyEntityIds.length; index += 1) {
    const targetEntityId = nearbyEntityIds[index]!;
    if (targetEntityId === routerEntityId) continue;
    const targetUnitId = getUnitIdForEntity(identityStore, targetEntityId);
    if (
      targetUnitId === routerUnitId ||
      getFactionIdForUnit(identityStore, targetUnitId) !== routerFactionId
    ) {
      continue;
    }
    if (
      !segmentEntersRoutingProximity(
        startX,
        startY,
        endX,
        endY,
        store.contactSnapshotPositionsX[targetEntityId]!,
        store.contactSnapshotPositionsY[targetEntityId]!,
      )
    ) {
      continue;
    }
    recordRoutingPassThroughPair(store, routerUnitId, targetUnitId);
  }
}

function segmentEntersRoutingProximity(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  pointX: number,
  pointY: number,
): boolean {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) return false;

  const pointXFromStart = pointX - startX;
  const pointYFromStart = pointY - startY;
  const projection =
    pointXFromStart * segmentX + pointYFromStart * segmentY;
  const radiusSquared =
    ROUTING_PASS_THROUGH_PROXIMITY_DISTANCE *
    ROUTING_PASS_THROUGH_PROXIMITY_DISTANCE;

  if (projection <= 0) {
    return (
      pointXFromStart * pointXFromStart +
        pointYFromStart * pointYFromStart <=
      radiusSquared
    );
  }
  if (projection >= segmentLengthSquared) {
    const pointXFromEnd = pointX - endX;
    const pointYFromEnd = pointY - endY;
    return (
      pointXFromEnd * pointXFromEnd + pointYFromEnd * pointYFromEnd <=
      radiusSquared
    );
  }

  const cross = pointXFromStart * segmentY - pointYFromStart * segmentX;
  return cross * cross <= radiusSquared * segmentLengthSquared;
}

function recordRoutingPassThroughPair(
  store: InternalFormationBehaviourStore,
  routerUnitId: UnitId,
  targetUnitId: UnitId,
): void {
  for (let index = 0; index < store.routingPassThroughCount; index += 1) {
    if (
      store.routingPassThroughRouterUnitIds[index]! === routerUnitId &&
      store.routingPassThroughTargetUnitIds[index]! === targetUnitId
    ) {
      return;
    }
  }
  if (
    store.routingPassThroughCount >=
    MAX_ROUTING_PASS_THROUGH_INTERACTIONS_PER_TICK
  ) {
    return;
  }
  const index = store.routingPassThroughCount;
  store.routingPassThroughRouterUnitIds[index] = routerUnitId;
  store.routingPassThroughTargetUnitIds[index] = targetUnitId;
  store.routingPassThroughCount = index + 1;
}

function collectRoutingPassThroughInteractions(
  store: InternalFormationBehaviourStore,
): readonly RoutingPassThroughInteraction[] {
  if (store.routingPassThroughCount === 0) {
    return NO_ROUTING_PASS_THROUGH_INTERACTIONS;
  }
  const interactions: RoutingPassThroughInteraction[] = [];
  for (let index = 0; index < store.routingPassThroughCount; index += 1) {
    interactions.push({
      routerUnitId: store.routingPassThroughRouterUnitIds[index]!,
      targetUnitId: store.routingPassThroughTargetUnitIds[index]!,
    });
  }
  return interactions;
}

function computeLooseFlowLateralOffset(
  world: WorldState,
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  entityId: number,
  slotCol: number,
  centerCol: number,
  spacing: number,
  slotX: number,
  slotY: number,
  perpX: number,
  perpY: number,
): number {
  if (store.activeBlockerDistance[unitIndex]! < 0) {
    return 0;
  }

  const preferredSide = choosePreferredLooseFlowSide(
    store,
    unitIndex,
    entityId,
    slotCol,
    centerCol,
  );
  const preferredOffset = spacing * preferredSide;
  if (
    isInsideWorldBounds(
      world,
      slotX + perpX * preferredOffset,
      slotY + perpY * preferredOffset,
    )
  ) {
    return preferredOffset;
  }

  const alternateSide: -1 | 1 = preferredSide === 1 ? -1 : 1;
  const alternateOffset = spacing * alternateSide;
  if (
    isInsideWorldBounds(
      world,
      slotX + perpX * alternateOffset,
      slotY + perpY * alternateOffset,
    )
  ) {
    return alternateOffset;
  }

  return 0;
}

function choosePreferredLooseFlowSide(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  entityId: number,
  slotCol: number,
  centerCol: number,
): -1 | 1 {
  const lateralOffset = store.activeBlockerLateralOffset[unitIndex]!;
  if (lateralOffset > 0) return -1;
  if (lateralOffset < 0) return 1;
  if (slotCol < centerCol) return -1;
  if (slotCol > centerCol) return 1;
  return entityId % 2 === 0 ? -1 : 1;
}
function shouldAdvanceUnitAnchor(
  isAdvancing: boolean,
  style: UnitMovementStyle,
): boolean {
  return (
    isAdvancing &&
    style !== "formedDetour" &&
    style !== "haltAndWait" &&
    !isHostileContactMovementStyle(style)
  );
}

function moveAnchorBackward(
  world: WorldState,
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  unitSpeed: number,
  headingX: number,
  headingY: number,
): void {
  if (unitSpeed <= 0) return;

  store.anchorX[unitIndex] = clampWorldCoordinate(
    store.anchorX[unitIndex]! - headingX * unitSpeed,
    world.bounds.width,
  );
  store.anchorY[unitIndex] = clampWorldCoordinate(
    store.anchorY[unitIndex]! - headingY * unitSpeed,
    world.bounds.height,
  );
}

function sidestepFormedDetourAnchor(
  world: WorldState,
  store: InternalFormationBehaviourStore,
  unitId: UnitId,
  unitIndex: number,
  unitSpeed: number,
  headingX: number,
  headingY: number,
): void {
  if (
    unitSpeed <= 0 ||
    store.activeBlockerDistance[unitIndex]! < 0
  ) {
    return;
  }

  const perpX = -headingY;
  const perpY = headingX;
  const preferredSide = choosePreferredDetourSide(store, unitIndex, unitId);
  if (
    tryMoveAnchorLateral(
      world,
      store,
      unitIndex,
      perpX,
      perpY,
      unitSpeed,
      preferredSide,
    )
  ) {
    return;
  }

  const alternateSide: -1 | 1 = preferredSide === 1 ? -1 : 1;
  tryMoveAnchorLateral(
    world,
    store,
    unitIndex,
    perpX,
    perpY,
    unitSpeed,
    alternateSide,
  );
}

function choosePreferredDetourSide(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  unitId: UnitId,
): -1 | 1 {
  const lateralOffset = store.activeBlockerLateralOffset[unitIndex]!;
  if (lateralOffset > 0) return -1;
  if (lateralOffset < 0) return 1;
  return unitId % 2 === 0 ? 1 : -1;
}

function tryMoveAnchorLateral(
  world: WorldState,
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  perpX: number,
  perpY: number,
  unitSpeed: number,
  side: -1 | 1,
): boolean {
  const nextAnchorX = store.anchorX[unitIndex]! + perpX * unitSpeed * side;
  const nextAnchorY = store.anchorY[unitIndex]! + perpY * unitSpeed * side;
  if (!isInsideWorldBounds(world, nextAnchorX, nextAnchorY)) {
    return false;
  }

  store.anchorX[unitIndex] = nextAnchorX;
  store.anchorY[unitIndex] = nextAnchorY;
  return true;
}

function isInsideWorldBounds(
  world: WorldState,
  x: number,
  y: number,
): boolean {
  return x >= 0 && y >= 0 && x <= world.bounds.width && y <= world.bounds.height;
}

function getActiveBlockerForwardLimit(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  style: UnitMovementStyle,
): number {
  if (style !== "haltAndWait" && !isHostileContactMovementStyle(style)) {
    return NO_ACTIVE_BLOCKER_DISTANCE;
  }

  const blockerDistance = store.activeBlockerDistance[unitIndex]!;
  if (blockerDistance < 0) {
    return NO_ACTIVE_BLOCKER_DISTANCE;
  }

  return Math.max(0, blockerDistance - hostileContactGapForStyle(style));
}

/** Authoritative 4B contact signal for all formation hostile-contact styles. */
export function isHostileContactMovementStyle(style: UnitMovementStyle): boolean {
  return (
    style === "engageFront" ||
    style === "strainedEngage" ||
    style === "shakenEngage" ||
    style === "giveGround"
  );
}

function hostileContactGapForStyle(style: UnitMovementStyle): number {
  return style === "strainedEngage" ||
    style === "shakenEngage" ||
    style === "giveGround"
    ? RAGGED_CONTACT_GAP
    : FRONT_CONTACT_GAP;
}

function prepareBlockerGrid(
  store: InternalFormationBehaviourStore,
  world: WorldState,
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot | undefined,
): SpatialGrid {
  let grid = store.blockerGrid;
  if (
    grid === undefined ||
    grid.bounds.width !== world.bounds.width ||
    grid.bounds.height !== world.bounds.height ||
    grid.capacity < world.entityCount
  ) {
    grid = createSpatialGrid({
      bounds: world.bounds,
      cellSize: BLOCKER_GRID_CELL_SIZE,
      capacity: world.entityCount,
    });
    store.blockerGrid = grid;
  }

  buildSpatialGrid(
    grid,
    world,
    (entityId) =>
      (lifecycleStore === undefined ||
        isIndividualCharacterActive(lifecycleStore, entityId)) &&
      isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId),
  );
  snapshotFormationTickStart(store, world);
  return grid;
}

function snapshotFormationTickStart(
  store: InternalFormationBehaviourStore,
  world: WorldState,
): void {
  for (let entityIndex = 0; entityIndex < world.entityCount; entityIndex += 1) {
    store.contactSnapshotPositionsX[entityIndex] = world.positionsX[entityIndex]!;
    store.contactSnapshotPositionsY[entityIndex] = world.positionsY[entityIndex]!;
  }
  for (let unitIndex = 0; unitIndex < store.unitCount; unitIndex += 1) {
    store.anchorSnapshotX[unitIndex] = store.anchorX[unitIndex]!;
    store.anchorSnapshotY[unitIndex] = store.anchorY[unitIndex]!;
  }
}

/**
 * Returns the maximum legal positive forward movement for a member against
 * nearby hostile bodies. The midpoint cap uses tick-start positions, so two
 * fighters advancing toward one another cannot swap sides because their units
 * happen to be processed in a particular order.
 */
function getHostileContactForwardStepLimit(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  entityId: number,
  sourceFactionId: number,
  headingX: number,
  headingY: number,
  perpX: number,
  perpY: number,
  spacing: number,
  memberMaxStep: number,
  requestedForwardStep: number,
  contactGap = FRONT_CONTACT_GAP,
  diagnostics?: FormationTickDiagnostics,
): number {
  if (blockerGrid === undefined || requestedForwardStep <= 0) {
    return requestedForwardStep;
  }

  const queryRadius = getHostileContactQueryRadius(
    spacing,
    memberMaxStep,
    contactGap,
  );
  const sourceX = store.contactSnapshotPositionsX[entityId]!;
  const sourceY = store.contactSnapshotPositionsY[entityId]!;
  const nearbyEntityIds = queryEntitiesWithinRadiusInto(
    blockerGrid,
    sourceX,
    sourceY,
    queryRadius,
    store.scratchNearbyEntityIds,
  );
  if (diagnostics !== undefined) {
    diagnostics.hostileContactQueries += 1;
    diagnostics.hostileContactCandidateEntities += nearbyEntityIds.length;
  }
  let maximumForwardStep = requestedForwardStep;

  for (let index = 0; index < nearbyEntityIds.length; index += 1) {
    const candidateEntityId = nearbyEntityIds[index]!;
    if (candidateEntityId === entityId) {
      continue;
    }

    const candidateUnitId = getUnitIdForEntity(
      identityStore,
      candidateEntityId,
    );
    if (
      getFactionIdForUnit(identityStore, candidateUnitId) === sourceFactionId
    ) {
      continue;
    }

    const relativeX =
      store.contactSnapshotPositionsX[candidateEntityId]! - sourceX;
    const relativeY =
      store.contactSnapshotPositionsY[candidateEntityId]! - sourceY;
    const forwardDistance = relativeX * headingX + relativeY * headingY;
    if (forwardDistance < 0) {
      continue;
    }

    const lateralDistance = Math.abs(relativeX * perpX + relativeY * perpY);
    const lateralContactLimit =
      spacing * HOSTILE_CONTACT_LATERAL_SPACING_MULTIPLIER;
    if (lateralDistance > lateralContactLimit) {
      continue;
    }

    const midpointForwardStep = Math.max(
      0,
      Math.floor((forwardDistance - contactGap) / 2),
    );
    if (midpointForwardStep < maximumForwardStep) {
      maximumForwardStep = midpointForwardStep;
    }
  }

  return maximumForwardStep;
}

function getHostileContactQueryRadius(
  spacing: number,
  memberMaxStep: number,
  contactGap = FRONT_CONTACT_GAP,
): number {
  return Math.ceil(
    Math.hypot(
      memberMaxStep * 2 + contactGap,
      spacing * HOSTILE_CONTACT_LATERAL_SPACING_MULTIPLIER,
    ),
  );
}

function anchorMovementScaleForMorale(
  state: MoraleMovementState,
): number {
  switch (state) {
    case "steady":
    case "routing":
      // 4E routes before normal formation scaling reaches this branch.
      return MORALE_MOVEMENT_SCALE;
    case "strained":
      return STRAINED_MOVEMENT_SCALE;
    case "shaken":
      return SHAKEN_MOVEMENT_SCALE;
    case "wavering":
    case "recovering":
      return 0;
  }
}

function correctionMovementScaleForMorale(
  state: MoraleMovementState,
): number {
  switch (state) {
    case "steady":
    case "routing":
      return MORALE_MOVEMENT_SCALE;
    case "strained":
      return STRAINED_MOVEMENT_SCALE;
    case "shaken":
      return SHAKEN_MOVEMENT_SCALE;
    case "wavering":
      return WAVERING_CORRECTION_SCALE;
    case "recovering":
      return RECOVERING_CORRECTION_SCALE;
  }
}

/**
 * Integer carry preserves fractional morale speed reductions across ticks.
 * At scale 850, a configured speed of one advances 17 cells in 20 ticks,
 * rather than being truncated to zero every tick.
 */
function scaleMovementStepWithRemainder(
  configuredStep: number,
  scale: number,
  remainders: Int32Array,
  index: number,
): number {
  if (scale === MORALE_MOVEMENT_SCALE) {
    remainders[index] = 0;
    return configuredStep;
  }
  if (scale === 0 || configuredStep === 0) {
    remainders[index] = 0;
    return 0;
  }

  const scaledWithRemainder =
    configuredStep * scale + remainders[index]!;
  const effectiveStep = Math.floor(
    scaledWithRemainder / MORALE_MOVEMENT_SCALE,
  );
  remainders[index] = scaledWithRemainder % MORALE_MOVEMENT_SCALE;
  return effectiveStep;
}

function chooseUnitMovementStyle(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitId: UnitId,
  unitIndex: number,
  isAdvancing: boolean,
  moraleMovementState: MoraleMovementState,
  diagnostics: FormationTickDiagnostics | undefined,
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot | undefined,
): UnitMovementStyle {
  if (!isAdvancing) {
    store.styleCommitmentTicksRemaining[unitIndex] = 0;
    store.blockerReleaseTicksRemaining[unitIndex] = 0;
    clearActiveBlocker(store, unitIndex);
    return "orderedHalt";
  }

  if (blockerGrid === undefined) {
    clearActiveBlocker(store, unitIndex);
    return applyStyleCommitment(store, unitIndex, "formedMarch");
  }

  const blocker = detectForwardBlocker(
    identityStore,
    store,
    blockerGrid,
    unitId,
    unitIndex,
    diagnostics,
  );
  if (blocker === undefined) {
    clearActiveBlocker(store, unitIndex);
    return applyStyleCommitment(store, unitIndex, "formedMarch");
  }
  store.activeBlockerUnitId[unitIndex] = blocker.unitId;
  store.activeBlockerDistance[unitIndex] = blocker.distance;
  store.activeBlockerLateralOffset[unitIndex] = blocker.lateralOffset;

  let candidateStyle: UnitMovementStyle;
  if (blocker.relationship === "hostile") {
    candidateStyle = hostileContactStyleForMorale(moraleMovementState);
  } else {
    candidateStyle = chooseAlliedBlockerStyle(
      identityStore,
      store,
      unitId,
      unitIndex,
      lifecycleStore,
      ordinaryParticipation,
    );
  }

  return applyStyleCommitment(store, unitIndex, candidateStyle);
}

function clearActiveBlocker(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
): void {
  store.activeBlockerUnitId[unitIndex] = NO_ACTIVE_BLOCKER_UNIT_ID;
  store.activeBlockerDistance[unitIndex] = NO_ACTIVE_BLOCKER_DISTANCE;
  store.activeBlockerLateralOffset[unitIndex] = 0;
}

function applyPushThroughDisruption(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  sourceUnitId: UnitId,
  sourceUnitIndex: number,
): void {
  const blockerUnitId = store.activeBlockerUnitId[sourceUnitIndex]!;
  if (blockerUnitId === NO_ACTIVE_BLOCKER_UNIT_ID) {
    return;
  }

  const blockerUnitIndex = requireUnitIndex(store, blockerUnitId);
  reduceUnitCohesion(
    store,
    sourceUnitIndex,
    PUSH_THROUGH_SOURCE_COHESION_LOSS,
  );
  reduceUnitCohesion(
    store,
    blockerUnitIndex,
    PUSH_THROUGH_BLOCKER_COHESION_LOSS,
  );
  increaseMemberPressure(
    store,
    getUnitMembers(identityStore, sourceUnitId),
    PUSH_THROUGH_SOURCE_PRESSURE_GAIN,
  );
  increaseMemberPressure(
    store,
    getUnitMembers(identityStore, blockerUnitId),
    PUSH_THROUGH_BLOCKER_PRESSURE_GAIN,
  );
}

function reduceUnitCohesion(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  amount: number,
): void {
  const cohesion = store.cohesion[unitIndex]!;
  store.cohesion[unitIndex] = cohesion > amount ? cohesion - amount : 0;
}

function increaseMemberPressure(
  store: InternalFormationBehaviourStore,
  members: readonly number[],
  amount: number,
): void {
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    store.pressure[entityId] = increaseIntegerState(
      store.pressure[entityId]!,
      amount,
    );
  }
}

interface ForwardBlocker {
  readonly unitId: UnitId;
  readonly relationship: "allied" | "hostile";
  readonly distance: number;
  readonly lateralOffset: number;
}

interface ForwardPathBlock {
  readonly distance: number;
  readonly lateralOffset: number;
}

function detectForwardBlocker(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid,
  unitId: UnitId,
  unitIndex: number,
  diagnostics: FormationTickDiagnostics | undefined,
): ForwardBlocker | undefined {
  const anchorX = store.anchorX[unitIndex]!;
  const anchorY = store.anchorY[unitIndex]!;
  const headingX = store.headingX[unitIndex]!;
  const headingY = store.headingY[unitIndex]!;
  const spacing = store.spacing[unitIndex]!;
  const rows = store.rows[unitIndex]!;
  const cols = store.cols[unitIndex]!;
  const unitSpeed = store.unitSpeed[unitIndex]!;
  const searchDepth = computeForwardSearchDepth(spacing, rows, unitSpeed);
  const sourceHalfWidth = computeFormationHalfWidth(spacing, cols);
  const queryX = anchorX + headingX * Math.floor(searchDepth / 2);
  const queryY = anchorY + headingY * Math.floor(searchDepth / 2);
  const queryRadius = searchDepth + sourceHalfWidth + spacing * 2;
  const nearbyEntityIds = queryEntitiesWithinRadiusInto(
    blockerGrid,
    queryX,
    queryY,
    queryRadius,
    store.scratchNearbyEntityIds,
  );
  const candidateUnitIds = collectCandidateUnitIds(
    identityStore,
    unitId,
    nearbyEntityIds,
    store.scratchCandidateUnitIds,
  );
  if (diagnostics !== undefined) {
    diagnostics.blockerDetectionQueries += 1;
    diagnostics.blockerDetectionCandidateEntities += nearbyEntityIds.length;
    diagnostics.blockerDetectionUniqueCandidateUnits += candidateUnitIds.length;
  }
  const sourceFactionId = getFactionIdForUnit(identityStore, unitId);
  let selectedBlocker: ForwardBlocker | undefined;

  for (let index = 0; index < candidateUnitIds.length; index += 1) {
    const candidateUnitId = candidateUnitIds[index]!;
    const candidateUnitIndex = requireUnitIndex(store, candidateUnitId);
    const block = getForwardPathBlock(
      store,
      candidateUnitIndex,
      anchorX,
      anchorY,
      headingX,
      headingY,
      sourceHalfWidth,
      searchDepth,
    );
    if (block === undefined) {
      continue;
    }

    const relationship =
      getFactionIdForUnit(identityStore, candidateUnitId) === sourceFactionId
        ? "allied"
        : "hostile";
    const candidateBlocker: ForwardBlocker = {
      unitId: candidateUnitId,
      relationship,
      distance: block.distance,
      lateralOffset: block.lateralOffset,
    };
    if (isBetterBlocker(candidateBlocker, selectedBlocker)) {
      selectedBlocker = candidateBlocker;
    }
  }

  return selectedBlocker;
}

function collectCandidateUnitIds(
  identityStore: UnitIdentityStore,
  sourceUnitId: UnitId,
  entityIds: readonly number[],
  out: UnitId[],
): UnitId[] {
  out.length = 0;

  for (let index = 0; index < entityIds.length; index += 1) {
    const candidateUnitId = getUnitIdForEntity(identityStore, entityIds[index]!);
    if (candidateUnitId === sourceUnitId) {
      continue;
    }

    let alreadyCollected = false;
    for (let outIndex = 0; outIndex < out.length; outIndex += 1) {
      if (out[outIndex] === candidateUnitId) {
        alreadyCollected = true;
        break;
      }
    }

    if (!alreadyCollected) {
      out.push(candidateUnitId);
    }
  }

  return out;
}

function getForwardPathBlock(
  store: InternalFormationBehaviourStore,
  candidateUnitIndex: number,
  sourceAnchorX: number,
  sourceAnchorY: number,
  sourceHeadingX: number,
  sourceHeadingY: number,
  sourceHalfWidth: number,
  searchDepth: number,
): ForwardPathBlock | undefined {
  const candidateAnchorX = store.anchorX[candidateUnitIndex]!;
  const candidateAnchorY = store.anchorY[candidateUnitIndex]!;
  const candidateHeadingX = store.headingX[candidateUnitIndex]!;
  const candidateHeadingY = store.headingY[candidateUnitIndex]!;
  const candidateSpacing = store.spacing[candidateUnitIndex]!;
  const lastRow = store.rows[candidateUnitIndex]! - 1;
  const lastCol = store.cols[candidateUnitIndex]! - 1;
  const centerCol = Math.floor(store.cols[candidateUnitIndex]! / 2);
  const candidatePerpX = -candidateHeadingY;
  const candidatePerpY = candidateHeadingX;
  const sourcePerpX = -sourceHeadingY;
  const sourcePerpY = sourceHeadingX;
  let minForward = Number.MAX_SAFE_INTEGER;
  let maxForward = Number.MIN_SAFE_INTEGER;
  let minLateral = Number.MAX_SAFE_INTEGER;
  let maxLateral = Number.MIN_SAFE_INTEGER;

  for (let corner = 0; corner < 4; corner += 1) {
    const row = corner < 2 ? 0 : lastRow;
    const col = corner % 2 === 0 ? 0 : lastCol;
    const backward = row * candidateSpacing;
    const lateral = (col - centerCol) * candidateSpacing;
    const slotX =
      candidateAnchorX -
      candidateHeadingX * backward +
      candidatePerpX * lateral;
    const slotY =
      candidateAnchorY -
      candidateHeadingY * backward +
      candidatePerpY * lateral;
    const relativeX = slotX - sourceAnchorX;
    const relativeY = slotY - sourceAnchorY;
    const forward = relativeX * sourceHeadingX + relativeY * sourceHeadingY;
    const lateralProjection =
      relativeX * sourcePerpX + relativeY * sourcePerpY;

    if (forward < minForward) minForward = forward;
    if (forward > maxForward) maxForward = forward;
    if (lateralProjection < minLateral) minLateral = lateralProjection;
    if (lateralProjection > maxLateral) maxLateral = lateralProjection;
  }

  const padding = Math.floor(candidateSpacing / 2);
  minForward -= padding;
  maxForward += padding;
  minLateral -= padding;
  maxLateral += padding;

  if (maxForward < 0 || minForward > searchDepth) {
    return undefined;
  }

  if (maxLateral < -sourceHalfWidth || minLateral > sourceHalfWidth) {
    return undefined;
  }

  return {
    distance: Math.max(0, minForward),
    lateralOffset: Math.trunc((minLateral + maxLateral) / 2),
  };
}

function isBetterBlocker(
  candidate: ForwardBlocker,
  selected: ForwardBlocker | undefined,
): boolean {
  if (selected === undefined) {
    return true;
  }

  if (candidate.relationship !== selected.relationship) {
    return candidate.relationship === "hostile";
  }

  if (candidate.distance !== selected.distance) {
    return candidate.distance < selected.distance;
  }

  return candidate.unitId < selected.unitId;
}

function chooseAlliedBlockerStyle(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  unitId: UnitId,
  unitIndex: number,
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot | undefined,
): UnitMovementStyle {
  const members = getUnitMembers(identityStore, unitId);
  const averageConfidence = computeAverageActiveConfidence(
    store,
    members,
    lifecycleStore,
    ordinaryParticipation,
  );
  const averagePressure = computeAverageActivePressure(
    store,
    members,
    lifecycleStore,
    ordinaryParticipation,
  );
  const cohesion = store.cohesion[unitIndex]!;

  if (
    averageConfidence <= LOW_CONFIDENCE_THRESHOLD ||
    averagePressure >= HIGH_PRESSURE_THRESHOLD
  ) {
    return "haltAndWait";
  }

  if (
    averageConfidence >= HIGH_CONFIDENCE_THRESHOLD &&
    cohesion >= PUSH_THROUGH_COHESION_THRESHOLD
  ) {
    return "pushThrough";
  }

  if (cohesion <= LOW_COHESION_THRESHOLD) {
    return "looseFlow";
  }

  if (cohesion >= FORMED_COHESION_THRESHOLD) {
    return "formedDetour";
  }

  return "haltAndWait";
}

function applyStyleCommitment(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  candidateStyle: UnitMovementStyle,
): UnitMovementStyle {
  const currentStyle = store.unitMovementStyle[unitIndex]!;

  if (!isBlockerArbitrationStyle(candidateStyle)) {
    store.styleCommitmentTicksRemaining[unitIndex] = 0;
    return releaseBlockerStyleIfReady(store, unitIndex, currentStyle);
  }

  store.blockerReleaseTicksRemaining[unitIndex] = BLOCKER_STYLE_RELEASE_TICKS;

  if (!isBlockerArbitrationStyle(currentStyle)) {
    store.styleCommitmentTicksRemaining[unitIndex] =
      BLOCKER_STYLE_COMMITMENT_TICKS;
    return candidateStyle;
  }

  if (
    currentStyle !== candidateStyle &&
    getBlockerStyleRelationship(currentStyle) ===
      getBlockerStyleRelationship(candidateStyle)
  ) {
    const commitmentTicks = store.styleCommitmentTicksRemaining[unitIndex]!;
    if (commitmentTicks > 0) {
      store.styleCommitmentTicksRemaining[unitIndex] = commitmentTicks - 1;
      return currentStyle;
    }
  }

  if (currentStyle !== candidateStyle) {
    store.styleCommitmentTicksRemaining[unitIndex] =
      BLOCKER_STYLE_COMMITMENT_TICKS;
    return candidateStyle;
  }

  const commitmentTicks = store.styleCommitmentTicksRemaining[unitIndex]!;
  if (commitmentTicks > 0) {
    store.styleCommitmentTicksRemaining[unitIndex] = commitmentTicks - 1;
  }
  return currentStyle;
}

function releaseBlockerStyleIfReady(
  store: InternalFormationBehaviourStore,
  unitIndex: number,
  currentStyle: UnitMovementStyle,
): UnitMovementStyle {
  if (!isBlockerArbitrationStyle(currentStyle)) {
    store.blockerReleaseTicksRemaining[unitIndex] = 0;
    return "formedMarch";
  }

  const releaseTicks = store.blockerReleaseTicksRemaining[unitIndex]!;
  if (releaseTicks > 0) {
    store.blockerReleaseTicksRemaining[unitIndex] = releaseTicks - 1;
    return currentStyle;
  }

  return "formedMarch";
}

function isBlockerArbitrationStyle(style: UnitMovementStyle): boolean {
  return (
    style === "formedDetour" ||
    style === "looseFlow" ||
    style === "pushThrough" ||
    style === "haltAndWait" ||
    isHostileContactMovementStyle(style)
  );
}

function hostileContactStyleForMorale(
  state: MoraleMovementState,
): UnitMovementStyle {
  switch (state) {
    case "steady":
      return "engageFront";
    case "strained":
      return "strainedEngage";
    case "shaken":
      return "shakenEngage";
    case "wavering":
      return "giveGround";
    case "routing":
    case "recovering":
      throw new Error("Routing and recovering bypass hostile contact styling.");
  }
}

function getBlockerStyleRelationship(
  style: UnitMovementStyle,
): "allied" | "hostile" {
  return isHostileContactMovementStyle(style) ? "hostile" : "allied";
}

function computeAverageActiveConfidence(
  store: InternalFormationBehaviourStore,
  members: readonly number[],
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot | undefined,
): number {
  let total = 0;
  let count = 0;
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (!isFormationParticipant(lifecycleStore, entityId, ordinaryParticipation)) continue;
    total += store.confidence[entityId]!;
    count += 1;
  }
  return count === 0 ? 0 : Math.trunc(total / count);
}

function computeAverageActivePressure(
  store: InternalFormationBehaviourStore,
  members: readonly number[],
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation: IndividualOrdinaryParticipationSnapshot | undefined,
): number {
  let total = 0;
  let count = 0;
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    if (!isFormationParticipant(lifecycleStore, entityId, ordinaryParticipation)) continue;
    total += store.pressure[entityId]!;
    count += 1;
  }
  return count === 0 ? 0 : Math.trunc(total / count);
}

function isFormationParticipant(
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  entityId: number,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): boolean {
  return (
    (lifecycleStore === undefined ||
      isIndividualCharacterActive(lifecycleStore, entityId)) &&
    isIndividualOrdinaryParticipationEligible(ordinaryParticipation, entityId)
  );
}

function hasFormationParticipant(
  members: readonly number[],
  lifecycleStore: IndividualCasualtyLifecycleStore | undefined,
  ordinaryParticipation?: IndividualOrdinaryParticipationSnapshot,
): boolean {
  for (let index = 0; index < members.length; index += 1) {
    if (isFormationParticipant(lifecycleStore, members[index]!, ordinaryParticipation)) return true;
  }
  return false;
}

function computeForwardSearchDepth(
  spacing: number,
  rows: number,
  unitSpeed: number,
): number {
  const ownDepth = rows * spacing;
  const movementLookahead = unitSpeed + spacing * 2;
  return Math.max(ownDepth, movementLookahead);
}

function computeFormationHalfWidth(spacing: number, cols: number): number {
  return Math.floor(((cols - 1) * spacing) / 2) + Math.floor(spacing / 2);
}

function decideMode(
  order: UnitOrder,
  stepX: number,
  stepY: number,
): MovementMode {
  if (order === "hold") {
    return stepX === 0 && stepY === 0 ? "holdPosition" : "moveToFormationSlot";
  }
  return "advanceWithUnit";
}

function forwardProgress(
  x: number,
  y: number,
  anchorX: number,
  anchorY: number,
  headingX: number,
  headingY: number,
): number {
  return (x - anchorX) * headingX + (y - anchorY) * headingY;
}

function clampComponent(delta: number, maxStep: number): number {
  if (delta > maxStep) return maxStep;
  if (delta < -maxStep) return -maxStep;
  return delta;
}

function clampIntegerState(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Integer state values must be safe integers.");
  }
  if (value < 0) return 0;
  if (value > MAX_INTEGER_STATE_VALUE) return MAX_INTEGER_STATE_VALUE;
  return value;
}

function increaseIntegerState(current: number, amount: number): number {
  const clampedCurrent = clampIntegerState(current);
  if (amount <= 0) {
    return clampedCurrent;
  }
  if (clampedCurrent > MAX_INTEGER_STATE_VALUE - amount) {
    return MAX_INTEGER_STATE_VALUE;
  }
  return clampedCurrent + amount;
}

function computePressureJitter(
  role: IndividualRole,
  pressure: number,
): number {
  if (pressure <= 0) return 0;
  const divisor =
    role === "recruit" ? 100 : role === "regular" ? 250 : 1000;
  return Math.floor(pressure / divisor);
}

function getMoraleSlotLateralDisruption(
  state: MoraleMovementState,
  entityId: number,
  slotRow: number,
  slotCol: number,
): number {
  switch (state) {
    case "steady":
    case "routing":
    case "recovering":
    case "wavering":
      return 0;
    case "strained":
      return (
        ((entityId + slotRow + slotCol) % 3) - 1
      ) * STRAINED_SLOT_LATERAL_OFFSET;
    case "shaken":
      return (
        ((entityId + slotRow * 2 + slotCol) % 5) - 2
      ) * SHAKEN_SLOT_LATERAL_OFFSET;
  }
}

function getMoraleSlotBackwardDisruption(
  state: MoraleMovementState,
  entityId: number,
  slotRow: number,
  slotCol: number,
): number {
  switch (state) {
    case "steady":
    case "routing":
    case "recovering":
    case "wavering":
      return 0;
    case "strained":
      return (
        (entityId + slotRow * 2 + slotCol) % 2
      ) * STRAINED_SLOT_BACKSTEP;
    case "shaken":
      return (
        (entityId + slotRow + slotCol * 2) % 3
      ) * SHAKEN_SLOT_BACKSTEP;
  }
}

function asInternal(
  store: FormationBehaviourStore,
): InternalFormationBehaviourStore {
  return store as InternalFormationBehaviourStore;
}

function requireUnitIndex(
  store: InternalFormationBehaviourStore,
  unitId: UnitId,
): number {
  const index = store.unitIndexById.get(unitId);
  if (index === undefined) {
    throw new RangeError("Unknown unit ID for formation behaviour store.");
  }
  return index;
}

function validateWorldForBehaviour(
  world: WorldState,
  store: InternalFormationBehaviourStore,
  identityStore: UnitIdentityStore,
): void {
  if (world.entityCount !== store.entityCount) {
    throw new RangeError(
      "World entity count must match formation behaviour entity count.",
    );
  }
  if (identityStore.entityCount !== store.entityCount) {
    throw new RangeError(
      "Identity store entity count must match formation behaviour entity count.",
    );
  }
}

function assertCardinalHeading(headingX: number, headingY: number): void {
  const validComponents =
    Number.isInteger(headingX) &&
    Number.isInteger(headingY) &&
    headingX >= -1 &&
    headingX <= 1 &&
    headingY >= -1 &&
    headingY <= 1;
  const isCardinal =
    (headingX === 0 && (headingY === 1 || headingY === -1)) ||
    (headingY === 0 && (headingX === 1 || headingX === -1));
  if (!validComponents || !isCardinal) {
    throw new RangeError(
      "Heading must be a cardinal unit vector (one axis ±1, the other 0).",
    );
  }
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function assertEntityIdInRange(entityId: number, entityCount: number): void {
  if (
    !Number.isSafeInteger(entityId) ||
    entityId < 0 ||
    entityId >= entityCount
  ) {
    throw new RangeError(
      "entityId must be within the formation behaviour entity count.",
    );
  }
}
