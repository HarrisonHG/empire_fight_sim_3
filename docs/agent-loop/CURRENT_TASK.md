---
task_id: 8I-1
issue: 8I.performance-soak
milestone: 8
plan: docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md
slice: 8I
kind: performance
human_review_required: false
---

# Complete the performance and deterministic soak gate

## Goal
Verify the complete 8I performance and deterministic soak requirements after fresh acceptance of the 8H transition.

## Allowed scope
Read the current checkpoint, exact 8I plan section and performance doctrine. Preserve reviewed repairs and unrelated WIP. Run the required measurements, diagnose demonstrated failures, repair production bugs or invalid fixtures, add meaningful regressions and verify the outcome within milestone 8 authority. Optimise only measured bottlenecks. Preserve deterministic simulation, authority boundaries, legal placement, behavioural assertions and existing budgets. Do not add gameplay features or production dependencies, search seeds, inject desired states or increase timeouts. Report deliberately illegal dense diagnostics separately from representative acceptance measurements.

## Checks
- Full npm run perf, with complete results and exact worker settings; avoid overlapping expensive jobs.
- Representative legal 2,000-entity Milestone 8 measurement with debug disabled.
- One-hour deterministic collision soak/replay, recording duration, ticks, inputs and replay equality evidence.
- Collision-stage timings and local query/candidate/pass counts.
- Retained typed-storage evidence and allocation/GC evidence where practical.
- Preserve and run the full-scene 400-tick/10-second inspected-record construction requirement in tests/performance/inspectedSnapshotConstruction.test.ts.
- Run the deliberately illegal dense diagnostic fixture and report it separately.
- For repairs, run affected regressions, typecheck for TypeScript changes and git diff --check. If production simulation code changes, repeat the complete 8H integration gate before acceptance.

## Done criteria
All named 8I requirements pass on the proposed source without relaxed assertions or budgets. Save concise commands, outcomes, measurements and any practical instrumentation limitations. Return for independent review and fresh boundary acceptance before selecting 8J. Record distinct unresolved failures with stable IDs; do not claim milestone completion or human acceptance.
