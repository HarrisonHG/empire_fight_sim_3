import { describe, expect, it } from "vitest";

import {
  INDIVIDUAL_COMBAT_AREA_SPACING,
  INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS,
  INDIVIDUAL_COMBAT_LOCAL_INTERACTION_RANGE,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID,
} from "../../src/content/individualCombatVisualScenario";
import { findVisualTestEntry } from "../../src/content/visualTestRegistry";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
} from "../../src/sim/individualGlobalHits";
import type { IndividualLandedHitGateDecisionRecord } from "../../src/sim/individualLandedHitGate";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  LiveCombatDebugIndividualSnapshot,
  SimulationState,
} from "../../src/sim/types";

const INSPECTION_TICKS = 80;

describe("individual combat visual regression scenario", () => {
  it("is registered at the stable visual-test URL with explicit inspection IDs", () => {
    const entry = findVisualTestEntry(INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID);
    expect(entry).toBeDefined();
    expect(entry?.scenario).toBe(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);

    const simulation = createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);
    const initial = createInitialSnapshot(simulation);

    expect(initial.tick).toBe(0);
    expect(initial.combatDebug?.inspectedIndividuals.map((entry) => entry.entityId))
      .toEqual(INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS);
  });

  it("demonstrates all individual-combat chambers through accepted systems", () => {
    const simulation = createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);
    const combat = requireCombatSandbox(simulation);
    const initialUnarmouredHits = getIndividualMaximumGlobalHits(
      combat.individualGlobalHitStore,
      12,
    );
    const initialHeavyHits = getIndividualMaximumGlobalHits(
      combat.individualGlobalHitStore,
      14,
    );
    const trace = collectVisualTrace(simulation, INSPECTION_TICKS);

    expect(trace.defences).toContainEqual(
      expect.objectContaining({
        attackerEntityId: 0,
        defenderEntityId: 1,
        outcome: "parried",
      }),
    );
    expect(trace.defences).toContainEqual(
      expect.objectContaining({
        attackerEntityId: 2,
        defenderEntityId: 3,
        outcome: "shieldBlocked",
      }),
    );
    expect(
      trace.ticks.some(
        (tick) =>
          tick.defences.some(
            (record) => record.defenderEntityId === 6 && record.outcome === "parried",
          ) &&
          tick.defences.some(
            (record) => record.defenderEntityId === 6 && record.outcome === "landed",
          ),
      ),
    ).toBe(true);

    const polearmAttempt = firstAttempt(trace, 7, 8);
    const oneHandedAttempt = firstAttempt(trace, 9, 10);
    expect(polearmAttempt?.distanceSquaredAtResolution).toBeGreaterThan(
      oneHandedAttempt?.distanceSquaredAtResolution ?? Number.MAX_SAFE_INTEGER,
    );
    expect(
      trace.ticks.some((tick) => {
        const polearm = tick.inspected.get(7);
        const oneHanded = tick.inspected.get(9);
        return (
          polearm?.actionState === "committingAttack" &&
          oneHanded?.actionState === "committingAttack" &&
          (polearm.selectedTargetDistanceSquared ?? 0) >
            (oneHanded.selectedTargetDistanceSquared ?? Number.MAX_SAFE_INTEGER)
        );
      }),
    ).toBe(true);

    expect(initialHeavyHits).toBeGreaterThan(initialUnarmouredHits);
    expect(trace.hitApplications).toContainEqual(
      expect.objectContaining({
        attackerEntityId: 11,
        targetEntityId: 12,
        appliedHitLoss: 1,
        currentHitsBefore: initialUnarmouredHits,
        currentHitsAfter: initialUnarmouredHits - 1,
      }),
    );
    expect(trace.hitApplications).toContainEqual(
      expect.objectContaining({
        attackerEntityId: 13,
        targetEntityId: 14,
        appliedHitLoss: 1,
        currentHitsBefore: initialHeavyHits,
        currentHitsAfter: initialHeavyHits - 1,
      }),
    );

    const samePairGateDecisions = trace.gateDecisions.filter(
      (decision) =>
        decision.attackerEntityId === 15 && decision.targetEntityId === 16,
    );
    const acceptedSamePairTicks = samePairGateDecisions
      .filter((decision) => decision.outcome === "accepted")
      .map((decision) => decision.currentTick);
    expect(acceptedSamePairTicks.length).toBeGreaterThanOrEqual(2);
    for (let index = 1; index < acceptedSamePairTicks.length; index += 1) {
      expect(acceptedSamePairTicks[index]! - acceptedSamePairTicks[index - 1]!)
        .toBeGreaterThanOrEqual(20);
    }
    const rejectedSamePairTicks = samePairGateDecisions
      .filter((decision) => decision.outcome === "rejected")
      .map((decision) => decision.currentTick);
    expect(rejectedSamePairTicks.length).toBeGreaterThan(0);
    for (const tick of rejectedSamePairTicks) {
      expect(
        trace.ticks
          .find((entry) => entry.currentTick === tick)
          ?.hitApplications.some(
            (application) =>
              application.attackerEntityId === 15 &&
              application.targetEntityId === 16,
          ),
      ).toBe(false);
    }

    expect(
      trace.ticks.some(
        (tick) =>
          tick.gateDecisions.some(
            (decision) =>
              decision.attackerEntityId === 17 &&
              decision.targetEntityId === 19 &&
              decision.outcome === "accepted",
          ) &&
          tick.gateDecisions.some(
            (decision) =>
              decision.attackerEntityId === 18 &&
              decision.targetEntityId === 19 &&
              decision.outcome === "accepted",
          ) &&
          tick.hitApplications
            .filter((application) => application.targetEntityId === 19)
            .reduce((total, application) => total + application.appliedHitLoss, 0) ===
            2,
      ),
    ).toBe(true);
    expect(trace.zeroHitEntities).toContain(19);
    expect(Array.from(simulation.world.ids)).toContain(19);
    expect(getIndividualCurrentGlobalHits(combat.individualGlobalHitStore, 19))
      .toBe(0);
    expect(trace.ticks.some((tick) => tick.inspected.get(19)?.tickStartCombatEligible === false))
      .toBe(true);
  });

  it("clears current-tick inspection fields and keeps test areas isolated", () => {
    const simulation = createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);
    const trace = collectVisualTrace(simulation, INSPECTION_TICKS);
    const parryTickIndex = trace.ticks.findIndex((tick) =>
      tick.inspected.get(1)?.thisTickDefenceOutcome === "parried",
    );
    expect(parryTickIndex).toBeGreaterThanOrEqual(0);
    const nextTickDefender = trace.ticks[parryTickIndex + 1]?.inspected.get(1);
    expect(nextTickDefender).toMatchObject({
      thisTickDefenceOutcome: "none",
      thisTickOutgoingDefenceOutcome: "none",
      thisTickLandedHitGateOutcome: "none",
      thisTickIncomingParryCount: 0,
      thisTickIncomingBucklerBlockCount: 0,
      thisTickIncomingShieldBlockCount: 0,
      thisTickIncomingLandedCount: 0,
      thisTickAppliedHitLoss: 0,
      reachedZeroHitsThisTick: false,
    });

    expect(INDIVIDUAL_COMBAT_AREA_SPACING).toBeGreaterThan(
      INDIVIDUAL_COMBAT_LOCAL_INTERACTION_RANGE,
    );
    expect(trace.minimumCrossAreaDistance).toBeGreaterThan(
      INDIVIDUAL_COMBAT_LOCAL_INTERACTION_RANGE,
    );
  });

  it("replays deterministically without casualty or removal fields", () => {
    const first = summarizeReplay(runScenario(INSPECTION_TICKS));
    const second = summarizeReplay(runScenario(INSPECTION_TICKS));

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(
      /death|dead|removal|removed|healing|heal|call|shout|special.?effect/i,
    );
  });
});

interface TickTrace {
  readonly currentTick: number;
  readonly attackAttempts: readonly IndividualMeleeAttackAttemptRecord[];
  readonly defences: readonly IndividualMeleeDefenceRecord[];
  readonly gateDecisions: readonly IndividualLandedHitGateDecisionRecord[];
  readonly hitApplications: readonly {
    readonly attackerEntityId: number;
    readonly targetEntityId: number;
    readonly appliedHitLoss: number;
    readonly currentHitsBefore: number;
    readonly currentHitsAfter: number;
  }[];
  readonly inspected: ReadonlyMap<number, LiveCombatDebugIndividualSnapshot>;
}

function collectVisualTrace(
  simulation: SimulationState,
  ticks: number,
): {
  readonly ticks: readonly TickTrace[];
  readonly attackAttempts: readonly IndividualMeleeAttackAttemptRecord[];
  readonly defences: readonly IndividualMeleeDefenceRecord[];
  readonly gateDecisions: readonly IndividualLandedHitGateDecisionRecord[];
  readonly hitApplications: readonly TickTrace["hitApplications"][number][];
  readonly zeroHitEntities: readonly number[];
  readonly minimumCrossAreaDistance: number;
} {
  const combat = requireCombatSandbox(simulation);
  const tickTraces: TickTrace[] = [];
  const attackAttempts: IndividualMeleeAttackAttemptRecord[] = [];
  const defences: IndividualMeleeDefenceRecord[] = [];
  const gateDecisions: IndividualLandedHitGateDecisionRecord[] = [];
  const hitApplications: TickTrace["hitApplications"][number][] = [];
  const zeroHitEntities = new Set<number>();
  let minimumCrossAreaDistance = Number.POSITIVE_INFINITY;

  for (let tick = 0; tick < ticks; tick += 1) {
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    const tickAttackAttempts =
      combat.individualCombatPipelineBuffers.attackAttempts.map((record) => ({
        ...record,
      }));
    const tickDefences = combat.individualCombatPipelineBuffers.defenceRecords
      .map((record) => ({ ...record }));
    const tickGateDecisions = combat.individualCombatPipelineBuffers.gateDecisions
      .map((record) => ({ ...record }));
    const tickHitApplications =
      combat.individualCombatPipelineBuffers.hitApplications.map((record) => ({
        attackerEntityId: record.attackerEntityId,
        targetEntityId: record.targetEntityId,
        appliedHitLoss: record.appliedHitLoss,
        currentHitsBefore: record.currentHitsBefore,
        currentHitsAfter: record.currentHitsAfter,
      }));
    const inspected = new Map(
      snapshot.combatDebug?.inspectedIndividuals.map((entry) => [
        entry.entityId,
        { ...entry },
      ]) ?? [],
    );

    attackAttempts.push(...tickAttackAttempts);
    defences.push(...tickDefences);
    gateDecisions.push(...tickGateDecisions);
    hitApplications.push(...tickHitApplications);
    for (const event of combat.individualCombatPipelineBuffers.zeroHitEvents) {
      zeroHitEntities.add(event.entityId);
    }
    minimumCrossAreaDistance = Math.min(
      minimumCrossAreaDistance,
      computeMinimumCrossAreaDistance(simulation),
    );
    tickTraces.push({
      currentTick: simulation.tick - 1,
      attackAttempts: tickAttackAttempts,
      defences: tickDefences,
      gateDecisions: tickGateDecisions,
      hitApplications: tickHitApplications,
      inspected,
    });
  }

  return {
    ticks: tickTraces,
    attackAttempts,
    defences,
    gateDecisions,
    hitApplications,
    zeroHitEntities: Array.from(zeroHitEntities).sort((left, right) => left - right),
    minimumCrossAreaDistance,
  };
}

function firstAttempt(
  trace: ReturnType<typeof collectVisualTrace>,
  attackerEntityId: number,
  targetEntityId: number,
) {
  return trace.attackAttempts.find(
    (record) =>
      record.attackerEntityId === attackerEntityId &&
      record.targetEntityId === targetEntityId,
  );
}

function runScenario(ticks: number): SimulationState {
  const simulation = createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);
  for (let tick = 0; tick < ticks; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  return simulation;
}

function summarizeReplay(simulation: SimulationState): unknown {
  const combat = requireCombatSandbox(simulation);
  const snapshot = createPositionSnapshot(simulation);
  return {
    tick: simulation.tick,
    ids: Array.from(simulation.world.ids),
    positionsX: Array.from(simulation.world.positionsX),
    positionsY: Array.from(simulation.world.positionsY),
    debug: snapshot.combatDebug,
    counters: {
      parries: combat.totalIndividualParryCount,
      shieldBlocks: combat.totalIndividualShieldBlockCount,
      landed: combat.totalIndividualLandedDefenceOutcomeCount,
      gateAccepted: combat.totalIndividualGateAcceptedHitCount,
      gateRejected: combat.totalIndividualGateRejectedHitCount,
      hitLoss: combat.totalIndividualAppliedHitLoss,
      zero: combat.totalIndividualZeroHitTransitionCount,
    },
  };
}

function computeMinimumCrossAreaDistance(simulation: SimulationState): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (
    let leftEntityId = 0;
    leftEntityId < simulation.world.entityCount;
    leftEntityId += 1
  ) {
    for (
      let rightEntityId = leftEntityId + 1;
      rightEntityId < simulation.world.entityCount;
      rightEntityId += 1
    ) {
      if (areaIndexForEntity(leftEntityId) === areaIndexForEntity(rightEntityId)) {
        continue;
      }
      const dx =
        simulation.world.positionsX[leftEntityId]! -
        simulation.world.positionsX[rightEntityId]!;
      const dy =
        simulation.world.positionsY[leftEntityId]! -
        simulation.world.positionsY[rightEntityId]!;
      minimum = Math.min(minimum, Math.sqrt(dx * dx + dy * dy));
    }
  }
  return minimum;
}

function areaIndexForEntity(entityId: number): number {
  if (entityId <= 1) return 0;
  if (entityId <= 3) return 1;
  if (entityId <= 6) return 2;
  if (entityId <= 10) return 3;
  if (entityId <= 14) return 4;
  if (entityId <= 16) return 5;
  return 6;
}

function requireCombatSandbox(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected individual combat visual scenario sandbox.");
  }
  return simulation.combatSandbox;
}
