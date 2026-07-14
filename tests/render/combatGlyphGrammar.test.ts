import { describe, expect, it } from "vitest";

import {
  ARMOUR_GLYPH_SPECS,
  SHIELD_GLYPH_SPECS,
  WEAPON_GLYPH_SPECS,
  getArmourGlyphSpec,
  getShieldGlyphSpec,
  getWeaponGlyphSpec,
  shouldRenderPreferredDistanceMarker,
} from "../../src/render/combatGlyphGrammar";
import type {
  IndividualArmourCategory,
  IndividualWeaponCategory,
} from "../../src/sim/individualCombatProfile";

const WEAPON_CATEGORIES: readonly IndividualWeaponCategory[] = [
  "unarmed",
  "dagger",
  "oneHanded",
  "greatWeapon",
  "polearm",
  "pike",
  "thrown",
  "ranged",
  "rod",
  "staff",
];

const ARMOUR_CATEGORIES: readonly IndividualArmourCategory[] = [
  "none",
  "light",
  "medium",
  "heavy",
  "mageArmour",
];

describe("combat glyph grammar", () => {
  it("selects an exhaustive weapon glyph for every weapon category", () => {
    expect(Object.keys(WEAPON_GLYPH_SPECS).sort()).toEqual(
      [...WEAPON_CATEGORIES].sort(),
    );
    for (const category of WEAPON_CATEGORIES) {
      expect(getWeaponGlyphSpec(category).category).toBe(category);
    }
  });

  it("keeps weapon glyph lengths readable relative to reach class", () => {
    expect(getWeaponGlyphSpec("pike").length).toBeGreaterThan(
      getWeaponGlyphSpec("polearm").length,
    );
    expect(getWeaponGlyphSpec("polearm").length).toBeGreaterThan(
      getWeaponGlyphSpec("oneHanded").length,
    );
    expect(getWeaponGlyphSpec("dagger").length).toBeLessThan(
      getWeaponGlyphSpec("oneHanded").length,
    );
    expect(getWeaponGlyphSpec("unarmed").length).toBe(0);
  });

  it("omits the preferred-distance marker when the preferred distance is zero", () => {
    expect(shouldRenderPreferredDistanceMarker(0)).toBe(false);
    expect(shouldRenderPreferredDistanceMarker(4)).toBe(true);
  });

  it("uses distinct buckler and shield coverage widths and hides unheld shields", () => {
    expect(SHIELD_GLYPH_SPECS.buckler.coverageOctants).toBe(3);
    expect(SHIELD_GLYPH_SPECS.shield.coverageOctants).toBe(5);
    expect(SHIELD_GLYPH_SPECS.shield.coverageOctants).toBeGreaterThan(
      SHIELD_GLYPH_SPECS.buckler.coverageOctants,
    );
    expect(getShieldGlyphSpec("buckler", true)?.category).toBe("buckler");
    expect(getShieldGlyphSpec("shield", true)?.category).toBe("shield");
    expect(getShieldGlyphSpec("shield", false)).toBeUndefined();
    expect(getShieldGlyphSpec("none", true)).toBeUndefined();
  });

  it("maps every armour category to a distinct diagnostic style", () => {
    expect(Object.keys(ARMOUR_GLYPH_SPECS).sort()).toEqual(
      [...ARMOUR_CATEGORIES].sort(),
    );
    const styles = ARMOUR_CATEGORIES.map(
      (category) => getArmourGlyphSpec(category).style,
    );
    expect(new Set(styles).size).toBe(ARMOUR_CATEGORIES.length);
  });
});
