import { describe, expect, it } from "vitest";

import { MORALE_INSPECTION_SCENARIO } from "../../src/content/moraleInspectionScenario";
import {
  getUnitAnchor,
  getUnitMovementStyle,
} from "../../src/sim/formationBehaviour";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import {
  advanceSimulationOneTick,
  createInitialSnapshot,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";
import { getUnitIds, getUnitMembers } from "../../src/sim/unitIdentity";

const VETERAN = 11;
const REGULAR = 12;
const RECRUIT = 13;
const RESERVE = 14;
const RUN_TICKS = 400;

describe("Milestone 4 morale inspection scenario", () => {
  it("allows allied units while requiring an opposing faction", () => {
    const sandbox = MORALE_INSPECTION_SCENARIO.combatSandbox;
    if (sandbox === undefined) {
      throw new Error("Inspection scenario needs combat sandbox data.");
    }

    expect(() => createSimulation(MORALE_INSPECTION_SCENARIO)).not.toThrow();
    expect(() =>
      createSimulation({
        ...MORALE_INSPECTION_SCENARIO,
        combatSandbox: {
          ...sandbox,
          units: sandbox.units.map((unit) => ({ ...unit, factionId: 1 })),
        },
      }),
    ).toThrow("at least two factions");
  });

  it("replays a complete visible morale timeline without removal", () => {
    const first = runInspectionScenario();
    const second = runInspectionScenario();

    expect(first).toEqual(second);
    expect(first.initialUnitIds).toEqual([11, 12, 13, 14, 21, 22, 23]);
    expect(first.initialEntityCount).toBe(70);
    expect(first.memberCount).toBe(70);
    expect(first.veteranRouted).toBe(true);
    expect(first.regularSeverelyDegraded).toBe(true);
    expect(first.regularOutperformedVeteran).toBe(true);
    expect(first.recruitRouted).toBe(true);
    expect(first.reservePassThroughContagion).toBe(true);
    expect(first.reserveDisrupted).toBe(true);
    expect(first.reserveRouted).toBe(false);
    expect(first.recruitRecovered).toBe(true);
    expect(first.recruitCompletedRecovery).toBe(true);
    expect(first.recruitRecoveryTicks).toBeGreaterThanOrEqual(100);
    expect(first.recoveringAnchorHeld).toBe(true);
    expect(first.recoveringMovementSuspended).toBe(true);
    expect(first.finalEntityCount).toBe(70);
    expect(first.finalMemberCount).toBe(70);
  });
});

function runInspectionScenario() {
  const simulation = createSimulation(MORALE_INSPECTION_SCENARIO);
  const combat = simulation.combatSandbox;
  if (combat === undefined) throw new Error("Inspection scenario needs combat sandbox.");
  const initial = createInitialSnapshot(simulation);
  const initialUnitIds = getUnitIds(combat.identityStore);
  const memberCount = initialUnitIds.flatMap((unitId) =>
    getUnitMembers(combat.identityStore, unitId),
  ).length;
  let veteranRouted = false;
  let regularSeverelyDegraded = false;
  let regularOutperformedVeteran = false;
  let recruitRouted = false;
  let recruitRecovered = false;
  let recoveringAnchorHeld = false;
  let recoveringMovementSuspended = false;
  let reservePassThroughContagion = false;
  let reserveDisrupted = false;
  let reserveRouted = false;
  let recruitCompletedRecovery = false;
  let recruitRecoveryTicks = 0;
  let hasSeenRecruitRecovery = false;
  let recoveryAnchor: { readonly x: number; readonly y: number } | undefined;

  for (let tick = 0; tick < RUN_TICKS; tick += 1) {
    const movingFromRecovery =
      getPersistentUnitMorale(combat.persistentMoraleStore, RECRUIT).state ===
      "recovering";
    advanceSimulationOneTick(simulation);
    const veteran = getPersistentUnitMorale(combat.persistentMoraleStore, VETERAN);
    const regular = getPersistentUnitMorale(combat.persistentMoraleStore, REGULAR);
    const recruit = getPersistentUnitMorale(combat.persistentMoraleStore, RECRUIT);
    const reserve = getPersistentUnitMorale(combat.persistentMoraleStore, RESERVE);
    veteranRouted ||= veteran.state === "routing";
    regularSeverelyDegraded ||=
      regular.state === "shaken" || regular.state === "wavering";
    regularOutperformedVeteran ||=
      moraleRank(regular.state) > moraleRank(veteran.state);
    recruitRouted ||= recruit.state === "routing";
    recruitRecovered ||= recruit.state === "recovering";
    reserveDisrupted ||= reserve.state !== "steady";
    reserveRouted ||= reserve.state === "routing";
    if (recruit.state === "recovering") {
      hasSeenRecruitRecovery = true;
      recruitRecoveryTicks += 1;
    } else if (hasSeenRecruitRecovery && recruit.state === "steady") {
      recruitCompletedRecovery = true;
    }
    if (movingFromRecovery) {
      recoveringMovementSuspended ||=
        getUnitMovementStyle(combat.formationStore, RECRUIT) === "orderedHalt";
    }
    const reserveContagion = combat.routingContagionSummaries.find(
      (summary) => summary.unitId === RESERVE,
    );
    reservePassThroughContagion ||=
      reserveContagion !== undefined &&
      reserveContagion.passThroughRouterUnitIds.includes(RECRUIT) &&
      reserveContagion.pressureAppliedPerMember > 0 &&
      reserveContagion.cohesionLossApplied > 0;

    if (recruit.state === "recovering") {
      const anchor = getUnitAnchor(combat.formationStore, RECRUIT);
      if (recoveryAnchor !== undefined) {
        recoveringAnchorHeld ||=
          recoveryAnchor.x === anchor.x && recoveryAnchor.y === anchor.y;
      }
      recoveryAnchor = anchor;
    }
  }

  const snapshot = createPositionSnapshot(simulation);
  return {
    initialUnitIds,
    initialEntityCount: initial.entityCount,
    memberCount,
    veteranRouted,
    regularSeverelyDegraded,
    regularOutperformedVeteran,
    recruitRouted,
    recruitRecovered,
    recruitCompletedRecovery,
    recruitRecoveryTicks,
    recoveringAnchorHeld,
    recoveringMovementSuspended,
    reservePassThroughContagion,
    reserveDisrupted,
    reserveRouted,
    finalEntityCount: simulation.world.entityCount,
    finalMemberCount: getUnitIds(combat.identityStore).flatMap((unitId) =>
      getUnitMembers(combat.identityStore, unitId),
    ).length,
    ids: Array.from(simulation.world.ids),
    movementStyle: getUnitMovementStyle(combat.formationStore, RECRUIT),
    debug: snapshot.combatDebug,
  };
}

function moraleRank(state: string): number {
  switch (state) {
    case "steady":
      return 0;
    case "strained":
      return 1;
    case "shaken":
      return 2;
    case "wavering":
      return 3;
    case "routing":
    case "recovering":
      return 4;
    default:
      throw new Error(`Unknown morale state: ${state}`);
  }
}
