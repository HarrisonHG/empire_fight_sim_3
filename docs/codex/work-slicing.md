# Work packages and verification

A work package is a complete outcome: diagnose and fix one issue or implement
one coherent feature, add meaningful regressions, and verify it. Small reviewable
changes are useful; mandatory diagnosis-only handoffs for routine bugs are not.
An unknown cause is normally part of the implementer's work. Stop diagnosis-only
when genuinely missing information or a new consequential design choice prevents
safe repair, or when a bounded investigation was specifically requested.

Read the current task, relevant plan section and code/contracts needed for it.
Use additional doctrine on demand. Do not preload historical plans, progress,
logs or broad design context. Resume the same issue's context; completed issues
carry forward a short checkpoint rather than their entire transcript.

## Repair/feature checks

- Affected focused tests, including a regression for production bugs.
- npm run typecheck when TypeScript changes; git diff --check.
- Build when bundling/startup or worker/render/UI boundaries change.
- Focused structural/timing evidence for changed hot paths where relevant.

Do not run full suite/build/perf after every small edit. Iterate within a work
package before asking its independent reviewer to inspect it. A reviewer returns
correction only for a concrete remaining issue in that work. A completed repair
can advance to the next issue and be checkpointed while its parent gate stays red.
Do not miscount unrelated newly selected issues as failed attempts at one repair.

## Integration and milestone gates

Run representative cross-system smoke checks when changing a shared authority
or system ordering. After two or three interacting production changes, consider
an integration checkpoint; do not postpone all reconciliation to a huge final run.
At the named integration gate, run typecheck, full npm test, build, diff check and
all named retained/replay contracts not already covered. Diagnose and repair its
failures through complete issue work packages; keep the gate red until repeated
checks pass. A successful local repair is not acceptance of its parent gate.

Run the plan's representative performance/soak/replay checks at the performance
gate. Keep performance requirements explicit and measured; no timeout inflation.
If optimisation changes authority code, rerun affected regressions and repeat
integration before milestone closure. Use small fixtures for semantic tests and
representative scenarios for broad integration/performance checks.

After required automated gates pass, stop for the plan's human visual assessment.
Human findings become normal bug work with regressions and affected gate reruns.
Never advance the configured milestone without human authorisation.

## State and evidence

Independent review precedes accepted checkpoints. The runner commits reviewed
changes when ownership is clean, or preserves a reviewed snapshot without staging
mixed pre-existing work. Keep the parent gate's remaining failures explicit.
The runner owns mechanical hashes/change bundles; agents need not recheck entire
unchanged archives at each pass. Record material discoveries and outstanding
issues in the current recovery checkpoint. Raw logs are investigation-only.

Keep active plans to scope, contracts, gate requirements and concise status.
Detailed history belongs in docs/progress/ only when worth retaining. Successful
reports should normally be under 350 words, with counts rather than long logs.
