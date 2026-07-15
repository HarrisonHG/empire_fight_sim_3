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
import {
  combatEventAriaPressed,
  combatEventToggleLabel,
  toggleCombatEventVisibility,
  type CombatEventVisibilityState,
} from "./combatEventVisibility";

export interface DebugPanelVisibilityBinding {
  readonly getState: () => DebugPanelVisibilityState;
  readonly setState: (state: DebugPanelVisibilityState) => void;
}

export interface ReachOverlayVisibilityBinding {
  readonly getState: () => ReachOverlayVisibilityState;
  readonly setState: (state: ReachOverlayVisibilityState) => void;
}

export interface CombatEventVisibilityBinding {
  readonly getState: () => CombatEventVisibilityState;
  readonly setState: (state: CombatEventVisibilityState) => void;
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
  private readonly combatEventsButton = createButton(
    "Hide combat events",
    "combat-events-toggle",
  );

  public constructor(
    private readonly workerClient: SimulationWorkerClient,
    private readonly debugPanelVisibility?: DebugPanelVisibilityBinding,
    private readonly reachOverlayVisibility?: ReachOverlayVisibilityBinding,
    private readonly combatEventVisibility?: CombatEventVisibilityBinding,
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
    if (this.combatEventVisibility !== undefined) {
      this.element.append(this.combatEventsButton);
    }

    this.pauseButton.addEventListener("click", this.handlePause);
    this.resumeButton.addEventListener("click", this.handleResume);
    this.stepButton.addEventListener("click", this.handleStep);
    this.debugPanelsButton.addEventListener("click", this.handleToggleDebugPanels);
    this.reachOverlaysButton.addEventListener(
      "click",
      this.handleToggleReachOverlays,
    );
    this.combatEventsButton.addEventListener(
      "click",
      this.handleToggleCombatEvents,
    );
    this.updateDebugPanelButton();
    this.updateReachOverlayButton();
    this.updateCombatEventButton();
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
    this.combatEventsButton.removeEventListener(
      "click",
      this.handleToggleCombatEvents,
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

  private readonly handleToggleCombatEvents = (): void => {
    const binding = this.combatEventVisibility;
    if (binding === undefined) {
      return;
    }
    binding.setState(toggleCombatEventVisibility(binding.getState()));
    this.updateCombatEventButton();
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

  private updateCombatEventButton(): void {
    const binding = this.combatEventVisibility;
    if (binding === undefined) {
      return;
    }
    const state = binding.getState();
    this.combatEventsButton.textContent = combatEventToggleLabel(state);
    this.combatEventsButton.setAttribute(
      "aria-pressed",
      combatEventAriaPressed(state),
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
