import type {
  FormationReplay,
  FormationReplayFrame,
} from "./replayTypes";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ReplayRenderOptions {
  readonly showAnchors: boolean;
  readonly showEntityIds: boolean;
  readonly showSlots: boolean;
}

export function renderReplay(
  host: HTMLElement,
  replay: FormationReplay,
  frame: FormationReplayFrame,
  options: ReplayRenderOptions,
): void {
  host.replaceChildren();

  const svg = createSvgElement("svg");
  svg.setAttribute("class", "replay-svg");
  svg.setAttribute(
    "viewBox",
    `0 0 ${replay.worldBounds.width} ${replay.worldBounds.height}`,
  );
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", replay.scenario.name);

  const bounds = createSvgElement("rect");
  bounds.setAttribute("class", "world-bounds");
  bounds.setAttribute("x", "0");
  bounds.setAttribute("y", "0");
  bounds.setAttribute("width", String(replay.worldBounds.width));
  bounds.setAttribute("height", String(replay.worldBounds.height));
  svg.append(bounds);

  if (options.showSlots) {
    for (const slot of frame.slots) {
      svg.append(renderSlot(slot.slotX, slot.slotY, slot.unitId));
    }
  }

  if (options.showAnchors) {
    for (const unit of frame.units) {
      svg.append(renderAnchor(unit.anchorX, unit.anchorY, unit.unitId));
      svg.append(
        renderLabel(
          unit.anchorX + 5,
          unit.anchorY - 5,
          `U${unit.unitId} ${unit.style}`,
          "anchor-label",
        ),
      );
    }
  }

  for (const entity of frame.entities) {
    svg.append(renderEntity(entity.x, entity.y, entity.unitId));
    if (options.showEntityIds) {
      svg.append(
        renderLabel(
          entity.x + 4,
          entity.y + 8,
          `E${entity.entityId}`,
          "entity-label",
        ),
      );
    }
  }

  host.append(svg);
}

interface SlotRenderInput {
  readonly slotX: number;
  readonly slotY: number;
  readonly unitId: number;
}

function renderSlot(
  slotX: SlotRenderInput["slotX"],
  slotY: SlotRenderInput["slotY"],
  unitId: SlotRenderInput["unitId"],
): SVGElement {
  const group = createSvgElement("g");
  group.setAttribute("class", `slot unit-${unitId}`);

  const horizontal = createSvgElement("line");
  horizontal.setAttribute("x1", String(slotX - 3));
  horizontal.setAttribute("y1", String(slotY));
  horizontal.setAttribute("x2", String(slotX + 3));
  horizontal.setAttribute("y2", String(slotY));

  const vertical = createSvgElement("line");
  vertical.setAttribute("x1", String(slotX));
  vertical.setAttribute("y1", String(slotY - 3));
  vertical.setAttribute("x2", String(slotX));
  vertical.setAttribute("y2", String(slotY + 3));

  group.append(horizontal, vertical);
  return group;
}

function renderAnchor(x: number, y: number, unitId: number): SVGElement {
  const marker = createSvgElement("rect");
  marker.setAttribute("class", `anchor unit-${unitId}`);
  marker.setAttribute("x", String(x - 3));
  marker.setAttribute("y", String(y - 3));
  marker.setAttribute("width", "6");
  marker.setAttribute("height", "6");
  marker.setAttribute("transform", `rotate(45 ${x} ${y})`);
  return marker;
}

function renderEntity(x: number, y: number, unitId: number): SVGElement {
  const entity = createSvgElement("circle");
  entity.setAttribute("class", `entity unit-${unitId}`);
  entity.setAttribute("cx", String(x));
  entity.setAttribute("cy", String(y));
  entity.setAttribute("r", "4");
  return entity;
}

function renderLabel(
  x: number,
  y: number,
  textValue: string,
  className: string,
): SVGElement {
  const label = createSvgElement("text");
  label.setAttribute("class", className);
  label.setAttribute("x", String(x));
  label.setAttribute("y", String(y));
  label.textContent = textValue;
  return label;
}

function createSvgElement(name: string): SVGElement {
  return document.createElementNS(SVG_NS, name);
}
