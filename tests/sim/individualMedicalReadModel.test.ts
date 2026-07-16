import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  applyIndividualLandedHits,
} from "../../src/sim/individualGlobalHits";
import {
  getIndividualMovementMode,
  setIndividualPressure,
} from "../../src/sim/formationBehaviour";
import {
  calculateTraumaWithdrawalCandidateGoals,
  getIndividualMedicalLocalQueryPreparationCount,
  getIndividualMedicalUrgencyInspection,
  prepareIndividualMedicalLocalQueries,
  projectIndividualMedicalUrgency,
  queryIndividualAlliedPatientsWithinRadiusInto,
  queryIndividualAvailableAlliedPhysicksWithinRadiusInto,
} from "../../src/sim/individualMedicalReadModel";
import {
  calculateTraumaticWoundOpportunityRoll,
  clearIndividualTraumaticWound,
  resolveIndividualTraumaticWoundOpportunities,
  type IndividualTraumaticWoundOpportunity,
} from "../../src/sim/individualTraumaticWound";
import {
  getSelectedTargetEntityId,
  NO_INDIVIDUAL_TARGET,
} from "../../src/sim/individualMeleeTargetSelection";
import { isIndividualCombatEligible } from "../../src/sim/individualCombatEligibility";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";

describe("individual medical urgency and prepared discovery", () => {
  it("orders dying, trauma, dangerous, below-half and comfortable urgency with role distinctions", () => {
    const simulation = createSimulation(medicalScenario([
      unit(1, 1, 20, "none", "regular"),
      unit(2, 1, 40, "none", "regular"),
      unit(3, 1, 60, "none", "regular"),
      unit(4, 1, 80, "heavy", "regular"),
      unit(5, 1, 100, "heavy", "regular"),
      unit(6, 1, 120, "heavy", "recruit"),
      unit(7, 2, 140, "heavy", "veteran"),
    ]));
    const combat = requireCombat(simulation);
    const zero = applyLosses(combat, 0, 2).zeroHitEvents;
    applyIndividualZeroHitLifecycleTransitions(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualCasualtyProcedureProfileStore,
      simulation.world,
      zero,
      10,
    );
    applyTrauma(combat, 0);
    applyTrauma(combat, 1);
    applyLosses(combat, 2, 1);
    applyLosses(combat, 3, 4);
    applyLosses(combat, 4, 1);
    applyLosses(combat, 5, 4);
    applyLosses(combat, 6, 4);
    setIndividualPressure(combat.formationStore, 6, 80);

    projectIndividualMedicalUrgency(
      combat.identityStore,
      combat.formationStore,
      combat.individualGlobalHitStore,
      combat.individualCasualtyLifecycleStore,
      combat.individualCasualtyProcedureProfileStore,
      combat.individualTraumaticWoundStore,
      combat.individualLimbDisabilityStore,
      combat.individualOrdinaryParticipationSnapshot,
      combat.individualMedicalUrgencyStore,
    );

    const inspections = Array.from({ length: 7 }, (_, entityId) =>
      getIndividualMedicalUrgencyInspection(
        combat.individualMedicalUrgencyStore,
        entityId,
      ));
    expect(inspections.map((value) => value.urgencyKind)).toEqual([
      "dying",
      "traumaticWound",
      "dangerouslyLowHits",
      "belowHalfHits",
      "comfortableMissingHits",
      "belowHalfHits",
      "belowHalfHits",
    ]);
    expect(inspections.slice(0, 5).map((value) => value.urgencyPriority)).toEqual([
      500, 400, 300, 200, 100,
    ]);
    expect(inspections[0]).toMatchObject({
      urgencyKind: "dying",
      traumaWithdrawalActive: false,
    });
    expect(inspections[5]!.urgencyPriority).toBeGreaterThan(
      inspections[3]!.urgencyPriority,
    );
    expect(inspections[6]!.urgencyPriority).toBeLessThan(
      inspections[3]!.urgencyPriority,
    );
  });

  it("reuses one prepared grid and filters allied patients and available Physicks", () => {
    const units = [
      { ...unit(1, 1, 50, "none", "regular"), medicalProfile: physick() },
      { ...unit(2, 1, 40, "none", "regular"), medicalProfile: physick() },
      { ...unit(3, 1, 60, "none", "regular"), medicalProfile: physick() },
      { ...unit(4, 2, 45, "none", "regular"), medicalProfile: physick() },
      { ...unit(5, 1, 55, "none", "regular"), medicalProfile: physick(0) },
      { ...unit(6, 1, 65, "none", "regular"), medicalProfile: physick() },
      { ...unit(7, 1, 70, "none", "regular"), medicalProfile: physick() },
      unit(8, 1, 75, "none", "regular"),
    ];
    const simulation = createSimulation(medicalScenario(units));
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0);
    applyTrauma(combat, 5);
    combat.moraleMovementStates.set(7, "routing");
    const dyingZero = applyLosses(combat, 7, 2).zeroHitEvents;
    applyIndividualZeroHitLifecycleTransitions(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualCasualtyProcedureProfileStore,
      simulation.world,
      dyingZero,
      12,
    );
    projectIndividualMedicalUrgency(
      combat.identityStore,
      combat.formationStore,
      combat.individualGlobalHitStore,
      combat.individualCasualtyLifecycleStore,
      combat.individualCasualtyProcedureProfileStore,
      combat.individualTraumaticWoundStore,
      combat.individualLimbDisabilityStore,
      combat.individualOrdinaryParticipationSnapshot,
      combat.individualMedicalUrgencyStore,
    );
    prepareIndividualMedicalLocalQueries(
      simulation.world,
      combat.identityStore,
      combat.individualCasualtyLifecycleStore,
      combat.trustedIndividualMedicalProfileStore,
      combat.individualGenericHerbStore,
      combat.individualTraumaticWoundStore,
      combat.individualMedicalUrgencyStore,
      combat.individualOrdinaryParticipationSnapshot,
      combat.moraleMovementStates,
      combat.individualMedicalLocalQueryStore,
    );
    const physickOut: import("../../src/sim/individualMedicalReadModel").IndividualAvailablePhysickCandidate[] = [];
    const patientOut: import("../../src/sim/individualMedicalReadModel").IndividualMedicalPatientCandidate[] = [];
    const physicks = queryIndividualAvailableAlliedPhysicksWithinRadiusInto(
      combat.individualMedicalLocalQueryStore,
      combat.individualGenericHerbStore,
      simulation.world,
      0,
      192,
      physickOut,
    );
    const patients = queryIndividualAlliedPatientsWithinRadiusInto(
      combat.individualMedicalLocalQueryStore,
      combat.individualMedicalUrgencyStore,
      simulation.world,
      1,
      192,
      patientOut,
    );

    expect(physicks.records).toBe(physickOut);
    expect(physicks.records.map((record) => record.entityId)).toEqual([1, 2]);
    expect(patients.records).toBe(patientOut);
    expect(patients.records.map((record) => record.entityId)).toEqual([7, 0, 5]);
    expect(getIndividualMedicalLocalQueryPreparationCount(
      combat.individualMedicalLocalQueryStore,
    )).toBe(1);
  });
});

describe("production trauma withdrawal", () => {
  it("withdraws on the next decision tick, seeks an available Physick, and remains targetable", () => {
    const patient = unit(1, 1, 50, "none", "regular", "oneHanded");
    const healer = {
      ...unit(2, 1, 80, "none", "regular"),
      medicalProfile: physick(),
    };
    const hostile = unit(3, 2, 60, "none", "regular", "oneHanded", -1);
    const simulation = createSimulation(medicalScenario([patient, healer, hostile], [0]));
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0);
    const beforeX = simulation.world.positionsX[0]!;

    advanceSimulationOneTick(simulation);

    const urgency = getIndividualMedicalUrgencyInspection(
      combat.individualMedicalUrgencyStore,
      0,
    );
    expect(urgency).toMatchObject({
      urgencyKind: "traumaticWound",
      traumaWithdrawalActive: true,
      withdrawalGoalKind: "availablePhysick",
      withdrawalTargetPhysickEntityId: 1,
      localPhysickCandidateCount: 1,
    });
    expect(simulation.world.positionsX[0]).toBeGreaterThan(beforeX);
    expect(getIndividualMovementMode(combat.formationStore, 0)).toBe(
      "withdrawForTreatment",
    );
    expect(isIndividualCombatEligible(
      combat.individualCombatEligibilitySnapshot,
      0,
    )).toBe(false);
    expect(getSelectedTargetEntityId(combat.individualTargetSelectionStore, 0))
      .toBe(NO_INDIVIDUAL_TARGET);
    expect(getSelectedTargetEntityId(combat.individualTargetSelectionStore, 2))
      .toBe(0);
    expect(combat.individualCombatPipelineBuffers.selectedTargetRecords.find(
      (record) => record.sourceEntityId === 2,
    )).toMatchObject({
      targetEntityId: 0,
      targetCanThreatSource: false,
    });
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore,
      0,
    )).toBe("active");
    expect(combat.debugSnapshot.inspectedIndividuals[0]).toMatchObject({
      traumaWithdrawalActive: true,
      traumaWithdrawalGoalKind: "availablePhysick",
      withdrawalTargetPhysickEntityId: 1,
    });

    clearIndividualTraumaticWound(combat.individualTraumaticWoundStore, 0);
    advanceSimulationOneTick(simulation);
    expect(getIndividualMedicalUrgencyInspection(
      combat.individualMedicalUrgencyStore,
      0,
    ).traumaWithdrawalActive).toBe(false);
    expect(isIndividualCombatEligible(
      combat.individualCombatEligibilitySnapshot,
      0,
    )).toBe(true);
  });

  it("uses deterministic low-threat rear withdrawal when no Physick is available", () => {
    const patient = unit(1, 1, 80, "none", "regular", "oneHanded");
    const hostile = unit(2, 2, 100, "none", "regular", "oneHanded", -1);
    const simulation = createSimulation(medicalScenario([patient, hostile], [0]));
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0);
    const beforeX = simulation.world.positionsX[0]!;

    advanceSimulationOneTick(simulation);

    expect(getIndividualMedicalUrgencyInspection(
      combat.individualMedicalUrgencyStore,
      0,
    )).toMatchObject({
      withdrawalGoalKind: "lowThreatRear",
      withdrawalTargetPhysickEntityId: -1,
      localPhysickCandidateCount: 0,
    });
    expect(simulation.world.positionsX[0]).toBeLessThan(beforeX);
  });

  it("prefers an ordinary fighter over an armed traumatised target as the genuine mutual threat", () => {
    const traumatised = unit(1, 1, 70, "none", "regular", "oneHanded");
    const fighter = unit(2, 1, 70, "none", "regular", "oneHanded");
    const attacker = unit(3, 2, 80, "none", "regular", "oneHanded", -1);
    const simulation = createSimulation(
      medicalScenario([traumatised, fighter, attacker]),
    );
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0);

    advanceSimulationOneTick(simulation);

    expect(getSelectedTargetEntityId(combat.individualTargetSelectionStore, 2))
      .toBe(1);
    expect(combat.individualCombatPipelineBuffers.selectedTargetRecords.find(
      (record) => record.sourceEntityId === 2,
    )).toMatchObject({
      targetEntityId: 1,
      targetCanThreatSource: true,
    });
  });

  it("excludes traumatised hostiles from fallback threat counts and keeps the canonical direction tie", () => {
    const patient = unit(1, 1, 100, "none", "regular", "oneHanded");
    const traumatisedHostile = unit(
      2, 2, 40, "none", "regular", "oneHanded", -1,
    );
    const simulation = createSimulation(
      medicalScenario([patient, traumatisedHostile]),
    );
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0);
    applyTrauma(combat, 1);

    advanceSimulationOneTick(simulation);

    expect(getIndividualMedicalUrgencyInspection(
      combat.individualMedicalUrgencyStore,
      0,
    )).toMatchObject({
      withdrawalGoalKind: "lowThreatRear",
      withdrawalGoalX: 36,
      withdrawalGoalY: 60,
      withdrawalThreatCount: 0,
    });
  });

  it("projects all fallback directions the same fixed distance in stable order", () => {
    const first = calculateTraumaWithdrawalCandidateGoals(
      100, 100, 1, 0, { width: 300, height: 300 },
    );
    const second = calculateTraumaWithdrawalCandidateGoals(
      100, 100, 1, 0, { width: 300, height: 300 },
    );

    expect(second).toEqual(first);
    expect(first[0]).toEqual({ x: 36, y: 100 });
    for (const goal of first) {
      expect(Math.hypot(goal.x - 100, goal.y - 100)).toBeCloseTo(64, 10);
    }
  });
});

function medicalScenario(
  units: readonly CombatSandboxUnitScenario[],
  inspectedEntityIds?: readonly number[],
): SimulationScenario {
  return {
    seed: 0x6c_20,
    entityCount: units.length,
    bounds: { width: 240, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units,
      ...(inspectedEntityIds === undefined ? {} : { inspectedEntityIds }),
    },
  };
}

function unit(
  unitId: number,
  factionId: number,
  x: number,
  armourClass: "none" | "heavy",
  role: "recruit" | "regular" | "veteran",
  weaponCategory: "unarmed" | "oneHanded" = "unarmed",
  headingX: -1 | 1 = 1,
): CombatSandboxUnitScenario {
  return {
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x,
    anchorY: 60,
    headingX,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold",
    role,
    memberMaxStep: 2,
    weaponCategory,
    weaponReachBand: weaponCategory === "oneHanded" ? "short" : "none",
    armourClass,
    shieldClass: "none",
    attackIntervalTicks: 1,
    maxDamageCapacity: 1_000,
    casualtyProcedure: {
      procedureKind: "citizen",
      deathCountPolicy: { kind: "normalFortitude" },
    },
  };
}

function physick(startingGenericHerbs?: number) {
  return {
    hasChirurgeon: true,
    hasPhysick: true,
    ...(startingGenericHerbs === undefined ? {} : { startingGenericHerbs }),
  };
}

function applyTrauma(combat: CombatSandboxSimulationState, entityId: number): void {
  const opportunity = findSuccessfulOpportunity(combat.battleSeed, entityId);
  resolveIndividualTraumaticWoundOpportunities(
    combat.battleSeed,
    combat.individualCasualtyProcedureProfileStore,
    combat.individualTraumaticWoundStore,
    [opportunity],
  );
}

function findSuccessfulOpportunity(
  battleSeed: number,
  targetEntityId: number,
): IndividualTraumaticWoundOpportunity {
  for (let tick = 1; tick < 10_000; tick += 1) {
    const opportunity = {
      targetEntityId,
      attackerEntityId: targetEntityId === 0 ? 1 : 0,
      tick,
      triggerKind: "limbCleave" as const,
    };
    if (calculateTraumaticWoundOpportunityRoll(battleSeed, opportunity) < 100) {
      return opportunity;
    }
  }
  throw new Error("Expected a successful trauma identity.");
}

function applyLosses(
  combat: CombatSandboxSimulationState,
  defenderEntityId: number,
  count: number,
): { readonly zeroHitEvents: readonly import("../../src/sim/individualGlobalHits").IndividualZeroHitEvent[] } {
  const records = Array.from({ length: count }, () => landedRecord(
    defenderEntityId === 0 ? 1 : 0,
    defenderEntityId,
  ));
  return applyIndividualLandedHits(combat.individualGlobalHitStore, records);
}

function landedRecord(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId,
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

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
