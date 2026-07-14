export type ReachOverlayVisibilityState = "shown" | "hidden";

export function createInitialReachOverlayVisibilityState(): ReachOverlayVisibilityState {
  return "shown";
}

export function toggleReachOverlayVisibility(
  state: ReachOverlayVisibilityState,
): ReachOverlayVisibilityState {
  return state === "shown" ? "hidden" : "shown";
}

export function reachOverlayToggleLabel(
  state: ReachOverlayVisibilityState,
): string {
  return state === "shown" ? "Hide reach overlays" : "Show reach overlays";
}

export function reachOverlayAriaPressed(
  state: ReachOverlayVisibilityState,
): "true" | "false" {
  return state === "shown" ? "true" : "false";
}

export function areReachOverlaysVisible(
  state: ReachOverlayVisibilityState,
): boolean {
  return state === "shown";
}
