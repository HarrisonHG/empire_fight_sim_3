import { SimulationWorkerClient } from "../worker/SimulationWorkerClient";
import type { WorkerStatus } from "../worker/protocol";

export class Controls {
  public readonly element: HTMLElement;

  private readonly pauseButton = createButton("Pause", "pause");
  private readonly resumeButton = createButton("Resume", "resume");
  private readonly stepButton = createButton("Step", "step");

  public constructor(private readonly workerClient: SimulationWorkerClient) {
    this.element = document.createElement("section");
    this.element.className = "controls";
    this.element.setAttribute("aria-label", "Simulation controls");
    this.element.append(
      this.pauseButton,
      this.resumeButton,
      this.stepButton,
    );

    this.pauseButton.addEventListener("click", this.handlePause);
    this.resumeButton.addEventListener("click", this.handleResume);
    this.stepButton.addEventListener("click", this.handleStep);
    this.updateWorkerStatus("idle");
  }

  public updateWorkerStatus(status: WorkerStatus): void {
    this.pauseButton.disabled = status !== "running";
    this.resumeButton.disabled = status !== "paused";
    this.stepButton.disabled = status !== "paused";
  }

  public destroy(): void {
    this.pauseButton.removeEventListener("click", this.handlePause);
    this.resumeButton.removeEventListener("click", this.handleResume);
    this.stepButton.removeEventListener("click", this.handleStep);
    this.element.remove();
  }

  private readonly handlePause = (): void => {
    this.workerClient.pause();
  };

  private readonly handleResume = (): void => {
    this.workerClient.resume();
  };

  private readonly handleStep = (): void => {
    this.workerClient.step();
  };
}

function createButton(label: string, testId: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset["testid"] = `${testId}-button`;
  return button;
}
