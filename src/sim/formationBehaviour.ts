import { SeededRng } from "./rng";
import {
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

// Milestone 2A emits only the pre-arbitration styles below. The remaining
// styles are reserved for Milestone 2B blocker arbitration so downstream code
// can pattern-match on the full union without further type churn.
export type UnitMovementStyle =
  | "formedMarch" // 2A: formation advancing with no blocker arbitration yet.
  | "orderedHalt" // 2A: unit holding on captain order (distinct from 2B haltAndWait).
  | "formedDetour" // 2B: reserved, not yet emitted.
  | "looseFlow" // 2B: reserved, not yet emitted.
  | "pushThrough" // 2B: reserved, not yet emitted.
  | "haltAndWait" // 2B: reserved, not yet emitted.
  | "engageFront"; // 2B: reserved, not yet emitted.

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

  readonly rng: SeededRng;
}

const DEFAULT_COHESION = 1000;
const STUCK_TICK_THRESHOLD = 5;

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
    rng: new SeededRng(config.rngSeed),
  };

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
    store.cohesion[index] = unitConfig.cohesion ?? DEFAULT_COHESION;
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
    store.pressure[individual.entityId] = individual.pressure ?? 0;
    store.confidence[individual.entityId] = individual.confidence ?? 500;
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

export function setIndividualPressure(
  store: FormationBehaviourStore,
  entityId: number,
  pressure: number,
): void {
  const internal = asInternal(store);
  assertEntityIdInRange(entityId, internal.entityCount);
  assertNonNegativeInteger(pressure, "pressure");
  internal.pressure[entityId] = pressure;
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

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const storeUnitIndex = requireUnitIndex(internal, unitId);
    processUnit(world, identityStore, internal, unitId, storeUnitIndex, events);
  }

  return { events };
}

function processUnit(
  world: WorldState,
  identityStore: UnitIdentityStore,
  store: InternalFormationBehaviourStore,
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

  if (isAdvancing) {
    store.anchorX[unitIndex] =
      store.anchorX[unitIndex]! + headingX * unitSpeed;
    store.anchorY[unitIndex] =
      store.anchorY[unitIndex]! + headingY * unitSpeed;
  }

  const anchorX = store.anchorX[unitIndex]!;
  const anchorY = store.anchorY[unitIndex]!;

  const style: UnitMovementStyle = isAdvancing ? "formedMarch" : "orderedHalt";
  if (store.lastEmittedUnitStyle[unitIndex] !== style) {
    store.lastEmittedUnitStyle[unitIndex] = style;
    events.push({ kind: "unit_movement_choice", unitId, style });
  }

  const members = getUnitMembers(identityStore, unitId);
  if (members.length === 0) {
    return;
  }

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

  for (let index = 0; index < members.length; index += 1) {
    const entityId = members[index]!;
    const role = store.roles[entityId]!;
    const slotRow = store.slotRow[entityId]!;
    const slotCol = store.slotCol[entityId]!;
    const memberMaxStep = store.memberMaxStep[entityId]!;
    const pressure = store.pressure[entityId]!;

    const backward = slotRow * spacing;
    const lateral = (slotCol - centerCol) * spacing;

    let slotX = anchorX - headingX * backward + perpX * lateral;
    let slotY = anchorY - headingY * backward + perpY * lateral;

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
