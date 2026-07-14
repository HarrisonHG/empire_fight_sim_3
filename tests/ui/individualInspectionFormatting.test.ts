import { describe, expect, it } from "vitest";

import type { LiveCombatDebugIndividualSnapshot } from "../../src/sim/types";
import {
  buildIndividualInspectionRows,
  combatRecordTickForSnapshot,
  formatRetainedInspectionEvent,
  shouldClearRetainedInspectionEvents,
} from "../../src/ui/individualInspectionFormatting";

describe("individual inspection formatting", () => {
  it("labels retained events with the combat-record tick for the snapshot", () => {
    const defender = individualSnapshot({
      entityId: 6,
      unitId: 303,
      thisTickDefenceOutcome: "landed",
      thisTickIncomingParryCount: 1,
      thisTickIncomingLandedCount: 1,
    });

    expect(combatRecordTickForSnapshot(6)).toBe(5);
    expect(formatRetainedInspectionEvent(6, defender)).toBe(
      "t5 def:landed in:P1/B0/S0/L1",
    );
  });

  it("retains two-on-one incoming parry and landed evidence after current fields clear", () => {
    const retained = new Map<number, string>([
      [6, "t5 def:landed in:P1/B0/S0/L1"],
    ]);
    const clearedDefender = individualSnapshot({
      entityId: 6,
      unitId: 303,
      thisTickDefenceOutcome: "none",
      thisTickIncomingParryCount: 0,
      thisTickIncomingLandedCount: 0,
    });

    const rows = buildIndividualInspectionRows(
      7,
      [clearedDefender],
      [{ unitId: 303, label: "Overwhelmed parrier" }],
      retained,
    );

    expect(rows).toEqual([
      {
        identity: "E6/U303 Overwhelmed parrier",
        latestEvent: "t5 def:landed in:P1/B0/S0/L1",
      },
    ]);
  });

  it("returns no individual rows when inspection is omitted", () => {
    expect(buildIndividualInspectionRows(12, [], [], new Map())).toEqual([]);
  });

  it("uses unit labels to make inspected rows self-identifying", () => {
    const rows = buildIndividualInspectionRows(
      0,
      [individualSnapshot({ entityId: 0, unitId: 101 })],
      [{ unitId: 101, label: "First defence attacker" }],
      new Map(),
    );

    expect(rows[0]?.identity).toBe("E0/U101 First defence attacker");
  });

  it("clears retained event history on tick-0 reset or omitted inspection", () => {
    expect(shouldClearRetainedInspectionEvents(0, 20)).toBe(true);
    expect(shouldClearRetainedInspectionEvents(5, 0)).toBe(true);
    expect(shouldClearRetainedInspectionEvents(5, 20)).toBe(false);
  });
});

function individualSnapshot(
  overrides: Partial<LiveCombatDebugIndividualSnapshot>,
): LiveCombatDebugIndividualSnapshot {
  return {
    entityId: 0,
    unitId: 101,
    tickStartCombatEligible: true,
    selectedTargetEntityId: null,
    selectedTargetDistanceSquared: null,
    selectedTargetWithinPreferredDistance: null,
    actionState: "ready",
    lockedTargetEntityId: null,
    facing: { x: 1, y: 0 },
    commitmentTicksRemaining: 0,
    attackRecoveryTicksRemaining: 0,
    guardState: "ready",
    defenceRecoveryTicksRemaining: 0,
    activeWeapon: "oneHanded",
    shieldCategory: "none",
    shieldCarriedState: "none",
    currentGlobalHits: 1,
    maximumGlobalHits: 1,
    thisTickAttackOutcome: "none",
    thisTickDefenceOutcome: "none",
    thisTickOutgoingDefenceOutcome: "none",
    thisTickLandedHitGateOutcome: "none",
    thisTickIncomingParryCount: 0,
    thisTickIncomingBucklerBlockCount: 0,
    thisTickIncomingShieldBlockCount: 0,
    thisTickIncomingLandedCount: 0,
    thisTickAppliedHitLoss: 0,
    reachedZeroHitsThisTick: false,
    ...overrides,
  };
}
