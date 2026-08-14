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
      currentEnergy: 300,
      maximumEnergy: 1_000,
      energyBand: "working",
    });

    advanceSimulationOneTick(simulation);
    const first = createPositionSnapshot(simulation);
    expect(inspected(first, 0)).toMatchObject({
      energyActivityContext: "safeStationaryRest",
      energyRecoveryAppliedThisTick: 6,
      currentEnergy: 306,
    });
    expect(inspected(first, 1)).toMatchObject({
      energyRequestedPhysicalGait: "walking",
      energyActualPhysicalGait: "walking",
      energyMovementBaseExpenditureThisTick: 0,
    });
    expect(inspected(first, 2).energyMovementBaseExpenditureThisTick).toBe(4);
    expect(inspected(first, 3).energyMovementBaseExpenditureThisTick).toBe(20);
    expect(inspected(first, 8).energyTotalBurdenPoints).toBe(0);
    expect(inspected(first, 8).energyMovementBaseExpenditureThisTick).toBe(4);
    expect(inspected(first, 9)).toMatchObject({
      energyTotalBurdenPoints: 6,
      energyBurdenExertionMultiplierPercent: 160,
      energyMovementBaseExpenditureThisTick: 4,
      energyMovementExpenditureRequestedThisTick: 7,
    });
    expect(inspected(first, 18)).toMatchObject({
      energyBand: "winded",
      energyAttackRecoveryDurationMultiplierPercent: 160,
      energyGuardReadinessRecoveryMultiplierPercent: 70,
      energyPressureRecoveryMultiplierPercent: 70,
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
    expect(trace.walkSpent).toBe(0);
    expect(trace.jogSpent ?? -1).toBeGreaterThan(trace.walkSpent ?? -1);
    expect(trace.maximumSprintTickCost).toBeGreaterThan(trace.maximumJogTickCost);
    expect(trace.sprintTicks).toBeGreaterThan(0);
    expect(trace.smallCapacityFirstWindedTick).toBeNull();
    expect(trace.largeCapacityFirstWindedTick).toBeNull();
    expect(trace.attackExertionCount).toBeGreaterThan(0);
    expect(trace.defenceExertionCount).toBeGreaterThan(0);
    expect(trace.heavyFirstWalkingTick).not.toBeNull();
    expect(trace.lightFirstWalkingTick).not.toBeNull();
    expect(trace.heavyFirstWalkingTick ?? Number.MAX_SAFE_INTEGER)
      .toBeLessThan(trace.lightFirstWalkingTick ?? Number.MAX_SAFE_INTEGER);
    expect(trace.draggingTicks).toBeGreaterThan(0);
    expect(trace.maximumDragHelperMovementBase).toBe(4);
    expect(trace.maximumDragHelperSurcharge).toBe(0);
    expect(trace.maximumDraggedPatientExpenditure).toBe(0);
    expect(trace.draggedPatientMoved).toBe(true);
    expect(trace.freshAttackMultiplier).toBe(100);
    expect(trace.tiredAttackMultiplier).toBe(160);
    expect(trace.freshGuardMultiplier).toBe(100);
    expect(trace.tiredGuardMultiplier).toBe(70);
    expect(trace.freshAttackCount ?? 0)
      .toBeGreaterThan(trace.tiredAttackCount ?? 0);
    expect(trace.maximumTiredAttackRecoveryRemaining)
      .toBeGreaterThan(trace.maximumFreshAttackRecoveryRemaining);
    expect(trace.minimumFreshReadiness).toBeLessThan(10_000);
    expect(trace.minimumTiredReadiness).toBeLessThan(10_000);
    expect(trace.sharedGuardRecoveryComparisonTick).not.toBeNull();
    expect({
      fresh: trace.freshGuardRecoveryOnSharedTick,
      tired: trace.tiredGuardRecoveryOnSharedTick,
    }).toEqual({ fresh: 100, tired: 70 });
    expect(trace.safeEnergyAt20).toBeGreaterThan(trace.staredownEnergyAt20);
    expect(trace.restingTicks).toBeGreaterThan(0);
    expect(trace.reengagedAfterRest).toBe(true);
    expect(trace.stagedInitialGaits).toEqual([
      "stationary", "walking", "jogging", "sprinting",
    ]);
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
  const startY = simulation.world.positionsY.slice();
  let draggingTicks = 0;
  let maximumDragHelperSurcharge = 0;
  let maximumDragHelperMovementBase = 0;
  let maximumDraggedPatientExpenditure = 0;
  let draggedPatientMoved = false;
  let restingTicks = 0;
  let reengagedAfterRest = false;
  let observedRest = false;
  let egressMovementTicks = 0;
  let waitingTicks = 0;
  let safeEnergyAt20 = 0;
  let staredownEnergyAt20 = 0;
  let freshAttackMultiplier = 0;
  let tiredAttackMultiplier = 0;
  let freshGuardMultiplier = 0;
  let tiredGuardMultiplier = 0;
  let maximumFreshAttackRecoveryRemaining = 0;
  let maximumTiredAttackRecoveryRemaining = 0;
  let minimumFreshReadiness = 10_000;
  let minimumTiredReadiness = 10_000;
  let sharedGuardRecoveryComparisonTick: number | null = null;
  let freshGuardRecoveryOnSharedTick = 0;
  let tiredGuardRecoveryOnSharedTick = 0;
  let stagedInitialGaits: readonly string[] = [];
  let maximumJogTickCost = 0;
  let maximumSprintTickCost = 0;
  let lightFirstWalkingTick: number | null = null;
  let heavyFirstWalkingTick: number | null = null;
  for (let tick = 0; tick < ENERGY_EXERTION_RECOMMENDED_END_TICK; tick += 1) {
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    maximumJogTickCost = Math.max(
      maximumJogTickCost,
      inspected(snapshot, 2).energyMovementBaseExpenditureThisTick ?? 0,
    );
    maximumSprintTickCost = Math.max(
      maximumSprintTickCost,
      inspected(snapshot, 3).energyMovementBaseExpenditureThisTick ?? 0,
    );
    if (
      lightFirstWalkingTick === null &&
      inspected(snapshot, 8).energyRequestedPhysicalGait === "walking"
    ) lightFirstWalkingTick = simulation.tick;
    if (
      heavyFirstWalkingTick === null &&
      inspected(snapshot, 9).energyRequestedPhysicalGait === "walking"
    ) heavyFirstWalkingTick = simulation.tick;
    const dragPatient = inspected(snapshot, 11);
    if (dragPatient.casualtyDragGroupPhase === "dragging") {
      draggingTicks += 1;
      maximumDraggedPatientExpenditure = Math.max(
        maximumDraggedPatientExpenditure,
        dragPatient.energyMovementExpenditureRequestedThisTick ?? 0,
      );
      draggedPatientMoved ||= dragPatient.energyExternallyMovedThisTick === true;
    }
    const dragHelper = inspected(snapshot, 12);
    if (dragHelper.energyPhysicalGaitSource === "activeDragHelper") {
      maximumDragHelperSurcharge = Math.max(
        maximumDragHelperSurcharge,
        dragHelper.energyDragSurchargeThisTick ?? 0,
      );
      maximumDragHelperMovementBase = Math.max(
        maximumDragHelperMovementBase,
        dragHelper.energyMovementBaseExpenditureThisTick ?? 0,
      );
    }
    const restingUnitMember = inspected(snapshot, 23);
    if (restingUnitMember.unitEnergyResting) {
      restingTicks += 1;
      observedRest = true;
    } else if (
      observedRest &&
      (simulation.world.positionsX[23] !== startX[23] ||
        simulation.world.positionsY[23] !== startY[23])
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
      tiredAttackMultiplier =
        inspected(snapshot, 18).energyAttackRecoveryDurationMultiplierPercent ?? 0;
      freshGuardMultiplier =
        inspected(snapshot, 17).energyGuardReadinessRecoveryMultiplierPercent ?? 0;
      tiredGuardMultiplier =
        inspected(snapshot, 19).energyGuardReadinessRecoveryMultiplierPercent ?? 0;
      stagedInitialGaits = [23, 24, 25, 26].map((entityId) =>
        inspected(snapshot, entityId).energyRequestedPhysicalGait ?? "stationary"
      );
    }
    maximumFreshAttackRecoveryRemaining = Math.max(
      maximumFreshAttackRecoveryRemaining,
      inspected(snapshot, 16).attackRecoveryTicksRemaining,
    );
    maximumTiredAttackRecoveryRemaining = Math.max(
      maximumTiredAttackRecoveryRemaining,
      inspected(snapshot, 18).attackRecoveryTicksRemaining,
    );
    minimumFreshReadiness = Math.min(
      minimumFreshReadiness,
      inspected(snapshot, 17).storedGuardReadinessFixedPoint,
    );
    minimumTiredReadiness = Math.min(
      minimumTiredReadiness,
      inspected(snapshot, 19).storedGuardReadinessFixedPoint,
    );
    const freshGuardRecovery = inspected(snapshot, 17).guardReadinessRecoveredThisTick;
    const tiredGuardRecovery = inspected(snapshot, 19).guardReadinessRecoveredThisTick;
    if (
      sharedGuardRecoveryComparisonTick === null &&
      freshGuardRecovery > 0 &&
      tiredGuardRecovery > 0
    ) {
      sharedGuardRecoveryComparisonTick = simulation.tick;
      freshGuardRecoveryOnSharedTick = freshGuardRecovery;
      tiredGuardRecoveryOnSharedTick = tiredGuardRecovery;
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
    sprintTicks: finalById(3).energySprintHistoryTicks,
    maximumJogTickCost,
    maximumSprintTickCost,
    smallCapacityFirstWindedTick: finalById(4).firstWindedTick,
    largeCapacityFirstWindedTick: finalById(5).firstWindedTick,
    attackExertionCount: finalById(6).energyAttackExertionHistoryCount,
    defenceExertionCount: finalById(7).energyDefenceExertionHistoryCount,
    lightJoggingSpent: finalById(8).totalEnergySpent,
    heavyJoggingSpent: finalById(9).totalEnergySpent,
    lightFirstWalkingTick,
    heavyFirstWalkingTick,
    walkComparisonSpent: finalById(10).totalEnergySpent,
    draggingTicks,
    dragHelperSpent: finalById(12).totalEnergySpent,
    maximumDragHelperSurcharge,
    maximumDragHelperMovementBase,
    maximumDraggedPatientExpenditure,
    draggedPatientMoved,
    freshAttackMultiplier,
    tiredAttackMultiplier,
    freshGuardMultiplier,
    tiredGuardMultiplier,
    freshAttackCount: finalById(16).energyAttackExertionHistoryCount,
    tiredAttackCount: finalById(18).energyAttackExertionHistoryCount,
    maximumFreshAttackRecoveryRemaining,
    maximumTiredAttackRecoveryRemaining,
    minimumFreshReadiness,
    minimumTiredReadiness,
    sharedGuardRecoveryComparisonTick,
    freshGuardRecoveryOnSharedTick,
    tiredGuardRecoveryOnSharedTick,
    safeEnergyAt20,
    staredownEnergyAt20,
    restingTicks,
    reengagedAfterRest,
    stagedInitialGaits,
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
