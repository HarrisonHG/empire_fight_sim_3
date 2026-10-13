# Automated Reviewer / Implementer Loop

This loop executes one already-authorised milestone with fresh Codex contexts:
read-only planning → one narrow implementation → independent broader review →
correction or accepted-slice commit → next slice → named integration/performance
gates → human assessment.
It never authorises the next milestone or substitutes for human acceptance.

Run from the repository root:

```powershell
npm run agent-loop
```

Configuration is `docs/agent-loop/CONFIG.json`: the exact accepted plan and
milestone. Currently this is Milestone 8. Its plan explicitly requires review
of the outstanding 8H-4 audit before correction/8I. If that evidence is absent,
the first planning pass stops with a precise blocker. Supply the actual report
and resolve the plan's handoff before restarting; do not infer its conclusion.
Preparing this runner does not accept the audit or Milestone 8.

The installed Codex CLI and its configured model/authentication are used. No
model is forced. `codex login` is required if not already signed in. Node and
Git must be on PATH. `CODEX_BIN` may name an alternative CLI executable/shim.
The runner handles Windows executable, PowerShell and npm command shims without
interpolating prompts into shell commands. Prompts travel through stdin.
Each role uses a fresh `codex exec`; no conversation is carried across slices.
Reviewer/planner use explicit read-only sandbox; implementer workspace-write.
Approval policy is never: denied operations become blockers, with no sandbox
bypass. Managed policy still applies. The unsupported --full-auto flag is absent.
CLI output is schema constrained and captured with --output-last-message.
See [OpenAI's repair-loop example](https://developers.openai.com/cookbook/examples/codex/build_iterative_repair_loops_with_codex).

## Commands and recovery

```powershell
npm run agent-loop:check                  # CLI/auth/files/Git preflight; no model call
npm run agent-loop:test                   # isolated fake-agent regression tests
npm run agent-loop:usage                  # read current account limits; no model call
npm run agent-loop -- --max-iterations 4  # limit implementation/review cycles
npm run agent-loop -- --no-auto-advance   # correct then stop at slice acceptance
npm run agent-loop -- --resume            # interrupted/failed/budget-limited run
npm run agent-loop -- --restart           # explicit fresh planning after human resolution
```

Default budget: 12 cycles per invocation, maximum 50. Planning is separate.
Efforts remain independently configurable with --reviewer-effort (default high)
and --implementer-effort (default medium). A budget stop preserves the pending
task. A review failure resumes at review, without rerunning successful implementation.
Commit failures resume at the accepted commit transaction without rerunning the
implementer or reviewer. An interrupted post-commit handoff recognises the saved
commit tree/parent/message and does not create a duplicate commit.
An interrupted implementation may have partial edits: resume retries that same
slice against its saved original baseline. No automatic retries or rollback.
A restart replans from current evidence; it does not erase edits/history or waive
plan prerequisites. Human/blocked/accepted stops refuse ordinary runs and resume.
Do not restart past an unresolved human decision. After final human acceptance,
changing configuration to another accepted plan is an explicit human action.

Exit codes: 0 accepted current slice/preflight, 1 CLI/validation/error,
2 human review, 3 blocked, 4 iteration budget. Nonzero human/budget exits are
intentional stops. `.agent-loop/lock` prevents concurrent runners. After a hard
kill, verify its recorded PID is no longer running before deleting that lock.
Do not edit the repository concurrently with a loop.

## Files and evidence

- CONFIG.json: authorised milestone/plan; never rewritten by an agent.
- CURRENT_TASK.md: runner-selected exact task, never selected by implementer.
- LAST_REPORT.md / LAST_REVIEW.json: latest concise handoff, not design authority.
- HUMAN_REVIEW.md: stop reason/checklist; never silently removed on startup.
- planner/implementer/reviewer-prompt.md: stable role contracts.
- `.agent-loop/state.json`: persisted phase, stop and task hash.
- `.agent-loop/runs/<run>/<cycle>/`: prompts, schema, raw outputs, role logs,
  report/review, baseline, changed-file list, cumulative slice diff and commit
  request/receipt (including commit hash).

Snapshots capture tracked and non-ignored untracked files, including pre-existing
WIP. Review diffs compare to the start of this slice, not all changes since HEAD.
Corrections retain that baseline. Accepted slices establish the next baseline.
The reviewer's `accept` or `advance` decision authorises one local commit before
stopping/advancing. The reviewer stays read-only; the runner executes that decision
using a private Git index, normal commit hooks and signing settings. The commit
message names the accepted task; the receipt records its hash and paths. Corrections
are included in the same commit as their original slice. `correct`, `blocked`,
`human_review`, planning passes and empty source/plan diffs produce no commit.
No pushing occurs. Human acceptance remains separate from a technical checkpoint.

Only reviewed source/plan changes enter the commit. Generated CURRENT_TASK,
LAST_REPORT, LAST_REVIEW and HUMAN_REVIEW handoffs remain uncommitted; runtime
evidence is Git-ignored. Unrelated staged/unstaged work is preserved. After commit,
the runner refreshes only accepted paths in the real index to match their commit;
working files are preserved. If a touched path already contained uncommitted or
untracked user work at slice start, or repository/HEAD evidence changes after
review, the runner refuses to commit and does not advance. Checkpoint/reconcile
that mixed work separately, then explicitly restart/replan. No automatic hunk
surgery, user-work staging, stash, reset of working files or rollback occurs.
Keep runtime evidence until human assessment. Normal source/plan changes remain
reviewable. Git author identity must be configured for accepted commits.

After each implementation/review cycle (including correction requests and stops),
the runner prints remaining percentages and reset times for each returned quota
window. Accepted slices are queried after their commit. Implementation blockers
also get a usage dump; planning-only stops do not. JSON is saved per cycle as
`usage.json` and as `.agent-loop/usage-latest.json`. Reset times in the terminal
use Europe/London; saved timestamps are Unix seconds and the query time is UTC.
These are current account-wide limits shared with other chats, not a per-slice
token budget or a forecast of how many slices remain. Missing limits are unknown,
not zero. Queries are bounded to ten seconds; failures print/store unavailable
and do not invalidate acceptance or prevent advancement.

The helper uses the CLI's app-server stdio handshake and read-only
`account/rateLimits/read` endpoint. It starts no model thread/turn, consumes no
reset credits and changes no account settings. Only quota data is retained;
account identifiers and startup diagnostics are excluded. API-key-only or other
accounts that do not expose these ChatGPT windows report unavailable.
See the [official account-limit protocol](https://learn.chatgpt.com/docs/app-server).
Reviewers inspect nearby callers/contracts for broader correctness without
preloading every historical document. Required check logs must be retained.
The runner validates decisions, task ids and scope; semantic plan compliance and
check completeness still depend on the independent reviewer. It cannot prove
that an agent's reported test result is truthful by parsing Markdown alone.

## Task contract

```markdown
---
task_id: 8H-5
milestone: 8
plan: docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md
slice: 8H
kind: integration
human_review_required: false
---

# Exact task title

## Goal
One bounded deliverable; exact plan section/reference.

## Allowed scope
Named layers/files and invariants.

## Non-goals
Explicit deferrals and later slices.

## Required work
Small ordered checklist, including needed evidence.

## Checks
Exact focused checks or complete named gate commands; save verbose logs.

## Done criteria
Evidence and concise status/report requirements.
```

Kinds: implementation, correction, integration, performance, human. Splitting
may narrow an accepted parent slice; it must preserve scope, order and named
gates. Missing required files/design decisions block rather than invite guessing.
A human task is presented without launching an implementer. A human flag on an
automated task permits concrete corrections, then mandates human_review.

Review decisions: correct (same slice and current task id plus -C1), advance
(new task in the same authorised milestone), accept (current slice only when
advancement disabled), human_review (checklist), blocked (precise prerequisite).
All JSON fields are required; unused next_task/human_review fields are null.
Planning returns task_id PLANNING and advance/blocked/human_review only.
Malformed/stale output, mutation by read-only roles, changed task contracts,
CLI failure or scope mismatch stop immediately. Stop decisions are persisted.
Human assessment belongs after the plan's automated gates; genuine unresolved
design choices may require an earlier stop. No feature work inside system gates;
open narrow corrections with regressions and repeat invalidated gates.
