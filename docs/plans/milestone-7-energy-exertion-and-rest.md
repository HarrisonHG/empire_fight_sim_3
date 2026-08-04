# Milestone 7: Energy, Exertion, and Rest

Status: active; 7A and 7B are complete. 7C-1 gait authority and capability
projection and 7C-2 formation and routing movement enforcement are
implemented. 7C-3 specialist movement enforcement and consolidation is in
progress: 7C-3a and 7C-3b are implemented and 7C-3c is next.

Implementation begins after Milestone 6 is accepted and the post-Milestone-6 main-battle medical integration spike is retained as the evolving `/` scenario.

## Product goal

Milestone 7 gives every simulated person a finite physical-energy state and makes exhaustion matter across a long Empire battle.

After Milestone 7:

- every individual has explicit physical energy capacity, starting energy, current energy, and recovery capability;
- actual movement and combat activity consume energy deterministically;
- standing safely, resting while downed, and waiting away from combat restore energy;
- walking, jogging, sprinting, charging, repeated attacks, repeated defence, heavy equipment, dragging, treatment movement, and respawn egress have distinct exertion costs;
- low energy limits gait, charge duration, attack tempo, guard-readiness recovery, pressure recovery, willingness to re-engage, and casualty-handling endurance;
- zero energy means severe exhaustion rather than unconsciousness, paralysis, lost hits, or automatic routing;
- units expose whether they can still charge, jog, fight, carry casualties, or should conserve energy;
- safe units may pause and recover rather than endlessly marching into battle;
- dying characters may physically recover while down, so a successfully treated character can return tired or partly recovered rather than receiving a magical reset;
- barbarian player presence retains energy through death count, respawn egress, and waiting-at-respawn for later Milestone 9 re-entry policy;
- energy never restores global hits and never replaces morale.

The intended battlefield story is:

> A fresh unit can advance, charge, fight hard, and recover its guard quickly.

Later:

> The same people are still willing, but they cannot keep sprinting, their attacks slow, repeated defence overwhelms them more easily, casualty extraction becomes costly, and a safe pause becomes valuable.

---

# Core design decisions

## Energy is individual physical state

Energy is not:

- global hits;
- morale or pressure;
- confidence;
- experience;
- discipline;
- enthusiasm;
- character XP;
- a unit-wide stamina bar.

A veteran may be exhausted. A recruit may have abundant physical energy. A frightened fighter may still be physically fresh. A confident fighter may be completely spent.

Energy may influence behaviour and pressure recovery, but it must not own morale transitions.

## Trusted runtime energy profile

Until the later character-authoring/content milestones, scenarios may assign trusted physical profiles directly.

Suggested profile:

```ts
interface TrustedEnergyProfile {
  entityId: number;

  maximumEnergy: number;
  startingEnergy: number;

  safeRestRecoveryPerTick: number;
}
```

Initial default:

```text
maximum energy:             10,000
starting energy:            10,000
safe rest recovery:              5 per tick
```

At 20 ticks per second, the default profile takes about 100 seconds to recover from empty to full while safely resting.

The three values are independent scenario inputs:

- a person may start partially tired;
- a person may have a large capacity but ordinary recovery;
- a person may have modest capacity but recover quickly.

Do not infer them from recruit/regular/veteran experience, confidence, nation, equipment, role, or faction.

Validation must reject:

- non-integer values;
- non-positive maximum energy;
- starting energy outside `0..maximum`;
- negative recovery;
- values that exceed the selected storage capacity.

Milestone 11 may later provide generated/default physical profiles, but it must adopt this authority rather than create a competing energy store.

## Fixed-point integer state

Use deterministic integer storage.

Suggested average scale:

```text
10,000 energy units = average full energy
```

Store:

```text
maximum energy
current energy
energy spent this tick
energy recovered this tick
dominant exertion context
energy band
last strenuous tick
```

Clamp current energy to:

```text
0..maximum energy
```

Do not use floating-point drift, wall time, or `Math.random`.

## Energy bands are derived, not separate authority

Derive bands from current/maximum ratio:

```text
fresh:    60%–100%
working:  30%–<60%
winded:   10%–<30%
spent:     0%–<10%
```

Band names are diagnostic and behavioural summaries. The current integer energy remains authoritative.

Thresholds must be named configuration constants and may be tuned after visual inspection.

## Zero energy is not collapse

At zero energy, an active character:

- remains conscious;
- remains targetable;
- may still defend;
- may still attack slowly;
- may still walk at a minimum safe speed;
- may still route away;
- does not lose global hits;
- does not automatically become dying, terminal, paralysed, or routed.

Zero energy prevents ordinary sprint/charge initiation and strongly limits jog, attack tempo, and guard recovery.

No energy rule may trap an active entity permanently in place.

## Tick-start capability, end-of-tick expenditure

Use the previous tick's energy to project a read-only capability snapshot.

Recommended order:

```text
1. reset ordinary participation and project lifecycle/commitment state
2. derive tick-start energy capability
3. behaviour, formation, rescue, medical approach, egress, and movement
4. target selection, attacks, defence, and hit resolution
5. treatment, execution, death counts, presence procedures
6. classify actual physical activity and build exertion records
7. apply energy expenditure/recovery
8. final unit energy aggregation
9. pressure recovery and morale consume the updated energy state
10. history/debug snapshot and tick increment
```

Movement and combat use tick-start capability.

Actual movement and actions then alter energy for subsequent behaviour. This avoids circular same-tick recalculation.

Do not charge energy from intended movement when no movement occurred. Prefer authoritative displacement and committed action records.

## One dominant movement context plus action impulses

Each active or player-presence entity receives one dominant physical context per tick, for example:

```ts
type EnergyActivityContext =
  | "safeStationaryRest"
  | "alertStationary"
  | "downedRest"
  | "walking"
  | "jogging"
  | "sprinting"
  | "dragging"
  | "beingDragged"
  | "medicalApproach"
  | "treating"
  | "underTreatment"
  | "executionCommitment"
  | "respawnEgress"
  | "waitingAtRespawn"
  | "inactiveTerminal";
```

The dominant context supplies the base per-tick cost or recovery.

Separate sparse impulses apply for:

```text
valid attack attempt
valid defence attempt
```

Do not add movement cost twice because several systems observed the same displacement.

## Initial tuning values

These are starting values for deterministic implementation and visual tuning, not sacred rules.

For an average 10,000-energy profile:

```text
safe stationary rest:       +5 per tick
alert stationary:           +2 per tick
downed rest:                +4 per tick
walking:                    -1 per tick
jogging:                    -8 per tick
sprinting/charging:        -40 per tick
dragging surcharge:        -12 per moving tick
medical approach:        normal gait cost
treating:                    0 per tick
under treatment:            +3 per tick
execution commitment:        0 per tick
respawn egress:         normal walking cost
waiting at respawn:         +5 per tick

valid attack attempt:       -80 impulse
valid defence attempt:      -50 impulse
```

Rules:

- no safe-rest recovery occurs on a tick with a strenuous movement context;
- attack and defence impulses stack with the dominant context;
- multiple canonical defence attempts in one tick each cost energy;
- invalidated pre-commitment actions cost nothing;
- a committed attack that later becomes invalid still costs the attack impulse;
- blocked, parried, failed, landed, and gate-rejected valid attacks use the same attack exertion cost;
- accepted hit loss does not apply a separate energy penalty in the first implementation because injury and pressure already model its immediate consequence;
- energy cost never changes ordinary one-hit damage.

Tune from retained visual scenarios rather than burying fixture-specific exceptions in production.

## Gait is separate from formation style

Formation style and physical gait are different concepts.

A unit may use:

```text
formedMarch
looseFlow
pushThrough
routing
```

while individuals physically:

```text
stand
walk
jog
sprint
```

If the current movement pipeline lacks an explicit gait output, add one narrow authoritative adapter rather than inferring every energy rule independently from formation-style names.

Actual displacement remains evidence for expenditure and validation.

## Movement capability

Energy may limit physical movement, but must preserve a minimum safe walk.

Suggested initial capability:

```text
fresh:
full walk, jog, sprint, and charge

working:
full walk
slightly reduced jog and sprint

winded:
slightly reduced walk
reduced jog
cannot begin ordinary sprint/charge

spent:
minimum safe walk
ordinary jog and sprint unavailable
```

Routing may request emergency fast movement, but cannot create energy from nothing:

- while energy remains, routing may use the best available gait;
- at zero, routing degrades to minimum safe walk;
- routing never becomes immobile solely because of energy.

A charge or sprint ends naturally when current energy no longer supports its gait.

Do not implement falls, collapse animations, or heat injury.

## Combat integration

Low energy affects combat through physical tempo, not hidden hit modifiers.

Use energy capability to modify:

```text
attack recovery duration
guard-readiness recovery rate
```

Do not modify:

```text
ordinary hit damage
global-hit maximum
armour
equipment defence tier
rear desperate-defence chance
full-readiness 95% ceiling
deterministic defence roll identity
```

Suggested starting multipliers:

```text
              Attack recovery     Guard recovery
fresh              100%                100%
working            110%                 90%
winded             135%                 70%
spent              175%                 50%
```

Round deterministically.

A tired fighter may still get lucky or block with equipment minimums. Energy does not remove those minimum chances.

Repeated attacks and repeated defence consume energy, making long flurries physically expensive without bypassing the existing one-second damage gate.

## Equipment burden

Derive a broad exertion burden from existing authoritative equipment.

The first implementation may use integer burden points:

```text
Armour:
none            0
light           1
mageArmour      1
medium          2
heavy           4

Held shield:
none            0
buckler         1
shield          2

Primary weapon:
unarmed/dagger  0
oneHanded/rod   1
greatWeapon     2
polearm/pike    2
ranged          2
staff           2
thrown          1
```

Burden modifies movement and dragging expenditure, not resting recovery and not ordinary attack damage.

Use broad categories only. Do not add kilogram simulation, locational armour weight, carried-pack inventory, left/right burden, or per-item mass.

A future loadout/content milestone may replace authored defaults with richer generated content but should retain this exertion adapter boundary.

## Injury and casualty work

Milestone 7 adopts the existing Milestone 6 authorities.

Energy effects:

- missing global hits may increase movement/combat expenditure through one bounded injury multiplier;
- disabled-leg or paralysed movement remains owned by the condition system, not energy;
- a traumatised character still withdraws through the trauma system and pays ordinary movement energy;
- drag helpers pay gait cost, equipment burden, and drag surcharge;
- the dragged patient pays no movement cost;
- gathering helpers pay their actual gait cost;
- claimed medical support pays approach movement cost;
- a treating healer is physically committed but initially neutral rather than heavily draining;
- a patient under treatment recovers some energy while stationary;
- a dying/downed character recovers at the downed-rest rate;
- successful treatment restores hits/lifecycle only and does not reset energy;
- terminal citizens freeze energy because they cannot return during the battle;
- barbarian respawn egress costs walking energy;
- `waitingAtRespawn` restores energy for later Milestone 9 re-entry decisions.

Do not add energy cost to dead/terminal character state itself.

## Pressure and morale boundary

Energy does not directly add hit loss, morale states, routing risk, or pressure impulses.

Low energy may reduce personal pressure-recovery credits.

Suggested starting multipliers:

```text
fresh:    100%
working:   90%
winded:    70%
spent:     50%
```

Nearby threat floors and attack/hit pressure impulses remain unchanged.

This creates the intended interaction:

```text
tired fighter
→ pressure dissipates more slowly
→ existing morale system may break them sooner
```

Do not create a second fatigue-morale state machine.

## Rest and conservation behaviour

Milestone 7 should implement bounded energy conservation without duplicating Milestone 8 command.

Add an inspectable individual/unit energy-behaviour recommendation such as:

```ts
type EnergyBehaviourRecommendation =
  | "normal"
  | "conserve"
  | "restWhenSafe";
```

A unit may enter a simple safe rest state when:

- it is not routing;
- it is not currently in hostile contact;
- it has no active compulsory casualty/execution/treatment movement;
- its active-member energy summary is below a named threshold;
- its existing order does not require immediate forced movement.

While safely resting:

- voluntary advance and re-engagement are suppressed;
- members hold position;
- ordinary defence remains available;
- hostile contact or an urgent existing commitment ends rest immediately;
- recovery continues according to actual local threat and activity.

A unit already in combat does not perform a magical coordinated disengagement merely because it is tired.

Milestone 8 owns captain-led withdrawal, relief, rotation, and deliberate command of rest periods.

Milestone 7 may make exhausted individuals reluctant to reacquire distant targets once contact breaks.

## Unit energy summaries

Derive deterministic unit summaries from active characters:

```text
active-member average energy
active-member minimum energy
fresh / working / winded / spent counts
fraction able to jog
fraction able to sprint/charge
drag-capable helper count
current rest recommendation
currently resting count
energy spent this tick
energy recovered this tick
```

Dying, terminal, egress, and waiting presences are excluded from active combat-unit averages, but may remain individually inspectable.

An all-downed unit must not manufacture average energy from zero members.

## Bounded history and inspection

Retain bounded per-entity summaries such as:

```text
starting energy
minimum energy reached
first winded tick
first spent tick
total energy spent
total energy recovered
attack exertion count
defence exertion count
sprint ticks
drag ticks
rest ticks
time waiting at respawn
```

Do not append one object per entity per tick for a one-hour battle.

Expose current energy, maximum, ratio, band, current activity, tick cost/recovery, burden, capability, and rest recommendation for inspected entities.

---

# State ownership

## IndividualEnergyProfileStore

Owns trusted immutable:

- maximum energy;
- starting energy;
- safe-rest recovery rate.

## IndividualEnergyStore

Owns:

- current energy;
- current band;
- last strenuous tick;
- bounded lifetime counters;
- current-tick spend/recovery totals.

## IndividualEnergyCapabilityStore

Tick-start derived read model owning:

- allowed gait;
- movement multipliers;
- attack-recovery multiplier;
- guard-recovery multiplier;
- pressure-recovery multiplier.

It must not become a second mutable energy authority.

## IndividualEnergyActivityStore

Reusable current-tick classification/output owning:

- dominant context;
- actual movement distance;
- movement cost;
- attack impulses;
- defence impulses;
- burden multiplier;
- recovery applied;
- rejected/clamped expenditure.

## UnitEnergySummaryStore

Derived final unit summaries only.

It does not spend or restore individual energy.

---

# Numbered implementation slices

## 7A — Trusted profiles, current-energy store, bands, and inspection

Deliver:

- trusted energy profile validation;
- entity-indexed current/max storage;
- default profile;
- ratio/band derivation;
- bounded getters and history;
- deterministic scenario expansion;
- no production behaviour effects yet.

Tests:

- complete profile coverage;
- arbitrary input ordering;
- validation and bounds;
- default and explicit partial starting energy;
- exact band thresholds;
- no inference from experience, faction, nation, role, or equipment;
- replay determinism;
- 100–2,000 entity structural coverage.

Boundary:

No expenditure, recovery, movement, combat, morale, renderer, or UI integration.

---

## 7B-1 — Authoritative activity classification

Deliver:

- one reusable entity-indexed current-tick activity record per entity;
- exact net integer displacement evidence captured once from tick-start and final positions;
- observation-only walk/jog/sprint intensity derived from integer axis displacement;
- authoritative movement-source flags for ordinary movement, gathering, dragging,
  being dragged, medical approach, trauma withdrawal, respawn egress, and forced displacement;
- canonical attack-attempt and defence-attempt counts from production records;
- final lifecycle, presence, treatment, execution, pressure, and casualty precedence;
- bounded inspected-entity fields;
- no energy expenditure, recovery, history change, or gameplay effect.

Dominant-context precedence is deterministic:

```text
waitingAtRespawn
respawnEgress
terminalComforted / removedFromBattlefield
beingDragged
dragging
treating
underTreatment
executionCommitment
other terminal state
medicalApproach
downedRest
observed walk / jog / sprint
alertStationary / safeStationaryRest
```

Attack and defence records remain separate impulses and do not replace the
dominant context. A canonical invalidated attack record represents an attack
that was already committed; invalid pre-commitment input emits no record.

Production observes movement-authority checkpoints without summing their
distances. The final activity store records only the exact tick-start-to-final
displacement, so several authorities cannot double-charge movement in 7B-2.

Tests:

- all dominant contexts and precedence;
- personal versus external movement and integer intensity;
- canonical valid/committed-invalid attacks and successful/failed defence;
- multiple same-tick defence attempts;
- caller-owned store reuse, replay, and processing-order independence;
- production casualty procedure integration with unchanged energy;
- idle structural coverage at 100–2,000 entities.

Boundary:

Observe production only. Do not spend or recover energy, update energy history,
or alter movement, gait, combat, pressure, morale, renderer, worker, or UI state.

---

## 7B-2 — Base expenditure and recovery application

Status: implemented.

Deliver:

- consume the accepted 7B-1 dominant context and exact displacement evidence;
- translate attack and defence counts into exertion impulses;
- safe/alert/downed rest;
- energy application and clamping;
- production ordering after physical actions;
- no energy effects on behaviour yet.

Tests:

- stationary safe recovery;
- hostile-nearby alert recovery;
- walk/jog/sprint cost distinction;
- valid attack/defence impulses;
- invalid actions cost nothing;
- multiple defence attempts stack;
- dragged patient pays no movement cost;
- downed recovery;
- no hit restoration;
- no duplicate movement charge.

Boundary:

Observe production; do not yet limit movement or combat.

Implementation notes:

- `IndividualEnergyActivityStore` owns reusable entity-indexed current-tick
  request, application, clamp, before/after, and last-strenuous outputs;
- `IndividualEnergyStore` remains the sole current-energy and bounded-history
  mutation authority through its named spend and recovery APIs;
- exact net 7B-1 displacement produces at most one base gait charge;
- personal gathering, drag-helper, medical-approach, trauma-withdrawal, and
  respawn-egress movement use the ordinary observed gait charge;
- dragged patients and solely externally displaced entities receive no base
  movement charge;
- canonical committed attack and defence records stack checked integer impulses;
- any requested expenditure suppresses recovery, including when expenditure is
  clamped at zero;
- safe stationary recovery comes from the trusted profile, while alert and
  downed recovery use the named initial constants;
- treatment, waiting-at-respawn, terminal, and all other contexts remain neutral;
- application runs in canonical entity-ID order after 7B-1 finalisation and
  before final inspection/history snapshots;
- energy remains downstream-only and cannot yet alter gameplay decisions.

---

## 7B-2A — Energy authority sequencing and ownership correction

Status: implemented.

The reusable `IndividualEnergyActivityStore` explicitly tracks the current
observation-started, classification-completed, and application-completed ticks.
All three begin at `-1`. Production and focused callers must follow:

```text
begin observation
→ observe authoritative movement and action evidence
→ classify exactly once
→ apply exactly once
```

Beginning a new observation resets current-tick evidence and application
outputs, and invalidates the previous classification. A creation-time tick-zero
debug classification may be replaced by the real tick-zero observation before
application. Backwards observation, restarting an applied tick, classification
without its matching observation, duplicate classification, application before
classification, and duplicate application are rejected before they can mutate
action impulses, energy, bounded history, or current-tick outputs.

Persistent `lastStrenuousTick` is owned only by `IndividualEnergyStore` and is
updated by the canonical spend API whenever requested expenditure is positive,
including when expenditure clamps to zero. Recovery never changes it. Activity
inspection exposes only a read-model value sourced from that authority.

This correction changes no tuning, activity classification, expenditure,
recovery, or gameplay outcome. Milestone 7B is complete after this correction;
7C-1, 7C-2, 7C-3a, and 7C-3b are implemented below; 7C-3c remains the next
implementation slice.

---

## 7C-1 — Gait authority and capability projection — implemented

- Formation owns ordinary physical gait independently of coordinate correction
  limits and morale or formation style.
- Tick-start individual capability projection derives fresh/working sprint,
  winded jog, spent minimum-walk, and non-mobile stationary limits from the
  preceding energy and final lifecycle/presence authorities.
- A reusable formation capability bridge reads entity count, projection tick,
  ordinary capability, routing capability, and minimum-walk availability
  directly from the capability store.
- Formation records requested and effective gait separately. Ordinary and
  routing participants select their corresponding capabilities; explicit holds
  keep the unit anchor stationary and non-participants remain stationary. A
  later valid tick deterministically overwrites the previous projection.
- Bounded inspection keeps formation requested/effective/reduction fields
  separate from actual energy-activity gait and expenditure.
- Focused validation rejects null, stale, future, and mismatched capability
  contexts before formation mutation. Production regressions prove adapter
  reuse, live metadata, blocked-movement semantics, and the then-projection-only
  fresh-versus-spent equivalence.
- Semantic actual gait owns energy expenditure while requested and effective
  formation gait were diagnostic in 7C-1 and become ordinary enforcement input
  in 7C-2.
- `memberMaxStep` remains a coordinate slot-correction limit. Low-level
  formation tests may exercise zero correction limits where permitted, while
  authored production scenarios require a positive safe integer.
- Production combat sandboxes require at least one entity. The formation
  capability adapter reads store-level metadata directly and does not depend on
  inspecting a particular entity.
- The creation-time capability preview uses a null projection tick; the first
  production tick replaces it with the canonical tick-zero projection without
  same-tick energy feedback.

Boundary: 7C-1 projects capability but does not enforce it. It does not clamp
actual movement, alter movement distance or remainders, end sprint/charge, slow
routing, or change combat, casualty, pressure, morale, or specialist movement.

---

## 7C-2 — Formation and routing movement enforcement — implemented

- Ordinary active formation members apply their effective tick-start gait after
  existing formation, morale, blocker, contact, overtaking and bounds rules.
  Per-axis ceilings are stationary `0`, walking `1`, jogging `2`, while
  sprinting retains the previously permitted step.
- Ordinary energy activity now records the effective gait when self-propelled
  displacement occurs, so movement expenditure follows the enforced gait and
  remains zero without displacement.
- Entity-indexed pre/post energy-step diagnostics and reduction flags are
  overwritten each successful formation tick and exposed only through bounded
  individual inspection.
- Spent active members retain minimum walking movement where existing movement
  authorities permit it, so tired members may lag without teleportation or
  catch-up.
- Before ordinary anchor movement, formation projects each eligible member's
  requested/effective gait exactly once. Fixed gait-rank counts select the
  lower median at `floor((eligibleCount - 1) / 2)` without per-tick sorting or
  allocation; non-participants do not contribute.
- After existing unit-speed, morale-scale and fixed-point-remainder authority,
  ordinary anchor steps are capped at stationary `0`, walking `1`, jogging `2`,
  while sprinting preserves the previously permitted step. Give-ground and
  formed-detour direction remain owned by their existing policies.
- Bounded unit diagnostics expose the requested unit gait, effective anchor
  gait, eligible/rank counts, pre/post energy step, reduction flag and whether
  anchor energy policy applied.
- Routing pre-projects sprint requests through each eligible member's routing
  capability exactly once, reuses the effective member gait, and derives its
  anchor gait through the same fixed-count lower median.
- Existing routing contact, pass-through, direction and world-bound authorities
  determine permitted anchor/member movement first. Gait ceilings then reduce
  the bounded displacement without increasing either component. Pass-through
  records use only the post-energy segment.
- Routing energy activity consumes effective gait: displaced fresh/working,
  winded and spent routers spend sprint, jog and walking cost respectively;
  blocked routing remains stationary and free. Current-tick expenditure affects
  capability only on the following tick, and zero-energy active routers retain
  minimum walking movement where existing authorities permit it.
- Ordinary anchor and member movement now applies existing world bounds before
  energy ceilings. Bounds-only blocking retains requested/effective gait while
  actual gait is stationary and free, and fixed-point remainders remain owned
  by the existing movement policy.
- Explicit hold and recovery keep requested unit and effective anchor gait
  stationary while eligible member slot correction uses the named walking
  reformation gait. Existing morale scaling applies before the energy ceiling;
  zero-energy active members retain minimum walking, and actual displacement
  alone determines actual gait and expenditure.
- Consolidation regressions cover ordinary and routing requested/effective/
  actual gait separation, lower-median anchor policy, diagnostic overwrite,
  following-tick capability changes, and post-energy pass-through segments.
- A deterministic mixed-band production run verifies identical positions,
  anchors, gait diagnostics, energy, events, pass-through, morale and casualty
  lifecycle results across repeated runs.
- Structural performance coverage exercises 100, 500, 1,000 and 2,000 entities,
  including 100 units of 20 at 2,000 entities, without timing thresholds or
  inspection-object use in the hot formation path.
- Retained pre-energy Milestone 3 and 4 fixtures use a finite shared isolation
  energy profile and explicit fixture gait/geometry where required. This keeps
  their documented combat, morale, contagion and recovery observations visible
  without changing production defaults or morale mechanics.

No combat-tempo, pressure, equipment-burden, rest-decision, or specialist
movement enforcement belongs to this step.

---

## 7C-3 — Specialist movement enforcement and consolidation — in progress; 7C-3a and 7C-3b implemented

### Goal

Apply the accepted tick-start physical-gait capability to every existing
specialist movement authority without moving destination choice, lifecycle
policy, rescue policy, medical policy, or player-presence policy into energy.

This slice covers only movement already implemented by Milestone 6:

- helpers gathering to a casualty;
- helpers dragging a casualty while the patient is externally displaced;
- a claimed Physick approaching a patient;
- an active mobile traumatic-wound patient withdrawing for treatment;
- barbarian `respawnEgress` movement;
- scenario-forced or otherwise externally imposed displacement only far enough
  to prove that it remains external and is not energy-clamped or charged as
  self-propelled movement.

Terminal-citizen movement to the Sentinel Gate does not exist yet and remains
Milestone 9 work. It is not part of 7C-3.

### Architecture and ownership decisions

#### Existing systems continue to choose movement

The existing specialist authorities retain ownership of:

- whether an entity participates;
- the selected patient, helper, claim, withdrawal goal, drag destination, or
  respawn destination;
- cancellation, hand commitment, treatment range, arrival, lifecycle, and
  player-presence transitions;
- world-bound handling and the existing drag-speed remainder.

Energy receives the already-selected movement request and may only reduce its
physical gait. It must never create a request, redirect it, select a different
goal, make an ineligible entity mobile, or revive a terminal battlefield
character.

Specialist movement ownership must not be moved into `formationBehaviour.ts`.
The existing formation-owned bounded individual movement functions may accept
a caller-supplied final step ceiling, but they must not learn casualty,
medicine, trauma, egress, or energy policy.

#### One narrow shared physical-gait boundary

Create a small allocation-free shared physical-gait module rather than adding
more gait helpers to `formationBehaviour.ts` or creating a generic movement
framework.

The shared boundary owns only:

- the `stationary < walking < jogging < sprinting` ordering;
- deterministic gait clamping;
- the existing per-axis coordinate ceilings (`0`, `1`, `2`, and unbounded by
  gait for sprinting, while the movement authority's configured limit remains
  authoritative);
- deterministic mapping from an already-selected non-negative maximum step to
  requested gait;
- the narrow current-tick specialist capability/evidence contract.

Move or re-export existing generic gait helpers so formation, activity
classification, and specialist movement use one definition. Do not leave
competing gait ranks, step mappings, or ceilings in several files.

The specialist capability adapter is created once with caller-owned storage
and reads the existing `IndividualEnergyCapabilityStore`. It must validate the
current projection tick and entity count before any specialist movement
mutation. It must not allocate an options object, result object, or array per
entity or movement request.

#### Capability categories remain explicit

Tick-start projection exposes separate read-only limits for:

```text
ordinary/routing active movement
active self-propelled specialist movement
respawn-egress procedure movement
```

Active gathering, medical-approach, and trauma-withdrawal movement use the
same energy-band maximum gait and minimum-safe-walk rule as other active
self-propelled movement.

Dragging helpers are also active self-propelled movers. The dragged patient is
externally displaced and contributes no gait capability to the group.

`respawnEgress` is a separate player-presence procedure. It requests walking
only. A terminal barbarian in `respawnEgress` therefore receives an explicit
procedure-walking capability while remaining terminal, non-combatant,
non-formation, and ineligible for ordinary active movement. Do not broaden the
meaning of `active`, `activePresence`, or the existing ordinary
`minimumSafeWalkAvailable` field to achieve this.

Missing respawn destination, a not-yet-started egress tick, arrival, waiting at
respawn, terminal citizen presence, removed presence, and every other
non-moving presence remain stationary.

#### Requested, effective, and actual gait

For each authority:

```text
requested gait = gait selected by the existing movement policy
effective gait = requested gait clamped by the relevant tick-start capability
actual gait    = effective gait when self-propelled displacement occurred,
                 otherwise stationary
```

Rules:

- capability from energy spent during the current tick applies only on the
  following tick;
- existing lifecycle, participation, condition, commitment, timing, goal, and
  world-bound rules run as their authorities require;
- energy is a final non-increasing magnitude ceiling and cannot turn a blocked
  or bounded request into movement;
- a permitted active mover at zero energy retains walking where its specialist
  authority still permits movement;
- no displacement means stationary actual gait and no movement expenditure,
  even when requested and effective gait were non-stationary;
- self-propelled displacement records effective gait as actual gait;
- dragged patients and scenario-forced entities record external displacement,
  stationary self-propelled gait, and no personal movement expenditure;
- several movement authorities observed in one tick still produce one final
  tick-start-to-final displacement and at most one base movement charge;
- an invalid, inactive, terminal, waiting, or otherwise disallowed
  self-propelled request must remain stationary rather than being rescued by
  minimum-walk policy.

#### Authority-specific requested gait

Casualty gathering, claimed-patient approach, and trauma withdrawal preserve
their current configured maximum-step request. The shared maximum-step mapping
turns that request into physical gait before capability clamping.

Drag movement preserves the existing half-speed fixed-point policy:

```text
slowest configured helper step
→ existing drag factor and remainder
→ requested group step and requested gait for this tick
→ minimum effective gait across required helpers
→ shared bounded group delta
```

The minimum, not a median, is authoritative because every required helper must
remain attached to the same drag group. The patient does not participate in
the minimum. Energy clamping must not consume, refund, or rewrite the existing
drag-speed remainder. All participants retain one identical final delta.

Respawn egress requests walking regardless of the old Milestone 6 maximum-step
constant. Its existing destination and arrival rules remain unchanged.

#### Diagnostics and observation

The bounded energy-activity inspection becomes the cross-authority individual
summary and exposes:

```text
movement authority
requested physical gait
effective physical gait
actual physical gait
whether energy reduced the gait
whether self-propelled displacement occurred
whether external displacement occurred
final tick displacement
movement expenditure requested/applied
```

Do not infer specialist requested gait after movement from
`FormationBehaviourStore.movementMode`. A bounded or blocked request may
legitimately produce no displacement and overwrite that mode with
`holdPosition`. Each specialist authority must provide its decision/result to
the shared evidence boundary directly.

Formation retains formation-specific member and anchor diagnostics. Drag,
medical, trauma, and egress authorities retain their existing domain records.
The activity store does not replace those authorities; it supplies the one
cross-authority gait/expenditure view.

Move movement observation immediately beside the authority it observes where
practical. Final activity classification still calculates exact net
tick-start-to-final displacement once, so checkpoint observation cannot double
charge an entity.

### Expected files and layer impact

Expected simulation files:

```text
src/sim/individualPhysicalGait.ts                         new shared primitives
src/sim/individualEnergyCapability.ts                    specialist/egress read limits
src/sim/individualEnergyActivity.ts                      final gait evidence/inspection
src/sim/formationBehaviour.ts                            import shared primitives and accept a bounded caller ceiling only
src/sim/individualCasualtyAssistance.ts                  gather/drag enforcement
src/sim/individualMedicalClaims.ts                       claimed-patient approach enforcement
src/sim/individualMedicalReadModel.ts                    trauma-withdrawal enforcement
src/sim/individualRespawnEgress.ts                       walking procedure enforcement
src/sim/simulation.ts                                    canonical adapter wiring and observation order
```

Expected tests are the focused counterparts for those authorities plus
production integration and structural performance coverage.

No worker, renderer, UI, or content change is expected. A retained fixture may
receive an explicit finite energy profile only if an existing named
pre-energy observation otherwise becomes impossible; production defaults and
the evolving `/` scenario must not be neutralised.

### Ordered implementation slices

#### 7C-3a — Shared gait authority and specialist capability contract — implemented

Deliver:

- extract the shared gait type, ordering, clamp, coordinate ceiling, and
  maximum-step mapping from their current mixed owners;
- preserve formation and activity public semantics while migrating imports;
- extend tick-start capability with explicit active-specialist and
  respawn-egress limits without changing production positions;
- add the allocation-free current-tick specialist capability/evidence adapter;
- add effective gait and energy-reduction state to bounded activity inspection;
- keep existing formation-specific diagnostics intact;
- make no production specialist movement behave differently yet.

Tests:

- exact gait ordering, clamping, coordinate ceilings, and maximum-step mapping;
- fresh/working/winded/spent active-specialist limits;
- minimum walk for active spent specialists;
- non-active self-propelled specialist limits remain stationary;
- `respawnEgress` projects procedure walking without becoming active or
  combat-eligible;
- waiting, missing/other presence, and terminal citizens do not receive egress
  walking;
- stale, future, null, mismatched, duplicate, and backwards projection use is
  rejected before mutation;
- existing formation, routing, energy-activity, replay, and production tests
  remain unchanged in outcome.

Boundary:

No specialist coordinate enforcement, drag change, egress-speed change,
expenditure tuning, or retained-fixture retuning.

#### 7C-3b — Active self-propelled specialist enforcement — implemented

Deliver:

- enforce tick-start gait for casualty gathering;
- enforce tick-start gait for a claimed Physick approaching a patient;
- enforce tick-start gait for active trauma withdrawal;
- pass only a final non-increasing step ceiling through the existing bounded
  individual movement path;
- emit direct requested/effective/actual gait evidence for attempted,
  displaced, bounded, and blocked movement;
- preserve all existing commitment, target, goal, treatment-range, withdrawal,
  lifecycle, participation, movement-mode, and world-bound rules.

Tests for each authority:

- fresh movement preserves the existing request;
- winded/spent capability reduces it deterministically;
- zero-energy active movement retains walking;
- current-tick expenditure changes capability only next tick;
- already-at-goal, world-bounded, and zero-displacement requests are free;
- inactive, dying, terminal, receiving-treatment, cancelled, or otherwise
  authority-ineligible entities remain stationary under their existing rule;
- requested/effective/actual gait and reduction diagnostics are exact;
- ordinary formation movement for non-participants remains unchanged;
- repeated runs produce identical positions, decisions, diagnostics, energy,
  and events.

Boundary:

No drag-group movement, respawn egress, treatment recovery, burden, injury
multiplier, rescue selection, triage, or new medical behaviour.

#### 7C-3c — Cooperative drag-group enforcement

Deliver:

- derive the requested group gait from the existing slowest-helper drag step
  and remainder;
- clamp it to the minimum effective gait of all required helpers;
- apply one coherent post-energy delta to helpers and patient;
- keep the patient externally displaced, stationary for personal gait, and
  free of base movement expenditure;
- keep helper activity self-propelled and record its effective gait;
- preserve group formation, cancellation, hand commitment, destination,
  reached-safety, and history policy.

Tests:

- one Physick and two-fighter groups remain coherent;
- the slowest energy-limited required helper controls the whole group;
- helper ordering does not change the result;
- a spent/zero-energy valid helper still permits minimum walking;
- the patient never limits the group and never pays personal movement cost;
- existing drag-speed remainder is deterministic and unchanged by energy
  reduction or bounds;
- no participant teleports, exceeds its permitted shared delta, or diverges;
- blocked/bounded groups remain free for base movement and retain inspectable
  requested/effective/actual gait;
- cancellation and reached-safety semantics remain exactly once;
- repeated runs produce identical group state, positions, diagnostics, energy,
  and records.

Boundary:

No drag surcharge, equipment burden, missing-hit modifier, defence change,
treatment change, or pathfinding.

#### 7C-3d — Respawn egress enforcement and production consolidation

Deliver:

- replace the old fast egress step with explicit procedure walking through the
  shared gait boundary;
- retain the post-classification start delay, destination, missing-destination,
  arrival, compaction, `waitingAtRespawn`, terminal lifecycle, and non-combat
  rules;
- place all specialist movement observations beside their authorities;
- remove superseded post-hoc gait inference and duplicate shared gait helpers;
- finalise requested/effective/actual/reduced diagnostics across formation,
  gathering, dragging, medical approach, trauma withdrawal, egress, dragged
  patients, and external displacement;
- add production determinism and structural performance coverage for the full
  7C movement boundary.

Tests:

- egress begins only after its existing start tick and advances at walking
  gait;
- all energy bands, including zero energy, retain procedure walking because
  walking is the only requested egress gait;
- missing destination, arrival, and waiting remain stationary and free;
- egress never reactivates lifecycle, hits, combat, formation, morale, rescue,
  or targeting participation;
- externally forced fixture displacement is not clamped or personally charged;
- source precedence and one-base-charge semantics remain deterministic when
  several movement checkpoints occur in one tick;
- a mixed production run repeats with identical positions, claims, drag state,
  trauma state, presence, gait diagnostics, energy, combat, morale, events, and
  final snapshot;
- retained Milestone 3, 4, and 6 scenarios preserve their named observations;
- structural cases cover 100, 500, 1,000, and 2,000 entities, including a
  representative small specialist population, without timing thresholds or
  hot-path inspection-object creation.

Boundary:

No citizen Sentinel Gate egress, barbarian batching/re-entry, scenario clock,
combat-tempo effects, burden, injury modifiers, drag surcharge, treatment or
waiting recovery, terminal-energy freeze, unit summaries, pressure recovery,
rest behaviour, renderer, worker, UI, or content expansion.

### 7C-3 done criteria

7C-3 is complete only when:

- every existing Milestone 6 self-propelled movement authority consumes the
  current tick-start gait capability;
- every permitted zero-energy mover can still walk where its authority permits;
- no inactive entity gains movement from energy policy;
- dragged and externally moved entities remain externally displaced and free
  of personal base movement cost;
- respawn egress walks without making a terminal barbarian active;
- requested, effective, and actual gait are distinct and inspectable;
- actual displacement continues to own expenditure and is charged at most
  once;
- no specialist ownership has moved into formation or energy;
- no new per-entity hot-path allocations or all-entity pair scans exist;
- focused, full headless, replay, typecheck, build, and performance suites pass;
- no 7D, 7E, lifecycle, command, perception, terrain, or Milestone 9 behaviour
  was implemented early.

---

## 7D — Combat exertion, attack tempo, and guard recovery

Deliver:

- attack and defence impulses integrated with production combat;
- energy-band attack-recovery multipliers;
- energy-band guard-readiness recovery multipliers;
- committed-invalid attacks still cost energy;
- no direct defence-chance, damage, or hit changes;
- exact interaction with existing experience-based readiness recovery.

Tests:

- repeated attacks drain energy;
- repeated blocks drain energy;
- low energy slows attack cadence;
- low energy slows readiness recovery;
- equipment minimum and 95% ceiling remain intact;
- rear 5% defence unchanged;
- one-second damage gate unchanged;
- recruit/regular/veteran readiness differences remain separate from energy;
- deterministic roll identity unchanged.

Boundary:

No load burden, casualty work, morale, or resting AI.

---

## 7E — Equipment burden, injury, dragging, medicine, and respawn procedure

Deliver:

- broad equipment-burden derivation;
- movement/drag expenditure modifier;
- bounded missing-hit exertion modifier;
- gather/drag/helper energy costs;
- medical-approach cost;
- treatment/downed recovery;
- respawn-egress expenditure;
- waiting-at-respawn recovery;
- terminal-citizen freeze;
- no lifecycle or treatment ownership changes.

Tests:

- heavy kit costs more than light kit for equal movement;
- shield/weapon burden is broad and deterministic;
- burden does not alter rest recovery or damage;
- drag helper costs exceed ordinary walking;
- patient pays no drag movement cost;
- solo Physick and two-fighter drag costs are inspectable;
- treatment does not reset energy;
- revived character keeps current energy;
- dying recovery can matter after revival;
- egress consumes and waiting restores;
- citizens do not use barbarian waiting recovery.

Boundary:

No command, terrain, perception, detailed inventory mass, or respawn re-entry.

---

## 7F — Pressure recovery and unit energy summaries

Deliver:

- energy multiplier on personal pressure recovery only;
- active-member unit energy summaries;
- charge/jog/drag capability counts;
- exact exclusion rules for downed/terminal/egress/waiting;
- no duplicate morale authority.

Tests:

- attack pressure impulses unchanged;
- proximity floor unchanged;
- tired entity recovers pressure more slowly;
- energy does not directly route or alter morale thresholds;
- unit averages exclude inactive presences;
- all-downed units preserve valid empty-summary semantics;
- treatment/drag commitments remain excluded from ordinary support as already established.

Boundary:

No rest/disengagement behaviour yet.

---

## 7G — Conservation, safe rest, and re-engagement reluctance

Deliver:

- bounded energy behaviour recommendation;
- safe unit rest state;
- hold/recovery while safe and exhausted;
- rest interruption on threat or compulsory commitment;
- reluctance to reacquire distant combat while spent;
- rejoin ordinary behaviour after sufficient recovery;
- no captain/order system duplication.

Tests:

- exhausted safe unit rests;
- nearby hostile prevents full safe rest;
- active contact prevents magical disengagement;
- hostile approach interrupts rest;
- rescue/treatment/execution commitments take priority;
- recovered unit may re-engage;
- existing explicit orders remain authoritative where required;
- no global battlefield safety scan;
- deterministic thresholds and tie-breaking.

Boundary:

No captain-issued relief, rotation, withdrawal orders, communication, or perception memory.

---

## 7H — Production consolidation, soak, and performance

Deliver:

- final production order;
- bounded energy history and debug summaries;
- representative ordinary and exhaustion-heavy performance cases;
- one-hour deterministic soak;
- output reuse/allocation assessment;
- main-battle integration smoke.

Representative cases:

```text
2,000 entities
100 units × 20
mixed equipment
mixed energy profiles
ordinary combat/casualty population
small drag/treatment/egress population
```

Also include:

```text
sprint-heavy stress
dense repeated-defence stress
casualty-extraction stress
```

Report stage mean/max/p95 with structural assertions only.

Prove:

- no energy underflow/overflow;
- no hit regeneration;
- no active entity becomes permanently immobile from energy;
- deterministic replay across long runs;
- no dense entity-pair energy store;
- idle-tick overhead remains visible.

---

## 7I — Retained energy visual suite

Add:

```text
/test?scenario=energy-exertion
```

Start paused at tick 0.

Suggested isolated chambers:

1. safe stationary recovery;
2. walk versus jog versus sprint drain;
3. different capacities under identical work;
4. repeated attack and defence exertion;
5. light versus heavy equipment burden;
6. ordinary walking versus casualty dragging;
7. fresh versus exhausted attack/readiness recovery;
8. safe rest versus hostile staredown;
9. exhausted unit safe-rest and re-engagement;
10. barbarian downed/egress/waiting energy continuity.

Expose:

```text
current / maximum energy
percentage and band
dominant activity
movement and action costs
recovery
burden
allowed gait
attack/guard/pressure multipliers
unit energy summary
rest recommendation/state
```

Use explicit shortened fixture profiles where needed, while production rates remain unchanged.

Visual grammar should make energy readable without turning the battlefield into a wall of bars. Detailed overlays remain hideable.

Human questions:

- does sprinting visibly exhaust people quickly enough;
- is jogging sustainable for meaningfully longer than sprinting;
- does walking remain viable;
- do repeated attacks and blocks visibly matter;
- do heavy and light kit differ credibly;
- does dragging feel costly;
- do tired fighters slow without becoming helpless;
- does rest take long enough to matter;
- does safe recovery feel faster than recovery under threat;
- does low energy influence morale indirectly rather than becoming morale;
- can a barbarian plausibly recover while down and waiting without receiving a magical reset?

---

## 7J — Main battle integration and milestone acceptance

Update the evolving `/` main battle sandbox to:

- use mixed explicit energy profiles;
- show compact side/unit energy summaries;
- retain pause, reset, step, speed, and debug controls;
- reuse the energy visual grammar;
- demonstrate fatigue across combat, rescue, treatment, routing, and barbarian waiting;
- preserve all retained `/test` routes.

Do not script exhaustion outcomes.

Milestone 7 is accepted only after:

- headless regression;
- representative performance and one-hour soak;
- retained visual inspection;
- main-battle inspection.

---

# Integration invariants

Throughout Milestone 7:

- current energy is owned by `IndividualEnergyStore`;
- unit summaries never spend or restore energy;
- activity is charged from authoritative actual results;
- one movement tick is charged once;
- energy never restores global hits;
- energy never changes maximum global hits;
- energy never directly applies morale state, routing risk, or pressure impulses;
- pressure recovery may consume an energy-derived multiplier;
- experience remains separate from energy;
- equipment burden uses existing combat/loadout authority;
- casualty, treatment, execution, and presence stores remain authoritative for their own states;
- no terminal citizen becomes active because energy recovered;
- barbarian waiting energy does not cause re-entry before Milestone 9;
- zero energy never makes an active character permanently immobile;
- no dense entity-pair energy matrix exists;
- no renderer, worker, DOM, browser, wall-clock, or random API enters `src/sim`.

---

# Explicit deferrals

## Milestone 8

- captain-issued rest, relief, withdrawal, rotation, and re-engagement orders;
- command obedience under fatigue;
- captains estimating unit energy imperfectly.

## Milestone 9

- energy-dependent barbarian respawn batching and willingness to re-enter;
- battle-clock effects;
- citizen Gate withdrawal energy;
- late-battle exhaustion and respawn cessation.

## Milestone 10

- perceived tiredness;
- imperfect knowledge of allied or hostile energy;
- remembered rest locations and support.

## Milestone 11

- generated physical-profile distributions;
- richer loadout burden from canonical runtime content;
- adopted/migrated energy profile defaults.

## Milestone 12

- terrain exertion;
- slopes, rough ground, mud, obstacles, and safe rest areas;
- path cost.

## Milestone 13

- energy interaction with calls and heroic effects;
- `WEAKNESS`;
- forced movement exertion;
- active skill expenditure where approved.

## Later/out of scope

- hydration;
- heat illness;
- nutrition;
- weather;
- sleep deprivation;
- cramp;
- exact biomechanics;
- kilogram-level equipment mass;
- locational fatigue;
- collapse/unconsciousness from exhaustion;
- natural global-hit recovery during a normal battle.

---

# Definition of done

Milestone 7 is complete when:

- every individual has deterministic finite energy;
- actual movement and combat activity spend energy once;
- safe rest and downed/waiting procedures recover energy;
- movement gait and sprint duration respond to energy;
- low energy slows attack and guard recovery without changing damage or defence floors;
- equipment and casualty work affect expenditure;
- treatment and revival preserve physical energy rather than resetting it;
- low energy slows pressure recovery without becoming a second morale system;
- safe exhausted units can rest and later re-engage;
- unit summaries expose useful physical capability;
- one-hour replay remains deterministic and bounded;
- representative 2,000-entity performance remains viable;
- the retained energy visual suite is readable;
- the main battle visibly develops fatigue over time.

## Milestone boundary

> Milestone 6 decides who is injured, rescued, treated, terminal, comforted, or waiting to respawn. Milestone 7 decides how much physical work each player can still perform, how quickly they recover, and when a unit must stop pretending that enthusiasm is an infinite fuel source.
