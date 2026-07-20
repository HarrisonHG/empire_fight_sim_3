import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAIN_BATTLE_BARBARIAN_DEATH_COUNT_TICKS,
  MAIN_BATTLE_MEDICAL_ENTITY_COUNT,
  MAIN_BATTLE_MEDICAL_SCENARIO,
  MAIN_BATTLE_MEDICAL_SEED,
} from "../../src/content/mainBattleMedicalScenario";
import { VISUAL_TEST_REGISTRY } from "../../src/content/visualTestRegistry";
import { getIndividualCasualtyProcedureProfile } from "../../src/sim/individualCasualtyProcedureProfile";
import { getIndividualCombatProfile } from "../../src/sim/individualCombatProfile";
import { getIndividualGenericHerbInspection } from "../../src/sim/individualMedicalProfile";
import { getTrustedIndividualMedicalProfile } from "../../src/sim/individualMedicalProfile";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import type { SimulationState } from "../../src/sim/types";
import { getUnitIds, getUnitMembers } from "../../src/sim/unitIdentity";

describe("Spike 6.5 main battle medical integration sandbox", () => {
  it("authors four production units with the requested side sizes and explicit procedures", () => {
    expect(MAIN_BATTLE_MEDICAL_SEED).toBe(0x65_ba_7701);
    expect(MAIN_BATTLE_MEDICAL_ENTITY_COUNT).toBe(44);
    const sandbox = MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox!;
    expect(sandbox.units.map((unit) => unit.memberCount)).toEqual([12, 12, 10, 10]);
    expect(sandbox.units.map((unit) => unit.casualtyProcedure.procedureKind))
      .toEqual(["citizen", "citizen", "barbarian", "barbarian"]);
    for (const unit of sandbox.units.slice(0, 2)) {
      expect(unit.casualtyProcedure).toEqual({
        procedureKind: "citizen",
        deathCountPolicy: { kind: "normalFortitude" },
      });
    }
    for (const unit of sandbox.units.slice(2)) {
      expect(unit.casualtyProcedure).toMatchObject({
        procedureKind: "barbarian",
        deathCountPolicy: {
          kind: "fixedTicks",
          durationTicks: MAIN_BATTLE_BARBARIAN_DEATH_COUNT_TICKS,
        },
      });
      const destination = unit.casualtyProcedure.respawnDestination!;
      expect(destination.x).toBeGreaterThan(1_200);
      expect(destination.x).toBeLessThan(MAIN_BATTLE_MEDICAL_SCENARIO.bounds.width);
      expect(destination.y).toBeGreaterThanOrEqual(0);
      expect(destination.y).toBeLessThan(MAIN_BATTLE_MEDICAL_SCENARIO.bounds.height);
    }
  });

  it("expands exactly one six-herb Physick and one herb-free Chirurgeon per unit", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    const combat = requireCombat(simulation);
    for (const unitId of getUnitIds(combat.identityStore)) {
      const profiles = getUnitMembers(combat.identityStore, unitId).map((entityId) => ({
        entityId,
        medical: getTrustedIndividualMedicalProfile(
          combat.trustedIndividualMedicalProfileStore,
          entityId,
        ),
      }));
      const physicks = profiles.filter(({ medical }) => medical.hasPhysick);
      const chirurgeonsOnly = profiles.filter(({ medical }) =>
        medical.hasChirurgeon && !medical.hasPhysick);
      expect(physicks).toHaveLength(1);
      expect(chirurgeonsOnly).toHaveLength(1);
      expect(getIndividualGenericHerbInspection(
        combat.individualGenericHerbStore,
        physicks[0]!.entityId,
      )).toEqual({ current: 6, maximum: 6, reserved: 0 });
      expect(getIndividualGenericHerbInspection(
        combat.individualGenericHerbStore,
        chirurgeonsOnly[0]!.entityId,
      )).toEqual({ current: 0, maximum: 0, reserved: 0 });
    }
  });

  it("keeps mixed equipment inside recognisable units and uses trusted per-entity authorities", () => {
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    const combat = requireCombat(simulation);
    const allWeapons = new Set<string>();
    const allArmour = new Set<string>();
    const allShields = new Set<string>();
    for (const unitId of getUnitIds(combat.identityStore)) {
      const unitWeapons = new Set<string>();
      const unitArmour = new Set<string>();
      for (const entityId of getUnitMembers(combat.identityStore, unitId)) {
        const profile = getIndividualCombatProfile(combat.individualProfileStore, entityId);
        unitWeapons.add(profile.primaryWeapon);
        unitArmour.add(profile.armourCategory);
        allWeapons.add(profile.primaryWeapon);
        allArmour.add(profile.armourCategory);
        allShields.add(profile.shieldCategory);
        expect(getIndividualCasualtyProcedureProfile(
          combat.individualCasualtyProcedureProfileStore,
          entityId,
        ).procedureKind).toBe(unitId < 200 ? "citizen" : "barbarian");
      }
      expect(unitWeapons.size).toBeGreaterThanOrEqual(4);
      expect(unitArmour.size).toBeGreaterThanOrEqual(3);
    }
    expect(allWeapons).toEqual(new Set([
      "staff", "rod", "oneHanded", "polearm", "greatWeapon", "pike",
    ]));
    expect(allArmour).toEqual(new Set(["none", "light", "medium", "heavy"]));
    expect(allShields).toEqual(new Set(["none", "buckler", "shield"]));
  });

  it("resets and replays deterministically from the same authored battle", () => {
    expect(createInitialSnapshot(createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO)))
      .toEqual(createInitialSnapshot(createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO)));
    expect(runDigest(800)).toEqual(runDigest(800));
  }, 40_000);

  it("runs production combat, casualty and medical authorities through a bounded smoke", () => {
    const { simulation, seen } = smokeRun();
    expect(seen).toMatchObject({
      combat: true,
      zeroHit: true,
      rescue: true,
      claim: true,
      treatment: true,
      routing: true,
    });
    const snapshot = createPositionSnapshot(simulation);
    expect(snapshot.combatDebug?.inspectedIndividuals).toHaveLength(44);
    expect(snapshot.combatDebug?.individualCombatVisuals).toHaveLength(44);
    expect(snapshot.combatDebug?.inspectedCombatVisualEvents.length)
      .toBeLessThanOrEqual(MAIN_BATTLE_MEDICAL_ENTITY_COUNT * 10);
  }, 30_000);

  it("keeps retained routes unchanged and contains no direct outcome fixture", () => {
    expect(VISUAL_TEST_REGISTRY.map((entry) => entry.id)).toEqual([
      "casualty-lifecycle",
      "movement-behaviour",
      "combat-foundation",
      "morale-inspection",
      "individual-combat",
      "defence-overwhelm",
    ]);
    expect(VISUAL_TEST_REGISTRY.every((entry) =>
      entry.scenario !== MAIN_BATTLE_MEDICAL_SCENARIO)).toBe(true);
    expect(MAIN_BATTLE_MEDICAL_SCENARIO.legacyCombatFoundationSandbox)
      .toBeUndefined();
    expect(MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox)
      .not.toHaveProperty("retainedCasualtyVisualFixture");
    const source = readFileSync(join(
      process.cwd(),
      "src",
      "content",
      "mainBattleMedicalScenario.ts",
    ), "utf8");
    expect(source).not.toMatch(
      /landedHitLoss|traumaticWoundOpportunity|executionIntent|limbDisability|relocate|boundedMove/,
    );
    expect(readFileSync(join(process.cwd(), "src", "main.ts"), "utf8"))
      .toMatch(/MAIN_BATTLE_MEDICAL_SCENARIO/);
  });
});

let smokeCache: ReturnType<typeof executeSmoke> | undefined;

function smokeRun(): ReturnType<typeof executeSmoke> {
  smokeCache ??= executeSmoke();
  return smokeCache;
}

function executeSmoke() {
  const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
  const seen = {
    combat: false,
    zeroHit: false,
    rescue: false,
    claim: false,
    treatment: false,
    routing: false,
  };
  for (let index = 0; index < 1_200; index += 1) {
    advanceSimulationOneTick(simulation);
    const combat = requireCombat(simulation);
    seen.combat ||= combat.individualAttackAttemptCount > 0;
    seen.zeroHit ||= combat.individualCombatPipelineBuffers.zeroHitEvents.length > 0;
    seen.rescue ||=
      combat.casualtyAssistanceDecisionResult.rescueRequestedRecords.length > 0;
    seen.claim ||= combat.individualMedicalClaimResult.claimRecords.length > 0;
    seen.treatment ||= combat.individualTreatmentActionResult.activeActionCount > 0;
    seen.routing ||= createPositionSnapshot(simulation).combatDebug!.units.some(
      (unit) => unit.persistentMoraleState === "routing",
    );
  }
  return { simulation, seen };
}

function runDigest(ticks: number): unknown {
  const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
  for (let index = 0; index < ticks; index += 1) {
    advanceSimulationOneTick(simulation);
  }
  const snapshot = createPositionSnapshot(simulation);
  return {
    tick: snapshot.tick,
    positions: Array.from(snapshot.positions),
    units: snapshot.combatDebug?.units,
    individuals: snapshot.combatDebug?.inspectedIndividuals,
  };
}

function requireCombat(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected production combat sandbox.");
  }
  return simulation.combatSandbox;
}
