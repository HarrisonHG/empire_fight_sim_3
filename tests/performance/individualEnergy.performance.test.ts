import { describe, expect, it } from "vitest";

import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  getIndividualEnergyBand,
  getIndividualEnergyInspection,
  setIndividualCurrentEnergyForTrustedSetup,
} from "../../src/sim/individualEnergy";

describe("individual energy structural performance", () => {
  for (const entityCount of [100, 500, 1_000, 2_000]) {
    it(`creates, derives and inspects ${entityCount} entity-indexed records`, () => {
      const configs = Array.from({ length: entityCount }, (_, index) => {
        const entityId = entityCount - index - 1;
        const maximumEnergy = 8_000 + entityId % 5 * 1_000;
        return {
          entityId,
          maximumEnergy,
          startingEnergy: maximumEnergy - entityId % 4 * 1_000,
          safeRestRecoveryPerTick: entityId % 9,
        };
      });

      const profileStart = performance.now();
      const profiles = createTrustedIndividualEnergyProfileStore({
        entityCount,
        profiles: configs,
      });
      const profileCreationMilliseconds = performance.now() - profileStart;

      const storeStart = performance.now();
      const energy = createIndividualEnergyStore(profiles);
      const storeCreationMilliseconds = performance.now() - storeStart;

      const bandStart = performance.now();
      const bandCounts = { fresh: 0, working: 0, winded: 0, spent: 0 };
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const maximumEnergy = 8_000 + entityId % 5 * 1_000;
        const bandCase = entityId % 4;
        const currentEnergy = bandCase === 0
          ? maximumEnergy
          : bandCase === 1
            ? Math.floor(maximumEnergy * 45 / 100)
            : bandCase === 2
              ? Math.floor(maximumEnergy * 20 / 100)
              : Math.floor(maximumEnergy * 5 / 100);
        setIndividualCurrentEnergyForTrustedSetup(
          energy,
          entityId,
          currentEnergy,
          1,
        );
        bandCounts[getIndividualEnergyBand(energy, entityId)] += 1;
      }
      const bandDerivationMilliseconds = performance.now() - bandStart;

      const inspectionStart = performance.now();
      let inspectionFieldCount = 0;
      let inspectionChecksum = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const inspection = getIndividualEnergyInspection(
          profiles,
          energy,
          entityId,
        );
        inspectionFieldCount = Object.keys(inspection).length;
        inspectionChecksum += inspection.currentEnergy +
          inspection.minimumEnergyReached + inspection.ratioFixedPoint;
      }
      const inspectionMilliseconds = performance.now() - inspectionStart;

      expect(profiles.entityCount).toBe(entityCount);
      expect(energy.entityCount).toBe(entityCount);
      expect(Object.values(bandCounts).reduce((sum, count) => sum + count, 0))
        .toBe(entityCount);
      expect(inspectionFieldCount).toBeLessThanOrEqual(16);
      expect(Number.isSafeInteger(inspectionChecksum)).toBe(true);
      expect(Object.keys(profiles)).toEqual(["entityCount"]);
      expect(Object.keys(energy)).toEqual(["entityCount"]);

      console.info("Individual energy structural report", JSON.stringify({
        entityCount,
        profileCreationMilliseconds,
        storeCreationMilliseconds,
        bandDerivationMilliseconds,
        inspectionMilliseconds,
        bandCounts,
        inspectionFieldCount,
        storageShape: "entity-indexed typed arrays behind opaque stores",
        timingPolicy: "Structural assertions only; no machine timing threshold.",
      }, null, 2));
    });
  }
});
