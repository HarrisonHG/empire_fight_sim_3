import { describe, expect, it } from "vitest";

import {
  MAIN_BATTLE_MEDICAL_SCENARIO,
  MAIN_BATTLE_SIDE_LABELS,
} from "../../src/content/mainBattleMedicalScenario";
import {
  advanceSimulationOneTick,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import { deriveMainBattleSideSummaries } from "../../src/ui/mainBattleSummaryModel";

describe("main battle side summary", () => {
  it("derives compact side totals from authoritative unit summaries", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    const summaries = deriveMainBattleSideSummaries(
      snapshot.combatDebug!.units,
      MAIN_BATTLE_SIDE_LABELS,
    );
    expect(summaries).toMatchObject([
      {
        factionId: 1,
        label: "Citizens",
        active: 24,
        dying: 0,
        terminal: 0,
        routing: 0,
        beingDragged: 0,
        underTreatment: 0,
        comforted: 0,
        respawnEgress: 0,
        waitingAtRespawn: 0,
        currentHerbs: 12,
        reservedHerbs: 0,
        energyActive: 24,
        energyAverageRatioFixedPoint: 9_963,
        energyMinimumRatioFixedPoint: 9_933,
        energyFresh: 24,
        energyWorking: 0,
        energyWinded: 0,
        energySpent: 0,
        energyResting: 0,
        units: [
          { unitId: 101, active: 12, averageRatioFixedPoint: 9_989 },
          { unitId: 102, active: 12, averageRatioFixedPoint: 9_937 },
        ],
      },
      {
        factionId: 2,
        label: "Barbarians",
        active: 20,
        dying: 0,
        terminal: 0,
        routing: 0,
        beingDragged: 0,
        underTreatment: 0,
        comforted: 0,
        respawnEgress: 0,
        waitingAtRespawn: 0,
        currentHerbs: 12,
        reservedHerbs: 0,
        energyActive: 20,
        energyAverageRatioFixedPoint: 9_983,
        energyMinimumRatioFixedPoint: 9_978,
        energyFresh: 20,
        energyWorking: 0,
        energyWinded: 0,
        energySpent: 0,
        energyResting: 0,
        units: [
          { unitId: 201, active: 10, averageRatioFixedPoint: 9_985 },
          { unitId: 202, active: 10, averageRatioFixedPoint: 9_981 },
        ],
      },
    ]);
  });
});
