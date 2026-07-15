import { describe, expect, it } from "vitest";

import {
  DEFENCE_OVERWHELM_CHAMBERS,
  DEFENCE_OVERWHELM_SCENARIO,
  DEFENCE_OVERWHELM_SCENARIO_ID,
} from "../../src/content/defenceOverwhelmVisualScenario";
import { findVisualTestEntry } from "../../src/content/visualTestRegistry";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";

describe("defence overwhelm visual scenario", () => {
  it("is registered, starts at tick zero, and labels six isolated chambers", () => {
    expect(findVisualTestEntry(DEFENCE_OVERWHELM_SCENARIO_ID)?.scenario)
      .toBe(DEFENCE_OVERWHELM_SCENARIO);
    expect(DEFENCE_OVERWHELM_CHAMBERS).toHaveLength(6);
    const initial = createInitialSnapshot(createSimulation(DEFENCE_OVERWHELM_SCENARIO));
    expect(initial.tick).toBe(0);
    expect(initial.combatDebug?.inspectedIndividuals).toHaveLength(14);
  });

  it("uses production records for offensive suppression, cadence recovery, flurries, and rear defence", () => {
    const simulation = createSimulation(DEFENCE_OVERWHELM_SCENARIO);
    let sawOffensiveSuppression = false;
    let sawRegularCadenceSpend = false;
    let sawRecruitCadenceSpend = false;
    let sawRegularFlurry = false;
    let sawVeteranFlurry = false;
    let sawRearAttempt = false;
    let sawSuccessfulRearDefence = false;

    for (let tick = 0; tick < 120; tick += 1) {
      advanceSimulationOneTick(simulation);
      const inspected = createPositionSnapshot(simulation).combatDebug
        ?.inspectedIndividuals ?? [];
      sawOffensiveSuppression ||= inspected.slice(0, 2).some(
        (entry) => entry.guardReadinessOffensivelySuppressed,
      );
      sawRegularCadenceSpend ||= (inspected[3]?.guardReadinessSpentThisTick ?? 0) > 0;
      sawRecruitCadenceSpend ||= (inspected[5]?.guardReadinessSpentThisTick ?? 0) > 0;
      sawRegularFlurry ||= (inspected[8]?.guardReadinessSpentThisTick ?? 0) >= 4_000;
      sawVeteranFlurry ||= (inspected[11]?.guardReadinessSpentThisTick ?? 0) >= 4_000;
      sawRearAttempt ||= inspected[13]?.rearDesperateDefenceApplied ?? false;
      sawSuccessfulRearDefence ||=
        (inspected[13]?.rearDesperateDefenceApplied ?? false) &&
        inspected[13]?.thisTickDefenceOutcome === "parried";
    }

    expect({
      sawOffensiveSuppression,
      sawRegularCadenceSpend,
      sawRecruitCadenceSpend,
      sawRegularFlurry,
      sawVeteranFlurry,
      sawRearAttempt,
      sawSuccessfulRearDefence,
    }).toEqual({
      sawOffensiveSuppression: true,
      sawRegularCadenceSpend: true,
      sawRecruitCadenceSpend: true,
      sawRegularFlurry: true,
      sawVeteranFlurry: true,
      sawRearAttempt: true,
      sawSuccessfulRearDefence: true,
    });
  });

  it("replays deterministically", () => {
    expect(runTrace()).toEqual(runTrace());
  });
});

function runTrace(): unknown {
  const simulation = createSimulation(DEFENCE_OVERWHELM_SCENARIO);
  const trace: unknown[] = [];
  for (let tick = 0; tick < 80; tick += 1) {
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    trace.push({
      tick: snapshot.tick,
      individuals: snapshot.combatDebug?.inspectedIndividuals,
      events: snapshot.combatDebug?.inspectedCombatVisualEvents,
    });
  }
  return trace;
}
