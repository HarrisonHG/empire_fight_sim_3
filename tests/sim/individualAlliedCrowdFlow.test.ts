import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";

import {
  createFormationBehaviourStore,
  getUnitMovementStyle,
  getIndividualStuckTicks,
  advanceFormationOneTick,
} from "../../src/sim/formationBehaviour";
import {
  createIndividualActiveStandingCollisionWorkspace,
  resolveOrdinaryActiveStandingFormationMovementOneTick,
} from "../../src/sim/individualActiveStandingCollision";
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
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import { createIndividualOrdinaryParticipationSnapshot } from "../../src/sim/individualOrdinaryParticipation";
import { getIndividualEnergyActivityInspection } from "../../src/sim/individualEnergyActivity";
import {
  MILESTONE_8D_PRODUCTION_CROWD_ORDER,
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";
import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
  WorldState,
} from "../../src/sim/types";

interface MoverSpec {
  readonly unitId: number;
  readonly factionId: number;
  readonly x: number;
  readonly y: number;
  readonly headingX: -1 | 0 | 1;
  readonly headingY: -1 | 0 | 1;
  readonly cohesion?: number;
  readonly confidence?: number;
  readonly routing?: boolean;
}

describe("Milestone 8D production allied crowd flow", () => {
  it("uses one non-reciprocal courtesy wait for crossing allies", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 42, y: 50, headingX: 1, headingY: 0 },
      { unitId: 20, factionId: 1, x: 50, y: 42, headingX: 0, headingY: 1 },
    ]);

    const first = runTick(fixture, 0, [[2, 0], [0, 2]]);
    const decisions = [0, 1].map((entityId) =>
      getIndividualCollisionResolutionInspection(fixture.collision, entityId));
    const yielders = decisions.filter((value) => value.localDecisionCode === 2);

    expect(first.courtesyYieldCount).toBe(1);
    expect(yielders).toHaveLength(1);
    expect(yielders[0]).toMatchObject({ resolvedDeltaX: 0, resolvedDeltaY: 0 });
    expect(decisions.filter((value) => value.localDecisionCode === 2))
      .toHaveLength(1);
    expectNoOverlap(fixture.world);

    runTick(fixture, 1, [[2, 0], [0, 2]]);
    const second = [0, 1].map((entityId) =>
      getIndividualCollisionResolutionInspection(fixture.collision, entityId));
    expect(second.filter((value) => value.localDecisionCode === 2))
      .toHaveLength(1);
    expectNoOverlap(fixture.world);
  });

  it("lets a faster rear ally commit to an open-space overtake without moving the leader", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 60, headingX: 1, headingY: 0,
        cohesion: 200 },
      { unitId: 20, factionId: 1, x: 39, y: 60, headingX: 1, headingY: 0 },
    ]);
    let leaderExpectedX = 39;
    let sawCommittedSide = 0;
    let followerPassed = false;

    for (let tick = 0; tick < 40; tick += 1) {
      const followerY = fixture.world.positionsY[0]!;
      const followerDeltaY = followerY === 60 ? 0 : followerY > 60 ? -1 : 1;
      runTick(fixture, tick, [[3, followerDeltaY], [1, 0]]);
      leaderExpectedX += 1;
      expect(fixture.world.positionsX[1]).toBe(leaderExpectedX);
      const inspection = getIndividualCollisionResolutionInspection(
        fixture.collision, 0,
      );
      if (inspection.localDecisionCode === 3) {
        if (sawCommittedSide === 0) sawCommittedSide = inspection.localDecisionSide;
        expect(inspection.localDecisionSide).toBe(sawCommittedSide);
      }
      if (fixture.world.positionsX[0]! > fixture.world.positionsX[1]! + 8) {
        followerPassed = true;
      }
      expectNoOverlap(fixture.world);
    }

    expect(sawCommittedSide).not.toBe(0);
    expect(followerPassed).toBe(true);
    expect(Math.abs(fixture.world.positionsY[0]! - 60)).toBeLessThan(9);
  });

  it("allows a loose mover to spill laterally while the formed ally preserves forward shape", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        cohesion: 200 },
      { unitId: 20, factionId: 1, x: 41, y: 50, headingX: -1, headingY: 0,
        cohesion: 900 },
    ]);

    const result = runTick(fixture, 0, [[2, 0], [-2, 0]]);
    const loose = getIndividualCollisionResolutionInspection(fixture.collision, 0);
    const formed = getIndividualCollisionResolutionInspection(fixture.collision, 1);

    expect(result.detourCount).toBe(1);
    expect(loose.redirected).toBe(true);
    expect(loose.resolvedDeltaY).not.toBe(0);
    expect(formed.resolvedDeltaY).toBe(0);
    expect(formed.resolvedDeltaX).toBe(-2);
    expectNoOverlap(fixture.world);
  });

  it("turns pushThrough into allied yielding without allowing hostile phasing", () => {
    const allied = createPushThroughFixture(1);
    derivePushThroughStyle(allied);
    setPosition(allied.world, 0, 30, 50);
    setPosition(allied.world, 1, 40, 50);

    const alliedResult = runTick(allied, 1, [[2, 0], [-1, 0]]);
    expect(alliedResult.pushThroughYieldCount).toBe(1);
    expect(getIndividualCollisionResolutionInspection(allied.collision, 0)
      .resolvedDeltaX).toBe(2);
    expect(getIndividualCollisionResolutionInspection(allied.collision, 1)
      .localDecisionCode).toBe(1);
    expectNoOverlap(allied.world);

    const hostile = createPushThroughFixture(2);
    setPosition(hostile.world, 0, 30, 50);
    setPosition(hostile.world, 1, 40, 50);
    const hostileResult = runTick(hostile, 1, [[2, 0], [-1, 0]]);
    expect(hostileResult.pushThroughYieldCount).toBe(0);
    expect(getIndividualCollisionResolutionInspection(hostile.collision, 0)
      .resolvedDeltaX).toBeLessThan(2);
    expectNoOverlap(hostile.world);
    expect(hostile.world.positionsX[0]).toBeLessThan(
      hostile.world.positionsX[1]!,
    );
  });

  it("gives routers pair-local priority over allies but not hostile bodies", () => {
    const allied = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        routing: true },
      { unitId: 20, factionId: 1, x: 40, y: 50, headingX: -1, headingY: 0 },
    ]);
    const alliedResult = runTick(allied, 0, [[2, 0], [-1, 0]]);
    expect(alliedResult.routerPriorityCount).toBe(1);
    expect(getIndividualCollisionResolutionInspection(allied.collision, 0)
      .resolvedDeltaX).toBe(2);
    expect(getIndividualCollisionResolutionInspection(allied.collision, 1)
      .localDecisionCode).toBe(1);
    expectNoOverlap(allied.world);

    const hostile = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        routing: true },
      { unitId: 20, factionId: 2, x: 40, y: 50, headingX: -1, headingY: 0 },
    ]);
    const hostileResult = runTick(hostile, 0, [[2, 0], [-1, 0]]);
    expect(hostileResult.routerPriorityCount).toBe(0);
    expect(getIndividualCollisionResolutionInspection(hostile.collision, 0)
      .resolvedDeltaX).toBeLessThan(2);
    expectNoOverlap(hostile.world);
    expect(hostile.world.positionsX[0]).toBeLessThan(
      hostile.world.positionsX[1]!,
    );
  });

  it("clears an ordinary courtesy wait immediately when the yielder routes", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 42, y: 50, headingX: 1, headingY: 0 },
      { unitId: 20, factionId: 1, x: 50, y: 42, headingX: 0, headingY: 1 },
    ]);

    runTick(fixture, 0, [[2, 0], [0, 2]]);
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 1)
      .localDecisionCode).toBe(2);

    fixture.morale.set(20, "routing");
    const result = runTick(fixture, 1, [[2, 0], [0, 2]]);
    const router = getIndividualCollisionResolutionInspection(
      fixture.collision, 1,
    );
    const ally = getIndividualCollisionResolutionInspection(
      fixture.collision, 0,
    );

    expect(result.routerPriorityCount).toBe(1);
    expect(router.localDecisionCode).toBe(0);
    expect(router.resolvedDeltaY).toBe(2);
    expect(ally.localDecisionCode).toBe(1);
    expect(ally.localDecisionPartnerEntityId).toBe(1);
    expectNoOverlap(fixture.world);
  });

  it("clears a normal yielding detour when its entity begins routing", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        cohesion: 200 },
      { unitId: 20, factionId: 1, x: 41, y: 50, headingX: -1, headingY: 0,
        cohesion: 900 },
    ]);

    runTick(fixture, 0, [[2, 0], [-2, 0]]);
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0)
      .localDecisionCode).toBe(1);

    setPosition(fixture.world, 0, 30, 50);
    setPosition(fixture.world, 1, 40, 50);
    fixture.morale.set(10, "routing");
    const result = runTick(fixture, 1, [[2, 0], [-2, 0]]);
    const router = getIndividualCollisionResolutionInspection(
      fixture.collision, 0,
    );
    const ally = getIndividualCollisionResolutionInspection(
      fixture.collision, 1,
    );

    expect(result.routerPriorityCount).toBe(1);
    expect(router.localDecisionCode).toBe(0);
    expect(router.resolvedDeltaX).toBe(2);
    expect(ally.localDecisionCode).toBe(1);
    expect(ally.localDecisionPartnerEntityId).toBe(0);
    expectNoOverlap(fixture.world);
  });

  it("clears lower-priority yielding when its entity acquires pushThrough", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        cohesion: 200 },
      { unitId: 20, factionId: 1, x: 41, y: 50, headingX: -1, headingY: 0,
        cohesion: 900 },
    ]);

    runTick(fixture, 0, [[2, 0], [-2, 0]]);
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0)
      .localDecisionCode).toBe(1);

    setPosition(fixture.world, 0, 30, 50);
    setPosition(fixture.world, 1, 40, 50);
    setUnitMovementStyleForTest(fixture, 0, "pushThrough");
    const result = runTick(fixture, 1, [[2, 0], [-2, 0]]);
    const pusher = getIndividualCollisionResolutionInspection(
      fixture.collision, 0,
    );
    const ally = getIndividualCollisionResolutionInspection(
      fixture.collision, 1,
    );

    expect(result.pushThroughYieldCount).toBe(1);
    expect(pusher.localDecisionCode).toBe(0);
    expect(pusher.resolvedDeltaX).toBe(2);
    expect(ally.localDecisionCode).toBe(1);
    expect(ally.localDecisionPartnerEntityId).toBe(0);
    expectNoOverlap(fixture.world);
  });

  it("uses ordinary negotiation for equal routing or pushThrough peers", () => {
    const routing = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        routing: true },
      { unitId: 20, factionId: 1, x: 40, y: 50, headingX: -1, headingY: 0,
        routing: true },
    ]);
    const routingResult = runTick(routing, 0, [[2, 0], [-1, 0]]);
    expect(routingResult.routerPriorityCount).toBe(0);
    expect(routingResult.detourCount).toBe(1);
    expectNoOverlap(routing.world);

    const pushing = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0 },
      { unitId: 20, factionId: 1, x: 40, y: 50, headingX: -1, headingY: 0 },
    ]);
    setUnitMovementStyleForTest(pushing, 0, "pushThrough");
    setUnitMovementStyleForTest(pushing, 1, "pushThrough");
    const pushingResult = runTick(pushing, 0, [[2, 0], [-1, 0]]);
    expect(pushingResult.pushThroughYieldCount).toBe(0);
    expect(pushingResult.detourCount).toBe(1);
    expectNoOverlap(pushing.world);
  });

  it("keeps routing priority above pushThrough", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        routing: true },
      { unitId: 20, factionId: 1, x: 40, y: 50, headingX: -1, headingY: 0 },
    ]);
    setUnitMovementStyleForTest(fixture, 1, "pushThrough");

    const result = runTick(fixture, 0, [[2, 0], [-1, 0]]);
    const router = getIndividualCollisionResolutionInspection(
      fixture.collision, 0,
    );
    const pusher = getIndividualCollisionResolutionInspection(
      fixture.collision, 1,
    );

    expect(result.routerPriorityCount).toBe(1);
    expect(result.pushThroughYieldCount).toBe(0);
    expect(router.resolvedDeltaX).toBe(2);
    expect(pusher.localDecisionCode).toBe(1);
    expect(pusher.localDecisionPartnerEntityId).toBe(0);
    expectNoOverlap(fixture.world);
  });

  it("replays crossing flow identically under reversed unit-definition order", () => {
    const run = (reverse: boolean) => {
      const fixture = createFixture([
        { unitId: 10, factionId: 1, x: 42, y: 50, headingX: 1, headingY: 0,
          cohesion: 200 },
        { unitId: 20, factionId: 1, x: 50, y: 42, headingX: 0, headingY: 1,
          cohesion: 200 },
      ], reverse);
      const trace: number[][] = [];
      for (let tick = 0; tick < 80; tick += 1) {
        runTick(fixture, tick, [[2, 0], [0, 2]]);
        trace.push([
          ...fixture.world.positionsX,
          ...fixture.world.positionsY,
          ...fixture.collision.localDecisionCodes,
          ...fixture.collision.localDecisionSideByEntity,
        ]);
      }
      return trace;
    };

    expect(run(false)).toEqual(run(false));
    expect(run(true)).toEqual(run(false));
  });

  it("has no cardinal-axis priority under a 90-degree crossing rotation", () => {
    const original = createFixture([
      { unitId: 10, factionId: 1, x: 42, y: 50, headingX: 1, headingY: 0 },
      { unitId: 20, factionId: 1, x: 50, y: 42, headingX: 0, headingY: 1 },
    ]);
    const rotated = createFixture([
      { unitId: 10, factionId: 1, x: 50, y: 42, headingX: 0, headingY: 1 },
      { unitId: 20, factionId: 1, x: 58, y: 50, headingX: -1, headingY: 0 },
    ]);
    for (let tick = 0; tick < 20; tick += 1) {
      runTick(original, tick, [[2, 0], [0, 2]]);
      runTick(rotated, tick, [[0, 2], [-2, 0]]);
      for (let entityId = 0; entityId < 2; entityId += 1) {
        expect(rotated.world.positionsX[entityId]).toBe(
          100 - original.world.positionsY[entityId]!,
        );
        expect(rotated.world.positionsY[entityId]).toBe(
          original.world.positionsX[entityId],
        );
      }
      expect(Array.from(rotated.collision.localDecisionCodes)).toEqual(
        Array.from(original.collision.localDecisionCodes),
      );
    }
  });

  it("keeps committed local direction changes bounded across 1,000 ticks", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0,
        cohesion: 200 },
      { unitId: 20, factionId: 1, x: 41, y: 50, headingX: -1, headingY: 0,
        cohesion: 900 },
    ]);
    let previousSide = 0;
    let sideChanges = 0;
    for (let tick = 0; tick < 1_000; tick += 1) {
      runTick(fixture, tick, [[2, 0], [-2, 0]]);
      const decision = getIndividualCollisionResolutionInspection(
        fixture.collision, 0,
      );
      if (decision.localDecisionSide !== 0 && previousSide !== 0 &&
          decision.localDecisionSide !== previousSide) sideChanges += 1;
      if (decision.localDecisionSide !== 0) previousSide = decision.localDecisionSide;
      expectNoOverlap(fixture.world);
    }
    expect(sideChanges).toBeLessThanOrEqual(8);
  }, 15_000);

  it("feeds repeated collision-only failure into existing stuck evidence", () => {
    const fixture = createFixture([
      { unitId: 10, factionId: 1, x: 30, y: 50, headingX: 1, headingY: 0 },
      { unitId: 20, factionId: 1, x: 40, y: 50, headingX: -1, headingY: 0 },
    ]);
    let yielder = -1;
    for (let tick = 0; tick < 6; tick += 1) {
      runTick(fixture, tick, [[2, 0], [-2, 0]]);
      if (yielder < 0) {
        yielder = [0, 1].find((entityId) =>
          getIndividualCollisionResolutionInspection(
            fixture.collision, entityId,
          ).localDecisionCode === 1) ?? -1;
      }
    }
    expect(yielder).toBeGreaterThanOrEqual(0);
    expect(getIndividualStuckTicks(fixture.formation, yielder))
      .toBeGreaterThanOrEqual(5);
  });

  it("keeps final production displacement and crowd diagnostics as energy evidence", () => {
    const simulation = createSimulation(createCrossingProductionScenario());
    const startX = simulation.world.positionsX.slice();
    const startY = simulation.world.positionsY.slice();

    advanceSimulationOneTick(simulation);

    const combat = simulation.combatSandbox!;
    for (let entityId = 0; entityId < 2; entityId += 1) {
      const collision = getIndividualCollisionResolutionInspection(
        combat.individualCollisionResolutionStore, entityId,
      );
      const energy = getIndividualEnergyActivityInspection(
        combat.individualEnergyActivityStore, entityId,
      );
      expect(energy.displacementX).toBe(
        simulation.world.positionsX[entityId]! - startX[entityId]!,
      );
      expect(energy.displacementY).toBe(
        simulation.world.positionsY[entityId]! - startY[entityId]!,
      );
      expect(energy.displacementX).toBe(collision.resolvedDeltaX);
      expect(energy.displacementY).toBe(collision.resolvedDeltaY);
    }
    expect(combat.debugSnapshot.activeStandingCollisionCourtesyYieldCount)
      .toBe(combat.individualActiveStandingCollisionResult.courtesyYieldCount);
    expect(combat.debugSnapshot.inspectedIndividuals.every(
      (individual) => individual.collisionLocalDecisionCode !== undefined &&
        individual.collisionLocalDecisionTicksRemaining !== undefined,
    )).toBe(true);
    expect(MILESTONE_8D_PRODUCTION_CROWD_ORDER).toHaveLength(6);
  });
});

function createFixture(specs: readonly MoverSpec[], reverse = false) {
  const entityCount = specs.length;
  const bounds = { width: 2_500, height: 2_500 };
  const world = createWorld(entityCount, bounds.width, bounds.height);
  const units = specs.map((spec, entityId) => ({
    unitId: spec.unitId,
    factionId: spec.factionId,
    memberEntityIds: [entityId],
  }));
  const identity = createUnitIdentityStore({
    entityCount,
    units: reverse ? units.slice().reverse() : units,
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x8d_0001,
    units: specs.map((spec) => ({
      unitId: spec.unitId,
      anchorX: spec.x,
      anchorY: spec.y,
      headingX: spec.headingX,
      headingY: spec.headingY,
      spacing: 10,
      rows: 1,
      cols: 1,
      unitSpeed: 2,
      order: "advance" as const,
      cohesion: spec.cohesion ?? 900,
    })),
    individuals: specs.map((spec, entityId) => ({
      entityId,
      role: "regular" as const,
      slotRow: 0,
      slotCol: 0,
      memberMaxStep: 3,
      confidence: spec.confidence ?? 500,
    })),
  });
  const morale = new Map<number, "steady" | "routing">();
  for (let entityId = 0; entityId < specs.length; entityId += 1) {
    const spec = specs[entityId]!;
    setPosition(world, entityId, spec.x, spec.y);
    morale.set(spec.unitId, spec.routing === true ? "routing" : "steady");
  }
  return {
    world,
    identity,
    formation,
    morale,
    lifecycle: createIndividualCasualtyLifecycleStore(entityCount),
    presence: createIndividualPlayerPresenceStore(entityCount),
    occupancy: createIndividualPhysicalOccupancyStore(entityCount),
    collision: createIndividualCollisionResolutionStore(entityCount),
    workspace: createIndividualActiveStandingCollisionWorkspace(
      entityCount, bounds, world.ids,
    ),
    ordinary: createIndividualOrdinaryParticipationSnapshot(entityCount),
  };
}

function createPushThroughFixture(blockerFaction: number) {
  return createFixture([
    { unitId: 10, factionId: 1, x: 100, y: 100, headingX: 1, headingY: 0,
      cohesion: 600, confidence: 950 },
    { unitId: 20, factionId: blockerFaction, x: 116, y: 100,
      headingX: -1, headingY: 0, cohesion: 700 },
  ]);
}

function derivePushThroughStyle(
  fixture: ReturnType<typeof createPushThroughFixture>,
): void {
  advanceFormationOneTick(
    fixture.world,
    fixture.identity,
    fixture.formation,
    fixture.morale,
  );
  expect(getUnitMovementStyle(fixture.formation, 10)).toBe("pushThrough");
}

function setUnitMovementStyleForTest(
  fixture: ReturnType<typeof createFixture>,
  unitIndex: number,
  style: "pushThrough",
): void {
  const state = fixture.formation as unknown as {
    readonly unitMovementStyle: string[];
  };
  state.unitMovementStyle[unitIndex] = style;
}

function runTick(
  fixture: ReturnType<typeof createFixture>,
  tick: number,
  deltas: readonly (readonly [number, number])[],
) {
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
  for (let entityId = 0; entityId < deltas.length; entityId += 1) {
    fixture.world.positionsX[entityId] =
      fixture.world.positionsX[entityId]! + deltas[entityId]![0];
    fixture.world.positionsY[entityId] =
      fixture.world.positionsY[entityId]! + deltas[entityId]![1];
  }
  return resolveOrdinaryActiveStandingFormationMovementOneTick(
    fixture.workspace,
    fixture.collision,
    fixture.occupancy,
    fixture.world,
    fixture.identity,
    fixture.ordinary,
    fixture.morale,
    fixture.formation,
  );
}

function expectNoOverlap(world: WorldState): void {
  for (let left = 0; left < world.entityCount; left += 1) {
    for (let right = left + 1; right < world.entityCount; right += 1) {
      const x = world.positionsX[right]! - world.positionsX[left]!;
      const y = world.positionsY[right]! - world.positionsY[left]!;
      expect(x * x + y * y).toBeGreaterThanOrEqual(64);
    }
  }
}

function setPosition(
  world: WorldState,
  entityId: number,
  x: number,
  y: number,
): void {
  world.positionsX[entityId] = x;
  world.positionsY[entityId] = y;
}

function createWorld(
  entityCount: number,
  width: number,
  height: number,
): WorldState {
  return {
    entityCount,
    bounds: { width, height },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}

function createCrossingProductionScenario(): SimulationScenario {
  const source = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!.units[0]!;
  return {
    seed: 0x8d_1001,
    entityCount: 3,
    bounds: { width: 160, height: 160 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 2,
      includeEnergyDebug: true,
      inspectedEntityIds: [0, 1],
      units: [
        crossingUnit(source, 10, 42, 50, 1, 0),
        crossingUnit(source, 20, 50, 42, 0, 1),
        {
          ...crossingUnit(source, 30, 145, 145, -1, 0),
          factionId: 2,
          order: "hold",
        },
      ],
    },
  };
}

function crossingUnit(
  source: CombatSandboxUnitScenario,
  unitId: number,
  x: number,
  y: number,
  headingX: -1 | 0 | 1,
  headingY: -1 | 0 | 1,
): CombatSandboxUnitScenario {
  return {
    ...source,
    unitId,
    factionId: 1,
    memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: y, maxY: y },
    anchorX: x,
    anchorY: y,
    headingX,
    headingY,
    spacing: 10,
    rows: 1,
    cols: 1,
    unitSpeed: 2,
    ordinaryPhysicalGait: "jogging",
    order: "advance",
    memberMaxStep: 2,
    ...(source.memberProfiles === undefined
      ? {}
      : { memberProfiles: source.memberProfiles.slice(0, 1) }),
  };
}
