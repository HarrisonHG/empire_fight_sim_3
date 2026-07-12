# Milestone 4: Morale, Pressure, and Routing

Status: accepted / implemented following human inspection on 2026-07-12.

## Purpose

Milestone 4 turns the existing combat records into visible battlefield behaviour.

Milestone 3 already provides the chain:

```text
formation
→ engagement
→ attack opportunities
→ strikes
→ survivability applications
→ combat consequences
→ morale assessments
```

Milestone 4 should consume that output and answer:

> When does a unit stop behaving like a calm formation and start hesitating, yielding, breaking, or fleeing?

The milestone should introduce pressure-driven hesitation, slowing, halting, bunching, giving way, routing, local morale contagion, and recovery.

Do not build one enormous morale engine. Implement this milestone in narrow, testable slices.

---

## 4A — Persistent morale state

### Purpose

Replace the current per-tick morale assessment output with a persistent unit-level morale store.

Suggested states:

```ts
type UnitMoraleState =
  | "steady"
  | "strained"
  | "shaken"
  | "wavering"
  | "routing"
  | "recovering";
```

Avoid using `broken` initially. `Routing` is the first clearly distinct physical behaviour. `Recovering` is necessary so a routed unit cannot become steady immediately when pressure disappears.

Suggested stored values:

```ts
interface PersistentUnitMorale {
  pressure: number;
  cohesion: number;
  confidence: number;

  state: UnitMoraleState;
  stateTicks: number;

  routingRisk: number;
  recoveryProgress: number;
}
```

Most of these values already exist in some form across formation and Milestone 3. This slice should consolidate ownership rather than duplicate state.

### Inputs

- Combat consequence applications
- Current cohesion
- Individual or unit pressure
- Confidence
- Existing morale assessment outputs

### Outputs

- Persistent unit morale state
- Transition-only events, for example:

```text
unit_morale_changed
routing_risk_changed
cohesion_threshold_crossed
```

### Tests

- Damage and sustained engagement increase strain.
- A single weak event does not immediately rout a healthy unit.
- Equal inputs produce identical transitions.
- State does not oscillate every tick around thresholds.
- Recovery occurs gradually after pressure ends.

### Boundary

Do not change movement behaviour in 4A.

### Implementation record (2026-07-11)

- [x] Added a persistent, unit-level morale store after the existing combat
  consequence and morale-assessment stages.
- [x] Added deterministic state-transition events and headless coverage for
  persistence, risk accumulation, hysteresis, deterministic replay, and the
  no-movement/no-removal boundary.
- [ ] Pressure decay, movement responses, routing movement, contagion, and
  recovery transitions remain outside 4A.

---

## 4B — Pressure sources and decay

### Purpose

Make pressure explainable and persistent rather than only appearing as a consequence number.

Pressure may come from:

- Being threatened by an enemy
- Being in contact
- Being engaged
- Taking applied damage
- Being locally outnumbered
- Loss of cohesion
- Flank pressure later, once geometry supports it

Pressure relief may come from:

- No nearby enemy
- Time out of combat
- Strong cohesion
- High confidence
- Nearby steady allies
- Recovery state

Do not make all sources equally strong.

A likely model:

```text
next pressure =
current pressure
+ immediate threat pressure
+ damage pressure
+ routing-neighbour pressure
- recovery decay
```

Use deterministic integer arithmetic and clamp all values.

### Important design rule

Pressure must not equal morale state directly.

Pressure is an input. Morale state is a filtered interpretation of pressure, cohesion, confidence, and persistence.

### Tests

- Pressure accumulates under sustained engagement.
- Pressure decays out of contact.
- Veterans or high-confidence units resist equivalent pressure better.
- No global all-unit scan is introduced.

### Implementation record (2026-07-11)

- [x] Added a deterministic post-consequence pressure stage before morale
  assessment, using existing contact/engagement data, consequence records, and
  observed cohesion loss.
- [x] Added bounded pressure decay outside fresh pressure sources and a simple
  high-confidence engagement/decay modifier.
- [ ] Revised morale arbitration, downward transitions, movement effects,
  routing movement, and recovery remain outside 4B. Routing-ally contagion is
  deferred specifically to 4F.

---

## 4C — Morale transition arbitration

### Purpose

Define when units move between morale states.

Use threshold plus duration, not threshold alone.

Example transition shape:

```text
steady → strained:
moderate pressure for several ticks

strained → shaken:
high pressure or repeated applied damage

shaken → wavering:
low cohesion plus sustained pressure

wavering → routing:
critical routing risk sustained for N ticks
or one severe shock condition

routing → recovering:
safe from nearby hostile pressure for N ticks

recovering → steady:
recovery progress completed

recovering → routing:
contact resumes before recovery completes
```

This creates inertia and prevents state flicker.

### Unit profile effects

The same battlefield conditions should resolve differently based on:

- confidence
- cohesion
- troop experience
- behaviour profile
- accumulated damage
- nearby friendly support

Milestone 4 should formalise these interactions instead of scattering them through movement code.

### Tests

Use table-driven cases for:

- confident veteran unit
- average regular unit
- nervous recruit unit
- identical pressure sequence
- different expected transition timings

### Implementation record (2026-07-11)

- [x] Added deterministic threshold-plus-duration arbitration with one-step
  escalation and de-escalation, confidence, cohesion, role experience, and
  accumulated-damage inputs.
- [x] Added the `routing → recovering → steady` path, with fresh 4B contact
  returning a recovering unit to `wavering` before any later re-route.
- [ ] Friendly-support, captain, behaviour-profile, and richer damage-history
  inputs are not yet represented by authoritative local simulation data.

---

## 4D — Hesitation and degraded movement

### Purpose

Make non-routing morale states visibly affect movement.

Suggested effects:

| Morale state | Movement consequence |
|---|---|
| `steady` | Current behaviour |
| `strained` | Slightly slower slot correction or advance |
| `shaken` | Reduced anchor speed and more formation error |
| `wavering` | Halt, give ground, bunch, or fail to advance |
| `routing` | Implemented in 4E |
| `recovering` | Re-form without advancing |

Do not create separate movement engines for every morale state.

Morale should modify existing movement inputs:

```text
effective unit speed
effective cohesion
effective member correction
effective willingness to advance
```

Use integer factors rather than floating-point accumulation:

```text
steady:     1000 / 1000
strained:    850 / 1000
shaken:      650 / 1000
wavering:      0 / 1000 forward
```

### Behaviour expectations

- `strained` should be subtle.
- `shaken` should visibly lose crispness.
- `wavering` should produce a deterministic halt, give-ground, compression, or failure-to-fill-gaps behaviour.

The first implementation only needs one deterministic wavering response.

### Tests

- Steady units preserve current movement.
- Strained units move more slowly.
- Wavering units stop advancing.
- Morale modifiers do not mutate base configuration.
- No render-time or frame-time influence.

### Implementation record (2026-07-11)

- [x] Added a read-only tick-start morale-to-formation boundary. Persistent
  morale remains the sole state owner; formation consumes only the projected
  state and never writes it.
- [x] Added fixed-point, per-unit anchor and per-member slot-correction
  carries: strained uses 850/1000, shaken 650/1000, wavering halts anchor
  advance with 500/1000 correction, and recovering halts advance with
  700/1000 correction.
- [x] Kept `steady` byte-for-byte on the existing movement path and left
  `routing` unchanged until 4E. The post-arbitration projection means a
  transition affects formation on the following tick.
- [x] Added headless coverage for steady equivalence, multi-tick fractional
  slowing, halted reforming, immutable configured rates, deterministic replay,
  and unchanged entity membership.
- [ ] Routing movement, give-ground behaviour, contagion, rallying, captains,
  UI, and rendering remain outside 4D.

---

## 4E — Routing movement

### Purpose

Make routing a real simulation behaviour rather than a marker.

A routing unit should:

- Suspend its current advance order
- Select a retreat heading
- Move away from the principal hostile pressure
- Stop preserving normal combat formation
- Avoid deliberately running through enemies
- Be allowed to physically flow through allies
- Maintain unit identity
- Remain deterministic

### First routing model

Use a simple retreat direction:

```text
retreat direction =
opposite the vector toward the primary hostile unit
```

If no hostile is available:

```text
retreat direction =
opposite current unit heading
```

Routing individuals should follow a loose retreat footprint. They should not each independently select strategic escape routes.

Suggested movement style:

```ts
"routeAway"
```

A later recovery style may be:

```ts
"rallyAndReform"
```

### Interaction rules

Routing through allies:

- Permitted
- Does not apply pressure, cohesion, or other contagion effects in 4E; those
  effects belong to 4F.

Routing through enemies:

- Not permitted without an explicit gap or future displacement rule

Routing off the world edge:

- Initially clamp and continue seeking a valid retreat vector
- Battlefield removal is outside this slice

### Tests

- A routing unit moves away from its hostile.
- It does not move through the hostile line.
- It can physically flow through an allied unit behind it without changing the
  ally's morale inputs.
- Identical scenarios route identically.
- Unit processing order does not change retreat direction.
- Routing does not delete entities.

### Implementation record (2026-07-11)

- [x] Added `routeAway`, a temporary routing movement style that suspends
  normal formation/order arbitration without changing the stored order,
  heading, speed, or member step configuration.
- [x] Chose a unit-level retreat heading from tick-start spatial-grid and
  anchor data: away from the nearest nearby hostile, or opposite the stored
  heading when none is nearby. Edge handling tries deterministic perpendicular
  alternatives and clamps positions to the world.
- [x] Added loose per-member routing movement, retained the existing local
  hostile contact cap, and deliberately permit flow through allies without
  applying any 4F pressure or cohesion effect.
- [x] Added headless coverage for retreat, fallback, hostile-line safety,
  allied flow, world edges, processing order, deterministic replay,
  configuration preservation, and entity membership.
- [ ] Routing contagion, cohesion damage, rallying, captains, removal, UI, and
  rendering remain outside 4E.

---

## 4F — Local morale contagion

### Purpose

Routing-ally pressure and its local distance rules belong to this slice, not
to 4B pressure accumulation and decay.

Make nearby unit behaviour matter without creating global cascades.

A routing unit may pressure nearby allies based on:

- Distance
- Relationship
- Relative position
- Ally confidence
- Ally cohesion
- Whether the routed unit passes through them

Possible effects:

```text
see ally rout nearby:
small pressure increase

ally routs through formation:
large pressure increase
cohesion loss

several neighbouring units routing:
additional but capped pressure
```

### Hard rule

Use the spatial grid or existing local-query systems.

Do not scan every unit against every other unit.

### Cascade control

Add explicit limits:

- Pressure contributions capped per tick
- One routed unit cannot affect the same ally repeatedly through duplicate queries
- Transition hysteresis remains active
- Newly routed units do not recursively cause unlimited same-tick cascades

Recommended ordering:

```text
1. Movement consumes the previous tick's projected morale state
2. Snapshot that same tick-start routing projection for contagion eligibility
3. Resolve combat consequences and ordinary pressure
4. Collect and apply local routing contagion
5. Assess morale and evaluate persistent transitions
6. Project those transitions for movement on the following tick
```

### Tests

- Nearby routing ally affects morale.
- Distant routing ally does not.
- Multiple routers produce capped accumulation.
- No same-tick recursive explosion.
- Results are independent of unit iteration order.

### Implementation record (2026-07-11)

- [x] Added a dedicated local-grid contagion stage after movement/combat
  pressure and before morale assessment/arbitration. Only the previous tick's
  projected `routing` states can contribute, preventing same-tick cascades.
- [x] Added capped, per-target integer contributions: nearby routing allies
  apply pressure; physical pass-through replaces that nearby contribution and
  also applies cohesion loss. Confidence and cohesion reduce, but never erase,
  a valid contribution.
- [x] Added compact deterministic per-unit summaries for router IDs,
  pass-through router IDs, applied pressure/cohesion, and cap use.
- [x] Added headless coverage for local range, pass-through replacement,
  deduplication, caps, resistance, no recursive cascade, ordering,
  deterministic replay, and entity membership; representative performance now
  exercises the stage without machine-dependent thresholds.
- [ ] Rallying, captains, battlefield removal, UI, and rendering remain
  outside 4F.

---

## 4G — Rallying and recovery

### Purpose

Prevent routing from being permanent.

Without captains, recovery should be limited and difficult.

Possible conditions:

- No hostile within local threat range
- Pressure below threshold
- Minimum routing duration elapsed
- Confidence high enough
- Cohesion above minimum
- Recovery progress accumulated

Then:

```text
routing → recovering
recovering → steady
```

During recovery:

- Movement slows or stops
- Members move toward loose slots
- Cohesion rebuilds gradually
- Normal orders remain suspended
- Contact can interrupt recovery

Captain-assisted rallying and command bonuses are deferred to Milestone 7.

### Tests

- Routed unit does not rally while under threat.
- It can enter recovering after reaching safety.
- Recovery takes multiple ticks.
- Renewed contact interrupts recovery.
- High-confidence units recover faster than low-confidence units.
- No captain assumptions are embedded.

### Implementation record (2026-07-11)

- [x] Completed the existing `routing → recovering → steady` transition path
  with named integer gates: six routing ticks, no hostile in the shared local
  threat range, no fresh combat/contagion pressure, pressure below 60, and
  cohesion at least 550.
- [x] Added deterministic multi-tick recovery progress (target 12), with
  confidence and troop experience affecting progress and formation-owned
  cohesion restoration. Recovery suspends the stored order without mutating
  it; the following tick uses the existing loose-slot formation correction.
- [x] Added a bounded local-grid hostile summary before persistent morale
  arbitration, plus focused headless coverage for gates, recovery, relapse,
  cohesion bounds, damage preservation, determinism, and membership.
- [x] Extended the 40×50 representative path with one bounded recovering-unit
  projection and separately reported recovery-threat collection cost.
- [ ] Captain-assisted rallying, command effects, recovery UI, and 4H
  consolidation remain deferred.

---

## 4H — Integration, performance, and visual spike

### Purpose

Consolidate the milestone without adding new mechanics.

Review:

- State ownership
- Tick ordering
- Determinism
- Local query use
- Snapshot size
- Performance
- Human-visible behaviour

The visual scenario should include:

- One steady veteran unit
- One average regular unit
- One fragile recruit unit
- An opposing force applying comparable pressure
- A second friendly line behind them

Desired visible outcome:

```text
veterans hold
regulars strain
recruits waver and rout
routing recruits disrupt the reserve
some units recover if pressure disappears
```

### 4H-1 consolidation record (2026-07-11)

- [x] Formation owns both current cohesion and its configured-initial maximum;
  recovery restoration cannot exceed that maximum.
- [x] Persistent morale refreshes its sampled cohesion immediately after a
  formation-owned recovery restoration. It owns transition history only.
- [x] The live tick remains: prior projected morale movement, combat,
  consequence/pressure, tick-start routing contagion, local recovery threat,
  assessment, persistent arbitration, then projection for the following tick.
- [x] The existing debug snapshot/panel distinguishes stateless assessment
  inputs from persistent morale state, routing risk, recovery progress,
  pressure, and current cohesion.
- [x] Retained 40×50 and 2,000 one-person stress coverage; added a separately
  reported 2,000-entity / 100×20 ordinary-unit formation benchmark.

---

### 4H-2 human-inspection scenario record (2026-07-11)

- [x] Added the deterministic seven-unit morale inspection scenario as the
  normal live-app default: three comparable blue front units (veteran,
  regular, recruit), a blue reserve behind the recruit retreat path, and three
  holding red opponents.
- [x] Scenario data now permits multiple units per faction plus optional
  formation-owned initial cohesion and individual confidence, while retaining
  the existing 20-vs-15 sandbox and its regression coverage.
- [x] The scenario's bounded headless run demonstrates the intended sequence:
  veteran holds without routing, regular degrades, recruit routes through the
  reserve and applies contagion, then reaches recovery and reforms without
  forward advance. Membership remains unchanged and replay is deterministic.
- [x] The existing combat debug snapshot and metrics panel label every unit and
  retain readable persistent state, pressure, cohesion, routing risk, recovery
  progress, and movement style.
- [x] Initial human inspection completed; findings were addressed in 4H-3.

---

### 4H-3 human-inspection corrections (2026-07-12)

Human inspection found that the prior contact-line movement hid the practical
difference between `strained`, `shaken`, and `wavering`; recovery was too
short to inspect; the fragile recruit did not complete recovery usefully; the
reserve did not visibly reflect contagion; and indefinite outcome-free contact
eventually routed the veteran.

- [x] Formation continues to own movement, but now maps projected morale to
  deterministic hostile-contact styles: `strainedEngage` holds with a small
  ragged slot offset, `shakenEngage` uses a larger ragged/backward offset, and
  `giveGround` moves a wavering anchor backward on a bounded fixed-point
  cadence while preserving hostile non-interpenetration. `routeAway` remains
  exclusive to routing.
- [x] Persistent morale now requires at least 100 recovering ticks (five
  seconds at 20 Hz) and (as refined in 4H-4) 240 recovery progress before
  resuming `steady`.
  Confidence and role still change progress speed, but cannot shorten the
  visible minimum. Safe low-confidence units may progress through recovery
  from a `strained` candidate so they are not trapped forever.
- [x] Retuned the 10-person inspection units without forcing morale state:
  U11 is a very high-confidence veteran expected to hold for the bounded
  inspection run; U12 reaches a more severe non-routing degraded state; U13
  routes, passes through U14, remains recovering visibly, then completes
  recovery; U14 has deliberately bounded resistance and visibly strains after
  the pass-through without routing immediately.
- [x] Added headless trace, recovery-duration, scenario-outcome, replay,
  membership, and damage-preservation coverage. The scenario run is bounded;
  U11 is not promised to withstand indefinitely repeated outcome-free contact.
- [x] Corrected inspection completed; pursuit differentiation was addressed
  in 4H-4.

---

### 4H-4 routing recovery differentiation and pursuit inspection (2026-07-12)

- [x] Recovery remains part of the existing persistent morale state machine.
  Routing remains `routeAway` until all gates pass: at least 6 routing ticks,
  no fresh combat or contagion pressure, no hostile in the 192-unit local
  threat range, cohesion at least 550, pressure below 30, routing risk below
  20, and no candidate state above `strained`. It then enters `recovering`
  and halts its anchor without replacing the stored order.
- [x] While routing safely, formation-owned pressure decays by the existing
  base rate plus a profile bonus of recruit 0, regular 1, veteran 2; durable
  routing risk decays by recruit 2, regular 4, veteran 6 (plus one at high
  confidence). Fresh pressure or renewed hostile contact during `recovering`
  returns directly to `routing`, resetting recovery progress.
- [x] Recovery still has its 100-tick (five-second) visible minimum and now
  requires 240 progress: identical-confidence veteran, regular, and recruit
  units recover in 100, 120, and 240 safe recovering ticks respectively.
  Stored orders are eligible to resume only after persistent morale reaches
  `steady`; movement continues to consume the prior tick projection.
- [x] Added deterministic `?scenario=pursuit-regular` and
  `?scenario=pursuit-veteran` inspection cases. Each has a 10-person blue
  formation facing the same advancing 10-person red formation; only the blue
  troop profile changes. Their headless run confirms routing, continued red
  pursuit, separated hostile anchors during routing/recovery, safe recovery,
  delayed order resumption, deterministic replay, and unchanged membership.
- [x] Updated headless coverage for stop gates, profile-specific risk and
  pressure decay, veteran/regular/recruit recovery ordering, recovery relapse,
  preserved order timing, damage, and entity membership.
- [x] Human inspection of the comparison and both pursuit cases succeeded.
  Milestone 4 was accepted on 2026-07-12. The three cases are retained as one
  combined `/test?scenario=morale-inspection` visual regression suite.

---

## Suggested tick order

A safe initial integration model is:

```text
1. Command ingestion
2. Formation/routing movement from the previous tick's projected morale state
3. Combat opportunity and strike pipeline
4. Survivability applications and combat consequences
5. Pressure application and decay
6. Routing contagion from tick-start routing states
7. Local recovery-threat collection
8. Morale assessment and persistent transition arbitration
9. Events and debug snapshot
```

Movement currently occurs before combat in the live simulation.

Do not reorder the whole simulation in 4A.

Initially:

- Movement runs using the previous tick's morale state.
- Combat updates morale at the end of the tick.
- Morale affects movement on the next tick.

This one-tick delay is deterministic and acceptable.

---

## Debug output

Milestone 4 should eventually expose unit-level debug information:

```text
morale state
pressure
cohesion
routing risk
recovery progress
current retreat direction
primary pressure source
```

Avoid detailed per-individual diagnostics in every snapshot.

Extend the existing debug path after the core states are stable. Do not create a new UI framework.

---

## Performance coverage

Add representative scenarios.

### Scenario A

```text
40 units × 50 people
sustained combat
no routing
```

Measures steady-state overhead.

### Scenario B

```text
40 units × 50 people
10% routing
local contagion active
```

Measures routing behaviour.

### Scenario C

```text
40 units × 50 people
several simultaneous local collapses
```

Measures bounded cascade cost.

Track:

- Mean, maximum, and p95 tick time
- Morale assessments
- State transitions
- Local contagion contributions
- Routing units
- Formation events
- Allocations if existing tooling supports them

Do not add strict machine-dependent timing thresholds yet.

Compare results against the current representative baseline of approximately:

```text
mean: 6.6 ms/tick
p95: 14.3 ms/tick
```

---

## Implementation order

```text
4A Persistent morale store
4B Pressure sources and decay
4C Morale transition arbitration
4D Hesitation and movement degradation
4E Routing movement
4F Local routing contagion
4G Rallying and recovery
4H Integration, performance, and visual spike
```

---

## Milestone 4 definition of done

Milestone 4 is complete when:

- Combat pressure persists and decays deterministically.
- Morale has stable, explicit unit states.
- Confidence and cohesion materially affect transitions.
- Non-routing morale visibly changes movement.
- Routing produces actual retreat movement.
- Routing allies locally affect nearby units.
- Recovery exists without captains.
- No global morale scans or uncontrolled same-tick cascades exist.
- No entities are killed or removed unless separately approved.
- The 2,000-person representative performance scenario remains viable.
- A human can visibly distinguish steady, wavering, routing, and recovering units.

## Milestone boundary

> Milestone 4 decides whether a unit holds or breaks. Milestone 5 decides what leadership does about it.

Captains, command range, order reinterpretation, rally authority, and leadership bonuses belong to Milestone 5.
