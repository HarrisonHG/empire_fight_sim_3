import { describe, expect, it } from "vitest";

import {
  collectHostileThreatContacts,
  computeUnitThreatContact,
  getContactDistanceForReachBand,
  getThreatRangeForReachBand,
  getUnitThreatSummary,
  type UnitThreatContact,
} from "../../src/sim/threatGeometry";
import type { WorldState } from "../../src/sim/types";
import {
  createUnitIdentityStore,
  getFactionIdForUnit,
  getUnitIds,
  getUnitMembers,
  type UnitIdentityStore,
} from "../../src/sim/unitIdentity";
import {
  createUnitLoadoutStore,
  getUnitLoadoutSummary,
  type UnitLoadoutStore,
  type WeaponReachBand,
} from "../../src/sim/unitLoadout";

const REACH_BANDS: readonly WeaponReachBand[] = [
  "none",
  "close",
  "short",
  "medium",
  "long",
  "veryLong",
  "ranged",
];

const EXPECTED_THREAT_RANGES: Readonly<Record<WeaponReachBand, number>> = {
  none: 0,
  close: 4,
  short: 8,
  medium: 12,
  long: 18,
  veryLong: 24,
  ranged: 80,
};

const EXPECTED_CONTACT_DISTANCES: Readonly<Record<WeaponReachBand, number>> = {
  none: 1,
  close: 2,
  short: 4,
  medium: 6,
  long: 10,
  veryLong: 14,
  ranged: 24,
};

describe("threat geometry", () => {
  it("maps every reach band to a stable threat range", () => {
    for (const reachBand of REACH_BANDS) {
      expect(getThreatRangeForReachBand(reachBand)).toBe(
        EXPECTED_THREAT_RANGES[reachBand],
      );
    }
  });

  it("maps every reach band to a stable contact distance", () => {
    for (const reachBand of REACH_BANDS) {
      expect(getContactDistanceForReachBand(reachBand)).toBe(
        EXPECTED_CONTACT_DISTANCES[reachBand],
      );
    }
  });

  it("gives default unarmed loadout no threat and minimal contact distance", () => {
    const { loadout } = createThreatHarness({
      positions: [{ x: 0, y: 0 }],
      units: [{ unitId: 10, factionId: 1, memberEntityIds: [0] }],
      loadouts: [],
    });

    expect(getUnitThreatSummary(loadout, 10)).toEqual({
      unitId: 10,
      weaponReachBand: "none",
      threatRange: 0,
      contactDistance: 1,
    });
  });

  it("keeps long and veryLong ranges above short ranges", () => {
    expect(getThreatRangeForReachBand("long")).toBeGreaterThan(
      getThreatRangeForReachBand("short"),
    );
    expect(getThreatRangeForReachBand("veryLong")).toBeGreaterThan(
      getThreatRangeForReachBand("short"),
    );
    expect(getContactDistanceForReachBand("long")).toBeGreaterThan(
      getContactDistanceForReachBand("short"),
    );
    expect(getContactDistanceForReachBand("veryLong")).toBeGreaterThan(
      getContactDistanceForReachBand("short"),
    );
  });

  it("uses ranged as the largest threat range", () => {
    const largestThreatRange = Math.max(
      ...REACH_BANDS.map((reachBand) => getThreatRangeForReachBand(reachBand)),
    );

    expect(getThreatRangeForReachBand("ranged")).toBe(largestThreatRange);
  });

  it("reports same-faction contact as allied", () => {
    const { world, identity, loadout } = createBasicHarness();

    expect(
      computeUnitThreatContact(world, identity, loadout, 10, 20).relationship,
    ).toBe("allied");
  });

  it("reports different-faction contact as hostile", () => {
    const { world, identity, loadout } = createBasicHarness();

    expect(
      computeUnitThreatContact(world, identity, loadout, 10, 30).relationship,
    ).toBe("hostile");
  });

  it("marks a hostile in front and within range as inThreatRange", () => {
    const { world, identity, loadout } = createThreatHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 8, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
      loadouts: [{ unitId: 10, weaponReachBand: "short" }],
    });

    expect(computeUnitThreatContact(world, identity, loadout, 10, 20))
      .toMatchObject({
        relationship: "hostile",
        distance: 8,
        forwardDistance: 8,
        lateralDistance: 0,
        inFront: true,
        inThreatRange: true,
        inContactRange: false,
      });
  });

  it("does not mark a hostile outside range as inThreatRange", () => {
    const { world, identity, loadout } = createThreatHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 9, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
      loadouts: [{ unitId: 10, weaponReachBand: "short" }],
    });

    expect(
      computeUnitThreatContact(world, identity, loadout, 10, 20).inThreatRange,
    ).toBe(false);
  });

  it("marks a hostile within contact distance as inContactRange", () => {
    const { world, identity, loadout } = createThreatHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
      loadouts: [{ unitId: 10, weaponReachBand: "short" }],
    });

    expect(
      computeUnitThreatContact(world, identity, loadout, 10, 20).inContactRange,
    ).toBe(true);
  });

  it("does not mark a target behind the source as inFront", () => {
    const { world, identity, loadout } = createThreatHarness({
      positions: [
        { x: 0, y: 0 },
        { x: -4, y: 0 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
      loadouts: [{ unitId: 10, weaponReachBand: "short" }],
    });
    const contact = computeUnitThreatContact(world, identity, loadout, 10, 20);

    expect(contact.forwardDistance).toBe(-4);
    expect(contact.inFront).toBe(false);
    expect(contact.inThreatRange).toBe(false);
  });

  it("computes lateral distance deterministically", () => {
    const { world, identity, loadout } = createThreatHarness({
      positions: [
        { x: 0, y: 0 },
        { x: 6, y: 3 },
      ],
      units: [
        { unitId: 10, factionId: 1, memberEntityIds: [0] },
        { unitId: 20, factionId: 2, memberEntityIds: [1] },
      ],
      loadouts: [{ unitId: 10, weaponReachBand: "short" }],
    });
    const contact = computeUnitThreatContact(world, identity, loadout, 10, 20);

    expect(contact.forwardDistance).toBe(6);
    expect(contact.lateralDistance).toBe(3);
    expect(contact.distance).toBeCloseTo(Math.hypot(6, 3));
  });

  it("collects only hostile contacts", () => {
    const { world, identity, loadout } = createCollectionHarness();
    const contacts = collectHostileThreatContacts(
      world,
      identity,
      loadout,
      10,
      [],
    );

    expect(contacts.map((contact) => contact.targetUnitId)).toEqual([30, 40]);
    expect(contacts.every((contact) => contact.relationship === "hostile"))
      .toBe(true);
  });

  it("clears and reuses the provided output array", () => {
    const { world, identity, loadout } = createCollectionHarness();
    const out: UnitThreatContact[] = [
      computeUnitThreatContact(world, identity, loadout, 10, 20),
    ];

    const returned = collectHostileThreatContacts(
      world,
      identity,
      loadout,
      10,
      out,
    );

    expect(returned).toBe(out);
    expect(out.map((contact) => contact.targetUnitId)).toEqual([30, 40]);
  });

  it("throws for unknown unit IDs", () => {
    const { world, identity, loadout } = createBasicHarness();

    expect(() => getUnitThreatSummary(loadout, 99)).toThrow(RangeError);
    expect(() =>
      computeUnitThreatContact(world, identity, loadout, 99, 20),
    ).toThrow(RangeError);
    expect(() =>
      computeUnitThreatContact(world, identity, loadout, 10, 99),
    ).toThrow(RangeError);
    expect(() =>
      collectHostileThreatContacts(world, identity, loadout, 99, []),
    ).toThrow(RangeError);
  });

  it("repeats identical summaries and contacts from identical inputs", () => {
    const run = () => {
      const { world, identity, loadout } = createCollectionHarness();
      return {
        sourceSummary: getUnitThreatSummary(loadout, 10),
        directContact: computeUnitThreatContact(
          world,
          identity,
          loadout,
          10,
          30,
        ),
        collectedContacts: collectHostileThreatContacts(
          world,
          identity,
          loadout,
          10,
          [],
        ),
      };
    };

    expect(run()).toEqual(run());
  });

  it("does not mutate world, identity, or loadout state", () => {
    const { world, identity, loadout } = createCollectionHarness();
    const before = snapshotInputs(world, identity, loadout);
    const out: UnitThreatContact[] = [];

    computeUnitThreatContact(world, identity, loadout, 10, 30);
    collectHostileThreatContacts(world, identity, loadout, 10, out);

    expect(snapshotInputs(world, identity, loadout)).toEqual(before);
  });
});

interface ThreatHarnessUnit {
  readonly unitId: number;
  readonly factionId: number;
  readonly memberEntityIds: readonly number[];
}

interface ThreatHarnessLoadout {
  readonly unitId: number;
  readonly weaponReachBand: WeaponReachBand;
}

interface ThreatHarnessConfig {
  readonly positions: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly units: readonly ThreatHarnessUnit[];
  readonly loadouts: readonly ThreatHarnessLoadout[];
}

function createBasicHarness() {
  return createThreatHarness({
    positions: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 8, y: 0 },
    ],
    units: [
      { unitId: 10, factionId: 1, memberEntityIds: [0] },
      { unitId: 20, factionId: 1, memberEntityIds: [1] },
      { unitId: 30, factionId: 2, memberEntityIds: [2] },
    ],
    loadouts: [{ unitId: 10, weaponReachBand: "short" }],
  });
}

function createCollectionHarness() {
  return createThreatHarness({
    positions: [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 6, y: 0 },
      { x: 12, y: 4 },
    ],
    units: [
      { unitId: 10, factionId: 1, memberEntityIds: [0] },
      { unitId: 20, factionId: 1, memberEntityIds: [1] },
      { unitId: 30, factionId: 2, memberEntityIds: [2] },
      { unitId: 40, factionId: 3, memberEntityIds: [3] },
    ],
    loadouts: [{ unitId: 10, weaponReachBand: "long" }],
  });
}

function createThreatHarness(config: ThreatHarnessConfig): {
  readonly world: WorldState;
  readonly identity: UnitIdentityStore;
  readonly loadout: UnitLoadoutStore;
} {
  const entityCount = config.positions.length;
  const world: WorldState = {
    entityCount,
    bounds: { width: 1_000, height: 1_000 },
    ids: Uint32Array.from({ length: entityCount }, (_, index) => index),
    positionsX: Int32Array.from(config.positions.map((position) => position.x)),
    positionsY: Int32Array.from(config.positions.map((position) => position.y)),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
  const identity = createUnitIdentityStore({
    entityCount,
    units: config.units,
  });
  const loadout = createUnitLoadoutStore(identity, {
    entityCount,
    units: config.loadouts,
  });

  return { world, identity, loadout };
}

function snapshotInputs(
  world: WorldState,
  identity: UnitIdentityStore,
  loadout: UnitLoadoutStore,
): readonly unknown[] {
  const unitIds = getUnitIds(identity);
  return [
    {
      entityCount: world.entityCount,
      ids: Array.from(world.ids),
      positionsX: Array.from(world.positionsX),
      positionsY: Array.from(world.positionsY),
      velocitiesX: Array.from(world.velocitiesX),
      velocitiesY: Array.from(world.velocitiesY),
    },
    unitIds.map((unitId) => ({
      unitId,
      factionId: getFactionIdForUnit(identity, unitId),
      members: Array.from(getUnitMembers(identity, unitId)),
    })),
    unitIds.map((unitId) => getUnitLoadoutSummary(loadout, unitId)),
  ];
}
