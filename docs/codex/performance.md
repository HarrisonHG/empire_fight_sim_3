# Performance Doctrine

## Goal

Support large entity counts without hiding bad algorithms behind longer
timeouts or premature optimisation.

Verification cadence is defined by:

```text
docs/codex/work-slicing.md
```

---

## Principle

Rendering and simulation are separate bottlenecks.

When performance is bad, classify the bottleneck before changing code:

```text
simulation CPU
rendering CPU
GPU/render load
worker message size
garbage collection
pathfinding
spatial query explosion
sprite count
debug overlay cost
metric/UI overhead
```

---

## Entity targets

Maintain useful structural scenarios around:

```text
100
500
1000
2000
```

Use representative legal battlefield placement for acceptance measurements.

Keep deliberately impossible/adverse fixtures separate and label them clearly.

---

## Feature-slice performance

Do not run the entire performance suite after every small feature slice.

If a slice changes a hot path, run only the relevant structural measurement and
record enough evidence to catch a local complexity disaster.

Examples:

- local candidate/query count;
- bounded solver passes;
- allocation/storage delta;
- one representative entity-count sample.

The full performance suite belongs to the explicit performance/soak gate.

---

## Prohibited patterns

Do not use all-entity-against-all-entity normal simulation logic.

Avoid hot-loop:

- map/filter/reduce chains;
- temporary arrays/objects per entity/tick;
- JSON clone tricks;
- sprite destroy/recreate loops;
- per-tick global sorting when bounded local ordering suffices.

Prefer spatial grids, reused arrays, typed storage, pools where justified, and
stable persistent render objects.

---

## Spatial grid

Use the uniform spatial grid for local:

- perception;
- melee range;
- collision/spacing;
- morale aura;
- area effects;
- threat;
- healing.

Do not add a second global neighbour mechanism casually.

---

## Performance/soak gate

The milestone plan should define one explicit performance stage after system
integration is stable.

That gate should report:

```text
representative legal case
relevant stage timings
query/candidate/pass counts
retained storage
allocation/GC evidence where relevant
long deterministic soak when required
adverse fixture separately
```

Do not raise timeout limits simply to pass the gate.

Optimise only measured bottlenecks.

If an optimisation changes production code, rerun focused regressions and the
latest system integration gate before milestone acceptance.

---

## Pre-existing failures

A claimed pre-existing failure may be excluded only when reproduced on unchanged
HEAD with comparable structural evidence.

Baseline reproduction proves non-regression; it does not erase the concern.

---

## Debug warning

Debug tooling can destroy performance.

Every expensive debug overlay must be disableable.

Measure with debug disabled for production acceptance and enabled where the
milestone specifically needs debug-cost evidence.
