# Milestone 5: Individual Combat State, Defence, and Empire Hit Rules

Status: in progress; 5A and 5B implemented and awaiting review.

## Product goal

Milestone 5 replaces the accepted unit-level combat prototype with individual fighter combat.

Until now, units have produced useful deterministic combat pressure, damage, and morale inputs. That was the correct foundation for movement and routing, but it is not yet a faithful model of an Empire fight.

After Milestone 5:

- individual fighters select individual opponents;
- weapons create different threat and preferred-distance behaviour;
- attacks require commitment and recovery;
- ready fighters actively parry or block obvious attacks;
- shields provide active facing defence rather than passive damage reduction;
- armour increases global hits rather than reducing landed damage;
- ordinary landed blows remove one global hit;
- the one-second rule is enforced per attacker-target relationship;
- individual results aggregate upward into unit pressure, gaps, capability, and morale;
- reaching zero hits emits a clean handoff for Milestone 6 casualty behaviour.

This is the point where the simulation stops saying “Unit 12 dealt damage” and starts saying:

> Entity 183 committed to a polearm thrust, entity 417 was facing and ready, the strike was parried, guard was consumed, and the next attacker found an opening.

That individual state is required before casualties, Chirurgeon treatment, exertion during combat, calls, ammunition, and mixed unit loadouts can be modelled correctly.

---

## Core design decisions

### Individual combat authority

Individual entities become authoritative for:

- equipped weapons;
- shield state;
- armour and helmet use;
- trusted skill qualifications;
- occupied hands;
- current target;
- attack commitment and recovery;
- guard readiness;
- facing and defended coverage;
- current and maximum global hits.

Unit loadout data remains useful as:

- scenario shorthand;
- doctrine;
- generation input;
- compatibility data;
- derived unit composition summaries.

It must no longer be the final combat state for every member.

### Unit systems remain unit systems

Milestone 5 must not replace:

- formation ownership;
- unit orders;
- cohesion;
- persistent morale;
- routing;
- recovery;
- unit identity.

Individual combat results feed those systems through deterministic summaries and consequence records.

### Deterministic defence, not random defence

Do not use a random block percentage.

A ready fighter who is facing an obvious, simple attack should normally prevent the first blow.

Openings emerge from state:

- guard already consumed;
- attack or defence recovery;
- poor facing;
- crowding;
- flanking;
- multiple attackers;
- pressure;
- low confidence;
- disrupted formation;
- unsuitable weapon distance.

### Empire hit model

Ordinary landed blows remove exactly one global hit.

Weapon reach affects:

- threat distance;
- preferred distance;
- target opportunity;
- attack mode;
- defence opportunity;
- pressure.

It does not increase ordinary landed-blow damage.

Armour adds global hits. It does not reduce ordinary landed-blow damage.

Shields actively prevent attacks. They do not reduce landed-blow damage.

No passive global-hit recovery occurs during a normal battle.

### Performance

All individual target and threat work must use bounded spatial queries.

Do not create:

- entity-to-entity all-pairs scans;
- a dense attacker-by-target matrix;
- permanent records for every possible combat relationship.

The one-second relationship gate must retain only active local relationships and expire them deterministically.

---

## Equipment vocabulary

### Weapons

```ts
type WeaponCategory =
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
```

Explicitly excluded:

```text
oneHandedSpear
wand
```

Bow and crossbow are one mechanical `ranged` category. A separate optional visual field may preserve appearance later.

### Shields

```ts
type ShieldCategory =
  | "none"
  | "buckler"
  | "shield";
```

### Armour

```ts
type ArmourCategory =
  | "none"
  | "light"
  | "medium"
  | "heavy"
  | "mageArmour";
```

`dreadnought` is not an armour category. It is a skill qualification that adds one hit when the individual wears qualifying heavy armour.

### Trusted runtime qualifications

Milestone 5 may store trusted scenario qualifications for:

- Weapon Master;
- Shield;
- Marksman;
- Thrown;
- Ambidexterity;
- Endurance;
- Fortitude;
- Dreadnought;
- relevant magical-combat capability hooks.

Do not implement XP spending, prerequisites, character creation, or purchase validation here.

---

## Maximum global hits

Use the project simplification:

```text
maximumGlobalHits =
  2 base
  + enduranceLevels
  + armourExtraHits
  + helmetExtraHit
  + qualifyingDreadnoughtExtraHit
  + temporaryAlwaysOnModifiers
```

Equipment additions:

```text
none         +0
light        +2
medium       +3
heavy        +4
mageArmour   +2
helmet       +1
```

Additional rules:

- `hasDreadnought && armour === "heavy"` adds one global hit;
- all simulated heavy armour is substantial enough to qualify;
- medium armour's later hero-point grant is outside this milestone;
- armour is not a separately damaged hit pool;
- losing armour-derived hits does not remove the worn armour category;
- `CLEAVE` and `IMPALE` protection belongs to the later calls/effects milestone.

---

# Numbered implementation slices

## 5A — Individual combat profiles and validation

### Purpose

Create the static per-entity combat profile foundation without changing the active combat pipeline.

### Deliver

Add an individual combat profile store containing:

- primary weapon category;
- optional backup weapon;
- weapon ready/broken state where appropriate;
- attack modes supported by the weapon;
- physical reach band or deterministic reach value;
- hand requirement;
- shield category and carried state;
- armour category;
- helmet qualification;
- trusted skill qualifications;
- Endurance level;
- Fortitude level;
- Dreadnought qualification;
- optional coarse capability hooks for later calls.

Add deterministic validation for:

- permitted equipment combinations;
- occupied-hand requirements;
- skill requirements;
- forbidden categories;
- every entity receiving exactly one profile;
- stable entity ordering.

A pure maximum-hit derivation function may be added and tested here because it validates the profile. Runtime current-hit ownership and damage application remain 5D.

### Boundary

No target selection, attack attempts, defence, hit loss, casualty transition, movement changes, morale changes, renderer changes, or production combat migration.

### 5A implementation record (2026-07-12)

- [x] Added an immutable entity-indexed individual combat profile store with
  approved weapon, shield, and armour vocabulary. `oneHandedSpear`, `wand`,
  and armour-category `dreadnought` are rejected.
- [x] Canonically derive primary supported attack modes, relative reach, and
  hand requirement from weapon category so authored content cannot contradict
  the equipment category. Backup weapons remain validated static/stowed data;
  active switching and dual wielding remain 5C work.
- [x] Added trusted Weapon Master, Shield, Marksman, Thrown, Ambidexterity,
  Endurance, Fortitude, Dreadnought, rod, staff, mage-armour, and coarse
  combat-magic capability fields with equipment compatibility validation.
- [x] Added exact per-entity coverage, duplicate/missing/order/bounds checks,
  active shield/hand checks, deterministic construction, and lookup coverage.
- [x] Added pure maximum-global-hit derivation and breakdown coverage without
  current-hit storage or hit application.
- [x] Kept the unit loadout store and production combat pipeline unchanged.

---

## 5B — Individual threat, engagement, and target selection

### Purpose

Identify which hostile individuals can physically threaten one another and select deterministic targets.

### Deliver

Add local per-entity combat queries using the existing spatial grid.

An individual threat/engagement record should answer:

- which hostile is selected;
- relationship distance;
- whether the source can threaten the target;
- whether the target can threaten the source;
- whether the target is within the source weapon's preferred distance;
- whether facing permits a plausible attack;
- why the target won deterministic arbitration.

Target selection should consider:

- hostile relationship;
- local distance;
- weapon reach;
- facing;
- current formation/front assignment;
- target continuity;
- deterministic entity-ID tie-breaking.

Do not let every rear-rank member independently tunnel through allies toward the nearest hostile.

### Boundary

No attack resolution, guard, parry, shield block, damage, or target-driven strategic pathfinding.

### 5B implementation record (2026-07-12)

- [x] Added a standalone entity-indexed melee target-selection store using
  `-1` for no target. It is not attached to the production combat pipeline.
- [x] Reused the spatial grid for bounded hostile queries and unit identity,
  actual entity positions, combat profiles, and formation-owned unit heading.
- [x] Added named profile-to-world melee distances: dagger 8, one-handed 12,
  great weapon 16, polearm/staff 20, and pike 24, with deterministic outer
  preferred-distance bands for longer weapons.
- [x] Added hostile, facing, reach, mutual-threat, preferred-distance,
  previous-target continuity, nearest-distance, and entity-ID arbitration
  with query-return-order independence.
- [x] Corrected unarmed profiles to expose no damaging attack mode and added
  validated legal attack-mode subsets for thrown-only and magic-only profiles.
  Only profiles with an active `melee` mode participate in 5B.
- [x] Added inspectable per-eligible-source records, deterministic replay,
  rear-rank actual-reach coverage, non-mutation coverage, and structural
  performance cases at 100, 500, 1,000, and 2,000 entities.
- [x] Kept individual facing, readiness, defence, attacks, and all production
  integration deferred to 5C and later slices.

---

## 5C — Attack commitment, recovery, guard, parry, and shield defence

### Purpose

Turn engagement into individual attack attempts and deterministic defence outcomes.

### Deliver

Add dynamic combat-readiness state for:

- current target;
- attack commitment;
- attack recovery;
- guard readiness;
- defence recovery;
- facing;
- shield coverage;
- occupied hands;
- current combat action.

Suggested attack lifecycle:

```text
ready
→ committed
→ resolved
→ recovering
→ ready
```

Suggested defence result vocabulary:

```text
parried
shieldBlocked
evadedOrOutOfArc
landed
invalidated
```

Initial doctrine:

- a ready, properly facing defender normally prevents the first obvious attack;
- a successful defence consumes or degrades guard;
- repeated attacks before guard recovery create openings;
- multiple attackers can overwhelm defence through ordered state, not random chance;
- shields widen active defended coverage;
- weapons cannot parry arrows or bolts;
- unsuitable distance can invalidate or disadvantage an attack.

Produce inspectable attempt and defence records.

### Boundary

No global-hit loss yet. `landed` means the blow passed defence, not that damage has been applied.

---

## 5D — Global hits and ordinary landed strikes

### Purpose

Create authoritative individual survivability and apply ordinary landed blows.

### Deliver

Add an individual global-hit store containing:

- maximum hits;
- current hits;
- derivation breakdown;
- whether zero was reached this tick;
- transition-only zero-hit record.

Apply one hit of loss for each accepted ordinary landed strike.

Rules:

- armour contributes maximum hits;
- armour does not reduce the hit;
- shields have already acted through defence;
- current hits never exceed maximum or fall below zero;
- no passive regeneration;
- reaching zero emits a handoff record but does not implement dying behaviour.

The zero-hit entity may be marked combat-ineligible only to prevent further ordinary attacks in the same pipeline. Full casualty lifecycle and interaction filtering belong to Milestone 6.

### Boundary

No death count, terminal state, dragging, treatment, execution, or egress.

---

## 5E — Per-attacker/per-target one-second gate

### Purpose

Enforce the Empire one-second damage rule correctly.

### Deliver

Add a deterministic sparse relationship gate.

For each active attacker-target pair, retain the next tick at which that attacker may remove another hit from that target.

Rules:

- the same attacker cannot remove another hit from the same target until one second has elapsed;
- another attacker may damage that target independently;
- changing targets uses the appropriate relationship record;
- blocked or parried attacks do not consume the landed-damage gate unless the documented rule requires it;
- stale and non-local relationships expire deterministically;
- fixed tick rate determines the one-second interval.

### Performance boundary

No dense `entityCount × entityCount` structure.

Add active-record count and expiry coverage to performance tests.

---

## 5F — Production migration and unit aggregation

### Purpose

Replace the unit-level prototype combat path in production while preserving the unit-level outputs required by morale.

### Deliver

Integrate the individual pipeline:

```text
formation movement
→ individual local threat/target selection
→ attack commitment
→ defence resolution
→ one-second relationship gate
→ global-hit application
→ individual combat consequences
→ unit aggregation
→ pressure and morale
```

Add derived unit summaries such as:

- active fighters;
- engaged fighters;
- guarded fighters;
- attacks attempted;
- attacks prevented;
- landed blows;
- zero-hit members;
- weapon/reach composition;
- shield frontage;
- line gaps;
- combat-capable fraction.

Migrate pressure and morale inputs from prototype unit damage to believable individual results.

Retire passive armour and shield reduction from the production path.

Keep old unit-level modules only where they remain useful as isolated regression fixtures or comparison tools. Do not maintain two production authorities.

### Acceptance requirement

Milestone 4 routing, recovery, and visual regression scenarios must continue to work with the new derived inputs.

---

## 5G — Consolidation, performance, and visual regression

### Purpose

Prove the migrated model is deterministic, affordable, inspectable, and visibly better.

### Deliver

Review:

- state ownership;
- tick order;
- stale prototype code;
- event naming;
- snapshot size;
- sparse relationship expiry;
- unit aggregation;
- performance;
- deterministic replay.

Add representative performance cases using normal 5–30-person units.

Add a retained visual test:

```text
/test?scenario=individual-combat
```

Suggested isolated lanes:

1. one-handed weapon versus one-handed weapon: first attack parried, later opening lands;
2. shield user versus ordinary weapon: active shield block;
3. two attackers versus one defender: guard overwhelmed without random chance;
4. polearm versus shorter weapon: different preferred distances;
5. armour comparison: different maximum hits, same one-hit landed damage;
6. one-second relationship gate: rapid attempts do not remove rapid repeated hits;
7. separate attackers may each damage one target.

The visual test should expose attack, defence, guard, current hits, and target state through the existing debug harness.

---

# Expected final tick order

The exact function names may differ, but ownership should be explicit:

```text
1. command/order ingestion
2. formation and morale movement projection
3. world movement and local spatial state
4. individual threat and target collection
5. attack commitment advancement
6. defence arbitration
7. one-second relationship gating
8. global-hit application
9. zero-hit transition records
10. unit combat aggregation
11. combat pressure and cohesion consequences
12. routing contagion and recovery threat
13. persistent morale arbitration
14. events and snapshots
```

Do not reorder accepted systems casually during early slices. The complete order becomes active during 5F migration.

---

# Milestone boundaries

Milestone 5 does not implement:

- dying timers;
- terminal state;
- Chirurgeon or Physick treatment;
- execution;
- casualty dragging;
- player-presence egress;
- exact left/right limbs or detailed hit locations;
- complete calls or heroic abilities;
- ballistic projectile flight;
- ammunition;
- recoverable projectiles;
- random block percentages;
- captain behaviour;
- energy or fatigue;
- XP spending or character creation.

Reserve only the minimum hooks required by later milestones.

---

# Performance coverage

Maintain current representative scenarios and add individual-combat measurements for:

```text
100 entities
500 entities
1,000 entities
2,000 entities in ordinary 5–30-person units
```

Measure:

- total full-path tick time;
- target queries;
- active target relationships;
- attack attempts;
- defence resolutions;
- landed blows;
- active one-second gate records;
- expired gate records;
- unit aggregation cost;
- event count.

Use structural assertions and machine-dependent reporting rather than strict timing thresholds.

The pathological 2,000 one-person-unit case may remain a stress test but must not be treated as the expected battlefield shape.

---

# Milestone 5 definition of done

Milestone 5 is complete when:

- individual entities own combat profiles, readiness, defence, and global hits;
- target selection uses bounded local deterministic queries;
- ready defenders visibly prevent ordinary first attacks;
- guard and recovery create deterministic openings;
- shields act through facing defence;
- armour adds hits and never passively reduces ordinary damage;
- ordinary landed blows remove one hit;
- the one-second rule is per attacker-target pair;
- separate attackers damage independently;
- zero hits produces a clean Milestone 6 handoff;
- unit pressure and morale consume derived individual combat outcomes;
- Milestone 2–4 retained visual tests still behave acceptably;
- the new individual-combat visual regression scenario is retained under `/test`;
- representative 2,000-person performance remains viable;
- no later casualty, calls, projectile, energy, or command systems have leaked into scope.
