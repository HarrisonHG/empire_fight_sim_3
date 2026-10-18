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
    const [shield, levy, spear, greatWeapon] = snapshot.combatDebug!.units;
    const summaries = deriveMainBattleSideSummaries(
      snapshot.combatDebug!.units,
      MAIN_BATTLE_SIDE_LABELS,
    );
    // Each side has equal-sized units. Check aggregation against authoritative
    // inputs rather than pinning energy to incidental first-tick body movement.
    for (const summary of summaries) {
      expect(summary.energyMinimumRatioFixedPoint).toBeGreaterThan(9_900);
      expect(summary.energyAverageRatioFixedPoint).toBeLessThanOrEqual(10_000);
    }
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
        energyAverageRatioFixedPoint: Math.floor(
          (shield!.energyAverageRatioFixedPoint! + levy!.energyAverageRatioFixedPoint!) / 2,
        ),
        energyMinimumRatioFixedPoint: Math.min(
          shield!.energyMinimumRatioFixedPoint!, levy!.energyMinimumRatioFixedPoint!,
        ),
        energyFresh: 24,
        energyWorking: 0,
        energyWinded: 0,
        energySpent: 0,
        energyResting: 0,
        units: [
          { unitId: 101, active: 12, averageRatioFixedPoint: shield!.energyAverageRatioFixedPoint },
          { unitId: 102, active: 12, averageRatioFixedPoint: levy!.energyAverageRatioFixedPoint },
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
        energyAverageRatioFixedPoint: Math.floor(
          (spear!.energyAverageRatioFixedPoint! + greatWeapon!.energyAverageRatioFixedPoint!) / 2,
        ),
        energyMinimumRatioFixedPoint: Math.min(
          spear!.energyMinimumRatioFixedPoint!, greatWeapon!.energyMinimumRatioFixedPoint!,
        ),
        energyFresh: 20,
        energyWorking: 0,
        energyWinded: 0,
        energySpent: 0,
        energyResting: 0,
        units: [
          { unitId: 201, active: 10, averageRatioFixedPoint: spear!.energyAverageRatioFixedPoint },
          { unitId: 202, active: 10, averageRatioFixedPoint: greatWeapon!.energyAverageRatioFixedPoint },
        ],
      },
    ]);
  });
});
