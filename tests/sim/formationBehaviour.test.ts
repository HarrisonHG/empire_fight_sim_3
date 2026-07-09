import { describe, expect, it } from "vitest";

import {
  advanceFormationOneTick,
  computeSlotWorldPosition,
  createFormationBehaviourStore,
  getIndividualMovementMode,
  getIndividualStuckTicks,
  getUnitAnchor,
  getUnitOrder,
  setUnitOrder,
  type FormationBehaviourConfig,
  type FormationEvent,
  type IndividualBehaviourConfig,
  type UnitFormationConfig,
} from "../../src/sim/formationBehaviour";
import {
  createUnitIdentityStore,
  type UnitIdentityConfig,
} from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

interface HarnessConfig {
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly entityCount: number;
  readonly identity: UnitIdentityConfig;
  readonly formation: FormationBehaviourConfig;
  readonly initialPositions: ReadonlyArray<{
    readonly entityId: number;
    readonly x: number;
    readonly y: number;
  }>;
}

function createTestHarness(config: HarnessConfig) {
  const width = config.bounds?.width ?? 1_000;
  const height = config.bounds?.height ?? 1_000;
  const world: WorldState = {
    entityCount: config.entityCount,
    bounds: { width, height },
    ids: Uint32Array.from(
      { length: config.entityCount },
      (_, index) => index,
    ),
    positionsX: new Int32Array(config.entityCount),
    positionsY: new Int32Array(config.entityCount),
    velocitiesX: new Int32Array(config.entityCount),
    velocitiesY: new Int32Array(config.entityCount),
  };
  for (const { entityId, x, y } of config.initialPositions) {
    world.positionsX[entityId] = x;
    world.positionsY[entityId] = y;
  }
  const identity = createUnitIdentityStore(config.identity);
  const store = createFormationBehaviourStore(identity, config.formation);
  return { world, identity, store };
}

describe("formation behaviour: slot following", () => {
  it("keeps a formed column advancing without members overtaking each other", () => {
    const memberCount = 5;
    const spacing = 10;
    const unitSpeed = 1;
    const memberMaxStep = 2;
    const memberEntityIds = [0, 1, 2, 3, 4];

    const initialPositions = memberEntityIds.map((entityId, row) => ({
      entityId,
      x: 100 - row * spacing,
      y: 100,
    }));

    const individuals: IndividualBehaviourConfig[] = memberEntityIds.map(
      (entityId, row) => ({
        entityId,
        role: "regular",
        slotRow: row,
        slotCol: 0,
        memberMaxStep,
      }),
    );

    const units: UnitFormationConfig[] = [
      {
        unitId: 1,
        anchorX: 100,
        anchorY: 100,
        headingX: 1,
        headingY: 0,
        spacing,
        rows: memberCount,
        cols: 1,
        unitSpeed,
        order: "advance",
      },
    ];

    const { world, identity, store } = createTestHarness({
      entityCount: memberCount,
      identity: {
        entityCount: memberCount,
        units: [
          { unitId: 1, factionId: 1, memberEntityIds },
        ],
      },
      formation: {
        entityCount: memberCount,
        rngSeed: 0xabcd_1234,
        units,
        individuals,
      },
      initialPositions,
    });

    for (let tick = 0; tick < 30; tick += 1) {
      advanceFormationOneTick(world, identity, store);

      // No rear member should be ahead of any front-row member on x.
      for (let laterIndex = 1; laterIndex < memberCount; laterIndex += 1) {
        const rearX = world.positionsX[laterIndex]!;
        for (let frontIndex = 0; frontIndex < laterIndex; frontIndex += 1) {
          const frontX = world.positionsX[frontIndex]!;
          expect(rearX).toBeLessThanOrEqual(frontX);
        }
      }
    }

    const finalAnchor = getUnitAnchor(store, 1);
    expect(finalAnchor.x).toBe(100 + 30 * unitSpeed);
    expect(finalAnchor.y).toBe(100);

    // Column shape preserved: each member at its slot.
    for (let row = 0; row < memberCount; row += 1) {
      expect(world.positionsX[row]).toBe(finalAnchor.x - row * spacing);
      expect(world.positionsY[row]).toBe(100);
    }
  });

  it("computes slot world positions from anchor and cardinal heading", () => {
    const { store } = createTestHarness({
      entityCount: 1,
      identity: {
        entityCount: 1,
        units: [{ unitId: 7, factionId: 1, memberEntityIds: [0] }],
      },
      formation: {
        entityCount: 1,
        rngSeed: 1,
        units: [
          {
            unitId: 7,
            anchorX: 100,
            anchorY: 100,
            headingX: 1,
            headingY: 0,
            spacing: 10,
            rows: 2,
            cols: 3,
            unitSpeed: 0,
            order: "hold",
          },
        ],
        individuals: [
          {
            entityId: 0,
            role: "regular",
            slotRow: 0,
            slotCol: 1,
            memberMaxStep: 1,
          },
        ],
      },
      initialPositions: [{ entityId: 0, x: 100, y: 100 }],
    });

    expect(computeSlotWorldPosition(store, 7, 0, 1)).toEqual({ x: 100, y: 100 });
    expect(computeSlotWorldPosition(store, 7, 1, 1)).toEqual({ x: 90, y: 100 });
    expect(computeSlotWorldPosition(store, 7, 0, 0)).toEqual({ x: 100, y: 90 });
    expect(computeSlotWorldPosition(store, 7, 0, 2)).toEqual({ x: 100, y: 110 });
  });
});

describe("formation behaviour: pushing through allies", () => {
  it("slows a rear member so it does not push through an immovable ally in front", () => {
    const memberEntityIds = [0, 1];
    const spacing = 10;
    const memberMaxStep = 5;

    const { world, identity, store } = createTestHarness({
      entityCount: 2,
      identity: {
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds }],
      },
      formation: {
        entityCount: 2,
        rngSeed: 42,
        units: [
          {
            unitId: 1,
            anchorX: 100,
            anchorY: 100,
            headingX: 1,
            headingY: 0,
            spacing,
            rows: 2,
            cols: 1,
            unitSpeed: 1,
            order: "advance",
          },
        ],
        individuals: [
          {
            entityId: 0,
            role: "regular",
            slotRow: 0,
            slotCol: 0,
            memberMaxStep: 0,
          },
          {
            entityId: 1,
            role: "regular",
            slotRow: 1,
            slotCol: 0,
            memberMaxStep,
          },
        ],
      },
      initialPositions: [
        { entityId: 0, x: 100, y: 100 },
        { entityId: 1, x: 90, y: 100 },
      ],
    });

    for (let tick = 0; tick < 25; tick += 1) {
      advanceFormationOneTick(world, identity, store);
      const frontX = world.positionsX[0]!;
      const rearX = world.positionsX[1]!;
      // Front is immovable and stays at start.
      expect(frontX).toBe(100);
      // Rear never overtakes front and keeps a positive gap.
      expect(rearX).toBeLessThan(frontX);
    }

    // Rear should have converged to a blocked hold at the half-spacing gap.
    const finalRearX = world.positionsX[1]!;
    expect(finalRearX).toBeGreaterThanOrEqual(95);
    expect(finalRearX).toBeLessThanOrEqual(99);

    expect(getIndividualMovementMode(store, 1)).toBe("holdPosition");
    expect(getIndividualStuckTicks(store, 1)).toBeGreaterThan(0);
  });
});

describe("formation behaviour: recruit hesitation", () => {
  it("holds recruits back while veterans advance first under advanceCautious", () => {
    const spacing = 10;
    const memberMaxStep = 2;
    const memberEntityIds = [0, 1];

    const { world, identity, store } = createTestHarness({
      entityCount: 2,
      identity: {
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds }],
      },
      formation: {
        entityCount: 2,
        rngSeed: 7,
        units: [
          {
            unitId: 1,
            anchorX: 100,
            anchorY: 100,
            headingX: 1,
            headingY: 0,
            spacing,
            rows: 1,
            cols: 3,
            unitSpeed: 1,
            order: "advanceCautious",
          },
        ],
        individuals: [
          {
            entityId: 0,
            role: "veteran",
            slotRow: 0,
            slotCol: 0,
            memberMaxStep,
          },
          {
            entityId: 1,
            role: "recruit",
            slotRow: 0,
            slotCol: 2,
            memberMaxStep,
          },
        ],
      },
      initialPositions: [
        { entityId: 0, x: 100, y: 90 },
        { entityId: 1, x: 100, y: 110 },
      ],
    });

    const veteranStartX = world.positionsX[0]!;
    const recruitStartX = world.positionsX[1]!;

    // Tick 1: veteran must advance; recruit must not step forward first.
    advanceFormationOneTick(world, identity, store);
    expect(world.positionsX[0]).toBeGreaterThan(veteranStartX);
    expect(world.positionsX[1]).toBe(recruitStartX);
    expect(getIndividualMovementMode(store, 1)).toBe("holdPosition");

    // Continue: recruit trails behind veteran throughout.
    for (let tick = 0; tick < 15; tick += 1) {
      advanceFormationOneTick(world, identity, store);
      expect(world.positionsX[1]).toBeLessThan(world.positionsX[0]!);
    }
  });

  it("does not hesitate regulars or veterans under advanceCautious", () => {
    const memberEntityIds = [0, 1];
    const { world, identity, store } = createTestHarness({
      entityCount: 2,
      identity: {
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds }],
      },
      formation: {
        entityCount: 2,
        rngSeed: 11,
        units: [
          {
            unitId: 1,
            anchorX: 100,
            anchorY: 100,
            headingX: 1,
            headingY: 0,
            spacing: 10,
            rows: 1,
            cols: 3,
            unitSpeed: 1,
            order: "advanceCautious",
          },
        ],
        individuals: [
          {
            entityId: 0,
            role: "regular",
            slotRow: 0,
            slotCol: 0,
            memberMaxStep: 2,
          },
          {
            entityId: 1,
            role: "veteran",
            slotRow: 0,
            slotCol: 2,
            memberMaxStep: 2,
          },
        ],
      },
      initialPositions: [
        { entityId: 0, x: 100, y: 90 },
        { entityId: 1, x: 100, y: 110 },
      ],
    });

    advanceFormationOneTick(world, identity, store);
    expect(world.positionsX[0]).toBe(101);
    expect(world.positionsX[1]).toBe(101);
  });
});

describe("formation behaviour: pressure resistance", () => {
  it("keeps veterans closer to their slot than recruits under identical pressure", () => {
    const memberEntityIds = [0, 1];
    const memberMaxStep = 50;
    const anchorX = 200;
    const anchorY = 200;
    const spacing = 10;
    const cols = 3;
    const rows = 1;

    const { world, identity, store } = createTestHarness({
      entityCount: 2,
      identity: {
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds }],
      },
      formation: {
        entityCount: 2,
        rngSeed: 0xdead_beef,
        units: [
          {
            unitId: 1,
            anchorX,
            anchorY,
            headingX: 1,
            headingY: 0,
            spacing,
            rows,
            cols,
            unitSpeed: 1,
            order: "advance",
          },
        ],
        individuals: [
          {
            entityId: 0,
            role: "veteran",
            slotRow: 0,
            slotCol: 0,
            memberMaxStep,
            pressure: 1000,
          },
          {
            entityId: 1,
            role: "recruit",
            slotRow: 0,
            slotCol: 2,
            memberMaxStep,
            pressure: 1000,
          },
        ],
      },
      initialPositions: [
        { entityId: 0, x: 200, y: 190 },
        { entityId: 1, x: 200, y: 210 },
      ],
    });

    let veteranError = 0;
    let recruitError = 0;
    const tickCount = 100;

    for (let tick = 0; tick < tickCount; tick += 1) {
      advanceFormationOneTick(world, identity, store);
      const expectedX = anchorX + (tick + 1);
      veteranError +=
        Math.abs(world.positionsX[0]! - expectedX) +
        Math.abs(world.positionsY[0]! - 190);
      recruitError +=
        Math.abs(world.positionsX[1]! - expectedX) +
        Math.abs(world.positionsY[1]! - 210);
    }

    expect(recruitError).toBeGreaterThan(veteranError * 3);
  });
});

describe("formation behaviour: hold order", () => {
  it("does not move the anchor and emits an orderedHalt style event", () => {
    const memberEntityIds = [0];
    const { world, identity, store } = createTestHarness({
      entityCount: 1,
      identity: {
        entityCount: 1,
        units: [{ unitId: 1, factionId: 1, memberEntityIds }],
      },
      formation: {
        entityCount: 1,
        rngSeed: 1,
        units: [
          {
            unitId: 1,
            anchorX: 100,
            anchorY: 100,
            headingX: 1,
            headingY: 0,
            spacing: 10,
            rows: 1,
            cols: 1,
            unitSpeed: 5,
            order: "hold",
          },
        ],
        individuals: [
          {
            entityId: 0,
            role: "regular",
            slotRow: 0,
            slotCol: 0,
            memberMaxStep: 2,
          },
        ],
      },
      initialPositions: [{ entityId: 0, x: 100, y: 100 }],
    });

    const result = advanceFormationOneTick(world, identity, store);
    const anchor = getUnitAnchor(store, 1);
    expect(anchor).toEqual({ x: 100, y: 100 });
    expect(getUnitOrder(store, 1)).toBe("hold");

    const styleEvent = result.events.find(
      (event): event is Extract<
        FormationEvent,
        { kind: "unit_movement_choice" }
      > => event.kind === "unit_movement_choice" && event.unitId === 1,
    );
    expect(styleEvent?.style).toBe("orderedHalt");

    // Second identical tick should not re-emit the same style.
    const secondResult = advanceFormationOneTick(world, identity, store);
    const styleEventsSecondTick = secondResult.events.filter(
      (event) => event.kind === "unit_movement_choice",
    );
    expect(styleEventsSecondTick).toHaveLength(0);
  });
});

describe("formation behaviour: stuck event transitions", () => {
  it("emits stuck_entered once when blocked and stuck_recovered on release", () => {
    const memberEntityIds = [0, 1];
    const spacing = 10;
    const memberMaxStep = 5;

    const { world, identity, store } = createTestHarness({
      entityCount: 2,
      identity: {
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds }],
      },
      formation: {
        entityCount: 2,
        rngSeed: 42,
        units: [
          {
            unitId: 1,
            anchorX: 100,
            anchorY: 100,
            headingX: 1,
            headingY: 0,
            spacing,
            rows: 2,
            cols: 1,
            unitSpeed: 1,
            order: "advance",
          },
        ],
        individuals: [
          {
            entityId: 0,
            role: "regular",
            slotRow: 0,
            slotCol: 0,
            memberMaxStep: 0,
          },
          {
            entityId: 1,
            role: "regular",
            slotRow: 1,
            slotCol: 0,
            memberMaxStep,
          },
        ],
      },
      initialPositions: [
        { entityId: 0, x: 100, y: 100 },
        { entityId: 1, x: 90, y: 100 },
      ],
    });

    let stuckEnteredCount = 0;
    let stuckRecoveredCount = 0;

    for (let tick = 0; tick < 30; tick += 1) {
      const result = advanceFormationOneTick(world, identity, store);
      for (const event of result.events) {
        if (event.kind === "stuck_entered" && event.entityId === 1) {
          stuckEnteredCount += 1;
        } else if (event.kind === "stuck_recovered" && event.entityId === 1) {
          stuckRecoveredCount += 1;
        }
      }
    }

    expect(stuckEnteredCount).toBe(1);
    expect(stuckRecoveredCount).toBe(0);

    // Switch unit to hold; the rear should recover from stuck.
    setUnitOrder(store, 1, "hold");
    let recoveredThisRun = 0;
    for (let tick = 0; tick < 5; tick += 1) {
      const result = advanceFormationOneTick(world, identity, store);
      for (const event of result.events) {
        if (event.kind === "stuck_recovered" && event.entityId === 1) {
          recoveredThisRun += 1;
        }
      }
    }
    expect(recoveredThisRun).toBe(1);
  });
});

describe("formation behaviour: deterministic replay", () => {
  it("produces byte-equal positions after equal tick counts with same inputs", () => {
    const buildRun = () => {
      const memberCount = 8;
      const memberEntityIds = [0, 1, 2, 3, 4, 5, 6, 7];
      const initialPositions = memberEntityIds.map((entityId) => ({
        entityId,
        x: 200,
        y: 200 + entityId * 2,
      }));

      return createTestHarness({
        entityCount: memberCount,
        identity: {
          entityCount: memberCount,
          units: [{ unitId: 3, factionId: 1, memberEntityIds }],
        },
        formation: {
          entityCount: memberCount,
          rngSeed: 0x1234_abcd,
          units: [
            {
              unitId: 3,
              anchorX: 200,
              anchorY: 200,
              headingX: 1,
              headingY: 0,
              spacing: 6,
              rows: 4,
              cols: 2,
              unitSpeed: 1,
              order: "advance",
            },
          ],
          individuals: memberEntityIds.map((entityId) => ({
            entityId,
            role:
              entityId % 3 === 0
                ? "recruit"
                : entityId % 3 === 1
                  ? "veteran"
                  : "regular",
            slotRow: Math.floor(entityId / 2),
            slotCol: entityId % 2,
            memberMaxStep: 4,
            pressure: 500,
          })),
        },
        initialPositions,
      });
    };

    const runA = buildRun();
    const runB = buildRun();

    for (let tick = 0; tick < 200; tick += 1) {
      advanceFormationOneTick(runA.world, runA.identity, runA.store);
      advanceFormationOneTick(runB.world, runB.identity, runB.store);
    }

    expect(Array.from(runA.world.positionsX)).toEqual(
      Array.from(runB.world.positionsX),
    );
    expect(Array.from(runA.world.positionsY)).toEqual(
      Array.from(runB.world.positionsY),
    );
  });
});
