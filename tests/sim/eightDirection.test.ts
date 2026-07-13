import { describe, expect, it } from "vitest";

import {
  areSameOrAdjacentEightDirections,
  quantizeEightDirection,
} from "../../src/sim/eightDirection";

describe("eight-direction quantisation", () => {
  it("resolves nearly horizontal vectors horizontally", () => {
    expect(quantizeEightDirection(100, 1)).toMatchObject({
      name: "east",
      x: 1,
      y: 0,
    });
    expect(quantizeEightDirection(-100, 1)).toMatchObject({
      name: "west",
      x: -1,
      y: 0,
    });
  });

  it("resolves nearly vertical vectors vertically using positive Y as south", () => {
    expect(quantizeEightDirection(1, 100)).toMatchObject({
      name: "south",
      x: 0,
      y: 1,
    });
    expect(quantizeEightDirection(1, -100)).toMatchObject({
      name: "north",
      x: 0,
      y: -1,
    });
  });

  it("resolves sufficiently diagonal vectors diagonally", () => {
    expect(quantizeEightDirection(100, 100)).toMatchObject({
      name: "southeast",
      x: 1,
      y: 1,
    });
  });

  it("mirrors diagonal vectors across all quadrants", () => {
    expect(quantizeEightDirection(100, 100).name).toBe("southeast");
    expect(quantizeEightDirection(-100, 100).name).toBe("southwest");
    expect(quantizeEightDirection(-100, -100).name).toBe("northwest");
    expect(quantizeEightDirection(100, -100).name).toBe("northeast");
  });

  it("uses exact 2:1 boundary values as axis directions", () => {
    expect(quantizeEightDirection(100, 50).name).toBe("east");
    expect(quantizeEightDirection(100, 51).name).toBe("southeast");
    expect(quantizeEightDirection(50, 100).name).toBe("south");
    expect(quantizeEightDirection(51, 100).name).toBe("southeast");
    expect(quantizeEightDirection(-100, -50).name).toBe("west");
    expect(quantizeEightDirection(-51, -100).name).toBe("northwest");
  });

  it("rejects the zero vector", () => {
    expect(() => quantizeEightDirection(0, 0)).toThrow(RangeError);
  });

  it("identifies same and adjacent octants", () => {
    const east = quantizeEightDirection(100, 0);
    const southeast = quantizeEightDirection(100, 100);
    const northeast = quantizeEightDirection(100, -100);
    const south = quantizeEightDirection(0, 100);
    const west = quantizeEightDirection(-100, 0);

    expect(areSameOrAdjacentEightDirections(east, east)).toBe(true);
    expect(areSameOrAdjacentEightDirections(east, southeast)).toBe(true);
    expect(areSameOrAdjacentEightDirections(east, northeast)).toBe(true);
    expect(areSameOrAdjacentEightDirections(east, south)).toBe(false);
    expect(areSameOrAdjacentEightDirections(east, west)).toBe(false);
  });
});
