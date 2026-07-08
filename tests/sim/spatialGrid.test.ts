import { describe, expect, it } from "vitest";

import { moveWorldOneTick } from "../../src/sim/movement";
import {
  buildSpatialGrid,
  clearSpatialGrid,
  createSpatialGrid,
  getSpatialGridCellEntityIds,
  getSpatialGridCellIndex,
  queryEntitiesWithinRadius,
  queryEntitiesWithinRadiusInto,
  queryNearbyEntities,
  queryNearbyEntitiesInto,
} from "../../src/sim/spatialGrid";
import type { SimulationBounds, WorldState } from "../../src/sim/types";

describe("spatial grid", () => {
  it("rejects invalid configuration", () => {
    const validConfig = {
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 1,
    };

    expect(() =>
      createSpatialGrid({
        ...validConfig,
        bounds: { width: 0, height: 10 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      createSpatialGrid({
        ...validConfig,
        bounds: { width: 10, height: -1 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      createSpatialGrid({
        ...validConfig,
        bounds: { width: 10.5, height: 10 },
      }),
    ).toThrow(RangeError);
    expect(() =>
      createSpatialGrid({ ...validConfig, cellSize: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      createSpatialGrid({ ...validConfig, cellSize: 2.5 }),
    ).toThrow(RangeError);
    expect(() =>
      createSpatialGrid({ ...validConfig, capacity: 0 }),
    ).toThrow(RangeError);
    expect(() =>
      createSpatialGrid({ ...validConfig, capacity: -1 }),
    ).toThrow(RangeError);
  });

  it("derives columns and rows that cover partial edge cells", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 9 },
      cellSize: 4,
      capacity: 3,
    });

    expect(grid.columns).toBe(3);
    expect(grid.rows).toBe(3);
    expect(grid.cellCount).toBe(9);
  });

  it("inserts entities into expected cells", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 4,
      capacity: 3,
    });
    const world = createTestWorld({
      ids: [30, 10, 20],
      positionsX: [1, 4, 9],
      positionsY: [1, 4, 9],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(getSpatialGridCellIndex(grid, 1, 1)).toBe(0);
    expect(getSpatialGridCellIndex(grid, 4, 4)).toBe(4);
    expect(getSpatialGridCellIndex(grid, 9, 9)).toBe(8);
    expect(getSpatialGridCellEntityIds(grid, 0)).toEqual([30]);
    expect(getSpatialGridCellEntityIds(grid, 4)).toEqual([10]);
    expect(getSpatialGridCellEntityIds(grid, 8)).toEqual([20]);
  });

  it("indexes coordinates at zero, edges, and corners safely", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 7 },
      cellSize: 4,
      capacity: 1,
    });

    expect(getSpatialGridCellIndex(grid, 0, 0)).toBe(0);
    expect(getSpatialGridCellIndex(grid, 9, 0)).toBe(2);
    expect(getSpatialGridCellIndex(grid, 0, 6)).toBe(3);
    expect(getSpatialGridCellIndex(grid, 9, 6)).toBe(5);
    expect(getSpatialGridCellIndex(grid, 10, 7)).toBe(5);
    expect(getSpatialGridCellIndex(grid, -3, -2)).toBe(0);
  });

  it("clears previous occupancy", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 1,
    });
    const world = createTestWorld({
      ids: [7],
      positionsX: [5],
      positionsY: [5],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);
    expect(queryNearbyEntities(grid, 5, 5, 0)).toEqual([7]);

    clearSpatialGrid(grid);

    expect(queryNearbyEntities(grid, 5, 5, 0)).toEqual([]);
    expect(getSpatialGridCellEntityIds(grid, 3)).toEqual([]);
  });

  it("rebuilds after movement and removes stale results", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 1,
    });
    const world = createTestWorld({
      ids: [1],
      positionsX: [1],
      positionsY: [1],
      velocitiesX: [8],
      velocitiesY: [8],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);
    expect(queryNearbyEntities(grid, 1, 1, 0)).toEqual([1]);

    moveWorldOneTick(world);
    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, 1, 1, 0)).toEqual([]);
    expect(queryNearbyEntities(grid, 9, 9, 0)).toEqual([1]);
  });

  it("returns expected nearby candidates from overlapping cells", () => {
    const grid = createSpatialGrid({
      bounds: { width: 12, height: 12 },
      cellSize: 4,
      capacity: 4,
    });
    const world = createTestWorld({
      ids: [5, 2, 9, 1],
      positionsX: [1, 5, 9, 5],
      positionsY: [1, 1, 1, 5],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, 4, 2, 1)).toEqual([2, 5]);
  });

  it("queries at edges and corners without reading invalid cells", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 4,
    });
    const world = createTestWorld({
      ids: [4, 3, 2, 1],
      positionsX: [0, 9, 0, 9],
      positionsY: [0, 0, 9, 9],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, -5, -5, 6)).toEqual([4]);
    expect(queryNearbyEntities(grid, 12, 12, 3)).toEqual([1]);
    expect(queryNearbyEntities(grid, -100, -100, 1)).toEqual([]);
  });

  it("includes entities exactly on the radius boundary", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 1,
    });
    const world = createTestWorld({
      ids: [1],
      positionsX: [3],
      positionsY: [4],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(queryEntitiesWithinRadius(grid, 0, 0, 5)).toEqual([1]);
  });

  it("excludes entities outside the radius but inside overlapping cells", () => {
    const grid = createSpatialGrid({
      bounds: { width: 20, height: 20 },
      cellSize: 10,
      capacity: 2,
    });
    const world = createTestWorld({
      ids: [1, 2],
      positionsX: [6, 3],
      positionsY: [0, 4],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, 0, 0, 5)).toEqual([1, 2]);
    expect(queryEntitiesWithinRadius(grid, 0, 0, 5)).toEqual([2]);
  });

  it("returns empty results for empty queries", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 1,
    });
    const world = createTestWorld({
      ids: [7],
      positionsX: [9],
      positionsY: [9],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, 0, 0, 0)).toEqual([]);
    expect(queryEntitiesWithinRadius(grid, 0, 0, 0)).toEqual([]);
  });

  it("does not return duplicate IDs", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 2,
      capacity: 1,
    });
    const world = createTestWorld({
      ids: [1],
      positionsX: [4],
      positionsY: [4],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, 4, 4, 9)).toEqual([1]);
    expect(queryEntitiesWithinRadius(grid, 4, 4, 9)).toEqual([1]);
  });

  it("returns deterministic ascending entity ID order", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 4,
    });
    const world = createTestWorld({
      ids: [30, 10, 20, 5],
      positionsX: [9, 0, 5, 4],
      positionsY: [9, 0, 5, 4],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, 4, 4, 9)).toEqual([5, 10, 20, 30]);
    expect(queryEntitiesWithinRadius(grid, 4, 4, 9)).toEqual([5, 10, 20, 30]);
  });

  it("repeats identical build and query results deterministically", () => {
    const grid = createSpatialGrid({
      bounds: { width: 12, height: 12 },
      cellSize: 4,
      capacity: 3,
    });
    const world = createTestWorld({
      ids: [3, 1, 2],
      positionsX: [1, 5, 9],
      positionsY: [1, 5, 9],
      bounds: grid.bounds,
    });

    buildSpatialGrid(grid, world);
    const firstNearby = queryNearbyEntities(grid, 5, 5, 5);
    const firstWithinRadius = queryEntitiesWithinRadius(grid, 5, 5, 5);

    clearSpatialGrid(grid);
    buildSpatialGrid(grid, world);

    expect(queryNearbyEntities(grid, 5, 5, 5)).toEqual(firstNearby);
    expect(queryEntitiesWithinRadius(grid, 5, 5, 5)).toEqual(
      firstWithinRadius,
    );
  });

  it("reuses caller-owned output storage for Into queries", () => {
    const grid = createSpatialGrid({
      bounds: { width: 10, height: 10 },
      cellSize: 5,
      capacity: 2,
    });
    const world = createTestWorld({
      ids: [2, 1],
      positionsX: [9, 1],
      positionsY: [9, 1],
      bounds: grid.bounds,
    });
    const nearbyOut = [999];
    const radiusOut = [999];

    buildSpatialGrid(grid, world);

    const nearbyReturn = queryNearbyEntitiesInto(grid, 1, 1, 0, nearbyOut);
    const radiusReturn = queryEntitiesWithinRadiusInto(
      grid,
      1,
      1,
      0,
      radiusOut,
    );

    expect(nearbyReturn).toBe(nearbyOut);
    expect(radiusReturn).toBe(radiusOut);
    expect(nearbyOut).toEqual([1]);
    expect(radiusOut).toEqual([1]);
  });
});

interface TestWorldValues {
  readonly ids?: readonly number[];
  readonly positionsX: readonly number[];
  readonly positionsY: readonly number[];
  readonly velocitiesX?: readonly number[];
  readonly velocitiesY?: readonly number[];
  readonly bounds?: SimulationBounds;
}

function createTestWorld(values: TestWorldValues): WorldState {
  const entityCount = values.positionsX.length;
  const ids =
    values.ids ?? Array.from({ length: entityCount }, (_, index) => index);
  const velocitiesX = values.velocitiesX ?? repeatZero(entityCount);
  const velocitiesY = values.velocitiesY ?? repeatZero(entityCount);

  expect(values.positionsY).toHaveLength(entityCount);
  expect(ids).toHaveLength(entityCount);
  expect(velocitiesX).toHaveLength(entityCount);
  expect(velocitiesY).toHaveLength(entityCount);

  return {
    entityCount,
    bounds: values.bounds ?? { width: 10, height: 10 },
    ids: Uint32Array.from(ids),
    positionsX: Int32Array.from(values.positionsX),
    positionsY: Int32Array.from(values.positionsY),
    velocitiesX: Int32Array.from(velocitiesX),
    velocitiesY: Int32Array.from(velocitiesY),
  };
}

function repeatZero(length: number): readonly number[] {
  return Array.from({ length }, () => 0);
}

