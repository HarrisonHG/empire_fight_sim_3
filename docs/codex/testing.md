# Testing Doctrine

## Goal

The simulation must be testable without rendering.

Most logic bugs should be reproducible in headless tests.

If a bug only appears visually, create the smallest deterministic scenario that
reproduces it.

Verification cadence is defined by:

```text
docs/codex/work-slicing.md
```

---

## Test layers

### Focused slice tests

Every feature/correction slice gets the smallest deterministic tests that prove
its own contract.

Examples:

- one authority adapter;
- one collision relationship;
- one lifecycle transition;
- one renderer grammar;
- one bug regression.

Focused tests are the default during implementation.

### System integration tests

Full-suite and broad retained-scenario testing occurs at explicit lettered
system integration gates in the milestone plan.

The purpose is to prove accepted slices coexist.

Do not require every tiny feature slice to rerun the entire repository.

### Performance / soak tests

Performance and long-soak validation occur at explicit performance gates unless
a slice changes a hot path and needs a narrow structural measurement.

---

## Required test qualities

Use Vitest.

Simulation tests should cover as applicable:

- determinism;
- fixed tick behaviour;
- entity/component storage;
- movement;
- spatial locality;
- authority transitions;
- replay;
- regression cases.

Every bug fix must include a regression test.

If a bug cannot be tested, build the smallest harness needed first.

Do not fix simulation bugs only through browser observation.

---

## Determinism

Given the same:

```text
seed
scenario
command sequence
tick count
```

the final simulation summary must be identical.

Use stable serialisable/byte-comparable simulation summaries.

Do not compare renderer state to prove simulation determinism.

---

## Performance scenarios

Maintain automated 100/500/1000/2000 structural scenarios where useful.

Record:

```text
average tick time
p95 tick time
maximum tick time
entity count
tick count
seed
relevant candidate/query/pass counts
```

Do not add flaky hardware-specific CI thresholds casually.

---

## Worker tests

Worker protocol remains separately testable from Pixi rendering.

Commands should produce expected snapshots, metrics, state messages, and errors.

---

## Browser checks

For browser-visible integration/acceptance stages check:

- no console errors;
- expected controls;
- expected visual state;
- no obvious runaway UI/memory behaviour;
- no obvious frame collapse.

Browser checks supplement headless tests.

---

## Command cadence

### Feature/correction slice

Normally:

```text
focused Vitest files
npm run typecheck   # when production TS changed
git diff --check
```

Build only when the slice changes bundling/startup/worker/render/UI boundaries
or explicitly requires it.

### System integration gate

Normally:

```text
npm run typecheck
npm test
npm run build
git diff --check
```

### Performance/soak gate

Normally:

```text
npm run perf
milestone-specific representative measurements
required deterministic soak
```

If production code changes while fixing performance, rerun affected focused
tests and then repeat the latest system gate before acceptance.

---

## Done criteria

A **feature slice** is done when its own deterministic contract and focused
regressions pass.

A **system integration gate** is done when the integrated milestone state passes
the required broad regression/build checks.

A **milestone** is not accepted until all required system, performance/soak,
and human-visual gates in its plan are satisfied.

A confident Codex summary is not evidence.
