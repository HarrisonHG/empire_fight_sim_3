import { MORALE_INSPECTION_SCENARIO } from "./moraleInspectionScenario";
import {
  PURSUIT_REGULAR_SCENARIO,
  PURSUIT_VETERAN_SCENARIO,
} from "./pursuitScenarios";
import type { CombatSandboxUnitScenario, SimulationScenario } from "../sim/types";

export const MILESTONE_4_VISUAL_AREAS = Object.freeze([
  Object.freeze({ id: "comparison", unitIds: Object.freeze([11, 12, 13, 14, 21, 22, 23]) }),
  Object.freeze({ id: "regular-pursuit", unitIds: Object.freeze([31, 41]) }),
  Object.freeze({ id: "veteran-pursuit", unitIds: Object.freeze([51, 61]) }),
]);

const comparisonUnits = requireUnits(MORALE_INSPECTION_SCENARIO).map((unit) =>
  translateUnit(unit, unit.unitId, 0, 0, "Comparison area"),
);
const regularPursuitUnits = requireUnits(PURSUIT_REGULAR_SCENARIO).map((unit) =>
  translateUnit(unit, unit.unitId, 0, 740, "Regular pursuit area"),
);
const veteranPursuitUnits = requireUnits(PURSUIT_VETERAN_SCENARIO).map((unit) =>
  translateUnit(
    unit,
    unit.unitId === 31 ? 51 : 61,
    0,
    1_240,
    "Veteran pursuit area",
  ),
);

/** Persistent Milestone 4 regression asset; do not retune as a showcase. */
export const MILESTONE_4_VISUAL_SCENARIO: SimulationScenario = Object.freeze({
  seed: 0x4a_4f,
  entityCount: 110,
  bounds: Object.freeze({ width: 1_280, height: 1_900 }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  combatSandbox: Object.freeze({
    kind: "liveCombatSandbox",
    appliedDamagePressureScale: 7,
    units: Object.freeze([
      ...comparisonUnits,
      ...regularPursuitUnits,
      ...veteranPursuitUnits,
    ]),
  }),
});

function requireUnits(
  scenario: SimulationScenario,
): readonly CombatSandboxUnitScenario[] {
  const sandbox = scenario.combatSandbox;
  if (sandbox === undefined) {
    throw new Error("Milestone 4 visual source scenario requires combat units.");
  }
  return sandbox.units;
}

function translateUnit(
  unit: CombatSandboxUnitScenario,
  unitId: number,
  offsetX: number,
  offsetY: number,
  areaLabel: string,
): CombatSandboxUnitScenario {
  return Object.freeze({
    ...unit,
    unitId,
    label: `${areaLabel}: ${unit.label ?? `Unit ${unit.unitId}`}`,
    anchorX: unit.anchorX + offsetX,
    anchorY: unit.anchorY + offsetY,
    deploymentZone: Object.freeze({
      minX: unit.deploymentZone.minX + offsetX,
      maxX: unit.deploymentZone.maxX + offsetX,
      minY: unit.deploymentZone.minY + offsetY,
      maxY: unit.deploymentZone.maxY + offsetY,
    }),
  });
}
