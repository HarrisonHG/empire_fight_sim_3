import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAXIMUM_ENERGY,
  DEFAULT_SAFE_REST_RECOVERY_PER_TICK,
  DEFAULT_STARTING_ENERGY,
  ENERGY_RATIO_FIXED_POINT_SCALE,
  MAX_ENERGY_HISTORY_TOTAL,
  MAX_REPRESENTABLE_ENERGY,
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  deriveIndividualEnergyBand,
  getIndividualCurrentEnergy,
  getIndividualEnergyBand,
  getIndividualEnergyHistoryInspection,
  getIndividualEnergyInspection,
  getIndividualEnergyRatioFixedPoint,
  getIndividualMaximumEnergy,
  getTrustedIndividualEnergyProfile,
  recoverIndividualEnergy,
  setIndividualCurrentEnergyForTrustedSetup,
  spendIndividualEnergy,
} from "../../src/sim/individualEnergy";

describe("trusted individual energy profiles", () => {
  it("resolves immutable defaults and arbitrary input ordering", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 3,
      profiles: [
        { entityId: 2, maximumEnergy: 12_000, startingEnergy: 8_500 },
        { entityId: 0 },
        {
          entityId: 1,
          maximumEnergy: 7_000,
          startingEnergy: 0,
          safeRestRecoveryPerTick: 11,
        },
      ],
    });

    expect(getTrustedIndividualEnergyProfile(profiles, 0)).toEqual({
      entityId: 0,
      maximumEnergy: DEFAULT_MAXIMUM_ENERGY,
      startingEnergy: DEFAULT_STARTING_ENERGY,
      safeRestRecoveryPerTick: DEFAULT_SAFE_REST_RECOVERY_PER_TICK,
    });
    expect(getTrustedIndividualEnergyProfile(profiles, 1)).toEqual({
      entityId: 1,
      maximumEnergy: 7_000,
      startingEnergy: 0,
      safeRestRecoveryPerTick: 11,
    });
    expect(getTrustedIndividualEnergyProfile(profiles, 2)).toEqual({
      entityId: 2,
      maximumEnergy: 12_000,
      startingEnergy: 8_500,
      safeRestRecoveryPerTick: DEFAULT_SAFE_REST_RECOVERY_PER_TICK,
    });
    expect(Object.isFrozen(getTrustedIndividualEnergyProfile(profiles, 0)))
      .toBe(true);
    expect(Object.isFrozen(profiles)).toBe(true);
    expect(Object.keys(profiles)).toEqual(["entityCount"]);
  });

  it("rejects incomplete coverage, holes, duplicate IDs and out-of-range IDs", () => {
    expect(() => createTrustedIndividualEnergyProfileStore({
      entityCount: 2,
      profiles: [{ entityId: 0 }],
    })).toThrow(/exactly one profile per entity/);
    expect(() => createTrustedIndividualEnergyProfileStore({
      entityCount: 2,
      profiles: [{ entityId: 0 }, { entityId: 0 }],
    })).toThrow(/Duplicate/);
    expect(() => createTrustedIndividualEnergyProfileStore({
      entityCount: 2,
      profiles: [{ entityId: 0 }, { entityId: 2 }],
    })).toThrow(/out of bounds/);
    const sparse = new Array(2) as Array<{ readonly entityId: number }>;
    sparse[0] = { entityId: 0 };
    expect(() => createTrustedIndividualEnergyProfileStore({
      entityCount: 2,
      profiles: sparse,
    })).toThrow(/cannot contain holes/);
  });

  it.each([
    [{ maximumEnergy: 0 }, /maximumEnergy/],
    [{ maximumEnergy: 1.5 }, /maximumEnergy/],
    [{ maximumEnergy: MAX_REPRESENTABLE_ENERGY + 1 }, /maximumEnergy/],
    [{ startingEnergy: -1 }, /startingEnergy/],
    [{ startingEnergy: 1.5 }, /startingEnergy/],
    [{ maximumEnergy: 100, startingEnergy: 101 }, /between 0 and maximumEnergy/],
    [{ safeRestRecoveryPerTick: -1 }, /safeRestRecoveryPerTick/],
    [{ safeRestRecoveryPerTick: 0.5 }, /safeRestRecoveryPerTick/],
    [
      { safeRestRecoveryPerTick: MAX_REPRESENTABLE_ENERGY + 1 },
      /safeRestRecoveryPerTick/,
    ],
  ] as const)("rejects invalid or overflowing profile values %#", (values, error) => {
    expect(() => createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0, ...values }],
    })).toThrow(error);
  });
});

describe("individual energy state and bands", () => {
  it("keeps immutable profile values separate from mutable current energy", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{
        entityId: 0,
        maximumEnergy: 12_000,
        startingEnergy: 8_500,
        safeRestRecoveryPerTick: 9,
      }],
    });
    const energy = createIndividualEnergyStore(profiles);

    expect(getIndividualCurrentEnergy(energy, 0)).toBe(8_500);
    expect(getIndividualMaximumEnergy(energy, 0)).toBe(12_000);
    setIndividualCurrentEnergyForTrustedSetup(energy, 0, 6_000, 4);
    expect(getIndividualCurrentEnergy(energy, 0)).toBe(6_000);
    expect(getTrustedIndividualEnergyProfile(profiles, 0).startingEnergy)
      .toBe(8_500);
    expect(Object.isFrozen(energy)).toBe(true);
    expect(Object.keys(energy)).toEqual(["entityCount"]);
  });

  it.each([
    [10_000, 10_000, "fresh"],
    [6_000, 10_000, "fresh"],
    [5_999, 10_000, "working"],
    [3_000, 10_000, "working"],
    [2_999, 10_000, "winded"],
    [1_000, 10_000, "winded"],
    [999, 10_000, "spent"],
    [0, 10_000, "spent"],
    [23, 37, "fresh"],
    [22, 37, "working"],
    [12, 37, "working"],
    [11, 37, "winded"],
    [4, 37, "winded"],
    [3, 37, "spent"],
  ] as const)("derives %i/%i as %s with integer thresholds", (
    current,
    maximum,
    expected,
  ) => {
    expect(deriveIndividualEnergyBand(current, maximum)).toBe(expected);
  });

  it("derives a deterministic fixed-point ratio without storing a band", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0, maximumEnergy: 37, startingEnergy: 22 }],
    });
    const energy = createIndividualEnergyStore(profiles);
    expect(getIndividualEnergyRatioFixedPoint(energy, 0)).toBe(
      Math.floor(22 * ENERGY_RATIO_FIXED_POINT_SCALE / 37),
    );
    expect(getIndividualEnergyBand(energy, 0)).toBe("working");
  });

  it("clamps spend and recovery and reports exact applied amounts", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0, maximumEnergy: 100, startingEnergy: 40 }],
    });
    const energy = createIndividualEnergyStore(profiles);

    expect(spendIndividualEnergy(energy, 0, 70, 1)).toEqual({
      entityId: 0,
      requestedAmount: 70,
      appliedAmount: 40,
      currentEnergyBefore: 40,
      currentEnergyAfter: 0,
    });
    expect(spendIndividualEnergy(energy, 0, 1, 2).appliedAmount).toBe(0);
    expect(recoverIndividualEnergy(energy, 0, 150, 3)).toEqual({
      entityId: 0,
      requestedAmount: 150,
      appliedAmount: 100,
      currentEnergyBefore: 0,
      currentEnergyAfter: 100,
    });
    expect(recoverIndividualEnergy(energy, 0, 1, 4).appliedAmount).toBe(0);
  });

  it("owns bounded lifetime history and emits threshold ticks once", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0 }],
    });
    const energy = createIndividualEnergyStore(profiles);

    spendIndividualEnergy(energy, 0, 7_100, 5);
    recoverIndividualEnergy(energy, 0, 500, 6);
    spendIndividualEnergy(energy, 0, 3_000, 7);
    spendIndividualEnergy(energy, 0, 1_000, 8);
    recoverIndividualEnergy(energy, 0, 100, 9);
    spendIndividualEnergy(energy, 0, 100, 10);

    expect(getIndividualEnergyHistoryInspection(energy, 0)).toEqual({
      startingEnergy: 10_000,
      minimumEnergyReached: 0,
      firstWindedTick: 5,
      firstSpentTick: 7,
      totalEnergySpent: 10_600,
      totalEnergyRecovered: 600,
    });
    expect(Object.keys(getIndividualEnergyInspection(profiles, energy, 0)))
      .toHaveLength(12);
  });

  it("records initially winded or spent profiles at tick zero", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 2,
      profiles: [
        { entityId: 0, maximumEnergy: 100, startingEnergy: 20 },
        { entityId: 1, maximumEnergy: 100, startingEnergy: 5 },
      ],
    });
    const energy = createIndividualEnergyStore(profiles);
    expect(getIndividualEnergyHistoryInspection(energy, 0)).toMatchObject({
      firstWindedTick: 0,
      firstSpentTick: null,
    });
    expect(getIndividualEnergyHistoryInspection(energy, 1)).toMatchObject({
      firstWindedTick: 0,
      firstSpentTick: 0,
    });
  });

  it("rejects bounded history overflow without partially applying energy", () => {
    const spendProfiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{
        entityId: 0,
        maximumEnergy: MAX_ENERGY_HISTORY_TOTAL,
        startingEnergy: MAX_ENERGY_HISTORY_TOTAL,
      }],
    });
    const spendStore = createIndividualEnergyStore(spendProfiles);
    spendIndividualEnergy(spendStore, 0, MAX_ENERGY_HISTORY_TOTAL, 1);
    recoverIndividualEnergy(spendStore, 0, MAX_ENERGY_HISTORY_TOTAL, 2);
    expect(() => spendIndividualEnergy(spendStore, 0, 1, 3))
      .toThrow(/bounded history storage/);
    expect(getIndividualCurrentEnergy(spendStore, 0))
      .toBe(MAX_ENERGY_HISTORY_TOTAL);

    const recoveryProfiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{
        entityId: 0,
        maximumEnergy: MAX_ENERGY_HISTORY_TOTAL,
        startingEnergy: 0,
      }],
    });
    const recoveryStore = createIndividualEnergyStore(recoveryProfiles);
    recoverIndividualEnergy(recoveryStore, 0, MAX_ENERGY_HISTORY_TOTAL, 1);
    setIndividualCurrentEnergyForTrustedSetup(recoveryStore, 0, 0, 2);
    expect(() => recoverIndividualEnergy(recoveryStore, 0, 1, 3))
      .toThrow(/bounded history storage/);
    expect(getIndividualCurrentEnergy(recoveryStore, 0)).toBe(0);
  });

  it("rejects invalid setup values, entity IDs, amounts and ticks", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0, maximumEnergy: 100, startingEnergy: 50 }],
    });
    const energy = createIndividualEnergyStore(profiles);
    expect(() => setIndividualCurrentEnergyForTrustedSetup(energy, 0, 101))
      .toThrow(/cannot exceed/);
    expect(() => setIndividualCurrentEnergyForTrustedSetup(energy, 0, 1.5))
      .toThrow(/integer/);
    expect(() => spendIndividualEnergy(energy, 1, 1, 0)).toThrow(/out of bounds/);
    expect(() => spendIndividualEnergy(energy, 0, -1, 0)).toThrow(/non-negative/);
    expect(() => recoverIndividualEnergy(energy, 0, 1, -1)).toThrow(/non-negative/);
    const unrelatedProfiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0 }],
    });
    expect(() => getIndividualEnergyInspection(unrelatedProfiles, energy, 0))
      .toThrow(/profile store that owns current energy/);
  });
});
