Task **8H-6: blocked**. The integration gate remains incomplete.

- **Files/layers changed:** docs only—`docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md`. Logs, coverage mapping and diagnostic harnesses retained under `.agent-loop/manual-8H-6/`. Pre-existing changes preserved.
- **Implementation:** recorded 8H-5 acceptance and this gate’s failures. No runtime, fixture, assertion or timeout changes.
- **Checks:** typecheck, build and final diff-check passed. Full `npm test`: **1,234 passed, 18 failed**—15 timeouts and three routing assertions. Contact/extraction regressions and unchanged 7E assertions passed.
- **Isolation:** rerunning all 11 failing files with one worker produced **76 passed, four failed**. Both pursuit routing assertions and main battle `routing: false` reproduced. Barbarian clock/egress took **12.86s against 10s**. Retained replay passed at **175.56s against 180s**, leaving 4.44s margin.
- **Performance evidence:** profiled clock workload spent 13.45s of 13.53s in simulation advancement. Inspection projection accounted for approximately 54% of CPU samples; GC accounted for 22%. No optimisation implemented.
- **Scope deviations:** none. Detailed failures and named-contract coverage are in [verification-summary.md](.agent-loop/manual-8H-6/verification-summary.md).
- **Remaining risks:** reproducible routing failures, clock timeout and replay budget sensitivity prevent gate acceptance. Causality of routing failures remains unresolved.
- **Self-review:** reviewed against repository doctrine; only authorised documentation changed, boundaries and deterministic authorities preserved, all required commands run, no weakened assertions or unrelated repairs.
- **Human behavioural/visual review:** not required for this evidence-only gate; milestone visual acceptance remains outstanding.

Archive created with `scripts/zip-working-changes.ps1`, containing only the intended plan file; entry hash verified. Path: `.agent-loop/manual-8H-6/changes.zip`. SHA256: `591A6B0FABA57C668349EF47A14E5A3C21F9C15EA1C9AF3A553B5CF86FE2E554`.
