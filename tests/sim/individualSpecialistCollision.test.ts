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
  return { collision, resolver, rightOfWay, world, occupancy };
}


describe("gathering around soft occupancy", () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])("makes bounded contact progress under symmetry %i", (symmetry) => {
    const first = runGatheringApproach(symmetry);
    expect(first.trace.at(-1)![2]).toBeLessThanOrEqual(64);
    expect(first.crossings).toBeGreaterThan(0);
    expect(runGatheringApproach(symmetry)).toEqual(first);
  });

  it.each([false, true])("permits equal-distance avoidance and ends a stationary plateau (hard=%s)", (hard) => {
    const first = runGatheringApproach(0, hard);
    expect(first.trace[0]!.slice(0, 2)).toEqual([547, 349]);
    expect(first.trace[0]![2]).toBe(170);
    expect(first.trace[1]![2]).toBe(170);
    if (hard) {
      expect(first.trace[8]![2]).toBeLessThan(170);
      // Once all non-increasing candidates are obstructed, hold legally.
      expect(new Set(first.trace.slice(10).map(point => point.join(","))).size).toBe(1);
      expect(first.minimumHardClearance).toBeGreaterThanOrEqual(64);
    } else {
      expect(first.trace.at(-1)![2]).toBeLessThanOrEqual(64);
      expect(first.crossings).toBeGreaterThan(0);
    }
    expect(runGatheringApproach(0, hard)).toEqual(first);
  });

  it("bounds even unobstructed equal-distance intents and resets for a moved patient", () => {
    const fixture = createFixture(1);
    fixture.occupancy.occupancyClassCodes[1] = 2;
    for (let tick = 0; tick < 9; tick += 1) {
      const startY = tick % 2 === 0 ? 49 : 51;
      const py = tick % 2 === 0 ? 2 : -2;
      fixture.world.positionsX[0] = 30;
      fixture.world.positionsY[0] = startY + py;
      fixture.resolver.resolveStep(0, 0, py, 1);
      if (tick < 8) {
        expect([fixture.resolver.resolvedDeltaX, fixture.resolver.resolvedDeltaY]).toEqual([0, py]);
      } else {
        expect((9 - fixture.resolver.resolvedDeltaX) ** 2 +
          (50 - startY - fixture.resolver.resolvedDeltaY) ** 2).toBeLessThan(82);
      }
    }
    fixture.world.positionsX[1] = 40;
    fixture.world.positionsY[0] = 51;
    fixture.resolver.resolveStep(0, 0, 2, 1);
    expect(fixture.resolver.resolvedDeltaY).toBe(2);
  });

  it("rejects an away intent while leaving other specialist authorities unchanged", () => {
    const fixture = createFixture(1);
    fixture.occupancy.occupancyClassCodes[1] = 2;
    fixture.world.positionsX[0] = 28;
    fixture.resolver.resolveStep(0, -2, 0, 1);
    expect([fixture.resolver.resolvedDeltaX, fixture.resolver.resolvedDeltaY]).toEqual([0, 0]);
    fixture.resolver.resolveStep(0, -2, 0);
    expect([fixture.resolver.resolvedDeltaX, fixture.resolver.resolvedDeltaY]).toEqual([-2, 0]);
  });

  it("retains useful avoidance before crossing", () => {
    const result = runGatheringApproach(0, false, 344);
    expect(result.trace[0]!.slice(0, 2)).toEqual([547, 346]);
    expect(result.firstAvoidance).toBe(1);
    expect(result.firstCrossing).toBe(0);
  });

  it("keeps the same obstruction hard when standing", () => {
    const result = runGatheringApproach(0, true);
    expect(result.crossings).toBe(0);
    expect(result.minimumHardClearance).toBeGreaterThanOrEqual(64);
    // Hard detours may temporarily move away from the contact goal.
    expect(result.trace[0]![2]).toBeGreaterThanOrEqual(170);
  });
});

function runGatheringApproach(symmetry: number, hard = false, startY = 347) {
  const transform = (x: number, y: number): [number, number] => {
    let dx = x - 560, dy = y - 348;
    if (symmetry >= 4) dx = -dx;
    for (let i = 0; i < symmetry % 4; i += 1) [dx, dy] = [-dy, dx];
    return [560 + dx, 348 + dy];
  };
  const points = [transform(547, startY), transform(556, 348), transform(560, 348)];
  const world: WorldState = {
    entityCount: 3, bounds: { width: 800, height: 800 },
    ids: Uint32Array.from([0, 1, 2]),
    positionsX: Int32Array.from(points.map(p => p[0])),
    positionsY: Int32Array.from(points.map(p => p[1])),
    velocitiesX: new Int32Array(3), velocitiesY: new Int32Array(3),
  };
  const identity = createUnitIdentityStore({ entityCount: 3, units: [
    { unitId: 1, factionId: 1, memberEntityIds: [0, 2] },
    { unitId: 2, factionId: 2, memberEntityIds: [1] },
  ] });
  const lifecycle = createIndividualCasualtyLifecycleStore(3);
  const presence = createIndividualPlayerPresenceStore(3);
  const occupancy = createIndividualPhysicalOccupancyStore(3);
  const collision = createIndividualCollisionResolutionStore(3);
  const rightOfWay = createIndividualMovementRightOfWayStore(3);
  const resolver = createIndividualSpecialistCollisionResolver(world, identity, occupancy, rightOfWay, collision);
  const trace: number[][] = [];
  let crossings = 0, firstAvoidance = 0, firstCrossing = 0;
  let minimumHardClearance = Infinity;
  for (let tick = 0; tick < 24; tick += 1) {
    const sx = world.positionsX[0]!, sy = world.positionsY[0]!;
    const tx = world.positionsX[2]!, ty = world.positionsY[2]!;
    if ((tx - sx) ** 2 + (ty - sy) ** 2 <= 64) break;
    projectIndividualPhysicalOccupancyOneTick(occupancy, lifecycle, presence, [], tick);
    occupancy.occupancyClassCodes[1] = hard ? 1 : 2;
    occupancy.effectiveRadii[1] = hard ? 4 : 5;
    occupancy.occupancyClassCodes[2] = 2;
    occupancy.effectiveRadii[2] = 5;
    (rightOfWay as unknown as { projectionTick: number }).projectionTick = tick;
    beginIndividualCollisionResolutionTick(collision, occupancy, world, tick);
    resolver.prepareForMovement(tick);
    const px = Math.max(-4, Math.min(4, tx - sx));
    const py = Math.max(-4, Math.min(4, ty - sy));
    world.positionsX[0] = sx + px; world.positionsY[0] = sy + py;
    resolver.resolveStep(0, px, py, 2);
    const dx = resolver.resolvedDeltaX, dy = resolver.resolvedDeltaY;
    world.positionsX[0] = sx + dx; world.positionsY[0] = sy + dy;
    const distance = (tx - sx - dx) ** 2 + (ty - sy - dy) ** 2;
    expect(distance).toBeLessThanOrEqual((tx - sx) ** 2 + (ty - sy) ** 2);
    trace.push([world.positionsX[0]!, world.positionsY[0]!, distance]);
    expect(dx ** 2 + dy ** 2).toBeLessThanOrEqual(px ** 2 + py ** 2);
    expect(getIndividualCollisionResolutionInspection(collision, 0)).toMatchObject({
      permittedDeltaX: px, permittedDeltaY: py, resolvedDeltaX: dx, resolvedDeltaY: dy,
    });
    expect(resolver.result.localQueryCount).toBe(1);
    expect(resolver.result.localCandidateCount).toBeLessThanOrEqual(14);
    crossings += resolver.result.downedSoftCrossingCount;
    if (tick === 0) {
      firstAvoidance = resolver.result.downedSoftAvoidanceCount;
      firstCrossing = resolver.result.downedSoftCrossingCount;
    }
    minimumHardClearance = Math.min(minimumHardClearance,
      (world.positionsX[1]! - sx - dx) ** 2 + (world.positionsY[1]! - sy - dy) ** 2);
    expect(Array.from(world.positionsX).slice(1)).toEqual(points.slice(1).map(p => p[0]));
    expect(Array.from(world.positionsY).slice(1)).toEqual(points.slice(1).map(p => p[1]));
  }
  return { trace, crossings, firstAvoidance, firstCrossing, minimumHardClearance };
}
