# Milestone 4: Morale, Pressure, and Routing

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
1. Snapshot routing states at tick start
2. Collect local routing pressure
3. Apply pressure
4. Evaluate morale transitions
5. Apply movement next tick
```

### Tests

- Nearby routing ally affects morale.
- Distant routing ally does not.
- Multiple routers produce capped accumulation.
- No same-tick recursive explosion.
- Results are independent of unit iteration order.

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

Captain-based rally bonuses belong to Milestone 5.

### Tests

- Routed unit does not rally while under threat.
- It can enter recovering after reaching safety.
- Recovery takes multiple ticks.
- Renewed contact interrupts recovery.
- High-confidence units recover faster than low-confidence units.
- No captain assumptions are embedded.

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

---

## Suggested tick order

A safe initial integration model is:

```text
1. Command ingestion
2. Existing formation/order intent
3. Threat and engagement collection
4. Combat opportunity and strike pipeline
5. Survivability applications
6. Combat consequences
7. Pressure source collection
8. Pressure application and decay
9. Morale transition arbitration
10. Routing contagion snapshot/application
11. Movement behaviour selection
12. Formation/routing movement
13. Events and debug snapshot
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
