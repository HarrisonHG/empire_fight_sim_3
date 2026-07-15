import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
} from "../sim/types";

export const DEFENCE_OVERWHELM_SCENARIO_ID = "defence-overwhelm";
export const DEFENCE_OVERWHELM_SEED = 4;
export const DEFENCE_OVERWHELM_WORLD_WIDTH = 1_200;
export const DEFENCE_OVERWHELM_WORLD_HEIGHT = 600;

export const DEFENCE_OVERWHELM_CHAMBERS = Object.freeze([
  chamber(1, "Strike and immediate counterattack", [0, 1], 200, 150),
  chamber(2, "Regular shield · production cadence", [2, 3], 600, 150),
  chamber(3, "Recruit shield · same cadence", [4, 5], 1_000, 150),
  chamber(4, "Regular shield · two-attacker flurry", [6, 7, 8], 200, 450),
  chamber(5, "Veteran shield · same flurry", [9, 10, 11], 600, 450),
  chamber(6, "Rear desperate defence · fixed 5%", [12, 13], 1_000, 450),
] as const);

export const DEFENCE_OVERWHELM_LEGEND_LINES = Object.freeze([
  "Stored readiness: persistent 0–100% guard meter; each usable defence attempt spends 20% after its roll.",
  "Effective readiness: stored readiness while ready; 0% while committing or recovering an attack.",
  "Recovery: recruit +0.5%, regular +1%, veteran +1.5% per tick.",
  "Chance: equipment minimum plus effective readiness toward the 95% maximum.",
  "Rear desperate defence: fixed 5% with usable equipment, independent of tier/readiness.",
  "Cadence note: chambers use production weapon commitment/recovery timing; exact 20/10-tick cadence traces are headless tests.",
]);

export const DEFENCE_OVERWHELM_SCENARIO: SimulationScenario = Object.freeze({
  seed: DEFENCE_OVERWHELM_SEED,
  entityCount: 14,
  bounds: Object.freeze({
    width: DEFENCE_OVERWHELM_WORLD_WIDTH,
    height: DEFENCE_OVERWHELM_WORLD_HEIGHT,
  }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  combatSandbox: Object.freeze({
    kind: "liveCombatSandbox",
    appliedDamagePressureScale: 1,
    inspectedEntityIds: Object.freeze(Array.from({ length: 14 }, (_, id) => id)),
    units: Object.freeze([
      unit(101, 1, 200, 150, -6, 0, "Counter fighter A", "regular", "oneHanded"),
      unit(102, 2, 200, 150, 6, 0, "Counter fighter B", "regular", "oneHanded"),
      unit(201, 1, 600, 150, -8, 0, "Regular cadence attacker", "regular", "polearm"),
      unit(202, 2, 600, 150, 8, 0, "Regular shield defender", "regular", "unarmed", "shield"),
      unit(301, 1, 1_000, 150, -8, 0, "Recruit cadence attacker", "regular", "polearm"),
      unit(302, 2, 1_000, 150, 8, 0, "Recruit shield defender", "recruit", "unarmed", "shield"),
      unit(401, 1, 200, 450, -8, -4, "Regular flurry attacker A", "regular", "polearm"),
      unit(402, 1, 200, 450, -8, 4, "Regular flurry attacker B", "regular", "polearm"),
      unit(403, 2, 200, 450, 8, 0, "Regular flurry defender", "regular", "unarmed", "shield"),
      unit(501, 1, 600, 450, -8, -4, "Veteran flurry attacker A", "regular", "polearm"),
      unit(502, 1, 600, 450, -8, 4, "Veteran flurry attacker B", "regular", "polearm"),
      unit(503, 2, 600, 450, 8, 0, "Veteran flurry defender", "veteran", "unarmed", "shield"),
      unit(601, 1, 1_000, 450, 8, 0, "Rear attacker", "regular", "oneHanded", "none", -1),
      unit(602, 2, 1_000, 450, 0, 0, "Rear staff defender", "regular", "staff", "none", -1),
    ]),
  }),
});

function chamber(
  id: number,
  label: string,
  entityIds: readonly number[],
  centreX: number,
  centreY: number,
) {
  return Object.freeze({ id, label, entityIds: Object.freeze([...entityIds]), centreX, centreY });
}

function unit(
  unitId: number,
  factionId: number,
  centreX: number,
  centreY: number,
  offsetX: number,
  offsetY: number,
  label: string,
  role: "recruit" | "regular" | "veteran",
  weaponCategory: "unarmed" | "oneHanded" | "polearm" | "staff",
  shieldClass: "none" | "shield" = "none",
  headingX: -1 | 1 = factionId === 1 ? 1 : -1,
): CombatSandboxUnitScenario {
  const x = centreX + offsetX;
  const y = centreY + offsetY;
  return {
    unitId,
    factionId,
    memberCount: 1,
    deploymentZone: Object.freeze({ minX: x, maxX: x, minY: y, maxY: y }),
    anchorX: x,
    anchorY: y,
    headingX,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold",
    role,
    memberMaxStep: 1,
    weaponCategory,
    weaponReachBand:
      weaponCategory === "polearm" || weaponCategory === "staff"
        ? "long"
        : weaponCategory === "oneHanded"
          ? "short"
          : "none",
    armourClass: "none",
    shieldClass,
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: Object.freeze({
      procedureKind: "citizen" as const,
      deathCountPolicy: Object.freeze({ kind: "normalFortitude" as const }),
    }),
    label,
  };
}
