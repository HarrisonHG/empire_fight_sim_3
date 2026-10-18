# Project instructions

This is a top-down 2D fighting-force simulation for theoretical learning.
Priorities: correctness, determinism, debuggability, performance, visual polish.

## Authority and context

Follow this file, nearest-directory AGENTS.md, relevant docs/codex doctrine,
the authorised plan, relevant design contracts, then existing patterns.
The active milestone/plan is configured in docs/agent-loop/CONFIG.json. Its plan
owns milestone acceptance; runtime state owns the current task. Do not duplicate
live status in this file. Missing old plans may be in docs/completed-plans/.

Read the current task and exact relevant plan section. Consult doctrine when
needed: work-slicing.md for check cadence, architecture.md for boundaries,
testing.md for integration tests, performance.md for profiling/soak, review.md
for review, task-planning.md for significant planning. These live in docs/codex/.
Read design files only to resolve relevant movement, combat, morale, assistance
or other inherited contracts. Do not preload the docs tree, completed plans,
progress diaries, logs or archives. On resumed work reuse context and read deltas.
Document ownership is in docs/README.md.

## Work through complete outcomes

A work package normally covers diagnosis, repair, regression and focused checks
for one issue. Iterate internally until that outcome is verified. Do not create
a separate reviewed task for every investigation step or routinely stop to ask
whether an already-authorised bug should be fixed.

Within the active milestone, fix demonstrated production bugs and invalid test
setups. Matching current code does not prove behaviour is correct. Correct illegal
placement or scenario parameters and replace obsolete exact ticks with meaningful
bounded behaviour checks where justified. Preserve the behaviour being tested;
do not delete assertions, assert a broken outcome, search seeds, inject routing
state, inflate timeouts or change rules merely to make a test pass.

Keep changes reviewable and preserve unrelated working changes. A successful
local repair can be reviewed/checkpointed while its parent integration gate stays
red. Record remaining issues and continue; local success does not accept a gate.
Do not implement future milestones or opportunistic features. Ask only for a
new consequential design choice, genuinely unavailable prerequisite, or explicit
human acceptance. Do not add production dependencies without permission.

## Architecture and simulation invariants

- src/sim/ owns pure simulation. It must not import PixiJS, DOM, canvas, browser,
  renderer or UI APIs. src/render/ displays snapshots without mutating sim state.
- src/worker/ owns simulation orchestration; the main thread sends commands and
  receives snapshots/events/metrics. src/ui/ owns controls; src/content/ is data.
- Same seed, scenario, commands and ticks must produce identical state. Use seeded
  RNG and fixed ticks. No Math.random, wall clocks, render delta or unordered
  outcome-affecting iteration in simulation rules.
- Use spatial partitioning. No normal all-entity-pairs checks, per-entity per-tick
  pathfinding, living entities as A* obstacles, or avoidable hot-loop allocation.
- Measure before optimisation; distinguish sim/render CPU, GPU, worker messages,
  GC, pathfinding, spatial queries, sprites, overlays and metrics overhead.
- Keep intent, collision, lifecycle, assistance, combat and morale authorities
  explicit. Preserve movement budgets and final actual-displacement evidence.
- Do not add global tactical knowledge, communication, detailed combat, magic or
  content-heavy Empire rules outside the exact authorised milestone.

## Verification

Every simulation rule needs headless coverage; every production bug fix needs a
regression. Observe actual body movement when testing movement, not only anchors.
Use small fixtures for individual rules; retain representative cross-system
scenarios and performance coverage. Avoid accidental exact-output contracts.

For a repair, run affected tests, typecheck when TypeScript changes, and diff
check. Build for startup/bundling/worker/render/UI boundary changes. Use focused
measurements for changed hot paths. Do not rerun the whole suite after each small
edit. Repeat full integration after related repairs and before milestone closure:
node/typecheck, npm test, npm run build, git diff --check, plus named plan contracts.
Run performance/soak and human visual gates where required by the plan. Never
claim gate success from focused tests or waive failed required checks.

The automated loop follows docs/agent-loop/WORKFLOW.md. It works through the
configured milestone and stops for human assessment before another milestone.
Interrupted work, phase, explicit CLI UUIDs and partial edits must remain
resumable. Token/cycle budgets pause with the next action saved; they do
not authorise acceptance. No-progress detection triggers strategy reassessment, not another routine human permission stop. Sandbox protections and independent review remain.

## Evidence and reporting

Keep one current task and concise recovery checkpoint. Raw logs are confined to
.agent-loop/logs/ and read only for a specific investigation. Do not append long
diaries to active plans or require agents to reread historical evidence.
The runner generates change bundles, hashes and checkpoint receipts; model
reviews focus on correctness. Do not repeatedly audit every unchanged archive.
For an explicitly requested standalone ZIP delivery, use
scripts/zip-working-changes.ps1 (or an integrity-checked equivalent).

Report the outcome, files/layers changed, checks and limitations concisely.
Explain deviations and remaining gate work; never imply unrun checks passed.
