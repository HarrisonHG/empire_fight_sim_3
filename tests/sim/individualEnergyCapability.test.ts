import { describe, expect, it } from "vitest";

import {
  applyIndividualTerminalPresenceTransitions,
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  getIndividualCharacterLifecycleState,
  getIndividualPlayerPresenceState,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import {
  advanceIndividualRespawnEgressOneTick,
  createIndividualRespawnEgressBuffers,
} from "../../src/sim/individualRespawnEgress";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  spendIndividualEnergy,
} from "../../src/sim/individualEnergy";
import {
  INDIVIDUAL_ATTACK_RECOVERY_PERCENT_BY_ENERGY_BAND,
  INDIVIDUAL_COMBAT_CAPABILITY_PERCENT_SCALE,
  INDIVIDUAL_COMBAT_CAPABILITY_PERCENT_STORAGE_MAX,
  INDIVIDUAL_GUARD_READINESS_RECOVERY_PERCENT_BY_ENERGY_BAND,
  INDIVIDUAL_PRESSURE_RECOVERY_PERCENT_BY_ENERGY_BAND,
  assertIndividualEnergyCapabilityProjectionTick,
  createIndividualEnergyCapabilityStore,
  getIndividualAttackRecoveryDurationPercent,
  getIndividualEnergyCapabilityInspection,
  getIndividualGuardReadinessRecoveryPercent,
  getIndividualPressureRecoveryPercent,
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
    const capability = createIndividualEnergyCapabilityStore(
      4, energy, lifecycle, presence,
    );

    expect(getIndividualEnergyCapabilityInspection(capability, 0))
      .toMatchObject({
        projectionTick: null,
        sourceEnergy: 100,
        sourceEnergyBand: "fresh",
        maximumOrdinaryGait: "sprinting",
      });

    projectIndividualEnergyCapabilitiesOneTick(
      capability, energy, lifecycle, presence, 0,
    );
    expect(getIndividualEnergyCapabilityInspection(capability, 0)).toEqual({
      projectionTick: 0,
      sourceEnergy: 100,
      sourceEnergyBand: "fresh",
      maximumOrdinaryGait: "sprinting",
      maximumRoutingGait: "sprinting",
      maximumActiveSpecialistGait: "sprinting",
      maximumRespawnEgressGait: "stationary",
      canInitiateOrdinarySprintOrCharge: true,
      minimumSafeWalkAvailable: true,
      minimumActiveSpecialistWalkAvailable: true,
      respawnEgressProcedureWalkAvailable: false,
      attackRecoveryDurationPercent: 100,
      guardReadinessRecoveryPercent: 100,
      pressureRecoveryPercent: 100,
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
        maximumActiveSpecialistGait: "jogging",
        canInitiateOrdinarySprintOrCharge: false,
      });
    expect(getIndividualEnergyCapabilityInspection(capability, 3))
      .toMatchObject({
        sourceEnergyBand: "spent",
        maximumOrdinaryGait: "walking",
        maximumRoutingGait: "walking",
        maximumActiveSpecialistGait: "walking",
        canInitiateOrdinarySprintOrCharge: false,
        minimumSafeWalkAvailable: true,
        minimumActiveSpecialistWalkAvailable: true,
      });
  });

  it("projects the exact named combat multipliers for every energy band", () => {
    expect(INDIVIDUAL_COMBAT_CAPABILITY_PERCENT_SCALE).toBe(100);
    expect(INDIVIDUAL_ATTACK_RECOVERY_PERCENT_BY_ENERGY_BAND).toEqual({
      fresh: 100, working: 120, winded: 160, spent: 220,
    });
    expect(INDIVIDUAL_GUARD_READINESS_RECOVERY_PERCENT_BY_ENERGY_BAND).toEqual({
      fresh: 100, working: 90, winded: 70, spent: 50,
    });
    expect(INDIVIDUAL_PRESSURE_RECOVERY_PERCENT_BY_ENERGY_BAND).toEqual({
      fresh: 100, working: 90, winded: 70, spent: 50,
    });
    for (const table of [
      INDIVIDUAL_ATTACK_RECOVERY_PERCENT_BY_ENERGY_BAND,
      INDIVIDUAL_GUARD_READINESS_RECOVERY_PERCENT_BY_ENERGY_BAND,
      INDIVIDUAL_PRESSURE_RECOVERY_PERCENT_BY_ENERGY_BAND,
    ]) {
      for (const value of Object.values(table)) {
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(
          INDIVIDUAL_COMBAT_CAPABILITY_PERCENT_STORAGE_MAX,
        );
        expect(new Uint16Array([value])[0]).toBe(value);
      }
    }
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: 4,
      profiles: [100, 50, 20, 0].map((startingEnergy, entityId) => ({
        entityId, maximumEnergy: 100, startingEnergy,
      })),
    });
    const energy = createIndividualEnergyStore(profiles);
    const lifecycle = createIndividualCasualtyLifecycleStore(4);
    const presence = createIndividualPlayerPresenceStore(4);
    const capability = createIndividualEnergyCapabilityStore(
      4, energy, lifecycle, presence,
    );
    projectIndividualEnergyCapabilitiesOneTick(
      capability, energy, lifecycle, presence, 4,
    );

    expect([0, 1, 2, 3].map((entityId) =>
      getIndividualAttackRecoveryDurationPercent(capability, entityId),
    )).toEqual([100, 120, 160, 220]);
    expect([0, 1, 2, 3].map((entityId) =>
      getIndividualGuardReadinessRecoveryPercent(capability, entityId),
    )).toEqual([100, 90, 70, 50]);
    expect([0, 1, 2, 3].map((entityId) =>
      getIndividualPressureRecoveryPercent(capability, entityId),
    )).toEqual([100, 90, 70, 50]);
    expect(getIndividualEnergyCapabilityInspection(capability, 3))
      .toMatchObject({
        sourceEnergy: 0,
        sourceEnergyBand: "spent",
        attackRecoveryDurationPercent: 220,
        guardReadinessRecoveryPercent: 50,
        pressureRecoveryPercent: 50,
      });
  });

  it("uses ratio boundaries and ignores absolute capacity for equal ratios", () => {
    const energies = [60, 59, 30, 29, 10, 9, 600, 6];
    const maxima = [100, 100, 100, 100, 100, 100, 1_000, 10];
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount: energies.length,
      profiles: energies.map((startingEnergy, entityId) => ({
        entityId, startingEnergy, maximumEnergy: maxima[entityId]!,
      })),
    });
    const energy = createIndividualEnergyStore(profiles);
    const lifecycle = createIndividualCasualtyLifecycleStore(energies.length);
    const presence = createIndividualPlayerPresenceStore(energies.length);
    const capability = createIndividualEnergyCapabilityStore(
      energies.length, energy, lifecycle, presence,
    );
    projectIndividualEnergyCapabilitiesOneTick(
      capability, energy, lifecycle, presence, 0,
    );

    expect(energies.map((_, entityId) =>
      getIndividualEnergyCapabilityInspection(capability, entityId)
        .sourceEnergyBand,
    )).toEqual([
      "fresh", "working", "working", "winded",
      "winded", "spent", "fresh", "fresh",
    ]);
    expect(getIndividualAttackRecoveryDurationPercent(capability, 0))
      .toBe(getIndividualAttackRecoveryDurationPercent(capability, 6));
    expect(getIndividualAttackRecoveryDurationPercent(capability, 0))
      .toBe(getIndividualAttackRecoveryDurationPercent(capability, 7));
    expect(getIndividualGuardReadinessRecoveryPercent(capability, 0))
      .toBe(getIndividualGuardReadinessRecoveryPercent(capability, 7));
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
        maximumActiveSpecialistGait: "stationary",
        maximumRespawnEgressGait: "stationary",
        canInitiateOrdinarySprintOrCharge: false,
        minimumSafeWalkAvailable: false,
        minimumActiveSpecialistWalkAvailable: false,
        respawnEgressProcedureWalkAvailable: false,
        attackRecoveryDurationPercent: 100,
        guardReadinessRecoveryPercent: 100,
      });
  });

  it("projects equal combat multipliers across lifecycle and presence states", () => {
    const entityCount = 5;
    const profiles = createTrustedIndividualEnergyProfileStore({
      entityCount,
      profiles: Array.from({ length: entityCount }, (_, entityId) => ({
        entityId, maximumEnergy: 100, startingEnergy: 20,
      })),
    });
    const energy = createIndividualEnergyStore(profiles);
    const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
    const presence = createIndividualPlayerPresenceStore({
      entityCount, worldWidth: 100, worldHeight: 100,
      procedures: Array.from({ length: entityCount }, (_, entityId) => ({
        entityId,
        procedureKind: entityId < 3 ? "citizen" as const : "barbarian" as const,
        ...(entityId < 3 ? {} : {
          respawnDestination: { x: entityId === 3 ? 10 : 0, y: 0 },
        }),
      })),
    });
    const procedures = createIndividualCasualtyProcedureProfileStore({
      entityCount,
      profiles: Array.from({ length: entityCount }, (_, entityId) => ({
        entityId,
        procedureKind: entityId < 3 ? "citizen" as const : "barbarian" as const,
        deathCountPolicy: { kind: "fixedTicks" as const, durationTicks: 1 },
      })),
    });
    const world = worldFor(entityCount);
    const down = applyIndividualZeroHitLifecycleTransitions(
      lifecycle, presence, procedures, world,
      [1, 2, 3, 4].map((entityId) => ({
        entityId, attackerEntityId: 0, previousHits: 1,
      })),
      0,
    ).transitions;
    for (const entityId of [2, 3, 4]) {
      transitionIndividualDyingToTerminal(lifecycle, entityId, 0, "execution");
    }
    applyIndividualTerminalPresenceTransitions(
      lifecycle, presence, procedures,
      down.filter((record) => record.entityId >= 2).map((record) => ({
        entityId: record.entityId,
        tick: 0,
        previousLifecycleState: "dying" as const,
        lifecycleState: "terminal" as const,
        cause: "execution" as const,
        terminalX: record.downX,
        terminalY: record.downY,
      })),
    );
    advanceIndividualRespawnEgressOneTick(
      world, lifecycle, presence, 1, createIndividualRespawnEgressBuffers(),
    );
    const capability = createIndividualEnergyCapabilityStore(
      entityCount, energy, lifecycle, presence,
    );
    projectIndividualEnergyCapabilitiesOneTick(
      capability, energy, lifecycle, presence, 2,
    );

    expect([0, 1, 2, 3, 4].map((entityId) => ({
      lifecycle: getIndividualCharacterLifecycleState(lifecycle, entityId),
      presence: getIndividualPlayerPresenceState(presence, entityId),
      attack: getIndividualAttackRecoveryDurationPercent(capability, entityId),
      guard: getIndividualGuardReadinessRecoveryPercent(capability, entityId),
    }))).toEqual([
      { lifecycle: "active", presence: "activePresence", attack: 160, guard: 70 },
      { lifecycle: "dying", presence: "downedPresence", attack: 160, guard: 70 },
      { lifecycle: "terminal", presence: "terminalAwaitingComfort", attack: 160, guard: 70 },
      { lifecycle: "terminal", presence: "respawnEgress", attack: 160, guard: 70 },
      { lifecycle: "terminal", presence: "waitingAtRespawn", attack: 160, guard: 70 },
    ]);
  });

  it("rejects duplicate, backwards and stale projection use", () => {
    const fixture = capabilityFixture(100);
    expect(() => assertIndividualEnergyCapabilityProjectionTick(
      fixture.capability, 0,
    )).toThrow(/stale/);
    expect(() => assertIndividualEnergyCapabilityProjectionTick(
      fixture.capability, 1,
    )).toThrow(/stale/);
    projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      0,
    );
    assertIndividualEnergyCapabilityProjectionTick(fixture.capability, 0);
    expect(() => projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      0,
    )).toThrow(/already projected/);
    projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      2,
    );
    expect(() => projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      fixture.lifecycle,
      fixture.presence,
      1,
    )).toThrow(/cannot move backwards/);
    expect(() => assertIndividualEnergyCapabilityProjectionTick(
      fixture.capability, 3,
    )).toThrow(/stale/);
    expect(() => getIndividualAttackRecoveryDurationPercent(
      fixture.capability, 1,
    )).toThrow(/Invalid energy capability entity ID/);
    expect(() => getIndividualGuardReadinessRecoveryPercent(
      fixture.capability, -1,
    )).toThrow(/Invalid energy capability entity ID/);
  });

  it("retains entity-count validation for combat capability projection", () => {
    const fixture = capabilityFixture(100);
    const mismatchedLifecycle = createIndividualCasualtyLifecycleStore(2);
    expect(() => projectIndividualEnergyCapabilitiesOneTick(
      fixture.capability,
      fixture.energy,
      mismatchedLifecycle,
      fixture.presence,
      0,
    )).toThrow(/match entityCount/);
  });
});

function capabilityFixture(startingEnergy: number) {
  const profiles = createTrustedIndividualEnergyProfileStore({
    entityCount: 1,
    profiles: [{ entityId: 0, maximumEnergy: 100, startingEnergy }],
  });
  const energy = createIndividualEnergyStore(profiles);
  const lifecycle = createIndividualCasualtyLifecycleStore(1);
  const presence = createIndividualPlayerPresenceStore(1);
  return {
    energy,
    lifecycle,
    presence,
    capability: createIndividualEnergyCapabilityStore(
      1, energy, lifecycle, presence,
    ),
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
