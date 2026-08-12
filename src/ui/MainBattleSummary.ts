import type { SimulationSnapshot } from "../sim/types";
import {
  deriveMainBattleSideSummaries,
  type MainBattleSideSummaryValue,
} from "./mainBattleSummaryModel";

export class MainBattleSummary {
  public readonly element: HTMLElement;

  private readonly body: HTMLElement;

  public constructor(
    private readonly labels: ReadonlyMap<number, string>,
  ) {
    this.element = document.createElement("section");
    this.element.className = "main-battle-summary";
    this.element.setAttribute("aria-label", "Battlefield state summary");
    const title = document.createElement("h2");
    title.textContent = "Battlefield state";
    this.body = document.createElement("div");
    this.body.className = "main-battle-summary__sides";
    this.element.append(title, this.body);
  }

  public updateSnapshot(snapshot: SimulationSnapshot): void {
    const units = snapshot.combatDebug?.units;
    if (units === undefined) {
      this.body.textContent = "Awaiting combat snapshot";
      return;
    }
    const sides = deriveMainBattleSideSummaries(units, this.labels);
    this.body.replaceChildren(...sides.map(renderSide));
  }

  public destroy(): void {
    this.element.remove();
  }
}

function renderSide(side: MainBattleSideSummaryValue): HTMLElement {
  const card = document.createElement("article");
  card.className = "main-battle-summary__side";
  const title = document.createElement("h3");
  title.textContent = side.label;
  const values = document.createElement("p");
  values.textContent = [
    `Active ${side.active}`,
    `Dying ${side.dying}`,
    `Terminal ${side.terminal}`,
    `Routing ${side.routing}`,
    `Dragged ${side.beingDragged}`,
    `Treatment ${side.underTreatment}`,
    `Comforted ${side.comforted}`,
    `Egress ${side.respawnEgress}`,
    `Waiting ${side.waitingAtRespawn}`,
    `Herbs ${side.currentHerbs}/${side.reservedHerbs} reserved`,
    `Energy ${formatRatio(side.energyAverageRatioFixedPoint)} avg / ` +
      `${formatRatio(side.energyMinimumRatioFixedPoint)} min`,
    `Bands ${side.energyFresh}/${side.energyWorking}/` +
      `${side.energyWinded}/${side.energySpent}`,
    `Tick -${side.energySpentThisTick}/+${side.energyRecoveredThisTick}`,
    `Resting ${side.energyResting}`,
  ].join(" · ");
  const units = document.createElement("div");
  units.className = "main-battle-summary__units";
  for (const unit of side.units) {
    const value = document.createElement("p");
    value.textContent =
      `${unit.label}: ${formatRatio(unit.averageRatioFixedPoint)} avg, ` +
      `${formatRatio(unit.minimumRatioFixedPoint)} min · ` +
      `F/W/Wd/S ${unit.fresh}/${unit.working}/${unit.winded}/${unit.spent} · ` +
      `J/S/D ${unit.jogCapable}/${unit.sprintOrChargeCapable}/${unit.dragCapable} · ` +
      `-${unit.spentThisTick}/+${unit.recoveredThisTick} · ` +
      `${unit.recommendation}` + (unit.resting > 0 ? ` · resting ${unit.resting}` : "");
    units.append(value);
  }
  card.append(title, values, units);
  return card;
}

function formatRatio(value: number | null): string {
  return value === null ? "-" : `${Math.floor(value / 100)}%`;
}
