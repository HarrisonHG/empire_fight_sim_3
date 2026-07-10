import { describe, expect, it } from "vitest";

import {
  computeUnitEngagementSummary,
  computeUnitEngagementTarget,
  collectUnitEngagements,
  getPrimaryEngagement,
  getUnitEngagementState,
  isUnitEngaged,
  type UnitEngagementTarget,
} from "../../src/sim/combatEngagement";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getUnitAnchor,
  getUnitHeading,
  getUnitMovementStyle,
  type FormationBehaviourStore,
  type UnitOrder,
} from "../../src/sim/formationBehaviour";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  getFactionIdForUnit,
  getUnitIds,
  getUnitMembers,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import {
  createUnitLoadoutStore,
  getUnitLoadoutSummary,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "../../src/sim/unitLoadout";

describe("combat engagement detection", () => {
  it("reports none when no hostile unit is in relevant geometry", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });
    const out: UnitEngagementTarget[] = [
      computeUnitEngagementTarget(world, identity, loadout, formation, 10, 20),
    ];

    expect(
      getUnitEngagementState(world, identity, loadout, formation, 10),
    ).toBe("none");
    expect(
      computeUnitEngagementSummary(world, identity, loadout, formation, 10),
    ).toMatchObject({
      sourceUnitId: 10,
      engagementState: "none",
      primaryTarget: undefined,
      targets: [],
    });
    expect(collectUnitEngagements(world, identity, loadout, formation, 10, out))
      .toBe(out);
    expect(out).toEqual([]);
  });

  it("marks a hostile in front and within threat but outside contact as threatening", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    const target = computeUnitEngagementTarget(
      world,
      identity,
      loadout,
      formation,
      10,
      20,
    );

    expect(target).toMatchObject({
      sourceUnitId: 10,
      targetUnitId: 20,
      relationship: "hostile",
      distance: 8,
      forwardDistance: 8,
      lateralDistance: 0,
      inFront: true,
      inThreatRange: true,
      inContactRange: false,
      sourceMovementStyle: "orderedHalt",
      engagementState: "threatening",
    });
    expect(
      computeUnitEngagementSummary(world, identity, loadout, formation, 10)
        .engagementState,
    ).toBe("threatening");
  });

  it("marks a hostile in contact range as contacting when not committed", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      units: [
        {
          unitId: 10,
          factionId: 1,
          memberEntityIds: [0],
          order: "hold",
          reach: "short",
        },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    const target = computeUnitEngagementTarget(
      world,
      identity,
      loadout,
      formation,
      10,
      20,
    );

    expect(target.inContactRange).toBe(true);
    expect(target.sourceMovementStyle).toBe("orderedHalt");
    expect(target.engagementState).toBe("contacting");
    expect(isUnitEngaged(world, identity, loadout, formation, 10)).toBe(false);
  });

  it("marks a hostile engageFront contact as engaged", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 100, y: 100 },
        { x: 110, y: 100 },
      ],
      units: [
        {
          unitId: 10,
          factionId: 1,
          memberEntityIds: [0],
          order: "advance",
          reach: "long",
        },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    advanceFormationOneTick(world, identity, formation);
    const target = computeUnitEngagementTarget(
      world,
      identity,
      loadout,
      formation,
      10,
      20,
    );

    expect(getUnitMovementStyle(formation, 10)).toBe("engageFront");
    expect(target.inContactRange).toBe(true);
    expect(target.sourceMovementStyle).toBe("engageFront");
    expect(target.engagementState).toBe("engaged");
    expect(isUnitEngaged(world, identity, loadout, formation, 10)).toBe(true);
    expect(getPrimaryEngagement(world, identity, loadout, formation, 10))
      .toMatchObject({ targetUnitId: 20, engagementState: "engaged" });
  });

  it("ignores allied units during hostile engagement collection", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 8, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 1, memberEntityIds: [1] },
        { unitId: 30, factionId: 2, memberEntityIds: [2] },
      ],
    });

    expect(() =>
      computeUnitEngagementTarget(world, identity, loadout, formation, 10, 20),
    ).toThrow(RangeError);
    expect(
      collectUnitEngagements(world, identity, loadout, formation, 10, []).map(
        (target) => target.targetUnitId,
      ),
    ).toEqual([30]);
  });

  it("does not treat a hostile behind the source as an in-front engagement", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: -4, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    const target = computeUnitEngagementTarget(
      world,
      identity,
      loadout,
      formation,
      10,
      20,
    );

    expect(target.forwardDistance).toBe(-4);
    expect(target.inFront).toBe(false);
    expect(target.inThreatRange).toBe(false);
    expect(target.engagementState).toBe("none");
    expect(collectUnitEngagements(world, identity, loadout, formation, 10, []))
      .toEqual([]);
  });

  it("computes lateral offset deterministically", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 6, y: 3 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    const target = computeUnitEngagementTarget(
      world,
      identity,
      loadout,
      formation,
      10,
      20,
    );

    expect(target.forwardDistance).toBe(6);
    expect(target.lateralDistance).toBe(3);
    expect(target.distance).toBeCloseTo(Math.hypot(6, 3));
  });

  it("uses formation heading rather than the old +X placeholder", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 0, y: 8 },
      ],
      units: [
        {
          unitId: 10,
          factionId: 1,
          memberEntityIds: [0],
          headingX: 0,
          headingY: 1,
          reach: "short",
        },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    const target = computeUnitEngagementTarget(
      world,
      identity,
      loadout,
      formation,
      10,
      20,
    );

    expect(target.forwardDistance).toBe(8);
    expect(target.lateralDistance).toBe(0);
    expect(target.inFront).toBe(true);
    expect(target.engagementState).toBe("threatening");
  });

  it("lets long and veryLong reach threaten farther than short reach", () => {
    const shortHarness = createTwoUnitReachHarness("short", 18);
    const longHarness = createTwoUnitReachHarness("long", 18);
    const veryLongHarness = createTwoUnitReachHarness("veryLong", 24);

    expect(
      getUnitEngagementState(
        shortHarness.world,
        shortHarness.identity,
        shortHarness.loadout,
        shortHarness.formation,
        10,
      ),
    ).toBe("none");
    expect(
      getUnitEngagementState(
        longHarness.world,
        longHarness.identity,
        longHarness.loadout,
        longHarness.formation,
        10,
      ),
    ).toBe("threatening");
    expect(
      getUnitEngagementState(
        veryLongHarness.world,
        veryLongHarness.identity,
        veryLongHarness.loadout,
        veryLongHarness.formation,
        10,
      ),
    ).toBe("threatening");
  });

  it("lets ranged reach threaten at the largest distance without damage or attacks", () => {
    const { world, identity, loadout, formation } = createTwoUnitReachHarness(
      "ranged",
      80,
    );

    const target = computeUnitEngagementTarget(
      world,
      identity,
      loadout,
      formation,
      10,
      20,
    );

    expect(target.engagementState).toBe("threatening");
    expect(Object.keys(target)).not.toContain("attack");
    expect(Object.keys(target)).not.toContain("damage");
  });

  it("keeps explicit hold near a hostile from becoming engaged", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      units: [
        {
          unitId: 10,
          factionId: 1,
          memberEntityIds: [0],
          order: "hold",
          reach: "short",
        },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    expect(getUnitMovementStyle(formation, 10)).toBe("orderedHalt");
    expect(
      getUnitEngagementState(world, identity, loadout, formation, 10),
    ).toBe("contacting");
    expect(isUnitEngaged(world, identity, loadout, formation, 10)).toBe(false);
  });

  it("clears and reuses the provided output array", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 8, y: 0 },
        { x: 100, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 1, memberEntityIds: [1] },
        { unitId: 30, factionId: 2, memberEntityIds: [2] },
        { unitId: 40, factionId: 3, memberEntityIds: [3] },
      ],
    });
    const out: UnitEngagementTarget[] = [
      computeUnitEngagementTarget(world, identity, loadout, formation, 10, 40),
    ];

    const returned = collectUnitEngagements(
      world,
      identity,
      loadout,
      formation,
      10,
      out,
    );

    expect(returned).toBe(out);
    expect(out.map((target) => target.targetUnitId)).toEqual([30]);
  });

  it("throws for unknown source and target unit IDs", () => {
    const { world, identity, loadout, formation } = createTwoUnitReachHarness(
      "short",
      4,
    );

    expect(() =>
      getUnitEngagementState(world, identity, loadout, formation, 99),
    ).toThrow(RangeError);
    expect(() =>
      computeUnitEngagementTarget(world, identity, loadout, formation, 10, 99),
    ).toThrow(RangeError);
    expect(() =>
      collectUnitEngagements(world, identity, loadout, formation, 99, []),
    ).toThrow(RangeError);
  });

  it("throws when world, loadout, or formation entity counts are inconsistent", () => {
    const { world, identity, loadout, formation } = createTwoUnitReachHarness(
      "short",
      4,
    );
    const mismatchedWorld: WorldState = { ...world, entityCount: 3 };
    const mismatchedLoadout: UnitLoadoutStore = {
      ...loadout,
      entityCount: 3,
    };
    const mismatchedFormation: FormationBehaviourStore = {
      ...formation,
      entityCount: 3,
    };

    expect(() =>
      getUnitEngagementState(
        mismatchedWorld,
        identity,
        loadout,
        formation,
        10,
      ),
    ).toThrow(RangeError);
    expect(() =>
      getUnitEngagementState(
        world,
        identity,
        mismatchedLoadout,
        formation,
        10,
      ),
    ).toThrow(RangeError);
    expect(() =>
      getUnitEngagementState(
        world,
        identity,
        loadout,
        mismatchedFormation,
        10,
      ),
    ).toThrow(RangeError);
  });

  it("repeats identical engagement summaries from identical inputs", () => {
    const run = () => {
      const { world, identity, loadout, formation } = createEngagementHarness({
        positions: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 8, y: 0 },
        ],
        units: [
          { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
          { unitId: 20, factionId: 2, memberEntityIds: [1] },
          { unitId: 30, factionId: 3, memberEntityIds: [2] },
        ],
      });

      return {
        directTarget: computeUnitEngagementTarget(
          world,
          identity,
          loadout,
          formation,
          10,
          20,
        ),
        summary: computeUnitEngagementSummary(
          world,
          identity,
          loadout,
          formation,
          10,
        ),
        collected: collectUnitEngagements(
          world,
          identity,
          loadout,
          formation,
          10,
          [],
        ),
      };
    };

    expect(run()).toEqual(run());
  });

  it("does not mutate world, identity, loadout, or formation state", () => {
    const { world, identity, loadout, formation } = createEngagementHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 8, y: 3 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
        { unitId: 30, factionId: 3, memberEntityIds: [2] },
      ],
    });
    const before = snapshotInputs(world, identity, loadout, formation);
    const out: UnitEngagementTarget[] = [];

    computeUnitEngagementTarget(world, identity, loadout, formation, 10, 20);
    computeUnitEngagementSummary(world, identity, loadout, formation, 10);
    collectUnitEngagements(world, identity, loadout, formation, 10, out);
    getPrimaryEngagement(world, identity, loadout, formation, 10);
    isUnitEngaged(world, identity, loadout, formation, 10);

    expect(snapshotInputs(world, identity, loadout, formation)).toEqual(before);
  });
});

interface EngagementHarnessUnit {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly headingX?: number;
  readonly headingY?: number;
  readonly order?: UnitOrder;
  readonly reach?: WeaponReachBand;
}

interface EngagementHarnessConfig {
  readonly positions: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly units: readonly EngagementHarnessUnit[];
}

function createTwoUnitReachHarness(
  reach: WeaponReachBand,
  targetDistance: number,
) {
  return createEngagementHarness({
    positions: [
      { x: 0, y: 0 },
      { x: targetDistance, y: 0 },
    ],
    units: [
      { unitId: 10, factionId: 1, memberEntityIds: [0], reach },
      { unitId: 20, factionId: 2, memberEntityIds: [1] },
    ],
  });
}

function createEngagementHarness(config: EngagementHarnessConfig): {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
} {
  const entityCount = config.positions.length;
  const world: WorldState = {
    entityCount,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(config.positions.map((position) => position.x)),
    positionsY: Int32Array.from(config.positions.map((position) => position.y)),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const identity = createUnitIdentityStore({
    entityCount,
    units: config.units.map((unit) => ({
      unitId: unit.unitId,
      factionId: unit.factionId,
      memberEntityIds: unit.memberEntityIds,
    })),
  });
  const loadout = createUnitLoadoutStore(identity, {
    entityCount,
    units: config.units
      .filter((unit) => unit.reach !== undefined)
      .map((unit) => ({
        unitId: unit.unitId,
        weaponReachBand: unit.reach!,
      })),
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x3c01,
    units: config.units.map((unit) => {
      const anchor = config.positions[unit.memberEntityIds[0]!]!;
      return {
        unitId: unit.unitId,
        anchorX: anchor.x,
        anchorY: anchor.y,
        headingX: unit.headingX ?? 1,
        headingY: unit.headingY ?? 0,
        spacing: 10,
        rows: 1,
        cols: unit.memberEntityIds.length,
        unitSpeed: 0,
        order: unit.order ?? "hold",
      };
    }),
    individuals: config.units.flatMap((unit) =>
      unit.memberEntityIds.map((entityId, slotCol) => ({
        entityId,
        role: "regular" as const,
        slotRow: 0,
        slotCol,
        memberMaxStep: 0,
      })),
    ),
  });

  return { world, identity, loadout, formation };
}

function snapshotInputs(
  world: WorldState,
  identity: UnitIdentityStore,
  loadout: UnitLoadoutStore,
  formation: FormationBehaviourStore,
): readonly unknown[] {
  const unitIds = getUnitIds(identity);
  return [
    {
      entityCount: world.entityCount,
      ids: Array.from(world.ids),
      positionsX: Array.from(world.positionsX),
      positionsY: Array.from(world.positionsY),
      velocitiesX: Array.from(world.velocitiesX),
      velocitiesY: Array.from(world.velocitiesY),
    },
    unitIds.map((unitId) => ({
      unitId,
      factionId: getFactionIdForUnit(identity, unitId),
      members: Array.from(getUnitMembers(identity, unitId)),
    })),
    unitIds.map((unitId) => getUnitLoadoutSummary(loadout, unitId)),
    unitIds.map((unitId) => ({
      unitId,
      anchor: getUnitAnchor(formation, unitId),
      heading: getUnitHeading(formation, unitId),
      style: getUnitMovementStyle(formation, unitId),
    })),
  ];
}
