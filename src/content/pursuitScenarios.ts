import type { CombatSandboxUnitScenario, SimulationScenario } from "../sim/types";

/**
 * Small deterministic inspection cases for the 4H-4 routing lifecycle. The
 * red pursuit is intentionally identical in both cases; only the blue unit's
 * troop profile differs.
 */
export const PURSUIT_REGULAR_SCENARIO = createPursuitScenario("regular");
export const PURSUIT_VETERAN_SCENARIO = createPursuitScenario("veteran");

function createPursuitScenario(
  blueRole: "regular" | "veteran",
): SimulationScenario {
  return Object.freeze({
    seed: 0x4a_4,
    entityCount: 20,
    bounds: Object.freeze({ width: 1_280, height: 720 }),
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: Object.freeze({
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 7,
      units: Object.freeze([
        bluePursuitUnit(blueRole),
        redPursuitUnit(),
      ]),
    }),
  });
}

function bluePursuitUnit(
  role: "regular" | "veteran",
): CombatSandboxUnitScenario {
  const anchorX = 540;
  const anchorY = 360;
  return {
    unitId: 31,
    label: `Blue ${role} pursuit subject`,
    factionId: 1,
    memberCount: 10,
    deploymentZone: zone(anchorX, anchorY),
    anchorX,
    anchorY,
    headingX: 1,
    headingY: 0,
    spacing: 6,
    rows: 2,
    cols: 5,
    unitSpeed: 3,
    order: "advance",
    role,
    memberMaxStep: 4,
    weaponCategory: "pike",
    weaponReachBand: "veryLong",
    armourClass: "light",
    shieldClass: "none",
    attackIntervalTicks: 1,
    maxDamageCapacity: 1_000_000,
    initialCohesion: 650,
    individualConfidence: 500,
  };
}

function redPursuitUnit(): CombatSandboxUnitScenario {
  const anchorX = 580;
  const anchorY = 360;
  return {
    unitId: 41,
    label: "Red advancing pursuit line",
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
    unitSpeed: 2,
    order: "advance",
    role: "regular",
    memberMaxStep: 3,
    weaponCategory: "pike",
    weaponReachBand: "veryLong",
    armourClass: "light",
    shieldClass: "none",
    attackIntervalTicks: 1,
    maxDamageCapacity: 1_000_000,
    initialCohesion: 1_000,
    individualConfidence: 2_500,
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
