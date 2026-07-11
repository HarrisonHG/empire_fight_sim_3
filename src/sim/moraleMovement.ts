import type { UnitId } from "./unitIdentity";

/** Shared 4E/4F threshold for a movement segment entering an allied footprint. */
export const ROUTING_PASS_THROUGH_PROXIMITY_DISTANCE = 12;

/** Shared 4E/4G local hostile range for retreat and recovery safety checks. */
export const LOCAL_HOSTILE_THREAT_RADIUS = 192;

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
