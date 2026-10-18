import { describe, expect, it } from "vitest";

import {
  PURSUIT_REGULAR_SCENARIO,
  PURSUIT_VETERAN_SCENARIO,
} from "../../src/content/pursuitScenarios";
import { getUnitAnchor } from "../../src/sim/formationBehaviour";
import { getPersistentUnitMorale } from "../../src/sim/persistentMorale";
import {
  advanceSimulationOneTick,
  createSimulation,
} from "../../src/sim/simulation";
import { getUnitIds, getUnitMembers } from "../../src/sim/unitIdentity";

const BLUE_UNIT_ID = 31;
const RED_UNIT_ID = 41;
const RUN_TICKS = 1_200;

describe("Milestone 4H-4 pursuit inspection scenarios", () => {
  it.each([PURSUIT_REGULAR_SCENARIO, PURSUIT_VETERAN_SCENARIO])(
    "starts the pursuit encounter with legal standing placement",
    (scenario) => {
      expect(scenario.combatSandbox?.requireLegalInitialHardStandingPlacement).toBe(true);
      // Creation validates every hard body; the old spacing-6 fixture overlapped.
      expect(() => createSimulation(scenario)).not.toThrow();
      expect(scenario.combatSandbox?.units.map((unit) => unit.memberCount)).toEqual([10, 20]);
    },
  );

  it("keeps the regular physical-front pursuit deterministic and coherent", () => {
    const first = runPursuitScenario(PURSUIT_REGULAR_SCENARIO);
    const second = runPursuitScenario(PURSUIT_REGULAR_SCENARIO);

    expect(first).toEqual(second);
    expect(first.blueRouted).toBe(true);
    expect(first.blueRetreatedWhileRouting).toBe(true);
    expect(first.redAdvancedDuringBlueRouting).toBe(true);
    expect(first.minimumAnchorSeparationWhileRouting).toBeGreaterThan(0);
    expect(first.recoveryStartedTick).toBeGreaterThan(first.firstRouteTick!);
    expect(first.steadyTick).toBeGreaterThan(first.recoveryStartedTick!);
    expect(first.steadyTick).toBeLessThanOrEqual(RUN_TICKS);
    expect(first.resumedStoredOrderTick).toBeGreaterThanOrEqual(first.steadyTick!);
    expect(first.resumedStoredOrderTick).toBeLessThanOrEqual(RUN_TICKS);
    expect(first.advancedBeforeSteady).toBe(false);
    expect(first.memberCountBefore).toBe(30);
    expect(first.memberCountAfter).toBe(30);
    expect(first.entityCountAfter).toBe(30);
  }, 10_000);

  it("retains deterministic experience-sensitive recovery after rescue collision", () => {
    const veteran = runPursuitScenario(PURSUIT_VETERAN_SCENARIO);
    const regular = runPursuitScenario(PURSUIT_REGULAR_SCENARIO);

    expect(veteran.blueRouted).toBe(true);
    expect(veteran.blueRetreatedWhileRouting).toBe(true);
    expect(veteran.redAdvancedDuringBlueRouting).toBe(true);
    expect(regular.blueRouted).toBe(true);
    expect(veteran.steadyTick).toBeGreaterThan(veteran.recoveryStartedTick!);
    expect(veteran.steadyTick).toBeLessThan(regular.steadyTick!);
    expect(regular.steadyTick).toBeLessThanOrEqual(RUN_TICKS);
    expect(veteran.resumedStoredOrderTick).toBeGreaterThanOrEqual(veteran.steadyTick!);
    expect(veteran.resumedStoredOrderTick).toBeLessThanOrEqual(RUN_TICKS);
  }, 10_000);
});

function runPursuitScenario(
  scenario: typeof PURSUIT_REGULAR_SCENARIO,
) {
  const simulation = createSimulation(scenario);
  const combat = simulation.combatSandbox;
  if (combat === undefined) throw new Error("Pursuit scenario requires combat sandbox.");
  const memberCountBefore = getUnitIds(combat.identityStore).flatMap((unitId) =>
    getUnitMembers(combat.identityStore, unitId),
  ).length;
  let blueRouted = false;
  let firstRouteTick: number | undefined;
  let blueRetreatedWhileRouting = false;
  const blueMembers = getUnitMembers(combat.identityStore, BLUE_UNIT_ID);
  const redMembers = getUnitMembers(combat.identityStore, RED_UNIT_ID);
  const previousMemberX = Array.from(simulation.world.positionsX);
  let redAdvancedDuringBlueRouting = false;
  let minimumAnchorSeparationWhileRouting = Number.POSITIVE_INFINITY;
  let advancedBeforeSteady = false;
  let recoveryStartedTick: number | undefined;
  let steadyTick: number | undefined;
  let resumedStoredOrderTick: number | undefined;
  let previousBlueAnchor = getUnitAnchor(combat.formationStore, BLUE_UNIT_ID);

  for (let tick = 1; tick <= RUN_TICKS; tick += 1) {
    const blueStateBefore = getPersistentUnitMorale(
      combat.persistentMoraleStore,
      BLUE_UNIT_ID,
    ).state;
    advanceSimulationOneTick(simulation);
    const blue = getPersistentUnitMorale(
      combat.persistentMoraleStore,
      BLUE_UNIT_ID,
    );
    const blueAnchor = getUnitAnchor(combat.formationStore, BLUE_UNIT_ID);
    const redAnchor = getUnitAnchor(combat.formationStore, RED_UNIT_ID);
    blueRouted ||= blue.state === "routing";
    if (blue.state === "routing" && firstRouteTick === undefined) firstRouteTick = tick;
    if (blueStateBefore === "routing" && blue.state === "routing") {
      blueRetreatedWhileRouting ||= blueMembers.some((id) =>
        simulation.world.positionsX[id]! < previousMemberX[id]!,
      );
      redAdvancedDuringBlueRouting ||= redMembers.some((id) =>
        simulation.world.positionsX[id]! < previousMemberX[id]!,
      );
    }
    if (blueStateBefore === "routing" || blueStateBefore === "recovering") {
      minimumAnchorSeparationWhileRouting = Math.min(
        minimumAnchorSeparationWhileRouting,
        Math.hypot(blueAnchor.x - redAnchor.x, blueAnchor.y - redAnchor.y),
      );
    }
    if (
      (blueStateBefore === "routing" || blueStateBefore === "recovering") &&
      blue.state !== "steady" && blueAnchor.x > previousBlueAnchor.x
    ) {
      advancedBeforeSteady = true;
    }
    if (blue.state === "recovering" && recoveryStartedTick === undefined) {
      recoveryStartedTick = tick;
    }
    if (blue.state === "steady" && blueRouted && steadyTick === undefined) {
      steadyTick = tick;
    }
    if (
      steadyTick !== undefined &&
      blueAnchor.x > previousBlueAnchor.x &&
      resumedStoredOrderTick === undefined
    ) {
      resumedStoredOrderTick = tick;
    }
    previousBlueAnchor = blueAnchor;
    for (let id = 0; id < simulation.world.entityCount; id += 1) {
      previousMemberX[id] = simulation.world.positionsX[id]!;
    }
  }

  return {
    blueRouted,
    firstRouteTick,
    blueRetreatedWhileRouting,
    redAdvancedDuringBlueRouting,
    minimumAnchorSeparationWhileRouting,
    advancedBeforeSteady,
    recoveryStartedTick,
    steadyTick,
    resumedStoredOrderTick,
    memberCountBefore,
    memberCountAfter: getUnitIds(combat.identityStore).flatMap((unitId) =>
      getUnitMembers(combat.identityStore, unitId),
    ).length,
    entityCountAfter: simulation.world.entityCount,
  };
}
