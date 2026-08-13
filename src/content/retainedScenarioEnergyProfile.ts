import type { TrustedIndividualEnergyProfileValues } from "../sim/individualEnergy";

/**
 * Retained pre-energy visual fixtures isolate their original milestone
 * behaviour. This finite profile remains fresh across the full 800-tick
 * inspection range even at the maximum per-tick movement and action impulses;
 * it is not a production default.
 */
export const RETAINED_SCENARIO_ISOLATION_ENERGY_PROFILE:
  Readonly<TrustedIndividualEnergyProfileValues> = Object.freeze({
    maximumEnergy: 800_000,
    startingEnergy: 800_000,
    safeRestRecoveryPerTick: 0,
  });
