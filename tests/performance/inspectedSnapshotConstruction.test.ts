import { expect, it } from "vitest";

import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import { advanceSimulationOneTick, createPositionSnapshot, createSimulation } from "../../src/sim/simulation";

// Keep the original full-scene 400-tick/10-second budget explicit. Individual
// glyph semantics use focused inspection; representative snapshot throughput
// belongs to the performance gate and must not be hidden by that test repair.
it("constructs the complete retained casualty inspection for 400 ticks", () => {
  const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
  for (let tick = 0; tick < 400; tick += 1) {
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    expect(snapshot.combatDebug?.inspectedIndividuals).toHaveLength(27);
  }
}, 10_000);
