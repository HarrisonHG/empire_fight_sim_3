import type { CombatConsequenceApplication } from "./combatConsequences";
import type { CombatMoraleAssessment, CombatMoraleState } from "./combatMorale";
import type { CombatPipelineOutput } from "./combatPipeline";
import type {
  CombatPressureStore,
  UnitPressureUpdate,
} from "./combatPressure";
import type { CombatSurvivabilityStore } from "./combatSurvivability";
import type { CombatTempoStore } from "./combatTempo";
import type {
  IndividualCombatPipelineBuffers,
  IndividualCombatPipelineStores,
} from "./individualCombatPipeline";
import type { IndividualCombatProfileStore } from "./individualCombatProfile";
import type { IndividualGlobalHitStore } from "./individualGlobalHits";
import type { IndividualLandedHitGateStore } from "./individualLandedHitGate";
import type { IndividualMeleeDefenceStore } from "./individualMeleeDefence";
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
  readonly memberMaxStep: number;
  readonly weaponCategory: WeaponCategory;
  readonly weaponReachBand: WeaponReachBand;
  readonly armourClass: ArmourClass;
  readonly shieldClass: ShieldClass;
  readonly attackIntervalTicks: number;
  readonly maxDamageCapacity: number;
  /** Optional compact inspection label; does not affect simulation rules. */
  readonly label?: string;
  /** Optional formation-owned initial cohesion; also defines recovery maximum. */
  readonly initialCohesion?: number;
  /** Optional per-member confidence used by persistent morale interpretation. */
  readonly individualConfidence?: number;
}

/**
 * The intentionally narrow production combat scene. It is scenario data, not
 * a general scenario framework: small deterministic opposing-unit sets only.
 */
export interface CombatSandboxScenario {
  readonly kind: "liveCombatSandbox";
  readonly units: readonly CombatSandboxUnitScenario[];
  readonly appliedDamagePressureScale: number;
}

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
  readonly combatSandbox?: CombatSandboxScenario;
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
  readonly accumulatedDamage: number;
  /** Stateless Milestone 3 assessment, retained for diagnostic comparison. */
  readonly assessmentPressureAverage: number;
  /** Stateless Milestone 3 assessment, retained for diagnostic comparison. */
  readonly assessmentMoraleState: CombatMoraleState;
  /** Persistent Milestone 4 interpretation consumed by next tick's movement. */
  readonly persistentMoraleState: MoraleMovementState;
  readonly routingRisk: number;
  readonly recoveryProgress: number;
  readonly persistentPressure: number;
  readonly currentCohesion: number;
}

/** Compact, render-safe inspection state for the production combat sandbox. */
export interface LiveCombatDebugSnapshot {
  readonly opportunityCount: number;
  readonly strikeCount: number;
  readonly survivabilityApplicationCount: number;
  readonly consequenceCount: number;
  readonly totalOpportunityCount: number;
  readonly totalStrikeCount: number;
  readonly totalSurvivabilityApplicationCount: number;
  readonly totalConsequenceCount: number;
  readonly units: readonly LiveCombatDebugUnitSnapshot[];
}

/**
 * The accepted Milestone 3 stores owned by the live sandbox only. Generic
 * foundation simulations deliberately remain free of these stores.
 */
export interface CombatSandboxSimulationState {
  readonly identityStore: UnitIdentityStore;
  readonly loadoutStore: UnitLoadoutStore;
  readonly formationStore: FormationBehaviourStore;
  readonly individualProfileStore: IndividualCombatProfileStore;
  readonly individualTargetSelectionStore: IndividualMeleeTargetSelectionStore;
  readonly individualCombatActionStore: IndividualCombatActionStore;
  readonly individualMeleeDefenceStore: IndividualMeleeDefenceStore;
  readonly individualLandedHitGateStore: IndividualLandedHitGateStore;
  readonly individualGlobalHitStore: IndividualGlobalHitStore;
  readonly individualCombatPipelineStores: IndividualCombatPipelineStores;
  readonly individualCombatPipelineBuffers: IndividualCombatPipelineBuffers;
  readonly tempoStore: CombatTempoStore;
  readonly survivabilityStore: CombatSurvivabilityStore;
  readonly pressureStore: CombatPressureStore;
  readonly routingContagionStore: RoutingContagionStore;
  readonly recoveryThreatStore: RecoveryThreatStore;
  readonly persistentMoraleStore: PersistentMoraleStore;
  readonly unitLabels: ReadonlyMap<UnitId, string>;
  /** Tick-start read model consumed by formation; persistent morale owns it. */
  readonly moraleMovementStates: Map<UnitId, MoraleMovementState>;
  readonly pipelineOutput: CombatPipelineOutput;
  readonly consequenceApplications: CombatConsequenceApplication[];
  readonly pressureUpdates: UnitPressureUpdate[];
  readonly routingContagionSummaries: UnitRoutingContagionSummary[];
  readonly recoveryThreatSummaries: UnitRecoveryThreatSummary[];
  readonly moraleAssessments: CombatMoraleAssessment[];
  readonly moraleEvents: PersistentMoraleEvent[];
  readonly appliedDamagePressureScale: number;
  opportunityCount: number;
  strikeCount: number;
  survivabilityApplicationCount: number;
  consequenceCount: number;
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
  totalOpportunityCount: number;
  totalStrikeCount: number;
  totalSurvivabilityApplicationCount: number;
  totalConsequenceCount: number;
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
  debugSnapshot: LiveCombatDebugSnapshot;
}

export interface FormationSandboxSimulationState {
  readonly identityStore: UnitIdentityStore;
  readonly formationStore: FormationBehaviourStore;
  readonly unitLabels: ReadonlyMap<UnitId, string>;
  debugSnapshot: FormationDebugSnapshot;
}

export interface SimulationState {
  tick: number;
  rngState: number;
  readonly world: WorldState;
  readonly combatSandbox?: CombatSandboxSimulationState;
  readonly formationSandbox?: FormationSandboxSimulationState;
}

export function entityIdFromIndex(index: number): EntityId {
  if (!Number.isSafeInteger(index) || index < 0 || index > 0xffff_ffff) {
    throw new RangeError("Entity IDs must be unsigned 32-bit integers.");
  }

  return index as EntityId;
}
