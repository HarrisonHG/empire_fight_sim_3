import { describe, expect, it } from "vitest";

import {
  createEnergyVisualGlyphSpec,
  ENERGY_VISUAL_COLOR_BY_BAND,
  ENERGY_VISUAL_RING_START_ANGLE,
} from "../../src/render/energyVisualGrammar";

describe("energy world glyph grammar", () => {
  it.each([
    ["fresh", ENERGY_VISUAL_COLOR_BY_BAND.fresh],
    ["working", ENERGY_VISUAL_COLOR_BY_BAND.working],
    ["winded", ENERGY_VISUAL_COLOR_BY_BAND.winded],
    ["spent", ENERGY_VISUAL_COLOR_BY_BAND.spent],
  ] as const)("maps %s to its stable ring colour", (band, color) => {
    expect(createEnergyVisualGlyphSpec({
      currentEnergy: 50,
      maximumEnergy: 100,
      energyBand: band,
    })).toMatchObject({ visible: true, ratio: 0.5, band, color });
  });

  it("uses a circumference arc and distinct expenditure/recovery pips", () => {
    const spent = createEnergyVisualGlyphSpec({
      currentEnergy: 25,
      maximumEnergy: 100,
      energyBand: "winded",
      energyExpenditureAppliedThisTick: 4,
    });
    expect(spent).toMatchObject({
      startAngle: ENERGY_VISUAL_RING_START_ANGLE,
      endAngle: ENERGY_VISUAL_RING_START_ANGLE + Math.PI / 2,
      change: "expenditure",
    });
    expect(createEnergyVisualGlyphSpec({
      currentEnergy: 25,
      maximumEnergy: 100,
      energyBand: "winded",
      energyRecoveryAppliedThisTick: 4,
    }).change).toBe("recovery");
  });

  it("hides absent or invalid evidence instead of inventing visual state", () => {
    expect(createEnergyVisualGlyphSpec({}).visible).toBe(false);
    expect(createEnergyVisualGlyphSpec({
      currentEnergy: 101,
      maximumEnergy: 100,
      energyBand: "fresh",
    }).visible).toBe(false);
  });
});
