import { describe, expect, it } from "vitest";

import { MOVEMENT_BEHAVIOUR_SCENARIO } from "../../src/content/movementBehaviourScenario";
import {
  computeSlotWorldPosition,
  getUnitCohesion,
  getUnitMovementStyle,
} from "../../src/sim/formationBehaviour";
import {
  advanceSimulationOneTick,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import { getUnitMembers } from "../../src/sim/unitIdentity";

describe("Milestone 2 movement visual regression scenario", () => {
  it("reconstructs the accepted movement lanes without combat", () => {
    const simulation = createSimulation(MOVEMENT_BEHAVIOUR_SCENARIO);
    const formation = simulation.formationSandbox;
    if (formation === undefined) throw new Error("Expected formation sandbox.");
    expect(simulation.combatSandbox).toBeUndefined();

    const sourceCohesion = getUnitCohesion(formation.formationStore, 109);
    const blockerCohesion = getUnitCohesion(formation.formationStore, 110);
    advanceSimulationOneTick(simulation);

    expect(getUnitMovementStyle(formation.formationStore, 101)).toBe("formedMarch");
    expect(getUnitMovementStyle(formation.formationStore, 102)).toBe("orderedHalt");
    expect(getUnitMovementStyle(formation.formationStore, 103)).toBe("formedDetour");
    expect(getUnitMovementStyle(formation.formationStore, 105)).toBe("looseFlow");
    expect(getUnitMovementStyle(formation.formationStore, 107)).toBe("haltAndWait");
    expect(getUnitMovementStyle(formation.formationStore, 109)).toBe("pushThrough");
    expect(getUnitCohesion(formation.formationStore, 109)).toBeLessThan(sourceCohesion);
    expect(getUnitCohesion(formation.formationStore, 110)).toBeLessThan(blockerCohesion);
  });

  it("replays the retained formation-only scenario deterministically", () => {
    expect(runScenario()).toEqual(runScenario());
  });

  it("keeps veterans more stable than recruits under equal pressure", () => {
    const simulation = createSimulation(MOVEMENT_BEHAVIOUR_SCENARIO);
    const formation = simulation.formationSandbox;
    if (formation === undefined) throw new Error("Expected formation sandbox.");
    for (let tick = 0; tick < 12; tick += 1) {
      advanceSimulationOneTick(simulation);
    }

    expect(totalSlotError(simulation, 111)).toBeLessThan(
      totalSlotError(simulation, 112),
    );
  });
});

function runScenario(): unknown {
  const simulation = createSimulation(MOVEMENT_BEHAVIOUR_SCENARIO);
  for (let tick = 0; tick < 120; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  const snapshot = createPositionSnapshot(simulation);
  return {
    tick: snapshot.tick,
    positions: Array.from(snapshot.positions),
    formationDebug: snapshot.formationDebug,
  };
}

function totalSlotError(
  simulation: ReturnType<typeof createSimulation>,
  unitId: number,
): number {
  const formation = simulation.formationSandbox;
  if (formation === undefined) throw new Error("Expected formation sandbox.");
  let total = 0;
  for (const entityId of getUnitMembers(formation.identityStore, unitId)) {
    const slot = computeSlotWorldPosition(
      formation.formationStore,
      unitId,
      0,
      getUnitMembers(formation.identityStore, unitId).indexOf(entityId),
    );
    total +=
      Math.abs(simulation.world.positionsX[entityId]! - slot.x) +
      Math.abs(simulation.world.positionsY[entityId]! - slot.y);
  }
  return total;
}
