import type { SimulationScenario } from "../sim/types";

export const DEFAULT_LIVE_COMBAT_SEED = 0x35c0_0001;

/**
 * The normal app scene for Spike 3.5. The narrow data shape is intentional:
 * this is one inspectable combat sandbox, not a configurable scenario system.
 */
export const LIVE_COMBAT_SCENARIO: SimulationScenario = Object.freeze({
  seed: DEFAULT_LIVE_COMBAT_SEED,
  entityCount: 35,
  bounds: Object.freeze({
    width: 1_280,
    height: 720,
  }),
  // The raw foundation mover is inactive for this scenario. These remain
  // valid because world construction still validates the common base data.
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  combatSandbox: Object.freeze({
    kind: "liveCombatSandbox",
    // Slow pressure growth keeps the contact line visibly stable for a long
    // run while still letting the morale hook report combat stress.
    appliedDamagePressureScale: 1,
    units: Object.freeze([
      Object.freeze({
        unitId: 1,
        factionId: 1,
        memberCount: 20,
        deploymentZone: Object.freeze({
          minX: 220,
          maxX: 350,
          minY: 290,
          maxY: 430,
        }),
        // The odd initial anchor separation and shallow ranks let both
        // opposing centres remain in front of one another at engageFront.
        anchorX: 289,
        anchorY: 360,
        headingX: 1,
        headingY: 0,
        spacing: 4,
        rows: 2,
        cols: 10,
        unitSpeed: 2,
        order: "advance",
        role: "veteran",
        memberMaxStep: 3,
        weaponCategory: "pike",
        weaponReachBand: "veryLong",
        armourClass: "light",
        shieldClass: "none",
        attackIntervalTicks: 1,
        maxDamageCapacity: 1_000_000,
    casualtyProcedure: Object.freeze({
      procedureKind: "citizen" as const,
      deathCountPolicy: Object.freeze({ kind: "normalFortitude" as const }),
    }),
      }),
      Object.freeze({
        unitId: 2,
        factionId: 2,
        memberCount: 15,
        deploymentZone: Object.freeze({
          minX: 930,
          maxX: 1_060,
          minY: 290,
          maxY: 430,
        }),
        anchorX: 990,
        anchorY: 360,
        headingX: -1,
        headingY: 0,
        spacing: 4,
        rows: 2,
        cols: 8,
        unitSpeed: 2,
        order: "advance",
        role: "veteran",
        memberMaxStep: 3,
        weaponCategory: "pike",
        weaponReachBand: "veryLong",
        armourClass: "light",
        shieldClass: "none",
        attackIntervalTicks: 1,
        maxDamageCapacity: 1_000_000,
    casualtyProcedure: Object.freeze({
      procedureKind: "citizen" as const,
      deathCountPolicy: Object.freeze({ kind: "normalFortitude" as const }),
    }),
      }),
    ]),
  }),
});

const MILESTONE_3_COMBAT_SANDBOX =
  LIVE_COMBAT_SCENARIO.combatSandbox as NonNullable<
    SimulationScenario["combatSandbox"]
  >;

/** Archived Milestone 3 unit-combat fixture; not the production combat path. */
export const MILESTONE_3_COMBAT_FOUNDATION_SCENARIO: SimulationScenario =
  Object.freeze({
    seed: DEFAULT_LIVE_COMBAT_SEED,
    entityCount: LIVE_COMBAT_SCENARIO.entityCount,
    bounds: LIVE_COMBAT_SCENARIO.bounds,
    minSpeedUnitsPerTick: LIVE_COMBAT_SCENARIO.minSpeedUnitsPerTick,
    maxSpeedUnitsPerTick: LIVE_COMBAT_SCENARIO.maxSpeedUnitsPerTick,
    legacyCombatFoundationSandbox: MILESTONE_3_COMBAT_SANDBOX,
  });
