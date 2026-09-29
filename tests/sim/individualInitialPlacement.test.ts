import { describe, expect, it } from "vitest";

import { VISUAL_TEST_REGISTRY } from "../../src/content/visualTestRegistry";
import { createSimulation } from "../../src/sim/simulation";

describe("Milestone 8G retained production initial placement", () => {
  it("starts every retained production battle without hard-standing overlap", () => {
    const illegal: string[] = [];
    for (const entry of VISUAL_TEST_REGISTRY) {
      if (entry.scenario.combatSandbox?.kind !== "liveCombatSandbox") continue;
      const simulation = createSimulation(entry.scenario);
      const count = simulation.combatSandbox!.individualInitialPlacementEvidence
        .illegalHardStandingOverlapCount;
      if (count > 0) {
        const evidence = simulation.combatSandbox!.individualInitialPlacementEvidence;
        const left = evidence.firstOverlapLeftEntityId;
        const right = evidence.firstOverlapRightEntityId;
        illegal.push(`${entry.id}:${count}:${left},${right}:` +
          `${simulation.world.positionsX[left]},${simulation.world.positionsY[left]}-` +
          `${simulation.world.positionsX[right]},${simulation.world.positionsY[right]}`);
      }
    }
    expect(illegal).toEqual([]);
  });
});
