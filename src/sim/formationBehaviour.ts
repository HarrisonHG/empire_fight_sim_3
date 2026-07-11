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
import type { WorldState } from "./types";

export type UnitOrder = "hold" | "advance" | "advanceCautious";
export type IndividualRole = "recruit" | "regular" | "veteran";
export type MovementMode =
  | "holdPosition"
  | "moveToFormationSlot"
  | "advanceWithUnit";

export type UnitMovementStyle =
  | "formedMarch" // Normal advancing style when no blocker changes movement.
  | "orderedHalt" // Explicit hold-order style, distinct from blocker haltAndWait.
  | "formedDetour" // Emitted by Milestone 2B blocker arbitration.
  | "looseFlow" // Emitted by Milestone 2B blocker arbitration.
  | "pushThrough" // Emitted by Milestone 2B blocker arbitration.
  | "haltAndWait" // Emitted by Milestone 2B blocker arbitration.
  | "engageFront"; // 2B style selection only; does not implement combat.

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

export interface FormationTickResult {
  readonly events: readonly FormationEvent[];
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
  readonly orders: UnitOrder[];
  readonly cohesion: Int32Array;
  readonly unitMovementStyle: UnitMovementStyle[];
  readonly styleCommitmentTicksRemaining: Int32Array;
  readonly blockerReleaseTicksRemaining: Int32Array;
  readonly activeBlockerUnitId: Int32Array;
  readonly activeBlockerDistance: Int32Array;
  readonly activeBlockerLateralOffset: Int32Array;

  readonly roles: IndividualRole[];
  readonly slotRow: Int32Array;
  readonly slotCol: Int32Array;
  readonly memberMaxStep: Int32Array;
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
const HOSTILE_CONTACT_LATERAL_SPACING_MULTIPLIER = 2;
const MAX_INTEGER_STATE_VALUE = 0x7fff_ffff;
const PUSH_THROUGH_SOURCE_COHESION_LOSS = 5;
const PUSH_THROUGH_BLOCKER_COHESION_LOSS = 3;
const PUSH_THROUGH_SOURCE_PRESSURE_GAIN = 20;
const PUSH_THROUGH_BLOCKER_PRESSURE_GAIN = 10;

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
    orders: new Array<UnitOrder>(unitCount).fill("hold"),
    cohesion: new Int32Array(unitCount),
    unitMovementStyle: new Array<UnitMovementStyle>(unitCount).fill(
      "orderedHalt",
    ),
    styleCommitmentTicksRemaining: new Int32Array(unitCount),
    blockerReleaseTicksRemaining: new Int32Array(unitCount),
    activeBlockerUnitId: new Int32Array(unitCount),
    activeBlockerDistance: new Int32Array(unitCount),
    activeBlockerLateralOffset: new Int32Array(unitCount),
    roles: new Array<IndividualRole>(config.entityCount).fill("regular"),
    slotRow: new Int32Array(config.entityCount),
    slotCol: new Int32Array(config.entityCount),
    memberMaxStep: new Int32Array(config.entityCount),
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
    store.cohesion[index] = clampIntegerState(
      unitConfig.cohesion ?? DEFAULT_COHESION,
    );
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

export function getIndividualConfidence(
  store: FormationBehaviourStore,
  entityId: number,
): number {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  return internal.confidence[entityId]!;
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
): FormationTickResult {
  const internal = asInternal(store);
  validateWorldForBehaviour(world, internal, identityStore);

  const events: FormationEvent[] = [];
  const unitIds = getUnitIds(identityStore);
  const blockerGrid =
    unitIds.length > 1 ? prepareBlockerGrid(internal, world) : undefined;

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
      events,
    );
  }

  return { events };
}

function processUnit(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitId: UnitId,
  unitIndex: number,
  events: FormationEvent[],
): void {
  const order = store.orders[unitIndex]!;
  const headingX = store.headingX[unitIndex]!;
  const headingY = store.headingY[unitIndex]!;
  const unitSpeed = store.unitSpeed[unitIndex]!;
  const spacing = store.spacing[unitIndex]!;
  const cols = store.cols[unitIndex]!;
  const centerCol = Math.floor(cols / 2);
  const isAdvancing = order === "advance" || order === "advanceCautious";

  const style = chooseUnitMovementStyle(
    identityStore,
    store,
    blockerGrid,
    unitId,
    unitIndex,
    isAdvancing,
  );
  store.unitMovementStyle[unitIndex] = style;
  if (store.lastEmittedUnitStyle[unitIndex] !== style) {
    store.lastEmittedUnitStyle[unitIndex] = style;
    events.push({ kind: "unit_movement_choice", unitId, style });
  }

  if (style === "pushThrough") {
    applyPushThroughDisruption(identityStore, store, unitId, unitIndex);
  }

  if (shouldAdvanceUnitAnchor(isAdvancing, style)) {
    store.anchorX[unitIndex] =
      store.anchorX[unitIndex]! + headingX * unitSpeed;
    store.anchorY[unitIndex] =
      store.anchorY[unitIndex]! + headingY * unitSpeed;
  } else if (isAdvancing && style === "formedDetour") {
    sidestepFormedDetourAnchor(
      world,
      store,
      unitId,
      unitIndex,
      unitSpeed,
      headingX,
      headingY,
    );
  }

  const anchorX = store.anchorX[unitIndex]!;
  const anchorY = store.anchorY[unitIndex]!;

  const members = getUnitMembers(identityStore, unitId);
  if (members.length === 0) {
    return;
  }
  const sourceFactionId = getFactionIdForUnit(identityStore, unitId);

  // Compute max forward progress across allies at the start of this tick.
  // Used to hesitate recruits so they do not become the foremost fighter.
  let maxForwardProgress = -Number.MAX_SAFE_INTEGER;
  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
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

  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    const role = store.roles[entityId]!;
    const slotRow = store.slotRow[entityId]!;
    const slotCol = store.slotCol[entityId]!;
    const memberMaxStep = store.memberMaxStep[entityId]!;
    const pressure = store.pressure[entityId]!;

    const backward = slotRow * spacing;
    const lateral = (slotCol - centerCol) * spacing;
    let memberForwardLimit = blockerForwardLimit;
    if (style === "haltAndWait" && blockerForwardLimit >= 0) {
      memberForwardLimit = Math.min(blockerForwardLimit, -backward);
    }

    let slotX = anchorX - headingX * backward + perpX * lateral;
    let slotY = anchorY - headingY * backward + perpY * lateral;
    if (style === "engageFront" && slotRow === 0 && blockerForwardLimit >= 0) {
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

    const jitterMag = computePressureJitter(role, pressure);
    if (jitterMag > 0) {
      slotX += store.rng.nextIntInclusive(-jitterMag, jitterMag);
      slotY += store.rng.nextIntInclusive(-jitterMag, jitterMag);
    }

    const posX = world.positionsX[entityId]!;
    const posY = world.positionsY[entityId]!;
    const deltaX = slotX - posX;
    const deltaY = slotY - posY;

    let stepX = clampComponent(deltaX, memberMaxStep);
    let stepY = clampComponent(deltaY, memberMaxStep);

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
    style !== "engageFront"
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
  if (style !== "haltAndWait" && style !== "engageFront") {
    return NO_ACTIVE_BLOCKER_DISTANCE;
  }

  const blockerDistance = store.activeBlockerDistance[unitIndex]!;
  if (blockerDistance < 0) {
    return NO_ACTIVE_BLOCKER_DISTANCE;
  }

  return Math.max(0, blockerDistance - FRONT_CONTACT_GAP);
}

function prepareBlockerGrid(
  store: InternalFormationBehaviourStore,
  world: WorldState,
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

  buildSpatialGrid(grid, world);
  for (let entityIndex = 0; entityIndex < world.entityCount; entityIndex += 1) {
    store.contactSnapshotPositionsX[entityIndex] = world.positionsX[entityIndex]!;
    store.contactSnapshotPositionsY[entityIndex] = world.positionsY[entityIndex]!;
  }
  return grid;
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
): number {
  if (blockerGrid === undefined || requestedForwardStep <= 0) {
    return requestedForwardStep;
  }

  const queryRadius = getHostileContactQueryRadius(spacing, memberMaxStep);
  const sourceX = store.contactSnapshotPositionsX[entityId]!;
  const sourceY = store.contactSnapshotPositionsY[entityId]!;
  const nearbyEntityIds = queryEntitiesWithinRadiusInto(
    blockerGrid,
    sourceX,
    sourceY,
    queryRadius,
    store.scratchNearbyEntityIds,
  );
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
      Math.floor((forwardDistance - FRONT_CONTACT_GAP) / 2),
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
): number {
  return Math.ceil(
    Math.hypot(
      memberMaxStep * 2 + FRONT_CONTACT_GAP,
      spacing * HOSTILE_CONTACT_LATERAL_SPACING_MULTIPLIER,
    ),
  );
}

function chooseUnitMovementStyle(
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
  blockerGrid: SpatialGrid | undefined,
  unitId: UnitId,
  unitIndex: number,
  isAdvancing: boolean,
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
    candidateStyle = "engageFront";
  } else {
    candidateStyle = chooseAlliedBlockerStyle(
      identityStore,
      store,
      unitId,
      unitIndex,
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
): UnitMovementStyle {
  const members = getUnitMembers(identityStore, unitId);
  const averageConfidence = computeAverageConfidence(store, members);
  const averagePressure = computeAveragePressure(store, members);
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
  return style !== "formedMarch" && style !== "orderedHalt";
}

function getBlockerStyleRelationship(
  style: UnitMovementStyle,
): "allied" | "hostile" {
  return style === "engageFront" ? "hostile" : "allied";
}

function computeAverageConfidence(
  store: InternalFormationBehaviourStore,
  members: readonly number[],
): number {
  let total = 0;
  for (let index = 0; index < members.length; index += 1) {
    total += store.confidence[members[index]!]!;
  }
  return Math.trunc(total / members.length);
}

function computeAveragePressure(
  store: InternalFormationBehaviourStore,
  members: readonly number[],
): number {
  let total = 0;
  for (let index = 0; index < members.length; index += 1) {
    total += store.pressure[members[index]!]!;
  }
  return Math.trunc(total / members.length);
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
