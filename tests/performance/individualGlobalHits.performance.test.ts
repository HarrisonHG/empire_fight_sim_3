import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  createIndividualCombatProfileStore,
  type IndividualArmourCategory,
  type IndividualCombatProfileConfig,
} from "../../src/sim/individualCombatProfile";
import {
  applyIndividualLandedHits,
  createIndividualGlobalHitStore,
  type IndividualLandedHitApplicationRecord,
  type IndividualZeroHitEvent,
} from "../../src/sim/individualGlobalHits";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type { SimulationBounds } from "../../src/sim/types";

const MEASURED_TICKS = 30;

describe("individual global-hit performance", () => {
  it.each([100, 500, 1_000])(
    "reports standalone landed-hit application timing for %i entities",
    (entityCount) => {
      const report = runGlobalHitPerformance(entityCount);
      assertReport(report, entityCount);
      writeReport(report);
    },
  );

  it(
    "reports standalone landed-hit application timing for 2,000 entities",
    () => {
      const report = runGlobalHitPerformance(2_000);
      assertReport(report, 2_000);
      expect(report.membersPerUnit).toBe(20);
      writeReport(report);
    },
    30_000,
  );
});

interface GlobalHitPerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly measuredTicks: number;
  readonly landedRecordsPerTick: number;
  readonly landedRecordsConsumed: number;
  readonly totalAppliedHitLoss: number;
  readonly zeroHitTransitions: number;
  readonly alreadyZeroApplications: number;
  readonly totalMilliseconds: number;
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
  readonly timingPolicy: string;
}

function runGlobalHitPerformance(
  entityCount: number,
): GlobalHitPerformanceReport {
  const membersPerUnit = entityCount >= 1_000 ? 20 : 10;
  expect(entityCount % (membersPerUnit * 2)).toBe(0);
  const unitCount = entityCount / membersPerUnit;
  const bounds = { width: (unitCount / 2) * 64 + 160, height: 192 };
  const profiles = createIndividualCombatProfileStore({
    entityCount,
    profiles: Array.from({ length: entityCount }, (_, entityId) =>
      combatProfile(entityId),
    ),
  });
  const hitStore = createIndividualGlobalHitStore(profiles, { entityCount });
  const defenceRecords = Array.from({ length: entityCount }, (_, entityId) =>
    landedRecord((entityId + 1) % entityCount, entityId),
  );
  const applications: IndividualLandedHitApplicationRecord[] = [];
  const zeroEvents: IndividualZeroHitEvent[] = [];
  const samples = new Float64Array(MEASURED_TICKS);
  let landedRecordsConsumed = 0;
  let totalAppliedHitLoss = 0;
  let zeroHitTransitions = 0;
  let alreadyZeroApplications = 0;
  let totalMilliseconds = 0;
  let maximumMillisecondsPerTick = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const result = applyIndividualLandedHits(
      hitStore,
      defenceRecords,
      applications,
      zeroEvents,
    );
    const elapsed = performance.now() - startedAt;
    samples[tick] = elapsed;
    totalMilliseconds += elapsed;
    maximumMillisecondsPerTick = Math.max(maximumMillisecondsPerTick, elapsed);
    landedRecordsConsumed += result.landedRecordCount;
    totalAppliedHitLoss += result.totalAppliedHitLoss;
    zeroHitTransitions += result.zeroHitEvents.length;
    alreadyZeroApplications += result.alreadyZeroApplicationCount;
  }

  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    entityCount,
    unitCount,
    membersPerUnit,
    worldBounds: bounds,
    measuredTicks: MEASURED_TICKS,
    landedRecordsPerTick: defenceRecords.length,
    landedRecordsConsumed,
    totalAppliedHitLoss,
    zeroHitTransitions,
    alreadyZeroApplications,
    totalMilliseconds,
    meanMillisecondsPerTick: totalMilliseconds / MEASURED_TICKS,
    maximumMillisecondsPerTick,
    p95MillisecondsPerTick:
      sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    timingPolicy:
      "Structural assertions only; defence records are precomputed landed outcomes so this isolates global-hit application cost.",
  };
}

function combatProfile(entityId: number): IndividualCombatProfileConfig {
  const armourCategories: readonly IndividualArmourCategory[] = [
    "none",
    "light",
    "medium",
    "heavy",
    "mageArmour",
  ];
  return {
    entityId,
    primaryWeapon: "oneHanded",
    shieldCategory: "none",
    shieldCarriedState: "none",
    armourCategory: armourCategories[entityId % armourCategories.length]!,
    hasQualifyingHelmet: entityId % 7 === 0,
    temporaryAlwaysOnHitModifier: entityId % 11 === 0 ? 1 : 0,
    qualifications: {
      hasWeaponMaster: true,
      hasShield: true,
      hasMarksman: true,
      hasThrown: true,
      hasAmbidexterity: false,
      enduranceLevels: entityId % 3,
      fortitudeLevels: entityId % 4,
      hasDreadnought: entityId % 5 === 3,
    },
    magicalCapabilities: {
      canUseRod: true,
      canUseStaff: true,
      canWearMageArmour: true,
      canDeliverCombatMagic: true,
    },
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

function assertReport(
  report: GlobalHitPerformanceReport,
  entityCount: number,
): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.landedRecordsPerTick).toBe(entityCount);
  expect(report.landedRecordsConsumed).toBe(entityCount * MEASURED_TICKS);
  expect(report.totalAppliedHitLoss).toBeGreaterThan(0);
  expect(report.zeroHitTransitions).toBe(entityCount);
  expect(report.alreadyZeroApplications).toBeGreaterThan(0);
  expect(report.totalMilliseconds).toBeGreaterThanOrEqual(0);
  expect(report.meanMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.maximumMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.p95MillisecondsPerTick).toBeGreaterThanOrEqual(0);
}

function writeReport(report: GlobalHitPerformanceReport): void {
  process.stdout.write(
    `\nIndividual global-hit performance report\n${JSON.stringify(report, null, 2)}\n`,
  );
}
