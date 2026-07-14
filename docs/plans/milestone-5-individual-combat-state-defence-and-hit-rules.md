# Milestone 5: Individual Combat State, Defence, and Empire Hit Rules

Status: in progress; 5A, 5B, 5C-1, 5C-2, 5D, 5E, 5F-1, 5F-2, 5F-3A, 5F-3B1, 5F-3B2, 5G-1, 5G-2, and 5G-3 implemented and awaiting review. Milestone 5 remains unaccepted pending human inspection of `/test?scenario=individual-combat`.

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

## 5C-1 — Facing and attack lifecycle

### Purpose

Turn selected individual melee targets into deterministic attack commitment, recovery, facing, and attack-attempt records.

### Deliver

Add dynamic combat-action state for:

- individual facing;
- current combat action;
- locked attack target;
- attack commitment;
- attack recovery;
- current active melee weapon category;
- transition-only action-state events.

Suggested attack lifecycle:

```text
ready
→ committingAttack
→ attempted or invalidated record
→ recoveringAttack
→ ready
```

Initial doctrine:

- a ready attacker may commit only to a valid hostile selected target;
- commitment locks the target and weapon until resolution;
- 5B selection changes do not redirect active attacks;
- resolution revalidates existence, hostility, melee mode, threat distance, and attack-facing arc;
- invalidated attacks still enter recovery;
- preferred-distance violations are recorded as `awkwardDistance`, not automatic invalidation;
- facing is entity-owned eight-direction integer state and does not alter formation heading;
- eight-direction quantisation uses axis dominance: exact 2:1 boundaries resolve to the axis, while less-dominant vectors resolve diagonally;
- attack resolution quantises the current attacker-to-target vector and accepts only the locked octant plus its two adjacent octants.

Produce inspectable attack-attempt records.

### Boundary

No guard, parry, shield defence, landed blows, global-hit loss, production-pipeline integration, movement changes, morale changes, or renderer/UI work.

### 5C-1 implementation record (2026-07-13)

- [x] Added a standalone entity-indexed combat-action store owning facing,
  action state, locked target, commitment/recovery timers, active melee weapon,
  and transition-only last-emitted state.
- [x] Added a small pure eight-direction helper for reuse by later shield/parry
  arcs. It quantises to east, southeast, south, southwest, west, northwest,
  north, or northeast using integer-only 2:1 axis-dominance comparisons; exact
  2:1 boundaries resolve to the axis, and `(0, 0)` is invalid.
- [x] Initialised individual facing from formation heading and quantised attack
  facing to deterministic integer eight-direction components.
- [x] Replaced raw half-plane attack-facing revalidation with octant semantics:
  resolution quantises the current attacker-to-target vector and allows the
  locked facing octant plus immediately adjacent octants only.
- [x] Added immutable timing by weapon category: dagger 2/2, one-handed 3/3,
  great weapon 4/4, polearm 5/4, pike 6/5, thrown/rod 3/3, staff 5/4, and
  non-melee unarmed/ranged 0/0.
- [x] Consumed 5B selected-target records without repeating target selection or
  building another spatial grid.
- [x] Emitted reusable-output attack-attempt records with distance, threat,
  preferred minimum, awkward-distance flag, facing, outcome, and explicit
  invalidation reason.
- [x] Added headless deterministic tests for octant quantisation, locking,
  redirection prevention, timing order, recovery gating, invalidation, awkward
  distance, facing, attack-arc acceptance/rejection, deterministic replay,
  selected-record order independence, output reuse, and non-mutation of
  movement/formation/pressure/target-selection state.
- [x] Added standalone structural performance coverage at 100, 500, 1,000, and
  2,000 entities in ordinary units.
- [x] Kept production combat, guard/parry/shield defence, landed blows, global
  hit loss, morale, movement, renderer, and UI integration deferred.

---

## 5C-2 — Guard, parry, and shield defence

### Purpose

Turn attack-attempt records into deterministic defence outcomes.

### Deliver

Add dynamic defence state for:

- guard readiness;
- defence recovery;
- shield coverage;
- occupied hands;
- current defence action.

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
- weapons cannot parry arrows or bolts.

### Boundary

No global-hit loss yet. `landed` means the blow passed defence, not that damage has been applied.

### 5C-2 implementation record (2026-07-13)

- [x] Added a standalone entity-indexed melee defence store owning guard state,
  defence-recovery timers, transition-only last-emitted guard state, and
  reusable snapshot/arbitration scratch storage.
- [x] Consumed successful 5C-1 `IndividualMeleeAttackAttemptRecord` records and
  ignored invalidated attack attempts without repeating target selection,
  spatial queries, attack commitment, or attack validation.
- [x] Added stable per-tick defender snapshots for action state, facing, active
  weapon, guard state, shield category, and shield carried state. Guard
  consumption remains active within the defence stage, so later canonical
  attempts can exploit an opening created earlier in the same tick.
- [x] Added deterministic defence arcs using shared eight-direction octants:
  weapon parry and buckler block cover the facing octant plus one adjacent
  octant on each side; held full shield covers the facing octant plus two
  octants on each side. Rear octants remain undefended.
- [x] Added active-defence arbitration order: held full shield, then held
  buckler, then weapon parry. Slung shields provide no active defence.
- [x] Added guard recovery timing: weapon parry 4 ticks, buckler block 3 ticks,
  and shield block 4 ticks. Recovery timers advance at the start of each
  defence tick; a defence assigned this tick does not tick down until the next
  defence tick.
- [x] Canonicalised successful attempts by defender entity ID then attacker
  entity ID. Rear/out-of-arc attacks land without consuming guard, while the
  first in-arc attack against ready guard consumes it and later in-arc attacks
  land as `guardRecovering`.
- [x] Emitted reusable-output defence records containing attacker, defender,
  weapons, shield state, snapshotted defender action/guard/facing, incoming
  octant, `availableDefenceType`, outcome, landed reason, assigned recovery,
  and inherited `awkwardDistance`. `availableDefenceType` identifies the
  equipment-and-arc defence that could apply; outcome and landed reason state
  whether it was actually executed.
- [x] Added headless deterministic tests for parry, buckler, shield, wider
  shield arcs, slung shields, busy defenders, no-active-defence cases,
  canonical multi-attacker openings, input-order independence, snapshot
  semantics, octant wrap-around, output reuse, non-mutation, and replay.
- [x] Added standalone structural performance coverage at 100, 500, 1,000, and
  2,000 entities in ordinary units.
- [x] Kept hit loss, armour effects, global-hit state, one-second gating,
  zero-hit transitions, pressure/morale consequences, movement, production
  integration, renderer, and UI work deferred to later slices.
- [x] 5D cleanup removed unused guard snapshot storage and renamed
  `guardRecoveryCount` to `recoveringGuardCount`.

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

### 5D implementation record (2026-07-13)

- [x] Added an entity-indexed `IndividualGlobalHitStore` owning immutable
  maximum global hits, mutable current global hits, immutable derivation
  breakdowns, immutable target armour categories, and one-shot zero-hit
  transition memory.
- [x] Reused 5A `deriveMaximumGlobalHits` for maximum-hit construction:
  2 base plus Endurance, armour additions, qualifying helmet, qualifying
  Dreadnought while wearing heavy armour, and temporary always-on modifiers.
  Fortitude remains profile data and does not increase maximum hits.
- [x] Initial current hits equal maximum hits. Maximum hits and derivations do
  not mutate, and no passive hit recovery occurs.
- [x] Added an explicit `MAX_REPRESENTABLE_GLOBAL_HITS` boundary matching the
  current `Int32Array` storage (`2,147,483,647`). Derived maximum hits at that
  value are accepted; derived maximum hits above it throw instead of wrapping
  or clamping silently.
- [x] Consumed 5C-2 `IndividualMeleeDefenceRecord` records. Only
  `outcome === "landed"` records produce applications; parried,
  buckler-blocked, and shield-blocked records remove no hits.
- [x] Applied ordinary landed strikes sequentially in the canonical order
  supplied by defence records. Each accepted ordinary landed strike removes
  exactly one hit regardless of attacker weapon, reach, target armour, shield
  state, or `awkwardDistance`.
- [x] Added reusable-output hit application records containing attacker, target,
  attacker weapon, target armour, target maximum hits, hit counts before/after,
  requested/applied loss, zero-reaching flag, inherited awkward-distance flag,
  `availableDefenceType`, landed reason, and application reason.
- [x] Added one-shot `IndividualZeroHitEvent` emission when an entity moves from
  above zero to zero. Later landed records against an already-zero entity
  produce application records with zero applied loss and `alreadyAtZero`, but
  no duplicate zero event.
- [x] Explicitly left the one-second attacker-target gate inactive until 5E;
  multiple attackers can remove multiple hits from the same defender in one
  tick until zero is reached.
- [x] Added headless deterministic tests for maximum-hit initialisation,
  armour/endurance/helmet/Dreadnought/Fortitude behaviour, ordinary landed
  strike rules, blocked outcomes, awkward distance, sequential same-tick hits,
  zero clamping, transition-only zero events, already-zero applications,
  immutable maximums/derivations, no passive recovery, output reuse, canonical
  order preservation, replay, and non-mutation of unrelated state.
- [x] Added standalone structural performance coverage at 100, 500, 1,000, and
  2,000 entities in ordinary units.
- [x] Kept one-second relationship gating, zero-hit attack filtering, dying,
  casualty state, death timers, removal, healing, execution, calls, projectiles,
  equipment damage, pressure/morale consequences, production integration,
  renderer, and UI work deferred to 5E, Milestone 6, and later slices.

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

### 5E implementation record (2026-07-13)

- [x] Added a standalone sparse `IndividualLandedHitGateStore` that owns only
  active attacker-target cooldown relationships. Relationships are stored in a
  `Map` keyed by attacker and target entity IDs; no dense entity-by-entity
  matrix is allocated.
- [x] Added explicit fixed-tick semantics: one second is exactly 20 simulation
  ticks. The gate receives `currentTick` explicitly, rejects decreasing ticks,
  and repeated calls at the same tick remain deterministic: a relationship
  accepted earlier at that tick causes later same-tick landed records for that
  same pair to be rejected until the next allowed tick.
- [x] Consumed canonical 5C-2 `IndividualMeleeDefenceRecord` records without
  repeating defence resolution. Only `outcome === "landed"` records participate
  in the gate; parried, buckler-blocked, and shield-blocked records neither
  create nor extend cooldown relationships.
- [x] Canonicalised landed records by target entity ID, then attacker entity
  ID, so decision order does not depend on input-array order.
- [x] Implemented per-relationship cooldown rules: the first eligible landed
  strike is accepted and sets `nextAllowedTick = currentTick + 20`; strikes
  before that tick are rejected without extending cooldown; a strike exactly at
  `nextAllowedTick` is accepted; different attackers and different targets use
  independent relationships.
- [x] Added reusable gate-decision output containing attacker, target, current
  tick, accepted/rejected outcome, reason, previous and resulting next-allowed
  ticks, and remaining cooldown. Added a separate reusable accepted-record
  array suitable for direct handoff to `applyIndividualLandedHits`.
- [x] Expire stale relationships deterministically once their cooldown no
  longer needs to be retained: relationships with `nextAllowedTick < currentTick`
  expire before processing, and untouched relationships with
  `nextAllowedTick <= currentTick` expire after processing. This preserves the
  exact-boundary previous tick for an arriving landed record while dropping
  inactive relationships at the same boundary.
- [x] Returned structural counts for landed records considered, accepted,
  rejected, relationships created, expired relationships, and active
  relationships.
- [x] Added headless deterministic tests for first hit acceptance, 19-tick
  rejection, exact tick-20 acceptance, non-extending rejection, independent
  attackers and targets, ignored blocked/parried records, canonical same-tick
  order, reversed input order, stale expiry, accepted-record handoff into 5D,
  multiple attackers removing one hit each, output reuse, replay determinism,
  decreasing-tick validation, same-tick repeat determinism, forbidden fields,
  and non-mutation of unrelated state.
- [x] Added standalone structural performance coverage at 100, 500, 1,000, and
  2,000 entities in ordinary units. Coverage exercises both accepted and
  cooldown-rejected paths and reports relationships created, accepted/rejected
  records, expired/active relationships, and mean/max/p95 timing.
- [x] Kept zero-hit attack filtering, casualty and dying state, healing,
  pressure and morale consequences, production integration, renderer, and UI
  work deferred to 5F, Milestone 6, and later slices.

---

## 5F-1 — Integrated individual pipeline in parallel observation mode

### Purpose

Run the complete accepted individual pipeline in the live combat sandbox using
real formation positions and scenario entities while keeping the legacy
unit-level combat path authoritative for production pressure, cohesion, morale,
routing, recovery, and debug snapshots.

### Deliver

Integrate the individual observation pipeline:

```text
formation movement
→ individual local threat/target selection
→ attack commitment
→ defence resolution
→ one-second relationship gate
→ global-hit application
```

Add live sandbox ownership for persistent individual stores and reusable output
buffers. Do not construct the individual stores every tick.

Add headless counters for selected targets, commitments, attempts, defence
outcomes, gate accepts/rejections, applied hit loss, zero-hit events, and active
relationships.

### Boundary

Do not change production combat outcomes, pressure, cohesion, morale, routing,
recovery, renderer/UI snapshots, or metrics panels. Zero-hit individuals remain
eligible in this temporary observation slice.

### 5F-1 implementation record (2026-07-13)

- [x] Added `individualCombatPipeline.ts` as a narrow headless orchestration
  module composing the accepted 5A-5E stages without duplicating their combat
  rules. The stage order is target selection, combat action advancement,
  defence arbitration, landed-hit gate, then global-hit application.
- [x] Added persistent individual-combat stores to the live combat sandbox:
  individual profiles, melee target selection, combat action, melee defence,
  landed-hit gate, and global hits.
- [x] Added sandbox-owned reusable output buffers for selected-target records,
  action-state events, attack attempts, guard-state events, defence records,
  gate decisions, gate-accepted landed records, hit applications, and zero-hit
  events. The sandbox retains the arrays but does not expose them through the
  renderer/debug snapshot.
- [x] Initialised individual profiles deterministically from the existing
  unit/scenario loadout. The explicit mapper converts `unarmed` to individual
  `unarmed`, one-handed/polearm/pike/thrown/rod/staff directly, `twoHanded` to
  `greatWeapon`, `bow` to `ranged`, direct shield and armour classes, and
  legacy `dreadnought` armour to heavy armour plus trusted Dreadnought
  qualification. Unsupported `dualWield` fails clearly until dual wielding is
  implemented.
- [x] Trusted scenario-assigned individuals with all qualifications required by
  their assigned equipment. XP, purchase costs, prerequisites, backup switching,
  and dual wielding remain deferred.
- [x] Ran the observation pipeline once per live combat tick after formation
  movement established current positions and before the legacy production
  unit-level combat path. The landed-hit gate receives the current simulation
  tick explicitly.
- [x] Kept the accepted unit-level combat, consequence, pressure, morale,
  routing, recovery, and debug snapshot path intact and authoritative.
- [x] Added per-tick and cumulative headless counters for eligible melee
  sources, selected targets, active commitments, attack attempts, invalidated
  attacks, parries, buckler blocks, shield blocks, landed defence outcomes,
  gate-accepted hits, gate-rejected hits, applied hit loss, zero-hit
  transitions, and active gate relationships.
- [x] Added headless integration tests proving store initialisation, deterministic
  loadout-to-profile mapping, unsupported legacy value rejection, real-position
  chain execution, target/action/defence/gate/global-hit handoff, persistent
  current hits, integrated one-second gate behaviour, independent attacker
  gates, one-shot zero-hit events, output-buffer reuse, no entity removal,
  deterministic replay, and unchanged deterministic legacy traces.
- [x] Added integrated individual-pipeline performance coverage at 100, 500,
  1,000, and 2,000 entities in ordinary 10- or 20-person units. The benchmark
  reports target-selection, action, defence, gate, hit-application, and total
  observation-path timing plus record counts and active relationships. The
  existing full production path remains reported separately by retained
  production-path performance tests.
- [x] Deferred zero-hit combat ineligibility, casualty/dying state, unit combat
  aggregation, pressure/morale migration, legacy pipeline retirement,
  renderer/UI/debug snapshot expansion, visual scenarios, healing, calls,
  projectiles, backup weapon switching, dual wielding, energy, and command
  behaviour to 5F-2, 5F-3A, 5F-3B, Milestone 6, or later slices.

---

## 5F-2 — Combat eligibility and unit aggregation

### Purpose

Add the next migration layer after observation mode by deciding which
individuals remain combat-eligible for the individual pipeline and producing
deterministic unit-level summaries from individual outcomes.

### Deliver

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

Zero-hit filtering may be introduced here only as an eligibility rule and
handoff for the later casualty lifecycle. Do not implement dying, removal,
healing, or routing movement here.

### 5F-2 implementation record (2026-07-13)

- [x] Added a tick-start individual combat eligibility projection owned by the
  individual observation pipeline. Current global hits greater than zero are
  combat-eligible; zero current hits are combat-ineligible. The snapshot is
  stable for target selection, action commitment/resolution, defence, gate, and
  hit application during that tick, so a same-tick zero-hit transition becomes
  ineligible on the next tick.
- [x] Threaded explicit eligibility inputs through individual target selection,
  attack action, and melee defence. Combat-ineligible entities do not select
  targets, are ignored as ordinary melee targets, do not begin or complete
  attacks, and do not actively parry or block. Existing committed attacks are
  cancelled deterministically to ready when the source or locked target is
  ineligible at tick start. Recovery timers may still tick down because no new
  attack or defence is produced.
- [x] Added a reusable per-unit individual combat aggregation store and summary
  records after global-hit application. Summaries include member count,
  combat-eligible members, zero-hit members, selected targets, committing and
  recovering attackers, ready and recovering guards, attempts, invalidations,
  parries, buckler blocks, shield blocks, landed outcomes, gate-accepted and
  gate-rejected hits, applied hit loss, zero-hit transitions, and deterministic
  combat-capable numerator/denominator fields.
- [x] Extended the integrated observation pipeline order to:

  ```text
  formation
  → eligibility snapshot
  → target selection
  → actions
  → defence
  → gate
  → global hits
  → unit aggregation
  ```

- [x] Kept the legacy unit combat/consequence/pressure/morale path authoritative
  and unchanged. Aggregation is not written into pressure, cohesion, morale,
  routing, renderer snapshots, UI, or worker messages in this slice.
- [x] Added integration coverage for zero-hit source filtering, zero-hit target
  filtering on the next tick, zero-hit defender inability to actively defend,
  stale attack cancellation for ineligible sources and targets, same-tick
  zero-transition semantics, overkill `alreadyAtZero` records, independent
  multi-unit summaries, stale per-tick summary clearing, deterministic
  combat-capable fractions, unchanged entity positions/membership, unchanged
  legacy pressure/cohesion/morale traces, and deterministic replay.
- [x] Extended the integrated benchmark to report eligibility projection and
  unit aggregation separately at 100, 500, 1,000, and 2,000 entities, alongside
  target selection, actions, defence, gate, hit application, total individual
  path, and actual full live tick with the legacy and observation paths active.
- [x] Deferred dying/casualty states, falls, death counts, treatment/healing,
  pressure and morale cutover, legacy combat removal, renderer/UI snapshots,
  visual scenarios, energy, calls, projectiles, line-gap geometry, casualty
  position, and shield-wall doctrine to 5F-3A, 5F-3B, Milestone 6, or later
  slices.

---

## 5F-3A — Individual consequence projection in shadow mode

### Purpose

Make the individual observation path explain its unit-level consequences before
it becomes authoritative for pressure or morale.

### Deliver

Clarify unit aggregation timing:

- tick-start combat eligibility remains the authority for this tick's target,
  action, and defence participation;
- end-of-tick combat capability is derived from global hits after hit
  application;
- same-tick zero transitions remain tick-start eligible, become end-of-tick
  ineligible, and become combat-ineligible on the next tick;
- ready/committing/recovering guard and action counts include only tick-start
  eligible fighters.

Add a headless read model that projects individual records into per-unit
consequence summaries with outgoing and incoming attribution.

Keep the accepted legacy combat, pressure, cohesion, morale, routing, and
recovery path authoritative.

### 5F-3A implementation record (2026-07-13)

- [x] Replaced ambiguous `IndividualCombatUnitSummary` fields with explicit
  tick-start and end-of-tick names:
  `tickStartCombatEligibleMemberCount`,
  `endOfTickCombatEligibleMemberCount`, `endOfTickZeroHitMemberCount`,
  `newlyZeroHitMemberCount`, and matching tick-start/end-of-tick
  combat-capable numerator/denominator fields.
- [x] Renamed combat-readiness counts to eligible-only fields:
  `eligibleSelectedTargetCount`, `eligibleCommittingAttackCount`,
  `eligibleRecoveringAttackCount`, `eligibleReadyGuardCount`, and
  `eligibleRecoveringGuardCount`. Tick-start ineligible zero-hit members do not
  contribute to these counts even if the raw guard/action stores still contain
  ready state.
- [x] Added `individualCombatConsequences.ts` as a deterministic shadow read
  model. It owns reusable per-unit consequence summaries and an entity-to-unit
  index lookup for attribution without repeated unit-member scans.
- [x] Consequence projection attributes outgoing selections, attack attempts,
  invalidated attempts, and gate-accepted hits to attacker units; incoming
  attempts, prevented attacks, parries, buckler blocks, shield blocks, landed
  outcomes, gate accepted/rejected decisions, applied hit loss, and zero
  transitions to target units. Zero transitions are counted only from explicit
  zero-hit events, not inferred from total zero-hit members.
- [x] Added shadow comparison records per unit with legacy engagement,
  individual outgoing/incoming engagement, legacy target-side consequence
  count, individual applied hit loss, and individual newly-zero count. These
  diagnostics are internal to the simulation state and are not exposed through
  renderer/UI snapshots.
- [x] The full combat sandbox still applies legacy consequences, pressure,
  cohesion, morale, routing, and recovery exactly as before. The individual
  consequence projection and shadow comparison do not mutate those systems.
- [x] Extended integration coverage for clarified tick timing, same-tick zero
  capability, eligible-only readiness counts, outgoing/incoming attribution,
  prevented-versus-landed separation, gate accepted/rejected attribution,
  applied-loss and zero-transition attribution, multiple attacker units,
  per-tick clearing, read-model object reuse, reversed input order,
  deterministic replay, unchanged legacy traces, and no entity removal.
- [x] Extended the integrated benchmark to report aggregation clarification,
  individual consequence projection, shadow comparison, and warmed full live
  tick timing at 100, 500, 1,000, and 2,000 entities.
- [x] Deferred pressure deltas from individual summaries, cohesion loss from
  individual casualties, morale cutover, legacy combat removal,
  casualty/dying behaviour, UI/debug snapshots, visual scenarios, healing,
  calls, projectiles, energy, and command behaviour to 5F-3B or later slices.

---

## 5F-3B1 — Individual pressure/morale authority cutover

### Purpose

Make the individual combat pipeline authoritative for pressure, cohesion
consequences, and morale assessment while keeping the legacy unit combat path
as a shadow diagnostic.

### Deliver

Migrate the production combat chain to:

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

Migrate pressure and morale inputs from prototype unit damage to believable
individual results.

Legacy unit combat may continue to run temporarily, but only after individual
pressure/morale authority has completed for the tick and without writing
pressure, cohesion, morale, routing, recovery, movement, or individual hits.

### 5F-3B1 implementation record (2026-07-13)

- [x] Refined individual consequence projection attribution. Selected targets
  now count outgoing for source units and incoming for selected target units.
  Valid attack attempts count only from `outcome: "attempted"` records;
  invalidated attempts remain diagnostic and do not drive production pressure.
- [x] Replaced the ambiguous shadow comparison field
  `legacyConsideredEngaged` with `legacyHadAttackOpportunity` and
  `legacyHadConsequence`. Legacy opportunities and consequence records now feed
  the comparison separately.
- [x] Added the individual-authoritative pressure/cohesion stage. It consumes
  individual consequence summaries, preserves the accepted pressure constants
  and confidence/decay behavior, keeps hostile-contact fallback, applies
  incoming applied-hit pressure exactly once, and gives blocked, parried, or
  gate-rejected attacks engagement pressure without hit-loss pressure.
- [x] Added proportional zero-hit cohesion consequences through formation-owned
  cohesion APIs:

  ```text
  ceil(unit maximum cohesion * newlyZeroHitMemberCount / memberCount)
  ```

  The applied loss is clamped by current cohesion, recorded on the pressure
  update, and is not repeated on later ticks for already-zero members. The
  same individual zero-hit cohesion loss is not also converted into
  same-stage cohesion-loss pressure; formation/movement cohesion loss still
  uses the accepted cohesion-pressure rule.
- [x] Cut production morale assessment over to individual consequence
  summaries. The old `capacityReached` shock path is now fed by
  `incomingZeroHitTransitions > 0`; legacy accumulated unit damage and maximum
  damage capacity no longer drive morale after the cutover.
- [x] Kept persistent morale recovery compatible with the new proportional
  zero-hit cohesion loss. Low cohesion still affects stress and recovery, but
  once pressure, routing risk, and nearby-hostile gates are safe it no longer
  permanently prevents a routing unit from entering or completing recovery.
- [x] Reordered the live combat tick to:

  ```text
  formation and morale movement
  → individual eligibility snapshot
  → individual target selection
  → attack lifecycle
  → defence
  → landed-hit gate
  → global-hit application
  → individual unit aggregation
  → individual consequence projection
  → individual-authoritative pressure and cohesion consequences
  → routing contagion
  → recovery threat
  → morale assessment
  → persistent morale arbitration
  → legacy combat shadow diagnostics
  → counters and snapshots
  ```

- [x] Kept legacy unit combat runtime active as a diagnostic only. Its shadow
  consequence construction uses zero pressure bonuses so it does not mutate
  authoritative pressure.
- [x] Added/updated tests for selected-target incoming attribution, invalidated
  attempts, blocked/parried pressure without hit pressure, gate-rejected landed
  attacks, accepted hit pressure, confidence reduction, pressure decay,
  safe-routing decay, proportional zero-hit cohesion loss, unit-size scaling,
  same-tick multi-zero determinism, non-repeating zero cohesion loss,
  zero-hit cohesion not double-counting as same-stage pressure, individual
  newly-zero morale shock, shadow terminology, Milestone 4 visual scenario
  ordering under individual authority, replay determinism, and no entity
  removal.
- [x] Extended the integrated performance report with individual pipeline,
  consequence projection, individual pressure/cohesion, morale
  assessment/persistence, legacy shadow path, and complete warmed live tick
  timings. The retained stage benchmark still uses unarmed shield-defender
  lanes; a fully bidirectional individual-combat case remains deferred.
- [x] Deferred legacy runtime removal, casualty/dying state, falling, death
  counts, healing/treatment, renderer/UI hit display, visual individual-combat
  scenario, energy, calls, projectiles, line-gap geometry, and shield-wall
  doctrine to 5F-3B2, 5G, or later slices.

---

## 5F-3B2 — Legacy combat runtime retirement

### Purpose

Remove the temporary legacy unit combat runtime from the live tick once the
individual pressure/morale authority has enough diagnostic coverage.

### Deliver

Retire passive armour and shield reduction from the production path.

Keep old unit-level modules only where they remain useful as isolated
regression fixtures or comparison tools. Do not maintain two production
authorities.

### Acceptance requirement

Milestone 4 routing, recovery, and visual regression scenarios must continue to work with the new derived inputs.

### 5F-3B2 implementation record (2026-07-13)

- [x] Retired the legacy unit combat runtime from the production live combat
  tick. Production no longer calls `advanceCombatPipelineOneTick`,
  `applyCombatConsequences`, or `compareIndividualCombatShadow`.
- [x] Removed legacy runtime ownership from production combat state:
  tempo store, survivability store, pipeline output, consequence buffers,
  shadow comparison records, and legacy opportunity/strike/application/
  consequence counters. The old unit-level modules remain as isolated
  Milestone 3 regression fixtures and comparison tools.
- [x] Renamed the production individual combat entrypoint to
  `advanceIndividualCombatPipelineOneTick`; earlier observation/parallel
  wording is now historical to completed migration records only.
- [x] Kept `UnitLoadoutStore` in production only as static scenario content
  used to derive individual combat profiles. It no longer feeds a second
  runtime combat authority.
- [x] Preserved `/test?scenario=combat-foundation` as an archived Milestone 3
  fixture through an explicit `legacyCombatFoundationSandbox` scenario branch.
  The normal live combat scenario still uses only the individual-authoritative
  production sandbox, and the visual registry labels the Milestone 3 route as
  archived.
- [x] Migrated live debug snapshots and the minimal metrics panel display from
  legacy accumulated damage/counters to individual-authoritative fields:
  attack attempts, prevented attacks, landed outcomes, gate-accepted hits,
  applied hit loss, newly zero members, tick-start eligible members,
  end-of-tick eligible members, and end-of-tick zero-hit members.
- [x] Corrected low-cohesion recovery semantics. Routing may enter recovery
  below the normal cohesion floor when pressure, risk, threat, and safety gates
  pass. Recovery restores formation-owned cohesion gradually, and a unit may
  return to steady only after duration, progress, and cohesion gates pass, with
  the cohesion gate equal to
  `min(configured maximum cohesion, RECOVERY_CONSTANTS.minimumCohesion)`.
- [x] Removed the duplicated persistent-morale `maximumPressure` recovery
  condition.
- [x] Kept the accepted morale assessment API stable and recorded the
  zero-hit/recent-shock naming debt in `docs/deferred-concerns.md` for 5G.
- [x] Added tests for zero-cohesion recovery entry, below-floor recovery hold,
  steady only after all recovery gates, configured maximum below 550,
  persistent/formation cohesion synchronization, absence of legacy runtime
  stores in production, archived Milestone 3 visual-fixture isolation,
  individual-authoritative debug fields, deterministic replay, and no entity
  removal.
- [x] Remeasured the authority-only live path with 20 warm-up ticks and 100
  measured ticks for each complete-live run. At 2,000 entities both runs
  remained above 50 ms p95 on this machine; formation was the largest measured
  stage and routing/recovery/morale was second. No optimisation was attempted
  in this slice; this remains a 5G scaling concern.
- [x] Deferred casualty/dying/falling/removal, treatment/healing, line-gap
  geometry, shield-wall doctrine, calls, projectiles, energy, and the full
  `/test?scenario=individual-combat` visual suite to later slices.

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

## 5G-1 — Authority-live performance harness correction

### Purpose

Correct the Milestone 5F-3B2 authority-live performance interpretation before
making optimisation decisions.

### 5G-1 implementation record (2026-07-13)

- [x] Split the live benchmark into two explicitly named measurements:
  `exactProductionTick`, which measures `advanceSimulationOneTick(simulation)`
  including counters, debug snapshots, and tick increment; and
  `instrumentedCoreStages`, which shares the production combat-sandbox tick
  helper but reports stage boundaries without calling their sum a complete
  production tick.
- [x] Added a structural exact-vs-instrumented replay check proving the shared
  instrumented path reaches the same deterministic state as production for the
  measured authority fields.
- [x] Added optional formation diagnostics for blocker-grid builds, blocker
  detection query/candidate counts, unique candidate units, hostile-contact
  query/candidate counts, same-unit overtaking comparisons, member slot
  evaluations, routing/recovering unit counts, and routing pass-through
  interactions. The only timing hook inside formation is around the existing
  blocker-grid build boundary; no per-member timing calls were added.
- [x] Replaced the compressed 2,000-person authority case as the representative
  layout. The representative case is now `100 units × 20 members`, lane spacing
  240, world bounds `260 × 12280`, and minimum adjacent-lane entity separation
  200, which is above the current 192 local hostile/recovery interaction range.
- [x] Retained the old compressed geometry as
  `denseOverlappingFormations`: `100 units × 20 members`, lane spacing 24,
  world bounds `380 × 520`, minimum adjacent-lane entity separation 0. It is a
  stress regression for overlapping lateral footprints and broad blocker/
  pass-through arbitration, not the expected ordinary battle layout.
- [x] Representative separated 2,000-entity exact production tick results on
  this machine:
  - run 1: mean 19.68 ms, max 41.55 ms, p95 30.77 ms;
  - run 2: mean 21.10 ms, max 43.78 ms, p95 32.04 ms.
- [x] Representative separated instrumented core results identified formation
  as the largest stage but under the 50 ms p95 decision line:
  - run 1 p95s: formation 19.74 ms, individual pipeline 6.24 ms, pressure/
    cohesion 0.34 ms, routing contagion 0.62 ms, recovery threat 0.79 ms,
    morale/persistence 0.69 ms, counters/debug 0.04 ms;
  - run 2 p95s: formation 18.93 ms, individual pipeline 5.66 ms, pressure/
    cohesion 0.32 ms, routing contagion 0.62 ms, recovery threat 0.78 ms,
    morale/persistence 0.70 ms, counters/debug 0.04 ms.
- [x] Dense overlapping stress exact production tick results on this machine:
  - run 1: mean 80.92 ms, max 157.87 ms, p95 124.47 ms;
  - run 2: mean 67.00 ms, max 102.13 ms, p95 88.85 ms.
- [x] Dense overlapping diagnosis: formation p95 remained about 60.6-63.2 ms,
  routing contagion about 10.3-11.2 ms, recovery threat about 9.0-11.5 ms,
  and individual pipeline about 8.1-8.3 ms. Compared with representative
  geometry, blocker detection candidate entities rose from 32,760 to 99,305,
  unique candidate units from 819 to 9,135, and routing pass-through
  interactions from 0 to 2,264 over the measured window. Same-unit overtaking
  comparisons did not explain the regression; representative recorded 312,360
  versus dense 290,700.
- [x] Decision: the previous 80 ms formation result was caused by the dense
  overlapping geometry being presented as ordinary battle geometry. The
  corrected representative exact production tick is below 50 ms p95 in both
  required runs, so no optimisation was justified in 5G-1. The dense case stays
  as a stress regression.
- [x] Deferred casualty/dying/removal, renderer work, the
  `/test?scenario=individual-combat` visual suite, and combat mechanics changes
  to later 5G slices.

---

## 5G-2 — State, naming, and inspection-API consolidation

### Purpose

Consolidate accepted authority-live state naming and add bounded inspection
without changing combat mechanics, timings, pressure, morale thresholds,
movement, or production performance behaviour.

### 5G-2 implementation record (2026-07-14)

- [x] Changed the exact-versus-instrumented replay check to use actual no-op
  combat-sandbox stage instrumentation plus `FormationTickDiagnostics`.
  The check counts all stage callbacks and proves diagnostics/timing callbacks
  leave the authoritative state identical to `advanceSimulationOneTick`.
- [x] Renamed formation diagnostics from `memberSlotCorrections` to
  `memberSlotEvaluations`. The counter still records the same slot-evaluation
  behaviour as before.
- [x] Removed `survivabilityStore` from `PersistentMoraleContext`. Persistent
  morale now reads pressure, cohesion, recovery threat, routing contagion, and
  combat-shock assessment fields only; archived survivability state remains
  isolated to the Milestone 3 fixture.
- [x] Replaced morale assessment `recentCohesionDamageValue`/
  `recentCapacityReached` with `recentCombatShockValue` and
  `recentCombatShockSource`. The source model is:
  `none`, `individualZeroHit`, `legacyConsequence`, and
  `legacyCapacityReached`.
- [x] Preserved morale calculations and thresholds. Individual zero-hit
  transitions still produce break-risk shock; archived capacity events map to
  `legacyCapacityReached`; non-capacity archived consequence shock remains a
  pressured-context signal.
- [x] Added optional scenario-configured `inspectedEntityIds` to the production
  combat sandbox. Normal scenarios omit it and emit no per-entity inspection
  entries.
- [x] Inspection IDs validate as unique in-range entity IDs. Snapshot output is
  bounded strictly to the configured IDs and reuses the combat sandbox
  `inspectedIndividuals` array.
- [x] Each inspected individual exposes compact render-safe state: entity/unit
  IDs, tick-start eligibility, selected/locked targets, action/guard state,
  facing, commitment and recovery ticks, active weapon, shield category/state,
  current/maximum global hits, this-tick attack/defence outcome, this-tick
  applied hit loss, and whether zero hits was reached this tick.
- [x] Kept `UnitLoadoutStore` as static scenario input used to derive
  individual profiles. It is not runtime combat authority.
- [x] Archived legacy sandbox debug snapshots intentionally emit no individual
  inspection state.
- [x] Added tests for omitted inspection config, validation failures,
  authoritative store/current-tick record matching, stale per-tick outcome
  clearing, deterministic replay with inspection configured, renamed diagnostic
  semantics, and individual/archived morale trace behaviour under the new
  shock naming.
- [x] Added a representative exact-production timing report comparing
  inspection disabled with a four-entity bounded inspection set. It uses
  structural assertions only and no machine-dependent threshold.
- [x] Resolved deferred concern DC-019. Remaining 5G work is the postponed
  individual-combat visual scenario and later casualty/dying/removal handoff,
  not additional naming churn.

---

## 5G-3 — Individual-combat visual regression suite

### Purpose

Retain a human-inspection visual regression route for accepted individual
combat behaviour without changing combat mechanics, timings, targeting,
defence arcs, hit rules, pressure, morale, movement, or casualty behaviour.

### 5G-3 implementation record (2026-07-14)

- [x] Added stable route `/test?scenario=individual-combat` through the
  existing visual-test registry and menu.
- [x] Added `individualCombatVisualScenario.ts` as deterministic content only.
  It uses seven spatially isolated labelled chambers with one-member diagnostic
  units. Chamber spacing is 300 world units; automated coverage checks the
  minimum cross-area entity distance remains greater than the 192-unit local
  interaction range through the inspection window.
- [x] Scenario starts from the existing visual-test route path, which pauses
  immediately after the worker start and exposes the tick-0 initial snapshot.
- [x] Demonstration chambers:
  - First frontal defence: polearm attacker versus ready weapon defender;
    first valid frontal strike is parried.
  - Held shield defence: polearm attacker versus held full shield; first
    strike is shield-blocked.
  - Two attackers overwhelm guard: one defender prevents one strike and another
    strike lands while guard is recovering.
  - Weapon reach: polearm and one-handed attackers commit in comparable
    geometry; the polearm attack starts from farther away.
  - Armour and global hits: equivalent accepted strikes hit unarmoured and
    heavy-armoured targets; heavy armour has more maximum hits and each strike
    removes exactly one hit.
  - One-second relationship gate: same-pair accepted hits are at least 20
    simulation ticks apart; intervening landed outcomes are rejected and apply
    no hit loss.
  - Independent attackers: two attackers each apply one accepted hit to the
    same target; the target reaches zero hits, remains an entity/member, and
    becomes combat-ineligible next tick.
- [x] Extended bounded individual inspection snapshots with attacker-side
  outgoing defence outcome, landed-hit gate outcome, selected-target
  preferred-distance fields, and current-tick incoming defence/landed counts.
  These are derived only for explicitly configured inspected entities from
  existing pipeline records.
- [x] Extended the metrics/debug panel with a compact individual table when
  `inspectedIndividuals` is non-empty. The table retains the last non-empty
  inspection event and tick per inspected entity as UI-only state; it clears
  on tick 0 and when no inspected entries are present.
- [x] Added deterministic headless tests for every chamber, current-tick
  inspection clearing, area isolation, zero-hit non-removal/next-tick
  ineligibility, and replay determinism.
- [x] Updated `docs/visual-test-suite.md` with the stable URL, chamber labels,
  expected observations, useful ticks, zero-hit-standing note, and DC-017
  richer-presentation deferral.
- [x] Milestone 5 remains pending human inspection of the retained route.

### 5G-3 visual-usability correction (2026-07-14)

- [x] Rearranged the retained individual-combat scenario from a vertical strip
  into a landscape-friendly 4-column by 2-row grid within a 1200 by 580 world.
  Chamber centres are `(150,140)`, `(450,140)`, `(750,140)`, `(1050,140)`,
  `(150,440)`, `(450,440)`, and `(750,440)`. Each chamber keeps its previous
  internal relative entity offsets, preserving accepted event timings and
  outcomes.
- [x] Exported explicit chamber metadata with `id`, `label`, `entityIds`,
  `centreX`, and `centreY` for content/test description only. The isolation
  test now uses this metadata instead of hard-coded entity-ID range logic.
- [x] Corrected retained inspection event labels to use the combat-record tick:
  current records in a post-advance snapshot at tick `N` are retained as
  `t(N - 1)`.
- [x] Retained event summaries now include non-zero current-tick incoming
  evidence, for example `in:P1/B0/S0/L1`, so the two-attacker chamber preserves
  both one parry and one landed incoming outcome after live current-tick fields
  have cleared.
- [x] Made the inspection table more usable in landscape viewports with
  viewport-relative panel height, vertical debug scrolling, horizontal table
  scrolling, `width: max-content`, and unit labels in inspected row identity.
- [x] Added/updated headless tests for unchanged chamber event ticks, metadata
  driven isolation, exact retained event ticks, two-on-one retained incoming
  evidence, tick-0 retention clearing, omitted inspection rows, unit labels,
  and deterministic replay.

### 5G-3 overlay visibility correction (2026-07-14)

- [x] Added an accessible UI-only **Hide debug panels** / **Show debug panels**
  control to the existing simulation controls. It uses `aria-expanded` to
  expose whether the debug panels are currently shown.
- [x] Hiding debug panels applies only to the metrics panel and visual-test
  scenario-information panel. The simulation controls and canvas remain visible,
  and no worker message, snapshot field, simulation state, combat mechanic,
  renderer behaviour, scenario geometry, or event timing changes.
- [x] Showing debug panels restores both panels with retained individual
  inspection history intact. The visibility state defaults to shown when a new
  route/scenario UI is created.
- [x] Added the compact individual-combat chamber legend to the visual-test
  scenario panel:
  `Top row: 1 Parry · 2 Shield · 3 Guard overwhelm · 4 Reach` and
  `Bottom row: 5 Armour · 6 Gate · 7 Independent attackers`.
- [x] Kept `INDIVIDUAL_COMBAT_AREA_SPACING` and now derives the 300-unit
  chamber-centre grid from it, so the layout constant is no longer dead or
  misleading.
- [x] Added UI/state tests for overlay hide/show behaviour, accessibility
  labels/state, retained-history preservation, no snapshot/tick impact,
  non-visual route handling, and legend alignment with chamber metadata.

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
