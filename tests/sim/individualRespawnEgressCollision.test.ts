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
  createIndividualPhysicalOccupancyStore,
  INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS,
  INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG,
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import {
  createIndividualRespawnEgressCollisionStore,
  INDIVIDUAL_EGRESS_DETOUR_PHASE,
  INDIVIDUAL_EGRESS_INITIAL_DETOUR_TICKS,
  INDIVIDUAL_EGRESS_OPPOSITE_DETOUR_TICKS,
} from "../../src/sim/individualRespawnEgressCollision";
import type { WorldState } from "../../src/sim/types";

describe("Milestone 8F yielding respawn-egress collision", () => {
  it("yields to living traffic without changing the living mover", () => {
    const fixture = createFixture([
      { x: 40, y: 40, occupancyClass: "yieldingEgress" },
      { x: 47, y: 43, occupancyClass: "activeStanding" },
    ]);
    const livingPosition = [fixture.world.positionsX[1], fixture.world.positionsY[1]];

    resolve(fixture, 0, 80, 40, 1, 0, 0);

    expect([fixture.store.resolvedDeltaX, fixture.store.resolvedDeltaY])
      .not.toEqual([1, 0]);
    expect([fixture.world.positionsX[1], fixture.world.positionsY[1]])
      .toEqual(livingPosition);
    applyResolved(fixture, 0);
    expect(separationSquared(fixture.world, 0, 1)).toBeGreaterThanOrEqual(64);
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0))
      .toMatchObject({
        yieldingEgressYield: true,
        localDecisionPhase: INDIVIDUAL_EGRESS_DETOUR_PHASE.initialSide,
      });
  });

  it("gives an assisted rescue presence the same living priority", () => {
    const fixture = createFixture([
      { x: 40, y: 40, occupancyClass: "yieldingEgress" },
      { x: 47, y: 43, occupancyClass: "assistedMoving" },
    ]);

    resolve(fixture, 0, 80, 40, 1, 0, 0);

    expect(fixture.store.result.yieldedCount).toBe(1);
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0))
      .toMatchObject({
        yieldingEgressYield: true,
        principalOccupancyRelationshipCode: 3,
      });
    expect([fixture.world.positionsX[1], fixture.world.positionsY[1]])
      .toEqual([47, 43]);
  });

  it("avoids a downed body without mutating it", () => {
    const fixture = createFixture([
      { x: 40, y: 40, occupancyClass: "yieldingEgress" },
      { x: 48, y: 40, occupancyClass: "downedSoft" },
    ]);
    const casualty = [fixture.world.positionsX[1], fixture.world.positionsY[1]];

    resolve(fixture, 0, 80, 40, 1, 0, 0);

    expect(fixture.store.result.downedSoftAvoidanceCount).toBe(1);
    expect(fixture.store.result.downedSoftCrossingCount).toBe(0);
    expect([fixture.world.positionsX[1], fixture.world.positionsY[1]])
      .toEqual(casualty);
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0))
      .toMatchObject({
        downedSoftAvoidance: true,
        downedSoftCrossing: false,
      });
  });

  it("uses careful soft crossing only when bounded avoidance is unavailable", () => {
    const fixture = createFixture([
      { x: 40, y: 40, occupancyClass: "yieldingEgress" },
      { x: 48, y: 40, occupancyClass: "downedSoft" },
      { x: 40, y: 48, occupancyClass: "activeStanding" },
      { x: 40, y: 32, occupancyClass: "activeStanding" },
    ]);

    resolve(fixture, 0, 80, 40, 1, 0, 0);

    expect([fixture.store.resolvedDeltaX, fixture.store.resolvedDeltaY])
      .toEqual([1, 0]);
    expect(fixture.store.result.downedSoftCrossingCount).toBe(1);
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0))
      .toMatchObject({ downedSoftCrossing: true });
  });

  it("lets two equal-priority egressers choose complementary physical sides", () => {
    const fixture = createFixture([
      { x: 40, y: 40, occupancyClass: "yieldingEgress" },
      { x: 48, y: 40, occupancyClass: "yieldingEgress" },
    ]);

    resolve(fixture, 0, 80, 40, 1, 0, 0);
    applyResolved(fixture, 0);
    resolve(fixture, 1, 0, 40, -1, 0, 1);
    applyResolved(fixture, 1);

    expect(fixture.store.result.egressPairNegotiationCount).toBeGreaterThan(0);
    expect(fixture.world.positionsY[0]).not.toBe(fixture.world.positionsY[1]);
    expect(separationSquared(fixture.world, 0, 1)).toBeGreaterThanOrEqual(64);
  });

  it("escalates a no-progress same-speed obstruction without per-tick side chatter", () => {
    const fixture = createFixture([
      { x: 40, y: 40, occupancyClass: "yieldingEgress" },
      { x: 48, y: 40, occupancyClass: "activeStanding" },
      { x: 40, y: 48, occupancyClass: "activeStanding" },
    ]);
    const observedSides = new Set<number>();
    let sawWaitOrBacktrack = false;
    const totalTicks = INDIVIDUAL_EGRESS_INITIAL_DETOUR_TICKS +
      INDIVIDUAL_EGRESS_OPPOSITE_DETOUR_TICKS + 30;
    for (let tick = 0; tick < totalTicks; tick += 1) {
      beginTick(fixture, tick);
      fixture.store.resolveEgressStep(0, 120, 40, 1, 0);
      observedSides.add(fixture.store.detourSideByEntity[0]!);
      sawWaitOrBacktrack ||= fixture.store.resolvedDeltaX <= 0;
      applyResolved(fixture, 0);
      // The same-speed stream remains immediately ahead and drifts with the
      // first chosen side, reproducing the accepted 8A trap shape.
      fixture.world.positionsX[1] = fixture.world.positionsX[0]! + 8;
      fixture.world.positionsY[1] = fixture.world.positionsY[0]!;
      fixture.world.positionsX[2] = fixture.world.positionsX[0]!;
      fixture.world.positionsY[2] = fixture.world.positionsY[0]! + 8;
    }

    expect(fixture.store.detourPhaseByEntity[0]).toBe(
      INDIVIDUAL_EGRESS_DETOUR_PHASE.widerAlternative,
    );
    expect(observedSides.size).toBeLessThanOrEqual(2);
    expect(sawWaitOrBacktrack).toBe(true);
    expect(fixture.store.result.strategyChangeCount).toBeLessThanOrEqual(1);

    // Clearing the stream lets the egress presence immediately reacquire its
    // unchanged eastbound respawn desire.
    fixture.world.positionsX[1] = 200;
    fixture.world.positionsY[1] = 100;
    fixture.world.positionsX[2] = 200;
    fixture.world.positionsY[2] = 110;
    beginTick(fixture, totalTicks);
    fixture.store.resolveEgressStep(0, 120, 40, 1, 0);
    expect([fixture.store.resolvedDeltaX, fixture.store.resolvedDeltaY])
      .toEqual([1, 0]);
  });

  it("replays the same bounded decisions exactly", () => {
    const run = () => {
      const fixture = createFixture([
        { x: 40, y: 40, occupancyClass: "yieldingEgress" },
        { x: 48, y: 40, occupancyClass: "activeStanding" },
      ]);
      const trace: number[][] = [];
      for (let tick = 0; tick < 80; tick += 1) {
        beginTick(fixture, tick);
        fixture.store.resolveEgressStep(0, 120, 40, 1, 0);
        trace.push([
          fixture.store.resolvedDeltaX,
          fixture.store.resolvedDeltaY,
          fixture.store.detourPhaseByEntity[0]!,
          fixture.store.detourSideByEntity[0]!,
          fixture.store.detourTicksRemainingByEntity[0]!,
        ]);
        applyResolved(fixture, 0);
        fixture.world.positionsX[1] = fixture.world.positionsX[0]! + 8;
        fixture.world.positionsY[1] = fixture.world.positionsY[0]!;
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });
});

type FixtureOccupancyClass =
  | "activeStanding"
  | "downedSoft"
  | "assistedMoving"
  | "yieldingEgress";

interface FixtureEntity {
  readonly x: number;
  readonly y: number;
  readonly occupancyClass: FixtureOccupancyClass;
}

function createFixture(entities: readonly FixtureEntity[]) {
  const world = createWorld(entities);
  const lifecycle = createIndividualCasualtyLifecycleStore(entities.length);
  const presence = createIndividualPlayerPresenceStore(entities.length);
  const occupancy = createIndividualPhysicalOccupancyStore(entities.length);
  const collision = createIndividualCollisionResolutionStore(entities.length);
  projectIndividualPhysicalOccupancyOneTick(
    occupancy,
    lifecycle,
    presence,
    [],
    0,
  );
  applyFixtureOccupancy(occupancy, entities);
  beginIndividualCollisionResolutionTick(collision, occupancy, world, 0);
  const store = createIndividualRespawnEgressCollisionStore(
    world,
    occupancy,
    collision,
    lifecycle,
    presence,
  );
  const egressEntityIds = entities.flatMap((entity, entityId) =>
    entity.occupancyClass === "yieldingEgress" ? [entityId] : []);
  store.prepareForMovement(0, egressEntityIds);
  return {
    world,
    lifecycle,
    presence,
    occupancy,
    collision,
    store,
    entities,
    egressEntityIds,
  };
}

function beginTick(
  fixture: ReturnType<typeof createFixture>,
  tick: number,
): void {
  projectIndividualPhysicalOccupancyOneTick(
    fixture.occupancy,
    fixture.lifecycle,
    fixture.presence,
    [],
    tick,
  );
  applyFixtureOccupancy(fixture.occupancy, fixture.entities);
  beginIndividualCollisionResolutionTick(
    fixture.collision,
    fixture.occupancy,
    fixture.world,
    tick,
  );
  fixture.store.prepareForMovement(tick, fixture.egressEntityIds);
}

function resolve(
  fixture: ReturnType<typeof createFixture>,
  entityId: number,
  destinationX: number,
  destinationY: number,
  permittedDeltaX: number,
  permittedDeltaY: number,
  tick: number,
): void {
  if (tick !== 0) beginTick(fixture, tick);
  fixture.store.resolveEgressStep(
    entityId,
    destinationX,
    destinationY,
    permittedDeltaX,
    permittedDeltaY,
  );
}

function applyResolved(
  fixture: ReturnType<typeof createFixture>,
  entityId: number,
): void {
  fixture.world.positionsX[entityId] = fixture.world.positionsX[entityId]! +
    fixture.store.resolvedDeltaX;
  fixture.world.positionsY[entityId] = fixture.world.positionsY[entityId]! +
    fixture.store.resolvedDeltaY;
}

function applyFixtureOccupancy(
  occupancy: ReturnType<typeof createIndividualPhysicalOccupancyStore>,
  entities: readonly FixtureEntity[],
): void {
  for (let entityId = 0; entityId < entities.length; entityId += 1) {
    const occupancyClass = entities[entityId]!.occupancyClass;
    occupancy.occupancyClassCodes[entityId] =
      INDIVIDUAL_PHYSICAL_OCCUPANCY_CLASS[occupancyClass];
    occupancy.effectiveRadii[entityId] = occupancyClass === "downedSoft"
      ? occupancy.geometry.downedSoftRadius
      : occupancy.geometry.activeStandingRadius;
    occupancy.occupancyFlags[entityId] =
      INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.participatesInCollision |
      (occupancyClass === "downedSoft"
        ? INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.softDowned
        : INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.hardStanding) |
      (occupancyClass === "assistedMoving"
        ? INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.assistedGroup
        : 0) |
      (occupancyClass === "yieldingEgress"
        ? INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.stronglyYielding
        : 0);
  }
}

function createWorld(entities: readonly FixtureEntity[]): WorldState {
  const entityCount = entities.length;
  const world: WorldState = {
    entityCount,
    bounds: { width: 240, height: 160 },
    ids: new Uint32Array(entityCount),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  for (let entityId = 0; entityId < entityCount; entityId += 1) {
    world.ids[entityId] = entityId;
    world.positionsX[entityId] = entities[entityId]!.x;
    world.positionsY[entityId] = entities[entityId]!.y;
  }
  return world;
}

function separationSquared(
  world: WorldState,
  leftId: number,
  rightId: number,
): number {
  const deltaX = world.positionsX[leftId]! - world.positionsX[rightId]!;
  const deltaY = world.positionsY[leftId]! - world.positionsY[rightId]!;
  return deltaX * deltaX + deltaY * deltaY;
}
