import { describe, expect, it } from "vitest";

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
  INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS,
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import {
  createIndividualRespawnEgressCollisionStore,
} from "../../src/sim/individualRespawnEgressCollision";
import type { WorldState } from "../../src/sim/types";

const MEASURED_TICKS = 40;

describe("Milestone 8F yielding-egress collision performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "retains bounded local yielding work for %i presences",
    (entityCount) => {
      const fixture = createFixture(entityCount);
      const samples = new Float64Array(MEASURED_TICKS);
      let maximumCandidates = 0;
      let maximumQueries = 0;
      let totalYields = 0;
      for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
        resetLanePositions(fixture.world);
        projectIndividualPhysicalOccupancyOneTick(
          fixture.occupancy,
          fixture.lifecycle,
          fixture.presence,
          [],
          tick,
        );
        applyFixtureOccupancy(fixture.occupancy, entityCount);
        beginIndividualCollisionResolutionTick(
          fixture.collision,
          fixture.occupancy,
          fixture.world,
          tick,
        );
        const started = performance.now();
        fixture.egress.prepareForMovement(tick, fixture.activeEgressEntityIds);
        const half = entityCount / 2;
        for (let entityId = 0; entityId < half; entityId += 1) {
          fixture.egress.resolveEgressStep(entityId, 120, 16 + entityId * 12, 1, 0);
        }
        samples[tick] = performance.now() - started;
        maximumCandidates = Math.max(
          maximumCandidates,
          fixture.egress.result.localCandidateCount,
        );
        maximumQueries = Math.max(
          maximumQueries,
          fixture.egress.result.localQueryCount,
        );
        totalYields += fixture.egress.result.yieldedCount;
        expect(fixture.egress.result.localQueryCount).toBe(half);
        expect(fixture.egress.result.localCandidateCount)
          .toBeLessThan(entityCount * 32);
      }

      const workspaceTypedBytes =
        fixture.egress.includedOccupancyFlags.byteLength +
        fixture.egress.detourPhaseByEntity.byteLength +
        fixture.egress.detourSideByEntity.byteLength +
        fixture.egress.detourTicksRemainingByEntity.byteLength +
        fixture.egress.detourBlockerByEntity.byteLength +
        fixture.egress.destinationXByEntity.byteLength +
        fixture.egress.destinationYByEntity.byteLength +
        fixture.egress.attemptStartDistanceByEntity.byteLength +
        fixture.egress.normalProgressStreakByEntity.byteLength +
        fixture.egress.principalBlockerByEntity.byteLength;
      expect(workspaceTypedBytes).toBe(entityCount * 26);
      expect(totalYields).toBeGreaterThan(0);
      console.info(JSON.stringify({
        slice: "8F-yielding-egress",
        entityCount,
        measuredTicks: MEASURED_TICKS,
        meanMillisecondsPerTick:
          samples.reduce((sum, value) => sum + value, 0) / MEASURED_TICKS,
        maximumMillisecondsPerTick: Math.max(...samples),
        maximumQueries,
        maximumCandidates,
        workspaceTypedBytes,
        timingPolicy:
          "Structural only; one yielding egress presence per legal independent living-traffic lane.",
      }, null, 2));
    },
  );
});

function createFixture(entityCount: number) {
  const world = createWorld(entityCount);
  const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
  const presence = createIndividualPlayerPresenceStore(entityCount);
  const occupancy = createIndividualPhysicalOccupancyStore(entityCount);
  const collision = createIndividualCollisionResolutionStore(entityCount);
  projectIndividualPhysicalOccupancyOneTick(
    occupancy,
    lifecycle,
    presence,
    [],
    0,
  );
  applyFixtureOccupancy(occupancy, entityCount);
  beginIndividualCollisionResolutionTick(collision, occupancy, world, 0);
  const egress = createIndividualRespawnEgressCollisionStore(
    world,
    occupancy,
    collision,
    lifecycle,
    presence,
  );
  const activeEgressEntityIds = Array.from(
    { length: entityCount / 2 },
    (_, entityId) => entityId,
  );
  return {
    world,
    lifecycle,
    presence,
    occupancy,
    collision,
    egress,
    activeEgressEntityIds,
  };
}

function createWorld(entityCount: number): WorldState {
  const world: WorldState = {
    entityCount,
    bounds: { width: 160, height: entityCount / 2 * 12 + 32 },
    ids: new Uint32Array(entityCount),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  for (let entityId = 0; entityId < entityCount; entityId += 1) {
    world.ids[entityId] = entityId;
  }
  resetLanePositions(world);
  return world;
}

function resetLanePositions(world: WorldState): void {
  const half = world.entityCount / 2;
  for (let lane = 0; lane < half; lane += 1) {
    world.positionsX[lane] = 40;
    world.positionsY[lane] = 16 + lane * 12;
    world.positionsX[half + lane] = 48;
    world.positionsY[half + lane] = 16 + lane * 12;
  }
}

function applyFixtureOccupancy(
  occupancy: ReturnType<typeof createIndividualPhysicalOccupancyStore>,
  entityCount: number,
): void {
  const half = entityCount / 2;
  for (let entityId = 0; entityId < entityCount; entityId += 1) {
    occupancy.occupancyClassCodes[entityId] = entityId < half
      ? INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.yieldingEgress
      : INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS.activeStanding;
    occupancy.effectiveRadii[entityId] =
      occupancy.geometry.activeStandingRadius;
  }
}
