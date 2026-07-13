import { describe, expect, it } from "vitest";

import {
  createIndividualCombatProfileStore,
  deriveMaximumGlobalHits,
  getIndividualCombatProfile,
  type IndividualArmourCategory,
  type IndividualCombatProfileConfig,
  type IndividualWeaponCategory,
  type MagicalCombatCapabilities,
  type TrustedCombatQualifications,
} from "../../src/sim/individualCombatProfile";

describe("individual combat profile store", () => {
  it("constructs immutable profiles in deterministic entity order", () => {
    const config = {
      entityCount: 3,
      profiles: [
        profile(0, { primaryWeapon: "oneHanded" }),
        profile(1, { primaryWeapon: "ranged" }),
        profile(2, {
          primaryWeapon: "rod",
          backupWeapon: "dagger",
          shieldCategory: "buckler",
          shieldCarriedState: "held",
        }),
      ],
    } as const;

    const first = createIndividualCombatProfileStore(config);
    const second = createIndividualCombatProfileStore(config);

    expect(getIndividualCombatProfile(first, 0)).toEqual({
      entityId: 0,
      primaryWeapon: "oneHanded",
      supportedAttackModes: ["melee"],
      reach: 2,
      handRequirement: "one",
      shieldCategory: "none",
      shieldCarriedState: "none",
      armourCategory: "none",
      hasQualifyingHelmet: false,
      qualifications: trustedQualifications(),
      magicalCapabilities: magicalCapabilities(),
      temporaryAlwaysOnHitModifier: 0,
    });
    expect(getIndividualCombatProfile(first, 1)).toMatchObject({
      primaryWeapon: "ranged",
      supportedAttackModes: ["ranged"],
      reach: 6,
      handRequirement: "twoWhileFiring",
    });
    expect(getIndividualCombatProfile(first, 2)).toMatchObject({
      backupWeapon: "dagger",
      primaryWeapon: "rod",
      supportedAttackModes: ["melee", "magic"],
    });
    expect(getIndividualCombatProfile(first, 0)).toEqual(
      getIndividualCombatProfile(second, 0),
    );
    expect(Object.isFrozen(getIndividualCombatProfile(first, 0))).toBe(true);
  });

  it("requires exactly one ordered in-bounds profile per entity", () => {
    expect(() =>
      createIndividualCombatProfileStore({
        entityCount: 2,
        profiles: [profile(0)],
      }),
    ).toThrow("exactly one profile per entity");
    expect(() =>
      createIndividualCombatProfileStore({
        entityCount: 2,
        profiles: [profile(0), profile(0)],
      }),
    ).toThrow("Duplicate");
    expect(() =>
      createIndividualCombatProfileStore({
        entityCount: 2,
        profiles: [profile(1), profile(0)],
      }),
    ).toThrow("ordered by contiguous entity ID");
    expect(() =>
      createIndividualCombatProfileStore({
        entityCount: 1,
        profiles: [profile(1)],
      }),
    ).toThrow("out of bounds");
  });

  it.each(["oneHandedSpear", "wand"])(
    "rejects excluded weapon category %s",
    (primaryWeapon) => {
      expect(() =>
        createIndividualCombatProfileStore({
          entityCount: 1,
          profiles: [
            profile(0, {
              primaryWeapon: primaryWeapon as IndividualWeaponCategory,
            }),
          ],
        }),
      ).toThrow("approved individual weapon category");
    },
  );

  it("rejects dreadnought as armour while retaining it as a qualification", () => {
    expect(() =>
      createIndividualCombatProfileStore({
        entityCount: 1,
        profiles: [
          profile(0, {
            armourCategory: "dreadnought" as IndividualArmourCategory,
          }),
        ],
      }),
    ).toThrow("armourCategory is not approved");

    const store = createIndividualCombatProfileStore({
      entityCount: 1,
      profiles: [
        profile(0, {
          armourCategory: "heavy",
          qualifications: { hasDreadnought: true },
        }),
      ],
    });
    expect(
      getIndividualCombatProfile(store, 0).qualifications.hasDreadnought,
    ).toBe(true);
  });

  it.each(["greatWeapon", "polearm", "pike"] as const)(
    "%s requires trusted Weapon Master",
    (primaryWeapon) => {
      expect(() => storeFor(profile(0, {
        primaryWeapon,
        qualifications: { hasWeaponMaster: false },
      }))).toThrow("Weapon Master");
    },
  );

  it("validates Marksman, Thrown, shield, and magical equipment permissions", () => {
    expect(() => storeFor(profile(0, {
      primaryWeapon: "ranged",
      qualifications: { hasMarksman: false },
    }))).toThrow("Marksman");
    expect(() => storeFor(profile(0, {
      primaryWeapon: "thrown",
      qualifications: { hasThrown: false },
    }))).toThrow("Thrown");
    expect(() => storeFor(profile(0, {
      shieldCategory: "shield",
      shieldCarriedState: "held",
      qualifications: { hasShield: false },
    }))).toThrow("Shield");
    expect(() => storeFor(profile(0, {
      primaryWeapon: "rod",
      magicalCapabilities: { canUseRod: false },
    }))).toThrow("rod capability");
    expect(() => storeFor(profile(0, {
      primaryWeapon: "staff",
      magicalCapabilities: { canUseStaff: false },
    }))).toThrow("staff capability");
    expect(() => storeFor(profile(0, {
      armourCategory: "mageArmour",
      magicalCapabilities: { canWearMageArmour: false },
    }))).toThrow("mage-armour capability");
  });

  it("validates shield carried state and active hand compatibility", () => {
    expect(() => storeFor(profile(0, {
      shieldCategory: "none",
      shieldCarriedState: "held",
    }))).toThrow("none carried state");
    expect(() => storeFor(profile(0, {
      shieldCategory: "buckler",
      shieldCarriedState: "none",
    }))).toThrow("held or slung");

    for (const primaryWeapon of [
      "greatWeapon",
      "polearm",
      "pike",
      "ranged",
      "staff",
    ] as const) {
      expect(() => storeFor(profile(0, {
        primaryWeapon,
        shieldCategory: "buckler",
        shieldCarriedState: "held",
      }))).toThrow("Two-handed weapon use");
    }
  });

  it("allows legal buckler and shield combinations for one-handed weapons and rods", () => {
    expect(() => storeFor(profile(0, {
      primaryWeapon: "oneHanded",
      shieldCategory: "buckler",
      shieldCarriedState: "held",
      qualifications: { hasShield: false },
    }))).not.toThrow();
    expect(() => storeFor(profile(0, {
      primaryWeapon: "oneHanded",
      shieldCategory: "shield",
      shieldCarriedState: "held",
    }))).not.toThrow();
    expect(() => storeFor(profile(0, {
      primaryWeapon: "rod",
      shieldCategory: "shield",
      shieldCarriedState: "held",
    }))).not.toThrow();
  });

  it("keeps ranged firing explicitly two-handed and permits only a slung shield", () => {
    const store = storeFor(profile(0, {
      primaryWeapon: "ranged",
      shieldCategory: "shield",
      shieldCarriedState: "slung",
    }));
    expect(getIndividualCombatProfile(store, 0)).toMatchObject({
      handRequirement: "twoWhileFiring",
      supportedAttackModes: ["ranged"],
      shieldCarriedState: "slung",
    });
  });

  it("validates backup weapon permissions while keeping backups stowed", () => {
    expect(() => storeFor(profile(0, {
      primaryWeapon: "oneHanded",
      backupWeapon: "greatWeapon",
      qualifications: { hasWeaponMaster: false },
    }))).toThrow("Weapon Master");

    const store = storeFor(profile(0, {
      primaryWeapon: "greatWeapon",
      backupWeapon: "oneHanded",
      shieldCategory: "shield",
      shieldCarriedState: "slung",
      qualifications: { hasAmbidexterity: true },
    }));
    expect(getIndividualCombatProfile(store, 0)).toMatchObject({
      backupWeapon: "oneHanded",
      shieldCarriedState: "slung",
      qualifications: expect.objectContaining({ hasAmbidexterity: true }),
    });
  });

  it("gates magical attack mode behind the coarse delivery hook", () => {
    const store = storeFor(profile(0, {
      primaryWeapon: "rod",
      magicalCapabilities: { canDeliverCombatMagic: false },
    }));
    expect(getIndividualCombatProfile(store, 0).supportedAttackModes).toEqual([
      "melee",
    ]);
  });

  it("rejects invalid lookup identities", () => {
    const store = storeFor(profile(0));
    expect(() => getIndividualCombatProfile(store, -1)).toThrow(RangeError);
    expect(() => getIndividualCombatProfile(store, 1)).toThrow(RangeError);
  });
});

describe("maximum global hit derivation", () => {
  it.each([
    ["none", 2],
    ["light", 4],
    ["medium", 5],
    ["heavy", 6],
    ["mageArmour", 4],
  ] as const)("derives %s armour as %i maximum hits", (armourCategory, expected) => {
    expect(hitDerivation({ armourCategory }).maximumGlobalHits).toBe(expected);
  });

  it("adds Endurance, helmet, and temporary always-on modifiers", () => {
    expect(
      hitDerivation({
        armourCategory: "medium",
        enduranceLevels: 2,
        hasQualifyingHelmet: true,
        temporaryAlwaysOnHitModifier: 3,
      }),
    ).toEqual({
      baseHits: 2,
      enduranceHits: 2,
      armourHits: 3,
      helmetHits: 1,
      dreadnoughtHits: 0,
      temporaryAlwaysOnHits: 3,
      maximumGlobalHits: 11,
    });
  });

  it("adds Dreadnought only while wearing heavy armour", () => {
    expect(hitDerivation({
      armourCategory: "heavy",
      hasDreadnought: false,
    }).maximumGlobalHits).toBe(6);
    expect(hitDerivation({
      armourCategory: "heavy",
      hasDreadnought: true,
    })).toMatchObject({ dreadnoughtHits: 1, maximumGlobalHits: 7 });
    expect(hitDerivation({
      armourCategory: "light",
      hasDreadnought: true,
    })).toMatchObject({ dreadnoughtHits: 0, maximumGlobalHits: 4 });
  });
});

function storeFor(profileConfig: IndividualCombatProfileConfig) {
  return createIndividualCombatProfileStore({
    entityCount: 1,
    profiles: [profileConfig],
  });
}

function profile(
  entityId: number,
  overrides: Omit<Partial<IndividualCombatProfileConfig>,
    "entityId" | "qualifications" | "magicalCapabilities"> & {
      readonly qualifications?: Partial<TrustedCombatQualifications>;
      readonly magicalCapabilities?: Partial<MagicalCombatCapabilities>;
    } = {},
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon: overrides.primaryWeapon ?? "oneHanded",
    ...(overrides.backupWeapon === undefined
      ? {}
      : { backupWeapon: overrides.backupWeapon }),
    shieldCategory: overrides.shieldCategory ?? "none",
    shieldCarriedState: overrides.shieldCarriedState ?? "none",
    armourCategory: overrides.armourCategory ?? "none",
    hasQualifyingHelmet: overrides.hasQualifyingHelmet ?? false,
    qualifications: trustedQualifications(overrides.qualifications),
    magicalCapabilities: magicalCapabilities(overrides.magicalCapabilities),
    ...(overrides.temporaryAlwaysOnHitModifier === undefined
      ? {}
      : {
          temporaryAlwaysOnHitModifier:
            overrides.temporaryAlwaysOnHitModifier,
        }),
  };
}

function trustedQualifications(
  overrides: Partial<TrustedCombatQualifications> = {},
): TrustedCombatQualifications {
  return {
    hasWeaponMaster: true,
    hasShield: true,
    hasMarksman: true,
    hasThrown: true,
    hasAmbidexterity: false,
    enduranceLevels: 0,
    fortitudeLevels: 0,
    hasDreadnought: false,
    ...overrides,
  };
}

function magicalCapabilities(
  overrides: Partial<MagicalCombatCapabilities> = {},
): MagicalCombatCapabilities {
  return {
    canUseRod: true,
    canUseStaff: true,
    canWearMageArmour: true,
    canDeliverCombatMagic: true,
    ...overrides,
  };
}

function hitDerivation(options: {
  readonly armourCategory: IndividualArmourCategory;
  readonly enduranceLevels?: number;
  readonly hasQualifyingHelmet?: boolean;
  readonly hasDreadnought?: boolean;
  readonly temporaryAlwaysOnHitModifier?: number;
}) {
  return deriveMaximumGlobalHits({
    armourCategory: options.armourCategory,
    hasQualifyingHelmet: options.hasQualifyingHelmet ?? false,
    qualifications: trustedQualifications({
      enduranceLevels: options.enduranceLevels ?? 0,
      hasDreadnought: options.hasDreadnought ?? false,
    }),
    temporaryAlwaysOnHitModifier:
      options.temporaryAlwaysOnHitModifier ?? 0,
  });
}
