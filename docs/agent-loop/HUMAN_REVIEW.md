# Milestone 8 — Ready for human review, not accepted

The automated integration and performance checks pass on the final source.
Review evidence is in `docs/progress/milestone-8-implementation-history.md`.
No human acceptance is recorded. Milestone 9 remains out of scope.

## Throughput assessment

The legal debug-off 2,000-entity case averaged 73.06 ms/tick (p95 77.16 ms),
about 13.7 ticks/second on this machine. This does not demonstrate real-time
20 Hz. The plan specifies no numeric budget: assess whether this is viable for
the intended simulation use or requires measured collision optimisation before
acceptance. Collision accounts for 48.00 ms/tick; the illegal dense diagnostic
is reported separately and must not set the representative target.

## Visual acceptance

The development server is running at `http://127.0.0.1:5173/`.
If stopped, run `npm run dev -- --host 127.0.0.1` from the repository root.
Inspect both:

- `http://127.0.0.1:5173/test?scenario=personal-space` (starts paused; run through 0–2,000 ticks).
- `http://127.0.0.1:5173/` (main battle).

Check with debug panels shown and hidden:

- Hostile fronts settle without interpenetration or persistent jitter.
- Allied crossing, overtaking and courtesy yielding avoid phasing/chatter.
- Loose versus formed units have believable lateral freedom.
- Routers physically disturb allied traffic.
- Medical responders receive local passage without phasing through enemies.
- Downed people matter without permanent body walls.
- Rescue groups remain coherent; dead egressers yield to living traffic.
- The main battle remains comprehensible and stable over time.
- Footprints, occupancy, permitted/resolved vectors, blocking, detours and right-of-way explain the observed movement; the centre gait/activity pip remains visible.

HTTP checks passed, but no connected browser was available for visual or console
inspection. Automated headless tests do not replace this acceptance.

Record observations and explicit acceptance or specific defects. Defects require
a narrow correction/regression and repetition of gates they invalidate. Do not
advance to Milestone 9 without separate authorisation.
