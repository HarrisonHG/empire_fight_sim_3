/// <reference lib="webworker" />

import { FIXED_TICKS_PER_SECOND } from "../sim/simulation";
import { isWorkerCommand, type WorkerMessage } from "./protocol";
import { SimulationRunner } from "./SimulationRunner";

const TICK_INTERVAL_MS = 1_000 / FIXED_TICKS_PER_SECOND;
const MAX_CATCH_UP_TICKS_PER_CALLBACK = 5;
const workerScope = self as DedicatedWorkerGlobalScope;
const monotonicNow = (): number => performance.now();
const runner = new SimulationRunner(monotonicNow);

let accumulatedMs = 0;
let lastClockSample: number | undefined;
let scheduledCallback: number | undefined;

workerScope.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isWorkerCommand(event.data)) {
    publish({
      type: "error",
      code: "invalid-command",
      command: "unknown",
      message: "Worker received an invalid command.",
    });
    return;
  }

  const command = event.data;
  const messages = runner.handleCommand(command);
  publishAll(messages);

  if (messages.some((message) => message.type === "error")) {
    return;
  }

  switch (command.type) {
    case "start":
    case "resume":
      restartSchedulerClock();
      break;
    case "pause":
      stopScheduler();
      break;
    case "step":
      break;
  }
});

publish({ type: "ready" });

function runSchedulerCallback(): void {
  scheduledCallback = undefined;

  if (runner.status !== "running") {
    stopScheduler();
    return;
  }

  const now = monotonicNow();
  const previousSample = lastClockSample ?? now;
  accumulatedMs += Math.max(0, now - previousSample);
  lastClockSample = now;

  let completedTicks = 0;
  while (
    accumulatedMs >= TICK_INTERVAL_MS &&
    completedTicks < MAX_CATCH_UP_TICKS_PER_CALLBACK &&
    runner.status === "running"
  ) {
    accumulatedMs -= TICK_INTERVAL_MS;
    publishAll(runner.runScheduledTick(accumulatedMs));
    completedTicks += 1;
  }

  if (runner.status === "running") {
    scheduleNextCallback();
  } else {
    stopScheduler();
  }
}

function restartSchedulerClock(): void {
  cancelScheduledCallback();
  accumulatedMs = 0;
  lastClockSample = monotonicNow();
  scheduleNextCallback();
}

function stopScheduler(): void {
  cancelScheduledCallback();
  accumulatedMs = 0;
  lastClockSample = undefined;
}

function scheduleNextCallback(): void {
  if (scheduledCallback !== undefined || runner.status !== "running") {
    return;
  }

  const delayMs =
    accumulatedMs >= TICK_INTERVAL_MS
      ? 0
      : Math.max(0, TICK_INTERVAL_MS - accumulatedMs);
  scheduledCallback = workerScope.setTimeout(runSchedulerCallback, delayMs);
}

function cancelScheduledCallback(): void {
  if (scheduledCallback === undefined) {
    return;
  }

  workerScope.clearTimeout(scheduledCallback);
  scheduledCallback = undefined;
}

function publishAll(messages: readonly WorkerMessage[]): void {
  for (const message of messages) {
    publish(message);
  }
}

function publish(message: WorkerMessage): void {
  workerScope.postMessage(message);
}
