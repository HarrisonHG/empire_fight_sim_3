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
  createIndividualGenericHerbStore,
  createTrustedIndividualMedicalProfileStore,
} from "../../src/sim/individualMedicalProfile";
import {
  createIndividualTraumaticWoundStore,
  resolveIndividualTraumaticWoundOpportunities,
} from "../../src/sim/individualTraumaticWound";

describe("individual casualty lifecycle structural performance", () => {
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
      const result = resolveIndividualTraumaticWoundOpportunities(
        0x6c_01,
        procedures,
        trauma,
        opportunities,
      );
      const elapsedMilliseconds = performance.now() - startedAt;

      expect(herbs.entityCount).toBe(entityCount);
      expect(result.opportunityCount).toBe(entityCount);
      expect(result.rollCount).toBe(entityCount);
      expect(result.records.map((record) => record.entityId)).toEqual(
        result.records.map((record) => record.entityId).sort((left, right) => left - right),
      );
      process.stdout.write(
        `\nMedical and trauma performance report\n${JSON.stringify({
          entityCount,
          traumaApplications: result.appliedCount,
          elapsedMilliseconds,
          timingPolicy: "Structural assertions only; immutable/entity-indexed stores and one keyed opportunity pass.",
        }, null, 2)}\n`,
      );
    },
  );
});
