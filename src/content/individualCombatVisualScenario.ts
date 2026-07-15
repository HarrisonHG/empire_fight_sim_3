import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
} from "../sim/types";

export const INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID = "individual-combat";
export const INDIVIDUAL_COMBAT_VISUAL_SEED = 0x5c_000b;
export const INDIVIDUAL_COMBAT_AREA_SPACING = 300;
export const INDIVIDUAL_COMBAT_LOCAL_INTERACTION_RANGE = 192;
export const INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS = Object.freeze(
  Array.from({ length: 20 }, (_, entityId) => entityId),
);
export const INDIVIDUAL_COMBAT_VISUAL_WORLD_WIDTH = 1_200;
export const INDIVIDUAL_COMBAT_VISUAL_WORLD_HEIGHT = 580;

export const INDIVIDUAL_COMBAT_AREA_LABELS = Object.freeze([
  "First frontal defence",
  "Held shield defence",
  "Two attackers overwhelm guard",
  "Weapon reach",
  "Armour and global hits",
  "One-second relationship gate",
  "Independent attackers",
] as const);
export const INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES = Object.freeze([
  "Top row: 1 Parry · 2 Shield · 3 Guard overwhelm · 4 Reach",
  "Bottom row: 5 Armour · 6 Gate · 7 Independent attackers",
  "Glyphs: facing arrow · weapon vector · faint maximum reach overlay · dashed preferred-distance marker",
  "Defence: buckler narrow held arc · shield wider held arc · armour rings show none/light/medium/heavy/mageArmour",
  "Readiness: percentage showing how far defence probability has recovered toward its maximum.",
  "Successful defence: one green crossed marker for weapon parry, buckler block, or shield block; inspection text names the source.",
  "Morale: Route risk routes at 40 and must fall below 20 for recovery; Recovery progress requires 240.",
] as const);

export const INDIVIDUAL_COMBAT_VISUAL_DETAIL_LABELS = Object.freeze([
  Object.freeze({ text: "Polearm comparison pair", x: 1050, y: 158 }),
  Object.freeze({ text: "One-handed comparison pair", x: 1050, y: 178 }),
  Object.freeze({
    text: "One-handed must close farther.",
    x: 1050,
    y: 202,
  }),
  Object.freeze({
    text: "Polearm can select and commit from greater range.",
    x: 1050,
    y: 218,
  }),
  Object.freeze({ text: "Unarmoured target", x: 220, y: 412 }),
  Object.freeze({ text: "Heavy-armoured target", x: 220, y: 468 }),
]);

export interface IndividualCombatVisualChamberMetadata {
  readonly id: number;
  readonly label: (typeof INDIVIDUAL_COMBAT_AREA_LABELS)[number];
  readonly entityIds: readonly number[];
  readonly centreX: number;
  readonly centreY: number;
}

const FIRST_CHAMBER_CENTRE_X = 150;
const FIRST_CHAMBER_CENTRE_Y = 140;

export const INDIVIDUAL_COMBAT_VISUAL_CHAMBERS = Object.freeze([
  chamberMetadata(1, "First frontal defence", [0, 1], 0, 0),
  chamberMetadata(2, "Held shield defence", [2, 3], 1, 0),
  chamberMetadata(3, "Two attackers overwhelm guard", [4, 5, 6], 2, 0),
  chamberMetadata(4, "Weapon reach", [7, 8, 9, 10], 3, 0),
  chamberMetadata(5, "Armour and global hits", [11, 12, 13, 14], 0, 1),
  chamberMetadata(6, "One-second relationship gate", [15, 16], 1, 1),
  chamberMetadata(7, "Independent attackers", [17, 18, 19], 2, 1),
] as const);

export const INDIVIDUAL_COMBAT_VISUAL_SCENARIO: SimulationScenario =
  Object.freeze({
    seed: INDIVIDUAL_COMBAT_VISUAL_SEED,
    entityCount: INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS.length,
    bounds: Object.freeze({
      width: INDIVIDUAL_COMBAT_VISUAL_WORLD_WIDTH,
      height: INDIVIDUAL_COMBAT_VISUAL_WORLD_HEIGHT,
    }),
    minSpeedUnitsPerTick: 1,
    maxSpeedUnitsPerTick: 1,
    combatSandbox: Object.freeze({
      kind: "liveCombatSandbox",
      appliedDamagePressureScale: 1,
      inspectedEntityIds: INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS,
      units: Object.freeze([
        chamberUnit(101, 1, 0, -8, 0, "First defence attacker", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(102, 2, 0, 8, 0, "First defence parrier", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),

        chamberUnit(201, 1, 1, -8, 0, "Shield defence attacker", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(202, 2, 1, 8, 0, "Held shield defender", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          shieldClass: "shield",
        }),

        chamberUnit(301, 1, 2, -8, -4, "Overwhelm attacker A", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(302, 1, 2, -8, 4, "Overwhelm attacker B", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(303, 2, 2, 8, 0, "Overwhelmed parrier", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),

        chamberUnit(401, 1, 3, -9, -10, "Reach polearm attacker", {
          weaponCategory: "polearm",
          weaponReachBand: "long",
        }),
        chamberUnit(402, 2, 3, 9, -10, "Reach polearm target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
        }),
        chamberUnit(403, 1, 3, -9, 10, "Reach one-handed attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(404, 2, 3, 1, 10, "Reach one-handed target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
        }),

        chamberUnit(501, 1, 4, -4, -28, "Unarmoured-hit attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(502, 2, 4, 4, -28, "Unarmoured defender", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          armourClass: "none",
        }),
        chamberUnit(503, 1, 4, -4, 28, "Heavy-hit attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(504, 2, 4, 4, 28, "Heavy-armoured defender", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          armourClass: "heavy",
        }),

        chamberUnit(601, 1, 5, -4, 0, "Gate attacker", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(602, 2, 5, 4, 0, "Gate heavy target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
          armourClass: "heavy",
        }),

        chamberUnit(701, 1, 6, -4, -4, "Independent attacker A", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(702, 1, 6, -4, 4, "Independent attacker B", {
          weaponCategory: "oneHanded",
          weaponReachBand: "short",
        }),
        chamberUnit(703, 2, 6, 4, 0, "Independent zero-hit target", {
          weaponCategory: "unarmed",
          weaponReachBand: "none",
        }),
      ]),
    }),
  });

function chamberUnit(
  unitId: number,
  factionId: number,
  chamberIndex: number,
  offsetX: number,
  offsetY: number,
  label: string,
  overrides: Partial<CombatSandboxUnitScenario>,
): CombatSandboxUnitScenario {
  const chamber = INDIVIDUAL_COMBAT_VISUAL_CHAMBERS[chamberIndex];
  if (chamber === undefined) {
    throw new RangeError(`Unknown individual combat visual chamber: ${chamberIndex}`);
  }
  const x = chamber.centreX + offsetX;
  const y = chamber.centreY + offsetY;
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

function chamberMetadata(
  id: number,
  label: (typeof INDIVIDUAL_COMBAT_AREA_LABELS)[number],
  entityIds: readonly number[],
  column: number,
  row: number,
): IndividualCombatVisualChamberMetadata {
  return Object.freeze({
    id,
    label,
    entityIds: Object.freeze([...entityIds]),
    centreX:
      FIRST_CHAMBER_CENTRE_X + column * INDIVIDUAL_COMBAT_AREA_SPACING,
    centreY:
      FIRST_CHAMBER_CENTRE_Y + row * INDIVIDUAL_COMBAT_AREA_SPACING,
  });
}
