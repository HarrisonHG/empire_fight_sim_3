import { describe, expect, it } from "vitest";

import {
  buildSpatialGrid,
  createSpatialGrid,
  type SpatialGrid,
} from "../../src/sim/spatialGrid";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import {
  queryOtherFactionEntities,
  queryOtherFactionEntitiesInto,
  queryOtherUnitEntities,
  querySameFactionEntities,
  querySameUnitEntities,
  queryUnitLocalEntities,
  queryUnitLocalEntitiesInto,
} from "../../src/sim/unitLocalQueries";
import {
  createUnitSummaries,
  getUnitSummaryById,
  type UnitSummary,
} from "../../src/sim/unitSummary";
import type { SimulationBounds, WorldState } from "../../src/sim/types";

describe("unit local queries", () => {
  it("uses spatial-grid-backed candidates and returns expected nearby entity IDs", () => {
    const fixture = createLocalQueryFixture();

    expect(
      queryUnitLocalEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        10,
      ),
    ).toEqual([0, 1, 2, 3, 4]);

    fixture.world.positionsX[7] = 10;
    fixture.world.positionsY[7] = 11;

    expect(
      queryUnitLocalEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        10,
      ),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it("filters same-unit entities", () => {
    const fixture = createLocalQueryFixture();

    expect(
      querySameUnitEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        10,
      ),
    ).toEqual([0, 1]);
  });

  it("filters other-unit entities", () => {
    const fixture = createLocalQueryFixture();

    expect(
      queryOtherUnitEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        10,
      ),
    ).toEqual([2, 3, 4]);
  });

  it("filters same-faction entities", () => {
    const fixture = createLocalQueryFixture();

    expect(
      querySameFactionEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        10,
      ),
    ).toEqual([0, 1, 2, 3]);
  });

  it("filters other-faction entities", () => {
    const fixture = createLocalQueryFixture();

    expect(
      queryOtherFactionEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        10,
      ),
    ).toEqual([4]);
  });

  it("excludes entities outside the radius", () => {
    const fixture = createLocalQueryFixture();

    expect(
      queryUnitLocalEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        10,
      ),
    ).not.toContain(8);
  });

  it("includes entities exactly on the radius boundary", () => {
    const fixture = createLocalQueryFixture();

    expect(
      queryUnitLocalEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        30,
      ),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
  });

  it("returns deterministic ascending entity ID order", () => {
    const fixture = createLocalQueryFixture();

    expect(
      queryUnitLocalEntities(
        fixture.world,
        fixture.identityStore,
        fixture.grid,
        fixture.sourceSummary,
        30,
      ),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
  });

  it("returns duplicate-free results", () => {
    const fixture = createLocalQueryFixture();
    const results = queryUnitLocalEntities(
      fixture.world,
      fixture.identityStore,
      fixture.grid,
      fixture.sourceSummary,
      30,
    );

    expect(new Set(results).size).toBe(results.length);
  });

  it("reuses caller-owned output arrays", () => {
    const fixture = createLocalQueryFixture();
    const out = [999, 998, 997];

    const returned = queryOtherFactionEntitiesInto(
      fixture.world,
      fixture.identityStore,
      fixture.grid,
      fixture.sourceSummary,
      10,
      out,
    );

    expect(returned).toBe(out);
    expect(out).toEqual([4]);
  });

  it("repeats identical queries deterministically", () => {
    const fixture = createLocalQueryFixture();

    const first = queryUnitLocalEntities(
      fixture.world,
      fixture.identityStore,
      fixture.grid,
      fixture.sourceSummary,
      30,
      "otherFaction",
    );
    const second = queryUnitLocalEntities(
      fixture.world,
      fixture.identityStore,
      fixture.grid,
      fixture.sourceSummary,
      30,
      "otherFaction",
    );

    expect(second).toEqual(first);
  });

  it("queries near world edges without failing", () => {
    const world = createTestWorld({
      positionsX: [0, 1, 99],
      positionsY: [0, 0, 99],
      bounds: { width: 100, height: 100 },
    });
    const identityStore = createUnitIdentityStore({
      entityCount: 3,
      units: [
        { unitId: 1, factionId: 1, memberEntityIds: [0] },
        { unitId: 2, factionId: 2, memberEntityIds: [1] },
        { unitId: 3, factionId: 2, memberEntityIds: [2] },
      ],
    });
    const grid = createBuiltGrid(world, 10);
    const sourceSummary = getRequiredSummary(
      createUnitSummaries(world, identityStore),
      1,
    );

    expect(() =>
      queryUnitLocalEntities(
        world,
        identityStore,
        grid,
        sourceSummary,
        2,
      ),
    ).not.toThrow();
    expect(
      queryUnitLocalEntities(
        world,
        identityStore,
        grid,
        sourceSummary,
        2,
      ),
    ).toEqual([0, 1]);
  });

  it("returns categorisation-only entity IDs", () => {
    const fixture = createLocalQueryFixture();
    const out: number[] = [];

    const returned = queryUnitLocalEntitiesInto(
      fixture.world,
      fixture.identityStore,
      fixture.grid,
      fixture.sourceSummary,
      10,
      out,
      "sameFaction",
    );

    expect(returned).toBe(out);
    expect(returned).toEqual([0, 1, 2, 3]);
    for (const value of returned) {
      expect(typeof value).toBe("number");
      expect(Number.isSafeInteger(value)).toBe(true);
    }
  });
});

interface LocalQueryFixture {
  readonly world: WorldState;
  readonly identityStore: UnitIdentityStore;
  readonly grid: SpatialGrid;
  readonly sourceSummary: UnitSummary;
}

interface TestWorldValues {
  readonly positionsX: readonly number[];
  readonly positionsY: readonly number[];
  readonly bounds?: SimulationBounds;
}

function createLocalQueryFixture(): LocalQueryFixture {
  const world = createTestWorld({
    positionsX: [10, 10, 12, 15, 20, 40, 10, 90, 20],
    positionsY: [10, 10, 10, 10, 10, 10, 40, 90, 11],
    bounds: { width: 100, height: 100 },
  });
  const identityStore = createUnitIdentityStore({
    entityCount: world.entityCount,
    units: [
      { unitId: 30, factionId: 2, memberEntityIds: [4, 5, 8] },
      { unitId: 10, factionId: 1, memberEntityIds: [0, 1] },
      { unitId: 50, factionId: 1, memberEntityIds: [7] },
      { unitId: 40, factionId: 2, memberEntityIds: [6] },
      { unitId: 20, factionId: 1, memberEntityIds: [2, 3] },
    ],
  });
  const grid = createBuiltGrid(world, 10);
  const sourceSummary = getRequiredSummary(
    createUnitSummaries(world, identityStore),
    10,
  );

  return {
    world,
    identityStore,
    grid,
    sourceSummary,
  };
}

function createTestWorld(values: TestWorldValues): WorldState {
  const entityCount = values.positionsX.length;

  expect(values.positionsY).toHaveLength(entityCount);

  return {
    entityCount,
    bounds: values.bounds ?? { width: 100, height: 100 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(values.positionsX),
    positionsY: Int32Array.from(values.positionsY),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}

function createBuiltGrid(world: WorldState, cellSize: number): SpatialGrid {
  const grid = createSpatialGrid({
    bounds: world.bounds,
    cellSize,
    capacity: world.entityCount,
  });

  buildSpatialGrid(grid, world);
  return grid;
}

function getRequiredSummary(
  summaries: readonly UnitSummary[],
  unitId: number,
): UnitSummary {
  const summary = getUnitSummaryById(summaries, unitId);

  if (summary === undefined) {
    throw new Error("Expected unit summary to exist.");
  }

  return summary;
}
