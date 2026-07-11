import "./style.css";

import { LIVE_COMBAT_SCENARIO } from "./content/liveCombatScenario";
import { PixiEntityRenderer } from "./render/PixiEntityRenderer";
import { Controls } from "./ui/Controls";
import { MetricsPanel } from "./ui/MetricsPanel";
import { SimulationWorkerClient } from "./worker/SimulationWorkerClient";

void startApplication();

async function startApplication(): Promise<void> {
  const host = document.querySelector<HTMLElement>("#app");
  if (host === null) {
    throw new Error("Application host element #app was not found.");
  }

  const renderer = await PixiEntityRenderer.create(host);
  const workerClient = new SimulationWorkerClient();
  const controls = new Controls(workerClient);
  const metricsPanel = new MetricsPanel();
  const interfaceLayer = document.createElement("div");
  interfaceLayer.className = "interface-layer";
  interfaceLayer.append(metricsPanel.element, controls.element);
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

  workerClient.start(LIVE_COMBAT_SCENARIO);

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
