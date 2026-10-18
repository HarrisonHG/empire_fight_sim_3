# Agent loop

Purpose: work through the configured milestone, fixing and verifying issues,
then stop for human assessment. Recovery and reliable progress take precedence
over process ceremony. CONFIG.json selects the authorised milestone and plan;
changing milestones requires the human. CURRENT_TASK.md names the current outcome.

## Normal work

Plan one complete outcome, then implement, independently review and checkpoint it.
Implementation normally includes diagnosis, repair, regression and focused checks
in one CLI turn, with internal iteration as needed. Do not manufacture a reviewed
handoff between every debugging step. Root AGENTS.md authorises ordinary bug and
fixture repairs; matching current rules alone does not establish correctness.

A reviewer returns correct for a defect still in that issue. A locally complete
repair returns advance with a new task/issue for the next independent problem,
even while its parent integration gate stays red. Record the stable remaining
failure IDs. Accept/checkpoint the repair, not the unfinished gate. No future
milestone features, weakened behaviour assertions, injected desired states or
increased timeouts to force green results.

Separate implementer/reviewer CLI UUIDs resume within an issue (task_id without
its -C suffix, or explicit issue metadata). A completed issue starts fresh role
contexts with the concise checkpoint. A fresh acceptance pass still verifies
stage boundaries/final acceptance. No shared role sessions or --last selection.
On Windows prefer_mxc retains managed sandbox policy; planning/review are read-only
and implementation is workspace-write, with approval policy never. Startup checks
real sandbox file reads before any model call. Never bypass failed confinement.

## Commands and budgets

    npm run agent-loop                 # start, or resume interrupted/paused work
    npm run agent-loop:resume          # explicit equivalent for saved work
    npm run agent-loop:restart         # fresh planning after human resolution
    npm run agent-loop:check           # CLI/auth/real sandbox reads; no model turn
    npm run agent-loop:test            # isolated fake-agent regression suite
    npm run agent-loop:usage           # current account quota; no model turn
    node scripts/agent-loop.mjs --quota-reserve-percent 5
    node scripts/agent-loop.mjs --token-budget 200000  # optional extra cap
    node scripts/agent-loop.mjs --max-iterations 20 --max-no-progress 3

Use Node directly for custom flags: Windows npm.ps1 may drop forwarded flags.
No model is forced. Efforts remain configurable. Default invocation safety cap is
50 implementation/review cycles. No manual budget is needed: before every planner,
implementer, reviewer and fresh acceptance turn, read the signed-in CLI account's
five-hour and weekly windows through account/rateLimits/read (no model turn).
Both must have more than the default 5% reserve remaining. The smaller remaining
percentage is displayed as the limiting window; percentages do not imply equal
token capacities. Refresh every turn so other account usage and resets are observed.
Use the codex bucket, or the sole bucket if no codex bucket exists; unrelated
GitHub code-review buckets do not constrain local work. Missing, stale, ambiguous
or unreadable limits pause safely with the exact next phase/CLI UUIDs retained.
Ordinary launch rechecks live limits and resumes; no restart/replanning needed.
The guard never consumes reset credits or buys credits. It pauses between turns;
a single turn can consume more than the reserve, so this is not a hard quota cap.
--quota-reserve-percent changes the reserve (0 to less than 100).
API-key users may explicitly use --no-account-quota, optionally with a token cap.

--token-budget is optional, per invocation, and
counts new uncached input plus output; cached input is tracked but not charged to
this work allowance. This is an execution allowance, not billing or account quota.
CLI totals are cumulative per UUID; only deltas count. Budgets stop between model
turns and can overshoot by one turn. Interrupted unreported usage is reconciled
when the resumed CLI reports its cumulative total. Resume grants a new allocation.

--max-no-progress (legacy alias --max-corrections) detects consecutive unchanged
failure inventories for the same issue, not all corrections in a letter. The
first observation establishes a baseline. A shrinking/changed inventory or new
issue resets it. A stall triggers a fresh strategy pass with a concise checkpoint; token/cycle budgets pause with the next action saved. Neither action should
be presented as a new human product decision. Automatic account quota pauses also
preserve the next action, independently of optional token/cycle caps.

## Recovery and ownership

State persists the phase, issue, CLI UUIDs, checkpoint and token high-water marks.
Ordinary launch resumes running/failed/paused work; human/blocked/accepted stops
require explicit resolution and restart. No implicit milestone advancement.

- Partial implementation resumes its explicit CLI session and original baseline.
- Review failures resume review without repeating successful implementation.
- Commit failures resume the reviewed transaction; hooks/signing still apply.
- A handoff journal makes task/baseline/state changes idempotent after interruption.
- Dead PID locks are recovered; live/unknown owners are never removed automatically.
- Legacy per-letter saved sessions are adopted for their interrupted issue, not lost.
- A missing saved CLI session fails visibly; no silent new-context substitution.

Do not run concurrent writers. Preserve existing user work. The runner commits
reviewed changes using a private index only when their baseline ownership is clean.
For mixed pre-existing changes it saves a reviewed snapshot and content bundle
without staging them, then continues. This is a technical checkpoint, never gate
or human acceptance. HEAD/after-review mutations and failed hooks still stop safely.

## Evidence and gates

The current task and latest state.context.checkpoint are startup evidence. The
brief contains only durable decisions. Never preload old logs/archives/diaries.
Runtime .agent-loop/runs/<session>/<cycle>/ holds reports, diffs, snapshots and
verification.json. Reviewed work gets a machine-generated changes.json bundle
(base64 before/after bytes) and SHA-256 manifest; reviewers need not manually
re-inventory unchanged archives. Standalone ZIP delivery uses the repository ZIP
helper when requested. Raw logs belong only under .agent-loop/logs/ and are for
specific investigations. Check results apply only to matching source inputs.

Run affected tests for repairs; repeat integration after related fixes. Before
milestone closure require the plan's full integration, performance/soak and replay
coverage, then stop for its human assessment with concrete routes/observations.
Focused passes and checkpoints do not accept the milestone. Human visual findings
become complete repair work packages with regressions and affected gate reruns.

Exit codes: 0 accepted explicit task/preflight; 1 execution/validation failure;
2 human assessment; 3 genuine blocker; 4 resumable account/token/cycle-budget pause.

## Task/review protocol

Tasks have front matter task_id, milestone, plan, slice, kind and
human_review_required, optionally issue; include Goal, Allowed scope, Checks and
Done criteria. Scope is a complete outcome, not a rigid sequence of forbidden steps.
Correct uses the supplied next numeric -C suffix; advance uses a new issue/task.
Reports retain concise facts, rejected hypotheses, questions, checks and evidence
paths. Reviews return decision, task_id, summary, findings, next_task,
human_review and remaining_failures. Legacy saved review outputs remain readable.
An actual blocked implementation needs correction or a genuine reviewer stop;
it cannot be accepted. Mechanical validation and independent review remain in force.
