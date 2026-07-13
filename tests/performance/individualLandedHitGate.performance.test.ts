import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  createIndividualLandedHitGateStore,
  filterIndividualLandedHitsThroughGate,
  type IndividualLandedHitGateDecisionRecord,
} from "../../src/sim/individualLandedHitGate";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type { SimulationBounds } from "../../src/sim/types";

const MEASURED_TICKS = 30;

describe("individual landed-hit gate performance", () => {
  it.each([100, 500, 1_000])(
    "reports standalone sparse gate timing for %i entities",
    (entityCount) => {
      const report = runGatePerformance(entityCount);
      assertReport(report, entityCount);
      writeReport(report);
    },
  );

  it(
    "reports standalone sparse gate timing for 2,000 entities",
    () => {
      const report = runGatePerformance(2_000);
      assertReport(report, 2_000);
      expect(report.membersPerUnit).toBe(20);
      writeReport(report);
    },
    30_000,
  );
});

interface GatePerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly measuredTicks: number;
  readonly acceptedPathRecordsPerTick: number;
  readonly cooldownPathRecordsPerTick: number;
  readonly relationshipsCreated: number;
  readonly landedRecordsConsidered: number;
  readonly acceptedRecords: number;
  readonly rejectedRecords: number;
  readonly expiredRelationships: number;
  readonly activeRelationships: number;
  readonly totalMilliseconds: number;
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
  readonly timingPolicy: string;
}

function runGatePerformance(entityCount: number): GatePerformanceReport {
  const membersPerUnit = entityCount >= 1_000 ? 20 : 10;
  expect(entityCount % (membersPerUnit * 2)).toBe(0);
  const unitCount = entityCount / membersPerUnit;
  const worldBounds = { width: (unitCount / 2) * 64 + 160, height: 192 };
  const store = createIndividualLandedHitGateStore({ entityCount });
  const acceptedPathRecords = Array.from(
    { length: entityCount / 2 },
    (_, entityId) => landedRecord((entityId + 1) % entityCount, entityId),
  );
  const cooldownPathRecords = Array.from(
    { length: entityCount / 2 },
    (_, index) => {
      const defenderEntityId = index + entityCount / 2;
      return landedRecord((defenderEntityId + 1) % entityCount, defenderEntityId);
    },
  );
  const allRecords = acceptedPathRecords.concat(cooldownPathRecords);
  const decisions: IndividualLandedHitGateDecisionRecord[] = [];
  const accepted: IndividualMeleeDefenceRecord[] = [];
  const samples = new Float64Array(MEASURED_TICKS);
  let relationshipsCreated = 0;
  let landedRecordsConsidered = 0;
  let acceptedRecords = 0;
  let rejectedRecords = 0;
  let expiredRelationships = 0;
  let activeRelationships = 0;
  let totalMilliseconds = 0;
  let maximumMillisecondsPerTick = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const records = tick === 0 ? allRecords : cooldownPathRecords;
    const startedAt = performance.now();
    const result = filterIndividualLandedHitsThroughGate(
      store,
      tick,
      records,
      decisions,
      accepted,
    );
    const elapsed = performance.now() - startedAt;
    samples[tick] = elapsed;
    totalMilliseconds += elapsed;
    maximumMillisecondsPerTick = Math.max(maximumMillisecondsPerTick, elapsed);
    relationshipsCreated += result.relationshipCreatedCount;
    landedRecordsConsidered += result.landedRecordsConsidered;
    acceptedRecords += result.acceptedCount;
    rejectedRecords += result.rejectedCount;
    expiredRelationships += result.expiredRelationshipCount;
    activeRelationships = result.activeRelationshipCount;
  }

  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    entityCount,
    unitCount,
    membersPerUnit,
    worldBounds,
    measuredTicks: MEASURED_TICKS,
    acceptedPathRecordsPerTick: acceptedPathRecords.length,
    cooldownPathRecordsPerTick: cooldownPathRecords.length,
    relationshipsCreated,
    landedRecordsConsidered,
    acceptedRecords,
    rejectedRecords,
    expiredRelationships,
    activeRelationships,
    totalMilliseconds,
    meanMillisecondsPerTick: totalMilliseconds / MEASURED_TICKS,
    maximumMillisecondsPerTick,
    p95MillisecondsPerTick:
      sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    timingPolicy:
      "Structural assertions only; defence records are precomputed landed outcomes so this isolates sparse relationship gate cost.",
  };
}

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId,
    defenderEntityId,
    attackerWeaponCategory: "oneHanded",
    defenderActiveWeaponCategory: "oneHanded",
    defenderShieldCategory: "none",
    defenderShieldCarriedState: "none",
    defenderActionState: "ready",
    guardStateBeforeResolution: "ready",
    defenderFacingX: -1,
    defenderFacingY: 0,
    incomingDirectionName: "west",
    incomingDirectionOctantIndex: 4,
    availableDefenceType: "none",
    outcome: "landed",
    landedReason: "noActiveDefence",
    defenceRecoveryTicksAssigned: 0,
    awkwardDistance: false,
  };
}

function assertReport(report: GatePerformanceReport, entityCount: number): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.acceptedPathRecordsPerTick).toBe(entityCount / 2);
  expect(report.cooldownPathRecordsPerTick).toBe(entityCount / 2);
  expect(report.relationshipsCreated).toBe(entityCount);
  expect(report.landedRecordsConsidered).toBe(
    entityCount + (MEASURED_TICKS - 1) * (entityCount / 2),
  );
  expect(report.acceptedRecords).toBeGreaterThan(0);
  expect(report.rejectedRecords).toBeGreaterThan(0);
  expect(report.expiredRelationships).toBeGreaterThan(0);
  expect(report.activeRelationships).toBeGreaterThan(0);
  expect(report.activeRelationships).toBeLessThanOrEqual(entityCount);
  expect(report.totalMilliseconds).toBeGreaterThanOrEqual(0);
  expect(report.meanMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.maximumMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.p95MillisecondsPerTick).toBeGreaterThanOrEqual(0);
}

function writeReport(report: GatePerformanceReport): void {
  process.stdout.write(
    `\nIndividual landed-hit gate performance report\n${JSON.stringify(report, null, 2)}\n`,
  );
}
