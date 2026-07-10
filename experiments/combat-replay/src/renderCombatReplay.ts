import type {
  CombatReplayFrame,
  CombatReplayRecord,
  CombatReplayUnitFrame,
} from "./combatReplayTypes";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface CombatReplayRenderOptions {
  readonly showLabels: boolean;
  readonly showThreatRanges: boolean;
  readonly showContactRanges: boolean;
}

export function renderCombatReplay(
  host: HTMLElement,
  replay: CombatReplayRecord,
  frame: CombatReplayFrame,
  options: CombatReplayRenderOptions,
): void {
  host.replaceChildren();

  const svg = createSvgElement("svg");
  svg.setAttribute("class", "combat-svg");
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

  if (options.showThreatRanges) {
    for (const unit of frame.units) {
      if (unit.threatRange > 0) {
        svg.append(renderRange(unit, unit.threatRange, "threat-range"));
      }
    }
  }

  if (options.showContactRanges) {
    for (const unit of frame.units) {
      if (unit.contactDistance > 0) {
        svg.append(renderRange(unit, unit.contactDistance, "contact-range"));
      }
    }
  }

  for (const unit of frame.units) {
    if (unit.primaryTargetUnitId !== undefined) {
      const target = frame.units.find(
        (candidate) => candidate.unitId === unit.primaryTargetUnitId,
      );
      if (target !== undefined) {
        svg.append(renderTargetLine(unit, target));
      }
    }
  }

  for (const unit of frame.units) {
    svg.append(renderUnitAnchor(unit));
    svg.append(renderHeading(unit));
    if (options.showLabels) {
      svg.append(renderUnitLabel(unit));
    }
  }

  for (const entity of frame.entities) {
    const unit = frame.units.find(
      (candidate) => candidate.unitId === entity.unitId,
    );
    const marker = createSvgElement("circle");
    marker.setAttribute(
      "class",
      `entity ${unit?.side ?? "other"} ${unit?.engagementState ?? "none"}`,
    );
    marker.setAttribute("cx", String(entity.x));
    marker.setAttribute("cy", String(entity.y));
    marker.setAttribute("r", "4");
    svg.append(marker);
  }

  host.append(svg);
}

function renderRange(
  unit: CombatReplayUnitFrame,
  range: number,
  className: string,
): SVGElement {
  const circle = createSvgElement("circle");
  circle.setAttribute("class", `${className} ${unit.side}`);
  circle.setAttribute("cx", String(unit.anchorX));
  circle.setAttribute("cy", String(unit.anchorY));
  circle.setAttribute("r", String(range));
  return circle;
}

function renderTargetLine(
  source: CombatReplayUnitFrame,
  target: CombatReplayUnitFrame,
): SVGElement {
  const line = createSvgElement("line");
  line.setAttribute("class", `target-line ${source.engagementState}`);
  line.setAttribute("x1", String(source.anchorX));
  line.setAttribute("y1", String(source.anchorY));
  line.setAttribute("x2", String(target.anchorX));
  line.setAttribute("y2", String(target.anchorY));
  return line;
}

function renderUnitAnchor(unit: CombatReplayUnitFrame): SVGElement {
  const group = createSvgElement("g");
  group.setAttribute(
    "class",
    `unit-anchor ${unit.side} ${unit.engagementState}`,
  );

  const body = createSvgElement("rect");
  body.setAttribute("x", String(unit.anchorX - 6));
  body.setAttribute("y", String(unit.anchorY - 6));
  body.setAttribute("width", "12");
  body.setAttribute("height", "12");
  body.setAttribute("rx", "2");

  const state = createSvgElement("circle");
  state.setAttribute("cx", String(unit.anchorX));
  state.setAttribute("cy", String(unit.anchorY));
  state.setAttribute("r", unit.capacityReached ? "10" : "8");
  state.setAttribute("class", `state-ring ${unit.engagementState}`);

  group.append(state, body);
  return group;
}

function renderHeading(unit: CombatReplayUnitFrame): SVGElement {
  const line = createSvgElement("line");
  line.setAttribute("class", `heading ${unit.side}`);
  line.setAttribute("x1", String(unit.anchorX));
  line.setAttribute("y1", String(unit.anchorY));
  line.setAttribute("x2", String(unit.anchorX + unit.headingX * 18));
  line.setAttribute("y2", String(unit.anchorY + unit.headingY * 18));
  return line;
}

function renderUnitLabel(unit: CombatReplayUnitFrame): SVGElement {
  const label = createSvgElement("text");
  label.setAttribute("class", "unit-label");
  label.setAttribute("x", String(unit.anchorX + 8));
  label.setAttribute("y", String(unit.anchorY - 10));
  label.textContent =
    `U${unit.unitId} ${unit.movementStyle} ${unit.engagementState} ` +
    `cd ${unit.attackCooldownTicks} dmg ${unit.accumulatedDamage}/${unit.maxDamageCapacity}`;
  return label;
}

function createSvgElement(name: string): SVGElement {
  return document.createElementNS(SVG_NS, name);
}
