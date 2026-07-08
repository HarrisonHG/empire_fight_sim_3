import { describe, expect, it } from "vitest";

import { SeededRng } from "../../src/sim/rng";

describe("SeededRng", () => {
  it("matches the locked xorshift32 sequence", () => {
    const rng = new SeededRng(1);

    expect(Array.from({ length: 5 }, () => rng.nextUint32())).toEqual([
      270_369,
      67_634_689,
      2_647_435_461,
      307_599_695,
      2_398_689_233,
    ]);
  });

  it("normalizes a zero seed to a stable non-zero sequence", () => {
    const first = new SeededRng(0);
    const second = new SeededRng(0);

    expect(first.nextUint32()).toBe(1_359_758_873);
    expect(second.nextUint32()).toBe(1_359_758_873);
    expect(first.state).not.toBe(0);
  });

  it("returns integers within inclusive bounds", () => {
    const rng = new SeededRng(0x1234_5678);

    for (let index = 0; index < 1_000; index += 1) {
      const value = rng.nextIntInclusive(-3, 3);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
    }
  });
});
