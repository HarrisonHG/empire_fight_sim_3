# Milestone 8: Personal Space, Collision, and Crowd Flow

Status: Milestone 8A corrected after initial human inspection; awaiting retained-route reinspection.
Milestone 8B and production integration have not started.

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

Status: corrected after initial human inspection; awaiting human visual reinspection.

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
start-of-tick ordering, so only the rear follower yields. Perpendicular allied
ties use a deterministic desire-axis ordering in this spike. Assisted movement
still outranks ordinary standing movement and `yieldingEgress` remains lowest.
Hostile contact searches only reduced-forward/stationary fallbacks. Downed soft
occupancy retains early avoidance and permits reduced careful crossing after a
bounded unsuccessful detour. The final safety fallback expands through only
the locally connected hard-standing component before restoring its tick-start
positions; unrelated chambers are not reset.

The implementation stores all proposal, candidate, diagnostic, and replay state
in fixed-size typed arrays. Candidate output is monotonic through a fixed ten
slot entity budget. The spatial grid and caller-owned query output are reused;
there is no entity-against-all-entities production path or per-candidate result
object. The spike remains an exclusive sandbox authority and is not reachable
from the production `/` scenario.

Headless evidence covers:

- hostile fronts settling without late position vibration;
- a southbound allied stream retaining southward progress, bounded lateral
  displacement, and desire-line reacquisition while crossing east/west traffic;
- a faster rear ally yielding/detouring without slowing or displacing its
  slower leader;
- both avoidance and reduced crossing of downed soft occupancy;
- respawn egress using bounded sidestep/retreat rather than following a living
  stream sideways, then resuming progress toward respawn;
- exact 40/100/200-tick tactic commitments and bounded dense-front
  direction/strategy changes;
- deterministic replay and reversed-input-order equivalence;
- world bounds, bounded passes, blocked termination, and zero final standing
  overlap;
- retained debug snapshot arrays, footprint/vector/state rendering grammar,
  and the paused `/test?scenario=personal-space-spike` route.

Representative isolated dense-front measurements on the implementation
machine (40 measured ticks after 5 warm-up ticks; structural assertions only):

| entities | mean ms/tick | p95 ms/tick | max ms/tick | max passes | max local candidates | unresolved overlaps | fallback resets |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.565 | 1.001 | 1.949 | 2 | 1,943 | 0 | 0 |
| 500 | 1.781 | 2.196 | 2.967 | 2 | 10,657 | 0 | 0 |
| 1,000 | 8.105 | 9.029 | 10.543 | 3 | 53,971 | 0 | 2,322 |
| 2,000 | 16.142 | 16.936 | 17.184 | 3 | 108,930 | 0 | 4,412 |

These values are not production-collision acceptance thresholds. The retained
121-entity mixed chamber retains zero unresolved standing overlap across the
360-tick inspection interval. The deliberately extreme 1,000/2,000 compact
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
- retained detour phases prevent tick chatter, though deterministic axis and
  entity-ID tie-breaks may produce visible directional bias;
- 8D must add formation/cohesion-dependent lateral freedom: loose groups may
  spill around a front, while formed or disciplined groups should resist
  lateral peel-off. That behavior is intentionally absent from 8A;
- soft crossing deliberately permits overlap only with `downedSoft`; 8B must
  derive occupancy from lifecycle/presence rather than trust spike content;
- yielding egress behaved correctly in the isolated priority case, but 8F must
  prove the same property around production movement authorities and immobile
  casualties.

## 8B — Occupancy contract and collision authority boundary

Deliver:

- final occupancy class vocabulary;
- derived occupancy projection from lifecycle/player presence/assistance;
- accepted personal-space geometry constants;
- allocation-free collision adapter/store contract;
- production orchestration boundary prepared;
- bounded debug inspection;
- no broad behaviour retuning.

Prefer to establish the contract before changing every movement authority.

## 8C — Active standing collision and hostile fronts

Deliver:

- ordinary formation/member movement consumes the collision resolver;
- active standing people cannot finish in illegal standing overlap;
- hostile lines form stable fronts;
- world bounds/gait/energy remain non-increasing;
- final displacement remains energy authority;
- existing engagement/reach rules consume final positions.

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
