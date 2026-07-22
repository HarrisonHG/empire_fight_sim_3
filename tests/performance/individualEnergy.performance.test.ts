import { describe, expect, it } from "vitest";

import {
  createIndividualEnergyStore,
  createTrustedIndividualEnergyProfileStore,
  getIndividualEnergyBand,
  getIndividualEnergyInspection,
  setIndividualCurrentEnergyForTrustedSetup,
} from "../../src/sim/individualEnergy";
import {
  applyIndividualEnergyActivityOneTick,
  beginIndividualEnergyActivityObservation,
  classifyIndividualEnergyActivityOneTick,
  createIndividualEnergyActivityStore,
  getIndividualEnergyActivityInspection,
  observeIndividualEnergyMovementAuthority,
} from "../../src/sim/individualEnergyActivity";
import {
  createIndividualEnergyCapabilityStore,
  getIndividualEnergyCapabilityInspection,
  projectIndividualEnergyCapabilitiesOneTick,
} from "../../src/sim/individualEnergyCapability";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualExecutionActionBuffers,
  createIndividualExecutionActionStore,
} from "../../src/sim/individualExecutionAction";
import {
  createIndividualTreatmentActionBuffers,
  createIndividualTreatmentActionStore,
} from "../../src/sim/individualTreatmentAction";
import type { WorldState } from "../../src/sim/types";

describe("individual energy structural performance", () => {
  for (const entityCount of [100, 500, 1_000, 2_000]) {
    it(`creates, derives and inspects ${entityCount} entity-indexed records`, () => {
      const configs = Array.from({ length: entityCount }, (_, index) => {
        const entityId = entityCount - index - 1;
        const maximumEnergy = 8_000 + entityId % 5 * 1_000;
        return {
          entityId,
          maximumEnergy,
          startingEnergy: maximumEnergy - entityId % 4 * 1_000,
          safeRestRecoveryPerTick: entityId % 9,
        };
      });

      const profileStart = performance.now();
      const profiles = createTrustedIndividualEnergyProfileStore({
        entityCount,
        profiles: configs,
      });
      const profileCreationMilliseconds = performance.now() - profileStart;

      const storeStart = performance.now();
      const energy = createIndividualEnergyStore(profiles);
      const storeCreationMilliseconds = performance.now() - storeStart;

      const bandStart = performance.now();
      const bandCounts = { fresh: 0, working: 0, winded: 0, spent: 0 };
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const maximumEnergy = 8_000 + entityId % 5 * 1_000;
        const bandCase = entityId % 4;
        const currentEnergy = bandCase === 0
          ? maximumEnergy
          : bandCase === 1
            ? Math.floor(maximumEnergy * 45 / 100)
            : bandCase === 2
              ? Math.floor(maximumEnergy * 20 / 100)
              : Math.floor(maximumEnergy * 5 / 100);
        setIndividualCurrentEnergyForTrustedSetup(
          energy,
          entityId,
          currentEnergy,
          1,
        );
        bandCounts[getIndividualEnergyBand(energy, entityId)] += 1;
      }
      const bandDerivationMilliseconds = performance.now() - bandStart;

      const inspectionStart = performance.now();
      let inspectionFieldCount = 0;
      let inspectionChecksum = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const inspection = getIndividualEnergyInspection(
          profiles,
          energy,
          entityId,
        );
        inspectionFieldCount = Object.keys(inspection).length;
        inspectionChecksum += inspection.currentEnergy +
          inspection.minimumEnergyReached + inspection.ratioFixedPoint;
      }
      const inspectionMilliseconds = performance.now() - inspectionStart;

      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const capabilityStore = createIndividualEnergyCapabilityStore(
        entityCount, energy, lifecycle, presence,
      );
      const capabilityStart = performance.now();
      projectIndividualEnergyCapabilitiesOneTick(
        capabilityStore,
        energy,
        lifecycle,
        presence,
        2,
      );
      let capabilityChecksum = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const capability = getIndividualEnergyCapabilityInspection(
          capabilityStore,
          entityId,
        );
        capabilityChecksum += capability.sourceEnergy +
          (capability.canInitiateOrdinarySprintOrCharge ? 1 : 0);
      }
      const capabilityMilliseconds = performance.now() - capabilityStart;

      expect(profiles.entityCount).toBe(entityCount);
      expect(energy.entityCount).toBe(entityCount);
      expect(Object.values(bandCounts).reduce((sum, count) => sum + count, 0))
        .toBe(entityCount);
      expect(inspectionFieldCount).toBeLessThanOrEqual(16);
      expect(Number.isSafeInteger(inspectionChecksum)).toBe(true);
      expect(Number.isSafeInteger(capabilityChecksum)).toBe(true);
      expect(Object.keys(capabilityStore)).toEqual(["entityCount"]);
      expect(Object.keys(profiles)).toEqual(["entityCount"]);
      expect(Object.keys(energy)).toEqual(["entityCount"]);

      console.info("Individual energy structural report", JSON.stringify({
        entityCount,
        profileCreationMilliseconds,
        storeCreationMilliseconds,
        bandDerivationMilliseconds,
        inspectionMilliseconds,
        capabilityMilliseconds,
        bandCounts,
        inspectionFieldCount,
        storageShape: "entity-indexed typed arrays behind opaque stores",
        timingPolicy: "Structural assertions only; no machine timing threshold.",
      }, null, 2));
    });
  }
});

describe("individual energy activity structural performance", () => {
  for (const entityCount of [100, 500, 1_000, 2_000]) {
    it(`applies idle, mixed movement and dense impulses for ${entityCount} entities`, () => {
      const world: WorldState = {
        entityCount,
        bounds: { width: 10_000, height: 10_000 },
        ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
        positionsX: new Int32Array(entityCount),
        positionsY: new Int32Array(entityCount),
        velocitiesX: new Int32Array(entityCount),
        velocitiesY: new Int32Array(entityCount),
      };
      const creationStart = performance.now();
      const activity = createIndividualEnergyActivityStore(entityCount);
      const profiles = createTrustedIndividualEnergyProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          maximumEnergy: 10_000,
          startingEnergy: 9_000,
          safeRestRecoveryPerTick: 5,
        })),
      });
      const energy = createIndividualEnergyStore(profiles);
      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const treatments = createIndividualTreatmentActionStore(entityCount);
      const executions = createIndividualExecutionActionStore(entityCount);
      const treatmentBuffers = createIndividualTreatmentActionBuffers();
      const executionBuffers = createIndividualExecutionActionBuffers();
      const creationMilliseconds = performance.now() - creationStart;

      const attackAttempts = Array.from({ length: entityCount },
        (_, attackerEntityId) => ({
          attackerEntityId,
          targetEntityId: (attackerEntityId + 1) % entityCount,
          outcome: "attempted",
        } as unknown as IndividualMeleeAttackAttemptRecord));
      const defenceAttempts = Array.from({ length: entityCount * 2 },
        (_, index) => ({
          attackerEntityId: (index + 1) % entityCount,
          defenderEntityId: Math.floor(index / 2),
          outcome: index % 2 === 0 ? "parried" : "landed",
        } as unknown as IndividualMeleeDefenceRecord));
      const baseDependencies = {
        world,
        lifecycle,
        presence,
        treatments,
        treatmentResult: {
          startedRecords: treatmentBuffers.startedRecords,
          interruptedRecords: treatmentBuffers.interruptedRecords,
          completedRecords: treatmentBuffers.completedRecords,
          reassessmentRequests: treatmentBuffers.reassessmentRequests,
          activeActionCount: 0,
          progressedActionCount: 0,
        },
        executions,
        executionResult: {
          startedRecords: executionBuffers.startedRecords,
          interruptedRecords: executionBuffers.interruptedRecords,
          completedRecords: executionBuffers.completedRecords,
          rejectedIntentRecords: executionBuffers.rejectedIntentRecords,
          terminalTransitions: executionBuffers.terminalTransitions,
          activeActionCount: 0,
          pendingIntentCount: 0,
          progressedActionCount: 0,
        },
        isAlert: () => false,
      };

      const classificationStart = performance.now();
      beginIndividualEnergyActivityObservation(activity, world, 0);
      const returned = classifyIndividualEnergyActivityOneTick(activity, {
        ...baseDependencies,
        attackAttempts: [],
        defenceAttempts: [],
        tick: 0,
      });
      applyIndividualEnergyActivityOneTick(activity, profiles, energy, 0);
      let idleRecoveryApplied = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        idleRecoveryApplied += getIndividualEnergyActivityInspection(
          activity,
          entityId,
        ).recoveryApplied;
      }

      beginIndividualEnergyActivityObservation(activity, world, 1);
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        world.positionsX[entityId] = entityId % 4;
      }
      observeIndividualEnergyMovementAuthority(activity, world, (entityId) => ({
        source: "ordinaryMovement",
        requestedGait: (["stationary", "walking", "jogging", "sprinting"] as const)[
          entityId % 4
        ]!,
      }));
      classifyIndividualEnergyActivityOneTick(activity, {
        ...baseDependencies,
        attackAttempts: [],
        defenceAttempts: [],
        tick: 1,
      });
      applyIndividualEnergyActivityOneTick(activity, profiles, energy, 1);
      let mixedMovementRequested = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        mixedMovementRequested += getIndividualEnergyActivityInspection(
          activity,
          entityId,
        ).movementExpenditureRequested;
      }

      beginIndividualEnergyActivityObservation(activity, world, 2);
      classifyIndividualEnergyActivityOneTick(activity, {
        ...baseDependencies,
        attackAttempts,
        defenceAttempts,
        tick: 2,
      });
      applyIndividualEnergyActivityOneTick(activity, profiles, energy, 2);
      const classificationMilliseconds = performance.now() - classificationStart;

      const inspectionStart = performance.now();
      let fieldCount = 0;
      let denseImpulseRequested = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const inspection = getIndividualEnergyActivityInspection(activity, entityId);
        fieldCount = Object.keys(inspection).length;
        denseImpulseRequested += inspection.attackExpenditureRequested +
          inspection.defenceExpenditureRequested;
      }
      const inspectionMilliseconds = performance.now() - inspectionStart;

      expect(returned).toBe(activity);
      expect(idleRecoveryApplied).toBe(entityCount * 5);
      expect(mixedMovementRequested).toBeGreaterThan(0);
      expect(denseImpulseRequested).toBe(entityCount * 180);
      expect(fieldCount).toBeLessThanOrEqual(32);
      expect(Object.keys(activity)).toEqual(["entityCount"]);

      console.info("Individual energy activity structural report", JSON.stringify({
        entityCount,
        creationMilliseconds,
        classificationMilliseconds,
        inspectionMilliseconds,
        fieldCount,
        storageShape: "reused entity-indexed typed arrays",
        idleRecoveryApplied,
        mixedMovementRequested,
        denseImpulseRequested,
        timingPolicy: "Structural assertions only; no machine timing threshold.",
      }, null, 2));
    });
  }
});
