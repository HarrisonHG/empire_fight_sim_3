import { describe, expect, it } from "vitest";

import { MAIN_BATTLE_MEDICAL_SCENARIO } from "../../src/content/mainBattleMedicalScenario";
import {
  getIndividualEnergyActivityHistoryInspection,
} from "../../src/sim/individualEnergyActivity";
import {
  getIndividualCurrentEnergy,
  getIndividualMaximumEnergy,
} from "../../src/sim/individualEnergy";
import { getIndividualMaximumGlobalHits, getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import {
  MILESTONE_7_PRODUCTION_TICK_ORDER,
  advanceSimulationOneTick,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import { getUnitEnergySummaries } from "../../src/sim/unitEnergySummary";

const INTEGRATION_TICKS = 240;
const INSPECTED_ENTITY_IDS = Object.freeze([0, 4, 19]);

describe("Milestone 7H production consolidation", () => {
  it("documents the final production authority order", () => {
    expect(MILESTONE_7_PRODUCTION_TICK_ORDER).toEqual([
      "energyObservationAndTickStartProjection",
      "commitmentAndOrdinaryParticipationProjection",
      "preMovementLocalThreatAndEnergyBehaviourProjection",
      "formationAndSpecialistMovement",
      "combatExchangeAndGlobalHits",
      "casualtyTreatmentExecutionAndPresence",
      "energyActivityClassificationAndApplication",
      "unitEnergyAggregation",
      "pressureRecoveryRoutingAndMorale",
      "boundedHistoryAndDebugSnapshot",
    ]);
  });

  it("replays the main battle with bounded debug, history and reused outputs", () => {
    const first = runMainBattleSmoke();
    expect(runMainBattleSmoke()).toEqual(first);
    expect(first.finalTick).toBe(INTEGRATION_TICKS);
    expect(first.boundsValid).toBe(true);
    expect(first.noUnattributedHitRegeneration).toBe(true);
    expect(first.outputReuse).toEqual({
      selectedTargets: true,
      energySummaries: true,
      inspectedIndividuals: true,
    });
    expect(first.historyFieldCounts.every((count) => count === 6)).toBe(true);
    expect(first.inspected.every((inspection) =>
      inspection.energyBehaviourRecommendation !== undefined &&
      inspection.unitEnergyResting !== undefined &&
      inspection.energyAttackExertionHistoryCount !== undefined &&
      inspection.energyDefenceExertionHistoryCount !== undefined &&
      inspection.energySprintHistoryTicks !== undefined &&
      inspection.energyDragHistoryTicks !== undefined &&
      inspection.energyRestHistoryTicks !== undefined &&
      inspection.energyWaitingAtRespawnHistoryTicks !== undefined
    )).toBe(true);
    expect(first.unitSummaries.every((summary) =>
      summary.collectionTick === INTEGRATION_TICKS - 1 &&
      summary.energyBehaviourRecommendation !== undefined &&
      summary.currentlyRestingMemberCount >= 0
    )).toBe(true);
  }, 10_000);
});

function runMainBattleSmoke() {
  const simulation = createSimulation({
    ...MAIN_BATTLE_MEDICAL_SCENARIO,
    combatSandbox: {
      ...MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!,
      inspectedEntityIds: INSPECTED_ENTITY_IDS,
    },
  });
  const combat = simulation.combatSandbox!;
  const selectedTargets = combat.individualCombatPipelineBuffers.selectedTargetRecords;
  const energySummaries = combat.unitEnergySummaries;
  const inspectedIndividuals = combat.inspectedIndividuals;
  let boundsValid = true;
  let noUnattributedHitRegeneration = true;
  const previousHits = Array.from(
    { length: simulation.world.entityCount },
    (_, entityId) => getIndividualCurrentGlobalHits(
      combat.individualGlobalHitStore,
      entityId,
    ),
  );

  for (let tick = 0; tick < INTEGRATION_TICKS; tick += 1) {
    advanceSimulationOneTick(simulation);
    for (let entityId = 0; entityId < simulation.world.entityCount; entityId += 1) {
      const energy = getIndividualCurrentEnergy(combat.individualEnergyStore, entityId);
      boundsValid &&= energy >= 0 && energy <=
        getIndividualMaximumEnergy(combat.individualEnergyStore, entityId);
      boundsValid &&= getIndividualCurrentGlobalHits(
        combat.individualGlobalHitStore,
        entityId,
      ) <= getIndividualMaximumGlobalHits(combat.individualGlobalHitStore, entityId);
      const currentHits = getIndividualCurrentGlobalHits(
        combat.individualGlobalHitStore,
        entityId,
      );
      if (currentHits > previousHits[entityId]!) {
        noUnattributedHitRegeneration &&=
          combat.individualTreatmentActionResult.completedRecords.some(
            (record) => record.patientEntityId === entityId &&
              record.hitRestoration !== undefined,
          );
      }
      previousHits[entityId] = currentHits;
    }
  }

  const debug = createPositionSnapshot(simulation).combatDebug!;
  return {
    finalTick: simulation.tick,
    boundsValid,
    noUnattributedHitRegeneration,
    outputReuse: {
      selectedTargets:
        combat.individualCombatPipelineBuffers.selectedTargetRecords === selectedTargets,
      energySummaries: combat.unitEnergySummaries === energySummaries,
      inspectedIndividuals: combat.inspectedIndividuals === inspectedIndividuals,
    },
    historyFieldCounts: INSPECTED_ENTITY_IDS.map((entityId) =>
      Object.keys(getIndividualEnergyActivityHistoryInspection(
        combat.individualEnergyActivityStore,
        entityId,
      )).length,
    ),
    inspected: debug.inspectedIndividuals.map((inspection) => ({ ...inspection })),
    unitSummaries: getUnitEnergySummaries(combat.unitEnergySummaryStore)
      .map((summary) => ({ ...summary })),
    energy: Array.from({ length: simulation.world.entityCount }, (_, entityId) =>
      getIndividualCurrentEnergy(combat.individualEnergyStore, entityId)),
    hits: Array.from({ length: simulation.world.entityCount }, (_, entityId) =>
      getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId)),
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
  };
}
