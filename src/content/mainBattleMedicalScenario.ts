import type {
  CombatSandboxMemberProfileScenario,
  CombatSandboxUnitScenario,
  SimulationScenario,
} from "../sim/types";

export const MAIN_BATTLE_MEDICAL_SEED = 0x65_ba_7701;
export const MAIN_BATTLE_MEDICAL_ENTITY_COUNT = 44;
export const MAIN_BATTLE_MEDICAL_WORLD_WIDTH = 1_440;
export const MAIN_BATTLE_MEDICAL_WORLD_HEIGHT = 900;
export const MAIN_BATTLE_BARBARIAN_DEATH_COUNT_TICKS = 1_200;

export const MAIN_BATTLE_SIDE_LABELS = Object.freeze(new Map([
  [1, "Citizens"],
  [2, "Barbarians"],
] as const));

const FULL_PHYSICK = Object.freeze({
  hasChirurgeon: true,
  hasPhysick: true,
  startingGenericHerbs: 6,
});
const CHIRURGEON_ONLY = Object.freeze({
  hasChirurgeon: true,
  hasPhysick: false,
  startingGenericHerbs: 0,
});

const CITIZEN_PROCEDURE = Object.freeze({
  procedureKind: "citizen" as const,
  deathCountPolicy: Object.freeze({ kind: "normalFortitude" as const }),
});

export const MAIN_BATTLE_MEDICAL_SCENARIO: SimulationScenario = Object.freeze({
  seed: MAIN_BATTLE_MEDICAL_SEED,
  entityCount: MAIN_BATTLE_MEDICAL_ENTITY_COUNT,
  bounds: Object.freeze({
    width: MAIN_BATTLE_MEDICAL_WORLD_WIDTH,
    height: MAIN_BATTLE_MEDICAL_WORLD_HEIGHT,
  }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  combatSandbox: Object.freeze({
    kind: "liveCombatSandbox" as const,
    appliedDamagePressureScale: 2,
    inspectedEntityIds: Object.freeze(
      Array.from({ length: MAIN_BATTLE_MEDICAL_ENTITY_COUNT }, (_, id) => id),
    ),
    units: Object.freeze([
      battleUnit({
        unitId: 101,
        factionId: 1,
        label: "Citizen mixed shield line",
        memberCount: 12,
        anchorX: 260,
        anchorY: 360,
        headingX: 1,
        deploymentMinX: 220,
        deploymentMaxX: 300,
        deploymentMinY: 320,
        deploymentMaxY: 400,
        rows: 3,
        cols: 4,
        casualtyProcedure: CITIZEN_PROCEDURE,
        profiles: citizenShieldProfiles(),
        confidence: 68,
      }),
      battleUnit({
        unitId: 102,
        factionId: 1,
        label: "Citizen polearm levy",
        memberCount: 12,
        anchorX: 260,
        anchorY: 540,
        headingX: 1,
        deploymentMinX: 220,
        deploymentMaxX: 300,
        deploymentMinY: 500,
        deploymentMaxY: 580,
        rows: 3,
        cols: 4,
        casualtyProcedure: CITIZEN_PROCEDURE,
        profiles: citizenPolearmProfiles(),
        confidence: 62,
      }),
      battleUnit({
        unitId: 201,
        factionId: 2,
        label: "Barbarian spear band",
        memberCount: 10,
        anchorX: 1_030,
        anchorY: 360,
        headingX: -1,
        deploymentMinX: 990,
        deploymentMaxX: 1_070,
        deploymentMinY: 320,
        deploymentMaxY: 400,
        rows: 2,
        cols: 5,
        casualtyProcedure: barbarianProcedure(1_350, 285),
        profiles: barbarianSpearProfiles(),
        confidence: 76,
      }),
      battleUnit({
        unitId: 202,
        factionId: 2,
        label: "Barbarian great-weapon band",
        memberCount: 10,
        anchorX: 1_030,
        anchorY: 540,
        headingX: -1,
        deploymentMinX: 990,
        deploymentMaxX: 1_070,
        deploymentMinY: 500,
        deploymentMaxY: 580,
        rows: 2,
        cols: 5,
        casualtyProcedure: barbarianProcedure(1_350, 615),
        profiles: barbarianGreatWeaponProfiles(),
        confidence: 72,
      }),
    ]),
  }),
});

interface BattleUnitOptions {
  readonly unitId: number;
  readonly factionId: number;
  readonly label: string;
  readonly memberCount: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly headingX: -1 | 1;
  readonly deploymentMinX: number;
  readonly deploymentMaxX: number;
  readonly deploymentMinY: number;
  readonly deploymentMaxY: number;
  readonly rows: number;
  readonly cols: number;
  readonly casualtyProcedure: CombatSandboxUnitScenario["casualtyProcedure"];
  readonly profiles: readonly CombatSandboxMemberProfileScenario[];
  readonly confidence: number;
}

function battleUnit(options: BattleUnitOptions): CombatSandboxUnitScenario {
  return Object.freeze({
    unitId: options.unitId,
    factionId: options.factionId,
    memberCount: options.memberCount,
    deploymentZone: Object.freeze({
      minX: options.deploymentMinX,
      maxX: options.deploymentMaxX,
      minY: options.deploymentMinY,
      maxY: options.deploymentMaxY,
    }),
    anchorX: options.anchorX,
    anchorY: options.anchorY,
    headingX: options.headingX,
    headingY: 0,
    spacing: 8,
    rows: options.rows,
    cols: options.cols,
    unitSpeed: 2,
    order: "advance" as const,
    role: "regular" as const,
    fortitudeLevels: options.factionId === 2 ? 2 : 1,
    memberMaxStep: 3,
    weaponCategory: "oneHanded" as const,
    weaponReachBand: "medium" as const,
    armourClass: "medium" as const,
    shieldClass: "buckler" as const,
    attackIntervalTicks: options.factionId === 2 ? 12 : 15,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: options.casualtyProcedure,
    label: options.label,
    initialCohesion: 100,
    individualConfidence: options.confidence,
    memberProfiles: Object.freeze(options.profiles.slice()),
  });
}

function barbarianProcedure(
  x: number,
  y: number,
): CombatSandboxUnitScenario["casualtyProcedure"] {
  return Object.freeze({
    procedureKind: "barbarian" as const,
    deathCountPolicy: Object.freeze({
      kind: "fixedTicks" as const,
      durationTicks: MAIN_BATTLE_BARBARIAN_DEATH_COUNT_TICKS,
    }),
    respawnDestination: Object.freeze({ x, y }),
  });
}

function citizenShieldProfiles(): readonly CombatSandboxMemberProfileScenario[] {
  return profiles([
    support("staff", "none", "none", FULL_PHYSICK),
    support("rod", "light", "buckler", CHIRURGEON_ONLY),
    fighter("oneHanded", "heavy", "shield", "veteran"),
    fighter("oneHanded", "medium", "shield", "regular"),
    fighter("oneHanded", "light", "buckler", "recruit"),
    fighter("polearm", "medium", "none", "regular"),
    fighter("twoHanded", "light", "none", "veteran"),
    fighter("pike", "light", "none", "regular"),
    fighter("oneHanded", "none", "none", "recruit"),
    fighter("polearm", "light", "none", "regular"),
    fighter("oneHanded", "medium", "buckler", "regular"),
    fighter("staff", "none", "none", "recruit"),
  ]);
}

function citizenPolearmProfiles(): readonly CombatSandboxMemberProfileScenario[] {
  return profiles([
    support("staff", "light", "none", FULL_PHYSICK),
    support("rod", "none", "buckler", CHIRURGEON_ONLY),
    fighter("polearm", "medium", "none", "veteran"),
    fighter("pike", "medium", "none", "regular"),
    fighter("polearm", "light", "none", "regular"),
    fighter("twoHanded", "medium", "none", "regular"),
    fighter("oneHanded", "medium", "shield", "regular"),
    fighter("oneHanded", "light", "buckler", "recruit"),
    fighter("pike", "none", "none", "recruit"),
    fighter("oneHanded", "medium", "shield", "veteran"),
    fighter("polearm", "light", "none", "regular"),
    fighter("oneHanded", "none", "none", "recruit"),
  ]);
}

function barbarianSpearProfiles(): readonly CombatSandboxMemberProfileScenario[] {
  return profiles([
    support("staff", "none", "none", FULL_PHYSICK),
    support("rod", "light", "buckler", CHIRURGEON_ONLY),
    fighter("pike", "medium", "none", "veteran", 3),
    fighter("polearm", "light", "none", "regular", 2),
    fighter("oneHanded", "medium", "shield", "regular", 2),
    fighter("oneHanded", "light", "buckler", "regular", 1),
    fighter("twoHanded", "medium", "none", "veteran", 3),
    fighter("pike", "none", "none", "recruit", 1),
    fighter("oneHanded", "none", "none", "regular", 2),
    fighter("staff", "light", "none", "regular", 2),
  ]);
}

function barbarianGreatWeaponProfiles(): readonly CombatSandboxMemberProfileScenario[] {
  return profiles([
    support("staff", "light", "none", FULL_PHYSICK),
    support("rod", "none", "buckler", CHIRURGEON_ONLY),
    fighter("twoHanded", "heavy", "none", "veteran", 3),
    fighter("twoHanded", "medium", "none", "regular", 2),
    fighter("polearm", "medium", "none", "regular", 2),
    fighter("oneHanded", "medium", "shield", "veteran", 3),
    fighter("oneHanded", "light", "buckler", "regular", 2),
    fighter("pike", "light", "none", "regular", 2),
    fighter("oneHanded", "none", "none", "recruit", 1),
    fighter("staff", "none", "none", "regular", 2),
  ]);
}

function support(
  weaponCategory: NonNullable<CombatSandboxMemberProfileScenario["weaponCategory"]>,
  armourClass: NonNullable<CombatSandboxMemberProfileScenario["armourClass"]>,
  shieldClass: NonNullable<CombatSandboxMemberProfileScenario["shieldClass"]>,
  medicalProfile: NonNullable<CombatSandboxMemberProfileScenario["medicalProfile"]>,
): CombatSandboxMemberProfileScenario {
  return Object.freeze({
    weaponCategory,
    armourClass,
    shieldClass,
    role: "regular" as const,
    fortitudeLevels: 0,
    medicalProfile,
    individualConfidence: 58,
  });
}

function fighter(
  weaponCategory: NonNullable<CombatSandboxMemberProfileScenario["weaponCategory"]>,
  armourClass: NonNullable<CombatSandboxMemberProfileScenario["armourClass"]>,
  shieldClass: NonNullable<CombatSandboxMemberProfileScenario["shieldClass"]>,
  role: NonNullable<CombatSandboxMemberProfileScenario["role"]>,
  fortitudeLevels?: number,
): CombatSandboxMemberProfileScenario {
  return Object.freeze({
    weaponCategory,
    armourClass,
    shieldClass,
    role,
    ...(fortitudeLevels === undefined ? {} : { fortitudeLevels }),
  });
}

function profiles(
  values: readonly CombatSandboxMemberProfileScenario[],
): readonly CombatSandboxMemberProfileScenario[] {
  return Object.freeze(values.slice());
}
