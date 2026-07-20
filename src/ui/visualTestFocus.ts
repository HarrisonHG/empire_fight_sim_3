import type { VisualTestFocusArea } from "../content/visualTestRegistry";
import type { LiveCombatDebugIndividualSnapshot } from "../sim/types";

export type VisualTestFocusSelection = Readonly<{
  id: number | "all";
  entityIds?: readonly number[];
}>;

export function selectVisualTestFocus(
  area?: Pick<VisualTestFocusArea, "id" | "entityIds">,
): VisualTestFocusSelection {
  return area === undefined
    ? Object.freeze({ id: "all" as const })
    : Object.freeze({
        id: area.id,
        entityIds: Object.freeze(area.entityIds.slice()),
      });
}

export function filterIndividualInspectionByFocus(
  individuals: readonly LiveCombatDebugIndividualSnapshot[],
  selection: VisualTestFocusSelection,
): readonly LiveCombatDebugIndividualSnapshot[] {
  if (selection.id === "all") return individuals;
  const selectedIds = new Set(selection.entityIds);
  return individuals.filter((individual) => selectedIds.has(individual.entityId));
}

export function isVisualTestFocusSelected(
  selection: VisualTestFocusSelection,
  id: number | "all",
): boolean {
  return selection.id === id;
}
