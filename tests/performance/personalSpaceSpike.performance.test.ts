import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  PersonalSpaceSpikeEntityScenario,
  SimulationScenario,
} from "../../src/sim/types";

const WARM_UP_TICKS = 5;
const MEASURED_TICKS = 40;

describe("Milestone 8A personal-space spike performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "reports bounded local collision timing for %i entities",
    (entityCount) => {
      const report = runPerformanceCase(entityCount);
      expect(report.entityCount).toBe(entityCount);
      expect(report.measuredTicks).toBe(MEASURED_TICKS);
      expect(report.maximumResolutionPassesUsed).toBeLessThanOrEqual(8);
      expect(report.maximumUnresolvedStandingOverlaps).toBe(0);
      expect(report.maximumLocalCandidateCount).toBeLessThan(
        entityCount * entityCount,
      );
      for (const timing of [
        report.meanMillisecondsPerTick,
        report.maximumMillisecondsPerTick,
        report.p95MillisecondsPerTick,
      ]) {
        expect(Number.isFinite(timing)).toBe(true);
        expect(timing).toBeGreaterThanOrEqual(0);
      }
      writeReport(report);
    },
  );
});

interface PersonalSpacePerformanceReport {
  readonly entityCount: number;
  readonly warmUpTicks: number;
  readonly measuredTicks: number;
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
  readonly maximumResolutionPassesUsed: number;
  readonly maximumLocalQueryCount: number;
  readonly maximumLocalCandidateCount: number;
  readonly maximumUnresolvedStandingOverlaps: number;
  readonly totalFallbackResetCount: number;
}

function runPerformanceCase(entityCount: number): PersonalSpacePerformanceReport {
  const simulation = createSimulation(createDenseScenario(entityCount));
  for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  const samples = new Float64Array(MEASURED_TICKS);
  let maximumResolutionPassesUsed = 0;
  let maximumLocalQueryCount = 0;
  let maximumLocalCandidateCount = 0;
  let maximumUnresolvedStandingOverlaps = 0;
  let totalFallbackResetCount = 0;
  let totalMilliseconds = 0;
  let maximumMillisecondsPerTick = 0;
  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    advanceSimulationOneTick(simulation);
    const elapsed = performance.now() - startedAt;
    samples[tick] = elapsed;
    totalMilliseconds += elapsed;
    maximumMillisecondsPerTick = Math.max(maximumMillisecondsPerTick, elapsed);
    const debug = simulation.personalSpaceSpike!.store.debugSnapshot;
    maximumResolutionPassesUsed = Math.max(
      maximumResolutionPassesUsed,
      debug.resolutionPassCount,
    );
    maximumLocalQueryCount = Math.max(
      maximumLocalQueryCount,
      debug.localQueryCount,
    );
    maximumLocalCandidateCount = Math.max(
      maximumLocalCandidateCount,
      debug.localCandidateCount,
    );
    maximumUnresolvedStandingOverlaps = Math.max(
      maximumUnresolvedStandingOverlaps,
      debug.unresolvedStandingOverlapCount,
    );
    totalFallbackResetCount += debug.fallbackResetCount;
  }
  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    entityCount,
    warmUpTicks: WARM_UP_TICKS,
    measuredTicks: MEASURED_TICKS,
    meanMillisecondsPerTick: totalMilliseconds / MEASURED_TICKS,
    maximumMillisecondsPerTick,
    p95MillisecondsPerTick:
      sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    maximumResolutionPassesUsed,
    maximumLocalQueryCount,
    maximumLocalCandidateCount,
    maximumUnresolvedStandingOverlaps,
    totalFallbackResetCount,
  };
}

function createDenseScenario(entityCount: number): SimulationScenario {
  const rows = Math.min(25, Math.ceil(Math.sqrt(entityCount / 2)));
  const leftCount = Math.ceil(entityCount / 2);
  const rightCount = entityCount - leftCount;
  const leftColumns = Math.ceil(leftCount / rows);
  const rightColumns = Math.ceil(rightCount / rows);
  const centreX = leftColumns * 8 + 48;
  const entities: PersonalSpaceSpikeEntityScenario[] = [];
  for (let index = 0; index < leftCount; index += 1) {
    const column = Math.floor(index / rows);
    const row = index % rows;
    entities.push({
      entityId: entities.length,
      x: centreX - 6 - column * 8,
      y: 32 + row * 8,
      requestedDeltaX: 1,
      requestedDeltaY: 0,
      occupancyClass: "activeStanding",
      teamId: 1,
    });
  }
  for (let index = 0; index < rightCount; index += 1) {
    const column = Math.floor(index / rows);
    const row = index % rows;
    entities.push({
      entityId: entities.length,
      x: centreX + 6 + column * 8,
      y: 32 + row * 8,
      requestedDeltaX: -1,
      requestedDeltaY: 0,
      occupancyClass: "activeStanding",
      teamId: 2,
    });
  }
  return {
    seed: 0x08_a0_0000 + entityCount,
    entityCount,
    bounds: {
      width: centreX + rightColumns * 8 + 48,
      height: rows * 8 + 64,
    },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    personalSpaceSpike: {
      kind: "personalSpaceSpike",
      standingRadius: 4,
      downedSoftRadius: 5,
      maximumResolutionPasses: 8,
      entities,
    },
  };
}

function writeReport(report: PersonalSpacePerformanceReport): void {
  process.stdout.write(
    "\nMilestone 8A personal-space performance report\n" +
      JSON.stringify({
        ...report,
        meanMillisecondsPerTick: round(report.meanMillisecondsPerTick),
        maximumMillisecondsPerTick: round(report.maximumMillisecondsPerTick),
        p95MillisecondsPerTick: round(report.p95MillisecondsPerTick),
        timingPolicy:
          "Structural assertions only; isolated bounded local-query spike, not production battle integration.",
      }, null, 2) + "\n",
  );
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
