export type IndividualPhysicalGait =
  | "stationary"
  | "walking"
  | "jogging"
  | "sprinting";

export type IndividualSpecialistMovementAuthority =
  | "casualtyGathering"
  | "activeDragHelper"
  | "medicalApproach"
  | "traumaWithdrawal";

export const INDIVIDUAL_PHYSICAL_GAITS:
  readonly IndividualPhysicalGait[] = Object.freeze([
    "stationary", "walking", "jogging", "sprinting",
  ]);

export function physicalGaitRank(gait: IndividualPhysicalGait): number {
  return gait === "stationary"
    ? 0
    : gait === "walking"
      ? 1
      : gait === "jogging"
        ? 2
        : 3;
}

export function clampPhysicalGait(
  requested: IndividualPhysicalGait,
  maximum: IndividualPhysicalGait,
): IndividualPhysicalGait {
  return physicalGaitRank(requested) <= physicalGaitRank(maximum)
    ? requested
    : maximum;
}

/** Sprinting retains the movement authority's already-selected step. */
export function physicalGaitCoordinateCeiling(
  gait: IndividualPhysicalGait,
): number | null {
  if (gait === "stationary") return 0;
  if (gait === "walking") return 1;
  if (gait === "jogging") return 2;
  return null;
}

export function requestedPhysicalGaitForMaximumStep(
  maximumStep: number,
): IndividualPhysicalGait {
  if (!Number.isSafeInteger(maximumStep) || maximumStep < 0) {
    throw new RangeError("Physical gait maximum step must be non-negative.");
  }
  if (maximumStep === 0) return "stationary";
  if (maximumStep === 1) return "walking";
  if (maximumStep === 2) return "jogging";
  return "sprinting";
}

export function requiredPhysicalGaitTicksToCoordinate(
  startX: number,
  startY: number,
  destinationX: number,
  destinationY: number,
  maximumStep: number,
): number {
  if (!Number.isSafeInteger(startX) || !Number.isSafeInteger(startY) ||
      !Number.isSafeInteger(destinationX) ||
      !Number.isSafeInteger(destinationY) ||
      !Number.isSafeInteger(maximumStep) || maximumStep <= 0) {
    throw new RangeError(
      "Physical gait geometry must use safe integer coordinates and a positive step.",
    );
  }
  const distance = Math.max(
    Math.abs(destinationX - startX),
    Math.abs(destinationY - startY),
  );
  if (!Number.isSafeInteger(distance)) {
    throw new RangeError("Physical gait distance exceeds safe integer range.");
  }
  return Math.ceil(distance / maximumStep);
}

export function requiredPhysicalGaitTicksToContact(
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  maximumStep: number,
  contactRange: number,
): number {
  if (!Number.isSafeInteger(contactRange) || contactRange < 0) {
    throw new RangeError(
      "Physical gait contact range must be a non-negative safe integer.",
    );
  }
  let minimumTicks = 0;
  let maximumTicks = requiredPhysicalGaitTicksToCoordinate(
    startX,
    startY,
    targetX,
    targetY,
    maximumStep,
  );
  const deltaX = Math.abs(targetX - startX);
  const deltaY = Math.abs(targetY - startY);
  const contactRangeSquared = contactRange * contactRange;
  while (minimumTicks < maximumTicks) {
    const candidateTicks = Math.floor((minimumTicks + maximumTicks) / 2);
    const remainingX = Math.max(0, deltaX - candidateTicks * maximumStep);
    const remainingY = Math.max(0, deltaY - candidateTicks * maximumStep);
    if (remainingX * remainingX + remainingY * remainingY <=
        contactRangeSquared) {
      maximumTicks = candidateTicks;
    } else {
      minimumTicks = candidateTicks + 1;
    }
  }
  return minimumTicks;
}

export interface IndividualSpecialistPhysicalGaitAdapter {
  readonly entityCount: number;
  readonly acceptedProjectionTick: number | null;
  acceptCapabilityProjection(tick: number): void;
  validateCurrentTick(): void;
  preflightActiveSpecialistMovement(
    entityId: number,
    authority: IndividualSpecialistMovementAuthority,
    requestedGait: IndividualPhysicalGait,
    requiredSprintTicks: number,
  ): IndividualPhysicalGait;
  constrainPreflightedActiveDragHelperGait(
    entityId: number,
    requestedGait: IndividualPhysicalGait,
    groupEffectiveGait: IndividualPhysicalGait,
  ): void;
  completeActiveSpecialistMovement(
    entityId: number,
    authority: IndividualSpecialistMovementAuthority,
    requestedGait: IndividualPhysicalGait,
    actualGaitWhenDisplaced: IndividualPhysicalGait,
    producedDisplacement: boolean,
  ): void;
  preflightRespawnEgressMovement(entityId: number): IndividualPhysicalGait;
  completeRespawnEgressMovement(
    entityId: number,
    actualGaitWhenDisplaced: IndividualPhysicalGait,
    producedDisplacement: boolean,
  ): void;
  preflightDraggedPatientMovement(entityId: number): IndividualPhysicalGait;
  completeDraggedPatientMovement(
    entityId: number,
    producedDisplacement: boolean,
  ): void;
}
