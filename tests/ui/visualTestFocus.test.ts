import { describe, expect, it } from "vitest";

import {
  CASUALTY_LIFECYCLE_VISUAL_CHAMBERS,
  CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
} from "../../src/content/casualtyLifecycleVisualScenario";
import { findVisualTestEntry } from "../../src/content/visualTestRegistry";
import type { LiveCombatDebugIndividualSnapshot } from "../../src/sim/types";
import { SimulationRunner } from "../../src/worker/SimulationRunner";
import {
  filterIndividualInspectionByFocus,
  isVisualTestFocusSelected,
  selectVisualTestFocus,
} from "../../src/ui/visualTestFocus";

describe("casualty chamber inspection focus", () => {
  it("carries canonical chamber entity IDs and filters only presentation rows", () => {
    const entry = findVisualTestEntry("casualty-lifecycle")!;
    expect(entry.focusAreas?.map((area) => area.entityIds)).toEqual(
      CASUALTY_LIFECYCLE_VISUAL_CHAMBERS.map((area) => area.entityIds),
    );
    const chamber = entry.focusAreas![6]!;
    const selection = selectVisualTestFocus(chamber);
    const allRows = Array.from({ length: 24 }, (_, entityId) => ({
      entityId,
      unitId: entityId,
    } as LiveCombatDebugIndividualSnapshot));
    expect(filterIndividualInspectionByFocus(allRows, selection)
      .map((row) => row.entityId)).toEqual([14, 15]);
    expect(isVisualTestFocusSelected(selection, 7)).toBe(true);
    expect(isVisualTestFocusSelected(selection, "all")).toBe(false);
    expect(allRows).toHaveLength(24);
  });

  it("clears the filter with All chambers", () => {
    const rows = [
      { entityId: 14 },
      { entityId: 15 },
      { entityId: 19 },
    ] as LiveCombatDebugIndividualSnapshot[];
    const all = selectVisualTestFocus();
    expect(filterIndividualInspectionByFocus(rows, all)).toBe(rows);
    expect(isVisualTestFocusSelected(all, "all")).toBe(true);
  });

  it("preserves the selected chamber across deterministic reset", () => {
    const entry = findVisualTestEntry("casualty-lifecycle")!;
    const selection = selectVisualTestFocus(entry.focusAreas![8]);
    const runner = new SimulationRunner(() => 0);
    runner.handleCommand({ type: "start", scenario: CASUALTY_LIFECYCLE_VISUAL_SCENARIO });
    runner.handleCommand({ type: "step" });
    const reset = runner.handleCommand({
      type: "reset",
      scenario: entry.scenarioFactory(),
    });
    const snapshot = reset.find((message) => message.type === "snapshot");
    expect(selection).toEqual({ id: 9, entityIds: [19] });
    expect(snapshot).toMatchObject({ type: "snapshot", snapshot: { tick: 0 } });
    if (snapshot?.type !== "snapshot") throw new Error("Missing reset snapshot.");
    expect(filterIndividualInspectionByFocus(
      snapshot.snapshot.combatDebug?.inspectedIndividuals ?? [],
      selection,
    ).map((row) => row.entityId)).toEqual([19]);
  });
});
