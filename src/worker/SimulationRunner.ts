import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../sim/simulation";
import type { SimulationState } from "../sim/types";
import type {
  ErrorWorkerMessage,
  MetricsWorkerMessage,
  StateWorkerMessage,
  WorkerCommand,
  WorkerCommandType,
  WorkerErrorCode,
  WorkerMessage,
  WorkerStatus,
} from "./protocol";

export type MonotonicClock = () => number;

export class SimulationRunner {
  private simulation: SimulationState | undefined;
  private currentStatus: WorkerStatus = "idle";

  public constructor(private readonly clock: MonotonicClock) {}

  public get status(): WorkerStatus {
    return this.currentStatus;
  }

  public get tick(): number | null {
    return this.simulation?.tick ?? null;
  }

  public handleCommand(command: WorkerCommand): readonly WorkerMessage[] {
    switch (command.type) {
      case "start":
        return this.start(command);
      case "pause":
        return this.pause();
      case "resume":
        return this.resume();
      case "step":
        return this.step();
    }
  }

  public runScheduledTick(lagMs: number): readonly WorkerMessage[] {
    if (this.currentStatus !== "running" || this.simulation === undefined) {
      return [];
    }

    return this.advanceOneTick(Math.max(0, lagMs), "scheduled-tick");
  }

  private start(
    command: Extract<WorkerCommand, { readonly type: "start" }>,
  ): readonly WorkerMessage[] {
    try {
      const replacementSimulation = createSimulation(command.scenario);
      this.simulation = replacementSimulation;
      this.currentStatus = "running";

      return [
        this.createStateMessage(),
        {
          type: "snapshot",
          snapshot: createInitialSnapshot(replacementSimulation),
        },
      ];
    } catch (error: unknown) {
      return [
        this.createErrorMessage(
          "simulation-error",
          "start",
          error instanceof Error ? error.message : "Simulation start failed.",
        ),
      ];
    }
  }

  private pause(): readonly WorkerMessage[] {
    if (this.simulation === undefined) {
      return [this.notStartedError("pause")];
    }

    if (this.currentStatus === "paused") {
      return [
        this.createErrorMessage(
          "already-paused",
          "pause",
          "Simulation is already paused.",
        ),
      ];
    }

    this.currentStatus = "paused";
    return [this.createStateMessage()];
  }

  private resume(): readonly WorkerMessage[] {
    if (this.simulation === undefined) {
      return [this.notStartedError("resume")];
    }

    if (this.currentStatus === "running") {
      return [
        this.createErrorMessage(
          "already-running",
          "resume",
          "Simulation is already running.",
        ),
      ];
    }

    this.currentStatus = "running";
    return [this.createStateMessage()];
  }

  private step(): readonly WorkerMessage[] {
    if (this.simulation === undefined) {
      return [this.notStartedError("step")];
    }

    if (this.currentStatus !== "paused") {
      return [
        this.createErrorMessage(
          "step-requires-paused",
          "step",
          "Simulation must be paused before stepping.",
        ),
      ];
    }

    const tickMessages = this.advanceOneTick(0, "step");
    if (tickMessages.some((message) => message.type === "state")) {
      return tickMessages;
    }

    return [...tickMessages, this.createStateMessage()];
  }

  private advanceOneTick(
    lagMs: number,
    operation: "step" | "scheduled-tick",
  ): readonly WorkerMessage[] {
    const simulation = this.simulation;
    if (simulation === undefined) {
      return [this.notStartedError("step")];
    }

    try {
      const startedAt = this.clock();
      advanceSimulationOneTick(simulation);
      const tickTimeMs = Math.max(0, this.clock() - startedAt);
      const snapshot = createPositionSnapshot(simulation);
      const metrics: MetricsWorkerMessage = {
        type: "metrics",
        tick: simulation.tick,
        tickTimeMs,
        lagMs,
        snapshotBytes: snapshot.positions.byteLength,
      };

      return [
        { type: "snapshot", snapshot },
        metrics,
      ];
    } catch (error: unknown) {
      this.currentStatus = "paused";
      return [
        this.createErrorMessage(
          "simulation-error",
          operation,
          error instanceof Error ? error.message : "Simulation tick failed.",
        ),
        this.createStateMessage(),
      ];
    }
  }

  private createStateMessage(): StateWorkerMessage {
    return {
      type: "state",
      status: this.currentStatus,
      tick: this.tick,
    };
  }

  private notStartedError(command: WorkerCommandType): ErrorWorkerMessage {
    return this.createErrorMessage(
      "not-started",
      command,
      "Simulation has not been started.",
    );
  }

  private createErrorMessage(
    code: WorkerErrorCode,
    command: ErrorWorkerMessage["command"],
    message: string,
  ): ErrorWorkerMessage {
    return {
      type: "error",
      code,
      command,
      message,
    };
  }
}
