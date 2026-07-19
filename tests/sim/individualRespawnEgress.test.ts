import { describe, expect, it } from "vitest";

import {
  applyIndividualTerminalPresenceTransitions,
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  getIndividualRespawnEgressInspection,
  getIndividualTerminalCause,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  getIndividualCurrentGlobalHits,
  applyIndividualLandedHits,
} from "../../src/sim/individualGlobalHits";
import { initializeIndividualDeathCountsFromZeroHitTransitions, recordIndividualExecutionTerminal } from "../../src/sim/individualDeathCount";
import { getIndividualCasualtyHistoryInspection as getConsolidatedCasualtyHistory } from "../../src/sim/individualCasualtyConsolidation";
import {
  INDIVIDUAL_RESPAWN_EGRESS_MAXIMUM_STEP,
} from "../../src/sim/individualRespawnEgress";
import { submitIndividualExecutionIntent } from "../../src/sim/individualExecutionAction";
import { hasIndividualMedicalPatientClaim } from "../../src/sim/individualMedicalClaims";
import { advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";

describe("Milestone 6H-2B respawn egress", () => {
  it("starts after classification, moves by its own bounded constant and arrives exactly once", () => {
    const simulation = createSimulation(scenario(20, { x: 0, y: 60 }, [0]));
    const combat = requireCombat(simulation);
    terminalize(simulation, 0, 0);
    const startX = simulation.world.positionsX[0]!;

    advanceSimulationOneTick(simulation);
    expect(simulation.world.positionsX[0]).toBe(startX);
    expect(combat.individualRespawnEgressResult.movementRecords).toEqual([]);
    expect(getIndividualRespawnEgressInspection(
      combat.individualPlayerPresenceStore, 0,
    )).toMatchObject({
      destinationState: "configured",
      destinationX: 0,
      destinationY: 60,
      egressState: "moving",
      egressStartedTick: 0,
    });

    advanceSimulationOneTick(simulation);
    expect(startX - simulation.world.positionsX[0]!).toBeGreaterThan(0);
    expect(startX - simulation.world.positionsX[0]!).toBeLessThanOrEqual(
      INDIVIDUAL_RESPAWN_EGRESS_MAXIMUM_STEP,
    );
    expect(combat.individualRespawnEgressResult.movementRecords).toHaveLength(1);

    const arrivalRecords = [];
    for (let tick = 0; tick < 20; tick += 1) {
      arrivalRecords.push(...combat.individualRespawnEgressResult.arrivalRecords);
      if (getIndividualPlayerPresenceState(
        combat.individualPlayerPresenceStore, 0,
      ) === "waitingAtRespawn") break;
      advanceSimulationOneTick(simulation);
    }
    expect(getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    )).toBe("waitingAtRespawn");
    expect(arrivalRecords).toHaveLength(1);
    expect(arrivalRecords[0]).toMatchObject({
      entityId: 0, arrivalX: 0, arrivalY: 60,
      previousPresenceState: "respawnEgress",
      presenceState: "waitingAtRespawn",
    });
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("terminal");
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0)).toBe(0);
    expect(getIndividualTerminalCause(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("execution");
    expect(getConsolidatedCasualtyHistory(
      combat.individualCasualtyHistoryStore,
      combat.individualDeathCountStore,
      combat.individualTraumaticWoundStore,
      combat.individualExecutionActionStore,
      combat.individualPlayerPresenceStore,
      0,
    )).toMatchObject({
      terminalTick: 0,
      terminalCause: "execution",
      respawnEgressStartedTick: 0,
      waitingAtRespawnArrivalTick: arrivalRecords[0]!.tick,
      waitingAtRespawnArrivalX: 0,
      waitingAtRespawnArrivalY: 60,
    });
    expect(combat.individualCasualtyUnitSummaries[0]).toMatchObject({
      terminalCharacterCount: 1,
      waitingAtRespawnCount: 1,
      respawnEgressCount: 0,
    });

    const arrivalX = simulation.world.positionsX[0]!;
    const arrivalY = simulation.world.positionsY[0]!;
    advanceSimulationOneTick(simulation);
    expect(combat.individualRespawnEgressResult.arrivalRecords).toEqual([]);
    expect(simulation.world.positionsX[0]).toBe(arrivalX);
    expect(simulation.world.positionsY[0]).toBe(arrivalY);
  });

  it("keeps a missing destination stationary and emits no guessed movement or transition", () => {
    const simulation = createSimulation(scenario(20, undefined, [0]));
    const combat = requireCombat(simulation);
    terminalize(simulation, 0, 0);
    const x = simulation.world.positionsX[0]!;
    const y = simulation.world.positionsY[0]!;
    for (let tick = 0; tick < 5; tick += 1) advanceSimulationOneTick(simulation);
    expect(simulation.world.positionsX[0]).toBe(x);
    expect(simulation.world.positionsY[0]).toBe(y);
    expect(getIndividualRespawnEgressInspection(
      combat.individualPlayerPresenceStore, 0,
    )).toMatchObject({
      destinationState: "missing",
      destinationX: -1,
      destinationY: -1,
      egressState: "missingDestination",
      movementRecordCount: 0,
    });
    expect(combat.individualRespawnEgressResult.movementRecords).toEqual([]);
    expect(combat.individualRespawnEgressResult.arrivalRecords).toEqual([]);
  });

  it("rejects citizen destinations and out-of-bounds destinations", () => {
    const base = scenario(20, { x: 0, y: 0 });
    const citizen: SimulationScenario = {
      ...base,
      combatSandbox: {
        ...base.combatSandbox!,
        units: [{
          ...base.combatSandbox!.units[0]!,
          casualtyProcedure: {
            procedureKind: "citizen",
            deathCountPolicy: { kind: "fixedTicks", durationTicks: 50 },
            respawnDestination: { x: 0, y: 0 },
          },
        }, base.combatSandbox!.units[1]!],
      },
    };
    expect(() => createSimulation(citizen)).toThrow(/citizen.*respawn destination/i);
    expect(() => createSimulation(scenario(20, { x: 300, y: 60 })))
      .toThrow(/inside world bounds/i);
  });

  it("keeps egress and waiting presences outside later rescue, medical and execution ownership", () => {
    const simulation = createSimulation(scenario(4, { x: 0, y: 60 }));
    const combat = requireCombat(simulation);
    terminalize(simulation, 0, 0);
    advanceSimulationOneTick(simulation);
    submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
      executorEntityId: 1, targetEntityId: 0, requestedTick: simulation.tick,
    });
    for (let tick = 0; tick < 5; tick += 1) advanceSimulationOneTick(simulation);
    expect(getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    )).toBe("waitingAtRespawn");
    expect(combat.individualExecutionActionResult.activeActionCount).toBe(0);
    expect(hasIndividualMedicalPatientClaim(combat.individualMedicalClaimStore, 0)).toBe(false);
    expect(combat.casualtyAssistanceDecisionResult.groupStartedRecords).toEqual([]);
    expect(combat.individualTreatmentActionResult.activeActionCount).toBe(0);
  });

  it("replays identically when scenario construction order is reversed", () => {
    const run = (reverse: boolean) => {
      const units = [
        unit(10, 1, 20, "barbarian", { x: 0, y: 60 }),
        unit(20, 2, 260, "citizen"),
      ];
      if (reverse) units.reverse();
      const simulation = createSimulation({
        ...scenario(20, { x: 0, y: 60 }),
        combatSandbox: {
          ...scenario(20, { x: 0, y: 60 }).combatSandbox!, units,
        },
      });
      const combat = requireCombat(simulation);
      const barbarianEntityId = reverse ? 1 : 0;
      terminalize(simulation, barbarianEntityId, 0);
      for (let tick = 0; tick < 8; tick += 1) advanceSimulationOneTick(simulation);
      return {
        position: [simulation.world.positionsX[barbarianEntityId], simulation.world.positionsY[barbarianEntityId]],
        presence: getIndividualPlayerPresenceState(
          combat.individualPlayerPresenceStore, barbarianEntityId,
        ),
        inspection: getIndividualRespawnEgressInspection(
          combat.individualPlayerPresenceStore, barbarianEntityId,
        ),
      };
    };
    expect(run(true)).toEqual(run(false));
  });
});

function scenario(
  barbarianX: number,
  destination?: { readonly x: number; readonly y: number },
  inspectedEntityIds?: readonly number[],
): SimulationScenario {
  return {
    seed: 0x6_82b,
    entityCount: 2,
    bounds: { width: 300, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      ...(inspectedEntityIds === undefined ? {} : { inspectedEntityIds }),
      units: [
        unit(1, 1, barbarianX, "barbarian", destination),
        unit(2, 2, 260, "citizen"),
      ],
    },
  };
}

function unit(
  unitId: number,
  factionId: number,
  x: number,
  procedureKind: "citizen" | "barbarian",
  respawnDestination?: { readonly x: number; readonly y: number },
): CombatSandboxUnitScenario {
  return {
    unitId, factionId, memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x, anchorY: 60, headingX: 1, headingY: 0,
    spacing: 4, rows: 1, cols: 1, unitSpeed: 0, order: "hold",
    role: "regular", memberMaxStep: 1, weaponCategory: "unarmed",
    weaponReachBand: "none", armourClass: "none", shieldClass: "none",
    attackIntervalTicks: 20, maxDamageCapacity: 1_000_000,
    casualtyProcedure: {
      procedureKind,
      deathCountPolicy: { kind: "fixedTicks", durationTicks: 50 },
      ...(respawnDestination === undefined ? {} : { respawnDestination }),
    },
  };
}

function terminalize(simulation: SimulationState, entityId: number, tick: number): void {
  const combat = requireCombat(simulation);
  const currentHits = getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId);
  const result = applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: currentHits }, () => landedRecord(1, entityId)),
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
  transitionIndividualDyingToTerminal(
    combat.individualCasualtyLifecycleStore, entityId, tick, "execution",
  );
  recordIndividualExecutionTerminal(
    combat.individualDeathCountStore,
    entityId,
    tick,
    simulation.world.positionsX[entityId]!,
    simulation.world.positionsY[entityId]!,
  );
  const terminalTransition = {
    entityId, tick,
    previousLifecycleState: "dying" as const,
    lifecycleState: "terminal" as const,
    cause: "execution" as const,
    terminalX: simulation.world.positionsX[entityId]!,
    terminalY: simulation.world.positionsY[entityId]!,
  };
  combat.individualTerminalTransitions.length = 0;
  combat.individualTerminalTransitions.push(terminalTransition);
  applyIndividualTerminalPresenceTransitions(
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualCasualtyProcedureProfileStore,
    [terminalTransition],
    combat.individualTerminalPresenceTransitions,
  );
}

function landedRecord(attackerEntityId: number, defenderEntityId: number): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId, defenderEntityId,
    attackerWeaponCategory: "unarmed",
    defenderActiveWeaponCategory: "unarmed",
    defenderShieldCategory: "none",
    defenderShieldCarriedState: "none",
    defenderActionState: "ready",
    guardStateBeforeResolution: "ready",
    defenderFacingX: -1, defenderFacingY: 0,
    incomingDirectionName: "west", incomingDirectionOctantIndex: 4,
    availableDefenceType: "none", outcome: "landed",
    landedReason: "noActiveDefence", defenceRecoveryTicksAssigned: 0,
    awkwardDistance: false,
  };
}

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
