import { describe, expect, it } from "vitest";

import {
  INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS,
  INDIVIDUAL_COMBAT_LOCAL_INTERACTION_RANGE,
  INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES,
  INDIVIDUAL_COMBAT_VISUAL_CHAMBERS,
  INDIVIDUAL_COMBAT_VISUAL_DETAIL_LABELS,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO,
  INDIVIDUAL_COMBAT_VISUAL_SCENARIO_ID,
  INDIVIDUAL_COMBAT_VISUAL_WORLD_HEIGHT,
  INDIVIDUAL_COMBAT_VISUAL_WORLD_WIDTH,
} from "../../src/content/individualCombatVisualScenario";
import { findVisualTestEntry } from "../../src/content/visualTestRegistry";
import { LIVE_COMBAT_SCENARIO } from "../../src/content/liveCombatScenario";
import { quantizeEightDirection } from "../../src/sim/eightDirection";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import {
  getActiveMeleeWeaponCategory,
  getIndividualCombatFacing,
} from "../../src/sim/individualCombatAction";
import {
  getIndividualCombatProfile,
  type IndividualCombatProfile,
  type IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";
import {
  getIndividualCurrentGlobalHits,
  getIndividualMaximumGlobalHits,
} from "../../src/sim/individualGlobalHits";
import type { IndividualLandedHitGateDecisionRecord } from "../../src/sim/individualLandedHitGate";
import { getActiveMeleeDistances } from "../../src/sim/individualMeleeTargetSelection";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  InspectedCombatVisualEvent,
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
    expect(INDIVIDUAL_COMBAT_VISUAL_SCENARIO.bounds).toEqual({
      width: INDIVIDUAL_COMBAT_VISUAL_WORLD_WIDTH,
      height: INDIVIDUAL_COMBAT_VISUAL_WORLD_HEIGHT,
    });
    expect(INDIVIDUAL_COMBAT_VISUAL_WORLD_WIDTH).toBe(1_200);
    expect(INDIVIDUAL_COMBAT_VISUAL_WORLD_HEIGHT).toBe(580);
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBERS.map((chamber) => chamber.entityIds))
      .toEqual([[0, 1], [2, 3], [4, 5, 6], [7, 8, 9, 10], [11, 12, 13, 14], [15, 16], [17, 18, 19]]);
  });

  it("keeps the compact chamber legend aligned with exported chamber metadata", () => {
    const topRow = rowLegendChamberIds(140);
    const bottomRow = rowLegendChamberIds(440);

    expect(topRow).toEqual([1, 2, 3, 4]);
    expect(bottomRow).toEqual([5, 6, 7]);
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES.slice(0, 2)).toEqual([
      "Top row: 1 Parry · 2 Shield · 3 Guard overwhelm · 4 Reach",
      "Bottom row: 5 Armour · 6 Gate · 7 Independent attackers",
    ]);
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES.join("\n")).toContain(
      "facing arrow",
    );
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES.join("\n")).toContain(
      "mageArmour",
    );
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES.join("\n")).toContain(
      "Readiness",
    );
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES.join("\n")).toContain(
      "one green crossed marker",
    );
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES.join("\n")).toContain(
      "Route risk routes at 40",
    );
    expect(INDIVIDUAL_COMBAT_VISUAL_CHAMBER_LEGEND_LINES.join("\n")).toContain(
      "Recovery progress requires 240",
    );
    expect(INDIVIDUAL_COMBAT_VISUAL_DETAIL_LABELS.map((label) => label.text))
      .toEqual(expect.arrayContaining([
        "Polearm comparison pair",
        "One-handed comparison pair",
        "One-handed must close farther.",
        "Polearm can select and commit from greater range.",
        "Unarmoured target",
        "Heavy-armoured target",
      ]));
  });

  it("emits combat visual snapshots from authoritative inspected facing and profiles", () => {
    const simulation = createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO);
    const combat = requireCombatSandbox(simulation);
    const snapshot = createInitialSnapshot(simulation);
    const visuals = snapshot.combatDebug?.individualCombatVisuals ?? [];

    expect(visuals.map((visual) => visual.entityId)).toEqual(
      INDIVIDUAL_COMBAT_INSPECTED_ENTITY_IDS,
    );
    expect(visuals).toHaveLength(
      snapshot.combatDebug?.inspectedIndividuals.length ?? 0,
    );

    for (const visual of visuals) {
      const profile = getIndividualCombatProfile(
        combat.individualProfileStore,
        visual.entityId,
      );
      const facing = getIndividualCombatFacing(
        combat.individualCombatActionStore,
        visual.entityId,
      );
      const weaponCategory = getActiveMeleeWeaponCategory(
        combat.individualCombatActionStore,
        visual.entityId,
      );
      const distances = getActiveMeleeDistances(profile);

      expect(visual).toMatchObject({
        facingOctant: quantizeEightDirection(facing.x, facing.y).octantIndex,
        weaponCategory,
        weaponThreatDistance: distances.threat,
        weaponPreferredMinimumDistance: distances.preferredMinimum,
        attackArcOctants: 3,
        shieldCategory: profile.shieldCategory,
        shieldHeld: profile.shieldCarriedState === "held",
        armourCategory: profile.armourCategory,
      });
    }

    expect(visuals.find((visual) => visual.entityId === 0)?.facingOctant).toBe(0);
    expect(visuals.find((visual) => visual.entityId === 1)?.facingOctant).toBe(4);
  });

  it("emits no combat visual entries for normal scenarios without inspection", () => {
    const simulation = createSimulation(LIVE_COMBAT_SCENARIO);

    expect(createInitialSnapshot(simulation).combatDebug?.individualCombatVisuals)
      .toEqual([]);
    advanceSimulationOneTick(simulation);
    expect(createPositionSnapshot(simulation).combatDebug?.individualCombatVisuals)
      .toEqual([]);
  });

  it("derives bounded combat visual events from current individual pipeline records", () => {
    const trace = collectVisualTrace(
      createSimulation(INDIVIDUAL_COMBAT_VISUAL_SCENARIO),
      INSPECTION_TICKS,
    );

    expect(eventKindsForPair(trace, 0, 1, 5)).toEqual([
      "attackAttempt",
      "parry",
    ]);
    expect(eventKindsForPair(trace, 2, 3, 5)).toEqual([
      "attackAttempt",
      "shieldBlock",
    ]);
    expect(
      trace.visualEvents.some((event) => event.kind === "bucklerBlock"),
    ).toBe(false);

    const rejectedGateTick = trace.ticks.find((tick) =>
      tick.visualEvents.some(
        (event) =>
          event.attackerEntityId === 15 &&
          event.targetEntityId === 16 &&
          event.kind === "gateRejected",
      ),
    );
    expect(rejectedGateTick).toBeDefined();
    expect(
      rejectedGateTick?.visualEvents.some(
        (event) =>
          event.attackerEntityId === 15 &&
          event.targetEntityId === 16 &&
          event.kind === "landed",
      ),
    ).toBe(true);
    expect(
      rejectedGateTick?.visualEvents.some(
        (event) =>
          event.attackerEntityId === 15 &&
          event.targetEntityId === 16 &&
          event.kind === "hitApplied",
      ),
    ).toBe(false);

    expect(eventKindsForPair(trace, 15, 16, 3)).toEqual([
      "attackAttempt",
      "landed",
      "gateAccepted",
      "hitApplied",
    ]);
    expect(
      trace.visualEvents.find(
        (event) =>
          event.attackerEntityId === 15 &&
          event.targetEntityId === 16 &&
          event.kind === "hitApplied",
      )?.appliedHitLoss,
    ).toBe(1);

    expect(eventKindsForPair(trace, 4, 6, 5)).toEqual([
      "attackAttempt",
      "parry",
    ]);
    expect(eventKindsForPair(trace, 5, 6, 5)).toEqual([
      "attackAttempt",
      "failedDefence",
      "gateAccepted",
      "hitApplied",
    ]);
    const twoOnOneEvents = trace.ticks
      .find((tick) => tick.currentTick === 5)
      ?.visualEvents.filter((event) => event.targetEntityId === 6);
    expect(twoOnOneEvents?.map((event) => event.attackerEntityId)).toContain(4);
    expect(twoOnOneEvents?.map((event) => event.attackerEntityId)).toContain(5);

    for (const tick of trace.ticks) {
      for (const event of tick.visualEvents) {
        expect(event.tick).toBe(tick.currentTick);
      }
    }
  });

  it("uses authoritative weapon distances for reach overlay ordering", () => {
    const dagger = getActiveMeleeDistances(profileForWeapon("dagger", 1));
    const oneHanded = getActiveMeleeDistances(profileForWeapon("oneHanded", 2));
    const polearm = getActiveMeleeDistances(profileForWeapon("polearm", 4));
    const pike = getActiveMeleeDistances(profileForWeapon("pike", 5));

    expect(pike.threat).toBeGreaterThan(polearm.threat);
    expect(polearm.threat).toBeGreaterThan(oneHanded.threat);
    expect(dagger.threat).toBeLessThan(oneHanded.threat);
    expect(dagger.preferredMinimum).toBe(0);
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
    expect(firstDefenceTick(trace, 0, 1, "parried")).toBe(5);
    expect(trace.defences).toContainEqual(
      expect.objectContaining({
        attackerEntityId: 2,
        defenderEntityId: 3,
        outcome: "shieldBlocked",
      }),
    );
    expect(firstDefenceTick(trace, 2, 3, "shieldBlocked")).toBe(5);
    const firstWeaponFailure = firstDefenceTick(trace, 0, 1, "landed");
    const firstShieldFailure = firstDefenceTick(trace, 2, 3, "landed");
    expect(firstWeaponFailure).toBe(25);
    expect(firstShieldFailure).toBe(45);
    expect(firstWeaponFailure).toBeLessThan(firstShieldFailure ?? 0);
    const pressureAfterFirstSuccessfulDefence = trace.ticks.find(
      (tick) => tick.currentTick === 5,
    );
    expect(pressureAfterFirstSuccessfulDefence?.inspected.get(1)?.currentPressure)
      .toBeGreaterThan(
        pressureAfterFirstSuccessfulDefence?.inspected.get(3)?.currentPressure ??
          Number.MAX_SAFE_INTEGER,
      );
    const twoOnOneTick = trace.ticks.find(
      (tick) =>
        tick.defences.some(
          (record) => record.defenderEntityId === 6 && record.outcome === "parried",
        ) &&
        tick.defences.some(
          (record) => record.defenderEntityId === 6 && record.outcome === "landed",
        ),
    );
    expect(twoOnOneTick?.currentTick).toBe(5);
    expect(twoOnOneTick?.inspected.get(6)).toMatchObject({
      thisTickIncomingParryCount: 1,
      thisTickIncomingBucklerBlockCount: 0,
      thisTickIncomingShieldBlockCount: 0,
      thisTickIncomingLandedCount: 1,
    });

    const polearmAttempt = firstAttempt(trace, 7, 8);
    const oneHandedAttempt = firstAttempt(trace, 9, 10);
    expect(firstAttemptTick(trace, 7, 8)).toBe(5);
    expect(firstAttemptTick(trace, 9, 10)).toBe(3);
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
    expect(firstHitApplicationTick(trace, 11, 12)).toBe(3);
    expect(trace.hitApplications).toContainEqual(
      expect.objectContaining({
        attackerEntityId: 13,
        targetEntityId: 14,
        appliedHitLoss: 1,
        currentHitsBefore: initialHeavyHits,
        currentHitsAfter: initialHeavyHits - 1,
      }),
    );
    expect(firstHitApplicationTick(trace, 13, 14)).toBe(3);
    expect(
      trace.attackAttempts.some(
        (record) => record.attackerEntityId === 11 && record.targetEntityId === 12,
      ),
    ).toBe(true);
    expect(
      trace.attackAttempts.some(
        (record) => record.attackerEntityId === 13 && record.targetEntityId === 14,
      ),
    ).toBe(true);
    expect(
      trace.attackAttempts.some(
        (record) =>
          (record.attackerEntityId === 11 && record.targetEntityId === 14) ||
          (record.attackerEntityId === 13 && record.targetEntityId === 12),
      ),
    ).toBe(false);
    expect(trace.ticks[0]?.inspected.get(12)).toMatchObject({
      nearbyHostileCount: 1,
      proximityPressureFloor: 2,
    });
    expect(trace.ticks[0]?.inspected.get(14)).toMatchObject({
      nearbyHostileCount: 1,
      proximityPressureFloor: 2,
    });

    const samePairGateDecisions = trace.gateDecisions.filter(
      (decision) =>
        decision.attackerEntityId === 15 && decision.targetEntityId === 16,
    );
    const acceptedSamePairTicks = samePairGateDecisions
      .filter((decision) => decision.outcome === "accepted")
      .map((decision) => decision.currentTick);
    expect(acceptedSamePairTicks.length).toBeGreaterThanOrEqual(2);
    expect(acceptedSamePairTicks).toEqual([3, 24, 45, 66]);
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
          tick.currentTick === 3 &&
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

    expect(minimumChamberCentreDistance()).toBe(INDIVIDUAL_COMBAT_LOCAL_INTERACTION_RANGE + 108);
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
  readonly visualEvents: readonly InspectedCombatVisualEvent[];
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
  readonly visualEvents: readonly InspectedCombatVisualEvent[];
  readonly zeroHitEntities: readonly number[];
  readonly minimumCrossAreaDistance: number;
} {
  const combat = requireCombatSandbox(simulation);
  const tickTraces: TickTrace[] = [];
  const attackAttempts: IndividualMeleeAttackAttemptRecord[] = [];
  const defences: IndividualMeleeDefenceRecord[] = [];
  const gateDecisions: IndividualLandedHitGateDecisionRecord[] = [];
  const hitApplications: TickTrace["hitApplications"][number][] = [];
  const visualEvents: InspectedCombatVisualEvent[] = [];
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
    const tickVisualEvents =
      snapshot.combatDebug?.inspectedCombatVisualEvents.map((event) => ({
        ...event,
      })) ?? [];

    attackAttempts.push(...tickAttackAttempts);
    defences.push(...tickDefences);
    gateDecisions.push(...tickGateDecisions);
    hitApplications.push(...tickHitApplications);
    visualEvents.push(...tickVisualEvents);
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
      visualEvents: tickVisualEvents,
    });
  }

  return {
    ticks: tickTraces,
    attackAttempts,
    defences,
    gateDecisions,
    hitApplications,
    visualEvents,
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

function firstAttemptTick(
  trace: ReturnType<typeof collectVisualTrace>,
  attackerEntityId: number,
  targetEntityId: number,
): number | undefined {
  return trace.ticks.find((tick) =>
    tick.attackAttempts.some(
      (record) =>
        record.attackerEntityId === attackerEntityId &&
        record.targetEntityId === targetEntityId,
    ),
  )?.currentTick;
}

function firstDefenceTick(
  trace: ReturnType<typeof collectVisualTrace>,
  attackerEntityId: number,
  defenderEntityId: number,
  outcome: IndividualMeleeDefenceRecord["outcome"],
): number | undefined {
  return trace.ticks.find((tick) =>
    tick.defences.some(
      (record) =>
        record.attackerEntityId === attackerEntityId &&
        record.defenderEntityId === defenderEntityId &&
        record.outcome === outcome,
    ),
  )?.currentTick;
}

function firstHitApplicationTick(
  trace: ReturnType<typeof collectVisualTrace>,
  attackerEntityId: number,
  targetEntityId: number,
): number | undefined {
  return trace.ticks.find((tick) =>
    tick.hitApplications.some(
      (record) =>
        record.attackerEntityId === attackerEntityId &&
        record.targetEntityId === targetEntityId,
    ),
  )?.currentTick;
}

function eventKindsForPair(
  trace: ReturnType<typeof collectVisualTrace>,
  attackerEntityId: number,
  targetEntityId: number,
  tick: number,
): readonly InspectedCombatVisualEvent["kind"][] {
  return (
    trace.ticks
      .find((entry) => entry.currentTick === tick)
      ?.visualEvents.filter(
        (event) =>
          event.attackerEntityId === attackerEntityId &&
          event.targetEntityId === targetEntityId,
      )
      .map((event) => event.kind) ?? []
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
  const chamberIndexByEntity = buildChamberIndexByEntity();
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
      if (
        chamberIndexByEntity.get(leftEntityId) ===
        chamberIndexByEntity.get(rightEntityId)
      ) {
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

function buildChamberIndexByEntity(): ReadonlyMap<number, number> {
  const mapping = new Map<number, number>();
  for (let index = 0; index < INDIVIDUAL_COMBAT_VISUAL_CHAMBERS.length; index += 1) {
    const chamber = INDIVIDUAL_COMBAT_VISUAL_CHAMBERS[index]!;
    for (const entityId of chamber.entityIds) {
      mapping.set(entityId, index);
    }
  }
  return mapping;
}

function minimumChamberCentreDistance(): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (
    let leftIndex = 0;
    leftIndex < INDIVIDUAL_COMBAT_VISUAL_CHAMBERS.length;
    leftIndex += 1
  ) {
    const left = INDIVIDUAL_COMBAT_VISUAL_CHAMBERS[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < INDIVIDUAL_COMBAT_VISUAL_CHAMBERS.length;
      rightIndex += 1
    ) {
      const right = INDIVIDUAL_COMBAT_VISUAL_CHAMBERS[rightIndex]!;
      const dx = left.centreX - right.centreX;
      const dy = left.centreY - right.centreY;
      minimum = Math.min(minimum, Math.sqrt(dx * dx + dy * dy));
    }
  }
  return minimum;
}

function rowLegendChamberIds(centreY: number): readonly number[] {
  return INDIVIDUAL_COMBAT_VISUAL_CHAMBERS
    .filter((chamber) => chamber.centreY === centreY)
    .sort((left, right) => left.centreX - right.centreX)
    .map((chamber) => chamber.id);
}

function profileForWeapon(
  primaryWeapon: IndividualWeaponCategory,
  reach: number,
): IndividualCombatProfile {
  return {
    entityId: 0,
    primaryWeapon,
    supportedAttackModes: ["melee"],
    reach,
    handRequirement: primaryWeapon === "dagger" || primaryWeapon === "oneHanded"
      ? "one"
      : "two",
    shieldCategory: "none",
    shieldCarriedState: "none",
    armourCategory: "none",
    hasQualifyingHelmet: false,
    qualifications: {
      hasWeaponMaster: false,
      hasShield: false,
      hasMarksman: false,
      hasThrown: false,
      hasAmbidexterity: false,
      enduranceLevels: 0,
      fortitudeLevels: 0,
      hasDreadnought: false,
    },
    magicalCapabilities: {
      canUseRod: false,
      canUseStaff: false,
      canWearMageArmour: false,
      canDeliverCombatMagic: false,
    },
    temporaryAlwaysOnHitModifier: 0,
  };
}

function requireCombatSandbox(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) {
    throw new Error("Expected individual combat visual scenario sandbox.");
  }
  return simulation.combatSandbox;
}
