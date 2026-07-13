import { describe, expect, it } from "vitest";

import {
  VISUAL_TEST_REGISTRY,
  visualTestHref,
} from "../../src/content/visualTestRegistry";
import { LIVE_COMBAT_SCENARIO } from "../../src/content/liveCombatScenario";
import { resolveApplicationRoute } from "../../src/ui/applicationRoute";
import { buildVisualTestMenuItems } from "../../src/ui/visualTestMenuItems";

describe("visual test application routing", () => {
  it("selects the evolving trunk application at root", () => {
    expect(resolveApplicationRoute("/", "")).toEqual({ kind: "trunk" });
  });

  it("selects the menu without a scenario", () => {
    expect(resolveApplicationRoute("/test", "")).toEqual({
      kind: "visual-test-menu",
    });
  });

  it.each(VISUAL_TEST_REGISTRY)("resolves $id", (entry) => {
    expect(resolveApplicationRoute("/test", `?scenario=${entry.id}`)).toEqual({
      kind: "visual-test-scenario",
      entry,
    });
  });

  it("returns a visible menu error for unknown IDs instead of falling back", () => {
    expect(resolveApplicationRoute("/test", "?scenario=missing")).toEqual({
      kind: "visual-test-menu",
      error: "Unknown visual test scenario: missing",
    });
  });

  it("keeps registry IDs unique and menu links derived from those IDs", () => {
    const ids = VISUAL_TEST_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildVisualTestMenuItems(VISUAL_TEST_REGISTRY).map((item) => item.href))
      .toEqual(ids.map(visualTestHref));
  });

  it("keeps the archived Milestone 3 combat fixture isolated from current scenarios", () => {
    expect(LIVE_COMBAT_SCENARIO.combatSandbox).toBeDefined();
    expect(LIVE_COMBAT_SCENARIO.legacyCombatFoundationSandbox).toBeUndefined();

    const legacyEntries = VISUAL_TEST_REGISTRY.filter(
      (entry) => entry.scenario.legacyCombatFoundationSandbox !== undefined,
    );
    expect(legacyEntries.map((entry) => entry.id)).toEqual([
      "combat-foundation",
    ]);
    expect(legacyEntries[0]?.scenario.combatSandbox).toBeUndefined();

    for (const entry of VISUAL_TEST_REGISTRY) {
      if (entry.id === "combat-foundation") continue;
      expect(entry.scenario.legacyCombatFoundationSandbox).toBeUndefined();
    }
  });
});
