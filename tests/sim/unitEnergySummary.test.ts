import { describe, expect, it } from "vitest";

import {
  applyIndividualTerminalPresenceTransitions,
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import {
  applyIndividualEnergyActivityOneTick,
  beginIndividualEnergyActivityObservation,
  classifyIndividualEnergyActivityOneTick,
  createIndividualEnergyActivityStore,
} from "../../src/sim/individualEnergyActivity";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
} from "../../src/sim/individualEnergy";
import {
  createIndividualEnergyCapabilityStore,
  projectIndividualEnergyCapabilitiesOneTick,
} from "../../src/sim/individualEnergyCapability";
import {
  createIndividualExecutionActionBuffers,
  createIndividualExecutionActionStore,
} from "../../src/sim/individualExecutionAction";
import {
  createIndividualOrdinaryParticipationSnapshot,
  isIndividualOrdinaryParticipationEligible,
  setIndividualOrdinaryParticipationEligible,
} from "../../src/sim/individualOrdinaryParticipation";
import {
  advanceIndividualRespawnEgressOneTick,
  createIndividualRespawnEgressBuffers,
} from "../../src/sim/individualRespawnEgress";
import {
  createIndividualTreatmentActionBuffers,
  createIndividualTreatmentActionStore,
} from "../../src/sim/individualTreatmentAction";
import {
  collectUnitEnergySummariesOneTick,
  createUnitEnergySummaryStore,
  getUnitEnergySummaries,
  getUnitEnergySummary,
} from "../../src/sim/unitEnergySummary";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

describe("unit energy summaries", () => {
  it("collects exact active averages, bands, capabilities and tick totals", () => {
    const fixture = createFixture([100, 50, 20, 5]);
    completeEnergyTick(fixture, 0);
    const summaries = collectUnitEnergySummariesOneTick(
      fixture.summaries,
      fixture.identity,
      fixture.lifecycle,
      fixture.presence,
      fixture.energy,
      fixture.capabilities,
      fixture.activity,
      fixture.ordinary,
      0,
    );

    expect(summaries).toBe(getUnitEnergySummaries(fixture.summaries));
    expect(getUnitEnergySummary(fixture.summaries, 10)).toEqual({
      unitId: 10,
      memberCount: 4,
      collectionTick: 0,
      activeMemberCount: 4,
      totalCurrentEnergy: 178,
      averageCurrentEnergy: 44,
      minimumCurrentEnergy: 6,
      averageEnergyRatioFixedPoint: 4_450,
      minimumEnergyRatioFixedPoint: 600,
      freshMemberCount: 1,
      workingMemberCount: 1,
      windedMemberCount: 1,
      spentMemberCount: 1,
      jogCapableMemberCount: 3,
      sprintOrChargeCapableMemberCount: 2,
      dragCapableHelperCount: 4,
      jogCapableFractionFixedPoint: 7_500,
      sprintOrChargeCapableFractionFixedPoint: 5_000,
      energySpentThisTick: 0,
      energyRecoveredThisTick: 3,
      energyBehaviourRecommendation: "normal",
      currentlyRestingMemberCount: 0,
    });
  });

  it("excludes downed, terminal, egress and waiting members exactly", () => {
    const fixture = createFixture([100, 50, 20, 5, 0], true);
    makeFourInactive(fixture);
    completeEnergyTick(fixture, 1);
    collectUnitEnergySummariesOneTick(
      fixture.summaries,
      fixture.identity,
      fixture.lifecycle,
      fixture.presence,
      fixture.energy,
      fixture.capabilities,
      fixture.activity,
      fixture.ordinary,
      1,
    );

    expect(getUnitEnergySummary(fixture.summaries, 10)).toMatchObject({
      activeMemberCount: 1,
      totalCurrentEnergy: 100,
      averageCurrentEnergy: 100,
      minimumCurrentEnergy: 100,
      freshMemberCount: 1,
      workingMemberCount: 0,
      windedMemberCount: 0,
      spentMemberCount: 0,
      jogCapableMemberCount: 1,
      sprintOrChargeCapableMemberCount: 1,
      dragCapableHelperCount: 1,
      energySpentThisTick: 0,
      energyRecoveredThisTick: 0,
    });
  });

  it("uses null empty-summary semantics for an all-downed unit", () => {
    const fixture = createFixture([50, 20]);
    const procedures = proceduresFor(2, false);
    applyIndividualZeroHitLifecycleTransitions(
      fixture.lifecycle,
      fixture.presence,
      procedures,
      fixture.world,
      [0, 1].map((entityId) => ({
        entityId, attackerEntityId: entityId, previousHits: 1,
      })),
      0,
    );
    completeEnergyTick(fixture, 0);
    collectUnitEnergySummariesOneTick(
      fixture.summaries,
      fixture.identity,
      fixture.lifecycle,
      fixture.presence,
      fixture.energy,
      fixture.capabilities,
      fixture.activity,
      fixture.ordinary,
      0,
    );
    expect(getUnitEnergySummary(fixture.summaries, 10)).toMatchObject({
      activeMemberCount: 0,
      totalCurrentEnergy: 0,
      averageCurrentEnergy: null,
      minimumCurrentEnergy: null,
      averageEnergyRatioFixedPoint: null,
      minimumEnergyRatioFixedPoint: null,
      jogCapableFractionFixedPoint: null,
      sprintOrChargeCapableFractionFixedPoint: null,
      energySpentThisTick: 0,
      energyRecoveredThisTick: 0,
    });
  });

  it("reuses summaries, rejects stale evidence atomically, and preserves commitments", () => {
    const fixture = createFixture([100, 20]);
    setIndividualOrdinaryParticipationEligible(fixture.ordinary, 1, false);
    completeEnergyTick(fixture, 4);
    collectUnitEnergySummariesOneTick(
      fixture.summaries,
      fixture.identity,
      fixture.lifecycle,
      fixture.presence,
      fixture.energy,
      fixture.capabilities,
      fixture.activity,
      fixture.ordinary,
      4,
    );
    const summary = getUnitEnergySummary(fixture.summaries, 10);
    const snapshot = { ...summary };
    expect(() => collectUnitEnergySummariesOneTick(
      fixture.summaries,
      fixture.identity,
      fixture.lifecycle,
      fixture.presence,
      fixture.energy,
      fixture.capabilities,
      fixture.activity,
      fixture.ordinary,
      5,
    )).toThrow(/stale/);
    expect(getUnitEnergySummary(fixture.summaries, 10)).toBe(summary);
    expect(summary).toEqual(snapshot);
    expect(summary.dragCapableHelperCount).toBe(1);
    expect(isIndividualOrdinaryParticipationEligible(fixture.ordinary, 1))
      .toBe(false);
    expect(() => getUnitEnergySummary(fixture.summaries, 999)).toThrow(/Unknown/);
    expect(() => getUnitEnergySummaries({
      entityCount: 2, unitCount: 1,
    })).toThrow(/Unknown/);
  });

  it("replays identical summaries deterministically", () => {
    expect(runSummarySequence()).toEqual(runSummarySequence());
  });
});

function createFixture(energies: number[], barbarian = false) {
  const entityCount = energies.length;
  const profiles = createTrustedIndividualEnergyProfileStore({
    entityCount,
    profiles: energies.map((startingEnergy, entityId) => ({
      entityId,
      maximumEnergy: 100,
      startingEnergy,
      safeRestRecoveryPerTick: 1,
    })),
  });
  const energy = createIndividualEnergyStore(profiles);
  const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
  const presence = createIndividualPlayerPresenceStore({
    entityCount,
    worldWidth: 100,
    worldHeight: 100,
    procedures: Array.from({ length: entityCount }, (_, entityId) => ({
      entityId,
      procedureKind: barbarian && entityId >= 3
        ? "barbarian" as const
        : "citizen" as const,
      ...(barbarian && entityId >= 3
        ? { respawnDestination: { x: entityId === 3 ? 50 : 0, y: 0 } }
        : {}),
    })),
  });
  const identity = createUnitIdentityStore({
    entityCount,
    units: [{
      unitId: 10,
      factionId: 1,
      memberEntityIds: Array.from({ length: entityCount }, (_, id) => id),
    }],
  });
  const world: WorldState = {
    entityCount,
    bounds: { width: 100, height: 100 },
    ids: Uint32Array.from({ length: entityCount }, (_, id) => id),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const capabilities = createIndividualEnergyCapabilityStore(
    entityCount, energy, lifecycle, presence,
  );
  return {
    world,
    identity,
    profiles,
    energy,
    lifecycle,
    presence,
    capabilities,
    activity: createIndividualEnergyActivityStore(entityCount),
    ordinary: createIndividualOrdinaryParticipationSnapshot(entityCount),
    summaries: createUnitEnergySummaryStore(identity),
  };
}

function completeEnergyTick(
  fixture: ReturnType<typeof createFixture>,
  tick: number,
): void {
  projectIndividualEnergyCapabilitiesOneTick(
    fixture.capabilities,
    fixture.energy,
    fixture.lifecycle,
    fixture.presence,
    tick,
  );
  beginIndividualEnergyActivityObservation(fixture.activity, fixture.world, tick);
  const treatments = createIndividualTreatmentActionStore(
    fixture.identity.entityCount,
  );
  const treatmentBuffers = createIndividualTreatmentActionBuffers();
  const executions = createIndividualExecutionActionStore(
    fixture.identity.entityCount,
  );
  const executionBuffers = createIndividualExecutionActionBuffers();
  classifyIndividualEnergyActivityOneTick(fixture.activity, {
    world: fixture.world,
    lifecycle: fixture.lifecycle,
    presence: fixture.presence,
    treatments,
    treatmentResult: {
      startedRecords: treatmentBuffers.startedRecords,
      interruptedRecords: treatmentBuffers.interruptedRecords,
      completedRecords: treatmentBuffers.completedRecords,
      reassessmentRequests: treatmentBuffers.reassessmentRequests,
      activeActionCount: 0,
      progressedActionCount: 0,
    },
    executions,
    executionResult: {
      startedRecords: executionBuffers.startedRecords,
      interruptedRecords: executionBuffers.interruptedRecords,
      completedRecords: executionBuffers.completedRecords,
      rejectedIntentRecords: executionBuffers.rejectedIntentRecords,
      terminalTransitions: executionBuffers.terminalTransitions,
      activeActionCount: 0,
      pendingIntentCount: 0,
      progressedActionCount: 0,
    },
    attackAttempts: [],
    defenceAttempts: [],
    isAlert: () => false,
    tick,
  });
  applyIndividualEnergyActivityOneTick(
    fixture.activity, fixture.profiles, fixture.energy, tick,
  );
}

function proceduresFor(entityCount: number, barbarian: boolean) {
  return createIndividualCasualtyProcedureProfileStore({
    entityCount,
    profiles: Array.from({ length: entityCount }, (_, entityId) => ({
      entityId,
      procedureKind: barbarian && entityId >= 3
        ? "barbarian" as const
        : "citizen" as const,
      deathCountPolicy: { kind: "fixedTicks" as const, durationTicks: 1 },
    })),
  });
}

function makeFourInactive(fixture: ReturnType<typeof createFixture>): void {
  const procedures = proceduresFor(5, true);
  const down = applyIndividualZeroHitLifecycleTransitions(
    fixture.lifecycle,
    fixture.presence,
    procedures,
    fixture.world,
    [1, 2, 3, 4].map((entityId) => ({
      entityId, attackerEntityId: 0, previousHits: 1,
    })),
    0,
  ).transitions;
  for (const entityId of [2, 3, 4]) {
    transitionIndividualDyingToTerminal(
      fixture.lifecycle, entityId, 0, "execution",
    );
  }
  applyIndividualTerminalPresenceTransitions(
    fixture.lifecycle,
    fixture.presence,
    procedures,
    down.filter((record) => record.entityId >= 2).map((record) => ({
      entityId: record.entityId,
      tick: 0,
      previousLifecycleState: "dying" as const,
      lifecycleState: "terminal" as const,
      cause: "execution" as const,
      terminalX: record.downX,
      terminalY: record.downY,
    })),
  );
  fixture.world.positionsX[4] = 0;
  // Entity 4 arrives immediately and becomes waiting; entity 3 remains egressing.
  // The production egress authority performs the transition.
  advanceIndividualRespawnEgressOneTick(
    fixture.world,
    fixture.lifecycle,
    fixture.presence,
    1,
    createIndividualRespawnEgressBuffers(),
  );
}

function runSummarySequence() {
  const fixture = createFixture([100, 50, 20, 5]);
  completeEnergyTick(fixture, 0);
  collectUnitEnergySummariesOneTick(
    fixture.summaries,
    fixture.identity,
    fixture.lifecycle,
    fixture.presence,
    fixture.energy,
    fixture.capabilities,
    fixture.activity,
    fixture.ordinary,
    0,
  );
  return { ...getUnitEnergySummary(fixture.summaries, 10) };
}
