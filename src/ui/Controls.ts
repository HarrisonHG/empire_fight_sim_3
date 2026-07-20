import { SimulationWorkerClient } from "../worker/SimulationWorkerClient";
import type { WorkerStatus } from "../worker/protocol";
import type { SimulationPlaybackSpeedMultiplier } from "../worker/protocol";
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
import {
  fasterVisualTestPlaybackSpeed,
  slowerVisualTestPlaybackSpeed,
  visualTestPlaybackSpeedLabel,
} from "./visualTestPlaybackSpeed";

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

export interface ScenarioResetBinding {
  readonly reset: () => void;
}

export interface PlaybackSpeedBinding {
  readonly getState: () => SimulationPlaybackSpeedMultiplier;
  readonly setState: (speed: SimulationPlaybackSpeedMultiplier) => void;
}

export class Controls {
  public readonly element: HTMLElement;

  private readonly pauseButton = createButton("Pause", "pause");
  private readonly resumeButton = createButton("Resume", "resume");
  private readonly stepButton = createButton("Step", "step");
  private readonly resetButton = createButton("Reset scenario", "reset-scenario");
  private readonly slowDownButton = createButton("Slow down time", "slow-down-time");
  private readonly speedUpButton = createButton("Speed up time", "speed-up-time");
  private readonly playbackSpeedValue = document.createElement("output");
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
    private readonly scenarioReset?: ScenarioResetBinding,
    private readonly playbackSpeed?: PlaybackSpeedBinding,
  ) {
    this.element = document.createElement("section");
    this.element.className = "controls";
    this.element.setAttribute("aria-label", "Simulation controls");
    this.element.append(this.pauseButton, this.resumeButton, this.stepButton);
    if (this.playbackSpeed !== undefined) {
      const playbackControls = document.createElement("span");
      playbackControls.className = "playback-speed-controls";
      playbackControls.setAttribute("aria-label", "Simulation playback speed");
      this.playbackSpeedValue.dataset["testid"] = "playback-speed";
      this.playbackSpeedValue.setAttribute("aria-live", "polite");
      playbackControls.append(
        this.slowDownButton,
        this.playbackSpeedValue,
        this.speedUpButton,
      );
      this.element.append(playbackControls);
    }
    this.element.append(this.resetButton, this.debugPanelsButton);
    if (this.reachOverlayVisibility !== undefined) {
      this.element.append(this.reachOverlaysButton);
    }
    if (this.combatEventVisibility !== undefined) {
      this.element.append(this.combatEventsButton);
    }

    this.pauseButton.addEventListener("click", this.handlePause);
    this.resumeButton.addEventListener("click", this.handleResume);
    this.stepButton.addEventListener("click", this.handleStep);
    this.resetButton.addEventListener("click", this.handleReset);
    this.slowDownButton.addEventListener("click", this.handleSlowDown);
    this.speedUpButton.addEventListener("click", this.handleSpeedUp);
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
    this.updatePlaybackSpeedControls();
    this.updateWorkerStatus("idle");
  }

  public updateWorkerStatus(status: WorkerStatus): void {
    this.pauseButton.disabled = status !== "running";
    this.resumeButton.disabled = status !== "paused";
    this.stepButton.disabled = status !== "paused";
    this.resetButton.disabled = this.scenarioReset === undefined;
  }

  public updatePlaybackSpeed(): void {
    this.updatePlaybackSpeedControls();
  }

  public destroy(): void {
    this.pauseButton.removeEventListener("click", this.handlePause);
    this.resumeButton.removeEventListener("click", this.handleResume);
    this.stepButton.removeEventListener("click", this.handleStep);
    this.resetButton.removeEventListener("click", this.handleReset);
    this.slowDownButton.removeEventListener("click", this.handleSlowDown);
    this.speedUpButton.removeEventListener("click", this.handleSpeedUp);
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

  private readonly handleReset = (): void => {
    this.scenarioReset?.reset();
  };

  private readonly handleSlowDown = (): void => {
    const binding = this.playbackSpeed;
    if (binding === undefined) return;
    binding.setState(slowerVisualTestPlaybackSpeed(binding.getState()));
    this.updatePlaybackSpeedControls();
  };

  private readonly handleSpeedUp = (): void => {
    const binding = this.playbackSpeed;
    if (binding === undefined) return;
    binding.setState(fasterVisualTestPlaybackSpeed(binding.getState()));
    this.updatePlaybackSpeedControls();
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

  private updatePlaybackSpeedControls(): void {
    const binding = this.playbackSpeed;
    if (binding === undefined) return;
    const speed = binding.getState();
    const slower = slowerVisualTestPlaybackSpeed(speed);
    const faster = fasterVisualTestPlaybackSpeed(speed);
    this.playbackSpeedValue.textContent = visualTestPlaybackSpeedLabel(speed);
    this.slowDownButton.disabled = slower === speed;
    this.speedUpButton.disabled = faster === speed;
  }
}

function createButton(label: string, testId: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset["testid"] = `${testId}-button`;
  return button;
}
