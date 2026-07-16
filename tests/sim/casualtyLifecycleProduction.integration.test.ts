import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  getIndividualDownPosition,
  getIndividualPlayerPresenceState,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  getIndividualCasualtyLocalQueryPreparationCount,
  prepareIndividualCasualtyLocalQuery,
  queryIndividualCasualtiesWithinRadiusInto,
} from "../../src/sim/individualCasualtyLocalQuery";
import { getIndividualCasualtyProcedureProfile } from "../../src/sim/individualCasualtyProcedureProfile";
import {
  getIndividualGenericHerbInspection,
  getTrustedIndividualMedicalProfile,
} from "../../src/sim/individualMedicalProfile";
import {
  calculateTraumaticWoundOpportunityRoll,
  getIndividualTraumaticWoundInspection,
} from "../../src/sim/individualTraumaticWound";
import {
  getIndividualCombatActionState,
  getLockedAttackTargetEntityId,
} from "../../src/sim/individualCombatAction";
import { getIndividualCombatPressureInspection } from "../../src/sim/combatPressure";
import {
  getUnitAnchor,
  getUnitCohesion,
  setIndividualPressure,
} from "../../src/sim/formationBehaviour";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import { getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import { getSelectedTargetEntityId } from "../../src/sim/individualMeleeTargetSelection";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";

describe("production casualty lifecycle integration", () => {
  it("expands explicit unit procedure templates without faction inference", () => {
    const scenario = explicitProfileScenario();
    const simulation = createSimulation(scenario);
    const combat = requireCombat(simulation);

    expect(getIndividualCasualtyProcedureProfile(
      combat.individualCasualtyProcedureProfileStore,
      0,
    )).toMatchObject({
      procedureKind: "citizen",
      deathCountPolicy: { kind: "normalFortitude" },
    });
    expect(getIndividualCasualtyProcedureProfile(
      combat.individualCasualtyProcedureProfileStore,
      1,
    )).toMatchObject({
      procedureKind: "barbarian",
      deathCountPolicy: { kind: "fixedTicks", durationTicks: 600 },
    });
    expect(scenario.combatSandbox?.units[0]?.factionId).toBe(
      scenario.combatSandbox?.units[1]?.factionId,
    );
  });

  it("rejects a production unit with no explicit casualty procedure", () => {
    const scenario = explicitProfileScenario();
    const firstUnit = scenario.combatSandbox!.units[0]! as unknown as {
      casualtyProcedure?: unknown;
    };
    delete firstUnit.casualtyProcedure;

    expect(() => createSimulation(scenario)).toThrow(
      /explicit casualty procedure profile/i,
    );
  });

  it("transitions after hits, preserves same-tick records, then filters ordinary participation", () => {
    const simulation = createSimulation(productionTransitionScenario());
    const combat = requireCombat(simulation);
    const targetEntityId = 2;
    const initialTargetCohesion = getUnitCohesion(combat.formationStore, 2);

    let transitionTick = -1;
    for (let tick = 0; tick < 100; tick += 1) {
      advanceSimulationOneTick(simulation);
      if (combat.individualLifecycleTransitions.length > 0) {
        transitionTick = tick;
        break;
      }
    }

    expect(transitionTick).toBeGreaterThanOrEqual(0);
    expect(combat.individualLifecycleTransitions).toHaveLength(1);
    expect(combat.individualLifecycleTransitions[0]).toMatchObject({
      entityId: targetEntityId,
      tick: transitionTick,
      lifecycleState: "dying",
      presenceState: "downedPresence",
    });
    expect(getIndividualCurrentGlobalHits(
      combat.individualGlobalHitStore,
      targetEntityId,
    )).toBe(0);
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore,
      targetEntityId,
    )).toBe("dying");
    expect(getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore,
      targetEntityId,
    )).toBe("downedPresence");
    expect(combat.individualTraumaticWoundRecords).toEqual([]);
    expect(getIndividualTraumaticWoundInspection(
      combat.individualTraumaticWoundStore,
      targetEntityId,
    )).toMatchObject({ state: "none", episodeCount: 0 });

    const appliedLoss = combat.individualCombatPipelineBuffers.hitApplications
      .reduce((total, application) => total + application.appliedHitLoss, 0);
    expect(appliedLoss).toBe(2);
    expect(combat.individualCombatUnitSummaries[1]).toMatchObject({
      endOfTickCombatEligibleMemberCount: 0,
      newlyZeroHitMemberCount: 1,
      appliedHitLoss: 2,
      zeroHitTransitionCount: 1,
    });
    expect(combat.individualCombatConsequenceSummaries[1]).toMatchObject({
      endOfTickEligibleMembers: 0,
      incomingAppliedHitLoss: 2,
      incomingZeroHitTransitions: 1,
      newlyZeroMembers: 1,
    });
    expect(combat.individualLifecycleTransitionCount).toBe(1);
    expect(combat.totalIndividualLifecycleTransitionCount).toBe(1);
    expect(getUnitCohesion(combat.formationStore, 2))
      .toBeLessThan(initialTargetCohesion);
    expect(getIndividualCombatPressureInspection(
      combat.formationStore,
      combat.pressureStore,
      0,
    ).nearbyHostileCount).toBe(0);

    const downPosition = getIndividualDownPosition(
      combat.individualCasualtyLifecycleStore,
      targetEntityId,
    );
    expect(downPosition).toEqual({
      x: simulation.world.positionsX[targetEntityId],
      y: simulation.world.positionsY[targetEntityId],
    });
    const casualtyQueryOutput = [99];
    expect(queryIndividualCasualtiesWithinRadiusInto(
      combat.individualCasualtyLocalQueryStore,
      downPosition!.x,
      downPosition!.y,
      1,
      casualtyQueryOutput,
    )).toBe(casualtyQueryOutput);
    expect(casualtyQueryOutput).toEqual([targetEntityId]);

    const inspected = combat.debugSnapshot.inspectedIndividuals.find(
      (individual) => individual.entityId === targetEntityId,
    );
    expect(inspected).toMatchObject({
      casualtyProcedureKind: "barbarian",
      characterLifecycleState: "dying",
      playerPresenceState: "downedPresence",
    });

    const cohesionAfterZeroShock = getUnitCohesion(combat.formationStore, 2);
    const downedUnitAnchor = getUnitAnchor(combat.formationStore, 2);
    setIndividualPressure(combat.formationStore, targetEntityId, 1_000);
    combat.moraleMovementStates.set(2, "routing");
    advanceSimulationOneTick(simulation);

    expect(combat.individualLifecycleTransitions).toEqual([]);
    expect(combat.individualZeroHitTransitionCount).toBe(0);
    expect(combat.totalIndividualLifecycleTransitionCount).toBe(1);
    expect(combat.individualCombatConsequenceSummaries[1]
      ?.incomingZeroHitTransitions).toBe(0);
    expect(getUnitCohesion(combat.formationStore, 2))
      .toBe(cohesionAfterZeroShock);
    expect(getUnitAnchor(combat.formationStore, 2)).toEqual(downedUnitAnchor);
    expect(combat.moraleAssessments[1]).toMatchObject({
      pressureAverage: 0,
      pressureMaximum: 0,
    });
    expect(getPersistentUnitMorale(combat.persistentMoraleStore, 2)).toMatchObject({
      confidence: 0,
      experienceAdjustment: 0,
    });
    expect(combat.recoveryThreatSummaries[0]?.hostileNearby).toBe(false);
    expect(combat.routingContagionSummaries[0]).toMatchObject({
      nearbyRouterUnitIds: [],
      passThroughRouterUnitIds: [],
      pressureAppliedPerMember: 0,
    });
    expect(combat.routingContagionSummaries[1]).toMatchObject({
      nearbyRouterUnitIds: [],
      passThroughRouterUnitIds: [],
      pressureAppliedPerMember: 0,
    });
    expect(getSelectedTargetEntityId(
      combat.individualTargetSelectionStore,
      targetEntityId,
    )).toBe(-1);
    expect(getLockedAttackTargetEntityId(
      combat.individualCombatActionStore,
      targetEntityId,
    )).toBe(-1);
    expect(getIndividualCombatActionState(
      combat.individualCombatActionStore,
      targetEntityId,
    )).not.toBe("committingAttack");
    expect(combat.individualCombatPipelineBuffers.attackAttempts.some(
      (record) => record.attackerEntityId === targetEntityId,
    )).toBe(false);
    expect(combat.individualCombatPipelineBuffers.defenceRecords.some(
      (record) => record.defenderEntityId === targetEntityId,
    )).toBe(false);
    expect(simulation.world.positionsX[targetEntityId]).toBe(downPosition!.x);
    expect(simulation.world.positionsY[targetEntityId]).toBe(downPosition!.y);

    for (let tick = 0; tick < 30; tick += 1) {
      advanceSimulationOneTick(simulation);
    }
    expect([0, 1].some((entityId) =>
      simulation.world.positionsX[entityId]! > downPosition!.x,
    )).toBe(true);
    expect(simulation.world.positionsX[targetEntityId]).toBe(downPosition!.x);

    applyIndividualZeroHitLifecycleTransitions(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualCasualtyProcedureProfileStore,
      simulation.world,
      [{ entityId: 0, attackerEntityId: 1, previousHits: 1 }],
      simulation.tick,
    );
    prepareIndividualCasualtyLocalQuery(
      simulation.world,
      combat.individualCasualtyLifecycleStore,
      combat.individualCasualtyLocalQueryStore,
    );
    const preparationCount = getIndividualCasualtyLocalQueryPreparationCount(
      combat.individualCasualtyLocalQueryStore,
    );
    const firstQuery: number[] = [];
    const secondQuery: number[] = [];
    queryIndividualCasualtiesWithinRadiusInto(
      combat.individualCasualtyLocalQueryStore, 90, 60, 100, firstQuery,
    );
    queryIndividualCasualtiesWithinRadiusInto(
      combat.individualCasualtyLocalQueryStore, 90, 60, 100, secondQuery,
    );
    expect(firstQuery).toEqual([0, targetEntityId]);
    expect(secondQuery).toEqual(firstQuery);
    expect(getIndividualCasualtyLocalQueryPreparationCount(
      combat.individualCasualtyLocalQueryStore,
    )).toBe(preparationCount);
  });

  it("advances a fixed production death count before aggregation and terminalises the character once", () => {
    const scenario = productionTransitionScenario();
    const target = scenario.combatSandbox!.units[1]!;
    const shortScenario: SimulationScenario = {
      ...scenario,
      combatSandbox: {
      ...scenario.combatSandbox!,
      units: [
        scenario.combatSandbox!.units[0]!,
        {
          ...target,
          casualtyProcedure: {
            procedureKind: "barbarian",
            deathCountPolicy: { kind: "fixedTicks", durationTicks: 2 },
          },
        },
      ],
      },
    };
    const simulation = createSimulation(shortScenario);
    const combat = requireCombat(simulation);
    const targetEntityId = 2;

    while (combat.individualLifecycleTransitions.length === 0) {
      advanceSimulationOneTick(simulation);
    }
    const transitionTick = combat.individualLifecycleTransitions[0]!.tick;
    expect(combat.debugSnapshot.inspectedIndividuals[0]).toMatchObject({
      entityId: targetEntityId,
      characterLifecycleState: "dying",
      playerPresenceState: "downedPresence",
      deathCountDurationTicks: 2,
      deathCountRemainingTicks: 2,
      deathCountPaused: false,
      firstZeroHitTick: transitionTick,
      latestZeroHitTick: transitionTick,
      dyingTransitionCount: 1,
      terminalCause: "none",
    });

    advanceSimulationOneTick(simulation);
    expect(combat.debugSnapshot.inspectedIndividuals[0]).toMatchObject({
      characterLifecycleState: "dying",
      deathCountRemainingTicks: 1,
    });
    expect(combat.individualTerminalTransitions).toEqual([]);

    advanceSimulationOneTick(simulation);
    expect(combat.individualTerminalTransitions).toEqual([
      expect.objectContaining({
        entityId: targetEntityId,
        tick: transitionTick + 2,
        lifecycleState: "terminal",
        cause: "deathCountExpired",
      }),
    ]);
    expect(combat.individualCombatUnitSummaries[1]).toMatchObject({
      endOfTickCombatEligibleMemberCount: 0,
    });
    expect(combat.debugSnapshot.inspectedIndividuals[0]).toMatchObject({
      characterLifecycleState: "terminal",
      playerPresenceState: "downedPresence",
      deathCountRemainingTicks: 0,
      terminalTick: transitionTick + 2,
      terminalCause: "deathCountExpired",
    });
    expect(combat.individualTerminalTransitionCount).toBe(1);
    expect(combat.totalIndividualTerminalTransitionCount).toBe(1);

    advanceSimulationOneTick(simulation);
    expect(combat.individualTerminalTransitions).toEqual([]);
    expect(combat.totalIndividualTerminalTransitionCount).toBe(1);
  });

  it("expands trusted medical data and resolves a keyed zero-hit citizen trauma without changing casualty state", () => {
    const { simulation, transition } = findSuccessfulCitizenTraumaSimulation();
    const combat = requireCombat(simulation);
    const targetEntityId = 2;
    const attackerEntityId = transition.attackerEntityId;

    expect(getTrustedIndividualMedicalProfile(
      combat.trustedIndividualMedicalProfileStore,
      attackerEntityId,
    )).toMatchObject({
      hasPhysick: true,
      hasChirurgeon: true,
      startingGenericHerbs: 12,
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore,
      attackerEntityId,
    )).toEqual({ current: 12, maximum: 12, reserved: 0 });
    expect(combat.individualTraumaticWoundRecords).toEqual([
      expect.objectContaining({
        entityId: targetEntityId,
        attackerEntityId,
        tick: transition.tick,
        triggerKind: "zeroHit",
        episodeCount: 1,
      }),
    ]);
    expect(combat.individualTraumaticWoundRecords[0]!.roll).toBe(
      calculateTraumaticWoundOpportunityRoll(combat.battleSeed, {
        targetEntityId,
        attackerEntityId,
        tick: transition.tick,
        triggerKind: "zeroHit",
      }),
    );
    expect(getIndividualTraumaticWoundInspection(
      combat.individualTraumaticWoundStore,
      targetEntityId,
    )).toMatchObject({ state: "active", episodeCount: 1 });
    expect(getIndividualCurrentGlobalHits(
      combat.individualGlobalHitStore,
      targetEntityId,
    )).toBe(0);
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore,
      targetEntityId,
    )).toBe("dying");
    expect(combat.debugSnapshot.inspectedIndividuals[0]).toMatchObject({
      traumaticWoundState: "active",
      traumaticWoundEpisodeCount: 1,
      latestTraumaticWoundTick: transition.tick,
      latestTraumaticWoundTriggerKind: "zeroHit",
    });
  });
});

function productionTransitionScenario(): SimulationScenario {
  const target = {
    ...unit(2, 2, 1, 58, -1, "unarmed", "barbarian"),
    role: "veteran" as const,
    individualConfidence: 1_000,
  };
  return {
    seed: 0x6a02,
    entityCount: 3,
    bounds: { width: 180, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      inspectedEntityIds: [2],
      units: [
        unit(1, 1, 2, 50, 1, "oneHanded", "citizen"),
        target,
      ],
    },
  };
}

function findSuccessfulCitizenTraumaSimulation(): {
  readonly simulation: SimulationState;
  readonly transition: CombatSandboxSimulationState["individualLifecycleTransitions"][number];
} {
  for (let seed = 1; seed <= 200; seed += 1) {
    const base = productionTransitionScenario();
    const attacker = {
      ...base.combatSandbox!.units[0]!,
      medicalProfile: { hasPhysick: true, hasChirurgeon: true },
    };
    const target = {
      ...base.combatSandbox!.units[1]!,
      casualtyProcedure: {
        procedureKind: "citizen" as const,
        deathCountPolicy: { kind: "normalFortitude" as const },
      },
    };
    const simulation = createSimulation({
      ...base,
      seed,
      combatSandbox: {
        ...base.combatSandbox!,
        units: [attacker, target],
      },
    });
    const combat = requireCombat(simulation);
    for (let tick = 0; tick < 100; tick += 1) {
      advanceSimulationOneTick(simulation);
      if (combat.individualLifecycleTransitions.length === 0) continue;
      if (combat.individualTraumaticWoundRecords.length === 1) {
        return {
          simulation,
          transition: combat.individualLifecycleTransitions[0]!,
        };
      }
      break;
    }
  }
  throw new Error("Expected a production seed with a successful citizen trauma roll.");
}

function explicitProfileScenario(): SimulationScenario {
  return {
    seed: 0x6a03,
    entityCount: 3,
    bounds: { width: 240, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 7, 1, 30, 1, "unarmed", "citizen"),
        unit(2, 7, 1, 100, 1, "unarmed", "barbarian"),
        unit(3, 8, 1, 180, -1, "unarmed", "citizen"),
      ],
    },
  };
}

function unit(
  unitId: number,
  factionId: number,
  memberCount: number,
  x: number,
  headingX: -1 | 1,
  weaponCategory: "unarmed" | "oneHanded",
  procedureKind: "citizen" | "barbarian",
): CombatSandboxUnitScenario {
  return {
    unitId,
    factionId,
    memberCount,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x,
    anchorY: 60,
    headingX,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: memberCount,
    unitSpeed: weaponCategory === "oneHanded" ? 1 : 0,
    order: weaponCategory === "oneHanded" ? "advance" : "hold",
    role: "regular",
    memberMaxStep: 2,
    weaponCategory,
    weaponReachBand: weaponCategory === "oneHanded" ? "short" : "none",
    armourClass: "none",
    shieldClass: "none",
    attackIntervalTicks: 1,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: procedureKind === "citizen"
      ? { procedureKind, deathCountPolicy: { kind: "normalFortitude" } }
      : {
          procedureKind,
          deathCountPolicy: { kind: "fixedTicks", durationTicks: 600 },
        },
  };
}

function requireCombat(
  simulation: SimulationState,
): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected production combat sandbox.");
  }
  return simulation.combatSandbox;
}
