import type { CombatMoraleAssessment, CombatMoraleState } from "./combatMorale";
import type { CombatConsequenceApplication } from "./combatConsequences";
import type { CombatPipelineOutput } from "./combatPipeline";
import type {
  CombatPressureStore,
  IndividualCombatPressureRecoveryContext,
  UnitPressureUpdate,
} from "./combatPressure";
import type { CombatSurvivabilityStore } from "./combatSurvivability";
import type { CombatTempoStore } from "./combatTempo";
import type {
  IndividualCombatPipelineBuffers,
  IndividualCombatPipelineStores,
} from "./individualCombatPipeline";
import type {
  IndividualCombatUnitAggregationStore,
  IndividualCombatUnitSummary,
} from "./individualCombatAggregation";
import type {
  IndividualCombatConsequenceProjectionStore,
  IndividualCombatUnitConsequenceSummary,
} from "./individualCombatConsequences";
import type { IndividualCombatEligibilitySnapshot } from "./individualCombatEligibility";
import type {
  IndividualArmourCategory,
  IndividualCombatProfileStore,
  IndividualShieldCarriedState,
  IndividualShieldCategory,
  IndividualWeaponCategory,
} from "./individualCombatProfile";
import type { IndividualGlobalHitStore } from "./individualGlobalHits";
import type {
  IndividualEnergyBand,
  IndividualEnergyStore,
  TrustedIndividualEnergyProfileStore,
  TrustedIndividualEnergyProfileValues,
} from "./individualEnergy";
import type {
  IndividualEnergyActivityContext,
  IndividualEnergyActivityStore,
  IndividualEnergyMovementIntensity,
} from "./individualEnergyActivity";
import type {
  CasualtyProcedureKind,
  DeathCountPolicy,
  IndividualCasualtyProcedureProfileStore,
} from "./individualCasualtyProcedureProfile";
import type {
  CharacterLifecycleState,
  IndividualCasualtyLifecycleStore,
  IndividualPlayerPresenceStore,
  IndividualTerminalPresenceTransitionRecord,
  IndividualTerminalTransitionRecord,
  IndividualZeroHitLifecycleTransitionRecord,
  PlayerPresenceState,
} from "./individualCasualtyLifecycle";
import type { IndividualCasualtyLocalQueryStore } from "./individualCasualtyLocalQuery";
import type {
  CasualtyAssistanceDecisionBuffers,
  CasualtyAssistanceDecisionResult,
  CasualtyDragGroupStore,
  CasualtyDragMovementBuffers,
  CasualtyDragMovementResult,
  IndividualDragHandCommitmentStore,
  IndividualCasualtyAssistanceState,
  IndividualCasualtyAssistanceStore,
} from "./individualCasualtyAssistance";
import type {
  IndividualDeathCountStore,
  IndividualDeathCountPauseSource,
  IndividualDeathCountTerminalTransitionRecord,
} from "./individualDeathCount";
import type {
  IndividualGenericHerbStore,
  TrustedIndividualMedicalProfileStore,
} from "./individualMedicalProfile";
import type {
  IndividualMedicalLocalQueryStore,
  IndividualMedicalUrgencyKind,
  IndividualMedicalUrgencyStore,
  IndividualTraumaWithdrawalGoalKind,
} from "./individualMedicalReadModel";
import type { IndividualOrdinaryParticipationSnapshot } from "./individualOrdinaryParticipation";
import type {
  IndividualTraumaticWoundAppliedRecord,
  IndividualTraumaticWoundOpportunity,
  IndividualTraumaticWoundStore,
  TraumaticWoundState,
  TraumaticWoundTriggerKind,
} from "./individualTraumaticWound";
import type { IndividualLimbDisabilityStore } from "./individualLimbDisability";
import type { IndividualLandedHitGateStore } from "./individualLandedHitGate";
import type {
  IndividualMedicalClaimBuffers,
  IndividualMedicalClaimResult,
  IndividualMedicalClaimStore,
} from "./individualMedicalClaims";
import type {
  IndividualTreatmentActionBuffers,
  IndividualTreatmentActionResult,
  IndividualTreatmentActionStore,
} from "./individualTreatmentAction";
import type {
  IndividualExecutionActionBuffers,
  IndividualExecutionActionResult,
  IndividualExecutionActionStore,
} from "./individualExecutionAction";
import type {
  IndividualRespawnEgressBuffers,
  IndividualRespawnEgressResult,
} from "./individualRespawnEgress";
import type {
  IndividualCasualtyHistoryStore,
  IndividualCasualtyUnitSummary,
  IndividualCasualtyUnitSummaryStore,
} from "./individualCasualtyConsolidation";
import type {
  DefenceCoverageTier,
  IndividualDefenceHandAvailabilitySource,
  IndividualMeleeDefenceResolution,
  IndividualMeleeDefenceStore,
  IndividualMeleeDefenceType,
} from "./individualMeleeDefence";
import type { IndividualMeleeTargetSelectionStore } from "./individualMeleeTargetSelection";
import type { IndividualCombatActionStore } from "./individualCombatAction";
import type {
  PersistentMoraleEvent,
  PersistentMoraleStore,
} from "./persistentMorale";
import type { MoraleMovementState } from "./moraleMovement";
import type {
  RecoveryThreatStore,
  UnitRecoveryThreatSummary,
} from "./recoveryThreat";
import type {
  RoutingContagionStore,
  UnitRoutingContagionSummary,
} from "./routingContagion";
import type {
  FormationBehaviourStore,
  IndividualRole,
  UnitMovementStyle,
  UnitOrder,
} from "./formationBehaviour";
import type { UnitId, UnitIdentityStore } from "./unitIdentity";
import type {
  ArmourClass,
  ShieldClass,
  UnitLoadoutStore,
  WeaponCategory,
  WeaponReachBand,
} from "./unitLoadout";

declare const entityIdBrand: unique symbol;

export type EntityId = number & {
  readonly [entityIdBrand]: "EntityId";
};

export interface SimulationBounds {
  readonly width: number;
  readonly height: number;
}

export interface CombatSandboxDeploymentZone {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** Optional authored variation expanded into existing per-entity authorities. */
export interface CombatSandboxMemberProfileScenario {
  readonly role?: IndividualRole;
  readonly fortitudeLevels?: number;
  readonly memberMaxStep?: number;
  readonly weaponCategory?: WeaponCategory;
  readonly armourClass?: ArmourClass;
  readonly shieldClass?: ShieldClass;
  readonly medicalProfile?: {
    readonly hasChirurgeon: boolean;
    readonly hasPhysick: boolean;
    readonly startingGenericHerbs?: number;
  };
  readonly individualConfidence?: number;
}

export interface CombatSandboxUnitScenario {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberCount: number;
  readonly deploymentZone: CombatSandboxDeploymentZone;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly spacing: number;
  readonly rows: number;
  readonly cols: number;
  readonly unitSpeed: number;
  readonly order: UnitOrder;
  readonly role: IndividualRole;
  /** Feeds the existing individual combat profile qualification authority. */
  readonly fortitudeLevels?: number;
  readonly memberMaxStep: number;
  readonly weaponCategory: WeaponCategory;
  readonly weaponReachBand: WeaponReachBand;
  readonly armourClass: ArmourClass;
  readonly shieldClass: ShieldClass;
  readonly attackIntervalTicks: number;
  readonly maxDamageCapacity: number;
  /** Explicit trusted template expanded to every member; never faction-derived. */
  readonly casualtyProcedure: {
    readonly procedureKind: CasualtyProcedureKind;
    readonly deathCountPolicy: DeathCountPolicy;
    readonly respawnDestination?: {
      readonly x: number;
      readonly y: number;
    };
  };
  readonly medicalProfile?: {
    readonly hasChirurgeon: boolean;
    readonly hasPhysick: boolean;
    readonly startingGenericHerbs?: number;
  };
  /** Optional trusted energy template expanded to every member. */
  readonly energyProfile?: TrustedIndividualEnergyProfileValues;
  /** Optional compact inspection label; does not affect simulation rules. */
  readonly label?: string;
  /** Optional formation-owned initial cohesion; also defines recovery maximum. */
  readonly initialCohesion?: number;
  /** Optional per-member confidence used by persistent morale interpretation. */
  readonly individualConfidence?: number;
  /** When present, contains exactly one authored profile per member index. */
  readonly memberProfiles?: readonly CombatSandboxMemberProfileScenario[];
}

/**
 * The intentionally narrow production combat scene. It is scenario data, not
 * a general scenario framework: small deterministic opposing-unit sets only.
 */
export interface CombatSandboxScenario {
  readonly kind: "liveCombatSandbox";
  readonly units: readonly CombatSandboxUnitScenario[];
  readonly appliedDamagePressureScale: number;
  /** Optional bounded debug list; normal scenarios omit per-entity inspection. */
  readonly inspectedEntityIds?: readonly number[];
  /**
   * Explicit deterministic inputs for the retained Milestone 6 visual fixture.
   * Normal scenarios omit this; production authorities still own every result.
   */
  readonly retainedCasualtyVisualFixture?: RetainedCasualtyVisualFixture;
}

export interface RetainedCasualtyVisualFixture {
  readonly kind: "casualtyLifecycle";
  readonly events: readonly RetainedCasualtyVisualFixtureEvent[];
}

export type RetainedCasualtyVisualFixtureEvent =
  | {
      readonly tick: number;
      readonly kind: "landedHitLoss";
      readonly attackerEntityId: number;
      readonly targetEntityId: number;
      readonly hitLoss: number | "all";
    }
  | {
      readonly tick: number;
      readonly kind: "traumaticWoundOpportunity";
      readonly attackerEntityId: number;
      readonly targetEntityId: number;
      readonly triggerKind: TraumaticWoundTriggerKind;
    }
  | {
      readonly tick: number;
      readonly kind: "limbDisability";
      readonly entityId: number;
      readonly disability: import("./individualLimbDisability").IndividualLimbDisabilityKind;
    }
  | {
      readonly tick: number;
      readonly kind: "executionIntent";
      readonly executorEntityId: number;
      readonly targetEntityId: number;
    }
  | {
      readonly tick: number;
      readonly kind: "relocate";
      readonly entityId: number;
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly tick: number;
      readonly kind: "boundedMove";
      readonly entityId: number;
      readonly goalX: number;
      readonly goalY: number;
    };

/** Explicit non-combat setup used only by retained formation visual tests. */
export interface FormationSandboxUnitScenario {
  readonly unitId: number;
  readonly label: string;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly spacing: number;
  readonly rows: number;
  readonly cols: number;
  readonly unitSpeed: number;
  readonly order: UnitOrder;
  readonly cohesion?: number;
  /** Optional trusted energy template expanded to every member. */
  readonly energyProfile?: TrustedIndividualEnergyProfileValues;
}

export interface FormationSandboxIndividualScenario {
  readonly entityId: number;
  readonly x: number;
  readonly y: number;
  readonly role: IndividualRole;
  readonly slotRow: number;
  readonly slotCol: number;
  readonly memberMaxStep: number;
  readonly pressure?: number;
  readonly confidence?: number;
}

export interface FormationSandboxScenario {
  readonly kind: "formationSandbox";
  readonly units: readonly FormationSandboxUnitScenario[];
  readonly individuals: readonly FormationSandboxIndividualScenario[];
}

export interface SimulationScenario {
  readonly seed: number;
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
  readonly minSpeedUnitsPerTick: number;
  readonly maxSpeedUnitsPerTick: number;
  /** Scenario-wide trusted energy defaults, overridable by configured units. */
  readonly energyProfile?: TrustedIndividualEnergyProfileValues;
  readonly combatSandbox?: CombatSandboxScenario;
  /**
   * Archived Milestone 3 visual regression fixture. This deliberately uses the
   * old unit-level combat path outside production combat authority.
   */
  readonly legacyCombatFoundationSandbox?: CombatSandboxScenario;
  readonly formationSandbox?: FormationSandboxScenario;
}

export interface FormationDebugUnitSnapshot {
  readonly unitId: number;
  readonly label: string;
  readonly factionId: number;
  readonly memberCount: number;
  readonly movementStyle: UnitMovementStyle;
  readonly cohesion: number;
}

export interface FormationDebugSnapshot {
  readonly units: readonly FormationDebugUnitSnapshot[];
}

export interface WorldState {
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
  readonly ids: Uint32Array;
  readonly positionsX: Int32Array;
  readonly positionsY: Int32Array;
  readonly velocitiesX: Int32Array;
  readonly velocitiesY: Int32Array;
}

export interface InitialSimulationSnapshot {
  readonly kind: "initial";
  readonly tick: number;
  readonly entityCount: number;
  readonly bounds: SimulationBounds;
  readonly ids: Uint32Array;
  readonly positions: Int32Array;
  /** Present only when the scenario assigns entities to visible factions. */
  readonly factionIds?: Uint8Array;
  readonly combatDebug?: LiveCombatDebugSnapshot;
  readonly formationDebug?: FormationDebugSnapshot;
}

export interface PositionSimulationSnapshot {
  readonly kind: "positions";
  readonly tick: number;
  readonly entityCount: number;
  readonly positions: Int32Array;
  readonly combatDebug?: LiveCombatDebugSnapshot;
  readonly formationDebug?: FormationDebugSnapshot;
}

export type SimulationSnapshot =
  | InitialSimulationSnapshot
  | PositionSimulationSnapshot;

export interface LiveCombatDebugUnitSnapshot {
  readonly unitId: number;
  readonly label: string;
  readonly factionId: number;
  readonly memberCount: number;
  readonly movementStyle: UnitMovementStyle;
  readonly assessmentPressureAverage: number;
  readonly assessmentMoraleState: CombatMoraleState;
  /** Persistent Milestone 4 interpretation consumed by next tick's movement. */
  readonly persistentMoraleState: MoraleMovementState;
  readonly routingRisk: number;
  readonly recoveryProgress: number;
  readonly persistentPressure: number;
  readonly currentCohesion: number;
  readonly tickStartEligibleMembers: number;
  readonly endOfTickEligibleMembers: number;
  readonly endOfTickZeroHitMembers: number;
  readonly attackAttempts: number;
  readonly preventedAttacks: number;
  readonly landedOutcomes: number;
  readonly gateAcceptedHits: number;
  readonly appliedHitLoss: number;
  readonly newlyZeroMembers: number;
  readonly casualty?: IndividualCasualtyUnitSummary;
}

export type LiveCombatDebugAttackOutcome =
  | "none"
  | "attempted"
  | "invalidated";

export type LiveCombatDebugDefenceOutcome =
  | "none"
  | "parried"
  | "bucklerBlocked"
  | "shieldBlocked"
  | "landed";

export type LiveCombatDebugLandedHitGateOutcome =
  | "none"
  | "accepted"
  | "rejected";

export interface LiveCombatDebugFacingSnapshot {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
}

export interface LiveCombatDebugIndividualSnapshot {
  readonly entityId: number;
  readonly unitId: number;
  readonly casualtyProcedureKind?: CasualtyProcedureKind;
  readonly characterLifecycleState?: CharacterLifecycleState;
  readonly playerPresenceState?: PlayerPresenceState;
  readonly deathCountDurationTicks?: number;
  readonly deathCountRemainingTicks?: number;
  readonly deathCountPaused?: boolean;
  readonly deathCountPauseSource?: IndividualDeathCountPauseSource;
  readonly firstZeroHitTick?: number;
  readonly latestZeroHitTick?: number;
  readonly dyingTransitionCount?: number;
  readonly terminalTick?: number;
  readonly terminalCause?: import("./individualCasualtyLifecycle").TerminalCause;
  readonly terminalX?: number;
  readonly terminalY?: number;
  readonly comfortStartedCount?: number;
  readonly comfortCompletedTick?: number;
  readonly respawnDestinationState?: import("./individualCasualtyLifecycle").IndividualRespawnDestinationState;
  readonly respawnDestinationX?: number;
  readonly respawnDestinationY?: number;
  readonly respawnEgressState?: import("./individualCasualtyLifecycle").IndividualRespawnEgressState;
  readonly respawnEgressStartedTick?: number;
  readonly respawnEgressRemainingDistanceSquared?: number;
  readonly waitingAtRespawnArrivalTick?: number;
  readonly waitingAtRespawnArrivalX?: number;
  readonly waitingAtRespawnArrivalY?: number;
  readonly respawnEgressMovementRecordCount?: number;
  readonly respawnEgressMovedThisTick?: boolean;
  readonly respawnEgressArrivedThisTick?: boolean;
  readonly wasDragged?: boolean;
  readonly firstDragTick?: number;
  readonly dragPatientEpisodeCount?: number;
  readonly dragHelperParticipationCount?: number;
  readonly medicalHandoffHistoryCount?: number;
  readonly treatmentStartedHistoryCount?: number;
  readonly treatmentCompletedHistoryCount?: number;
  readonly treatmentInterruptedHistoryCount?: number;
  readonly treatmentPerformedStartedHistoryCount?: number;
  readonly treatmentPerformedCompletedHistoryCount?: number;
  readonly treatmentPerformedInterruptedHistoryCount?: number;
  readonly hitRestorationHistoryCount?: number;
  readonly traumaticWoundTreatmentHistoryCount?: number;
  readonly limbTreatmentHistoryCount?: number;
  readonly executionStartedHistoryCount?: number;
  readonly executionCompletedHistoryCount?: number;
  readonly executionInterruptedHistoryCount?: number;
  readonly executionTargetedHistoryCount?: number;
  readonly executionTargetInterruptionHistoryCount?: number;
  readonly terminalizedByExecutionHistoryCount?: number;
  readonly genericHerbsConsumedHistoryCount?: number;
  readonly currentEnergy?: number;
  readonly maximumEnergy?: number;
  readonly energyRatioFixedPoint?: number;
  readonly energyBand?: IndividualEnergyBand;
  readonly safeRestRecoveryPerTick?: number;
  readonly startingEnergy?: number;
  readonly minimumEnergyReached?: number;
  readonly firstWindedTick?: number | null;
  readonly firstSpentTick?: number | null;
  readonly totalEnergySpent?: number;
  readonly totalEnergyRecovered?: number;
  readonly energyActivityContext?: IndividualEnergyActivityContext;
  readonly energyDisplacementX?: number;
  readonly energyDisplacementY?: number;
  readonly energyMovementDistanceSquared?: number;
  readonly energyMovementIntensity?: IndividualEnergyMovementIntensity;
  readonly energyAttackImpulsesThisTick?: number;
  readonly energyDefenceImpulsesThisTick?: number;
  readonly energyMovementOccurredThisTick?: boolean;
  readonly energyExternallyMovedThisTick?: boolean;
  readonly hasChirurgeon?: boolean;
  readonly hasPhysick?: boolean;
  readonly currentGenericHerbs?: number;
  readonly maximumGenericHerbs?: number;
  readonly reservedGenericHerbs?: number;
  readonly traumaticWoundState?: TraumaticWoundState;
  readonly traumaticWoundEpisodeCount?: number;
  readonly latestTraumaticWoundTick?: number;
  readonly latestTraumaticWoundAttackerEntityId?: number;
  readonly latestTraumaticWoundTriggerKind?: TraumaticWoundTriggerKind | "none";
  readonly medicalUrgencyKind?: IndividualMedicalUrgencyKind;
  readonly medicalUrgencyPriority?: number;
  readonly traumaWithdrawalActive?: boolean;
  readonly traumaWithdrawalGoalKind?: IndividualTraumaWithdrawalGoalKind;
  readonly withdrawalTargetPhysickEntityId?: number;
  readonly localPatientCandidateCount?: number;
  readonly localPhysickCandidateCount?: number;
  readonly withdrawalThreatCount?: number;
  readonly casualtyAssistanceState?: IndividualCasualtyAssistanceState;
  readonly casualtyDragGroupId?: number;
  readonly casualtyAssistanceDestinationX?: number;
  readonly casualtyAssistanceDestinationY?: number;
  readonly casualtyDragFreeHands?: number;
  readonly casualtyDragGroupPhase?: import("./individualCasualtyAssistance").CasualtyDragGroupPhase;
  readonly casualtyDragPatientEntityId?: number;
  readonly casualtyDragHelperEntityIds?: readonly number[];
  readonly claimedMedicalPatientEntityId?: number;
  readonly claimedMedicalPhysickEntityId?: number;
  readonly treatmentActionId?: number;
  readonly treatmentKind?: import("./individualTreatmentAction").IndividualTreatmentActionKind;
  readonly treatmentHealerEntityId?: number;
  readonly treatmentPatientEntityId?: number;
  readonly treatmentProgressTicks?: number;
  readonly treatmentRequiredProgressTicks?: number;
  readonly treatmentReservedGenericHerbs?: 0 | 1;
  readonly treatmentSelectedLimbDisability?: import("./individualLimbDisability").IndividualLimbDisabilityKind | "none";
  readonly disabledArm?: boolean;
  readonly disabledLeg?: boolean;
  readonly disabledArmEpisodeCount?: number;
  readonly disabledLegEpisodeCount?: number;
  readonly disabledArmClearedCount?: number;
  readonly disabledLegClearedCount?: number;
  readonly tickStartCombatEligible: boolean;
  readonly selectedTargetEntityId: number | null;
  readonly selectedTargetDistanceSquared: number | null;
  readonly selectedTargetWithinPreferredDistance: boolean | null;
  readonly actionState: "ready" | "committingAttack" | "recoveringAttack";
  readonly lockedTargetEntityId: number | null;
  readonly facing: LiveCombatDebugFacingSnapshot;
  readonly commitmentTicksRemaining: number;
  readonly attackRecoveryTicksRemaining: number;
  readonly guardState: "ready" | "recovering";
  readonly defenceRecoveryTicksRemaining: number;
  readonly activeWeapon: IndividualWeaponCategory;
  readonly shieldCategory: IndividualShieldCategory;
  readonly shieldCarriedState: IndividualShieldCarriedState;
  readonly currentGlobalHits: number;
  readonly maximumGlobalHits: number;
  readonly thisTickAttackOutcome: LiveCombatDebugAttackOutcome;
  readonly thisTickDefenceOutcome: LiveCombatDebugDefenceOutcome;
  readonly thisTickOutgoingDefenceOutcome: LiveCombatDebugDefenceOutcome;
  readonly thisTickLandedHitGateOutcome: LiveCombatDebugLandedHitGateOutcome;
  readonly defenceCoverageTier: DefenceCoverageTier;
  readonly defenceReadinessFixedPoint: number;
  readonly storedGuardReadinessFixedPoint: number;
  readonly effectiveGuardReadinessFixedPoint: number;
  readonly guardReadinessRecoveryPerTick: number;
  readonly guardReadinessSpentThisTick: number;
  readonly guardReadinessRecoveredThisTick: number;
  readonly guardReadinessOffensivelySuppressed: boolean;
  readonly rearDesperateDefenceApplied: boolean;
  readonly calculatedDefenceChanceFixedPoint: number;
  readonly deterministicDefenceRollFixedPoint: number;
  readonly chosenDefenceSource: IndividualMeleeDefenceType;
  readonly defenceResolution: IndividualMeleeDefenceResolution | "none";
  readonly thisTickIncomingParryCount: number;
  readonly thisTickIncomingBucklerBlockCount: number;
  readonly thisTickIncomingShieldBlockCount: number;
  readonly thisTickIncomingLandedCount: number;
  readonly thisTickAppliedHitLoss: number;
  readonly reachedZeroHitsThisTick: boolean;
  readonly currentPressure: number;
  readonly proximityPressureFloor: number;
  readonly nearbyHostileCount: number;
  readonly nearbyAllyCount: number;
  readonly incomingAttackPressureImpulse: number;
  readonly selectedDefenceOutcomePressureContribution: number;
  readonly incomingHitPressureImpulse: number;
  readonly blockedStrikePressureImpulse: number;
  readonly pressureRecoveryPauseTicksRemaining: number;
  readonly pressureRecoveryContext: IndividualCombatPressureRecoveryContext;
  readonly pressureRecoveryCreditApplied: number;
  readonly recoveredPressureAmount: number;
  readonly executionActionId?: number;
  readonly executionExecutorEntityId?: number;
  readonly executionTargetEntityId?: number;
  readonly executionProgressTicks?: number;
}

export interface IndividualCombatVisualState {
  readonly entityId: number;
  readonly facingOctant: number;
  readonly weaponCategory: IndividualWeaponCategory;
  readonly weaponThreatDistance: number;
  readonly weaponPreferredMinimumDistance: number;
  readonly attackArcOctants: number;
  readonly shieldCategory: IndividualShieldCategory;
  readonly shieldHeld: boolean;
  readonly armourCategory: IndividualArmourCategory;
}

export type InspectedCombatVisualEventKind =
  | "attackAttempt"
  | "parry"
  | "bucklerBlock"
  | "shieldBlock"
  | "failedDefence"
  | "landed"
  | "gateAccepted"
  | "gateRejected"
  | "hitApplied"
  | "zeroHit";

export interface InspectedCombatVisualEvent {
  readonly tick: number;
  readonly attackerEntityId: number;
  readonly targetEntityId: number;
  readonly kind: InspectedCombatVisualEventKind;
  readonly appliedHitLoss: number;
}

/** Compact, render-safe inspection state for the production combat sandbox. */
export interface LiveCombatDebugSnapshot {
  readonly attackAttemptCount: number;
  readonly preventedAttackCount: number;
  readonly landedOutcomeCount: number;
  readonly gateAcceptedHitCount: number;
  readonly appliedHitLoss: number;
  readonly newlyZeroMemberCount: number;
  readonly lifecycleTransitionCount: number;
  readonly terminalTransitionCount: number;
  readonly activeDragGroupCount: number;
  readonly rescueRequestedCount: number;
  readonly dragGroupStartedCount: number;
  readonly noRescueCount: number;
  readonly gatheringDragGroupCount: number;
  readonly draggingDragGroupCount: number;
  readonly reachedSafetyDragGroupCount: number;
  readonly dragCancellationCount: number;
  readonly dragReachedSafetyCount: number;
  readonly activeMedicalClaimCount: number;
  readonly medicalClaimStartedCount: number;
  readonly medicalHandoffCount: number;
  readonly medicalSafeReleaseCount: number;
  readonly medicalStaleClaimCount: number;
  readonly activeExecutionActionCount: number;
  readonly executionStartedCount: number;
  readonly executionInterruptedCount: number;
  readonly executionCompletedCount: number;
  readonly tickStartEligibleMemberCount: number;
  readonly endOfTickEligibleMemberCount: number;
  readonly endOfTickZeroHitMemberCount: number;
  readonly totalAttackAttemptCount: number;
  readonly totalPreventedAttackCount: number;
  readonly totalLandedOutcomeCount: number;
  readonly totalGateAcceptedHitCount: number;
  readonly totalAppliedHitLoss: number;
  readonly totalNewlyZeroMemberCount: number;
  readonly totalLifecycleTransitionCount: number;
  readonly totalTerminalTransitionCount: number;
  readonly units: readonly LiveCombatDebugUnitSnapshot[];
  readonly inspectedIndividuals: readonly LiveCombatDebugIndividualSnapshot[];
  readonly individualCombatVisuals: readonly IndividualCombatVisualState[];
  readonly inspectedCombatVisualEvents: readonly InspectedCombatVisualEvent[];
}

/**
 * Production combat state. Unit loadouts remain as static scenario content
 * used to derive individual combat profiles; runtime combat authority is the
 * individual pipeline.
 */
export interface CombatSandboxSimulationState {
  readonly battleSeed: number;
  readonly retainedCasualtyVisualFixture?: RetainedCasualtyVisualFixture;
  readonly identityStore: UnitIdentityStore;
  readonly loadoutStore: UnitLoadoutStore;
  readonly formationStore: FormationBehaviourStore;
  readonly individualProfileStore: IndividualCombatProfileStore;
  readonly individualCombatEligibilitySnapshot: IndividualCombatEligibilitySnapshot;
  readonly individualTargetSelectionStore: IndividualMeleeTargetSelectionStore;
  readonly individualCombatActionStore: IndividualCombatActionStore;
  readonly individualMeleeDefenceStore: IndividualMeleeDefenceStore;
  readonly individualLandedHitGateStore: IndividualLandedHitGateStore;
  readonly individualGlobalHitStore: IndividualGlobalHitStore;
  /** Aliases the SimulationState-owned stores for bounded combat inspection. */
  readonly trustedIndividualEnergyProfileStore: TrustedIndividualEnergyProfileStore;
  readonly individualEnergyStore: IndividualEnergyStore;
  readonly individualEnergyActivityStore: IndividualEnergyActivityStore;
  readonly individualCasualtyProcedureProfileStore: IndividualCasualtyProcedureProfileStore;
  readonly individualCasualtyLifecycleStore: IndividualCasualtyLifecycleStore;
  readonly individualPlayerPresenceStore: IndividualPlayerPresenceStore;
  readonly individualDeathCountStore: IndividualDeathCountStore;
  readonly trustedIndividualMedicalProfileStore: TrustedIndividualMedicalProfileStore;
  readonly individualGenericHerbStore: IndividualGenericHerbStore;
  readonly individualTraumaticWoundStore: IndividualTraumaticWoundStore;
  readonly individualLimbDisabilityStore: IndividualLimbDisabilityStore;
  readonly individualMedicalUrgencyStore: IndividualMedicalUrgencyStore;
  readonly individualMedicalLocalQueryStore: IndividualMedicalLocalQueryStore;
  readonly individualOrdinaryParticipationSnapshot: IndividualOrdinaryParticipationSnapshot;
  readonly individualCasualtyLocalQueryStore: IndividualCasualtyLocalQueryStore;
  readonly individualCasualtyAssistanceStore: IndividualCasualtyAssistanceStore;
  readonly casualtyDragGroupStore: CasualtyDragGroupStore;
  readonly individualDragHandCommitmentStore: IndividualDragHandCommitmentStore;
  readonly individualDefenceHandAvailabilitySource: IndividualDefenceHandAvailabilitySource;
  readonly casualtyDragMovementBuffers: CasualtyDragMovementBuffers;
  casualtyDragMovementResult: CasualtyDragMovementResult;
  readonly individualMedicalClaimStore: IndividualMedicalClaimStore;
  readonly individualMedicalClaimBuffers: IndividualMedicalClaimBuffers;
  individualMedicalClaimResult: IndividualMedicalClaimResult;
  readonly individualTreatmentActionStore: IndividualTreatmentActionStore;
  readonly individualTreatmentActionBuffers: IndividualTreatmentActionBuffers;
  individualTreatmentActionResult: IndividualTreatmentActionResult;
  readonly individualExecutionActionStore: IndividualExecutionActionStore;
  readonly individualExecutionActionBuffers: IndividualExecutionActionBuffers;
  individualExecutionActionResult: IndividualExecutionActionResult;
  readonly casualtyAssistanceDecisionBuffers: CasualtyAssistanceDecisionBuffers;
  casualtyAssistanceDecisionResult: CasualtyAssistanceDecisionResult;
  readonly individualLifecycleTransitions: IndividualZeroHitLifecycleTransitionRecord[];
  readonly individualDeathCountTerminalTransitions: IndividualDeathCountTerminalTransitionRecord[];
  readonly individualTerminalTransitions: IndividualTerminalTransitionRecord[];
  readonly individualTerminalPresenceTransitions: IndividualTerminalPresenceTransitionRecord[];
  readonly individualRespawnEgressBuffers: IndividualRespawnEgressBuffers;
  individualRespawnEgressResult: IndividualRespawnEgressResult;
  readonly individualCasualtyHistoryStore: IndividualCasualtyHistoryStore;
  readonly individualCasualtyUnitSummaryStore: IndividualCasualtyUnitSummaryStore;
  readonly individualCasualtyUnitSummaries: readonly IndividualCasualtyUnitSummary[];
  readonly individualTraumaticWoundOpportunities: IndividualTraumaticWoundOpportunity[];
  readonly individualTraumaticWoundRecords: IndividualTraumaticWoundAppliedRecord[];
  readonly individualCombatUnitAggregationStore: IndividualCombatUnitAggregationStore;
  readonly individualCombatUnitSummaries: readonly IndividualCombatUnitSummary[];
  readonly individualCombatConsequenceProjectionStore: IndividualCombatConsequenceProjectionStore;
  readonly individualCombatConsequenceSummaries: readonly IndividualCombatUnitConsequenceSummary[];
  readonly individualCombatPipelineStores: IndividualCombatPipelineStores;
  readonly individualCombatPipelineBuffers: IndividualCombatPipelineBuffers;
  readonly inspectedEntityIds: readonly number[];
  readonly inspectedIndividuals: LiveCombatDebugIndividualSnapshot[];
  readonly inspectedCombatVisualEvents: InspectedCombatVisualEvent[];
  readonly pressureStore: CombatPressureStore;
  readonly routingContagionStore: RoutingContagionStore;
  readonly recoveryThreatStore: RecoveryThreatStore;
  readonly persistentMoraleStore: PersistentMoraleStore;
  readonly unitLabels: ReadonlyMap<UnitId, string>;
  /** Tick-start read model consumed by formation; persistent morale owns it. */
  readonly moraleMovementStates: Map<UnitId, MoraleMovementState>;
  readonly pressureUpdates: UnitPressureUpdate[];
  readonly routingContagionSummaries: UnitRoutingContagionSummary[];
  readonly recoveryThreatSummaries: UnitRecoveryThreatSummary[];
  readonly moraleAssessments: CombatMoraleAssessment[];
  readonly moraleEvents: PersistentMoraleEvent[];
  readonly appliedDamagePressureScale: number;
  individualEligibleMeleeSourceCount: number;
  individualSelectedTargetCount: number;
  individualActiveCommitmentCount: number;
  individualAttackAttemptCount: number;
  individualInvalidatedAttackCount: number;
  individualParryCount: number;
  individualBucklerBlockCount: number;
  individualShieldBlockCount: number;
  individualLandedDefenceOutcomeCount: number;
  individualGateAcceptedHitCount: number;
  individualGateRejectedHitCount: number;
  individualAppliedHitLoss: number;
  individualZeroHitTransitionCount: number;
  individualActiveGateRelationshipCount: number;
  individualTickStartCombatEligibleMemberCount: number;
  individualTickStartCombatIneligibleMemberCount: number;
  individualEndOfTickCombatEligibleMemberCount: number;
  individualEndOfTickZeroHitMemberCount: number;
  individualNewlyZeroHitMemberCount: number;
  individualLifecycleTransitionCount: number;
  individualTerminalTransitionCount: number;
  totalIndividualEligibleMeleeSourceCount: number;
  totalIndividualSelectedTargetCount: number;
  totalIndividualActiveCommitmentCount: number;
  totalIndividualAttackAttemptCount: number;
  totalIndividualInvalidatedAttackCount: number;
  totalIndividualParryCount: number;
  totalIndividualBucklerBlockCount: number;
  totalIndividualShieldBlockCount: number;
  totalIndividualLandedDefenceOutcomeCount: number;
  totalIndividualGateAcceptedHitCount: number;
  totalIndividualGateRejectedHitCount: number;
  totalIndividualAppliedHitLoss: number;
  totalIndividualZeroHitTransitionCount: number;
  totalIndividualActiveGateRelationshipCount: number;
  totalIndividualTickStartCombatEligibleMemberCount: number;
  totalIndividualTickStartCombatIneligibleMemberCount: number;
  totalIndividualEndOfTickCombatEligibleMemberCount: number;
  totalIndividualEndOfTickZeroHitMemberCount: number;
  totalIndividualNewlyZeroHitMemberCount: number;
  totalIndividualLifecycleTransitionCount: number;
  totalIndividualTerminalTransitionCount: number;
  debugSnapshot: LiveCombatDebugSnapshot;
}

export interface FormationSandboxSimulationState {
  readonly identityStore: UnitIdentityStore;
  readonly formationStore: FormationBehaviourStore;
  readonly unitLabels: ReadonlyMap<UnitId, string>;
  debugSnapshot: FormationDebugSnapshot;
}

/** Isolated archived Milestone 3 visual fixture state, not production combat. */
export interface LegacyCombatFoundationSimulationState {
  readonly identityStore: UnitIdentityStore;
  readonly loadoutStore: UnitLoadoutStore;
  readonly formationStore: FormationBehaviourStore;
  readonly tempoStore: CombatTempoStore;
  readonly survivabilityStore: CombatSurvivabilityStore;
  readonly pipelineOutput: CombatPipelineOutput;
  readonly consequenceApplications: CombatConsequenceApplication[];
  readonly pressureStore: CombatPressureStore;
  readonly persistentMoraleStore: PersistentMoraleStore;
  readonly unitLabels: ReadonlyMap<UnitId, string>;
  readonly moraleMovementStates: Map<UnitId, MoraleMovementState>;
  readonly pressureUpdates: UnitPressureUpdate[];
  readonly moraleAssessments: CombatMoraleAssessment[];
  readonly moraleEvents: PersistentMoraleEvent[];
  readonly appliedDamagePressureScale: number;
  opportunityCount: number;
  strikeCount: number;
  survivabilityApplicationCount: number;
  consequenceCount: number;
  totalOpportunityCount: number;
  totalStrikeCount: number;
  totalSurvivabilityApplicationCount: number;
  totalConsequenceCount: number;
  debugSnapshot: LiveCombatDebugSnapshot;
}

export interface SimulationState {
  tick: number;
  rngState: number;
  readonly world: WorldState;
  readonly trustedIndividualEnergyProfileStore: TrustedIndividualEnergyProfileStore;
  readonly individualEnergyStore: IndividualEnergyStore;
  readonly combatSandbox?: CombatSandboxSimulationState;
  readonly legacyCombatFoundationSandbox?: LegacyCombatFoundationSimulationState;
  readonly formationSandbox?: FormationSandboxSimulationState;
}

export function entityIdFromIndex(index: number): EntityId {
  if (!Number.isSafeInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new RangeError("Entity IDs must be unsigned 32-bit integers.");
  }

  return index as EntityId;
}
