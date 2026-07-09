import { describe, expect, it } from "vitest";

import {
  advanceCombatTempoOneTick,
  collectAttackOpportunities,
  createCombatTempoStore,
  getUnitAttackCooldownTicks,
  type CombatAttackOpportunity,
  type CombatTempoStore,
} from "../../src/sim/combatTempo";
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

describe("combat tempo", () => {
  it("creates a combat tempo store for units in the identity store", () => {
    const { identity } = createTempoHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
        { unitId: 30, factionId: 3, memberEntityIds: [2] },
      ],
    });

    const tempo = createCombatTempoStore(identity, {
      entityCount: 3,
      units: [],
    });

    expect(tempo.entityCount).toBe(3);
    expect(tempo.unitCount).toBe(3);
  });

  it("applies deterministic default and configured cooldown values", () => {
    const { identity } = createTempoHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });

    const defaultTempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [],
    });
    const configuredTempo = createCombatTempoStore(identity, {
      entityCount: 2,
      baseAttackIntervalTicks: 6,
      units: [{ unitId: 20, attackIntervalTicks: 4 }],
    });

    expect(getUnitAttackCooldownTicks(defaultTempo, 10)).toBe(10);
    expect(getUnitAttackCooldownTicks(defaultTempo, 20)).toBe(10);
    expect(getUnitAttackCooldownTicks(configuredTempo, 10)).toBe(6);
    expect(getUnitAttackCooldownTicks(configuredTempo, 20)).toBe(4);
  });

  it("throws for duplicate unit tempo config", () => {
    const { identity } = createTwoUnitTempoHarness();

    expect(() =>
      createCombatTempoStore(identity, {
        entityCount: 2,
        units: [
          { unitId: 10, attackIntervalTicks: 4 },
          { unitId: 10, attackIntervalTicks: 6 },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("throws for unknown unit tempo config", () => {
    const { identity } = createTwoUnitTempoHarness();

    expect(() =>
      createCombatTempoStore(identity, {
        entityCount: 2,
        units: [{ unitId: 99, attackIntervalTicks: 4 }],
      }),
    ).toThrow(RangeError);
  });

  it("throws when querying an unknown unit ID", () => {
    const { identity } = createTwoUnitTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [],
    });

    expect(() => getUnitAttackCooldownTicks(tempo, 99)).toThrow(RangeError);
  });

  it("produces no attack opportunity when there is no hostile engagement", () => {
    const { world, identity, loadout, formation } = createTempoHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );

    expect(result.opportunities).toEqual([]);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(10);
  });

  it("produces no attack opportunity for a threatening-only target", () => {
    const { world, identity, loadout, formation } = createTempoHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "short" },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
    });
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );

    expect(result.opportunities).toEqual([]);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(10);
  });

  it("produces no attack opportunity for a contacting-only target", () => {
    const { world, identity, loadout, formation } = createTempoHarness({
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
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );

    expect(getUnitMovementStyle(formation, 10)).toBe("orderedHalt");
    expect(result.opportunities).toEqual([]);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(10);
  });

  it("eventually produces an attack opportunity for an engageFront target", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [],
    });
    const opportunities: CombatAttackOpportunity[][] = [];

    for (let tick = 0; tick < 10; tick += 1) {
      const result = advanceCombatTempoOneTick(
        world,
        identity,
        loadout,
        formation,
        tempo,
      );
      opportunities.push([...result.opportunities]);
    }

    expect(opportunities.slice(0, 9).every((tick) => tick.length === 0))
      .toBe(true);
    expect(opportunities[9]).toEqual([
      {
        sourceUnitId: 10,
        targetUnitId: 20,
        sourceMovementStyle: "engageFront",
        engagementState: "engaged",
        weaponReachBand: "long",
      },
    ]);
  });

  it("includes source unit ID and target unit ID in each opportunity", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );

    expect(result.opportunities[0]).toMatchObject({
      sourceUnitId: 10,
      targetUnitId: 20,
    });
  });

  it("resets source cooldown after an opportunity", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );

    expect(result.opportunities).toHaveLength(1);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(10);
  });

  it("advances cooldown deterministically over repeated engaged ticks", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [],
    });
    const cooldowns: number[] = [];
    const opportunityCounts: number[] = [];

    for (let tick = 0; tick < 12; tick += 1) {
      const result = advanceCombatTempoOneTick(
        world,
        identity,
        loadout,
        formation,
        tempo,
      );
      cooldowns.push(getUnitAttackCooldownTicks(tempo, 10));
      opportunityCounts.push(result.opportunities.length);
    }

    expect(cooldowns).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 10, 9, 8]);
    expect(opportunityCounts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
  });

  it("never produces hostile attack opportunities from allied-only contact", () => {
    const { world, identity, loadout, formation } = createTempoHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      units: [
        {
          unitId: 10,
          factionId: 1,
          memberEntityIds: [0],
          order: "advance",
          reach: "long",
        },
        { unitId: 20, factionId: 1, memberEntityIds: [1] },
      ],
    });
    advanceFormationOneTick(world, identity, formation, {
      loadoutStore: loadout,
    });
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );

    expect(result.opportunities).toEqual([]);
  });

  it("chooses the primary engaged target deterministically", () => {
    const { world, identity, loadout, formation } = createTempoHarness({
      positions: [
        { x: 100, y: 100 },
        { x: 110, y: 100 },
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
        { unitId: 30, factionId: 3, memberEntityIds: [2] },
      ],
    });
    advanceFormationOneTick(world, identity, formation, {
      loadoutStore: loadout,
    });
    const tempo = createCombatTempoStore(identity, {
      entityCount: 3,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );

    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]?.targetUnitId).toBe(20);
  });

  it("does not keep creating stale opportunities after engagement breaks", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 2 }],
    });

    advanceCombatTempoOneTick(world, identity, loadout, formation, tempo);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(1);

    world.positionsX[1] = 500;
    expect(
      advanceCombatTempoOneTick(world, identity, loadout, formation, tempo)
        .opportunities,
    ).toEqual([]);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(10);

    world.positionsX[1] = 110;
    expect(
      advanceCombatTempoOneTick(world, identity, loadout, formation, tempo)
        .opportunities,
    ).toEqual([]);
    expect(getUnitAttackCooldownTicks(tempo, 10)).toBe(9);
  });

  it("clears and reuses the provided output array", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });
    const out: CombatAttackOpportunity[] = [
      {
        sourceUnitId: 99,
        targetUnitId: 100,
        sourceMovementStyle: "formedMarch",
        engagementState: "engaged",
        weaponReachBand: "short",
      },
    ];

    const returned = collectAttackOpportunities(
      world,
      identity,
      loadout,
      formation,
      tempo,
      out,
    );

    expect(returned).toBe(out);
    expect(out).toEqual([
      {
        sourceUnitId: 10,
        targetUnitId: 20,
        sourceMovementStyle: "engageFront",
        engagementState: "engaged",
        weaponReachBand: "long",
      },
    ]);
  });

  it("throws when world, loadout, formation, or tempo counts are inconsistent", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [],
    });
    const mismatchedWorld: WorldState = { ...world, entityCount: 3 };
    const mismatchedLoadout: UnitLoadoutStore = {
      ...loadout,
      entityCount: 3,
    };
    const mismatchedFormation: FormationBehaviourStore = {
      ...formation,
      entityCount: 3,
    };
    const mismatchedTempo: CombatTempoStore = {
      ...tempo,
      entityCount: 3,
    };

    expect(() =>
      advanceCombatTempoOneTick(
        mismatchedWorld,
        identity,
        loadout,
        formation,
        tempo,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatTempoOneTick(
        world,
        identity,
        mismatchedLoadout,
        formation,
        tempo,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatTempoOneTick(
        world,
        identity,
        loadout,
        mismatchedFormation,
        tempo,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceCombatTempoOneTick(
        world,
        identity,
        loadout,
        formation,
        mismatchedTempo,
      ),
    ).toThrow(RangeError);
  });

  it("repeats identical opportunities and cooldown states from identical inputs", () => {
    const run = () => {
      const { world, identity, loadout, formation } =
        createEngagedTempoHarness();
      const tempo = createCombatTempoStore(identity, {
        entityCount: 2,
        units: [],
      });
      const opportunities: CombatAttackOpportunity[][] = [];
      const cooldowns: number[] = [];

      for (let tick = 0; tick < 12; tick += 1) {
        const result = advanceCombatTempoOneTick(
          world,
          identity,
          loadout,
          formation,
          tempo,
        );
        opportunities.push([...result.opportunities]);
        cooldowns.push(getUnitAttackCooldownTicks(tempo, 10));
      }

      return { opportunities, cooldowns };
    };

    expect(run()).toEqual(run());
  });

  it("does not mutate world, identity, loadout, or formation state", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });
    const before = snapshotInputs(world, identity, loadout, formation);

    advanceCombatTempoOneTick(world, identity, loadout, formation, tempo);
    collectAttackOpportunities(world, identity, loadout, formation, tempo, []);

    expect(snapshotInputs(world, identity, loadout, formation)).toEqual(before);
  });

  it("does not add resolution fields to opportunity records", () => {
    const { world, identity, loadout, formation } = createEngagedTempoHarness();
    const tempo = createCombatTempoStore(identity, {
      entityCount: 2,
      units: [{ unitId: 10, initialCooldownTicks: 1 }],
    });

    const result = advanceCombatTempoOneTick(
      world,
      identity,
      loadout,
      formation,
      tempo,
    );
    const keys = Object.keys(result.opportunities[0]!);

    expect(keys).not.toContain("damage");
    expect(keys).not.toContain("wounds");
    expect(keys).not.toContain("armourMitigation");
    expect(keys).not.toContain("healing");
    expect(keys).not.toContain("specialCallResolution");
  });
});

interface TempoHarnessUnit {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly headingX?: number;
  readonly headingY?: number;
  readonly order?: UnitOrder;
  readonly reach?: WeaponReachBand;
}

interface TempoHarnessConfig {
  readonly positions: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly units: readonly TempoHarnessUnit[];
}

function createTwoUnitTempoHarness() {
  return createTempoHarness({
    positions: [
      { x: 100, y: 100 },
      { x: 110, y: 100 },
    ],
    units: [
      { unitId: 10, factionId: 1, memberEntityIds: [0], reach: "long" },
      { unitId: 20, factionId: 2, memberEntityIds: [1] },
    ],
  });
}

function createEngagedTempoHarness() {
  const harness = createTempoHarness({
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

  // 3D reads the current formation style; callers run movement first.
  advanceFormationOneTick(harness.world, harness.identity, harness.formation, {
    loadoutStore: harness.loadout,
  });
  expect(getUnitMovementStyle(harness.formation, 10)).toBe("engageFront");

  return harness;
}

function createTempoHarness(config: TempoHarnessConfig): {
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
    rngSeed: 0x3d01,
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
