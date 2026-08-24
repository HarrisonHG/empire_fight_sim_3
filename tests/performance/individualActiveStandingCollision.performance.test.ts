import { describe, expect, it } from "vitest";

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
        fixture.workspace.queryPositionsX.byteLength +
        fixture.workspace.queryPositionsY.byteLength +
        fixture.workspace.principalBlockerEntityIds.byteLength +
        fixture.workspace.principalBlockerDistanceSquared.byteLength +
        fixture.workspace.queryWorld.velocitiesX.byteLength +
        fixture.workspace.queryWorld.velocitiesY.byteLength;
      expect(workspaceTypedBytes).toBe(entityCount * 31);
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
  return {
    world,
    identity,
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
