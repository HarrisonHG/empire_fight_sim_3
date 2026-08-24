import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  transitionIndividualDyingToTerminal,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import { createIndividualCombatProfileStore } from "../../src/sim/individualCombatProfile";
import {
  beginIndividualEnergyActivityObservation,
  createIndividualEnergyActivityStore,
  createIndividualSpecialistPhysicalGaitAdapter,
  getIndividualEnergyActivityInspection,
} from "../../src/sim/individualEnergyActivity";
import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  setIndividualCurrentEnergyForTrustedSetup,
} from "../../src/sim/individualEnergy";
import {
  createIndividualEnergyCapabilityStore,
  projectIndividualEnergyCapabilitiesOneTick,
} from "../../src/sim/individualEnergyCapability";
import {
  createIndividualEnergyExertionModifierStore,
  projectIndividualEnergyExertionModifiersOneTick,
} from "../../src/sim/individualEnergyExertionModifier";
import { createIndividualGlobalHitStore } from "../../src/sim/individualGlobalHits";
import type { WorldState } from "../../src/sim/types";

describe("current-tick specialist physical-gait adapter", () => {
  it.each([
    [100, "sprinting"],
    [90, "sprinting"],
    [89, "jogging"],
    [80, "jogging"],
    [50, "jogging"],
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
      projectIndividualEnergyExertionModifiersOneTick(
        harness.modifiers, harness.combatProfiles, harness.hits, 7,
      );
      harness.adapter.acceptCapabilityProjection(7);
      expect(harness.adapter.preflightActiveSpecialistMovement(
        0, "medicalApproach", "sprinting", 1, 42,
      )).toBe(expectedEffectiveGait);
      harness.world.positionsX[0] = 3;
      harness.adapter.completeActiveSpecialistMovement(
        0,
        "medicalApproach",
        "sprinting",
        expectedEffectiveGait,
        true,
      );
      expect(getIndividualEnergyActivityInspection(harness.activity, 0))
        .toMatchObject({
          requestedPhysicalGait: "sprinting",
          effectivePhysicalGait: expectedEffectiveGait,
          actualPhysicalGait: expectedEffectiveGait,
          gaitReducedByCapability: expectedEffectiveGait !== "sprinting",
          gaitProducedDisplacement: true,
        });
    },
  );

  it("requires a full-energy voluntary specialist sprint to fit its reserve budget", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);

    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "sprinting", 5, 42,
    )).toBe("jogging");
  });

  it("continues one affordable sprint episode and rearms only at ninety percent", () => {
    const run = () => {
      const harness = fixture(90);
      const gaits: string[] = [];
      const step = (
        tick: number,
        energy: number,
        requiredSprintTicks: number,
        episodeId = 42,
      ) => {
        setIndividualCurrentEnergyForTrustedSetup(
          harness.energy,
          0,
          energy,
          tick,
        );
        beginIndividualEnergyActivityObservation(
          harness.activity,
          harness.world,
          tick,
        );
        projectIndividualEnergyCapabilitiesOneTick(
          harness.capability,
          harness.energy,
          harness.lifecycle,
          harness.presence,
          tick,
        );
        projectModifiers(harness, tick);
        harness.adapter.acceptCapabilityProjection(tick);
        const gait = harness.adapter.preflightActiveSpecialistMovement(
          0,
          "medicalApproach",
          "sprinting",
          requiredSprintTicks,
          episodeId,
        );
        harness.world.positionsX[0] = harness.world.positionsX[0]! + 1;
        harness.adapter.completeActiveSpecialistMovement(
          0,
          "medicalApproach",
          "sprinting",
          gait,
          true,
        );
        gaits.push(gait);
      };

      step(7, 90, 3);
      step(8, 89, 3);
      step(9, 89, 4);
      step(10, 89, 1);
      step(11, 90, 1);
      return gaits;
    };

    expect(run()).toEqual([
      "sprinting",
      "sprinting",
      "jogging",
      "jogging",
      "sprinting",
    ]);
    expect(run()).toEqual(run());
  });

  it("retains requested/effective/actual evidence for a blocked attempt", () => {
    const harness = fixture(5);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);
    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "traumaWithdrawal", "jogging", 0, -1,
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

  it("records a non-promoting final drag-group gait for every helper", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);
    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "activeDragHelper", "sprinting", 1, 42,
    )).toBe("sprinting");
    harness.adapter.constrainPreflightedActiveDragHelperGait(
      0, "sprinting", "walking",
    );
    harness.world.positionsX[0] = 1;

    harness.adapter.completeActiveSpecialistMovement(
      0, "activeDragHelper", "sprinting", "walking", true,
    );

    expect(getIndividualEnergyActivityInspection(harness.activity, 0))
      .toMatchObject({
        requestedPhysicalGait: "sprinting",
        effectivePhysicalGait: "walking",
        actualPhysicalGait: "walking",
        gaitReducedByCapability: true,
        gaitProducedDisplacement: true,
      });
  });

  it("rejects a drag-group constraint that promotes personal capability", () => {
    const harness = fixture(5);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);
    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "activeDragHelper", "sprinting", 1, 42,
    )).toBe("walking");
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.constrainPreflightedActiveDragHelperGait(
      0, "sprinting", "jogging",
    )).toThrow(/must not promote personal capability/);
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
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
      projectModifiers(harness, 7);
      harness.adapter.acceptCapabilityProjection(7);

      expect(harness.adapter.preflightActiveSpecialistMovement(
        0, "casualtyGathering", "sprinting", 1, 42,
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
    projectModifiers(harness, acceptedTick);
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
      activity,
      capabilityHarness.capability,
      capabilityHarness.energy,
      capabilityHarness.modifiers,
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
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);
    harness.adapter.preflightActiveSpecialistMovement(
      0, "traumaWithdrawal", "jogging", 0, -1,
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
    projectModifiers(stale, 7);
    stale.adapter.acceptCapabilityProjection(7);
    beginIndividualEnergyActivityObservation(stale.activity, stale.world, 8);
    const staleBefore = getIndividualEnergyActivityInspection(stale.activity, 0);
    expect(() => stale.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "walking", 0, -1,
    )).toThrow(/accepted current activity tick/);
    expect(getIndividualEnergyActivityInspection(stale.activity, 0))
      .toEqual(staleBefore);

    const future = fixture(100);
    beginIndividualEnergyActivityObservation(future.activity, future.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      future.capability, future.energy, future.lifecycle, future.presence, 7,
    );
    projectModifiers(future, 7);
    future.adapter.acceptCapabilityProjection(7);
    projectIndividualEnergyCapabilitiesOneTick(
      future.capability, future.energy, future.lifecycle, future.presence, 8,
    );
    const futureBefore = getIndividualEnergyActivityInspection(future.activity, 0);
    expect(() => future.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "walking", 0, -1,
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
    projectModifiers(harness, 7);
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
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.preflightActiveSpecialistMovement(
      1, "medicalApproach", "walking", 0, -1,
    )).toThrow(/Invalid energy activity entity ID/);
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
  });

  it("rejects a duplicate preflight before replacing the pending request", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);
    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "jogging", 0, -1,
    )).toBe("jogging");
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(() => harness.adapter.preflightActiveSpecialistMovement(
      0, "traumaWithdrawal", "walking", 0, -1,
    )).toThrow(/incomplete preflight/);
    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
  });

  it("does not publish activity evidence from a successful preflight alone", () => {
    const harness = fixture(20);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);
    const before = getIndividualEnergyActivityInspection(harness.activity, 0);

    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "sprinting", 1, 42,
    )).toBe("jogging");

    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toEqual(before);
  });

  it("clears completed pending state and applies deterministic source precedence", () => {
    const harness = fixture(100);
    beginIndividualEnergyActivityObservation(harness.activity, harness.world, 7);
    projectIndividualEnergyCapabilitiesOneTick(
      harness.capability, harness.energy, harness.lifecycle, harness.presence, 7,
    );
    projectModifiers(harness, 7);
    harness.adapter.acceptCapabilityProjection(7);

    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "medicalApproach", "jogging", 0, -1,
    )).toBe("jogging");
    harness.adapter.completeActiveSpecialistMovement(
      0, "medicalApproach", "jogging", "jogging", true,
    );
    expect(harness.adapter.preflightActiveSpecialistMovement(
      0, "casualtyGathering", "walking", 0, -1,
    )).toBe("walking");
    harness.adapter.completeActiveSpecialistMovement(
      0, "casualtyGathering", "walking", "walking", true,
    );

    expect(getIndividualEnergyActivityInspection(harness.activity, 0)).toMatchObject({
      physicalGaitSource: "casualtyGathering",
      requestedPhysicalGait: "walking",
      effectivePhysicalGait: "walking",
      actualPhysicalGait: "walking",
      gaitProducedDisplacement: true,
    });
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
  const combatProfiles = createIndividualCombatProfileStore({
    entityCount: 1,
    profiles: [{
      entityId: 0,
      primaryWeapon: "unarmed",
      shieldCategory: "none",
      shieldCarriedState: "none",
      armourCategory: "none",
      hasQualifyingHelmet: false,
      qualifications: {
        hasWeaponMaster: false,
        hasShield: false,
        hasMarksman: false,
        hasThrown: false,
        hasAmbidexterity: false,
        enduranceLevels: 0,
        fortitudeLevels: 0,
        hasDreadnought: false,
      },
      magicalCapabilities: {
        canUseRod: false,
        canUseStaff: false,
        canWearMageArmour: false,
        canDeliverCombatMagic: false,
      },
    }],
  });
  const hits = createIndividualGlobalHitStore(combatProfiles, { entityCount: 1 });
  const modifiers = createIndividualEnergyExertionModifierStore(1);
  return {
    energy,
    lifecycle,
    presence,
    capability,
    activity,
    combatProfiles,
    hits,
    modifiers,
    adapter: createIndividualSpecialistPhysicalGaitAdapter(
      activity, capability, energy, modifiers,
    ),
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

function projectModifiers(
  harness: ReturnType<typeof fixture>,
  tick: number,
): void {
  projectIndividualEnergyExertionModifiersOneTick(
    harness.modifiers,
    harness.combatProfiles,
    harness.hits,
    tick,
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
