import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createIndividualCombatProfileStore,
  type IndividualArmourCategory,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualShieldCarriedState,
  type IndividualShieldCategory,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  applyIndividualLandedHits,
  createIndividualGlobalHitStore,
} from "../../src/sim/individualGlobalHits";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  INDIVIDUAL_ARMOUR_BURDEN_POINTS,
  INDIVIDUAL_HELD_SHIELD_BURDEN_POINTS,
  INDIVIDUAL_PRIMARY_WEAPON_BURDEN_POINTS,
  assertIndividualEnergyExertionModifierInput,
  assertIndividualEnergyExertionModifierProjectionTick,
  calculateIndividualBurdenExertionMultiplierPercent,
  createIndividualEnergyExertionModifierStore,
  getIndividualArmourBurdenPoints,
  getIndividualBurdenExertionMultiplierPercent,
  getIndividualEnergyExertionModifierInspection,
  getIndividualEnergyExertionModifierProjectionTick,
  getIndividualHeldShieldBurdenPoints,
  getIndividualInjuryExertionMultiplierPercent,
  getIndividualMissingGlobalHits,
  getIndividualPrimaryWeaponBurdenPoints,
  getIndividualTotalBurdenPoints,
  projectIndividualEnergyExertionModifiersOneTick,
  type IndividualEnergyExertionModifierStore,
} from "../../src/sim/individualEnergyExertionModifier";

describe("individual tick-start exertion modifiers", () => {
  it("defines every exact armour, held-shield and primary-weapon burden", () => {
    expect(INDIVIDUAL_ARMOUR_BURDEN_POINTS).toEqual({
      none: 0, light: 1, mageArmour: 1, medium: 2, heavy: 4,
    });
    expect(INDIVIDUAL_HELD_SHIELD_BURDEN_POINTS).toEqual({
      none: 0, buckler: 1, shield: 2,
    });
    expect(INDIVIDUAL_PRIMARY_WEAPON_BURDEN_POINTS).toEqual({
      unarmed: 0, dagger: 0, oneHanded: 1, rod: 1, greatWeapon: 2,
      polearm: 2, pike: 2, ranged: 2, staff: 2, thrown: 1,
    });
  });

  it("projects every armour burden value", () => {
    const armour = Object.keys(INDIVIDUAL_ARMOUR_BURDEN_POINTS) as
      IndividualArmourCategory[];
    const fixture = createFixture(armour.map((armourCategory) => ({
      armourCategory,
    })));
    project(fixture, 0);
    expect(armour.map((_, id) => getIndividualArmourBurdenPoints(
      fixture.modifiers, id,
    ))).toEqual(armour.map((category) =>
      INDIVIDUAL_ARMOUR_BURDEN_POINTS[category]));
  });

  it("counts only held shields and gives slung shields zero burden", () => {
    const fixture = createFixture([
      {},
      { shieldCategory: "buckler", shieldCarriedState: "slung" },
      { shieldCategory: "buckler", shieldCarriedState: "held" },
      { shieldCategory: "shield", shieldCarriedState: "slung" },
      { shieldCategory: "shield", shieldCarriedState: "held" },
    ]);
    project(fixture, 0);
    expect([0, 1, 2, 3, 4].map((id) =>
      getIndividualHeldShieldBurdenPoints(fixture.modifiers, id)))
      .toEqual([0, 0, 1, 0, 2]);
  });

  it("projects every primary-weapon burden value", () => {
    const weapons = Object.keys(INDIVIDUAL_PRIMARY_WEAPON_BURDEN_POINTS) as
      IndividualWeaponCategory[];
    const fixture = createFixture(weapons.map((primaryWeapon) => ({
      primaryWeapon,
    })));
    project(fixture, 0);
    expect(weapons.map((_, id) => getIndividualPrimaryWeaponBurdenPoints(
      fixture.modifiers, id,
    ))).toEqual(weapons.map((weapon) =>
      INDIVIDUAL_PRIMARY_WEAPON_BURDEN_POINTS[weapon]));
  });

  it("stores exact component totals and all 100..180 burden multipliers", () => {
    const fixture = createFixture([{
      armourCategory: "heavy",
      primaryWeapon: "oneHanded",
      shieldCategory: "shield",
      shieldCarriedState: "held",
    }]);
    project(fixture, 0);
    expect(getIndividualEnergyExertionModifierInspection(fixture.modifiers, 0))
      .toMatchObject({
        armourBurdenPoints: 4,
        heldShieldBurdenPoints: 2,
        primaryWeaponBurdenPoints: 1,
        totalBurdenPoints: 7,
        burdenExertionMultiplierPercent: 170,
      });
    expect(Array.from({ length: 9 }, (_, points) =>
      calculateIndividualBurdenExertionMultiplierPercent(points)))
      .toEqual([100, 110, 120, 130, 140, 150, 160, 170, 180]);
    expect(() => calculateIndividualBurdenExertionMultiplierPercent(9))
      .toThrow(RangeError);
  });

  it("ignores backup weapon, helmet, qualifications and authored hit modifiers", () => {
    const fixture = createFixture([
      { primaryWeapon: "dagger" },
      {
        primaryWeapon: "dagger",
        backupWeapon: "greatWeapon",
        hasQualifyingHelmet: true,
        enduranceLevels: 5,
        fortitudeLevels: 7,
        hasDreadnought: true,
        temporaryAlwaysOnHitModifier: 9,
      },
    ]);
    project(fixture, 0);
    expect([0, 1].map((id) => ({
      weapon: getIndividualPrimaryWeaponBurdenPoints(fixture.modifiers, id),
      total: getIndividualTotalBurdenPoints(fixture.modifiers, id),
      multiplier: getIndividualBurdenExertionMultiplierPercent(
        fixture.modifiers, id,
      ),
    }))).toEqual([
      { weapon: 0, total: 0, multiplier: 100 },
      { weapon: 0, total: 0, multiplier: 100 },
    ]);
  });

  it("projects exact missing-hit multipliers and caps at 150 percent", () => {
    const fixture = createFixture([{
      armourCategory: "heavy",
      hasQualifyingHelmet: true,
      enduranceLevels: 1,
    }]);
    for (let tick = 0; tick <= 7; tick += 1) {
      project(fixture, tick);
      expect(getIndividualMissingGlobalHits(fixture.modifiers, 0)).toBe(tick);
      expect(getIndividualInjuryExertionMultiplierPercent(
        fixture.modifiers, 0,
      )).toBe(Math.min(150, 100 + 10 * tick));
      if (tick < 7) damageOnce(fixture.hits);
    }
  });

  it("holds tick-start hit evidence until the following projection", () => {
    const fixture = createFixture([{}]);
    project(fixture, 0);
    damageOnce(fixture.hits);
    expect(getIndividualEnergyExertionModifierInspection(fixture.modifiers, 0))
      .toMatchObject({
        projectionTick: 0,
        currentGlobalHits: 2,
        maximumGlobalHits: 2,
        missingGlobalHits: 0,
        injuryExertionMultiplierPercent: 100,
      });
    project(fixture, 1);
    expect(getIndividualEnergyExertionModifierInspection(fixture.modifiers, 0))
      .toMatchObject({
        projectionTick: 1,
        currentGlobalHits: 1,
        missingGlobalHits: 1,
        injuryExertionMultiplierPercent: 110,
      });
  });

  it("enforces genuine, matching, projected and current optional input", () => {
    const fixture = createFixture([{}]);
    expect(() => assertIndividualEnergyExertionModifierInput(undefined, 1, 0))
      .not.toThrow();
    expect(() => assertIndividualEnergyExertionModifierInput(null, 1, 0))
      .toThrow(TypeError);
    expect(() => assertIndividualEnergyExertionModifierInput({
      modifiers: { entityCount: 1 }, tick: 0,
    }, 1, 0)).toThrow(TypeError);
    expect(() => assertIndividualEnergyExertionModifierInput({
      modifiers: fixture.modifiers, tick: 0,
    }, 1, 0)).toThrow(/stale/);
    project(fixture, 4);
    expect(() => assertIndividualEnergyExertionModifierInput({
      modifiers: fixture.modifiers, tick: 3,
    }, 1, 4)).toThrow(/stale/);
    expect(() => assertIndividualEnergyExertionModifierInput({
      modifiers: fixture.modifiers, tick: 4,
    }, 2, 4)).toThrow(RangeError);
    expect(() => assertIndividualEnergyExertionModifierInput({
      modifiers: fixture.modifiers, tick: 4,
    }, 1, 3)).toThrow(/current tick/);
    expect(() => assertIndividualEnergyExertionModifierInput({
      modifiers: fixture.modifiers, tick: 4,
    }, 1, 5)).toThrow(/current tick/);
    expect(() => assertIndividualEnergyExertionModifierInput({
      modifiers: fixture.modifiers, tick: 4,
    }, 1, 4)).not.toThrow();
  });

  it("rejects duplicate, backwards and mismatched projection atomically", () => {
    const fixture = createFixture([{}]);
    project(fixture, 2);
    const before = getIndividualEnergyExertionModifierInspection(
      fixture.modifiers, 0,
    );
    expect(() => project(fixture, 2)).toThrow(/already projected/);
    expect(() => project(fixture, 1)).toThrow(/backwards/);
    const mismatched = createFixture([{}, {}]);
    expect(() => projectIndividualEnergyExertionModifiersOneTick(
      fixture.modifiers, mismatched.profiles, mismatched.hits, 3,
    )).toThrow(RangeError);
    expect(() => projectIndividualEnergyExertionModifiersOneTick(
      fixture.modifiers,
      { entityCount: 1 } as IndividualCombatProfileStore,
      fixture.hits,
      3,
    )).toThrow();
    expect(getIndividualEnergyExertionModifierInspection(fixture.modifiers, 0))
      .toEqual(before);
    expect(getIndividualEnergyExertionModifierProjectionTick(fixture.modifiers))
      .toBe(2);
    assertIndividualEnergyExertionModifierProjectionTick(fixture.modifiers, 2);
  });

  it("uses entity-indexed typed arrays and keeps inspection off the hot path", () => {
    const source = readFileSync(
      new URL("../../src/sim/individualEnergyExertionModifier.ts", import.meta.url),
      "utf8",
    );
    expect(source.match(/new Uint(?:8|16|32)Array\(entityCount\)/g)?.length)
      .toBe(9);
    const projectionBody = source.slice(
      source.indexOf("export function projectIndividualEnergyExertionModifiersOneTick"),
      source.indexOf("export function assertIndividualEnergyExertionModifierInput"),
    );
    expect(projectionBody).not.toContain("getIndividualEnergyExertionModifierInspection");
    expect(projectionBody).not.toContain("new Array");
  });
});

interface Overrides {
  readonly primaryWeapon?: IndividualWeaponCategory;
  readonly backupWeapon?: IndividualWeaponCategory;
  readonly shieldCategory?: IndividualShieldCategory;
  readonly shieldCarriedState?: IndividualShieldCarriedState;
  readonly armourCategory?: IndividualArmourCategory;
  readonly hasQualifyingHelmet?: boolean;
  readonly enduranceLevels?: number;
  readonly fortitudeLevels?: number;
  readonly hasDreadnought?: boolean;
  readonly temporaryAlwaysOnHitModifier?: number;
}

function createFixture(overrides: readonly Overrides[]) {
  const profiles = createIndividualCombatProfileStore({
    entityCount: overrides.length,
    profiles: overrides.map(profile),
  });
  return {
    profiles,
    hits: createIndividualGlobalHitStore(profiles, {
      entityCount: overrides.length,
    }),
    modifiers: createIndividualEnergyExertionModifierStore(overrides.length),
  };
}

function profile(override: Overrides, entityId: number): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon: override.primaryWeapon ?? "unarmed",
    ...(override.backupWeapon === undefined
      ? {} : { backupWeapon: override.backupWeapon }),
    shieldCategory: override.shieldCategory ?? "none",
    shieldCarriedState: override.shieldCarriedState ?? "none",
    armourCategory: override.armourCategory ?? "none",
    hasQualifyingHelmet: override.hasQualifyingHelmet ?? false,
    temporaryAlwaysOnHitModifier: override.temporaryAlwaysOnHitModifier ?? 0,
    qualifications: {
      hasWeaponMaster: true,
      hasShield: true,
      hasMarksman: true,
      hasThrown: true,
      hasAmbidexterity: true,
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

function project(
  fixture: {
    profiles: ReturnType<typeof createIndividualCombatProfileStore>;
    hits: ReturnType<typeof createIndividualGlobalHitStore>;
    modifiers: IndividualEnergyExertionModifierStore;
  },
  tick: number,
): void {
  projectIndividualEnergyExertionModifiersOneTick(
    fixture.modifiers, fixture.profiles, fixture.hits, tick,
  );
}

function damageOnce(hits: ReturnType<typeof createIndividualGlobalHitStore>): void {
  applyIndividualLandedHits(hits, [{
    attackerEntityId: 0,
    defenderEntityId: 0,
    attackerWeaponCategory: "unarmed",
    outcome: "landed",
    awkwardDistance: false,
    availableDefenceType: "none",
    landedReason: "noActiveDefence",
  } as IndividualMeleeDefenceRecord]);
}
