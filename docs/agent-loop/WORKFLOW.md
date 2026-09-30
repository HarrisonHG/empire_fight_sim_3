# Automated Reviewer / Implementer Loop

## Purpose

This workflow automates the existing development pattern:

1. a high-effort reviewer inspects the repository and defines a narrowly scoped task
2. a medium-effort Codex implementer makes the change and reports what it did
3. the high-effort reviewer inspects the task, report, repository state, and diff
4. the reviewer either accepts, issues a correction, advances to the next slice, blocks, or requests human review
5. any human-review decision stops the automation immediately

The loop exists to remove prompt-copying and report-copying. It does not remove human acceptance of behaviour, visuals, milestone boundaries, or ambiguous design choices.

## Files

- `docs/agent-loop/CURRENT_TASK.md` — the task the implementer must execute now
- `docs/agent-loop/LAST_REPORT.md` — the implementer's most recent final report
- `docs/agent-loop/LAST_REVIEW.json` — the reviewer's most recent structured decision
- `docs/agent-loop/HUMAN_REVIEW.md` — generated only when human review is required
- `docs/agent-loop/implementer-prompt.md` — stable instructions for the medium-effort implementation run
- `docs/agent-loop/reviewer-prompt.md` — stable instructions for the high-effort review run
- `scripts/agent-loop.mjs` — cross-platform Node orchestration script

`CURRENT_TASK.md` is the handoff contract. The agent must not infer a broader task from the roadmap merely because future work is documented there.

## Current task format

Each task starts with YAML-like metadata:

```md
---
task_id: 7K-5
kind: implementation
human_review_required: false
---
```

The body should state:

- goal
- allowed scope/layers
- explicit non-goals
- required reading where task-specific
- implementation requirements
- tests/checks
- done criteria

`human_review_required: true` means the implementation may be performed automatically, but the next reviewer pass must produce `HUMAN_REVIEW.md` and stop rather than issuing another implementation task.

## Reviewer decisions

The reviewer must return exactly one decision:

- `accept` — implementation is correct and no further work is needed for this task
- `correct` — implementation needs another automated Codex pass; `next_task` contains the correction task
- `advance` — implementation is accepted and `next_task` contains the next small slice
- `human_review` — automation must stop; `human_review` contains the manual acceptance checklist
- `blocked` — automation must stop because a missing decision, missing required file, unsafe scope expansion, or other blocker needs a person

The script never continues after `human_review` or `blocked`.

## Human-review rule

The reviewer must choose `human_review` rather than `advance` when any of these are true:

- the current task says `human_review_required: true`
- behaviour needs subjective human judgement rather than automated correctness only
- browser-visible movement, pacing, readability, interaction, or simulation feel needs acceptance
- a milestone or design boundary needs a human decision before proceeding
- the reviewer cannot establish correctness from repository evidence and automated checks
- the next step would require choosing between materially different design directions

The human review file should say exactly what to run, what to observe, and what outcomes count as acceptable or suspicious.

## Automatic correction rule

The reviewer may issue `correct` for concrete implementation defects that do not require a design decision. Corrections must stay within the original task's intended scope unless a human explicitly broadens it.

Examples:

- missing regression test
- determinism violation
- wrong boundary/layer
- required check not run
- implementation does not match an explicit requirement
- simple documentation/reporting omission that is part of done criteria

## Automatic advancement rule

The reviewer may issue `advance` only when the next slice is already supported by the accepted roadmap/plan and is small enough to be independently reviewed. It must not invent a new milestone, silently broaden an accepted plan, or cross a design boundary that needs human acceptance.

## Running

From the repository root:

```sh
node scripts/agent-loop.mjs
```

Useful options:

```sh
node scripts/agent-loop.mjs --max-iterations 4
node scripts/agent-loop.mjs --no-auto-advance
node scripts/agent-loop.mjs --reviewer-effort xhigh --implementer-effort medium
```

`--no-auto-advance` still allows automated correction passes, but stops after the reviewer accepts the current task rather than creating the next slice.

## Safety / cost controls

- default maximum: 6 implementation/review cycles
- reviewer is invoked without `--full-auto`; Codex therefore remains in its restricted sandbox rather than receiving automatic write permission
- implementer uses `--full-auto` because it must change files and run tests
- reviewer effort and implementer effort are separate parameters
- every run records the final implementation report and reviewer JSON in the repository
- failures to parse reviewer output stop the script rather than guessing

The script is orchestration, not evidence. Repository tests, deterministic checks, performance checks, and human behavioural review remain authoritative.
