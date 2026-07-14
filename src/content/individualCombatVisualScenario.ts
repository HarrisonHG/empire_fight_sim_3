import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
} from "../sim/types";

export const INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID = "individual-combat";
export const INDIVIDUAL_COMBAT_VISUAL_SEED = 0x5c_0300;
export const INDIVIDUAL_COMBAT_AREA_SPACING = 300;
export const INDIVIDUAL_COMBAT_LOCAL_INTERACTION_RANGE = 192;
export const INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS = Object.freeze(
  Array.from({ length: 20 }, (_, entityId) => entityId),
);

export const INDIVIDUAL_COMBAT_AREA_LABELS = Object.freeze([
  "First frontal defence",
  "Held shield defence",
  "Two attackers overwhelm guard",
  "Weapon reach",
  "Armour and global hits",
  "One-second relationship gate",
  "Independent attackers",
] as const);

const FIRST_Y = 120;

export const INDIVIDUAL_COMBAT_VISUAL_SCENARIO: SimulationScenario =
  Object.freeze({
    seed: INDIVIDUAL_COMBAT_VISUAL_SEED,
    entityCount: INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS.length,
    bounds: Object.freeze({
      width: 280,
      height: FIRST_Y + INDIVIDUAL_COMBAT_AREA_SPACING * 6 + 160,
    }),
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: Object.freeze({
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      inspectedEntityIds: INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS,
      units: Object.freeze([
        chamberUnit(101, 1, 100, areaY(0), "First defence attacker", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(102, 2, 116, areaY(0), "First defence parrier", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),

        chamberUnit(201, 1, 100, areaY(1), "Shield defence attacker", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(202, 2, 116, areaY(1), "Held shield defender", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          shieldClass: "shield",
        }),

        chamberUnit(301, 1, 100, areaY(2) - 4, "Overwhelm attacker A", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(302, 1, 100, areaY(2) + 4, "Overwhelm attacker B", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(303, 2, 116, areaY(2), "Overwhelmed parrier", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),

        chamberUnit(401, 1, 100, areaY(3) - 10, "Reach polearm attacker", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(402, 2, 118, areaY(3) - 10, "Reach polearm target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
        }),
        chamberUnit(403, 1, 100, areaY(3) + 10, "Reach one-handed attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(404, 2, 110, areaY(3) + 10, "Reach one-handed target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
        }),

        chamberUnit(501, 1, 100, areaY(4) - 8, "Unarmoured-hit attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(502, 2, 108, areaY(4) - 8, "Unarmoured defender", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          armourClass: "none",
        }),
        chamberUnit(503, 1, 100, areaY(4) + 8, "Heavy-hit attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(504, 2, 108, areaY(4) + 8, "Heavy-armoured defender", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          armourClass: "heavy",
        }),

        chamberUnit(601, 1, 100, areaY(5), "Gate attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(602, 2, 108, areaY(5), "Gate heavy target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          armourClass: "heavy",
        }),

        chamberUnit(701, 1, 100, areaY(6) - 4, "Independent attacker A", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(702, 1, 100, areaY(6) + 4, "Independent attacker B", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(703, 2, 108, areaY(6), "Independent zero-hit target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
        }),
      ]),
    }),
  });

function areaY(index: number): number {
  return FIRST_Y + index * INDIVIDUAL_COMBAT_AREA_SPACING;
}

function chamberUnit(
  unitId: number,
  factionId: number,
  x: number,
  y: number,
  label: string,
  overrides: Partial<CombatSandboxUnitScenario>,
): CombatSandboxUnitScenario {
  return {
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: Object.freeze({ minX: x, maxX: x, minY: y, maxY: y }),
    anchorX: x,
    anchorY: y,
    headingX: factionId === 1 ? 1 : -1,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold",
    role: "veteran",
    memberMaxStep: 1,
    weaponCategory: "oneHanded",
    weaponReachBand: "short",
    armourClass: "none",
    shieldClass: "none",
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    label,
    ...overrides,
  };
}
