import {
  collectCombatMoraleAssessmentsFromIndividualConsequences,
  collectCombatMoraleAssessments,
  type CombatMoraleAssessment,
} from "./combatMorale";
import { applyCombatConsequences } from "./combatConsequences";
import {
  advanceCombatPipelineOneTick,
  createCombatPipelineOutput,
} from "./combatPipeline";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getIndividualRole,
  type FormationTickDiagnostics,
  getUnitCohesion,
  getUnitMovementStyle,
} from "./formationBehaviour";
import { moveWorldOneTick } from "./movement";
import {
  advanceCombatPressureOneTick,
  advanceIndividualCombatPressureOneTick,
  createCombatPressureStore,
  getIndividualCombatPressureInspection,
} from "./combatPressure";
import {
  createCombatSurvivabilityStore,
  getUnitAccumulatedDamage,
} from "./combatSurvivability";
import { createCombatTempoStore } from "./combatTempo";
import {
  advancePersistentMoraleOneTick,
  createPersistentMoraleStore,
  getPersistentUnitMorale,
  getPersistentUnitMoraleState,
} from "./persistentMorale";
import { getIndividualCombatConsequenceSummaries } from "./individualCombatConsequences";
import {
  advanceIndividualCombatExchangeOneTick,
  completeIndividualCombatPipelineOneTick,
  createIndividualCombatPipelineBuffers,
  createIndividualCombatPipelineStores,
  createIndividualCombatProfileStoreFromUnitLoadouts,
  type IndividualCombatPipelineTickResult,
} from "./individualCombatPipeline";
import {
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
} from "./individualCasualtyLifecycle";
import {
  createIndividualCasualtyProcedureProfileStore,
  getIndividualCasualtyProcedureProfile,
  type IndividualCasualtyProcedureProfileConfig,
} from "./individualCasualtyProcedureProfile";
import {
  createIndividualCasualtyLocalQueryStore,
  prepareIndividualCasualtyLocalQuery,
} from "./individualCasualtyLocalQuery";
import {
  createCasualtyAssistanceDecisionBuffers,
  createCasualtyDragMovementBuffers,
  createCasualtyDragGroupStore,
  createIndividualDragHandCommitmentStore,
  createIndividualCasualtyAssistanceStore,
  advanceCasualtyDragGroupsBeforeCombat,
  cancelCasualtyDragGroupsFromPostCombatEvidence,
  projectCasualtyDragOrdinaryParticipation,
  refreshCasualtyDragMovementFinalPhaseCounts,
  decideIndividualCasualtyAssistance,
  getActiveCasualtyDragGroups,
  getIndividualCasualtyAssistanceInspection,
  hasUnreservedDragEligiblePatient,
} from "./individualCasualtyAssistance";
import {
  advanceIndividualDeathCountsOneTick,
  createIndividualDeathCountStore,
  getIndividualCasualtyHistoryInspection,
  getIndividualDeathCountInspection,
  initializeIndividualDeathCountsFromZeroHitTransitions,
} from "./individualDeathCount";
import {
  createIndividualGenericHerbStore,
  createTrustedIndividualMedicalProfileStore,
  getIndividualGenericHerbInspection,
  getTrustedIndividualMedicalProfile,
  type TrustedIndividualMedicalProfileConfig,
} from "./individualMedicalProfile";
import {
  advanceIndividualTraumaWithdrawalMovementOneTick,
  createIndividualMedicalLocalQueryStore,
  createIndividualMedicalUrgencyStore,
  getIndividualMedicalUrgencyInspection,
  prepareIndividualMedicalLocalQueries,
  projectIndividualMedicalUrgency,
  updateIndividualMedicalDiscoveryAndWithdrawalIntents,
} from "./individualMedicalReadModel";
import { createIndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import {
  createIndividualTraumaticWoundStore,
  getIndividualTraumaticWoundInspection,
  resolveIndividualTraumaticWoundOpportunities,
} from "./individualTraumaticWound";
import {
  getActiveMeleeWeaponCategory,
  getAttackCommitmentTicksRemaining,
  getAttackRecoveryTicksRemaining,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
  getLockedAttackTargetEntityId,
} from "./individualCombatAction";
import {
  isIndividualCombatEligible,
  projectIndividualCombatEligibilityFromHits,
} from "./individualCombatEligibility";
import { getIndividualCombatProfile } from "./individualCombatProfile";
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
import {
  getDefenceRecoveryTicksRemaining,
  getReadinessRecoveredThisTick,
  getReadinessSpentThisTick,
  getStoredGuardReadinessFixedPoint,
  GUARD_READINESS_RECOVERY,
  getIndividualGuardState,
  type IndividualMeleeDefenceRecord,
} from "./individualMeleeDefence";
import {
  NO_INDIVIDUAL_TARGET,
  getActiveMeleeDistances,
  getSelectedTargetEntityId,
} from "./individualMeleeTargetSelection";
import { quantizeEightDirection } from "./eightDirection";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
} from "./individualGlobalHits";
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
  LegacyCombatFoundationSimulationState,
  LiveCombatDebugSnapshot,
  LiveCombatDebugAttackOutcome,
  LiveCombatDebugDefenceOutcome,
  LiveCombatDebugIndividualSnapshot,
  LiveCombatDebugLandedHitGateOutcome,
  LiveCombatDebugUnitSnapshot,
  IndividualCombatVisualState,
  InspectedCombatVisualEvent,
  InspectedCombatVisualEventKind,
  PositionSimulationSnapshot,
  SimulationScenario,
  SimulationState,
  WorldState,
} from "./types";
import { createWorld } from "./world";

export const FIXED_TICKS_PER_SECOND = 20;

export type CombatSandboxTickStage =
  | "formation"
  | "individualPipeline"
  | "individualPressureAndCohesion"
  | "routingContagion"
  | "recoveryThreat"
  | "moraleAssessmentAndPersistence"
  | "countersAndSnapshots";

export interface CombatSandboxTickInstrumentation {
  runStage<T>(stage: CombatSandboxTickStage, run: () => T): T;
  readonly formationDiagnostics?: FormationTickDiagnostics;
}

interface SnapshotBuffers {
  readonly ids: Uint32Array;
  readonly positions: Int32Array;
  readonly factionIds: Uint8Array | undefined;
}

interface InitializedCombatSandbox {
  readonly state: CombatSandboxSimulationState;
  readonly rngState: number;
}

interface InitializedLegacyCombatFoundationSandbox {
  readonly state: LegacyCombatFoundationSimulationState;
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
  const configuredSandboxCount =
    (scenario.combatSandbox === undefined ? 0 : 1) +
    (scenario.legacyCombatFoundationSandbox === undefined ? 0 : 1) +
    (scenario.formationSandbox === undefined ? 0 : 1);
  if (configuredSandboxCount > 1) {
    throw new RangeError(
      "A scenario cannot configure more than one sandbox authority.",
    );
  }
  const initializedCombatSandbox =
    scenario.combatSandbox === undefined
      ? undefined
      : createCombatSandbox(
          initializedWorld.world,
          scenario.combatSandbox,
          scenario.seed,
        );
  const initializedLegacyCombatFoundationSandbox =
    scenario.legacyCombatFoundationSandbox === undefined
      ? undefined
      : createLegacyCombatFoundationSandbox(
          initializedWorld.world,
          scenario.legacyCombatFoundationSandbox,
          scenario.seed,
        );
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
    rngState:
      initializedCombatSandbox?.rngState ??
      initializedLegacyCombatFoundationSandbox?.rngState ??
      initializedWorld.rngState,
    world: initializedWorld.world,
    ...(initializedCombatSandbox === undefined
      ? {}
      : { combatSandbox: initializedCombatSandbox.state }),
    ...(initializedLegacyCombatFoundationSandbox === undefined
      ? {}
      : {
          legacyCombatFoundationSandbox:
            initializedLegacyCombatFoundationSandbox.state,
        }),
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
        initializedLegacyCombatFoundationSandbox?.state,
        initializedFormationSandbox,
      ),
  });

  return simulation;
}

/** Advances the complete simulation by exactly one fixed tick. */
export function advanceSimulationOneTick(simulation: SimulationState): void {
  const combatSandbox = simulation.combatSandbox;
  const legacyCombatFoundationSandbox =
    simulation.legacyCombatFoundationSandbox;
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
  } else if (
    combatSandbox === undefined &&
    legacyCombatFoundationSandbox === undefined
  ) {
    // Preserve the Foundation baseline for its standalone movement/perf tests.
    moveWorldOneTick(simulation.world);
  } else if (combatSandbox !== undefined) {
    advanceCombatSandboxOneTick(
      simulation.world,
      combatSandbox,
      simulation.tick,
    );
  } else if (legacyCombatFoundationSandbox !== undefined) {
    advanceLegacyCombatFoundationOneTick(
      simulation.world,
      legacyCombatFoundationSandbox,
    );
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
  const combatDebug =
    simulation.combatSandbox?.debugSnapshot ??
    simulation.legacyCombatFoundationSandbox?.debugSnapshot;
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
  const combatDebug =
    simulation.combatSandbox?.debugSnapshot ??
    simulation.legacyCombatFoundationSandbox?.debugSnapshot;
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
  const casualtyProcedureProfiles: IndividualCasualtyProcedureProfileConfig[] = [];
  const medicalProfiles: TrustedIndividualMedicalProfileConfig[] = [];

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
      casualtyProcedureProfiles.push({
        entityId,
        procedureKind: unit.casualtyProcedure.procedureKind,
        deathCountPolicy: unit.casualtyProcedure.deathCountPolicy,
      });
      medicalProfiles.push({
        entityId,
        hasChirurgeon: unit.medicalProfile?.hasChirurgeon ?? false,
        hasPhysick: unit.medicalProfile?.hasPhysick ?? false,
        ...(unit.medicalProfile?.startingGenericHerbs === undefined
          ? {}
          : { startingGenericHerbs: unit.medicalProfile.startingGenericHerbs }),
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
  const individualProfileStore =
    createIndividualCombatProfileStoreFromUnitLoadouts(
      identityStore,
      loadoutStore,
      new Map(scenario.units.map((unit) => [unit.unitId, unit.fortitudeLevels ?? 0])),
    );
  const individualCombatPipelineStores = createIndividualCombatPipelineStores(
    world,
    identityStore,
    formationStore,
    individualProfileStore,
    seed,
  );
  const individualCombatPipelineBuffers =
    createIndividualCombatPipelineBuffers();
  const individualCasualtyProcedureProfileStore =
    createIndividualCasualtyProcedureProfileStore({
      entityCount: world.entityCount,
      profiles: casualtyProcedureProfiles,
    });
  const individualCasualtyLifecycleStore =
    createIndividualCasualtyLifecycleStore(world.entityCount);
  const individualPlayerPresenceStore =
    createIndividualPlayerPresenceStore(world.entityCount);
  const trustedIndividualMedicalProfileStore =
    createTrustedIndividualMedicalProfileStore({
      entityCount: world.entityCount,
      profiles: medicalProfiles,
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
  const individualGenericHerbStore = createIndividualGenericHerbStore(
    trustedIndividualMedicalProfileStore,
  );
  const individualTraumaticWoundStore =
    createIndividualTraumaticWoundStore(world.entityCount);
  const individualMedicalUrgencyStore =
    createIndividualMedicalUrgencyStore(world.entityCount);
  const individualOrdinaryParticipationSnapshot =
    createIndividualOrdinaryParticipationSnapshot(world.entityCount);
  const casualtyAssistanceDecisionBuffers =
    createCasualtyAssistanceDecisionBuffers();
  const casualtyDragMovementBuffers = createCasualtyDragMovementBuffers();
  const combatSandbox: CombatSandboxSimulationState = {
    battleSeed: seed >>> 0,
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
    individualCasualtyProcedureProfileStore,
    individualCasualtyLifecycleStore,
    individualPlayerPresenceStore,
    individualDeathCountStore: createIndividualDeathCountStore(world.entityCount),
    trustedIndividualMedicalProfileStore,
    individualGenericHerbStore,
    individualTraumaticWoundStore,
    individualMedicalUrgencyStore,
    individualMedicalLocalQueryStore: createIndividualMedicalLocalQueryStore(
      world.entityCount,
      world.bounds,
    ),
    individualOrdinaryParticipationSnapshot,
    individualCasualtyLocalQueryStore: createIndividualCasualtyLocalQueryStore(
      world.entityCount,
      world.bounds,
    ),
    individualCasualtyAssistanceStore:
      createIndividualCasualtyAssistanceStore(world.entityCount),
    casualtyDragGroupStore: createCasualtyDragGroupStore(world.entityCount),
    individualDragHandCommitmentStore:
      createIndividualDragHandCommitmentStore(world.entityCount),
    casualtyDragMovementBuffers,
    casualtyDragMovementResult: {
      cancellationRecords: casualtyDragMovementBuffers.cancellationRecords,
      reachedSafetyRecords: casualtyDragMovementBuffers.reachedSafetyRecords,
      gatheringGroupCount: 0,
      draggingGroupCount: 0,
      reachedSafetyGroupCount: 0,
      movedParticipantCount: 0,
    },
    casualtyAssistanceDecisionBuffers,
    casualtyAssistanceDecisionResult: {
      rescueRequestedRecords:
        casualtyAssistanceDecisionBuffers.rescueRequestedRecords,
      groupStartedRecords: casualtyAssistanceDecisionBuffers.groupStartedRecords,
      noRescueRecords: casualtyAssistanceDecisionBuffers.noRescueRecords,
      dragEligiblePatientCount: 0,
      localCandidateCount: 0,
    },
    individualLifecycleTransitions: [],
    individualTerminalTransitions: [],
    individualTraumaticWoundOpportunities: [],
    individualTraumaticWoundRecords: [],
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
    individualCombatPipelineStores,
    individualCombatPipelineBuffers,
    inspectedEntityIds: scenario.inspectedEntityIds?.slice() ?? [],
    inspectedIndividuals: [],
    inspectedCombatVisualEvents: [],
    pressureStore: createCombatPressureStore(identityStore, formationStore),
    routingContagionStore: createRoutingContagionStore(identityStore),
    recoveryThreatStore: createRecoveryThreatStore(identityStore, world),
    persistentMoraleStore,
    unitLabels: new Map(
      scenario.units.map((unit) => [unit.unitId, unit.label ?? `Unit ${unit.unitId}`]),
    ),
    moraleMovementStates,
    pressureUpdates: [],
    routingContagionSummaries: [],
    recoveryThreatSummaries: [],
    moraleAssessments,
    moraleEvents: [],
    appliedDamagePressureScale: scenario.appliedDamagePressureScale,
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
    individualLifecycleTransitionCount: 0,
    individualTerminalTransitionCount: 0,
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
    totalIndividualLifecycleTransitionCount: 0,
    totalIndividualTerminalTransitionCount: 0,
    debugSnapshot: createEmptyCombatDebugSnapshot(),
  };
  combatSandbox.debugSnapshot = createCombatDebugSnapshot(combatSandbox, 0);

  return { state: combatSandbox, rngState: deploymentRng.state };
}

function createLegacyCombatFoundationSandbox(
  world: WorldState,
  scenario: CombatSandboxScenario,
  seed: number,
): InitializedLegacyCombatFoundationSandbox {
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
  const legacySandbox: LegacyCombatFoundationSimulationState = {
    identityStore,
    loadoutStore,
    formationStore,
    tempoStore,
    survivabilityStore,
    pipelineOutput: createCombatPipelineOutput(),
    consequenceApplications: [],
    pressureStore: createCombatPressureStore(identityStore, formationStore),
    persistentMoraleStore,
    unitLabels: new Map(
      scenario.units.map((unit) => [unit.unitId, unit.label ?? `Unit ${unit.unitId}`]),
    ),
    moraleMovementStates,
    pressureUpdates: [],
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
  legacySandbox.debugSnapshot =
    createLegacyCombatFoundationDebugSnapshot(legacySandbox);

  return { state: legacySandbox, rngState: deploymentRng.state };
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
    if (unit.casualtyProcedure === undefined) {
      throw new RangeError(
        "Live combat units require an explicit casualty procedure profile.",
      );
    }
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

  if (scenario.inspectedEntityIds !== undefined) {
    const inspectedEntityIds = new Set<number>();
    for (let index = 0; index < scenario.inspectedEntityIds.length; index += 1) {
      const entityId = scenario.inspectedEntityIds[index]!;
      assertNonNegativeSafeInteger(entityId, "inspectedEntityId");
      if (entityId >= world.entityCount || inspectedEntityIds.has(entityId)) {
        throw new RangeError(
          "Live combat inspected entity IDs must be unique world entity IDs.",
        );
      }
      inspectedEntityIds.add(entityId);
    }
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
  legacyCombatFoundationSandbox:
    | LegacyCombatFoundationSimulationState
    | undefined,
  formationSandbox: FormationSandboxSimulationState | undefined,
): Uint8Array | undefined {
  const identityStore =
    combatSandbox?.identityStore ??
    legacyCombatFoundationSandbox?.identityStore ??
    formationSandbox?.identityStore;
  return identityStore === undefined
    ? undefined
    : createFactionIdBuffer(world, identityStore);
}

export function advanceCombatSandboxOneTick(
  world: WorldState,
  combatSandbox: CombatSandboxSimulationState,
  tick: number,
  instrumentation?: CombatSandboxTickInstrumentation,
): void {
  const runStage = <T>(stage: CombatSandboxTickStage, run: () => T): T =>
    instrumentation === undefined ? run() : instrumentation.runStage(stage, run);

  const formationResult = runStage("formation", () => {
    projectIndividualMedicalUrgency(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.individualGlobalHitStore,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualCasualtyProcedureProfileStore,
      combatSandbox.individualTraumaticWoundStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
      combatSandbox.individualMedicalUrgencyStore,
    );
    prepareIndividualMedicalLocalQueries(
      world,
      combatSandbox.identityStore,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.trustedIndividualMedicalProfileStore,
      combatSandbox.individualGenericHerbStore,
      combatSandbox.individualTraumaticWoundStore,
      combatSandbox.individualMedicalUrgencyStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
      combatSandbox.moraleMovementStates,
      combatSandbox.individualMedicalLocalQueryStore,
    );
    updateIndividualMedicalDiscoveryAndWithdrawalIntents(
      world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.trustedIndividualMedicalProfileStore,
      combatSandbox.individualGenericHerbStore,
      combatSandbox.individualMedicalUrgencyStore,
      combatSandbox.individualMedicalLocalQueryStore,
    );
    projectCasualtyDragOrdinaryParticipation(
      combatSandbox.casualtyDragGroupStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
    );
    projectIndividualCombatEligibilityFromHits(
      combatSandbox.individualGlobalHitStore,
      combatSandbox.individualCombatEligibilitySnapshot,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
    );
    const result = advanceFormationOneTick(
      world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.moraleMovementStates,
      instrumentation?.formationDiagnostics,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
    );
    combatSandbox.casualtyDragMovementResult =
      advanceCasualtyDragGroupsBeforeCombat(
        world,
        combatSandbox.identityStore,
        combatSandbox.formationStore,
        combatSandbox.individualCasualtyLifecycleStore,
        combatSandbox.individualTraumaticWoundStore,
        combatSandbox.moraleMovementStates,
        combatSandbox.individualCasualtyAssistanceStore,
        combatSandbox.casualtyDragGroupStore,
        combatSandbox.individualDragHandCommitmentStore,
        tick,
        combatSandbox.casualtyDragMovementBuffers,
      );
    advanceIndividualTraumaWithdrawalMovementOneTick(
      world,
      combatSandbox.formationStore,
      combatSandbox.individualMedicalUrgencyStore,
    );
    return result;
  });
  const individualCombatResult = runStage("individualPipeline", () => {
    const individualCombatExchange = advanceIndividualCombatExchangeOneTick(
      world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.individualCombatPipelineStores,
      combatSandbox.individualCombatPipelineBuffers,
      tick,
      {
        lifecycleStore: combatSandbox.individualCasualtyLifecycleStore,
        ordinaryParticipation:
          combatSandbox.individualOrdinaryParticipationSnapshot,
        defenceHandAvailability:
          combatSandbox.individualDragHandCommitmentStore,
      },
    );
    applyIndividualZeroHitLifecycleTransitions(
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualPlayerPresenceStore,
      combatSandbox.individualCasualtyProcedureProfileStore,
      world,
      individualCombatExchange.hits.zeroHitEvents,
      tick,
      combatSandbox.individualLifecycleTransitions,
    );
    const traumaOpportunities =
      combatSandbox.individualTraumaticWoundOpportunities;
    traumaOpportunities.length = 0;
    for (
      let index = 0;
      index < combatSandbox.individualLifecycleTransitions.length;
      index += 1
    ) {
      const transition = combatSandbox.individualLifecycleTransitions[index]!;
      traumaOpportunities.push({
        targetEntityId: transition.entityId,
        attackerEntityId: transition.attackerEntityId,
        tick: transition.tick,
        triggerKind: "zeroHit",
      });
    }
    resolveIndividualTraumaticWoundOpportunities(
      combatSandbox.battleSeed,
      combatSandbox.individualCasualtyProcedureProfileStore,
      combatSandbox.individualTraumaticWoundStore,
      traumaOpportunities,
      combatSandbox.individualTraumaticWoundRecords,
    );
    initializeIndividualDeathCountsFromZeroHitTransitions(
      combatSandbox.individualDeathCountStore,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualCasualtyProcedureProfileStore,
      combatSandbox.individualProfileStore,
      combatSandbox.individualLifecycleTransitions,
    );
    // Future treatment completion belongs immediately before this boundary.
    advanceIndividualDeathCountsOneTick(
      combatSandbox.individualDeathCountStore,
      combatSandbox.individualCasualtyLifecycleStore,
      world,
      tick,
      combatSandbox.individualTerminalTransitions,
    );
    cancelCasualtyDragGroupsFromPostCombatEvidence(
      combatSandbox.identityStore,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualTraumaticWoundStore,
      combatSandbox.moraleMovementStates,
      combatSandbox.individualCasualtyAssistanceStore,
      combatSandbox.casualtyDragGroupStore,
      combatSandbox.individualDragHandCommitmentStore,
      individualCombatExchange.gate.decisions,
      tick,
      combatSandbox.casualtyDragMovementBuffers.cancellationRecords,
    );
    combatSandbox.casualtyDragMovementResult =
      refreshCasualtyDragMovementFinalPhaseCounts(
        combatSandbox.casualtyDragGroupStore,
        combatSandbox.casualtyDragMovementResult,
      );
    prepareIndividualCasualtyLocalQuery(
      world,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualCasualtyLocalQueryStore,
    );
    const completed = completeIndividualCombatPipelineOneTick(
      combatSandbox.identityStore,
      combatSandbox.individualCombatPipelineStores,
      individualCombatExchange,
      {
        lifecycleStore: combatSandbox.individualCasualtyLifecycleStore,
        ordinaryParticipation:
          combatSandbox.individualOrdinaryParticipationSnapshot,
      },
    );
    if (hasUnreservedDragEligiblePatient(
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualCasualtyAssistanceStore,
    )) {
      prepareIndividualMedicalLocalQueries(
        world,
        combatSandbox.identityStore,
        combatSandbox.individualCasualtyLifecycleStore,
        combatSandbox.trustedIndividualMedicalProfileStore,
        combatSandbox.individualGenericHerbStore,
        combatSandbox.individualTraumaticWoundStore,
        combatSandbox.individualMedicalUrgencyStore,
        combatSandbox.individualOrdinaryParticipationSnapshot,
        combatSandbox.moraleMovementStates,
        combatSandbox.individualMedicalLocalQueryStore,
      );
      combatSandbox.casualtyAssistanceDecisionResult =
        decideIndividualCasualtyAssistance(
          world,
          combatSandbox.identityStore,
          combatSandbox.formationStore,
          combatSandbox.individualCasualtyLifecycleStore,
          combatSandbox.trustedIndividualMedicalProfileStore,
          combatSandbox.individualTraumaticWoundStore,
          combatSandbox.individualOrdinaryParticipationSnapshot,
          combatSandbox.individualCombatActionStore,
          combatSandbox.moraleMovementStates,
          combatSandbox.individualMedicalLocalQueryStore,
          combatSandbox.individualCasualtyAssistanceStore,
          combatSandbox.casualtyDragGroupStore,
          tick,
          combatSandbox.casualtyAssistanceDecisionBuffers,
        );
    } else {
      const buffers = combatSandbox.casualtyAssistanceDecisionBuffers;
      buffers.rescueRequestedRecords.length = 0;
      buffers.groupStartedRecords.length = 0;
      buffers.noRescueRecords.length = 0;
      combatSandbox.casualtyAssistanceDecisionResult = {
        rescueRequestedRecords: buffers.rescueRequestedRecords,
        groupStartedRecords: buffers.groupStartedRecords,
        noRescueRecords: buffers.noRescueRecords,
        dragEligiblePatientCount: 0,
        localCandidateCount: 0,
      };
    }
    return completed;
  });
  runStage("individualPressureAndCohesion", () =>
    advanceIndividualCombatPressureOneTick(
      world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      individualCombatResult.consequenceSummaries,
      individualCombatResult.attackAttempts,
      individualCombatResult.defenceRecords,
      individualCombatResult.gateDecisions,
      individualCombatResult.hitApplications,
      individualCombatResult.zeroHitEvents,
      combatSandbox.individualCombatEligibilitySnapshot,
      combatSandbox.pressureStore,
      combatSandbox.pressureUpdates,
      {
        appliedDamagePressureScale: combatSandbox.appliedDamagePressureScale,
      },
      combatSandbox.moraleMovementStates,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
    ),
  );
  runStage("routingContagion", () =>
    advanceRoutingContagionOneTick(
      world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.moraleMovementStates,
      formationResult.routingPassThroughInteractions,
      combatSandbox.routingContagionStore,
      combatSandbox.routingContagionSummaries,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
    ),
  );
  runStage("recoveryThreat", () =>
    collectRecoveryThreatSummaries(
      world,
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      combatSandbox.recoveryThreatStore,
      combatSandbox.recoveryThreatSummaries,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualOrdinaryParticipationSnapshot,
    ),
  );
  runStage("moraleAssessmentAndPersistence", () => {
    collectCombatMoraleAssessmentsFromIndividualConsequences(
      combatSandbox.identityStore,
      combatSandbox.formationStore,
      individualCombatResult.consequenceSummaries,
      combatSandbox.moraleAssessments,
      combatSandbox.individualCasualtyLifecycleStore,
      combatSandbox.individualCombatEligibilitySnapshot,
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
        lifecycleStore: combatSandbox.individualCasualtyLifecycleStore,
        ordinaryParticipation:
          combatSandbox.individualOrdinaryParticipationSnapshot,
      },
    );
    syncMoraleMovementStates(combatSandbox);
  });
  runStage("countersAndSnapshots", () => {
    updateIndividualCombatCounters(combatSandbox, individualCombatResult);
    combatSandbox.debugSnapshot = createCombatDebugSnapshot(combatSandbox, tick);
  });
}

function advanceLegacyCombatFoundationOneTick(
  world: WorldState,
  legacySandbox: LegacyCombatFoundationSimulationState,
): void {
  advanceFormationOneTick(
    world,
    legacySandbox.identityStore,
    legacySandbox.formationStore,
    legacySandbox.moraleMovementStates,
  );
  const pipelineResult = advanceCombatPipelineOneTick(
    world,
    legacySandbox.identityStore,
    legacySandbox.loadoutStore,
    legacySandbox.formationStore,
    legacySandbox.tempoStore,
    legacySandbox.survivabilityStore,
    legacySandbox.pipelineOutput,
  );
  const consequenceResult = applyCombatConsequences(
    legacySandbox.identityStore,
    legacySandbox.formationStore,
    pipelineResult.applications,
    legacySandbox.consequenceApplications,
    {
      appliedDamagePressureScale: legacySandbox.appliedDamagePressureScale,
    },
  );
  advanceCombatPressureOneTick(
    legacySandbox.identityStore,
    legacySandbox.formationStore,
    pipelineResult.opportunities,
    consequenceResult.applications,
    legacySandbox.pressureStore,
    legacySandbox.pressureUpdates,
    {},
    legacySandbox.moraleMovementStates,
  );
  collectCombatMoraleAssessments(
    legacySandbox.identityStore,
    legacySandbox.formationStore,
    consequenceResult.applications,
    legacySandbox.moraleAssessments,
  );
  advancePersistentMoraleOneTick(
    legacySandbox.identityStore,
    legacySandbox.formationStore,
    legacySandbox.moraleAssessments,
    legacySandbox.persistentMoraleStore,
    legacySandbox.moraleEvents,
    {
      pressureUpdates: legacySandbox.pressureUpdates,
    },
  );
  syncMoraleMovementStatesForStores(
    legacySandbox.identityStore,
    legacySandbox.persistentMoraleStore,
    legacySandbox.moraleMovementStates,
  );

  legacySandbox.opportunityCount = pipelineResult.opportunities.length;
  legacySandbox.strikeCount = pipelineResult.strikes.length;
  legacySandbox.survivabilityApplicationCount =
    pipelineResult.applications.length;
  legacySandbox.consequenceCount = consequenceResult.applications.length;
  legacySandbox.totalOpportunityCount += pipelineResult.opportunities.length;
  legacySandbox.totalStrikeCount += pipelineResult.strikes.length;
  legacySandbox.totalSurvivabilityApplicationCount +=
    pipelineResult.applications.length;
  legacySandbox.totalConsequenceCount += consequenceResult.applications.length;
  legacySandbox.debugSnapshot =
    createLegacyCombatFoundationDebugSnapshot(legacySandbox);
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
  combatSandbox.individualLifecycleTransitionCount =
    combatSandbox.individualLifecycleTransitions.length;
  combatSandbox.individualTerminalTransitionCount =
    combatSandbox.individualTerminalTransitions.length;
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
  combatSandbox.totalIndividualLifecycleTransitionCount +=
    combatSandbox.individualLifecycleTransitions.length;
  combatSandbox.totalIndividualTerminalTransitionCount +=
    combatSandbox.individualTerminalTransitions.length;
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
    attackAttemptCount: 0,
    preventedAttackCount: 0,
    landedOutcomeCount: 0,
    gateAcceptedHitCount: 0,
    appliedHitLoss: 0,
    newlyZeroMemberCount: 0,
    lifecycleTransitionCount: 0,
    terminalTransitionCount: 0,
    activeDragGroupCount: 0,
    rescueRequestedCount: 0,
    dragGroupStartedCount: 0,
    noRescueCount: 0,
    gatheringDragGroupCount: 0,
    draggingDragGroupCount: 0,
    reachedSafetyDragGroupCount: 0,
    dragCancellationCount: 0,
    dragReachedSafetyCount: 0,
    tickStartEligibleMemberCount: 0,
    endOfTickEligibleMemberCount: 0,
    endOfTickZeroHitMemberCount: 0,
    totalAttackAttemptCount: 0,
    totalPreventedAttackCount: 0,
    totalLandedOutcomeCount: 0,
    totalGateAcceptedHitCount: 0,
    totalAppliedHitLoss: 0,
    totalNewlyZeroMemberCount: 0,
    totalLifecycleTransitionCount: 0,
    totalTerminalTransitionCount: 0,
    units: [],
    inspectedIndividuals: [],
    individualCombatVisuals: [],
    inspectedCombatVisualEvents: [],
  };
}

function createCombatDebugSnapshot(
  combatSandbox: CombatSandboxSimulationState,
  tick: number,
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
    const unitSummary = combatSandbox.individualCombatUnitSummaries[unitIndex];
    const consequenceSummary =
      combatSandbox.individualCombatConsequenceSummaries[unitIndex];
    if (
      unitSummary === undefined ||
      unitSummary.unitId !== unitId ||
      consequenceSummary === undefined ||
      consequenceSummary.unitId !== unitId
    ) {
      throw new Error("Live combat individual summaries are out of sync.");
    }
    units.push({
      unitId,
      label: combatSandbox.unitLabels.get(unitId) ?? `Unit ${unitId}`,
      factionId: getFactionIdForUnit(combatSandbox.identityStore, unitId),
      memberCount: getUnitMembers(combatSandbox.identityStore, unitId).length,
      movementStyle: getUnitMovementStyle(combatSandbox.formationStore, unitId),
      assessmentPressureAverage: moraleAssessment.pressureAverage,
      assessmentMoraleState: moraleAssessment.moraleState,
      persistentMoraleState: persistentMorale.state,
      routingRisk: persistentMorale.routingRisk,
      recoveryProgress: persistentMorale.recoveryProgress,
      persistentPressure: persistentMorale.pressure,
      currentCohesion: persistentMorale.cohesion,
      tickStartEligibleMembers: consequenceSummary.tickStartEligibleMembers,
      endOfTickEligibleMembers: consequenceSummary.endOfTickEligibleMembers,
      endOfTickZeroHitMembers: unitSummary.endOfTickZeroHitMemberCount,
      attackAttempts: unitSummary.attackAttemptCount,
      preventedAttacks: consequenceSummary.incomingPreventedAttacks,
      landedOutcomes: consequenceSummary.incomingLandedOutcomes,
      gateAcceptedHits: consequenceSummary.incomingGateAcceptedHits,
      appliedHitLoss: consequenceSummary.incomingAppliedHitLoss,
      newlyZeroMembers: consequenceSummary.newlyZeroMembers,
    });
  }

  return {
    attackAttemptCount: combatSandbox.individualAttackAttemptCount,
    preventedAttackCount:
      combatSandbox.individualParryCount +
      combatSandbox.individualBucklerBlockCount +
      combatSandbox.individualShieldBlockCount,
    landedOutcomeCount: combatSandbox.individualLandedDefenceOutcomeCount,
    gateAcceptedHitCount: combatSandbox.individualGateAcceptedHitCount,
    appliedHitLoss: combatSandbox.individualAppliedHitLoss,
    newlyZeroMemberCount: combatSandbox.individualNewlyZeroHitMemberCount,
    lifecycleTransitionCount:
      combatSandbox.individualLifecycleTransitionCount,
    terminalTransitionCount:
      combatSandbox.individualTerminalTransitionCount,
    activeDragGroupCount: getActiveCasualtyDragGroups(
      combatSandbox.casualtyDragGroupStore,
    ).length,
    rescueRequestedCount:
      combatSandbox.casualtyAssistanceDecisionResult.rescueRequestedRecords.length,
    dragGroupStartedCount:
      combatSandbox.casualtyAssistanceDecisionResult.groupStartedRecords.length,
    noRescueCount:
      combatSandbox.casualtyAssistanceDecisionResult.noRescueRecords.length,
    gatheringDragGroupCount: combatSandbox.casualtyDragMovementResult.gatheringGroupCount,
    draggingDragGroupCount: combatSandbox.casualtyDragMovementResult.draggingGroupCount,
    reachedSafetyDragGroupCount: combatSandbox.casualtyDragMovementResult.reachedSafetyGroupCount,
    dragCancellationCount: combatSandbox.casualtyDragMovementResult.cancellationRecords.length,
    dragReachedSafetyCount: combatSandbox.casualtyDragMovementResult.reachedSafetyRecords.length,
    tickStartEligibleMemberCount:
      combatSandbox.individualTickStartCombatEligibleMemberCount,
    endOfTickEligibleMemberCount:
      combatSandbox.individualEndOfTickCombatEligibleMemberCount,
    endOfTickZeroHitMemberCount:
      combatSandbox.individualEndOfTickZeroHitMemberCount,
    totalAttackAttemptCount: combatSandbox.totalIndividualAttackAttemptCount,
    totalPreventedAttackCount:
      combatSandbox.totalIndividualParryCount +
      combatSandbox.totalIndividualBucklerBlockCount +
      combatSandbox.totalIndividualShieldBlockCount,
    totalLandedOutcomeCount:
      combatSandbox.totalIndividualLandedDefenceOutcomeCount,
    totalGateAcceptedHitCount: combatSandbox.totalIndividualGateAcceptedHitCount,
    totalAppliedHitLoss: combatSandbox.totalIndividualAppliedHitLoss,
    totalNewlyZeroMemberCount: combatSandbox.totalIndividualNewlyZeroHitMemberCount,
    totalLifecycleTransitionCount:
      combatSandbox.totalIndividualLifecycleTransitionCount,
    totalTerminalTransitionCount:
      combatSandbox.totalIndividualTerminalTransitionCount,
    units,
    inspectedIndividuals: collectInspectedIndividualSnapshots(combatSandbox),
    individualCombatVisuals: collectIndividualCombatVisualStates(combatSandbox),
    inspectedCombatVisualEvents: collectInspectedCombatVisualEvents(
      combatSandbox,
      tick,
    ),
  };
}

function collectInspectedIndividualSnapshots(
  combatSandbox: CombatSandboxSimulationState,
): readonly LiveCombatDebugIndividualSnapshot[] {
  const out = combatSandbox.inspectedIndividuals;
  out.length = 0;
  for (
    let index = 0;
    index < combatSandbox.inspectedEntityIds.length;
    index += 1
  ) {
    const entityId = combatSandbox.inspectedEntityIds[index]!;
    const selectedTargetEntityId = getSelectedTargetEntityId(
      combatSandbox.individualTargetSelectionStore,
      entityId,
    );
    const lockedTargetEntityId = getLockedAttackTargetEntityId(
      combatSandbox.individualCombatActionStore,
      entityId,
    );
    const facing = getIndividualCombatFacing(
      combatSandbox.individualCombatActionStore,
      entityId,
    );
    const profile = getIndividualCombatProfile(
      combatSandbox.individualProfileStore,
      entityId,
    );
    const selectedTargetRecord = getThisTickSelectedTargetRecord(
      combatSandbox,
      entityId,
    );
    const defenceRecord = getThisTickDefenceRecord(combatSandbox, entityId);
    const pressureInspection = getIndividualCombatPressureInspection(
      combatSandbox.formationStore,
      combatSandbox.pressureStore,
      entityId,
    );
    const deathCount = getIndividualDeathCountInspection(
      combatSandbox.individualDeathCountStore,
      entityId,
    );
    const casualtyHistory = getIndividualCasualtyHistoryInspection(
      combatSandbox.individualDeathCountStore,
      entityId,
    );
    const medicalProfile = getTrustedIndividualMedicalProfile(
      combatSandbox.trustedIndividualMedicalProfileStore,
      entityId,
    );
    const herbs = getIndividualGenericHerbInspection(
      combatSandbox.individualGenericHerbStore,
      entityId,
    );
    const traumaticWound = getIndividualTraumaticWoundInspection(
      combatSandbox.individualTraumaticWoundStore,
      entityId,
    );
    const medicalUrgency = getIndividualMedicalUrgencyInspection(
      combatSandbox.individualMedicalUrgencyStore,
      entityId,
    );
    const casualtyAssistance = getIndividualCasualtyAssistanceInspection(
      combatSandbox.individualCasualtyAssistanceStore,
      entityId,
    );
    const casualtyDragFreeHands =
      combatSandbox.individualDragHandCommitmentStore.getFreeHands(entityId);

    out.push({
      entityId,
      unitId: getUnitIdForEntity(combatSandbox.identityStore, entityId),
      casualtyProcedureKind: getIndividualCasualtyProcedureProfile(
        combatSandbox.individualCasualtyProcedureProfileStore,
        entityId,
      ).procedureKind,
      characterLifecycleState: getIndividualCharacterLifecycleState(
        combatSandbox.individualCasualtyLifecycleStore,
        entityId,
      ),
      playerPresenceState: getIndividualPlayerPresenceState(
        combatSandbox.individualPlayerPresenceStore,
        entityId,
      ),
      deathCountDurationTicks: deathCount.durationTicks,
      deathCountRemainingTicks: deathCount.remainingTicks,
      deathCountPaused: deathCount.paused,
      ...(deathCount.pauseSource === undefined
        ? {}
        : { deathCountPauseSource: deathCount.pauseSource }),
      firstZeroHitTick: casualtyHistory.firstZeroHitTick,
      latestZeroHitTick: casualtyHistory.latestZeroHitTick,
      dyingTransitionCount: casualtyHistory.dyingTransitionCount,
      terminalTick: casualtyHistory.terminalTick,
      terminalCause: casualtyHistory.terminalCause,
      terminalX: casualtyHistory.terminalX,
      terminalY: casualtyHistory.terminalY,
      hasChirurgeon: medicalProfile.hasChirurgeon,
      hasPhysick: medicalProfile.hasPhysick,
      currentGenericHerbs: herbs.current,
      maximumGenericHerbs: herbs.maximum,
      reservedGenericHerbs: herbs.reserved,
      traumaticWoundState: traumaticWound.state,
      traumaticWoundEpisodeCount: traumaticWound.episodeCount,
      latestTraumaticWoundTick: traumaticWound.latestEpisodeTick,
      latestTraumaticWoundAttackerEntityId:
        traumaticWound.latestAttackerEntityId,
      latestTraumaticWoundTriggerKind: traumaticWound.latestTriggerKind,
      medicalUrgencyKind: medicalUrgency.urgencyKind,
      medicalUrgencyPriority: medicalUrgency.urgencyPriority,
      traumaWithdrawalActive: medicalUrgency.traumaWithdrawalActive,
      traumaWithdrawalGoalKind: medicalUrgency.withdrawalGoalKind,
      withdrawalTargetPhysickEntityId:
        medicalUrgency.withdrawalTargetPhysickEntityId,
      localPatientCandidateCount: medicalUrgency.localPatientCandidateCount,
      localPhysickCandidateCount: medicalUrgency.localPhysickCandidateCount,
      withdrawalThreatCount: medicalUrgency.withdrawalThreatCount,
      casualtyAssistanceState: casualtyAssistance.state,
      casualtyDragGroupId: casualtyAssistance.dragGroupId,
      casualtyAssistanceDestinationX: casualtyAssistance.destinationX,
      casualtyAssistanceDestinationY: casualtyAssistance.destinationY,
      ...(casualtyDragFreeHands === undefined
        ? {}
        : { casualtyDragFreeHands }),
      tickStartCombatEligible: isIndividualCombatEligible(
        combatSandbox.individualCombatEligibilitySnapshot,
        entityId,
      ),
      selectedTargetEntityId:
        selectedTargetEntityId === NO_INDIVIDUAL_TARGET
          ? null
          : selectedTargetEntityId,
      selectedTargetDistanceSquared:
        selectedTargetRecord?.targetEntityId === selectedTargetEntityId
          ? selectedTargetRecord.distanceSquared
          : null,
      selectedTargetWithinPreferredDistance:
        selectedTargetRecord?.targetEntityId === selectedTargetEntityId
          ? selectedTargetRecord.withinPreferredDistance
          : null,
      actionState: getIndividualCombatActionState(
        combatSandbox.individualCombatActionStore,
        entityId,
      ),
      lockedTargetEntityId:
        lockedTargetEntityId === NO_INDIVIDUAL_TARGET
          ? null
          : lockedTargetEntityId,
      facing,
      commitmentTicksRemaining: getAttackCommitmentTicksRemaining(
        combatSandbox.individualCombatActionStore,
        entityId,
      ),
      attackRecoveryTicksRemaining: getAttackRecoveryTicksRemaining(
        combatSandbox.individualCombatActionStore,
        entityId,
      ),
      guardState: getIndividualGuardState(
        combatSandbox.individualMeleeDefenceStore,
        entityId,
      ),
      defenceRecoveryTicksRemaining: getDefenceRecoveryTicksRemaining(
        combatSandbox.individualMeleeDefenceStore,
        entityId,
      ),
      activeWeapon: getActiveMeleeWeaponCategory(
        combatSandbox.individualCombatActionStore,
        entityId,
      ),
      shieldCategory: profile.shieldCategory,
      shieldCarriedState: profile.shieldCarriedState,
      currentGlobalHits: getIndividualCurrentGlobalHits(
        combatSandbox.individualGlobalHitStore,
        entityId,
      ),
      maximumGlobalHits: getIndividualMaximumGlobalHits(
        combatSandbox.individualGlobalHitStore,
        entityId,
      ),
      thisTickAttackOutcome: getThisTickAttackOutcome(combatSandbox, entityId),
      thisTickDefenceOutcome: getThisTickDefenceOutcome(combatSandbox, entityId),
      thisTickOutgoingDefenceOutcome: getThisTickOutgoingDefenceOutcome(
        combatSandbox,
        entityId,
      ),
      thisTickLandedHitGateOutcome: getThisTickLandedHitGateOutcome(
        combatSandbox,
        entityId,
      ),
      defenceCoverageTier: defenceRecord?.defenceCoverageTier ?? "none",
      defenceReadinessFixedPoint:
        defenceRecord?.defenceReadinessFixedPoint ?? 0,
      storedGuardReadinessFixedPoint: getStoredGuardReadinessFixedPoint(
        combatSandbox.individualMeleeDefenceStore,
        entityId,
      ),
      effectiveGuardReadinessFixedPoint:
        defenceRecord?.effectiveGuardReadinessFixedPoint ??
        (getIndividualCombatActionState(
          combatSandbox.individualCombatActionStore,
          entityId,
        ) === "ready"
          ? getStoredGuardReadinessFixedPoint(
              combatSandbox.individualMeleeDefenceStore,
              entityId,
            )
          : 0),
      guardReadinessRecoveryPerTick:
        GUARD_READINESS_RECOVERY[
          getIndividualRole(combatSandbox.formationStore, entityId)
        ],
      guardReadinessSpentThisTick: getReadinessSpentThisTick(
        combatSandbox.individualMeleeDefenceStore,
        entityId,
      ),
      guardReadinessRecoveredThisTick: getReadinessRecoveredThisTick(
        combatSandbox.individualMeleeDefenceStore,
        entityId,
      ),
      guardReadinessOffensivelySuppressed:
        getIndividualCombatActionState(
          combatSandbox.individualCombatActionStore,
          entityId,
        ) !== "ready",
      rearDesperateDefenceApplied:
        defenceRecord?.rearDesperateDefenceApplied ?? false,
      calculatedDefenceChanceFixedPoint:
        defenceRecord?.calculatedDefenceChanceFixedPoint ?? 0,
      deterministicDefenceRollFixedPoint:
        defenceRecord?.deterministicDefenceRollFixedPoint ?? 0,
      chosenDefenceSource: defenceRecord?.availableDefenceType ?? "none",
      defenceResolution: defenceRecord?.defenceResolution ?? "none",
      ...getThisTickIncomingDefenceCounts(combatSandbox, entityId),
      thisTickAppliedHitLoss: getThisTickAppliedHitLoss(
        combatSandbox,
        entityId,
      ),
      reachedZeroHitsThisTick: reachedZeroHitsThisTick(
        combatSandbox,
        entityId,
      ),
      currentPressure: pressureInspection.currentPressure,
      proximityPressureFloor: pressureInspection.proximityFloor,
      nearbyHostileCount: pressureInspection.nearbyHostileCount,
      nearbyAllyCount: pressureInspection.nearbyAllyCount,
      incomingAttackPressureImpulse:
        pressureInspection.incomingAttackImpulse,
      selectedDefenceOutcomePressureContribution:
        pressureInspection.selectedOutcomeContribution,
      incomingHitPressureImpulse: pressureInspection.incomingHitImpulse,
      blockedStrikePressureImpulse:
        pressureInspection.blockedStrikeImpulse,
      pressureRecoveryPauseTicksRemaining:
        pressureInspection.recoveryPauseTicksRemaining,
      pressureRecoveryContext: pressureInspection.recoveryContext,
      pressureRecoveryCreditApplied:
        pressureInspection.recoveryCreditApplied,
      recoveredPressureAmount: pressureInspection.recoveredPressureAmount,
    });
  }
  return out;
}

function collectIndividualCombatVisualStates(
  combatSandbox: CombatSandboxSimulationState,
): readonly IndividualCombatVisualState[] {
  const out: IndividualCombatVisualState[] = [];
  for (
    let index = 0;
    index < combatSandbox.inspectedEntityIds.length;
    index += 1
  ) {
    const entityId = combatSandbox.inspectedEntityIds[index]!;
    const facing = getIndividualCombatFacing(
      combatSandbox.individualCombatActionStore,
      entityId,
    );
    const facingOctant = quantizeEightDirection(facing.x, facing.y).octantIndex;
    const profile = getIndividualCombatProfile(
      combatSandbox.individualProfileStore,
      entityId,
    );
    const weaponCategory = getActiveMeleeWeaponCategory(
      combatSandbox.individualCombatActionStore,
      entityId,
    );
    const distances = getActiveMeleeDistances(profile);
    out.push({
      entityId,
      facingOctant,
      weaponCategory,
      weaponThreatDistance: distances.threat,
      weaponPreferredMinimumDistance: distances.preferredMinimum,
      attackArcOctants: 3,
      shieldCategory: profile.shieldCategory,
      shieldHeld: profile.shieldCarriedState === "held",
      armourCategory: profile.armourCategory,
    });
  }
  return out;
}

function collectInspectedCombatVisualEvents(
  combatSandbox: CombatSandboxSimulationState,
  tick: number,
): readonly InspectedCombatVisualEvent[] {
  const out = combatSandbox.inspectedCombatVisualEvents;
  out.length = 0;
  if (combatSandbox.inspectedEntityIds.length === 0) {
    return out;
  }
  const buffers = combatSandbox.individualCombatPipelineBuffers;

  for (let index = 0; index < buffers.attackAttempts.length; index += 1) {
    const record = buffers.attackAttempts[index]!;
    if (
      record.outcome !== "attempted" ||
      !isInspectedParticipant(
        combatSandbox,
        record.attackerEntityId,
        record.targetEntityId,
      )
    ) {
      continue;
    }
    out.push(
      combatVisualEvent(
        tick,
        record.attackerEntityId,
        record.targetEntityId,
        "attackAttempt",
        0,
      ),
    );
  }
  canonicalizeRecentEvents(out, "attackAttempt");

  const defenceStart = out.length;
  for (let index = 0; index < buffers.defenceRecords.length; index += 1) {
    const record = buffers.defenceRecords[index]!;
    if (
      !isInspectedParticipant(
        combatSandbox,
        record.attackerEntityId,
        record.defenderEntityId,
      )
    ) {
      continue;
    }
    out.push(
      combatVisualEvent(
        tick,
        record.attackerEntityId,
        record.defenderEntityId,
        defenceRecordToVisualKind(record),
        0,
      ),
    );
  }
  canonicalizeRecentEvents(out, defenceStart);

  const gateStart = out.length;
  for (let index = 0; index < buffers.gateDecisions.length; index += 1) {
    const decision = buffers.gateDecisions[index]!;
    if (
      !isInspectedParticipant(
        combatSandbox,
        decision.attackerEntityId,
        decision.targetEntityId,
      )
    ) {
      continue;
    }
    out.push(
      combatVisualEvent(
        tick,
        decision.attackerEntityId,
        decision.targetEntityId,
        decision.outcome === "accepted" ? "gateAccepted" : "gateRejected",
        0,
      ),
    );
  }
  canonicalizeRecentEvents(out, gateStart);

  const hitStart = out.length;
  for (let index = 0; index < buffers.hitApplications.length; index += 1) {
    const application = buffers.hitApplications[index]!;
    if (
      application.appliedHitLoss <= 0 ||
      !isInspectedParticipant(
        combatSandbox,
        application.attackerEntityId,
        application.targetEntityId,
      )
    ) {
      continue;
    }
    out.push(
      combatVisualEvent(
        tick,
        application.attackerEntityId,
        application.targetEntityId,
        "hitApplied",
        application.appliedHitLoss,
      ),
    );
  }
  canonicalizeRecentEvents(out, hitStart);

  const zeroStart = out.length;
  for (let index = 0; index < buffers.zeroHitEvents.length; index += 1) {
    const event = buffers.zeroHitEvents[index]!;
    if (
      !isInspectedParticipant(
        combatSandbox,
        event.attackerEntityId,
        event.entityId,
      )
    ) {
      continue;
    }
    out.push(
      combatVisualEvent(
        tick,
        event.attackerEntityId,
        event.entityId,
        "zeroHit",
        0,
      ),
    );
  }
  canonicalizeRecentEvents(out, zeroStart);

  return out;
}

function combatVisualEvent(
  tick: number,
  attackerEntityId: number,
  targetEntityId: number,
  kind: InspectedCombatVisualEventKind,
  appliedHitLoss: number,
): InspectedCombatVisualEvent {
  return {
    tick,
    attackerEntityId,
    targetEntityId,
    kind,
    appliedHitLoss,
  };
}

function canonicalizeRecentEvents(
  events: InspectedCombatVisualEvent[],
  startOrKind: number | InspectedCombatVisualEventKind,
): void {
  const start =
    typeof startOrKind === "number"
      ? startOrKind
      : events.findIndex((event) => event.kind === startOrKind);
  if (start < 0) {
    return;
  }
  const sorted = events
    .slice(start)
    .sort(
      (left, right) =>
        left.targetEntityId - right.targetEntityId ||
        left.attackerEntityId - right.attackerEntityId ||
        compareCombatVisualEventKind(left.kind, right.kind),
    );
  events.splice(start, sorted.length, ...sorted);
}

function compareCombatVisualEventKind(
  left: InspectedCombatVisualEventKind,
  right: InspectedCombatVisualEventKind,
): number {
  return combatVisualEventKindOrder(left) - combatVisualEventKindOrder(right);
}

function combatVisualEventKindOrder(kind: InspectedCombatVisualEventKind): number {
  switch (kind) {
    case "attackAttempt":
      return 0;
    case "parry":
      return 1;
    case "bucklerBlock":
      return 2;
    case "shieldBlock":
      return 3;
    case "failedDefence":
      return 4;
    case "landed":
      return 5;
    case "gateAccepted":
      return 6;
    case "gateRejected":
      return 7;
    case "hitApplied":
      return 8;
    case "zeroHit":
      return 9;
  }
}

function defenceRecordToVisualKind(
  record: IndividualMeleeDefenceRecord,
): InspectedCombatVisualEventKind {
  if (record.defenceResolution === "failedDefence") {
    return "failedDefence";
  }
  switch (record.outcome) {
    case "parried":
      return "parry";
    case "bucklerBlocked":
      return "bucklerBlock";
    case "shieldBlocked":
      return "shieldBlock";
    case "landed":
      return "landed";
  }
}

function isInspectedParticipant(
  combatSandbox: CombatSandboxSimulationState,
  attackerEntityId: number,
  targetEntityId: number,
): boolean {
  for (
    let index = 0;
    index < combatSandbox.inspectedEntityIds.length;
    index += 1
  ) {
    const inspectedEntityId = combatSandbox.inspectedEntityIds[index]!;
    if (
      inspectedEntityId === attackerEntityId ||
      inspectedEntityId === targetEntityId
    ) {
      return true;
    }
  }
  return false;
}

function getThisTickSelectedTargetRecord(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
):
  | CombatSandboxSimulationState["individualCombatPipelineBuffers"]["selectedTargetRecords"][number]
  | undefined {
  const records =
    combatSandbox.individualCombatPipelineBuffers.selectedTargetRecords;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.sourceEntityId === entityId) {
      return record;
    }
  }
  return undefined;
}

function getThisTickAttackOutcome(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): LiveCombatDebugAttackOutcome {
  let outcome: LiveCombatDebugAttackOutcome = "none";
  const attempts = combatSandbox.individualCombatPipelineBuffers.attackAttempts;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index]!;
    if (attempt.attackerEntityId === entityId) {
      outcome = attempt.outcome;
    }
  }
  return outcome;
}

function getThisTickDefenceOutcome(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): LiveCombatDebugDefenceOutcome {
  let outcome: LiveCombatDebugDefenceOutcome = "none";
  const records = combatSandbox.individualCombatPipelineBuffers.defenceRecords;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.defenderEntityId === entityId) {
      outcome = record.outcome;
    }
  }
  return outcome;
}

function getThisTickDefenceRecord(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): IndividualMeleeDefenceRecord | undefined {
  let latest: IndividualMeleeDefenceRecord | undefined;
  const records = combatSandbox.individualCombatPipelineBuffers.defenceRecords;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.defenderEntityId === entityId) {
      latest = record;
    }
  }
  return latest;
}

function getThisTickOutgoingDefenceOutcome(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): LiveCombatDebugDefenceOutcome {
  let outcome: LiveCombatDebugDefenceOutcome = "none";
  const records = combatSandbox.individualCombatPipelineBuffers.defenceRecords;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.attackerEntityId === entityId) {
      outcome = record.outcome;
    }
  }
  return outcome;
}

function getThisTickLandedHitGateOutcome(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): LiveCombatDebugLandedHitGateOutcome {
  let outcome: LiveCombatDebugLandedHitGateOutcome = "none";
  const decisions = combatSandbox.individualCombatPipelineBuffers.gateDecisions;
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index]!;
    if (decision.attackerEntityId === entityId) {
      outcome = decision.outcome;
    }
  }
  return outcome;
}

function getThisTickIncomingDefenceCounts(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): Pick<
  LiveCombatDebugIndividualSnapshot,
  | "thisTickIncomingParryCount"
  | "thisTickIncomingBucklerBlockCount"
  | "thisTickIncomingShieldBlockCount"
  | "thisTickIncomingLandedCount"
> {
  let parries = 0;
  let bucklerBlocks = 0;
  let shieldBlocks = 0;
  let landed = 0;
  const records = combatSandbox.individualCombatPipelineBuffers.defenceRecords;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.defenderEntityId !== entityId) {
      continue;
    }
    if (record.outcome === "parried") parries += 1;
    else if (record.outcome === "bucklerBlocked") bucklerBlocks += 1;
    else if (record.outcome === "shieldBlocked") shieldBlocks += 1;
    else landed += 1;
  }
  return {
    thisTickIncomingParryCount: parries,
    thisTickIncomingBucklerBlockCount: bucklerBlocks,
    thisTickIncomingShieldBlockCount: shieldBlocks,
    thisTickIncomingLandedCount: landed,
  };
}

function getThisTickAppliedHitLoss(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): number {
  let appliedHitLoss = 0;
  const applications =
    combatSandbox.individualCombatPipelineBuffers.hitApplications;
  for (let index = 0; index < applications.length; index += 1) {
    const application = applications[index]!;
    if (application.targetEntityId === entityId) {
      appliedHitLoss += application.appliedHitLoss;
    }
  }
  return appliedHitLoss;
}

function reachedZeroHitsThisTick(
  combatSandbox: CombatSandboxSimulationState,
  entityId: number,
): boolean {
  const zeroHitEvents =
    combatSandbox.individualCombatPipelineBuffers.zeroHitEvents;
  for (let index = 0; index < zeroHitEvents.length; index += 1) {
    if (zeroHitEvents[index]!.entityId === entityId) {
      return true;
    }
  }
  return false;
}

function createLegacyCombatFoundationDebugSnapshot(
  legacySandbox: LegacyCombatFoundationSimulationState,
): LiveCombatDebugSnapshot {
  const unitIds = getUnitIds(legacySandbox.identityStore);
  const units: LiveCombatDebugUnitSnapshot[] = [];
  let tickAppliedDamage = 0;
  let totalAccumulatedDamage = 0;

  for (let unitIndex = 0; unitIndex < unitIds.length; unitIndex += 1) {
    const unitId = unitIds[unitIndex]!;
    const moraleAssessment = legacySandbox.moraleAssessments[unitIndex];
    if (moraleAssessment === undefined || moraleAssessment.unitId !== unitId) {
      throw new Error(
        "Archived combat foundation morale assessments are out of sync.",
      );
    }
    const persistentMorale = getPersistentUnitMorale(
      legacySandbox.persistentMoraleStore,
      unitId,
    );
    let incomingAppliedDamage = 0;
    let incomingConsequences = 0;
    for (
      let consequenceIndex = 0;
      consequenceIndex < legacySandbox.consequenceApplications.length;
      consequenceIndex += 1
    ) {
      const consequence =
        legacySandbox.consequenceApplications[consequenceIndex]!;
      if (consequence.targetUnitId === unitId) {
        incomingAppliedDamage += consequence.appliedDamageValue;
        incomingConsequences += 1;
      }
    }
    tickAppliedDamage += incomingAppliedDamage;
    totalAccumulatedDamage += getUnitAccumulatedDamage(
      legacySandbox.survivabilityStore,
      unitId,
    );
    const memberCount = getUnitMembers(legacySandbox.identityStore, unitId).length;
    units.push({
      unitId,
      label: legacySandbox.unitLabels.get(unitId) ?? `Unit ${unitId}`,
      factionId: getFactionIdForUnit(legacySandbox.identityStore, unitId),
      memberCount,
      movementStyle: getUnitMovementStyle(legacySandbox.formationStore, unitId),
      assessmentPressureAverage: moraleAssessment.pressureAverage,
      assessmentMoraleState: moraleAssessment.moraleState,
      persistentMoraleState: persistentMorale.state,
      routingRisk: persistentMorale.routingRisk,
      recoveryProgress: persistentMorale.recoveryProgress,
      persistentPressure: persistentMorale.pressure,
      currentCohesion: persistentMorale.cohesion,
      tickStartEligibleMembers: memberCount,
      endOfTickEligibleMembers: memberCount,
      endOfTickZeroHitMembers: 0,
      attackAttempts: legacySandbox.opportunityCount,
      preventedAttacks: 0,
      landedOutcomes: incomingConsequences,
      gateAcceptedHits: incomingConsequences,
      appliedHitLoss: incomingAppliedDamage,
      newlyZeroMembers: 0,
    });
  }

  return {
    attackAttemptCount: legacySandbox.opportunityCount,
    preventedAttackCount: 0,
    landedOutcomeCount: legacySandbox.strikeCount,
    gateAcceptedHitCount: legacySandbox.survivabilityApplicationCount,
    appliedHitLoss: tickAppliedDamage,
    newlyZeroMemberCount: 0,
    lifecycleTransitionCount: 0,
    terminalTransitionCount: 0,
    activeDragGroupCount: 0,
    rescueRequestedCount: 0,
    dragGroupStartedCount: 0,
    noRescueCount: 0,
    gatheringDragGroupCount: 0,
    draggingDragGroupCount: 0,
    reachedSafetyDragGroupCount: 0,
    dragCancellationCount: 0,
    dragReachedSafetyCount: 0,
    tickStartEligibleMemberCount: legacySandbox.identityStore.entityCount,
    endOfTickEligibleMemberCount: legacySandbox.identityStore.entityCount,
    endOfTickZeroHitMemberCount: 0,
    totalAttackAttemptCount: legacySandbox.totalOpportunityCount,
    totalPreventedAttackCount: 0,
    totalLandedOutcomeCount: legacySandbox.totalStrikeCount,
    totalGateAcceptedHitCount:
      legacySandbox.totalSurvivabilityApplicationCount,
    totalAppliedHitLoss: totalAccumulatedDamage,
    totalNewlyZeroMemberCount: 0,
    totalLifecycleTransitionCount: 0,
    totalTerminalTransitionCount: 0,
    units,
    inspectedIndividuals: [],
    individualCombatVisuals: [],
    inspectedCombatVisualEvents: [],
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
        simulation.legacyCombatFoundationSandbox,
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
