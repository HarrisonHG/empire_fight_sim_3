import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import { initializeIndividualDeathCountsFromZeroHitTransitions } from "../../src/sim/individualDeathCount";
import {
  applyIndividualLandedHits,
  getIndividualCurrentGlobalHits,
} from "../../src/sim/individualGlobalHits";
import {
  applyTrustedIndividualLimbDisability,
  createIndividualLimbDisabilityStore,
  getIndividualLimbDisabilityInspection,
} from "../../src/sim/individualLimbDisability";
import { getIndividualMedicalClaimInspection } from "../../src/sim/individualMedicalClaims";
import { getIndividualGenericHerbInspection } from "../../src/sim/individualMedicalProfile";
import { getIndividualTraumaticWoundInspection } from "../../src/sim/individualTraumaticWound";
import {
  getIndividualTreatmentActionInspection,
  getIndividualTreatmentHistoryInspection,
  INDIVIDUAL_TREATMENT_TOUCH_RANGE,
  PHYSICK_LIMB_NO_HERB_TREATMENT_PROGRESS_TICKS,
  type IndividualTreatmentActionKind,
} from "../../src/sim/individualTreatmentAction";
import { advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import { getIndividualCasualtyHistoryInspection as getConsolidatedCasualtyHistory } from "../../src/sim/individualCasualtyConsolidation";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationState,
} from "../../src/sim/types";

describe("Milestone 6G-2b limb-disability treatment hooks", () => {
  it("owns arm and leg conditions by entity with bounded idempotent history", () => {
    const store = createIndividualLimbDisabilityStore(2);

    expect(applyTrustedIndividualLimbDisability(store, 1, "disabledArm"))
      .toEqual({ entityId: 1, kind: "disabledArm", applied: true });
    expect(applyTrustedIndividualLimbDisability(store, 1, "disabledArm").applied)
      .toBe(false);
    expect(applyTrustedIndividualLimbDisability(store, 1, "disabledLeg").applied)
      .toBe(true);
    expect(getIndividualLimbDisabilityInspection(store, 0)).toMatchObject({
      disabledArm: false,
      disabledLeg: false,
    });
    expect(getIndividualLimbDisabilityInspection(store, 1)).toEqual({
      disabledArm: true,
      disabledLeg: true,
      armEpisodeCount: 1,
      legEpisodeCount: 1,
      armClearedCount: 0,
      legClearedCount: 0,
    });
  });

  it("triages a disabled leg ahead of a disabled arm", () => {
    const simulation = createLimbSimulation(1);
    const combat = requireCombat(simulation);
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 0, "disabledArm",
    );
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 2, "disabledLeg",
    );

    for (let count = 0; count < 10; count += 1) {
      advanceSimulationOneTick(simulation);
      if (getIndividualMedicalClaimInspection(
        combat.individualMedicalClaimStore, 1,
      ).patientEntityId !== -1) break;
    }

    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(2);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toMatchObject({
      patientEntityId: 2,
      selectedLimbDisability: "disabledLeg",
    });
  });

  it("prefers leg then a 600-tick herb action, clears one limb, and reassesses the arm without reserving", () => {
    const simulation = createLimbSimulation(1);
    const combat = requireCombat(simulation);
    const hitsBefore = getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0);
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 0, "disabledArm",
    );
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 0, "disabledLeg",
    );

    advanceUntilActionStarts(simulation, "physickLimbWithHerb");
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toMatchObject({
      kind: "physickLimbWithHerb",
      selectedLimbDisability: "disabledLeg",
      requiredProgressTicks: 600,
      reservedGenericHerbs: 1,
      progressTicks: 0,
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 1, maximum: 1, reserved: 1 });

    advanceTicks(simulation, 599);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )!.progressTicks).toBe(599);
    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      kind: "physickLimbWithHerb",
      selectedLimbDisability: "disabledLeg",
      clearedLimbDisability: "disabledLeg",
      consumedGenericHerbs: 1,
      traumaCleared: false,
    });
    expect(combat.individualTreatmentActionResult.startedRecords).toHaveLength(0);
    expect(getIndividualLimbDisabilityInspection(
      combat.individualLimbDisabilityStore, 0,
    )).toMatchObject({ disabledArm: true, disabledLeg: false });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 0, maximum: 1, reserved: 0 });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(0);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 0,
    ).need).toBe("limbDisability");
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0))
      .toBe(hitsBefore);
    expect(getIndividualTraumaticWoundInspection(
      combat.individualTraumaticWoundStore, 0,
    ).state).toBe("none");
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("active");
    expect(getIndividualTreatmentHistoryInspection(
      combat.individualTreatmentActionStore, 1,
    ).clearedLimbCount).toBe(1);
    expect(combat.individualCasualtyUnitSummaries[0]).toMatchObject({
      treatmentCompletionCount: 1,
      limbWithHerbCompletionCount: 1,
      limbWithoutHerbCompletionCount: 0,
    });
    expect(getConsolidatedCasualtyHistory(
      combat.individualCasualtyHistoryStore,
      combat.individualDeathCountStore,
      combat.individualTraumaticWoundStore,
      combat.individualExecutionActionStore,
      combat.individualPlayerPresenceStore,
      0,
    ).limbTreatmentCount).toBe(1);

    advanceSimulationOneTick(simulation);
    expect(combat.individualTreatmentActionResult.startedRecords[0]).toMatchObject({
      kind: "physickLimbWithoutHerb",
      selectedLimbDisability: "disabledArm",
      requiredProgressTicks: PHYSICK_LIMB_NO_HERB_TREATMENT_PROGRESS_TICKS,
      reservedGenericHerbs: 0,
      progressTicks: 0,
    });
  });

  it("completes the zero-herb limb action after exactly 2,400 later ticks without reservation or consumption", () => {
    const simulation = createLimbSimulation(0);
    const combat = requireCombat(simulation);
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 0, "disabledLeg",
    );
    advanceUntilActionStarts(simulation, "physickLimbWithoutHerb");

    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toMatchObject({
      requiredProgressTicks: 2_400,
      reservedGenericHerbs: 0,
      progressTicks: 0,
    });
    advanceTicks(simulation, 2_399);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )!.progressTicks).toBe(2_399);
    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      kind: "physickLimbWithoutHerb",
      clearedLimbDisability: "disabledLeg",
      consumedGenericHerbs: 0,
    });
    expect(getIndividualLimbDisabilityInspection(
      combat.individualLimbDisabilityStore, 0,
    ).disabledLeg).toBe(false);
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 0, maximum: 0, reserved: 0 });
  });

  it("releases an interrupted herb reservation and restarts only after boundary reassessment", () => {
    const simulation = createLimbSimulation(1);
    const combat = requireCombat(simulation);
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 0, "disabledArm",
    );
    advanceUntilActionStarts(simulation, "physickLimbWithHerb");
    advanceSimulationOneTick(simulation);
    simulation.world.positionsX[1] = simulation.world.positionsX[0]! +
      INDIVIDUAL_TREATMENT_TOUCH_RANGE + 1;

    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.interruptedRecords[0]).toMatchObject({
      kind: "physickLimbWithHerb",
      selectedLimbDisability: "disabledArm",
      reason: "rangeLost",
      releasedGenericHerbs: 1,
      progressTicksLost: 1,
    });
    expect(combat.individualTreatmentActionResult.startedRecords).toHaveLength(0);
    expect(getIndividualLimbDisabilityInspection(
      combat.individualLimbDisabilityStore, 0,
    ).disabledArm).toBe(true);
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 1, maximum: 1, reserved: 0 });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(0);

    simulation.world.positionsX[1] = simulation.world.positionsX[0]!;
    advanceSimulationOneTick(simulation);
    expect(combat.individualTreatmentActionResult.startedRecords[0]).toMatchObject({
      kind: "physickLimbWithHerb",
      progressTicks: 0,
      reservedGenericHerbs: 1,
    });
  });

  it("keeps an active limb action non-pre-emptible then gives a nearby dying patient boundary priority", () => {
    const simulation = createLimbSimulation(1);
    const combat = requireCombat(simulation);
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 0, "disabledArm",
    );
    advanceUntilActionStarts(simulation, "physickLimbWithHerb");
    advanceTicks(simulation, 100);
    downPatient(simulation, 2, simulation.tick);

    advanceSimulationOneTick(simulation);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toMatchObject({ patientEntityId: 0, progressTicks: 101 });
    advanceTicks(simulation, 499);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      patientEntityId: 0,
      clearedLimbDisability: "disabledArm",
    });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(2);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 2,
    ).need).toBe("dying");
  });

  it("does not claim or treat a terminal character with a retained limb disability", () => {
    const simulation = createLimbSimulation(1);
    const combat = requireCombat(simulation);
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 0, "disabledLeg",
    );
    downPatient(simulation, 0, simulation.tick);
    transitionIndividualDyingToTerminal(
      combat.individualCasualtyLifecycleStore, 0, simulation.tick, "execution",
    );

    advanceTicks(simulation, 5);

    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(-1);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toBeUndefined();
    expect(getIndividualLimbDisabilityInspection(
      combat.individualLimbDisabilityStore, 0,
    ).disabledLeg).toBe(true);
  });
});

function advanceUntilActionStarts(
  simulation: SimulationState,
  kind: IndividualTreatmentActionKind,
): number {
  const combat = requireCombat(simulation);
  for (let count = 0; count < 80; count += 1) {
    advanceSimulationOneTick(simulation);
    const record = combat.individualTreatmentActionResult.startedRecords.find(
      (candidate) => candidate.kind === kind && candidate.healerEntityId === 1 &&
        candidate.patientEntityId === 0,
    );
    if (record !== undefined) return record.tick;
  }
  throw new Error(`Expected ${kind} to start.`);
}

function advanceTicks(simulation: SimulationState, count: number): void {
  for (let index = 0; index < count; index += 1) advanceSimulationOneTick(simulation);
}

function downPatient(
  simulation: SimulationState,
  entityId: number,
  tick: number,
): void {
  const combat = requireCombat(simulation);
  const currentHits = getIndividualCurrentGlobalHits(
    combat.individualGlobalHitStore, entityId,
  );
  const hitResult = applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: currentHits }, () => landedRecord(entityId)),
  );
  const transitions = applyIndividualZeroHitLifecycleTransitions(
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualCasualtyProcedureProfileStore,
    simulation.world,
    hitResult.zeroHitEvents,
    tick,
  );
  initializeIndividualDeathCountsFromZeroHitTransitions(
    combat.individualDeathCountStore,
    combat.individualCasualtyLifecycleStore,
    combat.individualCasualtyProcedureProfileStore,
    combat.individualProfileStore,
    transitions.transitions,
  );
}

function landedRecord(defenderEntityId: number): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId: 3,
    defenderEntityId,
    attackerWeaponCategory: "oneHanded",
    defenderActiveWeaponCategory: "unarmed",
    defenderShieldCategory: "none",
    defenderShieldCarriedState: "none",
    defenderActionState: "ready",
    guardStateBeforeResolution: "ready",
    defenderFacingX: -1,
    defenderFacingY: 0,
    incomingDirectionName: "west",
    incomingDirectionOctantIndex: 4,
    availableDefenceType: "none",
    outcome: "landed",
    landedReason: "noActiveDefence",
    defenceRecoveryTicksAssigned: 0,
    awkwardDistance: false,
  };
}

function createLimbSimulation(herbs: number): SimulationState {
  return createSimulation({
    seed: 0x6e_2d,
    entityCount: 4,
    bounds: { width: 400, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100),
        {
          ...unit(2, 1, 104),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: true,
            startingGenericHerbs: herbs,
          },
        },
        unit(3, 1, 106),
        unit(4, 2, 380),
      ],
    },
  });
}

function unit(
  unitId: number,
  factionId: number,
  x: number,
): CombatSandboxUnitScenario {
  return {
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x,
    anchorY: 60,
    headingX: 1,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold",
    role: "regular",
    memberMaxStep: 1,
    weaponCategory: "unarmed",
    weaponReachBand: "none",
    armourClass: "none",
    shieldClass: "none",
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: {
      procedureKind: "citizen",
      deathCountPolicy: { kind: "fixedTicks", durationTicks: 10_000 },
    },
  };
}

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
