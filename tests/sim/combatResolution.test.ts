import { describe, expect, it } from "vitest";

import {
  createCombatTempoStore,
  getUnitAttackCooldownTicks,
  type CombatAttackOpportunity,
  type CombatTempoStore,
} from "../../src/sim/combatTempo";
import {
  resolveCombatOpportunities,
  resolveCombatOpportunity,
  type CombatStrikeResolution,
} from "../../src/sim/combatResolution";
import {
  createFormationBehaviourStore,
  getUnitAnchor,
  getUnitHeading,
  getUnitMovementStyle,
  type FormationBehaviourStore,
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
  type ArmourClass,
  type ShieldClass,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "../../src/sim/unitLoadout";

const REACH_BANDS: readonly WeaponReachBand[] = [
  "none",
  "close",
  "short",
  "medium",
  "long",
  "veryLong",
  "ranged",
];

const EXPECTED_DAMAGE_VALUES: Readonly<Record<WeaponReachBand, number>> = {
  none: 0,
  close: 1,
  short: 1,
  medium: 1,
  long: 1,
  veryLong: 1,
  ranged: 1,
};

describe("combat resolution", () => {
  it("resolves one attack opportunity into one strike record", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "short",
      targetArmourClass: "heavy",
      targetShieldClass: "shield",
    });
    const opportunity = createOpportunity({ weaponReachBand: "short" });
    const out: CombatStrikeResolution[] = [];

    const result = resolveCombatOpportunities(
      identity,
      loadout,
      [opportunity],
      out,
    );

    expect(result.strikes).toBe(out);
    expect(result.strikes).toEqual([
      {
        sourceUnitId: 10,
        targetUnitId: 20,
        sourceMovementStyle: "engageFront",
        engagementState: "engaged",
        weaponReachBand: "short",
        consequenceKind: "damage",
        damageValue: 1,
        targetArmourClass: "heavy",
        targetShieldClass: "shield",
      },
    ]);
  });

  it("maps every reach band to a stable damage value", () => {
    for (const reachBand of REACH_BANDS) {
      const { identity, loadout } = createTwoUnitResolutionHarness({
        sourceReach: reachBand,
      });

      const strike = resolveCombatOpportunity(
        identity,
        loadout,
        createOpportunity({ weaponReachBand: reachBand }),
      );

      expect(strike.damageValue).toBe(EXPECTED_DAMAGE_VALUES[reachBand]);
      expect(strike.consequenceKind).toBe(
        reachBand === "none" ? "none" : "damage",
      );
    }
  });

  it("keeps unarmed or none reach at zero damage", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "none",
    });

    expect(
      resolveCombatOpportunity(
        identity,
        loadout,
        createOpportunity({ weaponReachBand: "none" }),
      ),
    ).toMatchObject({
      weaponReachBand: "none",
      consequenceKind: "none",
      damageValue: 0,
    });
  });

  it("preserves multiple opportunity order deterministically", () => {
    const { identity, loadout } = createResolutionHarness({
      units: [
        {
          unitId: 10,
          factionId: 1,
          memberEntityIds: [0],
          weaponReachBand: "long",
        },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
        { unitId: 30, factionId: 3, memberEntityIds: [2] },
      ],
    });
    const opportunities: readonly CombatAttackOpportunity[] = [
      createOpportunity({ targetUnitId: 30, weaponReachBand: "long" }),
      createOpportunity({ targetUnitId: 20, weaponReachBand: "long" }),
    ];

    const result = resolveCombatOpportunities(
      identity,
      loadout,
      opportunities,
      [],
    );

    expect(result.strikes.map((strike) => strike.targetUnitId)).toEqual([
      30,
      20,
    ]);
  });

  it("clears and reuses the provided output array", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "medium",
    });
    const out: CombatStrikeResolution[] = [
      {
        sourceUnitId: 99,
        targetUnitId: 100,
        sourceMovementStyle: "formedMarch",
        engagementState: "engaged",
        weaponReachBand: "short",
        consequenceKind: "damage",
        damageValue: 99,
      },
    ];

    const result = resolveCombatOpportunities(
      identity,
      loadout,
      [createOpportunity({ weaponReachBand: "medium" })],
      out,
    );

    expect(result.strikes).toBe(out);
    expect(out).toEqual([
      {
        sourceUnitId: 10,
        targetUnitId: 20,
        sourceMovementStyle: "engageFront",
        engagementState: "engaged",
        weaponReachBand: "medium",
        consequenceKind: "damage",
        damageValue: 1,
        targetArmourClass: "none",
        targetShieldClass: "none",
      },
    ]);
  });

  it("throws for unknown source and target unit IDs", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "short",
    });

    expect(() =>
      resolveCombatOpportunity(
        identity,
        loadout,
        createOpportunity({ sourceUnitId: 99, weaponReachBand: "short" }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      resolveCombatOpportunity(
        identity,
        loadout,
        createOpportunity({ targetUnitId: 99, weaponReachBand: "short" }),
      ),
    ).toThrow(RangeError);
  });

  it("rejects non-engaged opportunity records", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "short",
    });
    const nonEngaged = {
      ...createOpportunity({ weaponReachBand: "short" }),
      engagementState: "contacting",
    } as unknown as CombatAttackOpportunity;

    expect(() =>
      resolveCombatOpportunity(identity, loadout, nonEngaged),
    ).toThrow(RangeError);
  });

  it("includes armour and shield labels without mitigation", () => {
    const protectedHarness = createTwoUnitResolutionHarness({
      sourceReach: "long",
      targetArmourClass: "dreadnought",
      targetShieldClass: "shield",
    });
    const unprotectedHarness = createTwoUnitResolutionHarness({
      sourceReach: "long",
      targetArmourClass: "none",
      targetShieldClass: "none",
    });

    const protectedStrike = resolveCombatOpportunity(
      protectedHarness.identity,
      protectedHarness.loadout,
      createOpportunity({ weaponReachBand: "long" }),
    );
    const unprotectedStrike = resolveCombatOpportunity(
      unprotectedHarness.identity,
      unprotectedHarness.loadout,
      createOpportunity({ weaponReachBand: "long" }),
    );

    expect(protectedStrike).toMatchObject({
      targetArmourClass: "dreadnought",
      targetShieldClass: "shield",
    });
    expect(protectedStrike.damageValue).toBe(unprotectedStrike.damageValue);
  });

  it("can omit protection labels without changing damage", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "ranged",
      targetArmourClass: "heavy",
      targetShieldClass: "shield",
    });

    const strike = resolveCombatOpportunity(
      identity,
      loadout,
      createOpportunity({ weaponReachBand: "ranged" }),
      { includeTargetProtectionLabels: false },
    );

    expect(strike.damageValue).toBe(1);
    expect(Object.keys(strike)).not.toContain("targetArmourClass");
    expect(Object.keys(strike)).not.toContain("targetShieldClass");
  });

  it("throws when identity and loadout counts are inconsistent", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "short",
    });
    const mismatchedEntityCount: UnitLoadoutStore = {
      ...loadout,
      entityCount: 3,
    };
    const mismatchedUnitCount: UnitLoadoutStore = {
      ...loadout,
      unitCount: 3,
    };

    expect(() =>
      resolveCombatOpportunity(
        identity,
        mismatchedEntityCount,
        createOpportunity({ weaponReachBand: "short" }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      resolveCombatOpportunities(
        identity,
        mismatchedUnitCount,
        [createOpportunity({ weaponReachBand: "short" })],
        [],
      ),
    ).toThrow(RangeError);
  });

  it("repeats identical strike records from identical inputs", () => {
    const run = () => {
      const { identity, loadout } = createResolutionHarness({
        units: [
          {
            unitId: 10,
            factionId: 1,
            memberEntityIds: [0],
            weaponReachBand: "veryLong",
          },
          {
            unitId: 20,
            factionId: 2,
            memberEntityIds: [1],
            armourClass: "medium",
            shieldClass: "buckler",
          },
          { unitId: 30, factionId: 3, memberEntityIds: [2] },
        ],
      });

      return resolveCombatOpportunities(
        identity,
        loadout,
        [
          createOpportunity({
            targetUnitId: 20,
            weaponReachBand: "veryLong",
          }),
          createOpportunity({
            targetUnitId: 30,
            weaponReachBand: "veryLong",
          }),
        ],
        [],
      );
    };

    expect(run()).toEqual(run());
  });

  it("does not mutate opportunity records", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "short",
    });
    const opportunities = [
      createOpportunity({ weaponReachBand: "short" }),
      createOpportunity({ weaponReachBand: "short" }),
    ];
    const before = opportunities.map((opportunity) => ({ ...opportunity }));

    resolveCombatOpportunities(identity, loadout, opportunities, []);

    expect(opportunities).toEqual(before);
  });

  it("does not mutate world, identity, loadout, formation, or tempo state", () => {
    const { world, identity, loadout, formation, tempo } =
      createTwoUnitResolutionHarness({
        sourceReach: "short",
        targetArmourClass: "medium",
        targetShieldClass: "buckler",
      });
    const before = snapshotInputs(world, identity, loadout, formation, tempo);

    resolveCombatOpportunity(
      identity,
      loadout,
      createOpportunity({ weaponReachBand: "short" }),
    );
    resolveCombatOpportunities(
      identity,
      loadout,
      [createOpportunity({ weaponReachBand: "short" })],
      [],
    );

    expect(snapshotInputs(world, identity, loadout, formation, tempo)).toEqual(
      before,
    );
  });

  it("does not add hit point, wound, death, healing, morale, routing, special-call, or displacement fields", () => {
    const { identity, loadout } = createTwoUnitResolutionHarness({
      sourceReach: "short",
    });
    const strike = resolveCombatOpportunity(
      identity,
      loadout,
      createOpportunity({ weaponReachBand: "short" }),
    );
    const keys = Object.keys(strike);

    expect(keys).not.toContain("hitPoints");
    expect(keys).not.toContain("wounds");
    expect(keys).not.toContain("death");
    expect(keys).not.toContain("healing");
    expect(keys).not.toContain("morale");
    expect(keys).not.toContain("routing");
    expect(keys).not.toContain("specialCallResolution");
    expect(keys).not.toContain("displacement");
  });
});

interface ResolutionHarnessUnit {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly weaponReachBand?: WeaponReachBand;
  readonly armourClass?: ArmourClass;
  readonly shieldClass?: ShieldClass;
}

interface ResolutionHarnessConfig {
  readonly units: readonly ResolutionHarnessUnit[];
}

interface TwoUnitResolutionOptions {
  readonly sourceReach: WeaponReachBand;
  readonly targetArmourClass?: ArmourClass;
  readonly targetShieldClass?: ShieldClass;
}

function createOpportunity(
  options: {
    readonly sourceUnitId?: number;
    readonly targetUnitId?: number;
    readonly weaponReachBand: WeaponReachBand;
  },
): CombatAttackOpportunity {
  return {
    sourceUnitId: options.sourceUnitId ?? 10,
    targetUnitId: options.targetUnitId ?? 20,
    sourceMovementStyle: "engageFront",
    engagementState: "engaged",
    weaponReachBand: options.weaponReachBand,
  };
}

function createTwoUnitResolutionHarness(options: TwoUnitResolutionOptions): {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: CombatTempoStore;
} {
  return createResolutionHarness({
    units: [
      {
        unitId: 10,
        factionId: 1,
        memberEntityIds: [0],
        weaponReachBand: options.sourceReach,
      },
      {
        unitId: 20,
        factionId: 2,
        memberEntityIds: [1],
        ...(options.targetArmourClass !== undefined
          ? { armourClass: options.targetArmourClass }
          : {}),
        ...(options.targetShieldClass !== undefined
          ? { shieldClass: options.targetShieldClass }
          : {}),
      },
    ],
  });
}

function createResolutionHarness(config: ResolutionHarnessConfig): {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: CombatTempoStore;
} {
  const entityCount = config.units.reduce(
    (count, unit) => count + unit.memberEntityIds.length,
    0,
  );
  const world = createWorld(entityCount);
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
    units: config.units.map((unit) => ({
      unitId: unit.unitId,
      ...(unit.weaponReachBand !== undefined
        ? { weaponReachBand: unit.weaponReachBand }
        : {}),
      ...(unit.armourClass !== undefined
        ? { armourClass: unit.armourClass }
        : {}),
      ...(unit.shieldClass !== undefined
        ? { shieldClass: unit.shieldClass }
        : {}),
    })),
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x3e01,
    units: config.units.map((unit) => {
      const frontEntityId = unit.memberEntityIds[0]!;
      return {
        unitId: unit.unitId,
        anchorX: world.positionsX[frontEntityId]!,
        anchorY: world.positionsY[frontEntityId]!,
        headingX: 1,
        headingY: 0,
        spacing: 10,
        rows: 1,
        cols: unit.memberEntityIds.length,
        unitSpeed: 0,
        order: "hold",
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
  const tempo = createCombatTempoStore(identity, {
    entityCount,
    units: [],
  });

  return { world, identity, loadout, formation, tempo };
}

function createWorld(entityCount: number): WorldState {
  const positionsX = new Int32Array(entityCount);
  const positionsY = new Int32Array(entityCount);
  for (let entityId = 0; entityId < entityCount; entityId += 1) {
    positionsX[entityId] = entityId * 10;
    positionsY[entityId] = 100;
  }

  return {
    entityCount,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX,
    positionsY,
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}

function snapshotInputs(
  world: WorldState,
  identity: UnitIdentityStore,
  loadout: UnitLoadoutStore,
  formation: FormationBehaviourStore,
  tempo: CombatTempoStore,
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
    unitIds.map((unitId) => ({
      unitId,
      attackCooldownTicks: getUnitAttackCooldownTicks(tempo, unitId),
    })),
  ];
}
