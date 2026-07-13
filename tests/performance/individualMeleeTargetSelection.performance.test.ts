import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { createFormationBehaviourStore } from "../../src/sim/formationBehaviour";
import {
  createIndividualCombatProfileStore,
  type IndividualCombatProfileConfig,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  advanceIndividualMeleeTargetSelection,
  createIndividualMeleeTargetSelectionStore,
  type IndividualSelectedTargetRecord,
} from "../../src/sim/individualMeleeTargetSelection";
import type { SimulationBounds, WorldState } from "../../src/sim/types";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";

const MEMBERS_PER_UNIT = 20;
const MEASURED_TICKS = 30;
const WEAPONS: readonly IndividualWeaponCategory[] = [
  "dagger",
  "oneHanded",
  "polearm",
  "pike",
];

describe("individual melee target-selection performance", () => {
  it.each([100, 500, 1_000])(
    "reports bounded local targeting for %i entities",
    (entityCount) => {
      const report = runTargetPerformance(entityCount);
      assertReport(report, entityCount);
      writeReport(report);
    },
  );

  it(
    "reports 2,000 entities in 100 ordinary 20-person units",
    () => {
      const report = runTargetPerformance(2_000);
      assertReport(report, 2_000);
      expect(report.unitCount).toBe(100);
      expect(report.membersPerUnit).toBe(20);
      writeReport(report);
    },
    30_000,
  );
});

interface TargetPerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly measuredTicks: number;
  readonly totalQueries: number;
  readonly totalRecords: number;
  readonly totalActiveTargets: number;
  readonly totalMilliseconds: number;
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
  readonly timingPolicy: string;
}

function runTargetPerformance(entityCount: number): TargetPerformanceReport {
  const membersPerUnit = entityCount === 2_000 ? MEMBERS_PER_UNIT : 10;
  expect(entityCount % (membersPerUnit * 2)).toBe(0);
  const unitCount = entityCount / membersPerUnit;
  const pairCount = unitCount / 2;
  const bounds = { width: pairCount * 64 + 160, height: 192 };
  const world = createWorld(entityCount, bounds);
  const identityUnits: Array<{
    unitId: number;
    factionId: number;
    memberEntityIds: number[];
  }> = [];
  const formationUnits: Array<{
    unitId: number;
    anchorX: number;
    anchorY: number;
    headingX: number;
    headingY: number;
    spacing: number;
    rows: number;
    cols: number;
    unitSpeed: number;
    order: "hold";
  }> = [];
  const individuals: Array<{
    entityId: number;
    role: "regular";
    slotRow: number;
    slotCol: number;
    memberMaxStep: number;
  }> = [];
  const profiles: IndividualCombatProfileConfig[] = [];
  let nextEntityId = 0;

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const sourceX = pairIndex * 64 + 64;
    const unitMemberIds: [number[], number[]] = [[], []];
    for (let side = 0; side < 2; side += 1) {
      const unitId = pairIndex * 2 + side + 1;
      const headingX = side === 0 ? 1 : -1;
      const anchorX = sourceX + side * 6;
      for (let memberIndex = 0; memberIndex < membersPerUnit; memberIndex += 1) {
        const entityId = nextEntityId;
        nextEntityId += 1;
        unitMemberIds[side]!.push(entityId);
        world.positionsX[entityId] = anchorX;
        world.positionsY[entityId] = 56 + memberIndex * 4;
        individuals.push({
          entityId,
          role: "regular",
          slotRow: memberIndex,
          slotCol: 0,
          memberMaxStep: 0,
        });
        profiles.push(combatProfile(entityId, WEAPONS[entityId % WEAPONS.length]!));
      }
      identityUnits.push({
        unitId,
        factionId: side + 1,
        memberEntityIds: unitMemberIds[side]!,
      });
      formationUnits.push({
        unitId,
        anchorX,
        anchorY: 56,
        headingX,
        headingY: 0,
        spacing: 4,
        rows: membersPerUnit,
        cols: 1,
        unitSpeed: 0,
        order: "hold",
      });
    }
  }

  const identity = createUnitIdentityStore({ entityCount, units: identityUnits });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x5b00,
    units: formationUnits,
    individuals,
  });
  const profileStore = createIndividualCombatProfileStore({
    entityCount,
    profiles,
  });
  const targetStore = createIndividualMeleeTargetSelectionStore({
    entityCount,
    bounds,
  });
  const records: IndividualSelectedTargetRecord[] = [];
  const samples = new Float64Array(MEASURED_TICKS);
  let totalMilliseconds = 0;
  let maximumMillisecondsPerTick = 0;
  let totalQueries = 0;
  let totalRecords = 0;
  let totalActiveTargets = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const result = advanceIndividualMeleeTargetSelection(
      world,
      identity,
      formation,
      profileStore,
      targetStore,
      records,
    );
    const elapsed = performance.now() - startedAt;
    samples[tick] = elapsed;
    totalMilliseconds += elapsed;
    maximumMillisecondsPerTick = Math.max(maximumMillisecondsPerTick, elapsed);
    totalQueries += result.queryCount;
    totalRecords += result.records.length;
    totalActiveTargets += result.activeTargetCount;
  }

  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    entityCount,
    unitCount,
    membersPerUnit,
    worldBounds: bounds,
    measuredTicks: MEASURED_TICKS,
    totalQueries,
    totalRecords,
    totalActiveTargets,
    totalMilliseconds,
    meanMillisecondsPerTick: totalMilliseconds / MEASURED_TICKS,
    maximumMillisecondsPerTick,
    p95MillisecondsPerTick:
      sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    timingPolicy:
      "Structural assertions only; no tight machine-dependent timing threshold.",
  };
}

function createWorld(entityCount: number, bounds: SimulationBounds): WorldState {
  return {
    entityCount,
    bounds,
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}

function combatProfile(
  entityId: number,
  primaryWeapon: IndividualWeaponCategory,
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon,
    shieldCategory: "none",
    shieldCarriedState: "none",
    armourCategory: "none",
    hasQualifyingHelmet: false,
    qualifications: {
      hasWeaponMaster: true,
      hasShield: false,
      hasMarksman: false,
      hasThrown: false,
      hasAmbidexterity: false,
      enduranceLevels: 0,
      fortitudeLevels: 0,
      hasDreadnought: false,
    },
    magicalCapabilities: {
      canUseRod: false,
      canUseStaff: false,
      canWearMageArmour: false,
      canDeliverCombatMagic: false,
    },
  };
}

function assertReport(report: TargetPerformanceReport, entityCount: number): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.totalQueries).toBe(entityCount * MEASURED_TICKS);
  expect(report.totalRecords).toBe(entityCount * MEASURED_TICKS);
  expect(report.totalActiveTargets).toBeGreaterThan(0);
  expect(report.totalMilliseconds).toBeGreaterThanOrEqual(0);
  expect(report.meanMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.maximumMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.p95MillisecondsPerTick).toBeGreaterThanOrEqual(0);
}

function writeReport(report: TargetPerformanceReport): void {
  process.stdout.write(
    `\nIndividual melee target-selection performance report\n${JSON.stringify(report, null, 2)}\n`,
  );
}
