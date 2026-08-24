import { describe, expect, it } from "vitest";

import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualPhysicalOccupancyStore,
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import {
  beginIndividualCollisionResolutionTick,
  createIndividualCollisionResolutionStore,
  finalizeDisabledIndividualCollisionResolutionTick,
} from "../../src/sim/individualCollisionResolution";
import type { WorldState } from "../../src/sim/types";

const MEASURED_TICKS = 40;

describe("Milestone 8B occupancy and disabled collision-boundary performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "retains linear reusable projection/evidence storage for %i entities",
    (entityCount) => {
      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const occupancy = createIndividualPhysicalOccupancyStore(entityCount);
      const collision = createIndividualCollisionResolutionStore(entityCount);
      const world = createWorld(entityCount);
      const samples = new Float64Array(MEASURED_TICKS);
      const occupancyBytes =
        occupancy.occupancyClassCodes.byteLength +
        occupancy.effectiveRadii.byteLength +
        occupancy.occupancyFlags.byteLength +
        occupancy.assistanceGroupIds.byteLength;
      const collisionBytes =
        collision.tickStartXByEntity.byteLength +
        collision.tickStartYByEntity.byteLength +
        collision.permittedDeltas.byteLength +
        collision.resolvedDeltas.byteLength +
        collision.localNeighbourCounts.byteLength +
        collision.localCandidateCounts.byteLength +
        collision.resolutionFlags.byteLength +
        collision.principalOccupancyRelationshipCodes.byteLength +
        collision.localDecisionCodes.byteLength +
        collision.localDecisionPartnerByEntity.byteLength +
        collision.localDecisionSideByEntity.byteLength +
        collision.localDecisionTicksRemaining.byteLength;

      for (let tick = 0; tick < MEASURED_TICKS; tick += 1) {
        const started = performance.now();
        projectIndividualPhysicalOccupancyOneTick(
          occupancy,
          lifecycle,
          presence,
          [],
          tick,
        );
        beginIndividualCollisionResolutionTick(
          collision,
          occupancy,
          world,
          tick,
        );
        finalizeDisabledIndividualCollisionResolutionTick(
          collision,
          world,
          tick,
        );
        samples[tick] = performance.now() - started;
      }

      expect(occupancyBytes).toBe(entityCount * 7);
      expect(collisionBytes).toBe(entityCount * 38);
      expect(occupancy.occupancyClassCodes).toBeInstanceOf(Uint8Array);
      expect(collision.resolvedDeltas).toBeInstanceOf(Int32Array);
      writeReport({
        entityCount,
        measuredTicks: MEASURED_TICKS,
        occupancyBytes,
        collisionEvidenceAndLocalStateBytes: collisionBytes,
        totalBytes: occupancyBytes + collisionBytes,
        meanMillisecondsPerTick:
          samples.reduce((sum, value) => sum + value, 0) / MEASURED_TICKS,
        maximumMillisecondsPerTick: Math.max(...samples),
        timingPolicy:
          "Structural only; projection plus disabled pass-through evidence, no active collision solver.",
      });
    },
  );
});

function createWorld(entityCount: number): WorldState {
  return {
    entityCount,
    bounds: { width: entityCount + 32, height: 64 },
    ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
    positionsX: Int32Array.from(
      { length: entityCount },
      (_, entityId) => entityId,
    ),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}

function writeReport(report: object): void {
  process.stdout.write(
    `\nMilestone 8B occupancy/boundary performance report\n${
      JSON.stringify(report, null, 2)
    }\n`,
  );
}
