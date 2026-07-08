import type { SimulationScenario } from "../sim/types";
import {
  isWorkerMessage,
  type WorkerCommand,
  type WorkerMessage,
} from "./protocol";

export type WorkerMessageListener = (message: WorkerMessage) => void;

export class SimulationWorkerClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<WorkerMessageListener>();

  public constructor(worker?: Worker) {
    this.worker =
      worker ??
      new Worker(new URL("./simulation.worker.ts", import.meta.url), {
        type: "module",
      });
    this.worker.addEventListener("message", this.handleMessage);
  }

  public start(scenario: SimulationScenario): void {
    this.send({ type: "start", scenario });
  }

  public pause(): void {
    this.send({ type: "pause" });
  }

  public resume(): void {
    this.send({ type: "resume" });
  }

  public step(): void {
    this.send({ type: "step" });
  }

  public subscribe(listener: WorkerMessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    this.worker.removeEventListener("message", this.handleMessage);
    this.listeners.clear();
    this.worker.terminate();
  }

  private readonly handleMessage = (event: MessageEvent<unknown>): void => {
    if (!isWorkerMessage(event.data)) {
      return;
    }

    for (const listener of this.listeners) {
      listener(event.data);
    }
  };

  private send(command: WorkerCommand): void {
    this.worker.postMessage(command);
  }
}
