export type IndividualWeaponCategory =
  | "unarmed"
  | "dagger"
  | "oneHanded"
  | "greatWeapon"
  | "polearm"
  | "pike"
  | "thrown"
  | "ranged"
  | "rod"
  | "staff";

export type IndividualAttackMode = "melee" | "thrown" | "ranged" | "magic";
export type IndividualWeaponHandRequirement =
  | "none"
  | "one"
  | "two"
  | "twoWhileFiring";
export type IndividualShieldCategory = "none" | "buckler" | "shield";
export type IndividualShieldCarriedState = "none" | "slung" | "held";
export type IndividualArmourCategory =
  | "none"
  | "light"
  | "medium"
  | "heavy"
  | "mageArmour";

export interface TrustedCombatQualifications {
  readonly hasWeaponMaster: boolean;
  readonly hasShield: boolean;
  readonly hasMarksman: boolean;
  readonly hasThrown: boolean;
  readonly hasAmbidexterity: boolean;
  readonly enduranceLevels: number;
  readonly fortitudeLevels: number;
  readonly hasDreadnought: boolean;
}

/** Trusted permissions only; spell selection and resources remain deferred. */
export interface MagicalCombatCapabilities {
  readonly canUseRod: boolean;
  readonly canUseStaff: boolean;
  readonly canWearMageArmour: boolean;
  readonly canDeliverCombatMagic: boolean;
}

export interface IndividualCombatProfileConfig {
  readonly entityId: number;
  readonly primaryWeapon: IndividualWeaponCategory;
  /** Static stowed alternative. Active switching/dual wielding belongs to 5C. */
  readonly backupWeapon?: IndividualWeaponCategory;
  /** Optional legal subset for thrown-only or magic-only authored equipment. */
  readonly supportedAttackModes?: readonly IndividualAttackMode[];
  readonly shieldCategory: IndividualShieldCategory;
  readonly shieldCarriedState: IndividualShieldCarriedState;
  readonly armourCategory: IndividualArmourCategory;
  readonly hasQualifyingHelmet: boolean;
  readonly qualifications: TrustedCombatQualifications;
  readonly magicalCapabilities: MagicalCombatCapabilities;
  readonly temporaryAlwaysOnHitModifier?: number;
}

export interface IndividualCombatProfile {
  readonly entityId: number;
  readonly primaryWeapon: IndividualWeaponCategory;
  readonly backupWeapon?: IndividualWeaponCategory;
  readonly supportedAttackModes: readonly IndividualAttackMode[];
  /** Deterministic category-relative distance value; 0 means no weapon reach. */
  readonly reach: number;
  readonly handRequirement: IndividualWeaponHandRequirement;
  readonly shieldCategory: IndividualShieldCategory;
  readonly shieldCarriedState: IndividualShieldCarriedState;
  readonly armourCategory: IndividualArmourCategory;
  readonly hasQualifyingHelmet: boolean;
  readonly qualifications: TrustedCombatQualifications;
  readonly magicalCapabilities: MagicalCombatCapabilities;
  readonly temporaryAlwaysOnHitModifier: number;
}

export interface IndividualCombatProfileStore {
  readonly entityCount: number;
}

export interface IndividualCombatProfileStoreConfig {
  readonly entityCount: number;
  readonly profiles: readonly IndividualCombatProfileConfig[];
}

export interface MaximumGlobalHitDerivation {
  readonly baseHits: 2;
  readonly enduranceHits: number;
  readonly armourHits: number;
  readonly helmetHits: number;
  readonly dreadnoughtHits: number;
  readonly temporaryAlwaysOnHits: number;
  readonly maximumGlobalHits: number;
}

interface WeaponTraits {
  readonly supportedAttackModes: readonly IndividualAttackMode[];
  readonly reach: number;
  readonly handRequirement: IndividualWeaponHandRequirement;
}

interface InternalIndividualCombatProfileStore
  extends IndividualCombatProfileStore {
  readonly profiles: readonly IndividualCombatProfile[];
}

const NO_ATTACK_MODES = Object.freeze([] as const);
const MELEE_MODE = Object.freeze(["melee"] as const);
const THROWN_MODES = Object.freeze(["melee", "thrown"] as const);
const RANGED_MODE = Object.freeze(["ranged"] as const);
const IMPLEMENT_MODES = Object.freeze(["melee", "magic"] as const);

const WEAPON_TRAITS: Readonly<Record<IndividualWeaponCategory, WeaponTraits>> =
  Object.freeze({
    unarmed: Object.freeze({
      supportedAttackModes: NO_ATTACK_MODES,
      reach: 0,
      handRequirement: "none",
    }),
    dagger: Object.freeze({
      supportedAttackModes: MELEE_MODE,
      reach: 1,
      handRequirement: "one",
    }),
    oneHanded: Object.freeze({
      supportedAttackModes: MELEE_MODE,
      reach: 2,
      handRequirement: "one",
    }),
    greatWeapon: Object.freeze({
      supportedAttackModes: MELEE_MODE,
      reach: 3,
      handRequirement: "two",
    }),
    polearm: Object.freeze({
      supportedAttackModes: MELEE_MODE,
      reach: 4,
      handRequirement: "two",
    }),
    pike: Object.freeze({
      supportedAttackModes: MELEE_MODE,
      reach: 5,
      handRequirement: "two",
    }),
    thrown: Object.freeze({
      supportedAttackModes: THROWN_MODES,
      reach: 2,
      handRequirement: "one",
    }),
    ranged: Object.freeze({
      supportedAttackModes: RANGED_MODE,
      reach: 6,
      handRequirement: "twoWhileFiring",
    }),
    rod: Object.freeze({
      supportedAttackModes: IMPLEMENT_MODES,
      reach: 2,
      handRequirement: "one",
    }),
    staff: Object.freeze({
      supportedAttackModes: IMPLEMENT_MODES,
      reach: 4,
      handRequirement: "two",
    }),
  });

const ARMOUR_HITS: Readonly<Record<IndividualArmourCategory, number>> =
  Object.freeze({
    none: 0,
    light: 2,
    medium: 3,
    heavy: 4,
    mageArmour: 2,
  });

const WEAPON_CATEGORIES = new Set<string>(Object.keys(WEAPON_TRAITS));
const SHIELD_CATEGORIES = new Set<string>(["none", "buckler", "shield"]);
const SHIELD_STATES = new Set<string>(["none", "slung", "held"]);
const ARMOUR_CATEGORIES = new Set<string>(Object.keys(ARMOUR_HITS));

export function createIndividualCombatProfileStore(
  config: IndividualCombatProfileStoreConfig,
): IndividualCombatProfileStore {
  assertPositiveSafeInteger(config.entityCount, "entityCount");
  if (config.profiles.length !== config.entityCount) {
    throw new RangeError(
      "Individual combat profiles must contain exactly one profile per entity.",
    );
  }

  const profiles: IndividualCombatProfile[] = [];
  const seenEntityIds = new Set<number>();
  for (let index = 0; index < config.profiles.length; index += 1) {
    const profile = config.profiles[index]!;
    assertEntityId(profile.entityId, config.entityCount);
    if (seenEntityIds.has(profile.entityId)) {
      throw new RangeError("Duplicate individual combat profile entity ID.");
    }
    seenEntityIds.add(profile.entityId);
    if (profile.entityId !== index) {
      throw new RangeError(
        "Individual combat profiles must be ordered by contiguous entity ID.",
      );
    }
    validateProfile(profile);
    profiles.push(normalizeProfile(profile));
  }

  return Object.freeze({
    entityCount: config.entityCount,
    profiles: Object.freeze(profiles),
  }) as InternalIndividualCombatProfileStore;
}

export function getIndividualCombatProfile(
  store: IndividualCombatProfileStore,
  entityId: number,
): IndividualCombatProfile {
  const internal = store as InternalIndividualCombatProfileStore;
  assertEntityId(entityId, internal.entityCount);
  return internal.profiles[entityId]!;
}

export function deriveMaximumGlobalHits(
  profile: Pick<
    IndividualCombatProfile,
    | "armourCategory"
    | "hasQualifyingHelmet"
    | "qualifications"
    | "temporaryAlwaysOnHitModifier"
  >,
): MaximumGlobalHitDerivation {
  assertArmourCategory(profile.armourCategory);
  assertNonNegativeSafeInteger(
    profile.qualifications.enduranceLevels,
    "enduranceLevels",
  );
  assertNonNegativeSafeInteger(
    profile.temporaryAlwaysOnHitModifier,
    "temporaryAlwaysOnHitModifier",
  );
  const armourHits = ARMOUR_HITS[profile.armourCategory];
  const helmetHits = profile.hasQualifyingHelmet ? 1 : 0;
  const dreadnoughtHits =
    profile.qualifications.hasDreadnought && profile.armourCategory === "heavy"
      ? 1
      : 0;
  const maximumGlobalHits =
    2 +
    profile.qualifications.enduranceLevels +
    armourHits +
    helmetHits +
    dreadnoughtHits +
    profile.temporaryAlwaysOnHitModifier;
  if (!Number.isSafeInteger(maximumGlobalHits)) {
    throw new RangeError("maximumGlobalHits must be a safe integer.");
  }
  return Object.freeze({
    baseHits: 2,
    enduranceHits: profile.qualifications.enduranceLevels,
    armourHits,
    helmetHits,
    dreadnoughtHits,
    temporaryAlwaysOnHits: profile.temporaryAlwaysOnHitModifier,
    maximumGlobalHits,
  });
}

function validateProfile(profile: IndividualCombatProfileConfig): void {
  assertWeaponCategory(profile.primaryWeapon, "primaryWeapon");
  if (profile.backupWeapon !== undefined) {
    assertWeaponCategory(profile.backupWeapon, "backupWeapon");
  }
  validateSupportedAttackModes(profile);
  assertShieldCategory(profile.shieldCategory);
  assertShieldState(profile.shieldCarriedState);
  assertArmourCategory(profile.armourCategory);
  assertBoolean(profile.hasQualifyingHelmet, "hasQualifyingHelmet");
  assertNonNegativeSafeInteger(
    profile.qualifications.enduranceLevels,
    "enduranceLevels",
  );
  validateTrustedFlags(profile.qualifications, profile.magicalCapabilities);
  assertNonNegativeSafeInteger(
    profile.qualifications.fortitudeLevels,
    "fortitudeLevels",
  );
  assertNonNegativeSafeInteger(
    profile.temporaryAlwaysOnHitModifier ?? 0,
    "temporaryAlwaysOnHitModifier",
  );

  validateWeaponPermission(
    profile.primaryWeapon,
    profile.qualifications,
    profile.magicalCapabilities,
  );
  if (profile.backupWeapon !== undefined) {
    validateWeaponPermission(
      profile.backupWeapon,
      profile.qualifications,
      profile.magicalCapabilities,
    );
  }
  validateShield(profile);
  if (
    profile.armourCategory === "mageArmour" &&
    !profile.magicalCapabilities.canWearMageArmour
  ) {
    throw new RangeError(
      "mageArmour requires the trusted mage-armour capability.",
    );
  }
}

function validateWeaponPermission(
  weapon: IndividualWeaponCategory,
  qualifications: TrustedCombatQualifications,
  magicalCapabilities: MagicalCombatCapabilities,
): void {
  if (
    (weapon === "greatWeapon" || weapon === "polearm" || weapon === "pike") &&
    !qualifications.hasWeaponMaster
  ) {
    throw new RangeError(`${weapon} requires trusted Weapon Master.`);
  }
  if (weapon === "thrown" && !qualifications.hasThrown) {
    throw new RangeError("thrown requires the trusted Thrown qualification.");
  }
  if (weapon === "ranged" && !qualifications.hasMarksman) {
    throw new RangeError("ranged requires the trusted Marksman qualification.");
  }
  if (weapon === "rod" && !magicalCapabilities.canUseRod) {
    throw new RangeError("rod requires the trusted rod capability.");
  }
  if (weapon === "staff" && !magicalCapabilities.canUseStaff) {
    throw new RangeError("staff requires the trusted staff capability.");
  }
}

function validateShield(profile: IndividualCombatProfileConfig): void {
  if (profile.shieldCategory === "none") {
    if (profile.shieldCarriedState !== "none") {
      throw new RangeError("No shield category must use the none carried state.");
    }
    return;
  }
  if (profile.shieldCarriedState === "none") {
    throw new RangeError("A configured shield must be held or slung.");
  }
  if (profile.shieldCategory === "shield" && !profile.qualifications.hasShield) {
    throw new RangeError("shield requires the trusted Shield qualification.");
  }
  const hands = WEAPON_TRAITS[profile.primaryWeapon].handRequirement;
  if (
    profile.shieldCarriedState === "held" &&
    (hands === "two" || hands === "twoWhileFiring")
  ) {
    throw new RangeError(
      "Two-handed weapon use cannot be actively combined with a held shield.",
    );
  }
}

function normalizeProfile(
  profile: IndividualCombatProfileConfig,
): IndividualCombatProfile {
  const traits = WEAPON_TRAITS[profile.primaryWeapon];
  const supportedAttackModes = Object.freeze(
    (profile.supportedAttackModes ?? traits.supportedAttackModes).filter(
      (mode) =>
        mode !== "magic" || profile.magicalCapabilities.canDeliverCombatMagic,
    ),
  );
  return Object.freeze({
    entityId: profile.entityId,
    primaryWeapon: profile.primaryWeapon,
    ...(profile.backupWeapon === undefined
      ? {}
      : { backupWeapon: profile.backupWeapon }),
    supportedAttackModes,
    reach: traits.reach,
    handRequirement: traits.handRequirement,
    shieldCategory: profile.shieldCategory,
    shieldCarriedState: profile.shieldCarriedState,
    armourCategory: profile.armourCategory,
    hasQualifyingHelmet: profile.hasQualifyingHelmet,
    qualifications: Object.freeze({ ...profile.qualifications }),
    magicalCapabilities: Object.freeze({ ...profile.magicalCapabilities }),
    temporaryAlwaysOnHitModifier: profile.temporaryAlwaysOnHitModifier ?? 0,
  });
}

function validateSupportedAttackModes(
  profile: IndividualCombatProfileConfig,
): void {
  const configuredModes = profile.supportedAttackModes;
  if (configuredModes === undefined) {
    return;
  }
  const canonicalModes = WEAPON_TRAITS[profile.primaryWeapon].supportedAttackModes;
  if (configuredModes.length === 0 && profile.primaryWeapon !== "unarmed") {
    throw new RangeError("Armed profiles require at least one supported attack mode.");
  }
  let previousCanonicalIndex = -1;
  for (const mode of configuredModes) {
    const canonicalIndex = canonicalModes.indexOf(mode);
    if (canonicalIndex < 0) {
      throw new RangeError(
        "Configured attack modes must be supported by the primary weapon.",
      );
    }
    if (canonicalIndex <= previousCanonicalIndex) {
      throw new RangeError(
        "Configured attack modes must be unique and in canonical order.",
      );
    }
    if (mode === "magic" && !profile.magicalCapabilities.canDeliverCombatMagic) {
      throw new RangeError(
        "Magic attack mode requires the trusted combat-magic delivery hook.",
      );
    }
    previousCanonicalIndex = canonicalIndex;
  }
}

function validateTrustedFlags(
  qualifications: TrustedCombatQualifications,
  magicalCapabilities: MagicalCombatCapabilities,
): void {
  assertBoolean(qualifications.hasWeaponMaster, "hasWeaponMaster");
  assertBoolean(qualifications.hasShield, "hasShield");
  assertBoolean(qualifications.hasMarksman, "hasMarksman");
  assertBoolean(qualifications.hasThrown, "hasThrown");
  assertBoolean(qualifications.hasAmbidexterity, "hasAmbidexterity");
  assertBoolean(qualifications.hasDreadnought, "hasDreadnought");
  assertBoolean(magicalCapabilities.canUseRod, "canUseRod");
  assertBoolean(magicalCapabilities.canUseStaff, "canUseStaff");
  assertBoolean(magicalCapabilities.canWearMageArmour, "canWearMageArmour");
  assertBoolean(
    magicalCapabilities.canDeliverCombatMagic,
    "canDeliverCombatMagic",
  );
}

function assertWeaponCategory(value: string, name: string): asserts value is IndividualWeaponCategory {
  if (!WEAPON_CATEGORIES.has(value)) {
    throw new RangeError(`${name} is not an approved individual weapon category.`);
  }
}

function assertShieldCategory(value: string): asserts value is IndividualShieldCategory {
  if (!SHIELD_CATEGORIES.has(value)) {
    throw new RangeError("shieldCategory is not approved.");
  }
}

function assertShieldState(value: string): asserts value is IndividualShieldCarriedState {
  if (!SHIELD_STATES.has(value)) {
    throw new RangeError("shieldCarriedState is not approved.");
  }
}

function assertArmourCategory(value: string): asserts value is IndividualArmourCategory {
  if (!ARMOUR_CATEGORIES.has(value)) {
    throw new RangeError("armourCategory is not approved.");
  }
}

function assertEntityId(entityId: number, entityCount: number): void {
  if (!Number.isSafeInteger(entityId) || entityId < 0 || entityId >= entityCount) {
    throw new RangeError("Individual combat profile entity ID is out of bounds.");
  }
}

function assertPositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function assertBoolean(value: boolean, name: string): void {
  if (typeof value !== "boolean") {
    throw new TypeError(`${name} must be boolean.`);
  }
}
