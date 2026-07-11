import type { CombatSandboxUnitScenario, SimulationScenario } from "../sim/types";

export const MORALE_INSPECTION_SCENARIO: SimulationScenario = Object.freeze({
  seed: 0x4a_2,
  entityCount: 70,
  bounds: Object.freeze({ width: 1_280, height: 720 }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  combatSandbox: Object.freeze({
    kind: "liveCombatSandbox",
    appliedDamagePressureScale: 7,
    units: Object.freeze([
      blueUnit(11, 10, 160, "veteran", 900, 1_000, "advance"),
      blueUnit(12, 10, 360, "regular", 850, 1_000, "advance"),
      blueUnit(13, 10, 560, "recruit", 0, 560, "advance", 520, 6),
      blueUnit(14, 10, 560, "veteran", 1_000, 1_000, "hold", 430),
      hostileUnit(21, 160, "Red veteran opposition"),
      hostileUnit(22, 360, "Red regular opposition"),
      hostileUnit(23, 560, "Red recruit opposition"),
    ]),
  }),
});

function blueUnit(
  unitId: number,
  memberCount: number,
  anchorY: number,
  role: "recruit" | "regular" | "veteran",
  individualConfidence: number,
  initialCohesion: number,
  order: "advance" | "hold",
  anchorX = 520,
  unitSpeed = 2,
): CombatSandboxUnitScenario {
  return {
    unitId,
    label:
      unitId === 11
        ? "Blue veteran line"
        : unitId === 12
          ? "Blue regular line"
          : unitId === 13
            ? "Blue recruit line"
            : "Blue reserve",
    factionId: 1,
    memberCount,
    deploymentZone: zone(anchorX, anchorY),
    anchorX,
    anchorY,
    headingX: 1,
    headingY: 0,
    spacing: 6,
    rows: 2,
    cols: 5,
    unitSpeed,
    order,
    role,
    memberMaxStep: 3,
    weaponCategory: "pike",
    weaponReachBand: "veryLong",
    armourClass: "light",
    shieldClass: "none",
    attackIntervalTicks: 1,
    maxDamageCapacity: 1_000_000,
    initialCohesion,
    individualConfidence,
  };
}

function hostileUnit(
  unitId: number,
  anchorY: number,
  label: string,
): CombatSandboxUnitScenario {
  const anchorX = 560;
  return {
    unitId,
    label,
    factionId: 2,
    memberCount: 10,
    deploymentZone: zone(anchorX, anchorY),
    anchorX,
    anchorY,
    headingX: -1,
    headingY: 0,
    spacing: 6,
    rows: 2,
    cols: 5,
    unitSpeed: 0,
    order: "hold",
    role: "regular",
    memberMaxStep: 3,
    weaponCategory: "pike",
    weaponReachBand: "veryLong",
    armourClass: "light",
    shieldClass: "none",
    attackIntervalTicks: 1,
    maxDamageCapacity: 1_000_000,
    initialCohesion: 1_000,
    individualConfidence: 500,
  };
}

function zone(anchorX: number, anchorY: number) {
  return Object.freeze({
    minX: anchorX - 15,
    maxX: anchorX + 15,
    minY: anchorY - 20,
    maxY: anchorY + 20,
  });
}
