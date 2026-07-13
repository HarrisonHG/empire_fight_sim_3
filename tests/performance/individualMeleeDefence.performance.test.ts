import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { createFormationBehaviourStore } from "../../src/sim/formationBehaviour";
import {
  createIndividualCombatActionStore,
  type IndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "../../src/sim/individualCombatAction";
import {
  createIndividualCombatProfileStore,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualShieldCarriedState,
  type IndividualShieldCategory,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  createIndividualMeleeDefenceStore,
  resolveIndividualMeleeDefences,
  type IndividualMeleeDefenceRecord,
  type IndividualMeleeDefenceStore,
} from "../../src/sim/individualMeleeDefence";
import type { SimulationBounds, WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

const MEASURED_TICKS = 30;

describe("individual melee defence performance", () => {
  it.each([100, 500, 1_000])(
    "reports standalone defence resolution timing for %i entities",
    (entityCount) => {
      const report = runDefencePerformance(entityCount);
      assertReport(report, entityCount);
      writeReport(report);
    },
  );

  it(
    "reports standalone defence resolution timing for 2,000 entities",
    () => {
      const report = runDefencePerformance(2_000);
      assertReport(report, 2_000);
      expect(report.membersPerUnit).toBe(20);
      writeReport(report);
    },
    30_000,
  );
});

interface DefencePerformanceHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly profiles: IndividualCombatProfileStore;
  readonly actions: IndividualCombatActionStore;
  readonly defence: IndividualMeleeDefenceStore;
  readonly attempts: readonly IndividualMeleeAttackAttemptRecord[];
}

interface DefencePerformanceReport {
  readonly entityCount: number;
  readonly unitCount: number;
  readonly membersPerUnit: number;
  readonly worldBounds: SimulationBounds;
  readonly measuredTicks: number;
  readonly attemptsPerTick: number;
  readonly attemptsConsumed: number;
  readonly parries: number;
  readonly bucklerBlocks: number;
  readonly shieldBlocks: number;
  readonly landedAttacks: number;
  readonly guardRecoveries: number;
  readonly totalMilliseconds: number;
  readonly meanMillisecondsPerTick: number;
  readonly maximumMillisecondsPerTick: number;
  readonly p95MillisecondsPerTick: number;
  readonly timingPolicy: string;
}

function runDefencePerformance(entityCount: number): DefencePerformanceReport {
  const harness = createHarness(entityCount);
  const records: IndividualMeleeDefenceRecord[] = [];
  const samples = new Float64Array(MEASURED_TICKS);
  let attemptsConsumed = 0;
  let parries = 0;
  let bucklerBlocks = 0;
  let shieldBlocks = 0;
  let landedAttacks = 0;
  let guardRecoveries = 0;
  let totalMilliseconds = 0;
  let maximumMillisecondsPerTick = 0;

  for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
    const startedAt = performance.now();
    const result = resolveIndividualMeleeDefences(
      harness.world,
      harness.identity,
      harness.actions,
      harness.profiles,
      harness.defence,
      harness.attempts,
      records,
    );
    const elapsed = performance.now() - startedAt;
    samples[tick] = elapsed;
    totalMilliseconds += elapsed;
    maximumMillisecondsPerTick = Math.max(maximumMillisecondsPerTick, elapsed);
    attemptsConsumed += result.attemptsConsumed;
    parries += result.parryCount;
    bucklerBlocks += result.bucklerBlockCount;
    shieldBlocks += result.shieldBlockCount;
    landedAttacks += result.landedCount;
    guardRecoveries += result.recoveringGuardCount;
  }

  const sorted = Array.from(samples).sort((left, right) => left - right);
  return {
    entityCount,
    unitCount: entityCount / harness.membersPerUnit,
    membersPerUnit: harness.membersPerUnit,
    worldBounds: harness.world.bounds,
    measuredTicks: MEASURED_TICKS,
    attemptsPerTick: harness.attempts.length,
    attemptsConsumed,
    parries,
    bucklerBlocks,
    shieldBlocks,
    landedAttacks,
    guardRecoveries,
    totalMilliseconds,
    meanMillisecondsPerTick: totalMilliseconds / MEASURED_TICKS,
    maximumMillisecondsPerTick,
    p95MillisecondsPerTick:
      sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
    timingPolicy:
      "Structural assertions only; attempts are precomputed successful 5C-1 records so this isolates defence resolution cost.",
  };
}

function createHarness(
  entityCount: number,
): DefencePerformanceHarness & { readonly membersPerUnit: number } {
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
  const attempts: IndividualMeleeAttackAttemptRecord[] = [];
  let nextEntityId = 0;

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const sourceX = pairIndex * 64 + 64;
    const sideMembers: [number[], number[]] = [[], []];
    for (let side = 0; side < 2; side += 1) {
      const unitId = pairIndex * 2 + side + 1;
      const factionId = side + 1;
      const headingX = side === 0 ? 1 : -1;
      const anchorX = sourceX + side * 6;
      for (let memberIndex = 0; memberIndex < membersPerUnit; memberIndex += 1) {
        const entityId = nextEntityId;
        nextEntityId += 1;
        sideMembers[side]!.push(entityId);
        world.positionsX[entityId] = anchorX;
        world.positionsY[entityId] = 56 + memberIndex * 4;
        individuals.push({
          entityId,
          role: "regular",
          slotRow: memberIndex,
          slotCol: 0,
          memberMaxStep: 0,
        });
        profiles.push(combatProfile(entityId, entityId));
      }
      identityUnits.push({ unitId, factionId, memberEntityIds: sideMembers[side]! });
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
    for (let memberIndex = 0; memberIndex < membersPerUnit; memberIndex += 1) {
      attempts.push(attempt(sideMembers[0]![memberIndex]!, sideMembers[1]![memberIndex]!));
      attempts.push(attempt(sideMembers[1]![memberIndex]!, sideMembers[0]![memberIndex]!));
    }
  }

  const identity = createUnitIdentityStore({ entityCount, units: identityUnits });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x5c22,
    units: formationUnits,
    individuals,
  });
  const profileStore = createIndividualCombatProfileStore({
    entityCount,
    profiles,
  });
  const actionStore = createIndividualCombatActionStore(
    identity,
    formation,
    profileStore,
    { entityCount },
  );

  return {
    world,
    identity,
    profiles: profileStore,
    actions: actionStore,
    defence: createIndividualMeleeDefenceStore({ entityCount }),
    attempts,
    membersPerUnit,
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
  variantSeed: number,
): IndividualCombatProfileConfig {
  const variant = variantSeed % 5;
  const weapon: IndividualWeaponCategory =
    variant === 3 ? "unarmed" : variant === 4 ? "ranged" : "oneHanded";
  const shieldCategory: IndividualShieldCategory =
    variant === 1 ? "buckler" : variant === 2 ? "shield" : "none";
  const shieldCarriedState: IndividualShieldCarriedState =
    shieldCategory === "none" ? "none" : "held";
  return {
    entityId,
    primaryWeapon: weapon,
    shieldCategory,
    shieldCarriedState,
    armourCategory: "none",
    hasQualifyingHelmet: false,
    qualifications: {
      hasWeaponMaster: true,
      hasShield: true,
      hasMarksman: true,
      hasThrown: true,
      hasAmbidexterity: false,
      enduranceLevels: 0,
      fortitudeLevels: 0,
      hasDreadnought: false,
    },
    magicalCapabilities: {
      canUseRod: true,
      canUseStaff: true,
      canWearMageArmour: true,
      canDeliverCombatMagic: true,
    },
  };
}

function attempt(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeAttackAttemptRecord {
  return {
    attackerEntityId,
    targetEntityId: defenderEntityId,
    weaponCategory: "oneHanded",
    commitmentDurationTicks: 3,
    recoveryDurationTicks: 3,
    distanceSquaredAtResolution: 36,
    threatDistance: 12,
    preferredMinimumDistance: 4,
    awkwardDistance: false,
    facingX: 1,
    facingY: 0,
    outcome: "attempted",
  };
}

function assertReport(
  report: DefencePerformanceReport,
  entityCount: number,
): void {
  expect(report.entityCount).toBe(entityCount);
  expect(report.attemptsPerTick).toBe(entityCount);
  expect(report.attemptsConsumed).toBe(entityCount * MEASURED_TICKS);
  expect(report.parries).toBeGreaterThan(0);
  expect(report.bucklerBlocks).toBeGreaterThan(0);
  expect(report.shieldBlocks).toBeGreaterThan(0);
  expect(report.landedAttacks).toBeGreaterThan(0);
  expect(report.guardRecoveries).toBeGreaterThan(0);
  expect(report.totalMilliseconds).toBeGreaterThanOrEqual(0);
  expect(report.meanMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.maximumMillisecondsPerTick).toBeGreaterThanOrEqual(0);
  expect(report.p95MillisecondsPerTick).toBeGreaterThanOrEqual(0);
}

function writeReport(report: DefencePerformanceReport): void {
  process.stdout.write(
    `\nIndividual melee defence performance report\n${JSON.stringify(report, null, 2)}\n`,
  );
}
