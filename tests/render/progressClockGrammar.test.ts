import { describe, expect, it } from "vitest";

import { createProgressClockGlyphSpec } from "../../src/render/progressClockGrammar";

describe("shared circular progress-clock grammar", () => {
  it("draws partial progress only as a circumference move and arc", () => {
    const clock = createProgressClockGlyphSpec(12, 0.25);
    expect(clock.progressPath.kind).toBe("arc");
    expect(clock.progressPath.commands.map((command) => command.kind)).toEqual([
      "moveTo",
      "arc",
    ]);
    expect(clock.progressPath.commands).not.toContainEqual(
      expect.objectContaining({ kind: "lineTo" }),
    );
    expect(clock.progressPath.commands[0]).toMatchObject({
      kind: "moveTo",
      x: expect.closeTo(0),
      y: -12,
    });
  });

  it("has clean zero and full ring states without a pie wedge", () => {
    expect(createProgressClockGlyphSpec(16, 0).progressPath.commands).toEqual([]);
    expect(createProgressClockGlyphSpec(16, 1).progressPath.commands).toEqual([
      { kind: "circle", radius: 16 },
    ]);
  });
});
