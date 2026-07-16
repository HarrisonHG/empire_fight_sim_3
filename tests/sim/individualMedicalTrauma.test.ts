import { describe, expect, it } from "vitest";

import {
  createIndividualGenericHerbStore,
  createTrustedIndividualMedicalProfileStore,
  getIndividualGenericHerbInspection,
  getTrustedIndividualMedicalProfile,
} from "../../src/sim/individualMedicalProfile";
import { createIndividualCasualtyProcedureProfileStore } from "../../src/sim/individualCasualtyProcedureProfile";
import {
  calculateTraumaticWoundOpportunityRoll,
  clearIndividualTraumaticWound,
  createIndividualTraumaticWoundStore,
  createLimbCleaveTraumaticWoundOpportunity,
  getIndividualTraumaticWoundInspection,
  resolveIndividualTraumaticWoundOpportunities,
  type IndividualTraumaticWoundOpportunity,
} from "../../src/sim/individualTraumaticWound";

describe("trusted individual medical runtime data", () => {
  it("validates Physick qualification and owns immutable default or explicit herbs", () => {
    expect(() => createTrustedIndividualMedicalProfileStore({
      entityCount: 1,
      profiles: [{ entityId: 0, hasPhysick: true, hasChirurgeon: false }],
    })).toThrow(/Physick.*Chirurgeon/);

    const profiles = createTrustedIndividualMedicalProfileStore({
      entityCount: 3,
      profiles: [
        { entityId: 0, hasPhysick: true, hasChirurgeon: true },
        {
          entityId: 1,
          hasPhysick: true,
          hasChirurgeon: true,
          startingGenericHerbs: 7,
        },
        { entityId: 2, hasPhysick: false, hasChirurgeon: false },
      ],
    });
    const herbs = createIndividualGenericHerbStore(profiles);

    expect(getTrustedIndividualMedicalProfile(profiles, 0)).toEqual({
      entityId: 0,
      hasPhysick: true,
      hasChirurgeon: true,
      startingGenericHerbs: 12,
    });
    expect(Object.isFrozen(getTrustedIndividualMedicalProfile(profiles, 0)))
      .toBe(true);
    expect(getIndividualGenericHerbInspection(herbs, 0)).toEqual({
      current: 12,
      maximum: 12,
      reserved: 0,
    });
    expect(getIndividualGenericHerbInspection(herbs, 1)).toEqual({
      current: 7,
      maximum: 7,
      reserved: 0,
    });
    expect(getIndividualGenericHerbInspection(herbs, 2)).toEqual({
      current: 0,
      maximum: 0,
      reserved: 0,
    });
  });
});

describe("individual traumatic wounds", () => {
  it("uses a keyed citizen-only roll, does not stack, and may recur after clear", () => {
    const procedures = createProcedures();
    const store = createIndividualTraumaticWoundStore(2);
    const battleSeed = 0x6c_01;
    const zeroHit = findSuccessfulOpportunity(
      battleSeed,
      0,
      1,
      "zeroHit",
    );
    const out: import("../../src/sim/individualTraumaticWound").IndividualTraumaticWoundAppliedRecord[] = [];
    const first = resolveIndividualTraumaticWoundOpportunities(
      battleSeed,
      procedures,
      store,
      [zeroHit],
      out,
    );
    expect(first.records).toBe(out);
    expect(first).toMatchObject({ rollCount: 1, appliedCount: 1 });
    expect(out[0]).toMatchObject({
      entityId: 0,
      attackerEntityId: 1,
      tick: zeroHit.tick,
      triggerKind: "zeroHit",
      episodeCount: 1,
    });

    expect(resolveIndividualTraumaticWoundOpportunities(
      battleSeed,
      procedures,
      store,
      [{ ...zeroHit, tick: zeroHit.tick + 1 }],
      out,
    )).toMatchObject({ rollCount: 0, appliedCount: 0 });
    expect(getIndividualTraumaticWoundInspection(store, 0).episodeCount).toBe(1);

    expect(clearIndividualTraumaticWound(store, 0)).toBe(true);
    const limbCleave = findSuccessfulOpportunity(
      battleSeed,
      0,
      1,
      "limbCleave",
    );
    const limbBoundary = createLimbCleaveTraumaticWoundOpportunity(
      0,
      1,
      limbCleave.tick,
    );
    resolveIndividualTraumaticWoundOpportunities(
      battleSeed,
      procedures,
      store,
      [limbBoundary],
      out,
    );
    expect(getIndividualTraumaticWoundInspection(store, 0)).toEqual({
      state: "active",
      episodeCount: 2,
      latestEpisodeTick: limbCleave.tick,
      latestAttackerEntityId: 1,
      latestTriggerKind: "limbCleave",
    });
  });

  it("does not roll for barbarians and is stable for identical keyed identity", () => {
    const procedures = createProcedures();
    const store = createIndividualTraumaticWoundStore(2);
    const opportunity = {
      targetEntityId: 1,
      attackerEntityId: 0,
      tick: 44,
      triggerKind: "zeroHit" as const,
    };
    expect(calculateTraumaticWoundOpportunityRoll(123, opportunity)).toBe(
      calculateTraumaticWoundOpportunityRoll(123, { ...opportunity }),
    );
    expect(resolveIndividualTraumaticWoundOpportunities(
      123,
      procedures,
      store,
      [opportunity],
    )).toMatchObject({ opportunityCount: 1, rollCount: 0, appliedCount: 0 });
    expect(getIndividualTraumaticWoundInspection(store, 1)).toMatchObject({
      state: "none",
      episodeCount: 0,
    });
  });
});

function createProcedures() {
  return createIndividualCasualtyProcedureProfileStore({
    entityCount: 2,
    profiles: [
      {
        entityId: 0,
        procedureKind: "citizen",
        deathCountPolicy: { kind: "normalFortitude" },
      },
      {
        entityId: 1,
        procedureKind: "barbarian",
        deathCountPolicy: { kind: "fixedTicks", durationTicks: 600 },
      },
    ],
  });
}

function findSuccessfulOpportunity(
  battleSeed: number,
  targetEntityId: number,
  attackerEntityId: number,
  triggerKind: IndividualTraumaticWoundOpportunity["triggerKind"],
): IndividualTraumaticWoundOpportunity {
  for (let tick = 0; tick < 10_000; tick += 1) {
    const opportunity = {
      targetEntityId,
      attackerEntityId,
      tick,
      triggerKind,
    };
    if (calculateTraumaticWoundOpportunityRoll(battleSeed, opportunity) < 100) {
      return opportunity;
    }
  }
  throw new Error("Expected a successful deterministic trauma opportunity.");
}
