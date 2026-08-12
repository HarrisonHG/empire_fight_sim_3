import { describe, expect, it } from "vitest";

import {
  ENERGY_EXERTION_EXPECTED_TIMELINE,
  ENERGY_EXERTION_RECOMMENDED_END_TICK,
  ENERGY_EXERTION_VISUAL_CHAMBERS,
  ENERGY_EXERTION_VISUAL_LEGEND_LINES,
  ENERGY_EXERTION_VISUAL_SCENARIO,
  ENERGY_EXERTION_VISUAL_SCENARIO_ID,
} from "../../src/content/energyExertionVisualScenario";
import { findVisualTestEntry } from "../../src/content/visualTestRegistry";
import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  LiveCombatDebugIndividualSnapshot,
} from "../../src/sim/types";
import { SimulationRunner } from "../../src/worker/SimulationRunner";

describe("Milestone 7I retained energy visual scenario", () => {
  it("registers ten labelled focus chambers and resets paused at tick zero", () => {
    const entry = findVisualTestEntry(ENERGY_EXERTION_VISUAL_SCENARIO_ID);
    expect(entry).toMatchObject({
      scenario: ENERGY_EXERTION_VISUAL_SCENARIO,
      showEnergyVisuals: true,
      showCasualtyVisuals: true,
      recommendedTickRange: { start: 0, end: ENERGY_EXERTION_RECOMMENDED_END_TICK },
    });
    expect(entry?.worldLabels).toHaveLength(10);
    expect(entry?.focusAreas).toHaveLength(10);
    expect(entry?.focusAreas?.map((area) => area.entityIds))
      .toEqual(ENERGY_EXERTION_VISUAL_CHAMBERS.map((area) => area.entityIds));
    expect(ENERGY_EXERTION_EXPECTED_TIMELINE).toHaveLength(10);
    expect(ENERGY_EXERTION_VISUAL_LEGEND_LINES.join(" ")).toMatch(
      /fresh.*working.*winded.*spent.*hideable/i,
    );

    const runner = new SimulationRunner(() => 0);
    const messages = runner.handleCommand({
      type: "start",
      scenario: ENERGY_EXERTION_VISUAL_SCENARIO,
    });
    expect(messages.find((message) => message.type === "snapshot"))
      .toMatchObject({ type: "snapshot", snapshot: { tick: 0 } });
    expect(runner.handleCommand({ type: "pause" })).toContainEqual({
      type: "state",
      status: "paused",
      tick: 0,
    });
    runner.handleCommand({ type: "step" });
    expect(runner.handleCommand({
      type: "reset",
      scenario: entry!.scenarioFactory(),
    })).toContainEqual({ type: "state", status: "paused", tick: 0 });
  });

  it("derives all displayed energy evidence from bounded production inspection", () => {
    const simulation = createSimulation(ENERGY_EXERTION_VISUAL_SCENARIO);
    const initial = createInitialSnapshot(simulation);
    expect(initial.combatDebug?.inspectedIndividuals).toHaveLength(29);
    expect(inspected(initial, 0)).toMatchObject({
      currentEnergy: 150,
      maximumEnergy: 500,
      energyBand: "working",
    });

    advanceSimulationOneTick(simulation);
    const first = createPositionSnapshot(simulation);
    expect(inspected(first, 0)).toMatchObject({
      energyActivityContext: "safeStationaryRest",
      energyRecoveryAppliedThisTick: 12,
      currentEnergy: 162,
    });
    expect(inspected(first, 1)).toMatchObject({
      energyRequestedPhysicalGait: "walking",
      energyActualPhysicalGait: "walking",
      energyMovementBaseExpenditureThisTick: 1,
    });
    expect(inspected(first, 2).energyMovementBaseExpenditureThisTick).toBe(8);
    expect(inspected(first, 3).energyMovementBaseExpenditureThisTick).toBe(40);
    expect(inspected(first, 8).energyTotalBurdenPoints).toBe(0);
    expect(inspected(first, 9)).toMatchObject({
      energyTotalBurdenPoints: 6,
      energyBurdenExertionMultiplierPercent: 160,
    });
    expect(inspected(first, 18)).toMatchObject({
      energyBand: "spent",
      energyAttackRecoveryDurationMultiplierPercent: 175,
      energyGuardReadinessRecoveryMultiplierPercent: 50,
      energyPressureRecoveryMultiplierPercent: 50,
    });
    expect(first.combatDebug?.units.every((unit) =>
      unit.energyBehaviourRecommendation !== undefined &&
      unit.energySpentThisTick !== undefined &&
      unit.energyRecoveredThisTick !== undefined
    )).toBe(true);
  });

  it("exercises every chamber through existing production authorities", () => {
    const trace = runTrace();
    expect(trace.safeRestRecovery).toBeGreaterThan(0);
    expect(trace.walkSpent).toBeGreaterThan(0);
    expect(trace.jogSpent ?? -1).toBeGreaterThan(trace.walkSpent ?? -1);
    expect(trace.sprintSpent ?? -1).toBeGreaterThan(trace.jogSpent ?? -1);
    expect(trace.smallCapacityFirstWindedTick).not.toBeNull();
    expect(trace.largeCapacityFirstWindedTick).not.toBeNull();
    expect(trace.smallCapacityFirstWindedTick!)
      .toBeLessThan(trace.largeCapacityFirstWindedTick!);
    expect(trace.attackExertionCount).toBeGreaterThan(0);
    expect(trace.defenceExertionCount).toBeGreaterThan(0);
    expect(trace.heavyWalkingSpent ?? -1)
      .toBeGreaterThan(trace.lightWalkingSpent ?? -1);
    expect(trace.draggingTicks).toBeGreaterThan(0);
    expect(trace.dragHelperSpent ?? -1)
      .toBeGreaterThan(trace.walkComparisonSpent ?? -1);
    expect(trace.freshAttackMultiplier).toBe(100);
    expect(trace.spentAttackMultiplier).toBe(175);
    expect(trace.safeEnergyAt20).toBeGreaterThan(trace.staredownEnergyAt20);
    expect(trace.restingTicks).toBeGreaterThan(0);
    expect(trace.reengagedAfterRest).toBe(true);
    expect(trace.egressMovementTicks).toBeGreaterThan(0);
    expect(trace.waitingTicks).toBeGreaterThan(0);
    expect(trace.barbarianLifecycle).toBe("terminal");
    expect(trace.barbarianPresence).toBe("waitingAtRespawn");
  }, 30_000);

  it("replays the complete visual observation window deterministically", () => {
    expect(runTrace()).toEqual(runTrace());
  }, 30_000);

  it("keeps the extra visual evidence opt-in and out of unrelated retained snapshots", () => {
    const casualty = createInitialSnapshot(createSimulation(
      CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
    ));
    expect(casualty.combatDebug?.units[0]?.energyAverageCurrent).toBeUndefined();
    expect(casualty.combatDebug?.inspectedIndividuals[0]
      ?.energyAttackRecoveryDurationMultiplierPercent).toBeUndefined();
  });
});

function runTrace() {
  const simulation = createSimulation(ENERGY_EXERTION_VISUAL_SCENARIO);
  const startX = simulation.world.positionsX.slice();
  let draggingTicks = 0;
  let restingTicks = 0;
  let reengagedAfterRest = false;
  let observedRest = false;
  let egressMovementTicks = 0;
  let waitingTicks = 0;
  let safeEnergyAt20 = 0;
  let staredownEnergyAt20 = 0;
  let freshAttackMultiplier = 0;
  let spentAttackMultiplier = 0;
  for (let tick = 0; tick < ENERGY_EXERTION_RECOMMENDED_END_TICK; tick += 1) {
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    const dragPatient = inspected(snapshot, 11);
    if (dragPatient.casualtyDragGroupPhase === "dragging") draggingTicks += 1;
    const restingUnitMember = inspected(snapshot, 23);
    if (restingUnitMember.unitEnergyResting) {
      restingTicks += 1;
      observedRest = true;
    } else if (
      observedRest &&
      simulation.world.positionsX[23] !== startX[23]
    ) {
      reengagedAfterRest = true;
    }
    const barbarian = inspected(snapshot, 28);
    if (barbarian.respawnEgressMovedThisTick) egressMovementTicks += 1;
    if (barbarian.playerPresenceState === "waitingAtRespawn") waitingTicks += 1;
    if (simulation.tick === 20) {
      safeEnergyAt20 = inspected(snapshot, 20).currentEnergy ?? 0;
      staredownEnergyAt20 = inspected(snapshot, 21).currentEnergy ?? 0;
    }
    if (simulation.tick === 1) {
      freshAttackMultiplier =
        inspected(snapshot, 16).energyAttackRecoveryDurationMultiplierPercent ?? 0;
      spentAttackMultiplier =
        inspected(snapshot, 18).energyAttackRecoveryDurationMultiplierPercent ?? 0;
    }
  }
  const final = createPositionSnapshot(simulation);
  const finalIndividuals = final.combatDebug!.inspectedIndividuals;
  const finalById = (entityId: number) => finalIndividuals.find((entry) =>
    entry.entityId === entityId
  )!;
  return {
    safeRestRecovery: finalById(0).totalEnergyRecovered,
    walkSpent: finalById(1).totalEnergySpent,
    jogSpent: finalById(2).totalEnergySpent,
    sprintSpent: finalById(3).totalEnergySpent,
    smallCapacityFirstWindedTick: finalById(4).firstWindedTick,
    largeCapacityFirstWindedTick: finalById(5).firstWindedTick,
    attackExertionCount: finalById(6).energyAttackExertionHistoryCount,
    defenceExertionCount: finalById(7).energyDefenceExertionHistoryCount,
    lightWalkingSpent: finalById(8).totalEnergySpent,
    heavyWalkingSpent: finalById(9).totalEnergySpent,
    walkComparisonSpent: finalById(10).totalEnergySpent,
    draggingTicks,
    dragHelperSpent: finalById(12).totalEnergySpent,
    freshAttackMultiplier,
    spentAttackMultiplier,
    safeEnergyAt20,
    staredownEnergyAt20,
    restingTicks,
    reengagedAfterRest,
    egressMovementTicks,
    waitingTicks,
    barbarianLifecycle: finalById(28).characterLifecycleState,
    barbarianPresence: finalById(28).playerPresenceState,
    finalPositions: Array.from(simulation.world.positionsX),
    finalEnergy: finalIndividuals.map((entry) => entry.currentEnergy),
  };
}

function inspected(
  snapshot: ReturnType<typeof createInitialSnapshot> | ReturnType<typeof createPositionSnapshot>,
  entityId: number,
): LiveCombatDebugIndividualSnapshot {
  const individual = snapshot.combatDebug?.inspectedIndividuals.find((entry) =>
    entry.entityId === entityId
  );
  if (individual === undefined) throw new Error(`Missing inspected entity ${entityId}.`);
  return individual;
}
