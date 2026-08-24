import { describe, expect, it } from "vitest";

import {
  createPersonalSpaceVisualGlyphSpec,
  PERSONAL_SPACE_VISUAL_COLOR,
} from "../../src/render/personalSpaceVisualGrammar";
import {
  PERSONAL_SPACE_OCCUPANCY_CLASS_CODE,
  PERSONAL_SPACE_RESOLUTION_FLAG,
  type PersonalSpaceSpikeDebugSnapshot,
} from "../../src/sim/types";

describe("Milestone 8A personal-space debug grammar", () => {
  it("maps occupancy, vectors, and collision state without inventing authority", () => {
    const debug = fixture();
    expect(createPersonalSpaceVisualGlyphSpec(debug, 0)).toEqual({
      radius: 4,
      footprintColor: PERSONAL_SPACE_VISUAL_COLOR.activeStanding,
      footprintAlpha: 0.32,
      intendedDeltaX: 2,
      intendedDeltaY: 0,
      resolvedDeltaX: 1,
      resolvedDeltaY: -1,
      blocked: false,
      reduced: false,
      redirected: true,
      downedSoftCrossing: false,
      yieldingEgressYield: false,
    });
    expect(createPersonalSpaceVisualGlyphSpec(debug, 1)).toMatchObject({
      radius: 5,
      footprintColor: PERSONAL_SPACE_VISUAL_COLOR.downedSoft,
      footprintAlpha: 0.45,
    });
  });

  it("rejects entity IDs outside the bounded debug arrays", () => {
    expect(() => createPersonalSpaceVisualGlyphSpec(fixture(), 2))
      .toThrow(/Invalid personal-space visual entity ID/);
  });
});

function fixture(): PersonalSpaceSpikeDebugSnapshot {
  return {
    algorithm: "boundedDiscreteCandidateRelaxation",
    standingRadius: 4,
    downedSoftRadius: 5,
    maximumResolutionPasses: 8,
    resolutionPassCount: 2,
    localQueryCount: 4,
    localCandidateCount: 7,
    unresolvedStandingOverlapCount: 0,
    fallbackResetCount: 0,
    blockedCount: 0,
    reducedCount: 0,
    redirectedCount: 1,
    downedSoftCrossingCount: 0,
    yieldingEgressYieldCount: 0,
    occupancyClassCodes: new Uint8Array([
      PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.activeStanding,
      PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.downedSoft,
    ]),
    radii: new Uint8Array([4, 5]),
    intendedDeltas: new Int32Array([2, 0, 0, 0]),
    resolvedDeltas: new Int32Array([1, -1, 0, 0]),
    localNeighbourCounts: new Uint16Array([1, 1]),
    principalRelationshipCodes: new Uint8Array([1, 0]),
    resolutionFlags: new Uint8Array([
      PERSONAL_SPACE_RESOLUTION_FLAG.redirected,
      0,
    ]),
  };
}
