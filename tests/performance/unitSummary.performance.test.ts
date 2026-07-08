import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { FOUNDATION_SCENARIO } from "../../src/content/foundationScenario";
import { createSimulation } from "../../src/sim/simulation";
import {
  buildSpatialGrid,
  createSpatialGrid,
} from "../../src/sim/spatialGrid";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import { queryOtherFactionEntitiesInto } from "../../src/sim/unitLocalQueries";
import {
  createUnitSummaries,
  createUnitSummariesInto,
  type UnitSummary,
} from "../../src/sim/unitSummary";
import type { SimulationBounds, SimulationScenario } from "../../src/sim/types";

const MEMBERS_PER_UNIT = 20;
const CELL_SIZE = 64;
const QUERY_RADIUS = 72;
const MEASURED_SUMMARY_REBUILDS = 250;
const MEASURED_LOCAL_QUERY_PASSES = 20;

describe("unit summary and local query performance", () => {
  it("reports summary and local query timing for 1,000 entities", () => {
    const report = runUnitSummaryPerformanceScenario(1_000);

    assertPerformanceReport(report, 1_000);
    writeUnitSummaryReport(report);
  });

  it("reports summary and local query timing for 2,000 entities", () => {
    const report = runUnitSummaryPerformanceScenario(2_000);

    assertPerformanceReport(report, 2_000);
    writeUnitSummaryReport(report);
  });
});

interface UnitSummaryPerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly cellSize: number;
  readonly queryRadius: number;
  readonly measuredSummaryRebuilds: number;
  readonly measuredLocalQueries: number;
  readonly totalSummaryMilliseconds: number;
  readonly meanSummaryMilliseconds: number;
  readonly totalLocalQueryMilliseconds: number;
  readonly meanLocalQueryMilliseconds: number;
  readonly p95LocalQueryMilliseconds: number;
  readonly maximumLocalQueryMilliseconds: number;
  readonly totalResultCount: number;
  readonly deterministicSummarySample: readonly UnitSummary[];
  readonly deterministicQuerySample: readonly number[];
}

function runUnitSummaryPerformanceScenario(
  entityCount: number,
): UnitSummaryPerformanceReport {
  const simulation = createSimulation(createPerformanceScenario(entityCount));
  const identityStore = createDeterministicUnitIdentity(
    simulation.world.entityCount,
  );
  const grid = createSpatialGrid({
    bounds: simulation.world.bounds,
    cellSize: CELL_SIZE,
    capacity: simulation.world.entityCount,
  });
  const summaries: UnitSummary[] = [];
  const queryResults: number[] = [];
  const measuredLocalQueries =
    identityStore.unitCount * MEASURED_LOCAL_QUERY_PASSES;
  const localQuerySamples = new Float64Array(measuredLocalQueries);

  buildSpatialGrid(grid, simulation.world);

  const deterministicSummarySample = createUnitSummaries(
    simulation.world,
    identityStore,
  );
  const repeatedSummarySample = createUnitSummaries(
    simulation.world,
    identityStore,
  );
  expect(repeatedSummarySample).toEqual(deterministicSummarySample);

  let totalSummaryMilliseconds = 0;
  for (let rebuild = 0; rebuild < MEASURED_SUMMARY_REBUILDS; rebuild += 1) {
    const startedAt = performance.now();
    const returnedSummaries = createUnitSummariesInto(
      simulation.world,
      identityStore,
      summaries,
    );
    totalSummaryMilliseconds += performance.now() - startedAt;

    expect(returnedSummaries).toBe(summaries);
    expect(summaries).toHaveLength(identityStore.unitCount);
  }

  const deterministicQuerySample = queryOtherFactionEntitiesInto(
    simulation.world,
    identityStore,
    grid,
    deterministicSummarySample[0]!,
    QUERY_RADIUS,
    [],
  );
  const repeatedQuerySample = queryOtherFactionEntitiesInto(
    simulation.world,
    identityStore,
    grid,
    deterministicSummarySample[0]!,
    QUERY_RADIUS,
    [],
  );
  expect(repeatedQuerySample).toEqual(deterministicQuerySample);
  expect(Array.isArray(deterministicQuerySample)).toBe(true);
  assertEntityIdArray(deterministicQuerySample);

  let totalLocalQueryMilliseconds = 0;
  let maximumLocalQueryMilliseconds = 0;
  let totalResultCount = 0;
  let querySampleIndex = 0;

  for (let pass = 0; pass < MEASURED_LOCAL_QUERY_PASSES; pass += 1) {
    for (
      let summaryIndex = 0;
      summaryIndex < deterministicSummarySample.length;
      summaryIndex += 1
    ) {
      const summary = deterministicSummarySample[summaryIndex]!;
      const startedAt = performance.now();
      const returnedResults = queryOtherFactionEntitiesInto(
        simulation.world,
        identityStore,
        grid,
        summary,
        QUERY_RADIUS,
        queryResults,
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(returnedResults).toBe(queryResults);
      expect(Array.isArray(queryResults)).toBe(true);
      assertEntityIdArray(queryResults);

      localQuerySamples[querySampleIndex] = elapsedMilliseconds;
      querySampleIndex += 1;
      totalLocalQueryMilliseconds += elapsedMilliseconds;
      maximumLocalQueryMilliseconds = Math.max(
        maximumLocalQueryMilliseconds,
        elapsedMilliseconds,
      );
      totalResultCount += queryResults.length;
    }
  }

  const sortedQuerySamples = Array.from(localQuerySamples).sort(
    (left, right) => left - right,
  );
  const p95Index = Math.ceil(sortedQuerySamples.length * 0.95) - 1;

  return {
    entityCount: simulation.world.entityCount,
    unitCount: identityStore.unitCount,
    membersPerUnit: MEMBERS_PER_UNIT,
    worldBounds: simulation.world.bounds,
    cellSize: CELL_SIZE,
    queryRadius: QUERY_RADIUS,
    measuredSummaryRebuilds: MEASURED_SUMMARY_REBUILDS,
    measuredLocalQueries,
    totalSummaryMilliseconds,
    meanSummaryMilliseconds:
      totalSummaryMilliseconds / MEASURED_SUMMARY_REBUILDS,
    totalLocalQueryMilliseconds,
    meanLocalQueryMilliseconds:
      totalLocalQueryMilliseconds / measuredLocalQueries,
    p95LocalQueryMilliseconds: sortedQuerySamples[p95Index]!,
    maximumLocalQueryMilliseconds,
    totalResultCount,
    deterministicSummarySample,
    deterministicQuerySample,
  };
}

function createPerformanceScenario(
  entityCount: number,
): SimulationScenario {
  return {
    ...FOUNDATION_SCENARIO,
    seed: FOUNDATION_SCENARIO.seed + entityCount,
    entityCount,
  };
}

function createDeterministicUnitIdentity(
  entityCount: number,
): UnitIdentityStore {
  expect(entityCount % MEMBERS_PER_UNIT).toBe(0);

  const unitCount = entityCount / MEMBERS_PER_UNIT;
  return createUnitIdentityStore({
    entityCount,
    units: Array.from({ length: unitCount }, (_, unitIndex) => {
      const firstEntityId = unitIndex * MEMBERS_PER_UNIT;

      return {
        unitId: unitIndex + 1,
        factionId: (unitIndex % 4) + 1,
        memberEntityIds: Array.from(
          { length: MEMBERS_PER_UNIT },
          (__, memberIndex) => firstEntityId + memberIndex,
        ),
      };
    }),
  });
}

function assertPerformanceReport(
  report: UnitSummaryPerformanceReport,
  entityCount: number,
): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.unitCount).toBe(entityCount / MEMBERS_PER_UNIT);
  expect(report.membersPerUnit).toBe(MEMBERS_PER_UNIT);
  expect(report.measuredSummaryRebuilds).toBe(MEASURED_SUMMARY_REBUILDS);
  expect(report.measuredLocalQueries).toBe(
    report.unitCount * MEASURED_LOCAL_QUERY_PASSES,
  );
  expect(report.cellSize).toBe(CELL_SIZE);
  expect(report.queryRadius).toBe(QUERY_RADIUS);
  expect(report.worldBounds).toEqual(FOUNDATION_SCENARIO.bounds);
  expect(report.totalResultCount).toBeGreaterThanOrEqual(0);
  expect(report.deterministicSummarySample).toHaveLength(report.unitCount);
  expect(Array.isArray(report.deterministicQuerySample)).toBe(true);
  assertEntityIdArray(report.deterministicQuerySample);

  for (const value of [
    report.totalSummaryMilliseconds,
    report.meanSummaryMilliseconds,
    report.totalLocalQueryMilliseconds,
    report.meanLocalQueryMilliseconds,
    report.p95LocalQueryMilliseconds,
    report.maximumLocalQueryMilliseconds,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
}

function assertEntityIdArray(entityIds: readonly number[]): void {
  for (const entityId of entityIds) {
    expect(Number.isSafeInteger(entityId)).toBe(true);
    expect(entityId).toBeGreaterThanOrEqual(0);
  }
}

function writeUnitSummaryReport(report: UnitSummaryPerformanceReport): void {
  process.stdout.write(
    "\nUnit summary and local query performance report\n" +
      JSON.stringify(
        {
          entityCount: report.entityCount,
          unitCount: report.unitCount,
          membersPerUnit: report.membersPerUnit,
          worldBounds: report.worldBounds,
          cellSize: report.cellSize,
          queryRadius: report.queryRadius,
          measuredSummaryRebuilds: report.measuredSummaryRebuilds,
          measuredLocalQueries: report.measuredLocalQueries,
          totalSummaryMilliseconds: roundForReport(
            report.totalSummaryMilliseconds,
          ),
          meanSummaryMilliseconds: roundForReport(
            report.meanSummaryMilliseconds,
          ),
          totalLocalQueryMilliseconds: roundForReport(
            report.totalLocalQueryMilliseconds,
          ),
          meanLocalQueryMilliseconds: roundForReport(
            report.meanLocalQueryMilliseconds,
          ),
          p95LocalQueryMilliseconds: roundForReport(
            report.p95LocalQueryMilliseconds,
          ),
          maximumLocalQueryMilliseconds: roundForReport(
            report.maximumLocalQueryMilliseconds,
          ),
          totalResultCount: report.totalResultCount,
          deterministicSummarySampleCount:
            report.deterministicSummarySample.length,
          deterministicQuerySampleResultCount:
            report.deterministicQuerySample.length,
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
