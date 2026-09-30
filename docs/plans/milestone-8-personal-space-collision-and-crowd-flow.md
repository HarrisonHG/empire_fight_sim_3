# Milestone 8: Personal Space, Collision, and Crowd Flow

Status: in progress.

Accepted slices:

```text
8A  collision/spacing feasibility spike
8B  occupancy contract and collision authority boundary
8C  active-standing collision and hostile fronts
8D  allied crowd flow, overtaking, push-through, routing priority
8E  downed-soft occupancy and casualty-group integration
8F  yielding player-presence egress
```

8G is partially implemented in the current working tree and has been re-sliced
to reduce Codex context/test cost.

Detailed historical implementation evidence is in:

```text
docs/progress/milestone-8-implementation-history.md
```

Normal Codex runs must **not** read that history unless a current slice
explicitly requires a previous implementation detail.

Read `docs/codex/work-slicing.md` before implementing any remaining slice.

---

# Goal

Make physical player presence matter without turning the simulation into
rigid-body physics.

Milestone 8 is complete when:

- standing players have meaningful personal space;
- hostile fronts do not interpenetrate;
- allies yield/flow/overtake without phasing or pathological chatter;
- routing and push-through have physical crowd consequences;
- downed people are physically present but do not form corpse walls;
- rescue groups remain coherent;
- dead barbarians leaving for respawn physically exist but yield to the living;
- all production movement authorities consume the same physical-space contract;
- representative legal 2,000-entity performance is viable;
- deterministic long soak passes;
- retained personal-space route and `/` pass human inspection.

---

# Non-goals

Do not add:

- rigid-body mass/momentum;
- collision damage;
- grappling/tackles;
- exact prone polygons;
- terrain collision/pathfinding;
- captain/banner mechanics;
- Milestone 9 flavour sprites;
- global right-of-way;
- connected-component runtime fallback;
- cardinal-axis movement priority.

---

# Core authority boundaries

## Movement

Existing authorities choose target/destination and permitted movement.

Collision may only:

```text
preserve
shorten
locally redirect
wait/stop
boundedly backtrack where the accepted local policy allows
```

Collision may never:

- grant a longer/faster step;
- select a new strategic destination;
- select a new target;
- change lifecycle/combat/morale;
- create global pathfinding.

Final actual collision-resolved displacement is the single movement evidence
used by Milestone 7 energy.

Combat consumes final collision-resolved positions.

## Occupancy classes

Accepted derived physical classes:

```text
activeStanding
downedSoft
assistedMoving
yieldingEgress
nonBattlefield
```

Lifecycle/player-presence/assistance remain their source authorities.

## Downed soft occupancy

Prefer local avoidance.

If useful bounded avoidance cannot provide progress, permit reduced careful
crossing rather than creating a permanent body wall.

Crossing never moves or mutates the casualty.

## Rescue groups

Patient/helpers share one collision-resolved displacement.

Group membership and destination remain casualty-assistance authority.

Living rescue movement has high allied right-of-way but no hostile phasing.

## Yielding egress

`respawnEgress` is physically present but lowest-priority battlefield traffic.

It yields to living/assisted traffic, retains its configured respawn
destination, uses persistent bounded detours/wait/backtrack, and becomes
non-battlefield immediately on `waitingAtRespawn`.

---

# Local right-of-way architecture

Milestone 8 now formalises a role-agnostic **derived local movement
right-of-way**.

It means only:

> if one allied physical participant must yield locally, which one should?

It does not grant speed, distance, overlap, pushing, targeting, or global
priority.

Accepted/current semantic ordering is approximately:

```text
forced routing/panic
active rescue/assisted movement
pushThrough
urgent medical response
ordinary allied movement
yielding egress
```

Exact equal-priority interactions use ordinary bounded local negotiation.

Hostiles do not socially yield because of this class.

The contract must remain extensible so later milestones can project role/status
without changing collision mechanics, for example:

```text
captain          high allied social/tactical right-of-way
banner bearer    below captain, above ordinary personnel
active Physick   above ordinary warriors while responding urgently
ordinary warrior
yielding dead player
```

Do **not** implement captain/banner roles in Milestone 8.

---

# Accepted local crowd behaviour

Carry forward:

- desire-line anchoring;
- pair-specific non-reciprocal courtesy waiting up to ~20 ticks when another
  ally is predicted to clear shortly;
- same-direction slower leader retains movement;
- faster follower yields/overtakes where combined-radius clearance exists;
- committed passing side;
- persistent bounded detours rather than per-tick side switching;
- approximate 40/100/200-tick escalation for initial/alternate/wider
  wait-backtrack attempts where applicable;
- loose formations may spill laterally;
- formed/cohesive formations resist unnecessary peel-off;
- routing overrides stale voluntary yielding memory;
- pushThrough overrides stale ordinary yielding below routing;
- stable IDs break only exact geometric ties.

---

# Current 8G working-tree checkpoint

The current working tree contains partial 8G implementation on top of accepted
8F.

Already present according to the progress checkpoint:

- generic typed right-of-way projection;
- specialist collision adapter;
- medical approach, trauma withdrawal, and casualty-helper gathering connected
  to collision-resolved displacement;
- setup hard-overlap validation/legal-placement support;
- main/retained scenarios opting into legal placement;
- debug snapshot/right-of-way evidence;
- UI inspection text;
- retained `/test?scenario=personal-space`;
- personal-space debug display on `/`;
- initial focused right-of-way and legal-placement tests;
- typecheck and diff-check passing.

Not yet acceptance-ready:

- right-of-way/crowd-flow reconciliation;
- full specialist focused regression set;
- debug/browser inspection;
- broad integration stabilization;
- one-hour soak;
- representative performance report;
- full suite/build/perf;
- human visual acceptance.

Do not throw away the partial working tree merely to make the new slice
boundaries neat.

---

# Remaining implementation stages

## 8G-1 — Simulation contract stabilization

Status: complete; generic class-based right-of-way and focused specialist regressions pass.

Purpose:

Stabilize the simulation-side 8G work already present. Do not add renderer/UI
work and do not run broad system suites.

Scope:

- generic right-of-way projection;
- reconcile accepted routing/pushThrough/rescue/egress priorities;
- urgent medical response above ordinary allied warriors but below stronger
  forced/urgent authorities;
- specialist collision for:
  - medical approach;
  - trauma withdrawal/seeking;
  - casualty-helper gathering where still pre-group;
- final actual displacement remains energy evidence;
- hostile bodies remain hard regardless of social right-of-way;
- no role names inside collision;
- no captain/banner implementation.

Focused regressions:

- generic right-of-way comparison;
- ordinary warrior yields to urgent medical response;
- routing outranks medical;
- rescue/pushThrough ordering remains accepted;
- hostile hardness;
- right-of-way never increases movement budget;
- specialist movement uses resolved displacement;
- same-tick relevant occupancy transition where this adapter consumes it.

Checks for this slice only:

```text
focused right-of-way/specialist tests
npm run typecheck
git diff --check
```

If the specialist hot path materially changes, run one focused structural
performance case only.

Do not run full `npm test`, `npm run perf`, or broad retained scenarios.

## 8G-2 — Initial placement legality

Status: complete; deterministic minimum-adjustment placement and retained-route legality pass.

Purpose:

Stabilize setup-time hard-overlap validation and deterministic legal-placement
support already present.

Requirements:

- retained/main production scenarios start with zero illegal hard-standing
  overlap;
- setup/legal placement is deterministic;
- runtime collision does not manufacture depenetration movement;
- deliberately illegal dense fixture remains explicitly adverse/diagnostic;
- no change to strategic spawn/deployment meaning beyond the minimum legal
  local placement adjustment;
- no feature work in runtime crowd behaviour.

Focused tests:

- legal-placement determinism;
- zero hard-standing overlap for registered production/retained routes;
- illegal fixture reports evidence instead of silently repairing at runtime;
- scenario/unit definition reorder expectations where applicable.

Checks:

```text
focused initial-placement/content tests
npm run typecheck
git diff --check
```

Build only if content/startup wiring requires it.

## 8G-3 — Debug evidence and retained route

Status: complete; focused snapshot/render/UI checks and retained-route HTTP smoke pass.

Purpose:

Stabilize the already-wired debug snapshot/render/UI surface.

Requirements:

Expose hideable evidence for:

- footprint/radius;
- occupancy class;
- permitted versus resolved movement;
- blocked/reduced/redirected;
- principal blocker/relationship;
- courtesy/detour/overtake;
- downed-soft crossing;
- assisted-group interaction;
- yielding egress;
- derived right-of-way.

Retain centre gait/activity pip.

Retain:

```text
/test?scenario=personal-space
```

and main `/` debug availability.

No Milestone 9 flavour art.

Focused checks:

```text
focused snapshot/render/UI tests
npm run typecheck
npm run build
git diff --check
browser/HTTP smoke if available
```

Do not run full headless or full performance suite.

---

## 8H — System integration gate

Status: in progress. 8H-3 is accepted. 8H-4, the diagnosis-only casualty/contact causality audit, has been run by Codex, but its report is not embedded in this repository snapshot and has not yet been reviewed here. Do not infer an 8H-4 conclusion, apply a correction, or advance to 8I until that audit result is reviewed.

Current handoff evidence retained from the review conversation:

- 8H-2 found casualty drag beginning on tick 8 rather than the stale expected tick 9;
- entity 14 had no selected target at tick 1 in the affected contact fixture;
- the retained 7E energy integration fixture produced zero attacks;
- disabling legal initial placement did not restore those outcomes, so legal placement alone was not a sufficient explanation;
- 8H-3 then made fixture/test-only corrections, with no production runtime change, and its focused checks/typecheck/diff-check passed;
- 8H-4 was explicitly limited to causality diagnosis: tick-zero separation, reach/query radii, eligibility, requested versus collision-resolved movement, first contact/attack timing, and whether the remaining failures are stale/interpenetration-dependent fixtures or a production contact/query defect.

**No new features.**

Purpose:

Prove 8A–8G coexist across the production simulation.

Required:

```text
npm run typecheck
full npm test
npm run build
git diff --check
```

Also stabilize named broad regressions/retained behaviour involving:

- physical occupancy;
- main battle summary/timeline;
- pursuit;
- Milestone 4 retained morale/routing behaviour;
- casualty/treatment;
- respawn egress;
- energy movement evidence;
- deterministic replay and reversed-order expectations.

Guardrails:

- understand a failing expectation before changing it;
- do not rebaseline unrelated tests merely because collision changed;
- do not add new Milestone 8 behaviour;
- do not raise timeouts to hide integration cost;
- if a genuine missing mechanic is discovered, stop and open a narrow correction
  slice rather than implementing it inside the gate.

8H is the explicit broad-system test stage.

---

## 8I — Performance and deterministic soak gate

Status: pending after 8H.

**No new gameplay behaviour.**

Required:

- full `npm run perf`;
- representative legal 2,000-entity Milestone 8 measurement;
- one-hour deterministic collision soak/replay;
- collision-stage timing;
- local query/candidate/pass counts;
- retained typed storage;
- allocation/GC evidence where practical;
- debug-off production measurement;
- deliberately illegal dense diagnostic fixture reported separately.

Do not treat the illegal dense fixture as representative acceptance performance.

Do not raise timeout limits to pass.

Optimise only measured bottlenecks.

If optimisation changes production simulation code:

```text
run focused affected regressions
then repeat 8H before acceptance
```

---

## 8J — Human visual acceptance gate

Status: pending after 8H and 8I.

No planned simulation feature work.

Inspect:

```text
/test?scenario=personal-space
/
```

Human questions:

- do hostile fronts physically settle without interpenetrating/jitter;
- do allies cross/overtake/courtesy-yield like awkward people rather than robots;
- do loose versus formed units have believable lateral freedom;
- do routers physically disturb allied traffic;
- do Physicks/responders gain appropriate local passage without parting enemies;
- do downed people matter without forming corpse walls;
- do rescue groups remain coherent;
- do dead egressers get out of the way of the living;
- does the main battle remain comprehensible and stable over time;
- does the debug overlay explain the observed behaviour.

If human inspection discovers a defect, create an 8J correction sub-slice with
a focused regression. Replay 8H/8I only where the correction invalidates those
gates.

Milestone 8 is accepted only after 8J human approval.

---

# Performance requirements

Representative acceptance target remains roughly 2,000 entities with legal
battlefield placement.

Use bounded local spatial queries and reusable typed storage.

No:

- dense pair matrix;
- global pathfinding;
- connected-component production fallback;
- hot-loop per-entity object allocation.

The deliberately impossible overlapping pile is diagnostic only.

---

# Visual grammar

Milestone 8 remains debug-oriented.

Expose hideable physical/crowd evidence without turning every entity into text.

Preserve the centre gait/activity pip.

Milestone 9 owns flavour sprites and the dual flavour/debug presentation.

---

# Explicit deferrals

Milestone 9:

- flavour sprites and layered art.

Milestone 10:

- captain orders;
- captain right-of-way projection.

Later role/content milestones:

- banner-bearer role/right-of-way;
- richer Physick role metadata beyond current urgent-response authority.

Milestone 11:

- citizen Sentinel Gate egress;
- respawn batching/re-entry.

Milestone 14:

- terrain/person collision and chokepoints.

Milestone 15:

- forced-movement call consequences such as REPEL/STRIKEDOWN.

---

# Definition of done

Milestone 8 is done after:

```text
8G-1 simulation stabilization
8G-2 legal placement
8G-3 debug route
8H full system integration gate
8I performance + one-hour soak gate
8J human visual acceptance
```

and the core goal/invariants at the top of this plan remain true.

## Milestone boundary

> Movement decides where somebody is trying to go. Energy decides how hard they
> can move. Milestone 8 decides whether another actual human body is already in
> the way, and who should locally yield when allied bodies compete for space.
