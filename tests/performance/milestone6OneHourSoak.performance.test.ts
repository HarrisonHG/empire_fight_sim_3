import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  getActiveCasualtyDragGroups,
  getIndividualCasualtyAssistanceInspection,
} from "../../src/sim/individualCasualtyAssistance";
import { getIndividualCasualtyHistoryInspection } from "../../src/sim/individualCasualtyConsolidation";
import {
  getIndividualDeathCountInspection,
  initializeIndividualDeathCountsFromZeroHitTransitions,
} from "../../src/sim/individualDeathCount";
import {
  getActiveIndividualExecutionActionCount,
  getIndividualExecutionHistoryInspection,
  submitIndividualExecutionIntent,
} from "../../src/sim/individualExecutionAction";
import {
  applyIndividualLandedHits,
  getIndividualCurrentGlobalHits,
} from "../../src/sim/individualGlobalHits";
import {
  applyTrustedIndividualLimbDisability,
  getIndividualLimbDisabilityInspection,
} from "../../src/sim/individualLimbDisability";
import {
  getIndividualGenericHerbInspection,
} from "../../src/sim/individualMedicalProfile";
import { getIndividualMedicalClaimInspection } from "../../src/sim/individualMedicalClaims";
import {
  calculateTraumaticWoundOpportunityRoll,
  getIndividualTraumaticWoundInspection,
  resolveIndividualTraumaticWoundOpportunities,
  type IndividualTraumaticWoundOpportunity,
} from "../../src/sim/individualTraumaticWound";
import {
  getActiveIndividualTreatmentActionCount,
} from "../../src/sim/individualTreatmentAction";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationState,
} from "../../src/sim/types";

const ONE_HOUR_TICKS = 72_000;
const TRAUMA_TARGET = 4;
const TRAUMA_HEALER = 5;

describe("Milestone 6I-2 deterministic one-hour production soak", () => {
  it("runs the same 72,000 scheduled production ticks twice with bounded reusable output", () => {
    const startedAt = performance.now();
    const first = runSoak();
    const second = runSoak();
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(second).toEqual(first);
    expect(first.finalTick).toBe(ONE_HOUR_TICKS);
    expect(first.scheduled.laterDyingEpisodeInitialRemainingTicks).toBe(3_600);
    expect(first.scheduled.sawDyingPause).toBe(true);
    expect(first.scheduled.sawReleasedHerbReservation).toBe(true);
    expect(first.scheduled.sawConsumedHerb).toBe(true);
    expect(first.events.treatmentCompletions).toBeGreaterThanOrEqual(5);
    expect(first.events.treatmentInterruptions).toBeGreaterThanOrEqual(1);
    expect(first.events.executionCompletions).toBe(1);
    expect(first.events.egressArrivals).toBe(1);
    expect(first.final.activeTreatmentActions).toBe(0);
    expect(first.final.activeExecutionActions).toBe(0);
    expect(first.final.activeDragGroups).toBe(0);
    expect(first.final.reservedHerbs).toBe(0);
    expect(first.final.activeClaims).toBe(0);
    expect(first.final.activeDeathCountPauses).toBe(0);
    expect(first.final.barbarianPresence).toBe("waitingAtRespawn");
    expect(first.final.fortitudeCitizenPresence).toBe("terminalComforted");
    expect(first.final.revivalDyingEpisodes).toBe(2);
    expect(first.final.historyEntityCount).toBe(10);
    expect(first.final.historyInspectionFieldCount).toBeLessThan(64);
    expect(first.outputReuse.allStable).toBe(true);
    expect(first.outputReuse.maximumReusableRecordLength).toBeLessThanOrEqual(10);

    process.stdout.write(
      `\nMilestone 6 deterministic one-hour soak\n${JSON.stringify({
        ticksPerRun: ONE_HOUR_TICKS,
        runCount: 2,
        entityCount: 10,
        elapsedMilliseconds,
        authoritativeDigest: first,
        retentionPolicy: "Selected final authority digest and compact event totals only; no per-tick snapshots or append-only event log.",
      }, null, 2)}\n`,
    );
  }, 120_000);
});

function runSoak() {
  const simulation = createSoakSimulation();
  const combat = requireCombat(simulation);
  downEntity(simulation, 0, 0);
  downEntity(simulation, 2, 0);
  downEntity(simulation, 6, 0);
  downEntity(simulation, 8, 0);
  downEntity(simulation, 9, 0);
  applyOneHitLoss(combat, 4, 7);
  submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
    executorEntityId: 7,
    targetEntityId: 6,
    requestedTick: 0,
    targetBasis: "dying",
  });
  const traumaOpportunity = findSuccessfulTraumaOpportunity(
    combat.battleSeed,
    TRAUMA_TARGET,
    7,
    2_000,
  );
  const outputRefs = captureReusableOutputs(combat);
  const events = {
    dragStarts: 0,
    treatmentStarts: 0,
    treatmentCompletions: 0,
    treatmentInterruptions: 0,
    executionCompletions: 0,
    comfortCompletions: 0,
    egressArrivals: 0,
  };
  const scheduled = {
    sawDyingPause: false,
    sawReleasedHerbReservation: false,
    sawConsumedHerb: false,
    laterDyingEpisodeInitialRemainingTicks: -1,
  };
  let maximumReusableRecordLength = 0;

  for (let tick = 0; tick < ONE_HOUR_TICKS; tick += 1) {
    if (tick >= 20 && tick < 30) {
      simulation.world.positionsX[TRAUMA_HEALER] =
        simulation.world.positionsX[TRAUMA_TARGET]! + 100;
    } else if (tick === 30) {
      simulation.world.positionsX[TRAUMA_HEALER] =
        simulation.world.positionsX[TRAUMA_TARGET]! + 4;
    }
    if (tick === 21_610) {
      simulation.world.positionsX[3] = simulation.world.positionsX[2]! + 4;
      simulation.world.positionsY[3] = simulation.world.positionsY[2]!;
    }
    if (tick === 1_000) {
      downEntity(simulation, 0, tick);
      scheduled.laterDyingEpisodeInitialRemainingTicks =
        getIndividualDeathCountInspection(combat.individualDeathCountStore, 0)
          .remainingTicks;
    }
    if (tick === traumaOpportunity.tick) {
      resolveIndividualTraumaticWoundOpportunities(
        combat.battleSeed,
        combat.individualCasualtyProcedureProfileStore,
        combat.individualTraumaticWoundStore,
        [traumaOpportunity],
        combat.individualTraumaticWoundRecords,
      );
    }
    if (tick === 3_000) {
      applyTrustedIndividualLimbDisability(
        combat.individualLimbDisabilityStore,
        TRAUMA_TARGET,
        "disabledArm",
      );
    }

    advanceSimulationOneTick(simulation);

    const dyingDeathCount = getIndividualDeathCountInspection(
      combat.individualDeathCountStore,
      0,
    );
    scheduled.sawDyingPause ||= dyingDeathCount.paused;
    const herbs = getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore,
      TRAUMA_HEALER,
    );
    scheduled.sawReleasedHerbReservation ||= tick >= 20 && tick < 30 &&
      herbs.current === 3 && herbs.reserved === 0;
    scheduled.sawConsumedHerb ||= herbs.current < 3;
    events.dragStarts += combat.casualtyDragMovementResult.draggingStartedRecords.length;
    events.treatmentStarts += combat.individualTreatmentActionResult.startedRecords.length;
    events.treatmentCompletions += combat.individualTreatmentActionResult.completedRecords.length;
    events.treatmentInterruptions += combat.individualTreatmentActionResult.interruptedRecords.length;
    events.executionCompletions += combat.individualExecutionActionResult.completedRecords.length;
    events.comfortCompletions += combat.individualTreatmentActionResult.completedRecords.filter(
      (record) => record.kind === "physickTerminalComfort",
    ).length;
    events.egressArrivals += combat.individualRespawnEgressResult.arrivalRecords.length;
    maximumReusableRecordLength = Math.max(
      maximumReusableRecordLength,
      reusableRecordArrays(combat).reduce(
        (maximum, records) => Math.max(maximum, records.length),
        0,
      ),
    );
  }

  const histories = Array.from({ length: simulation.world.entityCount }, (_, entityId) =>
    getIndividualCasualtyHistoryInspection(
      combat.individualCasualtyHistoryStore,
      combat.individualDeathCountStore,
      combat.individualTraumaticWoundStore,
      combat.individualExecutionActionStore,
      combat.individualPlayerPresenceStore,
      entityId,
    ));
  const activeClaims = Array.from({ length: simulation.world.entityCount }, (_, entityId) =>
    getIndividualMedicalClaimInspection(combat.individualMedicalClaimStore, entityId))
    .filter((claim) => claim.patientEntityId >= 0).length;
  const activeDeathCountPauses = Array.from(
    { length: simulation.world.entityCount },
    (_, entityId) => getIndividualDeathCountInspection(
      combat.individualDeathCountStore,
      entityId,
    ),
  ).filter((deathCount) => deathCount.paused).length;

  return {
    finalTick: simulation.tick,
    scheduled,
    events,
    outputReuse: {
      allStable: outputRefs.every(([getCurrent, initial]) => getCurrent() === initial),
      maximumReusableRecordLength,
    },
    final: {
      lifecycle: Array.from({ length: 10 }, (_, entityId) =>
        getIndividualCharacterLifecycleState(combat.individualCasualtyLifecycleStore, entityId)),
      presence: Array.from({ length: 10 }, (_, entityId) =>
        getIndividualPlayerPresenceState(combat.individualPlayerPresenceStore, entityId)),
      hits: Array.from({ length: 10 }, (_, entityId) =>
        getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId)),
      histories,
      treatmentHistory: getIndividualCasualtyHistoryInspection(
        combat.individualCasualtyHistoryStore,
        combat.individualDeathCountStore,
        combat.individualTraumaticWoundStore,
        combat.individualExecutionActionStore,
        combat.individualPlayerPresenceStore,
        TRAUMA_TARGET,
      ),
      executionHistory: getIndividualExecutionHistoryInspection(
        combat.individualExecutionActionStore,
        7,
      ),
      trauma: getIndividualTraumaticWoundInspection(
        combat.individualTraumaticWoundStore,
        TRAUMA_TARGET,
      ),
      limb: getIndividualLimbDisabilityInspection(
        combat.individualLimbDisabilityStore,
        TRAUMA_TARGET,
      ),
      summaries: combat.individualCasualtyUnitSummaries.map((summary) => ({ ...summary })),
      activeTreatmentActions: getActiveIndividualTreatmentActionCount(
        combat.individualTreatmentActionStore,
      ),
      activeExecutionActions: getActiveIndividualExecutionActionCount(
        combat.individualExecutionActionStore,
      ),
      activeDragGroups: getActiveCasualtyDragGroups(combat.casualtyDragGroupStore).length,
      activeClaims,
      activeDeathCountPauses,
      reservedHerbs: getIndividualGenericHerbInspection(
        combat.individualGenericHerbStore,
        TRAUMA_HEALER,
      ).reserved,
      barbarianPresence: getIndividualPlayerPresenceState(
        combat.individualPlayerPresenceStore,
        8,
      ),
      fortitudeCitizenPresence: getIndividualPlayerPresenceState(
        combat.individualPlayerPresenceStore,
        2,
      ),
      revivalDyingEpisodes: histories[0]!.dyingTransitionCount,
      historyEntityCount: combat.individualCasualtyHistoryStore.entityCount,
      historyInspectionFieldCount: Object.keys(histories[0]!).length,
      assistanceOwnership: Array.from({ length: 10 }, (_, entityId) =>
        getIndividualCasualtyAssistanceInspection(
          combat.individualCasualtyAssistanceStore,
          entityId,
        ).dragGroupId),
    },
  };
}

function createSoakSimulation(): SimulationState {
  const units: CombatSandboxUnitScenario[] = [
    soakUnit(1, 1, 100, "citizen", { hasChirurgeon: false, hasPhysick: false }),
    soakUnit(2, 1, 104, "citizen", { hasChirurgeon: true, hasPhysick: true }),
    soakUnit(3, 1, 400, "citizen", { hasChirurgeon: false, hasPhysick: false }, 5),
    soakUnit(4, 1, 2_500, "citizen", { hasChirurgeon: true, hasPhysick: true }),
    soakUnit(5, 1, 800, "citizen", { hasChirurgeon: false, hasPhysick: false }, 0, "heavy"),
    soakUnit(6, 1, 804, "citizen", { hasChirurgeon: true, hasPhysick: true }, 0, "none", 3),
    soakUnit(7, 1, 1_200, "citizen", { hasChirurgeon: false, hasPhysick: false }),
    soakUnit(8, 2, 1_204, "citizen", { hasChirurgeon: false, hasPhysick: false }),
    soakUnit(9, 1, 1_600, "barbarian", { hasChirurgeon: false, hasPhysick: false }),
    soakUnit(10, 1, 2_000, "citizen", { hasChirurgeon: false, hasPhysick: false }),
  ];
  return createSimulation({
    seed: 0x6_12_00,
    entityCount: units.length,
    bounds: { width: 2_700, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: { kind: "liveCombatSandbox", appliedDamagePressureScale: 1, units },
  });
}

function soakUnit(
  unitId: number,
  factionId: number,
  x: number,
  procedureKind: "citizen" | "barbarian",
  medicalProfile: { readonly hasChirurgeon: boolean; readonly hasPhysick: boolean },
  fortitudeLevels = 0,
  armourClass: "none" | "heavy" = "none",
  startingGenericHerbs = 0,
): CombatSandboxUnitScenario {
  return {
    unitId, factionId, memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x, anchorY: 60, headingX: 1, headingY: 0,
    spacing: 4, rows: 1, cols: 1, unitSpeed: 0, order: "hold",
    role: "regular", fortitudeLevels, memberMaxStep: 1,
    weaponCategory: "unarmed", weaponReachBand: "none", armourClass,
    shieldClass: "none", attackIntervalTicks: 20, maxDamageCapacity: 1_000_000,
    casualtyProcedure: procedureKind === "barbarian"
      ? {
          procedureKind,
          deathCountPolicy: { kind: "fixedTicks", durationTicks: 50 },
          respawnDestination: { x: 1_650, y: 60 },
        }
      : { procedureKind, deathCountPolicy: { kind: "normalFortitude" } },
    ...(medicalProfile.hasChirurgeon || medicalProfile.hasPhysick
      ? { medicalProfile: { ...medicalProfile, startingGenericHerbs } }
      : {}),
  };
}

function captureReusableOutputs(
  combat: CombatSandboxSimulationState,
): readonly (readonly [() => object, object])[] {
  return [
    [() => combat.individualLifecycleTransitions, combat.individualLifecycleTransitions],
    [() => combat.casualtyDragMovementBuffers.draggingStartedRecords, combat.casualtyDragMovementBuffers.draggingStartedRecords],
    [() => combat.casualtyDragMovementBuffers.cancellationRecords, combat.casualtyDragMovementBuffers.cancellationRecords],
    [() => combat.individualMedicalClaimBuffers.claimRecords, combat.individualMedicalClaimBuffers.claimRecords],
    [() => combat.individualTreatmentActionBuffers.completedRecords, combat.individualTreatmentActionBuffers.completedRecords],
    [() => combat.individualExecutionActionBuffers.completedRecords, combat.individualExecutionActionBuffers.completedRecords],
    [() => combat.individualRespawnEgressBuffers.movementRecords, combat.individualRespawnEgressBuffers.movementRecords],
    [() => combat.individualCasualtyUnitSummaries, combat.individualCasualtyUnitSummaries],
    [() => combat.inspectedIndividuals, combat.inspectedIndividuals],
  ];
}

function reusableRecordArrays(combat: CombatSandboxSimulationState): readonly (readonly unknown[])[] {
  return [
    combat.individualLifecycleTransitions,
    combat.casualtyDragMovementBuffers.draggingStartedRecords,
    combat.casualtyDragMovementBuffers.cancellationRecords,
    combat.individualMedicalClaimBuffers.claimRecords,
    combat.individualMedicalClaimBuffers.handoffRecords,
    combat.individualTreatmentActionBuffers.startedRecords,
    combat.individualTreatmentActionBuffers.completedRecords,
    combat.individualTreatmentActionBuffers.interruptedRecords,
    combat.individualExecutionActionBuffers.startedRecords,
    combat.individualExecutionActionBuffers.completedRecords,
    combat.individualExecutionActionBuffers.interruptedRecords,
    combat.individualRespawnEgressBuffers.movementRecords,
    combat.individualRespawnEgressBuffers.arrivalRecords,
  ];
}

function downEntity(simulation: SimulationState, entityId: number, tick: number): void {
  const combat = requireCombat(simulation);
  const currentHits = getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId);
  const hits = applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: currentHits }, () => landedRecord(7, entityId)),
  );
  const lifecycle = applyIndividualZeroHitLifecycleTransitions(
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualCasualtyProcedureProfileStore,
    simulation.world,
    hits.zeroHitEvents,
    tick,
  );
  initializeIndividualDeathCountsFromZeroHitTransitions(
    combat.individualDeathCountStore,
    combat.individualCasualtyLifecycleStore,
    combat.individualCasualtyProcedureProfileStore,
    combat.individualProfileStore,
    lifecycle.transitions,
  );
}

function applyOneHitLoss(
  combat: CombatSandboxSimulationState,
  entityId: number,
  attackerEntityId: number,
): void {
  applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    [landedRecord(attackerEntityId, entityId)],
  );
  if (getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId) <= 0) {
    throw new Error("Soak missing-hit patient requires more than one maximum hit.");
  }
}

function findSuccessfulTraumaOpportunity(
  battleSeed: number,
  targetEntityId: number,
  attackerEntityId: number,
  startTick: number,
): IndividualTraumaticWoundOpportunity {
  for (let tick = startTick; tick < startTick + 10_000; tick += 1) {
    const opportunity = { targetEntityId, attackerEntityId, tick, triggerKind: "limbCleave" as const };
    if (calculateTraumaticWoundOpportunityRoll(battleSeed, opportunity) < 100) return opportunity;
  }
  throw new Error("Expected a deterministic trauma opportunity.");
}

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId, defenderEntityId, attackerWeaponCategory: "unarmed",
    defenderActiveWeaponCategory: "unarmed", defenderShieldCategory: "none",
    defenderShieldCarriedState: "none", defenderActionState: "ready",
    guardStateBeforeResolution: "ready", defenderFacingX: -1, defenderFacingY: 0,
    incomingDirectionName: "west", incomingDirectionOctantIndex: 4,
    availableDefenceType: "none", outcome: "landed", landedReason: "noActiveDefence",
    defenceRecoveryTicksAssigned: 0, awkwardDistance: false,
  };
}

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
