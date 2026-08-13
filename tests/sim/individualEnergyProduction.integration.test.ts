import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
import {
  getIndividualEnergyHistoryInspection,
  getIndividualEnergyInspection,
  getTrustedIndividualEnergyProfile,
  setIndividualCurrentEnergyForTrustedSetup,
} from "../../src/sim/individualEnergy";
import {
  getIndividualEnergyActivityInspection,
  getIndividualEnergyExpenditureInspection,
} from "../../src/sim/individualEnergyActivity";
import { getIndividualEnergyCapabilityInspection } from "../../src/sim/individualEnergyCapability";
import { getIndividualEnergyExertionModifierInspection } from "../../src/sim/individualEnergyExertionModifier";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
} from "../../src/sim/individualCasualtyLifecycle";
import { getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import { getIndividualCombatPressureInspection } from "../../src/sim/combatPressure";
import { getUnitEnergySummary } from "../../src/sim/unitEnergySummary";
import { getUnitEnergyBehaviourInspection } from "../../src/sim/unitEnergyBehaviour";
import {
  getUnitAnchor,
  type FormationTickResult,
} from "../../src/sim/formationBehaviour";
import {
  advanceCombatSandboxOneTick,
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
  it("rests a safe exhausted cautious unit and interrupts rest when a hostile approaches", () => {
    const source = createSmallBattleScenario({
      firstUnitEnergy: {
        maximumEnergy: 100,
        startingEnergy: 5,
        safeRestRecoveryPerTick: 5,
      },
    });
    const combat = source.combatSandbox!;
    const simulation = createSimulation({
      ...source,
      combatSandbox: {
        ...combat,
        units: combat.units.map((unit, index) => index === 0
          ? { ...unit, order: "advanceCautious" as const }
          : unit),
      },
    });
    const initialAnchor = getUnitAnchor(simulation.combatSandbox!.formationStore, 1);
    const initialPositions = simulation.world.positionsX.slice(0, 2);

    advanceSimulationOneTick(simulation);
    expect(getUnitEnergyBehaviourInspection(
      simulation.combatSandbox!.unitEnergyBehaviourStore,
      1,
    )).toMatchObject({ projectionTick: 0, resting: true });
    expect(getUnitAnchor(simulation.combatSandbox!.formationStore, 1)).toEqual(initialAnchor);
    expect(simulation.world.positionsX.slice(0, 2)).toEqual(initialPositions);
    expect(getUnitEnergySummary(simulation.combatSandbox!.unitEnergySummaryStore, 1))
      .toMatchObject({
        energyBehaviourRecommendation: "restWhenSafe",
        currentlyRestingMemberCount: 2,
        energyRecoveredThisTick: 4,
      });

    simulation.world.positionsX[2] = 90;
    simulation.world.positionsY[2] = 120;
    simulation.world.positionsX[3] = 92;
    simulation.world.positionsY[3] = 120;
    advanceSimulationOneTick(simulation);
    expect(getUnitEnergyBehaviourInspection(
      simulation.combatSandbox!.unitEnergyBehaviourStore,
      1,
    )).toMatchObject({ projectionTick: 1, resting: false });
  });

  it("supplies current energy capability to pressure and final unit summaries", () => {
    const simulation = createSimulation(createSmallBattleScenario({}));
    advanceSimulationOneTick(simulation);
    const combat = simulation.combatSandbox!;
    expect(getIndividualCombatPressureInspection(
      combat.formationStore,
      combat.pressureStore,
      0,
    )).toMatchObject({
      energyRecoveryMultiplierPercent: 100,
      energyCapabilityProjectionTickUsed: 0,
    });
    expect(getUnitEnergySummary(combat.unitEnergySummaryStore, 1))
      .toMatchObject({
        collectionTick: 0,
        activeMemberCount: 2,
        freshMemberCount: 2,
        jogCapableMemberCount: 2,
        sprintOrChargeCapableMemberCount: 2,
        dragCapableHelperCount: 2,
      });
  });

  it("instantiates the main battle's trusted explicit unit energy without inference", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    expect(simulation.trustedIndividualEnergyProfileStore.entityCount).toBe(44);
    expect(simulation.individualEnergyStore.entityCount).toBe(44);
    expect(simulation.combatSandbox!.trustedIndividualEnergyProfileStore)
      .toBe(simulation.trustedIndividualEnergyProfileStore);
    expect(simulation.combatSandbox!.individualEnergyStore)
      .toBe(simulation.individualEnergyStore);

    const expectedProfiles = [
      { end: 12, maximumEnergy: 22_000, safeRestRecoveryPerTick: 5 },
      { end: 24, maximumEnergy: 3_600, safeRestRecoveryPerTick: 8 },
      { end: 34, maximumEnergy: 15_000, safeRestRecoveryPerTick: 4 },
      { end: 44, maximumEnergy: 12_000, safeRestRecoveryPerTick: 5 },
    ] as const;
    for (let entityId = 0; entityId < 44; entityId += 1) {
      const expected = expectedProfiles.find(({ end }) => entityId < end)!;
      expect(getTrustedIndividualEnergyProfile(
        simulation.trustedIndividualEnergyProfileStore,
        entityId,
      )).toEqual({
        entityId,
        maximumEnergy: expected.maximumEnergy,
        startingEnergy: expected.maximumEnergy,
        safeRestRecoveryPerTick: expected.safeRestRecoveryPerTick,
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
        currentEnergy: 20_000,
        maximumEnergy: 20_000,
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
      currentEnergy: 20_000,
      maximumEnergy: 20_000,
      energyRatioFixedPoint: 10_000,
      energyBand: "fresh",
      safeRestRecoveryPerTick: 5,
      startingEnergy: 20_000,
      minimumEnergyReached: 20_000,
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
      energyCapabilitySourceEnergy: 20_000,
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

  it("replays deterministically while differing energy can now enforce movement", () => {
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
    expect(createPositionSnapshot(varied)).not.toEqual(createPositionSnapshot(first));
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
    expect(gameplayDigest(varied)).not.toEqual(gameplayDigest(first));
    const history = getIndividualEnergyHistoryInspection(
      varied.individualEnergyStore,
      0,
    );
    expect(history.startingEnergy).toBe(19_000);
    expect(history.minimumEnergyReached).toBeLessThan(19_000);
    expect(history.totalEnergySpent).toBeGreaterThan(0);
  });

  it("temporarily rests a safe critical advance with distinct inspection", () => {
    const fresh = createSimulation(createSmallBattleScenario({}));
    const spent = createSimulation(createSmallBattleScenario({
      firstUnitEnergy: {
        maximumEnergy: 100,
        startingEnergy: 0,
        safeRestRecoveryPerTick: 0,
      },
    }));
    const freshAdapter = fresh.combatSandbox!.formationEnergyGaitCapabilities;
    const spentAdapter = spent.combatSandbox!.formationEnergyGaitCapabilities;
    advanceSimulationOneTick(fresh);
    advanceSimulationOneTick(spent);

    const freshInspection = createPositionSnapshot(fresh).combatDebug!
      .inspectedIndividuals[0]!;
    const spentInspection = createPositionSnapshot(spent).combatDebug!
      .inspectedIndividuals[0]!;
    expect(spentInspection).toMatchObject({
      formationRequestedPhysicalGait: "stationary",
      formationEffectivePhysicalGait: "stationary",
      formationGaitReducedByCapability: false,
      formationEnergyGaitProjectionTickUsed: 0,
      formationPreEnergyStepX: expect.any(Number),
      formationPreEnergyStepY: expect.any(Number),
      formationPostEnergyStepX: expect.any(Number),
      formationPostEnergyStepY: expect.any(Number),
      formationMovementReducedByEnergy: false,
      energyRequestedPhysicalGait: "stationary",
      energyActualPhysicalGait: "stationary",
      energyMovementExpenditureRequestedThisTick: 0,
    });
    expect(freshInspection).toMatchObject({
      formationRequestedPhysicalGait: "jogging",
      formationEffectivePhysicalGait: "jogging",
      formationGaitReducedByCapability: false,
      energyActualPhysicalGait: "jogging",
      energyMovementExpenditureRequestedThisTick: 5,
    });
    expect(Array.from(fresh.world.positionsX)).not.toEqual(Array.from(spent.world.positionsX));
    expect(gameplayDigest(spent)).not.toEqual(gameplayDigest(fresh));
    expect(fresh.combatSandbox!.formationEnergyGaitCapabilities).toBe(freshAdapter);
    expect(spent.combatSandbox!.formationEnergyGaitCapabilities).toBe(spentAdapter);
    expect(freshAdapter.entityCount).toBe(4);
    expect(spentAdapter.entityCount).toBe(4);
    expect(freshAdapter.projectionTick).toBe(0);
    expect(spentAdapter.projectionTick).toBe(0);
    advanceSimulationOneTick(fresh);
    advanceSimulationOneTick(spent);
    expect(fresh.combatSandbox!.formationEnergyGaitCapabilities).toBe(freshAdapter);
    expect(spent.combatSandbox!.formationEnergyGaitCapabilities).toBe(spentAdapter);
    expect(freshAdapter.projectionTick).toBe(1);
    expect(spentAdapter.projectionTick).toBe(1);
  });

  it("uses the lower median for a mixed-energy production formation anchor", () => {
    const source = createSmallBattleScenario({});
    const combat = source.combatSandbox!;
    const scenario: SimulationScenario = {
      ...source,
      entityCount: 5,
      combatSandbox: {
        ...combat,
        inspectedEntityIds: [0, 1, 2, 3],
        units: combat.units.map((unit, unitIndex) => unitIndex === 0
          ? {
              ...unit,
              memberCount: 4,
              rows: 1,
              cols: 4,
              unitSpeed: 2,
              ordinaryPhysicalGait: "jogging" as const,
              memberMaxStep: 2,
              ...(unit.memberProfiles === undefined
                ? {}
                : {
                    memberProfiles: Array.from(
                      { length: 4 },
                      (_, memberIndex) => unit.memberProfiles![
                        memberIndex % unit.memberProfiles!.length
                      ]!,
                    ),
                  }),
            }
          : {
              ...unit,
              memberCount: 1,
              rows: 1,
              cols: 1,
              order: "hold" as const,
              ...(unit.memberProfiles === undefined
                ? {}
                : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
            }),
      },
    };
    const run = (spentEntityIds: readonly number[]) => {
      const simulation = createSimulation(scenario);
      for (const entityId of spentEntityIds) {
        setIndividualCurrentEnergyForTrustedSetup(
          simulation.individualEnergyStore,
          entityId,
          0,
        );
      }
      advanceSimulationOneTick(simulation);
      return createPositionSnapshot(simulation).combatDebug!.units[0]!;
    };

    expect(run([0])).toMatchObject({
      requestedUnitPhysicalGait: "jogging",
      effectiveAnchorPhysicalGait: "jogging",
      eligibleEnergyGaitMemberCount: 4,
      walkingEffectiveMemberCount: 1,
      joggingEffectiveMemberCount: 3,
      preEnergyAnchorStep: 2,
      postEnergyAnchorStep: 2,
      anchorMovementReducedByEnergy: false,
      anchorEnergyPolicyApplied: true,
    });
    expect(run([0, 1])).toMatchObject({
      requestedUnitPhysicalGait: "walking",
      effectiveAnchorPhysicalGait: "walking",
      eligibleEnergyGaitMemberCount: 4,
      walkingEffectiveMemberCount: 4,
      joggingEffectiveMemberCount: 0,
      preEnergyAnchorStep: 2,
      postEnergyAnchorStep: 1,
      anchorMovementReducedByEnergy: true,
      anchorEnergyPolicyApplied: true,
    });
  });

  it("uses following-tick reserve policy for jog then voluntary walking", () => {
    const source = createSmallBattleScenario({});
    const combat = source.combatSandbox!;
    const simulation = createSimulation({
      ...source,
      entityCount: 2,
      combatSandbox: {
        ...combat,
        inspectedEntityIds: [0],
        units: combat.units.map((unit, index) => index === 0
          ? {
              ...unit,
              memberCount: 1,
              deploymentZone: { minX: 80, maxX: 80, minY: 120, maxY: 120 },
              anchorX: 80,
              anchorY: 120,
              rows: 1,
              cols: 1,
              unitSpeed: 4,
              ordinaryPhysicalGait: "sprinting" as const,
              memberMaxStep: 4,
              energyProfile: {
                maximumEnergy: 96,
                startingEnergy: 80,
                safeRestRecoveryPerTick: 0,
              },
              ...(unit.memberProfiles === undefined
                ? {}
                : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
            }
          : {
              ...unit,
              memberCount: 1,
              deploymentZone: { minX: 420, maxX: 420, minY: 120, maxY: 120 },
              anchorX: 420,
              anchorY: 120,
              rows: 1,
              cols: 1,
              order: "hold" as const,
              memberMaxStep: 1,
              ...(unit.memberProfiles === undefined
                ? {}
                : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
            }),
      },
    });

    const expected = [
      { tick: 0, energy: 80, band: "fresh", gait: "jogging", cost: 5, step: 2 },
      { tick: 1, energy: 57, band: "working", gait: "jogging", cost: 5, step: 2 },
      { tick: 2, energy: 19, band: "winded", gait: "walking", cost: 0, step: 1 },
      { tick: 3, energy: 9, band: "spent", gait: "walking", cost: 0, step: 1 },
    ] as const;
    for (const row of expected) {
      setIndividualCurrentEnergyForTrustedSetup(
        simulation.individualEnergyStore,
        0,
        row.energy,
        row.tick,
      );
      advanceSimulationOneTick(simulation);
      const inspected = createPositionSnapshot(simulation).combatDebug!
        .inspectedIndividuals[0]!;
      expect(inspected).toMatchObject({
        energyCapabilityProjectionTick: row.tick,
        energyCapabilitySourceBand: row.band,
        formationRequestedPhysicalGait: row.gait,
        formationEffectivePhysicalGait: row.gait,
        formationPostEnergyStepX: row.step,
        energyRequestedPhysicalGait: row.gait,
        energyActualPhysicalGait: row.gait,
        energyMovementExpenditureRequestedThisTick: row.cost,
      });
    }
  });

  it("enforces and charges the following-tick routing gait through sprint, jog and walk", () => {
    const createRoutingSimulation = (startingEnergy: number) => {
      const source = createSmallBattleScenario({});
      const combat = source.combatSandbox!;
      return createSimulation({
        ...source,
        entityCount: 2,
        combatSandbox: {
          ...combat,
          inspectedEntityIds: [0],
          units: combat.units.map((unit, unitIndex) => unitIndex === 0
            ? {
                ...unit,
                memberCount: 1,
                deploymentZone: { minX: 80, maxX: 80, minY: 120, maxY: 120 },
                anchorX: 80,
                anchorY: 120,
                rows: 1,
                cols: 1,
                unitSpeed: 4,
                ordinaryPhysicalGait: "sprinting" as const,
                memberMaxStep: 4,
                energyProfile: {
                  maximumEnergy: 96,
                  startingEnergy,
                  safeRestRecoveryPerTick: 0,
                },
                ...(unit.memberProfiles === undefined
                  ? {}
                  : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
              }
            : {
                ...unit,
                memberCount: 1,
                deploymentZone: { minX: 420, maxX: 420, minY: 120, maxY: 120 },
                anchorX: 420,
                anchorY: 120,
                rows: 1,
                cols: 1,
                order: "hold" as const,
                memberMaxStep: 1,
                ...(unit.memberProfiles === undefined
                  ? {}
                  : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
              }),
        },
      });
    };

    const simulation = createRoutingSimulation(58);
    for (const expected of [
      { tick: 0, band: "fresh", gait: "sprinting", step: 4, cost: 24 },
      { tick: 1, band: "working", gait: "sprinting", step: 4, cost: 24 },
      { tick: 2, band: "winded", gait: "jogging", step: 2, cost: 5 },
      { tick: 3, band: "spent", gait: "walking", step: 1, cost: 0 },
    ] as const) {
      simulation.combatSandbox!.moraleMovementStates.set(1, "routing");
      advanceSimulationOneTick(simulation);
      const snapshot = createPositionSnapshot(simulation).combatDebug!;
      const inspected = snapshot.inspectedIndividuals[0]!;
      expect(inspected).toMatchObject({
        energyCapabilityProjectionTick: expected.tick,
        energyCapabilitySourceBand: expected.band,
        formationRequestedPhysicalGait: "sprinting",
        formationEffectivePhysicalGait: expected.gait,
        formationPostEnergyStepX: -expected.step,
        energyRequestedPhysicalGait: expected.gait,
        energyActualPhysicalGait: expected.gait,
        energyPhysicalGaitSource: "routingMovement",
        energyMovementExpenditureRequestedThisTick: expected.cost,
      });
      expect(snapshot.units[0]).toMatchObject({
        requestedUnitPhysicalGait: "sprinting",
        effectiveAnchorPhysicalGait: expected.gait,
        postEnergyAnchorStep: expected.step,
        anchorEnergyPolicyApplied: true,
      });
    }

    const working = createRoutingSimulation(30);
    working.combatSandbox!.moraleMovementStates.set(1, "routing");
    advanceSimulationOneTick(working);
    expect(createPositionSnapshot(working).combatDebug!.inspectedIndividuals[0])
      .toMatchObject({
        energyCapabilitySourceBand: "working",
        formationRequestedPhysicalGait: "sprinting",
        formationEffectivePhysicalGait: "sprinting",
        energyActualPhysicalGait: "sprinting",
        energyMovementExpenditureRequestedThisTick: 24,
      });

    const empty = createRoutingSimulation(0);
    empty.combatSandbox!.moraleMovementStates.set(1, "routing");
    const beforeX = empty.world.positionsX[0]!;
    advanceSimulationOneTick(empty);
    const inspected = createPositionSnapshot(empty).combatDebug!
      .inspectedIndividuals[0]!;
    expect(empty.world.positionsX[0]).toBe(beforeX - 1);
    expect(inspected).toMatchObject({
      formationRequestedPhysicalGait: "sprinting",
      formationEffectivePhysicalGait: "walking",
      energyRequestedPhysicalGait: "walking",
      energyActualPhysicalGait: "walking",
      energyMovementExpenditureRequestedThisTick: 0,
    });
  });

  it("replays mixed ordinary, routing, energy and world-edge enforcement canonically", () => {
    const sourceUnits = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!.units;
    const memberProfiles = (
      source: CombatSandboxUnitScenario,
      steps: readonly number[],
    ) => Array.from({ length: 4 }, (_, memberIndex) => ({
      ...(source.memberProfiles?.[
        memberIndex % (source.memberProfiles?.length ?? 1)
      ] ?? {}),
      memberMaxStep: steps[memberIndex]!,
    }));
    const scenario: SimulationScenario = {
      seed: 0x7c_02ff,
      entityCount: 8,
      bounds: { width: 180, height: 80 },
      minSpeedUnitsPerTick: 1,
      maxSpeedUnitsPerTick: 1,
      energyProfile: {
        maximumEnergy: 100,
        startingEnergy: 100,
        safeRestRecoveryPerTick: 0,
      },
      combatSandbox: {
        kind: "liveCombatSandbox",
        appliedDamagePressureScale: 1,
        inspectedEntityIds: [0, 1, 2, 3, 4, 5, 6, 7],
        units: [
          {
            ...sourceUnits[0]!,
            unitId: 1,
            factionId: 1,
            memberCount: 4,
            deploymentZone: { minX: 0, maxX: 0, minY: 28, maxY: 40 },
            anchorX: 0,
            anchorY: 36,
            headingX: -1,
            headingY: 0,
            rows: 2,
            cols: 2,
            spacing: 4,
            unitSpeed: 4,
            ordinaryPhysicalGait: "sprinting",
            order: "advance",
            memberMaxStep: 4,
            energyProfile: {
              maximumEnergy: 100,
              startingEnergy: 100,
              safeRestRecoveryPerTick: 0,
            },
            memberProfiles: memberProfiles(sourceUnits[0]!, [1, 2, 3, 4]),
          },
          {
            ...sourceUnits[2]!,
            unitId: 2,
            factionId: 2,
            memberCount: 4,
            deploymentZone: { minX: 160, maxX: 160, minY: 28, maxY: 40 },
            anchorX: 160,
            anchorY: 36,
            headingX: 1,
            headingY: 0,
            rows: 2,
            cols: 2,
            spacing: 4,
            unitSpeed: 4,
            ordinaryPhysicalGait: "sprinting",
            order: "advance",
            memberMaxStep: 4,
            energyProfile: {
              maximumEnergy: 100,
              startingEnergy: 100,
              safeRestRecoveryPerTick: 0,
            },
            memberProfiles: memberProfiles(sourceUnits[2]!, [4, 3, 2, 1]),
            casualtyProcedure: {
              procedureKind: "citizen",
              deathCountPolicy: { kind: "normalFortitude" },
            },
          },
        ],
      },
    };

    const run = () => {
      const simulation = createSimulation(scenario);
      for (let unitOffset = 0; unitOffset < 2; unitOffset += 1) {
        for (const [memberIndex, currentEnergy] of [100, 45, 20, 5].entries()) {
          setIndividualCurrentEnergyForTrustedSetup(
            simulation.individualEnergyStore,
            unitOffset * 4 + memberIndex,
            currentEnergy,
          );
        }
      }
      const ticks: unknown[] = [];
      for (let tick = 0; tick < 8; tick += 1) {
        const combat = simulation.combatSandbox!;
        combat.moraleMovementStates.set(2, "routing");
        let formationResult: FormationTickResult | undefined;
        advanceCombatSandboxOneTick(
          simulation.world,
          combat,
          simulation.tick,
          {
            runStage<T>(stage: string, execute: () => T): T {
              const result = execute();
              if (stage === "formation") {
                formationResult = result as FormationTickResult;
              }
              return result;
            },
          },
        );
        simulation.tick += 1;
        const snapshot = createPositionSnapshot(simulation).combatDebug!;
        ticks.push({
          positionsX: Array.from(simulation.world.positionsX),
          positionsY: Array.from(simulation.world.positionsY),
          anchors: [getUnitAnchor(combat.formationStore, 1),
            getUnitAnchor(combat.formationStore, 2)],
          units: snapshot.units.map((unit) => ({
            movementStyle: unit.movementStyle,
            requested: unit.requestedUnitPhysicalGait,
            effective: unit.effectiveAnchorPhysicalGait,
            pre: unit.preEnergyAnchorStep,
            post: unit.postEnergyAnchorStep,
            reduced: unit.anchorMovementReducedByEnergy,
          })),
          individuals: snapshot.inspectedIndividuals.map((individual) => ({
            id: individual.entityId,
            requested: individual.formationRequestedPhysicalGait,
            effective: individual.formationEffectivePhysicalGait,
            actual: individual.energyActualPhysicalGait,
            preX: individual.formationPreEnergyStepX,
            preY: individual.formationPreEnergyStepY,
            postX: individual.formationPostEnergyStepX,
            postY: individual.formationPostEnergyStepY,
            expenditure: individual.energyMovementExpenditureRequestedThisTick,
            energy: individual.currentEnergy,
            band: individual.energyBand,
            capabilityBand: individual.energyCapabilitySourceBand,
          })),
          formationEvents: formationResult?.events.map((event) => ({ ...event })),
          passThrough: formationResult?.routingPassThroughInteractions.map(
            (interaction) => ({ ...interaction }),
          ),
          morale: [...combat.moraleMovementStates.entries()]
            .sort((left, right) => left[0] - right[0]),
          lifecycle: Array.from(
            { length: simulation.world.entityCount },
            (_, entityId) => getIndividualCharacterLifecycleState(
              combat.individualCasualtyLifecycleStore,
              entityId,
            ),
          ),
          casualty: combat.individualCasualtyUnitSummaries.map(
            (summary) => ({ ...summary }),
          ),
        });
      }
      return ticks;
    };

    const first = run();
    expect(first).toEqual(run());
    expect(first).toHaveLength(8);
    const canonical = first as Array<{
      readonly individuals: ReadonlyArray<{
        readonly id: number;
        readonly band: string | undefined;
        readonly capabilityBand: string | undefined;
      }>;
    }>;
    const observedBands = new Set(
      canonical.flatMap((tick) => tick.individuals.map((individual) =>
        individual.capabilityBand)),
    );
    expect(observedBands).toEqual(new Set([
      "fresh", "working", "winded", "spent",
    ]));
    expect(new Set(canonical.map((tick) =>
      tick.individuals.find((individual) => individual.id === 4)?.band,
    )).size).toBeGreaterThan(1);
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
        const expenditure = getIndividualEnergyExpenditureInspection(
          simulation.combatSandbox!.individualEnergyActivityStore,
          entityId,
        );
        expect(activity.movementExpenditureRequested).toBe(Math.ceil(
          4 * expenditure.burdenExertionMultiplierPercent / 100,
        ));
      }
    }
    expect(movingCitizenCount).toBeGreaterThan(0);
  });

  it("retains a blocked advance request while classifying its actual gait as stationary", () => {
    const source = createSmallBattleScenario({});
    const combat = source.combatSandbox!;
    const simulation = createSimulation({
      ...source,
      entityCount: 2,
      combatSandbox: {
        ...combat,
        inspectedEntityIds: [0, 1],
        units: combat.units.map((unit, index) => index === 0
          ? {
              ...unit,
              memberCount: 1,
              deploymentZone: { minX: 100, maxX: 100, minY: 120, maxY: 120 },
              anchorX: 100,
              anchorY: 120,
              rows: 1,
              cols: 1,
              memberMaxStep: 1,
              ...(unit.memberProfiles === undefined
                ? {}
                : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
            }
          : {
              ...unit,
              memberCount: 1,
              deploymentZone: { minX: 101, maxX: 101, minY: 120, maxY: 120 },
              anchorX: 101,
              anchorY: 120,
              rows: 1,
              cols: 1,
              memberMaxStep: 1,
              order: "hold",
              ...(unit.memberProfiles === undefined
                ? {}
                : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
            }),
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

  it("keeps an outward ordinary advance bounded and uncharged", () => {
    const source = createSmallBattleScenario({});
    const combat = source.combatSandbox!;
    const simulation = createSimulation({
      ...source,
      entityCount: 2,
      combatSandbox: {
        ...combat,
        inspectedEntityIds: [0],
        units: combat.units.map((unit, unitIndex) => unitIndex === 0
          ? {
              ...unit,
              memberCount: 1,
              deploymentZone: { minX: 0, maxX: 0, minY: 120, maxY: 120 },
              anchorX: 0,
              anchorY: 120,
              headingX: -1,
              rows: 1,
              cols: 1,
              unitSpeed: 2,
              ordinaryPhysicalGait: "jogging" as const,
              memberMaxStep: 2,
              ...(unit.memberProfiles === undefined
                ? {}
                : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
            }
          : {
              ...unit,
              memberCount: 1,
              deploymentZone: { minX: 420, maxX: 420, minY: 120, maxY: 120 },
              anchorX: 420,
              anchorY: 120,
              rows: 1,
              cols: 1,
              order: "hold" as const,
              ...(unit.memberProfiles === undefined
                ? {}
                : { memberProfiles: unit.memberProfiles.slice(0, 1) }),
            }),
      },
    });
    advanceSimulationOneTick(simulation);

    expect(simulation.world.positionsX[0]).toBe(0);
    expect(createPositionSnapshot(simulation).combatDebug!.inspectedIndividuals[0])
      .toMatchObject({
        formationRequestedPhysicalGait: "jogging",
        formationEffectivePhysicalGait: "jogging",
        formationPreEnergyStepX: 0,
        formationPostEnergyStepX: 0,
        energyRequestedPhysicalGait: "jogging",
        energyActualPhysicalGait: "stationary",
        energyGaitProducedDisplacement: false,
        energyMovementExpenditureRequestedThisTick: 0,
      });
  });

  it("charges recovering slot correction as walking only when it displaces", () => {
    const run = (initialX: number) => {
      const source = createSmallBattleScenario({
        scenarioEnergy: {
          maximumEnergy: 100,
          startingEnergy: 15,
          safeRestRecoveryPerTick: 0,
        },
      });
      const combat = source.combatSandbox!;
      const units = combat.units.map((unit, unitIndex) => {
        const { memberProfiles: _memberProfiles, ...base } = unit;
        return unitIndex === 0
          ? {
              ...base,
              memberCount: 1,
              deploymentZone: {
                minX: initialX,
                maxX: initialX,
                minY: 120,
                maxY: 120,
              },
              anchorX: 100,
              anchorY: 120,
              rows: 1,
              cols: 1,
              unitSpeed: 4,
              ordinaryPhysicalGait: "sprinting" as const,
              order: "advance" as const,
              memberMaxStep: 4,
            }
          : {
              ...base,
              memberCount: 1,
              deploymentZone: {
                minX: 420,
                maxX: 420,
                minY: 120,
                maxY: 120,
              },
              anchorX: 420,
              anchorY: 120,
              rows: 1,
              cols: 1,
              order: "hold" as const,
            };
      });
      const simulation = createSimulation({
        ...source,
        entityCount: 2,
        combatSandbox: {
          ...combat,
          inspectedEntityIds: [0],
          units,
        },
      });
      simulation.combatSandbox!.moraleMovementStates.set(1, "recovering");
      advanceSimulationOneTick(simulation);
      return {
        anchor: getUnitAnchor(simulation.combatSandbox!.formationStore, 1),
        positionX: simulation.world.positionsX[0],
        inspection: createPositionSnapshot(simulation).combatDebug!
          .inspectedIndividuals[0],
      };
    };

    const displaced = run(80);
    expect(displaced.anchor).toEqual({ x: 100, y: 120 });
    expect(displaced.positionX).toBe(81);
    expect(displaced.inspection).toMatchObject({
      formationRequestedPhysicalGait: "walking",
      formationEffectivePhysicalGait: "walking",
      energyActualPhysicalGait: "walking",
      energyMovementExpenditureRequestedThisTick: 0,
    });

    const aligned = run(100);
    expect(aligned.anchor).toEqual({ x: 100, y: 120 });
    expect(aligned.positionX).toBe(100);
    expect(aligned.inspection).toMatchObject({
      formationRequestedPhysicalGait: "walking",
      formationEffectivePhysicalGait: "walking",
      energyActualPhysicalGait: "stationary",
      energyMovementExpenditureRequestedThisTick: 0,
    });
  });

  it("applies final current-tick activity without feeding energy back into behaviour", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    const observed = new Set<string>();
    let sawWalkingRespawnEgress = false;
    for (let tick = 0; tick < 400; tick += 1) {
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
          expect(activity.movementExpenditureRequested).toBe(0);
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
    const specialistAdapter = simulation.combatSandbox!
      .specialistPhysicalGaitAdapter;
    expect(Object.isFrozen(specialistAdapter)).toBe(true);
    expect(specialistAdapter.entityCount).toBe(simulation.world.entityCount);
    for (let expectedTick = 0; expectedTick < 5; expectedTick += 1) {
      advanceSimulationOneTick(simulation);
      expect(simulation.combatSandbox!.specialistPhysicalGaitAdapter)
        .toBe(specialistAdapter);
      expect(specialistAdapter.acceptedProjectionTick).toBe(expectedTick);
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
      const exertion = getIndividualEnergyExertionModifierInspection(
        simulation.combatSandbox!.individualEnergyExertionModifierStore,
        0,
      );
      expect(exertion.projectionTick).toBe(expectedTick);
      expect(exertion.currentGlobalHits).toBeGreaterThanOrEqual(0);
      expect(exertion.currentGlobalHits).toBeLessThanOrEqual(
        exertion.maximumGlobalHits,
      );
      expect(getIndividualEnergyExpenditureInspection(
        simulation.combatSandbox!.individualEnergyActivityStore,
        0,
      ).exertionModifierProjectionTickUsed).toBe(expectedTick);
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
      energyEffectivePhysicalGait: expect.any(String),
      energyActualPhysicalGait: expect.any(String),
      energyGaitReducedByCapability: expect.any(Boolean),
      energyCapabilityProjectionTick: expect.any(Number),
      energyCapabilitySourceEnergy: expect.any(Number),
      energyCapabilitySourceBand: expect.any(String),
      energyMaximumOrdinaryGait: expect.any(String),
      energyMaximumRoutingGait: expect.any(String),
      energyMaximumActiveSpecialistGait: expect.any(String),
      energyMaximumRespawnEgressGait: expect.any(String),
      energyCanInitiateOrdinarySprintOrCharge: expect.any(Boolean),
      energyMinimumSafeWalkAvailable: expect.any(Boolean),
      energyAttackImpulsesThisTick: expect.any(Number),
      energyDefenceImpulsesThisTick: expect.any(Number),
      energyMovementOccurredThisTick: expect.any(Boolean),
      energyExternallyMovedThisTick: expect.any(Boolean),
      energyMovementExpenditureRequestedThisTick: expect.any(Number),
      energyMovementBaseExpenditureThisTick: expect.any(Number),
      energyDragSurchargeThisTick: expect.any(Number),
      energyArmourBurdenPoints: expect.any(Number),
      energyHeldShieldBurdenPoints: expect.any(Number),
      energyPrimaryWeaponBurdenPoints: expect.any(Number),
      energyTotalBurdenPoints: expect.any(Number),
      energyBurdenExertionMultiplierPercent: expect.any(Number),
      energyMissingGlobalHitsAtProjection: expect.any(Number),
      energyInjuryExertionMultiplierPercent: expect.any(Number),
      energyAttackExpenditureRequestedThisTick: expect.any(Number),
      energyAttackBaseExpenditureThisTick: expect.any(Number),
      energyDefenceExpenditureRequestedThisTick: expect.any(Number),
      energyDefenceBaseExpenditureThisTick: expect.any(Number),
      energyTotalExpenditureRequestedThisTick: expect.any(Number),
      energyExpenditureAppliedThisTick: expect.any(Number),
      energyExertionModifierProjectionTickUsed: expect.any(Number),
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
  const { energyProfile: inheritedMainBattleEnergyProfile, ...sourceWithoutEnergyProfile } =
    source;
  void inheritedMainBattleEnergyProfile;
  return {
    ...sourceWithoutEnergyProfile,
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
