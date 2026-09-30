import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import {
  createInitialSnapshot,
  createSimulation,
} from "../../src/sim/simulation";

describe("Milestone 8G-3 production personal-space debug projection", () => {
  it("exposes bounded collision evidence without becoming authority", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    const beforeX = simulation.world.positionsX.slice();
    const beforeY = simulation.world.positionsY.slice();

    const snapshot = createInitialSnapshot(simulation);
    const debug = snapshot.personalSpaceDebug!;

    expect(debug.occupancyClassCodes).toBeInstanceOf(Uint8Array);
    expect(debug.radii).toBeInstanceOf(Uint8Array);
    expect(debug.intendedDeltas).toBeInstanceOf(Int32Array);
    expect(debug.resolvedDeltas).toBeInstanceOf(Int32Array);
    expect(debug.principalBlockerByEntity).toBeInstanceOf(Int32Array);
    expect(debug.principalRelationshipCodes).toBeInstanceOf(Uint8Array);
    expect(debug.downedSoftAvoidanceFlags).toBeInstanceOf(Uint8Array);
    expect(debug.assistedGroupInteractionFlags).toBeInstanceOf(Uint8Array);
    expect(debug.rightOfWayClassCodes).toBeInstanceOf(Uint8Array);
    expect(debug.resolutionFlags).toBeInstanceOf(Uint8Array);
    expect(debug.detourPhaseCodes).toBeInstanceOf(Uint8Array);
    expect(debug.courtesyBlockerByEntity).toBeInstanceOf(Int32Array);
    expect(debug.overtakeLeaderByEntity).toBeInstanceOf(Int32Array);
    expect(simulation.world.positionsX).toEqual(beforeX);
    expect(simulation.world.positionsY).toEqual(beforeY);
  });
});
