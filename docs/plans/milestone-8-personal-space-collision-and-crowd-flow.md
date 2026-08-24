# Milestone 8: Personal Space, Collision, and Crowd Flow

Status: Milestones 8A and 8B are accepted. Milestone 8C is implemented and
awaiting technical review. Production collision resolution is active only for
ordinary active-standing formation/member movement; Milestone 8D and later
have not started.

Milestone 7 is accepted. This milestone is inserted before command behaviour because the evolving main battle exposed a foundational physical omission: individual player-presence entities can currently occupy/pass through the same space too freely.

Milestone 2 already owns unit movement intent, formation behaviour, blocker arbitration, overtaking style, and stuck handling. Milestone 6 deliberately excluded downed/terminal characters from ordinary blockers and deferred detailed body collision so casualties could not become permanent walls.

Milestone 8 adds the missing physical occupied-space layer without replacing either authority.

---

# Product goal

Make simulated people behave like people who have bodies.

After Milestone 8:

- active standing players cannot casually finish a tick in illegal body overlap;
- hostile lines form a physical contact front instead of interpenetrating;
- allies yield, sidestep, squeeze, merge, overtake, and queue according to existing movement/behaviour priorities;
- disciplined formations preserve spacing more strongly than loose blobs;
- `pushThrough` means forcing passage through allied occupied space with yielding/compression/disruption, not literal phasing;
- routing produces believable congestion and priority rather than ghost movement;
- downed casualties remain physically present but do not create impassable corpse walls;
- people preferentially go around a casualty and may carefully step through/over the soft casualty footprint when local space leaves no practical alternative;
- drag groups remain coherent physical groups;
- terminal barbarians walking toward respawn still exist physically but yield almost completely to living battlefield participants;
- repeated inability to progress feeds existing stuck behaviour rather than teleport correction;
- collision remains deterministic, bounded, inspectable, and viable for representative 2,000-entity battles.

The intended battlefield story is:

> There is already a bloke standing there.

Everything downstream should now have to deal with that fact.

---

# LARP-specific physical model

This is not rigid-body physics.

Empire players generally cooperate to avoid unsafe body contact. They slow, turn shoulders, sidestep, let people through, bunch up, wait, and squeeze into imperfect gaps. The simulation needs the battlefield consequences of occupied space, not kilograms, momentum, ragdolls, tackles, or continuous-body dynamics.

Use coarse personal-space geometry and deterministic local flow.

Do not simulate:

- body mass;
- momentum conservation;
- collision damage;
- knockdowns from ordinary contact;
- grappling;
- tackles;
- shield barges;
- exact shoulders/limbs;
- exact prone-body polygons;
- physical stumbling animation;
- continuous floating-point rigid-body solving.

---

# Existing authority boundaries

## Movement intent remains where it is

Existing systems continue to own why and where an entity wants to move:

- formation movement;
- give-ground/routing;
- casualty gathering;
- drag-group movement;
- medical approach;
- traumatic-wound withdrawal;
- respawn egress;
- scenario-forced/external movement.

Milestone 8 may reduce, redirect locally, or prevent the final physical step to preserve occupied space.

It must not:

- invent a new strategic destination;
- select a new enemy/patient/Physick;
- replace unit orders;
- replace routing;
- replace rescue/medical policy;
- add terrain pathfinding;
- create global battlefield knowledge.

## Energy remains downstream of actual movement

Milestone 7 charges/rewards authoritative actual movement.

Collision/spacing must not double-charge energy.

The desired relationship is:

```text
movement authority chooses/request step
→ energy/gait limits the step as already established
→ personal-space/collision resolves the physically legal local step
→ final actual displacement is recorded once
→ energy activity classifies/charges that final result
```

If production ordering requires a narrow refactor to make this boundary explicit, preserve all accepted pre-collision outcomes when no occupancy conflict exists.

Collision may only reduce or locally redirect an already-permitted displacement. It must not increase gait, distance budget, sprint budget, or world-bound allowance.

## Combat reach remains separate

Personal-space radius is not weapon reach.

A fighter may threaten or attack across weapon-reach distance while bodies remain separated.

Hostile physical contact should therefore emerge from:

```text
weapon/contact preference
+ movement intent
+ personal-space boundary
```

Do not silently redefine the existing weapon-reach tables.

## Lifecycle/presence remains authoritative

Character lifecycle and player presence decide whether somebody is alive, active, downed, egressing, waiting, or removed.

Milestone 8 consumes that state only to derive physical occupancy class and yielding priority.

Physical occupancy must never revive, reactivate, retarget, heal, route, or otherwise change lifecycle.

---

# Occupancy classes

Use one narrow derived physical-occupancy vocabulary. Exact type names may change during 8A/8B, but the semantics must remain explicit.

Suggested first model:

```ts
type PhysicalOccupancyClass =
  | "activeStanding"
  | "downedSoft"
  | "assistedMoving"
  | "yieldingEgress"
  | "nonBattlefield";
```

## activeStanding

Examples:

- ordinary active fighters;
- Physicks moving under their own power;
- trauma-withdrawing active citizens;
- routers;
- other active battlefield participants.

Properties:

- normal standing personal-space footprint;
- no casual overlap with other standing players;
- participates in allied/hostile yielding policy;
- movement priority depends on existing movement authority/state, not a new hidden combat stat.

## downedSoft

Examples:

- dying/downed player presence;
- terminal non-egressing presence where the physical player is still on the field and lying/stationary.

Properties:

- physically present and locally queryable;
- immobile unless an existing assistance authority moves them;
- ordinary movers should avoid the footprint where practical;
- not a hard permanent blocker;
- if no reasonable bounded local detour exists, living movers may carefully cross/step through the soft footprint at reduced progress rather than deadlock;
- hostile/allied combat eligibility remains unchanged: this class is physical only.

The first implementation may use coarse circular soft occupancy even though real prone bodies are elongated. Detailed corpse geometry remains unnecessary unless later visual/terrain evidence proves it materially changes outcomes.

## assistedMoving

Examples:

- dragged patient plus required helper group.

Properties:

- the existing drag/assistance authority remains owner of group membership and destination;
- the group must remain coherent;
- collision resolution must not separate helpers from patient;
- ordinary allies may yield to an urgent coherent casualty group where practical;
- hostiles remain real physical blockers;
- no new rescue selection or movement-speed rule is created here.

## yieldingEgress

Initial primary example:

- terminal barbarian in `respawnEgress`.

LARP ruling:

The player physically exists and must get off the field, but is trying to be as practically invisible to the live battle as possible.

Properties:

- still occupies physical space;
- cannot literally overlap another person;
- always yields to living moving battlefield participants;
- must not force a living fighter to make a meaningful tactical detour when it can instead wait, sidestep, or route around them;
- should choose locally unobtrusive progress toward its existing respawn destination;
- may flow/yield around other egressing dead players;
- should avoid downed bodies because those bodies cannot yield;
- remains non-combat, non-morale, non-formation, non-objective, and non-targetable exactly as before.

Future citizen terminal egress may reuse this physical class when the scenario milestone implements Sentinel Gate withdrawal/egress.

## nonBattlefield

Examples:

- `waitingAtRespawn`;
- `removedFromBattlefield`;
- any presence explicitly outside the battlefield physical space.

Properties:

- no battlefield occupancy;
- no collision participation.

---

# Personal-space geometry

Use coarse person-scale footprints.

For 8A, use one configurable standing radius and one configurable soft/downed radius rather than equipment-specific body sizes.

The current debug body glyph uses a radius of roughly four world/display units; that is a useful calibration starting point for the spike, not an accepted physical constant.

Requirements:

- deterministic integer/fixed-point calculations;
- squared-distance comparisons where practical;
- no floating-point accumulation drift;
- no per-tick trigonometric object creation;
- world bounds remain authoritative;
- zero-length/equal-position ties resolve deterministically by stable entity identity;
- scenario input ordering must not change the result.

Later content may introduce a small number of broad footprint categories only if evidence justifies it. Do not model armour thickness, body weight, shield width, or individual shoulder measurements now.

---

# Local collision and flow principles

## Spatial locality

Use the existing spatial grid/query infrastructure or a narrow compatible local occupancy index.

Forbidden:

```text
for each entity:
  scan every other entity
```

Candidate neighbours must be bounded by local cells/radius.

No dense entity-pair collision matrix.

## Deterministic resolution

The spike may compare more than one bounded technique, but any accepted solver must have:

- stable pair/candidate ordering;
- bounded passes/iterations;
- deterministic tie-breaks;
- integer/fixed-point position output;
- no dependence on input-array ordering;
- no random jitter;
- no wall time.

A sequential canonical resolver, bounded relaxation, or discrete local steering scheme are all acceptable candidates if they satisfy the battlefield tests. Do not prematurely build a generic physics engine.

## Resolution is non-increasing

For each mover:

```text
requested movement budget
→ collision-resolved movement
```

Collision may:

- preserve it;
- shorten it;
- redirect some of it locally;
- stop it.

Collision may not:

- grant extra step length;
- upgrade gait;
- teleport across an occupied band;
- move through world bounds;
- invent strategic pathfinding.

## Avoid visual chatter

Local yielding must use deterministic preference/state where needed so two neighbours do not alternate left/right every tick.

A small bounded “preferred pass side” or recent local-yield decision may be retained if the spike shows it is necessary.

Do not add long unbounded path memory.

---

# Relationship and movement priority

Personal space is mutual, but yielding is not always symmetric.

The detailed numeric priority policy belongs to the spike, but the behavioural ordering must support these cases.

## Hostile active versus hostile active

- neither side may phase through;
- ordinary opposing lines should settle into a physical front;
- contact should not explode the line apart;
- fighters may slide laterally or compress locally where existing movement allows;
- no ordinary body collision itself deals pressure, hits, knockdown, or morale effects.

## Allied ordinary flow

Allies cooperate.

They may:

- yield;
- sidestep;
- queue;
- squeeze within an accepted allied minimum spacing;
- pass through a locally opened gap;
- merge into a blob;
- overtake according to existing confidence/rank/behaviour rules.

They may not simply share the same final occupied space.

## Formation discipline

Existing formation/behaviour state may influence acceptable spacing/flow:

- formed/heavy disciplined units resist unnecessary compression and preserve slots;
- moving ordinary Empire formations may become imperfect/blobby under pressure;
- loose/skirmish behaviour tolerates more local irregularity;
- this is a spacing preference, not a new discipline stat.

Do not duplicate the behaviour-profile authority.

## `pushThrough`

Existing `pushThrough` behaviour should stop meaning literal phase-through once production collision is active.

Instead it may:

- ask lower-priority allied bodies to yield more strongly;
- accept tighter temporary allied spacing;
- disrupt slot/cohesion state through existing accepted interfaces where appropriate;
- make progress through a friendly crowd if physical gaps can be created.

It must not permit hostile phasing or teleportation.

## Routing

Routing is urgent forced movement.

Routers should receive high local movement priority against ordinary allied traffic and may disrupt allied spacing as others get out of the way.

Routing does not gain immunity to hostile bodies, world bounds, or physical occupancy.

## Casualty groups

A coherent casualty group represents people saying, in effect, “make a hole.”

Ordinary allies should generally yield where practical, but the assistance system retains ownership and no magical right-of-way through hostiles is created.

## Yielding egress

`yieldingEgress` is the lowest active movement priority against living movers.

A dead barbarian leaving for respawn waits for the battle, not the other way around.

---

# Downed-body crossing

Downed people must matter without becoming walls.

Preferred sequence for an ordinary living mover encountering `downedSoft`:

```text
1. preserve intended progress if no overlap;
2. take a small bounded lateral/local avoidance option if practical;
3. if locally boxed and forward progress is still important, carefully cross the soft footprint at reduced progress;
4. otherwise wait/stall and let existing stuck handling see the failure.
```

Crossing a downed footprint:

- is not damage;
- is not an attack;
- does not move the casualty;
- does not alter their death count/treatment/energy;
- should be visually/diagnostically distinguishable from ordinary unobstructed movement if retained in production.

The exact reduced-progress amount is tuning work after the spike. Do not create a full stepping animation or prone-body physics system.

---

# Interaction with existing stuck handling

Collision creates legitimate blocked movement.

Use existing stuck/recovery behaviour where possible rather than adding a competing collision-stuck state machine.

Expose enough collision evidence for the existing behaviour layer to distinguish:

```text
wanted to move
→ gait allowed movement
→ world/authority allowed movement
→ personal space reduced/stopped movement
```

Repeated blocked movement may therefore lead to existing recovery/detour behaviour.

Do not teleport an entity back to its slot merely because collision prevented progress.

---

# State ownership

Suggested narrow stores/read models:

## IndividualPhysicalOccupancyStore

Derived current-tick/read-mostly state:

- occupancy class;
- effective radius/category;
- yielding priority/category;
- participates in collision;
- stable occupancy/presence evidence.

It does not own lifecycle, combat eligibility, assistance, player presence, energy, or movement intent.

## IndividualCollisionResolutionStore

Reusable entity-indexed current-tick evidence:

- intended/pre-collision position or delta;
- final collision-resolved position/delta;
- neighbour/candidate count;
- blocked/reduced/redirected flags;
- principal occupancy relationship encountered;
- local yield/pass side if stateful hysteresis is required;
- downed-soft crossing flag;
- yielding-egress wait/yield flag;
- bounded counters/history.

It must not become a second world-position authority.

The authoritative world position remains the existing world position storage after the canonical movement/collision boundary.

---

# Production ordering target

8A is isolated and must not force this exact integration prematurely.

The production target after a successful spike is approximately:

```text
1. project lifecycle/presence/energy capability
2. existing unit/specialist movement authorities determine requested movement
3. existing gait/bounds policy limits requested movement
4. personal-space/collision resolves final physically legal local displacement
5. record final actual movement evidence
6. combat targeting/action/defence consumes final positions
7. casualty/treatment/lifecycle procedures
8. energy expenditure/recovery consumes final actual movement
9. morale/pressure/unit summaries/history/debug
```

Where several specialist movement authorities already move at different points in the tick, the accepted implementation may require a common candidate-movement boundary or several calls into one shared collision resolver.

Do not reorder combat/casualty semantics casually. Any orchestration refactor must prove unchanged outcomes in non-collision scenarios.

---

# Implementation slices

## 8A — Collision/spacing feasibility spike

Status: accepted feasibility evidence. The spike is not production architecture.

Purpose:

Select and validate a deterministic local personal-space approach before production integration.

This is a spike, not the final API.

Deliver:

- isolated headless collision/spacing experiment using existing world scale and local spatial indexing;
- one or at most two bounded candidate algorithms if comparison is genuinely useful;
- deterministic integer/fixed-point output;
- stable canonical tie-breaking;
- local neighbour counts and collision-resolution diagnostics;
- retained debug-only route:

```text
/test?scenario=personal-space-spike
```

Start paused at tick 0.

Required chambers/cases:

1. **Hostile head-on fronts**
   - two compact groups approach;
   - no interpenetration;
   - front settles without explosive separation or vibration.

2. **Allied crossing streams**
   - two allied groups cross/merge;
   - local yielding/sidestepping occurs;
   - no phase-through and no permanent gridlock.

3. **Catch-up / overtaking**
   - one mover is only slightly faster than another;
   - result may be awkward because that is authentically awkward;
   - no flicker/teleport/alternating pass-side pathology.

4. **Downed-body flow**
   - several standing movers encounter sparse downed bodies;
   - they preferentially avoid;
   - they can still make bounded careful progress if a soft body would otherwise create a permanent wall.

5. **Yielding barbarian egress**
   - a terminal respawn-egress barbarian crosses living traffic;
   - the egressing entity waits/sidesteps/yields;
   - living tactical movement is not meaningfully displaced by the dead player;
   - no literal overlap.

6. **Representative dense crowd**
   - enough entities to expose solver stability and local-query behaviour.

Tests:

- deterministic replay;
- input-order independence;
- no illegal standing overlap at stable resolution points;
- bounded iteration/pass count;
- world bounds;
- no all-entity scan;
- no hot-loop inspection-object creation;
- blocked cases terminate rather than spin;
- 100/500/1,000/2,000 structural/performance samples;
- report stage mean/max/p95 without weakening existing thresholds.

Boundary:

Do not integrate collision into the production `/` battle yet.
Do not alter existing formation/combat/casualty/energy outcomes outside the spike.
Do not implement 8B.
Do not implement flavour art.

Spike acceptance is based on headless evidence plus human visual inspection of the retained route.

### 8A implementation evidence

The retained spike uses one deliberately narrow candidate algorithm:

```text
integer desire-anchored requested step
→ bounded discrete forward/lateral/reduced/wait/backtrack candidates
→ existing spatial-grid local queries
→ canonical entity-ID relaxation for at most eight passes
→ local connected-component origin fallback only if a standing overlap remains
```

The correction retains each mover's spawn-anchored desire line and ranks normal
progress or line reacquisition ahead of local detours. Per-entity typed state
commits to an initial side for 40 ticks, the opposite tactic for 100 ticks after
no meaningful goal progress, and a wider wait/backtrack alternative for 200
ticks. Eight sustained normal-progress ticks clear the episode; a materially
changed desire resets its origin and state. A tactic never exposes its opposite
side within the same phase.

Same-direction allied resolution gives the forward leader right-of-way from
start-of-tick ordering, so only the rear follower yields. In open space a
faster follower commits to one passing side, clears the leader by the combined
radii plus a one-unit margin, remains laterally clear until safely ahead, and
then reacquires its original desire line without displacing the leader.

Perpendicular allied conflicts first use a bounded 20-tick pair-local
prediction. When one mover can wait while the other naturally clears, exactly
one enters explicit courtesy-yield state; the recipient cannot reciprocate or
form a courtesy chain. Yield selection compares predicted clearance and lost
goal progress before using entity ID as the exact final tie-break. There is no
cardinal-axis right-of-way. An expired or failed courtesy attempt is not reset
against the same conflict and falls through to the persistent detour policy.

Assisted movement still outranks ordinary standing movement and
`yieldingEgress` remains lowest. Hostile contact searches only
reduced-forward/stationary fallbacks. Downed soft occupancy retains early
avoidance and permits reduced careful crossing after a bounded unsuccessful
detour. The final safety fallback expands through only the locally connected
hard-standing component before restoring its tick-start positions; unrelated
chambers are not reset.

The implementation stores all proposal, candidate, diagnostic, and replay state
in fixed-size typed arrays. Candidate output is monotonic through a fixed twelve
slot entity budget. The spatial grid and caller-owned query output are reused;
there is no entity-against-all-entities production path or per-candidate result
object. The spike remains an exclusive sandbox authority and is not reachable
from the production `/` scenario.

Headless evidence covers:

- hostile fronts settling without late position vibration;
- a southbound allied stream retaining southward progress, bounded lateral
  displacement, and desire-line reacquisition while crossing east/west traffic;
- a bounded non-reciprocal courtesy wait plus exact 90-degree rotational
  equivalence for an otherwise identical allied crossing conflict;
- a faster rear ally using a committed radius-aware open-space bypass, then
  reacquiring its desire line without slowing or displacing its slower leader;
- both avoidance and reduced crossing of downed soft occupancy;
- respawn egress using bounded sidestep/retreat rather than following a living
  stream sideways, then resuming progress toward respawn;
- exact 40/100/200-tick tactic commitments and bounded dense-front
  direction/strategy changes across 1,000 ticks;
- deterministic replay and reversed-input-order equivalence;
- world bounds, bounded passes, blocked termination, and zero final standing
  overlap;
- retained debug snapshot arrays, footprint/vector/state rendering grammar,
  and the paused `/test?scenario=personal-space-spike` route.

Representative isolated dense-front measurements on the implementation
machine (40 measured ticks after 5 warm-up ticks; structural assertions only):

| entities | mean ms/tick | p95 ms/tick | max ms/tick | max passes | max local candidates | unresolved overlaps | fallback resets |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.666 | 1.294 | 2.249 | 2 | 2,370 | 0 | 0 |
| 500 | 2.048 | 2.268 | 2.337 | 2 | 11,596 | 0 | 0 |
| 1,000 | 8.269 | 8.985 | 11.331 | 3 | 55,358 | 0 | 2,322 |
| 2,000 | 16.712 | 17.703 | 18.089 | 3 | 110,445 | 0 | 4,412 |

These values are not production-collision acceptance thresholds. The retained
121-entity mixed chamber retains zero unresolved standing overlap across the
1,000-tick stability interval. The deliberately extreme 1,000/2,000 compact
front fixtures activate the connected-component safety fallback; this visible
cost and conservative stall are spike findings, not accepted production policy.

Production-design findings for 8B and later:

- the four-unit standing and five-unit soft radii are successful spike
  calibration values, not yet accepted production constants;
- rebuilding the existing grid once per relaxation pass is simple and stable,
  but a mutable/local reservation index should be compared before production
  adoption if full-pipeline profiling shows grid rebuild cost matters;
- the existing grid's canonical local-result sort is deterministic but remains
  visible work in dense crowds;
- the connected-component origin fallback guarantees bounded termination but
  is expensive and deliberately over-stalls extreme compact fronts; production
  must not adopt it without replacement or explicit acceptance;
- retained detour phases prevent timer-expiry re-entry chatter. Courtesy and
  bypass choices are geometry/progress based, with entity ID reserved for exact
  ties; production integration should still inspect emergent local bias at
  larger battle scales;
- 8D must add formation/cohesion-dependent lateral freedom: loose groups may
  spill around a front, while formed or disciplined groups should resist
  lateral peel-off. That behavior is intentionally absent from 8A;
- soft crossing deliberately permits overlap only with `downedSoft`; 8B must
  derive occupancy from lifecycle/presence rather than trust spike content;
- yielding egress behaved correctly in the isolated priority case, but 8F must
  prove the same property around production movement authorities and immobile
  casualties.

## 8B — Occupancy contract and collision authority boundary

Status: accepted. Its contract is consumed by the active 8C slice below.

Deliver:

- final occupancy class vocabulary;
- derived occupancy projection from lifecycle/player presence/assistance;
- accepted personal-space geometry constants;
- allocation-free collision adapter/store contract;
- production orchestration boundary prepared;
- bounded debug inspection;
- no broad behaviour retuning.

Prefer to establish the contract before changing every movement authority.

### 8B implementation evidence

The production-facing occupancy vocabulary is finalised as:

```text
activeStanding
downedSoft
assistedMoving
yieldingEgress
nonBattlefield
```

`IndividualPhysicalOccupancyStore` is an entity-indexed derived projection. It
reads only the accepted lifecycle, player-presence, and sparse active drag-group
authorities. Active characters with active presence become `activeStanding`;
downed, terminal-awaiting-comfort, and terminal-comforted presences become
`downedSoft`; the patient and required helpers of a currently dragging group
become `assistedMoving`; `respawnEgress` becomes `yieldingEgress`; and
`waitingAtRespawn`/`removedFromBattlefield` become `nonBattlefield`. Gathering
helpers remain active standing and a not-yet-moving patient remains downed soft.
The projection owns none of those source states.

Accepted production geometry is integer circular occupancy with radius four for
active standing, assisted moving, and yielding egress, radius five for downed
soft occupancy, and radius zero for non-battlefield presence. The geometry is
explicit immutable configuration rather than equipment/body-weight inference.
Typed flags separately expose hard standing, soft downed, assisted-group, and
strongly-yielding semantics.

`IndividualCollisionResolutionStore` provides reusable typed current-tick
evidence for permitted and resolved deltas, local neighbour/candidate counts,
relationship, blocked/reduced/redirected flags, and bounded local
detour/courtesy/overtake decision memory. Its movement adapter validates that a
resolved integer step cannot exceed the squared-distance budget of the already
permitted step and can apply only from the mover's current in-bounds position.
There are no target, destination, gait-selection, lifecycle, strategic query,
or pathfinding inputs.

Production orchestration now projects occupancy beside the existing tick-start
movement authorities and opens the collision evidence boundary. During 8B the
adapter is explicitly disabled and records exact pass-through evidence only:

```text
existing movement authorities mutate the canonical world position
→ permitted delta == collision-resolved delta == final actual delta
→ existing energy classification consumes that same final displacement
```

No production position, gait, combat, casualty, assistance, presence, energy,
target, destination, or event outcome is changed. Bounded inspected-individual
debug state exposes occupancy class/radius and permitted/resolved evidence, but
no renderer or UI behavior is added.

Headless evidence covers all five derived occupancy classes, dragging-only
assisted-group projection, hard/soft/yielding flags, geometry validation, typed
array identity reuse, backwards/stale projection rejection, non-increasing
preserve/shorten/redirect/stop outcomes, current-position/world-bound commit
validation, disabled production resolution, and exact equality between final
collision evidence and the displacement consumed by energy. Existing casualty,
specialist movement, combat, replay, and production integration suites remain
the unchanged-behaviour evidence.

The retained typed storage is 45 bytes per entity: seven bytes for occupancy
projection and 38 bytes for collision evidence/local state, or 90,000 bytes at
2,000 entities. Isolated 40-tick structural measurements on the implementation
machine were:

| entities | mean ms/tick | max ms/tick | storage bytes |
| ---: | ---: | ---: | ---: |
| 100 | 0.053 | 0.367 | 4,500 |
| 500 | 0.085 | 0.183 | 22,500 |
| 1,000 | 0.035 | 0.139 | 45,000 |
| 2,000 | 0.051 | 0.103 | 90,000 |

These timings cover projection plus disabled pass-through evidence only. They
are not 8C solver predictions. No spatial query, collision pass, connected-
component fallback, cardinal-axis preference, or entity-ID passing policy has
entered production.

## 8C — Active standing collision and hostile fronts

Status: implemented; awaiting technical review.

Deliver:

- ordinary formation/member movement consumes the collision resolver;
- active standing people cannot finish in illegal standing overlap;
- hostile lines form stable fronts;
- world bounds/gait/energy remain non-increasing;
- final displacement remains energy authority;
- existing engagement/reach rules consume final positions.

### 8C implementation evidence

Production now resolves the ordinary, non-routing formation/member step after
formation has applied its existing intent, blocker/contact, world-bound, and
Milestone 7 gait/energy ceilings, and before ordinary movement observation,
specialist authorities, targeting, and combat. Only entities projected as
`activeStanding` and still eligible for ordinary participation can have that
step changed. Routing, casualty gathering/dragging, medical approach, trauma
withdrawal, respawn egress, downed soft occupancy, assisted occupancy, and
same-tick lifecycle/assistance transitions remain outside the active adapter.

The production candidate uses one reusable 16-unit-cell spatial grid and typed
entity-indexed scratch state. It compares bounded local relative movement
segments for active-standing pairs. Simultaneously moving formation members
are evaluated from their relative trajectories rather than treating either
origin as a static obstacle, preserving coherent non-conflicting translation.
When an ordinary mover conflicts with a non-moving active-standing presence,
its already-permitted integer step is shortened toward zero. Moving/moving
conflicts mark both participants symmetrically and shorten them together for at
most eight passes. The remaining local conflict participants stop if that bound
is reached. This is a local pair stop, not the spike's connected-component
origin reset.

No pass side, cardinal axis, faction-wide priority, or entity-ID movement
preference exists. Grid results are canonical, but movement conflicts are
marked and reduced simultaneously; entity ID is used only to avoid evaluating
the same pair twice and as a final diagnostic blocker tie-break. 8C performs no
lateral allied-flow, courtesy, overtaking, push-through, or routing policy.

The 8B permitted/resolved arrays remain the authority boundary. Every resolved
step is integer, in bounds, and no longer than its permitted squared-distance
budget. The canonical world position is replaced before the existing ordinary
energy checkpoint and before individual combat. Energy therefore classifies
the resolved tick-start-to-final displacement, while target selection and
engagement report distance from the same resolved positions. Non-8C movement
authorities retain exact pass-through collision evidence.

Bounded debug state exposes per-entity permitted/resolved deltas,
blocked/reduced/redirected state, local neighbour/candidate counts, and the
principal active-standing blocker. The compact combat snapshot also exposes
mover, blocked, reduced, pass, query, candidate, and unresolved-overlap counts.
No renderer or flavour visual was added.

Headless coverage proves:

- two opposing two-member groups stop at legal eight-unit standing separation;
- the settled front remains position-stable for 100 ticks with no standing
  overlap or lateral jitter;
- distant ordinary production movement remains an exact pass-through;
- resolution never exceeds the permitted squared-distance budget;
- energy displacement equals the collision-resolved displacement;
- combat target-distance inspection reads the final resolved positions;
- replay is exact and reversing equivalent unit-definition input order does
  not change the trace;
- the solver retains zero unresolved new overlaps and at most eight passes.

The retained production scenarios were rebaselined only where a new physical
front changes movement-derived energy, combat cadence, or subsequent morale.
Drag-group displacement and helper-order equivalence remain unchanged. Routing
interaction is deliberately not collision-resolved in 8C and remains an 8D
production boundary. Same-tick assistance/lifecycle occupancy refresh remains
an explicit 8E/8F integration concern.

Representative 40-tick opposing-front measurements on the implementation
machine were:

| entities | mean ms/tick | max ms/tick | max passes | max local candidates | workspace typed bytes |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.494 | 3.484 | 2 | 1,026 | 3,100 |
| 500 | 1.149 | 3.519 | 2 | 5,226 | 15,500 |
| 1,000 | 1.789 | 2.287 | 2 | 10,476 | 31,000 |
| 2,000 | 3.767 | 6.051 | 2 | 20,976 | 62,000 |

The workspace retains 31 typed bytes per entity in addition to the accepted
8B occupancy/collision stores and the reusable spatial-grid buckets. These are
structural local-front measurements, not a timing threshold or an 8D allied
crowd-flow prediction.

Verification passed with 1,200 tests across 83 files, 118 performance checks
across 21 files, TypeScript typechecking, and the production build. The full
dense production fixture remains a deliberately adverse measurement: its
authored tick-start placements already contain standing overlap, so its
reported minimum separation remains zero. The 8C authority prevents new or
worsened overlap but cannot separate a stationary pre-existing overlap without
granting movement that no movement authority permitted. Initial-placement and
same-tick occupancy-transition repair therefore remain production integration
requirements for the later occupancy/flow slices; legal hostile-front inputs
finish and settle without standing overlap.

## 8D — Allied crowd flow, overtaking, push-through, and routing priority

Deliver:

- allied yielding/sidestepping/queueing;
- deterministic pass-side stability if required;
- formation-style spacing preference;
- existing overtaking/profile influence;
- physical `pushThrough` semantics without phasing;
- routing priority/congestion;
- stuck integration.

## 8E — Downed soft occupancy and casualty-group integration

Deliver:

- downed/terminal stationary soft footprints;
- bounded avoidance and careful-crossing fallback;
- no corpse-wall deadlock;
- drag-group coherent collision;
- ordinary allies yield appropriately to active rescue groups;
- treatment/range/lifecycle ownership unchanged.

## 8F — Yielding player-presence egress

Deliver:

- terminal barbarian `respawnEgress` becomes physical `yieldingEgress`;
- always yields to living moving players;
- local wait/sidestep/route-around behaviour;
- egressers avoid immobile downed people;
- egress-to-egress flow;
- `waitingAtRespawn` and removed presences have no battlefield occupancy;
- no combat/morale/objective reactivation.

## 8G — Production consolidation, soak, performance, retained visual acceptance

Deliver:

- all movement authorities use one accepted collision/occupancy contract;
- one-hour deterministic soak;
- representative 2,000-entity battle performance;
- collision-stage timing diagnostics;
- no dense pair matrix or per-entity hot allocation;
- retained `/test?scenario=personal-space` or promoted spike route;
- collision debug overlay for footprints, blocked/yielding state, and resolved deltas;
- main `/` battle integration;
- human inspection.

Milestone 8 is accepted only after the main battle visibly stops behaving like a collection of ghosts.

---

# Retained visual grammar for Milestone 8

Milestone 9 will add the flavour renderer. Milestone 8 therefore uses and extends the current debug renderer only.

Expose hideable debug evidence for:

- personal-space radius/footprint;
- occupancy class;
- intended/pre-collision delta;
- collision-resolved delta;
- blocked/reduced/redirected state;
- principal yielding relationship;
- downed-soft crossing;
- yielding-egress state;
- local collision neighbour count where useful.

Do not turn every entity into a wall of text. Prefer circles/arcs/arrows and inspected-entity detail.

Preserve the centre gait/activity pip.

---

# Performance requirements

Representative target remains roughly 2,000 entities.

Collision work must:

- use local spatial candidate queries;
- reuse storage;
- avoid allocating result objects in per-entity hot loops;
- avoid per-tick sorting where stable indexed/bucketed policy can work;
- avoid dense entity-pair state;
- bound solver passes explicitly;
- expose collision-stage timing in performance scenarios;
- preserve deterministic behaviour under dense stress.

A deliberately impossible dense pile is a stress fixture, not the optimisation target. Optimise against representative battlefield geometry unless the representative case is unacceptable.

---

# Explicit deferrals

## Milestone 9

- flavour sprites;
- layered body/armour/weapon/helmet art;
- flavour animation/poses;
- dual flavour/debug mode.

## Milestone 10

- captain-led queueing, passage, relief, rotation, and commanded crowd movement;
- command priority.

## Milestone 11

- Sentinel Gate/respawn geometry;
- scenario-specific entry/exit lanes;
- citizen terminal Gate egress;
- reinforcement-wave formation.

## Milestone 12

- perception-limited awareness of crowd conditions.

## Milestone 14

- terrain obstacles/chokepoints;
- person-terrain collision;
- rough-ground path cost;
- long-weapon terrain clearance.

## Milestone 15

- REPEL/STRIKEDOWN and other forced-movement collision consequences;
- controlled shield pushing if approved there/with terrain.

Later:

- exact body polygons;
- ragdolls;
- collision damage;
- tackles/grappling;
- exact foot placement.

---

# Definition of done

Milestone 8 is complete when:

- standing active players have deterministic meaningful personal space;
- hostile groups form stable physical fronts;
- allies flow/yield without phasing or pathological deadlock;
- routing and push-through have physical crowd consequences;
- downed bodies are present and avoidable but not permanent walls;
- drag groups remain coherent under collision;
- dead barbarians walking to respawn physically exist but consistently yield to the living battle;
- waiting/removed presences do not occupy battlefield space;
- final actual displacement remains the single movement evidence used by energy;
- collision does not grant movement, gait, targeting, or lifecycle authority;
- the solver uses bounded local spatial work;
- representative 2,000-entity performance remains viable;
- replay/soak remains deterministic;
- the retained visual route and `/` pass human inspection.

## Milestone boundary

> Movement decides where somebody is trying to go. Energy decides how hard they can move. Milestone 8 decides whether another actual human body is already in the way.
