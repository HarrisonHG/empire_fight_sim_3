import {
  collectAttackOpportunities,
  type CombatAttackOpportunity,
  type CombatTempoStore,
} from "./combatTempo";
import {
  resolveCombatOpportunities,
  type CombatStrikeResolution,
} from "./combatResolution";
import {
  applyCombatStrikeResolutions,
  type CombatSurvivabilityApplication,
  type CombatSurvivabilityStore,
} from "./combatSurvivability";
import type { FormationBehaviourStore } from "./formationBehaviour";
import type { UnitIdentityStore } from "./unitIdentity";
import type { UnitLoadoutStore } from "./unitLoadout";
import type { WorldState } from "./types";

export interface CombatPipelineTickResult {
  readonly opportunities: readonly CombatAttackOpportunity[];
  readonly strikes: readonly CombatStrikeResolution[];
  readonly applications: readonly CombatSurvivabilityApplication[];
}

export interface CombatPipelineOutput {
  readonly opportunities: CombatAttackOpportunity[];
  readonly strikes: CombatStrikeResolution[];
  readonly applications: CombatSurvivabilityApplication[];
}

export function createCombatPipelineOutput(): CombatPipelineOutput {
  return {
    opportunities: [],
    strikes: [],
    applications: [],
  };
}

// Expected tick order: first advanceFormationOneTick(...), then this pipeline.
export function advanceCombatPipelineOneTick(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  tempoStore: CombatTempoStore,
  survivabilityStore: CombatSurvivabilityStore,
  out: CombatPipelineOutput = createCombatPipelineOutput(),
): CombatPipelineTickResult {
  validateCombatPipelineInputs(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    tempoStore,
    survivabilityStore,
  );

  collectAttackOpportunities(
    world,
    identityStore,
    loadoutStore,
    formationStore,
    tempoStore,
    out.opportunities,
  );
  resolveCombatOpportunities(
    identityStore,
    loadoutStore,
    out.opportunities,
    out.strikes,
  );
  applyCombatStrikeResolutions(
    identityStore,
    loadoutStore,
    survivabilityStore,
    out.strikes,
    out.applications,
  );

  return out;
}

function validateCombatPipelineInputs(
  world: WorldState,
  identityStore: UnitIdentityStore,
  loadoutStore: UnitLoadoutStore,
  formationStore: FormationBehaviourStore,
  tempoStore: CombatTempoStore,
  survivabilityStore: CombatSurvivabilityStore,
): void {
  if (world.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "World entity count must match unit identity entity count.",
    );
  }
  if (loadoutStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Unit loadout entity count must match unit identity entity count.",
    );
  }
  if (formationStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Formation behaviour entity count must match unit identity entity count.",
    );
  }
  if (tempoStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Combat tempo entity count must match unit identity entity count.",
    );
  }
  if (survivabilityStore.entityCount !== identityStore.entityCount) {
    throw new RangeError(
      "Combat survivability entity count must match unit identity entity count.",
    );
  }
  if (loadoutStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Unit loadout unit count must match unit identity unit count.",
    );
  }
  if (formationStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Formation behaviour unit count must match unit identity unit count.",
    );
  }
  if (tempoStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Combat tempo unit count must match unit identity unit count.",
    );
  }
  if (survivabilityStore.unitCount !== identityStore.unitCount) {
    throw new RangeError(
      "Combat survivability unit count must match unit identity unit count.",
    );
  }
  if (
    world.positionsX.length < world.entityCount ||
    world.positionsY.length < world.entityCount
  ) {
    throw new RangeError(
      "World position arrays must cover the world entity count.",
    );
  }
}
