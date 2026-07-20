import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import {
  DEFAULT_MAXIMUM_ENERGY,
  DEFAULT_SAFE_REST_RECOVERY_PER_TICK,
  DEFAULT_STARTING_ENERGY,
  getIndividualEnergyHistoryInspection,
  getIndividualEnergyInspection,
  getTrustedIndividualEnergyProfile,
} from "../../src/sim/individualEnergy";
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
    expect(getIndividualEnergyHistoryInspection(varied.individualEnergyStore, 0))
      .toMatchObject({
        startingEnergy: 19_000,
        minimumEnergyReached: 19_000,
        totalEnergySpent: 0,
        totalEnergyRecovered: 0,
      });
  });
});

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
