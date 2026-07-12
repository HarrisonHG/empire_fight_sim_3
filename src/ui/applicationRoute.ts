import {
  findVisualTestEntry,
  type VisualTestEntry,
} from "../content/visualTestRegistry";

export type ApplicationRoute =
  | { readonly kind: "trunk" }
  | { readonly kind: "visual-test-menu"; readonly error?: string }
  | { readonly kind: "visual-test-scenario"; readonly entry: VisualTestEntry };

export function resolveApplicationRoute(
  pathname: string,
  search: string,
): ApplicationRoute {
  if (pathname !== "/test" && pathname !== "/test/") {
    return { kind: "trunk" };
  }
  const scenarioId = new URLSearchParams(search).get("scenario");
  if (scenarioId === null || scenarioId.length === 0) {
    return { kind: "visual-test-menu" };
  }
  const entry = findVisualTestEntry(scenarioId);
  return entry === undefined
    ? {
        kind: "visual-test-menu",
        error: `Unknown visual test scenario: ${scenarioId}`,
      }
    : { kind: "visual-test-scenario", entry };
}
