export type DebugPanelVisibilityState = "shown" | "hidden";

export interface DebugPanelVisibilitySnapshot {
  readonly metricsPanelHidden: boolean;
  readonly visualTestScenarioPanelHidden: boolean;
  readonly simulationControlsHidden: false;
  readonly canvasHidden: false;
}

export function createInitialDebugPanelVisibilityState(): DebugPanelVisibilityState {
  return "shown";
}

export function toggleDebugPanelVisibility(
  state: DebugPanelVisibilityState,
): DebugPanelVisibilityState {
  return state === "shown" ? "hidden" : "shown";
}

export function debugPanelToggleLabel(
  state: DebugPanelVisibilityState,
): string {
  return state === "shown" ? "Hide debug panels" : "Show debug panels";
}

export function debugPanelAriaExpanded(
  state: DebugPanelVisibilityState,
): "true" | "false" {
  return state === "shown" ? "true" : "false";
}

export function shouldHideDebugPanels(
  state: DebugPanelVisibilityState,
): boolean {
  return state === "hidden";
}

export function describeDebugPanelVisibility(
  state: DebugPanelVisibilityState,
  hasVisualTestScenarioPanel: boolean,
): DebugPanelVisibilitySnapshot {
  const hidden = shouldHideDebugPanels(state);
  return {
    metricsPanelHidden: hidden,
    visualTestScenarioPanelHidden: hasVisualTestScenarioPanel && hidden,
    simulationControlsHidden: false,
    canvasHidden: false,
  };
}
