import { describe, expect, it } from "vitest";

import {
  MILESTONE_4_VISUAL_AREAS,
  MILESTONE_4_VISUAL_SCENARIO,
} from "../../src/content/milestone4VisualScenario";
import { getUnitAnchor } from "../../src/sim/formationBehaviour";
import { LOCAL_HOSTILE_THREAT_RADIUS } from "../../src/sim/moraleMovement";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import {
  advanceSimulationOneTick,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";

describe("combined Milestone 4 visual regression scenario", () => {
  it("keeps all three inspection areas beyond local interaction range", () => {
    const simulation = createSimulation(MILESTONE_4_VISUAL_SCENARIO);
    const combat = simulation.combatSandbox;
    if (combat === undefined) throw new Error("Expected combat sandbox.");
    let minimumSeparation = Number.POSITIVE_INFINITY;

    for (let tick = 0; tick < 800; tick += 1) {
      for (let left = 0; left < MILESTONE_4_VISUAL_AREAS.length; left += 1) {
        for (let right = left + 1; right < MILESTONE_4_VISUAL_AREAS.length; right += 1) {
          for (const leftUnitId of MILESTONE_4_VISUAL_AREAS[left]!.unitIds) {
            for (const rightUnitId of MILESTONE_4_VISUAL_AREAS[right]!.unitIds) {
              const a = getUnitAnchor(combat.formationStore, leftUnitId);
              const b = getUnitAnchor(combat.formationStore, rightUnitId);
              minimumSeparation = Math.min(
                minimumSeparation,
                Math.hypot(a.x - b.x, a.y - b.y),
              );
            }
          }
        }
      }
      advanceSimulationOneTick(simulation);
    }

    expect(minimumSeparation).toBeGreaterThan(LOCAL_HOSTILE_THREAT_RADIUS);
  });

  it("replays the newly combined inspection suite deterministically", () => {
    expect(runCombinedScenario()).toEqual(runCombinedScenario());
  });

  it("retains the accepted comparison, contagion, and pursuit outcomes", () => {
    const simulation = createSimulation(MILESTONE_4_VISUAL_SCENARIO);
    const combat = simulation.combatSandbox;
    if (combat === undefined) throw new Error("Expected combat sandbox.");
    let recruitRouted = false;
    let reserveDisrupted = false;
    let regularMoreDegraded = false;
    let regularPursuitRouted = false;
    let veteranPursuitRouted = false;
    let regularRouteTick: number | undefined;
    let veteranRouteTick: number | undefined;
    let regularReturnTick: number | undefined;
    let veteranReturnTick: number | undefined;

    for (let tick = 1; tick <= 800; tick += 1) {
      advanceSimulationOneTick(simulation);
      const veteran = getPersistentUnitMorale(combat.persistentMoraleStore, 11);
      const regular = getPersistentUnitMorale(combat.persistentMoraleStore, 12);
      const recruit = getPersistentUnitMorale(combat.persistentMoraleStore, 13);
      const reserve = getPersistentUnitMorale(combat.persistentMoraleStore, 14);
      const regularPursuit = getPersistentUnitMorale(
        combat.persistentMoraleStore,
        31,
      );
      const veteranPursuit = getPersistentUnitMorale(
        combat.persistentMoraleStore,
        51,
      );
      recruitRouted ||= recruit.state === "routing";
      reserveDisrupted ||= reserve.state !== "steady";
      regularMoreDegraded ||= moraleRank(regular.state) > moraleRank(veteran.state);
      regularPursuitRouted ||= regularPursuit.state === "routing";
      veteranPursuitRouted ||= veteranPursuit.state === "routing";
      if (regularPursuit.state === "routing" && regularRouteTick === undefined) regularRouteTick = tick;
      if (veteranPursuit.state === "routing" && veteranRouteTick === undefined) veteranRouteTick = tick;
      if (
        regularPursuitRouted &&
        regularPursuit.state === "steady" &&
        regularReturnTick === undefined
      ) {
        regularReturnTick = tick;
      }
      if (
        veteranPursuitRouted &&
        veteranPursuit.state === "steady" &&
        veteranReturnTick === undefined
      ) {
        veteranReturnTick = tick;
      }
    }

    expect(recruitRouted).toBe(true);
    expect(reserveDisrupted).toBe(true);
    expect(regularMoreDegraded).toBe(true);
    expect(regularPursuitRouted).toBe(false);
    expect(veteranPursuitRouted).toBe(false);
    const regularFinal = getPersistentUnitMorale(combat.persistentMoraleStore, 31);
    const veteranFinal = getPersistentUnitMorale(combat.persistentMoraleStore, 51);
    expect({ veteranReturnTick, regularReturnTick, regularRouteTick, veteranRouteTick, regularFinal, veteranFinal }).toEqual({
      veteranReturnTick: undefined,
      regularReturnTick: undefined,
      regularRouteTick: undefined,
      veteranRouteTick: undefined,
      regularFinal: expect.objectContaining({ state: "strained" }),
      veteranFinal: expect.objectContaining({ state: "steady" }),
    });
  });
});

function runCombinedScenario(): unknown {
  const simulation = createSimulation(MILESTONE_4_VISUAL_SCENARIO);
  for (let tick = 0; tick < 800; tick += 1) {
    advanceSimulationOneTick(simulation);
  }
  const snapshot = createPositionSnapshot(simulation);
  return {
    tick: snapshot.tick,
    positions: Array.from(snapshot.positions),
    debug: snapshot.combatDebug,
  };
}

function moraleRank(state: string): number {
  return ["steady", "strained", "shaken", "wavering", "routing", "recovering"].indexOf(
    state,
  );
}
