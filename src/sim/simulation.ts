import { applyCombatConsequences } from "./combatConsequences";
import {
  collectCombatMoraleAssessmentsFromIndividualConsequences,
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
  getUnitCohesion,
  getUnitMovementStyle,
} from "./formationBehaviour";
import { moveWorldOneTick } from "./movement";
import {
  advanceIndividualCombatPressureOneTick,
  createCombatPressureStore,
} from "./combatPressure";
import {
  advancePersistentMoraleOneTick,
  createPersistentMoraleStore,
  getPersistentUnitMorale,
  getPersistentUnitMoraleState,
} from "./persistentMorale";
import {
  compareIndividualCombatShadow,
  getIndividualCombatConsequenceSummaries,
  getIndividualCombatShadowComparisons,
} from "./individualCombatConsequences";
import {
  advanceIndividualCombatPipelineObservationOneTick,
  createIndividualCombatPipelineBuffers,
  createIndividualCombatPipelineStores,
  createIndividualCombatProfileStoreFromUnitLoadouts,
  type IndividualCombatPipelineTickResult,
} from "./individualCombatPipeline";
import { getIndividualCombatUnitSummaries } from "./individualCombatAggregation";
import {
  advanceRoutingContagionOneTick,
  createRoutingContagionStore,
} from "./routingContagion";
import {
  collectRecoveryThreatSummaries,
  createRecoveryThreatStore,
} from "./recoveryThreat";
import type { MoraleMovementState } from "./moraleMovement";
import { SeededRng } from "./rng";
import {
  createUnitIdentityStore,
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitId,
  type UnitIdentityStore,
} from "./unitIdentity";
import { createUnitLoadoutStore } from "./unitLoadout";
import type {
  CombatSandboxScenario,
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  FormationDebugSnapshot,
  FormationSandboxScenario,
  FormationSandboxSimulationState,
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
  if (
    scenario.combatSandbox !== undefined &&
    scenario.formationSandbox !== undefined
  ) {
    throw new RangeError(
      "A scenario cannot configure combat and formation sandboxes together.",
    );
  }
  const initializedFormationSandbox =
    scenario.formationSandbox === undefined
      ? undefined
      : createFormationSandbox(
          initializedWorld.world,
          scenario.formationSandbox,
          scenario.seed,
        );
  const simulation: SimulationState = {
    tick: 0,
    rngState: initializedCombatSandbox?.rngState ?? initializedWorld.rngState,
    world: initializedWorld.world,
    ...(initializedCombatSandbox === undefined
      ? {}
      : { combatSandbox: initializedCombatSandbox.state }),
    ...(initializedFormationSandbox === undefined
      ? {}
      : { formationSandbox: initializedFormationSandbox }),
  };

  snapshotBuffersBySimulation.set(simulation, {
    ids: initializedWorld.world.ids.slice(),
    positions: new Int32Array(initializedWorld.world.entityCount * 2),
    factionIds:
      createScenarioFactionIdBuffer(
        initializedWorld.world,
        initializedCombatSandbox?.state,
        initializedFormationSandbox,
      ),
  });

  return simulation;
}

/** Advances the complete simulation by exactly one fixed tick. */
export function advanceSimulationOneTick(simulation: SimulationState): void {
  const combatSandbox = simulation.combatSandbox;
  const formationSandbox = simulation.formationSandbox;
  if (formationSandbox !== undefined) {
    advanceFormationOneTick(
      simulation.world,
      formationSandbox.identityStore,
      formationSandbox.formationStore,
    );
    formationSandbox.debugSnapshot = createFormationDebugSnapshot(
      formationSandbox,
    );
  } else if (combatSandbox === undefined) {
    // Preserve the Foundation baseline for its standalone movement/perf tests.
    moveWorldOneTick(simulation.world);
  } else {
    const formationResult = advanceFormationOneTick(
      simulation.world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.moraleMovementStates,
    );
    const individualCombatResult =
      advanceIndividualCombatPipelineObservationOneTick(
        simulation.world,
        combatSandbox.identityStore,
        combatSandbox.formationStore,
        combatSandbox.individualCombatPipelineStores,
        combatSandbox.individualCombatPipelineBuffers,
        simulation.tick,
      );
    advanceIndividualCombatPressureOneTick(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      individualCombatResult.consequenceSummaries,
      combatSandbox.pressureStore,
      combatSandbox.pressureUpdates,
      {
        appliedDamagePressureScale: combatSandbox.appliedDamagePressureScale,
      },
      combatSandbox.moraleMovementStates,
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
    collectRecoveryThreatSummaries(
      simulation.world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.recoveryThreatStore,
      combatSandbox.recoveryThreatSummaries,
    );
    collectCombatMoraleAssessmentsFromIndividualConsequences(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      individualCombatResult.consequenceSummaries,
      combatSandbox.moraleAssessments,
    );
    advancePersistentMoraleOneTick(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.moraleAssessments,
      combatSandbox.persistentMoraleStore,
      combatSandbox.moraleEvents,
      {
        pressureUpdates: combatSandbox.pressureUpdates,
        routingContagionSummaries: combatSandbox.routingContagionSummaries,
        recoveryThreatSummaries: combatSandbox.recoveryThreatSummaries,
      },
    );
    syncMoraleMovementStates(combatSandbox);
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
        appliedDamagePressureScale: 0,
        mitigatedHitPressureDelta: 0,
        capacityReachedPressureBonus: 0,
        capacityReachedCohesionBonus: 0,
      },
    );
    compareIndividualCombatShadow(
      combatSandbox.identityStore,
      combatSandbox.pipelineOutput.opportunities,
      combatSandbox.consequenceApplications,
      individualCombatResult.consequenceSummaries,
      combatSandbox.individualCombatConsequenceProjectionStore,
    );
    updateCombatCounters(combatSandbox);
    updateIndividualCombatCounters(combatSandbox, individualCombatResult);
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
  const formationDebug = simulation.formationSandbox?.debugSnapshot;

  return {
    ...baseSnapshot,
    ...(snapshotBuffers.factionIds === undefined
      ? {}
      : { factionIds: snapshotBuffers.factionIds }),
    ...(combatDebug === undefined ? {} : { combatDebug }),
    ...(formationDebug === undefined ? {} : { formationDebug }),
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
  const formationDebug = simulation.formationSandbox?.debugSnapshot;

  return {
    ...baseSnapshot,
    ...(combatDebug === undefined ? {} : { combatDebug }),
    ...(formationDebug === undefined ? {} : { formationDebug }),
  };
}

function createFormationSandbox(
  world: WorldState,
  scenario: FormationSandboxScenario,
  seed: number,
): FormationSandboxSimulationState {
  validateFormationSandboxScenario(world, scenario);
  for (let index = 0; index < scenario.individuals.length; index += 1) {
    const individual = scenario.individuals[index]!;
    world.positionsX[individual.entityId] = individual.x;
    world.positionsY[individual.entityId] = individual.y;
    world.velocitiesX[individual.entityId] = 0;
    world.velocitiesY[individual.entityId] = 0;
  }
  const identityStore = createUnitIdentityStore({
    entityCount: world.entityCount,
    units: scenario.units.map((unit) => ({
      unitId: unit.unitId,
      factionId: unit.factionId,
      memberEntityIds: unit.memberEntityIds,
    })),
  });
  const formationStore = createFormationBehaviourStore(identityStore, {
    entityCount: world.entityCount,
    rngSeed: seed,
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
      ...(unit.cohesion === undefined ? {} : { cohesion: unit.cohesion }),
    })),
    individuals: scenario.individuals.map((individual) => ({
      entityId: individual.entityId,
      role: individual.role,
      slotRow: individual.slotRow,
      slotCol: individual.slotCol,
      memberMaxStep: individual.memberMaxStep,
      ...(individual.pressure === undefined
        ? {}
        : { pressure: individual.pressure }),
      ...(individual.confidence === undefined
        ? {}
        : { confidence: individual.confidence }),
    })),
  });
  const state: FormationSandboxSimulationState = {
    identityStore,
    formationStore,
    unitLabels: new Map(
      scenario.units.map((unit) => [unit.unitId, unit.label]),
    ),
    debugSnapshot: { units: [] },
  };
  state.debugSnapshot = createFormationDebugSnapshot(state);
  return state;
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
        ...(unit.individualConfidence === undefined
          ? {}
          : { confidence: unit.individualConfidence }),
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
      ...(unit.initialCohesion === undefined
        ? {}
        : { cohesion: unit.initialCohesion }),
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
  const individualProfileStore =
    createIndividualCombatProfileStoreFromUnitLoadouts(
      identityStore,
      loadoutStore,
    );
  const individualCombatPipelineStores = createIndividualCombatPipelineStores(
    world,
    identityStore,
    formationStore,
    individualProfileStore,
  );
  const individualCombatPipelineBuffers =
    createIndividualCombatPipelineBuffers();
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
    individualProfileStore,
    individualCombatEligibilitySnapshot:
      individualCombatPipelineStores.eligibilitySnapshot,
    individualTargetSelectionStore:
      individualCombatPipelineStores.targetSelectionStore,
    individualCombatActionStore: individualCombatPipelineStores.actionStore,
    individualMeleeDefenceStore: individualCombatPipelineStores.defenceStore,
    individualLandedHitGateStore:
      individualCombatPipelineStores.landedHitGateStore,
    individualGlobalHitStore: individualCombatPipelineStores.globalHitStore,
    individualCombatUnitAggregationStore:
      individualCombatPipelineStores.unitAggregationStore,
    individualCombatUnitSummaries: getIndividualCombatUnitSummaries(
      individualCombatPipelineStores.unitAggregationStore,
    ),
    individualCombatConsequenceProjectionStore:
      individualCombatPipelineStores.consequenceProjectionStore,
    individualCombatConsequenceSummaries: getIndividualCombatConsequenceSummaries(
      individualCombatPipelineStores.consequenceProjectionStore,
    ),
    individualCombatShadowComparisons: getIndividualCombatShadowComparisons(
      individualCombatPipelineStores.consequenceProjectionStore,
    ),
    individualCombatPipelineStores,
    individualCombatPipelineBuffers,
    tempoStore,
    survivabilityStore,
    pressureStore: createCombatPressureStore(identityStore, formationStore),
    routingContagionStore: createRoutingContagionStore(identityStore),
    recoveryThreatStore: createRecoveryThreatStore(identityStore, world),
    persistentMoraleStore,
    unitLabels: new Map(
      scenario.units.map((unit) => [unit.unitId, unit.label ?? `Unit ${unit.unitId}`]),
    ),
    moraleMovementStates,
    pipelineOutput: createCombatPipelineOutput(),
    consequenceApplications: [],
    pressureUpdates: [],
    routingContagionSummaries: [],
    recoveryThreatSummaries: [],
    moraleAssessments,
    moraleEvents: [],
    appliedDamagePressureScale: scenario.appliedDamagePressureScale,
    opportunityCount: 0,
    strikeCount: 0,
    survivabilityApplicationCount: 0,
    consequenceCount: 0,
    individualEligibleMeleeSourceCount: 0,
    individualSelectedTargetCount: 0,
    individualActiveCommitmentCount: 0,
    individualAttackAttemptCount: 0,
    individualInvalidatedAttackCount: 0,
    individualParryCount: 0,
    individualBucklerBlockCount: 0,
    individualShieldBlockCount: 0,
    individualLandedDefenceOutcomeCount: 0,
    individualGateAcceptedHitCount: 0,
    individualGateRejectedHitCount: 0,
    individualAppliedHitLoss: 0,
    individualZeroHitTransitionCount: 0,
    individualActiveGateRelationshipCount: 0,
    individualTickStartCombatEligibleMemberCount: 0,
    individualTickStartCombatIneligibleMemberCount: 0,
    individualEndOfTickCombatEligibleMemberCount: 0,
    individualEndOfTickZeroHitMemberCount: 0,
    individualNewlyZeroHitMemberCount: 0,
    totalOpportunityCount: 0,
    totalStrikeCount: 0,
    totalSurvivabilityApplicationCount: 0,
    totalConsequenceCount: 0,
    totalIndividualEligibleMeleeSourceCount: 0,
    totalIndividualSelectedTargetCount: 0,
    totalIndividualActiveCommitmentCount: 0,
    totalIndividualAttackAttemptCount: 0,
    totalIndividualInvalidatedAttackCount: 0,
    totalIndividualParryCount: 0,
    totalIndividualBucklerBlockCount: 0,
    totalIndividualShieldBlockCount: 0,
    totalIndividualLandedDefenceOutcomeCount: 0,
    totalIndividualGateAcceptedHitCount: 0,
    totalIndividualGateRejectedHitCount: 0,
    totalIndividualAppliedHitLoss: 0,
    totalIndividualZeroHitTransitionCount: 0,
    totalIndividualActiveGateRelationshipCount: 0,
    totalIndividualTickStartCombatEligibleMemberCount: 0,
    totalIndividualTickStartCombatIneligibleMemberCount: 0,
    totalIndividualEndOfTickCombatEligibleMemberCount: 0,
    totalIndividualEndOfTickZeroHitMemberCount: 0,
    totalIndividualNewlyZeroHitMemberCount: 0,
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
  if (scenario.units.length < 2) {
    throw new RangeError("Live combat sandbox requires at least two units.");
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
    if (unit.initialCohesion !== undefined) {
      assertNonNegativeSafeInteger(unit.initialCohesion, "initialCohesion");
    }
    if (unit.individualConfidence !== undefined) {
      assertNonNegativeSafeInteger(
        unit.individualConfidence,
        "individualConfidence",
      );
    }
    if (unit.rows * unit.cols < unit.memberCount) {
      throw new RangeError(
        "Live combat formation slots must cover every unit member.",
      );
    }
    validateDeploymentZone(world, unit.deploymentZone);
    validateAnchor(world, unit.anchorX, unit.anchorY);
    configuredEntityCount += unit.memberCount;
  }

  if (factionIds.size < 2) {
    throw new RangeError("Live combat sandbox requires at least two factions.");
  }

  if (configuredEntityCount !== world.entityCount) {
    throw new RangeError(
      "Live combat sandbox members must exactly match world entity count.",
    );
  }
}

function validateFormationSandboxScenario(
  world: WorldState,
  scenario: FormationSandboxScenario,
): void {
  if (scenario.kind !== "formationSandbox") {
    throw new RangeError("Unknown formation sandbox scenario kind.");
  }
  if (scenario.units.length === 0) {
    throw new RangeError("Formation sandbox requires at least one unit.");
  }
  if (scenario.individuals.length !== world.entityCount) {
    throw new RangeError(
      "Formation sandbox individuals must exactly match world entity count.",
    );
  }

  const unitIds = new Set<number>();
  const memberIds = new Set<number>();
  for (let index = 0; index < scenario.units.length; index += 1) {
    const unit = scenario.units[index]!;
    assertNonNegativeSafeInteger(unit.unitId, "unitId");
    assertNonNegativeSafeInteger(unit.factionId, "factionId");
    if (unit.factionId > 0xff) {
      throw new RangeError("Formation sandbox faction IDs must fit Uint8Array.");
    }
    if (unitIds.has(unit.unitId)) {
      throw new RangeError("Formation sandbox unit IDs must be unique.");
    }
    unitIds.add(unit.unitId);
    if (unit.memberEntityIds.length === 0) {
      throw new RangeError("Formation sandbox units require members.");
    }
    for (const entityId of unit.memberEntityIds) {
      assertNonNegativeSafeInteger(entityId, "memberEntityId");
      if (entityId >= world.entityCount || memberIds.has(entityId)) {
        throw new RangeError(
          "Formation sandbox members must be unique world entity IDs.",
        );
      }
      memberIds.add(entityId);
    }
    assertPositiveSafeInteger(unit.rows, "rows");
    assertPositiveSafeInteger(unit.cols, "cols");
    assertPositiveSafeInteger(unit.spacing, "spacing");
    assertNonNegativeSafeInteger(unit.unitSpeed, "unitSpeed");
    if (unit.rows * unit.cols < unit.memberEntityIds.length) {
      throw new RangeError(
        "Formation sandbox slots must cover every unit member.",
      );
    }
    validateAnchor(world, unit.anchorX, unit.anchorY);
  }
  if (memberIds.size !== world.entityCount) {
    throw new RangeError(
      "Formation sandbox unit members must cover every world entity.",
    );
  }

  const individualIds = new Set<number>();
  for (const individual of scenario.individuals) {
    assertNonNegativeSafeInteger(individual.entityId, "entityId");
    if (
      individual.entityId >= world.entityCount ||
      individualIds.has(individual.entityId)
    ) {
      throw new RangeError(
        "Formation sandbox individuals must have unique world entity IDs.",
      );
    }
    individualIds.add(individual.entityId);
    assertNonNegativeSafeInteger(individual.x, "individual.x");
    assertNonNegativeSafeInteger(individual.y, "individual.y");
    if (individual.x >= world.bounds.width || individual.y >= world.bounds.height) {
      throw new RangeError("Formation sandbox individuals must fit world bounds.");
    }
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
  identityStore: UnitIdentityStore,
): Uint8Array {
  const factionIds = new Uint8Array(world.entityCount);
  for (let entityIndex = 0; entityIndex < world.entityCount; entityIndex += 1) {
    const unitId = getUnitIdForEntity(
      identityStore,
      world.ids[entityIndex]!,
    );
    factionIds[entityIndex] = getFactionIdForUnit(
      identityStore,
      unitId,
    );
  }
  return factionIds;
}

function createScenarioFactionIdBuffer(
  world: WorldState,
  combatSandbox: CombatSandboxSimulationState | undefined,
  formationSandbox: FormationSandboxSimulationState | undefined,
): Uint8Array | undefined {
  const identityStore =
    combatSandbox?.identityStore ?? formationSandbox?.identityStore;
  return identityStore === undefined
    ? undefined
    : createFactionIdBuffer(world, identityStore);
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

function updateIndividualCombatCounters(
  combatSandbox: CombatSandboxSimulationState,
  result: IndividualCombatPipelineTickResult,
): void {
  combatSandbox.individualEligibleMeleeSourceCount =
    result.eligibleMeleeSourceCount;
  combatSandbox.individualSelectedTargetCount = result.selectedTargetCount;
  combatSandbox.individualActiveCommitmentCount = result.activeCommitmentCount;
  combatSandbox.individualAttackAttemptCount = result.attackAttemptCount;
  combatSandbox.individualInvalidatedAttackCount =
    result.invalidatedAttackCount;
  combatSandbox.individualParryCount = result.parryCount;
  combatSandbox.individualBucklerBlockCount = result.bucklerBlockCount;
  combatSandbox.individualShieldBlockCount = result.shieldBlockCount;
  combatSandbox.individualLandedDefenceOutcomeCount =
    result.landedDefenceOutcomeCount;
  combatSandbox.individualGateAcceptedHitCount = result.gateAcceptedHitCount;
  combatSandbox.individualGateRejectedHitCount = result.gateRejectedHitCount;
  combatSandbox.individualAppliedHitLoss = result.appliedHitLoss;
  combatSandbox.individualZeroHitTransitionCount =
    result.zeroHitTransitionCount;
  combatSandbox.individualActiveGateRelationshipCount =
    result.activeGateRelationshipCount;
  combatSandbox.individualTickStartCombatEligibleMemberCount =
    result.tickStartCombatEligibleMemberCount;
  combatSandbox.individualTickStartCombatIneligibleMemberCount =
    result.tickStartCombatIneligibleMemberCount;
  combatSandbox.individualEndOfTickCombatEligibleMemberCount =
    result.endOfTickCombatEligibleMemberCount;
  combatSandbox.individualEndOfTickZeroHitMemberCount =
    result.endOfTickZeroHitMemberCount;
  combatSandbox.individualNewlyZeroHitMemberCount =
    result.newlyZeroHitMemberCount;
  combatSandbox.totalIndividualEligibleMeleeSourceCount +=
    result.eligibleMeleeSourceCount;
  combatSandbox.totalIndividualSelectedTargetCount += result.selectedTargetCount;
  combatSandbox.totalIndividualActiveCommitmentCount +=
    result.activeCommitmentCount;
  combatSandbox.totalIndividualAttackAttemptCount += result.attackAttemptCount;
  combatSandbox.totalIndividualInvalidatedAttackCount +=
    result.invalidatedAttackCount;
  combatSandbox.totalIndividualParryCount += result.parryCount;
  combatSandbox.totalIndividualBucklerBlockCount += result.bucklerBlockCount;
  combatSandbox.totalIndividualShieldBlockCount += result.shieldBlockCount;
  combatSandbox.totalIndividualLandedDefenceOutcomeCount +=
    result.landedDefenceOutcomeCount;
  combatSandbox.totalIndividualGateAcceptedHitCount +=
    result.gateAcceptedHitCount;
  combatSandbox.totalIndividualGateRejectedHitCount +=
    result.gateRejectedHitCount;
  combatSandbox.totalIndividualAppliedHitLoss += result.appliedHitLoss;
  combatSandbox.totalIndividualZeroHitTransitionCount +=
    result.zeroHitTransitionCount;
  combatSandbox.totalIndividualActiveGateRelationshipCount +=
    result.activeGateRelationshipCount;
  combatSandbox.totalIndividualTickStartCombatEligibleMemberCount +=
    result.tickStartCombatEligibleMemberCount;
  combatSandbox.totalIndividualTickStartCombatIneligibleMemberCount +=
    result.tickStartCombatIneligibleMemberCount;
  combatSandbox.totalIndividualEndOfTickCombatEligibleMemberCount +=
    result.endOfTickCombatEligibleMemberCount;
  combatSandbox.totalIndividualEndOfTickZeroHitMemberCount +=
    result.endOfTickZeroHitMemberCount;
  combatSandbox.totalIndividualNewlyZeroHitMemberCount +=
    result.newlyZeroHitMemberCount;
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

    const persistentMorale = getPersistentUnitMorale(
      combatSandbox.persistentMoraleStore,
      unitId,
    );
    units.push({
      unitId,
      label: combatSandbox.unitLabels.get(unitId) ?? `Unit ${unitId}`,
      factionId: getFactionIdForUnit(combatSandbox.identityStore, unitId),
      memberCount: getUnitMembers(combatSandbox.identityStore, unitId).length,
      movementStyle: getUnitMovementStyle(combatSandbox.formationStore, unitId),
      accumulatedDamage: getUnitAccumulatedDamage(
        combatSandbox.survivabilityStore,
        unitId,
      ),
      assessmentPressureAverage: moraleAssessment.pressureAverage,
      assessmentMoraleState: moraleAssessment.moraleState,
      persistentMoraleState: persistentMorale.state,
      routingRisk: persistentMorale.routingRisk,
      recoveryProgress: persistentMorale.recoveryProgress,
      persistentPressure: persistentMorale.pressure,
      currentCohesion: persistentMorale.cohesion,
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

function createFormationDebugSnapshot(
  formationSandbox: FormationSandboxSimulationState,
): FormationDebugSnapshot {
  const unitIds = getUnitIds(formationSandbox.identityStore);
  return {
    units: unitIds.map((unitId) => ({
      unitId,
      label: formationSandbox.unitLabels.get(unitId) ?? `Unit ${unitId}`,
      factionId: getFactionIdForUnit(formationSandbox.identityStore, unitId),
      memberCount: getUnitMembers(formationSandbox.identityStore, unitId).length,
      movementStyle: getUnitMovementStyle(
        formationSandbox.formationStore,
        unitId,
      ),
      cohesion: getUnitCohesion(formationSandbox.formationStore, unitId),
    })),
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
      createScenarioFactionIdBuffer(
        simulation.world,
        simulation.combatSandbox,
        simulation.formationSandbox,
      ),
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
