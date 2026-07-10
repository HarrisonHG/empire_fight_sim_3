import type { SimulationScenario } from "../sim/types";

export const DEFAULT_FOUNDATION_SEED = 0x5eed_0000;

export const FOUNDATION_SCENARIO: SimulationScenario = Object.freeze({
  seed: DEFAULT_FOUNDATION_SEED,
  entityCount: 2_000,
  bounds: Object.freeze({
    width: 1_280,
    height: 720,
  }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 3,
});
