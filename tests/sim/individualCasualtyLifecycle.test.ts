import { describe, expect, it } from "vitest";

import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  getIndividualCharacterLifecycleState,
  getIndividualDownPosition,
  getIndividualEnteredDyingTick,
  getIndividualPlayerPresenceState,
  getIndividualPlayerPresenceTransitionTick,
  getIndividualTerminalCause,
  getIndividualTerminalTick,
  applyIndividualZeroHitLifecycleTransitions,
  type IndividualZeroHitLifecycleTransitionRecord,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualCasualtyProcedureProfileStore,
  getIndividualCasualtyProcedureProfile,
  type IndividualCasualtyProcedureProfileConfig,
} from "../../src/sim/individualCasualtyProcedureProfile";
import type { IndividualZeroHitEvent } from "../../src/sim/individualGlobalHits";

describe("individual casualty procedure profiles", () => {
  it("stores exactly one immutable trusted profile per entity in entity-ID order", () => {
    const fixedPolicy = { kind: "fixedTicks" as const, durationTicks: 600 };
    const store = createIndividualCasualtyProcedureProfileStore({
      entityCount: 2,
      profiles: [
        profile(1, "barbarian", fixedPolicy),
        profile(0, "citizen", { kind: "normalFortitude" }),
      ],
    });

    fixedPolicy.durationTicks = 1;
    expect(getIndividualCasualtyProcedureProfile(store, 0)).toEqual({
      entityId: 0,
      procedureKind: "citizen",
      deathCountPolicy: { kind: "normalFortitude" },
    });
    expect(getIndividualCasualtyProcedureProfile(store, 1)).toEqual({
      entityId: 1,
      procedureKind: "barbarian",
      deathCountPolicy: { kind: "fixedTicks", durationTicks: 600 },
    });
    expect(Object.isFrozen(getIndividualCasualtyProcedureProfile(store, 1)))
      .toBe(true);
    expect(Object.isFrozen(
      getIndividualCasualtyProcedureProfile(store, 1).deathCountPolicy,
    )).toBe(true);
  });

  it("does not infer casualty procedure from faction or any other entity metadata", () => {
    const store = createIndividualCasualtyProcedureProfileStore({
      entityCount: 2,
      profiles: [
        profile(0, "barbarian", { kind: "fixedTicks", durationTicks: 600 }),
        profile(1, "citizen", { kind: "normalFortitude" }),
      ],
    });
    const factionIds = Uint8Array.from([7, 7]);

    expect(factionIds[0]).toBe(factionIds[1]);
    expect(getIndividualCasualtyProcedureProfile(store, 0).procedureKind)
      .toBe("barbarian");
    expect(getIndividualCasualtyProcedureProfile(store, 1).procedureKind)
      .toBe("citizen");
  });

  it.each([
    { entityCount: 0, profiles: [] },
    { entityCount: 2, profiles: [profile(0)] },
    { entityCount: 2, profiles: [profile(0), profile(0)] },
    { entityCount: 1, profiles: [profile(1)] },
  ])("rejects invalid coverage or IDs: $entityCount $profiles", (config) => {
    expect(() => createIndividualCasualtyProcedureProfileStore(config))
      .toThrow(RangeError);
  });

  it("rejects unknown kinds and malformed death-count policies", () => {
    expect(() => createIndividualCasualtyProcedureProfileStore({
      entityCount: 1,
      profiles: [profile(0, "visitor" as "citizen")],
    })).toThrow(/procedure kind/i);
    expect(() => createIndividualCasualtyProcedureProfileStore({
      entityCount: 1,
      profiles: [profile(0, "citizen", {
        kind: "fixedTicks",
        durationTicks: 0,
      })],
    })).toThrow(/durationTicks/);
    expect(() => createIndividualCasualtyProcedureProfileStore({
      entityCount: 1,
      profiles: [profile(0, "citizen", {
        kind: "future" as "normalFortitude",
      })],
    })).toThrow(/policy kind/i);
  });

  it("rejects invalid profile getter IDs", () => {
    const store = procedureStore(1);
    expect(() => getIndividualCasualtyProcedureProfile(store, -1))
      .toThrow(RangeError);
    expect(() => getIndividualCasualtyProcedureProfile(store, 1))
      .toThrow(RangeError);
  });
});

describe("standalone zero-hit lifecycle transitions", () => {
  it("initialises every lifecycle and player presence as active", () => {
    const lifecycle = createIndividualCasualtyLifecycleStore(3);
    const presence = createIndividualPlayerPresenceStore(3);

    expect([0, 1, 2].map((id) =>
      getIndividualCharacterLifecycleState(lifecycle, id),
    )).toEqual(["active", "active", "active"]);
    expect([0, 1, 2].map((id) =>
      getIndividualPlayerPresenceState(presence, id),
    )).toEqual(["activePresence", "activePresence", "activePresence"]);
    expect(getIndividualDownPosition(lifecycle, 0)).toBeUndefined();
    expect(getIndividualEnteredDyingTick(lifecycle, 0)).toBe(-1);
    expect(getIndividualTerminalTick(lifecycle, 0)).toBe(-1);
    expect(getIndividualTerminalCause(lifecycle, 0)).toBe("none");
    expect(getIndividualPlayerPresenceTransitionTick(presence, 0)).toBe(-1);
  });

  it("applies active-to-dying and presence-down transitions at the exact position", () => {
    const fixture = stores(3, [-7, 80, 123], [9, -40, 456]);
    const result = applyIndividualZeroHitLifecycleTransitions(
      fixture.lifecycle,
      fixture.presence,
      fixture.procedures,
      fixture.positions,
      [{ entityId: 2, attackerEntityId: 0, previousHits: 1 }],
      44,
    );

    expect(result).toEqual({
      transitions: [{
        entityId: 2,
        attackerEntityId: 0,
        tick: 44,
        previousHits: 1,
        procedureKind: "citizen",
        previousLifecycleState: "active",
        lifecycleState: "dying",
        previousPresenceState: "activePresence",
        presenceState: "downedPresence",
        downX: 123,
        downY: 456,
      }],
      transitionCount: 1,
    });
    expect(getIndividualCharacterLifecycleState(fixture.lifecycle, 2))
      .toBe("dying");
    expect(getIndividualPlayerPresenceState(fixture.presence, 2))
      .toBe("downedPresence");
    expect(getIndividualEnteredDyingTick(fixture.lifecycle, 2)).toBe(44);
    expect(getIndividualPlayerPresenceTransitionTick(fixture.presence, 2))
      .toBe(44);
    expect(getIndividualDownPosition(fixture.lifecycle, 2))
      .toEqual({ x: 123, y: 456 });
    expect(fixture.positions.positionsX[2]).toBe(123);
    expect(fixture.positions.positionsY[2]).toBe(456);
  });

  it("ignores duplicate same-tick and later already-dying zero-hit events", () => {
    const fixture = stores(2);
    const event = { entityId: 1, attackerEntityId: 0, previousHits: 1 };
    const first = apply(fixture, [event, event], 7);
    fixture.positions.positionsX[1] = 999;
    const later = apply(fixture, [event], 8);

    expect(first.transitionCount).toBe(1);
    expect(later.transitionCount).toBe(0);
    expect(getIndividualEnteredDyingTick(fixture.lifecycle, 1)).toBe(7);
    expect(getIndividualDownPosition(fixture.lifecycle, 1))
      .toEqual({ x: 10, y: 20 });
  });

  it("selects duplicate attribution canonically without mutating input order", () => {
    const higherAttacker = {
      entityId: 3,
      attackerEntityId: 2,
      previousHits: 1,
    };
    const lowerAttacker = {
      entityId: 3,
      attackerEntityId: 0,
      previousHits: 2,
    };
    const forward = [higherAttacker, lowerAttacker];
    const reversed = [lowerAttacker, higherAttacker];
    const forwardBefore = forward.map((item) => ({ ...item }));
    const reversedBefore = reversed.map((item) => ({ ...item }));

    const forwardResult = replay(forward);
    const reversedResult = replay(reversed);

    expect(forwardResult).toEqual(reversedResult);
    expect(forwardResult).toHaveLength(1);
    expect(forwardResult[0]).toMatchObject({
      entityId: 3,
      attackerEntityId: 0,
      previousHits: 2,
    });
    expect(forward).toEqual(forwardBefore);
    expect(reversed).toEqual(reversedBefore);
  });

  it("uses previous hits as the final duplicate-attribution tie-break", () => {
    const higherPreviousHits = {
      entityId: 2,
      attackerEntityId: 1,
      previousHits: 3,
    };
    const lowerPreviousHits = {
      entityId: 2,
      attackerEntityId: 1,
      previousHits: 1,
    };

    const forward = replay([higherPreviousHits, lowerPreviousHits]);
    const reversed = replay([lowerPreviousHits, higherPreviousHits]);

    expect(forward).toEqual(reversed);
    expect(forward).toHaveLength(1);
    expect(forward[0]).toMatchObject({
      entityId: 2,
      attackerEntityId: 1,
      previousHits: 1,
    });
  });

  it("canonicalises reversed input into entity-ID transition order", () => {
    expect(replay([event(3, 0), event(1, 2), event(2, 0)]))
      .toEqual(replay([event(2, 0), event(1, 2), event(3, 0)]));
    expect(replay([event(3, 0), event(1, 2), event(2, 0)])
      .map((record) => record.entityId)).toEqual([1, 2, 3]);
  });

  it("reuses and clears the caller-owned transition output", () => {
    const fixture = stores(3);
    const output = [{} as IndividualZeroHitLifecycleTransitionRecord];
    const first = applyIndividualZeroHitLifecycleTransitions(
      fixture.lifecycle,
      fixture.presence,
      fixture.procedures,
      fixture.positions,
      [event(1, 0)],
      5,
      output,
    );
    const second = applyIndividualZeroHitLifecycleTransitions(
      fixture.lifecycle,
      fixture.presence,
      fixture.procedures,
      fixture.positions,
      [],
      6,
      output,
    );

    expect(first.transitions).toBe(output);
    expect(second.transitions).toBe(output);
    expect(output).toEqual([]);
  });

  it("fails clearly for invalid events, ticks, and mismatched stores", () => {
    const fixture = stores(2);
    expect(() => apply(fixture, [event(2, 0)], 0)).toThrow(/target/i);
    expect(() => apply(fixture, [event(1, 2)], 0)).toThrow(/attacker/i);
    expect(() => apply(fixture, [{ ...event(1, 0), previousHits: 0 }], 0))
      .toThrow(/previousHits/);
    expect(() => apply(fixture, [event(1, 0)], -1)).toThrow(/tick/);
    expect(() => applyIndividualZeroHitLifecycleTransitions(
      fixture.lifecycle,
      createIndividualPlayerPresenceStore(1),
      fixture.procedures,
      fixture.positions,
      [],
      0,
    )).toThrow(/matching entity counts/i);
    expect(() => applyIndividualZeroHitLifecycleTransitions(
      fixture.lifecycle,
      fixture.presence,
      fixture.procedures,
      { ...fixture.positions, positionsX: new Int32Array(1) },
      [],
      0,
    )).toThrow(/matching entity counts/i);
  });

  it("replays deterministically", () => {
    const events = [event(2, 1), event(3, 0), event(1, 0)];
    expect(replay(events)).toEqual(replay(events));
  });

  it("exposes only entity counts through the public store interfaces", () => {
    const fixture = stores(1);
    const lifecyclePublic: { readonly entityCount: number } = fixture.lifecycle;
    const presencePublic: { readonly entityCount: number } = fixture.presence;
    expect(lifecyclePublic.entityCount).toBe(1);
    expect(presencePublic.entityCount).toBe(1);
  });
});

function profile(
  entityId: number,
  procedureKind: "citizen" | "barbarian" = "citizen",
  deathCountPolicy: IndividualCasualtyProcedureProfileConfig["deathCountPolicy"] =
    { kind: "normalFortitude" },
): IndividualCasualtyProcedureProfileConfig {
  return { entityId, procedureKind, deathCountPolicy };
}

function procedureStore(entityCount: number) {
  return createIndividualCasualtyProcedureProfileStore({
    entityCount,
    profiles: Array.from({ length: entityCount }, (_, entityId) =>
      profile(
        entityId,
        entityId % 2 === 0 ? "citizen" : "barbarian",
        entityId % 2 === 0
          ? { kind: "normalFortitude" }
          : { kind: "fixedTicks", durationTicks: 600 },
      ),
    ),
  });
}

function stores(
  entityCount: number,
  x: readonly number[] = Array.from({ length: entityCount }, (_, id) => id * 10),
  y: readonly number[] = Array.from({ length: entityCount }, (_, id) => id * 20),
) {
  return {
    lifecycle: createIndividualCasualtyLifecycleStore(entityCount),
    presence: createIndividualPlayerPresenceStore(entityCount),
    procedures: procedureStore(entityCount),
    positions: {
      entityCount,
      positionsX: Int32Array.from(x),
      positionsY: Int32Array.from(y),
    },
  };
}

function apply(
  fixture: ReturnType<typeof stores>,
  events: readonly IndividualZeroHitEvent[],
  tick: number,
) {
  return applyIndividualZeroHitLifecycleTransitions(
    fixture.lifecycle,
    fixture.presence,
    fixture.procedures,
    fixture.positions,
    events,
    tick,
  );
}

function event(entityId: number, attackerEntityId: number): IndividualZeroHitEvent {
  return { entityId, attackerEntityId, previousHits: 1 };
}

function replay(events: readonly IndividualZeroHitEvent[]) {
  const fixture = stores(4);
  return apply(fixture, events, 93).transitions.map((record) => ({ ...record }));
}
