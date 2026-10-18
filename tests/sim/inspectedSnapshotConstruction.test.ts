import { beforeAll, describe, expect, it } from "vitest";

import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import { getActiveCasualtyDragGroups } from "../../src/sim/individualCasualtyAssistance";
import { getIndividualCasualtyAssistanceInspection } from "../../src/sim/individualCasualtyAssistance";
import { getIndividualDeathCountInspection } from "../../src/sim/individualDeathCount";
import { getIndividualEnergyCapabilityInspection } from "../../src/sim/individualEnergyCapability";
import { getIndividualExecutionActionInspection } from "../../src/sim/individualExecutionAction";
import { getIndividualTreatmentActionInspection } from "../../src/sim/individualTreatmentAction";
import { advanceSimulationOneTick, createPositionSnapshot, createSimulation } from "../../src/sim/simulation";
import type { LiveCombatDebugIndividualSnapshot, SimulationState } from "../../src/sim/types";

const deathKeys = ["deathCountPauseSource"];
const energyKeys = ["energyAttackRecoveryDurationMultiplierPercent", "energyGuardReadinessRecoveryMultiplierPercent", "energyPressureRecoveryMultiplierPercent"];
const dragKeys = ["casualtyDragGroupPhase", "casualtyDragPatientEntityId", "casualtyDragHelperEntityIds"];
const treatmentKeys = ["treatmentActionId", "treatmentKind", "treatmentHealerEntityId", "treatmentPatientEntityId", "treatmentProgressTicks", "treatmentRequiredProgressTicks", "treatmentReservedGenericHerbs", "treatmentSelectedLimbDisability"];
const executionKeys = ["executionActionId", "executionExecutorEntityId", "executionTargetEntityId", "executionProgressTicks"];
const defenceKeys = ["thisTickIncomingParryCount", "thisTickIncomingBucklerBlockCount", "thisTickIncomingShieldBlockCount", "thisTickIncomingLandedCount"];

describe("inspected snapshot record construction", () => {
  let simulation: SimulationState;
  let samples: ReturnType<typeof capture>[];
  let retained: readonly LiveCombatDebugIndividualSnapshot[];
  let retainedJson: string;
  beforeAll(() => {
    simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    samples = [capture(simulation)];
    advanceSimulationOneTick(simulation);
    retained = [...createPositionSnapshot(simulation).combatDebug!.inspectedIndividuals];
    retainedJson = JSON.stringify(retained);
    samples.push(capture(simulation));
    while (simulation.tick < 125) {
      advanceSimulationOneTick(simulation);
      if ([2, 8, 100, 101, 125].includes(simulation.tick)) samples.push(capture(simulation));
    }
  });

  it("preserves inspection order and conditional death-clock keys at their original position", () => {
    let sawPaused = false, sawAbsent = false;
    for (const sample of samples) {
      expect(sample.map(s => s.row.entityId)).toEqual(CASUALTY_LIFECYCLE_VISUAL_SCENARIO.combatSandbox!.inspectedEntityIds);
      for (const { row, death } of sample) {
        const present = death.pauseSource !== undefined;
        sawPaused ||= present; sawAbsent ||= !present;
        expect(row.deathCountPaused).toBe(death.paused);
        expect(row.deathCountPauseSource).toEqual(death.pauseSource);
        keySequence(row, "deathCountPaused", present ? deathKeys : [], "firstZeroHitTick");
        expect(Object.hasOwn(row, deathKeys[0]!)).toBe(present);
      }
    }
    expect(sawPaused && sawAbsent).toBe(true);
  });

  it.each([false, true])("preserves energy-debug values and optional-key order (enabled=%s)", (enabled) => {
    const scenario = CASUALTY_LIFECYCLE_VISUAL_SCENARIO;
    const s = createSimulation({ ...scenario, combatSandbox: { ...scenario.combatSandbox!, includeEnergyDebug: enabled } });
    advanceSimulationOneTick(s);
    for (const row of createPositionSnapshot(s).combatDebug!.inspectedIndividuals) {
      const capability = getIndividualEnergyCapabilityInspection(s.combatSandbox!.individualEnergyCapabilityStore, row.entityId);
      keySequence(row, "energyMinimumSafeWalkAvailable", enabled ? energyKeys : [], "energyAttackImpulsesThisTick");
      for (const key of energyKeys) expect(Object.hasOwn(row, key)).toBe(enabled);
      if (enabled) expect(energyKeys.map(k => row[k as keyof typeof row])).toEqual([
        capability.attackRecoveryDurationPercent, capability.guardReadinessRecoveryPercent, capability.pressureRecoveryPercent,
      ]);
    }
  });

  it("preserves drag groups and optional helper free hands without inserting absent keys", () => {
    let sawDrag = false, sawHands = false, sawAbsent = false;
    for (const sample of samples) for (const { row, hands, drag } of sample) {
      const keys = [...(hands === undefined ? [] : ["casualtyDragFreeHands"]), ...(drag === undefined ? [] : dragKeys)];
      keySequence(row, "casualtyAssistanceDestinationY", keys, "claimedMedicalPatientEntityId");
      expect(Object.hasOwn(row, "casualtyDragFreeHands")).toBe(hands !== undefined);
      expect(row.casualtyDragFreeHands).toBe(hands);
      for (const key of dragKeys) expect(Object.hasOwn(row, key)).toBe(drag !== undefined);
      if (drag) {
        sawDrag = true;
        expect([row.casualtyDragGroupPhase, row.casualtyDragPatientEntityId, row.casualtyDragHelperEntityIds])
          .toEqual([drag.phase, drag.patientEntityId, drag.helperEntityIds]);
      } else sawAbsent = true;
      sawHands ||= hands !== undefined;
    }
    expect(sawDrag && sawHands && sawAbsent).toBe(true);
  });

  it("preserves treatment/selected-limb and execution values, key presence and order", () => {
    let sawLimb = false, sawExecution = false, sawNoTreatment = false, sawNoExecution = false;
    for (const sample of samples) for (const { row, treatment, execution } of sample) {
      keySequence(row, "claimedMedicalPhysickEntityId", treatment ? treatmentKeys : [], "disabledArm");
      keySequence(row, "disabledLegClearedCount", execution ? executionKeys : [], "tickStartCombatEligible");
      for (const key of treatmentKeys) expect(Object.hasOwn(row, key)).toBe(treatment !== undefined);
      for (const key of executionKeys) expect(Object.hasOwn(row, key)).toBe(execution !== undefined);
      if (treatment) {
        expect(treatmentKeys.map(k => row[k as keyof typeof row])).toEqual([
          treatment.actionId, treatment.kind, treatment.healerEntityId, treatment.patientEntityId,
          treatment.progressTicks, treatment.requiredProgressTicks, treatment.reservedGenericHerbs, treatment.selectedLimbDisability,
        ]);
        sawLimb ||= treatment.selectedLimbDisability === "disabledLeg";
      } else sawNoTreatment = true;
      if (execution) {
        expect(executionKeys.map(k => row[k as keyof typeof row])).toEqual([
          execution.actionId, execution.executorEntityId, execution.targetEntityId, execution.progressTicks,
        ]);
        sawExecution = true;
      } else sawNoExecution = true;
    }
    expect(sawLimb && sawExecution && sawNoTreatment && sawNoExecution).toBe(true);
  });

  it("preserves incoming defence counts and their insertion order", () => {
    let sawIncoming = false;
    const source = CASUALTY_LIFECYCLE_VISUAL_SCENARIO.combatSandbox!.units[0]!;
    const unit = (unitId: number, factionId: number, x: number, headingX: number) => ({
      ...source, unitId, factionId, anchorX: x, anchorY: 80, headingX, headingY: 0,
      deploymentZone: { minX: x, maxX: x, minY: 80, maxY: 80 },
      memberCount: 1, rows: 1, cols: 1, spacing: 8,
      order: "hold" as const, unitSpeed: 0, memberMaxStep: 1,
      weaponCategory: "oneHanded" as const, weaponReachBand: "medium" as const,
      attackIntervalTicks: 1,
    });
    const combat = createSimulation({
      seed: 3, entityCount: 2, bounds: { width: 300, height: 200 },
      minSpeedUnitsPerTick: 1, maxSpeedUnitsPerTick: 1,
      combatSandbox: { kind: "liveCombatSandbox", appliedDamagePressureScale: 1,
        requireLegalInitialHardStandingPlacement: true, inspectedEntityIds: [0, 1],
        units: [unit(1, 1, 100, 1), unit(2, 2, 108, -1)] },
    });
    const defenceSamples = [capture(combat)];
    for (let tick = 0; tick < 20; tick += 1) {
      advanceSimulationOneTick(combat);
      defenceSamples.push(capture(combat));
    }
    for (const sample of [...samples, ...defenceSamples]) for (const { row, defence } of sample) {
      keySequence(row, "defenceResolution", defenceKeys, "thisTickAppliedHitLoss");
      expect(defenceKeys.map(k => row[k as keyof typeof row])).toEqual(defence);
      sawIncoming ||= defence.some(count => count > 0);
    }
    expect(sawIncoming).toBe(true);
  });

  it("allocates fresh records without mutating previously published records", () => {
    const current = createPositionSnapshot(simulation).combatDebug!.inspectedIndividuals;
    expect(JSON.stringify(retained)).toBe(retainedJson);
    expect(JSON.stringify(current)).not.toBe(retainedJson);
    for (let i = 0; i < retained.length; i += 1) expect(current[i]).not.toBe(retained[i]);
  });
});

function keySequence(row: LiveCombatDebugIndividualSnapshot, before: string, middle: readonly string[], after: string) {
  const keys = Object.keys(row), start = keys.indexOf(before);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(keys.slice(start, start + middle.length + 2)).toEqual([before, ...middle, after]);
}

function capture(simulation: SimulationState) {
  const combat = simulation.combatSandbox!;
  return createPositionSnapshot(simulation).combatDebug!.inspectedIndividuals.map(row => {
    const assistance = getIndividualCasualtyAssistanceInspection(combat.individualCasualtyAssistanceStore, row.entityId);
    const drag = getActiveCasualtyDragGroups(combat.casualtyDragGroupStore).find(g => g.groupId === assistance.dragGroupId);
    const records = combat.individualCombatPipelineBuffers.defenceRecords.filter(r => r.defenderEntityId === row.entityId);
    return {
      row,
      death: getIndividualDeathCountInspection(combat.individualDeathCountStore, row.entityId),
      hands: combat.individualDragHandCommitmentStore.getFreeHands(row.entityId),
      drag: drag && { phase: drag.phase, patientEntityId: drag.patientEntityId, helperEntityIds: [...drag.helperEntityIds] },
      treatment: getIndividualTreatmentActionInspection(combat.individualTreatmentActionStore, row.entityId),
      execution: getIndividualExecutionActionInspection(combat.individualExecutionActionStore, row.entityId),
      defence: ["parried", "bucklerBlocked", "shieldBlocked"].map(outcome => records.filter(r => r.outcome === outcome).length)
        .concat(records.filter(r => !["parried", "bucklerBlocked", "shieldBlocked"].includes(r.outcome)).length),
    };
  });
}
