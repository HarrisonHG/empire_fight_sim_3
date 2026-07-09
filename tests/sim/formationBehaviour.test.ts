import { describe, expect, it } from "vitest";

import {
  advanceFormationOneTick,
  computeSlotWorldPosition,
  createFormationBehaviourStore,
  getUnitBehaviourProfile,
  getIndividualPressure,
  getIndividualMovementMode,
  getIndividualStuckTicks,
  getUnitAnchor,
  getUnitCohesion,
  getUnitMovementStyle,
  getUnitOrder,
  setIndividualPressure,
  setUnitOrder,
  type UnitBehaviourProfile,
  type FormationBehaviourConfig,
  type FormationEvent,
  type IndividualBehaviourConfig,
  type UnitMovementStyle,
  type UnitFormationConfig,
  type UnitOrder,
} from "../../src/sim/formationBehaviour";
import {
  createUnitIdentityStore,
  getUnitIdForEntity,
  type UnitIdentityConfig,
} from "../../src/sim/unitIdentity";
import {
  createUnitLoadoutStore,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "../../src/sim/unitLoadout";
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

interface BlockerHarnessOptions {
  readonly relationship?: "allied" | "hostile";
  readonly sourceOrder?: UnitOrder;
  readonly sourceCohesion?: number;
  readonly sourceConfidence?: number;
  readonly sourcePressure?: number;
  readonly sourceBehaviourProfile?: UnitBehaviourProfile;
  readonly blockerCohesion?: number;
  readonly blockerPressure?: number;
  readonly rngSeed?: number;
}

function createBlockerHarness(options: BlockerHarnessOptions = {}) {
  const sourceOrder = options.sourceOrder ?? "advance";
  const relationship = options.relationship ?? "allied";
  return createTestHarness({
    entityCount: 2,
    identity: {
      entityCount: 2,
      units: [
        { unitId: 1, factionId: 1, memberEntityIds: [0] },
        {
          unitId: 2,
          factionId: relationship === "allied" ? 1 : 2,
          memberEntityIds: [1],
        },
      ],
    },
    formation: {
      entityCount: 2,
      rngSeed: options.rngSeed ?? 0x2b01,
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
          unitSpeed: 1,
          order: sourceOrder,
          cohesion: options.sourceCohesion ?? 1000,
          ...(options.sourceBehaviourProfile !== undefined
            ? { behaviourProfile: options.sourceBehaviourProfile }
            : {}),
        },
        {
          unitId: 2,
          anchorX: 116,
          anchorY: 100,
          headingX: -1,
          headingY: 0,
          spacing: 10,
          rows: 1,
          cols: 1,
          unitSpeed: 0,
          order: "hold",
          cohesion: options.blockerCohesion ?? 1000,
        },
      ],
      individuals: [
        {
          entityId: 0,
          role: "regular",
          slotRow: 0,
          slotCol: 0,
          memberMaxStep: 2,
          ...(options.sourceConfidence !== undefined
            ? { confidence: options.sourceConfidence }
            : {}),
          ...(options.sourcePressure !== undefined
            ? { pressure: options.sourcePressure }
            : {}),
        },
        {
          entityId: 1,
          role: "regular",
          slotRow: 0,
          slotCol: 0,
          memberMaxStep: 0,
          ...(options.blockerPressure !== undefined
            ? { pressure: options.blockerPressure }
            : {}),
        },
      ],
    },
    initialPositions: [
      { entityId: 0, x: 100, y: 100 },
      { entityId: 1, x: 116, y: 100 },
    ],
  });
}

function createReachAwareEngageHarness(reachBand?: WeaponReachBand) {
  const harness = createTestHarness({
    entityCount: 2,
    identity: {
      entityCount: 2,
      units: [
        { unitId: 1, factionId: 1, memberEntityIds: [0] },
        { unitId: 2, factionId: 2, memberEntityIds: [1] },
      ],
    },
    formation: {
      entityCount: 2,
      rngSeed: 0x3b01,
      units: [
        {
          unitId: 1,
          anchorX: 100,
          anchorY: 100,
          headingX: 1,
          headingY: 0,
          spacing: 40,
          rows: 1,
          cols: 1,
          unitSpeed: 0,
          order: "advance",
        },
        {
          unitId: 2,
          anchorX: 160,
          anchorY: 100,
          headingX: -1,
          headingY: 0,
          spacing: 40,
          rows: 1,
          cols: 1,
          unitSpeed: 0,
          order: "hold",
        },
      ],
      individuals: [
        {
          entityId: 0,
          role: "regular",
          slotRow: 0,
          slotCol: 0,
          memberMaxStep: 100,
        },
        {
          entityId: 1,
          role: "regular",
          slotRow: 0,
          slotCol: 0,
          memberMaxStep: 0,
        },
      ],
    },
    initialPositions: [
      { entityId: 0, x: 100, y: 100 },
      { entityId: 1, x: 160, y: 100 },
    ],
  });
  const loadout = createUnitLoadoutStore(harness.identity, {
    entityCount: 2,
    units:
      reachBand === undefined
        ? []
        : [{ unitId: 1, weaponReachBand: reachBand }],
  });

  return { ...harness, loadout };
}

interface FormedDetourHarnessOptions {
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly sourceUnitId?: number;
  readonly sourceAnchorX?: number;
  readonly sourceAnchorY?: number;
  readonly blockerAnchorX?: number;
  readonly blockerAnchorY?: number;
  readonly sourceCols?: number;
  readonly unitSpeed?: number;
  readonly sourceCohesion?: number;
  readonly sourceConfidence?: number;
}

function createFormedDetourHarness(options: FormedDetourHarnessOptions = {}) {
  const sourceUnitId = options.sourceUnitId ?? 1;
  const blockerUnitId = sourceUnitId === 2 ? 3 : 2;
  const sourceAnchorX = options.sourceAnchorX ?? 100;
  const sourceAnchorY = options.sourceAnchorY ?? 100;
  const blockerAnchorX = options.blockerAnchorX ?? 116;
  const blockerAnchorY = options.blockerAnchorY ?? 100;
  const sourceCols = options.sourceCols ?? 1;
  const spacing = 10;
  const centerCol = Math.floor(sourceCols / 2);
  const sourceMemberEntityIds = Array.from(
    { length: sourceCols },
    (_, index) => index,
  );
  const blockerEntityId = sourceCols;

  return createTestHarness({
    ...(options.bounds !== undefined ? { bounds: options.bounds } : {}),
    entityCount: sourceCols + 1,
    identity: {
      entityCount: sourceCols + 1,
      units: [
        {
          unitId: sourceUnitId,
          factionId: 1,
          memberEntityIds: sourceMemberEntityIds,
        },
        {
          unitId: blockerUnitId,
          factionId: 1,
          memberEntityIds: [blockerEntityId],
        },
      ],
    },
    formation: {
      entityCount: sourceCols + 1,
      rngSeed: 0x2c02,
      units: [
        {
          unitId: sourceUnitId,
          anchorX: sourceAnchorX,
          anchorY: sourceAnchorY,
          headingX: 1,
          headingY: 0,
          spacing,
          rows: 1,
          cols: sourceCols,
          unitSpeed: options.unitSpeed ?? 1,
          order: "advance",
          cohesion: options.sourceCohesion ?? 900,
        },
        {
          unitId: blockerUnitId,
          anchorX: blockerAnchorX,
          anchorY: blockerAnchorY,
          headingX: -1,
          headingY: 0,
          spacing,
          rows: 1,
          cols: 1,
          unitSpeed: 0,
          order: "hold",
        },
      ],
      individuals: [
        ...sourceMemberEntityIds.map((entityId, slotCol) => ({
          entityId,
          role: "regular" as const,
          slotRow: 0,
          slotCol,
          memberMaxStep: 2,
          confidence: options.sourceConfidence ?? 500,
        })),
        {
          entityId: blockerEntityId,
          role: "regular",
          slotRow: 0,
          slotCol: 0,
          memberMaxStep: 0,
        },
      ],
    },
    initialPositions: [
      ...sourceMemberEntityIds.map((entityId, slotCol) => ({
        entityId,
        x: sourceAnchorX,
        y: sourceAnchorY + (slotCol - centerCol) * spacing,
      })),
      { entityId: blockerEntityId, x: blockerAnchorX, y: blockerAnchorY },
    ],
  });
}

function getUnitStyleEvents(
  events: readonly FormationEvent[],
  unitId: number,
): Extract<FormationEvent, { kind: "unit_movement_choice" }>[] {
  return events.filter(
    (
      event,
    ): event is Extract<FormationEvent, { kind: "unit_movement_choice" }> =>
      event.kind === "unit_movement_choice" && event.unitId === unitId,
  );
}

function moveBlockerOutOfForwardPath(world: WorldState): void {
  world.positionsX[1] = 500;
  world.positionsY[1] = 500;
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

describe("formation behaviour: unit blocker arbitration", () => {
  it("chooses formedMarch when no blocker is in the forward path", () => {
    const { world, identity, store } = createTestHarness({
      entityCount: 1,
      identity: {
        entityCount: 1,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [0] }],
      },
      formation: {
        entityCount: 1,
        rngSeed: 0x2b01,
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
            memberMaxStep: 2,
          },
        ],
      },
      initialPositions: [{ entityId: 0, x: 100, y: 100 }],
    });

    const result = advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("formedMarch");
    expect(getUnitStyleEvents(result.events, 1).map((event) => event.style))
      .toEqual(["formedMarch"]);
  });

  it("keeps formedMarch anchor advancement unchanged", () => {
    const { world, identity, store } = createTestHarness({
      entityCount: 1,
      identity: {
        entityCount: 1,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [0] }],
      },
      formation: {
        entityCount: 1,
        rngSeed: 0x2b03,
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
            unitSpeed: 2,
            order: "advance",
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

    const beforeAnchor = getUnitAnchor(store, 1);
    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("formedMarch");
    expect(getUnitAnchor(store, 1)).toEqual({
      x: beforeAnchor.x + 2,
      y: beforeAnchor.y,
    });
  });

  it("chooses orderedHalt for an explicit hold order even with a blocker", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
      sourceOrder: "hold",
    });

    const result = advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("orderedHalt");
    expect(getUnitStyleEvents(result.events, 1).map((event) => event.style))
      .toEqual(["orderedHalt"]);
  });

  it("keeps orderedHalt from advancing the anchor", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
      sourceOrder: "hold",
    });
    const beforeAnchor = getUnitAnchor(store, 1);

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("orderedHalt");
    expect(getUnitAnchor(store, 1)).toEqual(beforeAnchor);
  });

  it("chooses engageFront for a hostile forward blocker", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });

    const result = advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
    expect(getUnitStyleEvents(result.events, 1).map((event) => event.style))
      .toEqual(["engageFront"]);
  });

  it("can choose haltAndWait for a low-confidence allied blocker case", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceConfidence: 100,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("haltAndWait");
  });

  it("keeps haltAndWait from advancing the anchor", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceConfidence: 100,
    });
    const beforeAnchor = getUnitAnchor(store, 1);

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("haltAndWait");
    expect(getUnitAnchor(store, 1)).toEqual(beforeAnchor);
  });

  it("keeps haltAndWait anchor stopped while the allied blocker remains", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceConfidence: 100,
    });
    const beforeAnchor = getUnitAnchor(store, 1);

    for (let tick = 0; tick < 5; tick += 1) {
      advanceFormationOneTick(world, identity, store);

      expect(getUnitMovementStyle(store, 1)).toBe("haltAndWait");
      expect(getUnitAnchor(store, 1)).toEqual(beforeAnchor);
    }
  });

  it("keeps haltAndWait members from drifting through the allied blocker", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceConfidence: 100,
      sourcePressure: 4_000,
      rngSeed: 98,
    });
    world.positionsX[0] = 109;
    const blockerX = world.positionsX[1]!;

    for (let tick = 0; tick < 6; tick += 1) {
      advanceFormationOneTick(world, identity, store);

      expect(getUnitMovementStyle(store, 1)).toBe("haltAndWait");
      expect(world.positionsX[0]).toBeLessThan(blockerX);
      expect(world.positionsX[0]).toBeLessThanOrEqual(109);
    }

    expect(world.positionsX[0]).toBeLessThan(109);
  });

  it("can choose formedDetour for a cohesive allied blocker case", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 900,
      sourceConfidence: 500,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("formedDetour");
  });

  it("can choose looseFlow for a low-cohesion allied blocker case", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 200,
      sourceConfidence: 500,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("looseFlow");
  });

  it("can choose pushThrough for a high-confidence allied blocker case", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 600,
      sourceConfidence: 950,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("pushThrough");
  });

  it("defaults to formedRegular and preserves core allied blocker arbitration", () => {
    const cases: ReadonlyArray<{
      readonly options: BlockerHarnessOptions;
      readonly expectedStyle: UnitMovementStyle;
    }> = [
      {
        options: { relationship: "allied", sourceConfidence: 100 },
        expectedStyle: "haltAndWait",
      },
      {
        options: {
          relationship: "allied",
          sourceCohesion: 200,
          sourceConfidence: 500,
        },
        expectedStyle: "looseFlow",
      },
      {
        options: {
          relationship: "allied",
          sourceCohesion: 600,
          sourceConfidence: 950,
        },
        expectedStyle: "pushThrough",
      },
      {
        options: {
          relationship: "allied",
          sourceCohesion: 900,
          sourceConfidence: 500,
        },
        expectedStyle: "formedDetour",
      },
    ];

    for (const { options, expectedStyle } of cases) {
      const { world, identity, store } = createBlockerHarness(options);

      advanceFormationOneTick(world, identity, store);

      expect(getUnitBehaviourProfile(store, 1)).toBe("formedRegular");
      expect(getUnitMovementStyle(store, 1)).toBe(expectedStyle);
    }
  });

  it("keeps formedHeavy from choosing looseFlow or high-confidence pushThrough", () => {
    const highConfidenceHarness = createBlockerHarness({
      relationship: "allied",
      sourceBehaviourProfile: "formedHeavy",
      sourceCohesion: 600,
      sourceConfidence: 950,
    });
    const lowCohesionHarness = createBlockerHarness({
      relationship: "allied",
      sourceBehaviourProfile: "formedHeavy",
      sourceCohesion: 200,
      sourceConfidence: 500,
    });

    advanceFormationOneTick(
      highConfidenceHarness.world,
      highConfidenceHarness.identity,
      highConfidenceHarness.store,
    );
    advanceFormationOneTick(
      lowCohesionHarness.world,
      lowCohesionHarness.identity,
      lowCohesionHarness.store,
    );

    expect(getUnitBehaviourProfile(highConfidenceHarness.store, 1)).toBe(
      "formedHeavy",
    );
    expect(getUnitMovementStyle(highConfidenceHarness.store, 1)).toBe(
      "formedDetour",
    );
    expect(getUnitMovementStyle(lowCohesionHarness.store, 1)).toBe(
      "haltAndWait",
    );
    expect(getUnitMovementStyle(highConfidenceHarness.store, 1)).not.toBe(
      "pushThrough",
    );
    expect(getUnitMovementStyle(lowCohesionHarness.store, 1)).not.toBe(
      "looseFlow",
    );
  });

  it("lets looseSkirmisher choose looseFlow and avoid pushThrough", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceBehaviourProfile: "looseSkirmisher",
      sourceCohesion: 600,
      sourceConfidence: 950,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitBehaviourProfile(store, 1)).toBe("looseSkirmisher");
    expect(getUnitMovementStyle(store, 1)).toBe("looseFlow");
    expect(getUnitMovementStyle(store, 1)).not.toBe("pushThrough");
  });

  it("lets routing choose pushThrough and receive existing disruption", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceBehaviourProfile: "routing",
      sourceCohesion: 600,
      sourceConfidence: 100,
      blockerCohesion: 700,
    });
    const sourcePressureBefore = getIndividualPressure(store, 0);
    const blockerPressureBefore = getIndividualPressure(store, 1);

    advanceFormationOneTick(world, identity, store);

    expect(getUnitBehaviourProfile(store, 1)).toBe("routing");
    expect(getUnitMovementStyle(store, 1)).toBe("pushThrough");
    expect(getUnitCohesion(store, 1)).toBe(595);
    expect(getUnitCohesion(store, 2)).toBe(697);
    expect(getIndividualPressure(store, 0)).toBe(
      sourcePressureBefore + 20,
    );
    expect(getIndividualPressure(store, 1)).toBe(
      blockerPressureBefore + 10,
    );
  });

  it("lets explicit hold override routing profile behaviour", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceOrder: "hold",
      sourceBehaviourProfile: "routing",
      sourceCohesion: 600,
      sourceConfidence: 100,
      blockerCohesion: 700,
    });

    const result = advanceFormationOneTick(world, identity, store);

    expect(getUnitBehaviourProfile(store, 1)).toBe("routing");
    expect(getUnitMovementStyle(store, 1)).toBe("orderedHalt");
    expect(getUnitCohesion(store, 1)).toBe(600);
    expect(getUnitCohesion(store, 2)).toBe(700);
    expect(getUnitStyleEvents(result.events, 1).map((event) => event.style))
      .toEqual(["orderedHalt"]);
  });

  it("keeps hostile blockers on engageFront regardless of profile", () => {
    const profiles: readonly UnitBehaviourProfile[] = [
      "formedRegular",
      "formedHeavy",
      "looseSkirmisher",
      "routing",
    ];

    for (const profile of profiles) {
      const { world, identity, store } = createBlockerHarness({
        relationship: "hostile",
        sourceBehaviourProfile: profile,
        sourceCohesion: 200,
        sourceConfidence: 950,
      });

      advanceFormationOneTick(world, identity, store);

      expect(getUnitBehaviourProfile(store, 1)).toBe(profile);
      expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
    }
  });

  it("keeps profile-biased style events transition-only", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceBehaviourProfile: "looseSkirmisher",
      sourceCohesion: 600,
      sourceConfidence: 950,
    });
    const sourceStyleEvents: UnitMovementStyle[] = [];

    for (let tick = 0; tick < 4; tick += 1) {
      const result = advanceFormationOneTick(world, identity, store);
      for (const event of getUnitStyleEvents(result.events, 1)) {
        sourceStyleEvents.push(event.style);
      }
    }

    expect(sourceStyleEvents).toEqual(["looseFlow"]);
  });

  it("replays identical profile-biased arbitration and disruption", () => {
    const runReplay = () => {
      const { world, identity, store } = createBlockerHarness({
        relationship: "allied",
        sourceBehaviourProfile: "routing",
        sourceCohesion: 600,
        sourceConfidence: 100,
        blockerCohesion: 700,
      });
      const styles: UnitMovementStyle[] = [];
      const styleEvents: string[] = [];

      for (let tick = 0; tick < 4; tick += 1) {
        const result = advanceFormationOneTick(world, identity, store);
        styles.push(getUnitMovementStyle(store, 1));
        for (const event of getUnitStyleEvents(result.events, 1)) {
          styleEvents.push(`${tick}:${event.style}`);
        }
      }

      return {
        positionsX: Array.from(world.positionsX),
        positionsY: Array.from(world.positionsY),
        styles,
        sourceCohesion: getUnitCohesion(store, 1),
        blockerCohesion: getUnitCohesion(store, 2),
        sourcePressure: getIndividualPressure(store, 0),
        blockerPressure: getIndividualPressure(store, 1),
        styleEvents,
      };
    };

    expect(runReplay()).toEqual(runReplay());
  });

  it("keeps engageFront from advancing the anchor", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });
    const beforeAnchor = getUnitAnchor(store, 1);

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
    expect(getUnitAnchor(store, 1)).toEqual(beforeAnchor);
  });

  it("keeps engageFront anchor stopped while the hostile blocker remains", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });
    const beforeAnchor = getUnitAnchor(store, 1);

    for (let tick = 0; tick < 5; tick += 1) {
      advanceFormationOneTick(world, identity, store);

      expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
      expect(getUnitAnchor(store, 1)).toEqual(beforeAnchor);
    }
  });

  it("settles engageFront front members to contact without passing the hostile blocker", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });
    const blockerX = world.positionsX[1]!;

    for (let tick = 0; tick < 5; tick += 1) {
      advanceFormationOneTick(world, identity, store);

      expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
      expect(world.positionsX[0]).toBeLessThan(blockerX);
      expect(world.positionsX[0]).toBeLessThanOrEqual(110);
    }

    expect(world.positionsX[0]).toBe(110);
  });

  it("preserves existing engageFront contact positioning when no loadout store is supplied", () => {
    const { world, identity, store } = createReachAwareEngageHarness("ranged");

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
    expect(world.positionsX[0]).toBe(139);
    expect(world.positionsX[1]).toBe(160);
  });

  it("lets close and short reach engageFront members settle close to the hostile blocker", () => {
    const closeHarness = createReachAwareEngageHarness("close");
    const shortHarness = createReachAwareEngageHarness("short");

    advanceFormationOneTick(
      closeHarness.world,
      closeHarness.identity,
      closeHarness.store,
      { loadoutStore: closeHarness.loadout },
    );
    advanceFormationOneTick(
      shortHarness.world,
      shortHarness.identity,
      shortHarness.store,
      { loadoutStore: shortHarness.loadout },
    );

    expect(getUnitMovementStyle(closeHarness.store, 1)).toBe("engageFront");
    expect(getUnitMovementStyle(shortHarness.store, 1)).toBe("engageFront");
    expect(closeHarness.world.positionsX[0]).toBe(138);
    expect(shortHarness.world.positionsX[0]).toBe(136);
    expect(closeHarness.world.positionsX[0]).toBeGreaterThan(
      shortHarness.world.positionsX[0]!,
    );
  });

  it("stops long and veryLong engageFront members farther away than short reach", () => {
    const shortHarness = createReachAwareEngageHarness("short");
    const longHarness = createReachAwareEngageHarness("long");
    const veryLongHarness = createReachAwareEngageHarness("veryLong");

    advanceFormationOneTick(
      shortHarness.world,
      shortHarness.identity,
      shortHarness.store,
      { loadoutStore: shortHarness.loadout },
    );
    advanceFormationOneTick(
      longHarness.world,
      longHarness.identity,
      longHarness.store,
      { loadoutStore: longHarness.loadout },
    );
    advanceFormationOneTick(
      veryLongHarness.world,
      veryLongHarness.identity,
      veryLongHarness.store,
      { loadoutStore: veryLongHarness.loadout },
    );

    expect(shortHarness.world.positionsX[0]).toBe(136);
    expect(longHarness.world.positionsX[0]).toBe(130);
    expect(veryLongHarness.world.positionsX[0]).toBe(126);
    expect(longHarness.world.positionsX[0]).toBeLessThan(
      shortHarness.world.positionsX[0]!,
    );
    expect(veryLongHarness.world.positionsX[0]).toBeLessThan(
      shortHarness.world.positionsX[0]!,
    );
  });

  it("stops ranged engageFront members farther away than long and veryLong reach", () => {
    const longHarness = createReachAwareEngageHarness("long");
    const veryLongHarness = createReachAwareEngageHarness("veryLong");
    const rangedHarness = createReachAwareEngageHarness("ranged");

    advanceFormationOneTick(
      longHarness.world,
      longHarness.identity,
      longHarness.store,
      { loadoutStore: longHarness.loadout },
    );
    advanceFormationOneTick(
      veryLongHarness.world,
      veryLongHarness.identity,
      veryLongHarness.store,
      { loadoutStore: veryLongHarness.loadout },
    );
    advanceFormationOneTick(
      rangedHarness.world,
      rangedHarness.identity,
      rangedHarness.store,
      { loadoutStore: rangedHarness.loadout },
    );

    expect(longHarness.world.positionsX[0]).toBe(130);
    expect(veryLongHarness.world.positionsX[0]).toBe(126);
    expect(rangedHarness.world.positionsX[0]).toBe(116);
    expect(rangedHarness.world.positionsX[0]).toBeLessThan(
      longHarness.world.positionsX[0]!,
    );
    expect(rangedHarness.world.positionsX[0]).toBeLessThan(
      veryLongHarness.world.positionsX[0]!,
    );
  });

  it("does not displace the hostile blocker during reach-aware engageFront", () => {
    const { world, identity, store, loadout } =
      createReachAwareEngageHarness("veryLong");
    const blockerAnchorBefore = getUnitAnchor(store, 2);
    const blockerXBefore = world.positionsX[1]!;
    const blockerYBefore = world.positionsY[1]!;

    advanceFormationOneTick(world, identity, store, { loadoutStore: loadout });

    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
    expect(getUnitAnchor(store, 2)).toEqual(blockerAnchorBefore);
    expect(world.positionsX[1]).toBe(blockerXBefore);
    expect(world.positionsY[1]).toBe(blockerYBefore);
  });

  it("keeps reach-aware engageFront from emitting combat or damage events", () => {
    const { world, identity, store, loadout } =
      createReachAwareEngageHarness("long");

    const result = advanceFormationOneTick(world, identity, store, {
      loadoutStore: loadout,
    });
    const eventKinds = result.events.map((event) => event.kind as string);

    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
    expect(eventKinds).not.toContain("combat");
    expect(eventKinds).not.toContain("damage");
  });

  it("lets explicit hold override reach-aware engageFront and choose orderedHalt", () => {
    const { world, identity, store, loadout } =
      createReachAwareEngageHarness("long");

    advanceFormationOneTick(world, identity, store, { loadoutStore: loadout });
    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");

    setUnitOrder(store, 1, "hold");
    const result = advanceFormationOneTick(world, identity, store, {
      loadoutStore: loadout,
    });

    expect(getUnitMovementStyle(store, 1)).toBe("orderedHalt");
    expect(getUnitStyleEvents(result.events, 1).map((event) => event.style))
      .toEqual(["orderedHalt"]);
  });

  it("throws when reach-aware tick loadout entity count does not match", () => {
    const { world, identity, store } = createReachAwareEngageHarness("short");
    const mismatchedIdentity = createUnitIdentityStore({
      entityCount: 3,
      units: [{ unitId: 1, factionId: 1, memberEntityIds: [0, 1, 2] }],
    });
    const mismatchedLoadout: UnitLoadoutStore = createUnitLoadoutStore(
      mismatchedIdentity,
      {
        entityCount: 3,
        units: [{ unitId: 1, weaponReachBand: "short" }],
      },
    );

    expect(() =>
      advanceFormationOneTick(world, identity, store, {
        loadoutStore: mismatchedLoadout,
      }),
    ).toThrow(RangeError);
  });

  it("uses omitted loadout config defaults safely for engageFront positioning", () => {
    const noLoadoutHarness = createReachAwareEngageHarness("ranged");
    const defaultLoadoutHarness = createReachAwareEngageHarness();

    advanceFormationOneTick(
      noLoadoutHarness.world,
      noLoadoutHarness.identity,
      noLoadoutHarness.store,
    );
    advanceFormationOneTick(
      defaultLoadoutHarness.world,
      defaultLoadoutHarness.identity,
      defaultLoadoutHarness.store,
      { loadoutStore: defaultLoadoutHarness.loadout },
    );

    expect(defaultLoadoutHarness.world.positionsX[0]).toBe(
      noLoadoutHarness.world.positionsX[0],
    );
    expect(defaultLoadoutHarness.world.positionsX[0]).toBe(139);
  });

  it("replays identical reach-aware engageFront positions, styles, and events", () => {
    const runReplay = () => {
      const { world, identity, store, loadout } =
        createReachAwareEngageHarness("veryLong");
      const styles: UnitMovementStyle[] = [];
      const sourcePositions: string[] = [];
      const styleEvents: string[] = [];

      for (let tick = 0; tick < 5; tick += 1) {
        const result = advanceFormationOneTick(world, identity, store, {
          loadoutStore: loadout,
        });
        styles.push(getUnitMovementStyle(store, 1));
        sourcePositions.push(
          `${world.positionsX[0] ?? 0},${world.positionsY[0] ?? 0}`,
        );
        for (const event of getUnitStyleEvents(result.events, 1)) {
          styleEvents.push(`${tick}:${event.style}`);
        }
      }

      return {
        positionsX: Array.from(world.positionsX),
        positionsY: Array.from(world.positionsY),
        styles,
        sourcePositions,
        styleEvents,
      };
    };

    expect(runReplay()).toEqual(runReplay());
  });

  it("lets pushThrough advance the anchor without displacing the blocker", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 600,
      sourceConfidence: 950,
    });
    const sourceAnchorBefore = getUnitAnchor(store, 1);
    const blockerAnchorBefore = getUnitAnchor(store, 2);
    const blockerXBefore = world.positionsX[1]!;
    const blockerYBefore = world.positionsY[1]!;

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("pushThrough");
    expect(getUnitAnchor(store, 1)).toEqual({
      x: sourceAnchorBefore.x + 1,
      y: sourceAnchorBefore.y,
    });
    expect(getUnitAnchor(store, 2)).toEqual(blockerAnchorBefore);
    expect(world.positionsX[1]).toBe(blockerXBefore);
    expect(world.positionsY[1]).toBe(blockerYBefore);
  });

  it("applies minimal pushThrough disruption without displacing either unit", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 600,
      sourceConfidence: 950,
      blockerCohesion: 700,
    });
    const sourceCohesionBefore = getUnitCohesion(store, 1);
    const blockerCohesionBefore = getUnitCohesion(store, 2);
    const sourcePressureBefore = getIndividualPressure(store, 0);
    const blockerPressureBefore = getIndividualPressure(store, 1);
    const blockerAnchorBefore = getUnitAnchor(store, 2);
    const blockerXBefore = world.positionsX[1]!;
    const blockerYBefore = world.positionsY[1]!;

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("pushThrough");
    expect(getUnitCohesion(store, 1)).toBeLessThan(sourceCohesionBefore);
    expect(getUnitCohesion(store, 2)).toBeLessThan(blockerCohesionBefore);
    expect(getIndividualPressure(store, 0)).toBeGreaterThan(
      sourcePressureBefore,
    );
    expect(getIndividualPressure(store, 1)).toBeGreaterThan(
      blockerPressureBefore,
    );
    expect(getUnitAnchor(store, 2)).toEqual(blockerAnchorBefore);
    expect(world.positionsX[1]).toBe(blockerXBefore);
    expect(world.positionsY[1]).toBe(blockerYBefore);
  });

  it("replays identical pushThrough cohesion and pressure changes", () => {
    const runReplay = () => {
      const { world, identity, store } = createBlockerHarness({
        relationship: "allied",
        sourceCohesion: 600,
        sourceConfidence: 950,
        blockerCohesion: 700,
      });
      const styles: UnitMovementStyle[] = [];
      const sourceCohesion: number[] = [];
      const blockerCohesion: number[] = [];
      const sourcePressure: number[] = [];
      const blockerPressure: number[] = [];
      const sourceAnchors: string[] = [];

      for (let tick = 0; tick < 5; tick += 1) {
        advanceFormationOneTick(world, identity, store);
        const sourceAnchor = getUnitAnchor(store, 1);
        styles.push(getUnitMovementStyle(store, 1));
        sourceCohesion.push(getUnitCohesion(store, 1));
        blockerCohesion.push(getUnitCohesion(store, 2));
        sourcePressure.push(getIndividualPressure(store, 0));
        blockerPressure.push(getIndividualPressure(store, 1));
        sourceAnchors.push(`${sourceAnchor.x},${sourceAnchor.y}`);
      }

      return {
        positionsX: Array.from(world.positionsX),
        positionsY: Array.from(world.positionsY),
        styles,
        sourceCohesion,
        blockerCohesion,
        sourcePressure,
        blockerPressure,
        sourceAnchors,
      };
    };

    expect(runReplay()).toEqual(runReplay());
  });

  it("clamps pushThrough pressure and cohesion disruption to safe non-negative integers", () => {
    const maxIntegerStateValue = 2_147_483_647;
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 600,
      sourceConfidence: 950,
      sourcePressure: 790,
      blockerCohesion: 2,
      blockerPressure: maxIntegerStateValue - 5,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("pushThrough");
    expect(getUnitCohesion(store, 1)).toBeGreaterThanOrEqual(0);
    expect(getUnitCohesion(store, 2)).toBe(0);
    expect(getIndividualPressure(store, 0)).toBeGreaterThanOrEqual(0);
    expect(getIndividualPressure(store, 1)).toBe(maxIntegerStateValue);
  });

  it("does not produce combat or damage output for pushThrough", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 600,
      sourceConfidence: 950,
    });

    const result = advanceFormationOneTick(world, identity, store);
    const eventKinds = result.events.map((event) => event.kind as string);

    expect(getUnitMovementStyle(store, 1)).toBe("pushThrough");
    expect(eventKinds).not.toContain("combat");
    expect(eventKinds).not.toContain("damage");
  });

  it("sidesteps formedDetour laterally without a waypoint route", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 900,
      sourceConfidence: 500,
    });
    const sourceAnchorBefore = getUnitAnchor(store, 1);
    const blockerXBefore = world.positionsX[1]!;
    const blockerYBefore = world.positionsY[1]!;

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("formedDetour");
    expect(getUnitAnchor(store, 1)).toEqual({
      x: sourceAnchorBefore.x,
      y: sourceAnchorBefore.y - 1,
    });
    expect(world.positionsX[1]).toBe(blockerXBefore);
    expect(world.positionsY[1]).toBe(blockerYBefore);
  });

  it("does not advance formedDetour straight into a centred allied blocker", () => {
    const { world, identity, store } = createFormedDetourHarness();
    const sourceAnchorBefore = getUnitAnchor(store, 1);

    for (let tick = 0; tick < 4; tick += 1) {
      advanceFormationOneTick(world, identity, store);

      const sourceAnchor = getUnitAnchor(store, 1);
      expect(getUnitMovementStyle(store, 1)).toBe("formedDetour");
      expect(sourceAnchor.x).toBe(sourceAnchorBefore.x);
      expect(sourceAnchor.y).toBeLessThan(sourceAnchorBefore.y);
    }
  });

  it("does not displace the blocker during formedDetour", () => {
    const { world, identity, store } = createFormedDetourHarness();
    const blockerAnchorBefore = getUnitAnchor(store, 2);
    const blockerXBefore = world.positionsX[1]!;
    const blockerYBefore = world.positionsY[1]!;

    for (let tick = 0; tick < 4; tick += 1) {
      advanceFormationOneTick(world, identity, store);
    }

    expect(getUnitAnchor(store, 2)).toEqual(blockerAnchorBefore);
    expect(world.positionsX[1]).toBe(blockerXBefore);
    expect(world.positionsY[1]).toBe(blockerYBefore);
  });

  it("chooses a deterministic formedDetour side for a centred blocker", () => {
    const run = () => {
      const { world, identity, store } = createFormedDetourHarness();
      advanceFormationOneTick(world, identity, store);
      return getUnitAnchor(store, 1);
    };

    expect(run()).toEqual({ x: 100, y: 99 });
    expect(run()).toEqual(run());
  });

  it("sidesteps formedDetour away from an off-centre blocker", () => {
    const highBlocker = createFormedDetourHarness({ blockerAnchorY: 106 });
    advanceFormationOneTick(
      highBlocker.world,
      highBlocker.identity,
      highBlocker.store,
    );
    expect(getUnitAnchor(highBlocker.store, 1)).toEqual({ x: 100, y: 99 });

    const lowBlocker = createFormedDetourHarness({ blockerAnchorY: 94 });
    advanceFormationOneTick(
      lowBlocker.world,
      lowBlocker.identity,
      lowBlocker.store,
    );
    expect(getUnitAnchor(lowBlocker.store, 1)).toEqual({ x: 100, y: 101 });
  });

  it("chooses the valid formedDetour side near a world edge", () => {
    const { world, identity, store } = createFormedDetourHarness({
      bounds: { width: 200, height: 200 },
      sourceAnchorY: 0,
      blockerAnchorY: 0,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("formedDetour");
    expect(getUnitAnchor(store, 1)).toEqual({ x: 100, y: 1 });
  });

  it("keeps formedDetour members following shifted formation slots", () => {
    const { world, identity, store } = createFormedDetourHarness({
      sourceCols: 3,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("formedDetour");
    expect(world.positionsX[0]).toBe(100);
    expect(world.positionsY[0]).toBe(89);
    expect(world.positionsX[1]).toBe(100);
    expect(world.positionsY[1]).toBe(99);
    expect(world.positionsX[2]).toBe(100);
    expect(world.positionsY[2]).toBe(109);
  });

  it("returns formedDetour to formedMarch after sidestepping clear", () => {
    const { world, identity, store } = createFormedDetourHarness();
    const styles: UnitMovementStyle[] = [];

    for (let tick = 0; tick < 20; tick += 1) {
      advanceFormationOneTick(world, identity, store);
      styles.push(getUnitMovementStyle(store, 1));
    }

    expect(styles).toContain("formedMarch");
    expect(getUnitMovementStyle(store, 1)).toBe("formedMarch");
    expect(getUnitAnchor(store, 1).x).toBeGreaterThan(100);
  });

  it("keeps formedDetour transition events transition-only", () => {
    const { world, identity, store } = createFormedDetourHarness();
    const sourceStyleEvents: UnitMovementStyle[] = [];

    for (let tick = 0; tick < 5; tick += 1) {
      const result = advanceFormationOneTick(world, identity, store);
      for (const event of getUnitStyleEvents(result.events, 1)) {
        sourceStyleEvents.push(event.style);
      }
    }

    expect(sourceStyleEvents).toEqual(["formedDetour"]);
  });

  it("replays identical formedDetour positions, anchors, styles, and events", () => {
    const runReplay = () => {
      const { world, identity, store } = createFormedDetourHarness();
      const styles: UnitMovementStyle[] = [];
      const sourceAnchors: string[] = [];
      const styleEvents: string[] = [];

      for (let tick = 0; tick < 20; tick += 1) {
        const result = advanceFormationOneTick(world, identity, store);
        const sourceAnchor = getUnitAnchor(store, 1);
        styles.push(getUnitMovementStyle(store, 1));
        sourceAnchors.push(`${sourceAnchor.x},${sourceAnchor.y}`);
        for (const event of getUnitStyleEvents(result.events, 1)) {
          styleEvents.push(`${tick}:${event.style}`);
        }
      }

      return {
        positionsX: Array.from(world.positionsX),
        positionsY: Array.from(world.positionsY),
        sourceAnchors,
        styles,
        styleEvents,
      };
    };

    expect(runReplay()).toEqual(runReplay());
  });

  it("lets looseFlow advance the anchor while a member moves laterally around the blocker", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 200,
      sourceConfidence: 500,
    });
    const sourceAnchorBefore = getUnitAnchor(store, 1);
    const blockerXBefore = world.positionsX[1]!;
    const blockerYBefore = world.positionsY[1]!;

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("looseFlow");
    expect(getUnitAnchor(store, 1)).toEqual({
      x: sourceAnchorBefore.x + 1,
      y: sourceAnchorBefore.y,
    });
    expect(world.positionsY[0]).not.toBe(sourceAnchorBefore.y);
    expect(world.positionsX[1]).toBe(blockerXBefore);
    expect(world.positionsY[1]).toBe(blockerYBefore);
  });

  it("keeps looseFlow members from all remaining locked to strict formation slots", () => {
    const { world, identity, store } = createFormedDetourHarness({
      sourceCols: 3,
      sourceCohesion: 200,
      sourceConfidence: 500,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("looseFlow");
    const strictSlots = [
      computeSlotWorldPosition(store, 1, 0, 0),
      computeSlotWorldPosition(store, 1, 0, 1),
      computeSlotWorldPosition(store, 1, 0, 2),
    ];
    expect(
      strictSlots.every(
        (slot, entityId) =>
          world.positionsX[entityId] === slot.x &&
          world.positionsY[entityId] === slot.y,
      ),
    ).toBe(false);
    expect(world.positionsY[0]).toBe(88);
    expect(world.positionsY[1]).toBe(102);
    expect(world.positionsY[2]).toBe(112);
  });

  it("does not displace the blocker unit or blocker entity during looseFlow", () => {
    const { world, identity, store } = createFormedDetourHarness({
      sourceCohesion: 200,
      sourceConfidence: 500,
    });
    const blockerAnchorBefore = getUnitAnchor(store, 2);
    const blockerXBefore = world.positionsX[1]!;
    const blockerYBefore = world.positionsY[1]!;

    for (let tick = 0; tick < 4; tick += 1) {
      advanceFormationOneTick(world, identity, store);
    }

    expect(getUnitAnchor(store, 2)).toEqual(blockerAnchorBefore);
    expect(world.positionsX[1]).toBe(blockerXBefore);
    expect(world.positionsY[1]).toBe(blockerYBefore);
  });

  it("does not produce combat or damage output for looseFlow", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 200,
      sourceConfidence: 500,
    });

    const result = advanceFormationOneTick(world, identity, store);
    const eventKinds = result.events.map((event) => event.kind as string);

    expect(getUnitMovementStyle(store, 1)).toBe("looseFlow");
    expect(eventKinds).not.toContain("combat");
    expect(eventKinds).not.toContain("damage");
  });

  it("keeps looseFlow unit identity unchanged", () => {
    const { world, identity, store } = createFormedDetourHarness({
      sourceCols: 3,
      sourceCohesion: 200,
      sourceConfidence: 500,
    });

    advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("looseFlow");
    expect(getUnitIdForEntity(identity, 0)).toBe(1);
    expect(getUnitIdForEntity(identity, 1)).toBe(1);
    expect(getUnitIdForEntity(identity, 2)).toBe(1);
    expect(getUnitIdForEntity(identity, 3)).toBe(2);
  });

  it("replays identical looseFlow movement", () => {
    const runReplay = () => {
      const { world, identity, store } = createFormedDetourHarness({
        sourceCols: 3,
        sourceCohesion: 200,
        sourceConfidence: 500,
      });
      const styles: UnitMovementStyle[] = [];
      const sourceAnchors: string[] = [];
      const styleEvents: string[] = [];

      for (let tick = 0; tick < 10; tick += 1) {
        const result = advanceFormationOneTick(world, identity, store);
        const sourceAnchor = getUnitAnchor(store, 1);
        styles.push(getUnitMovementStyle(store, 1));
        sourceAnchors.push(`${sourceAnchor.x},${sourceAnchor.y}`);
        for (const event of getUnitStyleEvents(result.events, 1)) {
          styleEvents.push(`${tick}:${event.style}`);
        }
      }

      return {
        positionsX: Array.from(world.positionsX),
        positionsY: Array.from(world.positionsY),
        sourceAnchors,
        styles,
        styleEvents,
      };
    };

    expect(runReplay()).toEqual(runReplay());
  });

  it("keeps looseFlow members inside world bounds near an edge", () => {
    const { world, identity, store } = createFormedDetourHarness({
      bounds: { width: 200, height: 200 },
      sourceAnchorY: 0,
      blockerAnchorY: 0,
      sourceCohesion: 200,
      sourceConfidence: 500,
    });

    for (let tick = 0; tick < 4; tick += 1) {
      advanceFormationOneTick(world, identity, store);
      expect(getUnitMovementStyle(store, 1)).toBe("looseFlow");
      expect(world.positionsY[0]).toBeGreaterThanOrEqual(0);
      expect(world.positionsY[0]).toBeLessThanOrEqual(world.bounds.height);
    }
  });

  it("chooses exactly one movement style for the source unit", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });

    const result = advanceFormationOneTick(world, identity, store);
    const sourceStyleEvents = getUnitStyleEvents(result.events, 1);

    expect(sourceStyleEvents).toHaveLength(1);
    expect(sourceStyleEvents[0]?.style).toBe(getUnitMovementStyle(store, 1));
  });

  it("does not produce combat or damage output for engageFront", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });

    const result = advanceFormationOneTick(world, identity, store);
    const eventKinds = result.events.map((event) => event.kind as string);

    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");
    expect(eventKinds).not.toContain("combat");
    expect(eventKinds).not.toContain("damage");
    expect(world.entityCount).toBe(2);
    expect(Array.from(world.ids)).toEqual([0, 1]);
  });

  it("replays identical style choices and events with identical inputs", () => {
    const runReplay = () => {
      const { world, identity, store } = createBlockerHarness({
        relationship: "hostile",
      });
      const styles: UnitMovementStyle[] = [];
      const styleEvents: string[] = [];

      for (let tick = 0; tick < 20; tick += 1) {
        const result = advanceFormationOneTick(world, identity, store);
        styles.push(getUnitMovementStyle(store, 1));
        for (const event of getUnitStyleEvents(result.events, 1)) {
          styleEvents.push(`${tick}:${event.style}`);
        }
      }

      return { styles, styleEvents };
    };

    expect(runReplay()).toEqual(runReplay());
  });

  it("does not oscillate blocker style every tick while the blocker remains", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceCohesion: 900,
      sourceConfidence: 500,
    });
    const styles: UnitMovementStyle[] = [];

    for (let tick = 0; tick < 4; tick += 1) {
      setIndividualPressure(store, 0, tick % 2 === 0 ? 0 : 1_000);
      advanceFormationOneTick(world, identity, store);
      styles.push(getUnitMovementStyle(store, 1));
    }

    expect(styles).toEqual([
      "formedDetour",
      "formedDetour",
      "formedDetour",
      "formedDetour",
    ]);
  });

  it("does not emit the same blocker style every tick", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });
    const sourceStyleEvents: UnitMovementStyle[] = [];

    for (let tick = 0; tick < 5; tick += 1) {
      const result = advanceFormationOneTick(world, identity, store);
      for (const event of getUnitStyleEvents(result.events, 1)) {
        sourceStyleEvents.push(event.style);
      }
    }

    expect(sourceStyleEvents).toEqual(["engageFront"]);
  });

  it("keeps transition events transition-only for haltAndWait", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "allied",
      sourceConfidence: 100,
    });
    const sourceStyleEvents: UnitMovementStyle[] = [];

    for (let tick = 0; tick < 4; tick += 1) {
      const result = advanceFormationOneTick(world, identity, store);
      for (const event of getUnitStyleEvents(result.events, 1)) {
        sourceStyleEvents.push(event.style);
      }
    }

    expect(sourceStyleEvents).toEqual(["haltAndWait"]);
  });

  it("lets explicit hold override a committed blocker style and emit orderedHalt once", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });

    advanceFormationOneTick(world, identity, store);
    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");

    setUnitOrder(store, 1, "hold");
    const holdResult = advanceFormationOneTick(world, identity, store);
    const secondHoldResult = advanceFormationOneTick(world, identity, store);

    expect(getUnitMovementStyle(store, 1)).toBe("orderedHalt");
    expect(getUnitStyleEvents(holdResult.events, 1).map((event) => event.style))
      .toEqual(["orderedHalt"]);
    expect(getUnitStyleEvents(secondHoldResult.events, 1)).toHaveLength(0);
  });

  it("releases a blocker style after the blocker disappears", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });

    advanceFormationOneTick(world, identity, store);
    expect(getUnitMovementStyle(store, 1)).toBe("engageFront");

    moveBlockerOutOfForwardPath(world);

    const styles: UnitMovementStyle[] = [];
    for (let tick = 0; tick < 6; tick += 1) {
      advanceFormationOneTick(world, identity, store);
      styles.push(getUnitMovementStyle(store, 1));
    }

    expect(styles).toContain("formedMarch");
  });

  it("returns to formedMarch after release when no blocker remains", () => {
    const { world, identity, store } = createBlockerHarness({
      relationship: "hostile",
    });

    advanceFormationOneTick(world, identity, store);
    moveBlockerOutOfForwardPath(world);

    for (let tick = 0; tick < 6; tick += 1) {
      advanceFormationOneTick(world, identity, store);
    }

    expect(getUnitMovementStyle(store, 1)).toBe("formedMarch");
  });

  it("replays identical committed style choices and events with blocker release", () => {
    const runReplay = () => {
      const { world, identity, store } = createBlockerHarness({
        relationship: "hostile",
      });
      const styles: UnitMovementStyle[] = [];
      const styleEvents: string[] = [];

      for (let tick = 0; tick < 10; tick += 1) {
        if (tick === 2) {
          moveBlockerOutOfForwardPath(world);
        }

        const result = advanceFormationOneTick(world, identity, store);
        styles.push(getUnitMovementStyle(store, 1));
        for (const event of getUnitStyleEvents(result.events, 1)) {
          styleEvents.push(`${tick}:${event.style}`);
        }
      }

      return { styles, styleEvents };
    };

    expect(runReplay()).toEqual(runReplay());
  });

  it("replays identical positions, styles, and events with anchor consequences", () => {
    const runReplay = () => {
      const { world, identity, store } = createBlockerHarness({
        relationship: "hostile",
      });
      const styles: UnitMovementStyle[] = [];
      const sourceAnchors: string[] = [];
      const styleEvents: string[] = [];

      for (let tick = 0; tick < 10; tick += 1) {
        if (tick === 2) {
          moveBlockerOutOfForwardPath(world);
        }

        const result = advanceFormationOneTick(world, identity, store);
        const sourceAnchor = getUnitAnchor(store, 1);
        styles.push(getUnitMovementStyle(store, 1));
        sourceAnchors.push(`${sourceAnchor.x},${sourceAnchor.y}`);
        for (const event of getUnitStyleEvents(result.events, 1)) {
          styleEvents.push(`${tick}:${event.style}`);
        }
      }

      return {
        positionsX: Array.from(world.positionsX),
        positionsY: Array.from(world.positionsY),
        sourceAnchors,
        styles,
        styleEvents,
      };
    };

    expect(runReplay()).toEqual(runReplay());
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
