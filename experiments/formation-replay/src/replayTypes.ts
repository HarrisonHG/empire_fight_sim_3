import type {
  FormationBehaviourConfig,
  FormationBehaviourStore,
  FormationEvent,
  IndividualBehaviourConfig,
  MovementMode,
  UnitFormationConfig,
  UnitMovementStyle,
  UnitOrder,
} from "../../../src/sim/formationBehaviour";
import type { WorldState } from "../../../src/sim/types";
import type {
  UnitId,
  UnitIdentityConfig,
  UnitIdentityStore,
} from "../../../src/sim/unitIdentity";

export interface FormationReplayScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tickCount: number;
  readonly setup: () => FormationReplaySetup;
}

export interface FormationReplaySetup {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly store: FormationBehaviourStore;
  readonly units: readonly FormationReplayUnitDefinition[];
  readonly individuals: readonly FormationReplayIndividualDefinition[];
}

export interface FormationReplayUnitDefinition extends UnitFormationConfig {
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
}

export interface FormationReplayIndividualDefinition
  extends IndividualBehaviourConfig {
  readonly unitId: UnitId;
}

export interface FormationReplayHarnessConfig {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly entityCount: number;
  readonly identity: UnitIdentityConfig;
  readonly formation: FormationBehaviourConfig;
  readonly initialPositions: ReadonlyArray<{
    readonly entityId: number;
    readonly x: number;
    readonly y: number;
  }>;
}

export interface FormationReplay {
  readonly scenario: FormationReplayScenario;
  readonly worldBounds: { readonly width: number; readonly height: number };
  readonly units: readonly FormationReplayUnitDefinition[];
  readonly frames: readonly FormationReplayFrame[];
}

export interface FormationReplayFrame {
  readonly tick: number;
  readonly units: readonly FormationReplayUnitFrame[];
  readonly entities: readonly FormationReplayEntityFrame[];
  readonly slots: readonly FormationReplaySlotFrame[];
  readonly events: readonly FormationEvent[];
}

export interface FormationReplayUnitFrame {
  readonly unitId: UnitId;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: number;
  readonly headingY: number;
  readonly order: UnitOrder;
  readonly style: UnitMovementStyle;
  readonly cohesion: number;
}

export interface FormationReplayEntityFrame {
  readonly entityId: number;
  readonly unitId: UnitId;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly movementMode: MovementMode;
}

export interface FormationReplaySlotFrame {
  readonly unitId: UnitId;
  readonly entityId: number;
  readonly slotX: number;
  readonly slotY: number;
}
