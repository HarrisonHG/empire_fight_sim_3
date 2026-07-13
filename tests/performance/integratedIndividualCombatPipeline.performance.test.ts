import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  advanceIndividualCombatPipelineObservationOneTick,
  type IndividualCombatPipelineStage,
} from "../../src/sim/individualCombatPipeline";
import { compareIndividualCombatShadow } from "../../src/sim/individualCombatConsequences";
import { advanceFormationOneTick } from "../../src/sim/formationBehaviour";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  CombatSandboxUnitScenario,
  SimulationBounds,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";

const MEASURED_TICKS = 30;
const FULL_LIVE_WARM_UP_TICKS = 5;

describe("integrated individual combat pipeline performance", () => {
  it.each([100, 500, 1_000])(
    "reports integrated individual observation path timing for %i entities",
    (entityCount) => {
      const report = runIntegratedIndividualPerformance(entityCount);
      assertReport(report, entityCount);
      writeReport(report);
    },
  );

  it(
    "reports integrated individual observation path timing for 2,000 entities",
    () => {
      const report = runIntegratedIndividualPerformance(2_000);
      assertReport(report, 2_000);
      expect(report.membersPerUnit).toBe(20);
      writeReport(report);
    },
    30_000,
  );
});

interface StageTimingReport {
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
}

interface IntegratedIndividualPerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly measuredTicks: number;
  readonly eligibility: StageTimingReport;
  readonly targetSelection: StageTimingReport;
  readonly action: StageTimingReport;
  readonly defence: StageTimingReport;
  readonly gate: StageTimingReport;
  readonly hitApplication: StageTimingReport;
  readonly aggregationClarification: StageTimingReport;
  readonly consequenceProjection: StageTimingReport;
  readonly shadowComparison: StageTimingReport;
  readonly totalIndividualPipeline: StageTimingReport;
  readonly selectedTargetRecords: number;
  readonly attackAttempts: number;
  readonly invalidatedAttacks: number;
  readonly parries: number;
  readonly bucklerBlocks: number;
  readonly shieldBlocks: number;
  readonly landedDefenceOutcomes: number;
  readonly gateAcceptedHits: number;
  readonly gateRejectedHits: number;
  readonly appliedHitLoss: number;
  readonly zeroHitTransitions: number;
  readonly activeRelationships: number;
  readonly fullSandboxReference: StageTimingReport & {
    readonly warmUpTicks: number;
    readonly legacyOpportunities: number;
    readonly legacyApplications: number;
    readonly legacyConsequences: number;
  };
  readonly timingPolicy: string;
}

function runIntegratedIndividualPerformance(
  entityCount: number,
): IntegratedIndividualPerformanceReport {
  const scenario = ordinaryUnitScenario(entityCount);
  const simulation = createSimulation(scenario);
  const combat = requireCombatSandbox(simulation);
  const stageSamples = createStageSamples();
  const shadowComparisonSamples = new Float64Array(MEASURED_TICKS);
  const totalSamples = new Float64Array(MEASURED_TICKS);
  let selectedTargetRecords = 0;
  let attackAttempts = 0;
  let invalidatedAttacks = 0;
  let parries = 0;
  let bucklerBlocks = 0;
  let shieldBlocks = 0;
  let landedDefenceOutcomes = 0;
  let gateAcceptedHits = 0;
  let gateRejectedHits = 0;
  let appliedHitLoss = 0;
  let zeroHitTransitions = 0;
  let activeRelationships = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    advanceFormationOneTick(
      simulation.world,
      combat.identityStore,
      combat.formationStore,
    );
    const startedAt = performance.now();
    const result = advanceIndividualCombatPipelineObservationOneTick(
      simulation.world,
      combat.identityStore,
      combat.formationStore,
      combat.individualCombatPipelineStores,
      combat.individualCombatPipelineBuffers,
      tick,
      {
        runStage: (stage, run) => {
          const stageStartedAt = performance.now();
          const stageResult = run();
          stageSamples[stage][tick] = performance.now() - stageStartedAt;
          return stageResult;
        },
      },
    );
    const shadowComparisonStartedAt = performance.now();
    compareIndividualCombatShadow(
      combat.identityStore,
      combat.consequenceApplications,
      result.consequenceSummaries,
      combat.individualCombatConsequenceProjectionStore,
    );
    shadowComparisonSamples[tick] =
      performance.now() - shadowComparisonStartedAt;
    totalSamples[tick] = performance.now() - startedAt;
    selectedTargetRecords += result.selectedTargetCount;
    attackAttempts += result.attackAttemptCount;
    invalidatedAttacks += result.invalidatedAttackCount;
    parries += result.parryCount;
    bucklerBlocks += result.bucklerBlockCount;
    shieldBlocks += result.shieldBlockCount;
    landedDefenceOutcomes += result.landedDefenceOutcomeCount;
    gateAcceptedHits += result.gateAcceptedHitCount;
    gateRejectedHits += result.gateRejectedHitCount;
    appliedHitLoss += result.appliedHitLoss;
    zeroHitTransitions += result.zeroHitTransitionCount;
    activeRelationships = result.activeGateRelationshipCount;
  }

  const fullSandboxReference = runFullSandboxReference(entityCount);
  const membersPerUnit = membersPerUnitFor(entityCount);
  return {
    entityCount,
    unitCount: entityCount / membersPerUnit,
    membersPerUnit,
    worldBounds: scenario.bounds,
    measuredTicks: MEASURED_TICKS,
    eligibility: timingReport(stageSamples.eligibility),
    targetSelection: timingReport(stageSamples.targetSelection),
    action: timingReport(stageSamples.action),
    defence: timingReport(stageSamples.defence),
    gate: timingReport(stageSamples.gate),
    hitApplication: timingReport(stageSamples.globalHits),
    aggregationClarification: timingReport(stageSamples.aggregation),
    consequenceProjection: timingReport(stageSamples.consequenceProjection),
    shadowComparison: timingReport(shadowComparisonSamples),
    totalIndividualPipeline: timingReport(totalSamples),
    selectedTargetRecords,
    attackAttempts,
    invalidatedAttacks,
    parries,
    bucklerBlocks,
    shieldBlocks,
    landedDefenceOutcomes,
    gateAcceptedHits,
    gateRejectedHits,
    appliedHitLoss,
    zeroHitTransitions,
    activeRelationships,
    fullSandboxReference,
    timingPolicy:
      "Structural assertions only; real formation/world state and persistent individual stores are used. Full sandbox reference is reported separately and includes the temporary observation path.",
  };
}

function runFullSandboxReference(
  entityCount: number,
): IntegratedIndividualPerformanceReport["fullSandboxReference"] {
  const simulation = createSimulation(legacyProductionReferenceScenario(entityCount));
  const samples = new Float64Array(MEASURED_TICKS);
  for (let tick = 0; tick < FULL_LIVE_WARM_UP_TICKS; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    advanceSimulationOneTick(simulation);
    samples[tick] = performance.now() - startedAt;
  }
  const combat = requireCombatSandbox(simulation);
  return {
    ...timingReport(samples),
    warmUpTicks: FULL_LIVE_WARM_UP_TICKS,
    legacyOpportunities: combat.totalOpportunityCount,
    legacyApplications: combat.totalSurvivabilityApplicationCount,
    legacyConsequences: combat.totalConsequenceCount,
  };
}

function ordinaryUnitScenario(entityCount: number): SimulationScenario {
  const membersPerUnit = membersPerUnitFor(entityCount);
  expect(entityCount % (membersPerUnit * 2)).toBe(0);
  const unitCount = entityCount / membersPerUnit;
  const pairCount = unitCount / 2;
  const worldBounds = {
    width: pairCount * 44 + 96,
    height: 320,
  };
  const units: CombatSandboxUnitScenario[] = [];
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const y = 40 + (pairIndex % 10) * 24;
    const laneX = 48 + Math.floor(pairIndex / 10) * 44;
    const firstUnitId = pairIndex * 2 + 1;
    const secondUnitId = firstUnitId + 1;
    units.push(
      unitConfig(firstUnitId, 1, membersPerUnit, laneX, y, 1, {
        weaponCategory: "oneHanded",
        weaponReachBand: "short",
        shieldClass: "none",
      }),
      unitConfig(secondUnitId, 2, membersPerUnit, laneX + 10, y, -1, {
        weaponCategory: "unarmed",
        weaponReachBand: "none",
        shieldClass: "shield",
      }),
    );
  }
  return {
    seed: 0x5f10 + entityCount,
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

function legacyProductionReferenceScenario(entityCount: number): SimulationScenario {
  const membersPerUnit = membersPerUnitFor(entityCount);
  expect(entityCount % (membersPerUnit * 2)).toBe(0);
  const unitCount = entityCount / membersPerUnit;
  const pairCount = unitCount / 2;
  const worldBounds = {
    width: pairCount * 44 + 96,
    height: 320,
  };
  const units: CombatSandboxUnitScenario[] = [];
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const y = 40 + (pairIndex % 10) * 24;
    const laneX = 48 + Math.floor(pairIndex / 10) * 44;
    const firstUnitId = pairIndex * 2 + 1;
    const secondUnitId = firstUnitId + 1;
    units.push(
      unitConfig(firstUnitId, 1, membersPerUnit, laneX, y, 1, {
        weaponCategory: "oneHanded",
        weaponReachBand: "short",
        shieldClass: "none",
        order: "advance",
        unitSpeed: 1,
      }),
      unitConfig(secondUnitId, 2, membersPerUnit, laneX + 10, y, -1, {
        weaponCategory: "oneHanded",
        weaponReachBand: "short",
        shieldClass: "none",
        order: "advance",
        unitSpeed: 1,
      }),
    );
  }
  return {
    seed: 0x5f20 + entityCount,
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

function unitConfig(
  unitId: number,
  factionId: number,
  memberCount: number,
  anchorX: number,
  anchorY: number,
  headingX: -1 | 1,
  overrides: Pick<
    CombatSandboxUnitScenario,
    "weaponCategory" | "weaponReachBand" | "shieldClass"
  > &
    Partial<Pick<CombatSandboxUnitScenario, "order" | "unitSpeed">>,
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
    unitSpeed: overrides.unitSpeed ?? 0,
    order: overrides.order ?? "hold",
    role: "regular",
    memberMaxStep: 1,
    weaponCategory: overrides.weaponCategory,
    weaponReachBand: overrides.weaponReachBand,
    armourClass: "none",
    shieldClass: overrides.shieldClass,
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
  };
}

function membersPerUnitFor(entityCount: number): number {
  return entityCount >= 1_000 ? 20 : 10;
}

function createStageSamples(): Record<
  IndividualCombatPipelineStage,
  Float64Array
> {
  return {
    eligibility: new Float64Array(MEASURED_TICKS),
    targetSelection: new Float64Array(MEASURED_TICKS),
    action: new Float64Array(MEASURED_TICKS),
    defence: new Float64Array(MEASURED_TICKS),
    gate: new Float64Array(MEASURED_TICKS),
    globalHits: new Float64Array(MEASURED_TICKS),
    aggregation: new Float64Array(MEASURED_TICKS),
    consequenceProjection: new Float64Array(MEASURED_TICKS),
  };
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

function assertReport(
  report: IntegratedIndividualPerformanceReport,
  entityCount: number,
): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.membersPerUnit).toBeGreaterThanOrEqual(5);
  expect(report.membersPerUnit).toBeLessThanOrEqual(30);
  expect(report.selectedTargetRecords).toBeGreaterThan(0);
  expect(report.attackAttempts).toBeGreaterThan(0);
  expect(report.parries + report.bucklerBlocks + report.shieldBlocks)
    .toBeGreaterThan(0);
  expect(report.landedDefenceOutcomes).toBeGreaterThan(0);
  expect(report.gateAcceptedHits).toBeGreaterThan(0);
  expect(report.gateRejectedHits).toBeGreaterThan(0);
  expect(report.appliedHitLoss).toBeGreaterThan(0);
  expect(report.activeRelationships).toBeGreaterThan(0);
  expect(report.fullSandboxReference.legacyOpportunities).toBeGreaterThanOrEqual(0);
  expect(report.fullSandboxReference.legacyApplications).toBeGreaterThanOrEqual(0);
  expect(report.fullSandboxReference.legacyConsequences).toBeGreaterThanOrEqual(0);
  for (const timing of [
    report.targetSelection,
    report.action,
    report.defence,
    report.gate,
    report.hitApplication,
    report.aggregationClarification,
    report.consequenceProjection,
    report.shadowComparison,
    report.eligibility,
    report.totalIndividualPipeline,
    report.fullSandboxReference,
  ]) {
    expect(timing.meanMillisecondsPerTick).toBeGreaterThanOrEqual(0);
    expect(timing.maximumMillisecondsPerTick).toBeGreaterThanOrEqual(0);
    expect(timing.p95MillisecondsPerTick).toBeGreaterThanOrEqual(0);
  }
}

function requireCombatSandbox(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected combat sandbox state.");
  }
  return simulation.combatSandbox;
}

function writeReport(report: IntegratedIndividualPerformanceReport): void {
  process.stdout.write(
    `\nIntegrated individual combat pipeline performance report\n${JSON.stringify(report, null, 2)}\n`,
  );
}
