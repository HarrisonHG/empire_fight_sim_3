import {
  PERSONAL_SPACE_OCCUPANCY_CLASS_CODE,
  PERSONAL_SPACE_RESOLUTION_FLAG,
  type PersonalSpaceSpikeDebugSnapshot,
} from "../sim/types";

export interface PersonalSpaceVisualGlyphSpec {
  readonly radius: number;
  readonly footprintColor: number;
  readonly footprintAlpha: number;
  readonly intendedDeltaX: number;
  readonly intendedDeltaY: number;
  readonly resolvedDeltaX: number;
  readonly resolvedDeltaY: number;
  readonly blocked: boolean;
  readonly reduced: boolean;
  readonly redirected: boolean;
  readonly downedSoftCrossing: boolean;
  readonly yieldingEgressYield: boolean;
}

export const PERSONAL_SPACE_VISUAL_COLOR = Object.freeze({
  activeStanding: 0x94_a3_b8,
  downedSoft: 0xf5_b9_42,
  assistedMoving: 0xa7_f3_d0,
  yieldingEgress: 0x22_d3_ee,
  intendedVector: 0xfb_bf_24,
  resolvedVector: 0x4a_de_80,
  blocked: 0xef_44_44,
  reduced: 0xf5_b9_42,
  redirected: 0xc0_84_fc,
} as const);

export function createPersonalSpaceVisualGlyphSpec(
  debug: PersonalSpaceSpikeDebugSnapshot,
  entityId: number,
): PersonalSpaceVisualGlyphSpec {
  if (
    !Number.isSafeInteger(entityId) ||
    entityId < 0 ||
    entityId >= debug.occupancyClassCodes.length
  ) throw new RangeError("Invalid personal-space visual entity ID.");
  const classCode = debug.occupancyClassCodes[entityId]!;
  const flags = debug.resolutionFlags[entityId]!;
  const offset = entityId * 2;
  return {
    radius: debug.radii[entityId]!,
    footprintColor: footprintColor(classCode),
    footprintAlpha:
      classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.downedSoft
        ? 0.45
        : 0.32,
    intendedDeltaX: debug.intendedDeltas[offset]!,
    intendedDeltaY: debug.intendedDeltas[offset + 1]!,
    resolvedDeltaX: debug.resolvedDeltas[offset]!,
    resolvedDeltaY: debug.resolvedDeltas[offset + 1]!,
    blocked: (flags & PERSONAL_SPACE_RESOLUTION_FLAG.blocked) !== 0,
    reduced: (flags & PERSONAL_SPACE_RESOLUTION_FLAG.reduced) !== 0,
    redirected: (flags & PERSONAL_SPACE_RESOLUTION_FLAG.redirected) !== 0,
    downedSoftCrossing:
      (flags & PERSONAL_SPACE_RESOLUTION_FLAG.downedSoftCrossing) !== 0,
    yieldingEgressYield:
      (flags & PERSONAL_SPACE_RESOLUTION_FLAG.yieldingEgressYield) !== 0,
  };
}

function footprintColor(classCode: number): number {
  if (classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.downedSoft) {
    return PERSONAL_SPACE_VISUAL_COLOR.downedSoft;
  }
  if (classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.assistedMoving) {
    return PERSONAL_SPACE_VISUAL_COLOR.assistedMoving;
  }
  if (classCode === PERSONAL_SPACE_OCCUPANCY_CLASS_CODE.yieldingEgress) {
    return PERSONAL_SPACE_VISUAL_COLOR.yieldingEgress;
  }
  return PERSONAL_SPACE_VISUAL_COLOR.activeStanding;
}
