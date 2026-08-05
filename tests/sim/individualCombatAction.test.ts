import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitAnchor,
  getUnitHeading,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import {
  advanceIndividualCombatActions,
  calculateIndividualAttackRecoveryTicks,
  createIndividualCombatActionStore,
  getActiveMeleeWeaponCategory,
  getAttackCommitmentTicksRemaining,
  getAttackRecoveryTicksRemaining,
  getIndividualAttackRecoveryInspection,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
  getLockedAttackTargetEntityId,
  INDIVIDUAL_COMBAT_ACTION_TIMING,
  type IndividualCombatActionStateEvent,
  type IndividualCombatActionStore,
  type IndividualMeleeAttackAttemptRecord,
} from "../../src/sim/individualCombatAction";
import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  spendIndividualEnergy,
} from "../../src/sim/individualEnergy";
import {
  createIndividualEnergyCapabilityStore,
  projectIndividualEnergyCapabilitiesOneTick,
  type IndividualCombatEnergyCapabilityInput,
} from "../../src/sim/individualEnergyCapability";
import {
  createIndividualCombatProfileStore,
  type IndividualAttackMode,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  advanceIndividualMeleeTargetSelection,
  createIndividualMeleeTargetSelectionStore,
  getSelectedTargetEntityId,
  type IndividualSelectedTargetRecord,
} from "../../src/sim/individualMeleeTargetSelection";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("individual combat action lifecycle", () => {
  it("commits ready entities to valid selected targets and locks the target", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    const selectedRecords = selectSourceRecords(harness, [0]);

    const result = advanceActions(harness, selectedRecords);

    expect(result.attackAttempts).toEqual([]);
    expect(result.actionStateEvents).toEqual([
      {
        entityId: 0,
        previousState: "ready",
        actionState: "committingAttack",
      },
    ]);
    expect(getIndividualCombatActionState(harness.actions, 0)).toBe(
      "committingAttack",
    );
    expect(getLockedAttackTargetEntityId(harness.actions, 0)).toBe(1);
    expect(getActiveMeleeWeaponCategory(harness.actions, 0)).toBe("oneHanded");
    expect(getAttackCommitmentTicksRemaining(harness.actions, 0)).toBe(
      INDIVIDUAL_COMBAT_ACTION_TIMING.oneHanded.commitmentTicks,
    );
    expect(getIndividualCombatFacing(harness.actions, 0)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("does not redirect a locked attack when later target selection changes", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
      entity(106, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);

    for (
      let tick = 0;
      tick < INDIVIDUAL_COMBAT_ACTION_TIMING.oneHanded.commitmentTicks;
      tick += 1
    ) {
      advanceActions(harness, [selectedRecord(0, 2)]);
      expect(getLockedAttackTargetEntityId(harness.actions, 0)).not.toBe(2);
    }

    expect(harness.lastAttempts).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        targetEntityId: 1,
        outcome: "attempted",
      }),
    ]);
  });

  it("keeps faster weapons ahead of polearms and pikes", () => {
    expect(ticksUntilAttempt("dagger")).toBeLessThan(
      ticksUntilAttempt("polearm"),
    );
    expect(ticksUntilAttempt("oneHanded")).toBeLessThan(
      ticksUntilAttempt("pike"),
    );
  });

  it("does not begin a second attack during commitment or recovery", () => {
    const harness = createHarness([
      entity(100, 100, 1, "dagger", 1),
      entity(106, 100, 2, "oneHanded", -1),
      entity(104, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);
    advanceActions(harness, [selectedRecord(0, 2)]);
    expect(getLockedAttackTargetEntityId(harness.actions, 0)).toBe(1);

    advanceActions(harness, [selectedRecord(0, 2)]);
    expect(harness.lastAttempts).toHaveLength(1);
    expect(getIndividualCombatActionState(harness.actions, 0)).toBe(
      "recoveringAttack",
    );
    expect(getLockedAttackTargetEntityId(harness.actions, 0)).toBe(-1);

    advanceActions(harness, [selectedRecord(0, 2)]);
    expect(getIndividualCombatActionState(harness.actions, 0)).toBe(
      "recoveringAttack",
    );
    expect(harness.lastAttempts).toHaveLength(0);

    advanceActions(harness, [selectedRecord(0, 2)]);
    expect(getIndividualCombatActionState(harness.actions, 0)).toBe("ready");
    expect(getLockedAttackTargetEntityId(harness.actions, 0)).toBe(-1);

    advanceActions(harness, [selectedRecord(0, 2)]);
    expect(getIndividualCombatActionState(harness.actions, 0)).toBe(
      "committingAttack",
    );
    expect(getLockedAttackTargetEntityId(harness.actions, 0)).toBe(2);
  });

  it("emits exactly one completed attack attempt when commitment finishes", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    const attempts: IndividualMeleeAttackAttemptRecord[] = [];
    advanceActions(harness, [selectedRecord(0, 1)]);

    for (let tick = 0; tick < 8; tick += 1) {
      advanceActions(harness, [selectedRecord(0, 1)]);
      attempts.push(...harness.lastAttempts);
    }

    expect(attempts).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        targetEntityId: 1,
        outcome: "attempted",
      }),
    ]);
  });

  it.each([
    {
      name: "out-of-range",
      mutate: (harness: ActionHarness) => {
        harness.world.positionsX[1] = 140;
      },
      reason: "outOfThreatDistance" as const,
    },
    {
      name: "rear-arc",
      mutate: (harness: ActionHarness) => {
        harness.world.positionsX[1] = 94;
      },
      reason: "outsideAttackFacingArc" as const,
    },
    {
      name: "allied",
      mutate: (harness: ActionHarness) => {
        harness.identity = createIdentity(harness.world.entityCount, [1, 1]);
      },
      reason: "alliedTarget" as const,
    },
    {
      name: "no-active-melee-mode",
      mutate: (harness: ActionHarness) => {
        harness.profiles = createProfileStore(["ranged", "oneHanded"]);
      },
      reason: "noActiveMeleeMode" as const,
    },
  ])("invalidates a committed attack when the target becomes $name", ({ mutate, reason }) => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);
    mutate(harness);

    const attempt = advanceUntilAttempt(harness, [selectedRecord(0, 1)]);

    expect(attempt).toMatchObject({
      attackerEntityId: 0,
      targetEntityId: 1,
      outcome: "invalidated",
      invalidationReason: reason,
    });
    expect(getIndividualCombatActionState(harness.actions, 0)).toBe(
      "recoveringAttack",
    );
    expect(getAttackRecoveryTicksRemaining(harness.actions, 0)).toBe(
      INDIVIDUAL_COMBAT_ACTION_TIMING.oneHanded.recoveryTicks,
    );
  });

  it("allows a target that remains in the same attack octant at resolution", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);
    harness.world.positionsX[1] = 110;
    harness.world.positionsY[1] = 101;

    const attempt = advanceUntilAttempt(harness, [selectedRecord(0, 1)]);

    expect(attempt).toMatchObject({
      attackerEntityId: 0,
      targetEntityId: 1,
      outcome: "attempted",
    });
  });

  it("allows a target that moves to an adjacent attack octant during commitment", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);
    harness.world.positionsX[1] = 108;
    harness.world.positionsY[1] = 106;

    const attempt = advanceUntilAttempt(harness, [selectedRecord(0, 1)]);

    expect(attempt).toMatchObject({
      attackerEntityId: 0,
      targetEntityId: 1,
      outcome: "attempted",
    });
  });

  it("invalidates a target that moves to a perpendicular octant during commitment", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);
    harness.world.positionsX[1] = 101;
    harness.world.positionsY[1] = 108;

    const attempt = advanceUntilAttempt(harness, [selectedRecord(0, 1)]);

    expect(attempt).toMatchObject({
      attackerEntityId: 0,
      targetEntityId: 1,
      outcome: "invalidated",
      invalidationReason: "outsideAttackFacingArc",
    });
  });

  it("invalidates a target that moves behind during commitment", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);
    harness.world.positionsX[1] = 94;

    const attempt = advanceUntilAttempt(harness, [selectedRecord(0, 1)]);

    expect(attempt).toMatchObject({
      attackerEntityId: 0,
      targetEntityId: 1,
      outcome: "invalidated",
      invalidationReason: "outsideAttackFacingArc",
    });
  });

  it("reports awkward preferred distance without invalidating the attempt", () => {
    const harness = createHarness([
      entity(100, 100, 1, "polearm", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    advanceActions(harness, [selectedRecord(0, 1)]);

    const attempt = advanceUntilAttempt(harness, [selectedRecord(0, 1)]);

    expect(attempt).toMatchObject({
      attackerEntityId: 0,
      targetEntityId: 1,
      weaponCategory: "polearm",
      preferredMinimumDistance: 12,
      awkwardDistance: true,
      outcome: "attempted",
    });
  });

  it("updates facing toward the locked target without altering formation heading", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 108, 2, "oneHanded", -1),
    ]);
    const headingBefore = getUnitHeading(harness.formation, 1);

    advanceActions(harness, [selectedRecord(0, 1)]);

    expect(getIndividualCombatFacing(harness.actions, 0)).toEqual({
      x: 1,
      y: 1,
    });
    expect(getUnitHeading(harness.formation, 1)).toEqual(headingBefore);
  });

  it("replays identical action sequences deterministically", () => {
    expect(runReplay()).toEqual(runReplay());
  });

  it("uses selected-target source IDs rather than selected-record order", () => {
    const normal = runTwoAttackerAttempt(false);
    const reversed = runTwoAttackerAttempt(true);

    expect(reversed).toEqual(normal);
  });

  it("reuses output arrays and emits transition-only state events", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    const attempts: IndividualMeleeAttackAttemptRecord[] = [
      {} as IndividualMeleeAttackAttemptRecord,
    ];
    const events: IndividualCombatActionStateEvent[] = [
      {
        entityId: 99,
        previousState: "ready",
        actionState: "ready",
      },
    ];

    const result = advanceIndividualCombatActions(
      harness.world,
      harness.identity,
      harness.formation,
      harness.profiles,
      [selectedRecord(0, 1)],
      harness.actions,
      attempts,
      events,
    );
    const unchanged = advanceIndividualCombatActions(
      harness.world,
      harness.identity,
      harness.formation,
      harness.profiles,
      [selectedRecord(0, 1)],
      harness.actions,
      attempts,
      events,
    );

    expect(result.attackAttempts).toBe(attempts);
    expect(result.actionStateEvents).toBe(events);
    expect(unchanged.actionStateEvents).toEqual([]);
  });

  it("does not mutate movement, formation, pressure, target selection, or production combat stores", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    const positionsX = Array.from(harness.world.positionsX);
    const positionsY = Array.from(harness.world.positionsY);
    const velocitiesX = Array.from(harness.world.velocitiesX);
    const velocitiesY = Array.from(harness.world.velocitiesY);
    const heading = getUnitHeading(harness.formation, 1);
    const anchor = getUnitAnchor(harness.formation, 1);
    const pressure = getIndividualPressure(harness.formation, 0);
    const selectedRecords = selectSourceRecords(harness, [0]);
    const selectedTargets = snapshotSelectedTargets(harness);

    advanceActions(harness, selectedRecords);

    expect(Array.from(harness.world.positionsX)).toEqual(positionsX);
    expect(Array.from(harness.world.positionsY)).toEqual(positionsY);
    expect(Array.from(harness.world.velocitiesX)).toEqual(velocitiesX);
    expect(Array.from(harness.world.velocitiesY)).toEqual(velocitiesY);
    expect(getUnitHeading(harness.formation, 1)).toEqual(heading);
    expect(getUnitAnchor(harness.formation, 1)).toEqual(anchor);
    expect(getIndividualPressure(harness.formation, 0)).toBe(pressure);
    expect(snapshotSelectedTargets(harness)).toEqual(selectedTargets);
  });

  it("rejects duplicate selected-target records for one source", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);

    expect(() =>
      advanceActions(harness, [selectedRecord(0, 1), selectedRecord(0, 1)]),
    ).toThrow(RangeError);
  });
});

describe("7D-2 attack recovery capability", () => {
  const meleeWeapons = [
    "dagger", "oneHanded", "greatWeapon", "polearm",
    "pike", "thrown", "rod", "staff",
  ] as const;

  it.each(meleeWeapons)("keeps fresh %s recovery at its weapon base", (weapon) => {
    const harness = createHarness([
      entity(100, 100, 1, weapon, 1),
      entity(106, 100, 2, "oneHanded", -1),
    ]);
    const energy = combatEnergyCapability(harness.world.entityCount, 100, 0);
    advanceActionsWithCapability(harness, [selectedRecord(0, 1)], energy.input);
    const attempt = advanceUntilAttemptWithCapability(
      harness, [selectedRecord(0, 1)], energy.input,
    );
    const base = INDIVIDUAL_COMBAT_ACTION_TIMING[weapon].recoveryTicks;
    expect(attempt.recoveryDurationTicks).toBe(base);
    expect(getIndividualAttackRecoveryInspection(harness.actions, 0)).toEqual({
      weaponBaseRecoveryTicks: base,
      attackRecoveryMultiplierPercent: 100,
      assignedRecoveryTicks: base,
      remainingRecoveryTicks: base,
      capabilityProjectionTickUsed: 0,
    });
  });

  it.each([
    [50, 110, 4],
    [20, 135, 5],
    [5, 175, 6],
    [0, 175, 6],
  ] as const)(
    "assigns exact ceiling recovery at energy %i",
    (startingEnergy, multiplier, assigned) => {
      const harness = createHarness([
        entity(100, 100, 1, "oneHanded", 1),
        entity(108, 100, 2, "oneHanded", -1),
      ]);
      const energy = combatEnergyCapability(
        harness.world.entityCount, startingEnergy, 7,
      );
      advanceActionsWithCapability(harness, [selectedRecord(0, 1)], energy.input);
      const attempt = advanceUntilAttemptWithCapability(
        harness, [selectedRecord(0, 1)], energy.input,
      );
      expect(attempt.recoveryDurationTicks).toBe(3);
      expect(getIndividualAttackRecoveryInspection(harness.actions, 0))
        .toEqual({
          weaponBaseRecoveryTicks: 3,
          attackRecoveryMultiplierPercent: multiplier,
          assignedRecoveryTicks: assigned,
          remainingRecoveryTicks: assigned,
          capabilityProjectionTickUsed: 7,
        });
    },
  );

  it("keeps zero base recovery at zero", () => {
    expect(calculateIndividualAttackRecoveryTicks(0, 175)).toBe(0);
  });

  it("samples once and does not rewrite an active recovery after expenditure", () => {
    const harness = createHarness([
      entity(100, 100, 1, "oneHanded", 1),
      entity(108, 100, 2, "oneHanded", -1),
    ]);
    const energy = combatEnergyCapability(harness.world.entityCount, 100, 0);
    advanceActionsWithCapability(harness, [selectedRecord(0, 1)], energy.input);
    spendIndividualEnergy(energy.energy, 0, 95, 0);
    advanceUntilAttemptWithCapability(
      harness, [selectedRecord(0, 1)], energy.input,
    );
    expect(getIndividualAttackRecoveryInspection(harness.actions, 0))
      .toMatchObject({
        attackRecoveryMultiplierPercent: 100,
        assignedRecoveryTicks: 3,
        remainingRecoveryTicks: 3,
      });
    projectIndividualEnergyCapabilitiesOneTick(
      energy.capabilities, energy.energy, energy.lifecycle, energy.presence, 1,
    );
    const nextInput = { capabilities: energy.capabilities, tick: 1 } as const;
    advanceActionsWithCapability(harness, [], nextInput);
    expect(getIndividualAttackRecoveryInspection(harness.actions, 0))
      .toMatchObject({
        attackRecoveryMultiplierPercent: 100,
        assignedRecoveryTicks: 3,
        remainingRecoveryTicks: 2,
        capabilityProjectionTickUsed: 0,
      });
  });

  it("preserves the canonical attempt and defence-roll identity inputs when assigned recovery differs", () => {
    const run = (startingEnergy: number) => {
      const harness = createHarness([
        entity(100, 100, 1, "oneHanded", 1),
        entity(108, 100, 2, "oneHanded", -1),
      ]);
      const energy = combatEnergyCapability(
        harness.world.entityCount, startingEnergy, 2,
      );
      advanceActionsWithCapability(harness, [selectedRecord(0, 1)], energy.input);
      const attempt = advanceUntilAttemptWithCapability(
        harness, [selectedRecord(0, 1)], energy.input,
      );
      return {
        attempt,
        recovery: getIndividualAttackRecoveryInspection(harness.actions, 0),
      };
    };
    const fresh = run(100);
    const spent = run(0);
    expect(spent.attempt).toEqual(fresh.attempt);
    expect(fresh.attempt.recoveryDurationTicks).toBe(3);
    expect(fresh.recovery.assignedRecoveryTicks).toBe(3);
    expect(spent.recovery.assignedRecoveryTicks).toBe(6);
  });

  it("assigns equal recovery to attempted and committed-invalidated outcomes", () => {
    const run = (invalidate: boolean) => {
      const harness = createHarness([
        entity(100, 100, 1, "oneHanded", 1),
        entity(108, 100, 2, "oneHanded", -1),
      ]);
      const energy = combatEnergyCapability(harness.world.entityCount, 20, 3);
      advanceActionsWithCapability(harness, [selectedRecord(0, 1)], energy.input);
      if (invalidate) harness.world.positionsX[1] = 140;
      const attempt = advanceUntilAttemptWithCapability(
        harness, [selectedRecord(0, 1)], energy.input,
      );
      return {
        outcome: attempt.outcome,
        base: attempt.recoveryDurationTicks,
        recovery: getIndividualAttackRecoveryInspection(harness.actions, 0),
      };
    };
    expect(run(false)).toEqual({
      outcome: "attempted",
      base: 3,
      recovery: {
        weaponBaseRecoveryTicks: 3,
        attackRecoveryMultiplierPercent: 135,
        assignedRecoveryTicks: 5,
        remainingRecoveryTicks: 5,
        capabilityProjectionTickUsed: 3,
      },
    });
    expect(run(true)).toEqual({
      outcome: "invalidated",
      base: 3,
      recovery: {
        weaponBaseRecoveryTicks: 3,
        attackRecoveryMultiplierPercent: 135,
        assignedRecoveryTicks: 5,
        remainingRecoveryTicks: 5,
        capabilityProjectionTickUsed: 3,
      },
    });
  });

  it("slows repeated cadence at spent energy without preventing attacks", () => {
    const ticksForTwoAttempts = (startingEnergy: number) => {
      const harness = createHarness([
        entity(100, 100, 1, "dagger", 1),
        entity(106, 100, 2, "oneHanded", -1),
      ]);
      const energy = combatEnergyCapability(
        harness.world.entityCount, startingEnergy, 0,
      );
      let attempts = 0;
      for (let tick = 0; tick < 30; tick += 1) {
        attempts += advanceActionsWithCapability(
          harness, [selectedRecord(0, 1)], energy.input,
        ).attackAttempts.length;
        if (attempts === 2) return tick;
      }
      throw new Error("Expected two attacks within cadence window.");
    };
    expect(ticksForTwoAttempts(0)).toBeGreaterThan(ticksForTwoAttempts(100));
  });

  it.each([null, "forged", "mismatched", "stale", "future"] as const)(
    "rejects %s capability before state or seeded-buffer mutation",
    (kind) => {
      const harness = createHarness([
        entity(100, 100, 1, "oneHanded", 1),
        entity(108, 100, 2, "oneHanded", -1),
      ]);
      const valid = combatEnergyCapability(harness.world.entityCount, 100, 4);
      const mismatched = combatEnergyCapability(1, 100, 4);
      const input = kind === null ? null
        : kind === "forged" ? ({ capabilities: { entityCount: 2 }, tick: 4 } as never)
        : kind === "mismatched" ? mismatched.input
        : kind === "stale" ? { capabilities: valid.capabilities, tick: 3 }
        : { capabilities: valid.capabilities, tick: 5 };
      const attempts: IndividualMeleeAttackAttemptRecord[] = [{
        attackerEntityId: 77, targetEntityId: 78, weaponCategory: "dagger",
        commitmentDurationTicks: 2, recoveryDurationTicks: 2,
        distanceSquaredAtResolution: 1, threatDistance: 8,
        preferredMinimumDistance: 0, awkwardDistance: false,
        facingX: 1, facingY: 0, outcome: "attempted",
      }];
      const events: IndividualCombatActionStateEvent[] = [{
        entityId: 77, previousState: "ready", actionState: "committingAttack",
      }];
      const before = getIndividualAttackRecoveryInspection(harness.actions, 0);
      expect(() => advanceIndividualCombatActions(
        harness.world, harness.identity, harness.formation, harness.profiles,
        [selectedRecord(0, 1)], harness.actions, attempts, events, undefined,
        input,
      )).toThrow();
      expect(attempts).toHaveLength(1);
      expect(events).toHaveLength(1);
      expect(getIndividualCombatActionState(harness.actions, 0)).toBe("ready");
      expect(getIndividualAttackRecoveryInspection(harness.actions, 0))
        .toEqual(before);
    },
  );
});

interface EntityDefinition {
  readonly x: number;
  readonly y: number;
  readonly factionId: number;
  readonly weapon: IndividualWeaponCategory;
  readonly headingX: -1 | 1;
  readonly supportedAttackModes?: readonly IndividualAttackMode[];
}

interface ActionHarness {
  readonly world: WorldState;
  identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  profiles: IndividualCombatProfileStore;
  readonly actions: IndividualCombatActionStore;
  readonly targetStore: ReturnType<typeof createIndividualMeleeTargetSelectionStore>;
  readonly targetRecords: IndividualSelectedTargetRecord[];
  readonly lastAttempts: IndividualMeleeAttackAttemptRecord[];
  readonly lastEvents: IndividualCombatActionStateEvent[];
}

function entity(
  x: number,
  y: number,
  factionId: number,
  weapon: IndividualWeaponCategory,
  headingX: -1 | 1,
  supportedAttackModes?: readonly IndividualAttackMode[],
): EntityDefinition {
  return {
    x,
    y,
    factionId,
    weapon,
    headingX,
    ...(supportedAttackModes === undefined ? {} : { supportedAttackModes }),
  };
}

function createHarness(definitions: readonly EntityDefinition[]): ActionHarness {
  const entityCount = definitions.length;
  const world: WorldState = {
    entityCount,
    bounds: { width: 512, height: 512 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(definitions.map((definition) => definition.x)),
    positionsY: Int32Array.from(definitions.map((definition) => definition.y)),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const identity = createIdentity(
    entityCount,
    definitions.map((definition) => definition.factionId),
  );
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x5c01,
    units: definitions.map((definition, entityId) => ({
      unitId: entityId + 1,
      anchorX: definition.x,
      anchorY: definition.y,
      headingX: definition.headingX,
      headingY: 0,
      spacing: 4,
      rows: 1,
      cols: 1,
      unitSpeed: 0,
      order: "hold" as const,
    })),
    individuals: definitions.map((_, entityId) => ({
      entityId,
      role: "regular" as const,
      slotRow: 0,
      slotCol: 0,
      memberMaxStep: 0,
    })),
  });
  const profiles = createIndividualCombatProfileStore({
    entityCount,
    profiles: definitions.map((definition, entityId) =>
      combatProfile(entityId, definition.weapon, definition.supportedAttackModes),
    ),
  });
  return {
    world,
    identity,
    formation,
    profiles,
    actions: createIndividualCombatActionStore(identity, formation, profiles, {
      entityCount,
    }),
    targetStore: createIndividualMeleeTargetSelectionStore({
      entityCount,
      bounds: world.bounds,
    }),
    targetRecords: [],
    lastAttempts: [],
    lastEvents: [],
  };
}

function createIdentity(
  entityCount: number,
  factionIdsByEntity: readonly number[],
): UnitIdentityStore {
  return createUnitIdentityStore({
    entityCount,
    units: factionIdsByEntity.map((factionId, entityId) => ({
      unitId: entityId + 1,
      factionId,
      memberEntityIds: [entityId],
    })),
  });
}

function createProfileStore(
  weapons: readonly IndividualWeaponCategory[],
): IndividualCombatProfileStore {
  return createIndividualCombatProfileStore({
    entityCount: weapons.length,
    profiles: weapons.map((weapon, entityId) => combatProfile(entityId, weapon)),
  });
}

function combatProfile(
  entityId: number,
  primaryWeapon: IndividualWeaponCategory,
  supportedAttackModes?: readonly IndividualAttackMode[],
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon,
    ...(supportedAttackModes === undefined ? {} : { supportedAttackModes }),
    shieldCategory: "none",
    shieldCarriedState: "none",
    armourCategory: "none",
    hasQualifyingHelmet: false,
    qualifications: {
      hasWeaponMaster: true,
      hasShield: true,
      hasMarksman: true,
      hasThrown: true,
      hasAmbidexterity: false,
      enduranceLevels: 0,
      fortitudeLevels: 0,
      hasDreadnought: false,
    },
    magicalCapabilities: {
      canUseRod: true,
      canUseStaff: true,
      canWearMageArmour: true,
      canDeliverCombatMagic: true,
    },
  };
}

function selectSourceRecords(
  harness: ActionHarness,
  sourceEntityIds: readonly number[],
): IndividualSelectedTargetRecord[] {
  const result = advanceIndividualMeleeTargetSelection(
    harness.world,
    harness.identity,
    harness.formation,
    harness.profiles,
    harness.targetStore,
    harness.targetRecords,
  );
  return sourceEntityIds.map((sourceEntityId) => {
    const record = result.records.find(
      (candidate) => candidate.sourceEntityId === sourceEntityId,
    );
    if (record === undefined) {
      throw new Error(`Missing selected-target record ${sourceEntityId}.`);
    }
    return { ...record };
  });
}

function snapshotSelectedTargets(harness: ActionHarness): readonly number[] {
  return Array.from({ length: harness.world.entityCount }, (_, entityId) =>
    getSelectedTargetEntityId(harness.targetStore, entityId),
  );
}

function selectedRecord(
  sourceEntityId: number,
  targetEntityId: number,
): IndividualSelectedTargetRecord {
  return {
    sourceEntityId,
    targetEntityId,
    distanceSquared: 0,
    sourceThreatDistance: 0,
    sourcePreferredMinimumDistance: 0,
    targetThreatDistance: 0,
    sourceCanThreatTarget: true,
    targetCanThreatSource: true,
    withinPreferredDistance: true,
    facingEligible: true,
    selectionReason: "nearestValidHostile",
  };
}

function advanceActions(
  harness: ActionHarness,
  selectedRecords: readonly IndividualSelectedTargetRecord[],
) {
  return advanceIndividualCombatActions(
    harness.world,
    harness.identity,
    harness.formation,
    harness.profiles,
    selectedRecords,
    harness.actions,
    harness.lastAttempts,
    harness.lastEvents,
  );
}

function advanceActionsWithCapability(
  harness: ActionHarness,
  selectedRecords: readonly IndividualSelectedTargetRecord[],
  input: IndividualCombatEnergyCapabilityInput,
) {
  return advanceIndividualCombatActions(
    harness.world,
    harness.identity,
    harness.formation,
    harness.profiles,
    selectedRecords,
    harness.actions,
    harness.lastAttempts,
    harness.lastEvents,
    undefined,
    input,
  );
}

function advanceUntilAttemptWithCapability(
  harness: ActionHarness,
  selectedRecords: readonly IndividualSelectedTargetRecord[],
  input: IndividualCombatEnergyCapabilityInput,
): IndividualMeleeAttackAttemptRecord {
  for (let tick = 0; tick < 16; tick += 1) {
    const result = advanceActionsWithCapability(harness, selectedRecords, input);
    if (result.attackAttempts.length > 0) return result.attackAttempts[0]!;
  }
  throw new Error("Expected energy-capability attack attempt.");
}

function combatEnergyCapability(
  entityCount: number,
  startingEnergy: number,
  tick: number,
) {
  const profiles = createTrustedIndividualEnergyProfileStore({
    entityCount,
    profiles: Array.from({ length: entityCount }, (_, entityId) => ({
      entityId, maximumEnergy: 100, startingEnergy,
    })),
  });
  const energy = createIndividualEnergyStore(profiles);
  const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
  const presence = createIndividualPlayerPresenceStore(entityCount);
  const capabilities = createIndividualEnergyCapabilityStore(
    entityCount, energy, lifecycle, presence,
  );
  projectIndividualEnergyCapabilitiesOneTick(
    capabilities, energy, lifecycle, presence, tick,
  );
  return {
    energy,
    lifecycle,
    presence,
    capabilities,
    input: { capabilities, tick } as IndividualCombatEnergyCapabilityInput,
  };
}

function advanceUntilAttempt(
  harness: ActionHarness,
  selectedRecords: readonly IndividualSelectedTargetRecord[],
): IndividualMeleeAttackAttemptRecord {
  for (let tick = 0; tick < 16; tick += 1) {
    const result = advanceActions(harness, selectedRecords);
    if (result.attackAttempts.length > 0) {
      return result.attackAttempts[0]!;
    }
  }
  throw new Error("Expected attack attempt.");
}

function ticksUntilAttempt(weapon: IndividualWeaponCategory): number {
  const harness = createHarness([
    entity(100, 100, 1, weapon, 1),
    entity(106, 100, 2, "oneHanded", -1),
  ]);
  advanceActions(harness, [selectedRecord(0, 1)]);
  for (let tick = 1; tick < 16; tick += 1) {
    const result = advanceActions(harness, [selectedRecord(0, 1)]);
    if (result.attackAttempts.length > 0) return tick;
  }
  throw new Error(`No attempt for ${weapon}.`);
}

function runReplay(): unknown {
  const harness = createHarness([
    entity(100, 100, 1, "oneHanded", 1),
    entity(108, 100, 2, "oneHanded", -1),
    entity(106, 100, 2, "dagger", -1),
  ]);
  const trace: unknown[] = [];

  for (let tick = 0; tick < 12; tick += 1) {
    if (tick === 2) harness.world.positionsX[1] = 130;
    if (tick === 6) harness.world.positionsX[1] = 108;
    const selected =
      tick < 4 ? [selectedRecord(0, 1)] : [selectedRecord(0, 2)];
    const result = advanceActions(harness, selected);
    trace.push({
      tick,
      state: getIndividualCombatActionState(harness.actions, 0),
      lockedTarget: getLockedAttackTargetEntityId(harness.actions, 0),
      facing: getIndividualCombatFacing(harness.actions, 0),
      attempts: result.attackAttempts.map((record) => ({ ...record })),
      events: result.actionStateEvents.map((event) => ({ ...event })),
    });
  }

  return trace;
}

function runTwoAttackerAttempt(reverseRecords: boolean): unknown {
  const harness = createHarness([
    entity(100, 100, 1, "dagger", 1),
    entity(100, 108, 1, "dagger", 1),
    entity(106, 100, 2, "oneHanded", -1),
    entity(106, 108, 2, "oneHanded", -1),
  ]);
  const records = [selectedRecord(0, 2), selectedRecord(1, 3)];
  if (reverseRecords) records.reverse();
  advanceActions(harness, records);
  const attempts: IndividualMeleeAttackAttemptRecord[] = [];
  for (let tick = 0; tick < 3; tick += 1) {
    const result = advanceActions(harness, records);
    attempts.push(...result.attackAttempts.map((record) => ({ ...record })));
  }
  return attempts;
}
