import type { UnitId } from "./unitIdentity";

/**
 * The small read-only boundary from persistent morale into formation movement.
 * Formation consumes these states but never owns or mutates morale.
 */
export type MoraleMovementState =
  | "steady"
  | "strained"
  | "shaken"
  | "wavering"
  | "routing"
  | "recovering";

export type UnitMoraleMovementStateSource = ReadonlyMap<
  UnitId,
  MoraleMovementState
>;
