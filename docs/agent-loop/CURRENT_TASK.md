---
task_id: 8H-6
milestone: 8
plan: docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md
slice: 8H
kind: integration
human_review_required: false
---

# Run the Milestone 8 system integration gate

## Goal
Prove accepted 8A–8G work and the reviewed 8H corrections coexist across production. Follow plan section 8H and docs/codex/work-slicing.md.

## Allowed scope
Integration verification, measured failure diagnosis, narrowly justified test/fixture reconciliation and concise documentation. Preserve runtime authorities and accepted contracts.

## Non-goals
No new mechanics, unrelated rebaselines, timeout increases, speculative optimisation, 8I work or milestone acceptance.

## Required work
1. Read AGENTS.md, work-slicing.md, testing.md and plan section 8H. Use retained 8H-5 evidence in .agent-loop/manual-8H-5/.
2. Run the complete integration checks below and retain actual logs, exit codes and test results.
3. Confirm full-suite coverage of physical occupancy, main battle summary/timeline, pursuit, Milestone 4 morale/routing, casualty/treatment, respawn egress, energy movement evidence, deterministic replay and reversed-order expectations. Map each contract to passing tests; run an additional focused check only if coverage is absent.
4. Investigate remaining timing failures with unchanged budgets, including the barbarian clock/egress case and retained replay margin. Record reproducible failures and measured causes. If a runtime repair, performance optimisation or missing mechanic is needed, provide evidence for a separate narrow correction; do not implement it ad hoc inside this gate.
5. Update plan status concisely. Keep 8H incomplete while any required check fails; retain detailed evidence outside the active plan.

## Checks
- npm run typecheck
- Full npm test
- npm run build
- git diff --check
- Named retained/replay/system coverage from section 8H, including the new contact/extraction regressions and unchanged 7E assertions.
- Any bounded integration fix requires its focused regression and a fresh complete integration gate. Production optimisation requires focused affected regressions and repeat 8H before acceptance.

## Done criteria
All required checks and named contracts pass within existing budgets, with retained evidence and no weakened assertions. Otherwise report exact failures and correction evidence without claiming gate completion. Do not advance to 8I until independent review accepts 8H. Package intended changed files with scripts/zip-working-changes.ps1 if files change.
