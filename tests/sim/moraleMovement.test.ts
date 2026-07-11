import { describe, expect, it } from "vitest";

import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getIndividualConfiguredMaxStep,
  getUnitAnchor,
  getUnitConfiguredSpeed,
  getUnitMovementStyle,
  getUnitOrder,
} from "../../src/sim/formationBehaviour";
import type { MoraleMovementState } from "../../src/sim/moraleMovement";
import {
  createUnitIdentityStore,
  type UnitId,
} from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

const UNIT_ID = 1 as UnitId;

describe("morale movement modifiers", () => {
  it("preserves steady formation movement exactly", () => {
    const baseline = createMoraleMovementHarness();
    const steady = createMoraleMovementHarness();
    const steadyStates = moraleStates("steady");

    for (let tick = 0; tick < 24; tick += 1) {
      expect(
        advanceFormationOneTick(
          baseline.world,
          baseline.identity,
          baseline.store,
        ).events,
      ).toEqual(
        advanceFormationOneTick(
          steady.world,
          steady.identity,
          steady.store,
          steadyStates,
        ).events,
      );
    }

    expect(getUnitAnchor(steady.store, UNIT_ID)).toEqual(
      getUnitAnchor(baseline.store, UNIT_ID),
    );
    expect(Array.from(steady.world.positionsX)).toEqual(
      Array.from(baseline.world.positionsX),
    );
    expect(Array.from(steady.world.positionsY)).toEqual(
      Array.from(baseline.world.positionsY),
    );
  });

  it("uses fixed-point carry to slow strained and shaken movement over many ticks", () => {
    const strained = createMoraleMovementHarness();
    const shaken = createMoraleMovementHarness();

    advanceTicks(strained, 20, moraleStates("strained"));
    advanceTicks(shaken, 20, moraleStates("shaken"));

    expect(getUnitAnchor(strained.store, UNIT_ID).x).toBe(117);
    expect(getUnitAnchor(shaken.store, UNIT_ID).x).toBe(113);
    expect(strained.world.positionsX[0]).toBe(117);
    expect(shaken.world.positionsX[0]).toBe(113);
  });

  it("reduces strained and shaken slot correction independently of anchor advance", () => {
    const steady = createMoraleMovementHarness({
      initialMemberX: 80,
      order: "hold",
    });
    const strained = createMoraleMovementHarness({
      initialMemberX: 80,
      order: "hold",
    });
    const shaken = createMoraleMovementHarness({
      initialMemberX: 80,
      order: "hold",
    });

    advanceTicks(steady, 20, moraleStates("steady"));
    advanceTicks(strained, 20, moraleStates("strained"));
    advanceTicks(shaken, 20, moraleStates("shaken"));

    expect(steady.world.positionsX[0]).toBe(100);
    expect(strained.world.positionsX[0]).toBe(97);
    expect(shaken.world.positionsX[0]).toBe(93);
  });

  it.each(["wavering", "recovering"] as const)(
    "%s halts anchor advance but continues limited slot correction",
    (state) => {
      const harness = createMoraleMovementHarness({ initialMemberX: 80 });
      const states = moraleStates(state);
      const initialAnchor = getUnitAnchor(harness.store, UNIT_ID);

      advanceTicks(harness, 8, states);

      expect(getUnitAnchor(harness.store, UNIT_ID)).toEqual(initialAnchor);
      expect(harness.world.positionsX[0]).toBeGreaterThan(80);
      expect(harness.world.positionsX[0]).toBeLessThan(100);
    },
  );

  it("suspends an advancing order while recovering but continues reforming", () => {
    const harness = createMoraleMovementHarness({ initialMemberX: 80 });
    const states = moraleStates("recovering");
    const anchor = getUnitAnchor(harness.store, UNIT_ID);

    advanceTicks(harness, 8, states);

    expect(getUnitOrder(harness.store, UNIT_ID)).toBe("advance");
    expect(getUnitMovementStyle(harness.store, UNIT_ID)).toBe("orderedHalt");
    expect(getUnitAnchor(harness.store, UNIT_ID)).toEqual(anchor);
    expect(harness.world.positionsX[0]).toBeGreaterThan(80);
  });

  it("does not mutate configured movement rates", () => {
    const harness = createMoraleMovementHarness({ initialMemberX: 80 });
    const states = moraleStates("shaken");

    advanceTicks(harness, 30, states);

    expect(getUnitConfiguredSpeed(harness.store, UNIT_ID)).toBe(1);
    expect(getIndividualConfiguredMaxStep(harness.store, 0)).toBe(1);
  });

  it("replays the same headless morale sequence without render or frame-time input", () => {
    const run = () => {
      const harness = createMoraleMovementHarness({ initialMemberX: 80 });
      const states = moraleStates("steady");
      const sequence: readonly MoraleMovementState[] = [
        "steady",
        "strained",
        "strained",
        "shaken",
        "wavering",
        "wavering",
        "recovering",
        "recovering",
        "steady",
      ];

      for (let tick = 0; tick < 45; tick += 1) {
        states.set(UNIT_ID, sequence[tick % sequence.length]!);
        advanceFormationOneTick(
          harness.world,
          harness.identity,
          harness.store,
          states,
        );
      }

      return {
        anchor: getUnitAnchor(harness.store, UNIT_ID),
        positionsX: Array.from(harness.world.positionsX),
        positionsY: Array.from(harness.world.positionsY),
        entityCount: harness.world.entityCount,
        ids: Array.from(harness.world.ids),
      };
    };

    expect(run()).toEqual(run());
  });
});

function createMoraleMovementHarness(
  options: { initialMemberX?: number; order?: "advance" | "hold" } = {},
) {
  const world: WorldState = {
    entityCount: 1,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from([0]),
    positionsX: Int32Array.from([options.initialMemberX ?? 100]),
    positionsY: Int32Array.from([100]),
    velocitiesX: new Int32Array(1),
    velocitiesY: new Int32Array(1),
  };
  const identity = createUnitIdentityStore({
    entityCount: 1,
    units: [{ unitId: UNIT_ID, factionId: 1, memberEntityIds: [0] }],
  });
  const store = createFormationBehaviourStore(identity, {
    entityCount: 1,
    rngSeed: 0x4d_4f_52_41,
    units: [
      {
        unitId: UNIT_ID,
        anchorX: 100,
        anchorY: 100,
        headingX: 1,
        headingY: 0,
        spacing: 10,
        rows: 1,
        cols: 1,
        unitSpeed: 1,
        order: options.order ?? "advance",
      },
    ],
    individuals: [
      {
        entityId: 0,
        role: "regular",
        slotRow: 0,
        slotCol: 0,
        memberMaxStep: 1,
      },
    ],
  });

  return { world, identity, store };
}

function moraleStates(
  state: MoraleMovementState,
): Map<UnitId, MoraleMovementState> {
  return new Map([[UNIT_ID, state]]);
}

function advanceTicks(
  harness: ReturnType<typeof createMoraleMovementHarness>,
  ticks: number,
  states: Map<UnitId, MoraleMovementState>,
): void {
  for (let tick = 0; tick < ticks; tick += 1) {
    advanceFormationOneTick(
      harness.world,
      harness.identity,
      harness.store,
      states,
    );
  }
}
