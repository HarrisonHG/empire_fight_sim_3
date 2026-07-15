export type CombatEventVisibilityState = "shown" | "hidden";

export function createInitialCombatEventVisibilityState(): CombatEventVisibilityState {
  return "shown";
}

export function toggleCombatEventVisibility(
  state: CombatEventVisibilityState,
): CombatEventVisibilityState {
  return state === "shown" ? "hidden" : "shown";
}

export function combatEventToggleLabel(
  state: CombatEventVisibilityState,
): string {
  return state === "shown" ? "Hide combat events" : "Show combat events";
}

export function combatEventAriaPressed(
  state: CombatEventVisibilityState,
): "true" | "false" {
  return state === "shown" ? "true" : "false";
}

export function areCombatEventsVisible(
  state: CombatEventVisibilityState,
): boolean {
  return state === "shown";
}
