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
  it("keeps the regular pursuit lifecycle deterministic, coherent, and intact", () => {
    const first = runPursuitScenario(PURSUIT_REGULAR_SCENARIO);
    const second = runPursuitScenario(PURSUIT_REGULAR_SCENARIO);

    expect(first).toEqual(second);
    expect(first.blueRouted).toBe(true);
    expect(first.redAdvancedDuringBlueRouting).toBe(true);
    expect(first.minimumAnchorSeparationWhileRouting).toBeGreaterThan(12);
    expect(first.recoveryStartedTick).toBeDefined();
    expect(first.steadyTick).toBeDefined();
    expect(first.resumedStoredOrderTick).toBeGreaterThanOrEqual(first.steadyTick!);
    expect(first.advancedBeforeSteady).toBe(false);
    expect(first.memberCountBefore).toBe(20);
    expect(first.memberCountAfter).toBe(20);
    expect(first.entityCountAfter).toBe(20);
  });

  it("lets the veteran shed routing pressure sooner and re-engage before regular", () => {
    const veteran = runPursuitScenario(PURSUIT_VETERAN_SCENARIO);
    const regular = runPursuitScenario(PURSUIT_REGULAR_SCENARIO);

    expect(veteran.blueRouted).toBe(true);
    expect(veteran.steadyTick).toBeLessThan(regular.steadyTick!);
    expect(veteran.resumedStoredOrderTick).toBeLessThan(
      regular.resumedStoredOrderTick!,
    );
  });
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
  let redAdvancedDuringBlueRouting = false;
  let minimumAnchorSeparationWhileRouting = Number.POSITIVE_INFINITY;
  let advancedBeforeSteady = false;
  let recoveryStartedTick: number | undefined;
  let steadyTick: number | undefined;
  let resumedStoredOrderTick: number | undefined;
  let previousBlueAnchor = getUnitAnchor(combat.formationStore, BLUE_UNIT_ID);
  let previousRedAnchor = getUnitAnchor(combat.formationStore, RED_UNIT_ID);

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
    if (blueStateBefore === "routing" && redAnchor.x < previousRedAnchor.x) {
      redAdvancedDuringBlueRouting = true;
    }
    if (blueStateBefore === "routing" || blueStateBefore === "recovering") {
      minimumAnchorSeparationWhileRouting = Math.min(
        minimumAnchorSeparationWhileRouting,
        Math.hypot(blueAnchor.x - redAnchor.x, blueAnchor.y - redAnchor.y),
      );
    }
    if (blueStateBefore !== "steady" && blueAnchor.x > previousBlueAnchor.x) {
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
    previousRedAnchor = redAnchor;
  }

  return {
    blueRouted,
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
