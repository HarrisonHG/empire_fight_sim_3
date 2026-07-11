import { describe, expect, it } from "vitest";

import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getIndividualConfiguredMaxStep,
  getIndividualPressure,
  getUnitAnchor,
  getUnitCohesion,
  getUnitConfiguredSpeed,
  getUnitHeading,
  getUnitMovementStyle,
  getUnitOrder,
  getUnitRoutingHeading,
  type FormationBehaviourConfig,
} from "../../src/sim/formationBehaviour";
import type { MoraleMovementState } from "../../src/sim/moraleMovement";
import {
  createUnitIdentityStore,
  type UnitId,
  type UnitIdentityConfig,
} from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

describe("routing movement", () => {
  it("moves a routing unit away from its primary nearby hostile", () => {
    const harness = createRoutingHarness();

    advanceRoutingTicks(harness, 3);

    expect(getUnitRoutingHeading(harness.store, 1)).toEqual({ x: -1, y: 0 });
    expect(getUnitMovementStyle(harness.store, 1)).toBe("routeAway");
    expect(harness.world.positionsX[0]).toBeLessThan(100);
    expect(getUnitAnchor(harness.store, 1).x).toBeLessThan(100);
  });

  it("falls back opposite the stored heading when no hostile is nearby", () => {
    const harness = createRoutingHarness({ units: [sourceUnit()] });

    advanceRoutingTicks(harness, 1);

    expect(getUnitRoutingHeading(harness.store, 1)).toEqual({ x: -1, y: 0 });
    expect(harness.world.positionsX[0]).toBeLessThan(100);
  });

  it("keeps both the routing anchor and members behind a separate hostile in the retreat path", () => {
    const harness = createRoutingHarness({
      units: [
        { ...sourceUnit(), unitSpeed: 10 },
        { ...hostileUnit(), anchorX: 104 },
        {
          ...hostileUnit(),
          unitId: 3,
          memberEntityIds: [2],
          anchorX: 90,
        },
      ],
    });

    advanceRoutingTicks(harness, 1);

    expect(getUnitRoutingHeading(harness.store, 1)).toEqual({ x: -1, y: 0 });
    expect(getUnitAnchor(harness.store, 1).x).toBe(96);
    expect(harness.world.positionsX[0]).toBe(96);
    expect(getUnitAnchor(harness.store, 1).x).toBeGreaterThan(90);
    expect(harness.world.positionsX[0]).toBeGreaterThan(90);
  });

  it("physically flows through allied units without applying contagion effects", () => {
    const harness = createRoutingHarness({
      units: [
        sourceUnit(),
        hostileUnit(),
        {
          unitId: 3,
          factionId: 1,
          memberEntityIds: [2],
          anchorX: 90,
          anchorY: 100,
          headingX: 1,
          headingY: 0,
          unitSpeed: 0,
          order: "hold",
          memberMaxStep: 0,
        },
      ],
    });

    advanceRoutingTicks(harness, 3);

    expect(harness.world.positionsX[0]).toBeLessThan(harness.world.positionsX[2]!);
    expect(harness.world.positionsX[2]).toBe(90);
    expect(getUnitMovementStyle(harness.store, 1)).toBe("routeAway");
    expect(getUnitCohesion(harness.store, 3)).toBe(1_000);
    expect(getIndividualPressure(harness.store, 2)).toBe(0);
  });

  it("clamps at a world edge and chooses a deterministic valid alternative", () => {
    const harness = createRoutingHarness({
      bounds: { width: 200, height: 200 },
      units: [
        {
          ...sourceUnit(),
          anchorX: 198,
          unitSpeed: 4,
        },
        {
          ...hostileUnit(),
          anchorX: 140,
          memberEntityIds: [1],
        },
      ],
      positions: [
        { entityId: 0, x: 198, y: 100 },
        { entityId: 1, x: 140, y: 100 },
      ],
    });

    advanceRoutingTicks(harness, 1);

    expect(getUnitRoutingHeading(harness.store, 1)).toEqual({ x: 0, y: 1 });
    expect(getUnitAnchor(harness.store, 1)).toEqual({ x: 198, y: 104 });
    expect(harness.world.positionsX[0]).toBe(198);
    expect(harness.world.positionsY[0]).toBe(105);
  });

  it("uses tick-start data regardless of whether the hostile is processed first", () => {
    const routerFirst = createOrderIndependenceHarness(1, 2);
    const hostileFirst = createOrderIndependenceHarness(2, 1);

    advanceRoutingTicks(routerFirst, 1);
    advanceRoutingTicks(hostileFirst, 1);

    expect(getUnitRoutingHeading(routerFirst.store, 1)).toEqual({ x: -1, y: 0 });
    expect(getUnitRoutingHeading(hostileFirst.store, 2)).toEqual({ x: -1, y: 0 });
    expect(routerFirst.world.positionsX[0]).toBe(hostileFirst.world.positionsX[0]);
  });

  it("replays routing deterministically while preserving original configuration and membership", () => {
    const run = () => {
      const harness = createRoutingHarness();
      const initialIds = Array.from(harness.world.ids);

      for (let tick = 0; tick < 40; tick += 1) {
        advanceRoutingTicks(harness, 1);
      }

      return {
        sourceAnchor: getUnitAnchor(harness.store, 1),
        sourceRouteHeading: getUnitRoutingHeading(harness.store, 1),
        positionsX: Array.from(harness.world.positionsX),
        positionsY: Array.from(harness.world.positionsY),
        entityCount: harness.world.entityCount,
        ids: Array.from(harness.world.ids),
        initialIds,
        order: getUnitOrder(harness.store, 1),
        speed: getUnitConfiguredSpeed(harness.store, 1),
        memberStep: getIndividualConfiguredMaxStep(harness.store, 0),
        heading: getUnitHeading(harness.store, 1),
      };
    };

    const replay = run();
    expect(replay).toEqual(run());
    expect(replay.entityCount).toBe(2);
    expect(replay.ids).toEqual(replay.initialIds);
    expect(replay.order).toBe("advanceCautious");
    expect(replay.speed).toBe(5);
    expect(replay.memberStep).toBe(5);
    expect(replay.heading).toEqual({ x: 1, y: 0 });
  });

  it("keeps a multi-member loose retreat footprint bounded over a long horizon", () => {
    const harness = createRoutingHarness({
      units: [
        {
          ...sourceUnit(),
          memberEntityIds: [0, 1, 2],
          anchorX: 350,
        },
        {
          ...hostileUnit(),
          memberEntityIds: [3],
          anchorX: 450,
        },
      ],
      positions: [
        { entityId: 0, x: 350, y: 100 },
        { entityId: 1, x: 350, y: 100 },
        { entityId: 2, x: 350, y: 100 },
        { entityId: 3, x: 450, y: 100 },
      ],
    });

    advanceRoutingTicks(harness, 40);

    const memberYs = [
      harness.world.positionsY[0]!,
      harness.world.positionsY[1]!,
      harness.world.positionsY[2]!,
    ];
    expect(Math.max(...memberYs) - Math.min(...memberYs)).toBeLessThanOrEqual(10);
    expect(getUnitAnchor(harness.store, 1).x).toBeLessThan(350);
  });
});

interface RoutingUnitDefinition {
  readonly unitId: UnitId;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly unitSpeed: number;
  readonly order: "hold" | "advance" | "advanceCautious";
  readonly memberMaxStep: number;
}

function createRoutingHarness(options: {
  bounds?: { readonly width: number; readonly height: number };
  units?: readonly RoutingUnitDefinition[];
  positions?: readonly { readonly entityId: number; readonly x: number; readonly y: number }[];
} = {}) {
  const units = options.units ?? [sourceUnit(), hostileUnit()];
  const entityCount = units.reduce(
    (total, unit) => total + unit.memberEntityIds.length,
    0,
  );
  const bounds = options.bounds ?? { width: 500, height: 500 };
  const world: WorldState = {
    entityCount,
    bounds,
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const positions =
    options.positions ??
    units.flatMap((unit) =>
      unit.memberEntityIds.map((entityId) => ({
        entityId,
        x: unit.anchorX,
        y: unit.anchorY,
      })),
    );
  for (const position of positions) {
    world.positionsX[position.entityId] = position.x;
    world.positionsY[position.entityId] = position.y;
  }

  const identityConfig: UnitIdentityConfig = {
    entityCount,
    units: units.map((unit) => ({
      unitId: unit.unitId,
      factionId: unit.factionId,
      memberEntityIds: unit.memberEntityIds,
    })),
  };
  const identity = createUnitIdentityStore(identityConfig);
  const formationConfig: FormationBehaviourConfig = {
    entityCount,
    rngSeed: 0x45_52_4f_55,
    units: units.map((unit) => ({
      unitId: unit.unitId,
      anchorX: unit.anchorX,
      anchorY: unit.anchorY,
      headingX: unit.headingX,
      headingY: unit.headingY,
      spacing: 10,
      rows: 1,
      cols: 1,
      unitSpeed: unit.unitSpeed,
      order: unit.order,
    })),
    individuals: units.flatMap((unit) =>
      unit.memberEntityIds.map((entityId) => ({
        entityId,
        role: "regular" as const,
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: unit.memberMaxStep,
      })),
    ),
  };
  const store = createFormationBehaviourStore(identity, formationConfig);
  const moraleStates = new Map<UnitId, MoraleMovementState>([
    [units[0]!.unitId, "routing"],
  ]);

  return { world, identity, store, moraleStates };
}

function sourceUnit(): RoutingUnitDefinition {
  return {
    unitId: 1,
    factionId: 1,
    memberEntityIds: [0],
    anchorX: 100,
    anchorY: 100,
    headingX: 1,
    headingY: 0,
    unitSpeed: 5,
    order: "advanceCautious",
    memberMaxStep: 5,
  };
}

function hostileUnit(): RoutingUnitDefinition {
  return {
    unitId: 2,
    factionId: 2,
    memberEntityIds: [1],
    anchorX: 130,
    anchorY: 100,
    headingX: -1,
    headingY: 0,
    unitSpeed: 0,
    order: "hold",
    memberMaxStep: 0,
  };
}

function createOrderIndependenceHarness(
  routingUnitId: UnitId,
  hostileUnitId: UnitId,
) {
  const source = { ...sourceUnit(), unitId: routingUnitId };
  const hostile = {
    ...hostileUnit(),
    unitId: hostileUnitId,
    order: "advance" as const,
    headingX: -1,
    unitSpeed: 5,
    memberMaxStep: 0,
  };
  const harness = createRoutingHarness({ units: [source, hostile] });
  harness.moraleStates.clear();
  harness.moraleStates.set(routingUnitId, "routing");
  return harness;
}

function advanceRoutingTicks(
  harness: ReturnType<typeof createRoutingHarness>,
  tickCount: number,
): void {
  for (let tick = 0; tick < tickCount; tick += 1) {
    advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.store,
      harness.moraleStates,
    );
  }
}
