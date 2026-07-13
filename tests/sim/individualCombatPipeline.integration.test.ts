import { describe, expect, it } from "vitest";

import { LIVE_COMBAT_SCENARIO } from "../../src/content/liveCombatScenario";
import { getUnitCohesion } from "../../src/sim/formationBehaviour";
import {
  getIndividualCombatActionState,
  getLockedAttackTargetEntityId,
} from "../../src/sim/individualCombatAction";
import { getIndividualCombatProfile } from "../../src/sim/individualCombatProfile";
import {
  applyIndividualLandedHits,
  getIndividualCurrentGlobalHits,
} from "../../src/sim/individualGlobalHits";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
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
    expect(combat.totalIndividualSelectedTargetCount).toBeGreaterThan(0);
    expect(getSelectedTargetEntityId(combat.individualTargetSelectionStore, 0))
      .toBe(-1);
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
    const simulation = createSimulation(cooldownGateScenario());
    const combat = requireCombatSandbox(simulation);
    const targetId = getUnitMembers(combat.identityStore, 2)[0]!;

    for (let tick = 0; tick < 30; tick += 1) {
      advanceSimulationOneTick(simulation);
    }

    expect(combat.totalIndividualGateAcceptedHitCount).toBeGreaterThanOrEqual(2);
    expect(combat.totalIndividualGateRejectedHitCount).toBeGreaterThan(0);
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, targetId))
      .toBeGreaterThan(0);
    expect(combat.totalIndividualZeroHitTransitionCount).toBe(0);
    expect(combat.individualActiveGateRelationshipCount).toBeGreaterThan(0);
  });

  it("keeps zero-hit sources out of targeting and attack starts", () => {
    const simulation = createSimulation(closeMeleeScenario());
    const combat = requireCombatSandbox(simulation);
    applyHitsToZero(combat, 0, 2);

    advanceSimulationOneTick(simulation);

    expect(getSelectedTargetEntityId(combat.individualTargetSelectionStore, 0))
      .toBe(-1);
    expect(
      combat.individualCombatPipelineBuffers.attackAttempts.some(
        (attempt) => attempt.attackerEntityId === 0,
      ),
    ).toBe(false);
    expect(combat.individualCombatEligibleMemberCount).toBe(2);
    expect(summaryForUnit(combat, 1)).toMatchObject({
      memberCount: 2,
      combatEligibleMemberCount: 1,
      zeroHitMemberCount: 1,
      combatCapableNumerator: 1,
      combatCapableDenominator: 2,
    });
  });

  it("cancels a locked attack when source or target is ineligible at tick start", () => {
    const sourceZero = createSimulation(closeMeleeScenario());
    const sourceCombat = requireCombatSandbox(sourceZero);
    advanceSimulationOneTick(sourceZero);
    expect(getIndividualCombatActionState(sourceCombat.individualCombatActionStore, 0))
      .toBe("committingAttack");
    applyHitsToZero(sourceCombat, 0, 2);
    advanceSimulationOneTick(sourceZero);
    expect(getIndividualCombatActionState(sourceCombat.individualCombatActionStore, 0))
      .toBe("ready");
    expect(getLockedAttackTargetEntityId(sourceCombat.individualCombatActionStore, 0))
      .toBe(-1);
    expect(
      sourceCombat.individualCombatPipelineBuffers.attackAttempts.some(
        (attempt) => attempt.attackerEntityId === 0,
      ),
    ).toBe(false);

    const targetZero = createSimulation(closeMeleeScenario());
    const targetCombat = requireCombatSandbox(targetZero);
    advanceSimulationOneTick(targetZero);
    expect(getIndividualCombatActionState(targetCombat.individualCombatActionStore, 0))
      .toBe("committingAttack");
    applyHitsToZero(targetCombat, 2, 0);
    advanceSimulationOneTick(targetZero);
    expect(getIndividualCombatActionState(targetCombat.individualCombatActionStore, 0))
      .toBe("ready");
    expect(getLockedAttackTargetEntityId(targetCombat.individualCombatActionStore, 0))
      .toBe(-1);
    expect(targetCombat.individualShieldBlockCount).toBe(0);
  });

  it("uses next-tick eligibility after same-tick zero and aggregates overkill independently", () => {
    const simulation = createSimulation(overkillScenario());
    const combat = requireCombatSandbox(simulation);
    const targetId = getUnitMembers(combat.identityStore, 2)[0]!;

    for (let tick = 0; tick < 4; tick += 1) {
      advanceSimulationOneTick(simulation);
    }

    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, targetId))
      .toBe(0);
    expect(combat.individualAppliedHitLoss).toBe(2);
    expect(combat.individualZeroHitTransitionCount).toBe(1);
    expect(combat.individualCombatIneligibleMemberCount).toBe(0);
    expect(combat.individualCombatPipelineBuffers.hitApplications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ applicationReason: "alreadyAtZero" }),
      ]),
    );
    expect(summaryForUnit(combat, 2)).toMatchObject({
      memberCount: 1,
      combatEligibleMemberCount: 1,
      zeroHitMemberCount: 1,
      landedOutcomeCount: 3,
      gateAcceptedHitCount: 3,
      appliedHitLoss: 2,
      zeroHitTransitionCount: 1,
      combatCapableNumerator: 1,
      combatCapableDenominator: 1,
    });

    advanceSimulationOneTick(simulation);

    expect(combat.individualCombatIneligibleMemberCount).toBe(1);
    expect(summaryForUnit(combat, 2)).toMatchObject({
      combatEligibleMemberCount: 0,
      zeroHitMemberCount: 1,
      combatCapableNumerator: 0,
      combatCapableDenominator: 1,
    });
    expect(
      combat.individualCombatPipelineBuffers.selectedTargetRecords.some(
        (record) => record.targetEntityId === targetId,
      ),
    ).toBe(false);
  });

  it("clears stale per-tick summary counts while retaining hit state", () => {
    const simulation = createSimulation(overkillScenario());
    const combat = requireCombatSandbox(simulation);
    for (let tick = 0; tick < 4; tick += 1) {
      advanceSimulationOneTick(simulation);
    }
    expect(summaryForUnit(combat, 2).gateAcceptedHitCount).toBe(3);

    advanceSimulationOneTick(simulation);

    expect(summaryForUnit(combat, 2)).toMatchObject({
      selectedTargetCount: 0,
      attackAttemptCount: 0,
      landedOutcomeCount: 0,
      gateAcceptedHitCount: 0,
      gateRejectedHitCount: 0,
      appliedHitLoss: 0,
      zeroHitTransitionCount: 0,
      zeroHitMemberCount: 1,
    });
  });

  it("does not remove entities or alter formation movement for zero-hit members", () => {
    const control = createSimulation(movingFormationScenario());
    const zeroed = createSimulation(movingFormationScenario());
    const zeroedCombat = requireCombatSandbox(zeroed);
    applyHitsToZero(zeroedCombat, 0, 2);

    for (let tick = 0; tick < 8; tick += 1) {
      advanceSimulationOneTick(control);
      advanceSimulationOneTick(zeroed);
    }

    const controlCombat = requireCombatSandbox(control);
    expect(Array.from(zeroed.world.ids)).toEqual(Array.from(control.world.ids));
    expect(getUnitMembers(zeroedCombat.identityStore, 1)).toEqual(
      getUnitMembers(controlCombat.identityStore, 1),
    );
    expect(Array.from(zeroed.world.positionsX)).toEqual(
      Array.from(control.world.positionsX),
    );
    expect(Array.from(zeroed.world.positionsY)).toEqual(
      Array.from(control.world.positionsY),
    );
    expect(summaryForUnit(zeroedCombat, 1)).toMatchObject({
      memberCount: 2,
      combatEligibleMemberCount: 1,
      zeroHitMemberCount: 1,
    });
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

function summaryForUnit(
  combat: ReturnType<typeof requireCombatSandbox>,
  unitId: number,
) {
  const summary = combat.individualCombatUnitSummaries.find(
    (candidate) => candidate.unitId === unitId,
  );
  if (summary === undefined) {
    throw new Error(`Missing individual combat summary for unit ${unitId}.`);
  }
  return summary;
}

function applyHitsToZero(
  combat: ReturnType<typeof requireCombatSandbox>,
  targetEntityId: number,
  attackerEntityId: number,
): void {
  applyIndividualLandedHits(combat.individualGlobalHitStore, [
    landedRecord(attackerEntityId, targetEntityId),
    landedRecord(attackerEntityId, targetEntityId),
  ]);
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

function cooldownGateScenario(): SimulationScenario {
  return {
    seed: 0x5f04,
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
          armourClass: "heavy",
          shieldClass: "none",
        }),
      ],
    },
  };
}

function overkillScenario(): SimulationScenario {
  return {
    seed: 0x5f03,
    entityCount: 4,
    bounds: { width: 160, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        baseUnit(1, 1, 0, 50, {
          memberCount: 3,
          rows: 1,
          cols: 3,
          anchorX: 50,
          anchorY: 60,
          headingX: 1,
          weaponCategory: "oneHanded",
          armourClass: "none",
          shieldClass: "none",
        }),
        baseUnit(2, 2, 3, 58, {
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

function movingFormationScenario(): SimulationScenario {
  return {
    seed: 0x5f05,
    entityCount: 3,
    bounds: { width: 180, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        baseUnit(1, 1, 0, 30, {
          memberCount: 2,
          rows: 1,
          cols: 2,
          anchorX: 30,
          anchorY: 60,
          headingX: 1,
          weaponCategory: "oneHanded",
          armourClass: "none",
          shieldClass: "none",
          order: "advance",
          unitSpeed: 1,
        }),
        baseUnit(2, 2, 2, 130, {
          memberCount: 1,
          rows: 1,
          cols: 1,
          anchorX: 130,
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

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId,
    defenderEntityId,
    attackerWeaponCategory: "oneHanded",
    defenderActiveWeaponCategory: "oneHanded",
    defenderShieldCategory: "none",
    defenderShieldCarriedState: "none",
    defenderActionState: "ready",
    guardStateBeforeResolution: "ready",
    defenderFacingX: -1,
    defenderFacingY: 0,
    incomingDirectionName: "west",
    incomingDirectionOctantIndex: 4,
    availableDefenceType: "none",
    outcome: "landed",
    landedReason: "noActiveDefence",
    defenceRecoveryTicksAssigned: 0,
    awkwardDistance: false,
  };
}
