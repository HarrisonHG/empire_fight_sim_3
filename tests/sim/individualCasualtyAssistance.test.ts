import { describe, expect, it } from "vitest";
import { getIndividualCasualtyHistoryInspection as getConsolidatedCasualtyHistory } from "../../src/sim/individualCasualtyConsolidation";

import {
  createCasualtyAssistanceDecisionBuffers,
  createCasualtyDragMovementBuffers,
  createIndividualDragHandCommitmentStore,
  advanceCasualtyDragGroupsBeforeCombat,
  cancelCasualtyDragGroupsFromPostCombatEvidence,
  promoteTerminalCitizenCasualtyDragGroups,
  refreshCasualtyDragMovementFinalPhaseCounts,
  decideIndividualCasualtyAssistance,
  getActiveCasualtyDragGroups,
  getIndividualCasualtyAssistanceInspection,
  isIndividualDragEligiblePatient,
  queryDragEligibleAlliedPatientsWithinRadiusInto,
} from "../../src/sim/individualCasualtyAssistance";
import {
  applyIndividualZeroHitLifecycleTransitions,
  classifyIndividualTerminalPlayerPresences,
  getIndividualPlayerPresenceState,
  transitionIndividualDyingToTerminal,
  transitionIndividualDyingToActive,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  advanceIndividualDeathCountsOneTick,
  initializeIndividualDeathCountsFromZeroHitTransitions,
} from "../../src/sim/individualDeathCount";
import { advanceIndividualCombatActions } from "../../src/sim/individualCombatAction";
import {
  applyIndividualLandedHits,
  restoreIndividualGlobalHits,
} from "../../src/sim/individualGlobalHits";
import {
  getIndividualMedicalLocalQueryPreparationCount,
  prepareIndividualMedicalLocalQueries,
  projectIndividualMedicalUrgency,
} from "../../src/sim/individualMedicalReadModel";
import {
  calculateTraumaticWoundOpportunityRoll,
  resolveIndividualTraumaticWoundOpportunities,
} from "../../src/sim/individualTraumaticWound";
import { advanceSimulationOneTick, createSimulation } from "../../src/sim/simulation";
import {
  createIndividualMedicalClaimBuffers,
  createIndividualMedicalClaimStore,
  decideIndividualMedicalClaimsAndHandoffs,
  getIndividualMedicalClaimInspection,
  hasIndividualMedicalPatientClaim,
  PHYSICK_HANDOFF_RANGE,
} from "../../src/sim/individualMedicalClaims";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";

describe("individual casualty assistance and sparse drag groups", () => {
  it.each([
    { phase: "gathering" as const, helperX: 120 },
    { phase: "dragging" as const, helperX: 104 },
  ])("promotes a terminal citizen's existing $phase rescue in place", ({ phase, helperX }) => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, helperX), medicalProfile: physick() },
      unit(3, 2, 230),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 2);
    const started = decide(simulation, 2);
    const buffers = createCasualtyDragMovementBuffers();
    if (phase === "dragging") {
      advanceCasualtyDragGroupsBeforeCombat(
        simulation.world, combat.identityStore, combat.formationStore,
        combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore,
        combat.moraleMovementStates, combat.individualCasualtyAssistanceStore,
        combat.casualtyDragGroupStore, combat.individualDragHandCommitmentStore,
        3, buffers, combat.individualPlayerPresenceStore,
      );
    }
    const before = getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)[0]!;
    expect(before.phase).toBe(phase);
    const preserved = { ...before, helperEntityIds: [...before.helperEntityIds] };

    transitionIndividualDyingToTerminal(
      combat.individualCasualtyLifecycleStore, 0, 4, "deathCountExpired",
    );
    classifyIndividualTerminalPlayerPresences(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualCasualtyProcedureProfileStore,
      [{ entityId: 0, tick: 4 }],
    );
    expect(promoteTerminalCitizenCasualtyDragGroups(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.casualtyDragGroupStore,
    )).toBe(1);
    const cancellations: typeof buffers.cancellationRecords = [];
    cancelCasualtyDragGroupsFromPostCombatEvidence(
      combat.identityStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      combat.individualDragHandCommitmentStore, [], 4, cancellations,
      combat.individualPlayerPresenceStore,
    );

    expect(getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    )).toBe("terminalAwaitingComfort");
    expect(cancellations).toHaveLength(0);
    expect(started.groupStartedRecords).toHaveLength(1);
    expect(getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)).toEqual([
      { ...preserved, patientKind: "terminalComfort" },
    ]);
  });

  it("cancels rather than promotes a barbarian dying-rescue group", () => {
    const barbarian = {
      ...unit(1, 1, 100),
      casualtyProcedure: {
        procedureKind: "barbarian" as const,
        deathCountPolicy: { kind: "fixedTicks" as const, durationTicks: 100 },
      },
    };
    const simulation = createSimulation(scenario([
      barbarian, { ...unit(2, 1, 104), medicalProfile: physick() }, unit(3, 2, 230),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 2);
    decide(simulation, 2);
    transitionIndividualDyingToTerminal(
      combat.individualCasualtyLifecycleStore, 0, 3, "deathCountExpired",
    );
    classifyIndividualTerminalPlayerPresences(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.individualCasualtyProcedureProfileStore,
      [{ entityId: 0, tick: 3 }],
    );
    expect(promoteTerminalCitizenCasualtyDragGroups(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      combat.casualtyDragGroupStore,
    )).toBe(0);
    const cancellations = createCasualtyDragMovementBuffers().cancellationRecords;
    cancelCasualtyDragGroupsFromPostCombatEvidence(
      combat.identityStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      combat.individualDragHandCommitmentStore, [], 3, cancellations,
      combat.individualPlayerPresenceStore,
    );
    expect(getIndividualPlayerPresenceState(
      combat.individualPlayerPresenceStore, 0,
    )).toBe("respawnEgress");
    expect(cancellations).toEqual([
      { groupId: 0, patientEntityId: 0, reason: "patientInvalid", tick: 3 },
    ]);
  });

  it("rescues a terminal citizen with one full Physick", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick() },
      unit(3, 2, 230),
    ]));
    terminalizeCitizen(simulation, 0, 2);

    expect(decide(simulation, 2).groupStartedRecords).toEqual([
      expect.objectContaining({
        groupId: 0,
        patientEntityId: 0,
        helperKind: "physick",
        helperEntityIds: [1],
      }),
    ]);
    expect(getActiveCasualtyDragGroups(
      requireCombat(simulation).casualtyDragGroupStore,
    )[0]!.patientKind).toBe("terminalComfort");
  });

  it.each([
    { profile: physick(), accepted: true },
    { profile: chirurgeonOnly(), accepted: false },
  ])("hands terminal comfort from two ordinary helpers only to a full Physick ($accepted)", ({ profile, accepted }) => {
    const simulation = createSimulation(scenario([
      multiUnit(1, 1, 100, 3),
      { ...unit(2, 1, 112), medicalProfile: profile },
      unit(3, 2, 230),
    ]));
    simulation.world.positionsX[1] = 104;
    simulation.world.positionsX[2] = 96;
    terminalizeCitizen(simulation, 0, 2);
    expect(decide(simulation, 2).groupStartedRecords[0]).toMatchObject({
      helperKind: "twoOrdinaryFighters",
      helperEntityIds: [1, 2],
    });
    expect(getActiveCasualtyDragGroups(
      requireCombat(simulation).casualtyDragGroupStore,
    )[0]!.patientKind).toBe("terminalComfort");
    reachFirstGroup(simulation, 3);
    simulation.world.positionsX[3] = simulation.world.positionsX[0]! +
      PHYSICK_HANDOFF_RANGE;
    simulation.world.positionsY[3] = simulation.world.positionsY[0]!;
    prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    const result = decideClaims(simulation, claims, 5);
    if (accepted) {
      expect(result.handoffRecords[0]).toMatchObject({
        patientEntityId: 0,
        physickEntityId: 3,
        releasedHelperEntityIds: [1, 2],
      });
      expect(result.claimRecords[0]).toMatchObject({
        patientEntityId: 0,
        physickEntityId: 3,
        need: "terminalComfort",
      });
    } else {
      expect(result.handoffRecords).toHaveLength(0);
      expect(result.claimRecords).toHaveLength(0);
    }
  });

  it("hands a reached casualty directly to its zero-herb solo Physick carrier and releases hands", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick(0) }, unit(3, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 2); decide(simulation, 2);
    reachFirstGroup(simulation, 3);
    prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    const result = decideClaims(simulation, claims, 5);
    expect(result.claimRecords).toEqual([{ physickEntityId: 1, patientEntityId: 0, need: "dying", tick: 5, origin: "soloCarrier" }]);
    expect(result.handoffRecords[0]).toMatchObject({ patientEntityId: 0, physickEntityId: 1, releasedHelperEntityIds: [1] });
    expect(combat.individualDragHandCommitmentStore.getFreeHands(1)).toBeUndefined();
    expect(getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)).toHaveLength(0);
    expect(getIndividualMedicalClaimInspection(claims, 0)).toMatchObject({ physickEntityId: 1, need: "dying" });
  });

  it("hands ordinary carriers to a Physick inside physical handoff range and retains ownership", () => {
    const simulation = createSimulation(scenario([
      multiUnit(1, 1, 100, 3), { ...unit(2, 1, 112), medicalProfile: physick(0) }, unit(3, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    simulation.world.positionsX[1] = 104; simulation.world.positionsX[2] = 96;
    down(simulation, 0, 2); decide(simulation, 2); reachFirstGroup(simulation, 3);
    simulation.world.positionsX[3] = simulation.world.positionsX[0]! + PHYSICK_HANDOFF_RANGE;
    simulation.world.positionsY[3] = simulation.world.positionsY[0]!;
    prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    const first = decideClaims(simulation, claims, 5);
    expect(first.claimRecords[0]).toMatchObject({ patientEntityId: 0, physickEntityId: 3, origin: "handoff" });
    expect([combat.individualDragHandCommitmentStore.getFreeHands(1), combat.individualDragHandCommitmentStore.getFreeHands(2)])
      .toEqual([undefined, undefined]);
    expect(getIndividualCasualtyAssistanceInspection(combat.individualCasualtyAssistanceStore, 1).state).toBe("none");
    const second = decideClaims(simulation, claims, 6);
    expect(second.claimRecords).toHaveLength(0);
    expect(getIndividualMedicalClaimInspection(claims, 3).patientEntityId).toBe(0);
  });

  it("does not hand ordinary carriers to a distant local Physick, then permits an in-place claim after safe release", () => {
    const simulation = createSimulation(scenario([
      multiUnit(1, 1, 100, 3), { ...unit(2, 1, 250), medicalProfile: physick(0) }, unit(3, 2, 220),
    ]));
    down(simulation, 0, 2); decide(simulation, 2); reachFirstGroup(simulation, 3); prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    expect(Math.abs(simulation.world.positionsX[3]! - simulation.world.positionsX[0]!))
      .toBeGreaterThan(PHYSICK_HANDOFF_RANGE);
    expect(decideClaims(simulation, claims, 5).safeReleaseRecords).toHaveLength(1);
    const combat = requireCombat(simulation);
    expect(getIndividualCasualtyAssistanceInspection(combat.individualCasualtyAssistanceStore, 0).state).toBe("atTreatmentPosition");
    expect(decide(simulation, 6).groupStartedRecords).toHaveLength(0);
    simulation.world.positionsX[3] = 110;
    prepare(simulation);
    expect(decideClaims(simulation, claims, 7).claimRecords[0]).toMatchObject({ patientEntityId: 0, physickEntityId: 3, origin: "triage" });
  });

  it("hands two ordinary carriers to a nearby Chirurgeon-only character", () => {
    const simulation = createSimulation(scenario([
      multiUnit(1, 1, 100, 3),
      { ...unit(2, 1, 112), medicalProfile: chirurgeonOnly() },
      unit(3, 2, 220),
    ]));
    simulation.world.positionsX[1] = 104;
    simulation.world.positionsX[2] = 96;
    down(simulation, 0, 2);
    decide(simulation, 2);
    reachFirstGroup(simulation, 3);
    simulation.world.positionsX[3] = simulation.world.positionsX[0]! +
      PHYSICK_HANDOFF_RANGE;
    simulation.world.positionsY[3] = simulation.world.positionsY[0]!;
    prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);

    const result = decideClaims(simulation, claims, 5);

    expect(result.handoffRecords[0]).toMatchObject({
      patientEntityId: 0,
      physickEntityId: 3,
      releasedHelperEntityIds: [1, 2],
    });
    expect(result.claimRecords[0]).toMatchObject({
      physickEntityId: 3,
      patientEntityId: 0,
      need: "dying",
      origin: "handoff",
    });
  });

  it("does not let a Chirurgeon-only character form a solo drag group", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100),
      { ...unit(2, 1, 104), medicalProfile: chirurgeonOnly() },
      unit(3, 2, 220),
    ]));
    down(simulation, 0, 2);

    const result = decide(simulation, 2);

    expect(result.groupStartedRecords).toHaveLength(0);
    expect(result.noRescueRecords).toContainEqual({
      patientEntityId: 0,
      reason: "onlyOneOrdinaryHelper",
      tick: 2,
    });
  });

  it("counts a Chirurgeon-only character as dying-patient medical support", () => {
    const run = (medicalProfile?: ReturnType<typeof chirurgeonOnly>) => {
      const supportUnit = unit(2, 1, 20);
      const simulation = createSimulation(scenario([
        multiUnit(1, 1, 150, 3),
        medicalProfile === undefined
          ? supportUnit
          : { ...supportUnit, medicalProfile },
        unit(3, 2, 250),
      ]));
      down(simulation, 0, 2);
      return {
        simulation,
        record: decide(simulation, 2).groupStartedRecords[0]!,
      };
    };

    const withChirurgeon = run(chirurgeonOnly());
    const withoutChirurgeon = run();
    expect(withChirurgeon.record).toMatchObject({
      patientEntityId: 0,
      helperKind: "twoOrdinaryFighters",
      helperEntityIds: [1, 2],
    });
    expect({
      x: withChirurgeon.record.destinationX,
      y: withChirurgeon.record.destinationY,
    }).not.toEqual({
      x: withoutChirurgeon.record.destinationX,
      y: withoutChirurgeon.record.destinationY,
    });
    const deltaX = withChirurgeon.record.destinationX -
      withChirurgeon.simulation.world.positionsX[3]!;
    const deltaY = withChirurgeon.record.destinationY -
      withChirurgeon.simulation.world.positionsY[3]!;
    expect(deltaX * deltaX + deltaY * deltaY).toBeLessThanOrEqual(96 * 96);
  });

  it("clears a Chirurgeon-only claim when the authoritative need becomes Physick-only", () => {
    const simulation = createSimulation(scenario([
      multiUnit(1, 1, 100, 3),
      { ...unit(2, 1, 112), medicalProfile: chirurgeonOnly() },
      unit(3, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    simulation.world.positionsX[1] = 104;
    simulation.world.positionsX[2] = 96;
    down(simulation, 0, 2);
    decide(simulation, 2);
    reachFirstGroup(simulation, 3);
    simulation.world.positionsX[3] = simulation.world.positionsX[0]! +
      PHYSICK_HANDOFF_RANGE;
    simulation.world.positionsY[3] = simulation.world.positionsY[0]!;
    prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    expect(decideClaims(simulation, claims, 5).claimRecords[0]).toMatchObject({
      physickEntityId: 3,
      patientEntityId: 0,
      need: "dying",
    });

    restoreIndividualGlobalHits(
      combat.individualGlobalHitStore,
      combat.individualCasualtyLifecycleStore,
      0,
      1,
      "chirurgeonTreatment",
    );
    transitionIndividualDyingToActive(
      combat.individualCasualtyLifecycleStore,
      combat.individualPlayerPresenceStore,
      0,
      6,
    );
    prepare(simulation);

    expect(decideClaims(simulation, claims, 6).staleClaimRecords).toEqual([{
      physickEntityId: 3,
      patientEntityId: 0,
      tick: 6,
    }]);
    expect(getIndividualMedicalClaimInspection(claims, 3).patientEntityId)
      .toBe(-1);
  });

  it("excludes a Physick with a current patient from rescue-helper selection", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick(1) },
      unit(3, 1, 112), unit(4, 2, 240),
    ]));
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1); prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    expect(decideClaims(simulation, claims, 1).claimRecords[0]).toMatchObject({
      patientEntityId: 0,
      physickEntityId: 1,
    });
    down(simulation, 2, 2); prepare(simulation);

    const rescue = decidePrepared(simulation, 2, {
      hasClaimedPatient: (entityId) =>
        hasIndividualMedicalPatientClaim(claims, entityId),
    });

    expect(rescue.groupStartedRecords).toHaveLength(0);
    expect(rescue.noRescueRecords).toContainEqual({
      patientEntityId: 2,
      reason: "onlyOneOrdinaryHelper",
      tick: 2,
    });
  });

  it("lets a claim created earlier in the production tick block later rescue selection", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick(1) },
      unit(3, 1, 112), unit(4, 2, 240),
    ]));
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1);
    down(simulation, 2, 1);

    advanceSimulationOneTick(simulation);

    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore,
      1,
    ).patientEntityId).toBe(0);
    expect(getIndividualMedicalClaimInspection(
      combat.individualMedicalClaimStore,
      0,
    )).toMatchObject({ physickEntityId: 1, need: "livingMissingHits" });
    expect(combat.casualtyAssistanceDecisionResult.groupStartedRecords)
      .not.toContainEqual(expect.objectContaining({ patientEntityId: 2 }));
  });

  it("retains a current patient across a more urgent arrival and clears stale ownership canonically", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), unit(2, 1, 108), { ...unit(3, 1, 104), medicalProfile: physick(1) }, unit(4, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1); prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    expect(decideClaims(simulation, claims, 2).claimRecords[0]).toMatchObject({ patientEntityId: 0, physickEntityId: 2, need: "livingMissingHits" });
    down(simulation, 1, 3); prepare(simulation);
    expect(decideClaims(simulation, claims, 3).claimRecords).toHaveLength(0);
    expect(getIndividualMedicalClaimInspection(claims, 2).patientEntityId).toBe(0);
    combat.moraleMovementStates.set(3, "routing");
    const stale = decideClaims(simulation, claims, 4);
    expect(stale.staleClaimRecords).toEqual([{ physickEntityId: 2, patientEntityId: 0, tick: 4 }]);
    expect(getIndividualMedicalClaimInspection(claims, 2).patientEntityId).toBe(-1);
  });

  it("retains ownership and refreshes a traumatic-wound claim to the current dying need", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick(1) }, unit(3, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    applyTrauma(combat, 0); prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    expect(decideClaims(simulation, claims, 2).claimRecords[0]).toMatchObject({
      physickEntityId: 1,
      patientEntityId: 0,
      need: "traumaticWound",
    });

    down(simulation, 0, 3); prepare(simulation);
    expect(decideClaims(simulation, claims, 3).staleClaimRecords).toHaveLength(0);
    expect(getIndividualMedicalClaimInspection(claims, 1)).toMatchObject({
      patientEntityId: 0,
    });
    expect(getIndividualMedicalClaimInspection(claims, 0)).toMatchObject({
      physickEntityId: 1,
      claimedTick: 2,
      need: "dying",
    });
  });

  it("changes an owned living-missing-hits claim to dying without displacing its Physick", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick(1) }, unit(3, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1); prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    decideClaims(simulation, claims, 2);

    down(simulation, 0, 3); prepare(simulation);
    decideClaims(simulation, claims, 3);

    expect(getIndividualMedicalClaimInspection(claims, 0)).toMatchObject({
      physickEntityId: 1,
      claimedTick: 2,
      need: "dying",
    });
    expect(getIndividualMedicalClaimInspection(claims, 1).patientEntityId).toBe(0);
  });

  it("clears ownership when an herb-dependent current need has no unreserved herb", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick(1) }, unit(3, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1); prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    decideClaims(simulation, claims, 2);
    reserveAllHerbsForTest(combat, 1);

    const result = decideClaims(simulation, claims, 3);

    expect(result.staleClaimRecords).toEqual([{
      physickEntityId: 1,
      patientEntityId: 0,
      tick: 3,
    }]);
    expect(getIndividualMedicalClaimInspection(claims, 1).patientEntityId).toBe(-1);
    expect(getIndividualMedicalClaimInspection(claims, 0).physickEntityId).toBe(-1);
  });

  it("requires an available herb for living missing-hit ownership", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick(0) }, unit(3, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    applyLosses(combat, 0, 1); prepare(simulation);
    const claims = createIndividualMedicalClaimStore(simulation.world.entityCount);
    expect(decideClaims(simulation, claims, 2).claimRecords).toHaveLength(0);
  });
  it("gathers before pickup and gives neither creation nor phase-transition ticks free drag movement", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 120), medicalProfile: physick() }, unit(3, 2, 230),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 5);
    decide(simulation, 5);
    const hands = createIndividualDragHandCommitmentStore(simulation.world.entityCount);
    const buffers = createCasualtyDragMovementBuffers();
    const startPatientX = simulation.world.positionsX[0]!;
    const startHelperX = simulation.world.positionsX[1]!;

    advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
      combat.formationStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      hands, 5, buffers, combat.individualPlayerPresenceStore);
    expect([simulation.world.positionsX[0], simulation.world.positionsX[1]]).toEqual([startPatientX, startHelperX]);
    expect(hands.getFreeHands(1)).toBe(2);

    let tick = 6;
    while (getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)[0]!.phase === "gathering") {
      const patientBefore = simulation.world.positionsX[0]!;
      const result = advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
        combat.formationStore, combat.individualCasualtyLifecycleStore,
        combat.individualTraumaticWoundStore, combat.moraleMovementStates,
        combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
        hands, tick, buffers, combat.individualPlayerPresenceStore);
      expect(simulation.world.positionsX[0]).toBe(patientBefore);
      if (result.draggingGroupCount === 1) expect(result.movedParticipantCount).toBeLessThanOrEqual(1);
      tick += 1;
    }
    const transitionPatientX = simulation.world.positionsX[0]!;
    advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
      combat.formationStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      hands, tick - 1, buffers, combat.individualPlayerPresenceStore);
    expect(simulation.world.positionsX[0]).toBe(transitionPatientX);
    expect(hands.getFreeHands(1)).toBe(0);
    const reached = advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
      combat.formationStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      hands, tick, buffers, combat.individualPlayerPresenceStore);
    expect(reached.reachedSafetyRecords).toEqual([{ groupId: 0, patientEntityId: 0, tick }]);
    expect(getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)[0]!.phase).toBe("reachedSafety");
    expect(getIndividualCasualtyAssistanceInspection(combat.individualCasualtyAssistanceStore, 0).state)
      .toBe("atTreatmentPosition");
    expect(hands.getFreeHands(1)).toBe(0);
  });

  it("translates dragging participants coherently and cancels once on an accepted helper hit", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick() }, unit(3, 2, 150),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 3); decide(simulation, 3);
    const hands = createIndividualDragHandCommitmentStore(simulation.world.entityCount);
    const buffers = createCasualtyDragMovementBuffers();
    advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore, combat.formationStore,
      combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 4, buffers,
      combat.individualPlayerPresenceStore);
    const before = [simulation.world.positionsX[0]!, simulation.world.positionsX[1]!];
    advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore, combat.formationStore,
      combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 5, buffers,
      combat.individualPlayerPresenceStore);
    expect(simulation.world.positionsX[0]! - before[0]!).toBe(simulation.world.positionsX[1]! - before[1]!);

    const cancellations: typeof buffers.cancellationRecords = [];
    cancelCasualtyDragGroupsFromPostCombatEvidence(combat.identityStore,
      combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore,
      combat.moraleMovementStates, combat.individualCasualtyAssistanceStore,
      combat.casualtyDragGroupStore, hands, [{ attackerEntityId: 2, targetEntityId: 1,
        currentTick: 5, outcome: "accepted", reason: "accepted", previousNextAllowedTick: null,
        resultingNextAllowedTick: 25, cooldownTicksRemaining: 20 }], 5, cancellations,
      combat.individualPlayerPresenceStore);
    expect(cancellations).toEqual([{ groupId: 0, patientEntityId: 0, reason: "helperHit", tick: 5 }]);
    expect(getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)).toHaveLength(0);
    expect(hands.getFreeHands(1)).toBeUndefined();
    prepare(simulation);
    expect(decidePrepared(simulation, 5).groupStartedRecords).toHaveLength(0);
  });

  it("clamps effective destinations to the shared feasible translation at every world boundary", () => {
    const cases = [
      { patient: [1, 60], helper: [0, 60], requested: [0, 60], effective: [1, 60] },
      { patient: [258, 60], helper: [259, 60], requested: [259, 60], effective: [258, 60] },
      { patient: [100, 1], helper: [100, 0], requested: [100, 0], effective: [100, 1] },
      { patient: [100, 118], helper: [100, 119], requested: [100, 119], effective: [100, 118] },
    ] as const;
    for (const candidate of cases) {
      const simulation = createSimulation(scenario([
        unit(1, 1, 100), { ...unit(2, 1, 104), medicalProfile: physick() }, unit(3, 2, 220),
      ]));
      const combat = requireCombat(simulation);
      simulation.world.positionsX[0] = candidate.patient[0]; simulation.world.positionsY[0] = candidate.patient[1];
      simulation.world.positionsX[1] = candidate.helper[0]; simulation.world.positionsY[1] = candidate.helper[1];
      down(simulation, 0, 2); decide(simulation, 2);
      const group = getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)[0]! as
        { destinationX: number; destinationY: number; phase: string };
      group.destinationX = candidate.requested[0]; group.destinationY = candidate.requested[1];
      const hands = createIndividualDragHandCommitmentStore(simulation.world.entityCount);
      const buffers = createCasualtyDragMovementBuffers();
      advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore, combat.formationStore,
        combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore, combat.moraleMovementStates,
        combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 3, buffers,
        combat.individualPlayerPresenceStore);
      expect([group.destinationX, group.destinationY]).toEqual(candidate.effective);
      expect(getIndividualCasualtyAssistanceInspection(combat.individualCasualtyAssistanceStore, 0))
        .toMatchObject({ destinationX: candidate.effective[0], destinationY: candidate.effective[1] });
      const reached = advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore, combat.formationStore,
        combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore, combat.moraleMovementStates,
        combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 4, buffers,
        combat.individualPlayerPresenceStore);
      expect(reached.reachedSafetyRecords).toHaveLength(1);
    }
  });

  it("tracks one free hand for each ordinary carrier and removes final dragging counts on cancellation", () => {
    const simulation = createSimulation(scenario([
      multiUnit(1, 1, 100, 3), unit(2, 2, 220),
    ]));
    const combat = requireCombat(simulation);
    simulation.world.positionsX[1] = 104; simulation.world.positionsX[2] = 96;
    down(simulation, 0, 3); decide(simulation, 3);
    const hands = createIndividualDragHandCommitmentStore(simulation.world.entityCount);
    const buffers = createCasualtyDragMovementBuffers();
    const movement = advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore, combat.formationStore,
      combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 4, buffers,
      combat.individualPlayerPresenceStore);
    expect([hands.getFreeHands(1), hands.getFreeHands(2)]).toEqual([1, 1]);
    const cancellations: typeof buffers.cancellationRecords = [];
    cancelCasualtyDragGroupsFromPostCombatEvidence(combat.identityStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, new Map([[1, "routing" as const], [2, "steady" as const]]),
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, [], 4, cancellations,
      combat.individualPlayerPresenceStore);
    const final = refreshCasualtyDragMovementFinalPhaseCounts(combat.casualtyDragGroupStore, movement);
    expect(final).toMatchObject({ gatheringGroupCount: 0, draggingGroupCount: 0, reachedSafetyGroupCount: 0, movedParticipantCount: movement.movedParticipantCount });
    expect([hands.getFreeHands(1), hands.getFreeHands(2)]).toEqual([undefined, undefined]);
  });
  it("forms one sparse group with a zero-herb Physick and reserves both participants", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100),
      { ...unit(2, 1, 112), medicalProfile: physick(0) },
      unit(3, 2, 230),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 5);

    const result = decide(simulation, 5);

    expect(result.groupStartedRecords).toEqual([
      expect.objectContaining({
        patientEntityId: 0,
        helperKind: "physick",
        helperEntityIds: [1],
      }),
    ]);
    expect(result.rescueRequestedRecords).toEqual([
      { patientEntityId: 0, tick: 5 },
    ]);
    expect(getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)).toHaveLength(1);
    expect(getIndividualCasualtyAssistanceInspection(
      combat.individualCasualtyAssistanceStore, 0,
    )).toMatchObject({ state: "reservedPatient", dragGroupId: 0 });
    expect(getIndividualCasualtyAssistanceInspection(
      combat.individualCasualtyAssistanceStore, 1,
    )).toMatchObject({ state: "reservedHelper", dragGroupId: 0 });
  });

  it("rejects one ordinary fighter but forms with two using canonical IDs", () => {
    const lone = createSimulation(scenario([
      unit(1, 1, 100), unit(2, 1, 108), unit(3, 2, 230),
    ]));
    down(lone, 0, 4);
    expect(decide(lone, 4).noRescueRecords).toEqual([
      { patientEntityId: 0, reason: "onlyOneOrdinaryHelper", tick: 4 },
    ]);

    const paired = createSimulation(scenario([
      unit(1, 1, 100), unit(2, 1, 112), unit(3, 1, 108), unit(4, 2, 230),
    ]));
    down(paired, 0, 4);
    expect(decide(paired, 4).groupStartedRecords[0]).toMatchObject({
      helperKind: "twoOrdinaryFighters",
      helperEntityIds: [2, 1],
    });
  });

  it("never double-reserves helpers across two simultaneous patients", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 96), unit(2, 1, 104),
      unit(3, 1, 112), unit(4, 1, 120), unit(5, 2, 230),
    ]));
    down(simulation, 0, 8);
    down(simulation, 1, 8);

    const result = decide(simulation, 8);

    expect(result.groupStartedRecords).toHaveLength(1);
    expect(result.noRescueRecords).toHaveLength(1);
    const helpers = result.groupStartedRecords[0]!.helperEntityIds;
    expect(new Set(helpers).size).toBe(2);
  });

  it("discovers only allied dying patients and excludes mobile trauma and low-hit patients", () => {
    const simulation = createSimulation(scenario([
      { ...unit(1, 1, 80), medicalProfile: physick() },
      unit(2, 1, 100), unit(3, 1, 120), unit(4, 1, 140), unit(5, 2, 110),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 1, 7);
    applyTrauma(combat, 2);
    applyLosses(combat, 3, 1);
    down(simulation, 4, 7);
    prepare(simulation);
    const out: number[] = [];

    const records = queryDragEligibleAlliedPatientsWithinRadiusInto(
      simulation.world,
      combat.identityStore,
      combat.individualCasualtyLifecycleStore,
      combat.individualCasualtyAssistanceStore,
      combat.individualMedicalLocalQueryStore,
      0,
      192,
      out,
    );

    expect(records).toBe(out);
    expect(records).toEqual([1]);
    expect(isIndividualDragEligiblePatient(
      combat.individualCasualtyLifecycleStore, 2,
    )).toBe(false);
    expect(isIndividualDragEligiblePatient(
      combat.individualCasualtyLifecycleStore, 3,
    )).toBe(false);
  });

  it("excludes routing, traumatised and treating helpers", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), unit(2, 1, 108), unit(3, 1, 112),
      unit(4, 1, 116), unit(5, 2, 230),
    ]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 9);
    combat.moraleMovementStates.set(2, "routing");
    applyTrauma(combat, 2);
    prepare(simulation);

    const result = decidePrepared(simulation, 9, {
      isTreating: (entityId) => entityId === 3,
    });

    expect(result.groupStartedRecords).toHaveLength(0);
    expect(result.noRescueRecords).toEqual([
      { patientEntityId: 0, reason: "noEligibleHelpers", tick: 9 },
    ]);
  });

  it("excludes attacking, dying and terminal helpers while retaining two valid ordinary helpers", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), unit(2, 1, 104), unit(3, 1, 108),
      unit(4, 1, 112), unit(5, 1, 116), unit(6, 1, 120),
      unit(7, 1, 124, "oneHanded"), unit(8, 1, 128), unit(9, 1, 132),
      unit(10, 2, 136),
    ]));
    const combat = requireCombat(simulation);
    combat.moraleMovementStates.set(2, "routing");
    applyTrauma(combat, 2);
    down(simulation, 5, 0);
    for (let tick = 1; tick <= 100; tick += 1) {
      advanceIndividualDeathCountsOneTick(
        combat.individualDeathCountStore,
        combat.individualCasualtyLifecycleStore,
        simulation.world,
        tick,
      );
    }
    down(simulation, 0, 101);
    down(simulation, 4, 101);
    advanceIndividualCombatActions(
      simulation.world,
      combat.identityStore,
      combat.formationStore,
      combat.individualProfileStore,
      [{
        sourceEntityId: 6,
        targetEntityId: 9,
        distanceSquared: 144,
        sourceThreatDistance: 12,
        sourcePreferredMinimumDistance: 4,
        targetThreatDistance: 0,
        sourceCanThreatTarget: true,
        targetCanThreatSource: false,
        withinPreferredDistance: true,
        facingEligible: true,
        selectionReason: "nearestValidHostile",
      }],
      combat.individualCombatActionStore,
    );

    prepare(simulation);
    const result = decidePrepared(simulation, 101, {
      isTreating: (entityId) => entityId === 3,
    });

    expect(result.groupStartedRecords[0]).toMatchObject({
      helperKind: "twoOrdinaryFighters",
      helperEntityIds: [7, 8],
    });
  });

  it("selects a bounded rearward destination away from local hostile exposure deterministically", () => {
    const make = () => {
      const simulation = createSimulation(scenario([
        unit(1, 1, 100),
        { ...unit(2, 1, 108), medicalProfile: physick() },
        unit(3, 2, 160),
      ]));
      down(simulation, 0, 6);
      return simulation;
    };
    const first = make();
    const second = make();

    const firstRecord = decide(first, 6).groupStartedRecords[0]!;
    const secondRecord = decide(second, 6).groupStartedRecords[0]!;

    expect(secondRecord).toEqual(firstRecord);
    expect(firstRecord.destinationX).toBeLessThan(first.world.positionsX[0]!);
    expect(firstRecord.destinationX).toBeGreaterThanOrEqual(0);
    expect(firstRecord.destinationY).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(
      firstRecord.destinationX - first.world.positionsX[0]!,
      firstRecord.destinationY - first.world.positionsY[0]!,
    )).toBeLessThanOrEqual(96.000_000_001);
  });

  it("integrates only the decision on the production tick and does not move the new group", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100),
      { ...unit(2, 1, 112), medicalProfile: physick() },
      unit(3, 2, 230),
    ], [0, 1]));
    const combat = requireCombat(simulation);
    down(simulation, 0, 0);
    const positions = Array.from(simulation.world.positionsX);

    advanceSimulationOneTick(simulation);

    expect(combat.casualtyAssistanceDecisionResult.groupStartedRecords).toHaveLength(1);
    expect(Array.from(simulation.world.positionsX)).toEqual(positions);
    expect(combat.debugSnapshot).toMatchObject({
      activeDragGroupCount: 1,
      dragGroupStartedCount: 1,
    });
    expect(combat.debugSnapshot.inspectedIndividuals[0]).toMatchObject({
      casualtyAssistanceState: "reservedPatient",
      casualtyDragGroupId: 0,
    });
    expect(getConsolidatedCasualtyHistory(
      combat.individualCasualtyHistoryStore,
      combat.individualDeathCountStore,
      combat.individualTraumaticWoundStore,
      combat.individualExecutionActionStore,
      combat.individualPlayerPresenceStore,
      0,
    )).toMatchObject({ wasDragged: true, firstDragTick: 0, dragPatientEpisodeCount: 1 });
    expect(getConsolidatedCasualtyHistory(
      combat.individualCasualtyHistoryStore,
      combat.individualDeathCountStore,
      combat.individualTraumaticWoundStore,
      combat.individualExecutionActionStore,
      combat.individualPlayerPresenceStore,
      1,
    ).dragHelperParticipationCount).toBe(1);
    expect(combat.individualCasualtyUnitSummaries[1]!.activeDragHelperCount).toBe(1);
  });

  it("skips the second prepared-grid rebuild on ordinary ticks without drag-eligible patients", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 100), unit(2, 2, 230),
    ]));
    const combat = requireCombat(simulation);

    advanceSimulationOneTick(simulation);

    expect(getIndividualMedicalLocalQueryPreparationCount(
      combat.individualMedicalLocalQueryStore,
    )).toBe(1);
    expect(combat.casualtyAssistanceDecisionResult).toMatchObject({
      dragEligiblePatientCount: 0,
      localCandidateCount: 0,
    });
  });

  it("counts a zero-herb Physick as rescue support and ignores herb inventory when scoring", () => {
    const run = (startingGenericHerbs: number) => {
      const simulation = createSimulation(scenario([
        multiUnit(1, 1, 150, 3),
        { ...unit(2, 1, 200), medicalProfile: physick(startingGenericHerbs) },
        unit(3, 2, 250),
      ]));
      down(simulation, 0, 3);
      return decide(simulation, 3).groupStartedRecords[0]!;
    };

    const empty = run(0);
    const stocked = run(12);

    expect(empty.helperKind).toBe("twoOrdinaryFighters");
    expect(empty.destinationX).toBe(150);
    expect(stocked.destinationX).toBe(empty.destinationX);
    expect(stocked.destinationY).toBe(empty.destinationY);
  });

  it("does not count attacking, treating, or patient-owning Physicks as rescue support", () => {
    const make = () => createSimulation(scenario([
      multiUnit(1, 1, 150, 3),
      { ...unit(2, 1, 54, "oneHanded"), medicalProfile: physick(0) },
      unit(3, 2, 60),
    ]));
    const attacking = make();
    const attackingCombat = requireCombat(attacking);
    down(attacking, 0, 4);
    beginAttack(attacking, 3, 4);
    expect(decide(attacking, 4).groupStartedRecords[0]).toMatchObject({
      destinationX: 150,
      destinationY: 60,
    });

    const treating = make();
    down(treating, 0, 4);
    prepare(treating);
    const treatingResult = decidePrepared(treating, 4, {
      isTreating: (entityId) => entityId === 3,
    });
    expect(treatingResult.groupStartedRecords[0]).toMatchObject({
      destinationX: 150,
      destinationY: 60,
    });

    const claimed = make();
    down(claimed, 0, 4);
    prepare(claimed);
    const claimedResult = decidePrepared(claimed, 4, {
      hasClaimedPatient: (entityId) => entityId === 3,
    });
    expect(claimedResult.groupStartedRecords[0]).toMatchObject({
      destinationX: 150,
      destinationY: 60,
    });
    expect(attackingCombat.individualCombatActionStore.entityCount).toBe(5);
  });

  it("does not let a Physick reserved for the first patient support the second patient", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 20),
      multiUnit(2, 1, 180, 3),
      { ...unit(3, 1, 80), medicalProfile: physick(0) },
      unit(4, 2, 100),
    ]));
    down(simulation, 0, 5);
    down(simulation, 1, 5);

    const result = decide(simulation, 5);
    const second = result.groupStartedRecords.find(
      (record) => record.patientEntityId === 1,
    );

    expect(result.groupStartedRecords.find(
      (record) => record.patientEntityId === 0,
    )).toMatchObject({ helperKind: "physick", helperEntityIds: [4] });
    expect(second).toMatchObject({
      helperKind: "twoOrdinaryFighters",
      destinationX: 180,
      destinationY: 60,
    });
  });

  it("does not bias a solo-Physick destination toward the helper's old position", () => {
    const simulation = createSimulation(scenario([
      unit(1, 1, 150),
      { ...unit(2, 1, 54), medicalProfile: physick(0) },
      unit(3, 2, 250),
    ]));
    down(simulation, 0, 6);

    expect(decide(simulation, 6).groupStartedRecords[0]).toMatchObject({
      helperKind: "physick",
      destinationX: 150,
      destinationY: 60,
    });
  });

  it("prefers same-unit responsibility before an out-of-unit Physick", () => {
    const ordinary = createSimulation(scenario([
      multiUnit(1, 1, 100, 3),
      { ...unit(2, 1, 108), medicalProfile: physick() },
      unit(3, 2, 250),
    ]));
    down(ordinary, 0, 7);
    expect(decide(ordinary, 7).groupStartedRecords[0]).toMatchObject({
      helperKind: "twoOrdinaryFighters",
      helperEntityIds: [1, 2],
    });

    const sameUnitPhysick = createSimulation(scenario([
      { ...multiUnit(1, 1, 100, 2), medicalProfile: physick(0) },
      unit(2, 1, 108),
      unit(3, 2, 250),
    ]));
    down(sameUnitPhysick, 0, 7);
    expect(decide(sameUnitPhysick, 7).groupStartedRecords[0]).toMatchObject({
      helperKind: "physick",
      helperEntityIds: [1],
    });
  });

  it("keeps physical selection and destination deterministic when helper layout construction is reversed", () => {
    const run = (helperXs: readonly [number, number]) => {
      const simulation = createSimulation(scenario([
        unit(1, 1, 100),
        { ...unit(2, 1, helperXs[0]), medicalProfile: physick(0) },
        { ...unit(3, 1, helperXs[1]), medicalProfile: physick(0) },
        unit(4, 2, 250),
      ]));
      down(simulation, 0, 8);
      const record = decide(simulation, 8).groupStartedRecords[0]!;
      return {
        selectedHelperX:
          simulation.world.positionsX[record.helperEntityIds[0]!]!,
        destinationX: record.destinationX,
        destinationY: record.destinationY,
      };
    };

    expect(run([112, 120])).toEqual(run([120, 112]));
  });
});

function decide(
  simulation: SimulationState,
  tick: number,
): ReturnType<typeof decideIndividualCasualtyAssistance> {
  prepare(simulation);
  return decidePrepared(simulation, tick);
}

function reachFirstGroup(simulation: SimulationState, firstTick: number): void {
  const combat = requireCombat(simulation);
  const buffers = createCasualtyDragMovementBuffers();
  for (let tick = firstTick; tick < firstTick + 20; tick += 1) {
    advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
      combat.formationStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      combat.individualDragHandCommitmentStore, tick, buffers,
      combat.individualPlayerPresenceStore);
    if (getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)[0]?.phase === "reachedSafety") return;
  }
  throw new Error("Expected casualty group to reach safety.");
}

function decideClaims(
  simulation: SimulationState,
  claims: ReturnType<typeof createIndividualMedicalClaimStore>,
  tick: number,
  options: Parameters<typeof decideIndividualMedicalClaimsAndHandoffs>[17] = {},
) {
  const combat = requireCombat(simulation);
  return decideIndividualMedicalClaimsAndHandoffs(
    simulation.world, combat.identityStore, combat.individualCasualtyLifecycleStore,
    combat.trustedIndividualMedicalProfileStore, combat.individualGenericHerbStore,
    combat.individualTraumaticWoundStore, combat.individualLimbDisabilityStore,
    combat.individualMedicalUrgencyStore,
    combat.individualCombatActionStore, combat.moraleMovementStates,
    combat.individualMedicalLocalQueryStore, combat.individualCasualtyAssistanceStore,
    combat.casualtyDragGroupStore, combat.individualDragHandCommitmentStore,
    claims, tick, createIndividualMedicalClaimBuffers(), options,
  );
}

function decidePrepared(
  simulation: SimulationState,
  tick: number,
  options: Parameters<typeof decideIndividualCasualtyAssistance>[14] = {},
): ReturnType<typeof decideIndividualCasualtyAssistance> {
  const combat = requireCombat(simulation);
  return decideIndividualCasualtyAssistance(
    simulation.world,
    combat.identityStore,
    combat.formationStore,
    combat.individualCasualtyLifecycleStore,
    combat.trustedIndividualMedicalProfileStore,
    combat.individualTraumaticWoundStore,
    combat.individualOrdinaryParticipationSnapshot,
    combat.individualCombatActionStore,
    combat.moraleMovementStates,
    combat.individualMedicalLocalQueryStore,
    combat.individualCasualtyAssistanceStore,
    combat.casualtyDragGroupStore,
    tick,
    createCasualtyAssistanceDecisionBuffers(),
    {
      ...options,
      isTerminalAwaitingComfort: (entityId) =>
        getIndividualPlayerPresenceState(
          combat.individualPlayerPresenceStore, entityId,
        ) === "terminalAwaitingComfort",
    },
  );
}

function prepare(simulation: SimulationState): void {
  const combat = requireCombat(simulation);
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
    combat.individualPlayerPresenceStore,
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
}

function down(simulation: SimulationState, entityId: number, tick: number): void {
  const combat = requireCombat(simulation);
  const zero = applyLosses(combat, entityId, 2).zeroHitEvents;
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

function terminalizeCitizen(
  simulation: SimulationState,
  entityId: number,
  tick: number,
): void {
  const combat = requireCombat(simulation);
  down(simulation, entityId, tick);
  transitionIndividualDyingToTerminal(
    combat.individualCasualtyLifecycleStore,
    entityId,
    tick + 1,
    "deathCountExpired",
  );
  classifyIndividualTerminalPlayerPresences(
    combat.individualCasualtyLifecycleStore,
    combat.individualPlayerPresenceStore,
    combat.individualCasualtyProcedureProfileStore,
    [{ entityId, tick: tick + 1 }],
  );
}

function applyTrauma(combat: CombatSandboxSimulationState, entityId: number): void {
  for (let tick = 1; tick < 10_000; tick += 1) {
    const opportunity = {
      targetEntityId: entityId,
      attackerEntityId: entityId === 0 ? 1 : 0,
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
  throw new Error("Expected deterministic trauma opportunity.");
}

function applyLosses(
  combat: CombatSandboxSimulationState,
  defenderEntityId: number,
  count: number,
) {
  return applyIndividualLandedHits(
    combat.individualGlobalHitStore,
    Array.from({ length: count }, () => landedRecord(
      defenderEntityId === 0 ? 1 : 0,
      defenderEntityId,
    )),
  );
}

function reserveAllHerbsForTest(
  combat: CombatSandboxSimulationState,
  physickEntityId: number,
): void {
  const herbs = combat.individualGenericHerbStore as unknown as {
    readonly currentByEntity: Uint16Array;
    readonly reservedByEntity: Uint16Array;
  };
  herbs.reservedByEntity[physickEntityId] = herbs.currentByEntity[physickEntityId]!;
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

function scenario(
  units: readonly CombatSandboxUnitScenario[],
  inspectedEntityIds?: readonly number[],
): SimulationScenario {
  return {
    seed: 0x6d,
    entityCount: units.reduce((sum, candidate) => sum + candidate.memberCount, 0),
    bounds: { width: 260, height: 120 },
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

function multiUnit(
  unitId: number,
  factionId: number,
  x: number,
  memberCount: number,
): CombatSandboxUnitScenario {
  return {
    ...unit(unitId, factionId, x),
    memberCount,
    cols: memberCount,
  };
}

function beginAttack(
  simulation: SimulationState,
  sourceEntityId: number,
  targetEntityId: number,
): void {
  const combat = requireCombat(simulation);
  const deltaX = simulation.world.positionsX[targetEntityId]! -
    simulation.world.positionsX[sourceEntityId]!;
  const deltaY = simulation.world.positionsY[targetEntityId]! -
    simulation.world.positionsY[sourceEntityId]!;
  advanceIndividualCombatActions(
    simulation.world,
    combat.identityStore,
    combat.formationStore,
    combat.individualProfileStore,
    [{
      sourceEntityId,
      targetEntityId,
      distanceSquared: deltaX * deltaX + deltaY * deltaY,
      sourceThreatDistance: 12,
      sourcePreferredMinimumDistance: 4,
      targetThreatDistance: 0,
      sourceCanThreatTarget: true,
      targetCanThreatSource: false,
      withinPreferredDistance: true,
      facingEligible: true,
      selectionReason: "nearestValidHostile",
    }],
    combat.individualCombatActionStore,
  );
}

function unit(
  unitId: number,
  factionId: number,
  x: number,
  weaponCategory: "unarmed" | "oneHanded" = "unarmed",
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
    weaponCategory,
    weaponReachBand: weaponCategory === "unarmed" ? "none" : "short",
    armourClass: "none",
    shieldClass: "none",
    attackIntervalTicks: 1,
    maxDamageCapacity: 1_000,
    casualtyProcedure: {
      procedureKind: "citizen",
      deathCountPolicy: { kind: "fixedTicks", durationTicks: 100 },
    },
  };
}

function physick(startingGenericHerbs = 12) {
  return {
    hasChirurgeon: true,
    hasPhysick: true,
    startingGenericHerbs,
  };
}

function chirurgeonOnly() {
  return {
    hasChirurgeon: true,
    hasPhysick: false,
    startingGenericHerbs: 0,
  };
}

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
