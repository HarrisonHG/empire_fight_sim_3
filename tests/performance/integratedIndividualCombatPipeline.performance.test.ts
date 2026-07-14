import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  createFormationTickDiagnostics,
  resetFormationTickDiagnostics,
  type FormationTickDiagnostics,
} from "../../src/sim/formationBehaviour";
import { LOCAL_HOSTILE_THREAT_RADIUS } from "../../src/sim/moraleMovement";
import {
  advanceCombatSandboxOneTick,
  advanceSimulationOneTick,
  createSimulation,
  type CombatSandboxTickStage,
} from "../../src/sim/simulation";
import type {
  CombatSandboxUnitScenario,
  SimulationBounds,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";
import { getUnitIds, getUnitMembers } from "../../src/sim/unitIdentity";

const WARM_UP_TICKS = 20;
const MEASURED_TICKS = 100;
const TWO_THOUSAND_ENTITY_TIMEOUT_MS = 120_000;

type AuthorityGeometry =
  | "representativeSeparatedBattle"
  | "denseOverlappingFormations";

describe("integrated individual combat authority performance", () => {
  it.each([100, 500, 1_000])(
    "reports exact production and instrumented authority timing for %i representative entities",
    (entityCount) => {
      const report = runAuthorityLivePerformance(
        "representativeSeparatedBattle",
        authorityScenario(entityCount, "representativeSeparatedBattle"),
      );

      assertPerformanceReport(report, entityCount);
      expect(report.minimumCrossLaneEntitySeparation).toBeGreaterThan(
        LOCAL_HOSTILE_THREAT_RADIUS,
      );
      writeReport(report);
    },
    TWO_THOUSAND_ENTITY_TIMEOUT_MS,
  );

  it(
    "reports representative separated authority timing for 2,000 entities",
    () => {
      const report = runAuthorityLivePerformance(
        "representativeSeparatedBattle",
        authorityScenario(2_000, "representativeSeparatedBattle"),
      );

      assertPerformanceReport(report, 2_000);
      expect(report.membersPerUnit).toBe(20);
      expect(report.minimumCrossLaneEntitySeparation).toBeGreaterThan(
        LOCAL_HOSTILE_THREAT_RADIUS,
      );
      writeReport(report);
    },
    TWO_THOUSAND_ENTITY_TIMEOUT_MS,
  );

  it(
    "reports representative exact production timing with bounded inspection enabled",
    () => {
      const disabledScenario = authorityScenario(
        2_000,
        "representativeSeparatedBattle",
      );
      const enabledScenario = withInspectedEntityIds(disabledScenario, [
        0,
        1,
        20,
        21,
      ]);
      const disabled = runExactProductionTickReference(disabledScenario);
      const enabled = runExactProductionTickReference(enabledScenario);

      expect(disabled.minimumCrossLaneEntitySeparation).toBeGreaterThan(
        LOCAL_HOSTILE_THREAT_RADIUS,
      );
      expect(enabled.minimumCrossLaneEntitySeparation).toBeGreaterThan(
        LOCAL_HOSTILE_THREAT_RADIUS,
      );
      assertTiming(disabled.exactProductionTick);
      assertTiming(enabled.exactProductionTick);
      process.stdout.write(
        `\nBounded inspection exact-production timing report\n${JSON.stringify(
          {
            entityCount: disabledScenario.entityCount,
            inspectedEntityIds: enabledScenario.combatSandbox
              ?.inspectedEntityIds,
            inspectionDisabled: disabled.exactProductionTick,
            inspectionEnabled: enabled.exactProductionTick,
          },
          null,
          2,
        )}\n`,
      );
    },
    TWO_THOUSAND_ENTITY_TIMEOUT_MS,
  );

  it(
    "reports dense overlapping stress timing for 2,000 entities",
    () => {
      const report = runAuthorityLivePerformance(
        "denseOverlappingFormations",
        authorityScenario(2_000, "denseOverlappingFormations"),
      );

      assertPerformanceReport(report, 2_000);
      expect(report.minimumCrossLaneEntitySeparation).toBeLessThan(
        LOCAL_HOSTILE_THREAT_RADIUS,
      );
      expect(
        report.instrumentedCoreStages[0].formationCounters
          .blockerDetectionCandidateEntities.total,
      ).toBeGreaterThan(0);
      writeReport(report);
    },
    TWO_THOUSAND_ENTITY_TIMEOUT_MS,
  );

  it("matches exact production and instrumented core states deterministically", () => {
    const scenario = authorityScenario(500, "representativeSeparatedBattle");
    const exact = createSimulation(scenario);
    const instrumented = createSimulation(scenario);
    const diagnostics = createFormationTickDiagnostics();
    const stageCalls = new Map<CombatSandboxTickStage, number>();
    diagnostics.runStage = (_stage, run) => run();

    for (let tick = 0; tick < 60; tick += 1) {
      advanceSimulationOneTick(exact);
      resetFormationTickDiagnostics(diagnostics);
      advanceNoOpInstrumentedTick(instrumented, diagnostics, stageCalls);
    }

    expect(summarizeAuthorityState(instrumented)).toEqual(
      summarizeAuthorityState(exact),
    );
    expect(stageCalls).toEqual(
      new Map<CombatSandboxTickStage, number>([
        ["formation", 60],
        ["individualPipeline", 60],
        ["individualPressureAndCohesion", 60],
        ["routingContagion", 60],
        ["recoveryThreat", 60],
        ["moraleAssessmentAndPersistence", 60],
        ["countersAndSnapshots", 60],
      ]),
    );
    expect(diagnostics.memberSlotEvaluations).toBeGreaterThan(0);
  });
});

interface StageTimingReport {
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
}

interface CounterReport {
  readonly total: number;
  readonly meanPerTick: number;
  readonly maximumPerTick: number;
}

interface FormationCounterReport {
  readonly blockerGridBuilds: CounterReport;
  readonly blockerDetectionQueries: CounterReport;
  readonly blockerDetectionCandidateEntities: CounterReport;
  readonly blockerDetectionUniqueCandidateUnits: CounterReport;
  readonly hostileContactQueries: CounterReport;
  readonly hostileContactCandidateEntities: CounterReport;
  readonly sameUnitOvertakingComparisons: CounterReport;
  readonly memberSlotEvaluations: CounterReport;
  readonly routingUnitCount: CounterReport;
  readonly recoveringUnitCount: CounterReport;
  readonly routingPassThroughInteractions: CounterReport;
}

interface ExactProductionTickRun {
  readonly warmUpTicks: number;
  readonly measuredTicks: number;
  readonly exactProductionTick: StageTimingReport;
  readonly minimumCrossLaneEntitySeparation: number;
}

interface InstrumentedCoreStageRun {
  readonly warmUpTicks: number;
  readonly measuredTicks: number;
  readonly formation: StageTimingReport;
  readonly blockerGridBuild: StageTimingReport;
  readonly individualPipeline: StageTimingReport;
  readonly individualPressureAndCohesion: StageTimingReport;
  readonly routingContagion: StageTimingReport;
  readonly recoveryThreat: StageTimingReport;
  readonly moraleAssessmentAndPersistence: StageTimingReport;
  readonly countersAndDebugSnapshots: StageTimingReport;
  readonly instrumentedCoreStagesWithoutTickIncrement: StageTimingReport;
  readonly formationCounters: FormationCounterReport;
  readonly minimumCrossLaneEntitySeparation: number;
}

interface AuthorityLivePerformanceReport {
  readonly caseName: AuthorityGeometry;
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly laneSpacing: number;
  readonly relevantLocalInteractionRange: number;
  readonly minimumCrossLaneEntitySeparation: number;
  readonly exactProductionTickRuns: readonly [
    ExactProductionTickRun,
    ExactProductionTickRun,
  ];
  readonly instrumentedCoreStages: readonly [
    InstrumentedCoreStageRun,
    InstrumentedCoreStageRun,
  ];
  readonly timingPolicy: string;
}

function runAuthorityLivePerformance(
  caseName: AuthorityGeometry,
  scenario: SimulationScenario,
): AuthorityLivePerformanceReport {
  const membersPerUnit = membersPerUnitFor(scenario.entityCount);
  const exactProductionTickRuns = [
    runExactProductionTickReference(scenario),
    runExactProductionTickReference(scenario),
  ] as const;
  const instrumentedCoreStages = [
    runInstrumentedCoreStageReference(scenario),
    runInstrumentedCoreStageReference(scenario),
  ] as const;
  const minimumCrossLaneEntitySeparation = Math.min(
    exactProductionTickRuns[0].minimumCrossLaneEntitySeparation,
    exactProductionTickRuns[1].minimumCrossLaneEntitySeparation,
    instrumentedCoreStages[0].minimumCrossLaneEntitySeparation,
    instrumentedCoreStages[1].minimumCrossLaneEntitySeparation,
  );

  return {
    caseName,
    entityCount: scenario.entityCount,
    unitCount: scenario.entityCount / membersPerUnit,
    membersPerUnit,
    worldBounds: scenario.bounds,
    laneSpacing: laneSpacingFor(caseName),
    relevantLocalInteractionRange: LOCAL_HOSTILE_THREAT_RADIUS,
    minimumCrossLaneEntitySeparation,
    exactProductionTickRuns,
    instrumentedCoreStages,
    timingPolicy:
      "Structural assertions only; exactProductionTick measures advanceSimulationOneTick. instrumentedCoreStages shares the production combat-sandbox tick helper but reports stage boundaries without calling that sum a complete live tick.",
  };
}

function runExactProductionTickReference(
  scenario: SimulationScenario,
): ExactProductionTickRun {
  const simulation = createSimulation(scenario);
  const laneMembers = collectLaneMembers(simulation, scenario);
  const samples = new Float64Array(MEASURED_TICKS);
  let minimumCrossLaneEntitySeparation =
    computeAdjacentLaneMinimumSeparation(simulation, laneMembers);

  for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) {
    advanceSimulationOneTick(simulation);
  }

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    advanceSimulationOneTick(simulation);
    samples[tick] = performance.now() - startedAt;
    minimumCrossLaneEntitySeparation = Math.min(
      minimumCrossLaneEntitySeparation,
      computeAdjacentLaneMinimumSeparation(simulation, laneMembers),
    );
  }

  expect(simulation.world.entityCount).toBe(scenario.entityCount);
  return {
    warmUpTicks: WARM_UP_TICKS,
    measuredTicks: MEASURED_TICKS,
    exactProductionTick: timingReport(samples),
    minimumCrossLaneEntitySeparation,
  };
}

function runInstrumentedCoreStageReference(
  scenario: SimulationScenario,
): InstrumentedCoreStageRun {
  const simulation = createSimulation(scenario);
  const laneMembers = collectLaneMembers(simulation, scenario);
  const stageSamples = createCombatSandboxStageSamples();
  const blockerGridBuildSamples = new Float64Array(MEASURED_TICKS);
  const totalSamples = new Float64Array(MEASURED_TICKS);
  const diagnostics = createFormationTickDiagnostics();
  const counterSamples = createFormationCounterSamples();
  let sampleIndex = 0;
  let minimumCrossLaneEntitySeparation =
    computeAdjacentLaneMinimumSeparation(simulation, laneMembers);

  diagnostics.runStage = (stage, run) => {
    const startedAt = performance.now();
    const result = run();
    if (stage === "blockerGridBuild") {
      blockerGridBuildSamples[sampleIndex]! += performance.now() - startedAt;
    }
    return result;
  };

  for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) {
    advanceSimulationOneTick(simulation);
  }

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    resetFormationTickDiagnostics(diagnostics);
    sampleIndex = tick;
    const startedAt = performance.now();
    advanceCombatSandboxOneTick(
      simulation.world,
      requireCombatSandbox(simulation),
      simulation.tick,
      {
        formationDiagnostics: diagnostics,
        runStage: (stage, run) => {
          const stageStartedAt = performance.now();
          const result = run();
          stageSamples[stage]![tick]! += performance.now() - stageStartedAt;
          return result;
        },
      },
    );
    totalSamples[tick] = performance.now() - startedAt;
    simulation.tick += 1;
    recordFormationCounters(counterSamples, diagnostics, tick);
    minimumCrossLaneEntitySeparation = Math.min(
      minimumCrossLaneEntitySeparation,
      computeAdjacentLaneMinimumSeparation(simulation, laneMembers),
    );
  }

  return {
    warmUpTicks: WARM_UP_TICKS,
    measuredTicks: MEASURED_TICKS,
    formation: timingReport(stageSamples.formation),
    blockerGridBuild: timingReport(blockerGridBuildSamples),
    individualPipeline: timingReport(stageSamples.individualPipeline),
    individualPressureAndCohesion: timingReport(
      stageSamples.individualPressureAndCohesion,
    ),
    routingContagion: timingReport(stageSamples.routingContagion),
    recoveryThreat: timingReport(stageSamples.recoveryThreat),
    moraleAssessmentAndPersistence: timingReport(
      stageSamples.moraleAssessmentAndPersistence,
    ),
    countersAndDebugSnapshots: timingReport(stageSamples.countersAndSnapshots),
    instrumentedCoreStagesWithoutTickIncrement: timingReport(totalSamples),
    formationCounters: summarizeFormationCounters(counterSamples),
    minimumCrossLaneEntitySeparation,
  };
}

function advanceNoOpInstrumentedTick(
  simulation: SimulationState,
  diagnostics: FormationTickDiagnostics,
  stageCalls: Map<CombatSandboxTickStage, number>,
): void {
  advanceCombatSandboxOneTick(
    simulation.world,
    requireCombatSandbox(simulation),
    simulation.tick,
    {
      formationDiagnostics: diagnostics,
      runStage: (stage, run) => {
        stageCalls.set(stage, (stageCalls.get(stage) ?? 0) + 1);
        return run();
      },
    },
  );
  simulation.tick += 1;
}

function createCombatSandboxStageSamples(): Record<
  CombatSandboxTickStage,
  Float64Array
> {
  return {
    formation: new Float64Array(MEASURED_TICKS),
    individualPipeline: new Float64Array(MEASURED_TICKS),
    individualPressureAndCohesion: new Float64Array(MEASURED_TICKS),
    routingContagion: new Float64Array(MEASURED_TICKS),
    recoveryThreat: new Float64Array(MEASURED_TICKS),
    moraleAssessmentAndPersistence: new Float64Array(MEASURED_TICKS),
    countersAndSnapshots: new Float64Array(MEASURED_TICKS),
  };
}

function createFormationCounterSamples(): Record<
  keyof Omit<FormationTickDiagnostics, "runStage">,
  Float64Array
> {
  return {
    blockerGridBuilds: new Float64Array(MEASURED_TICKS),
    blockerDetectionQueries: new Float64Array(MEASURED_TICKS),
    blockerDetectionCandidateEntities: new Float64Array(MEASURED_TICKS),
    blockerDetectionUniqueCandidateUnits: new Float64Array(MEASURED_TICKS),
    hostileContactQueries: new Float64Array(MEASURED_TICKS),
    hostileContactCandidateEntities: new Float64Array(MEASURED_TICKS),
    sameUnitOvertakingComparisons: new Float64Array(MEASURED_TICKS),
    memberSlotEvaluations: new Float64Array(MEASURED_TICKS),
    routingUnitCount: new Float64Array(MEASURED_TICKS),
    recoveringUnitCount: new Float64Array(MEASURED_TICKS),
    routingPassThroughInteractions: new Float64Array(MEASURED_TICKS),
  };
}

function recordFormationCounters(
  samples: Record<keyof Omit<FormationTickDiagnostics, "runStage">, Float64Array>,
  diagnostics: FormationTickDiagnostics,
  tick: number,
): void {
  samples.blockerGridBuilds[tick] = diagnostics.blockerGridBuilds;
  samples.blockerDetectionQueries[tick] = diagnostics.blockerDetectionQueries;
  samples.blockerDetectionCandidateEntities[tick] =
    diagnostics.blockerDetectionCandidateEntities;
  samples.blockerDetectionUniqueCandidateUnits[tick] =
    diagnostics.blockerDetectionUniqueCandidateUnits;
  samples.hostileContactQueries[tick] = diagnostics.hostileContactQueries;
  samples.hostileContactCandidateEntities[tick] =
    diagnostics.hostileContactCandidateEntities;
  samples.sameUnitOvertakingComparisons[tick] =
    diagnostics.sameUnitOvertakingComparisons;
  samples.memberSlotEvaluations[tick] = diagnostics.memberSlotEvaluations;
  samples.routingUnitCount[tick] = diagnostics.routingUnitCount;
  samples.recoveringUnitCount[tick] = diagnostics.recoveringUnitCount;
  samples.routingPassThroughInteractions[tick] =
    diagnostics.routingPassThroughInteractions;
}

function summarizeFormationCounters(
  samples: Record<keyof Omit<FormationTickDiagnostics, "runStage">, Float64Array>,
): FormationCounterReport {
  return {
    blockerGridBuilds: counterReport(samples.blockerGridBuilds),
    blockerDetectionQueries: counterReport(samples.blockerDetectionQueries),
    blockerDetectionCandidateEntities: counterReport(
      samples.blockerDetectionCandidateEntities,
    ),
    blockerDetectionUniqueCandidateUnits: counterReport(
      samples.blockerDetectionUniqueCandidateUnits,
    ),
    hostileContactQueries: counterReport(samples.hostileContactQueries),
    hostileContactCandidateEntities: counterReport(
      samples.hostileContactCandidateEntities,
    ),
    sameUnitOvertakingComparisons: counterReport(
      samples.sameUnitOvertakingComparisons,
    ),
    memberSlotEvaluations: counterReport(samples.memberSlotEvaluations),
    routingUnitCount: counterReport(samples.routingUnitCount),
    recoveringUnitCount: counterReport(samples.recoveringUnitCount),
    routingPassThroughInteractions: counterReport(
      samples.routingPassThroughInteractions,
    ),
  };
}

function counterReport(samples: Float64Array): CounterReport {
  let total = 0;
  let maximum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    total += sample;
    maximum = Math.max(maximum, sample);
  }
  return {
    total,
    meanPerTick: total / samples.length,
    maximumPerTick: maximum,
  };
}

function authorityScenario(
  entityCount: number,
  geometry: AuthorityGeometry,
): SimulationScenario {
  const membersPerUnit = membersPerUnitFor(entityCount);
  expect(entityCount % (membersPerUnit * 2)).toBe(0);
  const unitCount = entityCount / membersPerUnit;
  const pairCount = unitCount / 2;
  const laneSpacing = laneSpacingFor(geometry);
  const denseRows = 10;
  const denseColumnSpacing = 44;
  const units: CombatSandboxUnitScenario[] = [];
  const worldBounds =
    geometry === "denseOverlappingFormations"
      ? {
          width: Math.ceil(pairCount / denseRows) * denseColumnSpacing + 160,
          height: 120 + denseRows * laneSpacing + 160,
        }
      : {
          width: 260,
          height: 120 + pairCount * laneSpacing + 160,
        };

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const row =
      geometry === "denseOverlappingFormations"
        ? pairIndex % denseRows
        : pairIndex;
    const column =
      geometry === "denseOverlappingFormations"
        ? Math.floor(pairIndex / denseRows)
        : 0;
    const y = 120 + row * laneSpacing;
    const laneX = 96 + column * denseColumnSpacing;
    const firstUnitId = pairIndex * 2 + 1;
    const secondUnitId = firstUnitId + 1;
    units.push(
      unitConfig(firstUnitId, 1, membersPerUnit, laneX, y, 1),
      unitConfig(secondUnitId, 2, membersPerUnit, laneX + 10, y, -1),
    );
  }

  return {
    seed:
      (geometry === "denseOverlappingFormations" ? 0x5f30 : 0x5f20) +
      entityCount,
    entityCount,
    bounds: worldBounds,
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units,
    },
  };
}

function withInspectedEntityIds(
  scenario: SimulationScenario,
  inspectedEntityIds: readonly number[],
): SimulationScenario {
  const combatSandbox = scenario.combatSandbox;
  if (combatSandbox === undefined) {
    throw new Error("Expected combat sandbox scenario.");
  }
  return {
    ...scenario,
    combatSandbox: {
      ...combatSandbox,
      inspectedEntityIds,
    },
  };
}

function laneSpacingFor(geometry: AuthorityGeometry): number {
  return geometry === "denseOverlappingFormations" ? 24 : 240;
}

function unitConfig(
  unitId: number,
  factionId: number,
  memberCount: number,
  anchorX: number,
  anchorY: number,
  headingX: -1 | 1,
): CombatSandboxUnitScenario {
  const cols = Math.min(10, memberCount);
  const rows = Math.ceil(memberCount / cols);
  return {
    unitId,
    factionId,
    memberCount,
    deploymentZone: {
      minX: anchorX,
      maxX: anchorX + 2,
      minY: anchorY,
      maxY: anchorY + 2,
    },
    anchorX,
    anchorY,
    headingX,
    headingY: 0,
    spacing: 4,
    rows,
    cols,
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
  };
}

function membersPerUnitFor(entityCount: number): number {
  return entityCount >= 1_000 ? 20 : 10;
}

function collectLaneMembers(
  simulation: SimulationState,
  scenario: SimulationScenario,
): readonly (readonly number[])[] {
  const combat = requireCombatSandbox(simulation);
  const units = scenario.combatSandbox?.units;
  if (units === undefined) {
    throw new Error("Expected combat sandbox scenario units.");
  }
  const lanes: number[][] = [];
  for (let index = 0; index < units.length; index += 2) {
    const firstUnit = units[index]!;
    const secondUnit = units[index + 1]!;
    lanes.push([
      ...getUnitMembers(combat.identityStore, firstUnit.unitId),
      ...getUnitMembers(combat.identityStore, secondUnit.unitId),
    ]);
  }
  return lanes;
}

function computeAdjacentLaneMinimumSeparation(
  simulation: SimulationState,
  laneMembers: readonly (readonly number[])[],
): number {
  if (laneMembers.length < 2) {
    return Number.POSITIVE_INFINITY;
  }
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;
  for (let laneIndex = 0; laneIndex < laneMembers.length - 1; laneIndex += 1) {
    const currentLane = laneMembers[laneIndex]!;
    const nextLane = laneMembers[laneIndex + 1]!;
    for (let currentIndex = 0; currentIndex < currentLane.length; currentIndex += 1) {
      const currentEntityId = currentLane[currentIndex]!;
      const currentX = simulation.world.positionsX[currentEntityId]!;
      const currentY = simulation.world.positionsY[currentEntityId]!;
      for (let nextIndex = 0; nextIndex < nextLane.length; nextIndex += 1) {
        const nextEntityId = nextLane[nextIndex]!;
        const deltaX = simulation.world.positionsX[nextEntityId]! - currentX;
        const deltaY = simulation.world.positionsY[nextEntityId]! - currentY;
        const distanceSquared = deltaX * deltaX + deltaY * deltaY;
        if (distanceSquared < minimumDistanceSquared) {
          minimumDistanceSquared = distanceSquared;
        }
      }
    }
  }
  return Math.sqrt(minimumDistanceSquared);
}

function timingReport(samples: Float64Array): StageTimingReport {
  let total = 0;
  let maximum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    total += sample;
    maximum = Math.max(maximum, sample);
  }
  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    meanMillisecondsPerTick: total / samples.length,
    maximumMillisecondsPerTick: maximum,
    p95MillisecondsPerTick:
      sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
  };
}

function assertPerformanceReport(
  report: AuthorityLivePerformanceReport,
  entityCount: number,
): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.membersPerUnit).toBeGreaterThanOrEqual(5);
  expect(report.membersPerUnit).toBeLessThanOrEqual(30);
  expect(report.minimumCrossLaneEntitySeparation).toBeGreaterThanOrEqual(0);
  for (const run of report.exactProductionTickRuns) {
    assertTiming(run.exactProductionTick);
  }
  for (const run of report.instrumentedCoreStages) {
    for (const timing of [
      run.formation,
      run.blockerGridBuild,
      run.individualPipeline,
      run.individualPressureAndCohesion,
      run.routingContagion,
      run.recoveryThreat,
      run.moraleAssessmentAndPersistence,
      run.countersAndDebugSnapshots,
      run.instrumentedCoreStagesWithoutTickIncrement,
    ]) {
      assertTiming(timing);
    }
    expect(run.formationCounters.memberSlotEvaluations.total).toBeGreaterThan(0);
    expect(run.formationCounters.sameUnitOvertakingComparisons.total)
      .toBeGreaterThan(0);
    expect(run.formationCounters.hostileContactQueries.total)
      .toBeGreaterThan(0);
  }
}

function assertTiming(timing: StageTimingReport): void {
  expect(timing.meanMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(timing.maximumMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(timing.p95MillisecondsPerTick).toBeGreaterThanOrEqual(0);
}

function summarizeAuthorityState(simulation: SimulationState): unknown {
  const combat = requireCombatSandbox(simulation);
  const unitIds = getUnitIds(combat.identityStore);
  return {
    tick: simulation.tick,
    entityCount: simulation.world.entityCount,
    ids: Array.from(simulation.world.ids),
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
    debugSnapshot: combat.debugSnapshot,
    moraleStates: unitIds.map((unitId) => ({
      unitId,
      movementState: combat.moraleMovementStates.get(unitId),
    })),
  };
}

function requireCombatSandbox(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected combat sandbox state.");
  }
  return simulation.combatSandbox;
}

function writeReport(report: AuthorityLivePerformanceReport): void {
  process.stdout.write(
    `\nAuthority-live individual combat performance report\n${JSON.stringify(report, null, 2)}\n`,
  );
}
