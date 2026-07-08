import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { FOUNDATION_SCENARIO } from "../../src/content/foundationScenario";
import { createSimulation } from "../../src/sim/simulation";
import {
  buildSpatialGrid,
  createSpatialGrid,
  queryEntitiesWithinRadius,
  queryEntitiesWithinRadiusInto,
} from "../../src/sim/spatialGrid";
import type { SimulationBounds, SimulationScenario } from "../../src/sim/types";

const CELL_SIZE = 64;
const QUERY_RADIUS = 48;
const MEASURED_REBUILDS = 250;
const MEASURED_QUERIES = 2_000;

describe("spatial grid performance", () => {
  it("reports build and radius query timing for 1,000 entities", () => {
    const report = runSpatialGridPerformanceScenario(1_000);

    assertPerformanceReport(report, 1_000);
    writeSpatialGridReport(report);
  });

  it("reports build and radius query timing for 2,000 entities", () => {
    const report = runSpatialGridPerformanceScenario(2_000);

    assertPerformanceReport(report, 2_000);
    writeSpatialGridReport(report);
  });
});

interface QueryPoint {
  readonly x: number;
  readonly y: number;
}

interface SpatialGridPerformanceReport {
  readonly entityCount: number;
  readonly worldBounds: SimulationBounds;
  readonly cellSize: number;
  readonly measuredRebuilds: number;
  readonly measuredQueries: number;
  readonly queryRadius: number;
  readonly totalBuildMilliseconds: number;
  readonly meanBuildMilliseconds: number;
  readonly totalQueryMilliseconds: number;
  readonly meanQueryMilliseconds: number;
  readonly p95QueryMilliseconds: number;
  readonly maximumQueryMilliseconds: number;
  readonly totalResultCount: number;
  readonly deterministicSampleResult: readonly number[];
}

function runSpatialGridPerformanceScenario(
  entityCount: number,
): SpatialGridPerformanceReport {
  const scenario = createPerformanceScenario(entityCount);
  const simulation = createSimulation(scenario);
  const grid = createSpatialGrid({
    bounds: simulation.world.bounds,
    cellSize: CELL_SIZE,
    capacity: simulation.world.entityCount,
  });
  const queryPoints = createDeterministicQueryPoints(
    simulation.world.bounds,
    MEASURED_QUERIES,
  );
  const queryResults: number[] = [];
  const querySamples = new Float64Array(MEASURED_QUERIES);

  let totalBuildMilliseconds = 0;
  for (let rebuild = 0; rebuild < MEASURED_REBUILDS; rebuild += 1) {
    const startedAt = performance.now();
    buildSpatialGrid(grid, simulation.world);
    totalBuildMilliseconds += performance.now() - startedAt;
  }

  const deterministicSamplePoint = queryPoints[0]!;
  const deterministicSampleResult = queryEntitiesWithinRadius(
    grid,
    deterministicSamplePoint.x,
    deterministicSamplePoint.y,
    QUERY_RADIUS,
  );
  const repeatedSampleResult = queryEntitiesWithinRadius(
    grid,
    deterministicSamplePoint.x,
    deterministicSamplePoint.y,
    QUERY_RADIUS,
  );
  expect(repeatedSampleResult).toEqual(deterministicSampleResult);
  expect(Array.isArray(deterministicSampleResult)).toBe(true);
  assertEntityIdArray(deterministicSampleResult);

  let totalQueryMilliseconds = 0;
  let maximumQueryMilliseconds = 0;
  let totalResultCount = 0;

  for (let queryIndex = 0; queryIndex < queryPoints.length; queryIndex += 1) {
    const queryPoint = queryPoints[queryIndex]!;
    const startedAt = performance.now();
    const returnedResults = queryEntitiesWithinRadiusInto(
      grid,
      queryPoint.x,
      queryPoint.y,
      QUERY_RADIUS,
      queryResults,
    );
    const elapsedMilliseconds = performance.now() - startedAt;

    expect(returnedResults).toBe(queryResults);
    assertEntityIdArray(queryResults);

    querySamples[queryIndex] = elapsedMilliseconds;
    totalQueryMilliseconds += elapsedMilliseconds;
    maximumQueryMilliseconds = Math.max(
      maximumQueryMilliseconds,
      elapsedMilliseconds,
    );
    totalResultCount += queryResults.length;
  }

  const sortedQuerySamples = Array.from(querySamples).sort(
    (left, right) => left - right,
  );
  const p95Index = Math.ceil(sortedQuerySamples.length * 0.95) - 1;

  return {
    entityCount: simulation.world.entityCount,
    worldBounds: simulation.world.bounds,
    cellSize: CELL_SIZE,
    measuredRebuilds: MEASURED_REBUILDS,
    measuredQueries: MEASURED_QUERIES,
    queryRadius: QUERY_RADIUS,
    totalBuildMilliseconds,
    meanBuildMilliseconds: totalBuildMilliseconds / MEASURED_REBUILDS,
    totalQueryMilliseconds,
    meanQueryMilliseconds: totalQueryMilliseconds / MEASURED_QUERIES,
    p95QueryMilliseconds: sortedQuerySamples[p95Index]!,
    maximumQueryMilliseconds,
    totalResultCount,
    deterministicSampleResult,
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

function createDeterministicQueryPoints(
  bounds: SimulationBounds,
  queryCount: number,
): readonly QueryPoint[] {
  const queryPoints = new Array<QueryPoint>(queryCount);

  for (let index = 0; index < queryCount; index += 1) {
    queryPoints[index] = {
      x: (index * 131 + 17) % bounds.width,
      y: (index * 197 + 23) % bounds.height,
    };
  }

  return queryPoints;
}

function assertPerformanceReport(
  report: SpatialGridPerformanceReport,
  entityCount: number,
): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.measuredRebuilds).toBe(MEASURED_REBUILDS);
  expect(report.measuredQueries).toBe(MEASURED_QUERIES);
  expect(report.cellSize).toBe(CELL_SIZE);
  expect(report.queryRadius).toBe(QUERY_RADIUS);
  expect(report.worldBounds).toEqual(FOUNDATION_SCENARIO.bounds);
  expect(report.totalResultCount).toBeGreaterThanOrEqual(0);
  assertEntityIdArray(report.deterministicSampleResult);

  for (const value of [
    report.totalBuildMilliseconds,
    report.meanBuildMilliseconds,
    report.totalQueryMilliseconds,
    report.meanQueryMilliseconds,
    report.p95QueryMilliseconds,
    report.maximumQueryMilliseconds,
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

function writeSpatialGridReport(report: SpatialGridPerformanceReport): void {
  process.stdout.write(
    "\nSpatial grid performance report\n" +
      JSON.stringify(
        {
          entityCount: report.entityCount,
          worldBounds: report.worldBounds,
          cellSize: report.cellSize,
          measuredRebuilds: report.measuredRebuilds,
          measuredQueries: report.measuredQueries,
          queryRadius: report.queryRadius,
          totalBuildMilliseconds: roundForReport(
            report.totalBuildMilliseconds,
          ),
          meanBuildMilliseconds: roundForReport(report.meanBuildMilliseconds),
          totalQueryMilliseconds: roundForReport(
            report.totalQueryMilliseconds,
          ),
          meanQueryMilliseconds: roundForReport(report.meanQueryMilliseconds),
          p95QueryMilliseconds: roundForReport(report.p95QueryMilliseconds),
          maximumQueryMilliseconds: roundForReport(
            report.maximumQueryMilliseconds,
          ),
          totalResultCount: report.totalResultCount,
          deterministicSampleResultCount:
            report.deterministicSampleResult.length,
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

