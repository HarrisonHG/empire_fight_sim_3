import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
} from "../../src/sim/individualCasualtyLifecycle";
import { initializeIndividualDeathCountsFromZeroHitTransitions } from "../../src/sim/individualDeathCount";
import { applyIndividualLandedHits, getIndividualCurrentGlobalHits, getIndividualMaximumGlobalHits } from "../../src/sim/individualGlobalHits";
import { restoreIndividualGlobalHits } from "../../src/sim/individualGlobalHits";
import {
  getIndividualMedicalClaimInspection,
  reassessIndividualMedicalClaimsAtActionBoundaries,
} from "../../src/sim/individualMedicalClaims";
import { prepareIndividualMedicalLocalQueries } from "../../src/sim/individualMedicalReadModel";
import {
  getIndividualGenericHerbInspection,
  getIndividualGenericHerbReservationInspection,
  releaseIndividualGenericHerbTreatmentReservation,
} from "../../src/sim/individualMedicalProfile";
import { isIndividualOrdinaryParticipationEligible } from "../../src/sim/individualOrdinaryParticipation";
import {
  calculateTraumaticWoundOpportunityRoll,
  getIndividualTraumaticWoundInspection,
  resolveIndividualTraumaticWoundOpportunities,
} from "../../src/sim/individualTraumaticWound";
import {
  advanceIndividualTreatmentActionsOneTick,
  CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS,
  getIndividualTreatmentActionInspection,
  getIndividualTreatmentHistoryInspection,
  INDIVIDUAL_TREATMENT_TOUCH_RANGE,
} from "../../src/sim/individualTreatmentAction";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import type { IndividualLandedHitGateDecisionRecord } from "../../src/sim/individualLandedHitGate";
import { advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type { CombatSandboxSimulationState, CombatSandboxUnitScenario, SimulationState } from "../../src/sim/types";

describe("Milestone 6G-2a herb-backed Physick treatment", () => {
  it("reserves without spending, completes after 600 later ticks, consumes once, and restores one active hit", () => {
    const simulation = createMedicalSimulation(1);
    const combat = requireCombat(simulation);
    applyHitLosses(combat, 0, 1);
    const lifecycleBefore = getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    );
    const presenceBefore = getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    );
    const startedTick = advanceUntilActionStarts(simulation, "physickRestoreGlobalHit", 1, 0);
    const action = getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )!;

    expect(action).toMatchObject({
      kind: "physickRestoreGlobalHit",
      startedTick,
      progressTicks: 0,
      requiredProgressTicks: 600,
      reservedGenericHerbs: 1,
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 1, maximum: 1, reserved: 1 });
    expect(getIndividualGenericHerbReservationInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ reserved: 1, treatmentActionId: action.actionId });
    expect(() => releaseIndividualGenericHerbTreatmentReservation(
      combat.individualGenericHerbStore, 1, action.actionId + 1,
    )).toThrow(/matching treatment action/);

    advanceProgressTicks(simulation, 599);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )!.progressTicks).toBe(599);
    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      kind: "physickRestoreGlobalHit",
      progressTicks: CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS,
      consumedGenericHerbs: 1,
      traumaCleared: false,
      hitRestoration: {
        reason: "physickTreatment",
        appliedHitRestoration: 1,
      },
    });
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0))
      .toBe(getIndividualMaximumGlobalHits(combat.individualGlobalHitStore, 0));
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe(lifecycleBefore);
    expect(getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    )).toBe(presenceBefore);
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 0, maximum: 1, reserved: 0 });
    expect(getIndividualTreatmentHistoryInspection(
      combat.individualTreatmentActionStore, 1,
    )).toMatchObject({ startedCount: 1, completedCount: 1, restoredHitCount: 1 });
  });

  it("clears only active trauma, consumes one herb, and restores ordinary behaviour next snapshot", () => {
    const simulation = createMedicalSimulation(1);
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0, 1);
    const hitsBefore = getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0);
    advanceUntilActionStarts(simulation, "physickTraumaticWound", 1, 0);

    advanceProgressTicks(simulation, 600);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      kind: "physickTraumaticWound",
      consumedGenericHerbs: 1,
      traumaCleared: true,
    });
    expect(combat.individualTreatmentActionResult.completedRecords[0]!.hitRestoration)
      .toBeUndefined();
    expect(getIndividualTraumaticWoundInspection(
      combat.individualTraumaticWoundStore, 0,
    ).state).toBe("none");
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0))
      .toBe(hitsBefore);
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("active");
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    ).current).toBe(0);
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 0,
    )).toBe(false);

    advanceSimulationOneTick(simulation);
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 0,
    )).toBe(true);
    expect(getIndividualTreatmentHistoryInspection(
      combat.individualTreatmentActionStore, 1,
    ).clearedTraumaCount).toBe(1);
  });

  it("releases rather than consumes on interruption and retains the current-patient claim for reassessment", () => {
    const simulation = createMedicalSimulation(1);
    const combat = requireCombat(simulation);
    applyHitLosses(combat, 0, 1);
    advanceUntilActionStarts(simulation, "physickRestoreGlobalHit", 1, 0);
    advanceSimulationOneTick(simulation);
    simulation.world.positionsX[1] = simulation.world.positionsX[0]! +
      INDIVIDUAL_TREATMENT_TOUCH_RANGE + 1;

    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.interruptedRecords[0]).toMatchObject({
      kind: "physickRestoreGlobalHit",
      reason: "rangeLost",
      progressTicksLost: 1,
      releasedGenericHerbs: 1,
    });
    expect(combat.individualTreatmentActionResult.startedRecords).toHaveLength(0);
    expect(combat.individualTreatmentActionResult.reassessmentRequests[0]).toMatchObject({
      healerEntityId: 1,
      previousPatientEntityId: 0,
      boundary: "interrupted",
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 1, maximum: 1, reserved: 0 });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(0);

    simulation.world.positionsX[1] = simulation.world.positionsX[0]!;
    simulation.world.positionsY[1] = simulation.world.positionsY[0]!;
    advanceSimulationOneTick(simulation);
    expect(combat.individualTreatmentActionResult.startedRecords[0]).toMatchObject({
      kind: "physickRestoreGlobalHit",
      healerEntityId: 1,
      patientEntityId: 0,
      progressTicks: 0,
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 1, maximum: 1, reserved: 1 });
  });

  it.each([
    "healerAttackAttempt",
    "patientAcceptedHit",
  ] as const)("uses authoritative %s evidence to release the herb without consuming it", (evidence) => {
    const simulation = createMedicalSimulation(1);
    const combat = requireCombat(simulation);
    applyHitLosses(combat, 0, 1);
    advanceUntilActionStarts(simulation, "physickRestoreGlobalHit", 1, 0);
    const tick = simulation.tick + 1;
    const attempts = evidence === "healerAttackAttempt" ? [attempt(1, 2)] : [];
    const decisions = evidence === "patientAcceptedHit" ? [acceptedHit(2, 0, tick)] : [];

    const result = advanceTreatmentWithEvidence(
      simulation, attempts, decisions, tick,
    );

    expect(result.interruptedRecords[0]).toMatchObject({
      reason: evidence,
      releasedGenericHerbs: 1,
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 1,
    )).toEqual({ current: 1, maximum: 1, reserved: 0 });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(0);
  });

  it("keeps an equal-priority current patient at the boundary without restarting in the completion call", () => {
    const simulation = createReassessmentSimulation();
    const combat = requireCombat(simulation);
    const patientMaximum = getIndividualMaximumGlobalHits(
      combat.individualGlobalHitStore, 0,
    );
    applyHitLosses(combat, 0, patientMaximum - 1);
    applyHitLosses(combat, 1, 1);
    advanceUntilActionStarts(simulation, "physickRestoreGlobalHit", 2, 0);

    advanceProgressTicks(simulation, 600);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      healerEntityId: 2,
      patientEntityId: 0,
      consumedGenericHerbs: 1,
    });
    expect(combat.individualTreatmentActionResult.startedRecords).toHaveLength(0);
    expect(combat.individualTreatmentActionResult.reassessmentRequests[0]).toMatchObject({
      healerEntityId: 2,
      previousPatientEntityId: 0,
      boundary: "completed",
    });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 2,
    ).patientEntityId).toBe(0);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).physickEntityId).toBe(-1);
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 2,
    )).toEqual({ current: 1, maximum: 2, reserved: 0 });

    advanceSimulationOneTick(simulation);
    expect(combat.individualTreatmentActionResult.startedRecords[0]).toMatchObject({
      healerEntityId: 2,
      patientEntityId: 0,
      kind: "physickRestoreGlobalHit",
      progressTicks: 0,
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 2,
    )).toEqual({ current: 1, maximum: 2, reserved: 1 });
  });

  it("assigns a nearby newly dying patient after living-hit completion and reserves no follow-up herb", () => {
    const simulation = createReassessmentSimulation();
    const combat = requireCombat(simulation);
    applyHitLosses(combat, 0, 1);
    advanceUntilActionStarts(simulation, "physickRestoreGlobalHit", 2, 0);
    advanceProgressTicks(simulation, 599);
    downPatient(simulation, 1, simulation.tick);

    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      kind: "physickRestoreGlobalHit",
      consumedGenericHerbs: 1,
    });
    expect(combat.individualTreatmentActionResult.startedRecords).toHaveLength(0);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 2,
    ).patientEntityId).toBe(1);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).need).toBe("dying");
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 2,
    )).toEqual({ current: 1, maximum: 2, reserved: 0 });

    advanceSimulationOneTick(simulation);
    expect(combat.individualTreatmentActionResult.startedRecords[0]).toMatchObject({
      kind: "chirurgeonDying",
      patientEntityId: 1,
      reservedGenericHerbs: 0,
      progressTicks: 0,
    });
  });

  it("lets a nearby dying patient outrank post-trauma missing hits using post-completion state", () => {
    const simulation = createReassessmentSimulation();
    const combat = requireCombat(simulation);
    applyHitLosses(combat, 0, 2);
    applyTrauma(combat, 0, 1);
    advanceUntilActionStarts(simulation, "physickTraumaticWound", 2, 0);
    advanceProgressTicks(simulation, 599);
    downPatient(simulation, 1, simulation.tick);

    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      kind: "physickTraumaticWound",
      traumaCleared: true,
      consumedGenericHerbs: 1,
    });
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0))
      .toBeLessThan(getIndividualMaximumGlobalHits(combat.individualGlobalHitStore, 0));
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 2,
    ).patientEntityId).toBe(1);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).need).toBe("dying");
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 2,
    )).toEqual({ current: 1, maximum: 2, reserved: 0 });
  });

  it("releases exactly once and reassigns only at an interruption boundary", () => {
    const simulation = createReassessmentSimulation();
    const combat = requireCombat(simulation);
    applyHitLosses(combat, 0, 1);
    advanceUntilActionStarts(simulation, "physickRestoreGlobalHit", 2, 0);
    advanceSimulationOneTick(simulation);
    downPatient(simulation, 1, simulation.tick);
    simulation.world.positionsX[2] = simulation.world.positionsX[0]! +
      INDIVIDUAL_TREATMENT_TOUCH_RANGE + 1;

    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.interruptedRecords[0]).toMatchObject({
      kind: "physickRestoreGlobalHit",
      reason: "rangeLost",
      releasedGenericHerbs: 1,
    });
    expect(combat.individualTreatmentActionResult.startedRecords).toHaveLength(0);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 2,
    ).patientEntityId).toBe(1);
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 2,
    )).toEqual({ current: 2, maximum: 2, reserved: 0 });
  });

  it("produces identical claims when local candidate construction is reversed", () => {
    const normal = createCandidateOrderSimulation();
    const reversed = createCandidateOrderSimulation();

    const normalClaim = runSyntheticBoundaryReassessment(normal, false);
    const reversedClaim = runSyntheticBoundaryReassessment(reversed, true);

    expect(normalClaim).toBe(1);
    expect(reversedClaim).toBe(normalClaim);
  });

  it("does not assign herb-dependent or self claims to a zero-herb Physick", () => {
    const simulation = createMedicalSimulation(0);
    const combat = requireCombat(simulation);
    applyHitLosses(combat, 0, 1);
    applyHitLosses(combat, 1, 1);

    for (let count = 0; count < 5; count += 1) advanceSimulationOneTick(simulation);

    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(-1);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toBeUndefined();
  });
});

function advanceUntilActionStarts(
  simulation: SimulationState,
  kind: "physickRestoreGlobalHit" | "physickTraumaticWound",
  healerEntityId: number,
  patientEntityId: number,
): number {
  const combat = requireCombat(simulation);
  for (let count = 0; count < 80; count += 1) {
    advanceSimulationOneTick(simulation);
    const record = combat.individualTreatmentActionResult.startedRecords.find(
      (candidate) => candidate.kind === kind &&
        candidate.healerEntityId === healerEntityId &&
        candidate.patientEntityId === patientEntityId,
    );
    if (record !== undefined) return record.tick;
  }
  throw new Error(`Expected ${kind} to start.`);
}

function advanceProgressTicks(simulation: SimulationState, count: number): void {
  for (let index = 0; index < count; index += 1) advanceSimulationOneTick(simulation);
}

function advanceTreatmentWithEvidence(
  simulation: SimulationState,
  attempts: readonly IndividualMeleeAttackAttemptRecord[],
  decisions: readonly IndividualLandedHitGateDecisionRecord[],
  tick: number,
) {
  const combat = requireCombat(simulation);
  return advanceIndividualTreatmentActionsOneTick(
    simulation.world,
    combat.identityStore,
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.trustedIndividualMedicalProfileStore,
    combat.individualGenericHerbStore,
    combat.individualTraumaticWoundStore,
    combat.individualCombatActionStore,
    combat.moraleMovementStates,
    combat.individualDeathCountStore,
    combat.individualGlobalHitStore,
    combat.individualMedicalClaimStore,
    combat.individualCasualtyAssistanceStore,
    attempts,
    decisions,
    tick,
    combat.individualTreatmentActionStore,
    combat.individualTreatmentActionBuffers,
  );
}

function attempt(
  attackerEntityId: number,
  targetEntityId: number,
): IndividualMeleeAttackAttemptRecord {
  return {
    attackerEntityId,
    targetEntityId,
    weaponCategory: "unarmed",
    commitmentDurationTicks: 1,
    recoveryDurationTicks: 1,
    distanceSquaredAtResolution: 1,
    threatDistance: 1,
    preferredMinimumDistance: 0,
    awkwardDistance: false,
    facingX: 1,
    facingY: 0,
    outcome: "attempted",
  };
}

function acceptedHit(
  attackerEntityId: number,
  targetEntityId: number,
  tick: number,
): IndividualLandedHitGateDecisionRecord {
  return {
    attackerEntityId,
    targetEntityId,
    currentTick: tick,
    outcome: "accepted",
    reason: "accepted",
    previousNextAllowedTick: null,
    resultingNextAllowedTick: tick + 20,
    cooldownTicksRemaining: 20,
  };
}

function applyHitLosses(
  combat: CombatSandboxSimulationState,
  targetEntityId: number,
  count: number,
): void {
  applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: count }, () => landedRecord(targetEntityId)),
  );
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

function applyTrauma(
  combat: CombatSandboxSimulationState,
  entityId: number,
  firstTick: number,
): void {
  for (let tick = firstTick; tick < firstTick + 10_000; tick += 1) {
    const opportunity = {
      targetEntityId: entityId,
      attackerEntityId: entityId === 2 ? 0 : 2,
      tick,
      triggerKind: "limbCleave" as const,
    };
    if (calculateTraumaticWoundOpportunityRoll(combat.battleSeed, opportunity) >= 100) continue;
    resolveIndividualTraumaticWoundOpportunities(
      combat.battleSeed,
      combat.individualCasualtyProcedureProfileStore,
      combat.individualTraumaticWoundStore,
      [opportunity],
    );
    return;
  }
  throw new Error("Expected deterministic traumatic-wound opportunity.");
}

function landedRecord(defenderEntityId: number): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId: defenderEntityId === 2 ? 0 : 2,
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

function createMedicalSimulation(herbs: number): SimulationState {
  return createSimulation({
    seed: 0x6e_2a,
    entityCount: 3,
    bounds: { width: 300, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, "none"),
        {
          ...unit(2, 1, 104, "none"),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: true,
            startingGenericHerbs: herbs,
          },
        },
        unit(3, 2, 280, "none"),
      ],
    },
  });
}

function createReassessmentSimulation(): SimulationState {
  return createSimulation({
    seed: 0x6e_2b,
    entityCount: 4,
    bounds: { width: 400, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, "heavy"),
        unit(2, 1, 106, "heavy"),
        {
          ...unit(3, 1, 104, "none"),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: true,
            startingGenericHerbs: 2,
          },
        },
        unit(4, 2, 380, "none"),
      ],
    },
  });
}

function createCandidateOrderSimulation(): SimulationState {
  const simulation = createSimulation({
    seed: 0x6e_2c,
    entityCount: 5,
    bounds: { width: 400, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, "heavy"),
        unit(2, 1, 140, "heavy"),
        unit(3, 1, 160, "heavy"),
        {
          ...unit(4, 1, 150, "none"),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: true,
            startingGenericHerbs: 2,
          },
        },
        unit(5, 2, 380, "none"),
      ],
    },
  });
  const combat = requireCombat(simulation);
  applyHitLosses(combat, 0, 1);
  for (let count = 0; count < 5; count += 1) {
    advanceSimulationOneTick(simulation);
    if (getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 3,
    ).patientEntityId === 0) return simulation;
  }
  throw new Error("Expected initial current-patient claim.");
}

function runSyntheticBoundaryReassessment(
  simulation: SimulationState,
  reverseConstruction: boolean,
): number {
  const combat = requireCombat(simulation);
  restoreIndividualGlobalHits(
    combat.individualGlobalHitStore,
    combat.individualCasualtyLifecycleStore,
    0,
    1,
    "physickTreatment",
  );
  applyHitLosses(combat, 1, 1);
  applyHitLosses(combat, 2, 1);
  const savedIds = simulation.world.ids.slice();
  const savedX = simulation.world.positionsX.slice();
  const savedY = simulation.world.positionsY.slice();
  if (reverseConstruction) {
    for (let index = 0; index < simulation.world.entityCount; index += 1) {
      const entityId = savedIds[simulation.world.entityCount - index - 1]!;
      simulation.world.ids[index] = entityId;
      simulation.world.positionsX[index] = savedX[entityId]!;
      simulation.world.positionsY[index] = savedY[entityId]!;
    }
  }
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
  if (reverseConstruction) {
    simulation.world.ids.set(savedIds);
    simulation.world.positionsX.set(savedX);
    simulation.world.positionsY.set(savedY);
  }
  reassessIndividualMedicalClaimsAtActionBoundaries(
    simulation.world,
    combat.identityStore,
    combat.formationStore,
    combat.individualCasualtyLifecycleStore,
    combat.trustedIndividualMedicalProfileStore,
    combat.individualGenericHerbStore,
    combat.individualTraumaticWoundStore,
    combat.individualGlobalHitStore,
    combat.individualCombatActionStore,
    combat.moraleMovementStates,
    combat.individualMedicalLocalQueryStore,
    combat.individualCasualtyAssistanceStore,
    combat.individualMedicalClaimStore,
    [{
      actionId: 100,
      healerEntityId: 3,
      previousPatientEntityId: 0,
      tick: simulation.tick,
      boundary: "completed",
    }],
    simulation.tick,
  );
  return getIndividualMedicalClaimInspection(
    combat.individualMedicalClaimStore, 3,
  ).patientEntityId;
}

function unit(
  unitId: number,
  factionId: number,
  x: number,
  armourClass: "none" | "heavy",
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
    armourClass,
    shieldClass: "none",
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: {
      procedureKind: "citizen",
      deathCountPolicy: { kind: "fixedTicks", durationTicks: 1_000 },
    },
  };
}

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
