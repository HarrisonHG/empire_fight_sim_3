export const PROGRESS_CLOCK_START_ANGLE = -Math.PI / 2;

export type ProgressClockProgressPath =
  | Readonly<{ readonly kind: "none" }>
  | Readonly<{ readonly kind: "circle"; readonly radius: number }>
  | Readonly<{
      readonly kind: "arc";
      readonly radius: number;
      readonly startAngle: number;
      readonly endAngle: number;
      readonly startX: number;
      readonly startY: number;
    }>;

export interface ProgressClockGlyphSpec {
  readonly radius: number;
  readonly progress: number;
  readonly progressPath: ProgressClockProgressPath;
}

/**
 * Shared outline-and-ring grammar for timed world-space actions. Partial
 * progress begins on the circumference so renderers never imply a pie wedge.
 */
export function createProgressClockGlyphSpec(
  radius: number,
  progress: number,
): ProgressClockGlyphSpec {
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("Progress-clock radius must be positive and finite.");
  }
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped === 0) {
    return Object.freeze({
      radius,
      progress: clamped,
      progressPath: Object.freeze({ kind: "none" as const }),
    });
  }
  if (clamped === 1) {
    return Object.freeze({
      radius,
      progress: clamped,
      progressPath: Object.freeze({ kind: "circle" as const, radius }),
    });
  }
  return Object.freeze({
    radius,
    progress: clamped,
    progressPath: Object.freeze({
      kind: "arc" as const,
      radius,
      startAngle: PROGRESS_CLOCK_START_ANGLE,
      endAngle: PROGRESS_CLOCK_START_ANGLE + Math.PI * 2 * clamped,
      startX: Math.cos(PROGRESS_CLOCK_START_ANGLE) * radius,
      startY: Math.sin(PROGRESS_CLOCK_START_ANGLE) * radius,
    }),
  });
}
