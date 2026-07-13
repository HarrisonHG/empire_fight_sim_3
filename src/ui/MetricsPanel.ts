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
  private readonly combatTickCountsValue = createMetricValue("combat-tick-counts");
  private readonly combatTotalCountsValue = createMetricValue(
    "combat-total-counts",
  );
  private readonly combatUnitStateValue = createMetricValue("combat-unit-state");
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
      createMetricRow("Combat tick", this.combatTickCountsValue),
      createMetricRow("Combat total", this.combatTotalCountsValue),
      createMetricRow("Unit state", this.combatUnitStateValue),
    );
    this.element.append(metrics);

    this.frameRequest = requestAnimationFrame(this.sampleFrame);
  }

  public updateSnapshot(snapshot: SimulationSnapshot): void {
    this.entityCountValue.textContent = snapshot.entityCount.toString();
    this.currentTickValue.textContent = snapshot.tick.toString();

    const combatDebug = snapshot.combatDebug;
    if (combatDebug === undefined) {
      const formationDebug = snapshot.formationDebug;
      if (formationDebug === undefined) {
        this.clearCombatDebug();
        return;
      }
      this.combatTickCountsValue.textContent = "--";
      this.combatTotalCountsValue.textContent = "--";
      this.combatUnitStateValue.textContent = formationDebug.units
        .map(
          (unit) =>
            `${unit.label} · U${unit.unitId}/F${unit.factionId} (${unit.memberCount}): ` +
            `${unit.movementStyle}, C ${unit.cohesion}`,
        )
        .join("\n");
      return;
    }

    this.combatTickCountsValue.textContent = formatCombatCounts({
      attacks: combatDebug.attackAttemptCount,
      prevented: combatDebug.preventedAttackCount,
      landed: combatDebug.landedOutcomeCount,
      accepted: combatDebug.gateAcceptedHitCount,
      hitLoss: combatDebug.appliedHitLoss,
      zero: combatDebug.newlyZeroMemberCount,
    });
    this.combatTotalCountsValue.textContent = formatCombatCounts({
      attacks: combatDebug.totalAttackAttemptCount,
      prevented: combatDebug.totalPreventedAttackCount,
      landed: combatDebug.totalLandedOutcomeCount,
      accepted: combatDebug.totalGateAcceptedHitCount,
      hitLoss: combatDebug.totalAppliedHitLoss,
      zero: combatDebug.totalNewlyZeroMemberCount,
    });
    this.combatUnitStateValue.textContent = combatDebug.units
      .map(
        (unit) =>
          `${unit.label} · U${unit.unitId}/F${unit.factionId} (${unit.memberCount}): ` +
          `${unit.movementStyle}, H ${unit.endOfTickEligibleMembers}/${unit.memberCount}, ` +
          `Z ${unit.endOfTickZeroHitMembers}, Loss ${unit.appliedHitLoss}, ` +
          `M ${unit.persistentMoraleState}, R ${unit.routingRisk}, ` +
          `Rec ${unit.recoveryProgress}, P ${formatCombatNumber(unit.persistentPressure)}, ` +
          `C ${unit.currentCohesion} ` +
          `(assessment ${unit.assessmentMoraleState}/P ${formatCombatNumber(unit.assessmentPressureAverage)})`,
      )
      .join("\n");
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

  private clearCombatDebug(): void {
    this.combatTickCountsValue.textContent = "--";
    this.combatTotalCountsValue.textContent = "--";
    this.combatUnitStateValue.textContent = "--";
  }
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

function formatCombatCounts(counts: {
  readonly attacks: number;
  readonly prevented: number;
  readonly landed: number;
  readonly accepted: number;
  readonly hitLoss: number;
  readonly zero: number;
}): string {
  return (
    `Atk ${counts.attacks} · Prev ${counts.prevented} · ` +
    `Land ${counts.landed} · Gate ${counts.accepted} · ` +
    `Hit ${counts.hitLoss} · Zero ${counts.zero}`
  );
}

function formatCombatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}
