import type {
  SimulationScenario,
  SimulationSnapshot,
} from "../sim/types";

export interface StartWorkerCommand {
  readonly type: "start";
  readonly scenario: SimulationScenario;
}

export interface PauseWorkerCommand {
  readonly type: "pause";
}

export interface ResumeWorkerCommand {
  readonly type: "resume";
}

export interface StepWorkerCommand {
  readonly type: "step";
}

export type WorkerCommand =
  | StartWorkerCommand
  | PauseWorkerCommand
  | ResumeWorkerCommand
  | StepWorkerCommand;

export type WorkerCommandType = WorkerCommand["type"];
export type WorkerStatus = "idle" | "running" | "paused";

export interface ReadyWorkerMessage {
  readonly type: "ready";
}

export interface StateWorkerMessage {
  readonly type: "state";
  readonly status: WorkerStatus;
  readonly tick: number | null;
}

export interface SnapshotWorkerMessage {
  readonly type: "snapshot";
  readonly snapshot: SimulationSnapshot;
}

export interface MetricsWorkerMessage {
  readonly type: "metrics";
  readonly tick: number;
  readonly tickTimeMs: number;
  readonly lagMs: number;
  readonly snapshotBytes: number;
}

export type WorkerErrorCode =
  | "not-started"
  | "already-running"
  | "already-paused"
  | "step-requires-paused"
  | "invalid-command"
  | "simulation-error";

export interface ErrorWorkerMessage {
  readonly type: "error";
  readonly code: WorkerErrorCode;
  readonly command: WorkerCommandType | "scheduled-tick" | "unknown";
  readonly message: string;
}

export type WorkerMessage =
  | ReadyWorkerMessage
  | StateWorkerMessage
  | SnapshotWorkerMessage
  | MetricsWorkerMessage
  | ErrorWorkerMessage;

export function isWorkerCommand(value: unknown): value is WorkerCommand {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return false;
  }

  switch (value["type"]) {
    case "start":
      return isRecord(value["scenario"]);
    case "pause":
    case "resume":
    case "step":
      return true;
    default:
      return false;
  }
}

export function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return false;
  }

  return (
    value["type"] === "ready" ||
    value["type"] === "state" ||
    value["type"] === "snapshot" ||
    value["type"] === "metrics" ||
    value["type"] === "error"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
