import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  spendIndividualEnergy,
} from "../../src/sim/individualEnergy";
import {
  assertIndividualEnergyCapabilityProjectionTick,
  createIndividualEnergyCapabilityStore,
  getIndividualEnergyCapabilityInspection,
  projectIndividualEnergyCapabilitiesOneTick,
} from "../../src/sim/individualEnergyCapability";
import type { WorldState } from "../../src/sim/types";

describe("individual tick-start energy capability", () => {
  it("projects fresh, working, winded and spent gait limits", () => {
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 4,
      profiles: [
        { entityId: 3, maximumEnergy: 100, startingEnergy: 5 },
        { entityId: 1, maximumEnergy: 100, startingEnergy: 50 },
        { entityId: 0, maximumEnergy: 100, startingEnergy: 100 },
        { entityId: 2, maximumEnergy: 100, startingEnergy: 20 },
      ],
    });
    const energy = createIndividualEnergyStore(profiles);
    const lifecycle = createIndividualCasualtyLifecycleStore(4);
    const presence = createIndividualPlayerPresenceStore(4);
    const capability = createIndividualEnergyCapabilityStore(4);

    projectIndividualEnergyCapabilitiesOneTick(
      capability, energy, lifecycle, presence, 0,
    );
    expect(getIndividualEnergyCapabilityInspection(capability, 0)).toEqual({
      projectionTick: 0,
      sourceEnergy: 100,
      sourceEnergyBand: "fresh",
      maximumOrdinaryGait: "sprinting",
      maximumRoutingGait: "sprinting",
      canInitiateOrdinarySprintOrCharge: true,
      minimumSafeWalkAvailable: true,
    });
    expect(getIndividualEnergyCapabilityInspection(capability, 1))
      .toMatchObject({
        sourceEnergyBand: "working",
        maximumOrdinaryGait: "sprinting",
        canInitiateOrdinarySprintOrCharge: true,
      });
    expect(getIndividualEnergyCapabilityInspection(capability, 2))
      .toMatchObject({
        sourceEnergyBand: "winded",
        maximumOrdinaryGait: "jogging",
        maximumRoutingGait: "jogging",
        canInitiateOrdinarySprintOrCharge: false,
      });
    expect(getIndividualEnergyCapabilityInspection(capability, 3))
      .toMatchObject({
        sourceEnergyBand: "spent",
        maximumOrdinaryGait: "walking",
        maximumRoutingGait: "walking",
        canInitiateOrdinarySprintOrCharge: false,
        minimumSafeWalkAvailable: true,
      });
  });

  it("does not feed same-tick expenditure back into an existing projection", () => {
    const fixture = capabilityFixture(100);
    projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      7,
    );
    spendIndividualEnergy(fixture.energy, 0, 95, 7);
    expect(getIndividualEnergyCapabilityInspection(fixture.capability, 0))
      .toMatchObject({
        projectionTick: 7,
        sourceEnergy: 100,
        sourceEnergyBand: "fresh",
        maximumOrdinaryGait: "sprinting",
      });

    projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      8,
    );
    expect(getIndividualEnergyCapabilityInspection(fixture.capability, 0))
      .toMatchObject({
        projectionTick: 8,
        sourceEnergy: 5,
        sourceEnergyBand: "spent",
        maximumOrdinaryGait: "walking",
      });
  });

  it("projects non-mobile lifecycle and presence as stationary", () => {
    const fixture = capabilityFixture(100);
    const procedures = createIndividualCasualtyProcedureProfileStore({
      entityCount: 1,
      profiles: [{
        entityId: 0,
        procedureKind: "citizen",
        deathCountPolicy: { kind: "normalFortitude" },
      }],
    });
    const world = worldFor(1);
    applyIndividualZeroHitLifecycleTransitions(
      fixture.lifecycle,
      fixture.presence,
      procedures,
      world,
      [{ entityId: 0, attackerEntityId: 0, previousHits: 1 }],
      3,
    );
    projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      3,
    );
    expect(getIndividualEnergyCapabilityInspection(fixture.capability, 0))
      .toMatchObject({
        sourceEnergy: 100,
        maximumOrdinaryGait: "stationary",
        maximumRoutingGait: "stationary",
        canInitiateOrdinarySprintOrCharge: false,
        minimumSafeWalkAvailable: false,
      });
  });

  it("rejects duplicate, backwards and stale projection use", () => {
    const fixture = capabilityFixture(100);
    expect(() => assertIndividualEnergyCapabilityProjectionTick(
      fixture.capability, 0,
    )).toThrow(/stale/);
    projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      2,
    );
    assertIndividualEnergyCapabilityProjectionTick(fixture.capability, 2);
    expect(() => projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      2,
    )).toThrow(/already projected/);
    expect(() => projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      1,
    )).toThrow(/cannot move backwards/);
  });
});

function capabilityFixture(startingEnergy: number) {
  const profiles = createTrustedIndividualEnergyProfileStore({
    entityCount: 1,
    profiles: [{ entityId: 0, maximumEnergy: 100, startingEnergy }],
  });
  return {
    energy: createIndividualEnergyStore(profiles),
    lifecycle: createIndividualCasualtyLifecycleStore(1),
    presence: createIndividualPlayerPresenceStore(1),
    capability: createIndividualEnergyCapabilityStore(1),
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
