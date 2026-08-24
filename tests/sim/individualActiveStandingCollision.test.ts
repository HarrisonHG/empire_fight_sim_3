import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
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
import { getIndividualEnergyActivityInspection } from "../../src/sim/individualEnergyActivity";
import {
  createIndividualPhysicalOccupancyStore,
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import { createIndividualOrdinaryParticipationSnapshot } from "../../src/sim/individualOrdinaryParticipation";
import {
  MILESTONE_8C_PRODUCTION_COLLISION_ORDER,
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";
import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
  WorldState,
} from "../../src/sim/types";

describe("Milestone 8C ordinary active-standing production collision", () => {
  it("prevents two hostile groups from interpenetrating and settles a stable front", () => {
    const fixture = createResolverFixture(4, false);
    setPosition(fixture.world, 0, 20, 20);
    setPosition(fixture.world, 1, 20, 30);
    setPosition(fixture.world, 2, 30, 20);
    setPosition(fixture.world, 3, 30, 30);

    const positionHistory: number[][] = [];
    for (let tick = 0; tick < 100; tick += 1) {
      openTick(fixture, tick);
      requestDelta(fixture.world, 0, 2, 0);
      requestDelta(fixture.world, 1, 2, 0);
      requestDelta(fixture.world, 2, -2, 0);
      requestDelta(fixture.world, 3, -2, 0);
      const result = resolveFixture(fixture);
      expect(result.unresolvedOverlapCount).toBe(0);
      expect(result.passCount).toBeLessThanOrEqual(8);
      expectNoStandingOverlap(fixture.world, 4);
      positionHistory.push(Array.from(fixture.world.positionsX));
    }

    expect(positionHistory[0]).toEqual([21, 21, 29, 29]);
    for (let index = 1; index < positionHistory.length; index += 1) {
      expect(positionHistory[index]).toEqual(positionHistory[0]);
    }
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0))
      .toMatchObject({
        permittedDeltaX: 2,
        resolvedDeltaX: 0,
        blocked: true,
        redirected: false,
        principalOccupancyRelationshipCode: 1,
      });
  });

  it("preserves a non-conflicting ordinary step exactly", () => {
    const fixture = createResolverFixture(2, false);
    setPosition(fixture.world, 0, 20, 20);
    setPosition(fixture.world, 1, 80, 20);
    openTick(fixture, 0);
    requestDelta(fixture.world, 0, 2, 1);
    requestDelta(fixture.world, 1, -2, 0);

    const result = resolveFixture(fixture);

    expect(Array.from(fixture.world.positionsX)).toEqual([22, 78]);
    expect(Array.from(fixture.world.positionsY)).toEqual([21, 20]);
    expect(result).toMatchObject({
      moverCount: 2,
      movedCount: 2,
      blockedCount: 0,
      reducedCount: 0,
      redirectedCount: 0,
      unresolvedOverlapCount: 0,
    });
    expect(getIndividualCollisionResolutionInspection(fixture.collision, 0))
      .toMatchObject({
        permittedDeltaX: 2,
        permittedDeltaY: 1,
        resolvedDeltaX: 2,
        resolvedDeltaY: 1,
      });
  });

  it("is replay-stable when equivalent unit definitions are supplied in reverse order", () => {
    const run = (reverseUnits: boolean) => {
      const fixture = createResolverFixture(8, reverseUnits);
      for (let lane = 0; lane < 4; lane += 1) {
        setPosition(fixture.world, lane, 20, 20 + lane * 10);
        setPosition(fixture.world, lane + 4, 30, 20 + lane * 10);
      }
      const trace: number[][] = [];
      for (let tick = 0; tick < 30; tick += 1) {
        openTick(fixture, tick);
        for (let entityId = 0; entityId < 4; entityId += 1) {
          requestDelta(fixture.world, entityId, 2, 0);
        }
        for (let entityId = 4; entityId < 8; entityId += 1) {
          requestDelta(fixture.world, entityId, -2, 0);
        }
        resolveFixture(fixture);
        trace.push([
          ...fixture.world.positionsX,
          ...fixture.world.positionsY,
          ...fixture.collision.resolvedDeltas,
        ]);
      }
      return trace;
    };

    expect(run(false)).toEqual(run(false));
    expect(run(true)).toEqual(run(false));
  });

  it("integrates before energy observation and leaves distant production movement unchanged", () => {
    const simulation = createSimulation(createProductionScenario(20, 180));
    const startX = simulation.world.positionsX.slice();

    advanceSimulationOneTick(simulation);

    const combat = simulation.combatSandbox!;
    expect(combat.individualActiveStandingCollisionResult).toMatchObject({
      moverCount: 2,
      blockedCount: 0,
      reducedCount: 0,
      unresolvedOverlapCount: 0,
    });
    for (let entityId = 0; entityId < 2; entityId += 1) {
      const collision = getIndividualCollisionResolutionInspection(
        combat.individualCollisionResolutionStore,
        entityId,
      );
      const energy = getIndividualEnergyActivityInspection(
        combat.individualEnergyActivityStore,
        entityId,
      );
      const actualDeltaX = simulation.world.positionsX[entityId]! -
        startX[entityId]!;
      expect(collision.resolvedDeltaX).toBe(collision.permittedDeltaX);
      expect(collision.resolvedDeltaY).toBe(collision.permittedDeltaY);
      expect(collision.resolvedDeltaX).toBe(actualDeltaX);
      expect(energy.displacementX).toBe(actualDeltaX);
      expect(energy.displacementY).toBe(collision.resolvedDeltaY);
    }
    expect(combat.debugSnapshot).toMatchObject({
      activeStandingCollisionMoverCount: 2,
      activeStandingCollisionBlockedCount: 0,
      activeStandingCollisionReducedCount: 0,
      activeStandingCollisionUnresolvedOverlapCount: 0,
    });
    expect(MILESTONE_8C_PRODUCTION_COLLISION_ORDER).toEqual([
      "ordinaryFormationProducesEnergyLimitedStep",
      "ordinaryActiveStandingCollisionResolvesStep",
      "ordinaryMovementObservationConsumesResolvedPosition",
      "specialistMovementAuthoritiesRemainUnchanged",
      "combatConsumesFinalResolvedPositions",
      "energyClassifiesFinalActualDisplacement",
    ]);
  });

  it("uses final collision-resolved front positions for production energy and combat", () => {
    const simulation = createSimulation(createProductionScenario(60, 70));
    const startX = simulation.world.positionsX.slice();

    advanceSimulationOneTick(simulation);

    const combat = simulation.combatSandbox!;
    expect(combat.individualActiveStandingCollisionResult.unresolvedOverlapCount)
      .toBe(0);
    expect(
      combat.individualActiveStandingCollisionResult.blockedCount +
      combat.individualActiveStandingCollisionResult.reducedCount,
    ).toBeGreaterThan(0);
    expectNoStandingOverlap(simulation.world, 4);
    const finalDeltaX = simulation.world.positionsX[1]! -
      simulation.world.positionsX[0]!;
    const finalDeltaY = simulation.world.positionsY[1]! -
      simulation.world.positionsY[0]!;
    const finalDistanceSquared = finalDeltaX * finalDeltaX +
      finalDeltaY * finalDeltaY;
    expect(combat.debugSnapshot.inspectedIndividuals[0])
      .toMatchObject({ selectedTargetDistanceSquared: finalDistanceSquared });
    expect(combat.debugSnapshot.inspectedIndividuals[1])
      .toMatchObject({ selectedTargetDistanceSquared: finalDistanceSquared });
    for (let entityId = 0; entityId < 2; entityId += 1) {
      const collision = getIndividualCollisionResolutionInspection(
        combat.individualCollisionResolutionStore,
        entityId,
      );
      const energy = getIndividualEnergyActivityInspection(
        combat.individualEnergyActivityStore,
        entityId,
      );
      const actualDeltaX = simulation.world.positionsX[entityId]! -
        startX[entityId]!;
      expect(collision.resolvedDeltaX).toBe(actualDeltaX);
      expect(
        collision.resolvedDeltaX ** 2 + collision.resolvedDeltaY ** 2,
      ).toBeLessThanOrEqual(
        collision.permittedDeltaX ** 2 + collision.permittedDeltaY ** 2,
      );
      expect(energy.displacementX).toBe(actualDeltaX);
    }
  });
});

function createResolverFixture(entityCount: number, reverseUnits: boolean) {
  const midpoint = entityCount / 2;
  const definitions = [
    {
      unitId: 10,
      factionId: 1,
      memberEntityIds: Array.from({ length: midpoint }, (_, index) => index),
    },
    {
      unitId: 20,
      factionId: 2,
      memberEntityIds: Array.from(
        { length: entityCount - midpoint },
        (_, index) => midpoint + index,
      ),
    },
  ];
  const bounds = { width: 120, height: 120 };
  const world = createWorld(entityCount, bounds.width, bounds.height);
  const identity = createUnitIdentityStore({
    entityCount,
    units: reverseUnits ? definitions.slice().reverse() : definitions,
  });
  const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
  const presence = createIndividualPlayerPresenceStore(entityCount);
  const occupancy = createIndividualPhysicalOccupancyStore(entityCount);
  const collision = createIndividualCollisionResolutionStore(entityCount);
  const workspace = createIndividualActiveStandingCollisionWorkspace(
    entityCount,
    bounds,
    world.ids,
  );
  const ordinary = createIndividualOrdinaryParticipationSnapshot(entityCount);
  const morale = new Map([[10, "steady"], [20, "steady"]] as const);
  return {
    world,
    identity,
    lifecycle,
    presence,
    occupancy,
    collision,
    workspace,
    ordinary,
    morale,
  };
}

function openTick(
  fixture: ReturnType<typeof createResolverFixture>,
  tick: number,
): void {
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
}

function resolveFixture(fixture: ReturnType<typeof createResolverFixture>) {
  return resolveOrdinaryActiveStandingFormationMovementOneTick(
    fixture.workspace,
    fixture.collision,
    fixture.occupancy,
    fixture.world,
    fixture.identity,
    fixture.ordinary,
    fixture.morale,
  );
}

function requestDelta(
  world: WorldState,
  entityId: number,
  deltaX: number,
  deltaY: number,
): void {
  world.positionsX[entityId] = world.positionsX[entityId]! + deltaX;
  world.positionsY[entityId] = world.positionsY[entityId]! + deltaY;
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

function expectNoStandingOverlap(world: WorldState, radius: number): void {
  const minimumSquared = (radius * 2) ** 2;
  for (let left = 0; left < world.entityCount; left += 1) {
    for (let right = left + 1; right < world.entityCount; right += 1) {
      const deltaX = world.positionsX[right]! - world.positionsX[left]!;
      const deltaY = world.positionsY[right]! - world.positionsY[left]!;
      expect(deltaX * deltaX + deltaY * deltaY).toBeGreaterThanOrEqual(
        minimumSquared,
      );
    }
  }
}

function createProductionScenario(
  leftX: number,
  rightX: number,
): SimulationScenario {
  const sources = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!.units;
  return {
    seed: 0x8c_0001,
    entityCount: 2,
    bounds: { width: 240, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 2,
      includeEnergyDebug: true,
      inspectedEntityIds: [0, 1],
      units: [
        productionUnit(sources[0]!, 1, 1, leftX, 1),
        productionUnit(sources[2]!, 2, 2, rightX, -1),
      ],
    },
  };
}

function productionUnit(
  source: CombatSandboxUnitScenario,
  unitId: number,
  factionId: number,
  x: number,
  headingX: -1 | 1,
): CombatSandboxUnitScenario {
  return {
    ...source,
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x,
    anchorY: 60,
    headingX,
    headingY: 0,
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
    casualtyProcedure: factionId === 1
      ? {
          procedureKind: "citizen",
          deathCountPolicy: { kind: "normalFortitude" },
        }
      : {
          procedureKind: "barbarian",
          deathCountPolicy: { kind: "fixedTicks", durationTicks: 1_200 },
          respawnDestination: { x: 220, y: 60 },
        },
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
