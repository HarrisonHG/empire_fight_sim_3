# Deferred Concerns and Follow-Up Register

Status: active working register.

Purpose:

Record known limitations, modelling uncertainties, performance concerns, and deliberately deferred cleanup so they are not lost between milestones.

This file is not an implementation backlog by itself. An item should only become active work when:

- its target milestone is reached;
- a representative scenario exposes it;
- profiling shows it is materially expensive;
- or it blocks correct implementation of a later feature.

Do not fix entries opportunistically while implementing unrelated slices.

---

## Entry format

Each concern should include:

- **ID**
- **Area**
- **Observation**
- **Why deferred**
- **Revisit trigger**
- **Likely milestone**
- **Status**

Suggested statuses:

```text
noted
watching
ready
resolved
wont-fix
```

---

# Current concerns

## DC-001 — Representative unit sizes

**Area:** Performance scenarios / content assumptions  
**Status:** resolved

**Observation**

A typical Empire unit is likely to contain approximately **5 to 30 people**.

The current representative 2,000-entity benchmark uses:

```text
40 units × 50 people
```

This is useful as a large multi-person-unit benchmark, but it is not representative of normal Empire unit size.

A more representative 2,000-person army would likely contain more units, for example:

```text
67 units × 30 people ≈ 2,010 people
100 units × 20 people = 2,000 people
200 units × 10 people = 2,000 people
```

These cases increase unit-level work while keeping individuals grouped, so they may produce meaningfully different performance characteristics.

**Resolution (Milestone 4H-1, 2026-07-11)**

Added a separately reported 2,000-entity formation benchmark with 100 units of
20 people. The existing 40×50 multi-person path and 2,000 one-person-unit
stress path remain in place for comparison.

**Revisit trigger**

- Captain and command systems are implemented.
- Performance hardening begins.
- Representative battle scenarios are introduced.

**Likely milestone**

Milestone 7, 8, or 15.

---

## DC-002 — One-person-unit stress case is pathological

**Area:** Performance interpretation  
**Status:** watching

**Observation**

The existing 2,000 × 1-person-unit scenario is intentionally pathological. It measures worst-case unit-level bookkeeping rather than a plausible battle organisation.

It should remain as a stress test, but should not dictate architecture or be described as the expected battlefield cost.

**Why deferred**

No production change is required. This is primarily a reporting and interpretation concern.

**Revisit trigger**

When performance results are documented or compared during Milestone 15.

**Likely milestone**

Milestone 15.

---

## DC-003 — Per-tick unit confidence sampling

**Area:** Persistent morale performance  
**Status:** watching

**Observation**

Persistent morale currently calculates average confidence by iterating over every member of every unit each tick.

Confidence currently appears mostly static, so repeated full sampling may be unnecessary.

Possible later approaches:

- cache unit-average confidence;
- update it only when individual confidence changes;
- maintain a running aggregate;
- expose it through an existing unit-summary store.

**Why deferred**

Current representative performance remains inside the 20 Hz tick budget. Optimising now would be speculative.

**Revisit trigger**

- Profiling identifies confidence sampling as material.
- Individual confidence becomes dynamic.
- Unit-summary consolidation occurs.

**Likely milestone**

Milestone 4H or 15.

---

## DC-004 — Same-unit overtaking check is quadratic

**Area:** Formation movement performance  
**Status:** watching

**Observation**

Formation movement currently checks members against other members in the same unit to prevent overtaking.

This is approximately O(members²) per unit.

For normal Empire unit sizes of 5–30, this is probably acceptable:

```text
5 members  → 25 comparisons
30 members → 900 comparisons
```

Very large synthetic units may make this cost more visible.

**Why deferred**

Normal unit sizes keep the comparison count bounded. No measured bottleneck currently requires a redesign.

**Revisit trigger**

- Profiling identifies formation overtaking checks as material.
- Scenarios introduce unusually large units.
- Formation representation changes.

**Likely milestone**

Milestone 15.

---

## DC-005 — Hostile contact lateral lane may be too broad

**Area:** Movement realism  
**Status:** watching

**Observation**

The hostile-contact guard currently blocks forward movement based on a lateral lane derived from formation spacing.

This prevents line interpenetration, but may also cause fighters to stop because of enemies who visually belong to a neighbouring file.

Possible symptoms:

- visible gaps that fighters refuse to fill;
- overly rigid front lines;
- unnatural edge behaviour;
- delayed movement around flanks.

**Why deferred**

Reach, equipment, target selection, displacement, death, and routing are not yet complete. The correct contact shape cannot be judged from the current simplified sandbox alone.

**Revisit trigger**

- Equipment and weapon reach are mechanically active.
- Individual target selection exists.
- Human inspection shows persistent implausible gaps.

**Likely milestone**

Milestone 10, 13, or 15.

---

## DC-006 — Spike 3.5 X-axis separation assertion is scenario-specific

**Area:** Tests  
**Status:** noted

**Observation**

The live combat regression test requires the entire left unit to remain strictly left of the entire right unit.

This is appropriate for the current head-on scenario, but will become invalid when the simulation supports:

- flank wrapping;
- angled formations;
- breakthroughs;
- routing through gaps;
- displacement;
- more complex terrain.

**Why deferred**

The assertion correctly protects the current narrow scenario.

**Revisit trigger**

When the live scenario is expanded beyond two opposing head-on formations.

**Likely milestone**

Milestone 8, 11, or 14.

---

## DC-007 — Routing pass-through buffer overflow is not exposed

**Area:** Routing contagion / debugging  
**Status:** noted

**Observation**

Routing pass-through interactions are stored in a preallocated 256-pair buffer.

Additional interactions are deterministically dropped, but there is currently no overflow counter or debug signal.

**Why deferred**

Representative performance and normal scenarios have not shown overflow. The fixed bound protects cost and determinism.

**Revisit trigger**

- A scenario reaches the interaction cap.
- Routing-collapse scenarios are added.
- 4H consolidation reviews inspectability.

**Likely milestone**

Milestone 4H or 15.

---

## DC-008 — Fast routers may outrun pass-through consumption radius

**Area:** Routing contagion correctness  
**Status:** noted

**Observation**

A router can record a segment-based allied pass-through, but contagion currently also depends on the target being found within the router's end-of-tick local query.

A sufficiently fast router could cross an allied unit and finish outside that radius, causing valid pass-through evidence to be ignored.

Current movement speeds make this unlikely.

**Why deferred**

No existing realistic movement speed reproduces the issue.

**Revisit trigger**

- Energy, sprinting, charging, knockback, or repel effects increase movement distances.
- A regression test can reproduce the missed interaction.

**Likely milestone**

Milestone 5, 13, or 15.

---

## DC-009 — Routing interaction collection still allocates some objects

**Area:** Routing contagion performance  
**Status:** watching

**Observation**

Pair storage is preallocated, but routing interaction collection still creates output objects or arrays when interactions occur.

Measured contagion cost is currently small.

**Why deferred**

The representative 4F result was approximately:

```text
contagion: 0.444 ms/tick
whole path: 9.321 ms mean
whole path: 21.775 ms p95
```

No evidence currently justifies optimisation.

**Revisit trigger**

Profiling shows garbage collection or contagion allocation cost becoming material.

**Likely milestone**

Milestone 15.

---

## DC-010 — Debug snapshot allocation and size

**Area:** Worker snapshots / debugging performance  
**Status:** watching

**Observation**

Combat/debug snapshots create object graphs and arrays each tick. Payload estimation may also serialise debug state.

This is acceptable for the current small visual sandbox, but may become expensive with many units and richer debug fields.

**Why deferred**

The simulation path remains within budget and debugging visibility is currently more valuable than premature compression.

**Revisit trigger**

- Worker payload size becomes material.
- Large-unit visual scenarios are introduced.
- Renderer/replay/debug tooling expands.

**Likely milestone**

Milestone 14 or 15.

---

## DC-011 — Performance baselines are machine-dependent

**Area:** Performance reporting  
**Status:** noted

**Observation**

Mean and p95 results vary by machine load, runtime version, thermal state, and background activity.

Current performance tests correctly use structural assertions instead of tight timing thresholds.

Historical values should be treated as reference observations, not hard acceptance limits.

**Why deferred**

This is already handled appropriately by the test policy.

**Revisit trigger**

When formal regression detection or CI performance baselines are introduced.

**Likely milestone**

Milestone 15.

---

## DC-012 — Milestone numbering references may drift

**Area:** Documentation  
**Status:** resolved

**Observation**

The detailed Milestone 4 plan previously referred to captain-assisted rallying as Milestone 5 work.

The updated roadmap places:

```text
Milestone 5: Energy
Milestone 7: Captains and command
```

Cross-document references should be checked during consolidation.

**Resolution (Milestone 4H-1, 2026-07-11)**

The active Milestone 4 plan now consistently defers captain-assisted rallying
and command bonuses to Milestone 7.

**Revisit trigger**

Milestone 4H documentation consolidation.

**Likely milestone**

Milestone 4H.

---


## DC-013 — Recovery cohesion lacks a semantic maximum

**Area:** Morale recovery / formation state
**Status:** resolved

**Observation**

`restoreUnitCohesion` currently clamps to the signed 32-bit integer state limit rather than to a unit's intended cohesion ceiling.

A unit that routes because of pressure while retaining cohesion near its configured starting value can therefore recover above that value. The existing bound test proves storage safety, not model correctness.

A likely correction is to store an explicit maximum or baseline cohesion per unit and cap recovery at that value.

**Resolution (Milestone 4H-1, 2026-07-11)**

Formation now stores each unit's configured-initial cohesion as its semantic
maximum, and recovery restoration is capped at that value.

**Revisit trigger**

Milestone 4H consolidation.

**Likely milestone**

Milestone 4H.

---

## DC-014 — Persistent morale cohesion sample can be stale after recovery restoration

**Area:** State ownership / debugging
**Status:** resolved

**Observation**

Persistent morale samples formation-owned cohesion before applying same-tick recovery restoration.

After restoration, the persistent read model can report the pre-restoration cohesion value until the next tick, even though the formation store has already changed.

**Resolution (Milestone 4H-1, 2026-07-11)**

Persistent morale now refreshes its sampled cohesion from the formation store
immediately after requesting recovery restoration.

**Revisit trigger**

Persistent morale state is exposed in the Milestone 4H debug snapshot.

**Likely milestone**

Milestone 4H.

---

## DC-015 — Recovery safety is queried from the unit anchor

**Area:** Recovery threat geometry
**Status:** watching

**Observation**

Recovery safety currently queries for hostile entities within the shared radius around the unit anchor rather than around the full unit footprint or each member.

For normal Empire units of approximately 5–30 people this is probably adequate, but unusually wide or deep formations could have a hostile near one edge while the anchor remains outside the recovery radius.

**Why deferred**

No representative unit currently reproduces a false-safe recovery decision, and a footprint-aware query would add complexity without evidence.

**Revisit trigger**

- A standard 5–30-person scenario reproduces the issue.
- Formation footprints become authoritative for threat queries.
- Very large or unusually shaped units are introduced.

**Likely milestone**

Milestone 8, 10, or 15.

---

# Maintenance rules

When adding an entry:

1. Record the concrete observation, not a speculative redesign.
2. State why it is not being fixed now.
3. Include a trigger that would justify revisiting it.
4. Name the likely milestone.
5. Do not turn the register into a second roadmap.
6. Mark resolved entries rather than deleting them, unless they were duplicates or factually wrong.

During each milestone consolidation pass:

- review entries assigned to the current milestone;
- promote justified items to active work;
- leave untriggered items deferred;
- add new concerns found through tests, profiling, or human inspection;
- record resolutions and supporting evidence.
