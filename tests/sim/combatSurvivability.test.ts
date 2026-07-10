import { describe, expect, it } from "vitest";

import {
  createCombatTempoStore,
  getUnitAttackCooldownTicks,
  type CombatTempoStore,
} from "../../src/sim/combatTempo";
import type { CombatStrikeResolution } from "../../src/sim/combatResolution";
import {
  applyCombatStrikeResolution,
  applyCombatStrikeResolutions,
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
  getUnitMaxDamageCapacity,
  isUnitDamageCapacityReached,
  type CombatSurvivabilityApplication,
  type CombatSurvivabilityStore,
} from "../../src/sim/combatSurvivability";
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

describe("combat survivability", () => {
  it("creates a survivability store for units in the identity store", () => {
    const { identity } = createSurvivabilityHarness({
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
        { unitId: 30, factionId: 3, memberEntityIds: [2] },
      ],
    });

    const survivability = createCombatSurvivabilityStore(identity, {
      entityCount: 3,
      units: [],
    });

    expect(survivability.entityCount).toBe(3);
    expect(survivability.unitCount).toBe(3);
  });

  it("uses deterministic safe defaults for omitted units", () => {
    const { identity } = createTwoUnitSurvivabilityHarness({});
    const first = createCombatSurvivabilityStore(identity, {
      entityCount: 2,
      units: [],
    });
    const second = createCombatSurvivabilityStore(identity, {
      entityCount: 2,
      units: [],
    });

    expect(getUnitMaxDamageCapacity(first, 10)).toBe(10);
    expect(getUnitMaxDamageCapacity(first, 20)).toBe(10);
    expect(getUnitAccumulatedDamage(first, 10)).toBe(0);
    expect(getUnitAccumulatedDamage(first, 20)).toBe(0);
    expect(snapshotSurvivability(first, identity)).toEqual(
      snapshotSurvivability(second, identity),
    );
  });

  it("respects configured max capacity and initial accumulated damage", () => {
    const { identity } = createTwoUnitSurvivabilityHarness({});
    const survivability = createCombatSurvivabilityStore(identity, {
      entityCount: 2,
      units: [
        {
          unitId: 20,
          maxDamageCapacity: 4,
          initialAccumulatedDamage: 3,
        },
      ],
    });

    expect(getUnitMaxDamageCapacity(survivability, 10)).toBe(10);
    expect(getUnitAccumulatedDamage(survivability, 10)).toBe(0);
    expect(getUnitMaxDamageCapacity(survivability, 20)).toBe(4);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(3);
  });

  it("throws for duplicate unit survivability config", () => {
    const { identity } = createTwoUnitSurvivabilityHarness({});

    expect(() =>
      createCombatSurvivabilityStore(identity, {
        entityCount: 2,
        units: [
          { unitId: 10, maxDamageCapacity: 4 },
          { unitId: 10, maxDamageCapacity: 6 },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("throws for unknown unit survivability config", () => {
    const { identity } = createTwoUnitSurvivabilityHarness({});

    expect(() =>
      createCombatSurvivabilityStore(identity, {
        entityCount: 2,
        units: [{ unitId: 99, maxDamageCapacity: 4 }],
      }),
    ).toThrow(RangeError);
  });

  it("throws for invalid survivability capacity or initial damage config", () => {
    const { identity } = createTwoUnitSurvivabilityHarness({});

    expect(() =>
      createCombatSurvivabilityStore(identity, {
        entityCount: 2,
        units: [{ unitId: 10, maxDamageCapacity: 0 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createCombatSurvivabilityStore(identity, {
        entityCount: 2,
        units: [{ unitId: 10, maxDamageCapacity: 1.5 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createCombatSurvivabilityStore(identity, {
        entityCount: 2,
        units: [{ unitId: 10, initialAccumulatedDamage: -1 }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createCombatSurvivabilityStore(identity, {
        entityCount: 2,
        units: [{ unitId: 10, initialAccumulatedDamage: 1.5 }],
      }),
    ).toThrow(RangeError);
  });

  it("throws when querying an unknown unit ID", () => {
    const { identity } = createTwoUnitSurvivabilityHarness({});
    const survivability = createCombatSurvivabilityStore(identity, {
      entityCount: 2,
      units: [],
    });

    expect(() => getUnitAccumulatedDamage(survivability, 99)).toThrow(
      RangeError,
    );
    expect(() => getUnitMaxDamageCapacity(survivability, 99)).toThrow(
      RangeError,
    );
    expect(() => isUnitDamageCapacityReached(survivability, 99)).toThrow(
      RangeError,
    );
  });

  it("applying one strike increases target accumulated damage", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({});

    const application = applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 3 }),
    );

    expect(application).toEqual({
      sourceUnitId: 10,
      targetUnitId: 20,
      incomingDamageValue: 3,
      armourReduction: 0,
      shieldReduction: 0,
      appliedDamageValue: 3,
      accumulatedDamageBefore: 0,
      accumulatedDamageAfter: 3,
      capacityReached: false,
    });
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(3);
  });

  it("does not change source unit damage when applying its strike", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({});

    applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 3 }),
    );

    expect(getUnitAccumulatedDamage(survivability, 10)).toBe(0);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(3);
  });

  it("leaves none, light, and mageArmour damage unchanged", () => {
    for (const armourClass of ["none", "light", "mageArmour"] as const) {
      const { identity, loadout, survivability } =
        createTwoUnitSurvivabilityHarness({ targetArmourClass: armourClass });

      const application = applyCombatStrikeResolution(
        identity,
        loadout,
        survivability,
        createStrike({ damageValue: 3 }),
      );

      expect(application.armourReduction).toBe(0);
      expect(application.appliedDamageValue).toBe(3);
    }
  });

  it("reduces damage deterministically for medium and heavy armour", () => {
    for (const armourClass of ["medium", "heavy"] as const) {
      const { identity, loadout, survivability } =
        createTwoUnitSurvivabilityHarness({ targetArmourClass: armourClass });

      const application = applyCombatStrikeResolution(
        identity,
        loadout,
        survivability,
        createStrike({ damageValue: 3 }),
      );

      expect(application.armourReduction).toBe(1);
      expect(application.appliedDamageValue).toBe(2);
    }
  });

  it("lets dreadnought armour reduce more than heavy armour", () => {
    const heavy = createTwoUnitSurvivabilityHarness({
      targetArmourClass: "heavy",
    });
    const dreadnought = createTwoUnitSurvivabilityHarness({
      targetArmourClass: "dreadnought",
    });

    const heavyApplication = applyCombatStrikeResolution(
      heavy.identity,
      heavy.loadout,
      heavy.survivability,
      createStrike({ damageValue: 3 }),
    );
    const dreadnoughtApplication = applyCombatStrikeResolution(
      dreadnought.identity,
      dreadnought.loadout,
      dreadnought.survivability,
      createStrike({ damageValue: 3 }),
    );

    expect(heavyApplication.armourReduction).toBe(1);
    expect(dreadnoughtApplication.armourReduction).toBe(2);
    expect(dreadnoughtApplication.appliedDamageValue).toBeLessThan(
      heavyApplication.appliedDamageValue,
    );
  });

  it("reduces damage deterministically for shields", () => {
    const buckler = createTwoUnitSurvivabilityHarness({
      targetShieldClass: "buckler",
    });
    const shield = createTwoUnitSurvivabilityHarness({
      targetShieldClass: "shield",
    });

    const bucklerApplication = applyCombatStrikeResolution(
      buckler.identity,
      buckler.loadout,
      buckler.survivability,
      createStrike({ damageValue: 3 }),
    );
    const shieldApplication = applyCombatStrikeResolution(
      shield.identity,
      shield.loadout,
      shield.survivability,
      createStrike({ damageValue: 3 }),
    );

    expect(bucklerApplication.shieldReduction).toBe(0);
    expect(bucklerApplication.appliedDamageValue).toBe(3);
    expect(shieldApplication.shieldReduction).toBe(1);
    expect(shieldApplication.appliedDamageValue).toBe(2);
  });

  it("stacks armour and shield mitigation", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({
        targetArmourClass: "medium",
        targetShieldClass: "shield",
      });

    const application = applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 3 }),
    );

    expect(application.armourReduction).toBe(1);
    expect(application.shieldReduction).toBe(1);
    expect(application.appliedDamageValue).toBe(1);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(1);
  });

  it("never applies damage below zero", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({
        targetArmourClass: "heavy",
        targetShieldClass: "shield",
      });

    const application = applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 1 }),
    );

    expect(application.appliedDamageValue).toBe(0);
    expect(application.accumulatedDamageAfter).toBe(0);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(0);
  });

  it("marks capacity reached once accumulated damage reaches capacity", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({
        survivabilityUnits: [
          {
            unitId: 20,
            maxDamageCapacity: 2,
            initialAccumulatedDamage: 1,
          },
        ],
      });

    const application = applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 1 }),
    );

    expect(application.capacityReached).toBe(true);
    expect(isUnitDamageCapacityReached(survivability, 20)).toBe(true);
  });

  it("reaching capacity does not kill, remove, route, or wound a unit", () => {
    const { world, identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({
        survivabilityUnits: [
          {
            unitId: 20,
            maxDamageCapacity: 1,
            initialAccumulatedDamage: 0,
          },
        ],
      });

    const application = applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 1 }),
    );
    const keys = Object.keys(application);

    expect(application.capacityReached).toBe(true);
    expect(world.entityCount).toBe(2);
    expect(Array.from(world.ids)).toEqual([0, 1]);
    expect(getUnitMembers(identity, 20)).toEqual([1]);
    expect(survivability.unitCount).toBe(2);
    expect(keys).not.toContain("dead");
    expect(keys).not.toContain("death");
    expect(keys).not.toContain("removed");
    expect(keys).not.toContain("routed");
    expect(keys).not.toContain("wound");
    expect(keys).not.toContain("wounds");
  });

  it("applies multiple strikes deterministically and preserves input order", () => {
    const { identity, loadout, survivability } = createSurvivabilityHarness({
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
        { unitId: 30, factionId: 3, memberEntityIds: [2] },
      ],
    });
    const strikes = [
      createStrike({ targetUnitId: 30, damageValue: 2 }),
      createStrike({ targetUnitId: 20, damageValue: 3 }),
      createStrike({ targetUnitId: 30, damageValue: 4 }),
    ];

    const result = applyCombatStrikeResolutions(
      identity,
      loadout,
      survivability,
      strikes,
      [],
    );

    expect(result.applications.map((record) => record.targetUnitId)).toEqual([
      30,
      20,
      30,
    ]);
    expect(result.applications.map((record) => record.accumulatedDamageAfter))
      .toEqual([2, 3, 6]);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(3);
    expect(getUnitAccumulatedDamage(survivability, 30)).toBe(6);
  });

  it("clears and reuses the provided output array", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({});
    const out: CombatSurvivabilityApplication[] = [
      {
        sourceUnitId: 99,
        targetUnitId: 100,
        incomingDamageValue: 99,
        armourReduction: 0,
        shieldReduction: 0,
        appliedDamageValue: 99,
        accumulatedDamageBefore: 0,
        accumulatedDamageAfter: 99,
        capacityReached: true,
      },
    ];

    const result = applyCombatStrikeResolutions(
      identity,
      loadout,
      survivability,
      [createStrike({ damageValue: 2 })],
      out,
    );

    expect(result.applications).toBe(out);
    expect(out).toEqual([
      {
        sourceUnitId: 10,
        targetUnitId: 20,
        incomingDamageValue: 2,
        armourReduction: 0,
        shieldReduction: 0,
        appliedDamageValue: 2,
        accumulatedDamageBefore: 0,
        accumulatedDamageAfter: 2,
        capacityReached: false,
      },
    ]);
  });

  it("throws for unknown source and target unit IDs", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({});

    expect(() =>
      applyCombatStrikeResolution(
        identity,
        loadout,
        survivability,
        createStrike({ sourceUnitId: 99, damageValue: 1 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatStrikeResolution(
        identity,
        loadout,
        survivability,
        createStrike({ targetUnitId: 99, damageValue: 1 }),
      ),
    ).toThrow(RangeError);
  });

  it("throws for negative, non-integer, or unsafe damage values", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({});

    expect(() =>
      applyCombatStrikeResolution(
        identity,
        loadout,
        survivability,
        createStrike({ damageValue: -1 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatStrikeResolution(
        identity,
        loadout,
        survivability,
        createStrike({ damageValue: 1.5 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatStrikeResolution(
        identity,
        loadout,
        survivability,
        createStrike({ damageValue: Number.MAX_SAFE_INTEGER + 1 }),
      ),
    ).toThrow(RangeError);
  });

  it("throws when identity, loadout, or survivability counts are inconsistent", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({});
    const mismatchedLoadoutEntityCount: UnitLoadoutStore = {
      ...loadout,
      entityCount: 3,
    };
    const mismatchedLoadoutUnitCount: UnitLoadoutStore = {
      ...loadout,
      unitCount: 3,
    };
    const mismatchedSurvivabilityEntityCount: CombatSurvivabilityStore = {
      ...survivability,
      entityCount: 3,
    };
    const mismatchedSurvivabilityUnitCount: CombatSurvivabilityStore = {
      ...survivability,
      unitCount: 3,
    };

    expect(() =>
      applyCombatStrikeResolution(
        identity,
        mismatchedLoadoutEntityCount,
        survivability,
        createStrike({ damageValue: 1 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatStrikeResolution(
        identity,
        mismatchedLoadoutUnitCount,
        survivability,
        createStrike({ damageValue: 1 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatStrikeResolution(
        identity,
        loadout,
        mismatchedSurvivabilityEntityCount,
        createStrike({ damageValue: 1 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      applyCombatStrikeResolutions(
        identity,
        loadout,
        mismatchedSurvivabilityUnitCount,
        [createStrike({ damageValue: 1 })],
        [],
      ),
    ).toThrow(RangeError);
  });

  it("clamps accumulated damage to the safe integer maximum", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({
        survivabilityUnits: [
          {
            unitId: 20,
            maxDamageCapacity: Number.MAX_SAFE_INTEGER,
            initialAccumulatedDamage: Number.MAX_SAFE_INTEGER - 1,
          },
        ],
      });

    const application = applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 2 }),
    );

    expect(application.accumulatedDamageAfter).toBe(Number.MAX_SAFE_INTEGER);
    expect(getUnitAccumulatedDamage(survivability, 20)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("repeated identical runs produce identical damage and application records", () => {
    const run = () => {
      const { identity, loadout, survivability } =
        createTwoUnitSurvivabilityHarness({
          targetArmourClass: "medium",
          targetShieldClass: "shield",
          survivabilityUnits: [
            {
              unitId: 20,
              maxDamageCapacity: 4,
              initialAccumulatedDamage: 1,
            },
          ],
        });

      const result = applyCombatStrikeResolutions(
        identity,
        loadout,
        survivability,
        [
          createStrike({ damageValue: 3 }),
          createStrike({ damageValue: 3 }),
        ],
        [],
      );

      return {
        applications: result.applications,
        survivability: snapshotSurvivability(survivability, identity),
      };
    };

    expect(run()).toEqual(run());
  });

  it("does not mutate strike records", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({
        targetArmourClass: "medium",
        targetShieldClass: "shield",
      });
    const strikes = [
      createStrike({ damageValue: 3 }),
      createStrike({ damageValue: 2 }),
    ];
    const before = strikes.map((strike) => ({ ...strike }));

    applyCombatStrikeResolutions(
      identity,
      loadout,
      survivability,
      strikes,
      [],
    );

    expect(strikes).toEqual(before);
  });

  it("does not mutate world, identity, loadout, formation, or tempo state", () => {
    const { world, identity, loadout, formation, tempo, survivability } =
      createTwoUnitSurvivabilityHarness({
        targetArmourClass: "medium",
        targetShieldClass: "shield",
      });
    const before = snapshotInputs(world, identity, loadout, formation, tempo);

    applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 3 }),
    );
    applyCombatStrikeResolutions(
      identity,
      loadout,
      survivability,
      [createStrike({ damageValue: 3 })],
      [],
    );

    expect(snapshotInputs(world, identity, loadout, formation, tempo)).toEqual(
      before,
    );
  });

  it("does not add out-of-scope consequence fields to application records", () => {
    const { identity, loadout, survivability } =
      createTwoUnitSurvivabilityHarness({});

    const application = applyCombatStrikeResolution(
      identity,
      loadout,
      survivability,
      createStrike({ damageValue: 1 }),
    );
    const keys = Object.keys(application);

    expect(keys).not.toContain("death");
    expect(keys).not.toContain("dead");
    expect(keys).not.toContain("healing");
    expect(keys).not.toContain("morale");
    expect(keys).not.toContain("routing");
    expect(keys).not.toContain("routed");
    expect(keys).not.toContain("specialCallResolution");
    expect(keys).not.toContain("displacement");
    expect(keys).not.toContain("hitLocation");
    expect(keys).not.toContain("entityRemoval");
    expect(keys).not.toContain("removedEntityId");
  });
});

interface SurvivabilityHarnessUnit {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly weaponReachBand?: WeaponReachBand;
  readonly armourClass?: ArmourClass;
  readonly shieldClass?: ShieldClass;
}

interface SurvivabilityHarnessConfig {
  readonly units: readonly SurvivabilityHarnessUnit[];
  readonly survivabilityUnits?: readonly {
    readonly unitId: number;
    readonly maxDamageCapacity?: number;
    readonly initialAccumulatedDamage?: number;
  }[];
}

interface TwoUnitSurvivabilityOptions {
  readonly targetArmourClass?: ArmourClass;
  readonly targetShieldClass?: ShieldClass;
  readonly survivabilityUnits?: SurvivabilityHarnessConfig["survivabilityUnits"];
}

function createStrike(options: {
  readonly sourceUnitId?: number;
  readonly targetUnitId?: number;
  readonly damageValue: number;
}): CombatStrikeResolution {
  return {
    sourceUnitId: options.sourceUnitId ?? 10,
    targetUnitId: options.targetUnitId ?? 20,
    sourceMovementStyle: "engageFront",
    engagementState: "engaged",
    weaponReachBand: "short",
    consequenceKind: options.damageValue > 0 ? "damage" : "none",
    damageValue: options.damageValue,
  };
}

function createTwoUnitSurvivabilityHarness(
  options: TwoUnitSurvivabilityOptions,
): ReturnType<typeof createSurvivabilityHarness> {
  return createSurvivabilityHarness({
    units: [
      {
        unitId: 10,
        factionId: 1,
        memberEntityIds: [0],
        weaponReachBand: "short",
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
    ...(options.survivabilityUnits !== undefined
      ? { survivabilityUnits: options.survivabilityUnits }
      : {}),
  });
}

function createSurvivabilityHarness(config: SurvivabilityHarnessConfig): {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: CombatTempoStore;
  readonly survivability: CombatSurvivabilityStore;
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
    rngSeed: 0x3f01,
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
  const survivability = createCombatSurvivabilityStore(identity, {
    entityCount,
    units: config.survivabilityUnits ?? [],
  });

  return { world, identity, loadout, formation, tempo, survivability };
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

function snapshotSurvivability(
  survivability: CombatSurvivabilityStore,
  identity: UnitIdentityStore,
): readonly unknown[] {
  return getUnitIds(identity).map((unitId) => ({
    unitId,
    accumulatedDamage: getUnitAccumulatedDamage(survivability, unitId),
    maxDamageCapacity: getUnitMaxDamageCapacity(survivability, unitId),
    capacityReached: isUnitDamageCapacityReached(survivability, unitId),
  }));
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
