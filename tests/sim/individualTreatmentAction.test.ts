import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  getActiveCasualtyDragGroups,
  getIndividualCasualtyAssistanceInspection,
} from "../../src/sim/individualCasualtyAssistance";
import {
  advanceIndividualDeathCountsOneTick,
  getIndividualCasualtyHistoryInspection,
  getIndividualDeathCountInspection,
  initializeIndividualDeathCountsFromZeroHitTransitions,
  resumeIndividualDeathCount,
} from "../../src/sim/individualDeathCount";
import {
  isIndividualCombatTargetEligible,
  projectIndividualCombatEligibilityFromHits,
} from "../../src/sim/individualCombatEligibility";
import { getIndividualMovementMode } from "../../src/sim/formationBehaviour";
import {
  applyIndividualLandedHits,
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
  restoreIndividualGlobalHits,
} from "../../src/sim/individualGlobalHits";
import { applyTrustedIndividualLimbDisability } from "../../src/sim/individualLimbDisability";
import {
  getIndividualMedicalClaimInspection,
  projectIndividualMedicalClaimCommitmentOrdinaryParticipation,
} from "../../src/sim/individualMedicalClaims";
import { getIndividualGenericHerbInspection } from "../../src/sim/individualMedicalProfile";
import {
  getIndividualMedicalUrgencyInspection,
  isPreparedMedicalPhysickAvailable,
} from "../../src/sim/individualMedicalReadModel";
import { isIndividualOrdinaryParticipationEligible } from "../../src/sim/individualOrdinaryParticipation";
import {
  calculateTraumaticWoundOpportunityRoll,
  getIndividualTraumaticWoundInspection,
  resolveIndividualTraumaticWoundOpportunities,
} from "../../src/sim/individualTraumaticWound";
import {
  advanceIndividualTreatmentActionsOneTick,
  CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS,
  getActiveIndividualTreatmentActionCount,
  getIndividualTreatmentActionInspection,
  INDIVIDUAL_TREATMENT_TOUCH_RANGE,
  type IndividualTreatmentInterruptionReason,
} from "../../src/sim/individualTreatmentAction";
import { advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import type { IndividualLandedHitGateDecisionRecord } from "../../src/sim/individualLandedHitGate";
import {
  resolveIndividualMeleeDefences,
  type IndividualMeleeDefenceRecord,
} from "../../src/sim/individualMeleeDefence";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationState,
} from "../../src/sim/types";

describe("Milestone 6G-1 Chirurgeon treatment", () => {
  it("lets a Chirurgeon-only character claim and complete dying treatment without herbs or a Physick follow-up claim", () => {
    const simulation = createChirurgeonOnlyRescueSimulation();
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);

    const startedTick = advanceUntilTreatmentStarts(simulation, 3);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 0,
    )).toMatchObject({ physickEntityId: 3, need: "dying" });
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 3,
    )).toMatchObject({
      kind: "chirurgeonDying",
      healerEntityId: 3,
      patientEntityId: 0,
      startedTick,
      requiredProgressTicks: 600,
      reservedGenericHerbs: 0,
    });

    applyLosses(combat, 1, 1);
    for (let count = 0; count < 600; count += 1) {
      keepInTouch(simulation, 3, 0);
      advanceSimulationOneTick(simulation);
    }

    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      kind: "chirurgeonDying",
      healerEntityId: 3,
      patientEntityId: 0,
      progressTicks: 600,
      consumedGenericHerbs: 0,
    });
    expect(getIndividualGenericHerbInspection(
      combat.individualGenericHerbStore, 3,
    )).toEqual({ current: 0, maximum: 0, reserved: 0 });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 3,
    ).patientEntityId).toBe(-1);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).physickEntityId).toBe(-1);
  });

  it("does not let a Chirurgeon-only character claim Physick-only needs", () => {
    const simulation = createChirurgeonOnlyNeedsSimulation();
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1);
    applyTrauma(combat, 1, 0);
    applyTrustedIndividualLimbDisability(
      combat.individualLimbDisabilityStore, 2, "disabledLeg",
    );

    for (let count = 0; count < 5; count += 1) {
      advanceSimulationOneTick(simulation);
    }

    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 3,
    ).patientEntityId).toBe(-1);
    for (const patientId of [0, 1, 2]) {
      expect(getIndividualMedicalClaimInspection(
        combat.individualMedicalClaimStore, patientId,
      ).physickEntityId).toBe(-1);
    }
  });

  it("keeps active treatment participation exclusive, then permits the former healer to become a patient", () => {
    const simulation = createExclusiveTreatmentSimulation();
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    advanceUntilTreatmentStarts(simulation, 1);

    applyLosses(combat, 1, 1);
    for (let count = 0; count < 5; count += 1) {
      keepInTouch(simulation, 1, 0);
      advanceSimulationOneTick(simulation);
      expect(getActiveIndividualTreatmentActionCount(
        combat.individualTreatmentActionStore,
      )).toBe(1);
      expect(getIndividualTreatmentActionInspection(
        combat.individualTreatmentActionStore, 1,
      )).toMatchObject({ healerEntityId: 1, patientEntityId: 0 });
      expect(getIndividualMedicalClaimInspection(
        combat.individualMedicalClaimStore, 1,
      ).physickEntityId).toBe(-1);
    }

    for (let count = 5; count < 600; count += 1) {
      keepInTouch(simulation, 1, 0);
      advanceSimulationOneTick(simulation);
    }
    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      healerEntityId: 1,
      patientEntityId: 0,
    });
    restoreIndividualGlobalHits(
      combat.individualGlobalHitStore,
      combat.individualCasualtyLifecycleStore,
      0,
      1,
      "physickTreatment",
    );

    let laterAction;
    for (let count = 0; count < 100; count += 1) {
      advanceSimulationOneTick(simulation);
      laterAction = getIndividualTreatmentActionInspection(
        combat.individualTreatmentActionStore, 2,
      );
      if (laterAction?.patientEntityId === 1) break;
    }
    expect(laterAction).toMatchObject({
      kind: "physickRestoreGlobalHit",
      healerEntityId: 2,
      patientEntityId: 1,
      progressTicks: 0,
    });
    expect(getActiveIndividualTreatmentActionCount(
      combat.individualTreatmentActionStore,
    )).toBe(1);
  });

  it("owns start-tick pause, grants exactly 600 later progress ticks, restores before death advancement, and supports a fresh dying episode", () => {
    const simulation = createTreatmentSimulation({ physick: true, herbs: 0 });
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    const startedTick = advanceUntilTreatmentStarts(simulation);

    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toMatchObject({
      healerEntityId: 1,
      patientEntityId: 0,
      startedTick,
      progressTicks: 0,
      requiredProgressTicks: 600,
    });
    expect(getIndividualDeathCountInspection(combat.individualDeathCountStore, 0))
      .toMatchObject({
        paused: true,
        pauseSource: {
          kind: "chirurgeonTreatment",
          healerEntityId: 1,
          treatmentStartTick: startedTick,
        },
      });
    expect(getIndividualGenericHerbInspection(combat.individualGenericHerbStore, 1))
      .toEqual({ current: 0, maximum: 0, reserved: 0 });
    expect(() => resumeIndividualDeathCount(
      combat.individualDeathCountStore,
      combat.individualCasualtyLifecycleStore,
      0,
      {
        kind: "chirurgeonTreatment",
        healerEntityId: 1,
        treatmentStartTick: startedTick + 1,
      },
    )).toThrow(/matching pause source/);
    expect(getIndividualDeathCountInspection(
      combat.individualDeathCountStore, 0,
    ).paused).toBe(true);

    while (getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )!.progressTicks < CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS - 1) {
      keepInTouch(simulation, 1, 0);
      advanceSimulationOneTick(simulation);
    }
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )!.progressTicks).toBe(599);
    setRemainingDeathCountForBoundaryTest(combat, 0, 1);

    keepInTouch(simulation, 1, 0);
    advanceSimulationOneTick(simulation);

    expect(combat.individualTreatmentActionResult.completedRecords).toHaveLength(1);
    expect(combat.individualTreatmentActionResult.completedRecords[0]).toMatchObject({
      healerEntityId: 1,
      patientEntityId: 0,
      progressTicks: 600,
      hitRestoration: {
        requestedHitRestoration: 1,
        appliedHitRestoration: 1,
        currentHitsBefore: 0,
        currentHitsAfter: 1,
      },
      lifecycleRestoration: {
        previousLifecycleState: "dying",
        lifecycleState: "active",
        previousPresenceState: "downedPresence",
        presenceState: "activePresence",
      },
    });
    expect(combat.individualTerminalTransitions).toHaveLength(0);
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0)).toBe(1);
    expect(getIndividualCharacterLifecycleState(combat.individualCasualtyLifecycleStore, 0)).toBe("active");
    expect(getIndividualPlayerPresenceState(combat.individualPlayerPresenceStore, 0)).toBe("activePresence");
    expect(getIndividualDeathCountInspection(combat.individualDeathCountStore, 0).paused).toBe(false);
    expect(getIndividualTreatmentActionInspection(combat.individualTreatmentActionStore, 1)).toBeUndefined();
    expect(getIndividualMedicalClaimInspection(combat.individualMedicalClaimStore, 1).patientEntityId).toBe(-1);
    expect(getIndividualMedicalClaimInspection(combat.individualMedicalClaimStore, 0).physickEntityId).toBe(-1);
    expect(getIndividualCasualtyAssistanceInspection(
      combat.individualCasualtyAssistanceStore, 0,
    )).toMatchObject({
      state: "none",
      dragGroupId: -1,
      destinationX: -1,
      destinationY: -1,
      claimedPhysickEntityId: -1,
    });
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 0,
    )).toBe(false);

    advanceSimulationOneTick(simulation);
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 0,
    )).toBe(true);

    const laterTick = simulation.tick + 1;
    down(simulation, 0, laterTick);
    expect(getIndividualDeathCountInspection(combat.individualDeathCountStore, 0))
      .toMatchObject({ durationTicks: 1_000, remainingTicks: 1_000, paused: false });
    expect(getIndividualCasualtyHistoryInspection(combat.individualDeathCountStore, 0))
      .toMatchObject({ dyingTransitionCount: 2, latestZeroHitTick: laterTick });
    advanceSimulationOneTick(simulation);
    expect(
      combat.casualtyAssistanceDecisionResult.groupStartedRecords.some(
        (record) => record.patientEntityId === 0,
      ) || getIndividualCasualtyAssistanceInspection(
        combat.individualCasualtyAssistanceStore, 0,
      ).state === "rescueRequested",
    ).toBe(true);
  });

  it("safely releases, locally claims, approaches, and treats without moving the patient manually", () => {
    const simulation = createApproachSimulation();
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);

    let safeReleaseTick = -1;
    for (let count = 0; count < 80 && safeReleaseTick < 0; count += 1) {
      advanceSimulationOneTick(simulation);
      if (combat.individualMedicalClaimResult.safeReleaseRecords.some(
        (record) => record.patientEntityId === 0,
      )) safeReleaseTick = simulation.tick - 1;
    }
    expect(safeReleaseTick).toBeGreaterThanOrEqual(0);
    expect(getIndividualCasualtyAssistanceInspection(
      combat.individualCasualtyAssistanceStore, 0,
    ).state).toBe("atTreatmentPosition");
    expect(getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)).toHaveLength(0);

    let claimTick = -1;
    for (let count = 0; count < 5 && claimTick < 0; count += 1) {
      advanceSimulationOneTick(simulation);
      const claim = combat.individualMedicalClaimResult.claimRecords.find(
        (record) => record.patientEntityId === 0,
      );
      if (claim !== undefined) claimTick = claim.tick;
    }
    expect(claimTick).toBeGreaterThan(safeReleaseTick);
    const patientX = simulation.world.positionsX[0]!;
    const patientY = simulation.world.positionsY[0]!;
    const healerXAtClaim = simulation.world.positionsX[3]!;
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 3,
    ).patientEntityId).toBe(0);

    advanceSimulationOneTick(simulation);
    expect(simulation.world.positionsX[3]).toBeLessThan(healerXAtClaim);
    expect(simulation.world.positionsX[0]).toBe(patientX);
    expect(simulation.world.positionsY[0]).toBe(patientY);
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 3,
    )).toBe(false);
    expect(isIndividualCombatTargetEligible(
      combat.individualCombatEligibilitySnapshot, 3,
    )).toBe(true);

    let treatmentStarted = false;
    for (let count = 0; count < 220 && !treatmentStarted; count += 1) {
      advanceSimulationOneTick(simulation);
      treatmentStarted = combat.individualTreatmentActionResult.startedRecords.some(
        (record) => record.patientEntityId === 0 && record.healerEntityId === 3,
      );
      expect(simulation.world.positionsX[0]).toBe(patientX);
      expect(simulation.world.positionsY[0]).toBe(patientY);
    }
    expect(treatmentStarted).toBe(true);

    for (let count = 0; count <= CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS; count += 1) {
      if (getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore, 0,
      ) === "active") break;
      advanceSimulationOneTick(simulation);
    }
    expect(getIndividualCharacterLifecycleState(
      combat.individualCasualtyLifecycleStore, 0,
    )).toBe("active");
  });

  it("holds an in-range claimed Physick out of formation and outgoing attacks until treatment starts after combat", () => {
    const simulation = createClaimCommitmentSimulation();
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    advanceUntilClaimCreated(simulation, 0, 3);
    simulation.world.positionsX[3] = simulation.world.positionsX[0]! +
      INDIVIDUAL_TREATMENT_TOUCH_RANGE;
    simulation.world.positionsY[3] = simulation.world.positionsY[0]!;
    simulation.world.positionsX[4] = simulation.world.positionsX[3]! + 1;
    simulation.world.positionsY[4] = simulation.world.positionsY[3]!;
    const healerX = simulation.world.positionsX[3]!;

    advanceSimulationOneTick(simulation);

    expect(simulation.world.positionsX[3]).toBe(healerX);
    expect(getIndividualMovementMode(combat.formationStore, 3))
      .toBe("holdPosition");
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 3,
    )).toBe(false);
    expect(isIndividualCombatTargetEligible(
      combat.individualCombatEligibilitySnapshot, 3,
    )).toBe(true);
    expect(combat.individualCombatPipelineBuffers.attackAttempts.some(
      (attemptRecord) => attemptRecord.attackerEntityId === 3,
    )).toBe(false);
    expect(combat.individualTreatmentActionResult.startedRecords).toContainEqual(
      expect.objectContaining({ healerEntityId: 3, patientEntityId: 0 }),
    );
    expect(combat.individualDefenceHandAvailabilitySource.getFreeHands(3))
      .toBeUndefined();
  });

  it("uses ordinary shield, weapon, and unarmed defence rules while claim-committed", () => {
    const cases = [
      {
        weaponCategory: "oneHanded" as const,
        shieldClass: "shield" as const,
        distanceBeyondTouch: 0,
        expectedDefence: "shieldBlock",
      },
      {
        weaponCategory: "oneHanded" as const,
        shieldClass: "none" as const,
        distanceBeyondTouch: 4,
        expectedDefence: "weaponParry",
      },
      {
        weaponCategory: "unarmed" as const,
        shieldClass: "none" as const,
        distanceBeyondTouch: 0,
        expectedDefence: "none",
      },
    ] as const;

    for (const candidate of cases) {
      const simulation = createClaimCommitmentSimulation(candidate);
      const combat = requireCombat(simulation);
      down(simulation, 0, 0);
      const claimTick = advanceUntilClaimCreated(simulation, 0, 3);
      simulation.world.positionsX[3] = simulation.world.positionsX[0]! +
        INDIVIDUAL_TREATMENT_TOUCH_RANGE + candidate.distanceBeyondTouch;
      simulation.world.positionsY[3] = simulation.world.positionsY[0]!;
      simulation.world.positionsX[4] = simulation.world.positionsX[3]! - 1;
      simulation.world.positionsY[4] = simulation.world.positionsY[3]!;
      projectClaimCommitmentForDefence(simulation, claimTick + 1);

      expect(isIndividualOrdinaryParticipationEligible(
        combat.individualOrdinaryParticipationSnapshot, 3,
      )).toBe(false);
      expect(combat.individualDefenceHandAvailabilitySource.getFreeHands(3))
        .toBe(2);
      const result = resolveIndividualMeleeDefences(
        simulation.world,
        combat.identityStore,
        combat.formationStore,
        combat.individualCombatActionStore,
        combat.individualProfileStore,
        combat.individualMeleeDefenceStore,
        [attempt(4, 3)],
        [],
        [],
        combat.individualCombatEligibilitySnapshot,
        claimTick + 1,
        combat.individualDefenceHandAvailabilitySource,
      );

      expect(result.records[0]).toMatchObject({
        defenderEntityId: 3,
        availableDefenceType: candidate.expectedDefence,
      });
      if (candidate.expectedDefence === "none") {
        expect(result.records[0]!.outcome).toBe("landed");
      } else {
        expect(["parried", "shieldBlocked"]).toContain(result.records[0]!.outcome);
      }
    }
  });

  it("applies one approach movement on the tick after claiming and cannot stack formation movement", () => {
    const simulation = createClaimCommitmentSimulation();
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    const claimTick = advanceUntilClaimCreated(simulation, 0, 3);
    simulation.world.positionsX[3] = simulation.world.positionsX[0]! +
      INDIVIDUAL_TREATMENT_TOUCH_RANGE + 1;
    simulation.world.positionsY[3] = simulation.world.positionsY[0]!;
    const healerX = simulation.world.positionsX[3]!;

    advanceSimulationOneTick(simulation);

    expect(simulation.tick - 1).toBe(claimTick + 1);
    expect(simulation.world.positionsX[3]).toBe(healerX - 1);
    expect(getIndividualMovementMode(combat.formationStore, 3))
      .toBe("approachClaimedPatient");
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 3,
    )).toBe(false);
    expect(combat.individualCombatPipelineBuffers.attackAttempts.some(
      (attemptRecord) => attemptRecord.attackerEntityId === 3,
    )).toBe(false);
    expect(combat.individualTreatmentActionResult.startedRecords).toContainEqual(
      expect.objectContaining({ healerEntityId: 3, patientEntityId: 0 }),
    );
  });

  it("does not commit toward a terminal patient and clears the stale claim later that tick", () => {
    const simulation = createClaimCommitmentSimulation();
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    advanceUntilClaimCreated(simulation, 0, 3);
    transitionIndividualDyingToTerminal(
      combat.individualCasualtyLifecycleStore, 0, simulation.tick, "execution",
    );

    advanceSimulationOneTick(simulation);

    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 3,
    )).toBe(true);
    expect(getIndividualMovementMode(combat.formationStore, 3))
      .not.toBe("approachClaimedPatient");
    expect(combat.individualMedicalClaimResult.staleClaimRecords).toContainEqual({
      physickEntityId: 3,
      patientEntityId: 0,
      tick: simulation.tick - 1,
    });
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 3,
    ).patientEntityId).toBe(-1);
    expect(combat.individualDefenceHandAvailabilitySource.getFreeHands(3))
      .toBeUndefined();
  });

  it("excludes a treating Physick from prepared withdrawal discovery and restores availability after interruption", () => {
    const simulation = createBusyPhysickSimulation();
    const combat = requireCombat(simulation);
    down(simulation, 2, 0);
    advanceUntilTreatmentStarts(simulation, 1);
    applyTrauma(combat, 0, simulation.tick);

    advanceSimulationOneTick(simulation);

    expect(isPreparedMedicalPhysickAvailable(
      combat.individualMedicalLocalQueryStore, 1,
    )).toBe(false);
    expect(isPreparedMedicalPhysickAvailable(
      combat.individualMedicalLocalQueryStore, 3,
    )).toBe(true);
    expect(getIndividualMedicalUrgencyInspection(
      combat.individualMedicalUrgencyStore, 0,
    )).toMatchObject({
      withdrawalGoalKind: "availablePhysick",
      withdrawalTargetPhysickEntityId: 3,
    });

    simulation.world.positionsX[1] = simulation.world.positionsX[2]! +
      INDIVIDUAL_TREATMENT_TOUCH_RANGE + 1;
    advanceSimulationOneTick(simulation);
    expect(combat.individualTreatmentActionResult.interruptedRecords[0]?.reason)
      .toBe("rangeLost");
    advanceSimulationOneTick(simulation);

    expect(isPreparedMedicalPhysickAvailable(
      combat.individualMedicalLocalQueryStore, 1,
    )).toBe(true);
    expect(getIndividualMedicalUrgencyInspection(
      combat.individualMedicalUrgencyStore, 0,
    ).withdrawalTargetPhysickEntityId).toBe(1);
  });

  it("allows a zero-herb Physick through inherited Chirurgeon capability", () => {
    const physick = createTreatmentSimulation({ physick: true, herbs: 0 });
    down(physick, 0, 0);
    advanceUntilTreatmentStarts(physick);
    expect(getIndividualTreatmentActionInspection(
      requireCombat(physick).individualTreatmentActionStore, 1,
    )).toMatchObject({ healerEntityId: 1, patientEntityId: 0 });
  });

  it("requires touch to start after a later local reclaim", () => {
    const simulation = createTreatmentSimulation({ physick: true, herbs: 0 });
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    advanceUntilTreatmentStarts(simulation);
    simulation.world.positionsX[1] = simulation.world.positionsX[0]! +
      INDIVIDUAL_TREATMENT_TOUCH_RANGE + 20;
    advanceTreatment(simulation, simulation.tick);
    expect(combat.individualTreatmentActionResult.interruptedRecords[0]?.reason)
      .toBe("rangeLost");
    expect(getIndividualCasualtyAssistanceInspection(
      combat.individualCasualtyAssistanceStore, 0,
    ).state).toBe("atTreatmentPosition");

    advanceSimulationOneTick(simulation);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore, 1,
    ).patientEntityId).toBe(0);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )).toBeUndefined();
  });

  it("interrupts on every accepted 6G-1 evidence category, loses progress, clears ownership, and resumes the count that tick", () => {
    const cases: readonly {
      readonly reason: IndividualTreatmentInterruptionReason;
      readonly mutate: (simulation: SimulationState, tick: number) => {
        attempts?: readonly IndividualMeleeAttackAttemptRecord[];
        decisions?: readonly IndividualLandedHitGateDecisionRecord[];
      };
    }[] = [
      { reason: "healerAttackAttempt", mutate: () => ({ attempts: [attempt(1, 2)] }) },
      { reason: "patientAttackAttempt", mutate: () => ({ attempts: [attempt(0, 2)] }) },
      { reason: "healerAcceptedHit", mutate: (_, tick) => ({ decisions: [acceptedHit(2, 1, tick)] }) },
      { reason: "patientAcceptedHit", mutate: (_, tick) => ({ decisions: [acceptedHit(2, 0, tick)] }) },
      { reason: "rangeLost", mutate: (simulation) => {
        simulation.world.positionsX[1] = simulation.world.positionsX[0]! + INDIVIDUAL_TREATMENT_TOUCH_RANGE + 1;
        return {};
      } },
      { reason: "patientLifecycleIncompatible", mutate: (simulation, tick) => {
        transitionIndividualDyingToTerminal(
          requireCombat(simulation).individualCasualtyLifecycleStore, 0, tick, "execution",
        );
        return {};
      } },
      { reason: "healerIncapacity", mutate: (simulation, tick) => {
        down(simulation, 1, tick);
        return {};
      } },
      { reason: "healerRouting", mutate: (simulation) => {
        requireCombat(simulation).moraleMovementStates.set(2, "routing");
        return {};
      } },
      { reason: "healerTrauma", mutate: (simulation, tick) => {
        applyTrauma(requireCombat(simulation), 1, tick);
        return {};
      } },
      { reason: "patientNoLongerNeedsAction", mutate: (simulation) => {
        const combat = requireCombat(simulation);
        restoreIndividualGlobalHits(
          combat.individualGlobalHitStore,
          combat.individualCasualtyLifecycleStore,
          0, 1, "chirurgeonTreatment",
        );
        return {};
      } },
    ];

    for (const candidate of cases) {
      const simulation = createTreatmentSimulation({ physick: true, herbs: 0 });
      const combat = requireCombat(simulation);
      down(simulation, 0, 0);
      const startedTick = advanceUntilTreatmentStarts(simulation);
      advanceTreatment(simulation, startedTick + 1);
      expect(getIndividualTreatmentActionInspection(
        combat.individualTreatmentActionStore, 1,
      )!.progressTicks).toBe(1);
      const remainingBefore = getIndividualDeathCountInspection(
        combat.individualDeathCountStore, 0,
      ).remainingTicks;
      const interruptTick = startedTick + 2;
      const evidence = candidate.mutate(simulation, interruptTick);

      const result = advanceTreatment(
        simulation, interruptTick, evidence.attempts, evidence.decisions,
      );

      expect(result.interruptedRecords[0]).toMatchObject({
        healerEntityId: 1,
        patientEntityId: 0,
        reason: candidate.reason,
        progressTicksLost: 1,
      });
      expect(getIndividualTreatmentActionInspection(
        combat.individualTreatmentActionStore, 1,
      )).toBeUndefined();
      expect(getIndividualDeathCountInspection(
        combat.individualDeathCountStore, 0,
      ).paused).toBe(false);
      expect(getIndividualMedicalClaimInspection(
        combat.individualMedicalClaimStore, 1,
      ).patientEntityId).toBe(-1);
      if (getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore, 0,
      ) === "dying") {
        advanceIndividualDeathCountsOneTick(
          combat.individualDeathCountStore,
          combat.individualCasualtyLifecycleStore,
          simulation.world,
          interruptTick,
        );
        expect(getIndividualDeathCountInspection(
          combat.individualDeathCountStore, 0,
        ).remainingTicks).toBe(remainingBefore - 1);
      }
    }
  });

  it("does not interrupt for a parried or blocked incoming attack", () => {
    const simulation = createTreatmentSimulation({ physick: true, herbs: 0 });
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    const startedTick = advanceUntilTreatmentStarts(simulation);

    const result = advanceTreatment(
      simulation,
      startedTick + 1,
      [attempt(2, 0)],
      [],
    );

    expect(result.interruptedRecords).toHaveLength(0);
    expect(result.startedRecords).toHaveLength(0);
    expect(result.completedRecords).toHaveLength(0);
    expect(getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    )!.progressTicks).toBe(1);
  });

  it("preserves unresolved trauma across restoration and projects withdrawal on the next tick", () => {
    const simulation = createTreatmentSimulation({ physick: true, herbs: 0 });
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0, 0);
    down(simulation, 0, 1);
    advanceUntilTreatmentStarts(simulation);
    while (getIndividualTreatmentActionInspection(
      combat.individualTreatmentActionStore, 1,
    ) !== undefined) {
      keepInTouch(simulation, 1, 0);
      advanceSimulationOneTick(simulation);
    }
    expect(getIndividualTraumaticWoundInspection(
      combat.individualTraumaticWoundStore, 0,
    ).state).toBe("active");

    advanceSimulationOneTick(simulation);

    expect(getIndividualMedicalUrgencyInspection(
      combat.individualMedicalUrgencyStore, 0,
    )).toMatchObject({ traumaWithdrawalActive: true });
    expect(isIndividualOrdinaryParticipationEligible(
      combat.individualOrdinaryParticipationSnapshot, 0,
    )).toBe(false);
  });

  it("clamps canonical restoration and rejects terminal restoration", () => {
    const simulation = createTreatmentSimulation({ physick: true, herbs: 0 });
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1);
    const maximum = getIndividualMaximumGlobalHits(combat.individualGlobalHitStore, 0);
    expect(restoreIndividualGlobalHits(
      combat.individualGlobalHitStore,
      combat.individualCasualtyLifecycleStore,
      0, maximum + 10, "chirurgeonTreatment",
    )).toMatchObject({
      currentHitsAfter: maximum,
      appliedHitRestoration: 1,
    });

    down(simulation, 0, 5);
    transitionIndividualDyingToTerminal(
      combat.individualCasualtyLifecycleStore, 0, 6, "execution",
    );
    expect(() => restoreIndividualGlobalHits(
      combat.individualGlobalHitStore,
      combat.individualCasualtyLifecycleStore,
      0, 1, "chirurgeonTreatment",
    )).toThrow(/Terminal characters/);
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 0)).toBe(0);
  });
});

function advanceTreatment(
  simulation: SimulationState,
  tick: number,
  attempts: readonly IndividualMeleeAttackAttemptRecord[] = [],
  decisions: readonly IndividualLandedHitGateDecisionRecord[] = [],
) {
  const combat = requireCombat(simulation);
  combat.individualTreatmentActionResult = advanceIndividualTreatmentActionsOneTick(
    simulation.world, combat.identityStore, combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore, combat.trustedIndividualMedicalProfileStore,
    combat.individualGenericHerbStore,
    combat.individualTraumaticWoundStore, combat.individualLimbDisabilityStore,
    combat.individualCombatActionStore,
    combat.moraleMovementStates, combat.individualDeathCountStore,
    combat.individualGlobalHitStore, combat.individualMedicalClaimStore,
    combat.individualCasualtyAssistanceStore,
    attempts, decisions, tick, combat.individualTreatmentActionStore,
    combat.individualTreatmentActionBuffers,
  );
  return combat.individualTreatmentActionResult;
}

function advanceUntilTreatmentStarts(simulation: SimulationState, healerEntityId = 1): number {
  for (let count = 0; count < 30; count += 1) {
    advanceSimulationOneTick(simulation);
    const started = requireCombat(simulation).individualTreatmentActionResult.startedRecords[0];
    if (started !== undefined) {
      expect(started.healerEntityId).toBe(healerEntityId);
      expect(started.progressTicks).toBe(0);
      return started.tick;
    }
  }
  throw new Error("Expected Chirurgeon treatment to start.");
}

function advanceUntilClaimCreated(
  simulation: SimulationState,
  patientEntityId: number,
  healerEntityId: number,
): number {
  const combat = requireCombat(simulation);
  for (let count = 0; count < 40; count += 1) {
    advanceSimulationOneTick(simulation);
    const record = combat.individualMedicalClaimResult.claimRecords.find(
      (candidate) => candidate.patientEntityId === patientEntityId &&
        candidate.physickEntityId === healerEntityId,
    );
    if (record !== undefined) return record.tick;
  }
  throw new Error("Expected dying-patient claim to be created.");
}

function projectClaimCommitmentForDefence(
  simulation: SimulationState,
  tick: number,
): void {
  const combat = requireCombat(simulation);
  projectIndividualMedicalClaimCommitmentOrdinaryParticipation(
    simulation.world,
    combat.identityStore,
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualGlobalHitStore,
    combat.trustedIndividualMedicalProfileStore,
    combat.individualGenericHerbStore,
    combat.individualTraumaticWoundStore,
    combat.individualLimbDisabilityStore,
    combat.individualCombatActionStore,
    combat.moraleMovementStates,
    combat.individualCasualtyAssistanceStore,
    combat.individualMedicalClaimStore,
    tick,
    combat.individualOrdinaryParticipationSnapshot,
    {
      isTreating: (entityId) => getIndividualTreatmentActionInspection(
        combat.individualTreatmentActionStore, entityId,
      ) !== undefined,
    },
  );
  projectIndividualCombatEligibilityFromHits(
    combat.individualGlobalHitStore,
    combat.individualCombatEligibilitySnapshot,
    combat.individualCasualtyLifecycleStore,
    combat.individualOrdinaryParticipationSnapshot,
  );
}

function keepInTouch(simulation: SimulationState, healer: number, patient: number): void {
  simulation.world.positionsX[healer] = simulation.world.positionsX[patient]!;
  simulation.world.positionsY[healer] = simulation.world.positionsY[patient]!;
}

function down(simulation: SimulationState, entityId: number, tick: number): void {
  const combat = requireCombat(simulation);
  const hits = getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, entityId);
  const zero = applyLosses(combat, entityId, hits).zeroHitEvents;
  const transitions = applyIndividualZeroHitLifecycleTransitions(
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualCasualtyProcedureProfileStore,
    simulation.world,
    zero,
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

function applyLosses(combat: CombatSandboxSimulationState, target: number, count: number) {
  return applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: count }, () => landedRecord(target === 2 ? 0 : 2, target)),
  );
}

function applyTrauma(combat: CombatSandboxSimulationState, entityId: number, minimumTick: number): void {
  for (let tick = minimumTick; tick < minimumTick + 10_000; tick += 1) {
    const opportunity = {
      targetEntityId: entityId,
      attackerEntityId: entityId === 2 ? 0 : 2,
      tick,
      triggerKind: "limbCleave" as const,
    };
    if (calculateTraumaticWoundOpportunityRoll(combat.battleSeed, opportunity) < 100) {
      resolveIndividualTraumaticWoundOpportunities(
        combat.battleSeed,
        combat.individualCasualtyProcedureProfileStore,
        combat.individualTraumaticWoundStore,
        [opportunity],
      );
      return;
    }
  }
  throw new Error("Expected deterministic traumatic-wound opportunity.");
}

function attempt(attackerEntityId: number, targetEntityId: number): IndividualMeleeAttackAttemptRecord {
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

function acceptedHit(attackerEntityId: number, targetEntityId: number, tick: number): IndividualLandedHitGateDecisionRecord {
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

function landedRecord(attackerEntityId: number, defenderEntityId: number): IndividualMeleeDefenceRecord {
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

function setRemainingDeathCountForBoundaryTest(
  combat: CombatSandboxSimulationState,
  entityId: number,
  remaining: number,
): void {
  const store = combat.individualDeathCountStore as unknown as {
    readonly remainingByEntity: Int32Array;
  };
  store.remainingByEntity[entityId] = remaining;
}

function createTreatmentSimulation(config: {
  readonly physick: boolean;
  readonly herbs: number;
}): SimulationState {
  return createSimulation({
    seed: 0x6e_01,
    entityCount: 3,
    bounds: { width: 260, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, 1),
        {
          ...unit(2, 1, 104, 1),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: config.physick,
            startingGenericHerbs: config.herbs,
          },
        },
        unit(3, 2, 240, 1),
      ],
    },
  });
}

function createChirurgeonOnlyRescueSimulation(): SimulationState {
  return createSimulation({
    seed: 0x6e_05,
    entityCount: 5,
    bounds: { width: 300, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, 3),
        {
          ...unit(2, 1, 112, 1),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: false,
            startingGenericHerbs: 0,
          },
        },
        unit(3, 2, 280, 1),
      ],
    },
  });
}

function createChirurgeonOnlyNeedsSimulation(): SimulationState {
  return createSimulation({
    seed: 0x6e_06,
    entityCount: 5,
    bounds: { width: 300, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, 1),
        unit(2, 1, 104, 1),
        unit(3, 1, 108, 1),
        {
          ...unit(4, 1, 112, 1),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: false,
            startingGenericHerbs: 0,
          },
        },
        unit(5, 2, 280, 1),
      ],
    },
  });
}

function createExclusiveTreatmentSimulation(): SimulationState {
  const zeroHerbProfile = {
    hasChirurgeon: true,
    hasPhysick: true,
    startingGenericHerbs: 0,
  } as const;
  const herbProfile = {
    hasChirurgeon: true,
    hasPhysick: true,
    startingGenericHerbs: 1,
  } as const;
  return createSimulation({
    seed: 0x6e_07,
    entityCount: 4,
    bounds: { width: 300, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, 1),
        { ...unit(2, 1, 104, 1), medicalProfile: zeroHerbProfile },
        { ...unit(3, 1, 112, 1), medicalProfile: herbProfile },
        unit(4, 2, 280, 1),
      ],
    },
  });
}

function createApproachSimulation(): SimulationState {
  return createSimulation({
    seed: 0x6e_02,
    entityCount: 5,
    bounds: { width: 500, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, 3),
        {
          ...unit(2, 1, 260, 1),
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: true,
            startingGenericHerbs: 0,
          },
        },
        unit(3, 2, 450, 1),
      ],
    },
  });
}

function createClaimCommitmentSimulation(
  equipment: {
    readonly weaponCategory: "unarmed" | "oneHanded";
    readonly shieldClass: "none" | "shield";
  } = { weaponCategory: "unarmed", shieldClass: "none" },
): SimulationState {
  return createSimulation({
    seed: 0x6e_04,
    entityCount: 5,
    bounds: { width: 500, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 100, 3),
        {
          ...unit(2, 1, 130, 1),
          headingX: -1,
          order: "advance",
          unitSpeed: 1,
          weaponCategory: equipment.weaponCategory,
          shieldClass: equipment.shieldClass,
          medicalProfile: {
            hasChirurgeon: true,
            hasPhysick: true,
            startingGenericHerbs: 0,
          },
        },
        unit(3, 2, 450, 1),
      ],
    },
  });
}

function createBusyPhysickSimulation(): SimulationState {
  const physickProfile = {
    hasChirurgeon: true,
    hasPhysick: true,
    startingGenericHerbs: 1,
  } as const;
  return createSimulation({
    seed: 0x6e_03,
    entityCount: 5,
    bounds: { width: 500, height: 120 },
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: {
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      units: [
        unit(1, 1, 110, 1),
        { ...unit(2, 1, 100, 1), medicalProfile: physickProfile },
        unit(3, 1, 104, 1),
        { ...unit(4, 1, 140, 1), medicalProfile: physickProfile },
        unit(5, 2, 450, 1),
      ],
    },
  });
}

function unit(
  unitId: number,
  factionId: number,
  x: number,
  memberCount: number,
): CombatSandboxUnitScenario {
  return {
    unitId,
    factionId,
    memberCount,
    deploymentZone: { minX: x, maxX: x, minY: 60, maxY: 60 },
    anchorX: x,
    anchorY: 60,
    headingX: 1,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: memberCount,
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
      deathCountPolicy: { kind: "fixedTicks", durationTicks: 1_000 },
    },
  };
}

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
