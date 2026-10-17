---
task_id: 8H-7
milestone: 8
plan: docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md
slice: 8H
kind: correction
human_review_required: false
---

# Reconcile the gathering correction's combined recruit regression

## Goal
Resolve the demonstrated before/after regression from the unaccepted gathering
patch. The original combined recruit routes at tick 411; the candidate does not
route within 800 ticks. Preserve bounded gathering progress and the accepted
movement policy. This task cannot accept 8H.

## Allowed scope
Sim: src/sim/individualSpecialistCollision.ts. Test: individualSpecialistCollision,
individualCasualtyAssistance and milestone4VisualScenario regressions. Read the
restart brief, the plan's downed-soft contract and docs/design/unit-movement.md.
Use .agent-loop/reconciliation/gathering.patch and combined-comparison.json;
compare-combined.mjs provides the isolated paired source loader. Save new evidence
under the current cycle. Historical diagnostic documents are not startup reading.

## Non-goals
No pursuit/main fixture tuning, seed search, expectation or timeout changes,
morale/participation rewrite, new cancellation policy, global pathing, general
optimisation, 8I work or repeat of the retired exploratory probe chain.

## Required work
1. Verify the checkpoint's source hashes and check results; reuse unchanged
   evidence. Inspect the 13-line patch and the permanent gathering regressions.
2. Find the first relevant causal divergence in the paired combined scenario,
   using at most one bounded 800-tick phase audit. Distinguish a defective local
   avoidance rule from a retained scenario relying on incorrect movement.
3. If the patch violates the accepted contract, add a focused reproduction and
   make the smallest local correction. Retain useful avoidance, eight symmetry
   cases, hard-body legality, budgets, lifecycle/position preservation and normal
   pickup/release ordering. Do not silently rebaseline the combined scenario.
4. If reconciling the contracts requires a design/fixture choice, report that
   exact choice with the paired evidence and stop for review rather than doing
   another broad investigation. Independent review is required before accepting
   the candidate correction. Report older pursuit/main/timing failures separately.

## Checks
- After changes: node node_modules/vitest/vitest.mjs run tests/sim/individualSpecialistCollision.test.ts tests/sim/individualCasualtyAssistance.test.ts tests/sim/individualMovementRightOfWay.test.ts tests/sim/individualSpecialistPhysicalGaitAdapter.test.ts tests/sim/milestone4VisualScenario.test.ts --maxWorkers=1 --reporter=json
- npm run typecheck when TypeScript changes; git diff --check; validate added files.
- Rerun pursuitScenario.test.ts only when production changes; its two baseline
  routing assertions remain red and cannot be claimed fixed without evidence.
- Retain exact commands, exits, source hashes and the changed-file archive/hash.
  No full suite/build/perf during this correction. Before eventual 8H acceptance,
  rerun the complete integration gate and all its named contracts, with unchanged
  timing budgets. No advancement to 8I while required gates remain red.

## Done criteria
The narrow regression is causally resolved with passing affected checks and
independent review, or a precise evidence-backed external/design blocker is
reported. Do not equate a WIP checkpoint or local passing tests with 8H acceptance.
