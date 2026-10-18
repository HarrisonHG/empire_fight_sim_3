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
import { getUnitRoutingHeading } from "../../src/sim/formationBehaviour";
import { isIndividualOrdinaryParticipationEligible } from "../../src/sim/individualOrdinaryParticipation";
import { getIndividualCasualtyProcedureProfile } from "../../src/sim/individualCasualtyProcedureProfile";
import { getIndividualCombatProfile } from "../../src/sim/individualCombatProfile";
import { getIndividualGenericHerbInspection } from "../../src/sim/individualMedicalProfile";
import { getTrustedIndividualEnergyProfile } from "../../src/sim/individualEnergy";
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
    expect(sandbox.requireLegalInitialHardStandingPlacement).toBe(true);
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

  it("authors mixed explicit unit energy profiles and opt-in bounded visual evidence", () => {
    const expected = new Map([
      [101, { maximumEnergy: 22_000, safeRestRecoveryPerTick: 5 }],
      [102, { maximumEnergy: 3_600, safeRestRecoveryPerTick: 8 }],
      [201, { maximumEnergy: 15_000, safeRestRecoveryPerTick: 4 }],
      [202, { maximumEnergy: 12_000, safeRestRecoveryPerTick: 5 }],
    ]);
    const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
    const combat = requireCombat(simulation);
    expect(MAIN_BATTLE_MEDICAL_SCENARIO.energyProfile).toBeUndefined();
    expect(MAIN_BATTLE_MEDICAL_SCENARIO.combatSandbox?.includeEnergyDebug)
      .toBe(true);
    for (const unitId of getUnitIds(combat.identityStore)) {
      const authored = expected.get(unitId)!;
      for (const entityId of getUnitMembers(combat.identityStore, unitId)) {
        expect(getTrustedIndividualEnergyProfile(
          combat.trustedIndividualEnergyProfileStore,
          entityId,
        )).toMatchObject({
          maximumEnergy: authored.maximumEnergy,
          startingEnergy: authored.maximumEnergy,
          safeRestRecoveryPerTick: authored.safeRestRecoveryPerTick,
        });
      }
    }
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    expect(snapshot.combatDebug?.units.every((unit) =>
      unit.energyAverageRatioFixedPoint !== undefined &&
      unit.energyBehaviourRecommendation !== undefined
    )).toBe(true);
    expect(snapshot.combatDebug?.inspectedIndividuals.every((individual) =>
      individual.energyAttackRecoveryDurationMultiplierPercent !== undefined &&
      individual.energyGuardReadinessRecoveryMultiplierPercent !== undefined &&
      individual.energyPressureRecoveryMultiplierPercent !== undefined
    )).toBe(true);
  });

  it("resets and replays deterministically from the same authored battle", () => {
    expect(createInitialSnapshot(createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO)))
      .toEqual(createInitialSnapshot(createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO)));
    const first = runDigest(800);
    expect(runDigest(800)).toEqual(first);
    expect(first.moraleTransitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "routing" }),
      expect.objectContaining({ state: "recovering" }),
    ]));
  }, 90_000);

  it("runs production combat, casualty and medical authorities through a bounded smoke", () => {
    const { simulation, seen, elapsedMs } = smokeRun();
    // Synchronous ticks can prevent the test runner from noticing its timeout.
    expect(elapsedMs).toBeLessThan(60_000);
    // 8E rescue-group congestion remains bounded but makes final-displacement
    // energy evidence reach the existing winded threshold in this smoke.
    expect(seen).toMatchObject({
      combat: true,
      zeroHit: true,
      rescue: true,
      claim: true,
      treatment: true,
      routing: true,
      winded: true,
    });
    const snapshot = createPositionSnapshot(simulation);
    expect(snapshot.combatDebug?.inspectedIndividuals).toHaveLength(44);
    expect(snapshot.combatDebug?.individualCombatVisuals).toHaveLength(44);
    expect(snapshot.combatDebug?.inspectedCombatVisualEvents.length)
      .toBeLessThanOrEqual(MAIN_BATTLE_MEDICAL_ENTITY_COUNT * 10);
  }, 60_000);

  it("physically retreats and recovers after natural routing", () => {
    const { routingEpisodes } = smokeRun();
    const episode = routingEpisodes.find((candidate) =>
      candidate.physicalRetreatTick !== undefined &&
      candidate.recoveringTick !== undefined &&
      candidate.steadyTick !== undefined,
    );
    expect(episode).toBeDefined();
    expect(episode!.physicalRetreatTick).toBeGreaterThan(episode!.routeTick);
    expect(episode!.recoveringTick).toBeGreaterThan(episode!.physicalRetreatTick!);
    expect(episode!.steadyTick).toBeGreaterThan(episode!.recoveringTick!);
    expect(episode!.steadyTick).toBeLessThanOrEqual(1_800);
  }, 60_000);

  it("retains the personal-space main battle route without a direct outcome fixture", () => {
    expect(VISUAL_TEST_REGISTRY.map((entry) => entry.id)).toEqual([
      "personal-space",
      "personal-space-spike",
      "energy-exertion",
      "casualty-lifecycle",
      "movement-behaviour",
      "combat-foundation",
      "morale-inspection",
      "individual-combat",
      "defence-overwhelm",
    ]);
    expect(VISUAL_TEST_REGISTRY.filter((entry) =>
      entry.scenario === MAIN_BATTLE_MEDICAL_SCENARIO).map((entry) => entry.id))
      .toEqual(["personal-space"]);
    expect(MAIN_BATTLE_MEDICAL_SCENARIO.legacyCombatFoundationSandbox)
      .toBeUndefined();
    expect(MAIN_BATTLE_MEDICAL_SCENARIO.personalSpaceSpike).toBeUndefined();
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

interface RoutingEpisode {
  readonly routeTick: number;
  physicalRetreatTick?: number;
  recoveringTick?: number;
  steadyTick?: number;
}

function executeSmoke() {
  const startedAt = performance.now();
  const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
  const seen = {
    combat: false,
    zeroHit: false,
    rescue: false,
    claim: false,
    treatment: false,
    routing: false,
    winded: false,
    spent: false,
    resting: false,
    reengaged: false,
    egress: false,
    waiting: false,
    waitingEnergyContinuous: false,
  };
  const routingEpisodes = new Map<number, RoutingEpisode>();
  const previousX = Float64Array.from(simulation.world.positionsX);
  const previousY = Float64Array.from(simulation.world.positionsY);
  const previouslyRouting = new Set<number>();
  let observedRest = false;
  for (let index = 0; index < 1_800; index += 1) {
    advanceSimulationOneTick(simulation);
    const combat = requireCombat(simulation);
    seen.combat ||= combat.individualAttackAttemptCount > 0;
    seen.zeroHit ||= combat.individualCombatPipelineBuffers.zeroHitEvents.length > 0;
    seen.rescue ||=
      combat.casualtyAssistanceDecisionResult.rescueRequestedRecords.length > 0;
    seen.claim ||= combat.individualMedicalClaimResult.claimRecords.length > 0;
    seen.treatment ||= combat.individualTreatmentActionResult.activeActionCount > 0;
    const snapshot = createPositionSnapshot(simulation);
    seen.routing ||= snapshot.combatDebug!.units.some(
      (unit) => unit.persistentMoraleState === "routing",
    );
    for (const unit of snapshot.combatDebug!.units) {
      if (unit.persistentMoraleState === "routing" && !routingEpisodes.has(unit.unitId)) {
        routingEpisodes.set(unit.unitId, { routeTick: simulation.tick });
      }
      const episode = routingEpisodes.get(unit.unitId);
      if (episode === undefined) continue;
      if (previouslyRouting.has(unit.unitId) &&
          unit.persistentMoraleState === "routing" && unit.movementStyle === "routeAway") {
        const heading = getUnitRoutingHeading(combat.formationStore, unit.unitId);
        const bodyRetreated = getUnitMembers(combat.identityStore, unit.unitId).some((id) =>
          isIndividualOrdinaryParticipationEligible(
            combat.individualOrdinaryParticipationSnapshot, id,
          ) &&
          ((simulation.world.positionsX[id]! - previousX[id]!) * heading.x +
            (simulation.world.positionsY[id]! - previousY[id]!) * heading.y) > 0,
        );
        if (bodyRetreated) episode.physicalRetreatTick ??= simulation.tick;
      }
      if (unit.persistentMoraleState === "recovering") {
        episode.recoveringTick ??= simulation.tick;
      }
      if (unit.persistentMoraleState === "steady" && episode.recoveringTick !== undefined) {
        episode.steadyTick ??= simulation.tick;
      }
    }
    previouslyRouting.clear();
    for (const unit of snapshot.combatDebug!.units) {
      if (unit.persistentMoraleState === "routing") previouslyRouting.add(unit.unitId);
    }
    previousX.set(simulation.world.positionsX);
    previousY.set(simulation.world.positionsY);
    seen.winded ||= snapshot.combatDebug!.inspectedIndividuals.some(
      (individual) => individual.energyBand === "winded",
    );
    seen.spent ||= snapshot.combatDebug!.inspectedIndividuals.some(
      (individual) => individual.energyBand === "spent",
    );
    const resting = snapshot.combatDebug!.units.some(
      (unit) => (unit.energyCurrentlyRestingMemberCount ?? 0) > 0,
    );
    seen.resting ||= resting;
    observedRest ||= resting;
    seen.reengaged ||= observedRest && !resting && snapshot.combatDebug!.units.some(
      (unit) => unit.unitId === 102 && unit.movementStyle !== "orderedHalt",
    );
    seen.egress ||= combat.individualRespawnEgressResult.movementRecords.length > 0;
    seen.waiting ||= snapshot.combatDebug!.inspectedIndividuals.some(
      (individual) => individual.playerPresenceState === "waitingAtRespawn",
    );
    seen.waitingEnergyContinuous ||= snapshot.combatDebug!.inspectedIndividuals.some(
      (individual) =>
        individual.playerPresenceState === "waitingAtRespawn" &&
        (individual.totalEnergySpent ?? 0) > 0 &&
        (individual.currentEnergy ?? 0) < (individual.maximumEnergy ?? 0),
    );
  }
  return {
    simulation, seen,
    elapsedMs: performance.now() - startedAt,
    routingEpisodes: [...routingEpisodes.values()],
  };
}

function runDigest(ticks: number) {
  const simulation = createSimulation(MAIN_BATTLE_MEDICAL_SCENARIO);
  const moraleTransitions: { tick: number; unitId: number; state: string }[] = [];
  for (let index = 0; index < ticks; index += 1) {
    advanceSimulationOneTick(simulation);
    for (const event of requireCombat(simulation).moraleEvents) {
      moraleTransitions.push({ tick: simulation.tick, unitId: event.unitId, state: event.state });
    }
  }
  const snapshot = createPositionSnapshot(simulation);
  return {
    tick: snapshot.tick,
    moraleTransitions,
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
