import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CASUALTY_LIFECYCLE_CHAMBER_SPACING,
  CASUALTY_LIFECYCLE_LOCAL_INTERACTION_RADIUS,
  CASUALTY_LIFECYCLE_RECOMMENDED_END_TICK,
  CASUALTY_LIFECYCLE_TRAUMA_TICK,
  CASUALTY_LIFECYCLE_VISUAL_CHAMBERS,
  CASUALTY_LIFECYCLE_VISUAL_LEGEND_LINES,
  CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
  CASUALTY_LIFECYCLE_VISUAL_SCENARIO_ID,
  CASUALTY_LIFECYCLE_VISUAL_SEED,
} from "../../src/content/casualtyLifecycleVisualScenario";
import {
  findVisualTestEntry,
  VISUAL_TEST_REGISTRY,
} from "../../src/content/visualTestRegistry";
import { createCasualtyVisualGlyphSpec } from "../../src/render/casualtyVisualGrammar";
import { getIndividualCasualtyAssistanceInspection } from "../../src/sim/individualCasualtyAssistance";
import {
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
} from "../../src/sim/individualCasualtyLifecycle";
import { getIndividualCurrentGlobalHits } from "../../src/sim/individualGlobalHits";
import { getIndividualLimbDisabilityInspection } from "../../src/sim/individualLimbDisability";
import {
  calculateTraumaticWoundOpportunityRoll,
  getIndividualTraumaticWoundInspection,
} from "../../src/sim/individualTraumaticWound";
import {
  CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS,
  PHYSICK_LIMB_NO_HERB_TREATMENT_PROGRESS_TICKS,
  PHYSICK_TERMINAL_COMFORT_PROGRESS_TICKS,
} from "../../src/sim/individualTreatmentAction";
import { INDIVIDUAL_EXECUTION_PROGRESS_TICKS } from "../../src/sim/individualExecutionAction";
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
import { SimulationRunner } from "../../src/worker/SimulationRunner";
import { formatCasualtyProcedureInspection } from "../../src/ui/individualInspectionFormatting";

describe("Milestone 6 casualty lifecycle retained visual scenario", () => {
  it("registers the stable route with ten labelled focusable chambers and starts at paused tick zero", () => {
    const entry = findVisualTestEntry(CASUALTY_LIFECYCLE_VISUAL_SCENARIO_ID);
    expect(entry?.scenario).toBe(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    expect(entry?.worldLabels).toHaveLength(10);
    expect(entry?.focusAreas).toHaveLength(10);
    expect(entry?.worldLabels?.map((label) => label.text)).toEqual(
      CASUALTY_LIFECYCLE_VISUAL_CHAMBERS.map((area) => `${area.id} ${area.label}`),
    );
    expect(CASUALTY_LIFECYCLE_VISUAL_LEGEND_LINES.join(" ")).toMatch(
      /dying.*comforted.*respawn egress.*waiting/i,
    );

    const runner = new SimulationRunner(() => 0);
    const startMessages = runner.handleCommand({
      type: "start",
      scenario: CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
    });
    const initialSnapshot = startMessages.find((message) => message.type === "snapshot");
    const initialSnapshotValue = structuredClone(initialSnapshot);
    expect(initialSnapshot).toMatchObject({
      type: "snapshot",
      snapshot: { tick: 0 },
    });
    expect(runner.handleCommand({ type: "pause" })).toContainEqual({
      type: "state",
      status: "paused",
      tick: 0,
    });
    runner.handleCommand({ type: "step" });
    const resetMessages = runner.handleCommand({
      type: "reset",
      scenario: entry!.scenarioFactory(),
    });
    expect(resetMessages).toContainEqual({
      type: "state",
      status: "paused",
      tick: 0,
    });
    expect(resetMessages.find((message) => message.type === "snapshot"))
      .toEqual(initialSnapshotValue);
  });

  it("keeps every chamber beyond all accepted local interaction radii", () => {
    expect(minimumChamberCentreDistance()).toBe(CASUALTY_LIFECYCLE_CHAMBER_SPACING);
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    expect(minimumCrossChamberEntityDistance(simulation)).toBeGreaterThan(
      CASUALTY_LIFECYCLE_LOCAL_INTERACTION_RADIUS,
    );
    advanceTicks(simulation, 300);
    expect(minimumCrossChamberEntityDistance(simulation)).toBeGreaterThan(
      CASUALTY_LIFECYCLE_LOCAL_INTERACTION_RADIUS,
    );
  }, 30_000);

  it("replays the original tick-zero fixture and complete sequence deterministically", () => {
    const firstInitial = createInitialSnapshot(createSimulation(
      CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
    ));
    const secondInitial = createInitialSnapshot(createSimulation(
      CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
    ));
    expect(secondInitial).toEqual(firstInitial);
    expect(firstInitial.tick).toBe(0);
    expect(firstInitial.combatDebug?.inspectedIndividuals.every((individual) =>
      individual.characterLifecycleState === "active")).toBe(true);

    expect(runAndDigest(200)).toEqual(
      runAndDigest(200),
    );
    expect(digestSimulation(completedTrace().simulation)).toEqual(
      runAndDigest(CASUALTY_LIFECYCLE_RECOMMENDED_END_TICK),
    );
  }, 90_000);

  it("uses the clean chamber seed and isolates the explicit tick-3 trauma opportunity", () => {
    expect(CASUALTY_LIFECYCLE_VISUAL_SEED).toBe(0x6c_0004);
    expect(CASUALTY_LIFECYCLE_TRAUMA_TICK).toBe(3);
    const zeroHitPairs = [
      [0, 1], [2, 1], [3, 1], [4, 5], [8, 9], [12, 13], [16, 17],
    ] as const;
    for (const [targetEntityId, attackerEntityId] of zeroHitPairs) {
      expect(calculateTraumaticWoundOpportunityRoll(
        CASUALTY_LIFECYCLE_VISUAL_SEED,
        { targetEntityId, attackerEntityId, tick: 0, triggerKind: "zeroHit" },
      )).toBeGreaterThanOrEqual(100);
    }
    expect(calculateTraumaticWoundOpportunityRoll(
      CASUALTY_LIFECYCLE_VISUAL_SEED,
      { targetEntityId: 14, attackerEntityId: 25, tick: 3, triggerKind: "limbCleave" },
    )).toBeLessThan(100);

    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    advanceSimulationOneTick(simulation);
    const combat = requireCombat(simulation);
    for (const entityId of zeroHitPairs.map(([target]) => target)) {
      expect(getIndividualTraumaticWoundInspection(
        combat.individualTraumaticWoundStore,
        entityId,
      ).state).toBe("none");
    }
    advanceTicks(simulation, 3);
    expect(getIndividualTraumaticWoundInspection(
      combat.individualTraumaticWoundStore,
      14,
    )).toMatchObject({
      state: "active",
      latestEpisodeTick: 3,
      latestTriggerKind: "limbCleave",
    });
    expect(getIndividualTraumaticWoundInspection(
      combat.individualTraumaticWoundStore,
      19,
    ).state).toBe("none");
  });

  it("retains official treatment and execution durations without fixture overrides", () => {
    expect(CHIRURGEON_DYING_TREATMENT_PROGRESS_TICKS).toBe(600);
    expect(PHYSICK_LIMB_NO_HERB_TREATMENT_PROGRESS_TICKS).toBe(2_400);
    expect(PHYSICK_TERMINAL_COMFORT_PROGRESS_TICKS).toBe(2_400);
    expect(INDIVIDUAL_EXECUTION_PROGRESS_TICKS).toBe(100);
    expect(JSON.stringify(CASUALTY_LIFECYCLE_VISUAL_SCENARIO)).not.toMatch(
      /timingOverride|requiredProgressOverride|shortenedDuration/i,
    );
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    expect(inspected(snapshot, 2).deathCountDurationTicks).toBe(3_600);
    expect(inspected(snapshot, 3).deathCountDurationTicks).toBe(21_600);
    expect(inspected(snapshot, 19).deathCountDurationTicks).toBe(60);
  });

  it("derives visual markers from authoritative inspected simulation state", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    advanceSimulationOneTick(simulation);
    const combat = requireCombat(simulation);
    const snapshot = createPositionSnapshot(simulation);
    const zeroHit = inspected(snapshot, 0);
    expect(zeroHit).toMatchObject({
      characterLifecycleState: getIndividualCharacterLifecycleState(
        combat.individualCasualtyLifecycleStore,
        0,
      ),
      currentGlobalHits: getIndividualCurrentGlobalHits(
        combat.individualGlobalHitStore,
        0,
      ),
      reachedZeroHitsThisTick: true,
    });
    expect(createCasualtyVisualGlyphSpec(zeroHit)).toMatchObject({
      lifecycleGlyph: "dying",
      freshZeroHit: true,
    });
    expect(formatCasualtyProcedureInspection(zeroHit)).toMatch(
      /Lifecycle dying.*presence downedPresence.*death count/i,
    );

    const limb = getIndividualLimbDisabilityInspection(
      combat.individualLimbDisabilityStore,
      20,
    );
    expect(inspected(snapshot, 20)).toMatchObject({
      disabledArm: limb.disabledArm,
      disabledLeg: limb.disabledLeg,
    });
  });

  it("keeps both hostile-driven extraction chambers visibly dragging through production movement", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    const phases = new Map<number, {
      first: number;
      last: number;
      ticks: number;
      minimumX: number;
    }>();
    let helperHands: readonly [number, number] | undefined;
    let soloHands: number | undefined;
    for (let index = 0; index < 800; index += 1) {
      advanceSimulationOneTick(simulation);
      const snapshot = createPositionSnapshot(simulation);
      for (const patientEntityId of [8, 12]) {
        const patient = inspected(snapshot, patientEntityId);
        if (patient.casualtyDragGroupPhase !== "dragging") continue;
        const phase = phases.get(patientEntityId) ?? {
          first: simulation.tick,
          last: simulation.tick,
          ticks: 0,
          minimumX: simulation.world.positionsX[patientEntityId]!,
        };
        phase.last = simulation.tick;
        phase.ticks += 1;
        phase.minimumX = Math.min(
          phase.minimumX,
          simulation.world.positionsX[patientEntityId]!,
        );
        phases.set(patientEntityId, phase);
        if (patientEntityId === 8) {
          helperHands = [
            2 - (inspected(snapshot, 9).casualtyDragFreeHands ?? 2),
            2 - (inspected(snapshot, 10).casualtyDragFreeHands ?? 2),
          ];
        } else {
          soloHands = 2 - (inspected(snapshot, 13).casualtyDragFreeHands ?? 2);
        }
      }
    }
    expect(phases.get(8)).toMatchObject({ first: 7, ticks: 96 });
    expect(phases.get(12)?.ticks).toBeGreaterThanOrEqual(30);
    expect(helperHands).toEqual([1, 1]);
    expect(soloHands).toBe(2);
    expect(phases.get(8)!.minimumX).toBeLessThan(chamberCentreX(5) - 30);
    expect(phases.get(12)!.minimumX).toBeLessThan(chamberCentreX(6) - 30);
    const final = createPositionSnapshot(simulation);
    expect(inspected(final, 8)).toMatchObject({
      characterLifecycleState: "active",
      currentGlobalHits: 1,
    });
    expect(inspected(final, 12)).toMatchObject({
      characterLifecycleState: "active",
      currentGlobalHits: 1,
    });
  }, 30_000);

  it("makes the traumatised citizen drop a plausible hostile and withdraw instead", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    advanceSimulationOneTick(simulation);
    expect(inspected(createPositionSnapshot(simulation), 14)).toMatchObject({
      selectedTargetEntityId: 25,
      traumaticWoundState: "none",
    });
    advanceTicks(simulation, 3);
    expect(inspected(createPositionSnapshot(simulation), 14)).toMatchObject({
      traumaticWoundState: "active",
      thisTickAttackOutcome: "none",
    });
    advanceSimulationOneTick(simulation);
    const withdrawal = createPositionSnapshot(simulation);
    expect(inspected(withdrawal, 14)).toMatchObject({
      selectedTargetEntityId: null,
      thisTickAttackOutcome: "none",
      traumaWithdrawalActive: true,
      withdrawalTargetPhysickEntityId: 15,
      tickStartCombatEligible: false,
    });
    expect(inspected(withdrawal, 25)).toMatchObject({
      tickStartCombatEligible: true,
      selectedTargetEntityId: 14,
    });
    const startX = simulation.world.positionsX[14]!;
    for (let index = 0; index < 20; index += 1) {
      advanceSimulationOneTick(simulation);
      const citizen = inspected(createPositionSnapshot(simulation), 14);
      expect(citizen.selectedTargetEntityId).toBeNull();
      expect(citizen.thisTickAttackOutcome).toBe("none");
    }
    expect(simulation.world.positionsX[14]).toBeGreaterThan(startX);
  });

  it("shows distinct execution roles, clears them on completion and repositions the executor by bounded steps", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    advanceSimulationOneTick(simulation);
    const active = createPositionSnapshot(simulation);
    const executor = createCasualtyVisualGlyphSpec(inspected(active, 17));
    const target = createCasualtyVisualGlyphSpec(inspected(active, 16));
    expect(executor.executionRole).toBe("executor");
    expect(target.executionRole).toBe("target");
    expect(executor.executionProgress).toBe(target.executionProgress);

    advanceTicks(simulation, 100);
    let previousY = simulation.world.positionsY[17]!;
    const completed = createPositionSnapshot(simulation);
    expect(createCasualtyVisualGlyphSpec(inspected(completed, 17)).executionRole)
      .toBe("none");
    expect(createCasualtyVisualGlyphSpec(inspected(completed, 16))).toMatchObject({
      executionRole: "none",
      executionCompleted: true,
    });
    for (let index = 0; index < 24; index += 1) {
      advanceSimulationOneTick(simulation);
      const nextY = simulation.world.positionsY[17]!;
      expect(nextY - previousY).toBeGreaterThanOrEqual(0);
      expect(nextY - previousY).toBeLessThanOrEqual(2);
      previousY = nextY;
    }
    expect(previousY).toBe(chamberCentreY(8) + 48);
  });

  it("removes the barbarian death clock on expiry, throughout egress and at waiting", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    let sawEgress = false;
    let sawWaiting = false;
    for (let index = 0; index < 400; index += 1) {
      advanceSimulationOneTick(simulation);
      const individual = inspected(createPositionSnapshot(simulation), 19);
      const glyph = createCasualtyVisualGlyphSpec(individual);
      if (individual.characterLifecycleState === "dying") {
        expect(glyph.deathCountVisible).toBe(true);
        continue;
      }
      if (individual.playerPresenceState === "respawnEgress") sawEgress = true;
      if (individual.playerPresenceState === "waitingAtRespawn") sawWaiting = true;
      expect(glyph).toMatchObject({
        deathCountVisible: false,
        deathCountProgress: 0,
      });
    }
    expect({ sawEgress, sawWaiting }).toEqual({ sawEgress: true, sawWaiting: true });
  });

  it("does not retain Chamber 10 herb history as a green cross or stale combat event", () => {
    const snapshot = createPositionSnapshot(completedTrace().simulation);
    const healer = createCasualtyVisualGlyphSpec(inspected(snapshot, 21));
    expect(healer).toMatchObject({
      consumedHerbsHistory: 1,
      herbInventoryMarker: "none",
    });
    const chamberEntityIds = new Set([20, 21, 22, 23]);
    expect(snapshot.combatDebug?.inspectedCombatVisualEvents.filter((event) =>
      chamberEntityIds.has(event.attackerEntityId) ||
      chamberEntityIds.has(event.targetEntityId))).toEqual([]);
  }, 30_000);

  it("shows lifecycle, rescue, treatment, execution, comfort and egress milestones", () => {
    const { seen } = completedTrace();
    expect(seen).toEqual({
      rescueRequest: true,
      gathering: true,
      dragging: true,
      claim: true,
      treatment: true,
      interruption: true,
      execution: true,
      executionComplete: true,
      comfort: true,
      comfortComplete: true,
      egress: true,
      waiting: true,
    });
    const finalSnapshot = createPositionSnapshot(completedTrace().simulation);
    expect(inspected(finalSnapshot, 16).terminalTick).toBe(100);
    expect(inspected(finalSnapshot, 16).terminalCause).toBe("execution");
    expect(inspected(finalSnapshot, 6).treatmentInterruptedHistoryCount).toBe(1);
    expect(inspected(finalSnapshot, 19).respawnEgressStartedTick).toBeGreaterThanOrEqual(60);
    expect(inspected(finalSnapshot, 19).waitingAtRespawnArrivalTick).toBeGreaterThan(
      inspected(finalSnapshot, 19).respawnEgressStartedTick ?? Number.MAX_SAFE_INTEGER,
    );
  }, 60_000);

  it("keeps terminal comfort visually and authoritatively distinct from revival", () => {
    const { simulation } = completedTrace();
    const snapshot = createPositionSnapshot(simulation);
    const revived = inspected(snapshot, 4);
    const comforted = inspected(snapshot, 16);
    expect(createCasualtyVisualGlyphSpec(revived)).toMatchObject({
      lifecycleGlyph: "active",
      restoredHit: true,
      comfortCompleted: false,
    });
    expect(createCasualtyVisualGlyphSpec(comforted)).toMatchObject({
      lifecycleGlyph: "terminalComforted",
      restoredHit: false,
      comfortCompleted: true,
    });
    expect(comforted.characterLifecycleState).toBe("terminal");
    expect(comforted.currentGlobalHits).toBe(0);
  }, 30_000);

  it("keeps the waiting barbarian terminal and stationary and clears one selected limb per action", () => {
    const { simulation } = completedTrace();
    let waitingPosition: readonly [number, number] | undefined;
    if (getIndividualPlayerPresenceState(
      requireCombat(simulation).individualPlayerPresenceStore,
      19,
    ) === "waitingAtRespawn") {
      waitingPosition = Object.freeze([
        simulation.world.positionsX[19]!,
        simulation.world.positionsY[19]!,
      ]);
    }
    expect(waitingPosition).toBeDefined();
    advanceTicks(simulation, 100);
    expect(getIndividualCharacterLifecycleState(
      requireCombat(simulation).individualCasualtyLifecycleStore,
      19,
    )).toBe("terminal");
    expect([
      simulation.world.positionsX[19],
      simulation.world.positionsY[19],
    ]).toEqual(waitingPosition);

    const herbBacked = getIndividualLimbDisabilityInspection(
      requireCombat(simulation).individualLimbDisabilityStore,
      20,
    );
    const herbFree = getIndividualLimbDisabilityInspection(
      requireCombat(simulation).individualLimbDisabilityStore,
      22,
    );
    expect(herbBacked).toMatchObject({
      disabledLeg: false,
      legClearedCount: 1,
      disabledArm: true,
      armClearedCount: 0,
    });
    expect(herbFree).toMatchObject({
      disabledArm: false,
      armClearedCount: 1,
    });
  }, 30_000);

  it("clears barbarian assistance throughout respawn egress and waiting", () => {
    const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
    let sawEgress = false;
    let sawWaiting = false;
    for (let index = 0; index < 400; index += 1) {
      advanceSimulationOneTick(simulation);
      const combat = requireCombat(simulation);
      const presence = getIndividualPlayerPresenceState(
        combat.individualPlayerPresenceStore,
        19,
      );
      if (presence !== "respawnEgress" && presence !== "waitingAtRespawn") continue;
      sawEgress ||= presence === "respawnEgress";
      sawWaiting ||= presence === "waitingAtRespawn";
      expect(getIndividualCasualtyAssistanceInspection(
        combat.individualCasualtyAssistanceStore,
        19,
      )).toMatchObject({
        state: "none",
        dragGroupId: -1,
        destinationX: -1,
        destinationY: -1,
        claimedPhysickEntityId: -1,
      });
      expect(combat.casualtyAssistanceDecisionResult.rescueRequestedRecords)
        .not.toContainEqual(expect.objectContaining({ patientEntityId: 19 }));
    }
    expect({ sawEgress, sawWaiting }).toEqual({ sawEgress: true, sawWaiting: true });
  }, 30_000);

  it("does not alter existing retained entries or introduce browser dependencies into simulation", () => {
    expect(VISUAL_TEST_REGISTRY.filter((entry) =>
      entry.id !== CASUALTY_LIFECYCLE_VISUAL_SCENARIO_ID)
      .map((entry) => entry.id)).toEqual([
      "movement-behaviour",
      "combat-foundation",
      "morale-inspection",
      "individual-combat",
      "defence-overwhelm",
    ]);
    expect(VISUAL_TEST_REGISTRY.filter((entry) =>
      entry.id === "individual-combat" || entry.id === "defence-overwhelm")
      .every((entry) => entry.milestone === "Milestone 5 accepted")).toBe(true);
    for (const path of simulationSourceFiles()) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/from ["'](?:pixi\.js|\.\.\/render|\.\.\/ui)["']/);
      expect(source).not.toMatch(/\b(?:window|document|requestAnimationFrame)\b/);
    }
  });
});

function advanceTicks(simulation: SimulationState, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) advanceSimulationOneTick(simulation);
}

interface CompletedVisualTrace {
  readonly simulation: SimulationState;
  readonly seen: {
    readonly rescueRequest: boolean;
    readonly gathering: boolean;
    readonly dragging: boolean;
    readonly claim: boolean;
    readonly treatment: boolean;
    readonly interruption: boolean;
    readonly execution: boolean;
    readonly executionComplete: boolean;
    readonly comfort: boolean;
    readonly comfortComplete: boolean;
    readonly egress: boolean;
    readonly waiting: boolean;
  };
}

let completedTraceCache: CompletedVisualTrace | undefined;

function completedTrace(): CompletedVisualTrace {
  if (completedTraceCache !== undefined) return completedTraceCache;
  const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
  const seen = {
    rescueRequest: false,
    gathering: false,
    dragging: false,
    claim: false,
    treatment: false,
    interruption: false,
    execution: false,
    executionComplete: false,
    comfort: false,
    comfortComplete: false,
    egress: false,
    waiting: false,
  };
  for (let tick = 0; tick < CASUALTY_LIFECYCLE_RECOMMENDED_END_TICK; tick += 1) {
    advanceSimulationOneTick(simulation);
    const snapshot = createPositionSnapshot(simulation);
    const individuals = snapshot.combatDebug?.inspectedIndividuals ?? [];
    seen.rescueRequest ||= individuals.some((entry) =>
      entry.casualtyAssistanceState === "rescueRequested");
    seen.gathering ||= individuals.some((entry) =>
      entry.casualtyDragGroupPhase === "gathering");
    seen.dragging ||= individuals.some((entry) =>
      entry.casualtyDragGroupPhase === "dragging");
    seen.claim ||= individuals.some((entry) =>
      (entry.claimedMedicalPatientEntityId ?? -1) >= 0);
    seen.treatment ||= individuals.some((entry) => entry.treatmentKind !== undefined);
    seen.interruption ||= individuals.some((entry) =>
      (entry.treatmentInterruptedHistoryCount ?? 0) > 0 ||
      (entry.treatmentPerformedInterruptedHistoryCount ?? 0) > 0);
    seen.execution ||= individuals.some((entry) => entry.executionActionId !== undefined);
    seen.executionComplete ||= inspected(snapshot, 16).terminalCause === "execution";
    seen.comfort ||= individuals.some((entry) =>
      entry.treatmentKind === "physickTerminalComfort");
    seen.comfortComplete ||= inspected(snapshot, 16).playerPresenceState === "terminalComforted";
    seen.egress ||= inspected(snapshot, 19).playerPresenceState === "respawnEgress";
    seen.waiting ||= inspected(snapshot, 19).playerPresenceState === "waitingAtRespawn";
  }
  completedTraceCache = { simulation, seen };
  return completedTraceCache;
}

function runAndDigest(ticks: number): unknown {
  const simulation = createSimulation(CASUALTY_LIFECYCLE_VISUAL_SCENARIO);
  advanceTicks(simulation, ticks);
  return digestSimulation(simulation);
}

function digestSimulation(simulation: SimulationState): unknown {
  const snapshot = createPositionSnapshot(simulation);
  return {
    tick: simulation.tick,
    positions: Array.from(snapshot.positions),
    inspected: snapshot.combatDebug?.inspectedIndividuals,
    units: snapshot.combatDebug?.units,
  };
}

function inspected(
  snapshot: ReturnType<typeof createPositionSnapshot>,
  entityId: number,
): LiveCombatDebugIndividualSnapshot {
  const individual = snapshot.combatDebug?.inspectedIndividuals.find((entry) =>
    entry.entityId === entityId);
  if (individual === undefined) throw new Error(`Missing inspected entity ${entityId}.`);
  return individual;
}

function minimumChamberCentreDistance(): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < CASUALTY_LIFECYCLE_VISUAL_CHAMBERS.length; left += 1) {
    for (let right = left + 1; right < CASUALTY_LIFECYCLE_VISUAL_CHAMBERS.length; right += 1) {
      const a = CASUALTY_LIFECYCLE_VISUAL_CHAMBERS[left]!;
      const b = CASUALTY_LIFECYCLE_VISUAL_CHAMBERS[right]!;
      minimum = Math.min(minimum, Math.hypot(a.centreX - b.centreX, a.centreY - b.centreY));
    }
  }
  return minimum;
}

function chamberCentreX(chamberId: number): number {
  return CASUALTY_LIFECYCLE_VISUAL_CHAMBERS[chamberId - 1]!.centreX;
}

function chamberCentreY(chamberId: number): number {
  return CASUALTY_LIFECYCLE_VISUAL_CHAMBERS[chamberId - 1]!.centreY;
}

function minimumCrossChamberEntityDistance(simulation: SimulationState): number {
  const chamberByEntity = new Map<number, number>();
  for (const area of CASUALTY_LIFECYCLE_VISUAL_CHAMBERS) {
    for (const entityId of area.entityIds) chamberByEntity.set(entityId, area.id);
  }
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < simulation.world.entityCount; left += 1) {
    for (let right = left + 1; right < simulation.world.entityCount; right += 1) {
      if (chamberByEntity.get(left) === chamberByEntity.get(right)) continue;
      minimum = Math.min(minimum, Math.hypot(
        simulation.world.positionsX[left]! - simulation.world.positionsX[right]!,
        simulation.world.positionsY[left]! - simulation.world.positionsY[right]!,
      ));
    }
  }
  return minimum;
}

function requireCombat(simulation: SimulationState) {
  if (simulation.combatSandbox === undefined) throw new Error("Expected combat sandbox.");
  return simulation.combatSandbox;
}

function simulationSourceFiles(): readonly string[] {
  return ["simulation.ts", "types.ts"].map((file) => join(process.cwd(), "src", "sim", file));
}
