# Planning

Plan outcomes, not a procession of agent ceremonies. One issue normally includes
diagnosis, repair, regression and focused verification. A task should give the
implementer authority to complete that outcome and handle the defects it exposes
within the same scope. Diagnosis-only tasks are exceptions for explicit research
or genuine missing decisions, not the default before a bug fix.

Inspect relevant code and the authorised plan before planning. Keep one milestone
scope with goal, non-goals, authority invariants, coherent work packages, required
checks, integration/performance gates and human assessment. Consult design only
for relevant inherited contracts. No mandatory historical reading or copied plans.
Root AGENTS.md and docs/codex/work-slicing.md own working/check cadence.

When a gate fails, track a short inventory of distinct remaining issues. Assign a
complete repair for the highest-impact issue, checkpoint it after local review,
then move on even while the parent gate remains red. Repeat the gate after related
repairs. New independent issues are not additional attempts at the previous fix.

Tasks name the outcome, relevant files/authority boundaries, meaningful behaviour
assertions and focused checks. They do not prescribe every debugging command or
arbitrary file prohibitions that make a safe repair impossible. Give permission
for justified fixture changes while preserving named behaviour and time budgets.

Active plans live in docs/plans/, completed plans in docs/completed-plans/ and
worthwhile detailed history in docs/progress/. Keep status concise and current;
use the current task/checkpoint for execution state. End automated milestone work
at its human assessment gate. Selecting another milestone needs human instruction.
