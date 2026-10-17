# Reconciled restart — 2026-10-17

This is a starting handoff, not acceptance. Read CURRENT_TASK.md and the active
plan's 8H section next; newer tasks/checkpoints supersede this brief. Do not
enumerate historical runs, manual-C1 folders or retired diagnostic documents.

## Current code and acceptance

- 8G-1/2/3 are complete; 8H-4-R1 audit and 8H-5 fixture correction are accepted.
- 8H remains red. 8I performance/soak and 8J human acceptance have not started.
- The gathering patch in `src/sim/individualSpecialistCollision.ts` is a WIP
  candidate, **not independently accepted**. Its 13 added lines reject soft
  avoidance alternatives that fail to reduce squared distance to the patient.
- Permanent tests cover eight symmetries, replay, hard obstruction, useful
  avoidance, movement budgets, bounded queries and actual pickup/safe release.
- No exploratory pursuit fixture, changed expectation or raised timeout was adopted.

## Fresh evidence and exact next action

The six-file correction check on this source produced **101 passed, 3 failed**.
The four local specialist/casualty/right-of-way/gait files pass **99/99**;
typecheck passes. Results: `.agent-loop/reconciliation/focused-current.json`.

Two failures are the pre-existing standalone pursuit `blueRouted` assertions.
The third is a newly exposed semantic failure in
`tests/sim/milestone4VisualScenario.test.ts`: `recruitRouted` at line 115.
A paired run of the same combined input, changing only the collision source,
confirms the pre-patch recruit routes at tick 411; the candidate never routes
within 800 ticks. Both retain non-routing pursuit units. This is **not** a
timeout-only issue. Do not tune pursuit while this regression is unresolved.

Next task **8H-7**: reconcile that combined recruit regression with the accepted
soft-avoidance policy. Inspect the current patch and the two permanent test files.
Use only `.agent-loop/reconciliation/combined-comparison.json` and
`compare-combined.mjs` for the before/after reproduction. At most one bounded
phase audit of this pair is needed before a concrete correction/decision. Do not
restart broad stimulus searches or relax the test without causal evidence.

Historical pursuit findings, when needed later: baseline stress peaks 118/106
are below the routing threshold 120; confidence/cohesion/armour probes did not
satisfy the combined pursuit/recovery contracts. Reservations in the saved probe
were real gathering assignments, not stale release state. Fixing one local cycle
has not established that all gathering reservations can complete.

## Evidence retention and workflow

- `.agent-loop/reconciliation/checkpoint.json`: code hashes, check results and
  exact starting task; verify hashes before reusing check evidence.
- `gathering.patch` in that directory: complete candidate production/test diff.
- `before-source.json` and `before-state.json`: pre-reconciliation recovery images.
- `retired-manifest.json`: original paths and hashes for 21 exploratory script,
  harness and documentation files, moved to `retired-source/`. Restore only a
  specifically needed file to its original path for a historical reproduction.
- Original `.agent-loop/runs/` and `manual-*` evidence remains untouched. It is
  historical, not startup reading. Prior handoffs are under `legacy-handoff/`.

The local reconciliation commit is an **unaccepted checkpoint**, so subsequent
fixes have a clean baseline. The prepared runner starts fresh planning with this
brief, not the old failed cycle or an oversized CLI conversation. Run
`npm run agent-loop:resume`. No model turn was launched during reconciliation.

After 8H-7: reconcile the older pursuit/main/timing failures in bounded corrections,
then repeat the complete 8H gate. No 8H/8I advancement while required gates are red.
