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
  advanceCombatPipelineOneTick,
  createCombatPipelineOutput,
} from "../../src/sim/combatPipeline";
import {
  advanceCombatPressureOneTick,
  createCombatPressureStore,
  type UnitPressureUpdate,
} from "../../src/sim/combatPressure";
import {
  createCombatSurvivabilityStore,
} from "../../src/sim/combatSurvivability";
import { createCombatTempoStore } from "../../src/sim/combatTempo";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  type IndividualBehaviourConfig,
  type UnitFormationConfig,
} from "../../src/sim/formationBehaviour";
import type { MoraleMovementState } from "../../src/sim/moraleMovement";
import {
  advancePersistentMoraleOneTick,
  createPersistentMoraleStore,
} from "../../src/sim/persistentMorale";
import {
  collectRecoveryThreatSummaries,
  createRecoveryThreatStore,
  type UnitRecoveryThreatSummary,
} from "../../src/sim/recoveryThreat";
import {
  advanceRoutingContagionOneTick,
  createRoutingContagionStore,
  type UnitRoutingContagionSummary,
} from "../../src/sim/routingContagion";
import type { SimulationBounds, WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitId,
} from "../../src/sim/unitIdentity";
import { createUnitLoadoutStore } from "../../src/sim/unitLoadout";

const UNIT_COUNT = 100;
const MEMBERS_PER_UNIT = 20;
const ENTITY_COUNT = UNIT_COUNT * MEMBERS_PER_UNIT;
const PAIR_COUNT = UNIT_COUNT / 2;
const FORMATION_ROWS = 2;
const FORMATION_COLS = 10;
const SPACING = 6;
const MEASURED_TICKS = 40;
const ATTACK_INTERVAL_TICKS = 10;
const PAIRS_PER_ROW = 10;
const WORLD_BOUNDS: SimulationBounds = { width: 4_200, height: 1_100 };

describe("ordinary-unit full-path combat performance", () => {
  it(
    "reports the complete Milestone 4 path for 100 ordinary 20-person units",
    () => {
      const report = runOrdinaryUnitFullPath();

      expect(report).toMatchObject({
        entityCount: ENTITY_COUNT,
        unitCount: UNIT_COUNT,
        membersPerUnit: MEMBERS_PER_UNIT,
        measuredTicks: MEASURED_TICKS,
        routingProjectionCount: 1,
        recoveringProjectionCount: 1,
        totalMoraleAssessments: UNIT_COUNT * MEASURED_TICKS,
        totalContagionSummaries: UNIT_COUNT * MEASURED_TICKS,
      });
      expect(report.totalOpportunities).toBeGreaterThan(0);
      expect(report.totalConsequences).toBe(report.totalApplications);
      expect(report.totalRecoveryThreatMilliseconds).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(report.meanTickMilliseconds)).toBe(true);

      process.stdout.write(
        "\nOrdinary-unit full-path combat performance report\n" +
          JSON.stringify(report, null, 2) +
          "\n",
      );
    },
    30_000,
  );
});

interface OrdinaryFullPathReport {
  readonly scenario: "100x20-ordinary-units-full-milestone-4-path";
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly measuredTicks: number;
  readonly routingProjectionCount: number;
  readonly recoveringProjectionCount: number;
  readonly totalOpportunities: number;
  readonly totalApplications: number;
  readonly totalConsequences: number;
  readonly totalMoraleAssessments: number;
  readonly totalContagionSummaries: number;
  readonly totalRecoveryThreatMilliseconds: number;
  readonly meanRecoveryThreatMilliseconds: number;
  readonly meanTickMilliseconds: number;
  readonly p95TickMilliseconds: number;
}

function runOrdinaryUnitFullPath(): OrdinaryFullPathReport {
  const harness = createHarness();
  const pipeline = createCombatPipelineOutput();
  const consequences: CombatConsequenceApplication[] = [];
  const assessments: CombatMoraleAssessment[] = [];
  const pressureUpdates: UnitPressureUpdate[] = [];
  const contagionSummaries: UnitRoutingContagionSummary[] = [];
  const recoveryThreatSummaries: UnitRecoveryThreatSummary[] = [];

  for (let tick = 0; tick < 3; tick += 1) {
    advanceFormationOneTick(harness.world, harness.identity, harness.formation);
  }
  collectCombatMoraleAssessments(harness.identity, harness.formation, [], assessments);
  const persistent = createPersistentMoraleStore(
    harness.identity,
    harness.formation,
    assessments,
  );
  const pressure = createCombatPressureStore(harness.identity, harness.formation);
  const contagion = createRoutingContagionStore(harness.identity);
  const recoveryThreat = createRecoveryThreatStore(harness.identity, harness.world);
  const projectedMorale = new Map<UnitId, MoraleMovementState>([
    [harness.sourceUnitIds[0]!, "routing"],
    [harness.targetUnitIds[1]!, "recovering"],
  ]);
  const tickStartRouting = new Map<UnitId, MoraleMovementState>([
    [harness.sourceUnitIds[0]!, "routing"],
  ]);

  const samples = new Float64Array(MEASURED_TICKS);
  let totalOpportunities = 0;
  let totalApplications = 0;
  let totalConsequences = 0;
  let totalMoraleAssessments = 0;
  let totalContagionSummaries = 0;
  let totalRecoveryThreatMilliseconds = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const formation = advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.formation,
      projectedMorale,
    );
    const pipelineResult = advanceCombatPipelineOneTick(
      harness.world,
      harness.identity,
      harness.loadout,
      harness.formation,
      harness.tempo,
      harness.survivability,
      pipeline,
    );
    const consequenceResult = applyCombatConsequences(
      harness.identity,
      harness.formation,
      pipelineResult.applications,
      consequences,
    );
    advanceCombatPressureOneTick(
      harness.identity,
      harness.formation,
      pipelineResult.opportunities,
      consequenceResult.applications,
      pressure,
      pressureUpdates,
    );
    const contagionResult = advanceRoutingContagionOneTick(
      harness.world,
      harness.identity,
      harness.formation,
      tickStartRouting,
      formation.routingPassThroughInteractions,
      contagion,
      contagionSummaries,
    );
    const recoveryStartedAt = performance.now();
    collectRecoveryThreatSummaries(
      harness.world,
      harness.identity,
      harness.formation,
      recoveryThreat,
      recoveryThreatSummaries,
    );
    totalRecoveryThreatMilliseconds += performance.now() - recoveryStartedAt;
    const morale = collectCombatMoraleAssessments(
      harness.identity,
      harness.formation,
      consequenceResult.applications,
      assessments,
    );
    advancePersistentMoraleOneTick(
      harness.identity,
      harness.formation,
      morale.assessments,
      persistent,
      [],
      {
        pressureUpdates,
        routingContagionSummaries: contagionResult.summaries,
        recoveryThreatSummaries,
      },
    );

    samples[tick] = performance.now() - startedAt;
    totalOpportunities += pipelineResult.opportunities.length;
    totalApplications += pipelineResult.applications.length;
    totalConsequences += consequenceResult.applications.length;
    totalMoraleAssessments += morale.assessments.length;
    totalContagionSummaries += contagionResult.summaries.length;
  }

  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    scenario: "100x20-ordinary-units-full-milestone-4-path",
    entityCount: ENTITY_COUNT,
    unitCount: UNIT_COUNT,
    membersPerUnit: MEMBERS_PER_UNIT,
    measuredTicks: MEASURED_TICKS,
    routingProjectionCount: 1,
    recoveringProjectionCount: 1,
    totalOpportunities,
    totalApplications,
    totalConsequences,
    totalMoraleAssessments,
    totalContagionSummaries,
    totalRecoveryThreatMilliseconds: round(totalRecoveryThreatMilliseconds),
    meanRecoveryThreatMilliseconds: round(
      totalRecoveryThreatMilliseconds / MEASURED_TICKS,
    ),
    meanTickMilliseconds: round(
      samples.reduce((total, sample) => total + sample, 0) / MEASURED_TICKS,
    ),
    p95TickMilliseconds: round(sorted[Math.ceil(MEASURED_TICKS * 0.95) - 1]!),
  };
}

function createHarness() {
  const units: Array<{
    readonly unitId: UnitId;
    readonly factionId: number;
    readonly memberEntityIds: readonly number[];
  }> = [];
  const formations: UnitFormationConfig[] = [];
  const individuals: IndividualBehaviourConfig[] = [];
  const positionsX = new Int32Array(ENTITY_COUNT);
  const positionsY = new Int32Array(ENTITY_COUNT);
  const sourceUnitIds: UnitId[] = [];
  const targetUnitIds: UnitId[] = [];

  for (let pairIndex = 0; pairIndex < PAIR_COUNT; pairIndex += 1) {
    const sourceUnitId = pairIndex * 2 + 1;
    const targetUnitId = sourceUnitId + 1;
    const x = 200 + (pairIndex % PAIRS_PER_ROW) * 400;
    const y = 100 + Math.floor(pairIndex / PAIRS_PER_ROW) * 180;
    addUnit(units, formations, individuals, positionsX, positionsY, sourceUnitId, 1, pairIndex * 40, x, y, 1);
    addUnit(units, formations, individuals, positionsX, positionsY, targetUnitId, 2, pairIndex * 40 + MEMBERS_PER_UNIT, x + 8, y, -1);
    sourceUnitIds.push(sourceUnitId);
    targetUnitIds.push(targetUnitId);
  }

  const world: WorldState = {
    entityCount: ENTITY_COUNT,
    bounds: WORLD_BOUNDS,
    ids: Uint32Array.from({ length: ENTITY_COUNT }, (_, entityId) => entityId),
    positionsX,
    positionsY,
    velocitiesX: new Int32Array(ENTITY_COUNT),
    velocitiesY: new Int32Array(ENTITY_COUNT),
  };
  const identity = createUnitIdentityStore({ entityCount: ENTITY_COUNT, units });
  const formation = createFormationBehaviourStore(identity, {
    entityCount: ENTITY_COUNT,
    rngSeed: 0x4a_100,
    units: formations,
    individuals,
  });
  return {
    world,
    identity,
    formation,
    loadout: createUnitLoadoutStore(identity, {
      entityCount: ENTITY_COUNT,
      units: units.map((unit) => ({
        unitId: unit.unitId,
        weaponReachBand: unit.factionId === 1 ? "veryLong" : "none",
        armourClass: "none",
        shieldClass: "none",
      })),
    }),
    tempo: createCombatTempoStore(identity, {
      entityCount: ENTITY_COUNT,
      baseAttackIntervalTicks: ATTACK_INTERVAL_TICKS,
      units: sourceUnitIds.map((unitId) => ({
        unitId,
        attackIntervalTicks: ATTACK_INTERVAL_TICKS,
        initialCooldownTicks: 1,
      })),
    }),
    survivability: createCombatSurvivabilityStore(identity, {
      entityCount: ENTITY_COUNT,
      units: targetUnitIds.map((unitId) => ({
        unitId,
        maxDamageCapacity: MEASURED_TICKS + 1,
      })),
    }),
    sourceUnitIds,
    targetUnitIds,
  };
}

function addUnit(
  units: Array<{ readonly unitId: UnitId; readonly factionId: number; readonly memberEntityIds: readonly number[] }>,
  formations: UnitFormationConfig[],
  individuals: IndividualBehaviourConfig[],
  positionsX: Int32Array,
  positionsY: Int32Array,
  unitId: UnitId,
  factionId: number,
  firstEntityId: number,
  anchorX: number,
  anchorY: number,
  headingX: 1 | -1,
): void {
  const members = Array.from(
    { length: MEMBERS_PER_UNIT },
    (_, memberIndex) => firstEntityId + memberIndex,
  );
  units.push({ unitId, factionId, memberEntityIds: members });
  formations.push({
    unitId, anchorX, anchorY, headingX, headingY: 0, spacing: SPACING,
    rows: FORMATION_ROWS, cols: FORMATION_COLS, unitSpeed: 1, order: "advance", cohesion: 800,
  });
  for (let memberIndex = 0; memberIndex < MEMBERS_PER_UNIT; memberIndex += 1) {
    const entityId = members[memberIndex]!;
    const slotRow = Math.floor(memberIndex / FORMATION_COLS);
    const slotCol = memberIndex % FORMATION_COLS;
    positionsX[entityId] = anchorX - headingX * slotRow * SPACING;
    positionsY[entityId] = anchorY + headingX * (slotCol - 5) * SPACING;
    individuals.push({ entityId, role: "veteran", slotRow, slotCol, memberMaxStep: 3 });
  }
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
