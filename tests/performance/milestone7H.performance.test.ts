import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
} from "../../src/sim/individualCasualtyLifecycle";
import { initializeIndividualDeathCountsFromZeroHitTransitions } from "../../src/sim/individualDeathCount";
import {
  getIndividualCurrentEnergy,
  getIndividualMaximumEnergy,
} from "../../src/sim/individualEnergy";
import {
  applyIndividualLandedHits,
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
} from "../../src/sim/individualGlobalHits";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  advanceCombatSandboxOneTick,
  advanceSimulationOneTick,
  createSimulation,
  type CombatSandboxTickStage,
} from "../../src/sim/simulation";
import { computeSlotWorldPosition } from "../../src/sim/formationBehaviour";
import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";
import { getUnitIds, getUnitMembers } from "../../src/sim/unitIdentity";

const ENTITY_COUNT = 2_000;
const UNIT_COUNT = 100;
const MEMBERS_PER_UNIT = 20;
const WARM_UP_TICKS = 5;
const MEASURED_TICKS = 20;
const REPRESENTATIVE_DRAG_PATIENT_ENTITY_ID = 1_920;
const REPRESENTATIVE_EGRESS_ENTITY_ID = 1_960;

type PerformanceCase = "representative" | "sprintHeavy" | "denseDefence" | "idle";

describe("Milestone 7H production structural performance", () => {
  it.each([
    "representative",
    "sprintHeavy",
    "denseDefence",
    "idle",
  ] as const)("measures the 2,000-entity %s case by production stage", (caseName) => {
    const report = runProductionCase(caseName);
    expect(report.entityCount).toBe(ENTITY_COUNT);
    expect(report.unitCount).toBe(UNIT_COUNT);
    expect(report.membersPerUnit).toBe(MEMBERS_PER_UNIT);
    expect(report.outputReuse).toBe(true);
    expect(report.energyAndHitBoundsValid).toBe(true);
    expect(report.publicEnergyStoreKeys).toEqual(["entityCount"]);
    expect(report.publicBehaviourStoreKeys).toEqual(["entityCount", "unitCount"]);
    expect(report.maximumSelectedTargetRecords).toBeLessThanOrEqual(ENTITY_COUNT);
    expect(report.stage.preMovementRecoveryThreat.meanMillisecondsPerTick)
      .toBeGreaterThanOrEqual(0);
    expect(report.stage.preMovementRecoveryThreat.maximumMillisecondsPerTick)
      .toBeGreaterThanOrEqual(report.stage.preMovementRecoveryThreat.p95MillisecondsPerTick);
    expect(report.stage.recoveryThreat.meanMillisecondsPerTick)
      .toBeGreaterThanOrEqual(0);
    console.info("Milestone 7H production stage report", JSON.stringify(report, null, 2));
    if (caseName === "representative") {
      expect(report.zeroEnergyActiveMoverCount).toBeGreaterThan(0);
      expect(report.representativeCasualtyActivity.draggingMeasuredTickCount)
        .toBeGreaterThan(0);
      expect(report.representativeCasualtyActivity.treatmentMeasuredTickCount)
        .toBeGreaterThan(0);
      expect(report.representativeCasualtyActivity.egressMeasuredTickCount)
        .toBeGreaterThan(0);
      expect(report.representativeCasualtyActivity.maximumMovedDragParticipants)
        .toBeGreaterThan(0);
      expect(report.representativeCasualtyActivity.egressMovementRecordCount)
        .toBeGreaterThan(0);
      expect(report.representativeCasualtyActivity.seededDragStarted).toBe(true);
      expect(report.representativeCasualtyActivity.seededTreatmentStarted).toBe(true);
      expect(report.representativeCasualtyActivity.seededEgressMoved).toBe(true);
    }
    if (caseName === "denseDefence") {
      expect(report.maximumDefenceRecords).toBeGreaterThan(0);
    }
    if (caseName === "sprintHeavy") {
      expect(report.totalEnergySpent).toBeGreaterThan(0);
    }
  }, 30_000);

  it("measures the retained casualty-extraction stress with bounded outputs", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    const combat = simulation.combatSandbox!;
    const samples = new Float64Array(240);
    const dragStartedRecords = combat.casualtyDragMovementBuffers.draggingStartedRecords;
    const treatmentRecords = combat.individualTreatmentActionBuffers.completedRecords;
    let maximumDragGroups = 0;
    let maximumDragMovementRecords = 0;
    let treatmentStartCount = 0;
    for (let tick = 0; tick < samples.length; tick += 1) {
      const started = performance.now();
      advanceSimulationOneTick(simulation);
      samples[tick] = performance.now() - started;
      maximumDragGroups = Math.max(
        maximumDragGroups,
        combat.casualtyDragMovementResult.draggingGroupCount,
      );
      maximumDragMovementRecords = Math.max(
        maximumDragMovementRecords,
        combat.casualtyDragMovementResult.movedParticipantCount,
      );
      treatmentStartCount +=
        combat.individualTreatmentActionResult.startedRecords.length;
    }
    expect(maximumDragGroups).toBeGreaterThan(0);
    expect(maximumDragMovementRecords).toBeGreaterThan(0);
    expect(treatmentStartCount).toBeGreaterThan(0);
    expect(combat.casualtyDragMovementBuffers.draggingStartedRecords)
      .toBe(dragStartedRecords);
    expect(combat.individualTreatmentActionBuffers.completedRecords)
      .toBe(treatmentRecords);
    console.info("Milestone 7H casualty-extraction stress report", JSON.stringify({
      entityCount: simulation.world.entityCount,
      measuredTicks: samples.length,
      timing: timingReport(samples),
      maximumDragGroups,
      maximumDragMovementRecords,
      treatmentStartCount,
      outputReuse: true,
      timingPolicy: "Structural assertions only; no machine timing threshold.",
    }, null, 2));
  }, 30_000);
});

function runProductionCase(caseName: PerformanceCase) {
  const simulation = createSimulation(createPerformanceScenario(caseName));
  const combat = simulation.combatSandbox!;
  if (caseName === "idle") placeMembersExactlyInFormation(simulation);
  const initialX = simulation.world.positionsX.slice();
  const zeroEnergyEntityIds: number[] = [];
  for (let entityId = 0; entityId < ENTITY_COUNT; entityId += 1) {
    if (getIndividualCurrentEnergy(combat.individualEnergyStore, entityId) === 0) {
      zeroEnergyEntityIds.push(entityId);
    }
  }
  const outputReferences = [
    combat.individualCombatPipelineBuffers.selectedTargetRecords,
    combat.individualCombatPipelineBuffers.defenceRecords,
    combat.individualCombatPipelineBuffers.hitApplications,
    combat.unitEnergySummaries,
    combat.recoveryThreatSummaries,
  ] as const;
  const stageSamples = createStageSamples(MEASURED_TICKS);
  const totalSamples = new Float64Array(MEASURED_TICKS);
  let maximumSelectedTargetRecords = 0;
  let maximumDefenceRecords = 0;
  let energyAndHitBoundsValid = true;
  const representativeCasualtyActivity = {
    draggingMeasuredTickCount: 0,
    treatmentMeasuredTickCount: 0,
    egressMeasuredTickCount: 0,
    maximumMovedDragParticipants: 0,
    treatmentStartCount: 0,
    egressMovementRecordCount: 0,
    seededDragStarted: false,
    seededTreatmentStarted: false,
    seededEgressMoved: false,
  };

  for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  if (caseName === "representative") {
    seedRepresentativeCasualties(simulation, simulation.tick);
  }

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const started = performance.now();
    advanceCombatSandboxOneTick(
      simulation.world,
      combat,
      simulation.tick,
      {
        runStage: (stage, run) => {
          const stageStarted = performance.now();
          const result = run();
          stageSamples[stage][tick] = stageSamples[stage][tick]! +
            performance.now() - stageStarted;
          return result;
        },
      },
    );
    totalSamples[tick] = performance.now() - started;
    simulation.tick += 1;
    maximumSelectedTargetRecords = Math.max(
      maximumSelectedTargetRecords,
      combat.individualCombatPipelineBuffers.selectedTargetRecords.length,
    );
    maximumDefenceRecords = Math.max(
      maximumDefenceRecords,
      combat.individualCombatPipelineBuffers.defenceRecords.length,
    );
    if (combat.casualtyDragMovementResult.draggingGroupCount > 0) {
      representativeCasualtyActivity.draggingMeasuredTickCount += 1;
    }
    representativeCasualtyActivity.maximumMovedDragParticipants = Math.max(
      representativeCasualtyActivity.maximumMovedDragParticipants,
      combat.casualtyDragMovementResult.movedParticipantCount,
    );
    if (combat.individualTreatmentActionResult.activeActionCount > 0) {
      representativeCasualtyActivity.treatmentMeasuredTickCount += 1;
    }
    representativeCasualtyActivity.treatmentStartCount +=
      combat.individualTreatmentActionResult.startedRecords.length;
    representativeCasualtyActivity.seededDragStarted ||=
      combat.casualtyDragMovementResult.draggingStartedRecords.some((record) =>
        record.patientEntityId === REPRESENTATIVE_DRAG_PATIENT_ENTITY_ID
      );
    representativeCasualtyActivity.seededTreatmentStarted ||=
      combat.individualTreatmentActionResult.startedRecords.some((record) =>
        record.patientEntityId === REPRESENTATIVE_DRAG_PATIENT_ENTITY_ID
      );
    if (combat.individualRespawnEgressResult.movementRecords.length > 0) {
      representativeCasualtyActivity.egressMeasuredTickCount += 1;
    }
    representativeCasualtyActivity.egressMovementRecordCount +=
      combat.individualRespawnEgressResult.movementRecords.length;
    representativeCasualtyActivity.seededEgressMoved ||=
      combat.individualRespawnEgressResult.movementRecords.some((record) =>
        record.entityId === REPRESENTATIVE_EGRESS_ENTITY_ID
      );
    for (let entityId = 0; entityId < ENTITY_COUNT; entityId += 1) {
      const energy = getIndividualCurrentEnergy(combat.individualEnergyStore, entityId);
      energyAndHitBoundsValid &&= energy >= 0 && energy <=
        getIndividualMaximumEnergy(combat.individualEnergyStore, entityId);
      energyAndHitBoundsValid &&= getIndividualCurrentGlobalHits(
        combat.individualGlobalHitStore,
        entityId,
      ) <= getIndividualMaximumGlobalHits(combat.individualGlobalHitStore, entityId);
    }
  }

  return {
    caseName,
    entityCount: ENTITY_COUNT,
    unitCount: getUnitIds(combat.identityStore).length,
    membersPerUnit: MEMBERS_PER_UNIT,
    measuredTicks: MEASURED_TICKS,
    warmUpTicks: WARM_UP_TICKS,
    stage: Object.fromEntries(Object.entries(stageSamples).map(([stage, samples]) =>
      [stage, timingReport(samples)])) as Record<CombatSandboxTickStage, TimingReport>,
    totalTick: timingReport(totalSamples),
    zeroEnergyActiveMoverCount: zeroEnergyEntityIds.filter((entityId) =>
      getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore,
        entityId,
      ) === "active" && simulation.world.positionsX[entityId] !== initialX[entityId]
    ).length,
    totalEnergySpent: combat.unitEnergySummaries.reduce(
      (total, summary) => total + summary.energySpentThisTick,
      0,
    ),
    maximumSelectedTargetRecords,
    maximumDefenceRecords,
    representativeCasualtyActivity,
    energyAndHitBoundsValid,
    outputReuse:
      combat.individualCombatPipelineBuffers.selectedTargetRecords === outputReferences[0] &&
      combat.individualCombatPipelineBuffers.defenceRecords === outputReferences[1] &&
      combat.individualCombatPipelineBuffers.hitApplications === outputReferences[2] &&
      combat.unitEnergySummaries === outputReferences[3] &&
      combat.recoveryThreatSummaries === outputReferences[4],
    publicEnergyStoreKeys: Object.keys(combat.individualEnergyStore),
    publicBehaviourStoreKeys: Object.keys(combat.unitEnergyBehaviourStore),
    threatProjectionShape:
      "same bounded recovery-threat spatial grid; measured before and after movement",
    allocationPolicy:
      "stable stores and output buffers; no per-entity production inspection",
    timingPolicy: "Structural assertions only; no machine timing threshold.",
  };
}

function seedRepresentativeCasualties(
  simulation: SimulationState,
  tick: number,
): void {
  downRepresentativeEntity(simulation, REPRESENTATIVE_DRAG_PATIENT_ENTITY_ID, tick);
  downRepresentativeEntity(simulation, REPRESENTATIVE_EGRESS_ENTITY_ID, tick);
}

function downRepresentativeEntity(
  simulation: SimulationState,
  entityId: number,
  tick: number,
): void {
  const combat = simulation.combatSandbox!;
  const currentHits = getIndividualCurrentGlobalHits(
    combat.individualGlobalHitStore,
    entityId,
  );
  const hits = applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: currentHits }, () => representativeLandedRecord(entityId)),
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

function representativeLandedRecord(
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId: 0,
    defenderEntityId,
    attackerWeaponCategory: "oneHanded",
    defenderActiveWeaponCategory: "oneHanded",
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

function placeMembersExactlyInFormation(simulation: SimulationState): void {
  const combat = simulation.combatSandbox!;
  const unitIds = getUnitIds(combat.identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const members = getUnitMembers(combat.identityStore, unitId);
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const entityId = members[memberIndex]!;
      const position = computeSlotWorldPosition(
        combat.formationStore,
        unitId,
        Math.floor(memberIndex / 5),
        memberIndex % 5,
      );
      simulation.world.positionsX[entityId] = position.x;
      simulation.world.positionsY[entityId] = position.y;
    }
  }
}

function createPerformanceScenario(caseName: PerformanceCase): SimulationScenario {
  const source = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!.units[0]!;
  const units: CombatSandboxUnitScenario[] = [];
  for (let unitIndex = 0; unitIndex < UNIT_COUNT; unitIndex += 1) {
    const pairIndex = Math.floor(unitIndex / 2);
    const representativeCasualtyUnit = caseName === "representative" &&
      unitIndex >= 96;
    const factionId = representativeCasualtyUnit
      ? unitIndex < 98 ? 1 : 2
      : unitIndex % 2 + 1;
    const pairColumn = pairIndex % 10;
    const pairRow = Math.floor(pairIndex / 10);
    const leftX = 120 + pairColumn * 320;
    const gap = caseName === "denseDefence" ? 10
      : caseName === "idle" ? 220
      : 80;
    const anchorX = representativeCasualtyUnit
      ? unitIndex === 96 ? 50
        : unitIndex === 97 ? 62
        : unitIndex === 98 ? 130
        : 142
      : factionId === 1 ? leftX : leftX + gap;
    const anchorY = representativeCasualtyUnit
      ? 790
      : 100 + pairRow * 150;
    const equipment = unitIndex % 4;
    const energy = unitIndex % 4;
    const { memberProfiles: _memberProfiles, ...base } = source;
    units.push({
      ...base,
      unitId: unitIndex + 1,
      factionId,
      memberCount: MEMBERS_PER_UNIT,
      deploymentZone: {
        minX: anchorX - 8,
        maxX: anchorX + 8,
        minY: anchorY - 8,
        maxY: anchorY + 8,
      },
      anchorX,
      anchorY,
      headingX: factionId === 1 ? 1 : -1,
      headingY: 0,
      spacing: 4,
      rows: 4,
      cols: 5,
      unitSpeed: caseName === "idle" || representativeCasualtyUnit ? 0 : 4,
      ordinaryPhysicalGait: caseName === "sprintHeavy" ? "sprinting" : "jogging",
      order: caseName === "idle" || caseName === "denseDefence" ||
          representativeCasualtyUnit
        ? "hold"
        : "advanceCautious",
      memberMaxStep: representativeCasualtyUnit ? 16 : 4,
      weaponCategory: caseName === "idle" || representativeCasualtyUnit
        ? "unarmed"
        : equipment === 0 ? "oneHanded"
        : equipment === 1 ? "twoHanded"
        : equipment === 2 ? "polearm"
        : "staff",
      weaponReachBand: caseName === "idle" || representativeCasualtyUnit
        ? "none"
        : equipment === 2 || equipment === 3 ? "long"
        : "short",
      armourClass: equipment === 0 ? "none"
        : equipment === 1 ? "light"
        : equipment === 2 ? "medium"
        : "heavy",
      shieldClass: equipment === 0 ? "none" : equipment === 2 ? "shield" : "none",
      maxDamageCapacity: 100,
      casualtyProcedure: unitIndex === 98 && representativeCasualtyUnit
        ? {
            procedureKind: "barbarian",
            deathCountPolicy: { kind: "fixedTicks", durationTicks: 3 },
            respawnDestination: { x: 360, y: anchorY },
          }
        : factionId === 1
        ? {
            procedureKind: "citizen",
            deathCountPolicy: { kind: "normalFortitude" },
          }
        : {
            procedureKind: "barbarian",
            deathCountPolicy: { kind: "fixedTicks", durationTicks: 50 },
            respawnDestination: { x: 3_300, y: anchorY },
          },
      medicalProfile: unitIndex === 97 && representativeCasualtyUnit
        ? { hasChirurgeon: true, hasPhysick: true, startingGenericHerbs: 20 }
        : unitIndex % 10 === 0
        ? { hasChirurgeon: true, hasPhysick: true, startingGenericHerbs: 20 }
        : { hasChirurgeon: false, hasPhysick: false },
      energyProfile: {
        maximumEnergy: 10_000,
        startingEnergy: caseName === "sprintHeavy" || representativeCasualtyUnit
          ? 10_000
          : energy === 0 ? 0
          : energy === 1 ? 2_000
          : energy === 2 ? 5_000
          : 10_000,
        safeRestRecoveryPerTick: caseName === "idle" ? 0 : 5,
      },
    });
  }
  return {
    seed: 0x7_0_08,
    entityCount: ENTITY_COUNT,
    bounds: { width: 3_400, height: 850 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 2,
      inspectedEntityIds: [],
      units,
    },
  };
}

interface TimingReport {
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
}

function timingReport(samples: Float64Array): TimingReport {
  const sorted = Array.from(samples).sort((left, right) => left - right);
  const total = sorted.reduce((sum, sample) => sum + sample, 0);
  return {
    meanMillisecondsPerTick: total / samples.length,
    maximumMillisecondsPerTick: sorted.at(-1) ?? 0,
    p95MillisecondsPerTick:
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
  };
}

function createStageSamples(
  tickCount: number,
): Record<CombatSandboxTickStage, Float64Array> {
  return {
    formation: new Float64Array(tickCount),
    preMovementRecoveryThreat: new Float64Array(tickCount),
    individualPipeline: new Float64Array(tickCount),
    individualPressureAndCohesion: new Float64Array(tickCount),
    routingContagion: new Float64Array(tickCount),
    recoveryThreat: new Float64Array(tickCount),
    moraleAssessmentAndPersistence: new Float64Array(tickCount),
    countersAndSnapshots: new Float64Array(tickCount),
  };
}
