import type {
  FormationSandboxIndividualScenario,
  FormationSandboxUnitScenario,
  SimulationScenario,
} from "../sim/types";

const units: FormationSandboxUnitScenario[] = [];
const individuals: FormationSandboxIndividualScenario[] = [];
let nextEntityId = 0;

addUnit({ unitId: 101, label: "Lane 1: formed march", x: 100, y: 100, count: 3 });
addUnit({
  unitId: 102,
  label: "Lane 2: ordered halt",
  x: 100,
  y: 280,
  count: 3,
  order: "hold",
});

addBlockerLane({
  sourceUnitId: 103,
  blockerUnitId: 104,
  label: "Lane 3: formed detour",
  x: 500,
  y: 100,
  count: 3,
  cohesion: 900,
  confidence: 500,
  blockerCount: 9,
});
addBlockerLane({
  sourceUnitId: 105,
  blockerUnitId: 106,
  label: "Lane 4: loose flow",
  x: 500,
  y: 280,
  count: 3,
  cohesion: 200,
  confidence: 500,
  blockerCount: 9,
  speed: 0,
  memberMaxStep: 2,
});
addBlockerLane({
  sourceUnitId: 107,
  blockerUnitId: 108,
  label: "Lane 5: halt and wait",
  x: 900,
  y: 100,
  count: 1,
  cohesion: 1_000,
  confidence: 100,
  pressure: 4_000,
});
addBlockerLane({
  sourceUnitId: 109,
  blockerUnitId: 110,
  label: "Lane 6: push-through disruption",
  x: 900,
  y: 280,
  count: 3,
  cohesion: 1_000,
  confidence: 950,
  blockerCount: 3,
  blockerCohesion: 700,
});

addUnit({
  unitId: 111,
  label: "Lane 7A: veteran under equal pressure",
  x: 180,
  y: 620,
  count: 5,
  role: "veteran",
  pressure: 500,
  initialOffsetX: -18,
});
addUnit({
  unitId: 112,
  label: "Lane 7B: recruit under equal pressure",
  x: 180,
  y: 820,
  count: 5,
  role: "recruit",
  pressure: 500,
  initialOffsetX: -18,
});

export const MOVEMENT_BEHAVIOUR_SCENARIO: SimulationScenario = Object.freeze({
  seed: 0x2d00,
  entityCount: nextEntityId,
  bounds: Object.freeze({ width: 1_400, height: 1_000 }),
  minSpeedUnitsPerTick: 1,
  maxSpeedUnitsPerTick: 1,
  formationSandbox: Object.freeze({
    kind: "formationSandbox",
    units: Object.freeze(units),
    individuals: Object.freeze(individuals),
  }),
});

interface UnitOptions {
  readonly unitId: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly role?: "recruit" | "regular" | "veteran";
  readonly order?: "advance" | "hold";
  readonly speed?: number;
  readonly cohesion?: number;
  readonly confidence?: number;
  readonly pressure?: number;
  readonly initialOffsetX?: number;
  readonly memberMaxStep?: number;
}

function addUnit(options: UnitOptions): void {
  const memberEntityIds: number[] = [];
  const spacing = 12;
  const centerCol = Math.floor(options.count / 2);
  for (let slotCol = 0; slotCol < options.count; slotCol += 1) {
    const entityId = nextEntityId;
    nextEntityId += 1;
    memberEntityIds.push(entityId);
    individuals.push({
      entityId,
      x: options.x + (options.initialOffsetX ?? 0),
      y: options.y + (slotCol - centerCol) * spacing,
      role: options.role ?? "regular",
      slotRow: 0,
      slotCol,
      memberMaxStep:
        options.memberMaxStep ?? (options.speed === 0 ? 0 : 3),
      ...(options.pressure === undefined ? {} : { pressure: options.pressure }),
      ...(options.confidence === undefined
        ? {}
        : { confidence: options.confidence }),
    });
  }
  units.push({
    unitId: options.unitId,
    label: options.label,
    factionId: 1,
    memberEntityIds,
    anchorX: options.x,
    anchorY: options.y,
    headingX: 1,
    headingY: 0,
    spacing,
    rows: 1,
    cols: options.count,
    unitSpeed: options.speed ?? 1,
    order: options.order ?? "advance",
    ...(options.cohesion === undefined ? {} : { cohesion: options.cohesion }),
  });
}

interface BlockerLaneOptions {
  readonly sourceUnitId: number;
  readonly blockerUnitId: number;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly cohesion: number;
  readonly confidence: number;
  readonly pressure?: number;
  readonly blockerCount?: number;
  readonly blockerCohesion?: number;
  readonly speed?: number;
  readonly memberMaxStep?: number;
}

function addBlockerLane(options: BlockerLaneOptions): void {
  addUnit({
    unitId: options.sourceUnitId,
    label: options.label,
    x: options.x,
    y: options.y,
    count: options.count,
    cohesion: options.cohesion,
    confidence: options.confidence,
    ...(options.pressure === undefined ? {} : { pressure: options.pressure }),
    ...(options.speed === undefined ? {} : { speed: options.speed }),
    ...(options.memberMaxStep === undefined
      ? {}
      : { memberMaxStep: options.memberMaxStep }),
  });
  addUnit({
    unitId: options.blockerUnitId,
    label: `${options.label} allied blocker`,
    x: options.x + 16,
    y: options.y,
    count: options.blockerCount ?? 1,
    order: "hold",
    speed: 0,
    cohesion: options.blockerCohesion ?? 1_000,
  });
}
