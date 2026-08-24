import { describe, expect, it } from "vitest";

import { createFormationBehaviourStore } from "../../src/sim/formationBehaviour";

import {
  createIndividualActiveStandingCollisionWorkspace,
  resolveOrdinaryActiveStandingFormationMovementOneTick,
} from "../../src/sim/individualActiveStandingCollision";
import {
  beginIndividualCollisionResolutionTick,
  createIndividualCollisionResolutionStore,
} from "../../src/sim/individualCollisionResolution";
import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualPhysicalOccupancyStore,
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import { createIndividualOrdinaryParticipationSnapshot } from "../../src/sim/individualOrdinaryParticipation";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

const MEASURED_TICKS = 40;

describe("Milestone 8C active-standing collision performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "retains bounded local hostile-front work for %i entities",
    (entityCount) => {
      const fixture = createFrontFixture(entityCount);
      const samples = new Float64Array(MEASURED_TICKS);
      let maximumLocalCandidateCount = 0;
      let maximumPassCount = 0;

      for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
        projectIndividualPhysicalOccupancyOneTick(
          fixture.occupancy,
          fixture.lifecycle,
          fixture.presence,
          [],
          tick,
        );
        beginIndividualCollisionResolutionTick(
          fixture.collision,
          fixture.occupancy,
          fixture.world,
          tick,
        );
        for (let entityId = 0; entityId < entityCount / 2; entityId += 1) {
          fixture.world.positionsX[entityId] =
            fixture.world.positionsX[entityId]! + 2;
        }
        for (let entityId = entityCount / 2;
          entityId < entityCount;
          entityId += 1) {
          fixture.world.positionsX[entityId] =
            fixture.world.positionsX[entityId]! - 2;
        }
        const started = performance.now();
        const result = resolveOrdinaryActiveStandingFormationMovementOneTick(
          fixture.workspace,
          fixture.collision,
          fixture.occupancy,
          fixture.world,
          fixture.identity,
          fixture.ordinary,
          fixture.morale,
          fixture.formation,
        );
        samples[tick] = performance.now() - started;
        maximumLocalCandidateCount = Math.max(
          maximumLocalCandidateCount,
          result.localCandidateCount,
        );
        maximumPassCount = Math.max(maximumPassCount, result.passCount);
        expect(result.unresolvedOverlapCount).toBe(0);
        expect(result.localCandidateCount).toBeLessThan(entityCount * 64);
      }

      const workspaceTypedBytes =
        fixture.workspace.ordinaryMoverFlags.byteLength +
        fixture.workspace.activeStandingFlags.byteLength +
        fixture.workspace.conflictFlags.byteLength +
        fixture.workspace.routingFlags.byteLength +
        fixture.workspace.pushThroughFlags.byteLength +
        fixture.workspace.looseLateralFreedomFlags.byteLength +
        fixture.workspace.courtesyRecipientByEntity.byteLength +
        fixture.workspace.queryPositionsX.byteLength +
        fixture.workspace.queryPositionsY.byteLength +
        fixture.workspace.principalBlockerEntityIds.byteLength +
        fixture.workspace.principalBlockerDistanceSquared.byteLength +
        fixture.workspace.queryWorld.velocitiesX.byteLength +
        fixture.workspace.queryWorld.velocitiesY.byteLength;
      expect(workspaceTypedBytes).toBe(entityCount * 38);
      expect(maximumPassCount).toBeLessThanOrEqual(8);
      writeReport({
        entityCount,
        measuredTicks: MEASURED_TICKS,
        meanMillisecondsPerTick:
          samples.reduce((sum, value) => sum + value, 0) / MEASURED_TICKS,
        maximumMillisecondsPerTick: Math.max(...samples),
        maximumPassCount,
        maximumLocalCandidateCount,
        workspaceTypedBytes,
        timingPolicy:
          "Structural only; opposing legal fronts with reused typed state and local-grid queries.",
      });
    },
  );

  it.each([100, 500, 1_000, 2_000])(
    "retains bounded production allied-flow work for %i entities",
    (entityCount) => {
      const fixture = createAlliedFlowFixture(entityCount);
      const samples = new Float64Array(MEASURED_TICKS);
      let maximumCandidates = 0;
      let maximumPasses = 0;
      for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
        projectIndividualPhysicalOccupancyOneTick(
          fixture.occupancy, fixture.lifecycle, fixture.presence, [], tick,
        );
        beginIndividualCollisionResolutionTick(
          fixture.collision, fixture.occupancy, fixture.world, tick,
        );
        const half = entityCount / 2;
        for (let entityId = 0; entityId < half; entityId += 1) {
          fixture.world.positionsX[entityId] =
            fixture.world.positionsX[entityId]! + 3;
        }
        for (let entityId = half; entityId < entityCount; entityId += 1) {
          fixture.world.positionsX[entityId] =
            fixture.world.positionsX[entityId]! + 1;
        }
        const started = performance.now();
        const result = resolveOrdinaryActiveStandingFormationMovementOneTick(
          fixture.workspace,
          fixture.collision,
          fixture.occupancy,
          fixture.world,
          fixture.identity,
          fixture.ordinary,
          fixture.morale,
          fixture.formation,
        );
        samples[tick] = performance.now() - started;
        maximumCandidates = Math.max(maximumCandidates, result.localCandidateCount);
        maximumPasses = Math.max(maximumPasses, result.passCount);
        expect(result.localCandidateCount).toBeLessThan(entityCount * 128);
        expect(result.unresolvedOverlapCount).toBe(0);
      }
      expect(maximumPasses).toBeLessThanOrEqual(8);
      writeReport({
        slice: "8D-allied-overtaking-flow",
        entityCount,
        measuredTicks: MEASURED_TICKS,
        meanMillisecondsPerTick:
          samples.reduce((sum, value) => sum + value, 0) / MEASURED_TICKS,
        maximumMillisecondsPerTick: Math.max(...samples),
        maximumPasses,
        maximumCandidates,
        timingPolicy: "Structural only; paired open-space allied overtaking with reused state.",
      });
    },
  );
});

function createFrontFixture(entityCount: number) {
  const half = entityCount / 2;
  const bounds = { width: 160, height: half * 10 + 32 };
  const world = createWorld(entityCount, bounds.width, bounds.height);
  for (let lane = 0; lane < half; lane += 1) {
    world.positionsX[lane] = 60;
    world.positionsY[lane] = 16 + lane * 10;
    world.positionsX[lane + half] = 70;
    world.positionsY[lane + half] = 16 + lane * 10;
  }
  const identity = createUnitIdentityStore({
    entityCount,
    units: [
      {
        unitId: 10,
        factionId: 1,
        memberEntityIds: Array.from({ length: half }, (_, index) => index),
      },
      {
        unitId: 20,
        factionId: 2,
        memberEntityIds: Array.from(
          { length: half },
          (_, index) => half + index,
        ),
      },
    ],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x8c_0f00,
    units: [
      { unitId: 10, anchorX: 60, anchorY: 16, headingX: 1, headingY: 0,
        spacing: 10, rows: half, cols: 1, unitSpeed: 2, order: "advance" },
      { unitId: 20, anchorX: 70, anchorY: 16, headingX: -1, headingY: 0,
        spacing: 10, rows: half, cols: 1, unitSpeed: 2, order: "advance" },
    ],
    individuals: Array.from({ length: entityCount }, (_, entityId) => ({
      entityId,
      role: "regular" as const,
      slotRow: entityId < half ? entityId : entityId - half,
      slotCol: 0,
      memberMaxStep: 2,
    })),
  });
  return {
    world,
    identity,
    formation,
    lifecycle: createIndividualCasualtyLifecycleStore(entityCount),
    presence: createIndividualPlayerPresenceStore(entityCount),
    occupancy: createIndividualPhysicalOccupancyStore(entityCount),
    collision: createIndividualCollisionResolutionStore(entityCount),
    workspace: createIndividualActiveStandingCollisionWorkspace(
      entityCount,
      bounds,
      world.ids,
    ),
    ordinary: createIndividualOrdinaryParticipationSnapshot(entityCount),
    morale: new Map<number, "steady">([[10, "steady"], [20, "steady"]]),
  };
}

function createAlliedFlowFixture(entityCount: number) {
  const half = entityCount / 2;
  const bounds = { width: 512, height: half * 10 + 32 };
  const world = createWorld(entityCount, bounds.width, bounds.height);
  for (let lane = 0; lane < half; lane += 1) {
    world.positionsX[lane] = 40;
    world.positionsY[lane] = 16 + lane * 10;
    world.positionsX[lane + half] = 49;
    world.positionsY[lane + half] = 16 + lane * 10;
  }
  const identity = createUnitIdentityStore({
    entityCount,
    units: [
      { unitId: 10, factionId: 1,
        memberEntityIds: Array.from({ length: half }, (_, index) => index) },
      { unitId: 20, factionId: 1,
        memberEntityIds: Array.from({ length: half }, (_, index) => half + index) },
    ],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x8d_0f00,
    units: [
      { unitId: 10, anchorX: 40, anchorY: 16, headingX: 1, headingY: 0,
        spacing: 10, rows: half, cols: 1, unitSpeed: 3, order: "advance",
        cohesion: 200 },
      { unitId: 20, anchorX: 49, anchorY: 16, headingX: 1, headingY: 0,
        spacing: 10, rows: half, cols: 1, unitSpeed: 1, order: "advance",
        cohesion: 900 },
    ],
    individuals: Array.from({ length: entityCount }, (_, entityId) => ({
      entityId,
      role: "regular" as const,
      slotRow: entityId < half ? entityId : entityId - half,
      slotCol: 0,
      memberMaxStep: entityId < half ? 3 : 1,
    })),
  });
  return {
    world,
    identity,
    formation,
    lifecycle: createIndividualCasualtyLifecycleStore(entityCount),
    presence: createIndividualPlayerPresenceStore(entityCount),
    occupancy: createIndividualPhysicalOccupancyStore(entityCount),
    collision: createIndividualCollisionResolutionStore(entityCount),
    workspace: createIndividualActiveStandingCollisionWorkspace(
      entityCount, bounds, world.ids,
    ),
    ordinary: createIndividualOrdinaryParticipationSnapshot(entityCount),
    morale: new Map<number, "steady">([[10, "steady"], [20, "steady"]]),
  };
}

function createWorld(
  entityCount: number,
  width: number,
  height: number,
): WorldState {
  return {
    entityCount,
    bounds: { width, height },
    ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}

function writeReport(report: object): void {
  process.stdout.write(
    `\nMilestone 8C active-standing collision performance report\n${
      JSON.stringify(report, null, 2)
    }\n`,
  );
}
