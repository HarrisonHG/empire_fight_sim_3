import { describe, expect, it } from "vitest";

import { LIVE_COMBAT_SCENARIO } from "../../src/content/liveCombatScenario";
import { getUnitCohesion } from "../../src/sim/formationBehaviour";
import {
  getLockedAttackTargetEntityId,
} from "../../src/sim/individualCombatAction";
import { getIndividualCombatProfile } from "../../src/sim/individualCombatProfile";
import { getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import { getSelectedTargetEntityId } from "../../src/sim/individualMeleeTargetSelection";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";
import { getUnitIds, getUnitMembers } from "../../src/sim/unitIdentity";

describe("integrated individual combat observation pipeline", () => {
  it("initialises all individual stores and reusable buffers with matching entity counts", () => {
    const simulation = createSimulation(LIVE_COMBAT_SCENARIO);
    const combat = requireCombatSandbox(simulation);
    const entityCount = simulation.world.entityCount;

    expect(combat.individualProfileStore.entityCount).toBe(entityCount);
    expect(combat.individualTargetSelectionStore.entityCount).toBe(entityCount);
    expect(combat.individualCombatActionStore.entityCount).toBe(entityCount);
    expect(combat.individualMeleeDefenceStore.entityCount).toBe(entityCount);
    expect(combat.individualLandedHitGateStore.entityCount).toBe(entityCount);
    expect(combat.individualGlobalHitStore.entityCount).toBe(entityCount);
    expect(combat.individualCombatPipelineStores.profileStore).toBe(
      combat.individualProfileStore,
    );
    expect(combat.individualCombatPipelineStores.targetSelectionStore).toBe(
      combat.individualTargetSelectionStore,
    );
    expect(combat.individualCombatPipelineStores.actionStore).toBe(
      combat.individualCombatActionStore,
    );
    expect(combat.individualCombatPipelineStores.defenceStore).toBe(
      combat.individualMeleeDefenceStore,
    );
    expect(combat.individualCombatPipelineStores.landedHitGateStore).toBe(
      combat.individualLandedHitGateStore,
    );
    expect(combat.individualCombatPipelineStores.globalHitStore).toBe(
      combat.individualGlobalHitStore,
    );
    expect(combat.individualCombatPipelineBuffers.selectedTargetRecords).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.actionStateEvents).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.attackAttempts).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.guardStateEvents).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.defenceRecords).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.gateDecisions).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.acceptedLandedRecords).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.hitApplications).toEqual([]);
    expect(combat.individualCombatPipelineBuffers.zeroHitEvents).toEqual([]);
  });

  it("maps scenario unit loadouts deterministically into member profiles", () => {
    const simulation = createSimulation(mappingScenario());

    expect(profileForUnit(simulation, 1)).toMatchObject({
      primaryWeapon: "oneHanded",
      armourCategory: "heavy",
      shieldCategory: "shield",
      shieldCarriedState: "held",
      qualifications: expect.objectContaining({ hasDreadnought: true }),
    });
    expect(profileForUnit(simulation, 2)).toMatchObject({
      primaryWeapon: "greatWeapon",
      armourCategory: "medium",
      shieldCategory: "buckler",
      shieldCarriedState: "slung",
    });
    expect(profileForUnit(simulation, 3)).toMatchObject({
      primaryWeapon: "ranged",
      armourCategory: "mageArmour",
      shieldCategory: "none",
      shieldCarriedState: "none",
    });
    expect(profileForUnit(simulation, 4)).toMatchObject({
      primaryWeapon: "thrown",
      armourCategory: "light",
      shieldCategory: "buckler",
      shieldCarriedState: "held",
    });
    expect(profileForUnit(simulation, 5)).toMatchObject({
      primaryWeapon: "staff",
      armourCategory: "none",
    });
    expect(profileForUnit(simulation, 6)).toMatchObject({
      primaryWeapon: "unarmed",
      armourCategory: "none",
    });
    expect(serializeProfiles(simulation)).toEqual(
      serializeProfiles(createSimulation(mappingScenario())),
    );
  });

  it("fails clearly for unsupported legacy dual-wield loadouts", () => {
    expect(() =>
      createSimulation({
        ...mappingScenario(),
        entityCount: 2,
        combatSandbox: {
          kind: "liveCombatSandbox",
          appliedDamagePressureScale: 1,
          units: [
            baseUnit(1, 1, 0, 40, {
              weaponCategory: "dualWield",
              armourClass: "none",
              shieldClass: "none",
            }),
            baseUnit(2, 2, 1, 60, {
              weaponCategory: "unarmed",
              armourClass: "none",
              shieldClass: "none",
            }),
          ],
        },
      }),
    ).toThrow(RangeError);
  });

  it("runs the full individual chain from real world positions without changing legacy authority", () => {
    const simulation = createSimulation(closeMeleeScenario());
    const combat = requireCombatSandbox(simulation);
    const buffers = combat.individualCombatPipelineBuffers;
    const selectedTargets = buffers.selectedTargetRecords;
    const actionEvents = buffers.actionStateEvents;
    const attempts = buffers.attackAttempts;
    const guardEvents = buffers.guardStateEvents;
    const defences = buffers.defenceRecords;
    const gateDecisions = buffers.gateDecisions;
    const accepted = buffers.acceptedLandedRecords;
    const applications = buffers.hitApplications;
    const zeroEvents = buffers.zeroHitEvents;
    const legacyTraceBefore = legacyTrace(simulation);
    const targetId = getUnitMembers(combat.identityStore, 2)[0]!;
    const targetHitsBefore = getIndividualCurrentGlobalHits(
      combat.individualGlobalHitStore,
      targetId,
    );

    for (let tick = 0; tick < 8; tick += 1) {
      advanceSimulationOneTick(simulation);
    }

    expect(buffers.selectedTargetRecords).toBe(selectedTargets);
    expect(buffers.actionStateEvents).toBe(actionEvents);
    expect(buffers.attackAttempts).toBe(attempts);
    expect(buffers.guardStateEvents).toBe(guardEvents);
    expect(buffers.defenceRecords).toBe(defences);
    expect(buffers.gateDecisions).toBe(gateDecisions);
    expect(buffers.acceptedLandedRecords).toBe(accepted);
    expect(buffers.hitApplications).toBe(applications);
    expect(buffers.zeroHitEvents).toBe(zeroEvents);
    expect(combat.individualEligibleMeleeSourceCount).toBe(2);
    expect(combat.individualSelectedTargetCount).toBeGreaterThan(0);
    expect(getSelectedTargetEntityId(combat.individualTargetSelectionStore, 0))
      .toBe(targetId);
    expect(
      getLockedAttackTargetEntityId(combat.individualCombatActionStore, 0),
    ).toBeGreaterThanOrEqual(-1);
    expect(combat.totalIndividualAttackAttemptCount).toBeGreaterThan(0);
    expect(combat.totalIndividualLandedDefenceOutcomeCount).toBeGreaterThan(0);
    expect(combat.totalIndividualGateAcceptedHitCount).toBeGreaterThan(0);
    expect(combat.totalIndividualAppliedHitLoss).toBe(2);
    expect(combat.totalIndividualZeroHitTransitionCount).toBe(1);
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, targetId))
      .toBe(targetHitsBefore - 2);
    expect(
      combat.individualCombatPipelineBuffers.hitApplications.every(
        (application) =>
          combat.individualCombatPipelineBuffers.acceptedLandedRecords.some(
            (record) =>
              record.attackerEntityId === application.attackerEntityId &&
              record.defenderEntityId === application.targetEntityId,
          ),
      ),
    ).toBe(true);
    expect(simulation.world.entityCount).toBe(3);
    expect(Array.from(simulation.world.ids)).toEqual([0, 1, 2]);
    expect(legacyTraceBefore).toMatchObject({
      entityCount: simulation.world.entityCount,
    });
    expect(legacyTrace(simulation)).toMatchObject({
      ids: Array.from(simulation.world.ids),
    });
  });

  it("holds the one-second relationship gate under the integrated tick counter", () => {
    const simulation = createSimulation(closeMeleeScenario());
    const combat = requireCombatSandbox(simulation);

    for (let tick = 0; tick < 30; tick += 1) {
      advanceSimulationOneTick(simulation);
    }

    expect(combat.totalIndividualGateAcceptedHitCount).toBeGreaterThanOrEqual(2);
    expect(combat.totalIndividualGateRejectedHitCount).toBeGreaterThan(0);
    expect(combat.totalIndividualAppliedHitLoss).toBe(2);
    expect(combat.totalIndividualZeroHitTransitionCount).toBe(1);
    expect(combat.individualActiveGateRelationshipCount).toBeGreaterThan(0);
  });

  it("keeps legacy combat, pressure, cohesion, morale, and entity traces deterministic", () => {
    const first = runLiveCombat(320);
    const second = runLiveCombat(320);

    expect(legacyTrace(first)).toEqual(legacyTrace(second));
    expect(first.combatSandbox?.totalIndividualSelectedTargetCount).toBeGreaterThan(0);
    expect(first.combatSandbox?.totalIndividualActiveCommitmentCount)
      .toBeGreaterThan(0);
  });

  it("replays the integrated observation state deterministically without deferred outcome fields", () => {
    const first = runCloseMeleeReplay();
    const second = runCloseMeleeReplay();

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(
      /death|dead|removal|removed|healing|heal|routing|call|shout|special.?effect/i,
    );
  });
});

function runCloseMeleeReplay(): unknown {
  const simulation = createSimulation(closeMeleeScenario());
  for (let tick = 0; tick < 30; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  const combat = requireCombatSandbox(simulation);
  return {
    tick: simulation.tick,
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
    selectedTargets: combat.individualCombatPipelineBuffers.selectedTargetRecords
      .map((record) => ({ ...record })),
    attempts: combat.individualCombatPipelineBuffers.attackAttempts.map(
      (record) => ({ ...record }),
    ),
    defences: combat.individualCombatPipelineBuffers.defenceRecords.map(
      (record) => ({ ...record }),
    ),
    gate: combat.individualCombatPipelineBuffers.gateDecisions.map((record) => ({
      ...record,
    })),
    hits: combat.individualCombatPipelineBuffers.hitApplications.map((record) => ({
      ...record,
    })),
    zeroEvents: combat.individualCombatPipelineBuffers.zeroHitEvents.map(
      (record) => ({ ...record }),
    ),
    counters: individualCounterTrace(combat),
  };
}

function runLiveCombat(tickCount: number): SimulationState {
  const simulation = createSimulation(LIVE_COMBAT_SCENARIO);
  for (let tick = 0; tick < tickCount; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  return simulation;
}

function legacyTrace(simulation: SimulationState): unknown {
  const combat = requireCombatSandbox(simulation);
  const unitIds = getUnitIds(combat.identityStore);
  return {
    entityCount: simulation.world.entityCount,
    ids: Array.from(simulation.world.ids),
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
    legacyCounters: {
      opportunities: combat.totalOpportunityCount,
      strikes: combat.totalStrikeCount,
      survivabilityApplications: combat.totalSurvivabilityApplicationCount,
      consequences: combat.totalConsequenceCount,
    },
    units: unitIds.map((unitId) => ({
      unitId,
      cohesion: getUnitCohesion(combat.formationStore, unitId),
      morale: getPersistentUnitMorale(combat.persistentMoraleStore, unitId),
    })),
  };
}

function individualCounterTrace(
  combat: ReturnType<typeof requireCombatSandbox>,
): unknown {
  return {
    eligible: combat.totalIndividualEligibleMeleeSourceCount,
    selected: combat.totalIndividualSelectedTargetCount,
    commitments: combat.totalIndividualActiveCommitmentCount,
    attempts: combat.totalIndividualAttackAttemptCount,
    invalidated: combat.totalIndividualInvalidatedAttackCount,
    parries: combat.totalIndividualParryCount,
    bucklerBlocks: combat.totalIndividualBucklerBlockCount,
    shieldBlocks: combat.totalIndividualShieldBlockCount,
    landed: combat.totalIndividualLandedDefenceOutcomeCount,
    accepted: combat.totalIndividualGateAcceptedHitCount,
    rejected: combat.totalIndividualGateRejectedHitCount,
    applied: combat.totalIndividualAppliedHitLoss,
    zero: combat.totalIndividualZeroHitTransitionCount,
    activeRelationships: combat.individualActiveGateRelationshipCount,
  };
}

function profileForUnit(simulation: SimulationState, unitId: number) {
  const combat = requireCombatSandbox(simulation);
  const entityId = getUnitMembers(combat.identityStore, unitId)[0]!;
  return getIndividualCombatProfile(combat.individualProfileStore, entityId);
}

function serializeProfiles(simulation: SimulationState): unknown {
  const combat = requireCombatSandbox(simulation);
  return getUnitIds(combat.identityStore).map((unitId) =>
    getUnitMembers(combat.identityStore, unitId).map((entityId) => {
      const profile = getIndividualCombatProfile(
        combat.individualProfileStore,
        entityId,
      );
      return {
        ...profile,
        entityId,
      };
    }),
  );
}

function requireCombatSandbox(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected live combat sandbox.");
  }
  return simulation.combatSandbox;
}

function closeMeleeScenario(): SimulationScenario {
  return {
    seed: 0x5f01,
    entityCount: 3,
    bounds: { width: 160, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        baseUnit(1, 1, 0, 50, {
          memberCount: 2,
          rows: 1,
          cols: 2,
          anchorX: 50,
          anchorY: 60,
          headingX: 1,
          weaponCategory: "oneHanded",
          armourClass: "none",
          shieldClass: "none",
        }),
        baseUnit(2, 2, 2, 58, {
          memberCount: 1,
          rows: 1,
          cols: 1,
          anchorX: 58,
          anchorY: 60,
          headingX: -1,
          weaponCategory: "unarmed",
          armourClass: "none",
          shieldClass: "none",
        }),
      ],
    },
  };
}

function mappingScenario(): SimulationScenario {
  return {
    seed: 0x5f02,
    entityCount: 6,
    bounds: { width: 240, height: 160 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        baseUnit(1, 1, 0, 30, {
          weaponCategory: "oneHanded",
          armourClass: "dreadnought",
          shieldClass: "shield",
        }),
        baseUnit(2, 2, 1, 55, {
          weaponCategory: "twoHanded",
          armourClass: "medium",
          shieldClass: "buckler",
        }),
        baseUnit(3, 1, 2, 80, {
          weaponCategory: "bow",
          armourClass: "mageArmour",
          shieldClass: "none",
        }),
        baseUnit(4, 2, 3, 105, {
          weaponCategory: "thrown",
          armourClass: "light",
          shieldClass: "buckler",
        }),
        baseUnit(5, 1, 4, 130, {
          weaponCategory: "staff",
          armourClass: "none",
          shieldClass: "none",
        }),
        baseUnit(6, 2, 5, 155, {
          weaponCategory: "unarmed",
          armourClass: "none",
          shieldClass: "none",
        }),
      ],
    },
  };
}

function baseUnit(
  unitId: number,
  factionId: number,
  entityIndex: number,
  x: number,
  overrides: Partial<CombatSandboxUnitScenario>,
): CombatSandboxUnitScenario {
  return {
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x,
    anchorY: 60 + entityIndex,
    headingX: factionId === 1 ? 1 : -1,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold",
    role: "regular",
    memberMaxStep: 1,
    weaponCategory: "oneHanded",
    weaponReachBand: "short",
    armourClass: "none",
    shieldClass: "none",
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    ...overrides,
  };
}
