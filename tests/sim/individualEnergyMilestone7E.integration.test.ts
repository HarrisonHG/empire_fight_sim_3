import { describe, expect, it } from "vitest";

import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import { getActiveCasualtyDragGroups } from "../../src/sim/individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
} from "../../src/sim/individualCasualtyLifecycle";
import { getIndividualCombatPressureInspection } from "../../src/sim/combatPressure";
import {
  getIndividualEnergyHistoryInspection,
  getIndividualEnergyInspection,
} from "../../src/sim/individualEnergy";
import {
  getIndividualEnergyActivityContext,
  getIndividualEnergyActivityInspection,
  getIndividualEnergyExpenditureInspection,
} from "../../src/sim/individualEnergyActivity";
import {
  getIndividualBurdenExertionMultiplierPercent,
  getIndividualEnergyExertionModifierInspection,
  getIndividualInjuryExertionMultiplierPercent,
} from "../../src/sim/individualEnergyExertionModifier";
import { getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import {
  advanceSimulationOneTick,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";

const INTEGRATION_TICKS = 210;
const CHECKPOINT_TICKS = new Set([0, 3, 40, 60, 80, 100, 120, 180, 209]);
const EVIDENCE_ENTITY_IDS = Object.freeze([4, 5, 6, 8, 9, 14, 16, 17, 19]);
const SNAPSHOT_ENTITY_IDS = Object.freeze([19]);

describe("Milestone 7E full production integration", () => {
  it("replays equipment, hit, drag, treatment, egress and waiting energy evidence exactly", () => {
    const first = runIntegratedReplay();
    expect(JSON.stringify(runIntegratedReplay())).toBe(JSON.stringify(first));

    expect(first.observedContexts).toEqual(expect.arrayContaining([
      "downedRest",
      "medicalApproach",
      "dragging",
      "beingDragged",
      "treating",
      "underTreatment",
      "executionCommitment",
      "respawnEgress",
      "waitingAtRespawn",
      "inactiveTerminal",
    ]));
    expect(first.observedBurdenMultipliers.length).toBeGreaterThan(1);
    expect(first.observedBurdenMultipliers.some((value) => value > 100)).toBe(true);
    expect(first.maximumObservedInjuryMultiplier).toBeGreaterThan(100);
    expect(first.maximumObservedInjuryMultiplier).toBeLessThanOrEqual(150);
    expect(first.maximumActiveDragGroupCount).toBeGreaterThan(0);
    expect(first.treatmentTransitionCount).toBeGreaterThan(0);
    expect(first.presenceTransitionCount).toBeGreaterThan(0);
    expect(first.attackRecordCount).toBeGreaterThan(0);
    expect(first.defenceRecordCount).toBeGreaterThan(0);
    expect(first.hitApplicationCount).toBeGreaterThan(0);
    expect(first.sawExternallyMovedPatientWithoutExpenditure).toBe(true);
    expect(first.sawAdjustedMovementExpenditure).toBe(true);
    expect(first.sawDragSurcharge).toBe(true);
    expect(first.sawRecoveryWithoutExpenditure).toBe(true);
    expect(first.checkpoints).toHaveLength(CHECKPOINT_TICKS.size);
    expect(first.checkpoints.every((checkpoint) =>
      checkpoint.inspectedIndividuals.length ===
        SNAPSHOT_ENTITY_IDS.length)).toBe(true);

    expect(first.finalState.energy.some((energy) =>
      energy.totalEnergySpent > 0)).toBe(true);
    expect(first.finalState.energy.some((energy) =>
      energy.totalEnergyRecovered > 0)).toBe(true);
    expect(first.finalState.history.some((history) =>
      history.minimumEnergyReached < history.startingEnergy)).toBe(true);
    expect(first.finalState.presence[19]).toBe("waitingAtRespawn");
    expect(first.finalState.lifecycle[19]).toBe("terminal");
  });
});

function runIntegratedReplay() {
  const simulation = createSimulation({
    ...CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
    combatSandbox: {
      ...CASUALTY_LIFECYCLE_VISUAL_SCENARIO.combatSandbox!,
      inspectedEntityIds: SNAPSHOT_ENTITY_IDS,
    },
  });
  const combat = simulation.combatSandbox!;
  const timeline = [];
  const checkpoints: Array<NonNullable<ReturnType<
    typeof createPositionSnapshot
  >["combatDebug"]>> = [];
  const observedContexts = new Set<string>();
  const observedBurdenMultipliers = new Set<number>();
  let maximumObservedInjuryMultiplier = 0;
  let maximumActiveDragGroupCount = 0;
  let treatmentTransitionCount = 0;
  let presenceTransitionCount = 0;
  let attackRecordCount = 0;
  let defenceRecordCount = 0;
  let hitApplicationCount = 0;
  let sawExternallyMovedPatientWithoutExpenditure = false;
  let sawAdjustedMovementExpenditure = false;
  let sawDragSurcharge = false;
  let sawRecoveryWithoutExpenditure = false;

  for (let index = 0; index < INTEGRATION_TICKS; index += 1) {
    advanceSimulationOneTick(simulation);
    const completedTick = simulation.tick - 1;
    const evidence = EVIDENCE_ENTITY_IDS.map((entityId) => {
      const activity = getIndividualEnergyActivityInspection(
        combat.individualEnergyActivityStore,
        entityId,
      );
      const expenditure = getIndividualEnergyExpenditureInspection(
        combat.individualEnergyActivityStore,
        entityId,
      );
      const modifier = getIndividualEnergyExertionModifierInspection(
        combat.individualEnergyExertionModifierStore,
        entityId,
      );
      expect(activity.observedTick).toBe(completedTick);
      expect(activity.classificationTick).toBe(completedTick);
      expect(activity.applicationTick).toBe(completedTick);
      expect(expenditure.applicationTick).toBe(completedTick);
      expect(expenditure.exertionModifierProjectionTickUsed).toBe(completedTick);
      expect(modifier.projectionTick).toBe(completedTick);
      expect(activity.energyAfter).toBe(
        activity.energyBefore - activity.expenditureApplied +
          activity.recoveryApplied,
      );
      expect(activity.energyAfter).toBeGreaterThanOrEqual(0);
      expect(activity.energyAfter).toBeLessThanOrEqual(10_000);
      expect(expenditure.totalExpenditureRequested).toBe(
        expenditure.movementAdjustedExpenditure +
          expenditure.attackAdjustedExpenditure +
          expenditure.defenceAdjustedExpenditure,
      );
      return { entityId, activity, expenditure, modifier };
    });

    const contexts = Array.from(
      { length: simulation.world.entityCount },
      (_, entityId) => getIndividualEnergyActivityContext(
        combat.individualEnergyActivityStore,
        entityId,
      ),
    );
    for (let entityId = 0; entityId < contexts.length; entityId += 1) {
      observedContexts.add(contexts[entityId]!);
      observedBurdenMultipliers.add(getIndividualBurdenExertionMultiplierPercent(
        combat.individualEnergyExertionModifierStore,
        entityId,
      ));
      maximumObservedInjuryMultiplier = Math.max(
        maximumObservedInjuryMultiplier,
        getIndividualInjuryExertionMultiplierPercent(
          combat.individualEnergyExertionModifierStore,
          entityId,
        ),
      );
    }
    for (const { activity, expenditure } of evidence) {
      if (activity.externallyMoved && activity.totalExpenditureRequested === 0) {
        sawExternallyMovedPatientWithoutExpenditure = true;
      }
      if (expenditure.movementAdjustedExpenditure >
          expenditure.movementBaseExpenditure) {
        sawAdjustedMovementExpenditure = true;
      }
      if (expenditure.dragSurcharge > 0) sawDragSurcharge = true;
      if (activity.recoveryApplied > 0 && activity.expenditureApplied === 0) {
        sawRecoveryWithoutExpenditure = true;
      }
    }

    const activeDragGroups = getActiveCasualtyDragGroups(
      combat.casualtyDragGroupStore,
    );
    maximumActiveDragGroupCount = Math.max(
      maximumActiveDragGroupCount,
      activeDragGroups.length,
    );
    treatmentTransitionCount +=
      combat.individualTreatmentActionResult.startedRecords.length +
      combat.individualTreatmentActionResult.interruptedRecords.length +
      combat.individualTreatmentActionResult.completedRecords.length;
    presenceTransitionCount +=
      combat.individualTerminalPresenceTransitions.length +
      combat.individualRespawnEgressResult.arrivalRecords.length;
    attackRecordCount += combat.individualCombatPipelineBuffers.attackAttempts.length;
    defenceRecordCount += combat.individualCombatPipelineBuffers.defenceRecords.length;
    hitApplicationCount += combat.individualCombatPipelineBuffers.hitApplications.length;

    timeline.push({
      tick: completedTick,
      positionsX: Array.from(simulation.world.positionsX),
      positionsY: Array.from(simulation.world.positionsY),
      contexts,
      dragGroups: activeDragGroups.map((group) => ({
        ...group,
        helperEntityIds: [...group.helperEntityIds],
      })),
      treatments: {
        started: [...combat.individualTreatmentActionResult.startedRecords],
        interrupted: [...combat.individualTreatmentActionResult.interruptedRecords],
        completed: [...combat.individualTreatmentActionResult.completedRecords],
      },
      presenceTransitions: [
        ...combat.individualTerminalPresenceTransitions,
        ...combat.individualRespawnEgressResult.arrivalRecords,
      ],
      combat: {
        attacks: [...combat.individualCombatPipelineBuffers.attackAttempts],
        defences: [...combat.individualCombatPipelineBuffers.defenceRecords],
        hits: [...combat.individualCombatPipelineBuffers.hitApplications],
      },
      pressure: EVIDENCE_ENTITY_IDS.map((entityId) =>
        getIndividualCombatPressureInspection(
          combat.formationStore,
          combat.pressureStore,
          entityId,
        )),
      moraleMovementStates: [...combat.moraleMovementStates.entries()]
        .sort((left, right) => left[0] - right[0]),
      moraleEvents: [...combat.moraleEvents],
      evidence,
    });

    if (CHECKPOINT_TICKS.has(completedTick)) {
      checkpoints.push(createPositionSnapshot(simulation).combatDebug!);
    }
  }

  const finalState = {
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
    hits: Array.from(
      { length: simulation.world.entityCount },
      (_, entityId) => getIndividualCurrentGlobalHits(
        combat.individualGlobalHitStore,
        entityId,
      ),
    ),
    lifecycle: Array.from(
      { length: simulation.world.entityCount },
      (_, entityId) => getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore,
        entityId,
      ),
    ),
    presence: Array.from(
      { length: simulation.world.entityCount },
      (_, entityId) => getIndividualPlayerPresenceState(
        combat.individualPlayerPresenceStore,
        entityId,
      ),
    ),
    energy: Array.from(
      { length: simulation.world.entityCount },
      (_, entityId) => getIndividualEnergyInspection(
        simulation.trustedIndividualEnergyProfileStore,
        simulation.individualEnergyStore,
        entityId,
      ),
    ),
    history: Array.from(
      { length: simulation.world.entityCount },
      (_, entityId) => getIndividualEnergyHistoryInspection(
        simulation.individualEnergyStore,
        entityId,
      ),
    ),
    casualtySummaries: combat.individualCasualtyUnitSummaries.map(
      (summary) => ({ ...summary }),
    ),
  };

  return {
    timeline,
    checkpoints,
    observedContexts: [...observedContexts].sort(),
    observedBurdenMultipliers: [...observedBurdenMultipliers].sort(
      (left, right) => left - right,
    ),
    maximumObservedInjuryMultiplier,
    maximumActiveDragGroupCount,
    treatmentTransitionCount,
    presenceTransitionCount,
    attackRecordCount,
    defenceRecordCount,
    hitApplicationCount,
    sawExternallyMovedPatientWithoutExpenditure,
    sawAdjustedMovementExpenditure,
    sawDragSurcharge,
    sawRecoveryWithoutExpenditure,
    finalState,
  };
}
