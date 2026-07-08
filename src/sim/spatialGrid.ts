import type { SimulationBounds, WorldState } from "./types";

export interface SpatialGridConfig {
  readonly bounds: SimulationBounds;
  readonly cellSize: number;
  readonly capacity: number;
}

export interface SpatialGrid {
  readonly bounds: SimulationBounds;
  readonly cellSize: number;
  readonly capacity: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellCount: number;
  readonly entityCount: number;
}

interface InternalSpatialGrid extends SpatialGrid {
  entityCount: number;
  readonly cellEntitySlots: number[][];
  readonly entityIds: Uint32Array;
  readonly entityPositionsX: Int32Array;
  readonly entityPositionsY: Int32Array;
  readonly scratchEntitySlots: number[];
}

export function createSpatialGrid(config: SpatialGridConfig): SpatialGrid {
  assertPositiveInteger(config.bounds.width, "bounds.width");
  assertPositiveInteger(config.bounds.height, "bounds.height");
  assertPositiveInteger(config.cellSize, "cellSize");
  assertPositiveInteger(config.capacity, "capacity");

  const bounds = {
    width: config.bounds.width,
    height: config.bounds.height,
  };
  const columns = Math.ceil(bounds.width / config.cellSize);
  const rows = Math.ceil(bounds.height / config.cellSize);
  const cellCount = columns * rows;

  if (!Number.isSafeInteger(cellCount) || cellCount <= 0) {
    throw new RangeError("Spatial grid cell count must be a positive integer.");
  }

  const grid: InternalSpatialGrid = {
    bounds,
    cellSize: config.cellSize,
    capacity: config.capacity,
    columns,
    rows,
    cellCount,
    entityCount: 0,
    cellEntitySlots: Array.from({ length: cellCount }, () => []),
    entityIds: new Uint32Array(config.capacity),
    entityPositionsX: new Int32Array(config.capacity),
    entityPositionsY: new Int32Array(config.capacity),
    scratchEntitySlots: [],
  };

  return grid;
}

export function clearSpatialGrid(grid: SpatialGrid): void {
  const internalGrid = asInternalGrid(grid);

  for (let cellIndex = 0; cellIndex < internalGrid.cellCount; cellIndex += 1) {
    internalGrid.cellEntitySlots[cellIndex]!.length = 0;
  }

  internalGrid.entityCount = 0;
  internalGrid.scratchEntitySlots.length = 0;
}

export function buildSpatialGrid(
  grid: SpatialGrid,
  world: WorldState,
): void {
  const internalGrid = asInternalGrid(grid);
  validateWorldForGrid(internalGrid, world);
  clearSpatialGrid(internalGrid);

  internalGrid.entityCount = world.entityCount;

  for (let entityIndex = 0; entityIndex < world.entityCount; entityIndex += 1) {
    const entityId = world.ids[entityIndex]!;
    const positionX = world.positionsX[entityIndex]!;
    const positionY = world.positionsY[entityIndex]!;
    const cellIndex = getSpatialGridCellIndex(internalGrid, positionX, positionY);

    internalGrid.entityIds[entityIndex] = entityId;
    internalGrid.entityPositionsX[entityIndex] = positionX;
    internalGrid.entityPositionsY[entityIndex] = positionY;
    internalGrid.cellEntitySlots[cellIndex]!.push(entityIndex);
  }
}

export function getSpatialGridCellIndex(
  grid: SpatialGrid,
  x: number,
  y: number,
): number {
  assertSafeInteger(x, "x");
  assertSafeInteger(y, "y");

  const column = coordinateToCellIndex(x, grid.bounds.width, grid.cellSize);
  const row = coordinateToCellIndex(y, grid.bounds.height, grid.cellSize);

  return row * grid.columns + column;
}

export function getSpatialGridCellEntityIdsInto(
  grid: SpatialGrid,
  cellIndex: number,
  out: number[],
): number[] {
  const internalGrid = asInternalGrid(grid);
  assertCellIndex(internalGrid, cellIndex);

  out.length = 0;

  const entitySlots = internalGrid.cellEntitySlots[cellIndex]!;
  for (let index = 0; index < entitySlots.length; index += 1) {
    out.push(internalGrid.entityIds[entitySlots[index]!]!);
  }

  sortAndDedupeNumbers(out);
  return out;
}

export function getSpatialGridCellEntityIds(
  grid: SpatialGrid,
  cellIndex: number,
): number[] {
  return getSpatialGridCellEntityIdsInto(grid, cellIndex, []);
}

export function queryNearbyEntitiesInto(
  grid: SpatialGrid,
  x: number,
  y: number,
  radius: number,
  out: number[],
): number[] {
  const internalGrid = asInternalGrid(grid);
  validateQueryInput(x, y, radius);

  out.length = 0;
  appendNearbyEntityIds(internalGrid, x, y, radius, out);
  sortAndDedupeNumbers(out);

  return out;
}

export function queryNearbyEntities(
  grid: SpatialGrid,
  x: number,
  y: number,
  radius: number,
): number[] {
  return queryNearbyEntitiesInto(grid, x, y, radius, []);
}

export function queryEntitiesWithinRadiusInto(
  grid: SpatialGrid,
  x: number,
  y: number,
  radius: number,
  out: number[],
): number[] {
  const internalGrid = asInternalGrid(grid);
  validateQueryInput(x, y, radius);

  out.length = 0;

  const entitySlots = collectNearbyEntitySlotsInto(
    internalGrid,
    x,
    y,
    radius,
    internalGrid.scratchEntitySlots,
  );
  sortSlotsByEntityId(internalGrid, entitySlots);

  const radiusSquared = radius * radius;
  let lastEmittedEntityId: number | undefined;

  for (let index = 0; index < entitySlots.length; index += 1) {
    const entitySlot = entitySlots[index]!;
    const entityId = internalGrid.entityIds[entitySlot]!;

    if (entityId === lastEmittedEntityId) {
      continue;
    }

    const deltaX = internalGrid.entityPositionsX[entitySlot]! - x;
    const deltaY = internalGrid.entityPositionsY[entitySlot]! - y;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;

    if (distanceSquared <= radiusSquared) {
      out.push(entityId);
      lastEmittedEntityId = entityId;
    }
  }

  return out;
}

export function queryEntitiesWithinRadius(
  grid: SpatialGrid,
  x: number,
  y: number,
  radius: number,
): number[] {
  return queryEntitiesWithinRadiusInto(grid, x, y, radius, []);
}

function appendNearbyEntityIds(
  grid: InternalSpatialGrid,
  x: number,
  y: number,
  radius: number,
  out: number[],
): void {
  const entitySlots = collectNearbyEntitySlotsInto(
    grid,
    x,
    y,
    radius,
    grid.scratchEntitySlots,
  );

  for (let index = 0; index < entitySlots.length; index += 1) {
    out.push(grid.entityIds[entitySlots[index]!]!);
  }
}

function collectNearbyEntitySlotsInto(
  grid: InternalSpatialGrid,
  x: number,
  y: number,
  radius: number,
  out: number[],
): number[] {
  out.length = 0;

  const maximumX = grid.bounds.width - 1;
  const maximumY = grid.bounds.height - 1;
  const minimumQueryX = x - radius;
  const maximumQueryX = x + radius;
  const minimumQueryY = y - radius;
  const maximumQueryY = y + radius;

  if (
    maximumQueryX < 0 ||
    maximumQueryY < 0 ||
    minimumQueryX > maximumX ||
    minimumQueryY > maximumY
  ) {
    return out;
  }

  const startColumn = coordinateToCellIndex(
    Math.max(0, minimumQueryX),
    grid.bounds.width,
    grid.cellSize,
  );
  const endColumn = coordinateToCellIndex(
    Math.min(maximumX, maximumQueryX),
    grid.bounds.width,
    grid.cellSize,
  );
  const startRow = coordinateToCellIndex(
    Math.max(0, minimumQueryY),
    grid.bounds.height,
    grid.cellSize,
  );
  const endRow = coordinateToCellIndex(
    Math.min(maximumY, maximumQueryY),
    grid.bounds.height,
    grid.cellSize,
  );

  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cellIndex = row * grid.columns + column;
      const cellEntitySlots = grid.cellEntitySlots[cellIndex]!;

      for (let index = 0; index < cellEntitySlots.length; index += 1) {
        out.push(cellEntitySlots[index]!);
      }
    }
  }

  return out;
}

function coordinateToCellIndex(
  coordinate: number,
  extent: number,
  cellSize: number,
): number {
  const clampedCoordinate = clamp(coordinate, 0, extent - 1);

  return Math.floor(clampedCoordinate / cellSize);
}

function validateWorldForGrid(
  grid: InternalSpatialGrid,
  world: WorldState,
): void {
  assertNonNegativeInteger(world.entityCount, "world.entityCount");

  if (world.bounds.width !== grid.bounds.width) {
    throw new RangeError("World width must match spatial grid width.");
  }

  if (world.bounds.height !== grid.bounds.height) {
    throw new RangeError("World height must match spatial grid height.");
  }

  if (world.entityCount > grid.capacity) {
    throw new RangeError("World entity count exceeds spatial grid capacity.");
  }

  if (
    world.ids.length < world.entityCount ||
    world.positionsX.length < world.entityCount ||
    world.positionsY.length < world.entityCount
  ) {
    throw new RangeError(
      "World component arrays must cover the world entity count.",
    );
  }
}

function validateQueryInput(x: number, y: number, radius: number): void {
  assertSafeInteger(x, "x");
  assertSafeInteger(y, "y");
  assertNonNegativeInteger(radius, "radius");
}

function assertCellIndex(grid: InternalSpatialGrid, cellIndex: number): void {
  assertNonNegativeInteger(cellIndex, "cellIndex");

  if (cellIndex >= grid.cellCount) {
    throw new RangeError("cellIndex must be within the spatial grid.");
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

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
}

function asInternalGrid(grid: SpatialGrid): InternalSpatialGrid {
  return grid as InternalSpatialGrid;
}

function sortAndDedupeNumbers(values: number[]): void {
  values.sort(compareNumbers);

  let writeIndex = 0;
  let previousValue: number | undefined;

  for (let readIndex = 0; readIndex < values.length; readIndex += 1) {
    const value = values[readIndex]!;

    if (value !== previousValue) {
      values[writeIndex] = value;
      writeIndex += 1;
      previousValue = value;
    }
  }

  values.length = writeIndex;
}

function sortSlotsByEntityId(
  grid: InternalSpatialGrid,
  entitySlots: number[],
): void {
  entitySlots.sort((leftSlot, rightSlot) =>
    compareNumbers(grid.entityIds[leftSlot]!, grid.entityIds[rightSlot]!),
  );
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}

