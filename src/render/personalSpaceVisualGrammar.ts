import {
  PERSONAL_SPACE_OCCUPANCY_CLASS_CODE,
  PERSONAL_SPACE_RESOLUTION_FLAG,
  type PersonalSpaceSpikeDebugSnapshot,
} from "../sim/types";

export interface PersonalSpaceVisualGlyphSpec {
  readonly occupancyClassCode: number;
  readonly rightOfWayClassCode: number;
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
  readonly downedSoftAvoidance: boolean;
  readonly assistedGroupInteraction: boolean;
  readonly yieldingEgressYield: boolean;
  readonly principalBlockerId: number;
  readonly principalRelationshipCode: number;
  readonly detourActive: boolean;
  readonly detourPhase: number;
  readonly detourTicksRemaining: number;
  readonly courtesyYieldActive: boolean;
  readonly courtesyBlockerId: number;
  readonly courtesyTicksRemaining: number;
  readonly overtakingActive: boolean;
  readonly overtakeLeaderId: number;
  readonly overtakeSide: number;
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
  detour: 0x60_a5_fa,
  courtesy: 0xf9_a8_d4,
  overtaking: 0x2d_d4_bf,
  downedSoftAvoidance: 0xfb_92_3c,
  assistedGroupInteraction: 0x34_d3_99,
  rightOfWay: 0xe8_f1_ff,
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
    occupancyClassCode: classCode,
    rightOfWayClassCode: debug.rightOfWayClassCodes?.[entityId] ?? 0,
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
    downedSoftAvoidance: debug.downedSoftAvoidanceFlags[entityId] !== 0,
    assistedGroupInteraction:
      debug.assistedGroupInteractionFlags[entityId] !== 0,
    yieldingEgressYield:
      (flags & PERSONAL_SPACE_RESOLUTION_FLAG.yieldingEgressYield) !== 0,
    principalBlockerId: debug.principalBlockerByEntity[entityId]!,
    principalRelationshipCode:
      debug.principalRelationshipCodes[entityId]!,
    detourActive:
      (flags & PERSONAL_SPACE_RESOLUTION_FLAG.detourActive) !== 0,
    detourPhase: debug.detourPhaseCodes[entityId]!,
    detourTicksRemaining: debug.detourTicksRemaining[entityId]!,
    courtesyYieldActive:
      (flags & PERSONAL_SPACE_RESOLUTION_FLAG.courtesyYieldActive) !== 0,
    courtesyBlockerId: debug.courtesyBlockerByEntity[entityId]!,
    courtesyTicksRemaining: debug.courtesyTicksRemaining[entityId]!,
    overtakingActive:
      (flags & PERSONAL_SPACE_RESOLUTION_FLAG.overtakingActive) !== 0,
    overtakeLeaderId: debug.overtakeLeaderByEntity[entityId]!,
    overtakeSide: debug.overtakeSideByEntity[entityId]!,
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
