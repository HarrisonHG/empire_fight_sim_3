# Automated Reviewer / Implementer Loop

This loop executes one already-authorised milestone with separate Codex role sessions:
read-only planning → one narrow implementation → independent broader review →
correction or accepted-slice commit → next slice → named integration/performance
gates → human assessment.
It never authorises the next milestone or substitutes for human acceptance.

Run from the repository root:

```powershell
npm run agent-loop
```

Configuration is `docs/agent-loop/CONFIG.json`: the exact accepted plan and
milestone. Currently this is Milestone 8. Start from RESTART_BRIEF.md when present,
then the current task/plan and newer checkpoints. Accepted audits stay accepted;
missing genuinely required evidence blocks. The brief and runtime history do not
authorise milestone acceptance or advancement past failed gates.

The installed Codex CLI and its configured model/authentication are used. No
model is forced. `codex login` is required if not already signed in. Node and
Git must be on PATH. `CODEX_BIN` may name an alternative CLI executable/shim.
The runner handles Windows executable, PowerShell and npm command shims without
interpolating prompts into shell commands. Prompts travel through stdin.
The implementer and reviewer each retain their own conversation within a letter
(for example 8H, including 8H-5, 8H-6 and their corrections). The runner saves
explicit session UUIDs from `--json` thread.started events and calls
`codex exec ... resume <UUID> -` for follow-up work; it never uses `--last` or
shares the implementer's session with a reviewer. Sandbox/approval/schema/effort
options are reapplied on every invocation. Planning is a separate fresh session.
The context boundary is the letter prefix of task.slice (8G-1 maps to 8G);
non-letter slice names use the exact slice. A new letter starts new role sessions,
carrying only the concise checkpoint. Explicit restart also starts fresh contexts.
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
npm run agent-loop:resume                 # interrupted/failed/budget-limited run
npm run agent-loop:restart                # explicit fresh planning after human resolution
node scripts/agent-loop.mjs --max-iterations 4 # limit implementation/review cycles
node scripts/agent-loop.mjs --max-corrections 4 # per-letter correction requests
node scripts/agent-loop.mjs --no-auto-advance  # correct then stop at slice acceptance
```

Use the dedicated npm commands for recovery. The installed Windows PowerShell
`npm.ps1` wrapper can drop flags passed through `npm run ... -- ...`. For custom
options, call Node directly as shown above. Restart/resume flags are embedded in
the dedicated package scripts and do not depend on argument forwarding.

Default budget: 12 cycles per invocation, maximum 50. Planning is separate.
After six correction requests within a letter, the default correction limit
stops for human review with the proposed next task retained in review.json.
The counter survives resume/invocation budgets and resets at a new letter or
explicit restart after human assessment. --max-corrections accepts 1–50.
This is a correction-count guard, not a token or account-quota budget.
Efforts remain independently configurable with --reviewer-effort (default high)
and --implementer-effort (default medium). A budget stop preserves the pending
task. A review failure resumes at review, without rerunning successful implementation.
Commit failures resume at the accepted commit transaction without rerunning the
implementer or reviewer. An interrupted post-commit handoff recognises the saved
commit tree/parent/message and does not create a duplicate commit.
An interrupted implementation may have partial edits: resume retries that same
slice against its saved original baseline, using its recorded CLI session.
Failed/interrupted CLI turns retain their session id even without a final report.
Invocation metadata and preserved attempt logs recover the id after a hard kill.
Older in-flight runs can recover the current role's UUID from its existing CLI
log; roles without a recorded id start fresh. No historic sessions are guessed.
A missing/unavailable saved CLI session fails visibly; there is no silent fresh
fallback. After assessment, explicit restart replans with the checkpoint/evidence
available on disk. No automatic retries or rollback.
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
- RESTART_BRIEF.md: concise user-authorised reconciliation handoff; read once on
  fresh contexts. Current tasks/plans and newer checkpoints take precedence.
- LAST_REPORT.md / LAST_REVIEW.json: latest concise role outputs, not design
  authority. Absent after a manual reconciliation until a new role completes.
- HUMAN_REVIEW.md: stop reason/checklist; never silently removed on startup.
- planner/implementer/reviewer-prompt.md: stable role contracts.
- `.agent-loop/state.json`: persisted phase, stop and task hash.
- `state.context`: current letter, independent role UUIDs, correction count,
  latest checkpoint and last reviewed snapshot paths.
- `.agent-loop/runs/<run>/<cycle>/`: prompts, schema, raw outputs, role logs,
  report/review, baseline, changed-file list, cumulative slice diff and commit
  request/receipt (including commit hash).

Each cycle also retains checkpoint.json: concise facts, rejected hypotheses,
open questions, checks and evidence paths supplied by the implementer, plus
review findings, HEAD and a source snapshot hash. These are recovery notes, not
design authority or proof that checks remain valid after edits. The runner writes
the checkpoint; agents must not create a competing project-status document.
Resumed roles read the current task/new evidence and revisit changed/relevant
contracts, rather than reconstructing all earlier investigations. Raw traces stay
in files. Reviewers receive delta.diff since their previous review alongside the
complete slice.diff. Whole-slice acceptance still requires the cumulative evidence.

Before advancing to another letter, or returning accept for an explicit slice
stop, a fresh read-only acceptance reviewer must independently confirm the exact
proposed transition. It may instead request correction or stop for human review/a
blocker. candidate-review.json and acceptance-review.json retain both decisions.
The acceptance phase is persisted: resume retries that review without rerunning
implementation or the ongoing reviewer. It may resume its own interrupted session,
but never an ongoing review/implementation session. Source changes while acceptance
is interrupted refuse acceptance and require restart/replanning. Technical acceptance
and human acceptance remain separate. This extra pass is reserved for these
boundaries; it is not run for every correction or same-letter advancement.

Each CLI retry preserves the previous role log and writes an attempt log plus
role-invocation.json identifying the selected UUID. --json logs contain CLI events;
the final structured result is still read only from --output-last-message.

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

A user-authorised manual reconciliation may create an explicitly unaccepted WIP
checkpoint, archive obsolete handoffs/probes and prepare a fresh planning state.
This preserves failed checks and never substitutes for independent review or a
gate. Old state/source images and path/hash manifests must be retained. The next
runner baseline starts at that checkpoint; never reuse its superseded cumulative
diff or silently label the checkpoint as an accepted slice.

After each implementation/review cycle (including correction requests and stops),
the runner prints remaining percentages and reset times for each returned quota
window. Accepted slices are queried after their commit. Blocked implementation
reports pass through review and get a usage dump after that decision;
planning-only stops do not. JSON is saved per cycle as
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

Review decisions: correct (same slice, numbered correction of the base task), advance
(new task in the same authorised milestone), accept (current slice only when
advancement disabled), human_review (checklist), blocked (precise prerequisite).
All JSON fields are required; unused next_task/human_review fields are null.
Planning returns task_id PLANNING and advance/blocked/human_review only.
An implementer `blocked` report always passes to the independent reviewer.
Failed tests can lead to a narrow correction/diagnosis task within the same
authorised slice. Only reviewer `blocked`/`human_review` decisions stop for
external prerequisites or human decisions; blocked implementations cannot be
accepted or advanced. Failed gates must be repeated after corrections.

Correction ids use one increasing suffix: 8H-6 → 8H-6-C1 → 8H-6-C2 →
8H-6-C3. The runner supplies and validates the exact next id. Existing task ids
and evidence folders are preserved. When resuming a legacy repeated suffix chain,
the next task flattens its correction numbers: 8H-6-C1-C1 → 8H-6-C3.

Malformed/stale output, mutation by read-only roles, changed task contracts,
CLI failure or scope mismatch stop immediately. Stop decisions are persisted.
Human assessment belongs after the plan's automated gates; genuine unresolved
design choices may require an earlier stop. No feature work inside system gates;
open narrow corrections with regressions and repeat invalidated gates.
