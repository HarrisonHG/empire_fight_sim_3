import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import {
  DEFAULT_MAXIMUM_ENERGY,
  DEFAULT_SAFE_REST_RECOVERY_PER_TICK,
  DEFAULT_STARTING_ENERGY,
  getIndividualEnergyHistoryInspection,
  getIndividualEnergyInspection,
  getTrustedIndividualEnergyProfile,
} from "../../src/sim/individualEnergy";
import { getIndividualEnergyActivityInspection } from "../../src/sim/individualEnergyActivity";
import { getIndividualEnergyCapabilityInspection } from "../../src/sim/individualEnergyCapability";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
} from "../../src/sim/individualCasualtyLifecycle";
import { getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import { getIndividualCombatPressureInspection } from "../../src/sim/combatPressure";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
} from "../../src/sim/types";

describe("Milestone 7A production energy integration", () => {
  it("instantiates trusted default energy for every production entity without inference", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    expect(simulation.trustedIndividualEnergyProfileStore.entityCount).toBe(44);
    expect(simulation.individualEnergyStore.entityCount).toBe(44);
    expect(simulation.combatSandbox!.trustedIndividualEnergyProfileStore)
      .toBe(simulation.trustedIndividualEnergyProfileStore);
    expect(simulation.combatSandbox!.individualEnergyStore)
      .toBe(simulation.individualEnergyStore);

    for (let entityId = 0; entityId < 44; entityId += 1) {
      expect(getTrustedIndividualEnergyProfile(
        simulation.trustedIndividualEnergyProfileStore,
        entityId,
      )).toEqual({
        entityId,
        maximumEnergy: DEFAULT_MAXIMUM_ENERGY,
        startingEnergy: DEFAULT_STARTING_ENERGY,
        safeRestRecoveryPerTick: DEFAULT_SAFE_REST_RECOVERY_PER_TICK,
      });
    }
  });

  it("merges scenario energy configuration with deterministic unit overrides", () => {
    const scenario = createSmallBattleScenario({
      scenarioEnergy: {
        maximumEnergy: 12_000,
        startingEnergy: 9_000,
        safeRestRecoveryPerTick: 7,
      },
      firstUnitEnergy: {
        startingEnergy: 6_000,
        safeRestRecoveryPerTick: 3,
      },
    });
    const simulation = createSimulation(scenario);
    expect(getTrustedIndividualEnergyProfile(
      simulation.trustedIndividualEnergyProfileStore,
      0,
    )).toMatchObject({
      maximumEnergy: 12_000,
      startingEnergy: 6_000,
      safeRestRecoveryPerTick: 3,
    });
    expect(getTrustedIndividualEnergyProfile(
      simulation.trustedIndividualEnergyProfileStore,
      1,
    )).toMatchObject({
      maximumEnergy: 12_000,
      startingEnergy: 6_000,
      safeRestRecoveryPerTick: 3,
    });
    expect(getTrustedIndividualEnergyProfile(
      simulation.trustedIndividualEnergyProfileStore,
      2,
    )).toMatchObject({
      maximumEnergy: 12_000,
      startingEnergy: 9_000,
      safeRestRecoveryPerTick: 7,
    });
  });

  it("defaults standalone simulations and does not spend or recover on production ticks", () => {
    const simulation = createSimulation({
      seed: 7,
      entityCount: 3,
      bounds: { width: 100, height: 100 },
      minSpeedUnitsPerTick: 1,
      maxSpeedUnitsPerTick: 2,
    });
    for (let index = 0; index < 100; index += 1) {
      advanceSimulationOneTick(simulation);
    }
    for (let entityId = 0; entityId < 3; entityId += 1) {
      expect(getIndividualEnergyInspection(
        simulation.trustedIndividualEnergyProfileStore,
        simulation.individualEnergyStore,
        entityId,
      )).toMatchObject({
        currentEnergy: 10_000,
        maximumEnergy: 10_000,
        band: "fresh",
        totalEnergySpent: 0,
        totalEnergyRecovered: 0,
      });
    }
  });

  it("exposes bounded energy fields through the existing inspected-entity path", () => {
    const simulation = createSimulation(createSmallBattleScenario({}));
    const inspected = createInitialSnapshot(simulation).combatDebug!
      .inspectedIndividuals;
    expect(inspected).toHaveLength(4);
    expect(inspected[0]).toMatchObject({
      currentEnergy: 10_000,
      maximumEnergy: 10_000,
      energyRatioFixedPoint: 10_000,
      energyBand: "fresh",
      safeRestRecoveryPerTick: 5,
      startingEnergy: 10_000,
      minimumEnergyReached: 10_000,
      firstWindedTick: null,
      firstSpentTick: null,
      totalEnergySpent: 0,
      totalEnergyRecovered: 0,
    });
  });

  it("previews real initial capability without pretending a production tick projected it", () => {
    const simulation = createSimulation(createSmallBattleScenario({}));
    const inspected = createInitialSnapshot(simulation).combatDebug!
      .inspectedIndividuals[0]!;
    expect(inspected).toMatchObject({
      energyCapabilityProjectionTick: null,
      energyCapabilitySourceEnergy: 10_000,
      energyCapabilitySourceBand: "fresh",
      energyMaximumOrdinaryGait: "sprinting",
      energyMaximumRoutingGait: "sprinting",
      energyCanInitiateOrdinarySprintOrCharge: true,
      energyMinimumSafeWalkAvailable: true,
    });

    advanceSimulationOneTick(simulation);
    expect(getIndividualEnergyCapabilityInspection(
      simulation.combatSandbox!.individualEnergyCapabilityStore,
      0,
    ).projectionTick).toBe(0);
  });

  it("replays deterministically and differing energy values cannot change 7A gameplay", () => {
    const defaultScenario = createSmallBattleScenario({ inspect: false });
    const variedScenario = createSmallBattleScenario({
      inspect: false,
      scenarioEnergy: {
        maximumEnergy: 37,
        startingEnergy: 3,
        safeRestRecoveryPerTick: 29,
      },
      firstUnitEnergy: {
        maximumEnergy: 20_000,
        startingEnergy: 19_000,
        safeRestRecoveryPerTick: 0,
      },
    });
    const first = createSimulation(defaultScenario);
    const replay = createSimulation(defaultScenario);
    const varied = createSimulation(variedScenario);

    for (let tick = 0; tick < 200; tick += 1) {
      advanceSimulationOneTick(first);
      advanceSimulationOneTick(replay);
      advanceSimulationOneTick(varied);
    }

    expect(createPositionSnapshot(first)).toEqual(createPositionSnapshot(replay));
    expect(createPositionSnapshot(varied)).toEqual(createPositionSnapshot(first));
    for (let entityId = 0; entityId < first.world.entityCount; entityId += 1) {
      expect(getIndividualEnergyHistoryInspection(
        first.individualEnergyStore,
        entityId,
      )).toEqual(getIndividualEnergyHistoryInspection(
        replay.individualEnergyStore,
        entityId,
      ));
      expect(getIndividualEnergyActivityInspection(
        first.combatSandbox!.individualEnergyActivityStore,
        entityId,
      )).toEqual(getIndividualEnergyActivityInspection(
        replay.combatSandbox!.individualEnergyActivityStore,
        entityId,
      ));
    }
    expect(gameplayDigest(varied)).toEqual(gameplayDigest(first));
    const history = getIndividualEnergyHistoryInspection(
      varied.individualEnergyStore,
      0,
    );
    expect(history.startingEnergy).toBe(19_000);
    expect(history.minimumEnergyReached).toBeLessThan(19_000);
    expect(history.totalEnergySpent).toBeGreaterThan(0);
  });
});

describe("Milestone 7B-1 production activity observation", () => {
  it("charges main-battle ordinary advance as jogging from unit speed, not member correction speed", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    advanceSimulationOneTick(simulation);

    let movingCitizenCount = 0;
    for (let entityId = 0; entityId < 12; entityId += 1) {
      const activity = getIndividualEnergyActivityInspection(
        simulation.combatSandbox!.individualEnergyActivityStore,
        entityId,
      );
      expect(activity.requestedPhysicalGait).toBe("jogging");
      if (activity.gaitProducedDisplacement) {
        movingCitizenCount += 1;
        expect(activity.actualPhysicalGait).toBe("jogging");
        expect(activity.movementExpenditureRequested).toBe(8);
      }
    }
    expect(movingCitizenCount).toBeGreaterThan(0);
  });

  it("retains a blocked advance request while classifying its actual gait as stationary", () => {
    const source = createSmallBattleScenario({});
    const combat = source.combatSandbox!;
    const simulation = createSimulation({
      ...source,
      combatSandbox: {
        ...combat,
        units: combat.units.map((unit, index) => index === 0
          ? { ...unit, memberMaxStep: 0 }
          : unit),
      },
    });
    advanceSimulationOneTick(simulation);

    const activity = getIndividualEnergyActivityInspection(
      simulation.combatSandbox!.individualEnergyActivityStore,
      0,
    );
    expect(activity.requestedPhysicalGait).toBe("jogging");
    expect(activity.actualPhysicalGait).toBe("stationary");
    expect(activity.gaitProducedDisplacement).toBe(false);
    expect(activity.movementExpenditureRequested).toBe(0);
  });

  it("applies final current-tick activity without feeding energy back into behaviour", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    const observed = new Set<string>();
    let sawWalkingRespawnEgress = false;
    for (let tick = 0; tick < 130; tick += 1) {
      advanceSimulationOneTick(simulation);
      for (let entityId = 0; entityId < simulation.world.entityCount; entityId += 1) {
        const activity = getIndividualEnergyActivityInspection(
          simulation.combatSandbox!.individualEnergyActivityStore,
          entityId,
        );
        observed.add(activity.dominantContext);
        if (entityId === 19 &&
            activity.physicalGaitSource === "respawnEgress" &&
            activity.gaitProducedDisplacement) {
          expect(activity.actualPhysicalGait).toBe("walking");
          expect(activity.movementExpenditureRequested).toBe(1);
          sawWalkingRespawnEgress = true;
        }
      }
    }
    for (const context of [
      "downedRest",
      "medicalApproach",
      "dragging",
      "beingDragged",
      "treating",
      "underTreatment",
      "executionCommitment",
      "respawnEgress",
      "waitingAtRespawn",
      "inactiveTerminal",
    ]) expect(observed.has(context)).toBe(true);
    expect(sawWalkingRespawnEgress).toBe(true);
    let totalSpent = 0;
    for (let entityId = 0; entityId < simulation.world.entityCount; entityId += 1) {
      const energy = getIndividualEnergyInspection(
        simulation.trustedIndividualEnergyProfileStore,
        simulation.individualEnergyStore,
        entityId,
      );
      expect(energy.currentEnergy).toBeGreaterThanOrEqual(0);
      expect(energy.currentEnergy).toBeLessThanOrEqual(energy.maximumEnergy);
      totalSpent += energy.totalEnergySpent;
    }
    expect(totalSpent).toBeGreaterThan(0);
  }, 15_000);

  it("completes observation, classification and application for every combat tick", () => {
    const simulation = createSimulation(createSmallBattleScenario({}));
    for (let expectedTick = 0; expectedTick < 5; expectedTick += 1) {
      advanceSimulationOneTick(simulation);
      const phase = getIndividualEnergyActivityInspection(
        simulation.combatSandbox!.individualEnergyActivityStore,
        0,
      );
      expect({
        observed: phase.observedTick,
        classified: phase.classificationTick,
        applied: phase.applicationTick,
      }).toEqual({
        observed: expectedTick,
        classified: expectedTick,
        applied: expectedTick,
      });
      const capability = simulation.combatSandbox!
        .individualEnergyCapabilityStore;
      const capabilityInspection = getIndividualEnergyCapabilityInspection(
        capability,
        0,
      );
      expect(capabilityInspection.projectionTick).toBe(expectedTick);
      expect(capabilityInspection.sourceEnergy).toBe(phase.energyBefore);
    }
  });

  it("carries bounded activity fields through existing inspected snapshots", () => {
    const simulation = createSimulation(createSmallBattleScenario({}));
    advanceSimulationOneTick(simulation);
    const inspected = createInitialSnapshot(simulation).combatDebug!
      .inspectedIndividuals[0]!;
    expect(inspected).toMatchObject({
      energyActivityContext: expect.any(String),
      energyDisplacementX: expect.any(Number),
      energyDisplacementY: expect.any(Number),
      energyMovementDistanceSquared: expect.any(Number),
      energyMovementIntensity: expect.any(String),
      energyRequestedPhysicalGait: expect.any(String),
      energyActualPhysicalGait: expect.any(String),
      energyCapabilityProjectionTick: expect.any(Number),
      energyCapabilitySourceEnergy: expect.any(Number),
      energyCapabilitySourceBand: expect.any(String),
      energyMaximumOrdinaryGait: expect.any(String),
      energyMaximumRoutingGait: expect.any(String),
      energyCanInitiateOrdinarySprintOrCharge: expect.any(Boolean),
      energyMinimumSafeWalkAvailable: expect.any(Boolean),
      energyAttackImpulsesThisTick: expect.any(Number),
      energyDefenceImpulsesThisTick: expect.any(Number),
      energyMovementOccurredThisTick: expect.any(Boolean),
      energyExternallyMovedThisTick: expect.any(Boolean),
      energyMovementExpenditureRequestedThisTick: expect.any(Number),
      energyAttackExpenditureRequestedThisTick: expect.any(Number),
      energyDefenceExpenditureRequestedThisTick: expect.any(Number),
      energyTotalExpenditureRequestedThisTick: expect.any(Number),
      energyExpenditureAppliedThisTick: expect.any(Number),
      energyRecoveryRequestedThisTick: expect.any(Number),
      energyRecoveryAppliedThisTick: expect.any(Number),
      energyBeforeThisTick: expect.any(Number),
      energyAfterThisTick: expect.any(Number),
      energyExpenditureClampedThisTick: expect.any(Boolean),
      energyRecoveryClampedThisTick: expect.any(Boolean),
    });
  });

  it("cannot alter global hits or lifecycle while applying movement expenditure", () => {
    const simulation = createSimulation(createSmallBattleScenario({}));
    const combat = simulation.combatSandbox!;
    const hitsBefore = Array.from({ length: simulation.world.entityCount },
      (_, entityId) => getIndividualCurrentGlobalHits(
        combat.individualGlobalHitStore,
        entityId,
      ));
    const lifecycleBefore = Array.from({ length: simulation.world.entityCount },
      (_, entityId) => getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore,
        entityId,
      ));
    advanceSimulationOneTick(simulation);
    expect(Array.from({ length: simulation.world.entityCount },
      (_, entityId) => getIndividualCurrentGlobalHits(
        combat.individualGlobalHitStore,
        entityId,
      ))).toEqual(hitsBefore);
    expect(Array.from({ length: simulation.world.entityCount },
      (_, entityId) => getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore,
        entityId,
      ))).toEqual(lifecycleBefore);
  });
});

function gameplayDigest(simulation: ReturnType<typeof createSimulation>) {
  const combat = simulation.combatSandbox!;
  return {
    positions: Array.from(createPositionSnapshot(simulation).positions),
    hits: Array.from({ length: simulation.world.entityCount }, (_, entityId) =>
      getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId)),
    lifecycle: Array.from({ length: simulation.world.entityCount }, (_, entityId) =>
      getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore,
        entityId,
      )),
    presence: Array.from({ length: simulation.world.entityCount }, (_, entityId) =>
      getIndividualPlayerPresenceState(
        combat.individualPlayerPresenceStore,
        entityId,
      )),
    moraleMovementStates: [...combat.moraleMovementStates.entries()]
      .sort((left, right) => left[0] - right[0]),
    pressure: Array.from(
      { length: simulation.world.entityCount },
      (_, entityId) => getIndividualCombatPressureInspection(
        combat.formationStore,
        combat.pressureStore,
        entityId,
      ),
    ),
    combatTotals: {
      attacks: combat.totalIndividualAttackAttemptCount,
      hitLoss: combat.totalIndividualAppliedHitLoss,
      zeroHits: combat.totalIndividualZeroHitTransitionCount,
      lifecycleTransitions: combat.totalIndividualLifecycleTransitionCount,
      terminalTransitions: combat.totalIndividualTerminalTransitionCount,
    },
    casualtySummaries: combat.individualCasualtyUnitSummaries,
  };
}

interface SmallBattleOptions {
  readonly scenarioEnergy?: SimulationScenario["energyProfile"];
  readonly firstUnitEnergy?: CombatSandboxUnitScenario["energyProfile"];
  readonly inspect?: boolean;
}

function createSmallBattleScenario(
  options: SmallBattleOptions,
): SimulationScenario {
  const sourceUnits = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!.units;
  const citizen = smallUnit(sourceUnits[0]!, {
    unitId: 1,
    factionId: 1,
    anchorX: 80,
    deploymentMinX: 70,
    deploymentMaxX: 90,
    headingX: 1,
    ...(options.firstUnitEnergy === undefined
      ? {}
      : { energyProfile: options.firstUnitEnergy }),
  });
  const barbarian = smallUnit(sourceUnits[2]!, {
    unitId: 2,
    factionId: 2,
    anchorX: 420,
    deploymentMinX: 410,
    deploymentMaxX: 430,
    headingX: -1,
  });
  return {
    seed: 0x7a_0001,
    entityCount: 4,
    bounds: { width: 500, height: 240 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    ...(options.scenarioEnergy === undefined
      ? {}
      : { energyProfile: options.scenarioEnergy }),
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 2,
      inspectedEntityIds: options.inspect === false ? [] : [0, 1, 2, 3],
      units: [citizen, barbarian],
    },
  };
}

interface SmallUnitOptions {
  readonly unitId: number;
  readonly factionId: number;
  readonly anchorX: number;
  readonly deploymentMinX: number;
  readonly deploymentMaxX: number;
  readonly headingX: -1 | 1;
  readonly energyProfile?: CombatSandboxUnitScenario["energyProfile"];
}

function smallUnit(
  source: CombatSandboxUnitScenario,
  options: SmallUnitOptions,
): CombatSandboxUnitScenario {
  return {
    ...source,
    unitId: options.unitId,
    factionId: options.factionId,
    memberCount: 2,
    deploymentZone: {
      minX: options.deploymentMinX,
      maxX: options.deploymentMaxX,
      minY: 110,
      maxY: 130,
    },
    anchorX: options.anchorX,
    anchorY: 120,
    headingX: options.headingX,
    rows: 1,
    cols: 2,
    ...(source.memberProfiles === undefined
      ? {}
      : { memberProfiles: source.memberProfiles.slice(0, 2) }),
    casualtyProcedure: options.factionId === 1
      ? {
          procedureKind: "citizen",
          deathCountPolicy: { kind: "normalFortitude" },
        }
      : {
          procedureKind: "barbarian",
          deathCountPolicy: { kind: "fixedTicks", durationTicks: 1_200 },
          respawnDestination: { x: 480, y: 120 },
        },
    ...(options.energyProfile === undefined
      ? {}
      : { energyProfile: options.energyProfile }),
  };
}
