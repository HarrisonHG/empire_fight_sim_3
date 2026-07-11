import { applyCombatConsequences } from "./combatConsequences";
import {
  collectCombatMoraleAssessments,
  type CombatMoraleAssessment,
} from "./combatMorale";
import {
  advanceCombatPipelineOneTick,
  createCombatPipelineOutput,
} from "./combatPipeline";
import {
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
} from "./combatSurvivability";
import { createCombatTempoStore } from "./combatTempo";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getUnitMovementStyle,
} from "./formationBehaviour";
import { moveWorldOneTick } from "./movement";
import {
  advanceCombatPressureOneTick,
  createCombatPressureStore,
} from "./combatPressure";
import {
  advancePersistentMoraleOneTick,
  createPersistentMoraleStore,
  getPersistentUnitMoraleState,
} from "./persistentMorale";
import {
  advanceRoutingContagionOneTick,
  createRoutingContagionStore,
} from "./routingContagion";
import type { MoraleMovementState } from "./moraleMovement";
import { SeededRng } from "./rng";
import {
  createUnitIdentityStore,
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitId,
} from "./unitIdentity";
import { createUnitLoadoutStore } from "./unitLoadout";
import type {
  CombatSandboxScenario,
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  InitialSimulationSnapshot,
  LiveCombatDebugSnapshot,
  LiveCombatDebugUnitSnapshot,
  PositionSimulationSnapshot,
  SimulationScenario,
  SimulationState,
  WorldState,
} from "./types";
import { createWorld } from "./world";

export const FIXED_TICKS_PER_SECOND = 20;

interface SnapshotBuffers {
  readonly ids: Uint32Array;
  readonly positions: Int32Array;
  readonly factionIds: Uint8Array | undefined;
}

interface InitializedCombatSandbox {
  readonly state: CombatSandboxSimulationState;
  readonly rngState: number;
}

const snapshotBuffersBySimulation = new WeakMap<
  SimulationState,
  SnapshotBuffers
>();

export function createSimulation(
  scenario: SimulationScenario,
): SimulationState {
  const initializedWorld = createWorld(scenario);
  const initializedCombatSandbox =
    scenario.combatSandbox === undefined
      ? undefined
      : createCombatSandbox(
          initializedWorld.world,
          scenario.combatSandbox,
          scenario.seed,
        );
  const simulation: SimulationState = {
    tick: 0,
    rngState: initializedCombatSandbox?.rngState ?? initializedWorld.rngState,
    world: initializedWorld.world,
    ...(initializedCombatSandbox === undefined
      ? {}
      : { combatSandbox: initializedCombatSandbox.state }),
  };

  snapshotBuffersBySimulation.set(simulation, {
    ids: initializedWorld.world.ids.slice(),
    positions: new Int32Array(initializedWorld.world.entityCount * 2),
    factionIds:
      initializedCombatSandbox === undefined
        ? undefined
        : createFactionIdBuffer(
            initializedWorld.world,
            initializedCombatSandbox.state,
          ),
  });

  return simulation;
}

/** Advances the complete simulation by exactly one fixed tick. */
export function advanceSimulationOneTick(simulation: SimulationState): void {
  const combatSandbox = simulation.combatSandbox;
  if (combatSandbox === undefined) {
    // Preserve the Foundation baseline for its standalone movement/perf tests.
    moveWorldOneTick(simulation.world);
  } else {
    const formationResult = advanceFormationOneTick(
      simulation.world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.moraleMovementStates,
    );
    advanceCombatPipelineOneTick(
      simulation.world,
      combatSandbox.identityStore,
      combatSandbox.loadoutStore,
      combatSandbox.formationStore,
      combatSandbox.tempoStore,
      combatSandbox.survivabilityStore,
      combatSandbox.pipelineOutput,
    );
    applyCombatConsequences(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.pipelineOutput.applications,
      combatSandbox.consequenceApplications,
      {
        appliedDamagePressureScale: combatSandbox.appliedDamagePressureScale,
      },
    );
    advanceCombatPressureOneTick(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.pipelineOutput.opportunities,
      combatSandbox.consequenceApplications,
      combatSandbox.pressureStore,
      combatSandbox.pressureUpdates,
    );
    advanceRoutingContagionOneTick(
      simulation.world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.moraleMovementStates,
      formationResult.routingPassThroughInteractions,
      combatSandbox.routingContagionStore,
      combatSandbox.routingContagionSummaries,
    );
    collectCombatMoraleAssessments(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.consequenceApplications,
      combatSandbox.moraleAssessments,
    );
    advancePersistentMoraleOneTick(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.moraleAssessments,
      combatSandbox.persistentMoraleStore,
      combatSandbox.moraleEvents,
      {
        survivabilityStore: combatSandbox.survivabilityStore,
        pressureUpdates: combatSandbox.pressureUpdates,
        routingContagionSummaries: combatSandbox.routingContagionSummaries,
      },
    );
    syncMoraleMovementStates(combatSandbox);
    updateCombatCounters(combatSandbox);
    combatSandbox.debugSnapshot = createCombatDebugSnapshot(combatSandbox);
  }

  simulation.tick += 1;
}

/**
 * Returns an ephemeral initial snapshot view. Its positions buffer is reused by
 * later snapshot calls and must be consumed or copied before the next call.
 */
export function createInitialSnapshot(
  simulation: SimulationState,
): InitialSimulationSnapshot {
  const snapshotBuffers = getSnapshotBuffers(simulation);
  const baseSnapshot = {
    kind: "initial" as const,
    tick: simulation.tick,
    entityCount: simulation.world.entityCount,
    bounds: {
      width: simulation.world.bounds.width,
      height: simulation.world.bounds.height,
    },
    ids: snapshotBuffers.ids,
    positions: fillSnapshotPositions(simulation),
  };
  const combatDebug = simulation.combatSandbox?.debugSnapshot;

  return {
    ...baseSnapshot,
    ...(snapshotBuffers.factionIds === undefined
      ? {}
      : { factionIds: snapshotBuffers.factionIds }),
    ...(combatDebug === undefined ? {} : { combatDebug }),
  };
}

/**
 * Returns an ephemeral position snapshot view backed by the simulation-owned
 * reusable buffer. Consume or copy it before creating the next snapshot.
 */
export function createPositionSnapshot(
  simulation: SimulationState,
): PositionSimulationSnapshot {
  const baseSnapshot = {
    kind: "positions" as const,
    tick: simulation.tick,
    entityCount: simulation.world.entityCount,
    positions: fillSnapshotPositions(simulation),
  };
  const combatDebug = simulation.combatSandbox?.debugSnapshot;

  return {
    ...baseSnapshot,
    ...(combatDebug === undefined ? {} : { combatDebug }),
  };
}

function createCombatSandbox(
  world: WorldState,
  scenario: CombatSandboxScenario,
  seed: number,
): InitializedCombatSandbox {
  validateCombatSandboxScenario(world, scenario);

  const deploymentRng = new SeededRng(seed);
  const unitDefinitions: Array<{
    readonly unitId: number;
    readonly factionId: number;
    readonly memberEntityIds: readonly number[];
  }> = [];
  const individualDefinitions: Array<{
    readonly entityId: number;
    readonly role: CombatSandboxUnitScenario["role"];
    readonly slotRow: number;
    readonly slotCol: number;
    readonly memberMaxStep: number;
  }> = [];

  let nextEntityId = 0;
  for (let unitIndex = 0; unitIndex < scenario.units.length; unitIndex += 1) {
    const unit = scenario.units[unitIndex]!;
    const memberEntityIds: number[] = [];

    for (let memberIndex = 0; memberIndex < unit.memberCount; memberIndex += 1) {
      const entityId = nextEntityId;
      nextEntityId += 1;
      memberEntityIds.push(entityId);

      world.positionsX[entityId] = deploymentRng.nextIntInclusive(
        unit.deploymentZone.minX,
        unit.deploymentZone.maxX,
      );
      world.positionsY[entityId] = deploymentRng.nextIntInclusive(
        unit.deploymentZone.minY,
        unit.deploymentZone.maxY,
      );
      world.velocitiesX[entityId] = 0;
      world.velocitiesY[entityId] = 0;
      individualDefinitions.push({
        entityId,
        role: unit.role,
        slotRow: Math.floor(memberIndex / unit.cols),
        slotCol: memberIndex % unit.cols,
        memberMaxStep: unit.memberMaxStep,
      });
    }

    unitDefinitions.push({
      unitId: unit.unitId,
      factionId: unit.factionId,
      memberEntityIds,
    });
  }

  const identityStore = createUnitIdentityStore({
    entityCount: world.entityCount,
    units: unitDefinitions,
  });
  const loadoutStore = createUnitLoadoutStore(identityStore, {
    entityCount: world.entityCount,
    units: scenario.units.map((unit) => ({
      unitId: unit.unitId,
      weaponCategory: unit.weaponCategory,
      weaponReachBand: unit.weaponReachBand,
      armourClass: unit.armourClass,
      shieldClass: unit.shieldClass,
      trainingTags: ["formed", "heavy"],
    })),
  });
  const formationStore = createFormationBehaviourStore(identityStore, {
    entityCount: world.entityCount,
    rngSeed: deploymentRng.state,
    units: scenario.units.map((unit) => ({
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
    })),
    individuals: individualDefinitions,
  });
  const tempoStore = createCombatTempoStore(identityStore, {
    entityCount: world.entityCount,
    units: scenario.units.map((unit) => ({
      unitId: unit.unitId,
      attackIntervalTicks: unit.attackIntervalTicks,
      initialCooldownTicks: unit.attackIntervalTicks,
    })),
  });
  const survivabilityStore = createCombatSurvivabilityStore(identityStore, {
    entityCount: world.entityCount,
    units: scenario.units.map((unit) => ({
      unitId: unit.unitId,
      maxDamageCapacity: unit.maxDamageCapacity,
    })),
  });
  const moraleAssessments: CombatMoraleAssessment[] = [];
  collectCombatMoraleAssessments(
    identityStore,
    formationStore,
    [],
    moraleAssessments,
  );
  const persistentMoraleStore = createPersistentMoraleStore(
    identityStore,
    formationStore,
    moraleAssessments,
  );
  const moraleMovementStates = new Map<UnitId, MoraleMovementState>();
  syncMoraleMovementStatesForStores(
    identityStore,
    persistentMoraleStore,
    moraleMovementStates,
  );
  const combatSandbox: CombatSandboxSimulationState = {
    identityStore,
    loadoutStore,
    formationStore,
    tempoStore,
    survivabilityStore,
    pressureStore: createCombatPressureStore(identityStore, formationStore),
    routingContagionStore: createRoutingContagionStore(identityStore),
    persistentMoraleStore,
    moraleMovementStates,
    pipelineOutput: createCombatPipelineOutput(),
    consequenceApplications: [],
    pressureUpdates: [],
    routingContagionSummaries: [],
    moraleAssessments,
    moraleEvents: [],
    appliedDamagePressureScale: scenario.appliedDamagePressureScale,
    opportunityCount: 0,
    strikeCount: 0,
    survivabilityApplicationCount: 0,
    consequenceCount: 0,
    totalOpportunityCount: 0,
    totalStrikeCount: 0,
    totalSurvivabilityApplicationCount: 0,
    totalConsequenceCount: 0,
    debugSnapshot: createEmptyCombatDebugSnapshot(),
  };
  combatSandbox.debugSnapshot = createCombatDebugSnapshot(combatSandbox);

  return { state: combatSandbox, rngState: deploymentRng.state };
}

function validateCombatSandboxScenario(
  world: WorldState,
  scenario: CombatSandboxScenario,
): void {
  if (scenario.kind !== "liveCombatSandbox") {
    throw new RangeError("Unknown combat sandbox scenario kind.");
  }
  if (scenario.units.length !== 2) {
    throw new RangeError("Live combat sandbox requires exactly two units.");
  }
  assertNonNegativeSafeInteger(
    scenario.appliedDamagePressureScale,
    "appliedDamagePressureScale",
  );

  const unitIds = new Set<number>();
  const factionIds = new Set<number>();
  let configuredEntityCount = 0;
  for (let index = 0; index < scenario.units.length; index += 1) {
    const unit = scenario.units[index]!;
    assertNonNegativeSafeInteger(unit.unitId, "unitId");
    assertNonNegativeSafeInteger(unit.factionId, "factionId");
    if (unit.factionId > 0xff) {
      throw new RangeError("Live combat faction IDs must fit in Uint8Array.");
    }
    if (unitIds.has(unit.unitId)) {
      throw new RangeError("Live combat sandbox unit IDs must be unique.");
    }
    if (factionIds.has(unit.factionId)) {
      throw new RangeError("Live combat sandbox factions must be distinct.");
    }
    unitIds.add(unit.unitId);
    factionIds.add(unit.factionId);

    assertPositiveSafeInteger(unit.memberCount, "memberCount");
    assertPositiveSafeInteger(unit.rows, "rows");
    assertPositiveSafeInteger(unit.cols, "cols");
    assertPositiveSafeInteger(unit.spacing, "spacing");
    assertNonNegativeSafeInteger(unit.unitSpeed, "unitSpeed");
    assertPositiveSafeInteger(unit.memberMaxStep, "memberMaxStep");
    assertPositiveSafeInteger(
      unit.attackIntervalTicks,
      "attackIntervalTicks",
    );
    assertPositiveSafeInteger(unit.maxDamageCapacity, "maxDamageCapacity");
    if (unit.rows * unit.cols < unit.memberCount) {
      throw new RangeError(
        "Live combat formation slots must cover every unit member.",
      );
    }
    validateDeploymentZone(world, unit.deploymentZone);
    validateAnchor(world, unit.anchorX, unit.anchorY);
    configuredEntityCount += unit.memberCount;
  }

  if (configuredEntityCount !== world.entityCount) {
    throw new RangeError(
      "Live combat sandbox members must exactly match world entity count.",
    );
  }
}

function validateDeploymentZone(
  world: WorldState,
  zone: CombatSandboxUnitScenario["deploymentZone"],
): void {
  assertNonNegativeSafeInteger(zone.minX, "deploymentZone.minX");
  assertNonNegativeSafeInteger(zone.maxX, "deploymentZone.maxX");
  assertNonNegativeSafeInteger(zone.minY, "deploymentZone.minY");
  assertNonNegativeSafeInteger(zone.maxY, "deploymentZone.maxY");
  if (zone.minX > zone.maxX || zone.minY > zone.maxY) {
    throw new RangeError("Live combat deployment zones must be ordered.");
  }
  if (zone.maxX >= world.bounds.width || zone.maxY >= world.bounds.height) {
    throw new RangeError("Live combat deployment zones must fit world bounds.");
  }
}

function validateAnchor(world: WorldState, x: number, y: number): void {
  assertNonNegativeSafeInteger(x, "anchorX");
  assertNonNegativeSafeInteger(y, "anchorY");
  if (x >= world.bounds.width || y >= world.bounds.height) {
    throw new RangeError("Live combat anchors must fit world bounds.");
  }
}

function createFactionIdBuffer(
  world: WorldState,
  combatSandbox: CombatSandboxSimulationState,
): Uint8Array {
  const factionIds = new Uint8Array(world.entityCount);
  for (let entityIndex = 0; entityIndex < world.entityCount; entityIndex += 1) {
    const unitId = getUnitIdForEntity(
      combatSandbox.identityStore,
      world.ids[entityIndex]!,
    );
    factionIds[entityIndex] = getFactionIdForUnit(
      combatSandbox.identityStore,
      unitId,
    );
  }
  return factionIds;
}

function updateCombatCounters(combatSandbox: CombatSandboxSimulationState): void {
  combatSandbox.opportunityCount = combatSandbox.pipelineOutput.opportunities.length;
  combatSandbox.strikeCount = combatSandbox.pipelineOutput.strikes.length;
  combatSandbox.survivabilityApplicationCount =
    combatSandbox.pipelineOutput.applications.length;
  combatSandbox.consequenceCount = combatSandbox.consequenceApplications.length;
  combatSandbox.totalOpportunityCount += combatSandbox.opportunityCount;
  combatSandbox.totalStrikeCount += combatSandbox.strikeCount;
  combatSandbox.totalSurvivabilityApplicationCount +=
    combatSandbox.survivabilityApplicationCount;
  combatSandbox.totalConsequenceCount += combatSandbox.consequenceCount;
}

/**
 * This projection is refreshed after morale arbitration, so its new state is
 * read by formation on the following movement tick rather than mid-tick.
 */
function syncMoraleMovementStates(
  combatSandbox: CombatSandboxSimulationState,
): void {
  syncMoraleMovementStatesForStores(
    combatSandbox.identityStore,
    combatSandbox.persistentMoraleStore,
    combatSandbox.moraleMovementStates,
  );
}

function syncMoraleMovementStatesForStores(
  identityStore: CombatSandboxSimulationState["identityStore"],
  persistentMoraleStore: CombatSandboxSimulationState["persistentMoraleStore"],
  moraleMovementStates: Map<UnitId, MoraleMovementState>,
): void {
  const unitIds = getUnitIds(identityStore);
  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    moraleMovementStates.set(
      unitId,
      getPersistentUnitMoraleState(persistentMoraleStore, unitId),
    );
  }
}

function createEmptyCombatDebugSnapshot(): LiveCombatDebugSnapshot {
  return {
    opportunityCount: 0,
    strikeCount: 0,
    survivabilityApplicationCount: 0,
    consequenceCount: 0,
    totalOpportunityCount: 0,
    totalStrikeCount: 0,
    totalSurvivabilityApplicationCount: 0,
    totalConsequenceCount: 0,
    units: [],
  };
}

function createCombatDebugSnapshot(
  combatSandbox: CombatSandboxSimulationState,
): LiveCombatDebugSnapshot {
  const unitIds = getUnitIds(combatSandbox.identityStore);
  const units: LiveCombatDebugUnitSnapshot[] = [];

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const moraleAssessment = combatSandbox.moraleAssessments[unitIndex];
    if (moraleAssessment === undefined || moraleAssessment.unitId !== unitId) {
      throw new Error("Live combat morale assessments are out of sync.");
    }

    units.push({
      unitId,
      factionId: getFactionIdForUnit(combatSandbox.identityStore, unitId),
      memberCount: getUnitMembers(combatSandbox.identityStore, unitId).length,
      movementStyle: getUnitMovementStyle(combatSandbox.formationStore, unitId),
      accumulatedDamage: getUnitAccumulatedDamage(
        combatSandbox.survivabilityStore,
        unitId,
      ),
      pressureAverage: moraleAssessment.pressureAverage,
      moraleState: moraleAssessment.moraleState,
    });
  }

  return {
    opportunityCount: combatSandbox.opportunityCount,
    strikeCount: combatSandbox.strikeCount,
    survivabilityApplicationCount: combatSandbox.survivabilityApplicationCount,
    consequenceCount: combatSandbox.consequenceCount,
    totalOpportunityCount: combatSandbox.totalOpportunityCount,
    totalStrikeCount: combatSandbox.totalStrikeCount,
    totalSurvivabilityApplicationCount:
      combatSandbox.totalSurvivabilityApplicationCount,
    totalConsequenceCount: combatSandbox.totalConsequenceCount,
    units,
  };
}

function fillSnapshotPositions(simulation: SimulationState): Int32Array {
  const { world } = simulation;
  const snapshotPositions = getSnapshotBuffers(simulation).positions;

  for (let index = 0; index < world.entityCount; index += 1) {
    const positionOffset = index * 2;
    snapshotPositions[positionOffset] = world.positionsX[index]!;
    snapshotPositions[positionOffset + 1] = world.positionsY[index]!;
  }

  return snapshotPositions;
}

function getSnapshotBuffers(simulation: SimulationState): SnapshotBuffers {
  const existingBuffers = snapshotBuffersBySimulation.get(simulation);
  if (existingBuffers !== undefined) {
    return existingBuffers;
  }

  const buffers: SnapshotBuffers = {
    ids: simulation.world.ids.slice(),
    positions: new Int32Array(simulation.world.entityCount * 2),
    factionIds:
      simulation.combatSandbox === undefined
        ? undefined
        : createFactionIdBuffer(simulation.world, simulation.combatSandbox),
  };
  snapshotBuffersBySimulation.set(simulation, buffers);
  return buffers;
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
