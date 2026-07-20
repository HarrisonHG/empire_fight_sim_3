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
