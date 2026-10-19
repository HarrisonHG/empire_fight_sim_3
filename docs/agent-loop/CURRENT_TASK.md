---
task_id: 8J
issue: 8J.human-acceptance
milestone: 8
plan: docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md
slice: 8J
kind: human
human_review_required: true
---

# Assess Milestone 8 for acceptance

Automated checks on the final source pass: 8H has 1,292 tests across 91 files,
typecheck and build; 8I has 137 performance tests across 24 files, one-hour
replay and retained inspection budget. Details are in the implementation history.

Human assessment must resolve the 8I throughput concern (73.06 ms/tick for legal
2,000-entity debug-off geometry, below real-time 20 Hz on this machine) and inspect
both `/test?scenario=personal-space` and `/`. Use HUMAN_REVIEW.md. No connected
browser was available for automated visual inspection; HTTP smoke passed.

Do not infer human acceptance or start Milestone 9. If a defect is found, open
a narrow correction with a regression and repeat any invalidated gates.
