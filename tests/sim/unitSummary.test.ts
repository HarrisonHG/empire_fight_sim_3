import { describe, expect, it } from "vitest";

import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import {
  createUnitSummaries,
  createUnitSummariesInto,
  getUnitSummaryById,
  type UnitSummary,
} from "../../src/sim/unitSummary";
import type { WorldState } from "../../src/sim/types";

describe("unit summaries", () => {
  it("calculates the centre for one-member units", () => {
    const world = createTestWorld({
      positionsX: [7],
      positionsY: [9],
    });
    const identity = createUnitIdentityStore({
      entityCount: 1,
      units: [{ unitId: 3, factionId: 2, memberEntityIds: [0] }],
    });

    expect(createUnitSummaries(world, identity)).toEqual([
      {
        unitId: 3,
        factionId: 2,
        memberCount: 1,
        centreX: 7,
        centreY: 9,
        minX: 7,
        minY: 9,
        maxX: 7,
        maxY: 9,
        extentX: 0,
        extentY: 0,
      },
    ]);
  });

  it("calculates the centre for multi-member units", () => {
    const world = createTestWorld({
      positionsX: [2, 8, 14],
      positionsY: [3, 9, 15],
    });
    const identity = createSingleUnitIdentity(3);
    const [summary] = createUnitSummaries(world, identity);

    expect(summary).toMatchObject({
      memberCount: 3,
      centreX: 8,
      centreY: 9,
    });
  });

  it("uses explicit integer centre rounding toward zero", () => {
    const world = createTestWorld({
      positionsX: [0, 1],
      positionsY: [0, 2],
    });
    const identity = createSingleUnitIdentity(2);
    const [summary] = createUnitSummaries(world, identity);

    expect(summary).toMatchObject({
      centreX: 0,
      centreY: 1,
    });
  });

  it("calculates min and max bounds for positive positions", () => {
    const world = createTestWorld({
      positionsX: [5, 12, 9],
      positionsY: [4, 8, 20],
    });
    const identity = createSingleUnitIdentity(3);
    const [summary] = createUnitSummaries(world, identity);

    expect(summary).toMatchObject({
      minX: 5,
      minY: 4,
      maxX: 12,
      maxY: 20,
    });
  });

  it("calculates min and max bounds for edge positions", () => {
    const world = createTestWorld({
      positionsX: [0, 99],
      positionsY: [0, 49],
      bounds: { width: 100, height: 50 },
    });
    const identity = createSingleUnitIdentity(2);
    const [summary] = createUnitSummaries(world, identity);

    expect(summary).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 99,
      maxY: 49,
    });
  });

  it("calculates min and max bounds after positions move", () => {
    const world = createTestWorld({
      positionsX: [2, 8],
      positionsY: [3, 9],
    });
    const identity = createSingleUnitIdentity(2);

    world.positionsX[0] = 20;
    world.positionsY[0] = 30;
    world.positionsX[1] = 40;
    world.positionsY[1] = 50;

    const [summary] = createUnitSummaries(world, identity);

    expect(summary).toMatchObject({
      minX: 20,
      minY: 30,
      maxX: 40,
      maxY: 50,
    });
  });

  it("calculates axis-aligned extents from the derived centre", () => {
    const world = createTestWorld({
      positionsX: [2, 8, 14],
      positionsY: [3, 9, 21],
    });
    const identity = createSingleUnitIdentity(3);
    const [summary] = createUnitSummaries(world, identity);

    expect(summary).toMatchObject({
      centreX: 8,
      centreY: 11,
      extentX: 6,
      extentY: 10,
    });
  });

  it("sorts summaries by ascending unit ID", () => {
    const world = createTestWorld({
      positionsX: [1, 2, 3, 4],
      positionsY: [1, 2, 3, 4],
    });
    const identity = createUnitIdentityStore({
      entityCount: 4,
      units: [
        { unitId: 30, factionId: 2, memberEntityIds: [3] },
        { unitId: 10, factionId: 1, memberEntityIds: [0, 1] },
        { unitId: 20, factionId: 1, memberEntityIds: [2] },
      ],
    });

    expect(createUnitSummaries(world, identity).map((summary) => summary.unitId))
      .toEqual([10, 20, 30]);
  });

  it("repeats summary generation structurally", () => {
    const world = createTestWorld({
      positionsX: [1, 3, 5, 7],
      positionsY: [2, 4, 6, 8],
    });
    const identity = createTwoUnitIdentity();

    expect(createUnitSummaries(world, identity)).toEqual(
      createUnitSummaries(world, identity),
    );
  });

  it("rebuilds summaries from current positions without stale values", () => {
    const world = createTestWorld({
      positionsX: [1, 3, 5, 7],
      positionsY: [2, 4, 6, 8],
    });
    const identity = createTwoUnitIdentity();
    const out: UnitSummary[] = [];

    createUnitSummariesInto(world, identity, out);

    world.positionsX[0] = 50;
    world.positionsY[0] = 60;
    world.positionsX[1] = 70;
    world.positionsY[1] = 80;
    createUnitSummariesInto(world, identity, out);

    expect(getUnitSummaryById(out, 10)).toMatchObject({
      centreX: 60,
      centreY: 70,
      minX: 50,
      minY: 60,
      maxX: 70,
      maxY: 80,
    });
    expect(out).toHaveLength(2);
  });

  it("reuses caller-owned output arrays", () => {
    const world = createTestWorld({
      positionsX: [1, 3],
      positionsY: [2, 4],
    });
    const identity = createSingleUnitIdentity(2);
    const out: UnitSummary[] = [
      {
        unitId: 999,
        factionId: 999,
        memberCount: 1,
        centreX: 999,
        centreY: 999,
        minX: 999,
        minY: 999,
        maxX: 999,
        maxY: 999,
        extentX: 999,
        extentY: 999,
      },
    ];

    const returned = createUnitSummariesInto(world, identity, out);

    expect(returned).toBe(out);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      unitId: 10,
      factionId: 1,
      memberCount: 2,
    });
  });
});

interface TestWorldValues {
  readonly positionsX: readonly number[];
  readonly positionsY: readonly number[];
  readonly bounds?: {
    readonly width: number;
    readonly height: number;
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

function createSingleUnitIdentity(entityCount: number): UnitIdentityStore {
  return createUnitIdentityStore({
    entityCount,
    units: [
      {
        unitId: 10,
        factionId: 1,
        memberEntityIds: Array.from(
          { length: entityCount },
          (_, index) => index,
        ),
      },
    ],
  });
}

function createTwoUnitIdentity(): UnitIdentityStore {
  return createUnitIdentityStore({
    entityCount: 4,
    units: [
      { unitId: 20, factionId: 2, memberEntityIds: [2, 3] },
      { unitId: 10, factionId: 1, memberEntityIds: [0, 1] },
    ],
  });
}
