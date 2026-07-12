import "./style.css";

import { MORALE_INSPECTION_SCENARIO } from "./content/moraleInspectionScenario";
import { VISUAL_TEST_REGISTRY } from "./content/visualTestRegistry";
import type { SimulationScenario } from "./sim/types";
import { PixiEntityRenderer } from "./render/PixiEntityRenderer";
import { Controls } from "./ui/Controls";
import { MetricsPanel } from "./ui/MetricsPanel";
import { resolveApplicationRoute } from "./ui/applicationRoute";
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
  const workerClient = new SimulationWorkerClient();
  const controls = new Controls(workerClient);
  const metricsPanel = new MetricsPanel();
  const interfaceLayer = document.createElement("div");
  interfaceLayer.className = "interface-layer";
  interfaceLayer.append(controls.element, metricsPanel.element);
  if (visualTestEntry !== undefined) {
    interfaceLayer.append(createVisualTestScenarioPanel(visualTestEntry));
  }
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
