import type { SimulationSnapshot } from "../sim/types";
import type {
  MetricsWorkerMessage,
  StateWorkerMessage,
} from "../worker/protocol";

const FPS_SAMPLE_WINDOW_MS = 500;

export class MetricsPanel {
  public readonly element: HTMLElement;

  private readonly fpsValue = createMetricValue("fps");
  private readonly tickTimeValue = createMetricValue("tick-time");
  private readonly entityCountValue = createMetricValue("entity-count");
  private readonly currentTickValue = createMetricValue("current-tick");
  private frameRequest: number | undefined;
  private sampleStartedAt: number | undefined;
  private sampledFrames = 0;

  public constructor() {
    this.element = document.createElement("section");
    this.element.className = "metrics-panel";
    this.element.setAttribute("aria-label", "Simulation metrics");

    const metrics = document.createElement("dl");
    metrics.append(
      createMetricRow("FPS", this.fpsValue),
      createMetricRow("Tick time", this.tickTimeValue),
      createMetricRow("Entities", this.entityCountValue),
      createMetricRow("Tick", this.currentTickValue),
    );
    this.element.append(metrics);

    this.frameRequest = requestAnimationFrame(this.sampleFrame);
  }

  public updateSnapshot(snapshot: SimulationSnapshot): void {
    this.entityCountValue.textContent = snapshot.entityCount.toString();
    this.currentTickValue.textContent = snapshot.tick.toString();
  }

  public updateWorkerMetrics(message: MetricsWorkerMessage): void {
    this.tickTimeValue.textContent = `${message.tickTimeMs.toFixed(3)} ms`;
    this.currentTickValue.textContent = message.tick.toString();
  }

  public updateWorkerState(message: StateWorkerMessage): void {
    if (message.tick !== null) {
      this.currentTickValue.textContent = message.tick.toString();
    }
  }

  public destroy(): void {
    if (this.frameRequest !== undefined) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = undefined;
    }

    this.element.remove();
  }

  private readonly sampleFrame = (timestamp: number): void => {
    const sampleStartedAt = this.sampleStartedAt;
    if (sampleStartedAt === undefined) {
      this.sampleStartedAt = timestamp;
      this.sampledFrames = 0;
    } else {
      this.sampledFrames += 1;
      const elapsedMs = timestamp - sampleStartedAt;

      if (elapsedMs >= FPS_SAMPLE_WINDOW_MS) {
        const framesPerSecond = (this.sampledFrames * 1_000) / elapsedMs;
        this.fpsValue.textContent = framesPerSecond.toFixed(1);
        this.sampleStartedAt = timestamp;
        this.sampledFrames = 0;
      }
    }

    this.frameRequest = requestAnimationFrame(this.sampleFrame);
  };
}

function createMetricValue(testId: string): HTMLElement {
  const value = document.createElement("dd");
  value.textContent = "--";
  value.dataset["testid"] = testId;
  return value;
}

function createMetricRow(label: string, value: HTMLElement): DocumentFragment {
  const row = document.createDocumentFragment();
  const term = document.createElement("dt");
  term.textContent = label;
  row.append(term, value);
  return row;
}
