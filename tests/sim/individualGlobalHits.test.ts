import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitHeading,
} from "../../src/sim/formationBehaviour";
import {
  createIndividualCombatActionStore,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
} from "../../src/sim/individualCombatAction";
import {
  createIndividualCombatProfileStore,
  type IndividualArmourCategory,
  type IndividualCombatProfileConfig,
  type IndividualShieldCarriedState,
  type IndividualShieldCategory,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  applyIndividualLandedHits,
  createIndividualGlobalHitStore,
  getIndividualCurrentGlobalHits,
  getIndividualGlobalHitDerivation,
  getIndividualMaximumGlobalHits,
  hasIndividualReachedZeroHits,
  MAX_REPRESENTABLE_GLOBAL_HITS,
  type IndividualGlobalHitStore,
  type IndividualLandedHitApplicationRecord,
  type IndividualZeroHitEvent,
} from "../../src/sim/individualGlobalHits";
import {
  createIndividualMeleeDefenceStore,
  getIndividualGuardState,
  type IndividualMeleeDefenceRecord,
} from "../../src/sim/individualMeleeDefence";
import type { WorldState } from "../../src/sim/types";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";

describe("individual global hits", () => {
  it("initialises current hits to maximum hits for armour categories", () => {
    const profiles = createProfileStore([
      { armourCategory: "none" },
      { armourCategory: "light" },
      { armourCategory: "medium" },
      { armourCategory: "heavy" },
      { armourCategory: "mageArmour" },
    ]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 5 });

    expect([0, 1, 2, 3, 4].map((id) => getIndividualMaximumGlobalHits(hits, id)))
      .toEqual([2, 4, 5, 6, 4]);
    expect([0, 1, 2, 3, 4].map((id) => getIndividualCurrentGlobalHits(hits, id)))
      .toEqual([2, 4, 5, 6, 4]);
  });

  it("retains endurance, helmet, dreadnought, and temporary derivation while ignoring fortitude", () => {
    const profiles = createProfileStore([
      {
        armourCategory: "heavy",
        enduranceLevels: 2,
        fortitudeLevels: 9,
        hasQualifyingHelmet: true,
        hasDreadnought: true,
        temporaryAlwaysOnHitModifier: 3,
      },
    ]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 1 });

    expect(getIndividualGlobalHitDerivation(hits, 0)).toEqual({
      baseHits: 2,
      enduranceHits: 2,
      armourHits: 4,
      helmetHits: 1,
      dreadnoughtHits: 1,
      temporaryAlwaysOnHits: 3,
      maximumGlobalHits: 13,
    });
    expect(getIndividualCurrentGlobalHits(hits, 0)).toBe(13);
  });

  it("accepts the exact Int32 maximum representable hit boundary", () => {
    const profiles = createProfileStore([
      {
        temporaryAlwaysOnHitModifier: MAX_REPRESENTABLE_GLOBAL_HITS - 2,
      },
    ]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 1 });

    expect(getIndividualMaximumGlobalHits(hits, 0)).toBe(
      MAX_REPRESENTABLE_GLOBAL_HITS,
    );
    expect(getIndividualCurrentGlobalHits(hits, 0)).toBe(
      MAX_REPRESENTABLE_GLOBAL_HITS,
    );
  });

  it("rejects the first value above Int32 global-hit storage capacity", () => {
    const profiles = createProfileStore([
      {
        temporaryAlwaysOnHitModifier: MAX_REPRESENTABLE_GLOBAL_HITS - 1,
      },
    ]);

    expect(() =>
      createIndividualGlobalHitStore(profiles, { entityCount: 1 }),
    ).toThrow(RangeError);
  });

  it.each([
    "dagger",
    "oneHanded",
    "greatWeapon",
    "polearm",
    "pike",
    "staff",
  ] as const)(
    "removes exactly one ordinary landed hit for %s regardless of weapon reach",
    (weapon) => {
      const profiles = createProfileStore([
        {},
        { armourCategory: "heavy" },
      ]);
      const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });

      const result = apply(hits, [landedRecord(0, 1, weapon)]);

      expect(result.applications).toEqual([
        expect.objectContaining({
          attackerEntityId: 0,
          targetEntityId: 1,
          attackerWeaponCategory: weapon,
          targetArmourCategory: "heavy",
          targetMaximumGlobalHits: 6,
          currentHitsBefore: 6,
          requestedHitLoss: 1,
          appliedHitLoss: 1,
          currentHitsAfter: 5,
          applicationReason: "ordinaryLandedStrike",
        }),
      ]);
    },
  );

  it("does not remove hits for parried, buckler-blocked, or shield-blocked records", () => {
    const profiles = createProfileStore([{}, {}, {}, {}]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 4 });

    const result = apply(hits, [
      defendedRecord(0, 1, "parried"),
      defendedRecord(0, 2, "bucklerBlocked"),
      defendedRecord(0, 3, "shieldBlocked"),
    ]);

    expect(result.applications).toEqual([]);
    expect([1, 2, 3].map((id) => getIndividualCurrentGlobalHits(hits, id)))
      .toEqual([2, 2, 2]);
  });

  it("does not alter landed hit loss for awkward distance", () => {
    const profiles = createProfileStore([{}, {}]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });

    expect(apply(hits, [landedRecord(0, 1, "oneHanded", true)]).applications[0])
      .toMatchObject({
        awkwardDistance: true,
        requestedHitLoss: 1,
        appliedHitLoss: 1,
        currentHitsAfter: 1,
      });
  });

  it("applies several landed strikes sequentially and clamps at zero", () => {
    const profiles = createProfileStore([{}, {}, {}, {}]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 4 });

    const result = apply(hits, [
      landedRecord(0, 3),
      landedRecord(1, 3),
      landedRecord(2, 3),
    ]);

    expect(result.applications).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        currentHitsBefore: 2,
        appliedHitLoss: 1,
        currentHitsAfter: 1,
        zeroReachedByApplication: false,
      }),
      expect.objectContaining({
        attackerEntityId: 1,
        currentHitsBefore: 1,
        appliedHitLoss: 1,
        currentHitsAfter: 0,
        zeroReachedByApplication: true,
      }),
      expect.objectContaining({
        attackerEntityId: 2,
        currentHitsBefore: 0,
        appliedHitLoss: 0,
        currentHitsAfter: 0,
        zeroReachedByApplication: false,
        applicationReason: "alreadyAtZero",
      }),
    ]);
    expect(result.zeroHitEvents).toEqual([
      {
        entityId: 3,
        attackerEntityId: 1,
        previousHits: 1,
      },
    ]);
    expect(getIndividualCurrentGlobalHits(hits, 3)).toBe(0);
  });

  it("emits no duplicate zero transition for later hits against an already-zero target", () => {
    const profiles = createProfileStore([{}, {}, {}]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 3 });

    apply(hits, [landedRecord(0, 2), landedRecord(1, 2)]);
    const result = apply(hits, [landedRecord(0, 2)]);

    expect(result.applications).toEqual([
      expect.objectContaining({
        appliedHitLoss: 0,
        applicationReason: "alreadyAtZero",
      }),
    ]);
    expect(result.zeroHitEvents).toEqual([]);
    expect(hasIndividualReachedZeroHits(hits, 2)).toBe(true);
  });

  it("keeps maximum hits and derivation immutable across applications", () => {
    const profiles = createProfileStore([
      {},
      {
        armourCategory: "medium",
        enduranceLevels: 1,
        hasQualifyingHelmet: true,
      },
    ]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });
    const maximumBefore = getIndividualMaximumGlobalHits(hits, 1);
    const derivationBefore = getIndividualGlobalHitDerivation(hits, 1);

    apply(hits, [landedRecord(0, 1), landedRecord(0, 1)]);

    expect(getIndividualMaximumGlobalHits(hits, 1)).toBe(maximumBefore);
    expect(getIndividualGlobalHitDerivation(hits, 1)).toEqual(derivationBefore);
  });

  it("does not passively recover across empty ticks", () => {
    const profiles = createProfileStore([{}, {}]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });

    apply(hits, [landedRecord(0, 1)]);
    apply(hits, []);
    apply(hits, []);

    expect(getIndividualCurrentGlobalHits(hits, 1)).toBe(1);
  });

  it("reuses output arrays", () => {
    const profiles = createProfileStore([{}, {}]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });
    const applications: IndividualLandedHitApplicationRecord[] = [
      {} as IndividualLandedHitApplicationRecord,
    ];
    const events: IndividualZeroHitEvent[] = [
      {
        entityId: 99,
        attackerEntityId: 98,
        previousHits: 1,
      },
    ];

    const result = applyIndividualLandedHits(
      hits,
      [landedRecord(0, 1)],
      applications,
      events,
    );

    expect(result.applications).toBe(applications);
    expect(result.zeroHitEvents).toBe(events);
    expect(applications).toHaveLength(1);
    expect(events).toHaveLength(0);
  });

  it("preserves the canonical order supplied by defence records", () => {
    const profiles = createProfileStore([{}, {}, {}, {}]);
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 4 });

    expect(
      apply(hits, [
        landedRecord(0, 3),
        landedRecord(1, 3),
        landedRecord(2, 3),
      ]).applications.map((record) => record.attackerEntityId),
    ).toEqual([0, 1, 2]);
  });

  it("replays deterministically", () => {
    expect(runReplay()).toEqual(runReplay());
  });

  it("does not mutate world, action state, guard state, formation, pressure, morale, unit membership or production combat", () => {
    const world: WorldState = {
      entityCount: 2,
      bounds: { width: 128, height: 128 },
      ids: Uint32Array.from([0, 1]),
      positionsX: Int32Array.from([50, 58]),
      positionsY: Int32Array.from([50, 50]),
      velocitiesX: new Int32Array(2),
      velocitiesY: new Int32Array(2),
    };
    const identity = createUnitIdentityStore({
      entityCount: 2,
      units: [
        { unitId: 1, factionId: 1, memberEntityIds: [0] },
        { unitId: 2, factionId: 2, memberEntityIds: [1] },
      ],
    });
    const formation = createFormationBehaviourStore(identity, {
      entityCount: 2,
      rngSeed: 0x5d01,
      units: [
        formationUnit(1, 50, 1),
        formationUnit(2, 58, -1),
      ],
      individuals: [
        individual(0),
        individual(1),
      ],
    });
    const profiles = createProfileStore([{}, {}]);
    const action = createIndividualCombatActionStore(identity, formation, profiles, {
      entityCount: 2,
    });
    const defence = createIndividualMeleeDefenceStore({ entityCount: 2 });
    const hits = createIndividualGlobalHitStore(profiles, { entityCount: 2 });
    const positionsX = Array.from(world.positionsX);
    const positionsY = Array.from(world.positionsY);
    const velocitiesX = Array.from(world.velocitiesX);
    const velocitiesY = Array.from(world.velocitiesY);
    const facing = getIndividualCombatFacing(action, 1);
    const actionState = getIndividualCombatActionState(action, 1);
    const guardState = getIndividualGuardState(defence, 1);
    const heading = getUnitHeading(formation, 2);
    const pressure = getIndividualPressure(formation, 1);

    apply(hits, [landedRecord(0, 1)]);

    expect(Array.from(world.positionsX)).toEqual(positionsX);
    expect(Array.from(world.positionsY)).toEqual(positionsY);
    expect(Array.from(world.velocitiesX)).toEqual(velocitiesX);
    expect(Array.from(world.velocitiesY)).toEqual(velocitiesY);
    expect(getIndividualCombatFacing(action, 1)).toEqual(facing);
    expect(getIndividualCombatActionState(action, 1)).toBe(actionState);
    expect(getIndividualGuardState(defence, 1)).toBe(guardState);
    expect(getUnitHeading(formation, 2)).toEqual(heading);
    expect(getIndividualPressure(formation, 1)).toBe(pressure);
  });
});

type ProfileOverrides = Partial<{
  readonly primaryWeapon: IndividualWeaponCategory;
  readonly shieldCategory: IndividualShieldCategory;
  readonly shieldCarriedState: IndividualShieldCarriedState;
  readonly armourCategory: IndividualArmourCategory;
  readonly enduranceLevels: number;
  readonly fortitudeLevels: number;
  readonly hasQualifyingHelmet: boolean;
  readonly hasDreadnought: boolean;
  readonly temporaryAlwaysOnHitModifier: number;
}>;

function createProfileStore(overrides: readonly ProfileOverrides[]) {
  return createIndividualCombatProfileStore({
    entityCount: overrides.length,
    profiles: overrides.map((override, entityId) =>
      combatProfile(entityId, override),
    ),
  });
}

function combatProfile(
  entityId: number,
  override: ProfileOverrides,
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon: override.primaryWeapon ?? "oneHanded",
    shieldCategory: override.shieldCategory ?? "none",
    shieldCarriedState: override.shieldCarriedState ?? "none",
    armourCategory: override.armourCategory ?? "none",
    hasQualifyingHelmet: override.hasQualifyingHelmet ?? false,
    temporaryAlwaysOnHitModifier:
      override.temporaryAlwaysOnHitModifier ?? 0,
    qualifications: {
      hasWeaponMaster: true,
      hasShield: true,
      hasMarksman: true,
      hasThrown: true,
      hasAmbidexterity: false,
      enduranceLevels: override.enduranceLevels ?? 0,
      fortitudeLevels: override.fortitudeLevels ?? 0,
      hasDreadnought: override.hasDreadnought ?? false,
    },
    magicalCapabilities: {
      canUseRod: true,
      canUseStaff: true,
      canWearMageArmour: true,
      canDeliverCombatMagic: true,
    },
  };
}

function apply(
  store: IndividualGlobalHitStore,
  records: readonly IndividualMeleeDefenceRecord[],
) {
  return applyIndividualLandedHits(store, records);
}

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
  attackerWeaponCategory: IndividualWeaponCategory = "oneHanded",
  awkwardDistance = false,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId,
    defenderEntityId,
    attackerWeaponCategory,
    defenderActiveWeaponCategory: "oneHanded",
    defenderShieldCategory: "none",
    defenderShieldCarriedState: "none",
    defenderActionState: "ready",
    guardStateBeforeResolution: "ready",
    defenderFacingX: -1,
    defenderFacingY: 0,
    incomingDirectionName: "west",
    incomingDirectionOctantIndex: 4,
    availableDefenceType: "none",
    outcome: "landed",
    landedReason: "noActiveDefence",
    defenceRecoveryTicksAssigned: 0,
    awkwardDistance,
  };
}

function defendedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
  outcome: "parried" | "bucklerBlocked" | "shieldBlocked",
): IndividualMeleeDefenceRecord {
  const availableDefenceType =
    outcome === "shieldBlocked"
      ? "shieldBlock"
      : outcome === "bucklerBlocked"
        ? "bucklerBlock"
        : "weaponParry";
  return {
    ...landedRecord(attackerEntityId, defenderEntityId),
    availableDefenceType,
    outcome,
    defenceRecoveryTicksAssigned: 4,
  };
}

function runReplay(): unknown {
  const profiles = createProfileStore([{}, {}, {}]);
  const hits = createIndividualGlobalHitStore(profiles, { entityCount: 3 });
  const trace: unknown[] = [];
  for (let tick = 0; tick < 5; tick += 1) {
    const result = apply(hits, [
      landedRecord(0, 2, "dagger", tick % 2 === 0),
      defendedRecord(1, 2, "parried"),
      landedRecord(1, 2, "pike"),
    ]);
    trace.push({
      tick,
      applications: result.applications.map((record) => ({ ...record })),
      events: result.zeroHitEvents.map((event) => ({ ...event })),
      currentHits: getIndividualCurrentGlobalHits(hits, 2),
      zeroReached: hasIndividualReachedZeroHits(hits, 2),
    });
  }
  return trace;
}

function formationUnit(unitId: number, anchorX: number, headingX: -1 | 1) {
  return {
    unitId,
    anchorX,
    anchorY: 50,
    headingX,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold" as const,
  };
}

function individual(entityId: number) {
  return {
    entityId,
    role: "regular" as const,
    slotRow: 0,
    slotCol: 0,
    memberMaxStep: 0,
  };
}
