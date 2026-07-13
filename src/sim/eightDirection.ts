export type EightDirectionName =
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest"
  | "north"
  | "northeast";

export type EightDirectionComponent = -1 | 0 | 1;

export interface EightDirection {
  readonly name: EightDirectionName;
  readonly octantIndex: number;
  readonly x: EightDirectionComponent;
  readonly y: EightDirectionComponent;
}

const AXIS_DOMINANCE_NUMERATOR = 2;
const AXIS_DOMINANCE_DENOMINATOR = 1;
const OCTANT_COUNT = 8;

const EAST: EightDirection = Object.freeze({
  name: "east",
  octantIndex: 0,
  x: 1,
  y: 0,
});
const SOUTHEAST: EightDirection = Object.freeze({
  name: "southeast",
  octantIndex: 1,
  x: 1,
  y: 1,
});
const SOUTH: EightDirection = Object.freeze({
  name: "south",
  octantIndex: 2,
  x: 0,
  y: 1,
});
const SOUTHWEST: EightDirection = Object.freeze({
  name: "southwest",
  octantIndex: 3,
  x: -1,
  y: 1,
});
const WEST: EightDirection = Object.freeze({
  name: "west",
  octantIndex: 4,
  x: -1,
  y: 0,
});
const NORTHWEST: EightDirection = Object.freeze({
  name: "northwest",
  octantIndex: 5,
  x: -1,
  y: -1,
});
const NORTH: EightDirection = Object.freeze({
  name: "north",
  octantIndex: 6,
  x: 0,
  y: -1,
});
const NORTHEAST: EightDirection = Object.freeze({
  name: "northeast",
  octantIndex: 7,
  x: 1,
  y: -1,
});

export const EIGHT_DIRECTIONS: readonly EightDirection[] = Object.freeze([
  EAST,
  SOUTHEAST,
  SOUTH,
  SOUTHWEST,
  WEST,
  NORTHWEST,
  NORTH,
  NORTHEAST,
]);

export function quantizeEightDirection(
  vectorX: number,
  vectorY: number,
): EightDirection {
  assertSafeInteger(vectorX, "vectorX");
  assertSafeInteger(vectorY, "vectorY");

  const absoluteX = Math.abs(vectorX);
  const absoluteY = Math.abs(vectorY);
  if (absoluteX === 0 && absoluteY === 0) {
    throw new RangeError("Eight-direction vector cannot be (0, 0).");
  }

  const signX = signComponent(vectorX);
  const signY = signComponent(vectorY);
  if (
    absoluteX * AXIS_DOMINANCE_DENOMINATOR >=
    absoluteY * AXIS_DOMINANCE_NUMERATOR
  ) {
    return signX > 0 ? EAST : WEST;
  }
  if (
    absoluteY * AXIS_DOMINANCE_DENOMINATOR >=
    absoluteX * AXIS_DOMINANCE_NUMERATOR
  ) {
    return signY > 0 ? SOUTH : NORTH;
  }

  if (signX > 0 && signY > 0) return SOUTHEAST;
  if (signX < 0 && signY > 0) return SOUTHWEST;
  if (signX < 0 && signY < 0) return NORTHWEST;
  return NORTHEAST;
}

export function tryQuantizeEightDirection(
  vectorX: number,
  vectorY: number,
): EightDirection | undefined {
  if (vectorX === 0 && vectorY === 0) return undefined;
  return quantizeEightDirection(vectorX, vectorY);
}

export function areSameOrAdjacentEightDirections(
  left: EightDirection,
  right: EightDirection,
): boolean {
  return areEightDirectionsWithinOctants(left, right, 1);
}

export function areEightDirectionsWithinOctants(
  left: EightDirection,
  right: EightDirection,
  maximumOctantDistance: number,
): boolean {
  assertNonNegativeInteger(maximumOctantDistance, "maximumOctantDistance");
  return (
    getEightDirectionOctantDistance(left, right) <= maximumOctantDistance
  );
}

export function getEightDirectionOctantDistance(
  left: EightDirection,
  right: EightDirection,
): number {
  const difference = Math.abs(left.octantIndex - right.octantIndex);
  return Math.min(difference, OCTANT_COUNT - difference);
}

function signComponent(value: number): EightDirectionComponent {
  if (value < 0) return -1;
  if (value > 0) return 1;
  return 0;
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer.`);
  }
}

function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}
