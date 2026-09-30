# Documentation map

This file defines where project documentation belongs and which documents are authoritative.
Its purpose is to prevent multiple AI-generated files from becoming competing sources of truth.

## Authority order

For implementation work, use documentation in this order:

1. root and nearest directory `AGENTS.md`
2. `docs/codex/` process doctrine
3. the active milestone plan in `docs/plans/`
4. relevant `docs/design/` doctrine/reference
5. accepted historical contracts in `docs/completed-plans/`, only when the current work needs them
6. `docs/progress/` implementation history/evidence, only when explicitly required

The canonical milestone numbering/status source is:

```text
docs/plans/empire-sim-milestone-roadmap.md
```

Do not create another roadmap or milestone-status summary. Update the canonical roadmap instead.

## Directory roles

### `docs/plans/`

Only current or future executable plans belong here.

At present:

- `empire-sim-milestone-roadmap.md` — canonical project roadmap and numbering authority
- `milestone-8-personal-space-collision-and-crowd-flow.md` — active milestone
- `milestone-9-dual-renderer-and-flavour-visuals.md` — next planned milestone

When a milestone is accepted, move its detailed plan to `docs/completed-plans/` rather than leaving an accepted plan among active work.

### `docs/completed-plans/`

Accepted milestone contracts and historical detailed plans.

These files are not normal startup context. Read them only to resolve a concrete inherited rule or regression.

### `docs/design/`

Stable design doctrine, behavioural intent, rules extraction, and future-system boundaries.

Design files describe what the simulation should mean. They do not override the active milestone scope and should not duplicate roadmap status.

### `docs/progress/`

Read-on-demand implementation history, measurements, and evidence for work still in progress.

Do not treat progress files as design authority and do not preload them for normal slices.

### `docs/codex/`

Stable development-process doctrine: architecture, testing, performance, review, planning, and work slicing.

### `docs/agent-loop/`

Machine/human handoff state for the reviewer/implementer loop. `CURRENT_TASK.md` is the immediate task contract; generated reports/reviews are workflow state, not design authority.

## Duplication rule

Before creating a new Markdown document, first ask whether the information belongs in an existing authoritative file.

Prefer:

- editing the canonical roadmap over creating a new roadmap;
- editing an active milestone plan over creating an addendum;
- moving an accepted plan to `completed-plans/` over leaving duplicate active/historical copies;
- adding implementation evidence to the relevant progress file over creating another status report;
- adding stable behavioural doctrine to the relevant design file over repeating it in multiple milestone plans.

A new Markdown file is justified when it has a distinct lifetime or authority boundary, not merely because a new Codex/chat run started.
