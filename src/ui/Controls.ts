import { SimulationWorkerClient } from "../worker/SimulationWorkerClient";
import type { WorkerStatus } from "../worker/protocol";
import {
  debugPanelAriaExpanded,
  debugPanelToggleLabel,
  toggleDebugPanelVisibility,
  type DebugPanelVisibilityState,
} from "./debugPanelVisibility";

export interface DebugPanelVisibilityBinding {
  readonly getState: () => DebugPanelVisibilityState;
  readonly setState: (state: DebugPanelVisibilityState) => void;
}

export class Controls {
  public readonly element: HTMLElement;

  private readonly pauseButton = createButton("Pause", "pause");
  private readonly resumeButton = createButton("Resume", "resume");
  private readonly stepButton = createButton("Step", "step");
  private readonly debugPanelsButton = createButton(
    "Hide debug panels",
    "debug-panels-toggle",
  );

  public constructor(
    private readonly workerClient: SimulationWorkerClient,
    private readonly debugPanelVisibility?: DebugPanelVisibilityBinding,
  ) {
    this.element = document.createElement("section");
    this.element.className = "controls";
    this.element.setAttribute("aria-label", "Simulation controls");
    this.element.append(
      this.pauseButton,
      this.resumeButton,
      this.stepButton,
      this.debugPanelsButton,
    );

    this.pauseButton.addEventListener("click", this.handlePause);
    this.resumeButton.addEventListener("click", this.handleResume);
    this.stepButton.addEventListener("click", this.handleStep);
    this.debugPanelsButton.addEventListener("click", this.handleToggleDebugPanels);
    this.updateDebugPanelButton();
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
    this.debugPanelsButton.removeEventListener(
      "click",
      this.handleToggleDebugPanels,
    );
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

  private readonly handleToggleDebugPanels = (): void => {
    const binding = this.debugPanelVisibility;
    if (binding === undefined) {
      return;
    }
    binding.setState(toggleDebugPanelVisibility(binding.getState()));
    this.updateDebugPanelButton();
  };

  private updateDebugPanelButton(): void {
    const state = this.debugPanelVisibility?.getState() ?? "shown";
    this.debugPanelsButton.textContent = debugPanelToggleLabel(state);
    this.debugPanelsButton.setAttribute(
      "aria-expanded",
      debugPanelAriaExpanded(state),
    );
  }
}

function createButton(label: string, testId: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset["testid"] = `${testId}-button`;
  return button;
}
