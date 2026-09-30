---
task_id: BOOTSTRAP
kind: workflow
human_review_required: true
---

# Bootstrap the automated reviewer / implementer loop

## Goal

Validate the newly-added agent-loop workflow itself before allowing it to select or implement simulation work automatically.

## Allowed scope

- `docs/agent-loop/`
- `scripts/agent-loop.mjs`
- root `AGENTS.md` only if needed to reference the workflow

## Non-goals

- no simulation changes
- no worker/render/UI/content changes
- no milestone implementation
- no refactoring unrelated to the orchestration workflow

## Required work

Inspect the workflow files and orchestration script for internal consistency, PowerShell errors, unsafe continuation behaviour, or ambiguity that could cause scope drift. Fix workflow-only defects if found.

## Checks

- `node --check scripts/agent-loop.mjs` passes
- no production source files are changed
- the workflow stops on `human_review`, `blocked`, malformed reviewer JSON, Codex failure, or iteration limit
- reviewer and implementer efforts remain independently configurable

## Done criteria

The workflow is internally consistent and ready for a human to run its first real task.
