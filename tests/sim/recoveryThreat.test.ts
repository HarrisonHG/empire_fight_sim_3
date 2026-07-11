import { describe, expect, it } from "vitest";

import {
  createFormationBehaviourStore,
} from "../../src/sim/formationBehaviour";
import {
  collectRecoveryThreatSummaries,
  createRecoveryThreatStore,
  type UnitRecoveryThreatSummary,
} from "../../src/sim/recoveryThreat";
import { createUnitIdentityStore } from "../../src/sim/unitIdentity";
import type { WorldState } from "../../src/sim/types";

describe("recovery local threat collection", () => {
  it("uses the shared local hostile range and replays deterministically", () => {
    const run = () => {
      const world = createWorld();
      const identity = createUnitIdentityStore({
        entityCount: 2,
        units: [
          { unitId: 10, factionId: 1, memberEntityIds: [0] },
          { unitId: 20, factionId: 2, memberEntityIds: [1] },
        ],
      });
      const formation = createFormationBehaviourStore(identity, {
        entityCount: 2,
        rngSeed: 0x4a,
        units: [
          formationUnit(10, 100),
          formationUnit(20, 250),
        ],
        individuals: [individual(0), individual(1)],
      });
      const store = createRecoveryThreatStore(identity, world);
      const summaries: UnitRecoveryThreatSummary[] = [];

      const nearby = collectRecoveryThreatSummaries(
        world,
        identity,
        formation,
        store,
        summaries,
      ).map((summary) => ({ ...summary }));
      world.positionsX[1] = 500;
      const distantFormation = createFormationBehaviourStore(identity, {
        entityCount: 2,
        rngSeed: 0x4a,
        units: [
          formationUnit(10, 100),
          formationUnit(20, 500),
        ],
        individuals: [individual(0), individual(1)],
      });
      const distant = collectRecoveryThreatSummaries(
        world,
        identity,
        distantFormation,
        store,
        summaries,
      ).map((summary) => ({ ...summary }));

      return { nearby, distant };
    };

    expect(run()).toEqual({
      nearby: [
        { unitId: 10, hostileNearby: true },
        { unitId: 20, hostileNearby: true },
      ],
      distant: [
        { unitId: 10, hostileNearby: false },
        { unitId: 20, hostileNearby: false },
      ],
    });
    expect(run()).toEqual(run());
  });
});

function createWorld(): WorldState {
  return {
    entityCount: 2,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from([0, 1]),
    positionsX: Int32Array.from([100, 250]),
    positionsY: Int32Array.from([100, 100]),
    velocitiesX: new Int32Array(2),
    velocitiesY: new Int32Array(2),
  };
}

function formationUnit(unitId: number, anchorX: number) {
  return {
    unitId,
    anchorX,
    anchorY: 100,
    headingX: 1 as const,
    headingY: 0 as const,
    spacing: 10,
    rows: 1,
    cols: 1,
    unitSpeed: 0,
    order: "hold" as const,
  };
}

function individual(entityId: number) {
  return {
    entityId,
    role: "regular" as const,
    slotRow: 0,
    slotCol: 0,
    memberMaxStep: 1,
  };
}
