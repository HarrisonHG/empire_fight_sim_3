import { describe, expect, it } from "vitest";

import {
  MAIN_BATTLE_MEDICAL_SCENARIO,
  MAIN_BATTLE_SIDE_LABELS,
} from "../../src/content/mainBattleMedicalScenario";
import { createInitialSnapshot, createSimulation } from "../../src/sim/simulation";
import { deriveMainBattleSideSummaries } from "../../src/ui/mainBattleSummaryModel";

describe("main battle side summary", () => {
  it("derives compact side totals from authoritative unit summaries", () => {
    const snapshot = createInitialSnapshot(createSimulation(
      MAIN_BATTLE_MEDICAL_SCENARIO,
    ));
    const summaries = deriveMainBattleSideSummaries(
      snapshot.combatDebug!.units,
      MAIN_BATTLE_SIDE_LABELS,
    );
    expect(summaries).toEqual([
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
      },
    ]);
  });
});
