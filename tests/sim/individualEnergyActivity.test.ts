import { describe, expect, it } from "vitest";

import { createIndividualCasualtyLifecycleStore } from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualPlayerPresenceStore } from "../../src/sim/individualCasualtyLifecycle";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import {
  beginIndividualEnergyActivityObservation,
  classifyIndividualEnergyActivityOneTick,
  createIndividualEnergyActivityStore,
  deriveIndividualEnergyMovementIntensity,
  getIndividualEnergyActivityInspection,
  observeIndividualEnergyMovementAuthority,
  selectIndividualEnergyActivityContext,
  type IndividualEnergyActivityContextEvidence,
} from "../../src/sim/individualEnergyActivity";
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
    const inspect = (fixture: Fixture) => Array.from(
      { length: 3 }, (_, entityId) =>
        getIndividualEnergyActivityInspection(fixture.activity, entityId),
    );
    expect(inspect(first)).toEqual(inspect(second));
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
