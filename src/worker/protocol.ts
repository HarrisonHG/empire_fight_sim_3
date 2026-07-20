import type {
  SimulationScenario,
  SimulationSnapshot,
} from "../sim/types";

export interface StartWorkerCommand {
  readonly type: "start";
  readonly scenario: SimulationScenario;
}

export interface ResetWorkerCommand {
  readonly type: "reset";
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

export const SIMULATION_PLAYBACK_SPEED_MULTIPLIERS = Object.freeze([
  0.25,
  0.5,
  1,
  2,
  4,
  8,
  16,
] as const);

export type SimulationPlaybackSpeedMultiplier =
  (typeof SIMULATION_PLAYBACK_SPEED_MULTIPLIERS)[number];

export interface SetSpeedWorkerCommand {
  readonly type: "setSpeed";
  readonly multiplier: SimulationPlaybackSpeedMultiplier;
}

export type WorkerCommand =
  | StartWorkerCommand
  | ResetWorkerCommand
  | PauseWorkerCommand
  | ResumeWorkerCommand
  | StepWorkerCommand
  | SetSpeedWorkerCommand;

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

export interface SpeedWorkerMessage {
  readonly type: "speed";
  readonly multiplier: SimulationPlaybackSpeedMultiplier;
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
  | SpeedWorkerMessage
  | ErrorWorkerMessage;

export function isWorkerCommand(value: unknown): value is WorkerCommand {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return false;
  }

  switch (value["type"]) {
    case "start":
    case "reset":
      return isRecord(value["scenario"]);
    case "pause":
    case "resume":
    case "step":
      return true;
    case "setSpeed":
      return isSimulationPlaybackSpeedMultiplier(value["multiplier"]);
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
    (value["type"] === "speed" &&
      isSimulationPlaybackSpeedMultiplier(value["multiplier"])) ||
    value["type"] === "error"
  );
}

export function isSimulationPlaybackSpeedMultiplier(
  value: unknown,
): value is SimulationPlaybackSpeedMultiplier {
  return typeof value === "number" &&
    SIMULATION_PLAYBACK_SPEED_MULTIPLIERS.includes(
      value as SimulationPlaybackSpeedMultiplier,
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
