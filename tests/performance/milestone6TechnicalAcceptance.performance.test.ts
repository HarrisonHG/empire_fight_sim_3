import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  applyIndividualTerminalPresenceTransitions,
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  transitionIndividualDyingToTerminal,
  type IndividualTerminalTransitionRecord,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  getActiveCasualtyDragGroups,
} from "../../src/sim/individualCasualtyAssistance";
import {
  getActiveIndividualExecutionActionCount,
  submitIndividualExecutionIntent,
} from "../../src/sim/individualExecutionAction";
import {
  applyIndividualLandedHits,
  getIndividualCurrentGlobalHits,
} from "../../src/sim/individualGlobalHits";
import {
  initializeIndividualDeathCountsFromZeroHitTransitions,
  recordIndividualExecutionTerminal,
} from "../../src/sim/individualDeathCount";
import { applyTrustedIndividualLimbDisability } from "../../src/sim/individualLimbDisability";
import {
  calculateTraumaticWoundOpportunityRoll,
  resolveIndividualTraumaticWoundOpportunities,
  type IndividualTraumaticWoundOpportunity,
} from "../../src/sim/individualTraumaticWound";
import {
  getIndividualMedicalLocalQueryPreparationCount,
} from "../../src/sim/individualMedicalReadModel";
import { getActiveIndividualTreatmentActionCount } from "../../src/sim/individualTreatmentAction";
import {
  advanceCombatSandboxOneTick,
  advanceSimulationOneTick,
  createSimulation,
  type Milestone6CasualtyTickStage,
} from "../../src/sim/simulation";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";

const ENTITY_COUNT = 2_000;
const UNIT_COUNT = 100;
const MEMBERS_PER_UNIT = 20;
const WARM_UP_TICKS = 5;
const MEASURED_TICKS = 20;

type MatrixCase = "ordinaryRepresentative" | "casualtyHeavyRepresentative" | "denseCollapseStress";

interface TimingReport {
  readonly meanMilliseconds: number;
  readonly maximumMilliseconds: number;
  readonly p95Milliseconds: number;
}

interface StructuralTotals {
  casualtyTransitions: number;
  deathCountAdvancement: number;
  traumaOpportunities: number;
  traumaApplied: number;
  medicalQueryPreparations: number;
  medicalCandidates: number;
  rescueSelections: number;
  dragParticipantMoves: number;
  claimsAndHandoffs: number;
  treatmentTransitions: number;
  executionTransitions: number;
  comfortTransitions: number;
  egressTransitions: number;
  consolidationUnits: number;
  maximumActiveDragGroups: number;
  maximumActiveTreatmentActions: number;
  maximumActiveExecutionActions: number;
}

describe("Milestone 6I-2 representative casualty performance matrix", () => {
  it.each([
    "ordinaryRepresentative",
    "casualtyHeavyRepresentative",
    "denseCollapseStress",
  ] as const)("reports structural phase timing for %s", (caseName) => {
    const exact = createPreparedSimulation(caseName);
    for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) advanceSimulationOneTick(exact);
    const exactSamples = new Float64Array(MEASURED_TICKS);
    for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
      const startedAt = performance.now();
      advanceSimulationOneTick(exact);
      exactSamples[tick] = performance.now() - startedAt;
    }

    const instrumented = createPreparedSimulation(caseName);
    for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) advanceSimulationOneTick(instrumented);
    const stageSamples = createStageSamples();
    const totals = createStructuralTotals();
    const combat = requireCombat(instrumented);
    const preparationCountBefore = getIndividualMedicalLocalQueryPreparationCount(
      combat.individualMedicalLocalQueryStore,
    );
    for (let sampleIndex = 0; sampleIndex < MEASURED_TICKS; sampleIndex += 1) {
      advanceCombatSandboxOneTick(
        instrumented.world,
        combat,
        instrumented.tick,
        {
          runStage: (_stage, run) => run(),
          runCasualtyStage: (stage, run) => {
            const startedAt = performance.now();
            const result = run();
            stageSamples[stage][sampleIndex]! += performance.now() - startedAt;
            return result;
          },
        },
      );
      instrumented.tick += 1;
      collectStructuralTotals(combat, totals);
    }
    totals.medicalQueryPreparations =
      getIndividualMedicalLocalQueryPreparationCount(
        combat.individualMedicalLocalQueryStore,
      ) - preparationCountBefore;

    const report = {
      caseName,
      composition: compositionFor(caseName),
      entityCount: ENTITY_COUNT,
      unitCount: UNIT_COUNT,
      membersPerUnit: MEMBERS_PER_UNIT,
      exactProductionTick: timingReport(exactSamples),
      casualtyPhases: Object.fromEntries(
        casualtyStages().map((stage) => [stage, timingReport(stageSamples[stage])]),
      ),
      structuralTotals: totals,
      timingPolicy: "Structural assertions only; no machine-dependent timing thresholds.",
    };

    expect(exact.world.entityCount).toBe(ENTITY_COUNT);
    expect(combat.individualCasualtyHistoryStore.entityCount).toBe(ENTITY_COUNT);
    expect(combat.individualCasualtyUnitSummaries).toHaveLength(UNIT_COUNT);
    expect(totals.medicalQueryPreparations).toBeGreaterThanOrEqual(MEASURED_TICKS);
    expect(totals.medicalCandidates).toBeGreaterThan(0);
    expect(totals.maximumActiveDragGroups).toBeGreaterThan(0);
    if (caseName !== "ordinaryRepresentative") {
      expect(totals.egressTransitions).toBeGreaterThan(0);
      expect(totals.comfortTransitions).toBeGreaterThan(0);
      expect(totals.executionTransitions).toBeGreaterThan(0);
      expect(totals.maximumActiveExecutionActions).toBeGreaterThan(0);
    }
    for (const timing of [
      report.exactProductionTick,
      ...Object.values(report.casualtyPhases),
    ]) {
      expect(timing.meanMilliseconds).toBeGreaterThanOrEqual(0);
      expect(timing.maximumMilliseconds).toBeGreaterThanOrEqual(timing.meanMilliseconds);
      expect(timing.p95Milliseconds).toBeGreaterThanOrEqual(0);
    }
    process.stdout.write(
      `\nMilestone 6 representative casualty performance\n${JSON.stringify(report, null, 2)}\n`,
    );
  }, 120_000);
});

function createPreparedSimulation(caseName: MatrixCase): SimulationState {
  const simulation = createSimulation(matrixScenario(caseName));
  seedCaseState(simulation, caseName);
  return simulation;
}

function matrixScenario(caseName: MatrixCase): SimulationScenario {
  const dense = caseName === "denseCollapseStress";
  const units: CombatSandboxUnitScenario[] = [];
  const pairCount = UNIT_COUNT / 2;
  const laneSpacing = dense ? 12 : 384;
  const denseRows = 5;
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const row = dense ? pairIndex % denseRows : pairIndex;
    const column = dense ? Math.floor(pairIndex / denseRows) : 0;
    const x = 100 + column * 16;
    const y = 100 + row * laneSpacing;
    const firstUnitIndex = pairIndex * 2;
    units.push(
      matrixUnit(firstUnitIndex, 1, x, y, 1, caseName),
      matrixUnit(firstUnitIndex + 1, 2, x + 10, y, -1, caseName),
    );
  }
  return {
    seed: 0x6_12 + matrixCaseIdentity(caseName),
    entityCount: ENTITY_COUNT,
    bounds: dense
      ? { width: 420, height: 360 }
      : { width: 320, height: 100 + pairCount * laneSpacing + 200 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units,
    },
  };
}

function matrixUnit(
  unitIndex: number,
  factionId: number,
  x: number,
  y: number,
  headingX: -1 | 1,
  caseName: MatrixCase,
): CombatSandboxUnitScenario {
  const barbarian = caseName !== "ordinaryRepresentative" && unitIndex % 20 === 19;
  const medical = unitIndex % 20 === 2;
  return {
    unitId: unitIndex + 1,
    factionId,
    memberCount: MEMBERS_PER_UNIT,
    deploymentZone: { minX: x, maxX: x + 2, minY: y, maxY: y + 2 },
    anchorX: x,
    anchorY: y,
    headingX,
    headingY: 0,
    spacing: 4,
    rows: 2,
    cols: 10,
    unitSpeed: 1,
    order: "advance",
    role: "regular",
    memberMaxStep: 1,
    weaponCategory: "oneHanded",
    weaponReachBand: "short",
    armourClass: "none",
    shieldClass: "none",
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: barbarian
      ? {
          procedureKind: "barbarian",
          deathCountPolicy: { kind: "fixedTicks", durationTicks: 8 },
          respawnDestination: { x: Math.max(0, x - 32), y },
        }
      : {
          procedureKind: "citizen",
          deathCountPolicy: { kind: "fixedTicks", durationTicks: 1_200 },
        },
    ...(medical
      ? { medicalProfile: { hasChirurgeon: true, hasPhysick: true, startingGenericHerbs: 4 } }
      : {}),
  };
}

function seedCaseState(simulation: SimulationState, caseName: MatrixCase): void {
  const casualtyPercent = caseName === "ordinaryRepresentative" ? 5
    : caseName === "casualtyHeavyRepresentative" ? 20 : 40;
  const casualtyCount = ENTITY_COUNT * casualtyPercent / 100;
  for (let offset = 0; offset < casualtyCount; offset += 1) {
    const entityId = offset * Math.floor(ENTITY_COUNT / casualtyCount);
    downEntity(simulation, entityId, 0);
  }
  const terminalCount = caseName === "ordinaryRepresentative" ? 0
    : caseName === "casualtyHeavyRepresentative" ? 40 : 100;
  for (let entityId = 0; entityId < terminalCount; entityId += 1) {
    const candidate = entityId * 20;
    if (getIndividualCharacterLifecycleState(
      requireCombat(simulation).individualCasualtyLifecycleStore,
      candidate,
    ) === "dying") terminalizeFixtureEntity(simulation, candidate, 0);
  }
  const combat = requireCombat(simulation);
  for (let entityId = 10; entityId < 30; entityId += 2) {
    if (getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore,
      entityId,
    ) !== "active") continue;
    const opportunity = findSuccessfulTraumaOpportunity(
      combat.battleSeed, entityId, (entityId + 20) % ENTITY_COUNT,
    );
    resolveIndividualTraumaticWoundOpportunities(
      combat.battleSeed,
      combat.individualCasualtyProcedureProfileStore,
      combat.individualTraumaticWoundStore,
      [opportunity],
      combat.individualTraumaticWoundRecords,
    );
  }
  for (let entityId = 30; entityId < 40; entityId += 1) {
    if (getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore,
      entityId,
    ) === "active") {
      applyTrustedIndividualLimbDisability(
        combat.individualLimbDisabilityStore,
        entityId,
        entityId % 2 === 0 ? "disabledArm" : "disabledLeg",
      );
    }
  }
  if (caseName !== "ordinaryRepresentative") {
    const targetEntityId = caseName === "casualtyHeavyRepresentative" ? 5 : 2;
    const executorEntityId = targetEntityId + 1;
    const isolatedX = caseName === "denseCollapseStress" ? 390 : 300;
    simulation.world.positionsX[targetEntityId] = isolatedX;
    simulation.world.positionsX[executorEntityId] = isolatedX + 4;
    simulation.world.positionsY[executorEntityId] =
      simulation.world.positionsY[targetEntityId]!;
    submitIndividualExecutionIntent(combat.individualExecutionActionStore, {
      executorEntityId,
      targetEntityId,
      requestedTick: WARM_UP_TICKS,
      targetBasis: "dying",
    });
  }
}

function collectStructuralTotals(
  combat: CombatSandboxSimulationState,
  totals: StructuralTotals,
): void {
  totals.casualtyTransitions += combat.individualLifecycleTransitions.length;
  for (const summary of combat.individualCasualtyUnitSummaries) {
    totals.deathCountAdvancement += summary.dyingCharacterCount;
    totals.comfortTransitions +=
      summary.terminalAwaitingComfortCount +
      summary.activeTerminalComfortActionCount +
      summary.terminalComfortCompletionCount;
    totals.consolidationUnits += 1;
  }
  totals.traumaOpportunities += combat.individualTraumaticWoundOpportunities.length;
  totals.traumaApplied += combat.individualTraumaticWoundRecords.length;
  totals.medicalCandidates +=
    combat.casualtyAssistanceDecisionResult.localCandidateCount +
    combat.individualMedicalClaimResult.localCandidateCount;
  totals.rescueSelections += combat.casualtyAssistanceDecisionResult.groupStartedRecords.length;
  totals.dragParticipantMoves += combat.casualtyDragMovementResult.movedParticipantCount;
  totals.claimsAndHandoffs += combat.individualMedicalClaimResult.claimRecords.length +
    combat.individualMedicalClaimResult.handoffRecords.length;
  totals.treatmentTransitions += combat.individualTreatmentActionResult.startedRecords.length +
    combat.individualTreatmentActionResult.completedRecords.length +
    combat.individualTreatmentActionResult.interruptedRecords.length;
  totals.executionTransitions += combat.individualExecutionActionResult.startedRecords.length +
    combat.individualExecutionActionResult.completedRecords.length +
    combat.individualExecutionActionResult.interruptedRecords.length;
  totals.egressTransitions += combat.individualRespawnEgressResult.movementRecords.length +
    combat.individualRespawnEgressResult.arrivalRecords.length;
  totals.maximumActiveDragGroups = Math.max(
    totals.maximumActiveDragGroups,
    getActiveCasualtyDragGroups(combat.casualtyDragGroupStore).length,
  );
  totals.maximumActiveTreatmentActions = Math.max(
    totals.maximumActiveTreatmentActions,
    getActiveIndividualTreatmentActionCount(combat.individualTreatmentActionStore),
  );
  totals.maximumActiveExecutionActions = Math.max(
    totals.maximumActiveExecutionActions,
    getActiveIndividualExecutionActionCount(combat.individualExecutionActionStore),
  );
}

function downEntity(simulation: SimulationState, entityId: number, tick: number): void {
  const combat = requireCombat(simulation);
  const hitCount = getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId);
  const hits = applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: hitCount }, () => landedRecord((entityId + 20) % ENTITY_COUNT, entityId)),
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

function terminalizeFixtureEntity(
  simulation: SimulationState,
  entityId: number,
  tick: number,
): void {
  const combat = requireCombat(simulation);
  transitionIndividualDyingToTerminal(
    combat.individualCasualtyLifecycleStore,
    entityId,
    tick,
    "execution",
  );
  recordIndividualExecutionTerminal(
    combat.individualDeathCountStore,
    entityId,
    tick,
    simulation.world.positionsX[entityId]!,
    simulation.world.positionsY[entityId]!,
  );
  const transition: IndividualTerminalTransitionRecord = {
    entityId,
    tick,
    previousLifecycleState: "dying",
    lifecycleState: "terminal",
    cause: "execution",
    terminalX: simulation.world.positionsX[entityId]!,
    terminalY: simulation.world.positionsY[entityId]!,
  };
  applyIndividualTerminalPresenceTransitions(
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualCasualtyProcedureProfileStore,
    [transition],
    combat.individualTerminalPresenceTransitions,
  );
}

function findSuccessfulTraumaOpportunity(
  battleSeed: number,
  targetEntityId: number,
  attackerEntityId: number,
): IndividualTraumaticWoundOpportunity {
  for (let tick = 0; tick < 10_000; tick += 1) {
    const opportunity = { targetEntityId, attackerEntityId, tick, triggerKind: "limbCleave" as const };
    if (calculateTraumaticWoundOpportunityRoll(battleSeed, opportunity) < 100) return opportunity;
  }
  throw new Error("Expected a deterministic traumatic-wound opportunity.");
}

function createStageSamples(): Record<Milestone6CasualtyTickStage, Float64Array> {
  return Object.fromEntries(
    casualtyStages().map((stage) => [stage, new Float64Array(MEASURED_TICKS)]),
  ) as Record<Milestone6CasualtyTickStage, Float64Array>;
}

function casualtyStages(): readonly Milestone6CasualtyTickStage[] {
  return [
    "casualtyTransitions", "deathCountAdvancement", "traumaProcessing",
    "medicalQueries", "rescueSelection", "dragMovement", "claimsAndTriage",
    "treatmentAndComfort", "execution", "respawnEgress",
    "consolidationAndHistory",
  ];
}

function timingReport(samples: Float64Array): TimingReport {
  const ordered = Array.from(samples).sort((left, right) => left - right);
  let total = 0;
  let maximum = 0;
  for (const sample of samples) {
    total += sample;
    maximum = Math.max(maximum, sample);
  }
  return {
    meanMilliseconds: total / samples.length,
    maximumMilliseconds: maximum,
    p95Milliseconds: ordered[Math.ceil(ordered.length * 0.95) - 1]!,
  };
}

function createStructuralTotals(): StructuralTotals {
  return {
    casualtyTransitions: 0, deathCountAdvancement: 0, traumaOpportunities: 0,
    traumaApplied: 0, medicalQueryPreparations: 0, medicalCandidates: 0,
    rescueSelections: 0, dragParticipantMoves: 0, claimsAndHandoffs: 0,
    treatmentTransitions: 0, executionTransitions: 0, comfortTransitions: 0,
    egressTransitions: 0, consolidationUnits: 0, maximumActiveDragGroups: 0,
    maximumActiveTreatmentActions: 0, maximumActiveExecutionActions: 0,
  };
}

function compositionFor(caseName: MatrixCase): string {
  if (caseName === "ordinaryRepresentative") {
    return "2,000 entities, 100x20 units, 5% dying, 5% clustered medical roles, small trauma/limb populations.";
  }
  if (caseName === "casualtyHeavyRepresentative") {
    return "2,000 entities, 20% dying/terminal, bounded rescue/triage/treatment/comfort/egress activity.";
  }
  return "Pathological dense-collapse stress: 2,000 entities with 40% casualties in explicitly overlapping local geometry.";
}

function matrixCaseIdentity(caseName: MatrixCase): number {
  return caseName === "ordinaryRepresentative" ? 1
    : caseName === "casualtyHeavyRepresentative" ? 2 : 3;
}

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId, defenderEntityId, attackerWeaponCategory: "oneHanded",
    defenderActiveWeaponCategory: "oneHanded", defenderShieldCategory: "none",
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
