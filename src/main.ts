import "./style.css";

import { MORALE_INSPECTION_SCENARIO } from "./content/moraleInspectionScenario";
import { VISUAL_TEST_REGISTRY } from "./content/visualTestRegistry";
import type { SimulationScenario } from "./sim/types";
import { PixiEntityRenderer } from "./render/PixiEntityRenderer";
import { Controls } from "./ui/Controls";
import { MetricsPanel } from "./ui/MetricsPanel";
import { resolveApplicationRoute } from "./ui/applicationRoute";
import {
  createInitialDebugPanelVisibilityState,
  shouldHideDebugPanels,
  type DebugPanelVisibilityState,
} from "./ui/debugPanelVisibility";
import {
  areReachOverlaysVisible,
  createInitialReachOverlayVisibilityState,
  type ReachOverlayVisibilityState,
} from "./ui/reachOverlayVisibility";
import {
  areCombatEventsVisible,
  createInitialCombatEventVisibilityState,
  type CombatEventVisibilityState,
} from "./ui/combatEventVisibility";
import {
  createVisualTestScenarioPanel,
  renderVisualTestMenu,
} from "./ui/VisualTestNavigation";
import { SimulationWorkerClient } from "./worker/SimulationWorkerClient";

const route = resolveApplicationRoute(
  window.location.pathname,
  window.location.search,
);
const host = document.querySelector<HTMLElement>("#app");
if (host === null) {
  throw new Error("Application host element #app was not found.");
}

if (route.kind === "visual-test-menu") {
  renderVisualTestMenu(host, VISUAL_TEST_REGISTRY, route.error);
} else {
  const scenario =
    route.kind === "visual-test-scenario"
      ? route.entry.scenario
      : MORALE_INSPECTION_SCENARIO;
  void startApplication(
    host,
    scenario,
    route.kind === "visual-test-scenario" ? route.entry : undefined,
  );
}

async function startApplication(
  host: HTMLElement,
  scenario: SimulationScenario,
  visualTestEntry?: (typeof VISUAL_TEST_REGISTRY)[number],
): Promise<void> {
  const renderer = await PixiEntityRenderer.create(host);
  renderer.setWorldLabels(visualTestEntry?.worldLabels ?? []);
  renderer.setCasualtyVisualsVisible(
    visualTestEntry?.showCasualtyVisuals === true,
  );
  const workerClient = new SimulationWorkerClient();
  const metricsPanel = new MetricsPanel();
  const visualTestScenarioPanel =
    visualTestEntry === undefined
      ? undefined
      : createVisualTestScenarioPanel(visualTestEntry, (focus, selection) => {
          renderer.setWorldFocus(focus);
          metricsPanel.setIndividualInspectionFocus(selection);
        });
  let debugPanelVisibility = createInitialDebugPanelVisibilityState();
  const applyDebugPanelVisibility = (
    state: DebugPanelVisibilityState,
  ): void => {
    const hidden = shouldHideDebugPanels(state);
    metricsPanel.element.hidden = hidden;
    if (visualTestScenarioPanel !== undefined) {
      visualTestScenarioPanel.hidden = hidden;
    }
  };
  let reachOverlayVisibility = createInitialReachOverlayVisibilityState();
  let combatEventVisibility = createInitialCombatEventVisibilityState();
  const controls = new Controls(
    workerClient,
    {
      getState: () => debugPanelVisibility,
      setState: (state) => {
        debugPanelVisibility = state;
        applyDebugPanelVisibility(state);
      },
    },
    visualTestEntry === undefined
      ? undefined
      : {
          getState: () => reachOverlayVisibility,
          setState: (state: ReachOverlayVisibilityState) => {
            reachOverlayVisibility = state;
            renderer.setReachOverlayVisible(areReachOverlaysVisible(state));
          },
        },
    visualTestEntry === undefined
      ? undefined
      : {
          getState: () => combatEventVisibility,
          setState: (state: CombatEventVisibilityState) => {
            combatEventVisibility = state;
            renderer.setCombatEventsVisible(areCombatEventsVisible(state));
          },
        },
    visualTestEntry === undefined
      ? undefined
      : {
          reset: () => {
            metricsPanel.clearInspectionHistory();
            workerClient.reset(visualTestEntry.scenarioFactory());
          },
        },
  );
  renderer.setReachOverlayVisible(areReachOverlaysVisible(reachOverlayVisibility));
  renderer.setCombatEventsVisible(areCombatEventsVisible(combatEventVisibility));
  const interfaceLayer = document.createElement("div");
  interfaceLayer.className = "interface-layer";
  interfaceLayer.append(controls.element, metricsPanel.element);
  if (visualTestScenarioPanel !== undefined) {
    interfaceLayer.append(visualTestScenarioPanel);
  }
  applyDebugPanelVisibility(debugPanelVisibility);
  host.append(interfaceLayer);

  const unsubscribe = workerClient.subscribe((message) => {
    switch (message.type) {
      case "snapshot":
        metricsPanel.updateSnapshot(message.snapshot);
        try {
          renderer.applySnapshot(message.snapshot);
        } catch (error: unknown) {
          console.error("Failed to render simulation snapshot.", error);
        }
        break;
      case "metrics":
        metricsPanel.updateWorkerMetrics(message);
        break;
      case "state":
        controls.updateWorkerStatus(message.status);
        metricsPanel.updateWorkerState(message);
        break;
      case "error":
        console.error(
          `[Simulation worker: ${message.code}] ${message.message}`,
          message,
        );
        break;
      case "ready":
        break;
    }
  });

  workerClient.start(scenario);
  if (visualTestEntry !== undefined) {
    workerClient.pause();
  }

  window.addEventListener(
    "pagehide",
    () => {
      unsubscribe();
      workerClient.dispose();
      controls.destroy();
      metricsPanel.destroy();
      renderer.destroy();
    },
    { once: true },
  );
}
