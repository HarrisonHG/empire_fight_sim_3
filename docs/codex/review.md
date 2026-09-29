# Review Doctrine

## Purpose

Reviews guard against complexity, bugs, scope creep, and performance collapse.

Codex self-review is required for every slice. Human review remains required at
the milestone's acceptance gates.

Also read:

```text
docs/codex/work-slicing.md
```

---

## Slice self-review

Before reporting completion, Codex checks:

```text
Did I modify only the named slice?
Did I avoid explicitly forbidden files/features?
Did I preserve sim/worker/render/UI/content boundaries?
Did I introduce forbidden APIs/imports?
Did I add the focused regressions required by this slice?
Did I run exactly the checks requested for this slice?
Did I accidentally fix/defer a wider integration problem without reporting it?
```

Completion report:

```text
scope compliance
files/layers changed
forbidden API/import check
focused checks run
deviations
remaining concern / next gate
```

Do not claim broader milestone health from focused slice tests.

---

## Architecture review

Reject:

- simulation importing Pixi/DOM/UI;
- renderer mutating sim;
- worker timing entering rules;
- hidden duplicate authority;
- a narrow adapter becoming strategic AI.

System ordering must remain explicit.

---

## Determinism review

Check:

```text
no Math.random() in src/sim
no Date.now()/performance.now()/timers in rules
no frame-delta outcomes
stable order where order affects results
same inputs replay identically
```

---

## Performance review

When a hot path changed, look for:

- all-pairs scans;
- pathfinding each entity/tick;
- temporary allocation;
- query explosion;
- sprite churn;
- large worker messages.

Feature slices need focused evidence only.
Full performance acceptance belongs to the milestone performance gate.

---

## Testing review by stage

### Feature/correction slice

Require:

- new/changed rule has focused tests;
- defect has a regression;
- requested typecheck/diff checks pass.

Do not reject a valid small slice merely because it did not run the entire suite
when the plan explicitly reserves that for a system gate.

### System integration gate

Require:

```text
typecheck
full suite
build
named retained/replay scenarios
git diff --check
```

No new feature work.

### Performance/soak gate

Require the plan's representative measurements/soak.
Do not accept timeout inflation as optimisation.

### Human visual gate

Inspect browser-visible behaviour after automated gates are stable.

---

## Scope review

Prefer small changes.

Crossing many layers is allowed only when the named slice is specifically a
presentation/integration slice.

If a feature slice exposes an unrelated regression:

- do not casually rebaseline it;
- report it;
- leave it for the named system integration gate unless it disproves the
  current slice contract.

---

## Archive/repository-state review

Use the smallest archive that makes review trustworthy.

- narrow slice: changed files/hunks are enough when surrounding contracts are known;
- integration gate: full current repository/archive may be required;
- compare archive hashes before rereviewing identical submissions;
- distinguish old uncommitted WIP from the slice under review.

Do not infer repository truth from Codex prose alone.

---

## Context economy review

Be suspicious when Codex:

- recursively reads the docs tree;
- rereads completed milestones without a named reason;
- pastes huge logs;
- appends full execution reports into the active plan;
- runs full test/perf/build cycles for a tiny correction.

These are process regressions as well as token regressions.
