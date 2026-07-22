# Milestone 7: Energy, Exertion, and Rest

Status: active; 7A, 7B-1, 7B-2, and the narrow 7B-2A authority
sequencing correction are implemented; 7B is complete. 7C is split into 7C-1
gait/capability authority and 7C-2
movement enforcement; 7C-1 and the narrow 7C-1A gait/capability inspection
and 7C-1B/7C-1C verification corrections are implemented.

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
7C-1 is implemented below and 7C-2 remains the next implementation slice.

---

## 7C-1 — Explicit physical-gait authority and tick-start capability

Status: implemented.

Deliver:

- canonical `IndividualPhysicalGait` separate from formation and morale state;
- reusable current-tick requested/actual gait, source, displacement and external
  movement evidence in `IndividualEnergyActivityStore`;
- explicit gait evidence at ordinary, routing, casualty gathering/dragging,
  medical approach, trauma withdrawal, respawn egress, dragged-patient and
  scenario-relocation boundaries;
- semantic gait, rather than coordinate-distance thresholds, as the 7B movement
  expenditure authority while retaining displacement diagnostics;
- entity-indexed `IndividualEnergyCapabilityStore` projected once at tick start
  from preceding energy and final lifecycle/presence;
- fresh/working sprint, winded jog, spent minimum-walk, and non-mobile stationary
  capability outputs;
- projection-tick validation and no same-tick energy feedback;
- bounded inspection and 100–2,000 entity structural coverage.

Boundary:

7C-1 observes and projects only. It does not clamp gait, alter movement distance,
end sprint/charge, slow routing, or feed capability back into behaviour.

---

## 7C-1A — Formation-owned ordinary gait and initial capability inspection

Status: implemented.

This narrow correction removes `memberMaxStep` from ordinary physical-gait
authority. `memberMaxStep` remains the per-member coordinate
slot-following/correction limit. Formation now expands an immutable,
unit-owned `ordinaryPhysicalGait` once: legacy scenarios default from
`unitSpeed` (`0` stationary, `1` walking, `2` jogging, `>=3` sprinting), while
an explicit scenario value overrides that compatibility adapter without
changing coordinate speed.

Each formation tick exposes requested gait per entity: ordinary advance,
giving-ground and detour movement use the unit gait; routing requests
sprinting; effective holds and non-participation request stationary. Requested
gait remains present when movement is blocked and actual gait is stationary.
The energy observer consumes this formation output; specialist casualty,
medical, egress, patient and external-displacement policies are unchanged.
The main-battle `unitSpeed: 2` / `memberMaxStep: 3` advance therefore uses
jogging expenditure (8 per moving tick), not sprint expenditure.

Capability inspection now seeds a real creation-time preview from current
energy, lifecycle and presence with `projectionTick: null`. The canonical
first production projection replaces that preview at tick 0, retaining
duplicate and backwards-projection validation. This correction does not alter
positions, movement modes/styles, combat, casualty outcomes, pressure or
morale.

---

## 7C-1B — Supported-runtime verification correction

Status: implemented.

The 7C-1A verification fixtures were corrected without changing formation or
production movement rules. An advancing low-level formation member with a zero
correction limit retains `advanceWithUnit` semantics and its requested unit
gait; lack of displacement is not an explicit hold. The production regression
now uses valid positive `memberMaxStep` values and an existing hostile-contact
blocker to prove requested jogging, actual stationary gait, and zero movement
expenditure. This preserves the intended validation boundary: low-level
formation-store tests may use a zero correction limit, but authored live combat
scenario content requires a positive correction limit.

---

## 7C-1C — Full-suite test stability correction

Status: implemented.

The live-combat inspected-entity regression searched for current-tick combat
evidence by creating a complete position/debug snapshot on every tick. It now
checks the authoritative production attack, defence, hit-application and
zero-hit buffers first, and creates exactly one snapshot only once a configured
inspected entity has relevant current-tick evidence. The deterministic combat
run and snapshot assertions are unchanged; no simulation or snapshot behaviour
changes.

---

## 7C-2A-1 — Capability bridge and effective-gait projection

Status: in progress.

Formation owns requested and reusable effective physical gait. A narrow
formation-layer read-only capability contract avoids an activity/formation/
capability import cycle. Production supplies the tick-start capability adapter
and rejects a non-current projection before formation mutation. This slice
projects only: positions, movement modes, remainders and energy expenditure
remain unchanged.

---

## 7C-2A-2 — Ordinary member movement enforcement

Deferred: ordinary coordinate ceilings and actual-effective-gait expenditure.

---

## 7C-2A-3 — Routing member movement enforcement

Deferred: routing coordinate ceilings and minimum-walk movement enforcement.

---

## 7C-2A-4 — Lower-median anchor enforcement and consolidation

Deferred: anchor lower-median gait, bounded diagnostics and consolidated tests.

---

## 7C-2B — Specialist movement enforcement and gait-summary consolidation

Deferred: casualty, medical, trauma and respawn-egress enforcement.

---

## 7C-2 — Movement enforcement, sprint exhaustion and routing degradation

Deliver:

- band-based walk/jog/sprint limits;
- energy-limited sprint/charge duration;
- minimum safe walk;
- routing-safe degradation;
- movement records and unit gait summaries.

Tests:

- fresh entity can sprint;
- sprint drains and ends naturally;
- winded cannot initiate ordinary sprint;
- spent retains minimum walk;
- routing degrades rather than freezing;
- formation style remains independent from gait;
- no same-tick energy feedback loop;
- world-bound and deterministic movement.

Boundary:

No combat-tempo, pressure, equipment burden, or rest decisions yet.

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
