import { describe, expect, it } from "vitest";

import {
  createUnitLoadoutStore,
  getUnitArmourClass,
  getUnitLoadoutSummary,
  getUnitShieldClass,
  getUnitSpecialCallCapabilities,
  getUnitTrainingTags,
  getUnitWeaponCategory,
  getUnitWeaponReachBand,
  hasUnitSpecialCallCapability,
  hasUnitTrainingTag,
  type SpecialCallCapability,
  type UnitLoadoutConfig,
  type UnitLoadoutStore,
  type UnitTrainingTag,
} from "../../src/sim/unitLoadout";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("unit loadouts", () => {
  it("creates a loadout store for units in the identity store", () => {
    const identity = createTestIdentity();
    const store = createUnitLoadoutStore(identity, {
      entityCount: 4,
      units: [],
    });

    expect(store.entityCount).toBe(4);
    expect(store.unitCount).toBe(3);
  });

  it("gives units a safe boring default loadout", () => {
    const store = createTestStore({ entityCount: 4, units: [] });

    expect(getUnitWeaponCategory(store, 10)).toBe("unarmed");
    expect(getUnitWeaponReachBand(store, 10)).toBe("none");
    expect(getUnitArmourClass(store, 10)).toBe("none");
    expect(getUnitShieldClass(store, 10)).toBe("none");
    expect(getUnitTrainingTags(store, 10)).toEqual([]);
    expect(getUnitSpecialCallCapabilities(store, 10)).toEqual([]);
  });

  it("reads back explicit weapon category and reach", () => {
    const store = createTestStore({
      entityCount: 4,
      units: [
        {
          unitId: 20,
          weaponCategory: "polearm",
          weaponReachBand: "long",
        },
      ],
    });

    expect(getUnitWeaponCategory(store, 20)).toBe("polearm");
    expect(getUnitWeaponReachBand(store, 20)).toBe("long");
  });

  it("reads back new weapon categories and very long reach", () => {
    const firstStore = createTestStore({
      entityCount: 4,
      units: [
        {
          unitId: 10,
          weaponCategory: "pike",
          weaponReachBand: "veryLong",
        },
        {
          unitId: 20,
          weaponCategory: "dualWield",
          weaponReachBand: "close",
        },
        {
          unitId: 30,
          weaponCategory: "rod",
          weaponReachBand: "ranged",
        },
      ],
    });
    const secondStore = createTestStore({
      entityCount: 4,
      units: [
        {
          unitId: 10,
          weaponCategory: "staff",
          weaponReachBand: "medium",
        },
      ],
    });

    expect(getUnitWeaponCategory(firstStore, 10)).toBe("pike");
    expect(getUnitWeaponReachBand(firstStore, 10)).toBe("veryLong");
    expect(getUnitWeaponCategory(firstStore, 20)).toBe("dualWield");
    expect(getUnitWeaponCategory(firstStore, 30)).toBe("rod");
    expect(getUnitWeaponCategory(secondStore, 10)).toBe("staff");
  });

  it("reads back explicit armour and shield classes", () => {
    const store = createTestStore({
      entityCount: 4,
      units: [
        {
          unitId: 20,
          armourClass: "heavy",
          shieldClass: "shield",
        },
      ],
    });

    expect(getUnitArmourClass(store, 20)).toBe("heavy");
    expect(getUnitShieldClass(store, 20)).toBe("shield");
  });

  it("reads back new armour classes", () => {
    const store = createTestStore({
      entityCount: 4,
      units: [
        { unitId: 10, armourClass: "mageArmour" },
        { unitId: 20, armourClass: "dreadnought" },
      ],
    });

    expect(getUnitArmourClass(store, 10)).toBe("mageArmour");
    expect(getUnitArmourClass(store, 20)).toBe("dreadnought");
  });

  it("reads and queries training tags", () => {
    const store = createTestStore({
      entityCount: 4,
      units: [
        {
          unitId: 10,
          trainingTags: ["formed", "heavy", "banner"],
        },
      ],
    });

    expect(getUnitTrainingTags(store, 10)).toEqual([
      "formed",
      "heavy",
      "banner",
    ]);
    expect(hasUnitTrainingTag(store, 10, "formed")).toBe(true);
    expect(hasUnitTrainingTag(store, 10, "banner")).toBe(true);
    expect(hasUnitTrainingTag(store, 10, "skirmisher")).toBe(false);
  });

  it("reads and queries special-call capabilities", () => {
    const store = createTestStore({
      entityCount: 4,
      units: [
        {
          unitId: 30,
          specialCallCapabilities: ["repel", "strikedown", "fixWeapon"],
        },
      ],
    });

    expect(getUnitSpecialCallCapabilities(store, 30)).toEqual([
      "repel",
      "strikedown",
      "fixWeapon",
    ]);
    expect(hasUnitSpecialCallCapability(store, 30, "repel")).toBe(true);
    expect(hasUnitSpecialCallCapability(store, 30, "fixWeapon")).toBe(true);
    expect(hasUnitSpecialCallCapability(store, 30, "heal")).toBe(false);
  });

  it("does not let returned tag or capability arrays mutate internal state", () => {
    const store = createTestStore({
      entityCount: 4,
      units: [
        {
          unitId: 10,
          trainingTags: ["formed"],
          specialCallCapabilities: ["heal"],
        },
      ],
    });

    const trainingTags = getUnitTrainingTags(store, 10);
    const capabilities = getUnitSpecialCallCapabilities(store, 10);

    expect(Object.isFrozen(trainingTags)).toBe(true);
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(() =>
      (trainingTags as UnitTrainingTag[]).push("heavy"),
    ).toThrow(TypeError);
    expect(() =>
      (capabilities as SpecialCallCapability[]).push("restore"),
    ).toThrow(TypeError);
    expect(getUnitTrainingTags(store, 10)).toEqual(["formed"]);
    expect(getUnitSpecialCallCapabilities(store, 10)).toEqual(["heal"]);
  });

  it("throws for duplicate unit loadout config", () => {
    expect(() =>
      createTestStore({
        entityCount: 4,
        units: [
          { unitId: 10, weaponCategory: "oneHanded" },
          { unitId: 10, weaponCategory: "twoHanded" },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("throws for unknown unit loadout config", () => {
    expect(() =>
      createTestStore({
        entityCount: 4,
        units: [{ unitId: 99, weaponCategory: "bow" }],
      }),
    ).toThrow(RangeError);
  });

  it("throws when querying an unknown unit ID", () => {
    const store = createTestStore({ entityCount: 4, units: [] });

    expect(() => getUnitWeaponCategory(store, 99)).toThrow(RangeError);
    expect(() => getUnitLoadoutSummary(store, 99)).toThrow(RangeError);
  });

  it("allows config to omit units because defaults apply", () => {
    const store = createTestStore({
      entityCount: 4,
      units: [{ unitId: 20, weaponCategory: "bow" }],
    });

    expect(getUnitWeaponCategory(store, 20)).toBe("bow");
    expect(getUnitWeaponCategory(store, 10)).toBe("unarmed");
    expect(getUnitWeaponCategory(store, 30)).toBe("unarmed");
  });

  it("returns deterministic stable loadout summaries", () => {
    const config: UnitLoadoutConfig = {
      entityCount: 4,
      units: [
        {
          unitId: 20,
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
          armourClass: "medium",
          shieldClass: "buckler",
          trainingTags: ["formed", "captain"],
          specialCallCapabilities: ["cleave", "fixWeapon"],
        },
      ],
    };
    const first = createTestStore(config);
    const second = createTestStore(config);
    const expected = {
      unitId: 20,
      weaponCategory: "oneHanded",
      weaponReachBand: "short",
      armourClass: "medium",
      shieldClass: "buckler",
      trainingTags: ["formed", "captain"],
      specialCallCapabilities: ["cleave", "fixWeapon"],
    };

    expect(getUnitLoadoutSummary(first, 20)).toEqual(expected);
    expect(getUnitLoadoutSummary(first, 20)).toEqual(
      getUnitLoadoutSummary(first, 20),
    );
    expect(getUnitLoadoutSummary(first, 20)).toEqual(
      getUnitLoadoutSummary(second, 20),
    );
  });

  it("requires matching identity and loadout entity counts", () => {
    expect(() =>
      createUnitLoadoutStore(createTestIdentity(), {
        entityCount: 5,
        units: [],
      }),
    ).toThrow(RangeError);
  });
});

function createTestStore(config: UnitLoadoutConfig): UnitLoadoutStore {
  return createUnitLoadoutStore(createTestIdentity(), config);
}

function createTestIdentity(): UnitIdentityStore {
  return createUnitIdentityStore({
    entityCount: 4,
    units: [
      { unitId: 30, factionId: 2, memberEntityIds: [3] },
      { unitId: 10, factionId: 1, memberEntityIds: [0, 1] },
      { unitId: 20, factionId: 1, memberEntityIds: [2] },
    ],
  });
}
