import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
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
  it.each([
    [100, "sprinting"],
    [50, "sprinting"],
    [20, "jogging"],
    [5, "walking"],
  ] as const)(
    "preflights active-specialist sprint at energy %i as %s",
    (startingEnergy, expectedEffectiveGait) => {
      const harness = fixture(startingEnergy);
      beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
      projectIndividualEnergyCapabilitiesOneTick(
        harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
      );
      harness.adapter.acceptCapabilityProjection(7);
      expect(harness.adapter.preflightActiveSpecialistMovement(
        0, "medicalApproach", "sprinting",
      )).toBe(expectedEffectiveGait);
      harness.world.positionsX[0] = 3;
      harness.adapter.completeActiveSpecialistMovement(
        0, "medicalApproach", "sprinting", "sprinting", true,
      );
      expect(getIndividualEnergyActivityInspection(harness.activity, 0))
        .toMatchObject({
          requestedPhysicalGait: "sprinting",
          effectivePhysicalGait: expectedEffectiveGait,
          actualPhysicalGait: "sprinting",
          gaitReducedByCapability: expectedEffectiveGait !== "sprinting",
          gaitProducedDisplacement: true,
        });
    },
  );

  it("retains requested/effective/actual evidence for a blocked attempt", () => {
    const harness = fixture(5);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    harness.adapter.acceptCapabilityProjection(7);
    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "traumaWithdrawal", "jogging",
    )).toBe("walking");
    harness.adapter.completeActiveSpecialistMovement(
      0, "traumaWithdrawal", "jogging", "jogging", false,
    );

    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toMatchObject({
      requestedPhysicalGait: "jogging",
      effectivePhysicalGait: "walking",
      actualPhysicalGait: "stationary",
      gaitReducedByCapability: true,
      gaitProducedDisplacement: false,
    });
  });

  it.each(["dying", "terminal"] as const)(
    "resolves an inactive %s specialist request to stationary",
    (lifecycleState) => {
      const harness = fixture(100);
      makeDying(harness);
      if (lifecycleState === "terminal") {
        transitionIndividualDyingToTerminal(
          harness.lifecycle, 0, 6, "execution",
        );
      }
      beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
      projectIndividualEnergyCapabilitiesOneTick(
        harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
      );
      harness.adapter.acceptCapabilityProjection(7);

      expect(harness.adapter.preflightActiveSpecialistMovement(
        0, "casualtyGathering", "sprinting",
      )).toBe("stationary");
      harness.adapter.completeActiveSpecialistMovement(
        0, "casualtyGathering", "sprinting", "sprinting", false,
      );
      expect(getIndividualEnergyActivityInspection(harness.activity, 0))
        .toMatchObject({
          requestedPhysicalGait: "sprinting",
          effectivePhysicalGait: "stationary",
          actualPhysicalGait: "stationary",
          gaitReducedByCapability: true,
        });
    },
  );

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
    const worldBefore = Array.from(harness.world.positionsX);

    expect(() => harness.adapter.acceptCapabilityProjection(acceptedTick))
      .toThrow(expected);
    expect(harness.adapter.acceptedProjectionTick).toBeNull();
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
    expect(Array.from(harness.world.positionsX)).toEqual(worldBefore);
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
    harness.adapter.preflightActiveSpecialistMovement(
      0, "traumaWithdrawal", "jogging",
    );
    harness.adapter.completeActiveSpecialistMovement(
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

  it("rejects stale accepted context and a later capability projection before evidence", () => {
    const stale = fixture(100);
    beginIndividualEnergyActivityObservation(stale.activity, stale.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      stale.capability, stale.energy, stale.lifecycle, stale.presence, 7,
    );
    stale.adapter.acceptCapabilityProjection(7);
    beginIndividualEnergyActivityObservation(stale.activity, stale.world, 8);
    const staleBefore = getIndividualEnergyActivityInspection(stale.activity, 0);
    expect(() => stale.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "walking",
    )).toThrow(/accepted current activity tick/);
    expect(getIndividualEnergyActivityInspection(stale.activity, 0))
      .toEqual(staleBefore);

    const future = fixture(100);
    beginIndividualEnergyActivityObservation(future.activity, future.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      future.capability, future.energy, future.lifecycle, future.presence, 7,
    );
    future.adapter.acceptCapabilityProjection(7);
    projectIndividualEnergyCapabilitiesOneTick(
      future.capability, future.energy, future.lifecycle, future.presence, 8,
    );
    const futureBefore = getIndividualEnergyActivityInspection(future.activity, 0);
    expect(() => future.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "walking",
    )).toThrow(/match accepted tick 7/);
    expect(getIndividualEnergyActivityInspection(future.activity, 0))
      .toEqual(futureBefore);
  });

  it("rejects completion without a matching preflight before activity mutation", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    harness.adapter.acceptCapabilityProjection(7);
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.completeActiveSpecialistMovement(
      0, "medicalApproach", "jogging", "jogging", true,
    )).toThrow(/matching successful preflight/);
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
  });

  it("rejects an invalid entity before preflight or activity mutation", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    harness.adapter.acceptCapabilityProjection(7);
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.preflightActiveSpecialistMovement(
      1, "medicalApproach", "walking",
    )).toThrow(/Invalid energy activity entity ID/);
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
  });

  it("rejects a duplicate preflight before replacing the pending request", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    harness.adapter.acceptCapabilityProjection(7);
    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "jogging",
    )).toBe("jogging");
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.preflightActiveSpecialistMovement(
      0, "traumaWithdrawal", "walking",
    )).toThrow(/incomplete preflight/);
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

function makeDying(harness: ReturnType<typeof fixture>): void {
  const procedures = createIndividualCasualtyProcedureProfileStore({
    entityCount: 1,
    profiles: [{
      entityId: 0,
      procedureKind: "citizen",
      deathCountPolicy: { kind: "normalFortitude" },
    }],
  });
  applyIndividualZeroHitLifecycleTransitions(
    harness.lifecycle,
    harness.presence,
    procedures,
    harness.world,
    [{ entityId: 0, attackerEntityId: 0, previousHits: 1 }],
    5,
  );
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
