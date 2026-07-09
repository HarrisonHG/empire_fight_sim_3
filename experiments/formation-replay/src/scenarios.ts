import {
  createFormationBehaviourStore,
  type FormationBehaviourConfig,
  type IndividualBehaviourConfig,
  type UnitFormationConfig,
} from "../../../src/sim/formationBehaviour";
import type { WorldState } from "../../../src/sim/types";
import { createUnitIdentityStore } from "../../../src/sim/unitIdentity";
import type {
  FormationReplayHarnessConfig,
  FormationReplayIndividualDefinition,
  FormationReplayScenario,
  FormationReplaySetup,
  FormationReplayUnitDefinition,
} from "./replayTypes";

const DEFAULT_BOUNDS = { width: 240, height: 180 } as const;

export const FORMATION_REPLAY_SCENARIOS: readonly FormationReplayScenario[] = [
  {
    id: "formedMarch-column",
    name: "formedMarch column",
    description: "Anchor advances and members stay in a simple column.",
    tickCount: 18,
    setup: () =>
      createSingleUnitScenario({
        entityCount: 3,
        units: [
          {
            unitId: 1,
            factionId: 1,
            memberEntityIds: [0, 1, 2],
            anchorX: 70,
            anchorY: 90,
            headingX: 1,
            headingY: 0,
            spacing: 12,
            rows: 3,
            cols: 1,
            unitSpeed: 2,
            order: "advance",
          },
        ],
        individuals: [
          unitMember(0, 1, 0, 0, 3),
          unitMember(1, 1, 1, 0, 3),
          unitMember(2, 1, 2, 0, 3),
        ],
        initialPositions: [
          { entityId: 0, x: 70, y: 90 },
          { entityId: 1, x: 58, y: 90 },
          { entityId: 2, x: 46, y: 90 },
        ],
      }),
  },
  {
    id: "orderedHalt",
    name: "orderedHalt",
    description: "Explicit hold order keeps the anchor fixed.",
    tickCount: 8,
    setup: () =>
      createSingleUnitScenario({
        entityCount: 1,
        units: [
          {
            unitId: 1,
            factionId: 1,
            memberEntityIds: [0],
            anchorX: 90,
            anchorY: 90,
            headingX: 1,
            headingY: 0,
            spacing: 12,
            rows: 1,
            cols: 1,
            unitSpeed: 4,
            order: "hold",
          },
        ],
        individuals: [unitMember(0, 1, 0, 0, 3)],
        initialPositions: [{ entityId: 0, x: 90, y: 90 }],
      }),
  },
  {
    id: "haltAndWait-allied-blocker",
    name: "haltAndWait allied blocker",
    description: "Low-confidence source waits behind an allied blocker.",
    tickCount: 8,
    setup: () =>
      createBlockerScenario({
        relationship: "allied",
        sourceConfidence: 100,
        sourcePressure: 4_000,
        sourceStartX: 109,
      }),
  },
  {
    id: "engageFront-hostile-blocker",
    name: "engageFront hostile blocker",
    description: "Hostile front contact positioning without combat output.",
    tickCount: 8,
    setup: () => createBlockerScenario({ relationship: "hostile" }),
  },
  {
    id: "formedDetour-centred-blocker",
    name: "formedDetour centred blocker",
    description: "Cohesive source sidesteps laterally as one unit.",
    tickCount: 20,
    setup: () => createLateralBlockerScenario({ sourceCols: 3 }),
  },
  {
    id: "formedDetour-edge-fallback",
    name: "formedDetour edge fallback",
    description: "Detour chooses the in-bounds lateral side near an edge.",
    tickCount: 8,
    setup: () =>
      createLateralBlockerScenario({
        bounds: { width: 200, height: 160 },
        sourceAnchorY: 0,
        blockerAnchorY: 0,
        sourceCols: 1,
      }),
  },
  {
    id: "looseFlow-low-cohesion-bypass",
    name: "looseFlow low cohesion bypass",
    description: "Low-cohesion members loosen laterally around an ally.",
    tickCount: 12,
    setup: () =>
      createLateralBlockerScenario({
        sourceCols: 3,
        sourceCohesion: 200,
        sourceConfidence: 500,
      }),
  },
  {
    id: "pushThrough-disruption",
    name: "pushThrough disruption",
    description: "Source advances through an ally and both units are disrupted.",
    tickCount: 8,
    setup: () =>
      createBlockerScenario({
        relationship: "allied",
        sourceCohesion: 600,
        sourceConfidence: 950,
        blockerCohesion: 700,
      }),
  },
];

interface SingleUnitScenarioConfig {
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly entityCount: number;
  readonly units: readonly FormationReplayUnitDefinition[];
  readonly individuals: readonly FormationReplayIndividualDefinition[];
  readonly initialPositions: ReadonlyArray<{
    readonly entityId: number;
    readonly x: number;
    readonly y: number;
  }>;
}

function createSingleUnitScenario(
  config: SingleUnitScenarioConfig,
): FormationReplaySetup {
  return createReplaySetup({
    bounds: config.bounds ?? DEFAULT_BOUNDS,
    entityCount: config.entityCount,
    identity: {
      entityCount: config.entityCount,
      units: config.units.map((unit) => ({
        unitId: unit.unitId,
        factionId: unit.factionId,
        memberEntityIds: unit.memberEntityIds,
      })),
    },
    formation: {
      entityCount: config.entityCount,
      rngSeed: 0x2d00,
      units: config.units.map(stripReplayUnitFields),
      individuals: config.individuals.map(stripReplayIndividualFields),
    },
    initialPositions: config.initialPositions,
  });
}

interface BlockerScenarioOptions {
  readonly relationship: "allied" | "hostile";
  readonly sourceConfidence?: number;
  readonly sourceCohesion?: number;
  readonly sourcePressure?: number;
  readonly blockerCohesion?: number;
  readonly sourceStartX?: number;
}

function createBlockerScenario(
  options: BlockerScenarioOptions,
): FormationReplaySetup {
  const sourceX = options.sourceStartX ?? 100;
  return createReplaySetup({
    bounds: DEFAULT_BOUNDS,
    entityCount: 2,
    identity: {
      entityCount: 2,
      units: [
        { unitId: 1, factionId: 1, memberEntityIds: [0] },
        {
          unitId: 2,
          factionId: options.relationship === "allied" ? 1 : 2,
          memberEntityIds: [1],
        },
      ],
    },
    formation: {
      entityCount: 2,
      rngSeed: 0x2d01,
      units: [
        {
          unitId: 1,
          anchorX: 100,
          anchorY: 90,
          headingX: 1,
          headingY: 0,
          spacing: 12,
          rows: 1,
          cols: 1,
          unitSpeed: 1,
          order: "advance",
          cohesion: options.sourceCohesion ?? 1_000,
        },
        {
          unitId: 2,
          anchorX: 116,
          anchorY: 90,
          headingX: -1,
          headingY: 0,
          spacing: 12,
          rows: 1,
          cols: 1,
          unitSpeed: 0,
          order: "hold",
          cohesion: options.blockerCohesion ?? 1_000,
        },
      ],
      individuals: [
        {
          entityId: 0,
          role: "regular",
          slotRow: 0,
          slotCol: 0,
          memberMaxStep: 2,
          confidence: options.sourceConfidence ?? 500,
          pressure: options.sourcePressure ?? 0,
        },
        {
          entityId: 1,
          role: "regular",
          slotRow: 0,
          slotCol: 0,
          memberMaxStep: 0,
        },
      ],
    },
    initialPositions: [
      { entityId: 0, x: sourceX, y: 90 },
      { entityId: 1, x: 116, y: 90 },
    ],
  });
}

interface LateralBlockerScenarioOptions {
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly sourceAnchorY?: number;
  readonly blockerAnchorY?: number;
  readonly sourceCols: number;
  readonly sourceCohesion?: number;
  readonly sourceConfidence?: number;
}

function createLateralBlockerScenario(
  options: LateralBlockerScenarioOptions,
): FormationReplaySetup {
  const bounds = options.bounds ?? DEFAULT_BOUNDS;
  const sourceAnchorX = 100;
  const sourceAnchorY = options.sourceAnchorY ?? 90;
  const blockerAnchorX = 116;
  const blockerAnchorY = options.blockerAnchorY ?? 90;
  const spacing = 12;
  const sourceMembers = Array.from(
    { length: options.sourceCols },
    (_, index) => index,
  );
  const blockerEntityId = options.sourceCols;
  const centerCol = Math.floor(options.sourceCols / 2);

  return createReplaySetup({
    bounds,
    entityCount: options.sourceCols + 1,
    identity: {
      entityCount: options.sourceCols + 1,
      units: [
        { unitId: 1, factionId: 1, memberEntityIds: sourceMembers },
        { unitId: 2, factionId: 1, memberEntityIds: [blockerEntityId] },
      ],
    },
    formation: {
      entityCount: options.sourceCols + 1,
      rngSeed: 0x2d02,
      units: [
        {
          unitId: 1,
          anchorX: sourceAnchorX,
          anchorY: sourceAnchorY,
          headingX: 1,
          headingY: 0,
          spacing,
          rows: 1,
          cols: options.sourceCols,
          unitSpeed: 1,
          order: "advance",
          cohesion: options.sourceCohesion ?? 900,
        },
        {
          unitId: 2,
          anchorX: blockerAnchorX,
          anchorY: blockerAnchorY,
          headingX: -1,
          headingY: 0,
          spacing,
          rows: 1,
          cols: 1,
          unitSpeed: 0,
          order: "hold",
        },
      ],
      individuals: [
        ...sourceMembers.map((entityId, slotCol) => ({
          entityId,
          role: "regular" as const,
          slotRow: 0,
          slotCol,
          memberMaxStep: 2,
          confidence: options.sourceConfidence ?? 500,
        })),
        unitMember(blockerEntityId, 2, 0, 0, 0),
      ],
    },
    initialPositions: [
      ...sourceMembers.map((entityId, slotCol) => ({
        entityId,
        x: sourceAnchorX,
        y: sourceAnchorY + (slotCol - centerCol) * spacing,
      })),
      { entityId: blockerEntityId, x: blockerAnchorX, y: blockerAnchorY },
    ],
  });
}

function createReplaySetup(
  config: FormationReplayHarnessConfig,
): FormationReplaySetup {
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
  const store = createFormationBehaviourStore(identity, config.formation);
  const units = buildReplayUnitDefinitions(config.identity, config.formation);
  const individuals = buildReplayIndividualDefinitions(
    config.identity,
    config.formation,
  );

  return { world, identity, store, units, individuals };
}

function buildReplayUnitDefinitions(
  identity: FormationReplayHarnessConfig["identity"],
  formation: FormationBehaviourConfig,
): readonly FormationReplayUnitDefinition[] {
  return formation.units.map((unit) => {
    const identityUnit = identity.units.find(
      (candidate) => candidate.unitId === unit.unitId,
    );
    if (identityUnit === undefined) {
      throw new RangeError("Replay unit config is missing identity data.");
    }
    return {
      ...unit,
      factionId: identityUnit.factionId,
      memberEntityIds: identityUnit.memberEntityIds,
    };
  });
}

function buildReplayIndividualDefinitions(
  identity: FormationReplayHarnessConfig["identity"],
  formation: FormationBehaviourConfig,
): readonly FormationReplayIndividualDefinition[] {
  return formation.individuals.map((individual) => {
    const unit = identity.units.find((candidate) =>
      candidate.memberEntityIds.includes(individual.entityId),
    );
    if (unit === undefined) {
      throw new RangeError("Replay individual config is missing unit data.");
    }
    return { ...individual, unitId: unit.unitId };
  });
}

function stripReplayUnitFields(
  unit: FormationReplayUnitDefinition,
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
  };
}

function stripReplayIndividualFields(
  individual: FormationReplayIndividualDefinition,
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

function unitMember(
  entityId: number,
  unitId: number,
  slotRow: number,
  slotCol: number,
  memberMaxStep: number,
): FormationReplayIndividualDefinition {
  return {
    entityId,
    unitId,
    role: "regular",
    slotRow,
    slotCol,
    memberMaxStep,
  };
}
