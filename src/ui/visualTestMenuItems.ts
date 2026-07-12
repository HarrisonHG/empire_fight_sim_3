import {
  visualTestHref,
  type VisualTestEntry,
} from "../content/visualTestRegistry";

export interface VisualTestMenuItem {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly milestone: string;
  readonly purpose: string;
  readonly expectedObservations: readonly string[];
  readonly tickRangeLabel: string;
}

export function buildVisualTestMenuItems(
  entries: readonly VisualTestEntry[],
): readonly VisualTestMenuItem[] {
  return entries.map((entry) => ({
    id: entry.id,
    href: visualTestHref(entry.id),
    title: entry.title,
    milestone: entry.milestone,
    purpose: entry.purpose,
    expectedObservations: entry.expectedObservations,
    tickRangeLabel: `${entry.recommendedTickRange.start}-${entry.recommendedTickRange.end}`,
  }));
}
