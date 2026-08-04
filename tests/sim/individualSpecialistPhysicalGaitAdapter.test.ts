import { describe, expect, it } from "vitest";

import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  beginIndividualEnergyActivityObservation,
  createIndividualEnergyActivityStore,
  createIndividualSpecialistPhysicalGaitAdapter,
  getIndividualEnergyActivityInspection,
} from "../../src/sim/individualEnergyActivity";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
} from "../../src/sim/individualEnergy";
import {
  createIndividualEnergyCapabilityStore,
  projectIndividualEnergyCapabilitiesOneTick,
} from "../../src/sim/individualEnergyCapability";
import type { WorldState } from "../../src/sim/types";

describe("current-tick specialist physical-gait adapter", () => {
  it("projects effective gait without changing the retained actual movement evidence", () => {
    const fresh = fixture(100);
    const spent = fixture(0);

    for (const harness of [fresh, spent]) {
      beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
      projectIndividualEnergyCapabilitiesOneTick(
        harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
      );
      harness.adapter.acceptCapabilityProjection(7);
      harness.world.positionsX[0] = 3;
      harness.adapter.recordActiveSpecialistMovement(
        0, "medicalApproach", "sprinting", "sprinting", true,
      );
    }

    expect(getIndividualEnergyActivityInspection(fresh.activity, 0)).toMatchObject({
      requestedPhysicalGait: "sprinting",
      effectivePhysicalGait: "sprinting",
      actualPhysicalGait: "sprinting",
      gaitReducedByCapability: false,
      gaitProducedDisplacement: true,
    });
    expect(getIndividualEnergyActivityInspection(spent.activity, 0)).toMatchObject({
      requestedPhysicalGait: "sprinting",
      effectivePhysicalGait: "walking",
      actualPhysicalGait: "sprinting",
      gaitReducedByCapability: true,
      gaitProducedDisplacement: true,
    });
    expect(spent.world.positionsX[0]).toBe(fresh.world.positionsX[0]);
  });

  it.each([
    ["null", 7, null, /null/],
    ["stale", 8, 7, /match tick 8/],
    ["future", 6, 7, /match tick 6/],
  ] as const)("rejects %s capability use before evidence mutation", (
    _name, acceptedTick, projectedTick, expected,
  ) => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(
      harness.activity, harness.world, acceptedTick,
    );
    if (projectedTick !== null) {
      projectIndividualEnergyCapabilitiesOneTick(
        harness.capability,
        harness.energy,
        harness.lifecycle,
        harness.presence,
        projectedTick,
      );
    }
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.acceptCapabilityProjection(acceptedTick))
      .toThrow(expected);
    expect(harness.adapter.acceptedProjectionTick).toBeNull();
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
  });

  it("rejects mismatched entity counts before accepting or recording evidence", () => {
    const capabilityHarness = fixture(100);
    projectIndividualEnergyCapabilitiesOneTick(
      capabilityHarness.capability,
      capabilityHarness.energy,
      capabilityHarness.lifecycle,
      capabilityHarness.presence,
      7,
    );
    const activity = createIndividualEnergyActivityStore(2);
    const adapter = createIndividualSpecialistPhysicalGaitAdapter(
      activity, capabilityHarness.capability,
    );
    beginIndividualEnergyActivityObservation(activity, worldFor(2), 7);
    const before = getIndividualEnergyActivityInspection(activity, 0);

    expect(() => adapter.acceptCapabilityProjection(7)).toThrow(/entityCount/);
    expect(adapter.acceptedProjectionTick).toBeNull();
    expect(getIndividualEnergyActivityInspection(activity, 0)).toEqual(before);
  });

  it("rejects duplicate and backwards acceptance without replacing prior evidence", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    harness.adapter.acceptCapabilityProjection(7);
    harness.adapter.recordActiveSpecialistMovement(
      0, "traumaWithdrawal", "jogging", "jogging", true,
    );
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.acceptCapabilityProjection(7))
      .toThrow(/already accepted/);
    expect(() => harness.adapter.acceptCapabilityProjection(6))
      .toThrow(/cannot move backwards/);
    expect(harness.adapter.acceptedProjectionTick).toBe(7);
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
  });
});

function fixture(startingEnergy: number) {
  const profiles = createTrustedIndividualEnergyProfileStore({
    entityCount: 1,
    profiles: [{ entityId: 0, maximumEnergy: 100, startingEnergy }],
  });
  const energy = createIndividualEnergyStore(profiles);
  const lifecycle = createIndividualCasualtyLifecycleStore(1);
  const presence = createIndividualPlayerPresenceStore(1);
  const capability = createIndividualEnergyCapabilityStore(
    1, energy, lifecycle, presence,
  );
  const activity = createIndividualEnergyActivityStore(1);
  return {
    energy,
    lifecycle,
    presence,
    capability,
    activity,
    adapter: createIndividualSpecialistPhysicalGaitAdapter(activity, capability),
    world: worldFor(1),
  };
}

function worldFor(entityCount: number): WorldState {
  return {
    entityCount,
    bounds: { width: 100, height: 100 },
    ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
    positionsX: new Int32Array(entityCount),
    positionsY: new Int32Array(entityCount),
    velocitiesX: new Int32Array(entityCount),
    velocitiesY: new Int32Array(entityCount),
  };
}
