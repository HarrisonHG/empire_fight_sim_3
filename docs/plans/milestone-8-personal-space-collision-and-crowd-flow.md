# Milestone 8: Personal Space, Collision, and Crowd Flow

Status: automated checks complete; ready for human review, not accepted.

Accepted slices:

```text
8A  collision/spacing feasibility spike
8B  occupancy contract and collision authority boundary
8C  active-standing collision and hostile fronts
8D  allied crowd flow, overtaking, push-through, routing priority
8E  downed-soft occupancy and casualty-group integration
8F  yielding player-presence egress
```

8G-1/2/3 are locally complete. Integration, performance/soak and human assessment
remain separate requirements; use the current task/checkpoint for execution state.

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

For casualty-helper gathering, the human decision on 2026-10-18 is: never
increase distance to the current patient. Compare squared Euclidean distance
before and after each resolved step against the same patient position. Equal
distance (sideways movement) is allowed; temporary movement farther away is not.
This applies to gathering avoidance around both soft and hard obstructions;
hard-body legality and movement budgets still apply. Hold when no legal step
satisfies the rule. Equal-distance movement must not reintroduce endless cycles.

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

# Implemented 8G contracts

The three sections below retain the implemented authority, legality and debug
contracts. Detailed implementation history is read on demand from docs/progress/.
Preserve existing work; local completion does not accept later system gates.

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

Work packages include diagnosis, repair, regression and focused verification.
Checkpoint each independently reviewed repair even while this gate remains red;
select the next distinct issue with a new task ID/context. Do not create routine
diagnosis-only handoffs or demand renewed permission for authorised fixes.

Status: complete on the final source, 2026-10-19: 1,292 tests across 91 files,
typecheck, production build and diff check passed. The repeat covers production
changes after the historical 8H-10 acceptance and the 8H-11 correction.

8H-11 is a narrow correction: constrain non-increasing patient distance only
for casualty-helper gathering, using an explicit caller opt-in. Medical approach
retains its existing local detour authority with a downed contact patient.
Regressions reproduce the original authority leak and preserve gathering,
hard-body legality, movement budgets and deterministic replay. Focused checks
pass; the complete integration repeat also passes.

The reconstructed 8H-4-R1 audit was accepted; the old missing-audit prerequisite
is resolved. Detailed historical evidence belongs in `docs/progress/`.

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

Retain the full-scene 400-tick/10-second inspected-record construction requirement
in tests/performance/inspectedSnapshotConstruction.test.ts. The individual
death-clock display regression requests only its relevant inspected entity;
this does not waive representative snapshot throughput or lifecycle coverage.

Status: all required automated measurements/checks pass, 2026-10-19: 137 tests
across 24 files, including the one-hour replay and full-scene inspection budget.
Performance viability still needs human assessment: the legal 2,000-entity case
averages 73.06 ms/tick (p95 77.16 ms), about 13.7 ticks/second on this machine,
below real-time 20 Hz. No numerical acceptance budget was specified; do not
infer an unconditional performance acceptance from passing structural tests.
Detailed measurements, storage/GC limits and separate adverse results are in
the implementation history. No timeout or assertion budget was increased.

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

Status: ready for human review; visual acceptance and the 8I throughput concern
remain unresolved. Both routes passed HTTP smoke. No connected browser was
available for visual inspection; HTTP checks do not establish visual acceptance.
Use `docs/agent-loop/HUMAN_REVIEW.md` for the current checklist.

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
