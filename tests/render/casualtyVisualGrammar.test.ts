import { describe, expect, it } from "vitest";

import { createCasualtyVisualGlyphSpec } from "../../src/render/casualtyVisualGrammar";
import type { LiveCombatDebugIndividualSnapshot } from "../../src/sim/types";

describe("casualty world glyph grammar", () => {
  it("maps authoritative free-hand inspection to one or two committed-hand marks", () => {
    expect(spec({ casualtyDragFreeHands: 1 }).committedDragHands).toBe(1);
    expect(spec({ casualtyDragFreeHands: 0 }).committedDragHands).toBe(2);
    expect(spec({}).committedDragHands).toBe(0);
    expect(spec({
      casualtyDragFreeHands: 1,
      casualtyDragGroupPhase: "reachedSafety",
    })).toMatchObject({ committedDragHands: 1, dragPhase: "reachedSafety" });
  });

  it("derives persistent execution completion only from terminal cause", () => {
    expect(spec({ terminalCause: "execution" })).toMatchObject({
      executionCompleted: true,
      executionProgress: 0,
    });
    expect(spec({ terminalCause: "deathCountExpired" }).executionCompleted).toBe(false);
    expect(spec({ executionActionId: 7, executionProgressTicks: 50 })).toMatchObject({
      executionCompleted: false,
      executionProgress: 0.5,
    });
    expect(spec({
      terminalCause: "execution",
      comfortCompletedTick: 2_500,
    })).toMatchObject({ executionCompleted: true, comfortCompleted: true });
  });

  it("shows authoritative execution roles with shared progress and clears them with the action", () => {
    const executor = spec({
      entityId: 7,
      executionActionId: 3,
      executionExecutorEntityId: 7,
      executionTargetEntityId: 8,
      executionProgressTicks: 40,
    });
    const target = spec({
      entityId: 8,
      executionActionId: 3,
      executionExecutorEntityId: 7,
      executionTargetEntityId: 8,
      executionProgressTicks: 40,
    });
    expect(executor).toMatchObject({ executionRole: "executor", executionProgress: 0.4 });
    expect(target).toMatchObject({ executionRole: "target", executionProgress: 0.4 });
    expect(spec({ entityId: 7 })).toMatchObject({
      executionRole: "none",
      executionProgress: 0,
    });
  });

  it("shows death clocks only for the authoritative dying lifecycle", () => {
    expect(spec({
      characterLifecycleState: "dying",
      deathCountDurationTicks: 60,
      deathCountRemainingTicks: 30,
    })).toMatchObject({ deathCountVisible: true, deathCountProgress: 0.5 });
    for (const playerPresenceState of ["respawnEgress", "waitingAtRespawn"] as const) {
      expect(spec({
        characterLifecycleState: "terminal",
        playerPresenceState,
        deathCountDurationTicks: 60,
        deathCountRemainingTicks: 0,
      })).toMatchObject({ deathCountVisible: false, deathCountProgress: 0 });
    }
  });

  it("does not turn cumulative herb-consumption history into a persistent world marker", () => {
    expect(spec({ genericHerbsConsumedHistoryCount: 1 })).toMatchObject({
      consumedHerbsHistory: 1,
      herbInventoryMarker: "none",
    });
    expect(spec({ currentGenericHerbs: 1 }).herbInventoryMarker).toBe("current");
    expect(spec({ currentGenericHerbs: 1, reservedGenericHerbs: 1 })
      .herbInventoryMarker).toBe("reserved");
  });
});

function spec(
  overrides: Partial<LiveCombatDebugIndividualSnapshot>,
): ReturnType<typeof createCasualtyVisualGlyphSpec> {
  return createCasualtyVisualGlyphSpec({
    entityId: 0,
    unitId: 0,
    ...overrides,
  } as LiveCombatDebugIndividualSnapshot);
}
