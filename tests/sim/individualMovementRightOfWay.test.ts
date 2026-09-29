import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import {
  INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS,
  createIndividualMovementRightOfWayStore,
  selectLocalRightOfWayYielder,
} from "../../src/sim/individualMovementRightOfWay";
import { createSimulation } from "../../src/sim/simulation";

describe("Milestone 8G local right-of-way contract", () => {
  it("compares generic projected classes without knowing role names", () => {
    const store = createIndividualMovementRightOfWayStore(2);
    store.classCodes[0] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.baseline;
    store.classCodes[1] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.elevated;
    expect(selectLocalRightOfWayYielder(store, 0, 1)).toBe(0);

    store.classCodes[0] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.high;
    expect(selectLocalRightOfWayYielder(store, 0, 1)).toBe(1);

    store.classCodes[1] = INDIVIDUAL_LOCAL_RIGHT_OF_WAY_CLASS.high;
    expect(selectLocalRightOfWayYielder(store, 0, 1)).toBe(-1);
  });

  it("records legal initial hard-standing placement for the main battle", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    expect(simulation.combatSandbox!.individualInitialPlacementEvidence)
      .toMatchObject({
        hardStandingParticipantCount: MAIN_BATTLE_MEDICAL_SCENARIO.entityCount,
        illegalHardStandingOverlapCount: 0,
        firstOverlapLeftEntityId: -1,
        firstOverlapRightEntityId: -1,
      });
  });
});
