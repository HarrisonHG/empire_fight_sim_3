import {
  SIMULATION_PLAYBACK_SPEED_MULTIPLIERS,
  type SimulationPlaybackSpeedMultiplier,
} from "../worker/protocol";

export const DEFAULT_VISUAL_TEST_PLAYBACK_SPEED: SimulationPlaybackSpeedMultiplier = 1;

export function slowerVisualTestPlaybackSpeed(
  current: SimulationPlaybackSpeedMultiplier,
): SimulationPlaybackSpeedMultiplier {
  const index = SIMULATION_PLAYBACK_SPEED_MULTIPLIERS.indexOf(current);
  return SIMULATION_PLAYBACK_SPEED_MULTIPLIERS[Math.max(0, index - 1)]!;
}

export function fasterVisualTestPlaybackSpeed(
  current: SimulationPlaybackSpeedMultiplier,
): SimulationPlaybackSpeedMultiplier {
  const index = SIMULATION_PLAYBACK_SPEED_MULTIPLIERS.indexOf(current);
  return SIMULATION_PLAYBACK_SPEED_MULTIPLIERS[
    Math.min(SIMULATION_PLAYBACK_SPEED_MULTIPLIERS.length - 1, index + 1)
  ]!;
}

export function visualTestPlaybackSpeedLabel(
  speed: SimulationPlaybackSpeedMultiplier,
): string {
  return `${speed}×`;
}
