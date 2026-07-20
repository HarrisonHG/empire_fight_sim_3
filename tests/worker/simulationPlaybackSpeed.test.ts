import { describe, expect, it } from "vitest";

import {
  isWorkerCommand,
  isWorkerMessage,
  SIMULATION_PLAYBACK_SPEED_MULTIPLIERS,
} from "../../src/worker/protocol";
import { simulationPlaybackTickIntervalMs } from "../../src/worker/simulationPlaybackClock";
import {
  DEFAULT_VISUAL_TEST_PLAYBACK_SPEED,
  fasterVisualTestPlaybackSpeed,
  slowerVisualTestPlaybackSpeed,
  visualTestPlaybackSpeedLabel,
} from "../../src/ui/visualTestPlaybackSpeed";

describe("visual-test playback speed", () => {
  it("offers bounded slower and faster rates around the production 20-tick clock", () => {
    expect(SIMULATION_PLAYBACK_SPEED_MULTIPLIERS).toEqual([
      0.25, 0.5, 1, 2, 4, 8, 16,
    ]);
    expect(DEFAULT_VISUAL_TEST_PLAYBACK_SPEED).toBe(1);
    expect(simulationPlaybackTickIntervalMs(20, 0.25)).toBe(200);
    expect(simulationPlaybackTickIntervalMs(20, 1)).toBe(50);
    expect(simulationPlaybackTickIntervalMs(20, 16)).toBe(3.125);
  });

  it("moves one deterministic rate step and clamps at both ends", () => {
    expect(slowerVisualTestPlaybackSpeed(1)).toBe(0.5);
    expect(fasterVisualTestPlaybackSpeed(1)).toBe(2);
    expect(slowerVisualTestPlaybackSpeed(0.25)).toBe(0.25);
    expect(fasterVisualTestPlaybackSpeed(16)).toBe(16);
    expect(visualTestPlaybackSpeedLabel(0.25)).toBe("0.25×");
    expect(visualTestPlaybackSpeedLabel(16)).toBe("16×");
  });

  it("accepts only named playback rates across the worker boundary", () => {
    expect(isWorkerCommand({ type: "setSpeed", multiplier: 8 })).toBe(true);
    expect(isWorkerCommand({ type: "setSpeed", multiplier: 3 })).toBe(false);
    expect(isWorkerCommand({ type: "setSpeed", multiplier: Number.NaN })).toBe(false);
    expect(isWorkerMessage({ type: "speed", multiplier: 0.5 })).toBe(true);
    expect(isWorkerMessage({ type: "speed", multiplier: 32 })).toBe(false);
  });

  it("rejects invalid base clocks instead of altering simulation time", () => {
    expect(() => simulationPlaybackTickIntervalMs(0, 1)).toThrow(RangeError);
    expect(() => simulationPlaybackTickIntervalMs(Number.NaN, 1)).toThrow(RangeError);
  });
});
