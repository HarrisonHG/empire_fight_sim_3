import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { createFormationBehaviourStore } from "../../src/sim/formationBehaviour";
import {
  advanceIndividualCombatActions,
  createIndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "../../src/sim/individualCombatAction";
import {
  createIndividualCombatProfileStore,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  advanceIndividualMeleeTargetSelection,
  createIndividualMeleeTargetSelectionStore,
  type IndividualSelectedTargetRecord,
} from "../../src/sim/individualMeleeTargetSelection";
import type { SimulationBounds, WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

const MEASURED_TICKS = 30;
const WEAPONS: readonly IndividualWeaponCategory[] = [
  "dagger",
  "oneHanded",
  "polearm",
  "pike",
];

describe("individual combat action performance", () => {
  it.each([100, 500, 1_000])(
    "reports standalone action lifecycle timing for %i entities",
    (entityCount) => {
      const report = runActionPerformance(entityCount);
      assertReport(report, entityCount);
      writeReport(report);
    },
  );

  it(
    "reports standalone action lifecycle timing for 2,000 entities",
    () => {
      const report = runActionPerformance(2_000);
      assertReport(report, 2_000);
      expect(report.membersPerUnit).toBe(20);
      writeReport(report);
    },
    30_000,
  );
});

interface ActionPerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly measuredTicks: number;
  readonly selectedTargetRecordCount: number;
  readonly totalActiveCommitments: number;
  readonly totalCompletedAttempts: number;
  readonly totalInvalidatedAttempts: number;
  readonly totalRecoveringEntities: number;
  readonly totalMilliseconds: number;
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
  readonly timingPolicy: string;
}

function runActionPerformance(entityCount: number): ActionPerformanceReport {
  const membersPerUnit = entityCount >= 1_000 ? 20 : 10;
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
    for (let side = 0; side < 2; side += 1) {
      const unitId = pairIndex * 2 + side + 1;
      const factionId = side + 1;
      const headingX = side === 0 ? 1 : -1;
      const anchorX = sourceX + side * 6;
      const memberIds: number[] = [];
      for (let memberIndex = 0; memberIndex < membersPerUnit; memberIndex += 1) {
        const entityId = nextEntityId;
        nextEntityId += 1;
        memberIds.push(entityId);
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
      identityUnits.push({ unitId, factionId, memberEntityIds: memberIds });
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
    rngSeed: 0x5c10,
    units: formationUnits,
    individuals,
  });
  const profileStore = createIndividualCombatProfileStore({
    entityCount,
    profiles,
  });
  const selectedTargetRecords = collectSelectedTargetRecords(
    world,
    identity,
    formation,
    profileStore,
    bounds,
  );
  const actionStore = createIndividualCombatActionStore(
    identity,
    formation,
    profileStore,
    { entityCount },
  );
  const attempts: IndividualMeleeAttackAttemptRecord[] = [];
  const samples = new Float64Array(MEASURED_TICKS);
  let totalMilliseconds = 0;
  let maximumMillisecondsPerTick = 0;
  let totalActiveCommitments = 0;
  let totalCompletedAttempts = 0;
  let totalInvalidatedAttempts = 0;
  let totalRecoveringEntities = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const result = advanceIndividualCombatActions(
      world,
      identity,
      formation,
      profileStore,
      selectedTargetRecords,
      actionStore,
      attempts,
    );
    const elapsed = performance.now() - startedAt;
    samples[tick] = elapsed;
    totalMilliseconds += elapsed;
    maximumMillisecondsPerTick = Math.max(maximumMillisecondsPerTick, elapsed);
    totalActiveCommitments += result.activeCommitmentCount;
    totalCompletedAttempts += result.completedAttemptCount;
    totalInvalidatedAttempts += result.invalidatedAttemptCount;
    totalRecoveringEntities += result.recoveringEntityCount;
  }

  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    entityCount,
    unitCount,
    membersPerUnit,
    worldBounds: bounds,
    measuredTicks: MEASURED_TICKS,
    selectedTargetRecordCount: selectedTargetRecords.length,
    totalActiveCommitments,
    totalCompletedAttempts,
    totalInvalidatedAttempts,
    totalRecoveringEntities,
    totalMilliseconds,
    meanMillisecondsPerTick: totalMilliseconds / MEASURED_TICKS,
    maximumMillisecondsPerTick,
    p95MillisecondsPerTick:
      sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    timingPolicy:
      "Structural assertions only; target records are precomputed so this isolates action lifecycle cost.",
  };
}

function collectSelectedTargetRecords(
  world: WorldState,
  identity: UnitIdentityStore,
  formation: Parameters<typeof advanceIndividualMeleeTargetSelection>[2],
  profileStore: IndividualCombatProfileStore,
  bounds: SimulationBounds,
): IndividualSelectedTargetRecord[] {
  const targetStore = createIndividualMeleeTargetSelectionStore({
    entityCount: world.entityCount,
    bounds,
  });
  const records: IndividualSelectedTargetRecord[] = [];
  return advanceIndividualMeleeTargetSelection(
    world,
    identity,
    formation,
    profileStore,
    targetStore,
    records,
  ).records.map((record) => ({ ...record }));
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

function assertReport(report: ActionPerformanceReport, entityCount: number): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.selectedTargetRecordCount).toBe(entityCount);
  expect(report.totalActiveCommitments).toBeGreaterThan(0);
  expect(report.totalCompletedAttempts).toBeGreaterThan(0);
  expect(report.totalInvalidatedAttempts).toBe(0);
  expect(report.totalRecoveringEntities).toBeGreaterThan(0);
  expect(report.totalMilliseconds).toBeGreaterThanOrEqual(0);
  expect(report.meanMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.maximumMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.p95MillisecondsPerTick).toBeGreaterThanOrEqual(0);
}

function writeReport(report: ActionPerformanceReport): void {
  process.stdout.write(
    `\nIndividual combat action performance report\n${JSON.stringify(report, null, 2)}\n`,
  );
}
