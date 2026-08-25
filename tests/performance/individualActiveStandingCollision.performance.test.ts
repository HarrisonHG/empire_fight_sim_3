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
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import type { CasualtyDragGroupRecord } from "../../src/sim/individualCasualtyAssistance";
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
        fixture.workspace.collisionOccupancyFlags.byteLength +
        fixture.workspace.downedSoftFlags.byteLength +
        fixture.workspace.assistedMovingFlags.byteLength +
        fixture.workspace.downedSoftAvoidanceFlags.byteLength +
        fixture.workspace.downedSoftCrossingFlags.byteLength +
        fixture.workspace.assistedGroupYieldFlags.byteLength +
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
      expect(workspaceTypedBytes).toBe(entityCount * 44);
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

  it.each([100, 500, 1_000, 2_000])(
    "retains bounded downed-soft avoidance work for %i entities",
    (entityCount) => {
      const fixture = createFrontFixture(entityCount);
      const half = entityCount / 2;
      const procedures = createIndividualCasualtyProcedureProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          procedureKind: "citizen" as const,
          deathCountPolicy: { kind: "normalFortitude" as const },
        })),
      });
      applyIndividualZeroHitLifecycleTransitions(
        fixture.lifecycle,
        fixture.presence,
        procedures,
        fixture.world,
        Array.from({ length: half }, (_, index) => ({
          entityId: half + index,
          attackerEntityId: index,
          previousHits: 1,
        })),
        0,
      );
      const samples = new Float64Array(MEASURED_TICKS);
      let maximumCandidates = 0;
      let totalSoftResolutions = 0;
      for (let tickIndex = 0; tickIndex < MEASURED_TICKS; tickIndex += 1) {
        for (let lane = 0; lane < half; lane += 1) {
          fixture.world.positionsX[lane] = 40;
          fixture.world.positionsY[lane] = 16 + lane * 10;
          fixture.world.positionsX[half + lane] = 50;
          fixture.world.positionsY[half + lane] = 16 + lane * 10;
        }
        const tick = tickIndex + 1;
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
        for (let entityId = 0; entityId < half; entityId += 1) {
          fixture.world.positionsX[entityId] =
            fixture.world.positionsX[entityId]! + 2;
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
        samples[tickIndex] = performance.now() - started;
        maximumCandidates = Math.max(maximumCandidates, result.localCandidateCount);
        totalSoftResolutions += result.downedSoftAvoidanceCount +
          result.downedSoftCrossingCount;
        expect(result.localCandidateCount).toBeLessThan(entityCount * 64);
        expect(result.unresolvedOverlapCount).toBe(0);
      }
      expect(totalSoftResolutions).toBeGreaterThan(0);
      writeReport({
        slice: "8E-downed-soft-avoidance",
        entityCount,
        measuredTicks: MEASURED_TICKS,
        meanMillisecondsPerTick:
          samples.reduce((sum, value) => sum + value, 0) / MEASURED_TICKS,
        maximumMillisecondsPerTick: Math.max(...samples),
        maximumCandidates,
        totalSoftResolutions,
        timingPolicy:
          "Structural only; one active mover per lane approaching reusable downed-soft occupancy.",
      });
    },
  );

  it.each([100, 500, 1_000, 2_000])(
    "retains bounded assisted-group yielding work for %i entities",
    (entityCount) => {
      const fixture = createAlliedFlowFixture(entityCount);
      const groupCount = Math.floor(entityCount / 3);
      const procedures = createIndividualCasualtyProcedureProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          procedureKind: "citizen" as const,
          deathCountPolicy: { kind: "normalFortitude" as const },
        })),
      });
      applyIndividualZeroHitLifecycleTransitions(
        fixture.lifecycle,
        fixture.presence,
        procedures,
        fixture.world,
        Array.from({ length: groupCount }, (_, index) => ({
          entityId: groupCount + index,
          attackerEntityId: index,
          previousHits: 1,
        })),
        0,
      );
      const groups: readonly CasualtyDragGroupRecord[] = Array.from(
        { length: groupCount },
        (_, index) => ({
          groupId: index,
          patientEntityId: groupCount + index,
          patientKind: "dying" as const,
          helperKind: "physick" as const,
          helperEntityIds: [groupCount * 2 + index],
          destinationX: 200,
          destinationY: 16 + index * 10,
          createdTick: 0,
          phase: "dragging" as const,
          phaseEnteredTick: 0,
        }),
      );
      const samples = new Float64Array(MEASURED_TICKS);
      let maximumCandidates = 0;
      let totalAssistedYields = 0;
      for (let tickIndex = 0; tickIndex < MEASURED_TICKS; tickIndex += 1) {
        for (let entityId = 0; entityId < entityCount; entityId += 1) {
          fixture.world.positionsX[entityId] = 400;
          fixture.world.positionsY[entityId] =
            16 + (entityId % groupCount) * 10;
        }
        for (let lane = 0; lane < groupCount; lane += 1) {
          fixture.world.positionsX[lane] = 40;
          fixture.world.positionsY[lane] = 16 + lane * 10;
          fixture.world.positionsX[groupCount + lane] = 49;
          fixture.world.positionsY[groupCount + lane] = 16 + lane * 10;
          fixture.world.positionsX[groupCount * 2 + lane] = 53;
          fixture.world.positionsY[groupCount * 2 + lane] = 16 + lane * 10;
        }
        const tick = tickIndex + 1;
        projectIndividualPhysicalOccupancyOneTick(
          fixture.occupancy,
          fixture.lifecycle,
          fixture.presence,
          groups,
          tick,
        );
        beginIndividualCollisionResolutionTick(
          fixture.collision,
          fixture.occupancy,
          fixture.world,
          tick,
        );
        for (let entityId = 0; entityId < groupCount; entityId += 1) {
          fixture.world.positionsX[entityId] =
            fixture.world.positionsX[entityId]! + 2;
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
        samples[tickIndex] = performance.now() - started;
        maximumCandidates = Math.max(maximumCandidates, result.localCandidateCount);
        totalAssistedYields += result.assistedGroupYieldCount;
        expect(result.localCandidateCount).toBeLessThan(entityCount * 64);
        expect(result.unresolvedOverlapCount).toBe(0);
      }
      expect(totalAssistedYields).toBeGreaterThan(0);
      writeReport({
        slice: "8E-assisted-group-yielding",
        entityCount,
        measuredTicks: MEASURED_TICKS,
        meanMillisecondsPerTick:
          samples.reduce((sum, value) => sum + value, 0) / MEASURED_TICKS,
        maximumMillisecondsPerTick: Math.max(...samples),
        maximumCandidates,
        totalAssistedYields,
        timingPolicy:
          "Structural only; one ordinary ally per lane approaches a projected patient/helper rescue group.",
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
    `\nMilestone 8 production collision performance report\n${
      JSON.stringify(report, null, 2)
    }\n`,
  );
}
