import { describe, expect, it } from "vitest";

import {
  clampPhysicalGait,
  INDIVIDUAL_PHYSICAL_GAITS,
  physicalGaitCoordinateCeiling,
  physicalGaitRank,
  requestedPhysicalGaitForMaximumStep,
} from "../../src/sim/individualPhysicalGait";

describe("shared individual physical-gait authority", () => {
  it("owns the canonical rank order and never promotes a request", () => {
    expect(INDIVIDUAL_PHYSICAL_GAITS).toEqual([
      "stationary", "walking", "jogging", "sprinting",
    ]);
    expect(INDIVIDUAL_PHYSICAL_GAITS.map(physicalGaitRank)).toEqual([0, 1, 2, 3]);

    for (const requested of INDIVIDUAL_PHYSICAL_GAITS) {
      for (const maximum of INDIVIDUAL_PHYSICAL_GAITS) {
        const effective = clampPhysicalGait(requested, maximum);
        expect(physicalGaitRank(effective)).toBeLessThanOrEqual(
          physicalGaitRank(requested),
        );
        expect(physicalGaitRank(effective)).toBeLessThanOrEqual(
          physicalGaitRank(maximum),
        );
      }
    }
  });

  it("owns the retained coordinate ceilings", () => {
    expect(physicalGaitCoordinateCeiling("stationary")).toBe(0);
    expect(physicalGaitCoordinateCeiling("walking")).toBe(1);
    expect(physicalGaitCoordinateCeiling("jogging")).toBe(2);
    expect(physicalGaitCoordinateCeiling("sprinting")).toBeNull();
  });

  it("maps an already-selected maximum step without changing its authority", () => {
    expect(requestedPhysicalGaitForMaximumStep(0)).toBe("stationary");
    expect(requestedPhysicalGaitForMaximumStep(1)).toBe("walking");
    expect(requestedPhysicalGaitForMaximumStep(2)).toBe("jogging");
    expect(requestedPhysicalGaitForMaximumStep(3)).toBe("sprinting");
    expect(requestedPhysicalGaitForMaximumStep(100)).toBe("sprinting");
    expect(() => requestedPhysicalGaitForMaximumStep(-1)).toThrow(/non-negative/);
    expect(() => requestedPhysicalGaitForMaximumStep(1.5)).toThrow(/non-negative/);
  });
});
