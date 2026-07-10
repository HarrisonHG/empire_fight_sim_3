import { createCombatSurvivabilityStore } from "../../../src/sim/combatSurvivability";
import { createCombatTempoStore } from "../../../src/sim/combatTempo";
import {
  createFormationBehaviourStore,
  type IndividualBehaviourConfig,
  type UnitFormationConfig,
} from "../../../src/sim/formationBehaviour";
import type { WorldState } from "../../../src/sim/types";
import { createUnitIdentityStore } from "../../../src/sim/unitIdentity";
import {
  createUnitLoadoutStore,
  type ArmourClass,
  type ShieldClass,
  type WeaponReachBand,
} from "../../../src/sim/unitLoadout";
import type {
  CombatReplayHarnessConfig,
  CombatReplayIndividualDefinition,
  CombatReplayScenarioDefinition,
  CombatReplaySetup,
  CombatReplayUnitDefinition,
} from "./combatReplayTypes";

const DEFAULT_BOUNDS = { width: 360, height: 220 } as const;
const DEFAULT_SPACING = 10;
const DEFAULT_Y = 110;
const DEFAULT_RNG_SEED = 0x4201;

export const COMBAT_REPLAY_SCENARIOS: readonly CombatReplayScenarioDefinition[] =
  [
    {
      id: "no-engagement",
      name: "No engagement",
      description:
        "Hostile target is outside threat range; the pipeline produces no records.",
      tickCount: 4,
      setup: () =>
        createTwoUnitScenario({
          sourceX: 80,
          targetX: 180,
          sourceReach: "short",
          sourceOrder: "hold",
          sourceInitialCooldownTicks: 1,
        }),
    },
    {
      id: "threatening-only",
      name: "Threatening only",
      description:
        "Hostile target is inside threat range but outside contact range.",
      tickCount: 4,
      setup: () =>
        createTwoUnitScenario({
          sourceX: 100,
          targetX: 108,
          sourceReach: "short",
          sourceOrder: "hold",
          sourceInitialCooldownTicks: 1,
        }),
    },
    {
      id: "contacting-not-engaged",
      name: "Contacting, not engaged",
      description:
        "Hostile target is in contact range, but the source remains orderedHalt.",
      tickCount: 4,
      setup: () =>
        createTwoUnitScenario({
          sourceX: 100,
          targetX: 104,
          sourceReach: "short",
          sourceOrder: "hold",
          sourceInitialCooldownTicks: 1,
        }),
    },
    {
      id: "engage-front-cooldown",
      name: "Engage front cooldown",
      description:
        "Formation creates engageFront and the attack cooldown visibly counts down.",
      tickCount: 11,
      setup: () =>
        createTwoUnitScenario({
          sourceX: 100,
          targetX: 110,
          sourceReach: "long",
          sourceOrder: "advance",
        }),
    },
    {
      id: "strike-and-damage",
      name: "Strike and damage",
      description:
        "Initial cooldown is ready, producing one opportunity, strike, and damage application.",
      tickCount: 3,
      setup: () =>
        createTwoUnitScenario({
          sourceX: 100,
          targetX: 110,
          sourceReach: "long",
          sourceOrder: "advance",
          sourceInitialCooldownTicks: 1,
        }),
    },
    {
      id: "armour-shield-absorbs",
      name: "Armour and shield absorbs",
      description:
        "A strike is recorded, but medium armour plus shield absorbs the current damage value.",
      tickCount: 3,
      setup: () =>
        createTwoUnitScenario({
          sourceX: 100,
          targetX: 110,
          sourceReach: "long",
          sourceOrder: "advance",
          sourceInitialCooldownTicks: 1,
          targetArmourClass: "medium",
          targetShieldClass: "shield",
        }),
    },
    {
      id: "capacity-reached-marker",
      name: "Capacity reached marker",
      description:
        "Low target capacity shows capacityReached while entity membership stays stable.",
      tickCount: 3,
      setup: () =>
        createTwoUnitScenario({
          sourceX: 100,
          targetX: 110,
          sourceReach: "long",
          sourceOrder: "advance",
          sourceInitialCooldownTicks: 1,
          targetMaxDamageCapacity: 1,
        }),
    },
    {
      id: "multi-pair-determinism",
      name: "Multi-pair determinism",
      description:
        "Two independent pairs produce deterministic target ordering in pipeline records.",
      tickCount: 3,
      setup: () => createMultiPairScenario(),
    },
  ];

interface TwoUnitScenarioOptions {
  readonly sourceX: number;
  readonly targetX: number;
  readonly sourceReach: WeaponReachBand;
  readonly sourceOrder: "hold" | "advance";
  readonly sourceInitialCooldownTicks?: number;
  readonly targetArmourClass?: ArmourClass;
  readonly targetShieldClass?: ShieldClass;
  readonly targetMaxDamageCapacity?: number;
}

function createTwoUnitScenario(
  options: TwoUnitScenarioOptions,
): CombatReplaySetup {
  const units: readonly CombatReplayUnitDefinition[] = [
    replayUnit({
      unitId: 10,
      factionId: 1,
      memberEntityIds: [0],
      label: "Source",
      side: "source",
      anchorX: options.sourceX,
      anchorY: DEFAULT_Y,
      headingX: 1,
      headingY: 0,
      order: options.sourceOrder,
      weaponReachBand: options.sourceReach,
    }),
    replayUnit({
      unitId: 20,
      factionId: 2,
      memberEntityIds: [1],
      label: "Target",
      side: "target",
      anchorX: options.targetX,
      anchorY: DEFAULT_Y,
      headingX: -1,
      headingY: 0,
      order: "hold",
      weaponReachBand: "none",
      ...(options.targetArmourClass !== undefined
        ? { armourClass: options.targetArmourClass }
        : {}),
      ...(options.targetShieldClass !== undefined
        ? { shieldClass: options.targetShieldClass }
        : {}),
    }),
  ];

  return createReplaySetup({
    bounds: DEFAULT_BOUNDS,
    entityCount: 2,
    replayUnits: units,
    replayIndividuals: [
      replayIndividual({ entityId: 0, unitId: 10 }),
      replayIndividual({ entityId: 1, unitId: 20 }),
    ],
    identity: {
      entityCount: 2,
      units: units.map((unit) => ({
        unitId: unit.unitId,
        factionId: unit.factionId,
        memberEntityIds: unit.memberEntityIds,
      })),
    },
    loadout: {
      entityCount: 2,
      units: units.map((unit) => ({
        unitId: unit.unitId,
        ...(unit.weaponReachBand !== undefined
          ? { weaponReachBand: unit.weaponReachBand }
          : {}),
        ...(unit.armourClass !== undefined
          ? { armourClass: unit.armourClass }
          : {}),
        ...(unit.shieldClass !== undefined
          ? { shieldClass: unit.shieldClass }
          : {}),
      })),
    },
    formation: {
      entityCount: 2,
      rngSeed: DEFAULT_RNG_SEED,
      units: units.map(stripReplayUnitFields),
      individuals: [
        stripReplayIndividualFields(replayIndividual({ entityId: 0, unitId: 10 })),
        stripReplayIndividualFields(replayIndividual({ entityId: 1, unitId: 20 })),
      ],
    },
    tempo: {
      entityCount: 2,
      units:
        options.sourceInitialCooldownTicks !== undefined
          ? [
              {
                unitId: 10,
                initialCooldownTicks: options.sourceInitialCooldownTicks,
              },
            ]
          : [],
    },
    survivability: {
      entityCount: 2,
      units:
        options.targetMaxDamageCapacity !== undefined
          ? [
              {
                unitId: 20,
                maxDamageCapacity: options.targetMaxDamageCapacity,
              },
            ]
          : [],
    },
    initialPositions: [
      { entityId: 0, x: options.sourceX, y: DEFAULT_Y },
      { entityId: 1, x: options.targetX, y: DEFAULT_Y },
    ],
  });
}

function createMultiPairScenario(): CombatReplaySetup {
  const units: readonly CombatReplayUnitDefinition[] = [
    replayUnit({
      unitId: 10,
      factionId: 1,
      memberEntityIds: [0],
      label: "Source A",
      side: "source",
      anchorX: 80,
      anchorY: DEFAULT_Y,
      headingX: 1,
      headingY: 0,
      order: "advance",
      weaponReachBand: "long",
    }),
    replayUnit({
      unitId: 20,
      factionId: 2,
      memberEntityIds: [1],
      label: "Target A",
      side: "target",
      anchorX: 90,
      anchorY: DEFAULT_Y,
      headingX: -1,
      headingY: 0,
      order: "hold",
      weaponReachBand: "none",
    }),
    replayUnit({
      unitId: 30,
      factionId: 1,
      memberEntityIds: [2],
      label: "Source B",
      side: "source",
      anchorX: 200,
      anchorY: DEFAULT_Y,
      headingX: 1,
      headingY: 0,
      order: "advance",
      weaponReachBand: "long",
    }),
    replayUnit({
      unitId: 40,
      factionId: 2,
      memberEntityIds: [3],
      label: "Target B",
      side: "target",
      anchorX: 210,
      anchorY: DEFAULT_Y,
      headingX: -1,
      headingY: 0,
      order: "hold",
      weaponReachBand: "none",
    }),
  ];
  const individuals = [
    replayIndividual({ entityId: 0, unitId: 10 }),
    replayIndividual({ entityId: 1, unitId: 20 }),
    replayIndividual({ entityId: 2, unitId: 30 }),
    replayIndividual({ entityId: 3, unitId: 40 }),
  ];

  return createReplaySetup({
    bounds: DEFAULT_BOUNDS,
    entityCount: 4,
    replayUnits: units,
    replayIndividuals: individuals,
    identity: {
      entityCount: 4,
      units: units.map((unit) => ({
        unitId: unit.unitId,
        factionId: unit.factionId,
        memberEntityIds: unit.memberEntityIds,
      })),
    },
    loadout: {
      entityCount: 4,
      units: units.map((unit) => ({
        unitId: unit.unitId,
        ...(unit.weaponReachBand !== undefined
          ? { weaponReachBand: unit.weaponReachBand }
          : {}),
      })),
    },
    formation: {
      entityCount: 4,
      rngSeed: DEFAULT_RNG_SEED,
      units: units.map(stripReplayUnitFields),
      individuals: individuals.map(stripReplayIndividualFields),
    },
    tempo: {
      entityCount: 4,
      units: [
        { unitId: 10, initialCooldownTicks: 1 },
        { unitId: 30, initialCooldownTicks: 1 },
      ],
    },
    survivability: {
      entityCount: 4,
      units: [],
    },
    initialPositions: [
      { entityId: 0, x: 80, y: DEFAULT_Y },
      { entityId: 1, x: 90, y: DEFAULT_Y },
      { entityId: 2, x: 200, y: DEFAULT_Y },
      { entityId: 3, x: 210, y: DEFAULT_Y },
    ],
  });
}

function createReplaySetup(config: CombatReplayHarnessConfig): CombatReplaySetup {
  const world: WorldState = {
    entityCount: config.entityCount,
    bounds: config.bounds,
    ids: Uint32Array.from(
      { length: config.entityCount },
      (_, index) => index,
    ),
    positionsX: new Int32Array(config.entityCount),
    positionsY: new Int32Array(config.entityCount),
    velocitiesX: new Int32Array(config.entityCount),
    velocitiesY: new Int32Array(config.entityCount),
  };

  for (const position of config.initialPositions) {
    world.positionsX[position.entityId] = position.x;
    world.positionsY[position.entityId] = position.y;
  }

  const identity = createUnitIdentityStore(config.identity);
  const loadout = createUnitLoadoutStore(identity, config.loadout);
  const formation = createFormationBehaviourStore(identity, config.formation);
  const tempo = createCombatTempoStore(identity, config.tempo);
  const survivability = createCombatSurvivabilityStore(
    identity,
    config.survivability,
  );

  return {
    world,
    identity,
    loadout,
    formation,
    tempo,
    survivability,
    units: config.replayUnits,
    individuals: config.replayIndividuals,
  };
}

function replayUnit(
  unit: Omit<
    CombatReplayUnitDefinition,
    "spacing" | "rows" | "cols" | "unitSpeed"
  > & {
    readonly spacing?: number;
    readonly rows?: number;
    readonly cols?: number;
    readonly unitSpeed?: number;
  },
): CombatReplayUnitDefinition {
  return {
    spacing: unit.spacing ?? DEFAULT_SPACING,
    rows: unit.rows ?? 1,
    cols: unit.cols ?? unit.memberEntityIds.length,
    unitSpeed: unit.unitSpeed ?? 0,
    ...unit,
  };
}

function replayIndividual(options: {
  readonly entityId: number;
  readonly unitId: number;
}): CombatReplayIndividualDefinition {
  return {
    entityId: options.entityId,
    unitId: options.unitId,
    role: "regular",
    slotRow: 0,
    slotCol: 0,
    memberMaxStep: 0,
  };
}

function stripReplayUnitFields(
  unit: CombatReplayUnitDefinition,
): UnitFormationConfig {
  return {
    unitId: unit.unitId,
    anchorX: unit.anchorX,
    anchorY: unit.anchorY,
    headingX: unit.headingX,
    headingY: unit.headingY,
    spacing: unit.spacing,
    rows: unit.rows,
    cols: unit.cols,
    unitSpeed: unit.unitSpeed,
    order: unit.order,
    ...(unit.cohesion !== undefined ? { cohesion: unit.cohesion } : {}),
    ...(unit.behaviourProfile !== undefined
      ? { behaviourProfile: unit.behaviourProfile }
      : {}),
  };
}

function stripReplayIndividualFields(
  individual: CombatReplayIndividualDefinition,
): IndividualBehaviourConfig {
  return {
    entityId: individual.entityId,
    role: individual.role,
    slotRow: individual.slotRow,
    slotCol: individual.slotCol,
    memberMaxStep: individual.memberMaxStep,
    ...(individual.pressure !== undefined
      ? { pressure: individual.pressure }
      : {}),
    ...(individual.confidence !== undefined
      ? { confidence: individual.confidence }
      : {}),
  };
}
