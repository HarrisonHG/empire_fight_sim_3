import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

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
  getUnitMovementStyle,
  type FormationBehaviourStore,
  type IndividualBehaviourConfig,
  type UnitFormationConfig,
} from "../../src/sim/formationBehaviour";
import type { SimulationBounds, WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitId,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import {
  createUnitLoadoutStore,
  type UnitLoadoutStore,
} from "../../src/sim/unitLoadout";

const MEASURED_TICKS = 40;
const ATTACK_INTERVAL_TICKS = 10;
const INITIAL_ATTACK_COOLDOWN_TICKS = 1;
const PAIR_SPACING = 80;
const SOURCE_TARGET_DISTANCE = 10;
const START_X = 100;
const START_Y = 100;
const WORLD_HEIGHT = 256;
const FORMATION_SPACING = 10;
const PERF_RNG_SEED = 0x4101;

describe("combat pipeline performance", () => {
  it("reports integrated pipeline timing for 100 entities", () => {
    const report = runCombatPipelinePerformanceScenario(100);

    assertPerformanceReport(report, 100);
    writeCombatPipelineReport(report);
  });

  it("reports integrated pipeline timing for 500 entities", () => {
    const report = runCombatPipelinePerformanceScenario(500);

    assertPerformanceReport(report, 500);
    writeCombatPipelineReport(report);
  });

  it("reports integrated pipeline timing for 1000 entities", () => {
    const report = runCombatPipelinePerformanceScenario(1_000);

    assertPerformanceReport(report, 1_000);
    writeCombatPipelineReport(report);
  });

  it(
    "reports integrated pipeline timing for 2000 entities",
    () => {
      const report = runCombatPipelinePerformanceScenario(2_000);

      assertPerformanceReport(report, 2_000);
      writeCombatPipelineReport(report);
    },
    30_000,
  );

  it("repeats identical structural summaries at a representative size", () => {
    const first = runCombatPipelinePerformanceScenario(500);
    const second = runCombatPipelinePerformanceScenario(500);

    expect(first.structuralSummary).toEqual(second.structuralSummary);
  });

  it("reuses output arrays without retaining stale records", () => {
    const harness = createCombatPipelinePerformanceHarness(100);
    const out = createCombatPipelineOutput();

    const first = advanceCombatPipelineOneTick(
      harness.world,
      harness.identity,
      harness.loadout,
      harness.formation,
      harness.tempo,
      harness.survivability,
      out,
    );

    expect(first).toBe(out);
    expect(first.opportunities).toHaveLength(harness.sourceUnitIds.length);
    expect(first.strikes).toHaveLength(harness.sourceUnitIds.length);
    expect(first.applications).toHaveLength(harness.sourceUnitIds.length);

    const second = advanceCombatPipelineOneTick(
      harness.world,
      harness.identity,
      harness.loadout,
      harness.formation,
      harness.tempo,
      harness.survivability,
      out,
    );

    expect(second).toBe(out);
    expect(second.opportunities).toBe(out.opportunities);
    expect(second.strikes).toBe(out.strikes);
    expect(second.applications).toBe(out.applications);
    expect(second.opportunities).toEqual([]);
    expect(second.strikes).toEqual([]);
    expect(second.applications).toEqual([]);
  });
});

interface CombatPipelinePerformanceHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: ReturnType<typeof createCombatTempoStore>;
  readonly survivability: CombatSurvivabilityStore;
  readonly sourceUnitIds: readonly UnitId[];
  readonly targetUnitIds: readonly UnitId[];
}

interface CombatPipelineStructuralSummary {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly sourceUnitCount: number;
  readonly targetUnitCount: number;
  readonly tickCount: number;
  readonly totalOpportunities: number;
  readonly totalStrikes: number;
  readonly totalApplications: number;
  readonly totalAppliedDamage: number;
  readonly finalSourceDamageTotal: number;
  readonly finalTargetDamageTotal: number;
  readonly capacityReachedCount: number;
  readonly outputStaleClearObserved: boolean;
  readonly finalWorldEntityCount: number;
  readonly finalEntityIds: readonly number[];
}

interface CombatPipelinePerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly sourceUnitCount: number;
  readonly targetUnitCount: number;
  readonly worldBounds: SimulationBounds;
  readonly tickCount: number;
  readonly totalOpportunities: number;
  readonly totalStrikes: number;
  readonly totalApplications: number;
  readonly totalAppliedDamage: number;
  readonly finalSourceDamageTotal: number;
  readonly finalTargetDamageTotal: number;
  readonly capacityReachedCount: number;
  readonly totalTickMilliseconds: number;
  readonly meanTickMilliseconds: number;
  readonly maximumTickMilliseconds: number;
  readonly p95TickMilliseconds: number;
  readonly structuralSummary: CombatPipelineStructuralSummary;
}

function runCombatPipelinePerformanceScenario(
  entityCount: number,
): CombatPipelinePerformanceReport {
  const harness = createCombatPipelinePerformanceHarness(entityCount);
  const out = createCombatPipelineOutput();
  const tickSamples = new Float64Array(MEASURED_TICKS);
  let totalTickMilliseconds = 0;
  let maximumTickMilliseconds = 0;
  let totalOpportunities = 0;
  let totalStrikes = 0;
  let totalApplications = 0;
  let totalAppliedDamage = 0;
  let previousTargetDamageTotal = getTotalDamage(
    harness.survivability,
    harness.targetUnitIds,
  );
  let outputStaleClearObserved = false;
  let previousTickHadRecords = false;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const result = advanceCombatPipelineOneTick(
      harness.world,
      harness.identity,
      harness.loadout,
      harness.formation,
      harness.tempo,
      harness.survivability,
      out,
    );
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(result).toBe(out);
    expect(result.strikes).toHaveLength(result.opportunities.length);
    expect(result.applications).toHaveLength(result.strikes.length);

    if (previousTickHadRecords && result.opportunities.length === 0) {
      outputStaleClearObserved = true;
      expect(result.strikes).toEqual([]);
      expect(result.applications).toEqual([]);
    }

    const appliedDamageThisTick = sumAppliedDamage(result);
    const nextTargetDamageTotal = getTotalDamage(
      harness.survivability,
      harness.targetUnitIds,
    );
    expect(nextTargetDamageTotal - previousTargetDamageTotal).toBe(
      appliedDamageThisTick,
    );
    previousTargetDamageTotal = nextTargetDamageTotal;

    tickSamples[tick] = elapsedMilliseconds;
    totalTickMilliseconds += elapsedMilliseconds;
    if (elapsedMilliseconds > maximumTickMilliseconds) {
      maximumTickMilliseconds = elapsedMilliseconds;
    }
    totalOpportunities += result.opportunities.length;
    totalStrikes += result.strikes.length;
    totalApplications += result.applications.length;
    totalAppliedDamage += appliedDamageThisTick;
    previousTickHadRecords = result.opportunities.length > 0;
  }

  const sortedSamples = Array.from(tickSamples).sort(
    (left, right) => left - right,
  );
  const p95Index = Math.max(0, Math.ceil(sortedSamples.length * 0.95) - 1);
  const finalSourceDamageTotal = getTotalDamage(
    harness.survivability,
    harness.sourceUnitIds,
  );
  const finalTargetDamageTotal = getTotalDamage(
    harness.survivability,
    harness.targetUnitIds,
  );
  const capacityReachedCount = countCapacityReached(
    harness.survivability,
    harness.targetUnitIds,
  );
  const finalEntityIds = Array.from(harness.world.ids);
  const structuralSummary: CombatPipelineStructuralSummary = {
    entityCount: harness.world.entityCount,
    unitCount: harness.identity.unitCount,
    sourceUnitCount: harness.sourceUnitIds.length,
    targetUnitCount: harness.targetUnitIds.length,
    tickCount: MEASURED_TICKS,
    totalOpportunities,
    totalStrikes,
    totalApplications,
    totalAppliedDamage,
    finalSourceDamageTotal,
    finalTargetDamageTotal,
    capacityReachedCount,
    outputStaleClearObserved,
    finalWorldEntityCount: harness.world.entityCount,
    finalEntityIds,
  };

  return {
    entityCount: harness.world.entityCount,
    unitCount: harness.identity.unitCount,
    sourceUnitCount: harness.sourceUnitIds.length,
    targetUnitCount: harness.targetUnitIds.length,
    worldBounds: harness.world.bounds,
    tickCount: MEASURED_TICKS,
    totalOpportunities,
    totalStrikes,
    totalApplications,
    totalAppliedDamage,
    finalSourceDamageTotal,
    finalTargetDamageTotal,
    capacityReachedCount,
    totalTickMilliseconds,
    meanTickMilliseconds: totalTickMilliseconds / MEASURED_TICKS,
    maximumTickMilliseconds,
    p95TickMilliseconds: sortedSamples[p95Index]!,
    structuralSummary,
  };
}

function createCombatPipelinePerformanceHarness(
  entityCount: number,
): CombatPipelinePerformanceHarness {
  expect(entityCount % 2).toBe(0);
  const pairCount = entityCount / 2;
  const bounds: SimulationBounds = {
    width: START_X + pairCount * PAIR_SPACING + START_X,
    height: WORLD_HEIGHT,
  };
  const positionsX = new Int32Array(entityCount);
  const positionsY = new Int32Array(entityCount);
  const identityUnits: {
    readonly unitId: UnitId;
    readonly factionId: number;
    readonly memberEntityIds: readonly number[];
  }[] = [];
  const loadoutUnits: {
    readonly unitId: UnitId;
    readonly weaponReachBand: "long" | "none";
    readonly armourClass: "none";
    readonly shieldClass: "none";
  }[] = [];
  const formationUnits: UnitFormationConfig[] = [];
  const individuals: IndividualBehaviourConfig[] = [];
  const tempoUnits: {
    readonly unitId: UnitId;
    readonly attackIntervalTicks: number;
    readonly initialCooldownTicks: number;
  }[] = [];
  const sourceUnitIds: UnitId[] = [];
  const targetUnitIds: UnitId[] = [];

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const sourceEntityId = pairIndex * 2;
    const targetEntityId = sourceEntityId + 1;
    const sourceUnitId = sourceEntityId + 1;
    const targetUnitId = targetEntityId + 1;
    const sourceX = START_X + pairIndex * PAIR_SPACING;
    const targetX = sourceX + SOURCE_TARGET_DISTANCE;

    positionsX[sourceEntityId] = sourceX;
    positionsY[sourceEntityId] = START_Y;
    positionsX[targetEntityId] = targetX;
    positionsY[targetEntityId] = START_Y;

    sourceUnitIds.push(sourceUnitId);
    targetUnitIds.push(targetUnitId);
    identityUnits.push(
      {
        unitId: sourceUnitId,
        factionId: 1,
        memberEntityIds: [sourceEntityId],
      },
      {
        unitId: targetUnitId,
        factionId: 2,
        memberEntityIds: [targetEntityId],
      },
    );
    loadoutUnits.push(
      {
        unitId: sourceUnitId,
        weaponReachBand: "long",
        armourClass: "none",
        shieldClass: "none",
      },
      {
        unitId: targetUnitId,
        weaponReachBand: "none",
        armourClass: "none",
        shieldClass: "none",
      },
    );
    formationUnits.push(
      {
        unitId: sourceUnitId,
        anchorX: sourceX,
        anchorY: START_Y,
        headingX: 1,
        headingY: 0,
        spacing: FORMATION_SPACING,
        rows: 1,
        cols: 1,
        unitSpeed: 0,
        order: "advance",
        cohesion: 800,
      },
      {
        unitId: targetUnitId,
        anchorX: targetX,
        anchorY: START_Y,
        headingX: -1,
        headingY: 0,
        spacing: FORMATION_SPACING,
        rows: 1,
        cols: 1,
        unitSpeed: 0,
        order: "hold",
        cohesion: 800,
      },
    );
    individuals.push(
      {
        entityId: sourceEntityId,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 0,
      },
      {
        entityId: targetEntityId,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 0,
      },
    );
    tempoUnits.push({
      unitId: sourceUnitId,
      attackIntervalTicks: ATTACK_INTERVAL_TICKS,
      initialCooldownTicks: INITIAL_ATTACK_COOLDOWN_TICKS,
    });
  }

  const world: WorldState = {
    entityCount,
    bounds,
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX,
    positionsY,
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const identity = createUnitIdentityStore({
    entityCount,
    units: identityUnits,
  });
  const loadout = createUnitLoadoutStore(identity, {
    entityCount,
    units: loadoutUnits,
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: PERF_RNG_SEED,
    units: formationUnits,
    individuals,
  });
  const tempo = createCombatTempoStore(identity, {
    entityCount,
    baseAttackIntervalTicks: ATTACK_INTERVAL_TICKS,
    units: tempoUnits,
  });
  const survivability = createCombatSurvivabilityStore(identity, {
    entityCount,
    units: targetUnitIds.map((unitId) => ({
      unitId,
      maxDamageCapacity: MEASURED_TICKS + 1,
    })),
  });

  advanceFormationOneTick(world, identity, formation, { loadoutStore: loadout });
  for (let index = 0; index < sourceUnitIds.length; index += 1) {
    expect(getUnitMovementStyle(formation, sourceUnitIds[index]!)).toBe(
      "engageFront",
    );
  }

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

function assertPerformanceReport(
  report: CombatPipelinePerformanceReport,
  entityCount: number,
): void {
  const expectedOpportunityTicks = getExpectedOpportunityTickCount(
    report.tickCount,
  );
  const expectedRecords = report.sourceUnitCount * expectedOpportunityTicks;

  expect(report.entityCount).toBe(entityCount);
  expect(report.unitCount).toBe(entityCount);
  expect(report.sourceUnitCount).toBe(entityCount / 2);
  expect(report.targetUnitCount).toBe(entityCount / 2);
  expect(report.tickCount).toBe(MEASURED_TICKS);
  expect(report.totalOpportunities).toBe(expectedRecords);
  expect(report.totalStrikes).toBe(report.totalOpportunities);
  expect(report.totalApplications).toBe(report.totalStrikes);
  expect(report.totalAppliedDamage).toBe(report.totalApplications);
  expect(report.finalSourceDamageTotal).toBe(0);
  expect(report.finalTargetDamageTotal).toBe(report.totalAppliedDamage);
  expect(report.capacityReachedCount).toBe(0);
  expect(report.structuralSummary.outputStaleClearObserved).toBe(true);
  expect(report.structuralSummary.finalWorldEntityCount).toBe(entityCount);
  expect(report.structuralSummary.finalEntityIds).toHaveLength(entityCount);
  expect(report.structuralSummary.finalEntityIds).toEqual(
    Array.from({ length: entityCount }, (_, index) => index),
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
}

function getExpectedOpportunityTickCount(tickCount: number): number {
  return (
    1 +
    Math.floor(
      (tickCount - INITIAL_ATTACK_COOLDOWN_TICKS) / ATTACK_INTERVAL_TICKS,
    )
  );
}

function sumAppliedDamage(result: {
  readonly applications: readonly { readonly appliedDamageValue: number }[];
}): number {
  let total = 0;
  for (let index = 0; index < result.applications.length; index += 1) {
    total += result.applications[index]!.appliedDamageValue;
  }
  return total;
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

function writeCombatPipelineReport(
  report: CombatPipelinePerformanceReport,
): void {
  process.stdout.write(
    "\nCombat pipeline performance report\n" +
      JSON.stringify(
        {
          entityCount: report.entityCount,
          unitCount: report.unitCount,
          sourceUnitCount: report.sourceUnitCount,
          targetUnitCount: report.targetUnitCount,
          worldBounds: report.worldBounds,
          tickCount: report.tickCount,
          totalOpportunities: report.totalOpportunities,
          totalStrikes: report.totalStrikes,
          totalApplications: report.totalApplications,
          totalAppliedDamage: report.totalAppliedDamage,
          finalSourceDamageTotal: report.finalSourceDamageTotal,
          finalTargetDamageTotal: report.finalTargetDamageTotal,
          capacityReachedCount: report.capacityReachedCount,
          totalTickMilliseconds: roundForReport(
            report.totalTickMilliseconds,
          ),
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

function roundForReport(value: number): number {
  return Number(value.toFixed(6));
}
