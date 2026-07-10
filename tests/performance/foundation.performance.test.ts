import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { FOUNDATION_SCENARIO } from "../../src/content/foundationScenario";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";

const WARM_UP_TICKS = 250;
const MEASURED_TICKS = 2_000;
const ABSOLUTE_RED_FLAG_MS = 50;
const LOCAL_REFERENCE_TARGET_MS = 10;

describe("foundation simulation performance", () => {
  it("reports tick timing for 2,000 moving entities", () => {
    const simulation = createSimulation(FOUNDATION_SCENARIO);

    for (let tick = 0; tick < WARM_UP_TICKS; tick += 1) {
      advanceSimulationOneTick(simulation);
    }

    const samples = new Float64Array(MEASURED_TICKS);
    let totalMilliseconds = 0;
    let maximumMillisecondsPerTick = 0;

    for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
      const startedAt = performance.now();
      advanceSimulationOneTick(simulation);
      const elapsedMilliseconds = performance.now() - startedAt;

      samples[tick] = elapsedMilliseconds;
      totalMilliseconds += elapsedMilliseconds;
      maximumMillisecondsPerTick = Math.max(
        maximumMillisecondsPerTick,
        elapsedMilliseconds,
      );
    }

    const sortedSamples = Array.from(samples).sort((left, right) => left - right);
    const p95Index = Math.ceil(sortedSamples.length * 0.95) - 1;
    const p95MillisecondsPerTick = sortedSamples[p95Index]!;
    const meanMillisecondsPerTick = totalMilliseconds / MEASURED_TICKS;
    const effectiveTicksPerSecond =
      (MEASURED_TICKS * 1_000) / totalMilliseconds;
    const finalTick = simulation.tick;

    process.stdout.write(
      "\nFoundation performance report\n" +
        JSON.stringify(
          {
            entityCount: simulation.world.entityCount,
            warmUpTicks: WARM_UP_TICKS,
            measuredTicks: MEASURED_TICKS,
            totalMilliseconds: roundForReport(totalMilliseconds),
            meanMillisecondsPerTick: roundForReport(meanMillisecondsPerTick),
            p95MillisecondsPerTick: roundForReport(p95MillisecondsPerTick),
            maximumMillisecondsPerTick: roundForReport(
              maximumMillisecondsPerTick,
            ),
            effectiveTicksPerSecond: roundForReport(effectiveTicksPerSecond),
            finalTick,
            guidance: `Local/reference-machine target: p95 below ${LOCAL_REFERENCE_TARGET_MS} ms. Automated red flag: p95 at or above ${ABSOLUTE_RED_FLAG_MS} ms.`,
          },
          null,
          2,
        ) +
        "\n",
    );

    expect(simulation.world.entityCount).toBe(2_000);
    expect(samples).toHaveLength(MEASURED_TICKS);

    for (const sample of samples) {
      expect(Number.isFinite(sample)).toBe(true);
      expect(sample).toBeGreaterThanOrEqual(0);
    }

    for (const aggregate of [
      totalMilliseconds,
      meanMillisecondsPerTick,
      p95MillisecondsPerTick,
      maximumMillisecondsPerTick,
      effectiveTicksPerSecond,
    ]) {
      expect(Number.isFinite(aggregate)).toBe(true);
      expect(aggregate).toBeGreaterThanOrEqual(0);
    }

    expect(finalTick).toBe(WARM_UP_TICKS + MEASURED_TICKS);
    expect(p95MillisecondsPerTick).toBeLessThan(ABSOLUTE_RED_FLAG_MS);
  });
});

function roundForReport(value: number): number {
  return Number(value.toFixed(6));
}
