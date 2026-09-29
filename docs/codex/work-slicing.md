# Work Slicing and Verification Gates

## Purpose

Codex work must stay small enough to implement, review, and verify without
reloading the whole project history or spending a full model budget on one run.

The default unit of implementation is a **narrow slice**, not an entire
lettered milestone.

This doctrine supersedes any older instruction that implies every Codex
implementation step must run the entire repository test/performance/build suite.

Milestone acceptance still requires full integration evidence at explicit gates.

---

## Context budget rules

For a normal implementation slice, read only:

```text
AGENTS.md
docs/codex/work-slicing.md
the exact active milestone plan
the exact slice section being implemented
one or two directly relevant doctrine/reference files if the slice names them
the production/test files needed to implement the slice
```

Do **not** recursively read:

```text
docs/completed-plans/
docs/progress/
all design documents
all previous milestone plans
```

Those are read-on-demand references only.

Do not reread a large accepted plan merely to recover one invariant. Prefer
targeted search/grep for the named concept.

The implementation prompt should not repeat the plan.

---

## Active plan size

Active plans are specifications, not execution diaries.

Keep active plans concise:

- current goal and invariants;
- slice boundaries;
- explicit deferrals;
- acceptance criteria;
- current status.

Do not append full Codex completion reports, large performance tables, or
long historical implementation narratives to the active plan.

Move detailed accepted evidence to:

```text
docs/progress/
```

or, once the whole milestone is complete:

```text
docs/completed-plans/
```

Normal Codex slices must not read progress/history files unless explicitly told.

---

## Slice types

### 1. Feature slice

Purpose: implement one narrow behaviour or contract.

Typical size:

- one authority boundary;
- one production adapter;
- one renderer surface;
- one small group of tightly related tests.

Required checks:

```text
focused tests named by the slice
typecheck when production TypeScript changed
git diff --check
```

Run `npm run build` only when the slice changes:

- worker/public module boundaries;
- renderer/UI/content startup wiring;
- bundling-sensitive assets/imports;
- or the slice explicitly requires it.

Do not run the full test suite by default.

Do not run the full performance suite by default.

If a hot path changed, run a focused structural/performance case for that path.

### 2. Correction slice

Purpose: fix one reviewed defect.

Required checks:

```text
new regression reproducing the defect
the smallest directly related test set
typecheck if production code changed
git diff --check
```

Do not broaden into nearby cleanup.

### 3. System integration gate

Purpose: prove that several accepted slices coexist.

This is a **lettered milestone stage of its own** whenever a milestone has
multiple interacting production slices.

No new feature work.

Required checks normally include:

```text
typecheck
full headless test suite
build
git diff --check
```

Also run explicit retained/replay/system scenarios named by the milestone.

Fix only integration regressions caused by the current milestone. Do not use a
system gate as permission for unrelated refactoring.

A failing old test must be understood before its expectation is changed.

### 4. Performance / soak gate

Purpose: measure the integrated system after the system gate is stable.

No speculative optimisation.

Run:

```text
full performance suite
representative milestone-specific measurements
required soak/replay
allocation/storage evidence where relevant
```

Report adverse/artificial fixtures separately from representative production
acceptance cases.

Do not raise timeout limits simply to make the gate pass.

If optimisation changes production behaviour or authority code, rerun the
relevant focused regressions and repeat the latest system integration gate
before milestone acceptance.

### 5. Human visual acceptance gate

Purpose: inspect browser-visible behaviour after automated integration and
performance gates are stable.

No new simulation feature work by default.

If human inspection discovers a simulation defect:

```text
open a narrow correction slice
add a regression
implement the correction
rerun only the affected focused checks
then replay the required integration/performance gate(s) if the correction
crossed their assumptions
```

---

## Guardrails for small slices

A small slice is allowed to leave the wider system temporarily unreconciled
only when all of the following are true:

- its contract is explicit;
- the active plan lists the later integration gate;
- existing production behaviour outside the slice is not knowingly corrupted;
- the slice does not weaken or delete unrelated tests merely to stay green;
- any expected downstream integration change is recorded, not silently fixed;
- no temporary bypass becomes production authority.

If a narrow slice exposes an unrelated system failure, report it and defer it
to the named integration gate unless it proves the slice contract itself is wrong.

---


## Repository hygiene

Once a slice has passed human/technical review, checkpoint it before starting
the next slice whenever practical.

Prefer:

```text
accepted slice
→ commit/checkpoint
→ clean working tree
→ next slice
```

Avoid accumulating several accepted slices plus new WIP in one uncommitted diff.

A clean baseline reduces:

- Codex inspection context;
- archive size;
- review ambiguity;
- accidental edits to accepted behaviour;
- difficulty identifying which slice introduced a regression.

If a current mixed WIP cannot be cleanly split without risky hunk surgery, do
not rewrite history merely for tidiness. Stabilise it through the next named
gate, checkpoint there, then resume clean-slice discipline.

## Test-output economy

Broad command output consumes context.

When possible:

- use concise/non-verbose test reporters;
- redirect large successful logs rather than echoing them into the conversation;
- on success, report only counts and command status;
- on failure, include only the relevant failure names and concise diagnostics;
- do not paste hundreds of passing test names;
- do not paste full performance logs when a compact table is enough.

---

## Completion-report economy

Normal successful feature/correction reports should be under roughly 350 words.

Include only:

```text
slice implemented
files/layers changed
focused checks run
one or two important design decisions
remaining concern / next gate
archive path/hash when requested
```

Do not restate the milestone specification.

Integration/performance reports may be longer when evidence genuinely requires it.

---

## Prompt template

A normal implementation prompt should usually be this small:

```text
Implement <slice> only.

Read:
- AGENTS.md
- docs/codex/work-slicing.md
- <active milestone plan>, section <slice>

Treat earlier accepted slices as accepted contracts. Do not reread their
implementation history unless this slice explicitly requires it.

Implement only the deliverables and guardrails in <slice>.
Do not implement the next slice.

Run only the checks listed for <slice>.
Do not run the full suite/perf/build unless the slice says to.

Update the active plan status concisely. Put detailed evidence in the completion
report, not the plan.

Package the changed files and report completion concisely.
```

---

## When to insert a system gate

Insert a system integration gate after:

- two or three production slices that touch different authorities;
- introducing a new shared contract used by several systems;
- changing tick/system ordering;
- crossing sim + worker + render/UI;
- enabling a previously isolated system in the main `/` scenario;
- any point where accepted local tests can no longer prove cross-system safety.

Do not postpone all integration until the end of a very large milestone.

The goal is:

```text
small feature slices
→ occasional explicit system gate
→ more feature slices
→ performance/soak gate
→ human acceptance
```

not:

```text
one enormous Codex run attempting everything
```
