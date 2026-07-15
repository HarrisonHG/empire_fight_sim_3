import { describe, expect, it } from "vitest";

import { FOUNDATION_SCENARIO } from "../../src/content/foundationScenario";
import { LIVE_COMBAT_SCENARIO } from "../../src/content/liveCombatScenario";
import type {
  ErrorWorkerMessage,
  MetricsWorkerMessage,
  SnapshotWorkerMessage,
  WorkerMessage,
} from "../../src/worker/protocol";
import { SimulationRunner } from "../../src/worker/SimulationRunner";

describe("SimulationRunner", () => {
  it("publishes faction and combat debug snapshots for the live app scenario", () => {
    const runner = new SimulationRunner(createClock());
    const startMessages = runner.handleCommand({
      type: "start",
      scenario: LIVE_COMBAT_SCENARIO,
    });
    const initialSnapshot = findMessage(startMessages, "snapshot").snapshot;

    expect(initialSnapshot).toMatchObject({
      kind: "initial",
      entityCount: 35,
    });
    if (initialSnapshot.kind !== "initial") {
      throw new Error("Expected initial live-combat snapshot.");
    }
    expect(initialSnapshot.factionIds).toHaveLength(35);
    expect(initialSnapshot.combatDebug?.units).toHaveLength(2);
    expect(initialSnapshot.combatDebug?.units[0]).toMatchObject({
      persistentMoraleState: "steady",
      routingRisk: 0,
      recoveryProgress: 0,
      persistentPressure: 0,
      currentCohesion: expect.any(Number),
    });

    let lastMessages: readonly WorkerMessage[] = [];
    for (let tick = 0; tick < 320; tick += 1) {
      lastMessages = runner.runScheduledTick(0);
    }

    const finalSnapshot = findMessage(lastMessages, "snapshot").snapshot;
    if (finalSnapshot.kind !== "positions") {
      throw new Error("Expected live-combat position snapshot.");
    }
    expect(finalSnapshot.combatDebug).toMatchObject({
      totalAttackAttemptCount: expect.any(Number),
      totalLandedOutcomeCount: expect.any(Number),
      totalGateAcceptedHitCount: expect.any(Number),
      totalAppliedHitLoss: expect.any(Number),
    });
    expect(finalSnapshot.combatDebug?.totalAttackAttemptCount).toBeGreaterThan(0);
    expect(finalSnapshot.combatDebug?.totalLandedOutcomeCount).toBeGreaterThan(0);
    expect(finalSnapshot.combatDebug?.totalGateAcceptedHitCount).toBeGreaterThan(0);
    expect(finalSnapshot.combatDebug?.totalAppliedHitLoss).toBeGreaterThan(0);
    expect(finalSnapshot.combatDebug?.units[0]).toMatchObject({
      persistentMoraleState: expect.any(String),
      routingRisk: expect.any(Number),
      recoveryProgress: expect.any(Number),
      persistentPressure: expect.any(Number),
      currentCohesion: expect.any(Number),
    });
    expect(findMessage(lastMessages, "metrics").snapshotBytes).toBeGreaterThan(
      35 * 2 * Int32Array.BYTES_PER_ELEMENT,
    );
  });

  it("supports start, pause, and resume lifecycle transitions", () => {
    const runner = new SimulationRunner(createClock());

    const startMessages = runner.handleCommand({
      type: "start",
      scenario: FOUNDATION_SCENARIO,
    });
    expect(runner.status).toBe("running");
    expect(runner.tick).toBe(0);
    expect(findMessage(startMessages, "state")).toMatchObject({
      status: "running",
      tick: 0,
    });
    expect(findMessage(startMessages, "snapshot").snapshot.kind).toBe(
      "initial",
    );

    const pauseMessages = runner.handleCommand({ type: "pause" });
    expect(runner.status).toBe("paused");
    expect(findMessage(pauseMessages, "state")).toMatchObject({
      status: "paused",
      tick: 0,
    });
    expect(runner.runScheduledTick(100)).toEqual([]);

    const resumeMessages = runner.handleCommand({ type: "resume" });
    expect(runner.status).toBe("running");
    expect(findMessage(resumeMessages, "state")).toMatchObject({
      status: "running",
      tick: 0,
    });

    const resumedTickMessages = runner.runScheduledTick(0);
    expect(findMessage(resumedTickMessages, "snapshot").snapshot.tick).toBe(1);
    expect(runner.tick).toBe(1);
  });

  it("replaces the simulation deterministically on a second start", () => {
    const runner = new SimulationRunner(createClock());
    const firstStart = runner.handleCommand({
      type: "start",
      scenario: FOUNDATION_SCENARIO,
    });
    const firstSnapshot = findMessage(firstStart, "snapshot");
    const firstPositions = firstSnapshot.snapshot.positions.slice();

    runner.runScheduledTick(0);
    expect(runner.tick).toBe(1);

    const secondStart = runner.handleCommand({
      type: "start",
      scenario: FOUNDATION_SCENARIO,
    });
    const secondSnapshot = findMessage(secondStart, "snapshot");

    expect(runner.tick).toBe(0);
    expect(secondSnapshot.snapshot.kind).toBe("initial");
    expect(secondSnapshot.snapshot.positions).toEqual(firstPositions);
  });

  it("atomically resets to the exact tick-0 snapshot and starts paused", () => {
    const runner = new SimulationRunner(createClock());
    const fresh = runner.handleCommand({
      type: "start",
      scenario: FOUNDATION_SCENARIO,
    });
    const freshSnapshot = findMessage(fresh, "snapshot").snapshot;
    const expected = {
      ...freshSnapshot,
      positions: freshSnapshot.positions.slice(),
      ...(freshSnapshot.kind === "initial"
        ? {
            ids: freshSnapshot.ids.slice(),
            factionIds: freshSnapshot.factionIds?.slice(),
          }
        : {}),
    };
    runner.runScheduledTick(0);

    const reset = runner.handleCommand({
      type: "reset",
      scenario: FOUNDATION_SCENARIO,
    });
    expect(findMessage(reset, "state")).toMatchObject({
      status: "paused",
      tick: 0,
    });
    expect(findMessage(reset, "snapshot").snapshot).toEqual(expected);
    expect(runner.runScheduledTick(100)).toEqual([]);
  });

  it("replays after reset exactly like a fresh paused load", () => {
    const resetRunner = new SimulationRunner(createClock());
    resetRunner.handleCommand({ type: "start", scenario: FOUNDATION_SCENARIO });
    resetRunner.runScheduledTick(0);
    resetRunner.handleCommand({ type: "reset", scenario: FOUNDATION_SCENARIO });

    const freshRunner = new SimulationRunner(createClock());
    freshRunner.handleCommand({ type: "reset", scenario: FOUNDATION_SCENARIO });
    for (let tick = 0; tick < 12; tick += 1) {
      expect(resetRunner.handleCommand({ type: "step" })).toEqual(
        freshRunner.handleCommand({ type: "step" }),
      );
    }
  });

  it("steps exactly once while paused, publishes one result, and stays paused", () => {
    const runner = new SimulationRunner(createClock(10, 10.25));
    runner.handleCommand({ type: "start", scenario: FOUNDATION_SCENARIO });
    runner.handleCommand({ type: "pause" });

    const messages = runner.handleCommand({ type: "step" });
    const snapshots = messages.filter(
      (message): message is SnapshotWorkerMessage =>
        message.type === "snapshot",
    );
    const metrics = messages.filter(
      (message): message is MetricsWorkerMessage => message.type === "metrics",
    );

    expect(snapshots).toHaveLength(1);
    expect(metrics).toHaveLength(1);
    expect(snapshots[0]?.snapshot).toMatchObject({
      kind: "positions",
      tick: 1,
      entityCount: 2_000,
    });
    expect(metrics[0]).toMatchObject({
      tick: 1,
      tickTimeMs: 0.25,
      lagMs: 0,
      snapshotBytes: 16_000,
    });
    expect(findMessage(messages, "state")).toMatchObject({
      status: "paused",
      tick: 1,
    });
    expect(runner.status).toBe("paused");
    expect(runner.tick).toBe(1);
  });

  it("reports scheduled lag as metadata without changing tick distance", () => {
    const runner = new SimulationRunner(createClock(20, 20.5));
    runner.handleCommand({ type: "start", scenario: FOUNDATION_SCENARIO });

    const messages = runner.runScheduledTick(175);

    expect(runner.tick).toBe(1);
    expect(findMessage(messages, "metrics")).toMatchObject({
      tick: 1,
      tickTimeMs: 0.5,
      lagMs: 175,
    });
    expect(findMessage(messages, "snapshot").snapshot.tick).toBe(1);
  });

  it("returns typed errors for invalid lifecycle commands", () => {
    const runner = new SimulationRunner(createClock());

    expectError(runner.handleCommand({ type: "pause" }), "not-started");
    expectError(runner.handleCommand({ type: "resume" }), "not-started");
    expectError(runner.handleCommand({ type: "step" }), "not-started");

    runner.handleCommand({ type: "start", scenario: FOUNDATION_SCENARIO });
    expectError(
      runner.handleCommand({ type: "resume" }),
      "already-running",
    );
    expectError(
      runner.handleCommand({ type: "step" }),
      "step-requires-paused",
    );

    runner.handleCommand({ type: "pause" });
    expectError(
      runner.handleCommand({ type: "pause" }),
      "already-paused",
    );
  });
});

function createClock(...values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values.at(-1) ?? 0;
    index += 1;
    return value;
  };
}

function findMessage<Type extends WorkerMessage["type"]>(
  messages: readonly WorkerMessage[],
  type: Type,
): Extract<WorkerMessage, { readonly type: Type }> {
  const message = messages.find((candidate) => candidate.type === type);
  if (message === undefined) {
    throw new Error(`Expected worker message of type ${type}.`);
  }

  return message as Extract<WorkerMessage, { readonly type: Type }>;
}

function expectError(
  messages: readonly WorkerMessage[],
  code: ErrorWorkerMessage["code"],
): void {
  expect(findMessage(messages, "error")).toMatchObject({ type: "error", code });
}
