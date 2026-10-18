# Review

Review actual code, relevant contracts and check evidence. Focus on substantive
correctness, determinism, authority boundaries, safety and missing regressions.
Give actionable findings with a location, concrete failure and required outcome.
Do not reject a correct local repair because a different issue or parent gate is
still red. Checkpoint the completed repair and select the next issue; milestone
acceptance remains a separate decision requiring all named gates.

The implementer should diagnose, fix and verify internally before review. Return
correction for defects in that work, not for a routinely forbidden repair step.
Diagnosis matching existing code does not establish correctness. A new genuine
product choice or unavailable prerequisite can block; routine fixture repairs and
obsolete exact timings are already authorised under root AGENTS.md.

Check simulation purity, seeded/fixed-tick determinism, stable ordering, spatial
queries, movement budgets, actual body movement and relevant lifecycle/assistance
ownership. For hot paths inspect allocation/query growth and focused measurements.
Read nearby callers/contracts as needed; do not preload every historical document.

For local work require affected tests, a production-bug regression, typecheck
when TypeScript changes and diff check. Build when relevant boundaries change.
Require full suite/build/named contracts at integration, representative benchmarks
and soak at performance, and human inspection at the human gate. Do not repeatedly
run unchanged successful checks or silently relax expectations/timeouts.

The runner produces hashes, diffs, change bundles and checkpoint receipts.
Inspect those when needed to establish evidence freshness; do not spend each
review redoing mechanical archive inventories or full-repository hash audits.
Use concise counts and failure diagnostics. Do not mistake a checkpoint or
focused passes for milestone acceptance.
