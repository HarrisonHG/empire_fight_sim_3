import { describe, expect, it } from "vitest";

import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualCombatProfileStore,
  type IndividualArmourCategory,
  type IndividualCombatProfileConfig,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import {
  INDIVIDUAL_ENERGY_ACTIVE_DRAG_HELPER_SURCHARGE,
  applyIndividualEnergyActivityOneTick,
  beginIndividualEnergyActivityObservation,
  calculateIndividualEnergyExertionAdjustedValue,
  classifyIndividualEnergyActivityOneTick,
  createIndividualEnergyActivityStore,
  getIndividualEnergyActivityInspection,
  getIndividualEnergyExpenditureInspection,
  observeIndividualEnergyMovementAuthority,
  type IndividualEnergyMovementAuthority,
  type IndividualPhysicalGait,
} from "../../src/sim/individualEnergyActivity";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  getIndividualCurrentEnergy,
  getIndividualEnergyHistoryInspection,
} from "../../src/sim/individualEnergy";
import {
  createIndividualEnergyExertionModifierStore,
  projectIndividualEnergyExertionModifiersOneTick,
} from "../../src/sim/individualEnergyExertionModifier";
import {
  applyIndividualLandedHits,
  createIndividualGlobalHitStore,
} from "../../src/sim/individualGlobalHits";
import {
  createIndividualExecutionActionBuffers,
  createIndividualExecutionActionStore,
} from "../../src/sim/individualExecutionAction";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  createIndividualTreatmentActionBuffers,
  createIndividualTreatmentActionStore,
} from "../../src/sim/individualTreatmentAction";
import type { WorldState } from "../../src/sim/types";

describe("7E-2 exertion expenditure composition", () => {
  it("uses exact burden-free, fully burdened, injury and single-ceiling values", () => {
    expect(calculateIndividualEnergyExertionAdjustedValue(8, 100, 100, "test"))
      .toBe(8);
    expect(calculateIndividualEnergyExertionAdjustedValue(8, 180, 100, "test"))
      .toBe(15);
    expect(calculateIndividualEnergyExertionAdjustedValue(8, 100, 150, "test"))
      .toBe(12);
    expect(calculateIndividualEnergyExertionAdjustedValue(1, 110, 110, "test"))
      .toBe(2);
  });

  it.each([
    ["jogging", 8, 9, 13],
    ["sprinting", 40, 44, 64],
  ] as const)(
    "makes equal %s work cost more in heavy kit than light kit",
    (gait, base, lightCost, heavyCost) => {
      const harness = createHarness([
        { armourCategory: "light", primaryWeapon: "unarmed" },
        { armourCategory: "heavy", primaryWeapon: "greatWeapon" },
      ]);
      beginAndMove(harness, 0, gait, "ordinaryMovement", [0, 1]);
      project(harness, 0);
      classify(harness, 0);
      apply(harness, 0);
      expect(inspect(harness, 0)).toMatchObject({
        movementBaseExpenditure: base,
        burdenExertionMultiplierPercent: 110,
        injuryExertionMultiplierPercent: 100,
        movementExpenditureRequested: lightCost,
      });
      expect(inspect(harness, 1)).toMatchObject({
        movementBaseExpenditure: base,
        burdenExertionMultiplierPercent: 160,
        injuryExertionMultiplierPercent: 100,
        movementExpenditureRequested: heavyCost,
      });
    },
  );

  it("keeps walking available and charges at least its accepted base", () => {
    const harness = createHarness([{
      armourCategory: "heavy", primaryWeapon: "greatWeapon",
    }]);
    damage(harness, 0);
    beginAndMove(harness, 0, "walking", "ordinaryMovement", [0]);
    project(harness, 0);
    classify(harness, 0);
    apply(harness, 0);
    expect(inspect(harness, 0)).toMatchObject({
      actualPhysicalGait: "walking",
      movementBaseExpenditure: 1,
      movementExpenditureRequested: 2,
    });
  });

  it.each([
    "casualtyGathering",
    "medicalApproach",
    "traumaWithdrawal",
    "respawnEgress",
  ] as const)("charges modified actual gait and no named surcharge for %s", (source) => {
    const harness = createHarness([{ armourCategory: "light" }]);
    beginAndMove(harness, 0, "walking", source, [0]);
    project(harness, 0);
    classify(harness, 0);
    apply(harness, 0);
    expect(inspect(harness, 0)).toMatchObject({
      physicalGaitSource: source,
      movementBaseExpenditure: 1,
      dragSurcharge: 0,
      movementExpenditureRequested: 2,
    });
  });

  it("charges a moving drag helper gait plus 12 before modifiers", () => {
    const harness = createHarness([{ armourCategory: "light" }]);
    damage(harness, 0);
    beginAndMove(harness, 0, "walking", "activeDragHelper", [0]);
    project(harness, 0);
    classify(harness, 0);
    apply(harness, 0);
    expect(INDIVIDUAL_ENERGY_ACTIVE_DRAG_HELPER_SURCHARGE).toBe(12);
    expect(inspect(harness, 0)).toMatchObject({
      movementBaseExpenditure: 1,
      dragSurcharge: 12,
      burdenExertionMultiplierPercent: 110,
      injuryExertionMultiplierPercent: 110,
      movementExpenditureRequested: 16,
      totalExpenditureRequested: 16,
      expenditureApplied: 16,
    });
  });

  it("keeps stationary helpers and externally moved patients free", () => {
    const harness = createHarness([{}, {}]);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 0);
    observeIndividualEnergyMovementAuthority(
      harness.activity, harness.world,
      () => ({ source: "activeDragHelper", requestedGait: "walking" }),
    );
    harness.world.positionsX[1] = 1;
    observeIndividualEnergyMovementAuthority(
      harness.activity, harness.world,
      (entityId) => entityId === 1
        ? { source: "draggedPatient", requestedGait: "stationary" }
        : undefined,
    );
    project(harness, 0);
    classify(harness, 0);
    apply(harness, 0);
    expect(inspect(harness, 0)).toMatchObject({
      dragSurcharge: 0,
      movementExpenditureRequested: 0,
    });
    expect(inspect(harness, 1)).toMatchObject({
      externallyMoved: true,
      movementExpenditureRequested: 0,
      totalExpenditureRequested: 0,
    });
  });

  it("charges one or two moving helpers independently once and never the patient", () => {
    for (const helperCount of [1, 2]) {
      const harness = createHarness(Array.from({ length: helperCount + 1 }, () => ({})));
      const helperIds = Array.from({ length: helperCount }, (_, id) => id);
      const patientId = helperCount;
      beginIndividualEnergyActivityObservation(harness.activity, harness.world, 0);
      for (const id of helperIds) harness.world.positionsX[id] = 1;
      observeIndividualEnergyMovementAuthority(
        harness.activity, harness.world,
        (entityId) => helperIds.includes(entityId)
          ? { source: "activeDragHelper", requestedGait: "walking" }
          : undefined,
      );
      harness.world.positionsX[patientId] = 1;
      observeIndividualEnergyMovementAuthority(
        harness.activity, harness.world,
        (entityId) => entityId === patientId
          ? { source: "draggedPatient", requestedGait: "stationary" }
          : undefined,
      );
      project(harness, 0);
      classify(harness, 0);
      apply(harness, 0);
      expect(helperIds.map((id) => inspect(harness, id).movementExpenditureRequested))
        .toEqual(new Array(helperCount).fill(13));
      expect(inspect(harness, patientId).movementExpenditureRequested).toBe(0);
    }
  });

  it("applies injury only to canonical attack and defence record-count bases", () => {
    const harness = createHarness([
      { armourCategory: "none" },
      { armourCategory: "heavy", primaryWeapon: "greatWeapon" },
    ]);
    damage(harness, 0);
    damage(harness, 1);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 0);
    project(harness, 0);
    classify(harness, 0, {
      attacks: [attack(0), attack(1)],
      defences: [defence(0), defence(1)],
    });
    apply(harness, 0);
    for (const entityId of [0, 1]) {
      expect(inspect(harness, entityId)).toMatchObject({
        attackBaseExpenditure: 80,
        attackExpenditureRequested: 88,
        defenceBaseExpenditure: 50,
        defenceExpenditureRequested: 55,
        injuryExertionMultiplierPercent: 110,
        totalExpenditureRequested: 143,
      });
    }
    expect(inspect(harness, 0).burdenExertionMultiplierPercent).toBe(100);
    expect(inspect(harness, 1).burdenExertionMultiplierPercent).toBe(160);
  });

  it("defers current-tick damage until the following projection", () => {
    const harness = createHarness([{}]);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 0);
    project(harness, 0);
    damage(harness, 0);
    classify(harness, 0, { attacks: [attack(0)] });
    apply(harness, 0);
    expect(inspect(harness, 0).attackExpenditureRequested).toBe(80);

    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 1);
    project(harness, 1);
    classify(harness, 1, { attacks: [attack(0)] });
    apply(harness, 1);
    expect(inspect(harness, 0).attackExpenditureRequested).toBe(88);
  });

  it("preserves legacy low-level values when the modifier input is omitted", () => {
    const harness = createHarness([{}]);
    beginAndMove(harness, 0, "walking", "activeDragHelper", [0]);
    classify(harness, 0, {
      attacks: [attack(0)], defences: [defence(0)],
    });
    applyIndividualEnergyActivityOneTick(
      harness.activity, harness.energyProfiles, harness.energy, 0,
    );
    expect(inspect(harness, 0)).toMatchObject({
      movementBaseExpenditure: 1,
      dragSurcharge: 0,
      movementExpenditureRequested: 1,
      attackExpenditureRequested: 80,
      defenceExpenditureRequested: 50,
      totalExpenditureRequested: 131,
      exertionModifierProjectionTickUsed: null,
    });
  });

  it.each(["null", "forged", "unprojected", "stale", "future"] as const)(
    "rejects %s modifier input before energy or diagnostics mutate",
    (kind) => {
      const harness = createHarness([{}]);
      beginAndMove(harness, 5, "walking", "ordinaryMovement", [0]);
      if (kind !== "unprojected" && kind !== "forged" && kind !== "null") {
        project(harness, kind === "stale" ? 4 : 6);
      }
      classify(harness, 5);
      const beforeActivity = inspect(harness, 0);
      const beforeEnergy = getIndividualCurrentEnergy(harness.energy, 0);
      const beforeHistory = getIndividualEnergyHistoryInspection(harness.energy, 0);
      const input = kind === "null"
        ? null
        : kind === "forged"
          ? { modifiers: { entityCount: 1 }, tick: 5 }
          : {
              modifiers: harness.modifiers,
              tick: kind === "stale" ? 4 : kind === "future" ? 6 : 5,
            };
      expect(() => applyIndividualEnergyActivityOneTick(
        harness.activity,
        harness.energyProfiles,
        harness.energy,
        5,
        input as Parameters<typeof applyIndividualEnergyActivityOneTick>[4],
      )).toThrow();
      expect(getIndividualCurrentEnergy(harness.energy, 0)).toBe(beforeEnergy);
      expect(getIndividualEnergyHistoryInspection(harness.energy, 0))
        .toEqual(beforeHistory);
      expect(inspect(harness, 0)).toEqual(beforeActivity);
    },
  );
});

interface ProfileOverride {
  readonly armourCategory?: IndividualArmourCategory;
  readonly primaryWeapon?: IndividualWeaponCategory;
}

function createHarness(overrides: readonly ProfileOverride[]) {
  const entityCount = overrides.length;
  const world: WorldState = {
    entityCount,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from({ length: entityCount }, (_, id) => id),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const combatProfiles = createIndividualCombatProfileStore({
    entityCount,
    profiles: overrides.map(combatProfile),
  });
  const energyProfiles = createTrustedIndividualEnergyProfileStore({
    entityCount,
    profiles: overrides.map((_, entityId) => ({
      entityId, maximumEnergy: 10_000, startingEnergy: 10_000,
    })),
  });
  return {
    world,
    activity: createIndividualEnergyActivityStore(entityCount),
    lifecycle: createIndividualCasualtyLifecycleStore(entityCount),
    presence: createIndividualPlayerPresenceStore(entityCount),
    treatments: createIndividualTreatmentActionStore(entityCount),
    executions: createIndividualExecutionActionStore(entityCount),
    combatProfiles,
    hits: createIndividualGlobalHitStore(combatProfiles, { entityCount }),
    energyProfiles,
    energy: createIndividualEnergyStore(energyProfiles),
    modifiers: createIndividualEnergyExertionModifierStore(entityCount),
  };
}

function combatProfile(
  override: ProfileOverride,
  entityId: number,
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon: override.primaryWeapon ?? "unarmed",
    shieldCategory: "none",
    shieldCarriedState: "none",
    armourCategory: override.armourCategory ?? "none",
    hasQualifyingHelmet: false,
    qualifications: {
      hasWeaponMaster: true, hasShield: true, hasMarksman: true,
      hasThrown: true, hasAmbidexterity: true, enduranceLevels: 0,
      fortitudeLevels: 0, hasDreadnought: false,
    },
    magicalCapabilities: {
      canUseRod: true, canUseStaff: true, canWearMageArmour: true,
      canDeliverCombatMagic: true,
    },
  };
}

function beginAndMove(
  harness: ReturnType<typeof createHarness>,
  tick: number,
  gait: IndividualPhysicalGait,
  source: IndividualEnergyMovementAuthority,
  entityIds: readonly number[],
): void {
  beginIndividualEnergyActivityObservation(harness.activity, harness.world, tick);
  for (const entityId of entityIds) harness.world.positionsX[entityId]! += 1;
  observeIndividualEnergyMovementAuthority(
    harness.activity,
    harness.world,
    (entityId) => entityIds.includes(entityId)
      ? { source, requestedGait: gait }
      : undefined,
  );
}

function project(harness: ReturnType<typeof createHarness>, tick: number): void {
  projectIndividualEnergyExertionModifiersOneTick(
    harness.modifiers, harness.combatProfiles, harness.hits, tick,
  );
}

function classify(
  harness: ReturnType<typeof createHarness>,
  tick: number,
  evidence: {
    attacks?: readonly IndividualMeleeAttackAttemptRecord[];
    defences?: readonly IndividualMeleeDefenceRecord[];
  } = {},
): void {
  classifyIndividualEnergyActivityOneTick(harness.activity, {
    world: harness.world,
    lifecycle: harness.lifecycle,
    presence: harness.presence,
    treatments: harness.treatments,
    treatmentResult: emptyTreatmentResult(),
    executions: harness.executions,
    executionResult: emptyExecutionResult(),
    attackAttempts: evidence.attacks ?? [],
    defenceAttempts: evidence.defences ?? [],
    isAlert: () => false,
    tick,
  });
}

function emptyTreatmentResult() {
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

function emptyExecutionResult() {
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

function apply(harness: ReturnType<typeof createHarness>, tick: number): void {
  applyIndividualEnergyActivityOneTick(
    harness.activity,
    harness.energyProfiles,
    harness.energy,
    tick,
    { modifiers: harness.modifiers, tick },
  );
}

function inspect(harness: ReturnType<typeof createHarness>, entityId: number) {
  return {
    ...getIndividualEnergyActivityInspection(harness.activity, entityId),
    ...getIndividualEnergyExpenditureInspection(harness.activity, entityId),
  };
}

function damage(harness: ReturnType<typeof createHarness>, entityId: number): void {
  applyIndividualLandedHits(harness.hits, [landed(entityId)]);
}

function landed(defenderEntityId: number): IndividualMeleeDefenceRecord {
  return {
    attackerEntityId: defenderEntityId,
    defenderEntityId,
    attackerWeaponCategory: "unarmed",
    outcome: "landed",
    awkwardDistance: false,
    availableDefenceType: "none",
    landedReason: "noActiveDefence",
  } as IndividualMeleeDefenceRecord;
}

function attack(attackerEntityId: number): IndividualMeleeAttackAttemptRecord {
  return { attackerEntityId, outcome: "attempted" } as IndividualMeleeAttackAttemptRecord;
}

function defence(defenderEntityId: number): IndividualMeleeDefenceRecord {
  return landed(defenderEntityId);
}
