import {
  advanceFormationOneTick,
  computeSlotWorldPosition,
  getIndividualMovementMode,
  getIndividualPressure,
  getUnitAnchor,
  getUnitCohesion,
  getUnitHeading,
  getUnitMovementStyle,
  getUnitOrder,
} from "../../../src/sim/formationBehaviour";
import { getUnitIdForEntity } from "../../../src/sim/unitIdentity";
import type {
  FormationReplay,
  FormationReplayFrame,
  FormationReplayScenario,
  FormationReplaySetup,
} from "./replayTypes";

export function recordFormationReplay(
  scenario: FormationReplayScenario,
): FormationReplay {
  const setup = scenario.setup();
  const frames: FormationReplayFrame[] = [recordFrame(setup, 0, [])];

  for (let tick = 1; tick <= scenario.tickCount; tick += 1) {
    const result = advanceFormationOneTick(
      setup.world,
      setup.identity,
      setup.store,
    );
    frames.push(recordFrame(setup, tick, result.events));
  }

  return {
    scenario,
    worldBounds: setup.world.bounds,
    units: setup.units,
    frames,
  };
}

function recordFrame(
  setup: FormationReplaySetup,
  tick: number,
  events: FormationReplayFrame["events"],
): FormationReplayFrame {
  return {
    tick,
    units: setup.units.map((unit) => {
      const anchor = getUnitAnchor(setup.store, unit.unitId);
      const heading = getUnitHeading(setup.store, unit.unitId);
      return {
        unitId: unit.unitId,
        anchorX: anchor.x,
        anchorY: anchor.y,
        headingX: heading.x,
        headingY: heading.y,
        order: getUnitOrder(setup.store, unit.unitId),
        style: getUnitMovementStyle(setup.store, unit.unitId),
        cohesion: getUnitCohesion(setup.store, unit.unitId),
      };
    }),
    entities: setup.individuals.map((individual) => ({
      entityId: individual.entityId,
      unitId: getUnitIdForEntity(setup.identity, individual.entityId),
      x: setup.world.positionsX[individual.entityId]!,
      y: setup.world.positionsY[individual.entityId]!,
      pressure: getIndividualPressure(setup.store, individual.entityId),
      movementMode: getIndividualMovementMode(
        setup.store,
        individual.entityId,
      ),
    })),
    slots: setup.individuals.map((individual) => {
      const slot = computeSlotWorldPosition(
        setup.store,
        individual.unitId,
        individual.slotRow,
        individual.slotCol,
      );
      return {
        unitId: individual.unitId,
        entityId: individual.entityId,
        slotX: slot.x,
        slotY: slot.y,
      };
    }),
    events,
  };
}
