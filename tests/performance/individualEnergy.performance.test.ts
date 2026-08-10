import { describe, expect, it } from "vitest";

import { CASUALTY_LIFECYCLE_VISUAL_SCENARIO } from "../../src/content/casualtyLifecycleVisualScenario";
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
  createIndividualSpecialistPhysicalGaitAdapter,
  getIndividualEnergyActivityContext,
  getIndividualEnergyActivityInspection,
  observeIndividualEnergyMovementAuthority,
} from "../../src/sim/individualEnergyActivity";
import {
  createIndividualEnergyCapabilityStore,
  getIndividualAttackRecoveryDurationPercent,
  getIndividualEnergyCapabilityInspection,
  projectIndividualEnergyCapabilitiesOneTick,
  getIndividualEnergyCapabilityProjectionTick,
  getIndividualGuardReadinessRecoveryPercent,
  getIndividualMaximumOrdinaryGait,
  getIndividualMaximumRoutingGait,
  getIndividualMinimumSafeWalkAvailable,
  getIndividualPressureRecoveryPercent,
} from "../../src/sim/individualEnergyCapability";
import { getUnitEnergySummaries } from "../../src/sim/unitEnergySummary";
import {
  physicalGaitCoordinateCeiling,
  type IndividualSpecialistMovementAuthority,
} from "../../src/sim/individualPhysicalGait";
import {
  advanceFormationOneTick,
  createFormationBehaviourStore,
  getIndividualEffectivePhysicalGait,
  type FormationEnergyGaitCapabilitySource,
  type IndividualBehaviourConfig,
  type UnitFormationConfig,
} from "../../src/sim/formationBehaviour";
import type { IndividualMeleeAttackAttemptRecord } from "../../src/sim/individualCombatAction";
import type { IndividualMeleeDefenceRecord } from "../../src/sim/individualMeleeDefence";
import {
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  getIndividualCharacterLifecycleState,
} from "../../src/sim/individualCasualtyLifecycle";
import {
  createIndividualExecutionActionBuffers,
  createIndividualExecutionActionStore,
} from "../../src/sim/individualExecutionAction";
import {
  createIndividualTreatmentActionBuffers,
  createIndividualTreatmentActionStore,
} from "../../src/sim/individualTreatmentAction";
import {
  getIndividualBurdenExertionMultiplierPercent,
  getIndividualEnergyExertionModifierInspection,
  getIndividualEnergyExertionModifierProjectionTick,
} from "../../src/sim/individualEnergyExertionModifier";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import type {
  CombatSandboxUnitScenario,
  SimulationScenario,
  WorldState,
} from "../../src/sim/types";
import {
  createUnitIdentityStore,
  getUnitIdForEntity,
} from "../../src/sim/unitIdentity";

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
      let combatCapabilityChecksum = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const capability = getIndividualEnergyCapabilityInspection(
          capabilityStore,
          entityId,
        );
        capabilityChecksum += capability.sourceEnergy +
          (capability.canInitiateOrdinarySprintOrCharge ? 1 : 0);
        combatCapabilityChecksum +=
          getIndividualAttackRecoveryDurationPercent(
            capabilityStore, entityId,
          ) + getIndividualGuardReadinessRecoveryPercent(
            capabilityStore, entityId,
          ) + getIndividualPressureRecoveryPercent(
            capabilityStore, entityId,
          );
      }
      const capabilityMilliseconds = performance.now() - capabilityStart;

      expect(profiles.entityCount).toBe(entityCount);
      expect(energy.entityCount).toBe(entityCount);
      expect(Object.values(bandCounts).reduce((sum, count) => sum + count, 0))
        .toBe(entityCount);
      expect(inspectionFieldCount).toBeLessThanOrEqual(16);
      expect(Number.isSafeInteger(inspectionChecksum)).toBe(true);
      expect(Number.isSafeInteger(capabilityChecksum)).toBe(true);
      expect(Number.isSafeInteger(combatCapabilityChecksum)).toBe(true);
      expect(combatCapabilityChecksum).toBeGreaterThan(0);
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
        combatCapabilityHotPath:
          "allocation-free primitive getters; bounded inspection excluded",
        timingPolicy: "Structural assertions only; no machine timing threshold.",
      }, null, 2));
    });
  }
});

describe("specialist gait boundary structural performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "projects a fixed representative specialist population among %i entities",
    (entityCount) => {
      const specialistCount = 12;
      const world: WorldState = {
        entityCount,
        bounds: { width: 10_000, height: 10_000 },
        ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
        positionsX: new Int32Array(entityCount),
        positionsY: new Int32Array(entityCount),
        velocitiesX: new Int32Array(entityCount),
        velocitiesY: new Int32Array(entityCount),
      };
      const profiles = createTrustedIndividualEnergyProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          maximumEnergy: 100,
          startingEnergy: [100, 50, 20, 0][entityId % 4]!,
          safeRestRecoveryPerTick: 0,
        })),
      });
      const energy = createIndividualEnergyStore(profiles);
      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const capability = createIndividualEnergyCapabilityStore(
        entityCount, energy, lifecycle, presence,
      );
      const activity = createIndividualEnergyActivityStore(entityCount);
      const adapter = createIndividualSpecialistPhysicalGaitAdapter(
        activity, capability,
      );
      const treatments = createIndividualTreatmentActionStore(entityCount);
      const executions = createIndividualExecutionActionStore(entityCount);
      const treatmentBuffers = createIndividualTreatmentActionBuffers();
      const executionBuffers = createIndividualExecutionActionBuffers();
      const authorities: readonly IndividualSpecialistMovementAuthority[] = [
        "casualtyGathering",
        "medicalApproach",
        "traumaWithdrawal",
        "activeDragHelper",
      ];

      beginIndividualEnergyActivityObservation(activity, world, 0);
      projectIndividualEnergyCapabilitiesOneTick(
        capability, energy, lifecycle, presence, 0,
      );
      adapter.acceptCapabilityProjection(0);
      for (let entityId = 0; entityId < specialistCount; entityId += 1) {
        const authority = authorities[entityId % authorities.length]!;
        const effectiveGait = adapter.preflightActiveSpecialistMovement(
          entityId, authority, "sprinting",
        );
        const ceiling = physicalGaitCoordinateCeiling(effectiveGait);
        const appliedStep = ceiling ?? 4;
        if (appliedStep > 0) world.positionsX[entityId] = appliedStep;
        adapter.completeActiveSpecialistMovement(
          entityId,
          authority,
          "sprinting",
          effectiveGait,
          appliedStep > 0,
        );
      }
      classifyIndividualEnergyActivityOneTick(activity, {
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
        attackAttempts: [],
        defenceAttempts: [],
        isAlert: () => false,
        tick: 0,
      });
      applyIndividualEnergyActivityOneTick(activity, profiles, energy, 0);

      let activeSpecialistContextCount = 0;
      for (let entityId = 0; entityId < specialistCount; entityId += 1) {
        if (getIndividualEnergyActivityContext(activity, entityId) !==
            "safeStationaryRest") activeSpecialistContextCount += 1;
      }
      expect(activeSpecialistContextCount).toBe(specialistCount);
      expect(adapter.entityCount).toBe(entityCount);
      expect(Object.keys(activity)).toEqual(["entityCount"]);
      expect(Object.keys(capability)).toEqual(["entityCount"]);

      console.info("Specialist gait boundary structural report", JSON.stringify({
        entityCount,
        specialistCount,
        authorities,
        storageShape: "reused entity-indexed typed arrays",
        inspectionPolicy: "primitive context reads for fixed specialist population",
        timingPolicy: "Structural assertions only; no machine timing threshold.",
      }, null, 2));
    },
  );
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

describe("formation energy enforcement structural performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "projects and enforces mixed ordinary/routing gait for %i entities",
    (entityCount) => {
      const membersPerUnit = 20;
      expect(entityCount % membersPerUnit).toBe(0);
      const unitCount = entityCount / membersPerUnit;
      const units: UnitFormationConfig[] = [];
      const individuals: IndividualBehaviourConfig[] = [];
      const identityUnits: Array<{
        unitId: number;
        factionId: number;
        memberEntityIds: number[];
      }> = [];
      const world: WorldState = {
        entityCount,
        bounds: { width: 5_200, height: 1_400 },
        ids: Uint32Array.from({ length: entityCount }, (_, entityId) => entityId),
        positionsX: new Int32Array(entityCount),
        positionsY: new Int32Array(entityCount),
        velocitiesX: new Int32Array(entityCount),
        velocitiesY: new Int32Array(entityCount),
      };
      for (let unitIndex = 0; unitIndex < unitCount; unitIndex += 1) {
        const unitId = unitIndex + 1;
        const anchorX = 200 + unitIndex % 10 * 500;
        const anchorY = 200 + Math.floor(unitIndex / 10) * 100;
        const memberEntityIds: number[] = [];
        units.push({
          unitId,
          anchorX,
          anchorY,
          headingX: unitIndex % 2 === 0 ? 1 : -1,
          headingY: 0,
          spacing: 4,
          rows: 4,
          cols: 5,
          unitSpeed: 4,
          ordinaryPhysicalGait: "sprinting",
          order: "advance",
        });
        for (let memberIndex = 0; memberIndex < membersPerUnit; memberIndex += 1) {
          const entityId = unitIndex * membersPerUnit + memberIndex;
          const slotRow = Math.floor(memberIndex / 5);
          const slotCol = memberIndex % 5;
          memberEntityIds.push(entityId);
          individuals.push({
            entityId,
            role: "regular",
            slotRow,
            slotCol,
            memberMaxStep: memberIndex % 4 + 1,
          });
          world.positionsX[entityId] = anchorX -
            (unitIndex % 2 === 0 ? 1 : -1) * slotRow * 4;
          world.positionsY[entityId] = anchorY + (slotCol - 2) * 4;
        }
        identityUnits.push({
          unitId,
          factionId: unitIndex % 2 + 1,
          memberEntityIds,
        });
      }

      const identity = createUnitIdentityStore({ entityCount, units: identityUnits });
      const formation = createFormationBehaviourStore(identity, {
        entityCount,
        rngSeed: 0x7c_02f0 + entityCount,
        units,
        individuals,
      });
      const profiles = createTrustedIndividualEnergyProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          maximumEnergy: 100,
          startingEnergy: 100,
          safeRestRecoveryPerTick: 0,
        })),
      });
      const energy = createIndividualEnergyStore(profiles);
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        setIndividualCurrentEnergyForTrustedSetup(
          energy,
          entityId,
          [100, 45, 20, 5][entityId % 4]!,
        );
      }
      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const capability = createIndividualEnergyCapabilityStore(
        entityCount,
        energy,
        lifecycle,
        presence,
      );
      let ordinaryCapabilityReads = 0;
      let routingCapabilityReads = 0;
      const adapter: FormationEnergyGaitCapabilitySource = Object.freeze({
        entityCount,
        get projectionTick() {
          return getIndividualEnergyCapabilityProjectionTick(capability);
        },
        getMaximumOrdinaryGait(entityId: number) {
          ordinaryCapabilityReads += 1;
          return getIndividualMaximumOrdinaryGait(capability, entityId);
        },
        getMaximumRoutingGait(entityId: number) {
          routingCapabilityReads += 1;
          return getIndividualMaximumRoutingGait(capability, entityId);
        },
        getMinimumSafeWalkAvailable(entityId: number) {
          return getIndividualMinimumSafeWalkAvailable(capability, entityId);
        },
      });
      const activity = createIndividualEnergyActivityStore(entityCount);
      const treatments = createIndividualTreatmentActionStore(entityCount);
      const executions = createIndividualExecutionActionStore(entityCount);
      const treatmentBuffers = createIndividualTreatmentActionBuffers();
      const executionBuffers = createIndividualExecutionActionBuffers();
      const morale = new Map<number, "routing">();
      for (let unitId = 2; unitId <= unitCount; unitId += 2) {
        morale.set(unitId, "routing");
      }
      const formationIdentity = formation;
      const activityIdentity = activity;
      const adapterIdentity = adapter;
      const measuredTicks = 4;
      let capabilityProjectionMilliseconds = 0;
      let formationMovementMilliseconds = 0;
      let energyActivityMilliseconds = 0;
      let totalTickMilliseconds = 0;
      let maximumPassThroughOutput = 0;

      for (let tick = 0; tick < measuredTicks; tick += 1) {
        const totalStarted = performance.now();
        beginIndividualEnergyActivityObservation(activity, world, tick);
        const capabilityStarted = performance.now();
        projectIndividualEnergyCapabilitiesOneTick(
          capability,
          energy,
          lifecycle,
          presence,
          tick,
        );
        capabilityProjectionMilliseconds += performance.now() - capabilityStarted;
        const formationStarted = performance.now();
        const formationResult = advanceFormationOneTick(
          world,
          identity,
          formation,
          morale,
          undefined,
          lifecycle,
          undefined,
          { tick, capabilities: adapter },
        );
        formationMovementMilliseconds += performance.now() - formationStarted;
        maximumPassThroughOutput = Math.max(
          maximumPassThroughOutput,
          formationResult.routingPassThroughInteractions.length,
        );
        const activityStarted = performance.now();
        observeIndividualEnergyMovementAuthority(activity, world, (entityId) => {
          const routing = morale.has(getUnitIdForEntity(identity, entityId));
          return {
            source: routing ? "routingMovement" : "ordinaryMovement",
            requestedGait: getIndividualEffectivePhysicalGait(
              formation,
              entityId,
            ),
          };
        });
        classifyIndividualEnergyActivityOneTick(activity, {
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
          attackAttempts: [],
          defenceAttempts: [],
          isAlert: () => false,
          tick,
        });
        applyIndividualEnergyActivityOneTick(activity, profiles, energy, tick);
        energyActivityMilliseconds += performance.now() - activityStarted;
        totalTickMilliseconds += performance.now() - totalStarted;
      }

      expect(unitCount).toBe(entityCount / 20);
      if (entityCount === 2_000) expect(unitCount).toBe(100);
      expect(morale.size).toBe(Math.floor(unitCount / 2));
      expect(ordinaryCapabilityReads + routingCapabilityReads)
        .toBe(entityCount * measuredTicks);
      expect(formation).toBe(formationIdentity);
      expect(activity).toBe(activityIdentity);
      expect(adapter).toBe(adapterIdentity);
      expect(Object.keys(capability)).toEqual(["entityCount"]);
      expect(Object.keys(activity)).toEqual(["entityCount"]);
      expect(maximumPassThroughOutput).toBeLessThanOrEqual(256);
      for (const elapsed of [
        capabilityProjectionMilliseconds,
        formationMovementMilliseconds,
        energyActivityMilliseconds,
        totalTickMilliseconds,
      ]) {
        expect(Number.isFinite(elapsed)).toBe(true);
        expect(elapsed).toBeGreaterThanOrEqual(0);
      }

      console.info("Formation energy enforcement structural report", JSON.stringify({
        entityCount,
        unitCount,
        membersPerUnit,
        ordinaryUnitCount: unitCount - morale.size,
        routingUnitCount: morale.size,
        mixedEnergyBands: ["fresh", "working", "winded", "spent"],
        measuredTicks,
        capabilityProjectionMilliseconds,
        formationMovementMilliseconds,
        energyActivityMilliseconds,
        totalTickMilliseconds,
        capabilityReads: ordinaryCapabilityReads + routingCapabilityReads,
        maximumPassThroughOutput,
        lowerMedianStructure: "fixed gait counts; no member sorting",
        capabilityHotPath: "direct primitive getters; no inspection objects",
        diagnosticStorage: "reused entity/unit indexed store arrays",
        timingPolicy: "Structural assertions only; no machine timing threshold.",
      }, null, 2));
    },
    30_000,
  );
});

describe("Milestone 7E production structural performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "projects representative burden with sparse casualties among %i entities",
    (entityCount) => {
      const { scenario, expectedMinimumBurdenCounts } =
        createMilestone7EPerformanceScenario(entityCount);
      const simulation = createSimulation(scenario);
      const combat = simulation.combatSandbox!;
      const activityStoreIdentity = combat.individualEnergyActivityStore;
      const modifierStoreIdentity =
        combat.individualEnergyExertionModifierStore;
      const summaryStoreIdentity = combat.unitEnergySummaryStore;

      const started = performance.now();
      advanceSimulationOneTick(simulation);
      const elapsedMilliseconds = performance.now() - started;

      const actualBurdenCounts = new Map<number, number>();
      let sparseCasualtyCount = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        const multiplier = getIndividualBurdenExertionMultiplierPercent(
          modifierStoreIdentity,
          entityId,
        );
        actualBurdenCounts.set(
          multiplier,
          (actualBurdenCounts.get(multiplier) ?? 0) + 1,
        );
        if (getIndividualCharacterLifecycleState(
          combat.individualCasualtyLifecycleStore,
          entityId,
        ) !== "active") sparseCasualtyCount += 1;
      }

      expect([...actualBurdenCounts.values()].reduce(
        (total, count) => total + count,
        0,
      )).toBe(entityCount);
      for (const [multiplier, minimumCount] of expectedMinimumBurdenCounts) {
        expect(actualBurdenCounts.get(multiplier) ?? 0)
          .toBeGreaterThanOrEqual(minimumCount);
      }
      expect(sparseCasualtyCount).toBeGreaterThan(0);
      expect(sparseCasualtyCount).toBeLessThanOrEqual(12);
      expect(combat.individualEnergyActivityStore).toBe(activityStoreIdentity);
      expect(combat.individualEnergyExertionModifierStore)
        .toBe(modifierStoreIdentity);
      expect(combat.unitEnergySummaryStore).toBe(summaryStoreIdentity);
      const summaries = getUnitEnergySummaries(summaryStoreIdentity);
      expect(summaries.reduce(
        (total, summary) => total + summary.memberCount,
        0,
      )).toBe(entityCount);
      expect(summaries.every((summary) => summary.collectionTick === 0))
        .toBe(true);
      expect(summaries.reduce(
        (total, summary) => total + summary.activeMemberCount,
        0,
      )).toBe(entityCount - sparseCasualtyCount);
      expect(getIndividualEnergyExertionModifierProjectionTick(
        modifierStoreIdentity,
      )).toBe(0);
      expect(getIndividualEnergyActivityInspection(
        activityStoreIdentity,
        0,
      ).applicationTick).toBe(0);
      expect(getIndividualEnergyExertionModifierInspection(
        modifierStoreIdentity,
        0,
      ).projectionTick).toBe(0);
      expect(combat.inspectedEntityIds).toEqual([]);
      expect(combat.inspectedIndividuals).toEqual([]);
      expect(combat.debugSnapshot.inspectedIndividuals).toEqual([]);
      expect(Object.keys(activityStoreIdentity)).toEqual(["entityCount"]);
      expect(Object.keys(modifierStoreIdentity)).toEqual(["entityCount"]);
      expect(Object.keys(summaryStoreIdentity)).toEqual([
        "entityCount", "unitCount",
      ]);
      expect(Number.isFinite(elapsedMilliseconds)).toBe(true);
      expect(elapsedMilliseconds).toBeGreaterThanOrEqual(0);
      expect(combat.individualCombatPipelineBuffers.hitApplications.length)
        .toBeLessThanOrEqual(CASUALTY_LIFECYCLE_VISUAL_SCENARIO.entityCount);

      console.info("Milestone 7E production structural report", JSON.stringify({
        entityCount,
        representativeBurdenMultiplierCounts:
          Object.fromEntries(actualBurdenCounts),
        sparseCasualtyCount,
        inspectedEntityCount: combat.inspectedIndividuals.length,
        elapsedMilliseconds,
        projectionShape: "opaque entity-indexed typed arrays",
        applicationShape: "one production projection and application pass",
        summaryShape:
          "stable per-unit objects with one linear member aggregation pass",
        inspectionPolicy:
          "no production inspection objects; two bounded post-tick assertions",
        casualtyPolicy: "fixed retained sparse fixture independent of entity count",
        timingPolicy: "Structural assertions only; no machine timing threshold.",
      }, null, 2));
    },
  );
});

function createMilestone7EPerformanceScenario(entityCount: number): {
  readonly scenario: SimulationScenario;
  readonly expectedMinimumBurdenCounts: ReadonlyMap<number, number>;
} {
  const sourceCombat = CASUALTY_LIFECYCLE_VISUAL_SCENARIO.combatSandbox!;
  const fixtureCount = CASUALTY_LIFECYCLE_VISUAL_SCENARIO.entityCount;
  const fillerCount = entityCount - fixtureCount;
  const baseCount = Math.floor(fillerCount / 4);
  const remainder = fillerCount % 4;
  const counts = Array.from(
    { length: 4 },
    (_, index) => baseCount + (index < remainder ? 1 : 0),
  );
  const loadouts = [
    { weaponCategory: "unarmed", armourClass: "none", shieldClass: "none" },
    { weaponCategory: "oneHanded", armourClass: "medium", shieldClass: "shield" },
    { weaponCategory: "twoHanded", armourClass: "heavy", shieldClass: "none" },
    { weaponCategory: "staff", armourClass: "mageArmour", shieldClass: "none" },
  ] as const;
  const expectedFillerMultipliers = [100, 150, 160, 130] as const;
  const template = sourceCombat.units[24]!;
  const fillerUnits: CombatSandboxUnitScenario[] = counts.map(
    (memberCount, index) => ({
      ...template,
      unitId: 2_000 + index,
      factionId: 99,
      memberCount,
      deploymentZone: {
        minX: 3_800,
        maxX: 3_800,
        minY: 1_500 + index * 800,
        maxY: 1_500 + index * 800,
      },
      anchorX: 3_800,
      anchorY: 1_500 + index * 800,
      headingX: -1,
      rows: Math.ceil(memberCount / 20),
      cols: Math.min(memberCount, 20),
      unitSpeed: 0,
      order: "hold",
      weaponCategory: loadouts[index]!.weaponCategory,
      armourClass: loadouts[index]!.armourClass,
      shieldClass: loadouts[index]!.shieldClass,
      label: `7E structural burden ${expectedFillerMultipliers[index]}`,
    }),
  );
  const scenario: SimulationScenario = {
    ...CASUALTY_LIFECYCLE_VISUAL_SCENARIO,
    entityCount,
    bounds: { width: 5_000, height: 5_000 },
    combatSandbox: {
      ...sourceCombat,
      inspectedEntityIds: [],
      units: [...sourceCombat.units, ...fillerUnits],
    },
  };
  const expectedMinimumBurdenCounts = new Map<number, number>();
  for (let index = 0; index < counts.length; index += 1) {
    const multiplier = expectedFillerMultipliers[index]!;
    expectedMinimumBurdenCounts.set(
      multiplier,
      (expectedMinimumBurdenCounts.get(multiplier) ?? 0) + counts[index]!,
    );
  }
  return { scenario, expectedMinimumBurdenCounts };
}
