# Official Rules Extraction: Weapons and Armour

Status: proposed simulation design input.

Primary source reviewed: Profound Decisions, **Weapons & armour**  
https://www.profounddecisions.co.uk/empire-wiki/Weapons_%26_armour

Linked official pages consulted where they resolve direct dependencies:

- Combat skills: https://www.profounddecisions.co.uk/empire-wiki/Combat_skills
- Calls: https://www.profounddecisions.co.uk/empire-wiki/Calls
- Surgical skills: https://www.profounddecisions.co.uk/empire-wiki/Surgical_skills
- Crafting skills: https://www.profounddecisions.co.uk/empire-wiki/Crafting_skills
- Artisan's Oil: https://www.profounddecisions.co.uk/empire-wiki/Artisan%27s_Oil

Reviewed: 2026-07-11.

This document records both the official rules and the deliberate project abstractions selected for the Empire fight simulation. Where the simulation intentionally differs from the physical game, the project ruling is explicit.

---

## Purpose

Extract the weapon, shield, armour, and equipment rules that materially affect a believable Empire battle simulation; map them to the current project; and define the smaller rules-faithful model that should replace the existing unit-level loadout prototype.

This is not a catalogue of phys-rep construction or weapon-checking requirements. Safety and manufacturing details are excluded unless they produce battlefield behaviour.

---

# Executive conclusions

## 1. Keep physical role, not every official equipment subtype

The simulation needs equipment categories that change:

- reach and preferred engagement distance
- one-handed or two-handed occupation
- attack and defence options
- shield compatibility
- projectile use
- automatic `IMPALE`
- call compatibility
- global hits
- fatigue and movement behaviour
- response to `SHATTER`

The project does not need exact inch measurements once a legal equipment category has been assigned.

## 2. Use the following weapon model

```txt
unarmed
dagger
oneHanded
greatWeapon
polearm
pike
thrown
ranged
rod
staff
```

Project exclusions:

```txt
oneHandedSpear
wand
```

Project collapse:

```txt
bow and crossbow
→ one mechanical ranged category
→ optional visual style only
```

Bows and crossbows may look different in the renderer, but they use the same simulation rules unless later evidence shows the difference is worth modelling.

## 3. Preserve grip and hand occupation

Equipment should declare its occupied hands and legal attack modes.

Suggested defaults:

| Category | Hands | Primary simulation distinction |
|---|---:|---|
| dagger | 1 | very short reach; no heroic weapon calls |
| oneHanded | 1 | standard close combat; shield-compatible |
| greatWeapon | 2 | longer reach and heroic-call compatibility |
| polearm | 2 | long reach; broad formation pressure |
| pike | 2 | longest melee reach; thrust-only |
| thrown | 1 | recoverable ranged attack; usually retains melee capability |
| ranged | 2 while firing | projectile attack; automatic `IMPALE` |
| rod | 1 | short implement delivery; shield-compatible |
| staff | 2 | long implement delivery |

Exact grip geometry is not needed. The sim needs only enough state to prevent impossible combinations and to influence reach, attack readiness, defence, and item breakage.

## 4. Use only two shield sizes

```txt
none
buckler
shield
```

A buckler is the smaller, universally available defence. `shield` represents every larger legal shield shape.

Do not model round, tower, kite, and heater shields separately unless later battlefield evidence demonstrates a useful behavioural distinction.

A shield is active equipment:

- it occupies one hand
- it must be held and usable
- it blocks attacks through facing and guard
- it is not passive damage reduction
- a broken or slung shield does not protect
- `ENTANGLE`, `REPEL`, and `STRIKEDOWN` can still apply through shield contact
- `SHATTER` can break the shield itself

## 5. Use broad armour classes with full simulated coverage

```txt
none
light
medium
heavy
mageArmour
```

Official global-hit additions remain:

```txt
none         +0
light        +2
medium       +3
heavy        +4
mageArmour   +2
helmet       +1
```

Project simplification:

- do not store physical armour coverage by body location
- once an individual has an armour class, assume that class protects their whole simulated body
- medium armour prevents the special effect of `CLEAVE`
- heavy armour prevents the special effects of both `CLEAVE` and `IMPALE`
- armour protection remains active even after armour-granted global hits have been lost
- light and mage armour grant hits but do not prevent either call

This intentionally differs from the official locational phys-rep rule. It preserves the tactical distinction while avoiding detailed coverage masks and physical strike-location geometry.

## 6. Use coarse impact outcomes instead of exact hit locations

The simulation does not need head, torso, left arm, right arm, left leg, and right leg.

Use:

```txt
body
arm
leg
```

For `CLEAVE` and `IMPALE` when armour does not prevent the effect:

- `body` reduces the target to zero hits
- `arm` creates a combat-disabled arm state and prevents ordinary weapon attacks
- `leg` creates an immobile leg state and prevents voluntary translation

The impact category should be selected deterministically from attack context and seeded scenario traits, not through uncontrolled randomness.

This is an intentional abstraction. It retains the battlefield outcomes that players respond to: immediate casualty, loss of attacks, or loss of movement.

## 7. Dreadnought is a skill, and all simulated heavy armour qualifies

Officially, Dreadnought adds one hit only when wearing sufficiently substantial metal armour.

Project ruling:

```txt
hasDreadnoughtSkill && armourClass == heavy
→ +1 global hit
```

Do not retain `dreadnought` as an armour class.

All simulation heavy armour is assumed to be substantial enough to qualify. This avoids a second hidden heavy-armour material subtype.

## 8. Medium armour also grants a hero point

A character in qualifying medium armour gains one hero point provided they are not wearing heavy armour.

Under the project abstraction this becomes:

```txt
armourClass == medium
→ +1 maximum/current scenario-start hero point
```

This belongs to individual resource derivation, not armour damage handling.

## 9. Armour is not separately repaired

Armour increases global hits. It does not have a separate armour-hit pool.

Healing back to full hits restores the armour-derived portion as part of the same global-hit total. `SHATTER` affects eligible held equipment, not worn armour.

## 10. Manual call use should respect visible armour

Players are generally competent enough not to deliberately spend a finite manual call against visibly ineffective armour.

Behaviour policy:

- do not deliberately use `CLEAVE` against medium or heavy armour
- do not deliberately use `IMPALE` against heavy armour
- allow exceptions only for ignorance, panic, scenario scripting, or a non-finite source
- automatic projectile `IMPALE` is not filtered this way; archers may still shoot heavy armour because the ordinary hit remains useful

This is decision behaviour, not mechanical resistance.

---

# Official rules retained

## Ordinary weapon categories

Official Empire distinguishes daggers, one-handed weapons, great weapons, polearms, pikes, and one-handed spears.

Relevant retained distinctions:

- daggers are extremely short and cannot use heroic weapon skills
- one-handed weapons are ordinary shield-compatible weapons
- great weapons require two hands
- polearms require two hands and provide longer reach
- pikes require two hands, are thrust-only, and provide the longest melee reach
- larger weapons require the appropriate combat skill

Project ruling:

- omit one-handed spears
- store skill requirements as loadout validation and source eligibility
- do not model exact legal lengths after content validation

## Implements

Official offensive magic uses wands, rods, or staves.

Relevant retained distinctions:

- rods are one-handed and can be combined with a shield or another valid one-handed item
- staves require two hands and provide greater delivery reach
- implements can inflict an ordinary hit
- implements cannot deliver heroic weapon calls

Project ruling:

- omit wands
- retain rods and staves
- classify them as implements rather than ordinary weapons even when they can inflict an ordinary hit

## Ranged weapons

Official bows and crossbows:

- require the Marksman skill
- require both hands to shoot
- automatically deliver `IMPALE`
- cannot be weapon-parried
- use physical ammunition

Project ruling:

- use one mechanical ranged category
- preserve an optional `bow` or `crossbow` visual field only
- use one projectile/ammunition pipeline
- do not create crossbow-specific loading rules unless later play evidence justifies them

## Thrown weapons

Thrown weapons:

- require the Thrown skill
- make a ranged attack
- become recoverable physical objects
- generally leave the user with another melee option

They remain a separate category because their retrieval behaviour differs substantially from arrows and because throwers usually remain combat-capable after using them.

## Shields

Retained rules:

- shields must be held
- bucklers and larger shields are distinct capability tiers
- shields block through active positioning
- shields can push while moving slowly, but safety-specific shield barging is out of scope
- special call contact rules remain active
- broken shields stop protecting

The simulation should not model unsafe or prohibited body-contact behaviour.

## Armour and helmets

Retained rules:

- base global hits are increased by armour rather than replaced with armour points
- a qualifying helmet adds one global hit
- medium armour adds three hits and one hero point
- heavy armour adds four hits
- light and mage armour add two hits
- mage armour permits magical activity where mundane armour would not
- armour-call protection remains after global hits are lost
- multiple armour types do not stack

Project simplification:

- exact physical coverage is discarded
- armour class is authoritative for the whole simulated individual
- helmet is a separate boolean modifier
- all heavy armour qualifies for Dreadnought

---

# Recommended individual data model

```ts
type WeaponKind =
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

type RangedVisualStyle = "bow" | "crossbow";

type ShieldKind = "none" | "buckler" | "shield";

type ArmourKind =
  | "none"
  | "light"
  | "medium"
  | "heavy"
  | "mageArmour";

type CoarseImpactArea = "body" | "arm" | "leg";

interface IndividualEquipmentProfile {
  weaponKind: WeaponKind;
  backupWeaponKind?: WeaponKind;
  rangedVisualStyle?: RangedVisualStyle;
  shieldKind: ShieldKind;
  armourKind: ArmourKind;
  hasQualifyingHelmet: boolean;
  weaponReady: boolean;
  shieldReady: boolean;
  weaponBroken: boolean;
  shieldBroken: boolean;
}
```

Derived state should answer:

```txt
occupied hands
current attack modes
current defence modes
reach band
can make ordinary attack
can deliver heroic call
can deliver magic call
can fire projectile
can block projectile
global-hit modifiers
manual CLEAVE eligibility
manual IMPALE eligibility
Dreadnought qualification
```

Do not encode all of these as stored booleans if they can be derived cheaply and deterministically.

---

# Current project gap

The current Milestone 4F archive contains unit-level loadout data:

```txt
WeaponCategory
WeaponReachBand
ArmourClass
ShieldClass
SpecialCallCapability
```

Useful existing decisions:

- `buckler` and `shield` already match the chosen simplified shield model
- reach bands already support threat geometry
- bow, thrown, rod, staff, polearm, and pike vocabulary already exists
- the data is deterministic and separated from rendering

Required migration:

- move authority from unit loadout to individual equipment profiles
- add dagger and great-weapon semantics rather than relying only on generic one/two-handed labels
- remove `dreadnought` from `ArmourClass`
- collapse bow/crossbow mechanics into `ranged`
- do not add one-handed spear or wand
- derive global hits from armour rather than damage reduction
- replace shield damage reduction with active defence
- replace exact armour coverage plans with category-wide protection
- replace exact left/right limb plans with `body/arm/leg` outcomes
- preserve unit loadout as scenario shorthand and derived summary

The existing unit-level types should not be rewritten during Milestone 4. They remain prototype inputs until the individual-combat migration milestone.

---

# Milestone ownership

## Milestone 5: Individual Combat State, Defence, and Empire Hit Rules

Owns:

- individual weapon and shield authority
- hand occupation
- ordinary attack reach and defence
- broad armour class
- helmet and Dreadnought hit derivation
- active shield blocking
- global hits
- coarse `body/arm/leg` impact vocabulary
- migration from unit combat prototype

Does not yet own:

- full call effects
- physick treatment
- `SHATTER` repair behaviour
- recoverable projectiles

## Milestone 6: Casualties, Treatment, and Rescue

Owns:

- zero-hit transition
- arm-disabled and leg-immobile casualty consequences once emitted
- rescue/dragging
- battlefield treatment actions
- patient handoff and triage

## Milestone 11: Roles, Equipment, Skills, and Resources

Owns:

- skills and role definitions
- medium-armour hero-point modifier
- Dreadnought skill data
- Marksman, Shield, Weapon Master, Thrown, Battle Mage, Physick, Chirurgeon, and Artisan data
- finite treatment and repair resources
- individual mixed loadouts

## Milestone 13: Calls and Hard Effects

Owns:

- applying `CLEAVE`, `IMPALE`, and `SHATTER`
- coarse impact selection
- broad armour protection checks
- forced dropping/broken equipment
- manual call-use target filtering

## Milestone 14: Ammunition and Recoverable Projectiles

Owns:

- the unified ranged attack pipeline
- optional bow/crossbow appearance
- automatic projectile `IMPALE`
- ammunition inventory and recovery

---

# Suggested acceptance tests

## Equipment validation

- dagger occupies one hand and cannot carry heroic weapon calls
- one-handed weapon can pair with buckler or shield
- great weapon, polearm, pike, staff, and ranged firing occupy both hands
- rod can pair with a shield
- omitted one-handed spear and wand cannot appear in validated scenario content

## Hit derivation

```txt
base unarmoured = 2
light = 4
medium = 5 and +1 hero point
heavy = 6
mage armour = 4
helmet adds 1
Dreadnought adds 1 only to heavy
```

## Armour/call abstraction

- medium negates the special effect of `CLEAVE` for body, arm, and leg outcomes
- heavy negates the special effects of `CLEAVE` and `IMPALE` for every coarse outcome
- light and mage armour do not negate either effect
- negated calls still cause the ordinary hit when delivery lands
- armour protection remains after armour-derived hits are lost

## Shield behaviour

- a ready facing shield can block an ordinary strike
- blocked ordinary strikes do not remove hits
- shield contact still transmits `ENTANGLE`, `REPEL`, and `STRIKEDOWN`
- `SHATTER` breaks the shield
- a broken shield supplies no defence

## Behaviour

- finite manual `CLEAVE` is not selected against medium/heavy targets
- finite manual `IMPALE` is not selected against heavy targets
- ranged attackers may still shoot heavy targets
- a broken-primary-weapon character uses a backup if available; otherwise enters repair-seeking/non-combat behaviour

---

# Explicit exclusions

Do not implement:

- exact weapon inches
- weapon-checking or construction safety
- one-handed spears
- wands
- distinct bow/crossbow mechanics
- detailed shield shapes
- physical armour coverage masks
- left/right limbs
- head or neck targeting
- separate armour hit points
- random armour penetration
