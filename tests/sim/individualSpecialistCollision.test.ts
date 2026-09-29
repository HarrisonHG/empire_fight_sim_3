import { describe, expect, it } from "vitest";

import {
  beginIndividualCollisionResolutionTick,
  createIndividualCollisionResolutionStore,
  getIndividualCollisionResolutionInspection,
} from "../../src/sim/individualCollisionResolution";
import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualMovementRightOfWayStore,
} from "../../src/sim/individualMovementRightOfWay";
import {
  createIndividualPhysicalOccupancyStore,
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import { createIndividualSpecialistCollisionResolver } from "../../src/sim/individualSpecialistCollision";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

describe("Milestone 8G specialist collision contract", () => {
  it("keeps resolved movement within the permitted budget", () => {
    const fixture = createFixture(1);

    fixture.resolver.resolveStep(0, 2, 0);

    const inspection = getIndividualCollisionResolutionInspection(
      fixture.collision, 0,
    );
    expect(inspection.resolvedDeltaX ** 2 + inspection.resolvedDeltaY ** 2)
      .toBeLessThanOrEqual(4);
    expect([inspection.resolvedDeltaX, inspection.resolvedDeltaY])
      .not.toEqual([2, 0]);
    expect(fixture.resolver.resolvedDeltaX).toBe(inspection.resolvedDeltaX);
    expect(fixture.resolver.resolvedDeltaY).toBe(inspection.resolvedDeltaY);
  });

  it("keeps hostile standing bodies hard despite social right-of-way", () => {
    const fixture = createFixture(2);
    fixture.rightOfWay.classCodes[0] = 7;
    fixture.rightOfWay.classCodes[1] = 0;

    fixture.resolver.resolveStep(0, 2, 0);

    expect([fixture.resolver.resolvedDeltaX, fixture.resolver.resolvedDeltaY])
      .not.toEqual([2, 0]);
    const finalX = 30 + fixture.resolver.resolvedDeltaX;
    const finalY = 50 + fixture.resolver.resolvedDeltaY;
    expect((39 - finalX) ** 2 + (50 - finalY) ** 2)
      .toBeGreaterThanOrEqual(64);
  });
});

function createFixture(blockerFactionId: number) {
  const world: WorldState = {
    entityCount: 2,
    bounds: { width: 100, height: 100 },
    ids: Uint32Array.from([0, 1]),
    positionsX: Int32Array.from([30, 39]),
    positionsY: Int32Array.from([50, 50]),
    velocitiesX: new Int32Array(2),
    velocitiesY: new Int32Array(2),
  };
  const identity = createUnitIdentityStore({
    entityCount: 2,
    units: [
      { unitId: 10, factionId: 1, memberEntityIds: [0] },
      { unitId: 20, factionId: blockerFactionId, memberEntityIds: [1] },
    ],
  });
  const lifecycle = createIndividualCasualtyLifecycleStore(2);
  const presence = createIndividualPlayerPresenceStore(2);
  const occupancy = createIndividualPhysicalOccupancyStore(2);
  projectIndividualPhysicalOccupancyOneTick(
    occupancy, lifecycle, presence, [], 0,
  );
  const collision = createIndividualCollisionResolutionStore(2);
  beginIndividualCollisionResolutionTick(collision, occupancy, world, 0);
  const rightOfWay = createIndividualMovementRightOfWayStore(2);
  (rightOfWay as unknown as { projectionTick: number }).projectionTick = 0;
  const resolver = createIndividualSpecialistCollisionResolver(
    world, identity, occupancy, rightOfWay, collision,
  );
  // Specialist authorities apply their permitted intent before resolution;
  // the resolver reconstructs tick start from this current position.
  world.positionsX[0] = 32;
  resolver.prepareForMovement(0);
  return { collision, resolver, rightOfWay };
}
