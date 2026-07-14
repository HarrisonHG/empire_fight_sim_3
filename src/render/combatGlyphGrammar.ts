import type {
  IndividualArmourCategory,
  IndividualShieldCategory,
  IndividualWeaponCategory,
} from "../sim/individualCombatProfile";

export interface WeaponGlyphSpec {
  readonly category: IndividualWeaponCategory;
  readonly length: number;
  readonly marker: "none" | "broad" | "point" | "narrowPoint" | "projectile" | "bow" | "circle" | "doubleEnded";
}

export interface ShieldGlyphSpec {
  readonly category: Exclude<IndividualShieldCategory, "none">;
  readonly coverageOctants: number;
  readonly radius: number;
}

export interface ArmourGlyphSpec {
  readonly category: IndividualArmourCategory;
  readonly style: "plain" | "thinRing" | "doubleRing" | "thickRing" | "segmentedRing";
}

export const WEAPON_GLYPH_SPECS: Readonly<
  Record<IndividualWeaponCategory, WeaponGlyphSpec>
> = Object.freeze({
  unarmed: Object.freeze({ category: "unarmed", length: 0, marker: "none" }),
  dagger: Object.freeze({ category: "dagger", length: 5, marker: "none" }),
  oneHanded: Object.freeze({ category: "oneHanded", length: 8, marker: "none" }),
  greatWeapon: Object.freeze({
    category: "greatWeapon",
    length: 11,
    marker: "broad",
  }),
  polearm: Object.freeze({ category: "polearm", length: 15, marker: "point" }),
  pike: Object.freeze({ category: "pike", length: 19, marker: "narrowPoint" }),
  thrown: Object.freeze({ category: "thrown", length: 7, marker: "projectile" }),
  ranged: Object.freeze({ category: "ranged", length: 7, marker: "bow" }),
  rod: Object.freeze({ category: "rod", length: 8, marker: "circle" }),
  staff: Object.freeze({ category: "staff", length: 14, marker: "doubleEnded" }),
});

export const SHIELD_GLYPH_SPECS: Readonly<
  Record<Exclude<IndividualShieldCategory, "none">, ShieldGlyphSpec>
> = Object.freeze({
  buckler: Object.freeze({
    category: "buckler",
    coverageOctants: 3,
    radius: 7,
  }),
  shield: Object.freeze({
    category: "shield",
    coverageOctants: 5,
    radius: 9,
  }),
});

export const ARMOUR_GLYPH_SPECS: Readonly<
  Record<IndividualArmourCategory, ArmourGlyphSpec>
> = Object.freeze({
  none: Object.freeze({ category: "none", style: "plain" }),
  light: Object.freeze({ category: "light", style: "thinRing" }),
  medium: Object.freeze({ category: "medium", style: "doubleRing" }),
  heavy: Object.freeze({ category: "heavy", style: "thickRing" }),
  mageArmour: Object.freeze({
    category: "mageArmour",
    style: "segmentedRing",
  }),
});

export function getWeaponGlyphSpec(
  category: IndividualWeaponCategory,
): WeaponGlyphSpec {
  return WEAPON_GLYPH_SPECS[category];
}

export function getShieldGlyphSpec(
  category: IndividualShieldCategory,
  shieldHeld: boolean,
): ShieldGlyphSpec | undefined {
  if (!shieldHeld || category === "none") {
    return undefined;
  }
  return SHIELD_GLYPH_SPECS[category];
}

export function getArmourGlyphSpec(
  category: IndividualArmourCategory,
): ArmourGlyphSpec {
  return ARMOUR_GLYPH_SPECS[category];
}

export function shouldRenderPreferredDistanceMarker(distance: number): boolean {
  return distance > 0;
}
