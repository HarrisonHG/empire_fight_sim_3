import { describe, expect, it } from "vitest";

import {
  advanceIndividualDeathCountsOneTick,
  createIndividualDeathCountStore,
  getIndividualCasualtyHistoryInspection,
  getIndividualDeathCountInspection,
  initializeIndividualDeathCountsFromZeroHitTransitions,
  MAX_DEATH_COUNT_TICKS,
  resolveIndividualDeathCountDurationTicks,
  setIndividualDeathCountPaused,
} from "../../src/sim/individualDeathCount";
import {
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  getIndividualTerminalCause,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import { createIndividualCombatProfileStore } from "../../src/sim/individualCombatProfile";

describe("individual death counts", () => {
  it("derives the accepted normal Fortitude durations for ranks 0 through 5", () => {
    expect([0, 1, 2, 3, 4, 5].map((rank) =>
      resolveIndividualDeathCountDurationTicks({ kind: "normalFortitude" }, rank),
    )).toEqual([3, 4, 6, 9, 13, 18].map((minutes) => minutes * 60 * 20));
  });

  it("uses fixed ticks exactly and rejects durations outside Int32 storage", () => {
    expect(resolveIndividualDeathCountDurationTicks(
      { kind: "fixedTicks", durationTicks: 600 },
      99,
    )).toBe(600);
    expect(() => resolveIndividualDeathCountDurationTicks(
      { kind: "fixedTicks", durationTicks: MAX_DEATH_COUNT_TICKS + 1 },
      0,
    )).toThrow(/1 to 2147483647/);
    expect(() => resolveIndividualDeathCountDurationTicks(
      { kind: "normalFortitude" },
      Number.MAX_SAFE_INTEGER,
    )).toThrow(/death-count duration/i);
  });

  it("resolves normal policy from the existing combat-profile Fortitude qualification", () => {
    const harness = createHarness(1, true, 2);
    beginDying(harness, 4);
    expect(getIndividualDeathCountInspection(harness.deathCount, 0)).toEqual({
      durationTicks: 6 * 60 * 20,
      remainingTicks: 6 * 60 * 20,
      paused: false,
    });
  });

  it("preserves the transition tick, pauses without reset, resumes, and terminalises once", () => {
    const harness = createHarness(3);
    beginDying(harness, 7);

    expect(getIndividualDeathCountInspection(harness.deathCount, 0)).toEqual({
      durationTicks: 3,
      remainingTicks: 3,
      paused: false,
    });
    expect(advanceIndividualDeathCountsOneTick(
      harness.deathCount, harness.lifecycle, harness.world, 7, harness.terminalOut,
    )).toEqual([]);
    expect(getIndividualDeathCountInspection(harness.deathCount, 0).remainingTicks).toBe(3);

    advanceIndividualDeathCountsOneTick(
      harness.deathCount, harness.lifecycle, harness.world, 8, harness.terminalOut,
    );
    expect(getIndividualDeathCountInspection(harness.deathCount, 0).remainingTicks).toBe(2);
    advanceIndividualDeathCountsOneTick(
      harness.deathCount, harness.lifecycle, harness.world, 8, harness.terminalOut,
    );
    expect(getIndividualDeathCountInspection(harness.deathCount, 0).remainingTicks).toBe(2);
    setIndividualDeathCountPaused(harness.deathCount, harness.lifecycle, 0, true);
    advanceIndividualDeathCountsOneTick(
      harness.deathCount, harness.lifecycle, harness.world, 9, harness.terminalOut,
    );
    expect(getIndividualDeathCountInspection(harness.deathCount, 0).remainingTicks).toBe(2);
    setIndividualDeathCountPaused(harness.deathCount, harness.lifecycle, 0, false);
    advanceIndividualDeathCountsOneTick(
      harness.deathCount, harness.lifecycle, harness.world, 10, harness.terminalOut,
    );
    expect(getIndividualDeathCountInspection(harness.deathCount, 0).remainingTicks).toBe(1);
    expect(advanceIndividualDeathCountsOneTick(
      harness.deathCount, harness.lifecycle, harness.world, 11, harness.terminalOut,
    )).toEqual([{
      entityId: 0,
      tick: 11,
      previousLifecycleState: "dying",
      lifecycleState: "terminal",
      cause: "deathCountExpired",
      terminalX: 12,
      terminalY: 34,
    }]);
    expect(getIndividualCharacterLifecycleState(harness.lifecycle, 0)).toBe("terminal");
    expect(getIndividualTerminalCause(harness.lifecycle, 0)).toBe("deathCountExpired");
    expect(getIndividualPlayerPresenceState(harness.presence, 0)).toBe("downedPresence");
    expect(advanceIndividualDeathCountsOneTick(
      harness.deathCount, harness.lifecycle, harness.world, 12, harness.terminalOut,
    )).toEqual([]);
    expect(() => setIndividualDeathCountPaused(
      harness.deathCount, harness.lifecycle, 0, false,
    )).toThrow(/only a dying character/i);
    expect(getIndividualCasualtyHistoryInspection(harness.deathCount, 0)).toEqual({
      firstZeroHitTick: 7,
      latestZeroHitTick: 7,
      dyingTransitionCount: 1,
      terminalTick: 11,
      terminalCause: "deathCountExpired",
      terminalX: 12,
      terminalY: 34,
    });
  });
});

function createHarness(
  durationTicks: number,
  normalFortitude = false,
  fortitudeLevels = 5,
) {
  const world = {
    entityCount: 1,
    positionsX: Int32Array.of(12),
    positionsY: Int32Array.of(34),
  };
  const lifecycle = createIndividualCasualtyLifecycleStore(1);
  const presence = createIndividualPlayerPresenceStore(1);
  const procedure = createIndividualCasualtyProcedureProfileStore({
    entityCount: 1,
    profiles: [{
      entityId: 0,
      procedureKind: "citizen",
      deathCountPolicy: normalFortitude
        ? { kind: "normalFortitude" }
        : { kind: "fixedTicks", durationTicks },
    }],
  });
  const combatProfile = createIndividualCombatProfileStore({
    entityCount: 1,
    profiles: [{
      entityId: 0,
      primaryWeapon: "unarmed",
      shieldCategory: "none",
      shieldCarriedState: "none",
      armourCategory: "none",
      hasQualifyingHelmet: false,
      qualifications: {
        hasWeaponMaster: false,
        hasShield: false,
        hasMarksman: false,
        hasThrown: false,
        hasAmbidexterity: false,
        enduranceLevels: 0,
        fortitudeLevels,
        hasDreadnought: false,
      },
      magicalCapabilities: {
        canUseRod: false,
        canUseStaff: false,
        canWearMageArmour: false,
        canDeliverCombatMagic: false,
      },
    }],
  });
  return {
    world,
    lifecycle,
    presence,
    procedure,
    combatProfile,
    deathCount: createIndividualDeathCountStore(1),
    terminalOut: [] as import("../../src/sim/individualDeathCount").IndividualDeathCountTerminalTransitionRecord[],
  };
}

function beginDying(harness: ReturnType<typeof createHarness>, tick: number): void {
  const result = applyIndividualZeroHitLifecycleTransitions(
    harness.lifecycle,
    harness.presence,
    harness.procedure,
    harness.world,
    [{ entityId: 0, attackerEntityId: 0, previousHits: 1 }],
    tick,
  );
  initializeIndividualDeathCountsFromZeroHitTransitions(
    harness.deathCount,
    harness.procedure,
    harness.combatProfile,
    result.transitions,
  );
}
