# Task Planning Doctrine

## Purpose

Use this document to plan architecture changes, new simulation systems,
performance work, pathfinding, combat, AI behaviour, and large refactors.

Also read:

```text
docs/codex/work-slicing.md
```

That document owns implementation-slice size and verification-gate policy.

---

## Plan location

Active plans:

```text
docs/plans/
```

Read-on-demand implementation evidence:

```text
docs/progress/
```

Completed milestone plans/history:

```text
docs/completed-plans/
```

Use descriptive filenames.

---

## Active plan format

Each active plan should contain:

```text
Goal
Non-goals
Authority boundaries / invariants
Dependencies
Implementation slices
System integration gate(s)
Performance/soak gate when relevant
Human visual acceptance gate when relevant
Focused tests per slice
Done criteria
```

Do not use the active plan as an execution diary.

Large implementation reports, old performance tables, and accepted historical
evidence belong in `docs/progress/` while the milestone is active.

---

## Planning rules for Codex

When asked to create a plan:

```text
do not modify production code
inspect existing files first
reference only directly relevant docs/codex files
produce a concrete ordered checklist
split implementation into narrow slices
insert explicit system integration gates where cross-system behaviour matters
insert a separate performance/soak gate for expensive integrated systems
flag ambiguity rather than guessing silently
keep the plan scoped to one milestone
```

When asked to implement a plan:

```text
implement only the named slice
do not implement later slices opportunistically
run only the slice checks specified by docs/codex/work-slicing.md and the plan
update active-plan status concisely
leave broader reconciliation to the named integration gate
summarise what changed and what remains
```

---

## Implementation prompt economy

When a reviewed plan exists, the plan is the source of truth.

An implementation prompt should normally contain only:

```text
plan path and exact slice
clarifications/corrections not already in the plan
explicit scope boundary
checks required for that slice
requested completion report/archive
```

Do not paste the plan back into the prompt.

Do not instruct Codex to read every historical plan "for context".

Accepted previous milestones are contracts, not mandatory startup reading.
Search/read them only when the current slice needs a specific inherited rule.

---

## Initial project plan

The project's first plan is archived at:

```text
docs/completed-plans/000-foundation.md
```

It covered only the initial Vite/TypeScript/Pixi/worker/fixed-tick foundation.
