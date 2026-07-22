import { describe, expect, it } from "vitest";

import { LIVE_COMBAT_SCENARIO } from "../../src/content/liveCombatScenario";
import { findVisualTestEntry } from "../../src/content/visualTestRegistry";
import {
  getUnitAnchor,
  getUnitMovementStyle,
} from "../../src/sim/formationBehaviour";
import {
  getActiveMeleeWeaponCategory,
  getAttackCommitmentTicksRemaining,
  getAttackRecoveryTicksRemaining,
  getIndividualCombatActionState,
  getIndividualCombatFacing,
  getLockedAttackTargetEntityId,
} from "../../src/sim/individualCombatAction";
import { isIndividualCombatEligible } from "../../src/sim/individualCombatEligibility";
import { isIndividualCharacterActive } from "../../src/sim/individualCasualtyLifecycle";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
} from "../../src/sim/individualGlobalHits";
import {
  getDefenceRecoveryTicksRemaining,
  getIndividualGuardState,
} from "../../src/sim/individualMeleeDefence";
import {
  NO_INDIVIDUAL_TARGET,
  getSelectedTargetEntityId,
} from "../../src/sim/individualMeleeTargetSelection";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import type {
  LiveCombatDebugIndividualSnapshot,
  SimulationScenario,
  SimulationState,
} from "../../src/sim/types";
import {
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
} from "../../src/sim/unitIdentity";

const CONTACT_RUN_TICKS = 320;
// Zero-hit eligibility can end repeated ordinary target exchanges quickly, but
// the live scenario should still show a visible sustained exchange.
const REQUIRED_CONSECUTIVE_COMBAT_TICKS = 2;

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
    expect(firstSnapshot.combatDebug?.inspectedIndividuals).toEqual([]);

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

  it("validates configured inspection entity IDs", () => {
    expect(() =>
      createSimulation(liveCombatWithInspectedEntities([0, 0])),
    ).toThrow(RangeError);
    expect(() =>
      createSimulation(liveCombatWithInspectedEntities([35])),
    ).toThrow(RangeError);
  });

  it("omits individual inspection snapshots unless explicitly configured", () => {
    const simulation = createSimulation(LIVE_COMBAT_SCENARIO);

    expect(createInitialSnapshot(simulation).combatDebug?.inspectedIndividuals)
      .toEqual([]);
    advanceSimulationOneTick(simulation);
    expect(createPositionSnapshot(simulation).combatDebug?.inspectedIndividuals)
      .toEqual([]);
  });

  it("snapshots only configured individuals from authoritative stores and current-tick records", () => {
    const inspectedEntityIds = [0, 1, 2, 3, 4, 20, 21, 22, 23, 24];
    const simulation = createSimulation(
      liveCombatWithInspectedEntities(inspectedEntityIds),
    );
    const combat = requireCombatSandbox(simulation);
    let inspected: readonly LiveCombatDebugIndividualSnapshot[] = [];

    for (let tick = 0; tick < CONTACT_RUN_TICKS; tick += 1) {
      advanceSimulationOneTick(simulation);
      if (!hasInspectedCurrentTickCombatEvidence(combat, inspectedEntityIds)) {
        continue;
      }
      inspected =
        createPositionSnapshot(simulation).combatDebug?.inspectedIndividuals ??
        [];
      break;
    }

    expect(inspected.map((individual) => individual.entityId)).toEqual(
      inspectedEntityIds,
    );
    expect(
      inspected.some(
        (individual) =>
          individual.thisTickAttackOutcome !== "none" ||
          individual.thisTickDefenceOutcome !== "none" ||
          individual.thisTickAppliedHitLoss > 0,
      ),
    ).toBe(true);
    for (const individual of inspected) {
      expectInspectedIndividualMatchesAuthority(simulation, individual);
    }
  });

  it("clears stale individual inspection outcomes on the next tick", () => {
    const simulation = createSimulation(liveCombatWithInspectedEntities([0]));
    const combat = requireCombatSandbox(simulation);
    combat.individualCombatPipelineBuffers.attackAttempts.push({
      attackerEntityId: 0,
      outcome: "attempted",
    } as never);
    combat.individualCombatPipelineBuffers.defenceRecords.push({
      defenderEntityId: 0,
      outcome: "landed",
    } as never);
    combat.individualCombatPipelineBuffers.hitApplications.push({
      targetEntityId: 0,
      appliedHitLoss: 1,
    } as never);
    combat.individualCombatPipelineBuffers.zeroHitEvents.push({
      entityId: 0,
    } as never);

    advanceSimulationOneTick(simulation);

    expect(createPositionSnapshot(simulation).combatDebug?.inspectedIndividuals)
      .toEqual([
        expect.objectContaining({
          entityId: 0,
          thisTickAttackOutcome: "none",
          thisTickDefenceOutcome: "none",
          thisTickAppliedHitLoss: 0,
          reachedZeroHitsThisTick: false,
        }),
      ]);
  });

  it("replays configured inspection snapshots deterministically", () => {
    const scenario = liveCombatWithInspectedEntities([0, 1, 20, 21]);
    const first = runScenario(scenario, CONTACT_RUN_TICKS);
    const second = runScenario(scenario, CONTACT_RUN_TICKS);

    expect(summarizeLiveCombat(first)).toEqual(summarizeLiveCombat(second));
  }, 10_000);

  it("advances opposing formed lines into persistent combat without pre-casualty interleaving or removal", () => {
    const simulation = createSimulation(LIVE_COMBAT_SCENARIO);
    const combat = requireCombatSandbox(simulation);
    const initialLeftAnchor = getUnitAnchor(combat.formationStore, 1);
    const initialRightAnchor = getUnitAnchor(combat.formationStore, 2);
    let sawAttackAttempt = false;
    let sawLandedOutcome = false;
    let sawAcceptedHit = false;
    let sawAppliedHitLoss = false;
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

      sawAttackAttempt ||= debug.attackAttemptCount > 0;
      sawLandedOutcome ||= debug.landedOutcomeCount > 0;
      sawAcceptedHit ||= debug.gateAcceptedHitCount > 0;
      sawAppliedHitLoss ||= debug.appliedHitLoss > 0;
      sawNonSteadyMorale ||= debug.units.some(
        (unit) => unit.assessmentMoraleState !== "steady",
      );
      const bothEngageFront =
        getUnitMovementStyle(combat.formationStore, 1) === "engageFront" &&
        getUnitMovementStyle(combat.formationStore, 2) === "engageFront";
      if (debug.totalLifecycleTransitionCount === 0) {
        expectNoHostileLineCrossing(simulation, 1, 2, 8);
      }
      sawBothEngageFront ||= bothEngageFront;
      if (bothEngageFront) {
        sawSeparatedFrontLines = true;
      }

      const hasCompleteCombatTick =
        debug.attackAttemptCount > 0 &&
        debug.landedOutcomeCount > 0 &&
        debug.gateAcceptedHitCount > 0 &&
        debug.appliedHitLoss > 0;
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
    expect(sawAttackAttempt).toBe(true);
    expect(sawLandedOutcome).toBe(true);
    expect(sawAcceptedHit).toBe(true);
    expect(sawAppliedHitLoss).toBe(true);
    expect(sawNonSteadyMorale).toBe(true);
    expect(longestCombatRun).toBeGreaterThanOrEqual(
      REQUIRED_CONSECUTIVE_COMBAT_TICKS,
    );
    expect(debug.totalAttackAttemptCount).toBeGreaterThan(0);
    expect(debug.totalLandedOutcomeCount).toBeGreaterThan(0);
    expect(debug.totalGateAcceptedHitCount).toBeGreaterThan(0);
    expect(debug.totalAppliedHitLoss).toBeGreaterThan(0);
    for (const unit of debug.units) {
      expect(Object.keys(unit)).not.toContain("accumulatedDamage");
      expect(unit).toMatchObject({
        tickStartEligibleMembers: expect.any(Number),
        endOfTickEligibleMembers: expect.any(Number),
        endOfTickZeroHitMembers: expect.any(Number),
        attackAttempts: expect.any(Number),
        preventedAttacks: expect.any(Number),
        landedOutcomes: expect.any(Number),
        gateAcceptedHits: expect.any(Number),
        appliedHitLoss: expect.any(Number),
        newlyZeroMembers: expect.any(Number),
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

  it("runs the archived Milestone 3 visual fixture without using production combat state", () => {
    const entry = findVisualTestEntry("combat-foundation");
    if (entry === undefined) {
      throw new Error("Missing combat-foundation visual test entry.");
    }
    expect(entry.scenario.combatSandbox).toBeUndefined();
    expect(entry.scenario.legacyCombatFoundationSandbox).toBeDefined();

    const simulation = createSimulation(entry.scenario);
    expect(simulation.combatSandbox).toBeUndefined();
    expect(simulation.legacyCombatFoundationSandbox).toBeDefined();

    let sawLegacyApplication = false;
    for (let tick = 0; tick < CONTACT_RUN_TICKS; tick += 1) {
      advanceSimulationOneTick(simulation);
      const debug = createPositionSnapshot(simulation).combatDebug;
      if (debug === undefined) {
        throw new Error("Archived combat foundation fixture is missing debug.");
      }
      sawLegacyApplication ||= debug.gateAcceptedHitCount > 0;
    }

    expect(sawLegacyApplication).toBe(true);
    expect(simulation.world.entityCount).toBe(35);
    expect(Array.from(simulation.world.ids)).toEqual(
      Array.from({ length: 35 }, (_, index) => index),
    );
  });
});

function runLiveCombat(tickCount: number): SimulationState {
  return runScenario(LIVE_COMBAT_SCENARIO, tickCount);
}

function runScenario(
  scenario: SimulationScenario,
  tickCount: number,
): SimulationState {
  const simulation = createSimulation(scenario);
  for (let tick = 0; tick < tickCount; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  return simulation;
}

function liveCombatWithInspectedEntities(
  inspectedEntityIds: readonly number[],
): SimulationScenario {
  const combatSandbox = LIVE_COMBAT_SCENARIO.combatSandbox;
  if (combatSandbox === undefined) {
    throw new Error("Live scenario is missing combat sandbox data.");
  }
  return {
    ...LIVE_COMBAT_SCENARIO,
    combatSandbox: {
      ...combatSandbox,
      inspectedEntityIds,
    },
  };
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

function expectInspectedIndividualMatchesAuthority(
  simulation: SimulationState,
  individual: LiveCombatDebugIndividualSnapshot,
): void {
  const combat = requireCombatSandbox(simulation);
  const selectedTargetEntityId = getSelectedTargetEntityId(
    combat.individualTargetSelectionStore,
    individual.entityId,
  );
  const lockedTargetEntityId = getLockedAttackTargetEntityId(
    combat.individualCombatActionStore,
    individual.entityId,
  );

  expect(individual).toMatchObject({
    unitId: getUnitIdForEntity(combat.identityStore, individual.entityId),
    tickStartCombatEligible: isIndividualCombatEligible(
      combat.individualCombatEligibilitySnapshot,
      individual.entityId,
    ),
    selectedTargetEntityId:
      selectedTargetEntityId === NO_INDIVIDUAL_TARGET
        ? null
        : selectedTargetEntityId,
    actionState: getIndividualCombatActionState(
      combat.individualCombatActionStore,
      individual.entityId,
    ),
    lockedTargetEntityId:
      lockedTargetEntityId === NO_INDIVIDUAL_TARGET
        ? null
        : lockedTargetEntityId,
    facing: getIndividualCombatFacing(
      combat.individualCombatActionStore,
      individual.entityId,
    ),
    commitmentTicksRemaining: getAttackCommitmentTicksRemaining(
      combat.individualCombatActionStore,
      individual.entityId,
    ),
    attackRecoveryTicksRemaining: getAttackRecoveryTicksRemaining(
      combat.individualCombatActionStore,
      individual.entityId,
    ),
    guardState: getIndividualGuardState(
      combat.individualMeleeDefenceStore,
      individual.entityId,
    ),
    defenceRecoveryTicksRemaining: getDefenceRecoveryTicksRemaining(
      combat.individualMeleeDefenceStore,
      individual.entityId,
    ),
    activeWeapon: getActiveMeleeWeaponCategory(
      combat.individualCombatActionStore,
      individual.entityId,
    ),
    currentGlobalHits: getIndividualCurrentGlobalHits(
      combat.individualGlobalHitStore,
      individual.entityId,
    ),
    maximumGlobalHits: getIndividualMaximumGlobalHits(
      combat.individualGlobalHitStore,
      individual.entityId,
    ),
    thisTickAttackOutcome: inspectedAttackOutcome(combat, individual.entityId),
    thisTickDefenceOutcome: inspectedDefenceOutcome(combat, individual.entityId),
    thisTickAppliedHitLoss: inspectedAppliedHitLoss(combat, individual.entityId),
    reachedZeroHitsThisTick: inspectedReachedZero(combat, individual.entityId),
  });
}

function inspectedAttackOutcome(
  combat: ReturnType<typeof requireCombatSandbox>,
  entityId: number,
): LiveCombatDebugIndividualSnapshot["thisTickAttackOutcome"] {
  let outcome: LiveCombatDebugIndividualSnapshot["thisTickAttackOutcome"] =
    "none";
  for (const attempt of combat.individualCombatPipelineBuffers.attackAttempts) {
    if (attempt.attackerEntityId === entityId) {
      outcome = attempt.outcome;
    }
  }
  return outcome;
}

function hasInspectedCurrentTickCombatEvidence(
  combat: ReturnType<typeof requireCombatSandbox>,
  inspectedEntityIds: readonly number[],
): boolean {
  const isInspected = (entityId: number): boolean =>
    inspectedEntityIds.includes(entityId);
  const buffers = combat.individualCombatPipelineBuffers;
  for (const attempt of buffers.attackAttempts) {
    if (isInspected(attempt.attackerEntityId)) return true;
  }
  for (const record of buffers.defenceRecords) {
    if (isInspected(record.attackerEntityId) ||
        isInspected(record.defenderEntityId)) return true;
  }
  for (const application of buffers.hitApplications) {
    if (isInspected(application.targetEntityId)) return true;
  }
  for (const event of buffers.zeroHitEvents) {
    if (isInspected(event.entityId)) return true;
  }
  return false;
}

function inspectedDefenceOutcome(
  combat: ReturnType<typeof requireCombatSandbox>,
  entityId: number,
): LiveCombatDebugIndividualSnapshot["thisTickDefenceOutcome"] {
  let outcome: LiveCombatDebugIndividualSnapshot["thisTickDefenceOutcome"] =
    "none";
  for (const record of combat.individualCombatPipelineBuffers.defenceRecords) {
    if (record.defenderEntityId === entityId) {
      outcome = record.outcome;
    }
  }
  return outcome;
}

function inspectedAppliedHitLoss(
  combat: ReturnType<typeof requireCombatSandbox>,
  entityId: number,
): number {
  let appliedHitLoss = 0;
  for (const application of combat.individualCombatPipelineBuffers.hitApplications) {
    if (application.targetEntityId === entityId) {
      appliedHitLoss += application.appliedHitLoss;
    }
  }
  return appliedHitLoss;
}

function inspectedReachedZero(
  combat: ReturnType<typeof requireCombatSandbox>,
  entityId: number,
): boolean {
  return combat.individualCombatPipelineBuffers.zeroHitEvents.some(
    (event) => event.entityId === entityId,
  );
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
    if (!isIndividualCharacterActive(
      combat.individualCasualtyLifecycleStore,
      firstEntityId,
    )) continue;
    for (let secondIndex = 0; secondIndex < secondMembers.length; secondIndex += 1) {
      const secondEntityId = secondMembers[secondIndex]!;
      if (!isIndividualCharacterActive(
        combat.individualCasualtyLifecycleStore,
        secondEntityId,
      )) continue;
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
