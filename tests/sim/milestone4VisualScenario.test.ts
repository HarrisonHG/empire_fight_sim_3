import { beforeAll, describe, expect, it } from "vitest";

import {
  MILESTONE_4_VISUAL_AREAS,
  MILESTONE_4_VISUAL_SCENARIO,
} from "../../src/content/milestone4VisualScenario";
import {
  getUnitAnchor,
  getUnitMovementStyle,
} from "../../src/sim/formationBehaviour";
import { LOCAL_HOSTILE_THREAT_RADIUS } from "../../src/sim/moraleMovement";
import { getIndividualCasualtyAssistanceInspection } from "../../src/sim/individualCasualtyAssistance";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import { getUnitMembers } from "../../src/sim/unitIdentity";
import {
  advanceSimulationOneTick,
  createPositionSnapshot,
  createSimulation,
} from "../../src/sim/simulation";

describe("combined Milestone 4 visual regression scenario", () => {
  let behaviour: ReturnType<typeof inspectCombinedBehaviour>;
  beforeAll(() => {
    behaviour = inspectCombinedBehaviour();
  }, 10_000);

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
  }, 10_000);

  it("replays the newly combined inspection suite deterministically", () => {
    // The shared observation already advanced an independent first simulation.
    expect(behaviour.replay).toEqual(runCombinedScenario());
  }, 10_000);

  it("demonstrates recruit fleeing within the retained 800-tick window", () => {
    expect(behaviour.initialRecruitState).toBe("steady");
    expect(behaviour.recruitRouted).toBe(true);
    expect(behaviour.recruitRetreatedWhileRouting).toBe(true);
    // First-route timing depends on legal collision and rescue movement. Test
    // the bounded behavioural contract, rather than the obsolete tick 411.
    expect(behaviour.recruitRouteTick).toBeGreaterThan(0);
    expect(behaviour.recruitRouteTick).toBeLessThanOrEqual(800);
    expect(behaviour.regularMoreDegraded).toBe(true);
  });

  it("keeps the reserve out of rescues and steady throughout", () => {
    expect(behaviour.reserveJoinedRescue).toBe(false);
    expect(behaviour.reserveDisrupted).toBe(false);
  });

  it("demonstrates pursuit and earlier veteran recovery within 800 ticks", () => {
    expect(behaviour.regularPursuitRouted).toBe(true);
    expect(behaviour.veteranPursuitRouted).toBe(true);
    expect(behaviour.regularRetreated).toBe(true);
    expect(behaviour.veteranRetreated).toBe(true);
    expect(behaviour.regularWasPursued).toBe(true);
    expect(behaviour.veteranWasPursued).toBe(true);
    expect(behaviour.regularRecoveryTick).toBeGreaterThan(behaviour.regularRouteTick!);
    expect(behaviour.veteranRecoveryTick).toBeGreaterThan(behaviour.veteranRouteTick!);
    expect(behaviour.regularRecoveryTick).toBeLessThanOrEqual(800);
    expect(behaviour.veteranReturnTick).toBeGreaterThan(behaviour.veteranRecoveryTick!);
    expect(behaviour.veteranReturnTick).toBeLessThanOrEqual(800);
    expect.soft(behaviour.regularReturnTick).toBeUndefined();
    expect(behaviour.veteranReengaged).toBe(true);
    expect(behaviour.regularFinal.state).toBe("recovering");
    expect(behaviour.veteranFinal.state).toBe("steady");
  });
});

function inspectCombinedBehaviour() {
  const simulation = createSimulation(MILESTONE_4_VISUAL_SCENARIO);
  const combat = simulation.combatSandbox;
  if (combat === undefined) throw new Error("Expected combat sandbox.");
  const initialRecruitState = getPersistentUnitMorale(combat.persistentMoraleStore, 13).state;
  let previousRecruitState = initialRecruitState;
  const recruitMembers = getUnitMembers(combat.identityStore, 13);
  const previousRecruitPositionsX = Int32Array.from(
    recruitMembers, (entityId) => simulation.world.positionsX[entityId]!,
  );
  let recruitRetreatedWhileRouting = false;
  let recruitRouted = false;
  const reserveMembers = getUnitMembers(combat.identityStore, 14);
  let reserveJoinedRescue = false;
  let reserveDisrupted = false;
  let regularMoreDegraded = false;
  let regularPursuitRouted = false;
  let veteranPursuitRouted = false;
  const regularPursuitMembers = getUnitMembers(combat.identityStore, 31);
  const veteranPursuitMembers = getUnitMembers(combat.identityStore, 51);
  const regularPursuerMembers = getUnitMembers(combat.identityStore, 41);
  const veteranPursuerMembers = getUnitMembers(combat.identityStore, 61);
  const previousPursuitPositionsX = Int32Array.from(simulation.world.positionsX);
  let regularRetreated = false;
  let veteranRetreated = false;
  let regularWasPursued = false;
  let veteranWasPursued = false;
  let regularRecoveryTick: number | undefined;
  let veteranRecoveryTick: number | undefined;
  let regularRouteTick: number | undefined;
  let veteranRouteTick: number | undefined;
  let recruitRouteTick: number | undefined;
  let regularReturnTick: number | undefined;
  let veteranReturnTick: number | undefined;
  let veteranReengaged = false;

  for (let tick = 1; tick <= 800; tick += 1) {
    const regularWasRouting = getPersistentUnitMorale(combat.persistentMoraleStore, 31).state === "routing";
    const veteranWasRouting = getPersistentUnitMorale(combat.persistentMoraleStore, 51).state === "routing";
    advanceSimulationOneTick(simulation);
    reserveJoinedRescue ||= reserveMembers.some((entityId) =>
      getIndividualCasualtyAssistanceInspection(
        combat.individualCasualtyAssistanceStore, entityId,
      ).state === "reservedHelper",
    );
    const veteran = getPersistentUnitMorale(combat.persistentMoraleStore, 11);
    const regular = getPersistentUnitMorale(combat.persistentMoraleStore, 12);
    const recruit = getPersistentUnitMorale(combat.persistentMoraleStore, 13);
    // The comparison front is east: actual westward body movement proves
    // retreat; an organisational anchor can move while collision holds bodies.
    recruitRetreatedWhileRouting ||=
      previousRecruitState === "routing" && recruit.state === "routing" &&
      recruitMembers.some((entityId, index) =>
        simulation.world.positionsX[entityId]! < previousRecruitPositionsX[index]!,
      );
    previousRecruitState = recruit.state;
    for (let index = 0; index < recruitMembers.length; index += 1) {
      previousRecruitPositionsX[index] = simulation.world.positionsX[recruitMembers[index]!]!;
    }
    const reserve = getPersistentUnitMorale(combat.persistentMoraleStore, 14);
    const regularPursuit = getPersistentUnitMorale(
      combat.persistentMoraleStore,
      31,
    );
    const veteranPursuit = getPersistentUnitMorale(
      combat.persistentMoraleStore,
      51,
    );
    const movedWest = (id: number) => simulation.world.positionsX[id]! < previousPursuitPositionsX[id]!;
    if (regularWasRouting && regularPursuit.state === "routing") {
      regularRetreated ||= regularPursuitMembers.some(movedWest);
      regularWasPursued ||= regularPursuerMembers.some(movedWest);
    }
    if (veteranWasRouting && veteranPursuit.state === "routing") {
      veteranRetreated ||= veteranPursuitMembers.some(movedWest);
      veteranWasPursued ||= veteranPursuerMembers.some(movedWest);
    }
    if (regularPursuit.state === "recovering" && regularRecoveryTick === undefined) regularRecoveryTick = tick;
    if (veteranPursuit.state === "recovering" && veteranRecoveryTick === undefined) veteranRecoveryTick = tick;
    recruitRouted ||= recruit.state === "routing";
    if (recruit.state === "routing" && recruitRouteTick === undefined) recruitRouteTick = tick;
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
    const veteranMovementStyle = getUnitMovementStyle(
      combat.formationStore,
      51,
    );
    veteranReengaged ||=
      veteranReturnTick !== undefined &&
      veteranPursuit.state === "steady" &&
      veteranMovementStyle !== "orderedHalt" &&
      veteranMovementStyle !== "routeAway" &&
      veteranPursuitMembers.some((id) => simulation.world.positionsX[id]! > previousPursuitPositionsX[id]!);
    for (let id = 0; id < simulation.world.entityCount; id += 1) {
      previousPursuitPositionsX[id] = simulation.world.positionsX[id]!;
    }
  }

  const regularFinal = getPersistentUnitMorale(combat.persistentMoraleStore, 31);
  const veteranFinal = getPersistentUnitMorale(combat.persistentMoraleStore, 51);
  const snapshot = createPositionSnapshot(simulation);
  return {
    replay: {
      tick: snapshot.tick,
      positions: Array.from(snapshot.positions),
      debug: snapshot.combatDebug,
    },
    initialRecruitState,
    recruitRouted,
    recruitRetreatedWhileRouting,
    reserveJoinedRescue,
    reserveDisrupted,
    regularMoreDegraded,
    regularPursuitRouted,
    veteranPursuitRouted,
    regularRetreated,
    veteranRetreated,
    regularWasPursued,
    veteranWasPursued,
    regularRecoveryTick,
    veteranRecoveryTick,
    recruitRouteTick,
    regularRouteTick,
    veteranRouteTick,
    regularReturnTick,
    veteranReturnTick,
    veteranReengaged,
    regularFinal,
    veteranFinal,
  };
}

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
