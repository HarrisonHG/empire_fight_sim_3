import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import {
  applyIndividualZeroHitLifecycleTransitions,
  createIndividualCasualtyLifecycleStore,
  createIndividualPlayerPresenceStore,
  type IndividualZeroHitLifecycleTransitionRecord,
} from "../../src/sim/individualCasualtyLifecycle";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import type { IndividualZeroHitEvent } from "../../src/sim/individualGlobalHits";
import {
  advanceIndividualDeathCountsOneTick,
  createIndividualDeathCountStore,
  initializeIndividualDeathCountsFromZeroHitTransitions,
} from "../../src/sim/individualDeathCount";
import { createIndividualCombatProfileStore } from "../../src/sim/individualCombatProfile";
import {
  consumeIndividualGenericHerbTreatmentReservation,
  createIndividualGenericHerbStore,
  createTrustedIndividualMedicalProfileStore,
  getIndividualGenericHerbInspection,
  releaseIndividualGenericHerbTreatmentReservation,
  reserveIndividualGenericHerbForTreatment,
} from "../../src/sim/individualMedicalProfile";
import {
  createIndividualTraumaticWoundStore,
  resolveIndividualTraumaticWoundOpportunities,
} from "../../src/sim/individualTraumaticWound";
import {
  applyTrustedIndividualLimbDisability,
  clearIndividualLimbDisability,
  createIndividualLimbDisabilityStore,
  getIndividualLimbDisabilityInspection,
} from "../../src/sim/individualLimbDisability";
import {
  getIndividualMedicalLocalQueryPreparationCount,
  prepareIndividualMedicalLocalQueries,
  projectIndividualMedicalUrgency,
  updateIndividualMedicalDiscoveryAndWithdrawalIntents,
} from "../../src/sim/individualMedicalReadModel";
import { createSimulation } from "../../src/sim/simulation";
import {
  createCasualtyAssistanceDecisionBuffers,
  createCasualtyDragMovementBuffers,
  advanceCasualtyDragGroupsBeforeCombat,
  decideIndividualCasualtyAssistance,
  getActiveCasualtyDragGroups,
} from "../../src/sim/individualCasualtyAssistance";
import {
  createIndividualMedicalClaimBuffers,
  decideIndividualMedicalClaimsAndHandoffs,
} from "../../src/sim/individualMedicalClaims";
import {
  advanceIndividualExecutionActionsOneTick,
  createIndividualExecutionActionBuffers,
  createIndividualExecutionActionStore,
  submitIndividualExecutionIntent,
} from "../../src/sim/individualExecutionAction";
import {
  advanceIndividualTreatmentActionsOneTick,
  getActiveIndividualTreatmentActionCount,
} from "../../src/sim/individualTreatmentAction";

describe("individual casualty lifecycle structural performance", () => {
  it.each([100, 500, 1_000, 2_000])(
    "advances sparse execution commitments structurally for %i entities",
    (entityCount) => {
      const actionCount = Math.floor(entityCount / 2);
      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const procedures = createIndividualCasualtyProcedureProfileStore({ entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({ entityId, procedureKind: "citizen" as const, deathCountPolicy: { kind: "fixedTicks" as const, durationTicks: 10_000 } })) });
      const world = { entityCount, bounds: { width: entityCount * 4 + 8, height: 8 }, ids: Uint32Array.from({ length: entityCount }, (_, i) => i), positionsX: Int32Array.from({ length: entityCount }, (_, i) => Math.floor(i / 2) * 4 + i % 2), positionsY: new Int32Array(entityCount), velocitiesX: new Int32Array(entityCount), velocitiesY: new Int32Array(entityCount) };
      applyIndividualZeroHitLifecycleTransitions(lifecycle, presence, procedures, world,
        Array.from({ length: actionCount }, (_, index) => ({ entityId: index * 2 + 1, attackerEntityId: index * 2, previousHits: 1 })), 0);
      const store = createIndividualExecutionActionStore(entityCount);
      const deathCounts = createIndividualDeathCountStore(entityCount);
      const buffers = createIndividualExecutionActionBuffers();
      for (let index = 0; index < actionCount; index += 1) submitIndividualExecutionIntent(store, { executorEntityId: index * 2, targetEntityId: index * 2 + 1, requestedTick: 0 });
      advanceIndividualExecutionActionsOneTick(world, lifecycle, deathCounts, store, 0, [], [], buffers);
      const startedAt = performance.now();
      for (let tick = 1; tick <= 100; tick += 1) advanceIndividualExecutionActionsOneTick(world, lifecycle, deathCounts, store, tick, [], [], buffers);
      const elapsedMilliseconds = performance.now() - startedAt;
      expect(buffers.completedRecords).toHaveLength(actionCount);
      process.stdout.write(`\nExecution performance report\n${JSON.stringify({ entityCount, actionCount, elapsedMilliseconds, timingPolicy: "Structural assertions only; sparse canonical active-action iteration." }, null, 2)}\n`);
    },
  );
  it.each([100, 500, 1_000, 2_000])(
    "consumes one zero-hit transition per %i entities without quadratic work",
    (entityCount) => {
      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const procedures = createIndividualCasualtyProcedureProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          procedureKind: entityId % 2 === 0 ? "citizen" : "barbarian",
          deathCountPolicy: entityId % 2 === 0
            ? { kind: "normalFortitude" as const }
            : { kind: "fixedTicks" as const, durationTicks: 600 },
        })),
      });
      const positions = {
        entityCount,
        positionsX: Int32Array.from(
          { length: entityCount },
          (_, entityId) => entityId * 2,
        ),
        positionsY: Int32Array.from(
          { length: entityCount },
          (_, entityId) => -entityId,
        ),
      };
      const events: IndividualZeroHitEvent[] = Array.from(
        { length: entityCount },
        (_, offset) => {
          const entityId = entityCount - offset - 1;
          return {
            entityId,
            attackerEntityId: (entityId + 1) % entityCount,
            previousHits: 1,
          };
        },
      );
      const output: IndividualZeroHitLifecycleTransitionRecord[] = [];

      const startedAt = performance.now();
      const result = applyIndividualZeroHitLifecycleTransitions(
        lifecycle,
        presence,
        procedures,
        positions,
        events,
        100,
        output,
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(result.transitions).toBe(output);
      expect(result.transitionCount).toBe(entityCount);
      expect(output[0]?.entityId).toBe(0);
      expect(output.at(-1)?.entityId).toBe(entityCount - 1);
      expect(new Set(output.map((record) => record.entityId)).size)
        .toBe(entityCount);
      expect(elapsedMilliseconds).toBeGreaterThanOrEqual(0);
      process.stdout.write(
        `\nCasualty lifecycle performance report\n${JSON.stringify({
          entityCount,
          zeroHitEventsConsumed: events.length,
          transitionsEmitted: result.transitionCount,
          elapsedMilliseconds,
          timingPolicy:
            "Structural assertions only; one canonical transition per entity with reversed input order.",
        }, null, 2)}\n`,
      );
    },
  );

  it.each([100, 500, 1_000, 2_000])(
    "advances and terminalises %i death counts with canonical bounded output",
    (entityCount) => {
      const lifecycle = createIndividualCasualtyLifecycleStore(entityCount);
      const presence = createIndividualPlayerPresenceStore(entityCount);
      const procedures = createIndividualCasualtyProcedureProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          procedureKind: "citizen" as const,
          deathCountPolicy: { kind: "fixedTicks" as const, durationTicks: 1 },
        })),
      });
      const combatProfiles = createIndividualCombatProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          primaryWeapon: "unarmed" as const,
          shieldCategory: "none" as const,
          shieldCarriedState: "none" as const,
          armourCategory: "none" as const,
          hasQualifyingHelmet: false,
          qualifications: {
            hasWeaponMaster: false,
            hasShield: false,
            hasMarksman: false,
            hasThrown: false,
            hasAmbidexterity: false,
            enduranceLevels: 0,
            fortitudeLevels: entityId % 6,
            hasDreadnought: false,
          },
          magicalCapabilities: {
            canUseRod: false,
            canUseStaff: false,
            canWearMageArmour: false,
            canDeliverCombatMagic: false,
          },
        })),
      });
      const positions = {
        entityCount,
        positionsX: new Int32Array(entityCount),
        positionsY: new Int32Array(entityCount),
      };
      const zeroTransitions = applyIndividualZeroHitLifecycleTransitions(
        lifecycle,
        presence,
        procedures,
        positions,
        Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          attackerEntityId: entityId,
          previousHits: 1,
        })),
        10,
      ).transitions;
      const deathCounts = createIndividualDeathCountStore(entityCount);
      const terminalOut: import("../../src/sim/individualDeathCount").IndividualDeathCountTerminalTransitionRecord[] = [];

      const startedAt = performance.now();
      initializeIndividualDeathCountsFromZeroHitTransitions(
        deathCounts,
        lifecycle,
        procedures,
        combatProfiles,
        zeroTransitions,
      );
      expect(advanceIndividualDeathCountsOneTick(
        deathCounts, lifecycle, positions, 10, terminalOut,
      )).toHaveLength(0);
      advanceIndividualDeathCountsOneTick(
        deathCounts, lifecycle, positions, 11, terminalOut,
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(terminalOut).toHaveLength(entityCount);
      expect(terminalOut[0]?.entityId).toBe(0);
      expect(terminalOut.at(-1)?.entityId).toBe(entityCount - 1);
      process.stdout.write(
        `\nDeath-count performance report\n${JSON.stringify({
          entityCount,
          terminalTransitions: terminalOut.length,
          elapsedMilliseconds,
          timingPolicy: "Structural assertions only; bounded linear stores and canonical entity-order output.",
        }, null, 2)}\n`,
      );
    },
  );

  it.each([100, 500, 1_000, 2_000])(
    "builds medical stores and resolves %i keyed trauma opportunities structurally",
    (entityCount) => {
      const procedures = createIndividualCasualtyProcedureProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          procedureKind: "citizen" as const,
          deathCountPolicy: { kind: "normalFortitude" as const },
        })),
      });
      const opportunities = Array.from(
        { length: entityCount },
        (_, entityId) => ({
          targetEntityId: entityId,
          attackerEntityId: (entityId + 1) % entityCount,
          tick: 50 + entityId,
          triggerKind: "zeroHit" as const,
        }),
      ).reverse();
      const startedAt = performance.now();
      const medicalProfiles = createTrustedIndividualMedicalProfileStore({
        entityCount,
        profiles: Array.from({ length: entityCount }, (_, entityId) => ({
          entityId,
          hasChirurgeon: entityId % 20 === 0,
          hasPhysick: entityId % 20 === 0,
        })),
      });
      const herbs = createIndividualGenericHerbStore(medicalProfiles);
      const trauma = createIndividualTraumaticWoundStore(entityCount);
      const limbs = createIndividualLimbDisabilityStore(entityCount);
      for (let entityId = 0; entityId < entityCount; entityId += 1) {
        applyTrustedIndividualLimbDisability(
          limbs,
          entityId,
          entityId % 2 === 0 ? "disabledLeg" : "disabledArm",
        );
      }
      for (let entityId = 0; entityId < entityCount; entityId += 2) {
        clearIndividualLimbDisability(limbs, entityId, "disabledLeg");
      }
      let reservationCount = 0;
      for (let entityId = 0; entityId < entityCount; entityId += 20) {
        expect(reserveIndividualGenericHerbForTreatment(
          herbs, entityId, entityId,
        )).toBe(true);
        reservationCount += 1;
      }
      for (let entityId = 0; entityId < entityCount; entityId += 20) {
        if (entityId % 40 === 0) {
          consumeIndividualGenericHerbTreatmentReservation(
            herbs, entityId, entityId,
          );
          expect(getIndividualGenericHerbInspection(herbs, entityId))
            .toMatchObject({ current: 11, reserved: 0 });
        } else {
          releaseIndividualGenericHerbTreatmentReservation(
            herbs, entityId, entityId,
          );
          expect(getIndividualGenericHerbInspection(herbs, entityId))
            .toMatchObject({ current: 12, reserved: 0 });
        }
      }
      const result = resolveIndividualTraumaticWoundOpportunities(
        0x6c_01,
        procedures,
        trauma,
        opportunities,
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(herbs.entityCount).toBe(entityCount);
      expect(getIndividualLimbDisabilityInspection(limbs, 0)).toMatchObject({
        disabledArm: false,
        disabledLeg: false,
        legEpisodeCount: 1,
        legClearedCount: 1,
      });
      expect(getIndividualLimbDisabilityInspection(limbs, entityCount - 1)
        .armEpisodeCount + getIndividualLimbDisabilityInspection(
          limbs, entityCount - 1,
        ).legEpisodeCount).toBe(1);
      expect(result.opportunityCount).toBe(entityCount);
      expect(result.rollCount).toBe(entityCount);
      expect(result.records.map((record) => record.entityId)).toEqual(
        result.records.map((record) => record.entityId).sort((left, right) => left - right),
      );
      process.stdout.write(
        `\nMedical and trauma performance report\n${JSON.stringify({
          entityCount,
          herbReservationOperations: reservationCount * 2,
          limbConditionOperations: entityCount + Math.ceil(entityCount / 2),
          traumaApplications: result.appliedCount,
          elapsedMilliseconds,
          timingPolicy: "Structural assertions only; immutable/entity-indexed stores, constant-time reservation ownership, and one keyed opportunity pass.",
        }, null, 2)}\n`,
      );
    },
  );

  it.each([100, 500, 1_000, 2_000])(
    "prepares medical read models and bounded local discovery for %i entities",
    (entityCount) => {
      const simulation = createSimulation({
        seed: 0x6c_21,
        entityCount,
        bounds: { width: entityCount * 8 + 64, height: 128 },
        minSpeedUnitsPerTick: 1,
        maxSpeedUnitsPerTick: 1,
        combatSandbox: {
          kind: "liveCombatSandbox",
          appliedDamagePressureScale: 1,
          units: [{
            unitId: 1,
            factionId: 1,
            memberCount: Math.floor(entityCount / 2),
            deploymentZone: {
              minX: 16,
              maxX: Math.floor(entityCount / 2) * 8,
              minY: 64,
              maxY: 64,
            },
            anchorX: 16,
            anchorY: 64,
            headingX: 1,
            headingY: 0,
            spacing: 4,
            rows: 1,
            cols: Math.floor(entityCount / 2),
            unitSpeed: 0,
            order: "hold",
            role: "regular",
            memberMaxStep: 1,
            weaponCategory: "unarmed",
            weaponReachBand: "none",
            armourClass: "none",
            shieldClass: "none",
            attackIntervalTicks: 20,
            maxDamageCapacity: 1_000_000,
            casualtyProcedure: {
              procedureKind: "citizen",
              deathCountPolicy: { kind: "normalFortitude" },
            },
            medicalProfile: { hasChirurgeon: true, hasPhysick: true },
          }, {
            unitId: 2,
            factionId: 2,
            memberCount: entityCount - Math.floor(entityCount / 2),
            deploymentZone: {
              minX: Math.floor(entityCount / 2) * 8 + 32,
              maxX: entityCount * 8,
              minY: 64,
              maxY: 64,
            },
            anchorX: entityCount * 8,
            anchorY: 64,
            headingX: -1,
            headingY: 0,
            spacing: 4,
            rows: 1,
            cols: entityCount - Math.floor(entityCount / 2),
            unitSpeed: 0,
            order: "hold",
            role: "regular",
            memberMaxStep: 1,
            weaponCategory: "unarmed",
            weaponReachBand: "none",
            armourClass: "none",
            shieldClass: "none",
            attackIntervalTicks: 20,
            maxDamageCapacity: 1_000_000,
            casualtyProcedure: {
              procedureKind: "citizen",
              deathCountPolicy: { kind: "normalFortitude" },
            },
            medicalProfile: { hasChirurgeon: true, hasPhysick: true },
          }],
        },
      });
      const combat = simulation.combatSandbox!;
      const startedAt = performance.now();
      projectIndividualMedicalUrgency(
        combat.identityStore,
        combat.formationStore,
        combat.individualGlobalHitStore,
        combat.individualCasualtyLifecycleStore,
        combat.individualCasualtyProcedureProfileStore,
        combat.individualTraumaticWoundStore,
        combat.individualLimbDisabilityStore,
        combat.individualOrdinaryParticipationSnapshot,
        combat.individualMedicalUrgencyStore,
      );
      prepareIndividualMedicalLocalQueries(
        simulation.world,
        combat.identityStore,
        combat.individualCasualtyLifecycleStore,
        combat.trustedIndividualMedicalProfileStore,
        combat.individualGenericHerbStore,
        combat.individualTraumaticWoundStore,
        combat.individualMedicalUrgencyStore,
        combat.individualOrdinaryParticipationSnapshot,
        combat.moraleMovementStates,
        combat.individualMedicalLocalQueryStore,
      );
      updateIndividualMedicalDiscoveryAndWithdrawalIntents(
        simulation.world,
        combat.identityStore,
        combat.formationStore,
        combat.trustedIndividualMedicalProfileStore,
        combat.individualGenericHerbStore,
        combat.individualMedicalUrgencyStore,
        combat.individualMedicalLocalQueryStore,
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(getIndividualMedicalLocalQueryPreparationCount(
        combat.individualMedicalLocalQueryStore,
      )).toBe(1);
      process.stdout.write(
        `\nMedical discovery performance report\n${JSON.stringify({
          entityCount,
          preparations: 1,
          elapsedMilliseconds,
          timingPolicy: "Structural assertions only; one prepared grid and bounded local candidate queries.",
        }, null, 2)}\n`,
      );
    },
  );

  it.each([100, 500, 1_000, 2_000])(
    "forms sparse drag groups from bounded local queries for %i entities",
    (entityCount) => {
      const half = Math.floor(entityCount / 2);
      const simulation = createSimulation({
        seed: 0x6d,
        entityCount,
        bounds: { width: entityCount * 8 + 64, height: 128 },
        minSpeedUnitsPerTick: 1,
        maxSpeedUnitsPerTick: 1,
        combatSandbox: {
          kind: "liveCombatSandbox",
          appliedDamagePressureScale: 1,
          units: [performanceUnit(1, 1, half, 16, half * 8, 1),
            performanceUnit(2, 2, entityCount - half, half * 8 + 32, entityCount * 8, -1)],
        },
      });
      const combat = simulation.combatSandbox!;
      const casualtyCount = 5;
      applyIndividualZeroHitLifecycleTransitions(
        combat.individualCasualtyLifecycleStore,
        combat.individualPlayerPresenceStore,
        combat.individualCasualtyProcedureProfileStore,
        simulation.world,
        Array.from({ length: casualtyCount }, (_, entityId) => ({
          entityId,
          attackerEntityId: half,
          previousHits: 1,
        })),
        1,
      );
      projectIndividualMedicalUrgency(
        combat.identityStore,
        combat.formationStore,
        combat.individualGlobalHitStore,
        combat.individualCasualtyLifecycleStore,
        combat.individualCasualtyProcedureProfileStore,
        combat.individualTraumaticWoundStore,
        combat.individualLimbDisabilityStore,
        combat.individualOrdinaryParticipationSnapshot,
        combat.individualMedicalUrgencyStore,
      );
      prepareIndividualMedicalLocalQueries(
        simulation.world,
        combat.identityStore,
        combat.individualCasualtyLifecycleStore,
        combat.trustedIndividualMedicalProfileStore,
        combat.individualGenericHerbStore,
        combat.individualTraumaticWoundStore,
        combat.individualMedicalUrgencyStore,
        combat.individualOrdinaryParticipationSnapshot,
        combat.moraleMovementStates,
        combat.individualMedicalLocalQueryStore,
      );
      const startedAt = performance.now();
      const result = decideIndividualCasualtyAssistance(
        simulation.world,
        combat.identityStore,
        combat.formationStore,
        combat.individualCasualtyLifecycleStore,
        combat.trustedIndividualMedicalProfileStore,
        combat.individualTraumaticWoundStore,
        combat.individualOrdinaryParticipationSnapshot,
        combat.individualCombatActionStore,
        combat.moraleMovementStates,
        combat.individualMedicalLocalQueryStore,
        combat.individualCasualtyAssistanceStore,
        combat.casualtyDragGroupStore,
        1,
        createCasualtyAssistanceDecisionBuffers(),
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(result.dragEligiblePatientCount).toBe(casualtyCount);
      expect(getActiveCasualtyDragGroups(combat.casualtyDragGroupStore).length)
        .toBe(casualtyCount);
      expect(result.localCandidateCount).toBeLessThan(entityCount * casualtyCount);
      const movement = advanceCasualtyDragGroupsBeforeCombat(
        simulation.world, combat.identityStore, combat.formationStore,
        combat.individualCasualtyLifecycleStore, combat.individualTraumaticWoundStore,
        combat.moraleMovementStates, combat.individualCasualtyAssistanceStore,
        combat.casualtyDragGroupStore, combat.individualDragHandCommitmentStore,
        2, createCasualtyDragMovementBuffers(),
      );
      expect(movement.movedParticipantCount).toBeLessThanOrEqual(casualtyCount * 2);
      const claimsStartedAt = performance.now();
      const claims = decideIndividualMedicalClaimsAndHandoffs(
        simulation.world, combat.identityStore, combat.individualCasualtyLifecycleStore,
        combat.trustedIndividualMedicalProfileStore, combat.individualGenericHerbStore,
        combat.individualTraumaticWoundStore, combat.individualLimbDisabilityStore,
        combat.individualMedicalUrgencyStore,
        combat.individualCombatActionStore, combat.moraleMovementStates,
        combat.individualMedicalLocalQueryStore, combat.individualCasualtyAssistanceStore,
        combat.casualtyDragGroupStore, combat.individualDragHandCommitmentStore,
        combat.individualMedicalClaimStore, 2, createIndividualMedicalClaimBuffers(),
      );
      const claimElapsedMilliseconds = performance.now() - claimsStartedAt;
      expect(claims.localCandidateCount).toBeLessThan(entityCount * casualtyCount);
      process.stdout.write(
        `\nCasualty assistance performance report\n${JSON.stringify({
          entityCount,
          casualtyCount,
          activeDragGroups: casualtyCount,
          localCandidateCount: result.localCandidateCount,
          elapsedMilliseconds,
          claimElapsedMilliseconds,
          timingPolicy: "Structural assertions only; sparse groups and bounded prepared-grid queries.",
        }, null, 2)}\n`,
      );
    },
  );

  it.each([100, 500, 1_000, 2_000])(
    "keeps five active treatment actions sparse and entity-indexed across %i entities",
    (entityCount) => {
      const simulation = createSimulation({
        seed: 0x6e_01,
        entityCount,
        bounds: { width: entityCount * 4 + 64, height: 128 },
        minSpeedUnitsPerTick: 1,
        maxSpeedUnitsPerTick: 1,
        combatSandbox: {
          kind: "liveCombatSandbox",
          appliedDamagePressureScale: 1,
          units: [
            performanceUnit(1, 1, entityCount - 1, 16, entityCount * 4 - 16, 1),
            performanceUnit(2, 2, 1, entityCount * 4, entityCount * 4, -1),
          ],
        },
      });
      const combat = simulation.combatSandbox!;
      const treatmentCount = 5;
      const hitStore = combat.individualGlobalHitStore as unknown as {
        readonly currentGlobalHitsByEntity: Int32Array;
        readonly zeroReachedByEntity: Uint8Array;
      };
      for (let patient = 0; patient < treatmentCount; patient += 1) {
        hitStore.currentGlobalHitsByEntity[patient] = 0;
        hitStore.zeroReachedByEntity[patient] = 1;
        simulation.world.positionsX[patient] = 32 + patient * 16;
        simulation.world.positionsX[patient + treatmentCount] = 32 + patient * 16;
      }
      const transitions = applyIndividualZeroHitLifecycleTransitions(
        combat.individualCasualtyLifecycleStore,
        combat.individualPlayerPresenceStore,
        combat.individualCasualtyProcedureProfileStore,
        simulation.world,
        Array.from({ length: treatmentCount }, (_, patient) => ({
          entityId: patient,
          attackerEntityId: patient + treatmentCount,
          previousHits: 1,
        })),
        0,
      ).transitions;
      initializeIndividualDeathCountsFromZeroHitTransitions(
        combat.individualDeathCountStore,
        combat.individualCasualtyLifecycleStore,
        combat.individualCasualtyProcedureProfileStore,
        combat.individualProfileStore,
        transitions,
      );
      seedDyingClaimsForPerformance(
        combat.individualMedicalClaimStore,
        treatmentCount,
      );

      const startedAt = performance.now();
      const started = advanceIndividualTreatmentActionsOneTick(
        simulation.world, combat.identityStore,
        combat.individualCasualtyLifecycleStore,
        combat.individualPlayerPresenceStore,
        combat.trustedIndividualMedicalProfileStore,
        combat.individualGenericHerbStore,
        combat.individualTraumaticWoundStore,
        combat.individualLimbDisabilityStore,
        combat.individualCombatActionStore,
        combat.moraleMovementStates,
        combat.individualDeathCountStore,
        combat.individualGlobalHitStore,
        combat.individualMedicalClaimStore,
        combat.individualCasualtyAssistanceStore,
        [], [], 0,
        combat.individualTreatmentActionStore,
        combat.individualTreatmentActionBuffers,
      );
      const startedCount = started.startedRecords.length;
      const progressed = advanceIndividualTreatmentActionsOneTick(
        simulation.world, combat.identityStore,
        combat.individualCasualtyLifecycleStore,
        combat.individualPlayerPresenceStore,
        combat.trustedIndividualMedicalProfileStore,
        combat.individualGenericHerbStore,
        combat.individualTraumaticWoundStore,
        combat.individualLimbDisabilityStore,
        combat.individualCombatActionStore,
        combat.moraleMovementStates,
        combat.individualDeathCountStore,
        combat.individualGlobalHitStore,
        combat.individualMedicalClaimStore,
        combat.individualCasualtyAssistanceStore,
        [], [], 1,
        combat.individualTreatmentActionStore,
        combat.individualTreatmentActionBuffers,
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(startedCount).toBe(treatmentCount);
      expect(progressed.progressedActionCount).toBe(treatmentCount);
      expect(progressed.activeActionCount).toBe(treatmentCount);
      expect(getActiveIndividualTreatmentActionCount(
        combat.individualTreatmentActionStore,
      )).toBe(treatmentCount);
      expect(progressed.startedRecords).toBe(
        combat.individualTreatmentActionBuffers.startedRecords,
      );
      process.stdout.write(
        `\nTreatment-action performance report\n${JSON.stringify({
          entityCount,
          activeTreatmentActions: treatmentCount,
          progressedTreatmentActions: progressed.progressedActionCount,
          elapsedMilliseconds,
          timingPolicy: "Structural assertions only; sparse active records with entity-indexed ownership lookup and reused transition buffers.",
        }, null, 2)}\n`,
      );
    },
  );
});

function seedDyingClaimsForPerformance(
  store: import("../../src/sim/individualMedicalClaims").IndividualMedicalClaimStore,
  count: number,
): void {
  const claims = store as unknown as {
    readonly patientByPhysick: Int32Array;
    readonly physickByPatient: Int32Array;
    readonly claimedTickByPatient: Float64Array;
    readonly needByPatient: Uint8Array;
  };
  for (let patient = 0; patient < count; patient += 1) {
    const healer = patient + count;
    claims.patientByPhysick[healer] = patient;
    claims.physickByPatient[patient] = healer;
    claims.claimedTickByPatient[patient] = 0;
    claims.needByPatient[patient] = 1;
  }
}

function performanceUnit(
  unitId: number,
  factionId: number,
  memberCount: number,
  minX: number,
  maxX: number,
  headingX: -1 | 1,
) {
  return {
    unitId,
    factionId,
    memberCount,
    deploymentZone: { minX, maxX, minY: 64, maxY: 64 },
    anchorX: minX,
    anchorY: 64,
    headingX,
    headingY: 0,
    spacing: 4,
    rows: 1,
    cols: memberCount,
    unitSpeed: 0,
    order: "hold" as const,
    role: "regular" as const,
    memberMaxStep: 1,
    weaponCategory: "unarmed" as const,
    weaponReachBand: "none" as const,
    armourClass: "none" as const,
    shieldClass: "none" as const,
    attackIntervalTicks: 20,
    maxDamageCapacity: 1_000_000,
    casualtyProcedure: {
      procedureKind: "citizen" as const,
      deathCountPolicy: { kind: "normalFortitude" as const },
    },
    medicalProfile: { hasChirurgeon: true, hasPhysick: true },
  };
}
