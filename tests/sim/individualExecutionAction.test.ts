import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  getIndividualTerminalCause,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  getIndividualCasualtyHistoryInspection,
  initializeIndividualDeathCountsFromZeroHitTransitions,
} from "../../src/sim/individualDeathCount";
import {
  getIndividualCasualtyHistoryInspection as getConsolidatedCasualtyHistory,
} from "../../src/sim/individualCasualtyConsolidation";
import {
  advanceIndividualExecutionActionsOneTick,
  createIndividualExecutionActionBuffers,
  getActiveIndividualExecutionActionCount,
  getIndividualExecutionActionInspection,
  getIndividualExecutionDefenceHandAvailability,
  getIndividualExecutionHistoryInspection,
  projectIndividualExecutionOrdinaryParticipation,
  submitIndividualExecutionIntent,
  type IndividualExecutionInterruptionReason,
} from "../../src/sim/individualExecutionAction";
import { applyIndividualLandedHits, getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import { advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import type { IndividualLandedHitGateDecisionRecord } from "../../src/sim/individualLandedHitGate";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  createIndividualOrdinaryParticipationSnapshot,
  isIndividualOrdinaryParticipationEligible,
} from "../../src/sim/individualOrdinaryParticipation";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationState,
} from "../../src/sim/types";

describe("Milestone 6H-1 execution", () => {
  it("starts only from explicit intent and completes after exactly 100 later valid ticks", () => {
    const simulation = createExecutionSimulation("citizen");
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);

    for (let count = 0; count < 5; count += 1) advanceSimulationOneTick(simulation);
    expect(getActiveIndividualExecutionActionCount(
      combat.individualExecutionActionStore,
    )).toBe(0);
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("dying");

    submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
      executorEntityId: 1,
      targetEntityId: 0,
      requestedTick: simulation.tick,
      targetBasis: "dying",
    });
    const startTick = simulation.tick;
    advanceSimulationOneTick(simulation);
    expect(combat.individualExecutionActionResult.startedRecords).toHaveLength(1);
    expect(getIndividualExecutionActionInspection(
      combat.individualExecutionActionStore, 1,
    )).toMatchObject({ startedTick: startTick, progressTicks: 0 });

    for (let count = 0; count < 99; count += 1) {
      advanceSimulationOneTick(simulation);
    }
    expect(getIndividualExecutionActionInspection(
      combat.individualExecutionActionStore, 1,
    )).toMatchObject({ progressTicks: 99, requiredProgressTicks: 100 });
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("dying");

    advanceSimulationOneTick(simulation);
    expect(combat.individualExecutionActionResult.completedRecords[0]).toMatchObject({
      executorEntityId: 1,
      targetEntityId: 0,
      startedTick: startTick,
      progressTicks: 100,
      tick: startTick + 100,
    });
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0)).toBe(0);
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("terminal");
    expect(getIndividualTerminalCause(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("execution");
    expect(getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    )).toBe("terminalAwaitingComfort");
    expect(getIndividualCasualtyHistoryInspection(
      combat.individualDeathCountStore, 0,
    )).toMatchObject({ terminalTick: startTick + 100, terminalCause: "execution" });

    advanceSimulationOneTick(simulation);
    expect(getIndividualExecutionHistoryInspection(
      combat.individualExecutionActionStore, 1,
    )).toEqual({
      startedCount: 1,
      interruptedCount: 0,
      completedCount: 1,
      terminalizedAsTargetCount: 0,
    });
    expect(getIndividualExecutionHistoryInspection(
      combat.individualExecutionActionStore, 0,
    ).terminalizedAsTargetCount).toBe(1);
  });

  it("reserves but does not invent the explicit consenting-target hook", () => {
    const simulation = createExecutionSimulation("citizen");
    const combat = requireCombat(simulation);
    submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
      executorEntityId: 1,
      targetEntityId: 0,
      requestedTick: 0,
      targetBasis: "explicitConsent",
    });

    advanceSimulationOneTick(simulation);

    expect(combat.individualExecutionActionResult.rejectedIntentRecords[0])
      .toMatchObject({ reason: "consentingTargetHookUnavailable" });
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("active");
  });

  it("resolves execution completion before same-tick death-count expiry", () => {
    const simulation = createExecutionSimulation("citizen", 100);
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
      executorEntityId: 1, targetEntityId: 0, requestedTick: 0, targetBasis: "dying",
    });

    for (let count = 0; count <= 100; count += 1) advanceSimulationOneTick(simulation);

    expect(combat.individualTerminalTransitions).toEqual([
      expect.objectContaining({ entityId: 0, tick: 100, cause: "execution" }),
    ]);
    expect(getIndividualTerminalCause(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("execution");
    expect(getIndividualCasualtyHistoryInspection(
      combat.individualDeathCountStore, 0,
    ).terminalCause).toBe("execution");
  });

  it("removes a committed executor from ordinary participation while retaining defence hands", () => {
    const simulation = createStartedExecution();
    const combat = requireCombat(simulation);
    const participation = createIndividualOrdinaryParticipationSnapshot(
      simulation.world.entityCount,
    );

    projectIndividualExecutionOrdinaryParticipation(
      combat.individualExecutionActionStore,
      participation,
    );

    expect(isIndividualOrdinaryParticipationEligible(participation, 1)).toBe(false);
    expect(isIndividualOrdinaryParticipationEligible(participation, 0)).toBe(true);
    const defence = getIndividualExecutionDefenceHandAvailability(
      combat.individualExecutionActionStore,
    );
    expect(defence.getFreeHands(1)).toBe(2);

    advanceIndividualExecutionActionsOneTick(
      simulation.world,
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualDeathCountStore,
      combat.individualCombatActionStore,
      combat.individualCombatEligibilitySnapshot,
      [],
      [acceptedHit(2, 1, 1)],
      1,
      combat.individualExecutionActionStore,
      createIndividualExecutionActionBuffers(),
    );
    expect(defence.getFreeHands(1)).toBeUndefined();
  });

  it.each([
    ["executor attack", "executorAttack"],
    ["accepted hit on executor", "executorAcceptedHit"],
    ["accepted hit on target", "targetAcceptedHit"],
    ["range loss", "rangeLost"],
    ["forced separation", "forcedSeparation"],
    ["executor incapacity", "executorIncapacity"],
    ["invalid target", "targetInvalid"],
  ] as const)("interrupts on %s", (_label, expectedReason) => {
    const simulation = createStartedExecution();
    const combat = requireCombat(simulation);
    let attempts: IndividualMeleeAttackAttemptRecord[] = [];
    let decisions: IndividualLandedHitGateDecisionRecord[] = [];
    let forcedSeparatedEntityIds: number[] | undefined;
    if (expectedReason === "executorAttack") attempts = [attempt(1, 2)];
    if (expectedReason === "executorAcceptedHit") decisions = [acceptedHit(2, 1, 1)];
    if (expectedReason === "targetAcceptedHit") decisions = [acceptedHit(2, 0, 1)];
    if (expectedReason === "rangeLost") simulation.world.positionsX[1] = 200;
    if (expectedReason === "forcedSeparation") forcedSeparatedEntityIds = [1];
    if (expectedReason === "executorIncapacity") down(simulation, 1, 1);
    if (expectedReason === "targetInvalid") {
      transitionIndividualDyingToTerminal(
        combat.individualCasualtyLifecycleStore, 0, 1, "execution",
      );
    }

    const result = advanceIndividualExecutionActionsOneTick(
      simulation.world,
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualDeathCountStore,
      combat.individualCombatActionStore,
      combat.individualCombatEligibilitySnapshot,
      attempts,
      decisions,
      1,
      combat.individualExecutionActionStore,
      createIndividualExecutionActionBuffers(),
      forcedSeparatedEntityIds === undefined ? {} : { forcedSeparatedEntityIds },
    );

    expect(result.interruptedRecords[0]?.reason).toBe(
      expectedReason satisfies IndividualExecutionInterruptionReason,
    );
    expect(result.activeActionCount).toBe(0);
  });

  it("publishes a production execution interruption in the final tick summary", () => {
    const simulation = createStartedExecution();
    const combat = requireCombat(simulation);
    simulation.world.positionsX[1] = 200;

    advanceSimulationOneTick(simulation);

    expect(combat.individualExecutionActionResult.interruptedRecords[0]).toMatchObject({
      executorEntityId: 1,
      targetEntityId: 0,
      reason: "rangeLost",
      tick: 1,
    });
    expect(combat.individualCasualtyUnitSummaries[1]!.executionInterruptedCount).toBe(1);
    expect(combat.individualCasualtyUnitSummaries[0]!.dyingCharacterCount).toBe(1);
    expect(getConsolidatedCasualtyHistory(
      combat.individualCasualtyHistoryStore,
      combat.individualDeathCountStore,
      combat.individualTraumaticWoundStore,
      combat.individualExecutionActionStore,
      combat.individualPlayerPresenceStore,
      0,
    )).toMatchObject({
      executionTargetedCount: 1,
      executionTargetInterruptionCount: 1,
      terminalizedByExecutionCount: 0,
    });
  });

  it.each(["parried", "blocked"])("does not interrupt for a %s attack", () => {
    const simulation = createStartedExecution();
    const combat = requireCombat(simulation);
    const result = advanceIndividualExecutionActionsOneTick(
      simulation.world,
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualDeathCountStore,
      combat.individualCombatActionStore,
      combat.individualCombatEligibilitySnapshot,
      [],
      [],
      1,
      combat.individualExecutionActionStore,
      createIndividualExecutionActionBuffers(),
    );
    expect(result.interruptedRecords).toEqual([]);
    expect(getIndividualExecutionActionInspection(
      combat.individualExecutionActionStore, 1,
    )?.progressTicks).toBe(1);
  });

  it("classifies expiry and execution from explicit procedure profiles without moving presence", () => {
    const expiry = createPresenceClassificationSimulation();
    const expiryCombat = requireCombat(expiry);
    down(expiry, 0, 0);
    down(expiry, 1, 0);
    const originalPositions = Array.from(expiry.world.positionsX);
    for (let count = 0; count < 3; count += 1) advanceSimulationOneTick(expiry);
    expect(getIndividualPlayerPresenceState(
      expiryCombat.individualPlayerPresenceStore, 0,
    )).toBe("terminalAwaitingComfort");
    expect(getIndividualPlayerPresenceState(
      expiryCombat.individualPlayerPresenceStore, 1,
    )).toBe("respawnEgress");
    expect(expiryCombat.individualTerminalPresenceTransitions).toEqual([
      expect.objectContaining({ entityId: 0, procedureKind: "citizen", terminalCause: "deathCountExpired" }),
      expect.objectContaining({ entityId: 1, procedureKind: "barbarian", terminalCause: "deathCountExpired" }),
    ]);
    advanceSimulationOneTick(expiry);
    expect(Array.from(expiry.world.positionsX)).toEqual(originalPositions);

    const execution = createExecutionSimulation("barbarian");
    const executionCombat = requireCombat(execution);
    down(execution, 0, 0);
    submitIndividualExecutionIntent(executionCombat.individualExecutionActionStore, {
      executorEntityId: 1, targetEntityId: 0, requestedTick: 0, targetBasis: "dying",
    });
    for (let count = 0; count <= 100; count += 1) advanceSimulationOneTick(execution);
    expect(getIndividualPlayerPresenceState(
      executionCombat.individualPlayerPresenceStore, 0,
    )).toBe("respawnEgress");
    expect(executionCombat.individualTerminalPresenceTransitions[0]).toMatchObject({
      entityId: 0, procedureKind: "barbarian", terminalCause: "execution",
    });
  });

  it("replays explicit execution deterministically", () => {
    expect(runReplay()).toEqual(runReplay());
  });
});

function runReplay() {
  const simulation = createExecutionSimulation("citizen");
  const combat = requireCombat(simulation);
  down(simulation, 0, 0);
  submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
    executorEntityId: 1, targetEntityId: 0, requestedTick: 0, targetBasis: "dying",
  });
  for (let count = 0; count <= 100; count += 1) advanceSimulationOneTick(simulation);
  return {
    tick: simulation.tick,
    lifecycle: getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    ),
    presence: getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    ),
    history: getIndividualCasualtyHistoryInspection(combat.individualDeathCountStore, 0),
    execution: getIndividualExecutionHistoryInspection(
      combat.individualExecutionActionStore, 1,
    ),
  };
}

function createStartedExecution(): SimulationState {
  const simulation = createExecutionSimulation("citizen");
  const combat = requireCombat(simulation);
  down(simulation, 0, 0);
  submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
    executorEntityId: 1, targetEntityId: 0, requestedTick: 0, targetBasis: "dying",
  });
  advanceSimulationOneTick(simulation);
  expect(getIndividualExecutionActionInspection(
    combat.individualExecutionActionStore, 1,
  )).toMatchObject({ progressTicks: 0 });
  return simulation;
}

function createExecutionSimulation(
  targetProcedure: "citizen" | "barbarian",
  targetDeathCountTicks = 500,
): SimulationState {
  return createSimulation({
    seed: 0x6f_01,
    entityCount: 3,
    bounds: { width: 300, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, targetProcedure, targetDeathCountTicks),
        unit(2, 1, 104, "citizen", 500),
        unit(3, 2, 260, "citizen", 500),
      ],
    },
  });
}

function createPresenceClassificationSimulation(): SimulationState {
  return createSimulation({
    seed: 0x6f_02,
    entityCount: 3,
    bounds: { width: 300, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, "citizen", 2),
        unit(2, 1, 120, "barbarian", 2),
        unit(3, 2, 260, "citizen", 500),
      ],
    },
  });
}

function unit(
  unitId: number,
  factionId: number,
  x: number,
  procedureKind: "citizen" | "barbarian",
  durationTicks: number,
): CombatSandboxUnitScenario {
  return {
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x,
    anchorY: 60,
    headingX: 1,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold",
    role: "regular",
    memberMaxStep: 1,
    weaponCategory: "unarmed",
    weaponReachBand: "none",
    armourClass: "none",
    shieldClass: "none",
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: {
      procedureKind,
      deathCountPolicy: { kind: "fixedTicks", durationTicks },
    },
  };
}

function down(simulation: SimulationState, entityId: number, tick: number): void {
  const combat = requireCombat(simulation);
  const currentHits = getIndividualCurrentGlobalHits(
    combat.individualGlobalHitStore, entityId,
  );
  const result = applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: currentHits }, () => landedRecord(2, entityId)),
  );
  const transitions = applyIndividualZeroHitLifecycleTransitions(
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualCasualtyProcedureProfileStore,
    simulation.world,
    result.zeroHitEvents,
    tick,
  );
  initializeIndividualDeathCountsFromZeroHitTransitions(
    combat.individualDeathCountStore,
    combat.individualCasualtyLifecycleStore,
    combat.individualCasualtyProcedureProfileStore,
    combat.individualProfileStore,
    transitions.transitions,
  );
}

function attempt(
  attackerEntityId: number,
  targetEntityId: number,
): IndividualMeleeAttackAttemptRecord {
  return {
    attackerEntityId,
    targetEntityId,
    weaponCategory: "unarmed",
    commitmentDurationTicks: 1,
    recoveryDurationTicks: 1,
    distanceSquaredAtResolution: 1,
    threatDistance: 1,
    preferredMinimumDistance: 0,
    awkwardDistance: false,
    facingX: 1,
    facingY: 0,
    outcome: "attempted",
  };
}

function acceptedHit(
  attackerEntityId: number,
  targetEntityId: number,
  tick: number,
): IndividualLandedHitGateDecisionRecord {
  return {
    attackerEntityId,
    targetEntityId,
    currentTick: tick,
    outcome: "accepted",
    reason: "accepted",
    previousNextAllowedTick: null,
    resultingNextAllowedTick: tick + 20,
    cooldownTicksRemaining: 20,
  };
}

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId,
    defenderEntityId,
    attackerWeaponCategory: "oneHanded",
    defenderActiveWeaponCategory: "unarmed",
    defenderShieldCategory: "none",
    defenderShieldCarriedState: "none",
    defenderActionState: "ready",
    guardStateBeforeResolution: "ready",
    defenderFacingX: -1,
    defenderFacingY: 0,
    incomingDirectionName: "west",
    incomingDirectionOctantIndex: 4,
    availableDefenceType: "none",
    outcome: "landed",
    landedReason: "noActiveDefence",
    defenceRecoveryTicksAssigned: 0,
    awkwardDistance: false,
  };
}

function requireCombat(
  simulation: SimulationState,
): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
