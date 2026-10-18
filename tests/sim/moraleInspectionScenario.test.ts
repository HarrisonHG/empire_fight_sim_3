import { describe, expect, it } from "vitest";

import { MORALE_INSPECTION_SCENARIO } from "../../src/content/moraleInspectionScenario";
import {
  getIndividualMovementMode,
  getUnitAnchor,
  getUnitMovementStyle,
} from "../../src/sim/formationBehaviour";
import { getIndividualCasualtyAssistanceInspection } from "../../src/sim/individualCasualtyAssistance";
import { isIndividualCharacterActive } from "../../src/sim/individualCasualtyLifecycle";
import { isIndividualOrdinaryParticipationEligible } from "../../src/sim/individualOrdinaryParticipation";
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
const RUN_TICKS = 800;

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

  it("replays the lifecycle-filtered morale timeline with an active physical front", () => {
    const first = runInspectionScenario();
    const second = runInspectionScenario();

    expect(first).toEqual(second);
    expect(first.initialUnitIds).toEqual([11, 12, 13, 14, 21, 22, 23]);
    expect(first.initialEntityCount).toBe(70);
    expect(first.memberCount).toBe(70);
    expect(first.veteranRouted).toBe(false);
    expect(first.regularSeverelyDegraded).toBe(true);
    expect(first.regularOutperformedVeteran).toBe(true);
    // Resolved collision/gathering permits the retained fleeing/recovery
    // lifecycle again; the former shaken-only expectations hid that contract.
    expect(first.initialRecruitState).toBe("steady");
    expect(first.recruitRouted).toBe(true);
    expect(first.firstRouteTick).toBeGreaterThan(0);
    expect(first.physicalFleeTick).toBeGreaterThan(first.firstRouteTick!);
    expect(first.physicalFleeTick).toBeLessThan(first.recoveryStartedTick!);
    expect(first.recoveryStartedTick).toBeGreaterThan(first.firstRouteTick!);
    expect(first.steadyReturnTick).toBeGreaterThan(first.recoveryStartedTick!);
    expect(first.steadyReturnTick).toBeLessThanOrEqual(RUN_TICKS);
    expect(first.finalRecruitState).toBe("steady");
    expect(first.reservePassThroughContagion).toBe(false);
    expect(first.reserveDisrupted).toBe(false);
    expect(first.reserveRouted).toBe(false);
    expect(first.recruitRecovered).toBe(true);
    expect(first.recruitCompletedRecovery).toBe(true);
    expect(first.recruitRecoveryTicks).toBeGreaterThan(0);
    expect(first.continuingRecoveryTicks).toBeGreaterThan(0);
    expect(first.recoveringAnchorHeld).toBe(true);
    expect(first.recoveringMovementSuspended).toBe(true);
    expect(first.recoveringMembersReformed).toBe(true);
    expect(first.finalEntityCount).toBe(70);
    expect(first.finalMemberCount).toBe(70);
  }, 10_000);
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
  const initialRecruitState = getPersistentUnitMorale(combat.persistentMoraleStore, RECRUIT).state;
  const recruitMembers = getUnitMembers(combat.identityStore, RECRUIT);
  const isUnassistedActive = (entityId: number) =>
    isIndividualCharacterActive(combat.individualCasualtyLifecycleStore, entityId) &&
    getIndividualCasualtyAssistanceInspection(
      combat.individualCasualtyAssistanceStore, entityId,
    ).state === "none";
  let veteranRouted = false;
  let regularSeverelyDegraded = false;
  let regularOutperformedVeteran = false;
  let recruitRouted = false;
  let recruitRecovered = false;
  let recoveringAnchorHeld = true;
  let recoveringMovementSuspended = true;
  let recoveringMembersReformed = false;
  let reservePassThroughContagion = false;
  let reserveDisrupted = false;
  let reserveRouted = false;
  let recruitCompletedRecovery = false;
  let recruitRecoveryTicks = 0;
  let continuingRecoveryTicks = 0;
  let firstRouteTick: number | undefined;
  let physicalFleeTick: number | undefined;
  let recoveryStartedTick: number | undefined;
  let steadyReturnTick: number | undefined;

  for (let tick = 1; tick <= RUN_TICKS; tick += 1) {
    const previousRecruitState = getPersistentUnitMorale(
      combat.persistentMoraleStore, RECRUIT,
    ).state;
    const previousAnchor = getUnitAnchor(combat.formationStore, RECRUIT);
    const preTickRecruitPositions = recruitMembers.map((entityId) => ({
      x: simulation.world.positionsX[entityId]!,
      y: simulation.world.positionsY[entityId]!,
      unassistedActive: isUnassistedActive(entityId),
    }));
    advanceSimulationOneTick(simulation);
    const veteran = getPersistentUnitMorale(combat.persistentMoraleStore, VETERAN);
    const regular = getPersistentUnitMorale(combat.persistentMoraleStore, REGULAR);
    const recruit = getPersistentUnitMorale(combat.persistentMoraleStore, RECRUIT);
    const reserve = getPersistentUnitMorale(combat.persistentMoraleStore, RESERVE);
    // The tick-start participation projection identifies actual ordinary movers;
    // also exclude anyone entering/leaving rescue or casualty roles this tick.
    const isOrdinaryMover = (entityId: number, index: number) =>
      preTickRecruitPositions[index]!.unassistedActive &&
      isUnassistedActive(entityId) &&
      isIndividualOrdinaryParticipationEligible(
        combat.individualOrdinaryParticipationSnapshot, entityId,
      );
    veteranRouted ||= veteran.state === "routing";
    regularSeverelyDegraded ||=
      regular.state === "shaken" || regular.state === "wavering";
    regularOutperformedVeteran ||=
      moraleRank(regular.state) > moraleRank(veteran.state);
    recruitRouted ||= recruit.state === "routing";
    recruitRecovered ||= recruit.state === "recovering";
    if (recruit.state === "routing" && firstRouteTick === undefined) firstRouteTick = tick;
    if (
      previousRecruitState === "routing" && recruit.state === "routing" &&
      getUnitMovementStyle(combat.formationStore, RECRUIT) === "routeAway" &&
      recruitMembers.some((entityId, index) =>
        isOrdinaryMover(entityId, index) &&
        // Opposition is east: westward body displacement proves fleeing.
        simulation.world.positionsX[entityId]! < preTickRecruitPositions[index]!.x,
      ) && physicalFleeTick === undefined
    ) {
      physicalFleeTick = tick;
    }
    reserveDisrupted ||= reserve.state !== "steady";
    reserveRouted ||= reserve.state === "routing";
    if (recruit.state === "recovering") {
      recoveryStartedTick ??= tick;
      recruitRecoveryTicks += 1;
    } else if (recoveryStartedTick !== undefined && recruit.state === "steady") {
      recruitCompletedRecovery = true;
      steadyReturnTick ??= tick;
    }
    // Observe only movement that both starts and ends in recovery. Entry still
    // uses routing movement; steady return may resume the stored advance order.
    if (previousRecruitState === "recovering" && recruit.state === "recovering") {
      continuingRecoveryTicks += 1;
      const anchor = getUnitAnchor(combat.formationStore, RECRUIT);
      recoveringAnchorHeld &&=
        anchor.x === previousAnchor.x && anchor.y === previousAnchor.y;
      recoveringMovementSuspended &&=
        getUnitMovementStyle(combat.formationStore, RECRUIT) === "orderedHalt";
      recoveringMembersReformed ||= recruitMembers.some((entityId, index) =>
        isOrdinaryMover(entityId, index) &&
        getIndividualMovementMode(combat.formationStore, entityId) ===
          "moveToFormationSlot" &&
        (simulation.world.positionsX[entityId] !== preTickRecruitPositions[index]!.x ||
          simulation.world.positionsY[entityId] !== preTickRecruitPositions[index]!.y)
      );
    }
    const reserveContagion = combat.routingContagionSummaries.find(
      (summary) => summary.unitId === RESERVE,
    );
    reservePassThroughContagion ||=
      reserveContagion !== undefined && reserveContagion.passThroughRouterUnitIds.length > 0;
  }

  const snapshot = createPositionSnapshot(simulation);
  return {
    initialUnitIds,
    initialEntityCount: initial.entityCount,
    memberCount,
    initialRecruitState,
    firstRouteTick,
    physicalFleeTick,
    recoveryStartedTick,
    steadyReturnTick,
    finalRecruitState: getPersistentUnitMorale(combat.persistentMoraleStore, RECRUIT).state,
    veteranRouted,
    regularSeverelyDegraded,
    regularOutperformedVeteran,
    recruitRouted,
    recruitRecovered,
    recruitCompletedRecovery,
    recruitRecoveryTicks,
    continuingRecoveryTicks,
    recoveringAnchorHeld,
    recoveringMovementSuspended,
    recoveringMembersReformed,
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
