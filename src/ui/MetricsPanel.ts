import type {
  InspectedCombatVisualEvent,
  LiveCombatDebugIndividualSnapshot,
  LiveCombatDebugUnitSnapshot,
  SimulationSnapshot,
} from "../sim/types";
import type {
  MetricsWorkerMessage,
  StateWorkerMessage,
} from "../worker/protocol";
import {
  buildIndividualInspectionRows,
  formatCasualtyProcedureInspection,
  formatIncomingCounts,
  formatRetainedInspectionEvent,
  shouldClearRetainedInspectionEvents,
} from "./individualInspectionFormatting";
import { formatMoraleOverlayValues } from "./moraleOverlayFormatting";

const FPS_SAMPLE_WINDOW_MS = 500;
const MAX_COMBAT_EVENT_LOG_ROWS = 12;

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
  private readonly individualInspectionValue = createMetricValue(
    "individual-inspection",
  );
  private readonly combatEventLogValue = createMetricValue("combat-event-log");
  private readonly retainedInspectionEvents = new Map<number, string>();
  private readonly retainedCombatEventLog: string[] = [];
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
      createMetricRow("Individuals", this.individualInspectionValue),
      createMetricRow("Events", this.combatEventLogValue),
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

    if (
      shouldClearRetainedInspectionEvents(
        snapshot.tick,
        combatDebug.inspectedIndividuals.length,
      )
    ) {
      this.retainedInspectionEvents.clear();
      this.retainedCombatEventLog.length = 0;
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
          `M ${unit.persistentMoraleState}, ${formatMoraleOverlayValues(unit)}, ` +
          `P ${formatCombatNumber(unit.persistentPressure)}, ` +
          `C ${unit.currentCohesion} ` +
          `(assessment ${unit.assessmentMoraleState}/P ${formatCombatNumber(unit.assessmentPressureAverage)})`,
      )
      .join("\n");
    this.renderIndividualInspection(
      snapshot.tick,
      combatDebug.inspectedIndividuals,
      combatDebug.units,
    );
    this.renderCombatEventLog(
      combatDebug.inspectedIndividuals.length,
      combatDebug.inspectedCombatVisualEvents,
    );
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

  public clearInspectionHistory(): void {
    this.retainedInspectionEvents.clear();
    this.retainedCombatEventLog.length = 0;
    this.individualInspectionValue.textContent = "--";
    this.combatEventLogValue.textContent = "--";
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
    this.individualInspectionValue.textContent = "--";
    this.combatEventLogValue.textContent = "--";
    this.retainedInspectionEvents.clear();
    this.retainedCombatEventLog.length = 0;
  }

  private renderIndividualInspection(
    tick: number,
    individuals: readonly LiveCombatDebugIndividualSnapshot[],
    units: readonly LiveCombatDebugUnitSnapshot[],
  ): void {
    if (individuals.length === 0) {
      this.individualInspectionValue.textContent = "--";
      this.retainedInspectionEvents.clear();
      return;
    }

    for (const individual of individuals) {
      const eventSummary = formatRetainedInspectionEvent(tick, individual);
      if (eventSummary !== "") {
        this.retainedInspectionEvents.set(individual.entityId, eventSummary);
      }
    }
    const rows = buildIndividualInspectionRows(
      tick,
      individuals,
      units,
      this.retainedInspectionEvents,
    );

    const table = document.createElement("table");
    table.className = "individual-inspection-table";
    const header = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of [
      "E/U",
      "Elig",
      "Target",
      "Action",
      "Guard",
      "Face",
      "Kit",
      "Hits",
      "Casualty procedure",
      "Latest",
      "In",
      "Loss",
    ]) {
      const cell = document.createElement("th");
      cell.textContent = label;
      headerRow.append(cell);
    }
    header.append(headerRow);
    const body = document.createElement("tbody");
    for (let index = 0; index < individuals.length; index += 1) {
      const individual = individuals[index]!;
      const inspectionRow = rows[index]!;
      const row = document.createElement("tr");
      for (const value of [
        inspectionRow.identity,
        individual.tickStartCombatEligible ? "Y" : "N",
        formatTarget(individual),
        formatAction(individual),
        formatGuard(individual),
        `${individual.facing.x},${individual.facing.y}`,
        `${individual.activeWeapon}/${individual.shieldCategory}`,
        `${individual.currentGlobalHits}/${individual.maximumGlobalHits}`,
        formatCasualtyProcedureInspection(individual),
        inspectionRow.latestEvent,
        formatIncomingCounts(individual),
        individual.thisTickAppliedHitLoss.toString(),
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    }
    table.append(header, body);
    this.individualInspectionValue.replaceChildren(table);
  }

  private renderCombatEventLog(
    inspectedIndividualCount: number,
    events: readonly InspectedCombatVisualEvent[],
  ): void {
    if (inspectedIndividualCount === 0) {
      this.combatEventLogValue.textContent = "--";
      this.retainedCombatEventLog.length = 0;
      return;
    }
    for (const event of events) {
      this.retainedCombatEventLog.push(formatCombatVisualEventLogEntry(event));
    }
    if (this.retainedCombatEventLog.length > MAX_COMBAT_EVENT_LOG_ROWS) {
      this.retainedCombatEventLog.splice(
        0,
        this.retainedCombatEventLog.length - MAX_COMBAT_EVENT_LOG_ROWS,
      );
    }
    this.combatEventLogValue.textContent =
      this.retainedCombatEventLog.length === 0
        ? "--"
        : this.retainedCombatEventLog.join("\n");
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

function formatTarget(individual: LiveCombatDebugIndividualSnapshot): string {
  const selected =
    individual.selectedTargetEntityId === null
      ? "-"
      : `S${individual.selectedTargetEntityId}`;
  const locked =
    individual.lockedTargetEntityId === null
      ? "-"
      : `L${individual.lockedTargetEntityId}`;
  const preferred =
    individual.selectedTargetWithinPreferredDistance === null
      ? "-"
      : individual.selectedTargetWithinPreferredDistance
        ? "pref"
        : "close";
  return `${selected}/${locked}/${preferred}`;
}

function formatAction(individual: LiveCombatDebugIndividualSnapshot): string {
  return `${individual.actionState} ${individual.commitmentTicksRemaining}/${individual.attackRecoveryTicksRemaining}`;
}

function formatGuard(individual: LiveCombatDebugIndividualSnapshot): string {
  return (
    `Stored readiness ${Math.round(individual.storedGuardReadinessFixedPoint / 100)}% · ` +
    `Effective ${Math.round(individual.effectiveGuardReadinessFixedPoint / 100)}% · ` +
    `Recovery +${individual.guardReadinessRecoveryPerTick}/tick`
  );
}

function formatCombatVisualEventLogEntry(
  event: InspectedCombatVisualEvent,
): string {
  const hitLoss =
    event.appliedHitLoss > 0 ? ` -${event.appliedHitLoss}` : "";
  return (
    `t${event.tick} E${event.attackerEntityId}->E${event.targetEntityId} ` +
    `${event.kind}${hitLoss}`
  );
}
