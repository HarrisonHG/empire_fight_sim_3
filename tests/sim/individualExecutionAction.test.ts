import { describe, expect, it } from "vitest";

import {
  classifyIndividualTerminalPlayerPresences,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  applyIndividualZeroHitLifecycleTransitions,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import { createIndividualDeathCountStore, getIndividualCasualtyHistoryInspection } from "../../src/sim/individualDeathCount";
import {
  advanceIndividualExecutionActionsOneTick,
  createIndividualExecutionActionBuffers,
  createIndividualExecutionActionStore,
  getIndividualExecutionActionInspection,
  getIndividualExecutionDefenceHandAvailability,
  projectIndividualExecutionOrdinaryParticipation,
  submitIndividualExecutionIntent,
} from "../../src/sim/individualExecutionAction";
import { createIndividualOrdinaryParticipationSnapshot, isIndividualOrdinaryParticipationEligible } from "../../src/sim/individualOrdinaryParticipation";
import type { IndividualLandedHitGateDecisionRecord } from "../../src/sim/individualLandedHitGate";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import type { WorldState } from "../../src/sim/types";

describe("individual execution actions", () => {
  it("starts only from explicit intent and completes after exactly 100 later valid ticks", () => {
    const harness = createHarness("citizen");
    expect(advance(harness, 0).activeActionCount).toBe(0);
    submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 1, requestedTick: 0 });
    expect(advance(harness, 0).startedRecords[0]).toMatchObject({ progressTicks: 0, startedTick: 0 });
    for (let tick = 1; tick < 100; tick += 1) advance(harness, tick);
    expect(getIndividualCharacterLifecycleState(harness.lifecycle, 1)).toBe("dying");
    expect(getIndividualExecutionActionInspection(harness.actions, 0)?.progressTicks).toBe(99);
    const completed = advance(harness, 100);
    expect(completed.completedRecords).toEqual([expect.objectContaining({ executorEntityId: 0, targetEntityId: 1, tick: 100, cause: "execution" })]);
    expect(getIndividualCharacterLifecycleState(harness.lifecycle, 1)).toBe("terminal");
    expect(getIndividualCasualtyHistoryInspection(harness.deathCounts, 1)).toMatchObject({ terminalTick: 100, terminalCause: "execution" });
    const presence = classifyIndividualTerminalPlayerPresences(harness.lifecycle, harness.presence, harness.procedures,
      completed.completedRecords.map((record) => ({ entityId: record.targetEntityId, tick: record.tick })));
    expect(presence[0]).toMatchObject({ presenceState: "terminalAwaitingComfort", procedureKind: "citizen" });
    expect(getIndividualPlayerPresenceState(harness.presence, 1)).toBe("terminalAwaitingComfort");
  });

  it("classifies explicitly configured barbarian procedure without faction inference", () => {
    const harness = createHarness("barbarian");
    submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 1, requestedTick: 0 });
    advance(harness, 0); for (let tick = 1; tick <= 100; tick += 1) advance(harness, tick);
    classifyIndividualTerminalPlayerPresences(harness.lifecycle, harness.presence, harness.procedures, [{ entityId: 1, tick: 100 }]);
    expect(getIndividualPlayerPresenceState(harness.presence, 1)).toBe("respawnEgress");
  });

  it.each([
    ["executorAttackAttempt", { attacks: [attempt(0, 1)] }],
    ["executorAcceptedHit", { gates: [acceptedGate(1, 0)] }],
    ["targetAcceptedHit", { gates: [acceptedGate(0, 1)] }],
  ] as const)("interrupts canonically for %s evidence", (reason, evidence) => {
    const harness = createHarness("citizen");
    submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 1, requestedTick: 0 }); advance(harness, 0);
    expect(advance(harness, 1, "attacks" in evidence ? evidence.attacks : [], "gates" in evidence ? evidence.gates : []).interruptedRecords[0]).toMatchObject({ reason, tick: 1 });
    expect(getIndividualCharacterLifecycleState(harness.lifecycle, 1)).toBe("dying");
  });

  it("does not treat parries or blocks as accepted-hit interruption evidence", () => {
    const harness = createHarness("citizen");
    submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 1, requestedTick: 0 }); advance(harness, 0);
    const result = advance(harness, 1, [], []);
    expect(result.interruptedRecords).toHaveLength(0);
    expect(getIndividualExecutionActionInspection(harness.actions, 0)?.progressTicks).toBe(1);
  });

  it("interrupts on range loss and rejects invalid active targets", () => {
    const harness = createHarness("citizen");
    submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 2, requestedTick: 0 });
    expect(advance(harness, 0).startedRecords).toHaveLength(0);
    submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 1, requestedTick: 0 }); advance(harness, 0);
    harness.world.positionsX[0] = 40;
    expect(advance(harness, 1).interruptedRecords[0]).toMatchObject({ reason: "rangeLost" });
  });

  it("replays intent processing independently of submission order", () => {
    const run = (reverse: boolean) => {
      const harness = createHarness("citizen", 4);
      down(harness, 3);
      const intents = [{ executorEntityId: 0, targetEntityId: 1, requestedTick: 0 }, { executorEntityId: 2, targetEntityId: 3, requestedTick: 0 }];
      for (const intent of reverse ? intents.slice().reverse() : intents) submitIndividualExecutionIntent(harness.actions, intent);
      return advance(harness, 0).startedRecords.map((record) => [record.executorEntityId, record.targetEntityId]);
    };
    expect(run(false)).toEqual(run(true));
  });

  it("projects active executors out of ordinary participation while retaining two defence hands", () => {
    const harness = createHarness("citizen");
    submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 1, requestedTick: 0 });
    advance(harness, 0);
    const participation = createIndividualOrdinaryParticipationSnapshot(3);
    projectIndividualExecutionOrdinaryParticipation(harness.actions, participation);
    expect(isIndividualOrdinaryParticipationEligible(participation, 0)).toBe(false);
    expect(isIndividualOrdinaryParticipationEligible(participation, 1)).toBe(true);
    expect(getIndividualExecutionDefenceHandAvailability(harness.actions).getFreeHands(0)).toBe(2);
    advance(harness, 1, [], [acceptedGate(1, 0)]);
    expect(getIndividualExecutionDefenceHandAvailability(harness.actions).getFreeHands(0)).toBeUndefined();
  });

  it("rejects unavailable executors and same-tick attacks or accepted hits", () => {
    const run = (attacks: readonly IndividualMeleeAttackAttemptRecord[], gates: readonly IndividualLandedHitGateDecisionRecord[], available = true) => {
      const harness = createHarness("citizen");
      submitIndividualExecutionIntent(harness.actions, { executorEntityId: 0, targetEntityId: 1, requestedTick: 0 });
      return advanceIndividualExecutionActionsOneTick(harness.world, harness.lifecycle, harness.deathCounts,
        harness.actions, 0, attacks, gates, harness.buffers, { isExecutorAvailable: () => available });
    };
    expect(run([], [], false).startedRecords).toHaveLength(0);
    expect(run([attempt(0, 1)], []).startedRecords).toHaveLength(0);
    expect(run([], [acceptedGate(1, 0)]).startedRecords).toHaveLength(0);
  });
});

function createHarness(procedureKind: "citizen" | "barbarian", entityCount = 3) {
  const world: WorldState = { entityCount, bounds: { width: 100, height: 100 }, ids: Uint32Array.from({ length: entityCount }, (_, i) => i), positionsX: Int32Array.from({ length: entityCount }, (_, i) => i * 4), positionsY: new Int32Array(entityCount), velocitiesX: new Int32Array(entityCount), velocitiesY: new Int32Array(entityCount) };
  const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
  const presence = createIndividualPlayerPresenceStore(entityCount);
  const procedures = createIndividualCasualtyProcedureProfileStore({ entityCount, profiles: Array.from({ length: entityCount }, (_, entityId) => ({ entityId, procedureKind: entityId === 1 ? procedureKind : "citizen", deathCountPolicy: { kind: "fixedTicks" as const, durationTicks: 1000 } })) });
  const harness = { world, lifecycle, presence, procedures, deathCounts: createIndividualDeathCountStore(entityCount), actions: createIndividualExecutionActionStore(entityCount), buffers: createIndividualExecutionActionBuffers() };
  down(harness, 1); return harness;
}
function down(harness: ReturnType<typeof createHarness>, entityId: number): void { applyIndividualZeroHitLifecycleTransitions(harness.lifecycle, harness.presence, harness.procedures, harness.world, [{ entityId, attackerEntityId: entityId === 0 ? 1 : 0, previousHits: 1 }], 0); }
function advance(harness: ReturnType<typeof createHarness>, tick: number, attacks: readonly IndividualMeleeAttackAttemptRecord[] = [], gates: readonly IndividualLandedHitGateDecisionRecord[] = []) { return advanceIndividualExecutionActionsOneTick(harness.world, harness.lifecycle, harness.deathCounts, harness.actions, tick, attacks, gates, harness.buffers); }
function attempt(attackerEntityId: number, targetEntityId: number): IndividualMeleeAttackAttemptRecord { return { attackerEntityId, targetEntityId, weaponCategory: "oneHanded", commitmentDurationTicks: 1, recoveryDurationTicks: 1, distanceSquaredAtResolution: 1, threatDistance: 8, preferredMinimumDistance: 1, awkwardDistance: false, facingX: 1, facingY: 0, outcome: "attempted" }; }
function acceptedGate(attackerEntityId: number, targetEntityId: number): IndividualLandedHitGateDecisionRecord { return { attackerEntityId, targetEntityId, currentTick: 1, outcome: "accepted", reason: "accepted", previousNextAllowedTick: null, resultingNextAllowedTick: 21, cooldownTicksRemaining: 20 }; }
