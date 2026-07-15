import type { LiveCombatDebugUnitSnapshot } from "../sim/types";

export const ROUTE_RISK_ROUTE_THRESHOLD = 40;
export const ROUTE_RISK_RECOVERY_THRESHOLD = 20;
export const RECOVERY_PROGRESS_REQUIRED = 240;

export function formatMoraleOverlayValues(
  unit: Pick<LiveCombatDebugUnitSnapshot, "routingRisk" | "recoveryProgress">,
): string {
  return (
    `Route risk ${unit.routingRisk} ` +
    `(route ≥${ROUTE_RISK_ROUTE_THRESHOLD}; recovery <${ROUTE_RISK_RECOVERY_THRESHOLD}), ` +
    `Recovery progress ${unit.recoveryProgress}/${RECOVERY_PROGRESS_REQUIRED}`
  );
}
