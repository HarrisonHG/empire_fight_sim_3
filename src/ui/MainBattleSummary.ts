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
    this.element.setAttribute("aria-label", "Battlefield medical summary");
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
  ].join(" · ");
  card.append(title, values);
  return card;
}
