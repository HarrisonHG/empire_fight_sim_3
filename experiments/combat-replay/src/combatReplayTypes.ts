import type { CombatAttackOpportunity } from "../../../src/sim/combatTempo";
import type { CombatStrikeResolution } from "../../../src/sim/combatResolution";
import type { CombatSurvivabilityApplication } from "../../../src/sim/combatSurvivability";
import type {
  FormationBehaviourStore,
  FormationEvent,
  IndividualBehaviourConfig,
  UnitFormationConfig,
  UnitMovementStyle,
  UnitOrder,
} from "../../../src/sim/formationBehaviour";
import type { UnitEngagementSummary } from "../../../src/sim/combatEngagement";
import type { WorldState } from "../../../src/sim/types";
import type {
  ArmourClass,
  ShieldClass,
  UnitLoadoutConfig,
  UnitLoadoutStore,
  WeaponReachBand,
} from "../../../src/sim/unitLoadout";
import type {
  UnitId,
  UnitIdentityConfig,
  UnitIdentityStore,
} from "../../../src/sim/unitIdentity";
import type { CombatTempoStore } from "../../../src/sim/combatTempo";
import type { CombatSurvivabilityStore } from "../../../src/sim/combatSurvivability";

export interface CombatReplayScenarioDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tickCount: number;
  readonly setup: () => CombatReplaySetup;
}

export interface CombatReplaySetup {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
  readonly formation: FormationBehaviourStore;
  readonly tempo: CombatTempoStore;
  readonly survivability: CombatSurvivabilityStore;
  readonly units: readonly CombatReplayUnitDefinition[];
  readonly individuals: readonly CombatReplayIndividualDefinition[];
}

export interface CombatReplayUnitDefinition extends UnitFormationConfig {
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
  readonly label: string;
  readonly side: "source" | "target" | "other";
  readonly weaponReachBand?: WeaponReachBand;
  readonly armourClass?: ArmourClass;
  readonly shieldClass?: ShieldClass;
}

export interface CombatReplayIndividualDefinition
  extends IndividualBehaviourConfig {
  readonly unitId: UnitId;
}

export interface CombatReplayHarnessConfig {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly entityCount: number;
  readonly identity: UnitIdentityConfig;
  readonly loadout: UnitLoadoutConfig;
  readonly formation: {
    readonly entityCount: number;
    readonly rngSeed: number;
    readonly units: readonly UnitFormationConfig[];
    readonly individuals: readonly IndividualBehaviourConfig[];
  };
  readonly tempo: {
    readonly entityCount: number;
    readonly baseAttackIntervalTicks?: number;
    readonly units?: readonly {
      readonly unitId: UnitId;
      readonly attackIntervalTicks?: number;
      readonly initialCooldownTicks?: number;
    }[];
  };
  readonly survivability: {
    readonly entityCount: number;
    readonly units?: readonly {
      readonly unitId: UnitId;
      readonly maxDamageCapacity?: number;
      readonly initialAccumulatedDamage?: number;
    }[];
  };
  readonly replayUnits: readonly CombatReplayUnitDefinition[];
  readonly replayIndividuals: readonly CombatReplayIndividualDefinition[];
  readonly initialPositions: ReadonlyArray<{
    readonly entityId: number;
    readonly x: number;
    readonly y: number;
  }>;
}

export interface CombatReplayRecord {
  readonly scenario: CombatReplayScenarioDefinition;
  readonly worldBounds: { readonly width: number; readonly height: number };
  readonly units: readonly CombatReplayUnitDefinition[];
  readonly frames: readonly CombatReplayFrame[];
}

export interface CombatReplayFrame {
  readonly tick: number;
  readonly units: readonly CombatReplayUnitFrame[];
  readonly entities: readonly CombatReplayEntityFrame[];
  readonly engagementSummaries: readonly UnitEngagementSummary[];
  readonly formationEvents: readonly FormationEvent[];
  readonly opportunities: readonly CombatAttackOpportunity[];
  readonly strikes: readonly CombatStrikeResolution[];
  readonly applications: readonly CombatSurvivabilityApplication[];
  readonly counts: CombatReplayPipelineCounts;
  readonly lastApplication: CombatSurvivabilityApplication | undefined;
  readonly logLines: readonly string[];
}

export interface CombatReplayPipelineCounts {
  readonly opportunities: number;
  readonly strikes: number;
  readonly applications: number;
}

export interface CombatReplayUnitFrame {
  readonly unitId: UnitId;
  readonly factionId: number;
  readonly label: string;
  readonly side: "source" | "target" | "other";
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly order: UnitOrder;
  readonly movementStyle: UnitMovementStyle;
  readonly weaponReachBand: WeaponReachBand;
  readonly armourClass: ArmourClass;
  readonly shieldClass: ShieldClass;
  readonly threatRange: number;
  readonly contactDistance: number;
  readonly engagementState: UnitEngagementSummary["engagementState"];
  readonly primaryTargetUnitId: UnitId | undefined;
  readonly attackCooldownTicks: number;
  readonly accumulatedDamage: number;
  readonly maxDamageCapacity: number;
  readonly capacityReached: boolean;
}

export interface CombatReplayEntityFrame {
  readonly entityId: number;
  readonly unitId: UnitId;
  readonly x: number;
  readonly y: number;
}
