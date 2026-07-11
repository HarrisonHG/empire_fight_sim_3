import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  applyCombatConsequences,
  type CombatConsequenceApplication,
} from "../../src/sim/combatConsequences";
import {
  collectCombatMoraleAssessments,
  type CombatMoraleAssessment,
} from "../../src/sim/combatMorale";
import {
  advancePersistentMoraleOneTick,
  createPersistentMoraleStore,
  type PersistentMoraleEvent,
} from "../../src/sim/persistentMorale";
import {
  advanceCombatPressureOneTick,
  createCombatPressureStore,
  type UnitPressureUpdate,
} from "../../src/sim/combatPressure";
import {
  advanceRoutingContagionOneTick,
  createRoutingContagionStore,
  type UnitRoutingContagionSummary,
} from "../../src/sim/routingContagion";
import {
  advanceCombatPipelineOneTick,
  createCombatPipelineOutput,
} from "../../src/sim/combatPipeline";
import {
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
  isUnitDamageCapacityReached,
  type CombatSurvivabilityStore,
} from "../../src/sim/combatSurvivability";
import { createCombatTempoStore } from "../../src/sim/combatTempo";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getIndividualConfidence,
  getUnitMovementStyle,
  type FormationBehaviourStore,
  type IndividualBehaviourConfig,
  type UnitFormationConfig,
} from "../../src/sim/formationBehaviour";
import type { SimulationBounds, WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  getUnitIds,
  type UnitId,
  type UnitIdentityStore,
  getUnitMembers,
} from "../../src/sim/unitIdentity";
import {
  createUnitLoadoutStore,
  type UnitLoadoutStore,
} from "../../src/sim/unitLoadout";

const UNIT_COUNT = 40;
const MEMBERS_PER_UNIT = 50;
const ENTITY_COUNT = UNIT_COUNT * MEMBERS_PER_UNIT;
const PAIR_COUNT = UNIT_COUNT / 2;
const FORMATION_ROWS = 2;
const FORMATION_COLS = 25;
const FORMATION_SPACING = 6;
const MEMBER_MAX_STEP = 3;
const UNIT_SPEED = 1;
const ATTACK_INTERVAL_TICKS = 10;
const INITIAL_ATTACK_COOLDOWN_TICKS = 1;
const WARM_UP_TICKS = 3;
const MEASURED_TICKS = 40;
const PAIRS_PER_ROW = 5;
const PAIR_X_SPACING = 300;
const PAIR_Y_SPACING = 200;
const START_X = 200;
const START_Y = 100;
const TARGET_ANCHOR_OFFSET_X = 8;
const PERF_RNG_SEED = 0x4102;
const WORLD_BOUNDS: SimulationBounds = { width: 1_800, height: 900 };
const FOUR_A_BASELINE_MEAN_TICK_MILLISECONDS = 10.400075;
const FOUR_A_BASELINE_P95_TICK_MILLISECONDS = 21.9073;

describe("representative multi-person combat performance", () => {
  it(
    "reports the full formation-to-morale path for 40 units of 50 members",
    () => {
      const report = runRepresentativeCombatPerformanceScenario();

      expect(report.entityCount).toBe(ENTITY_COUNT);
      expect(report.unitCount).toBe(UNIT_COUNT);
      expect(report.membersPerUnit).toBe(MEMBERS_PER_UNIT);
      expect(report.sourceUnitCount).toBe(PAIR_COUNT);
      expect(report.targetUnitCount).toBe(PAIR_COUNT);
      expect(report.warmUpTicks).toBe(WARM_UP_TICKS);
      expect(report.measuredTicks).toBe(MEASURED_TICKS);
      expect(report.totalOpportunities).toBe(
        PAIR_COUNT * getExpectedOpportunityTickCount(MEASURED_TICKS),
      );
      expect(report.totalStrikes).toBe(report.totalOpportunities);
      expect(report.totalApplications).toBe(report.totalStrikes);
      expect(report.totalConsequences).toBe(report.totalApplications);
      expect(report.totalAppliedDamage).toBe(report.totalApplications);
      expect(report.totalMoraleAssessments).toBe(UNIT_COUNT * MEASURED_TICKS);
      expect(report.totalNonSteadyMoraleAssessments).toBeGreaterThan(0);
      expect(report.totalPressureUpdateMilliseconds).toBeGreaterThanOrEqual(0);
      expect(report.totalRoutingContagionMilliseconds).toBeGreaterThanOrEqual(0);
      expect(report.totalRoutingContagionSummaries).toBe(
        UNIT_COUNT * MEASURED_TICKS,
      );
      expect(report.finalSourceDamageTotal).toBe(0);
      expect(report.finalTargetDamageTotal).toBe(report.totalAppliedDamage);
      expect(report.capacityReachedCount).toBe(0);
      expect(report.finalWorldEntityCount).toBe(ENTITY_COUNT);
      expect(report.finalEntityIds).toEqual(
        Array.from({ length: ENTITY_COUNT }, (_, index) => index),
      );

      for (const value of [
        report.totalTickMilliseconds,
        report.meanTickMilliseconds,
        report.maximumTickMilliseconds,
        report.p95TickMilliseconds,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }

      writeRepresentativeCombatReport(report);
    },
    30_000,
  );
});

interface RepresentativeCombatHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: ReturnType<typeof createCombatTempoStore>;
  readonly survivability: CombatSurvivabilityStore;
  readonly sourceUnitIds: readonly UnitId[];
  readonly targetUnitIds: readonly UnitId[];
}

interface RepresentativeCombatPerformanceReport {
  readonly scenario: "40x50-opposing-formed-units";
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly sourceUnitCount: number;
  readonly targetUnitCount: number;
  readonly worldBounds: SimulationBounds;
  readonly warmUpTicks: number;
  readonly measuredTicks: number;
  readonly totalFormationEventCount: number;
  readonly totalOpportunities: number;
  readonly totalStrikes: number;
  readonly totalApplications: number;
  readonly totalConsequences: number;
  readonly totalMoraleAssessments: number;
  readonly totalNonSteadyMoraleAssessments: number;
  readonly totalPressureUpdateMilliseconds: number;
  readonly meanPressureUpdateMilliseconds: number;
  readonly totalRoutingContagionMilliseconds: number;
  readonly meanRoutingContagionMilliseconds: number;
  readonly totalRoutingContagionSummaries: number;
  readonly totalConfidenceSamplingMilliseconds: number;
  readonly meanConfidenceSamplingMilliseconds: number;
  readonly confidenceSamples: number;
  readonly fourABaselineMeanTickMilliseconds: number;
  readonly fourABaselineP95TickMilliseconds: number;
  readonly meanTickDeltaFromFourABaseline: number;
  readonly p95TickDeltaFromFourABaseline: number;
  readonly totalAppliedDamage: number;
  readonly finalSourceDamageTotal: number;
  readonly finalTargetDamageTotal: number;
  readonly capacityReachedCount: number;
  readonly totalTickMilliseconds: number;
  readonly meanTickMilliseconds: number;
  readonly maximumTickMilliseconds: number;
  readonly p95TickMilliseconds: number;
  readonly finalWorldEntityCount: number;
  readonly finalEntityIds: readonly number[];
}

function runRepresentativeCombatPerformanceScenario(): RepresentativeCombatPerformanceReport {
  const harness = createRepresentativeCombatHarness();
  const pipelineOutput = createCombatPipelineOutput();
  const consequenceOutput: CombatConsequenceApplication[] = [];
  const moraleOutput: CombatMoraleAssessment[] = [];
  const moraleEvents: PersistentMoraleEvent[] = [];
  const pressureUpdates: UnitPressureUpdate[] = [];
  const routingContagionSummaries: UnitRoutingContagionSummary[] = [];
  const routingContagionStore = createRoutingContagionStore(harness.identity);
  const contagionRoutingStates = new Map<UnitId, "routing">();
  for (let index = 0; index < harness.sourceUnitIds.length; index += 1) {
    contagionRoutingStates.set(harness.sourceUnitIds[index]!, "routing");
  }

  for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) {
    advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.formation,
    );
  }
  for (let index = 0; index < harness.sourceUnitIds.length; index += 1) {
    expect(
      getUnitMovementStyle(harness.formation, harness.sourceUnitIds[index]!),
    ).toBe("engageFront");
    expect(
      getUnitMovementStyle(harness.formation, harness.targetUnitIds[index]!),
    ).toBe("engageFront");
  }
  collectCombatMoraleAssessments(
    harness.identity,
    harness.formation,
    [],
    moraleOutput,
  );
  const persistentMoraleStore = createPersistentMoraleStore(
    harness.identity,
    harness.formation,
    moraleOutput,
  );
  const pressureStore = createCombatPressureStore(
    harness.identity,
    harness.formation,
  );

  const tickSamples = new Float64Array(MEASURED_TICKS);
  let totalTickMilliseconds = 0;
  let maximumTickMilliseconds = 0;
  let totalFormationEventCount = 0;
  let totalOpportunities = 0;
  let totalStrikes = 0;
  let totalApplications = 0;
  let totalConsequences = 0;
  let totalMoraleAssessments = 0;
  let totalNonSteadyMoraleAssessments = 0;
  let totalPressureUpdateMilliseconds = 0;
  let totalRoutingContagionMilliseconds = 0;
  let totalRoutingContagionSummaries = 0;
  let totalAppliedDamage = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const formationResult = advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.formation,
    );
    const pipelineResult = advanceCombatPipelineOneTick(
      harness.world,
      harness.identity,
      harness.loadout,
      harness.formation,
      harness.tempo,
      harness.survivability,
      pipelineOutput,
    );
    const consequenceResult = applyCombatConsequences(
      harness.identity,
      harness.formation,
      pipelineResult.applications,
      consequenceOutput,
    );
    const pressureStartedAt = performance.now();
    advanceCombatPressureOneTick(
      harness.identity,
      harness.formation,
      pipelineResult.opportunities,
      consequenceResult.applications,
      pressureStore,
      pressureUpdates,
    );
    totalPressureUpdateMilliseconds += performance.now() - pressureStartedAt;
    const contagionStartedAt = performance.now();
    const contagionResult = advanceRoutingContagionOneTick(
      harness.world,
      harness.identity,
      harness.formation,
      contagionRoutingStates,
      routingContagionStore,
      routingContagionSummaries,
    );
    totalRoutingContagionMilliseconds += performance.now() - contagionStartedAt;
    const moraleResult = collectCombatMoraleAssessments(
      harness.identity,
      harness.formation,
      consequenceResult.applications,
      moraleOutput,
    );
    advancePersistentMoraleOneTick(
      harness.identity,
      harness.formation,
      moraleResult.assessments,
      persistentMoraleStore,
      moraleEvents,
      {
        survivabilityStore: harness.survivability,
        pressureUpdates,
        routingContagionSummaries: contagionResult.summaries,
      },
    );
    const elapsedMilliseconds = performance.now() - startedAt;

    tickSamples[tick] = elapsedMilliseconds;
    totalTickMilliseconds += elapsedMilliseconds;
    if (elapsedMilliseconds > maximumTickMilliseconds) {
      maximumTickMilliseconds = elapsedMilliseconds;
    }
    totalFormationEventCount += formationResult.events.length;
    totalOpportunities += pipelineResult.opportunities.length;
    totalStrikes += pipelineResult.strikes.length;
    totalApplications += pipelineResult.applications.length;
    totalConsequences += consequenceResult.applications.length;
    totalMoraleAssessments += moraleResult.assessments.length;
    totalNonSteadyMoraleAssessments += countNonSteadyMorale(
      moraleResult.assessments,
    );
    totalAppliedDamage += sumAppliedDamage(pipelineResult.applications);
    totalRoutingContagionSummaries += contagionResult.summaries.length;
  }

  const sortedSamples = Array.from(tickSamples).sort(
    (left, right) => left - right,
  );
  const p95Index = Math.max(0, Math.ceil(sortedSamples.length * 0.95) - 1);
  const confidenceSampling = measureConfidenceSamplingCost(harness);

  return {
    scenario: "40x50-opposing-formed-units",
    entityCount: harness.world.entityCount,
    unitCount: harness.identity.unitCount,
    membersPerUnit: MEMBERS_PER_UNIT,
    sourceUnitCount: harness.sourceUnitIds.length,
    targetUnitCount: harness.targetUnitIds.length,
    worldBounds: harness.world.bounds,
    warmUpTicks: WARM_UP_TICKS,
    measuredTicks: MEASURED_TICKS,
    totalFormationEventCount,
    totalOpportunities,
    totalStrikes,
    totalApplications,
    totalConsequences,
    totalMoraleAssessments,
    totalNonSteadyMoraleAssessments,
    totalPressureUpdateMilliseconds,
    meanPressureUpdateMilliseconds:
      totalPressureUpdateMilliseconds / MEASURED_TICKS,
    totalRoutingContagionMilliseconds,
    meanRoutingContagionMilliseconds:
      totalRoutingContagionMilliseconds / MEASURED_TICKS,
    totalRoutingContagionSummaries,
    totalConfidenceSamplingMilliseconds:
      confidenceSampling.totalMilliseconds,
    meanConfidenceSamplingMilliseconds:
      confidenceSampling.totalMilliseconds / MEASURED_TICKS,
    confidenceSamples: confidenceSampling.sampleCount,
    fourABaselineMeanTickMilliseconds: FOUR_A_BASELINE_MEAN_TICK_MILLISECONDS,
    fourABaselineP95TickMilliseconds: FOUR_A_BASELINE_P95_TICK_MILLISECONDS,
    meanTickDeltaFromFourABaseline:
      totalTickMilliseconds / MEASURED_TICKS -
      FOUR_A_BASELINE_MEAN_TICK_MILLISECONDS,
    p95TickDeltaFromFourABaseline:
      sortedSamples[p95Index]! - FOUR_A_BASELINE_P95_TICK_MILLISECONDS,
    totalAppliedDamage,
    finalSourceDamageTotal: getTotalDamage(
      harness.survivability,
      harness.sourceUnitIds,
    ),
    finalTargetDamageTotal: getTotalDamage(
      harness.survivability,
      harness.targetUnitIds,
    ),
    capacityReachedCount: countCapacityReached(
      harness.survivability,
      harness.targetUnitIds,
    ),
    totalTickMilliseconds,
    meanTickMilliseconds: totalTickMilliseconds / MEASURED_TICKS,
    maximumTickMilliseconds,
    p95TickMilliseconds: sortedSamples[p95Index]!,
    finalWorldEntityCount: harness.world.entityCount,
    finalEntityIds: Array.from(harness.world.ids),
  };
}

function createRepresentativeCombatHarness(): RepresentativeCombatHarness {
  const positionsX = new Int32Array(ENTITY_COUNT);
  const positionsY = new Int32Array(ENTITY_COUNT);
  const identityUnits: Array<{
    readonly unitId: UnitId;
    readonly factionId: number;
    readonly memberEntityIds: readonly number[];
  }> = [];
  const formationUnits: UnitFormationConfig[] = [];
  const individuals: IndividualBehaviourConfig[] = [];
  const sourceUnitIds: UnitId[] = [];
  const targetUnitIds: UnitId[] = [];

  for (let pairIndex = 0; pairIndex < PAIR_COUNT; pairIndex += 1) {
    const pairColumn = pairIndex % PAIRS_PER_ROW;
    const pairRow = Math.floor(pairIndex / PAIRS_PER_ROW);
    const sourceUnitId = pairIndex * 2 + 1;
    const targetUnitId = sourceUnitId + 1;
    const sourceAnchorX = START_X + pairColumn * PAIR_X_SPACING;
    const anchorY = START_Y + pairRow * PAIR_Y_SPACING;
    const targetAnchorX = sourceAnchorX + TARGET_ANCHOR_OFFSET_X;
    const sourceMembers = createMemberIds(pairIndex, 0);
    const targetMembers = createMemberIds(pairIndex, MEMBERS_PER_UNIT);

    sourceUnitIds.push(sourceUnitId);
    targetUnitIds.push(targetUnitId);
    identityUnits.push(
      {
        unitId: sourceUnitId,
        factionId: 1,
        memberEntityIds: sourceMembers,
      },
      {
        unitId: targetUnitId,
        factionId: 2,
        memberEntityIds: targetMembers,
      },
    );
    formationUnits.push(
      createFormationUnit(
        sourceUnitId,
        sourceAnchorX,
        anchorY,
        1,
        "advance",
      ),
      createFormationUnit(
        targetUnitId,
        targetAnchorX,
        anchorY,
        -1,
        "advance",
      ),
    );
    addUnitMembers(
      positionsX,
      positionsY,
      individuals,
      sourceMembers,
      sourceAnchorX,
      anchorY,
      1,
    );
    addUnitMembers(
      positionsX,
      positionsY,
      individuals,
      targetMembers,
      targetAnchorX,
      anchorY,
      -1,
    );
  }

  const world: WorldState = {
    entityCount: ENTITY_COUNT,
    bounds: WORLD_BOUNDS,
    ids: Uint32Array.from({ length: ENTITY_COUNT }, (_, index) => index),
    positionsX,
    positionsY,
    velocitiesX: new Int32Array(ENTITY_COUNT),
    velocitiesY: new Int32Array(ENTITY_COUNT),
  };
  const identity = createUnitIdentityStore({
    entityCount: ENTITY_COUNT,
    units: identityUnits,
  });
  const loadout = createUnitLoadoutStore(identity, {
    entityCount: ENTITY_COUNT,
    units: identityUnits.map((unit) => ({
      unitId: unit.unitId,
      weaponReachBand: unit.factionId === 1 ? "veryLong" : "none",
      armourClass: "none",
      shieldClass: "none",
    })),
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount: ENTITY_COUNT,
    rngSeed: PERF_RNG_SEED,
    units: formationUnits,
    individuals,
  });
  const tempo = createCombatTempoStore(identity, {
    entityCount: ENTITY_COUNT,
    baseAttackIntervalTicks: ATTACK_INTERVAL_TICKS,
    units: sourceUnitIds.map((unitId) => ({
      unitId,
      attackIntervalTicks: ATTACK_INTERVAL_TICKS,
      initialCooldownTicks: INITIAL_ATTACK_COOLDOWN_TICKS,
    })),
  });
  const survivability = createCombatSurvivabilityStore(identity, {
    entityCount: ENTITY_COUNT,
    units: targetUnitIds.map((unitId) => ({
      unitId,
      maxDamageCapacity: MEASURED_TICKS + 1,
    })),
  });

  return {
    world,
    identity,
    loadout,
    formation,
    tempo,
    survivability,
    sourceUnitIds,
    targetUnitIds,
  };
}

function createMemberIds(pairIndex: number, unitOffset: number): number[] {
  const firstEntityId = pairIndex * MEMBERS_PER_UNIT * 2 + unitOffset;
  return Array.from(
    { length: MEMBERS_PER_UNIT },
    (_, memberIndex) => firstEntityId + memberIndex,
  );
}

function createFormationUnit(
  unitId: UnitId,
  anchorX: number,
  anchorY: number,
  headingX: 1 | -1,
  order: "advance",
): UnitFormationConfig {
  return {
    unitId,
    anchorX,
    anchorY,
    headingX,
    headingY: 0,
    spacing: FORMATION_SPACING,
    rows: FORMATION_ROWS,
    cols: FORMATION_COLS,
    unitSpeed: UNIT_SPEED,
    order,
    cohesion: 800,
  };
}

function addUnitMembers(
  positionsX: Int32Array,
  positionsY: Int32Array,
  individuals: IndividualBehaviourConfig[],
  memberEntityIds: readonly number[],
  anchorX: number,
  anchorY: number,
  headingX: 1 | -1,
): void {
  const centerCol = Math.floor(FORMATION_COLS / 2);
  const perpY = headingX;

  for (let memberIndex = 0; memberIndex < memberEntityIds.length; memberIndex += 1) {
    const entityId = memberEntityIds[memberIndex]!;
    const slotRow = Math.floor(memberIndex / FORMATION_COLS);
    const slotCol = memberIndex % FORMATION_COLS;
    const backward = slotRow * FORMATION_SPACING;
    const lateral = (slotCol - centerCol) * FORMATION_SPACING;

    positionsX[entityId] = anchorX - headingX * backward;
    positionsY[entityId] = anchorY + perpY * lateral;
    individuals.push({
      entityId,
      role: "veteran",
      slotRow,
      slotCol,
      memberMaxStep: MEMBER_MAX_STEP,
    });
  }
}

function getExpectedOpportunityTickCount(tickCount: number): number {
  return (
    1 +
    Math.floor(
      (tickCount - INITIAL_ATTACK_COOLDOWN_TICKS) / ATTACK_INTERVAL_TICKS,
    )
  );
}

function sumAppliedDamage(
  applications: readonly { readonly appliedDamageValue: number }[],
): number {
  let total = 0;
  for (let index = 0; index < applications.length; index += 1) {
    total += applications[index]!.appliedDamageValue;
  }
  return total;
}

function countNonSteadyMorale(
  assessments: readonly CombatMoraleAssessment[],
): number {
  let count = 0;
  for (let index = 0; index < assessments.length; index += 1) {
    if (assessments[index]!.moraleState !== "steady") {
      count += 1;
    }
  }
  return count;
}

function getTotalDamage(
  survivability: CombatSurvivabilityStore,
  unitIds: readonly UnitId[],
): number {
  let total = 0;
  for (let index = 0; index < unitIds.length; index += 1) {
    total += getUnitAccumulatedDamage(survivability, unitIds[index]!);
  }
  return total;
}

function countCapacityReached(
  survivability: CombatSurvivabilityStore,
  unitIds: readonly UnitId[],
): number {
  let count = 0;
  for (let index = 0; index < unitIds.length; index += 1) {
    if (isUnitDamageCapacityReached(survivability, unitIds[index]!)) {
      count += 1;
    }
  }
  return count;
}

function writeRepresentativeCombatReport(
  report: RepresentativeCombatPerformanceReport,
): void {
  process.stdout.write(
    "\nRepresentative multi-person combat performance report\n" +
      JSON.stringify(
        {
          scenario: report.scenario,
          entityCount: report.entityCount,
          unitCount: report.unitCount,
          membersPerUnit: report.membersPerUnit,
          sourceUnitCount: report.sourceUnitCount,
          targetUnitCount: report.targetUnitCount,
          worldBounds: report.worldBounds,
          warmUpTicks: report.warmUpTicks,
          measuredTicks: report.measuredTicks,
          totalFormationEventCount: report.totalFormationEventCount,
          totalOpportunities: report.totalOpportunities,
          totalStrikes: report.totalStrikes,
          totalApplications: report.totalApplications,
          totalConsequences: report.totalConsequences,
          totalMoraleAssessments: report.totalMoraleAssessments,
          totalNonSteadyMoraleAssessments:
            report.totalNonSteadyMoraleAssessments,
          totalPressureUpdateMilliseconds: roundForReport(
            report.totalPressureUpdateMilliseconds,
          ),
          meanPressureUpdateMilliseconds: roundForReport(
            report.meanPressureUpdateMilliseconds,
          ),
          totalRoutingContagionMilliseconds: roundForReport(
            report.totalRoutingContagionMilliseconds,
          ),
          meanRoutingContagionMilliseconds: roundForReport(
            report.meanRoutingContagionMilliseconds,
          ),
          totalRoutingContagionSummaries:
            report.totalRoutingContagionSummaries,
          totalConfidenceSamplingMilliseconds: roundForReport(
            report.totalConfidenceSamplingMilliseconds,
          ),
          meanConfidenceSamplingMilliseconds: roundForReport(
            report.meanConfidenceSamplingMilliseconds,
          ),
          confidenceSamples: report.confidenceSamples,
          fourABaselineMeanTickMilliseconds:
            report.fourABaselineMeanTickMilliseconds,
          fourABaselineP95TickMilliseconds: report.fourABaselineP95TickMilliseconds,
          meanTickDeltaFromFourABaseline: roundForReport(
            report.meanTickDeltaFromFourABaseline,
          ),
          p95TickDeltaFromFourABaseline: roundForReport(
            report.p95TickDeltaFromFourABaseline,
          ),
          totalAppliedDamage: report.totalAppliedDamage,
          finalSourceDamageTotal: report.finalSourceDamageTotal,
          finalTargetDamageTotal: report.finalTargetDamageTotal,
          capacityReachedCount: report.capacityReachedCount,
          totalTickMilliseconds: roundForReport(report.totalTickMilliseconds),
          meanTickMilliseconds: roundForReport(report.meanTickMilliseconds),
          maximumTickMilliseconds: roundForReport(
            report.maximumTickMilliseconds,
          ),
          p95TickMilliseconds: roundForReport(report.p95TickMilliseconds),
          timingPolicy:
            "Structural assertions only; no tight machine-dependent timing threshold.",
        },
        null,
        2,
      ) +
      "\n",
  );
}

function measureConfidenceSamplingCost(
  harness: RepresentativeCombatHarness,
): { readonly totalMilliseconds: number; readonly sampleCount: number } {
  let totalMilliseconds = 0;
  let sampleCount = 0;
  let confidenceTotal = 0;
  const unitIds = getUnitIds(harness.identity);

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    for (let unitIndex = 0; unitIndex < harness.identity.unitCount; unitIndex += 1) {
      const unitId = unitIds[unitIndex]!;
      const members = getUnitMembers(harness.identity, unitId);
      for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
        confidenceTotal += getIndividualConfidence(
          harness.formation,
          members[memberIndex]!,
        );
        sampleCount += 1;
      }
    }
    totalMilliseconds += performance.now() - startedAt;
  }

  if (confidenceTotal < 0) {
    throw new Error("Confidence sampling total must be non-negative.");
  }
  return { totalMilliseconds, sampleCount };
}

function roundForReport(value: number): number {
  return Number(value.toFixed(6));
}
