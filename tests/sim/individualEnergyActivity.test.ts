import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import {
  INDIVIDUAL_ENERGY_ALERT_STATIONARY_RECOVERY,
  INDIVIDUAL_ENERGY_DOWNED_REST_RECOVERY,
  INDIVIDUAL_ENERGY_JOGGING_COST_PER_TICK,
  INDIVIDUAL_ENERGY_SPRINTING_COST_PER_TICK,
  INDIVIDUAL_ENERGY_VALID_ATTACK_IMPULSE,
  INDIVIDUAL_ENERGY_VALID_DEFENCE_IMPULSE,
  INDIVIDUAL_ENERGY_WALKING_COST_PER_TICK,
  applyIndividualEnergyActivityOneTick,
  beginIndividualEnergyActivityObservation,
  classifyIndividualEnergyActivityOneTick,
  createIndividualEnergyActivityStore,
  deriveIndividualEnergyMovementIntensity,
  deriveIndividualEnergyApplicationRequest,
  getIndividualEnergyActivityInspection,
  observeIndividualEnergyMovementAuthority,
  selectIndividualEnergyActivityContext,
  type IndividualEnergyActivityContextEvidence,
} from "../../src/sim/individualEnergyActivity";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  getIndividualCurrentEnergy,
  getIndividualEnergyHistoryInspection,
} from "../../src/sim/individualEnergy";
import {
  createIndividualExecutionActionBuffers,
  createIndividualExecutionActionStore,
  type IndividualExecutionActionResult,
} from "../../src/sim/individualExecutionAction";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  createIndividualTreatmentActionBuffers,
  createIndividualTreatmentActionStore,
  type IndividualTreatmentActionResult,
} from "../../src/sim/individualTreatmentAction";
import type { WorldState } from "../../src/sim/types";

describe("individual energy activity classification", () => {
  it.each([
    [{}, "safeStationaryRest"],
    [{ alert: true }, "alertStationary"],
    [{ movementOccurred: true, movementIntensity: "walking" }, "walking"],
    [{ movementOccurred: true, movementIntensity: "jogging" }, "jogging"],
    [{ movementOccurred: true, movementIntensity: "sprinting" }, "sprinting"],
    [{ activeDragHelper: true }, "dragging"],
    [{ beingDragged: true }, "beingDragged"],
    [{ movementOccurred: true, medicalApproach: true }, "medicalApproach"],
    [{ treating: true }, "treating"],
    [{ underTreatment: true }, "underTreatment"],
    [{ executionCommitted: true }, "executionCommitment"],
    [{ lifecycle: "dying", presence: "downedPresence" }, "downedRest"],
    [{ presence: "respawnEgress" }, "respawnEgress"],
    [{ presence: "waitingAtRespawn" }, "waitingAtRespawn"],
    [{ lifecycle: "terminal", presence: "terminalAwaitingComfort" }, "inactiveTerminal"],
  ] as const)("selects authoritative context %#", (overrides, expected) => {
    expect(selectIndividualEnergyActivityContext(evidence(overrides)))
      .toBe(expected);
  });

  it("applies deterministic precedence over displacement and alert state", () => {
    const noisy = {
      movementOccurred: true,
      movementIntensity: "sprinting" as const,
      beingDragged: true,
      activeDragHelper: true,
      treating: true,
      underTreatment: true,
      executionCommitted: true,
      medicalApproach: true,
      alert: true,
    };
    expect(selectIndividualEnergyActivityContext(evidence({
      ...noisy,
      lifecycle: "terminal",
      presence: "waitingAtRespawn",
    }))).toBe("waitingAtRespawn");
    expect(selectIndividualEnergyActivityContext(evidence(noisy)))
      .toBe("beingDragged");
    expect(selectIndividualEnergyActivityContext(evidence({
      ...noisy,
      beingDragged: false,
    }))).toBe("dragging");
    expect(selectIndividualEnergyActivityContext(evidence({
      ...noisy,
      beingDragged: false,
      activeDragHelper: false,
    }))).toBe("treating");
  });

  it("derives observation-only ordinary movement intensities from integer displacement", () => {
    expect(deriveIndividualEnergyMovementIntensity(0, 0)).toBe("stationary");
    expect(deriveIndividualEnergyMovementIntensity(1, -1)).toBe("walking");
    expect(deriveIndividualEnergyMovementIntensity(-2, 2)).toBe("jogging");
    expect(deriveIndividualEnergyMovementIntensity(3, 0)).toBe("sprinting");
    expect(() => deriveIndividualEnergyMovementIntensity(0.5, 0)).toThrow(/integer/);
  });

  it("captures exact net displacement once while retaining authoritative movement sources", () => {
    const fixture = createFixture(2);
    beginIndividualEnergyActivityObservation(fixture.activity, fixture.world, 4);
    fixture.world.positionsX[0] = 2;
    observeIndividualEnergyMovementAuthority(
      fixture.activity, fixture.world, "ordinaryMovement",
    );
    fixture.world.positionsX[0] = 5;
    observeIndividualEnergyMovementAuthority(
      fixture.activity, fixture.world, "medicalApproach",
    );
    // A repeated checkpoint observes no second movement authority or distance.
    observeIndividualEnergyMovementAuthority(
      fixture.activity, fixture.world, "medicalApproach",
    );
    fixture.world.positionsY[1] = 2;
    observeIndividualEnergyMovementAuthority(
      fixture.activity, fixture.world, "draggedPatient",
    );

    const returned = classifyIndividualEnergyActivityOneTick(
      fixture.activity,
      dependencies(fixture, 4),
    );
    expect(returned).toBe(fixture.activity);
    expect(getIndividualEnergyActivityInspection(fixture.activity, 0)).toMatchObject({
      dominantContext: "medicalApproach",
      displacementX: 5,
      displacementY: 0,
      actualMovementDistanceSquared: 25,
      movementIntensity: "sprinting",
      movementOccurred: true,
      externallyMoved: false,
      movementAuthorities: ["ordinaryMovement", "medicalApproach"],
    });
    expect(getIndividualEnergyActivityInspection(fixture.activity, 1)).toMatchObject({
      dominantContext: "beingDragged",
      actualMovementDistanceSquared: 4,
      externallyMoved: true,
      movementAuthorities: ["draggedPatient"],
    });
  });

  it("keeps gathering personal and active dragging dominant", () => {
    const fixture = createFixture(2);
    beginIndividualEnergyActivityObservation(fixture.activity, fixture.world, 0);
    fixture.world.positionsX[0] = 1;
    observeIndividualEnergyMovementAuthority(
      fixture.activity, fixture.world, "casualtyGathering",
    );
    fixture.world.positionsX[1] = 1;
    observeIndividualEnergyMovementAuthority(
      fixture.activity, fixture.world, "activeDragHelper",
    );
    classifyIndividualEnergyActivityOneTick(fixture.activity, dependencies(fixture, 0));
    expect(getIndividualEnergyActivityInspection(fixture.activity, 0)).toMatchObject({
      dominantContext: "walking",
      externallyMoved: false,
      movementAuthorities: ["casualtyGathering"],
    });
    expect(getIndividualEnergyActivityInspection(fixture.activity, 1)).toMatchObject({
      dominantContext: "dragging",
      externallyMoved: false,
      movementAuthorities: ["activeDragHelper"],
    });
  });

  it("counts canonical committed attacks and every successful or failed defence attempt", () => {
    const fixture = createFixture(3);
    const attacks = [attack(0, "attempted"), attack(1, "invalidated")];
    const defences = [defence(1, "parried"), defence(1, "landed"),
      defence(1, "shieldBlocked")];
    beginIndividualEnergyActivityObservation(fixture.activity, fixture.world, 8);
    classifyIndividualEnergyActivityOneTick(fixture.activity, {
      ...dependencies(fixture, 8),
      attackAttempts: attacks,
      defenceAttempts: defences,
    });
    expect(getIndividualEnergyActivityInspection(fixture.activity, 0)
      .validAttackAttemptCount).toBe(1);
    // An invalidated canonical record is a previously committed attack. Invalid
    // pre-commitment input emits no attempt record and therefore contributes zero.
    expect(getIndividualEnergyActivityInspection(fixture.activity, 1)).toMatchObject({
      validAttackAttemptCount: 1,
      validDefenceAttemptCount: 3,
    });
    expect(getIndividualEnergyActivityInspection(fixture.activity, 2)).toMatchObject({
      validAttackAttemptCount: 0,
      validDefenceAttemptCount: 0,
    });
  });

  it("classifies current-tick completed treatment records without stale end state", () => {
    const fixture = createFixture(2);
    const completed = {
      actionId: 3,
      kind: "physickRestoreGlobalHit" as const,
      healerEntityId: 0,
      patientEntityId: 1,
      startedTick: 0,
      progressTicks: 600,
      requiredProgressTicks: 600,
      reservedGenericHerbs: 1 as const,
      selectedLimbDisability: "none" as const,
      tick: 600,
      traumaCleared: false,
      clearedLimbDisability: "none" as const,
      consumedGenericHerbs: 1 as const,
    };
    beginIndividualEnergyActivityObservation(fixture.activity, fixture.world, 600);
    classifyIndividualEnergyActivityOneTick(fixture.activity, {
      ...dependencies(fixture, 600),
      treatmentResult: {
        ...emptyTreatmentResult(2),
        completedRecords: [completed],
      },
    });
    expect(getIndividualEnergyActivityInspection(fixture.activity, 0)
      .dominantContext).toBe("treating");
    expect(getIndividualEnergyActivityInspection(fixture.activity, 1)
      .dominantContext).toBe("underTreatment");
  });

  it("is replay- and processing-order independent and reuses caller-owned storage", () => {
    const first = createFixture(3);
    const second = createFixture(3);
    const records = [defence(0, "landed"), defence(2, "parried"),
      defence(0, "bucklerBlocked")];
    for (const fixture of [first, second]) {
      beginIndividualEnergyActivityObservation(fixture.activity, fixture.world, 11);
      fixture.world.positionsX[1] = 2;
    }
    classifyIndividualEnergyActivityOneTick(first.activity, {
      ...dependencies(first, 11), defenceAttempts: records,
    });
    classifyIndividualEnergyActivityOneTick(second.activity, {
      ...dependencies(second, 11), defenceAttempts: records.slice().reverse(),
    });
    const profiles = [first, second].map(() =>
      createTrustedIndividualEnergyProfileStore({
        entityCount: 3,
        profiles: Array.from({ length: 3 }, (_, entityId) => ({
          entityId,
          maximumEnergy: 1_000,
          startingEnergy: 500,
          safeRestRecoveryPerTick: 7,
        })),
      }));
    const energy = profiles.map((profile) => createIndividualEnergyStore(profile));
    applyIndividualEnergyActivityOneTick(first.activity, profiles[0]!, energy[0]!, 11);
    applyIndividualEnergyActivityOneTick(second.activity, profiles[1]!, energy[1]!, 11);
    const inspect = (fixture: Fixture) => Array.from(
      { length: 3 }, (_, entityId) =>
        getIndividualEnergyActivityInspection(fixture.activity, entityId),
    );
    expect(inspect(first)).toEqual(inspect(second));
    expect(Array.from({ length: 3 }, (_, entityId) =>
      getIndividualEnergyHistoryInspection(energy[0]!, entityId)))
      .toEqual(Array.from({ length: 3 }, (_, entityId) =>
        getIndividualEnergyHistoryInspection(energy[1]!, entityId)));
  });
});

describe("individual energy base expenditure and recovery", () => {
  it.each([
    ["walking", INDIVIDUAL_ENERGY_WALKING_COST_PER_TICK],
    ["jogging", INDIVIDUAL_ENERGY_JOGGING_COST_PER_TICK],
    ["sprinting", INDIVIDUAL_ENERGY_SPRINTING_COST_PER_TICK],
  ] as const)("charges %s movement exactly once", (movementIntensity, expected) => {
    expect(deriveIndividualEnergyApplicationRequest({
      dominantContext: movementIntensity,
      movementOccurred: true,
      movementIntensity,
      personalMovementObserved: true,
      beingDragged: false,
      validAttackAttemptCount: 0,
      validDefenceAttemptCount: 0,
      safeRestRecoveryPerTick: 9,
    })).toEqual({
      movementExpenditureRequested: expected,
      attackExpenditureRequested: 0,
      defenceExpenditureRequested: 0,
      totalExpenditureRequested: expected,
      recoveryRequested: 0,
    });
  });

  it.each([
    ["safeStationaryRest", 9],
    ["alertStationary", INDIVIDUAL_ENERGY_ALERT_STATIONARY_RECOVERY],
    ["downedRest", INDIVIDUAL_ENERGY_DOWNED_REST_RECOVERY],
    ["underTreatment", 0],
    ["waitingAtRespawn", 0],
    ["inactiveTerminal", 0],
  ] as const)("derives only accepted %s recovery", (dominantContext, expected) => {
    expect(deriveIndividualEnergyApplicationRequest({
      dominantContext,
      movementOccurred: false,
      movementIntensity: "stationary",
      personalMovementObserved: false,
      beingDragged: false,
      validAttackAttemptCount: 0,
      validDefenceAttemptCount: 0,
      safeRestRecoveryPerTick: 9,
    }).recoveryRequested).toBe(expected);
  });

  it("stacks exact attack and defence impulses and suppresses stationary recovery", () => {
    expect(deriveIndividualEnergyApplicationRequest({
      dominantContext: "safeStationaryRest",
      movementOccurred: false,
      movementIntensity: "stationary",
      personalMovementObserved: false,
      beingDragged: false,
      validAttackAttemptCount: 1,
      validDefenceAttemptCount: 3,
      safeRestRecoveryPerTick: 12,
    })).toEqual({
      movementExpenditureRequested: 0,
      attackExpenditureRequested: INDIVIDUAL_ENERGY_VALID_ATTACK_IMPULSE,
      defenceExpenditureRequested: 3 * INDIVIDUAL_ENERGY_VALID_DEFENCE_IMPULSE,
      totalExpenditureRequested: 230,
      recoveryRequested: 0,
    });
  });

  it("charges no attack impulse when invalid pre-commitment input emitted no record", () => {
    const harness = createEnergyHarness({
      maximumEnergy: 200,
      startingEnergy: 100,
      safeRestRecoveryPerTick: 6,
    });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 0);
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity,
      dependencies(harness.fixture, 0),
    );
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity,
      harness.profiles,
      harness.energy,
      0,
    );
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        validAttackAttemptCount: 0,
        attackExpenditureRequested: 0,
        totalExpenditureRequested: 0,
        recoveryApplied: 6,
      });
  });

  it("rejects overflowing impulse arithmetic before application", () => {
    expect(() => deriveIndividualEnergyApplicationRequest({
      dominantContext: "safeStationaryRest",
      movementOccurred: false,
      movementIntensity: "stationary",
      personalMovementObserved: false,
      beingDragged: false,
      validAttackAttemptCount: Number.MAX_SAFE_INTEGER,
      validDefenceAttemptCount: 0,
      safeRestRecoveryPerTick: 5,
    })).toThrow(/attack expenditure exceeds safe integer storage/);
  });

  it("rejects mismatched profile ownership before mutating energy", () => {
    const harness = createEnergyHarness({ maximumEnergy: 100, startingEnergy: 50 });
    const unrelatedProfiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0, maximumEnergy: 200, startingEnergy: 100 }],
    });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 0);
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity, dependencies(harness.fixture, 0),
    );
    expect(() => applyIndividualEnergyActivityOneTick(
      harness.fixture.activity,
      unrelatedProfiles,
      harness.energy,
      0,
    )).toThrow(/profile store that owns current energy/);
    expect(getIndividualCurrentEnergy(harness.energy, 0)).toBe(50);
  });

  it.each([
    "casualtyGathering",
    "activeDragHelper",
    "medicalApproach",
    "traumaWithdrawal",
    "respawnEgress",
  ] as const)("charges ordinary gait for personal %s movement", (authority) => {
    const harness = createEnergyHarness({ startingEnergy: 100 });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 1);
    harness.fixture.world.positionsX[0] = 1;
    observeIndividualEnergyMovementAuthority(
      harness.fixture.activity,
      harness.fixture.world,
      authority,
    );
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity,
      dependencies(harness.fixture, 1),
    );
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity,
      harness.profiles,
      harness.energy,
      1,
    );
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        movementExpenditureRequested: 1,
        expenditureApplied: 1,
        energyBefore: 100,
        energyAfter: 99,
      });
  });

  it("charges neither a dragged patient nor solely external displacement", () => {
    for (const authority of ["draggedPatient", "externalDisplacement"] as const) {
      const harness = createEnergyHarness({ startingEnergy: 50 });
      beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 2);
      harness.fixture.world.positionsX[0] = 3;
      observeIndividualEnergyMovementAuthority(
        harness.fixture.activity,
        harness.fixture.world,
        authority,
      );
      classifyIndividualEnergyActivityOneTick(
        harness.fixture.activity,
        dependencies(harness.fixture, 2),
      );
      applyIndividualEnergyActivityOneTick(
        harness.fixture.activity,
        harness.profiles,
        harness.energy,
        2,
      );
      expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
        .toMatchObject({
          movementExpenditureRequested: 0,
          expenditureApplied: 0,
          recoveryApplied: 0,
          energyAfter: 50,
        });
    }
  });

  it("does not waive personal movement when external displacement is also observed", () => {
    const harness = createEnergyHarness({ startingEnergy: 50 });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 3);
    harness.fixture.world.positionsX[0] = 1;
    observeIndividualEnergyMovementAuthority(
      harness.fixture.activity, harness.fixture.world, "ordinaryMovement",
    );
    harness.fixture.world.positionsX[0] = 2;
    observeIndividualEnergyMovementAuthority(
      harness.fixture.activity, harness.fixture.world, "externalDisplacement",
    );
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity, dependencies(harness.fixture, 3),
    );
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 3,
    );
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        movementIntensity: "jogging",
        externallyMoved: true,
        movementExpenditureRequested: 8,
        expenditureApplied: 8,
      });
  });

  it("uses net displacement once even when two personal authorities observe it", () => {
    const harness = createEnergyHarness({ startingEnergy: 50 });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 4);
    harness.fixture.world.positionsX[0] = 1;
    observeIndividualEnergyMovementAuthority(
      harness.fixture.activity, harness.fixture.world, "ordinaryMovement",
    );
    harness.fixture.world.positionsX[0] = 2;
    observeIndividualEnergyMovementAuthority(
      harness.fixture.activity, harness.fixture.world, "medicalApproach",
    );
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity, dependencies(harness.fixture, 4),
    );
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 4,
    );
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        actualMovementDistanceSquared: 4,
        movementExpenditureRequested: 8,
        totalExpenditureRequested: 8,
      });
  });

  it("uses trusted safe recovery and reports maximum clamping", () => {
    const harness = createEnergyHarness({
      maximumEnergy: 100,
      startingEnergy: 97,
      safeRestRecoveryPerTick: 7,
    });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 5);
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity, dependencies(harness.fixture, 5),
    );
    const returned = applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 5,
    );
    expect(returned).toBe(harness.fixture.activity);
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        recoveryRequested: 7,
        recoveryApplied: 3,
        energyBefore: 97,
        energyAfter: 100,
        recoveryClamped: true,
        expenditureClamped: false,
      });
  });

  it("applies exactly four recovery to an authoritative downed-rest patient", () => {
    const harness = createEnergyHarness({ maximumEnergy: 100, startingEnergy: 50 });
    const procedures = createIndividualCasualtyProcedureProfileStore({
      entityCount: 1,
      profiles: [{
        entityId: 0,
        procedureKind: "citizen",
        deathCountPolicy: { kind: "normalFortitude" },
      }],
    });
    applyIndividualZeroHitLifecycleTransitions(
      harness.fixture.lifecycle,
      harness.fixture.presence,
      procedures,
      harness.fixture.world,
      [{ entityId: 0, attackerEntityId: 0, previousHits: 1 }],
      5,
    );
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 6);
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity, dependencies(harness.fixture, 6),
    );
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 6,
    );
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        dominantContext: "downedRest",
        recoveryRequested: 4,
        recoveryApplied: 4,
        energyBefore: 50,
        energyAfter: 54,
      });
  });

  it("applies alert recovery exactly and resets current-tick fields on reuse", () => {
    const harness = createEnergyHarness({ startingEnergy: 500 });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 6);
    classifyIndividualEnergyActivityOneTick(harness.fixture.activity, {
      ...dependencies(harness.fixture, 6),
      attackAttempts: [attack(0, "invalidated")],
    });
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 6,
    );
    expect(getIndividualCurrentEnergy(harness.energy, 0)).toBe(420);

    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 7);
    classifyIndividualEnergyActivityOneTick(harness.fixture.activity, {
      ...dependencies(harness.fixture, 7),
      isAlert: () => true,
    });
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 7,
    );
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        dominantContext: "alertStationary",
        attackExpenditureRequested: 0,
        totalExpenditureRequested: 0,
        recoveryRequested: 2,
        recoveryApplied: 2,
        energyBefore: 420,
        energyAfter: 422,
        lastStrenuousTick: 6,
        applicationTick: 7,
      });
  });

  it("clamps expenditure at zero and updates last strenuous tick even at zero", () => {
    const harness = createEnergyHarness({ maximumEnergy: 100, startingEnergy: 0 });
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 8);
    classifyIndividualEnergyActivityOneTick(harness.fixture.activity, {
      ...dependencies(harness.fixture, 8),
      defenceAttempts: [defence(0, "landed"), defence(0, "parried")],
    });
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 8,
    );
    expect(getIndividualEnergyActivityInspection(harness.fixture.activity, 0))
      .toMatchObject({
        defenceExpenditureRequested: 100,
        expenditureApplied: 0,
        energyBefore: 0,
        energyAfter: 0,
        lastStrenuousTick: 8,
        expenditureClamped: true,
      });
  });

  it("updates minimum, threshold and cumulative bounded history through canonical APIs", () => {
    const harness = createEnergyHarness({
      maximumEnergy: 100,
      startingEnergy: 70,
      safeRestRecoveryPerTick: 10,
    });
    for (const tick of [9, 10]) {
      beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, tick);
      harness.fixture.world.positionsX[0] =
        harness.fixture.world.positionsX[0]! + 3;
      observeIndividualEnergyMovementAuthority(
        harness.fixture.activity, harness.fixture.world, "ordinaryMovement",
      );
      classifyIndividualEnergyActivityOneTick(
        harness.fixture.activity, dependencies(harness.fixture, tick),
      );
      applyIndividualEnergyActivityOneTick(
        harness.fixture.activity, harness.profiles, harness.energy, tick,
      );
    }
    beginIndividualEnergyActivityObservation(harness.fixture.activity, harness.fixture.world, 11);
    classifyIndividualEnergyActivityOneTick(
      harness.fixture.activity, dependencies(harness.fixture, 11),
    );
    applyIndividualEnergyActivityOneTick(
      harness.fixture.activity, harness.profiles, harness.energy, 11,
    );
    expect(getIndividualEnergyHistoryInspection(harness.energy, 0)).toEqual({
      startingEnergy: 70,
      minimumEnergyReached: 0,
      firstWindedTick: 10,
      firstSpentTick: 10,
      totalEnergySpent: 70,
      totalEnergyRecovered: 10,
    });
  });
});

function evidence(
  overrides: Partial<IndividualEnergyActivityContextEvidence>,
): IndividualEnergyActivityContextEvidence {
  return {
    lifecycle: "active",
    presence: "activePresence",
    movementOccurred: false,
    movementIntensity: "stationary",
    beingDragged: false,
    activeDragHelper: false,
    treating: false,
    underTreatment: false,
    executionCommitted: false,
    medicalApproach: false,
    alert: false,
    ...overrides,
  };
}

interface Fixture {
  readonly world: WorldState;
  readonly activity: ReturnType<typeof createIndividualEnergyActivityStore>;
  readonly lifecycle: ReturnType<typeof createIndividualCasualtyLifecycleStore>;
  readonly presence: ReturnType<typeof createIndividualPlayerPresenceStore>;
  readonly treatments: ReturnType<typeof createIndividualTreatmentActionStore>;
  readonly executions: ReturnType<typeof createIndividualExecutionActionStore>;
}

function createFixture(entityCount: number): Fixture {
  return {
    world: {
      entityCount,
      bounds: { width: 1_000, height: 1_000 },
      ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
      positionsX: new Int32Array(entityCount),
      positionsY: new Int32Array(entityCount),
      velocitiesX: new Int32Array(entityCount),
      velocitiesY: new Int32Array(entityCount),
    },
    activity: createIndividualEnergyActivityStore(entityCount),
    lifecycle: createIndividualCasualtyLifecycleStore(entityCount),
    presence: createIndividualPlayerPresenceStore(entityCount),
    treatments: createIndividualTreatmentActionStore(entityCount),
    executions: createIndividualExecutionActionStore(entityCount),
  };
}

function createEnergyHarness(values: {
  readonly maximumEnergy?: number;
  readonly startingEnergy: number;
  readonly safeRestRecoveryPerTick?: number;
}) {
  const fixture = createFixture(1);
  const profiles = createTrustedIndividualEnergyProfileStore({
    entityCount: 1,
    profiles: [{ entityId: 0, ...values }],
  });
  return {
    fixture,
    profiles,
    energy: createIndividualEnergyStore(profiles),
  };
}

function dependencies(fixture: Fixture, tick: number) {
  return {
    world: fixture.world,
    lifecycle: fixture.lifecycle,
    presence: fixture.presence,
    treatments: fixture.treatments,
    treatmentResult: emptyTreatmentResult(fixture.world.entityCount),
    executions: fixture.executions,
    executionResult: emptyExecutionResult(),
    attackAttempts: [] as readonly IndividualMeleeAttackAttemptRecord[],
    defenceAttempts: [] as readonly IndividualMeleeDefenceRecord[],
    isAlert: () => false,
    tick,
  };
}

function emptyTreatmentResult(entityCount: number): IndividualTreatmentActionResult {
  void entityCount;
  const buffers = createIndividualTreatmentActionBuffers();
  return {
    startedRecords: buffers.startedRecords,
    interruptedRecords: buffers.interruptedRecords,
    completedRecords: buffers.completedRecords,
    reassessmentRequests: buffers.reassessmentRequests,
    activeActionCount: 0,
    progressedActionCount: 0,
  };
}

function emptyExecutionResult(): IndividualExecutionActionResult {
  const buffers = createIndividualExecutionActionBuffers();
  return {
    startedRecords: buffers.startedRecords,
    interruptedRecords: buffers.interruptedRecords,
    completedRecords: buffers.completedRecords,
    rejectedIntentRecords: buffers.rejectedIntentRecords,
    terminalTransitions: buffers.terminalTransitions,
    activeActionCount: 0,
    pendingIntentCount: 0,
    progressedActionCount: 0,
  };
}

function attack(
  attackerEntityId: number,
  outcome: "attempted" | "invalidated",
): IndividualMeleeAttackAttemptRecord {
  return { attackerEntityId, targetEntityId: 2, outcome } as unknown as
    IndividualMeleeAttackAttemptRecord;
}

function defence(
  defenderEntityId: number,
  outcome: "parried" | "bucklerBlocked" | "shieldBlocked" | "landed",
): IndividualMeleeDefenceRecord {
  return { attackerEntityId: 2, defenderEntityId, outcome } as unknown as
    IndividualMeleeDefenceRecord;
}
