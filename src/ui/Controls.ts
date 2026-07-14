import { SimulationWorkerClient } from "../worker/SimulationWorkerClient";
import type { WorkerStatus } from "../worker/protocol";
import {
  debugPanelAriaExpanded,
  debugPanelToggleLabel,
  toggleDebugPanelVisibility,
  type DebugPanelVisibilityState,
} from "./debugPanelVisibility";
import {
  reachOverlayAriaPressed,
  reachOverlayToggleLabel,
  toggleReachOverlayVisibility,
  type ReachOverlayVisibilityState,
} from "./reachOverlayVisibility";

export interface DebugPanelVisibilityBinding {
  readonly getState: () => DebugPanelVisibilityState;
  readonly setState: (state: DebugPanelVisibilityState) => void;
}

export interface ReachOverlayVisibilityBinding {
  readonly getState: () => ReachOverlayVisibilityState;
  readonly setState: (state: ReachOverlayVisibilityState) => void;
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
  private readonly reachOverlaysButton = createButton(
    "Hide reach overlays",
    "reach-overlays-toggle",
  );

  public constructor(
    private readonly workerClient: SimulationWorkerClient,
    private readonly debugPanelVisibility?: DebugPanelVisibilityBinding,
    private readonly reachOverlayVisibility?: ReachOverlayVisibilityBinding,
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
    if (this.reachOverlayVisibility !== undefined) {
      this.element.append(this.reachOverlaysButton);
    }

    this.pauseButton.addEventListener("click", this.handlePause);
    this.resumeButton.addEventListener("click", this.handleResume);
    this.stepButton.addEventListener("click", this.handleStep);
    this.debugPanelsButton.addEventListener("click", this.handleToggleDebugPanels);
    this.reachOverlaysButton.addEventListener(
      "click",
      this.handleToggleReachOverlays,
    );
    this.updateDebugPanelButton();
    this.updateReachOverlayButton();
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
    this.reachOverlaysButton.removeEventListener(
      "click",
      this.handleToggleReachOverlays,
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

  private readonly handleToggleReachOverlays = (): void => {
    const binding = this.reachOverlayVisibility;
    if (binding === undefined) {
      return;
    }
    binding.setState(toggleReachOverlayVisibility(binding.getState()));
    this.updateReachOverlayButton();
  };

  private updateDebugPanelButton(): void {
    const state = this.debugPanelVisibility?.getState() ?? "shown";
    this.debugPanelsButton.textContent = debugPanelToggleLabel(state);
    this.debugPanelsButton.setAttribute(
      "aria-expanded",
      debugPanelAriaExpanded(state),
    );
  }

  private updateReachOverlayButton(): void {
    const binding = this.reachOverlayVisibility;
    if (binding === undefined) {
      return;
    }
    const state = binding.getState();
    this.reachOverlaysButton.textContent = reachOverlayToggleLabel(state);
    this.reachOverlaysButton.setAttribute(
      "aria-pressed",
      reachOverlayAriaPressed(state),
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
