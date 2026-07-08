import { describe, expect, it } from "vitest";

import {
  createUnitIdentityStore,
  getFactionIdForUnit,
  getUnitIdForEntity,
  getUnitIds,
  getUnitMembers,
  type UnitIdentityConfig,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";

describe("unit identity", () => {
  it("accepts valid unit and faction definitions", () => {
    const store = createUnitIdentityStore(createValidConfig());

    expect(store.entityCount).toBe(6);
    expect(store.unitCount).toBe(2);
    expect(store.unassignedEntitiesAllowed).toBe(false);
    expect(getUnitIds(store)).toEqual([10, 20]);
    expect(getFactionIdForUnit(store, 10)).toBe(1);
    expect(getFactionIdForUnit(store, 20)).toBe(2);
    expect(getUnitMembers(store, 10)).toEqual([0, 1, 2, 3]);
    expect(getUnitMembers(store, 20)).toEqual([4, 5]);
  });

  it("rejects duplicate unit IDs", () => {
    expect(() =>
      createUnitIdentityStore({
        entityCount: 2,
        units: [
          { unitId: 1, factionId: 1, memberEntityIds: [0] },
          { unitId: 1, factionId: 2, memberEntityIds: [1] },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("rejects invalid unit IDs", () => {
    expect(() =>
      createUnitIdentityStore({
        entityCount: 1,
        units: [{ unitId: -1, factionId: 1, memberEntityIds: [0] }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createUnitIdentityStore({
        entityCount: 1,
        units: [{ unitId: 1.5, factionId: 1, memberEntityIds: [0] }],
      }),
    ).toThrow(RangeError);
  });

  it("rejects invalid faction IDs", () => {
    expect(() =>
      createUnitIdentityStore({
        entityCount: 1,
        units: [{ unitId: 1, factionId: -1, memberEntityIds: [0] }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createUnitIdentityStore({
        entityCount: 1,
        units: [{ unitId: 1, factionId: 1.25, memberEntityIds: [0] }],
      }),
    ).toThrow(RangeError);
  });

  it("rejects invalid entity membership", () => {
    expect(() =>
      createUnitIdentityStore({
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [0, 2] }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createUnitIdentityStore({
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [-1, 0] }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createUnitIdentityStore({
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [0, 1.5] }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createUnitIdentityStore({
        entityCount: 2,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [0, 0] }],
      }),
    ).toThrow(RangeError);
    expect(() =>
      createUnitIdentityStore({
        entityCount: 2,
        units: [
          { unitId: 1, factionId: 1, memberEntityIds: [0] },
          { unitId: 2, factionId: 1, memberEntityIds: [0, 1] },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("rejects empty units", () => {
    expect(() =>
      createUnitIdentityStore({
        entityCount: 1,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [] }],
      }),
    ).toThrow(RangeError);
  });

  it("does not allow unassigned entities", () => {
    expect(() =>
      createUnitIdentityStore({
        entityCount: 3,
        units: [{ unitId: 1, factionId: 1, memberEntityIds: [0, 1] }],
      }),
    ).toThrow(RangeError);

    const store = createUnitIdentityStore({
      entityCount: 3,
      units: [{ unitId: 1, factionId: 1, memberEntityIds: [0, 1, 2] }],
    });

    expect(store.unassignedEntitiesAllowed).toBe(false);
  });

  it("returns deterministic entity-to-unit lookups", () => {
    const store = createUnitIdentityStore(createValidConfig());

    expect(getUnitIdForEntity(store, 0)).toBe(10);
    expect(getUnitIdForEntity(store, 1)).toBe(10);
    expect(getUnitIdForEntity(store, 4)).toBe(20);
    expect(getUnitIdForEntity(store, 5)).toBe(20);
    expect(getUnitIdForEntity(store, 4)).toBe(20);
    expect(() => getUnitIdForEntity(store, 6)).toThrow(RangeError);
  });

  it("returns deterministic unit-to-faction lookups", () => {
    const store = createUnitIdentityStore(createValidConfig());

    expect(getFactionIdForUnit(store, 10)).toBe(1);
    expect(getFactionIdForUnit(store, 20)).toBe(2);
    expect(getFactionIdForUnit(store, 10)).toBe(1);
    expect(() => getFactionIdForUnit(store, 30)).toThrow(RangeError);
  });

  it("iterates unit members in ascending entity ID order", () => {
    const store = createUnitIdentityStore(createValidConfig());

    expect(getUnitMembers(store, 10)).toEqual([0, 1, 2, 3]);
    expect(getUnitMembers(store, 20)).toEqual([4, 5]);
  });

  it("sorts observable unit IDs in ascending unit ID order", () => {
    const store = createUnitIdentityStore(createValidConfig());

    expect(getUnitIds(store)).toEqual([10, 20]);
  });

  it("repeated construction from the same inputs produces equal stores", () => {
    const first = createUnitIdentityStore(createValidConfig());
    const second = createUnitIdentityStore(createValidConfig());

    expect(encodeStore(first)).toEqual(encodeStore(second));
  });

  it("stores faction identity as categorisation data only", () => {
    const store = createUnitIdentityStore(createValidConfig());

    expect(getFactionIdForUnit(store, 10)).toBe(1);
    expect(getFactionIdForUnit(store, 20)).toBe(2);

    for (const value of Object.values(store)) {
      expect(typeof value).not.toBe("function");
    }
  });
});

function createValidConfig(): UnitIdentityConfig {
  return {
    entityCount: 6,
    units: [
      { unitId: 20, factionId: 2, memberEntityIds: [5, 4] },
      { unitId: 10, factionId: 1, memberEntityIds: [3, 1, 0, 2] },
    ],
  };
}

function encodeStore(store: UnitIdentityStore): readonly unknown[] {
  return getUnitIds(store).map((unitId) => ({
    unitId,
    factionId: getFactionIdForUnit(store, unitId),
    members: Array.from(getUnitMembers(store, unitId)),
  }));
}
