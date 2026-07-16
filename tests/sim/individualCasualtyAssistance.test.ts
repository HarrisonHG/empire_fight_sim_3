import { describe, expect, it } from "vitest";

import {
  createCasualtyAssistanceDecisionBuffers,
  createCasualtyDragMovementBuffers,
  createIndividualDragHandCommitmentStore,
  advanceCasualtyDragGroupsBeforeCombat,
  cancelCasualtyDragGroupsFromPostCombatEvidence,
  refreshCasualtyDragMovementFinalPhaseCounts,
  decideIndividualCasualtyAssistance,
  getActiveCasualtyDragGroups,
  getIndividualCasualtyAssistanceInspection,
  isIndividualDragEligiblePatient,
  queryDragEligibleAlliedPatientsWithinRadiusInto,
} from "../../src/sim/individualCasualtyAssistance";
import { applyIndividualZeroHitLifecycleTransitions } from "../../src/sim/individualCasualtyLifecycle";
import {
  advanceIndividualDeathCountsOneTick,
  initializeIndividualDeathCountsFromZeroHitTransitions,
} from "../../src/sim/individualDeathCount";
import { advanceIndividualCombatActions } from "../../src/sim/individualCombatAction";
import { applyIndividualLandedHits } from "../../src/sim/individualGlobalHits";
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
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import type {
  CombatSandboxSimulationState,
  CombatSandboxUnitScenario,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";

describe("individual casualty assistance and sparse drag groups", () => {
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
      hands, 5, buffers);
    expect([simulation.world.positionsX[0], simulation.world.positionsX[1]]).toEqual([startPatientX, startHelperX]);
    expect(hands.getFreeHands(1)).toBe(2);

    let tick = 6;
    while (getActiveCasualtyDragGroups(combat.casualtyDragGroupStore)[0]!.phase === "gathering") {
      const patientBefore = simulation.world.positionsX[0]!;
      const result = advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
        combat.formationStore, combat.individualCasualtyLifecycleStore,
        combat.individualTraumaticWoundStore, combat.moraleMovementStates,
        combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
        hands, tick, buffers);
      expect(simulation.world.positionsX[0]).toBe(patientBefore);
      if (result.draggingGroupCount === 1) expect(result.movedParticipantCount).toBeLessThanOrEqual(1);
      tick += 1;
    }
    const transitionPatientX = simulation.world.positionsX[0]!;
    advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
      combat.formationStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      hands, tick - 1, buffers);
    expect(simulation.world.positionsX[0]).toBe(transitionPatientX);
    expect(hands.getFreeHands(1)).toBe(0);
    const reached = advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore,
      combat.formationStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore,
      hands, tick, buffers);
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
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 4, buffers);
    const before = [simulation.world.positionsX[0]!, simulation.world.positionsX[1]!];
    advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore, combat.formationStore,
      combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore, combat.moraleMovementStates,
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 5, buffers);
    expect(simulation.world.positionsX[0]! - before[0]!).toBe(simulation.world.positionsX[1]! - before[1]!);

    const cancellations: typeof buffers.cancellationRecords = [];
    cancelCasualtyDragGroupsFromPostCombatEvidence(combat.identityStore,
      combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore,
      combat.moraleMovementStates, combat.individualCasualtyAssistanceStore,
      combat.casualtyDragGroupStore, hands, [{ attackerEntityId: 2, targetEntityId: 1,
        currentTick: 5, outcome: "accepted", reason: "accepted", previousNextAllowedTick: null,
        resultingNextAllowedTick: 25, cooldownTicksRemaining: 20 }], 5, cancellations);
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
        combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 3, buffers);
      expect([group.destinationX, group.destinationY]).toEqual(candidate.effective);
      expect(getIndividualCasualtyAssistanceInspection(combat.individualCasualtyAssistanceStore, 0))
        .toMatchObject({ destinationX: candidate.effective[0], destinationY: candidate.effective[1] });
      const reached = advanceCasualtyDragGroupsBeforeCombat(simulation.world, combat.identityStore, combat.formationStore,
        combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore, combat.moraleMovementStates,
        combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 4, buffers);
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
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, 4, buffers);
    expect([hands.getFreeHands(1), hands.getFreeHands(2)]).toEqual([1, 1]);
    const cancellations: typeof buffers.cancellationRecords = [];
    cancelCasualtyDragGroupsFromPostCombatEvidence(combat.identityStore, combat.individualCasualtyLifecycleStore,
      combat.individualTraumaticWoundStore, new Map([[1, "routing" as const], [2, "steady" as const]]),
      combat.individualCasualtyAssistanceStore, combat.casualtyDragGroupStore, hands, [], 4, cancellations);
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

  it("does not count attacking or treating Physicks as rescue support", () => {
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
    options,
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

function requireCombat(simulation: SimulationState): CombatSandboxSimulationState {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}
