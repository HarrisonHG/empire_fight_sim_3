import type { SimulationPlaybackSpeedMultiplier } from "./protocol";

export function simulationPlaybackTickIntervalMs(
  ticksPerSecond: number,
  multiplier: SimulationPlaybackSpeedMultiplier,
): number {
  if (!Number.isFinite(ticksPerSecond) || ticksPerSecond <= 0) {
    throw new RangeError("Playback ticks per second must be positive and finite.");
  }
  return 1_000 / ticksPerSecond / multiplier;
}
