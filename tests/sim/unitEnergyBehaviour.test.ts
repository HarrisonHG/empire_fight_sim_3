import { describe, expect, it } from "vitest";

import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getIndividualMovementMode,
  getUnitAnchor,
} from "../../src/sim/formationBehaviour";
import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  setIndividualCurrentEnergyForTrustedSetup,
} from "../../src/sim/individualEnergy";
import { createIndividualCombatProfileStore } from "../../src/sim/individualCombatProfile";
import {
  createIndividualEnergyExertionModifierStore,
  projectIndividualEnergyExertionModifiersOneTick,
} from "../../src/sim/individualEnergyExertionModifier";
import { createIndividualGlobalHitStore } from "../../src/sim/individualGlobalHits";
import {
  createIndividualOrdinaryParticipationSnapshot,
  isIndividualOrdinaryParticipationEligible,
  setIndividualOrdinaryParticipationEligible,
} from "../../src/sim/individualOrdinaryParticipation";
import type { UnitRecoveryThreatSummary } from "../../src/sim/recoveryThreat";
import {
  createUnitEnergyBehaviourStore,
  canIndividualInitiateVoluntaryAttack,
  deriveUnitEnergyBehaviourRecommendation,
  getUnitAffordableSprintTicks,
  getUnitEnergyBehaviourInspection,
  getUnitEnergyRestSource,
  getUnitMaximumVoluntaryGait,
  isIndividualReluctantToReacquireDistantCombat,
  projectUnitEnergyBehaviourOneTick,
  UNIT_SAFE_REST_ENTER_RATIO_FIXED_POINT,
  UNIT_SAFE_REST_EXIT_RATIO_FIXED_POINT,
  INDIVIDUAL_VOLUNTARY_RESERVE_RATIO_FIXED_POINT,
  UNIT_VOLUNTARY_JOG_RATIO_FIXED_POINT,
  UNIT_VOLUNTARY_SPRINT_RATIO_FIXED_POINT,
} from "../../src/sim/unitEnergyBehaviour";
import {
  createUnitEnergySummaryStore,
  getUnitEnergySummaries,
} from "../../src/sim/unitEnergySummary";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";
import type { MoraleMovementState } from "../../src/sim/moraleMovement";
import type { WorldState } from "../../src/sim/types";

describe("Milestone 7G unit energy behaviour", () => {
  it("uses exact deterministic recommendation thresholds", () => {
    expect(UNIT_SAFE_REST_ENTER_RATIO_FIXED_POINT).toBe(1_000);
    expect(UNIT_SAFE_REST_EXIT_RATIO_FIXED_POINT).toBe(1_500);
    expect(INDIVIDUAL_VOLUNTARY_RESERVE_RATIO_FIXED_POINT).toBe(2_000);
    expect(UNIT_VOLUNTARY_JOG_RATIO_FIXED_POINT).toBe(6_000);
    expect(UNIT_VOLUNTARY_SPRINT_RATIO_FIXED_POINT).toBe(8_000);
    expect(deriveUnitEnergyBehaviourRecommendation(null)).toBe("normal");
    expect(deriveUnitEnergyBehaviourRecommendation(999)).toBe("restWhenSafe");
    expect(deriveUnitEnergyBehaviourRecommendation(1_000)).toBe("conserve");
    expect(deriveUnitEnergyBehaviourRecommendation(5_999)).toBe("conserve");
    expect(deriveUnitEnergyBehaviourRecommendation(6_000)).toBe("normal");
  });

  it("rests a safe spent cautious unit without replacing ordinary authority", () => {
    const fixture = createFixture(5, "advanceCautious");
    project(fixture, 0);
    expect(getUnitEnergyBehaviourInspection(fixture.behaviour, 1)).toEqual({
      unitId: 1,
      projectionTick: 0,
      recommendation: "restWhenSafe",
      resting: true,
      maximumVoluntaryGait: "walking",
      affordableSprintTicks: 0,
    });

    const anchorBefore = getUnitAnchor(fixture.formation, 1);
    const positionBefore = fixture.world.positionsX[0];
    advanceFormationOneTick(
      fixture.world,
      fixture.identity,
      fixture.formation,
      fixture.morale,
      undefined,
      fixture.lifecycle,
      fixture.ordinary,
      undefined,
      { tick: 0, rest: getUnitEnergyRestSource(fixture.behaviour) },
    );
    expect(getUnitAnchor(fixture.formation, 1)).toEqual(anchorBefore);
    expect(fixture.world.positionsX[0]).toBe(positionBefore);
    expect(getIndividualMovementMode(fixture.formation, 0)).toBe("holdPosition");
    expect(isIndividualOrdinaryParticipationEligible(fixture.ordinary, 0)).toBe(true);
  });

  it("interrupts rest for local threat, contact, routing, forced advance, and commitments", () => {
    const cases = [
      (fixture: Fixture) => { fixture.threats[0] = { unitId: 1, hostileNearby: true }; },
      (fixture: Fixture) => { fixture.morale.set(1, "routing"); },
      (fixture: Fixture) => { setIndividualOrdinaryParticipationEligible(fixture.ordinary, 0, false); },
    ];
    for (const arrange of cases) {
      const fixture = createFixture(5, "advanceCautious");
      arrange(fixture);
      project(fixture, 0);
      expect(getUnitEnergyBehaviourInspection(fixture.behaviour, 1).resting).toBe(false);
    }

    const forced = createFixture(5, "advance");
    project(forced, 0);
    expect(getUnitEnergyBehaviourInspection(forced.behaviour, 1).resting).toBe(false);

    const contact = createFixture(5, "advanceCautious");
    project(contact, 0);
    (contact.formation as unknown as {
      unitMovementStyle: string[];
    }).unitMovementStyle[0] = "engageFront";
    project(contact, 1);
    expect(getUnitEnergyBehaviourInspection(contact.behaviour, 1).resting).toBe(false);
  });

  it.each(["rescue", "treatment", "execution"])(
    "keeps an existing %s commitment ahead of voluntary rest",
    () => {
      const fixture = createFixture(5, "advanceCautious");
      setIndividualOrdinaryParticipationEligible(fixture.ordinary, 0, false);
      project(fixture, 0);
      expect(getUnitEnergyBehaviourInspection(fixture.behaviour, 1).resting)
        .toBe(false);
    },
  );

  it("retains rest through winded recovery and rejoins at working energy", () => {
    const fixture = createFixture(5, "advanceCautious");
    project(fixture, 0);
    setIndividualCurrentEnergyForTrustedSetup(fixture.energy, 0, 14, 1);
    project(fixture, 1);
    expect(getUnitEnergyBehaviourInspection(fixture.behaviour, 1)).toMatchObject({
      recommendation: "conserve",
      resting: true,
    });
    setIndividualCurrentEnergyForTrustedSetup(fixture.energy, 0, 15, 2);
    project(fixture, 2);
    expect(getUnitEnergyBehaviourInspection(fixture.behaviour, 1)).toMatchObject({
      recommendation: "conserve",
      resting: false,
    });
    expect(isIndividualReluctantToReacquireDistantCombat(fixture.behaviour, 0))
      .toBe(false);
  });

  it.each([
    [19, "walking", false, 0],
    [20, "walking", true, 0],
    [59, "walking", true, 0],
    [60, "jogging", true, 0],
    [79, "jogging", true, 0],
    [80, "jogging", true, 3],
  ] as const)(
    "projects exact reserve policy at %i percent",
    (energy, gait, canAttack, sprintTicks) => {
      const fixture = createFixture(energy, "advance");
      project(fixture, 0);
      expect(getUnitMaximumVoluntaryGait(fixture.behaviour, 1)).toBe(gait);
      expect(canIndividualInitiateVoluntaryAttack(fixture.behaviour, 0))
        .toBe(canAttack);
      expect(getUnitAffordableSprintTicks(fixture.behaviour, 1))
        .toBe(sprintTicks);
    },
  );

  it("budgets sprint against authoritative burden-adjusted expenditure", () => {
    const fixture = createFixture(80, "advance", "heavy");
    project(fixture, 0);
    expect(getUnitAffordableSprintTicks(fixture.behaviour, 1)).toBe(2);
  });

  it("replays threat interruption and recovery identically", () => {
    expect(runReplay()).toEqual(runReplay());
  });
});

interface Fixture {
  readonly world: WorldState;
  readonly identity: ReturnType<typeof createUnitIdentityStore>;
  readonly formation: ReturnType<typeof createFormationBehaviourStore>;
  readonly lifecycle: ReturnType<typeof createIndividualCasualtyLifecycleStore>;
  readonly presence: ReturnType<typeof createIndividualPlayerPresenceStore>;
  readonly energy: ReturnType<typeof createIndividualEnergyStore>;
  readonly exertionProfiles: ReturnType<typeof createIndividualCombatProfileStore>;
  readonly exertionHits: ReturnType<typeof createIndividualGlobalHitStore>;
  readonly exertion: ReturnType<typeof createIndividualEnergyExertionModifierStore>;
  readonly ordinary: ReturnType<typeof createIndividualOrdinaryParticipationSnapshot>;
  readonly summaries: ReturnType<typeof createUnitEnergySummaryStore>;
  readonly behaviour: ReturnType<typeof createUnitEnergyBehaviourStore>;
  readonly morale: Map<number, MoraleMovementState>;
  readonly threats: UnitRecoveryThreatSummary[];
}

function createFixture(
  startingEnergy: number,
  order: "advance" | "advanceCautious",
  armourCategory: "none" | "heavy" = "none",
): Fixture {
  const world: WorldState = {
    entityCount: 1,
    bounds: { width: 200, height: 100 },
    ids: Uint32Array.of(0),
    positionsX: Int32Array.of(50),
    positionsY: Int32Array.of(50),
    velocitiesX: new Int32Array(1),
    velocitiesY: new Int32Array(1),
  };
  const identity = createUnitIdentityStore({
    entityCount: 1,
    units: [{ unitId: 1, factionId: 1, memberEntityIds: [0] }],
  });
  const formation = createFormationBehaviourStore(identity, {
    entityCount: 1,
    rngSeed: 7,
    units: [{
      unitId: 1, anchorX: 50, anchorY: 50, headingX: 1, headingY: 0,
      spacing: 4, rows: 1, cols: 1, unitSpeed: 2, order,
    }],
    individuals: [{
      entityId: 0, role: "regular", slotRow: 0, slotCol: 0, memberMaxStep: 2,
    }],
  });
  const profiles = createTrustedIndividualEnergyProfileStore({
    entityCount: 1,
    profiles: [{ entityId: 0, maximumEnergy: 100, startingEnergy }],
  });
  const lifecycle = createIndividualCasualtyLifecycleStore(1);
  const presence = createIndividualPlayerPresenceStore({
    entityCount: 1,
    worldWidth: 200,
    worldHeight: 100,
    procedures: [{ entityId: 0, procedureKind: "citizen" }],
  });
  const exertionProfiles = createIndividualCombatProfileStore({
    entityCount: 1,
    profiles: [{
      entityId: 0,
      primaryWeapon: "unarmed",
      shieldCategory: "none",
      shieldCarriedState: "none",
      armourCategory,
      hasQualifyingHelmet: false,
      qualifications: {
        hasWeaponMaster: false, hasShield: false, hasMarksman: false,
        hasThrown: false, hasAmbidexterity: false, enduranceLevels: 0,
        fortitudeLevels: 0, hasDreadnought: false,
      },
      magicalCapabilities: {
        canUseRod: false, canUseStaff: false, canWearMageArmour: false,
        canDeliverCombatMagic: false,
      },
    }],
  });
  const exertionHits = createIndividualGlobalHitStore(exertionProfiles, {
    entityCount: 1,
  });
  return {
    world,
    identity,
    formation,
    lifecycle,
    presence,
    energy: createIndividualEnergyStore(profiles),
    exertionProfiles,
    exertionHits,
    exertion: createIndividualEnergyExertionModifierStore(1),
    ordinary: createIndividualOrdinaryParticipationSnapshot(1),
    summaries: createUnitEnergySummaryStore(identity),
    behaviour: createUnitEnergyBehaviourStore(identity),
    morale: new Map([[1, "steady"]]),
    threats: [{ unitId: 1, hostileNearby: false }],
  };
}

function project(fixture: Fixture, tick: number): void {
  projectIndividualEnergyExertionModifiersOneTick(
    fixture.exertion,
    fixture.exertionProfiles,
    fixture.exertionHits,
    tick,
  );
  projectUnitEnergyBehaviourOneTick(
    fixture.behaviour,
    fixture.identity,
    fixture.formation,
    getUnitEnergySummaries(fixture.summaries),
    fixture.energy,
    fixture.exertion,
    fixture.lifecycle,
    fixture.presence,
    fixture.ordinary,
    fixture.morale,
    fixture.threats,
    tick,
  );
}

function runReplay(): unknown {
  const fixture = createFixture(5, "advanceCautious");
  const result = [];
  for (let tick = 0; tick < 4; tick += 1) {
    fixture.threats[0] = { unitId: 1, hostileNearby: tick === 1 };
    if (tick === 2) setIndividualCurrentEnergyForTrustedSetup(fixture.energy, 0, 20, tick);
    if (tick === 3) setIndividualCurrentEnergyForTrustedSetup(fixture.energy, 0, 30, tick);
    project(fixture, tick);
    result.push(getUnitEnergyBehaviourInspection(fixture.behaviour, 1));
  }
  return result;
}
