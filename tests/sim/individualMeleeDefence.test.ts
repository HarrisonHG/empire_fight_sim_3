import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
  getIndividualPressure,
  getUnitHeading,
  type FormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import {
  advanceIndividualCombatActions,
  createIndividualCombatActionStore,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
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
  setIndividualCurrentEnergyForTrustedSetup,
} from "../../src/sim/individualEnergy";
import {
  createIndividualEnergyCapabilityStore,
  projectIndividualEnergyCapabilitiesOneTick,
  type IndividualCombatEnergyCapabilityInput,
} from "../../src/sim/individualEnergyCapability";
import {
  createIndividualCombatProfileStore,
  type IndividualCombatProfileConfig,
  type IndividualCombatProfileStore,
  type IndividualShieldCarriedState,
  type IndividualShieldCategory,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  createPrioritizedIndividualDefenceHandAvailabilitySource,
  createIndividualMeleeDefenceStore,
  getDefenceRecoveryTicksRemaining,
  getIndividualGuardState,
  getIndividualGuardRecoveryInspection,
  getStoredGuardReadinessFixedPoint,
  GUARD_READINESS_COST_PER_ATTEMPT,
  GUARD_READINESS_MAX,
  INDIVIDUAL_MELEE_DEFENCE_TIMING,
  resolveIndividualMeleeDefences,
  type IndividualGuardStateEvent,
  type IndividualMeleeDefenceRecord,
  type IndividualMeleeDefenceStore,
} from "../../src/sim/individualMeleeDefence";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("individual melee defence resolution", () => {
  it("limits active defence sources to equipment that fits externally free hands", () => {
    const twoHanded = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "greatWeapon", -1),
    ]);
    const oneFreeHand = { entityCount: 2, getFreeHands: (entityId: number) => entityId === 1 ? 1 : undefined };
    const claimedTwoHands = { entityCount: 2, getFreeHands: (entityId: number) => entityId === 1 ? 2 : undefined };
    const dragBeforeClaim = createPrioritizedIndividualDefenceHandAvailabilitySource(
      oneFreeHand, claimedTwoHands,
    );
    const result = resolveIndividualMeleeDefences(twoHanded.world, twoHanded.identity,
      twoHanded.formation, twoHanded.actions, twoHanded.profiles, twoHanded.defence,
      [attempt(0, 1)], twoHanded.records, twoHanded.events, undefined, 0, dragBeforeClaim);
    expect(result.records[0]).toMatchObject({ availableDefenceType: "none", outcome: "landed" });

    const shield = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "shield", "held"),
    ]);
    const strongest = resolveIndividualMeleeDefences(shield.world, shield.identity,
      shield.formation, shield.actions, shield.profiles, shield.defence,
      [attempt(0, 1)], shield.records, shield.events, undefined, 0, oneFreeHand);
    expect(strongest.records[0]!.availableDefenceType).toBe("shieldBlock");

    const noFreeDragHands = createPrioritizedIndividualDefenceHandAvailabilitySource(
      { entityCount: 2, getFreeHands: (entityId: number) => entityId === 1 ? 0 : undefined },
      claimedTwoHands,
    );
    const dragging = resolveIndividualMeleeDefences(shield.world, shield.identity,
      shield.formation, shield.actions, shield.profiles, shield.defence,
      [attempt(0, 1)], [], [], undefined, 1, noFreeDragHands);
    expect(dragging.records[0]).toMatchObject({
      availableDefenceType: "none",
      outcome: "landed",
    });
  });
  it("parries a ready frontal attack and consumes guard", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);

    const result = resolve(harness, [attempt(0, 1)]);

    expect(result.records).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        defenderEntityId: 1,
        availableDefenceType: "weaponParry",
        outcome: "parried",
        guardStateBeforeResolution: "ready",
        defenceRecoveryTicksAssigned:
          INDIVIDUAL_MELEE_DEFENCE_TIMING.weaponParry.recoveryTicks,
        readinessSpentThisTick: GUARD_READINESS_COST_PER_ATTEMPT,
      }),
    ]);
    expect(result.guardStateEvents).toEqual([
      {
        entityId: 1,
        previousGuardState: "ready",
        guardState: "recovering",
      },
    ]);
    expect(getIndividualGuardState(harness.defence, 1)).toBe("recovering");
  });

  it("uses persistent readiness recovered before the next in-arc attack", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);
    resolve(harness, [attempt(0, 1)]);

    const result = resolve(harness, [attempt(2, 1)]);

    expect(result.records).toEqual([
      expect.objectContaining({
        attackerEntityId: 2,
        defenderEntityId: 1,
        availableDefenceType: "weaponParry",
        guardStateBeforeResolution: "recovering",
        defenceCoverageTier: "small",
        storedGuardReadinessFixedPoint: 8100,
        effectiveGuardReadinessFixedPoint: 8100,
        calculatedDefenceChanceFixedPoint: 7980,
        readinessSpentThisTick: 2000,
        readinessRecoveredThisTick: 100,
      }),
    ]);
  });

  it("recovers regular readiness by 100 per tick until clamped at full", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    resolve(harness, [attempt(0, 1)]);
    expect(getDefenceRecoveryTicksRemaining(harness.defence, 1)).toBe(0);
    expect(getStoredGuardReadinessFixedPoint(harness.defence, 1)).toBe(8000);
    resolve(harness, []);
    expect(getStoredGuardReadinessFixedPoint(harness.defence, 1)).toBe(8100);
    expect(getIndividualGuardState(harness.defence, 1)).toBe("recovering");
    for (let tick = 0; tick < 19; tick += 1) resolve(harness, []);
    expect(getIndividualGuardState(harness.defence, 1)).toBe("ready");
    expect(getStoredGuardReadinessFixedPoint(harness.defence, 1)).toBe(10000);
  });

  it.each([
    ["recruit", 100, 100, 50],
    ["regular", 100, 100, 100],
    ["veteran", 100, 100, 150],
    ["recruit", 50, 90, 45],
    ["regular", 50, 90, 90],
    ["veteran", 50, 90, 135],
    ["recruit", 20, 70, 35],
    ["regular", 20, 70, 70],
    ["veteran", 20, 70, 105],
    ["recruit", 5, 50, 25],
    ["regular", 5, 50, 50],
    ["veteran", 5, 50, 75],
    ["recruit", 0, 50, 25],
    ["regular", 0, 50, 50],
    ["veteran", 0, 50, 75],
  ] as const)(
    "projects %s energy %i guard recovery at %i%% to %i",
    (role, startingEnergy, multiplier, expectedRecovery) => {
      const harness = createHarness([
        entity(92, 100, 1, "oneHanded", 1),
        entity(100, 100, 2, "oneHanded", -1, "none", "none", role),
      ]);
      resolve(harness, [attempt(0, 1)]);
      const capability = defenceEnergyCapability(
        harness.world.entityCount, startingEnergy, 1,
      );
      resolveWithCapability(harness, [], 1, capability.input);

      expect(getIndividualGuardRecoveryInspection(harness.defence, 1))
        .toEqual({
          experienceBaseRecovery:
            role === "recruit" ? 50 : role === "regular" ? 100 : 150,
          guardRecoveryMultiplierPercent: multiplier,
          energyAdjustedRequestedRecovery: expectedRecovery,
          actualRecoveryAfterClamp: expectedRecovery,
          storedReadiness: 8_000 + expectedRecovery,
          effectiveReadiness: 8_000 + expectedRecovery,
          readinessSpentThisTick: 0,
          capabilityProjectionTickUsed: 1,
        });
    },
  );

  it("distinguishes requested recovery from maximum-clamped actual recovery", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    const capability = defenceEnergyCapability(harness.world.entityCount, 100, 2);
    resolveWithCapability(harness, [], 2, capability.input);
    expect(getIndividualGuardRecoveryInspection(harness.defence, 1)).toEqual({
      experienceBaseRecovery: 100,
      guardRecoveryMultiplierPercent: 100,
      energyAdjustedRequestedRecovery: 100,
      actualRecoveryAfterClamp: 0,
      storedReadiness: 10_000,
      effectiveReadiness: 10_000,
      readinessSpentThisTick: 0,
      capabilityProjectionTickUsed: 2,
    });
  });

  it("exposes legacy 100% recovery without a capability projection", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    resolve(harness, [attempt(0, 1)]);
    resolve(harness, []);
    expect(getIndividualGuardRecoveryInspection(harness.defence, 1))
      .toMatchObject({
        experienceBaseRecovery: 100,
        guardRecoveryMultiplierPercent: 100,
        energyAdjustedRequestedRecovery: 100,
        actualRecoveryAfterClamp: 100,
        capabilityProjectionTickUsed: null,
      });
  });

  it("reports one recovery calculation before canonically ordered repeated attempts", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);
    resolve(harness, [attempt(0, 1)]);
    const capability = defenceEnergyCapability(harness.world.entityCount, 20, 1);
    const result = resolveWithCapability(
      harness, [attempt(0, 1), attempt(2, 1)], 1, capability.input,
    );
    expect(result.records.map((record) => ({
      attacker: record.attackerEntityId,
      base: record.readinessRecoveryPerTick,
      multiplier: record.guardRecoveryMultiplierPercent,
      requested: record.energyAdjustedRequestedReadinessRecovery,
      actual: record.actualReadinessRecoveryAfterClamp,
      projectionTick: record.energyCapabilityProjectionTickUsed,
      stored: record.storedGuardReadinessFixedPoint,
      effective: record.effectiveGuardReadinessFixedPoint,
      spent: record.readinessSpentThisTick,
    }))).toEqual([
      {
        attacker: 0, base: 100, multiplier: 70, requested: 70, actual: 70,
        projectionTick: 1, stored: 8_070, effective: 8_070, spent: 2_000,
      },
      {
        attacker: 2, base: 100, multiplier: 70, requested: 70, actual: 70,
        projectionTick: 1, stored: 6_070, effective: 6_070, spent: 2_000,
      },
    ]);
    expect(getIndividualGuardRecoveryInspection(harness.defence, 1))
      .toMatchObject({
        actualRecoveryAfterClamp: 70,
        storedReadiness: 4_070,
        readinessSpentThisTick: 4_000,
      });
  });

  it.each([100, 50, 20, 0])(
    "retains full-readiness 95 percent chance and roll identity at energy %i",
    (startingEnergy) => {
      const harness = createHarness([
        entity(92, 100, 1, "oneHanded", 1),
        entity(100, 100, 2, "oneHanded", -1),
      ], 0x713);
      const capability = defenceEnergyCapability(
        harness.world.entityCount, startingEnergy, 3,
      );
      const record = resolveWithCapability(
        harness, [attempt(0, 1)], 3, capability.input,
      ).records[0]!;
      expect(record.calculatedDefenceChanceFixedPoint).toBe(9_500);
      expect(record.deterministicDefenceRollFixedPoint).toBe(
        resolveWithCapability(
          createHarness([
            entity(92, 100, 1, "oneHanded", 1),
            entity(100, 100, 2, "oneHanded", -1),
          ], 0x713),
          [attempt(0, 1)],
          3,
          defenceEnergyCapability(2, 100, 3).input,
        ).records[0]!.deterministicDefenceRollFixedPoint,
      );
    },
  );

  it("uses the tick-start multiplier until a following projection observes expenditure", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    resolve(harness, [attempt(0, 1)]);
    const energy = defenceEnergyCapability(harness.world.entityCount, 100, 4);
    setIndividualCurrentEnergyForTrustedSetup(energy.energy, 1, 0, 4);
    resolveWithCapability(harness, [], 4, energy.input);
    expect(getIndividualGuardRecoveryInspection(harness.defence, 1))
      .toMatchObject({
        guardRecoveryMultiplierPercent: 100,
        energyAdjustedRequestedRecovery: 100,
      });
    projectIndividualEnergyCapabilitiesOneTick(
      energy.capabilities, energy.energy, energy.lifecycle, energy.presence, 5,
    );
    resolveWithCapability(
      harness, [], 5, { capabilities: energy.capabilities, tick: 5 },
    );
    expect(getIndividualGuardRecoveryInspection(harness.defence, 1))
      .toMatchObject({
        guardRecoveryMultiplierPercent: 50,
        energyAdjustedRequestedRecovery: 50,
      });
  });

  it.each([null, "forged", "mismatched", "unprojected", "wrapper", "stale", "future"] as const)(
    "rejects %s energy capability before defence state and buffer mutation",
    (kind) => {
      const harness = createHarness([
        entity(92, 100, 1, "oneHanded", 1),
        entity(100, 100, 2, "oneHanded", -1),
      ]);
      resolve(harness, [attempt(0, 1)]);
      const valid = defenceEnergyCapability(harness.world.entityCount, 20, 4);
      const mismatch = defenceEnergyCapability(1, 20, 4);
      const unprojected = unprojectedDefenceEnergyCapability(
        harness.world.entityCount, 20,
      );
      const input = kind === null ? null
        : kind === "forged" ? ({ capabilities: { entityCount: 2 }, tick: 4 } as never)
        : kind === "mismatched" ? mismatch.input
        : kind === "unprojected" ? { capabilities: unprojected.capabilities, tick: 4 }
        : kind === "wrapper" ? { capabilities: valid.capabilities, tick: 3 }
        : { capabilities: valid.capabilities, tick: 4 };
      const currentTick = kind === "stale" ? 5 : kind === "future" ? 3 : 4;
      harness.records.push({ sentinel: "record" } as never);
      harness.events.push({
        entityId: 99, previousGuardState: "ready", guardState: "recovering",
      });
      const before = {
        readiness: getStoredGuardReadinessFixedPoint(harness.defence, 1),
        diagnostic: getIndividualGuardRecoveryInspection(harness.defence, 1),
        records: JSON.stringify(harness.records),
        events: JSON.stringify(harness.events),
      };
      expect(() => resolveIndividualMeleeDefences(
        harness.world, harness.identity, harness.formation, harness.actions,
        harness.profiles, harness.defence, [attempt(0, 1)], harness.records,
        harness.events, undefined, currentTick, undefined, input,
      )).toThrow();
      expect({
        readiness: getStoredGuardReadinessFixedPoint(harness.defence, 1),
        diagnostic: getIndividualGuardRecoveryInspection(harness.defence, 1),
        records: JSON.stringify(harness.records),
        events: JSON.stringify(harness.events),
      }).toEqual(before);
    },
  );

  it("uses held bucklers for buckler blocks", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "buckler", "held"),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "bucklerBlock",
      outcome: "bucklerBlocked",
      defenceRecoveryTicksAssigned:
        INDIVIDUAL_MELEE_DEFENCE_TIMING.bucklerBlock.recoveryTicks,
    });
  });

  it("uses held full shields for shield blocks and prefers shields over parry", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "shield", "held"),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "shieldBlock",
      defenceCoverageTier: "huge",
      calculatedDefenceChanceFixedPoint: 9500,
      defenceRecoveryTicksAssigned:
        INDIVIDUAL_MELEE_DEFENCE_TIMING.shieldBlock.recoveryTicks,
    });
  });

  it("gives full shields a wider arc than bucklers or weapon parries", () => {
    const shieldHarness = createHarness([
      entity(100, 108, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "shield", "held"),
    ]);
    const bucklerHarness = createHarness([
      entity(100, 108, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1, "buckler", "held"),
    ]);
    const weaponHarness = createHarness([
      entity(100, 108, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);

    expect(resolve(shieldHarness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "shieldBlock",
      defenceCoverageTier: "huge",
      incomingDirectionName: "south",
    });
    expect(resolve(bucklerHarness, [attempt(0, 1)]).records[0]).toMatchObject({
      outcome: "landed",
      landedReason: "outsideDefenceArc",
    });
    expect(resolve(weaponHarness, [attempt(0, 1)]).records[0]).toMatchObject({
      outcome: "landed",
      landedReason: "outsideDefenceArc",
    });
  });

  it("does not treat slung shields as active defence", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "unarmed", -1, "shield", "slung"),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "none",
      outcome: "landed",
      landedReason: "noActiveDefence",
    });
  });

  it.each([
    { weapon: "unarmed" as const, tier: "none", chance: 0 },
    { weapon: "dagger" as const, tier: "tiny", chance: 9500 },
    { weapon: "oneHanded" as const, tier: "small", chance: 9500 },
    { weapon: "greatWeapon" as const, tier: "small", chance: 9500 },
    { weapon: "polearm" as const, tier: "medium", chance: 9500 },
    { weapon: "pike" as const, tier: "small", chance: 9500 },
    { weapon: "rod" as const, tier: "small", chance: 9500 },
    { weapon: "staff" as const, tier: "medium", chance: 9500 },
  ])(
    "maps $weapon defence coverage into $tier",
    ({ weapon, tier, chance }) => {
      const harness = createHarness([
        entity(92, 100, 1, "oneHanded", 1),
        entity(100, 100, 2, weapon, -1),
      ]);

      expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
        defenceCoverageTier: tier,
        calculatedDefenceChanceFixedPoint: chance,
      });
    },
  );

  it("keeps busy defenders at the tier minimum chance", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "dagger", -1),
    ]);
    advanceIndividualCombatActions(
      harness.world,
      harness.identity,
      harness.formation,
      harness.profiles,
      [selectedRecord(1, 0)],
      harness.actions,
    );

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      defenceCoverageTier: "tiny",
      defenceReadinessFixedPoint: 0,
      calculatedDefenceChanceFixedPoint: 1000,
    });
  });

  it("emits stable keyed rolls without consuming an iteration stream", () => {
    const first = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    const second = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);

    expect(resolve(first, [attempt(0, 1)]).records[0]).toMatchObject({
      deterministicDefenceRollFixedPoint:
        resolve(second, [attempt(0, 1)]).records[0]
          ?.deterministicDefenceRollFixedPoint,
    });
  });

  it("uses fixed rear desperate defence and depletes readiness before a frontal attack", () => {
    const harness = createHarness([
      entity(108, 100, 1, "oneHanded", -1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 100, 1, "oneHanded", 1),
    ]);

    const result = resolve(harness, [attempt(0, 1), attempt(2, 1)]);

    expect(result.records).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        availableDefenceType: "desperateRearDefence",
        outcome: "landed",
        landedReason: "failedDefence",
        calculatedDefenceChanceFixedPoint: 500,
        rearDesperateDefenceApplied: true,
      }),
      expect.objectContaining({
        attackerEntityId: 2,
        outcome: "parried",
        guardStateBeforeResolution: "recovering",
        effectiveGuardReadinessFixedPoint: 8000,
      }),
    ]);
  });

  it("includes a deterministic lucky rear defence at the fixed five-percent chance", () => {
    const harness = createHarness([
      entity(108, 100, 1, "oneHanded", -1),
      entity(100, 100, 2, "staff", -1),
    ], 12);
    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "desperateRearDefence",
      outcome: "parried",
      calculatedDefenceChanceFixedPoint: 500,
      defenceResolution: "successfulDesperateRearDefence",
      rearDesperateDefenceApplied: true,
      readinessSpentThisTick: 2_000,
    });
  });

  it.each([
    { weapon: "dagger" as const, shield: "none" as const },
    { weapon: "oneHanded" as const, shield: "none" as const },
    { weapon: "staff" as const, shield: "none" as const },
    { weapon: "unarmed" as const, shield: "buckler" as const },
    { weapon: "unarmed" as const, shield: "shield" as const },
  ])("gives $weapon/$shield the same rear desperate chance", ({ weapon, shield }) => {
    const harness = createHarness([
      entity(108, 100, 1, "oneHanded", -1),
      entity(
        100,
        100,
        2,
        weapon,
        -1,
        shield,
        shield === "none" ? "none" : "held",
      ),
    ]);
    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "desperateRearDefence",
      calculatedDefenceChanceFixedPoint: 500,
      rearDesperateDefenceApplied: true,
    });
  });

  it("defines rear as octant distance three or four, not distance two", () => {
    const boundaryTwo = createHarness([
      entity(100, 92, 1, "oneHanded", 1),
      entity(100, 100, 2, "staff", -1),
    ]);
    const boundaryThree = createHarness([
      entity(108, 92, 1, "oneHanded", -1),
      entity(100, 100, 2, "staff", -1),
    ]);
    expect(resolve(boundaryTwo, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "none",
      landedReason: "outsideDefenceArc",
    });
    expect(resolve(boundaryThree, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "desperateRearDefence",
      rearDesperateDefenceApplied: true,
      calculatedDefenceChanceFixedPoint: 500,
    });
  });

  it("does not attempt or spend rear defence when no usable source exists", () => {
    const harness = createHarness([
      entity(108, 100, 1, "oneHanded", -1),
      entity(100, 100, 2, "unarmed", -1),
    ]);
    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "none",
      landedReason: "noActiveDefence",
    });
    expect(getStoredGuardReadinessFixedPoint(harness.defence, 1)).toBe(10_000);
  });

  it.each([
    { weapon: "unarmed" as const },
    { weapon: "ranged" as const },
  ])("lands against $weapon defenders without held shields", ({ weapon }) => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, weapon, -1),
    ]);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      availableDefenceType: "none",
      outcome: "landed",
      landedReason: "noActiveDefence",
    });
  });

  it.each([
    {
      name: "committing",
      prepare: (harness: DefenceHarness) => {
        advanceIndividualCombatActions(
          harness.world,
          harness.identity,
          harness.formation,
          harness.profiles,
          [selectedRecord(1, 0)],
          harness.actions,
        );
      },
    },
    {
      name: "attack-recovering",
      prepare: (harness: DefenceHarness) => {
        advanceIndividualCombatActions(
          harness.world,
          harness.identity,
          harness.formation,
          harness.profiles,
          [selectedRecord(1, 0)],
          harness.actions,
        );
        for (let tick = 0; tick < 4; tick += 1) {
          advanceIndividualCombatActions(
            harness.world,
            harness.identity,
            harness.formation,
            harness.profiles,
            [selectedRecord(1, 0)],
            harness.actions,
          );
        }
      },
    },
  ])("$name defenders cannot actively defend", ({ prepare }) => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    prepare(harness);

    expect(resolve(harness, [attempt(0, 1)]).records[0]).toMatchObject({
      outcome: "landed",
      landedReason: "failedDefence",
      defenceReadinessFixedPoint: 0,
      storedGuardReadinessFixedPoint: 10_000,
      effectiveGuardReadinessFixedPoint: 0,
      offensivelySuppressed: true,
    });
  });

  it("recovers stored readiness underneath offensive suppression", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    resolve(harness, [attempt(0, 1)]);
    advanceIndividualCombatActions(
      harness.world,
      harness.identity,
      harness.formation,
      harness.profiles,
      [selectedRecord(1, 0)],
      harness.actions,
    );
    const record = resolve(harness, [attempt(0, 1)]).records[0]!;
    expect(record).toMatchObject({
      defenderActionState: "committingAttack",
      storedGuardReadinessFixedPoint: 8_100,
      effectiveGuardReadinessFixedPoint: 0,
      calculatedDefenceChanceFixedPoint: 1_500,
      readinessRecoveredThisTick: 100,
      offensivelySuppressed: true,
    });
  });

  it("depletes readiness in canonical order for two frontal attackers", () => {
    const harness = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    expect(resolve(harness, [attempt(2, 1), attempt(0, 1)]).records).toEqual([
      expect.objectContaining({
        attackerEntityId: 0,
        effectiveGuardReadinessFixedPoint: 10000,
      }),
      expect.objectContaining({
        attackerEntityId: 2,
        effectiveGuardReadinessFixedPoint: 8000,
      }),
    ]);
  });

  it("orders three attackers canonically by defender then attacker", () => {
    const harness = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 100, 1, "oneHanded", 1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    expect(
      resolve(harness, [attempt(3, 1), attempt(0, 1), attempt(2, 1)]).records.map(
        (record) => record.attackerEntityId,
      ),
    ).toEqual([0, 2, 3]);
  });

  it("produces identical records when input attempt order is reversed", () => {
    const forward = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);
    const reversed = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    expect(resolve(reversed, [attempt(2, 1), attempt(0, 1)]).records).toEqual(
      resolve(forward, [attempt(0, 1), attempt(2, 1)]).records,
    );
  });

  it("restores a regular shield defender fully between twenty-tick attacks", () => {
    const trace = cadenceTrace("regular", 20, 20);
    expect(trace.map((entry) => entry.effective)).toEqual(
      new Array<number>(20).fill(GUARD_READINESS_MAX),
    );
    expect(trace.map((entry) => entry.chance)).toEqual(
      new Array<number>(20).fill(9_500),
    );
    expect(trace.every((entry) => entry.after === 8_000)).toBe(true);
  });

  it("depletes a recruit by ten percentage points per twenty-tick exchange", () => {
    const trace = cadenceTrace("recruit", 20, 10);
    expect(trace.map((entry) => entry.effective)).toEqual([
      10_000, 9_000, 8_000, 7_000, 6_000, 5_000, 4_000, 3_000, 2_000,
      1_000,
    ]);
    expect(trace[9]?.chance).toBe(5_900);
    expect(trace[9]?.after).toBe(0);
  });

  it("depletes a regular by ten percentage points per ten-tick exchange", () => {
    const trace = cadenceTrace("regular", 10, 10);
    expect(trace.map((entry) => entry.effective)).toEqual([
      10_000, 9_000, 8_000, 7_000, 6_000, 5_000, 4_000, 3_000, 2_000,
      1_000,
    ]);
    expect(trace[9]?.chance).toBe(5_900);
    expect(trace[9]?.after).toBe(0);
  });

  it("lets a veteran retain more readiness under the same rapid cadence", () => {
    const regular = cadenceTrace("regular", 10, 10);
    const veteran = cadenceTrace("veteran", 10, 10);
    expect(veteran[9]?.effective).toBe(5_500);
    expect(regular[9]?.effective).toBe(1_000);
    expect(veteran[9]?.chance).toBeGreaterThan(regular[9]?.chance ?? 10_000);
  });

  it("uses stable defender action and facing snapshots for simultaneous attacks", () => {
    const harness = createHarness([
      entity(92, 96, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
      entity(92, 104, 1, "oneHanded", 1),
    ]);

    const records = resolve(harness, [attempt(0, 1), attempt(2, 1)]).records;

    expect(records).toEqual([
      expect.objectContaining({
        defenderActionState: "ready",
        defenderFacingX: -1,
        defenderFacingY: 0,
      }),
      expect.objectContaining({
        defenderActionState: "ready",
        defenderFacingX: -1,
        defenderFacingY: 0,
        guardStateBeforeResolution: "recovering",
      }),
    ]);
  });

  it("keeps northeast and southeast inside an east-facing wrap-around frontal arc", () => {
    const northeast = createHarness([
      entity(108, 92, 1, "oneHanded", -1),
      entity(100, 100, 2, "oneHanded", 1),
    ]);
    const southeast = createHarness([
      entity(108, 108, 1, "oneHanded", -1),
      entity(100, 100, 2, "oneHanded", 1),
    ]);

    expect(resolve(northeast, [attempt(0, 1)]).records[0]).toMatchObject({
      incomingDirectionName: "northeast",
      outcome: "parried",
    });
    expect(resolve(southeast, [attempt(0, 1)]).records[0]).toMatchObject({
      incomingDirectionName: "southeast",
      outcome: "parried",
    });
  });

  it("ignores invalidated attack-attempt records", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);

    expect(resolve(harness, [invalidatedAttempt(0, 1)]).records).toEqual([]);
  });

  it("does not mutate action facing/state, formation heading, movement, pressure, morale or hits", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    const positionsX = Array.from(harness.world.positionsX);
    const positionsY = Array.from(harness.world.positionsY);
    const velocitiesX = Array.from(harness.world.velocitiesX);
    const velocitiesY = Array.from(harness.world.velocitiesY);
    const facing = getIndividualCombatFacing(harness.actions, 1);
    const actionState = getIndividualCombatActionState(harness.actions, 1);
    const heading = getUnitHeading(harness.formation, 2);
    const pressure = getIndividualPressure(harness.formation, 1);

    resolve(harness, [attempt(0, 1)]);

    expect(Array.from(harness.world.positionsX)).toEqual(positionsX);
    expect(Array.from(harness.world.positionsY)).toEqual(positionsY);
    expect(Array.from(harness.world.velocitiesX)).toEqual(velocitiesX);
    expect(Array.from(harness.world.velocitiesY)).toEqual(velocitiesY);
    expect(getIndividualCombatFacing(harness.actions, 1)).toEqual(facing);
    expect(getIndividualCombatActionState(harness.actions, 1)).toBe(actionState);
    expect(getUnitHeading(harness.formation, 2)).toEqual(heading);
    expect(getIndividualPressure(harness.formation, 1)).toBe(pressure);
  });

  it("stores one readiness meter and no second reserve or recovery meter", () => {
    const store = createIndividualMeleeDefenceStore({ entityCount: 2 }) as unknown as
      Record<string, unknown>;
    expect(Object.keys(store).filter((key) => key === "guardReadinessByEntity"))
      .toEqual(["guardReadinessByEntity"]);
    expect(Object.keys(store)).not.toContain("guardStateByEntity");
    expect(Object.keys(store)).not.toContain(
      "defenceRecoveryTicksRemainingByEntity",
    );
  });

  it("reuses output arrays", () => {
    const harness = createHarness([
      entity(92, 100, 1, "oneHanded", 1),
      entity(100, 100, 2, "oneHanded", -1),
    ]);
    const records: IndividualMeleeDefenceRecord[] = [
      {} as IndividualMeleeDefenceRecord,
    ];
    const events: IndividualGuardStateEvent[] = [
      {
        entityId: 99,
        previousGuardState: "ready",
        guardState: "ready",
      },
    ];

    const result = resolveIndividualMeleeDefences(
      harness.world,
      harness.identity,
      harness.formation,
      harness.actions,
      harness.profiles,
      harness.defence,
      [attempt(0, 1)],
      records,
      events,
    );

    expect(result.records).toBe(records);
    expect(result.guardStateEvents).toBe(events);
    expect(records).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("replays deterministically", () => {
    expect(runReplay()).toEqual(runReplay());
  });
});

interface EntityDefinition {
  readonly x: number;
  readonly y: number;
  readonly factionId: number;
  readonly weapon: IndividualWeaponCategory;
  readonly headingX: -1 | 1;
  readonly shieldCategory: IndividualShieldCategory;
  readonly shieldCarriedState: IndividualShieldCarriedState;
  readonly role: "recruit" | "regular" | "veteran";
}

interface DefenceHarness {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly formation: FormationBehaviourStore;
  readonly profiles: IndividualCombatProfileStore;
  readonly actions: IndividualCombatActionStore;
  readonly defence: IndividualMeleeDefenceStore;
  readonly records: IndividualMeleeDefenceRecord[];
  readonly events: IndividualGuardStateEvent[];
}

function entity(
  x: number,
  y: number,
  factionId: number,
  weapon: IndividualWeaponCategory,
  headingX: -1 | 1,
  shieldCategory: IndividualShieldCategory = "none",
  shieldCarriedState: IndividualShieldCarriedState = "none",
  role: "recruit" | "regular" | "veteran" = "regular",
): EntityDefinition {
  return {
    x,
    y,
    factionId,
    weapon,
    headingX,
    shieldCategory,
    shieldCarriedState,
    role,
  };
}

function createHarness(
  definitions: readonly EntityDefinition[],
  battleSeed = 0,
): DefenceHarness {
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
  const identity = createUnitIdentityStore({
    entityCount,
    units: definitions.map((definition, entityId) => ({
      unitId: entityId + 1,
      factionId: definition.factionId,
      memberEntityIds: [entityId],
    })),
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount,
    rngSeed: 0x5c20,
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
    individuals: definitions.map((definition, entityId) => ({
      entityId,
      role: definition.role,
      slotRow: 0,
      slotCol: 0,
      memberMaxStep: 0,
    })),
  });
  const profiles = createIndividualCombatProfileStore({
    entityCount,
    profiles: definitions.map((definition, entityId) =>
      combatProfile(entityId, definition),
    ),
  });
  const actions = createIndividualCombatActionStore(identity, formation, profiles, {
    entityCount,
  });
  return {
    world,
    identity,
    formation,
    profiles,
    actions,
    defence: createIndividualMeleeDefenceStore({ entityCount, battleSeed }),
    records: [],
    events: [],
  };
}

function combatProfile(
  entityId: number,
  definition: EntityDefinition,
): IndividualCombatProfileConfig {
  return {
    entityId,
    primaryWeapon: definition.weapon,
    shieldCategory: definition.shieldCategory,
    shieldCarriedState: definition.shieldCarriedState,
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

function resolve(
  harness: DefenceHarness,
  attempts: readonly IndividualMeleeAttackAttemptRecord[],
) {
  return resolveIndividualMeleeDefences(
    harness.world,
    harness.identity,
    harness.formation,
    harness.actions,
    harness.profiles,
    harness.defence,
    attempts,
    harness.records,
    harness.events,
  );
}

function resolveWithCapability(
  harness: DefenceHarness,
  attempts: readonly IndividualMeleeAttackAttemptRecord[],
  tick: number,
  input: IndividualCombatEnergyCapabilityInput,
) {
  return resolveIndividualMeleeDefences(
    harness.world,
    harness.identity,
    harness.formation,
    harness.actions,
    harness.profiles,
    harness.defence,
    attempts,
    harness.records,
    harness.events,
    undefined,
    tick,
    undefined,
    input,
  );
}

function defenceEnergyCapability(
  entityCount: number,
  startingEnergy: number,
  tick: number,
) {
  const fixture = unprojectedDefenceEnergyCapability(
    entityCount, startingEnergy,
  );
  projectIndividualEnergyCapabilitiesOneTick(
    fixture.capabilities,
    fixture.energy,
    fixture.lifecycle,
    fixture.presence,
    tick,
  );
  return {
    ...fixture,
    input: {
      capabilities: fixture.capabilities,
      tick,
    } as IndividualCombatEnergyCapabilityInput,
  };
}

function unprojectedDefenceEnergyCapability(
  entityCount: number,
  startingEnergy: number,
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
  return {
    energy,
    lifecycle,
    presence,
    capabilities: createIndividualEnergyCapabilityStore(
      entityCount, energy, lifecycle, presence,
    ),
  };
}

function attempt(
  attackerEntityId: number,
  defenderEntityId: number,
  weaponCategory: IndividualWeaponCategory = "oneHanded",
  awkwardDistance = false,
): IndividualMeleeAttackAttemptRecord {
  return {
    attackerEntityId,
    targetEntityId: defenderEntityId,
    weaponCategory,
    commitmentDurationTicks: 3,
    recoveryDurationTicks: 3,
    distanceSquaredAtResolution: 64,
    threatDistance: 12,
    preferredMinimumDistance: 4,
    awkwardDistance,
    facingX: 1,
    facingY: 0,
    outcome: "attempted",
  };
}

function invalidatedAttempt(
  attackerEntityId: number,
  defenderEntityId: number,
): IndividualMeleeAttackAttemptRecord {
  return {
    ...attempt(attackerEntityId, defenderEntityId),
    outcome: "invalidated",
    invalidationReason: "outOfThreatDistance",
  };
}

function selectedRecord(sourceEntityId: number, targetEntityId: number) {
  return {
    sourceEntityId,
    targetEntityId,
    distanceSquared: 64,
    sourceThreatDistance: 12,
    sourcePreferredMinimumDistance: 4,
    targetThreatDistance: 12,
    sourceCanThreatTarget: true,
    targetCanThreatSource: true,
    withinPreferredDistance: true,
    facingEligible: true,
    selectionReason: "nearestValidHostile" as const,
  };
}

function runReplay(): unknown {
  const harness = createHarness([
    entity(92, 96, 1, "oneHanded", 1),
    entity(100, 100, 2, "oneHanded", -1, "shield", "held"),
    entity(92, 104, 1, "oneHanded", 1),
  ]);
  const trace: unknown[] = [];
  for (let tick = 0; tick < 10; tick += 1) {
    const attempts =
      tick % 2 === 0
        ? [attempt(2, 1), attempt(0, 1)]
        : [attempt(0, 1)];
    const result = resolve(harness, attempts);
    trace.push({
      tick,
      records: result.records.map((record) => ({ ...record })),
      events: result.guardStateEvents.map((event) => ({ ...event })),
      guardState: getIndividualGuardState(harness.defence, 1),
      recoveryTicks: getDefenceRecoveryTicksRemaining(harness.defence, 1),
    });
  }
  return trace;
}

function cadenceTrace(
  role: "recruit" | "regular" | "veteran",
  intervalTicks: number,
  attacks: number,
): readonly {
  readonly effective: number;
  readonly chance: number;
  readonly after: number;
}[] {
  const harness = createHarness([
    entity(92, 100, 1, "oneHanded", 1),
    entity(100, 100, 2, "unarmed", -1, "shield", "held", role),
  ]);
  const trace: Array<{ effective: number; chance: number; after: number }> = [];
  for (let attackIndex = 0; attackIndex < attacks; attackIndex += 1) {
    if (attackIndex > 0) {
      for (let tick = 1; tick < intervalTicks; tick += 1) resolve(harness, []);
    }
    const record = resolve(harness, [attempt(0, 1)]).records[0]!;
    trace.push({
      effective: record.effectiveGuardReadinessFixedPoint ?? -1,
      chance: record.calculatedDefenceChanceFixedPoint ?? -1,
      after: getStoredGuardReadinessFixedPoint(harness.defence, 1),
    });
  }
  return trace;
}
