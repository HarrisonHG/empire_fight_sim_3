import { createHash } from "node:crypto";
import { performance, PerformanceObserver } from "node:perf_hooks";
import { afterEach, expect, it, vi } from "vitest";

import * as activeCollision from "../../src/sim/individualActiveStandingCollision";
import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import { setUnitOrder } from "../../src/sim/formationBehaviour";
import { advanceCombatSandboxOneTick, advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import type { SimulationScenario, SimulationState } from "../../src/sim/types";

const ONE_HOUR_TICKS = 72_000; // 20 fixed simulation ticks per second.
const SEED = 0x8_1_2026;
afterEach(() => vi.restoreAllMocks());

it("measures legal debug-off 2,000-entity production collision work", async () => {
  const simulation = createSimulation(createCollisionScenario(2_000));
  const combat = simulation.combatSandbox!;
  assertHardBodyLegality(simulation);
  const storage = captureTypedStorage(simulation);
  const before = process.memoryUsage();
  const gc = { count: 0, durationMilliseconds: 0 };
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gc.count += 1;
      gc.durationMilliseconds += entry.duration;
    }
  });
  observer.observe({ entryTypes: ["gc"] });
  let collisionMilliseconds = 0;
  const original = activeCollision.resolveOrdinaryActiveStandingFormationMovementOneTick;
  const timingSpy = vi.spyOn(activeCollision, "resolveOrdinaryActiveStandingFormationMovementOneTick")
    .mockImplementation((...args) => {
      const started = performance.now();
      const result = original(...args);
      collisionMilliseconds += performance.now() - started;
      return result;
    });
  for (let tick = 0; tick < 10; tick += 1) {
    advanceSimulationOneTick(simulation);
    timingSpy.mockClear();
  }
  collisionMilliseconds = 0;
  const samples: number[] = [];
  const stages: Record<string, number> = {};
  let maximumQueries = 0;
  let maximumCandidates = 0;
  let maximumPasses = 0;
  let constrainedMovers = 0;
  const measuredTicks = 100;
  for (let tick = 0; tick < measuredTicks; tick += 1) {
    const started = performance.now();
    advanceCombatSandboxOneTick(simulation.world, combat, simulation.tick, {
      runStage(stage, run) {
        const stageStarted = performance.now();
        const result = run();
        stages[stage] = (stages[stage] ?? 0) + performance.now() - stageStarted;
        return result;
      },
    });
    simulation.tick += 1;
    samples.push(performance.now() - started);
    const result = combat.individualActiveStandingCollisionResult;
    maximumQueries = Math.max(maximumQueries, result.localQueryCount);
    maximumCandidates = Math.max(maximumCandidates, result.localCandidateCount);
    maximumPasses = Math.max(maximumPasses, result.passCount);
    constrainedMovers += result.blockedCount + result.reducedCount + result.redirectedCount;
    expect(result.unresolvedOverlapCount).toBe(0);
    expect(result.passCount).toBeLessThanOrEqual(8);
    expect(result.localCandidateCount).toBeLessThan(2_000 * 128);
    timingSpy.mockClear();
  }
  assertHardBodyLegality(simulation);
  assertStorageRetained(storage, simulation);
  expect(constrainedMovers).toBeGreaterThan(0);
  expect(combat.inspectedEntityIds).toHaveLength(0);
  await new Promise<void>((resolve) => setImmediate(resolve));
  observer.disconnect();
  const after = process.memoryUsage();
  console.info("Milestone 8I legal acceptance", JSON.stringify({
    seed: SEED, entityCount: 2_000, debug: false, warmUpTicks: 10, measuredTicks,
    totalTick: timing(samples), ordinaryCollisionMeanMilliseconds: collisionMilliseconds / measuredTicks,
    stageMeanMilliseconds: Object.fromEntries(Object.entries(stages).map(([stage, ms]) => [stage, ms / measuredTicks])),
    maximumQueries, maximumCandidates, maximumPasses, constrainedMovers,
    retainedTypedStorageBytes: storage.reduce((bytes, item) => bytes + item.view.byteLength, 0),
    retainedTypedArrayCount: storage.length,
    heapUsedDeltaBytes: after.heapUsed - before.heapUsed,
    arrayBuffersDeltaBytes: after.arrayBuffers - before.arrayBuffers, gc,
    instrumentation: "Ordinary solver wrapper and production stage hooks; mock calls cleared each tick. GC is observed, not forced; heap delta is not total allocation.",
  }));
}, 30_000);

it("replays one hour of legal production collision with identical inputs and tick evidence", () => {
  const started = performance.now();
  const first = runCollisionSoak();
  const second = runCollisionSoak();
  expect(second).toEqual(first);
  expect(first.finalTick).toBe(ONE_HOUR_TICKS);
  expect(first.movingTicks).toBeGreaterThan(0);
  // Contact must still exercise collision late in the hour, not merely at startup.
  expect(first.lastQuarterConstrainedTicks).toBeGreaterThan(0);
  expect(first.maximumPasses).toBeLessThanOrEqual(8);
  console.info("Milestone 8I one-hour collision replay", JSON.stringify({
    seed: SEED, ticksPerRun: ONE_HOUR_TICKS, simulatedSecondsPerRun: 3_600,
    runCount: 2, entityCount: 20, elapsedMilliseconds: performance.now() - started,
    inputs: "Every 200 ticks: all four units hold for 20 ticks, then advance for 180; no position, routing or collision-state injection.",
    replayEqual: true, evidence: first,
    digestScope: "Every tick: positions, velocities, RNG state and every typed field of collision evidence/occupancy. Final enumerable simulation authority state also hashed; timing excluded.",
  }));
}, 120_000);

function runCollisionSoak() {
  const simulation = createSimulation(createCollisionScenario(20));
  const combat = simulation.combatSandbox!;
  const storage = captureTypedStorage(simulation);
  const hash = createHash("sha256");
  const rngBytes = new Uint32Array(1);
  let movingTicks = 0;
  let lastQuarterConstrainedTicks = 0;
  let maximumPasses = 0;
  for (let tick = 0; tick < ONE_HOUR_TICKS; tick += 1) {
    if (tick % 200 === 0 || tick % 200 === 20) {
      for (let unitId = 1; unitId <= 4; unitId += 1) {
        setUnitOrder(combat.formationStore, unitId, tick % 200 === 0 ? "hold" : "advance");
      }
    }
    advanceSimulationOneTick(simulation);
    const result = combat.individualActiveStandingCollisionResult;
    if (result.unresolvedOverlapCount !== 0 || result.passCount > 8) {
      throw new Error("Unresolved collision or unbounded solver at tick " + tick);
    }
    maximumPasses = Math.max(maximumPasses, result.passCount);
    const collision = combat.individualCollisionResolutionStore;
    let moved = false;
    for (let id = 0; id < simulation.world.entityCount; id += 1) {
      const dx = simulation.world.positionsX[id]! - collision.tickStartXByEntity[id]!;
      const dy = simulation.world.positionsY[id]! - collision.tickStartYByEntity[id]!;
      if (dx * dx + dy * dy > 9 || dx !== collision.resolvedDeltas[id * 2] || dy !== collision.resolvedDeltas[id * 2 + 1]) {
        throw new Error("Actual displacement/evidence budget mismatch at tick " + tick);
      }
      moved ||= dx !== 0 || dy !== 0;
    }
    if (moved) movingTicks += 1;
    if (tick >= ONE_HOUR_TICKS * 3 / 4 && result.blockedCount + result.reducedCount + result.redirectedCount > 0) {
      lastQuarterConstrainedTicks += 1;
    }
    assertHardBodyLegality(simulation);
    for (const view of [simulation.world.positionsX, simulation.world.positionsY,
      simulation.world.velocitiesX, simulation.world.velocitiesY,
      ...Object.values(collision).filter(ArrayBuffer.isView),
      ...Object.values(combat.individualPhysicalOccupancyStore).filter(ArrayBuffer.isView)]) {
      hash.update(Buffer.from(view.buffer, view.byteOffset, view.byteLength));
    }
    rngBytes[0] = simulation.rngState;
    hash.update(Buffer.from(rngBytes.buffer));
  }
  assertStorageRetained(storage, simulation);
  return {
    finalTick: simulation.tick, movingTicks, lastQuarterConstrainedTicks, maximumPasses,
    tickEvidenceSha256: hash.digest("hex"),
    finalAuthoritySha256: createHash("sha256").update(JSON.stringify(simulation, (_key, value: unknown) => {
      if (value instanceof Map) return Array.from(value.entries());
      if (value instanceof Set) return Array.from(value.values());
      return value;
    })).digest("hex"),
    retainedTypedArrayCount: storage.length,
    retainedTypedStorageBytes: storage.reduce((bytes, item) => bytes + item.view.byteLength, 0),
  };
}

function createCollisionScenario(entityCount: 20 | 2_000): SimulationScenario {
  const small = entityCount === 20;
  const unitCount = small ? 4 : 40;
  const memberCount = entityCount / unitCount;
  const base = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!.units[0]!;
  const { memberProfiles: _profiles, ...template } = base;
  return {
    seed: SEED, entityCount, bounds: { width: 1_800, height: 900 },
    minSpeedUnitsPerTick: 1, maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox", appliedDamagePressureScale: 2,
      requireLegalInitialHardStandingPlacement: true,
      inspectedEntityIds: [], includeEnergyDebug: false,
      units: Array.from({ length: unitCount }, (_, index) => {
        const pair = Math.floor(index / 2);
        const factionId = index % 2 + 1;
        const anchorX = 100 + pair % 5 * 320 + (factionId === 2 ? 70 : 0);
        const anchorY = 100 + Math.floor(pair / 5) * 180;
        return {
          ...template, unitId: index + 1, factionId, memberCount,
          anchorX, anchorY, headingX: factionId === 1 ? 1 : -1, headingY: 0,
          deploymentZone: { minX: anchorX - 16, maxX: anchorX + 16, minY: anchorY - 40, maxY: anchorY + 40 },
          rows: small ? 1 : 5, cols: small ? 5 : 10, spacing: 8,
          unitSpeed: 2, memberMaxStep: 3, order: "advance" as const,
          weaponCategory: "unarmed" as const, weaponReachBand: "none" as const,
          medicalProfile: { hasChirurgeon: false, hasPhysick: false },
          energyProfile: { maximumEnergy: 1_000_000, startingEnergy: 1_000_000, safeRestRecoveryPerTick: 5 },
        };
      }),
    },
  };
}

// Test-only spatial legality check, independent of the solver's overlap counter.
function assertHardBodyLegality(simulation: SimulationState): void {
  const world = simulation.world;
  const radius = simulation.combatSandbox!.individualPhysicalOccupancyStore.geometry.activeStandingRadius;
  const cells = new Map<string, number[]>();
  for (let id = 0; id < world.entityCount; id += 1) {
    const x = world.positionsX[id]!;
    const y = world.positionsY[id]!;
    if (x < 0 || y < 0 || x > world.bounds.width || y > world.bounds.height) throw new Error("Body outside bounds");
    const cx = Math.floor(x / 8);
    const cy = Math.floor(y / 8);
    for (let ox = -1; ox <= 1; ox += 1) for (let oy = -1; oy <= 1; oy += 1) {
      for (const other of cells.get((cx + ox) + ":" + (cy + oy)) ?? []) {
        const dx = x - world.positionsX[other]!;
        const dy = y - world.positionsY[other]!;
        const minimum = radius * 2;
        if (dx * dx + dy * dy < minimum * minimum) throw new Error("Illegal hard-body overlap: " + id + "/" + other);
      }
    }
    const key = cx + ":" + cy;
    const cell = cells.get(key) ?? [];
    cell.push(id);
    cells.set(key, cell);
  }
}

function captureTypedStorage(simulation: SimulationState) {
  const seen = new Set<object>();
  const result: { owner: Record<string, unknown>; key: string; view: ArrayBufferView }[] = [];
  function visit(value: unknown) {
    if (value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (ArrayBuffer.isView(child)) {
        if (!seen.has(child)) {
          seen.add(child);
          result.push({ owner: value as Record<string, unknown>, key, view: child });
        }
      }
      else visit(child);
    }
  }
  visit(simulation);
  return result;
}

function assertStorageRetained(storage: ReturnType<typeof captureTypedStorage>, simulation: SimulationState) {
  expect(storage.every(({ owner, key, view }) => owner[key] === view)).toBe(true);
  const current = captureTypedStorage(simulation);
  const originalViews = new Set(storage.map(({ view }) => view));
  expect(current.length).toBe(storage.length);
  expect(current.every(({ view }) => originalViews.has(view))).toBe(true);
}

function timing(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { meanMilliseconds: samples.reduce((sum, ms) => sum + ms, 0) / samples.length,
    p95Milliseconds: sorted[Math.ceil(sorted.length * 0.95) - 1], maximumMilliseconds: sorted.at(-1) };
}
