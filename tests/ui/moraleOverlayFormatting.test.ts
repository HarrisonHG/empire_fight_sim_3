import { describe, expect, it } from "vitest";

import {
  formatMoraleOverlayValues,
  RECOVERY_PROGRESS_REQUIRED,
  ROUTE_RISK_RECOVERY_THRESHOLD,
  ROUTE_RISK_ROUTE_THRESHOLD,
} from "../../src/ui/moraleOverlayFormatting";

describe("morale overlay formatting", () => {
  it("names routing risk and recovery progress with their accepted thresholds", () => {
    expect(ROUTE_RISK_ROUTE_THRESHOLD).toBe(40);
    expect(ROUTE_RISK_RECOVERY_THRESHOLD).toBe(20);
    expect(RECOVERY_PROGRESS_REQUIRED).toBe(240);
    expect(formatMoraleOverlayValues({ routingRisk: 17, recoveryProgress: 96 }))
      .toBe(
        "Route risk 17 (route ≥40; recovery <20), Recovery progress 96/240",
      );
  });

  it("does not describe routing risk as readiness", () => {
    const text = formatMoraleOverlayValues({
      routingRisk: 40,
      recoveryProgress: 240,
    });
    expect(text).not.toMatch(/\bR\b|\bRec\b|readiness/i);
  });
});
