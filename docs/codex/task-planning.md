# Task Planning Doctrine

## Purpose

Use this document when asking Codex to plan a complex task before implementing it.

A plan is required for:

```txt
architecture changes
new simulation systems
worker protocol changes
performance work
pathfinding
combat
AI behaviour
large refactors
```

A plan is not required for:

```txt
tiny typo fixes
renaming a local variable
updating a comment
small isolated test changes
```

## Plan Location

Plans should be written to:

```txt
docs/plans/
```

Use descriptive filenames:

```txt
docs/plans/000-foundation.md
docs/plans/001-spatial-grid.md
docs/plans/002-basic-combat.md
```

## Plan Format

Each plan should contain:

```txt
Goal
Non-goals
Files likely to change
Architecture impact
Implementation steps
Tests to add
Performance checks
Risks
Done criteria
```

## Planning Rules for Codex

When asked to create a plan:

```txt
do not modify production code
inspect existing files first
reference relevant docs/codex files
produce a concrete ordered checklist
flag ambiguity rather than guessing silently
keep the plan scoped to one milestone
```

When asked to implement a plan:

```txt
follow the plan step by step
update the plan as steps complete
run tests/checks
summarise what changed
summarise what remains
```

## First Plan

The first plan should be:

```txt
docs/plans/000-foundation.md
```

It should cover only:

```txt
Vite + TypeScript setup
PixiJS renderer
Web Worker simulation loop
fixed simulation ticks
seeded RNG
1000 moving entities
pause/resume
step one tick
basic metrics
headless tests
performance scenario
```

It must not include:

```txt
combat
pathfinding
morale
factions
inventory
abilities
procedural generation
save/load
complex UI
```
