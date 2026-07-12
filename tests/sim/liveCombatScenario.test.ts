import { describe, expect, it } from "vitest";

import { LIVE_COMBAT_SCENARIO } from "../../src/content/liveCombatScenario";
import {
  getUnitAnchor,
  getUnitMovementStyle,
} from "../../src/sim/formationBehaviour";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import type { SimulationState } from "../../src/sim/types";
import {
  getFactionIdForUnit,
  getUnitIds,
  getUnitMembers,
} from "../../src/sim/unitIdentity";

const CONTACT_RUN_TICKS = 320;
// 4H-3 keeps a sustained exchange while reserving extra room for ragged
// non-steady contact footprints.
const REQUIRED_CONSECUTIVE_COMBAT_TICKS = 10;

describe("live combat scenario", () => {
  it("creates two deterministic opposing groups with 20 and 15 members", () => {
    const first = createSimulation(LIVE_COMBAT_SCENARIO);
    const second = createSimulation(LIVE_COMBAT_SCENARIO);
    const firstCombat = requireCombatSandbox(first);
    const secondCombat = requireCombatSandbox(second);
    const firstSnapshot = createInitialSnapshot(first);
    const secondSnapshot = createInitialSnapshot(second);

    expect(first.world.entityCount).toBe(35);
    expect(Array.from(first.world.ids)).toEqual(
      Array.from({ length: 35 }, (_, index) => index),
    );
    expect(getUnitIds(firstCombat.identityStore)).toEqual([1, 2]);
    expect(getFactionIdForUnit(firstCombat.identityStore, 1)).toBe(1);
    expect(getFactionIdForUnit(firstCombat.identityStore, 2)).toBe(2);
    expect(getUnitMembers(firstCombat.identityStore, 1)).toHaveLength(20);
    expect(getUnitMembers(firstCombat.identityStore, 2)).toHaveLength(15);
    expect(firstSnapshot.combatDebug?.units).toHaveLength(2);

    const configuredUnits = LIVE_COMBAT_SCENARIO.combatSandbox?.units;
    if (configuredUnits === undefined) {
      throw new Error("Live scenario is missing its combat sandbox data.");
    }
    for (const configuredUnit of configuredUnits) {
      for (const entityId of getUnitMembers(
        firstCombat.identityStore,
        configuredUnit.unitId,
      )) {
        expect(first.world.positionsX[entityId]).toBeGreaterThanOrEqual(
          configuredUnit.deploymentZone.minX,
        );
        expect(first.world.positionsX[entityId]).toBeLessThanOrEqual(
          configuredUnit.deploymentZone.maxX,
        );
        expect(first.world.positionsY[entityId]).toBeGreaterThanOrEqual(
          configuredUnit.deploymentZone.minY,
        );
        expect(first.world.positionsY[entityId]).toBeLessThanOrEqual(
          configuredUnit.deploymentZone.maxY,
        );
      }
    }

    expect(Array.from(firstSnapshot.positions)).toEqual(
      Array.from(secondSnapshot.positions),
    );
    expect(Array.from(firstSnapshot.factionIds ?? [])).toEqual(
      Array.from(secondSnapshot.factionIds ?? []),
    );
    expect(Array.from(first.world.positionsX)).toEqual(
      Array.from(second.world.positionsX),
    );
    expect(Array.from(first.world.positionsY)).toEqual(
      Array.from(second.world.positionsY),
    );
    expect(firstCombat.debugSnapshot).toEqual(secondCombat.debugSnapshot);
  });

  it("advances opposing formed lines into persistent combat without interleaving or removal", () => {
    const simulation = createSimulation(LIVE_COMBAT_SCENARIO);
    const combat = requireCombatSandbox(simulation);
    const initialLeftAnchor = getUnitAnchor(combat.formationStore, 1);
    const initialRightAnchor = getUnitAnchor(combat.formationStore, 2);
    let sawOpportunity = false;
    let sawStrike = false;
    let sawSurvivabilityApplication = false;
    let sawConsequence = false;
    let sawNonSteadyMorale = false;
    let sawBothEngageFront = false;
    let sawSeparatedFrontLines = false;
    let consecutiveCombatTicks = 0;
    let longestCombatRun = 0;

    for (let tick = 0; tick < CONTACT_RUN_TICKS; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = createPositionSnapshot(simulation).combatDebug;
      if (debug === undefined) {
        throw new Error("Live combat snapshot is missing combat debug state.");
      }

      sawOpportunity ||= debug.opportunityCount > 0;
      sawStrike ||= debug.strikeCount > 0;
      sawSurvivabilityApplication ||= debug.survivabilityApplicationCount > 0;
      sawConsequence ||= debug.consequenceCount > 0;
      sawNonSteadyMorale ||= debug.units.some(
        (unit) => unit.assessmentMoraleState !== "steady",
      );
      const bothEngageFront =
        getUnitMovementStyle(combat.formationStore, 1) === "engageFront" &&
        getUnitMovementStyle(combat.formationStore, 2) === "engageFront";
      expectNoHostileLineCrossing(simulation, 1, 2, 8);
      sawBothEngageFront ||= bothEngageFront;
      if (bothEngageFront) {
        sawSeparatedFrontLines = true;
      }

      const hasCompleteCombatTick =
        debug.opportunityCount > 0 &&
        debug.strikeCount > 0 &&
        debug.survivabilityApplicationCount > 0 &&
        debug.consequenceCount > 0;
      if (hasCompleteCombatTick) {
        consecutiveCombatTicks += 1;
        longestCombatRun = Math.max(longestCombatRun, consecutiveCombatTicks);
      } else {
        consecutiveCombatTicks = 0;
      }
    }

    const finalLeftAnchor = getUnitAnchor(combat.formationStore, 1);
    const finalRightAnchor = getUnitAnchor(combat.formationStore, 2);
    const finalSnapshot = createPositionSnapshot(simulation);
    const debug = finalSnapshot.combatDebug;
    if (debug === undefined) {
      throw new Error("Live combat snapshot is missing final combat debug state.");
    }

    expect(finalLeftAnchor.x).toBeGreaterThan(initialLeftAnchor.x);
    expect(finalRightAnchor.x).toBeLessThan(initialRightAnchor.x);
    expect(sawBothEngageFront).toBe(true);
    expect(sawSeparatedFrontLines).toBe(true);
    expect(sawOpportunity).toBe(true);
    expect(sawStrike).toBe(true);
    expect(sawSurvivabilityApplication).toBe(true);
    expect(sawConsequence).toBe(true);
    expect(sawNonSteadyMorale).toBe(true);
    expect(longestCombatRun).toBeGreaterThanOrEqual(
      REQUIRED_CONSECUTIVE_COMBAT_TICKS,
    );
    expect(debug.totalOpportunityCount).toBeGreaterThan(0);
    expect(debug.totalStrikeCount).toBeGreaterThan(0);
    expect(debug.totalSurvivabilityApplicationCount).toBeGreaterThan(0);
    expect(debug.totalConsequenceCount).toBeGreaterThan(0);
    expect(debug.units.some((unit) => unit.accumulatedDamage > 0)).toBe(true);
    for (const unit of debug.units) {
      expect(unit).toMatchObject({
        persistentMoraleState: expect.any(String),
        routingRisk: expect.any(Number),
        recoveryProgress: expect.any(Number),
        persistentPressure: expect.any(Number),
        currentCohesion: expect.any(Number),
      });
    }
    expect(simulation.world.entityCount).toBe(35);
    expect(Array.from(simulation.world.ids)).toEqual(
      Array.from({ length: 35 }, (_, index) => index),
    );
  });

  it("updates persistent morale from the completed combat assessment without changing movement ownership", () => {
    const simulation = createSimulation(LIVE_COMBAT_SCENARIO);

    for (let tick = 0; tick < CONTACT_RUN_TICKS; tick += 1) {
      advanceSimulationOneTick(simulation);
      const combat = requireCombatSandbox(simulation);
      const transition = combat.moraleEvents[0];
      if (transition === undefined) {
        continue;
      }
      const assessment = combat.moraleAssessments.find(
        (candidate) => candidate.unitId === transition.unitId,
      );
      if (assessment === undefined) {
        throw new Error("Live combat is missing its transitioned morale assessment.");
      }

      const morale = getPersistentUnitMorale(
        combat.persistentMoraleStore,
        assessment.unitId,
      );
      const pressureUpdate = combat.pressureUpdates.find(
        (candidate) => candidate.unitId === assessment.unitId,
      );
      if (pressureUpdate === undefined) {
        throw new Error("Live combat is missing its pressure update.");
      }
      expect(morale.pressure).toBe(assessment.pressureAverage);
      expect(morale.cohesion).toBe(assessment.cohesion);
      expect(pressureUpdate.pressureAfterAverage).toBe(
        assessment.pressureAverage,
      );
      expect(morale.state).toBe(transition.state);
      expect(combat.moraleEvents).toContainEqual(
        expect.objectContaining({
          kind: "unit_morale_changed",
          unitId: transition.unitId,
          previousState: "steady",
          state: "strained",
        }),
      );
      return;
    }

    throw new Error("Live combat never produced a non-steady morale assessment.");
  });

  it("replays the live scene deterministically without deferred outcome fields", () => {
    const first = runLiveCombat(CONTACT_RUN_TICKS);
    const second = runLiveCombat(CONTACT_RUN_TICKS);
    const firstSummary = summarizeLiveCombat(first);
    const secondSummary = summarizeLiveCombat(second);

    expect(firstSummary).toEqual(secondSummary);
    expect(JSON.stringify(firstSummary)).not.toMatch(
      /death|dead|removal|removed|healing|heal|call|shout|special.?effect/i,
    );
  });
});

function runLiveCombat(tickCount: number): SimulationState {
  const simulation = createSimulation(LIVE_COMBAT_SCENARIO);
  for (let tick = 0; tick < tickCount; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  return simulation;
}

function requireCombatSandbox(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected live combat simulation state.");
  }
  return simulation.combatSandbox;
}

function summarizeLiveCombat(simulation: SimulationState): unknown {
  const snapshot = createPositionSnapshot(simulation);
  const combat = requireCombatSandbox(simulation);
  return {
    tick: simulation.tick,
    entityCount: simulation.world.entityCount,
    ids: Array.from(simulation.world.ids),
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
    debug: snapshot.combatDebug,
    damage: getUnitIds(combat.identityStore).map((unitId) => ({
      unitId,
      memberCount: getUnitMembers(combat.identityStore, unitId).length,
    })),
  };
}

function expectNoHostileLineCrossing(
  simulation: SimulationState,
  firstUnitId: number,
  secondUnitId: number,
  lateralContactDistance: number,
): void {
  const combat = requireCombatSandbox(simulation);
  const firstMembers = getUnitMembers(combat.identityStore, firstUnitId);
  const secondMembers = getUnitMembers(combat.identityStore, secondUnitId);
  for (let firstIndex = 0; firstIndex < firstMembers.length; firstIndex += 1) {
    const firstEntityId = firstMembers[firstIndex]!;
    for (let secondIndex = 0; secondIndex < secondMembers.length; secondIndex += 1) {
      const secondEntityId = secondMembers[secondIndex]!;
      const lateralDistance = Math.abs(
        simulation.world.positionsY[firstEntityId]! -
          simulation.world.positionsY[secondEntityId]!,
      );
      if (lateralDistance > lateralContactDistance) continue;
      expect(simulation.world.positionsX[firstEntityId]!).toBeLessThan(
        simulation.world.positionsX[secondEntityId]!,
      );
    }
  }
}
