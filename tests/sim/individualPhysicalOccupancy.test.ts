import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import {
  applyIndividualTerminalPresenceTransitions,
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  transitionIndividualDyingToTerminal,
  transitionIndividualRespawnEgressToWaiting,
  transitionIndividualTerminalAwaitingComfortToComforted,
  type IndividualTerminalTransitionRecord,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualCasualtyProcedureProfileStore,
  type IndividualCasualtyProcedureProfileConfig,
} from "../../src/sim/individualCasualtyProcedureProfile";
import type { CasualtyDragGroupRecord } from "../../src/sim/individualCasualtyAssistance";
import {
  INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG,
  PRODUCTION_PERSONAL_SPACE_GEOMETRY,
  createIndividualPhysicalOccupancyStore,
  getIndividualPhysicalOccupancyClass,
  getIndividualPhysicalOccupancyInspection,
  projectIndividualPhysicalOccupancyOneTick,
} from "../../src/sim/individualPhysicalOccupancy";
import {
  PRODUCTION_COLLISION_RESOLUTION_ACTIVE,
  applyIndividualCollisionResolvedStep,
  beginIndividualCollisionResolutionTick,
  createIndividualCollisionResolutionStore,
  getIndividualCollisionResolutionInspection,
  recordIndividualCollisionResolvedStep,
} from "../../src/sim/individualCollisionResolution";
import { getIndividualEnergyActivityInspection } from "../../src/sim/individualEnergyActivity";
import {
  MILESTONE_8B_PRODUCTION_COLLISION_BOUNDARY,
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type { WorldState } from "../../src/sim/types";

describe("Milestone 8B production physical occupancy projection", () => {
  it("derives every occupancy class only from lifecycle, presence, and active assistance", () => {
    const fixture = createAuthorityFixture();
    const store = createIndividualPhysicalOccupancyStore(8);
    const groups: readonly CasualtyDragGroupRecord[] = [{
      groupId: 17,
      patientEntityId: 7,
      patientKind: "dying",
      helperKind: "physick",
      helperEntityIds: [6],
      destinationX: 70,
      destinationY: 70,
      createdTick: 1,
      phase: "dragging",
      phaseEnteredTick: 2,
    }];

    projectIndividualPhysicalOccupancyOneTick(
      store,
      fixture.lifecycle,
      fixture.presence,
      groups,
      10,
    );

    expect(Array.from({ length: 8 }, (_, entityId) =>
      getIndividualPhysicalOccupancyClass(store, entityId),
    )).toEqual([
      "activeStanding",
      "downedSoft",
      "downedSoft",
      "downedSoft",
      "yieldingEgress",
      "nonBattlefield",
      "assistedMoving",
      "assistedMoving",
    ]);
    expect(getIndividualPhysicalOccupancyInspection(store, 0)).toMatchObject({
      effectiveRadius: 4,
      participatesInCollision: true,
      hardStanding: true,
      softDowned: false,
      assistanceGroupId: -1,
    });
    expect(getIndividualPhysicalOccupancyInspection(store, 1)).toMatchObject({
      effectiveRadius: 5,
      hardStanding: false,
      softDowned: true,
    });
    expect(getIndividualPhysicalOccupancyInspection(store, 4)).toMatchObject({
      effectiveRadius: 4,
      hardStanding: true,
      stronglyYielding: true,
    });
    expect(getIndividualPhysicalOccupancyInspection(store, 5)).toMatchObject({
      effectiveRadius: 0,
      participatesInCollision: false,
    });
    expect([6, 7].map((entityId) =>
      getIndividualPhysicalOccupancyInspection(store, entityId),
    )).toEqual([
      expect.objectContaining({
        occupancyClass: "assistedMoving",
        assistedGroup: true,
        assistanceGroupId: 17,
      }),
      expect.objectContaining({
        occupancyClass: "assistedMoving",
        assistedGroup: true,
        assistanceGroupId: 17,
      }),
    ]);
  });

  it("retains authoritative integer geometry and reusable typed storage", () => {
    const fixture = createAuthorityFixture();
    const store = createIndividualPhysicalOccupancyStore(8);
    const classCodes = store.occupancyClassCodes;
    const radii = store.effectiveRadii;
    const flags = store.occupancyFlags;
    const groups = store.assistanceGroupIds;

    expect(store.geometry).toEqual(PRODUCTION_PERSONAL_SPACE_GEOMETRY);
    expect(Object.isFrozen(store.geometry)).toBe(true);
    projectIndividualPhysicalOccupancyOneTick(
      store,
      fixture.lifecycle,
      fixture.presence,
      [],
      10,
    );
    projectIndividualPhysicalOccupancyOneTick(
      store,
      fixture.lifecycle,
      fixture.presence,
      [],
      11,
    );
    expect(store.occupancyClassCodes).toBe(classCodes);
    expect(store.effectiveRadii).toBe(radii);
    expect(store.occupancyFlags).toBe(flags);
    expect(store.assistanceGroupIds).toBe(groups);
    expect(flags[0]! & INDIVIDUAL_PHYSICAL_OCCUPANCY_FLAG.hardStanding)
      .not.toBe(0);
    expect(() => createIndividualPhysicalOccupancyStore(1, {
      ...PRODUCTION_PERSONAL_SPACE_GEOMETRY,
      downedSoftRadius: 0,
    })).toThrow(RangeError);
    expect(() => projectIndividualPhysicalOccupancyOneTick(
      store,
      fixture.lifecycle,
      fixture.presence,
      [],
      10,
    )).toThrow(/backwards/i);
  });
});

describe("Milestone 8B production movement/collision authority boundary", () => {
  it("permits only preserve, shorten, local redirect, or stop outcomes", () => {
    const occupancyFixture = createAuthorityFixture();
    const occupancy = createIndividualPhysicalOccupancyStore(8);
    projectIndividualPhysicalOccupancyOneTick(
      occupancy,
      occupancyFixture.lifecycle,
      occupancyFixture.presence,
      [],
      10,
    );
    const world = createWorld(8);
    const collision = createIndividualCollisionResolutionStore(8);
    beginIndividualCollisionResolutionTick(collision, occupancy, world, 10);

    recordIndividualCollisionResolvedStep(collision, 0, 2, 0, 2, 0);
    recordIndividualCollisionResolvedStep(collision, 1, 2, 0, 1, 0);
    recordIndividualCollisionResolvedStep(collision, 2, 2, 0, 0, 1);
    recordIndividualCollisionResolvedStep(collision, 3, 2, 0, 0, 0);
    recordIndividualCollisionResolvedStep(collision, 5, 2, 0, -1, 0);
    expect(getIndividualCollisionResolutionInspection(collision, 0))
      .toMatchObject({ blocked: false, reduced: false, redirected: false });
    expect(getIndividualCollisionResolutionInspection(collision, 1))
      .toMatchObject({ blocked: false, reduced: true, redirected: false });
    expect(getIndividualCollisionResolutionInspection(collision, 2))
      .toMatchObject({ blocked: false, reduced: true, redirected: true });
    expect(getIndividualCollisionResolutionInspection(collision, 3))
      .toMatchObject({ blocked: true, reduced: false, redirected: false });
    expect(getIndividualCollisionResolutionInspection(collision, 5))
      .toMatchObject({ blocked: false, reduced: true, redirected: true });
    expect(() => recordIndividualCollisionResolvedStep(
      collision,
      4,
      1,
      0,
      2,
      0,
    )).toThrow(/cannot increase/i);

    recordIndividualCollisionResolvedStep(collision, 4, 2, 0, 0, 2);
    applyIndividualCollisionResolvedStep(collision, world, 4, 40, 40);
    expect([world.positionsX[4], world.positionsY[4]]).toEqual([40, 42]);
    expect(() => applyIndividualCollisionResolvedStep(
      collision,
      world,
      4,
      40,
      40,
    )).toThrow(/current position/i);
    recordIndividualCollisionResolvedStep(collision, 7, 40, 0, 40, 0);
    expect(() => applyIndividualCollisionResolvedStep(
      collision,
      world,
      7,
      70,
      70,
    )).toThrow(/world bounds/i);

    const futureCollision = createIndividualCollisionResolutionStore(8);
    expect(() => beginIndividualCollisionResolutionTick(
      futureCollision,
      occupancy,
      world,
      11,
    )).toThrow(/current-tick/i);
  });

  it("keeps production collision disabled and preserves final displacement consumed by energy", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    const combat = simulation.combatSandbox!;
    const startX = simulation.world.positionsX.slice();
    const startY = simulation.world.positionsY.slice();
    const permitted = combat.individualCollisionResolutionStore.permittedDeltas;
    const resolved = combat.individualCollisionResolutionStore.resolvedDeltas;

    expect(PRODUCTION_COLLISION_RESOLUTION_ACTIVE).toBe(false);
    expect(MILESTONE_8B_PRODUCTION_COLLISION_BOUNDARY).toEqual([
      "deriveOccupancyFromLifecyclePresenceAndAssistance",
      "existingAuthoritiesProduceEnergyLimitedBoundedMovement",
      "collisionMayOnlyResolveAnAlreadyPermittedStep",
      "worldPositionsRemainTheSingleCommittedPositionAuthority",
      "finalActualDisplacementRemainsEnergyEvidence",
    ]);
    advanceSimulationOneTick(simulation);

    expect(combat.individualCollisionResolutionStore.permittedDeltas)
      .toBe(permitted);
    expect(combat.individualCollisionResolutionStore.resolvedDeltas)
      .toBe(resolved);
    for (let entityId = 0;
      entityId < simulation.world.entityCount;
      entityId += 1) {
      const collision = getIndividualCollisionResolutionInspection(
        combat.individualCollisionResolutionStore,
        entityId,
      );
      const energy = getIndividualEnergyActivityInspection(
        combat.individualEnergyActivityStore,
        entityId,
      );
      const deltaX = simulation.world.positionsX[entityId]! - startX[entityId]!;
      const deltaY = simulation.world.positionsY[entityId]! - startY[entityId]!;
      expect(collision).toMatchObject({
        permittedDeltaX: deltaX,
        permittedDeltaY: deltaY,
        resolvedDeltaX: deltaX,
        resolvedDeltaY: deltaY,
        blocked: false,
        reduced: false,
        redirected: false,
        localNeighbourCount: 0,
        localCandidateCount: 0,
        observedTick: 0,
        finalizedTick: 0,
      });
      expect([energy.displacementX, energy.displacementY])
        .toEqual([deltaX, deltaY]);
    }
    expect(combat.debugSnapshot.inspectedIndividuals[0]).toMatchObject({
      physicalOccupancyClass: "activeStanding",
      personalSpaceRadius: 4,
      physicalOccupancyAssistanceGroupId: -1,
      collisionPermittedDeltaX: resolved[0],
      collisionPermittedDeltaY: resolved[1],
      collisionResolvedDeltaX: resolved[0],
      collisionResolvedDeltaY: resolved[1],
      collisionBlocked: false,
      collisionReduced: false,
      collisionRedirected: false,
      collisionLocalNeighbourCount: 0,
      collisionLocalCandidateCount: 0,
    });
  });
});

function createAuthorityFixture() {
  const entityCount = 8;
  const procedures = createIndividualCasualtyProcedureProfileStore({
    entityCount,
    profiles: Array.from({ length: entityCount }, (_, entityId):
      IndividualCasualtyProcedureProfileConfig => ({
      entityId,
      procedureKind: entityId === 4 || entityId === 5
        ? "barbarian"
        : "citizen",
      deathCountPolicy: entityId === 4 || entityId === 5
        ? { kind: "fixedTicks", durationTicks: 20 }
        : { kind: "normalFortitude" },
    })),
  });
  const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
  const presence = createIndividualPlayerPresenceStore({
    entityCount,
    worldWidth: 100,
    worldHeight: 100,
    procedures: Array.from({ length: entityCount }, (_, entityId) => ({
      entityId,
      procedureKind: entityId === 4 || entityId === 5
        ? "barbarian" as const
        : "citizen" as const,
      ...(entityId === 4 || entityId === 5
        ? { respawnDestination: { x: 90, y: 90 } }
        : {}),
    })),
  });
  const positions = createWorld(entityCount);
  const downedIds = [1, 2, 3, 4, 5, 7];
  applyIndividualZeroHitLifecycleTransitions(
    lifecycle,
    presence,
    procedures,
    positions,
    downedIds.map((entityId) => ({
      entityId,
      attackerEntityId: 0,
      previousHits: 1,
    })),
    1,
  );
  const terminalIds = [2, 3, 4, 5];
  const terminalTransitions: IndividualTerminalTransitionRecord[] = [];
  for (const entityId of terminalIds) {
    transitionIndividualDyingToTerminal(
      lifecycle,
      entityId,
      2,
      "deathCountExpired",
    );
    terminalTransitions.push({
      entityId,
      tick: 2,
      previousLifecycleState: "dying",
      lifecycleState: "terminal",
      cause: "deathCountExpired",
      terminalX: positions.positionsX[entityId]!,
      terminalY: positions.positionsY[entityId]!,
    });
  }
  applyIndividualTerminalPresenceTransitions(
    lifecycle,
    presence,
    procedures,
    terminalTransitions,
  );
  transitionIndividualTerminalAwaitingComfortToComforted(
    lifecycle,
    presence,
    3,
    3,
  );
  transitionIndividualRespawnEgressToWaiting(
    lifecycle,
    presence,
    5,
    3,
    positions.positionsX[5]!,
    positions.positionsY[5]!,
  );
  return { lifecycle, presence };
}

function createWorld(entityCount: number): WorldState {
  return {
    entityCount,
    bounds: { width: 100, height: 100 },
    ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
    positionsX: Int32Array.from(
      { length: entityCount },
      (_, entityId) => entityId * 10,
    ),
    positionsY: Int32Array.from(
      { length: entityCount },
      (_, entityId) => entityId * 10,
    ),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}
