import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getUnitAnchor,
  type IndividualBehaviourConfig,
  type IndividualRole,
  type UnitFormationConfig,
  type UnitOrder,
} from "../../src/sim/formationBehaviour";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import type { SimulationBounds, WorldState } from "../../src/sim/types";

const MEMBERS_PER_UNIT = 20;
const FORMATION_ROWS = 5;
const FORMATION_COLS = 4;
const FORMATION_SPACING = 6;
const MEMBER_MAX_STEP = 4;
const UNIT_SPEED = 1;
const WORLD_BOUNDS: SimulationBounds = { width: 1_280, height: 720 };
const MEASURED_TICKS = 200;
const PERF_RNG_SEED = 0x0f0f_1234;

const ORDER_CYCLE: readonly UnitOrder[] = [
  "advance",
  "advanceCautious",
  "hold",
];

const ROLE_CYCLE: readonly IndividualRole[] = [
  "regular",
  "veteran",
  "recruit",
];

describe("formation behaviour performance", () => {
  it("reports tick timing for 100 entities in formed units", () => {
    const report = runFormationPerformanceScenario(100);
    assertPerformanceReport(report, 100);
    writeFormationReport(report);
  });

  it("reports tick timing for 500 entities in formed units", () => {
    const report = runFormationPerformanceScenario(500);
    assertPerformanceReport(report, 500);
    writeFormationReport(report);
  });

  it("reports tick timing for 1000 entities in formed units", () => {
    const report = runFormationPerformanceScenario(1_000);
    assertPerformanceReport(report, 1_000);
    writeFormationReport(report);
  });

  it(
    "reports tick timing for 2000 entities in 100 ordinary 20-person units",
    () => {
      const report = runFormationPerformanceScenario(2_000);
      assertPerformanceReport(report, 2_000);
      expect(report.unitCount).toBe(100);
      expect(report.membersPerUnit).toBe(20);
      writeFormationReport(report);
    },
    30_000,
  );
});

interface FormationPerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly measuredTicks: number;
  readonly totalTickMilliseconds: number;
  readonly meanTickMilliseconds: number;
  readonly maximumTickMilliseconds: number;
  readonly p95TickMilliseconds: number;
  readonly totalEventCount: number;
  readonly finalAnchorSample: {
    readonly unitId: number;
    readonly x: number;
    readonly y: number;
  };
}

function runFormationPerformanceScenario(
  entityCount: number,
): FormationPerformanceReport {
  expect(entityCount % MEMBERS_PER_UNIT).toBe(0);
  const unitCount = entityCount / MEMBERS_PER_UNIT;

  const identityStore = createDeterministicUnitIdentity(entityCount);
  const { units, individuals, world } = buildFormationScenario(entityCount);
  const store = createFormationBehaviourStore(identityStore, {
    entityCount,
    rngSeed: PERF_RNG_SEED,
    units,
    individuals,
  });

  const tickSamples = new Float64Array(MEASURED_TICKS);
  let totalTickMilliseconds = 0;
  let maximumTickMilliseconds = 0;
  let totalEventCount = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const result = advanceFormationOneTick(world, identityStore, store);
    const elapsed = performance.now() - startedAt;

    tickSamples[tick] = elapsed;
    totalTickMilliseconds += elapsed;
    if (elapsed > maximumTickMilliseconds) {
      maximumTickMilliseconds = elapsed;
    }
    totalEventCount += result.events.length;
  }

  assertWorldPositionsAreFinite(world);

  const sortedSamples = Array.from(tickSamples).sort(
    (left, right) => left - right,
  );
  const p95Index = Math.max(0, Math.ceil(sortedSamples.length * 0.95) - 1);
  const sampleUnitId = 1;
  const sampleAnchor = getUnitAnchor(store, sampleUnitId);

  return {
    entityCount,
    unitCount,
    membersPerUnit: MEMBERS_PER_UNIT,
    worldBounds: WORLD_BOUNDS,
    measuredTicks: MEASURED_TICKS,
    totalTickMilliseconds,
    meanTickMilliseconds: totalTickMilliseconds / MEASURED_TICKS,
    maximumTickMilliseconds,
    p95TickMilliseconds: sortedSamples[p95Index]!,
    totalEventCount,
    finalAnchorSample: {
      unitId: sampleUnitId,
      x: sampleAnchor.x,
      y: sampleAnchor.y,
    },
  };
}

interface FormationScenarioData {
  readonly units: readonly UnitFormationConfig[];
  readonly individuals: readonly IndividualBehaviourConfig[];
  readonly world: WorldState;
}

function buildFormationScenario(entityCount: number): FormationScenarioData {
  const unitCount = entityCount / MEMBERS_PER_UNIT;
  const unitsPerRow = Math.max(1, Math.floor(WORLD_BOUNDS.width / 120));
  const laneWidth = Math.floor(WORLD_BOUNDS.width / unitsPerRow);
  const laneHeight = Math.max(
    60,
    Math.floor(WORLD_BOUNDS.height / Math.ceil(unitCount / unitsPerRow)),
  );

  const units: UnitFormationConfig[] = [];
  const individuals: IndividualBehaviourConfig[] = [];
  const positionsX = new Int32Array(entityCount);
  const positionsY = new Int32Array(entityCount);

  for (let unitIndex = 0; unitIndex < unitCount; unitIndex += 1) {
    const gridCol = unitIndex % unitsPerRow;
    const gridRow = Math.floor(unitIndex / unitsPerRow);
    const anchorX = Math.min(
      WORLD_BOUNDS.width - 40,
      Math.max(40, gridCol * laneWidth + Math.floor(laneWidth / 2)),
    );
    const anchorY = Math.min(
      WORLD_BOUNDS.height - 40,
      Math.max(40, gridRow * laneHeight + Math.floor(laneHeight / 2)),
    );
    const order = ORDER_CYCLE[unitIndex % ORDER_CYCLE.length]!;

    units.push({
      unitId: unitIndex + 1,
      anchorX,
      anchorY,
      headingX: 1,
      headingY: 0,
      spacing: FORMATION_SPACING,
      rows: FORMATION_ROWS,
      cols: FORMATION_COLS,
      unitSpeed: UNIT_SPEED,
      order,
      cohesion: 800,
    });

    for (let memberIndex = 0; memberIndex < MEMBERS_PER_UNIT; memberIndex += 1) {
      const entityId = unitIndex * MEMBERS_PER_UNIT + memberIndex;
      const slotRow = Math.floor(memberIndex / FORMATION_COLS);
      const slotCol = memberIndex % FORMATION_COLS;
      const centerCol = Math.floor(FORMATION_COLS / 2);
      const backward = slotRow * FORMATION_SPACING;
      const lateral = (slotCol - centerCol) * FORMATION_SPACING;
      const slotX = anchorX - backward;
      const slotY = anchorY + lateral;
      positionsX[entityId] = slotX;
      positionsY[entityId] = slotY;

      const role = ROLE_CYCLE[memberIndex % ROLE_CYCLE.length]!;
      const pressure = unitIndex % 2 === 0 ? 500 : 0;
      individuals.push({
        entityId,
        role,
        slotRow,
        slotCol,
        memberMaxStep: MEMBER_MAX_STEP,
        pressure,
      });
    }
  }

  const world: WorldState = {
    entityCount,
    bounds: WORLD_BOUNDS,
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX,
    positionsY,
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };

  return { units, individuals, world };
}

function createDeterministicUnitIdentity(
  entityCount: number,
): UnitIdentityStore {
  const unitCount = entityCount / MEMBERS_PER_UNIT;
  return createUnitIdentityStore({
    entityCount,
    units: Array.from({ length: unitCount }, (_, unitIndex) => {
      const firstEntityId = unitIndex * MEMBERS_PER_UNIT;
      return {
        unitId: unitIndex + 1,
        factionId: (unitIndex % 2) + 1,
        memberEntityIds: Array.from(
          { length: MEMBERS_PER_UNIT },
          (__, memberIndex) => firstEntityId + memberIndex,
        ),
      };
    }),
  });
}

function assertWorldPositionsAreFinite(world: WorldState): void {
  for (let index = 0; index < world.entityCount; index += 1) {
    expect(Number.isFinite(world.positionsX[index]!)).toBe(true);
    expect(Number.isFinite(world.positionsY[index]!)).toBe(true);
  }
}

function assertPerformanceReport(
  report: FormationPerformanceReport,
  entityCount: number,
): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.unitCount).toBe(entityCount / MEMBERS_PER_UNIT);
  expect(report.membersPerUnit).toBe(MEMBERS_PER_UNIT);
  expect(report.measuredTicks).toBe(MEASURED_TICKS);
  expect(report.worldBounds).toEqual(WORLD_BOUNDS);
  expect(report.totalEventCount).toBeGreaterThanOrEqual(0);
  expect(Number.isSafeInteger(report.finalAnchorSample.unitId)).toBe(true);

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

function writeFormationReport(report: FormationPerformanceReport): void {
  process.stdout.write(
    "\nFormation behaviour performance report\n" +
      JSON.stringify(
        {
          entityCount: report.entityCount,
          unitCount: report.unitCount,
          membersPerUnit: report.membersPerUnit,
          worldBounds: report.worldBounds,
          measuredTicks: report.measuredTicks,
          totalTickMilliseconds: roundForReport(report.totalTickMilliseconds),
          meanTickMilliseconds: roundForReport(report.meanTickMilliseconds),
          maximumTickMilliseconds: roundForReport(
            report.maximumTickMilliseconds,
          ),
          p95TickMilliseconds: roundForReport(report.p95TickMilliseconds),
          totalEventCount: report.totalEventCount,
          finalAnchorSample: report.finalAnchorSample,
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
