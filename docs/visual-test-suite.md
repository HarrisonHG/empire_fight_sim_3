# Persistent Visual Test Suite

## Purpose

The visual test suite retains deterministic human-inspection scenarios for
accepted milestones. It exists to reveal visible behavioural regressions that
can be difficult to understand from state assertions alone.

Automated headless tests remain authoritative for correctness, determinism,
membership, and exact simulation rules. Human inspection supplements those
tests by checking battlefield readability, spatial coherence, transitions,
and whether accepted behaviour still looks recognisable.

These scenarios are regression assets. They must not silently drift to
showcase the latest feature. Change an accepted scenario only with an explicit
regression-harness or milestone correction task, and preserve its automated
coverage.

## Routes

Run `npm run dev`, then open:

| URL | Status | Useful ticks | Expected observations |
| --- | --- | ---: | --- |
| `/` | Evolving trunk application | N/A | Current main application, separate from retained visual tests. |
| `/test` | Visual test menu | N/A | Lists every registered visual test and starts no worker or renderer. |
| `/test?scenario=movement-behaviour` | Milestone 2 accepted | 0-120 | Formed march, ordered halt, formed detour, loose flow, halt-and-wait, disruptive push-through, and veteran stability versus recruit instability under equal pressure. |
| `/test?scenario=combat-foundation` | Milestone 3 accepted | 0-420 | Both fronts advance and engage at reach without interpenetrating; combat counters, pressure, and morale update; membership remains unchanged. |
| `/test?scenario=morale-inspection` | Milestone 4 accepted 2026-07-12 | 0-800 | Recruit breaks first, regular degrades faster than veteran, pass-through disrupts the reserve, routers flee before recovery, recovering units halt and reform, and the veteran pursuit subject returns to steady before the regular. |
| `/test?scenario=individual-combat` | Milestone 5 accepted 2026-07-15 | 0-80 | Seven isolated landscape-grid chambers show frontal parry, held shield block, two-on-one guard overwhelm, polearm reach, armour/global-hit totals, one-second same-pair gate rejection, and independent attackers zeroing a target without removal. |
| `/test?scenario=defence-overwhelm` | Milestone 5 accepted 2026-07-15 | 0-220 | Six isolated chambers show offensive openings, regular/recruit/veteran readiness recovery under different attack cadences, cumulative overwhelm, and rare rear desperate defence. |
| `/test?scenario=casualty-lifecycle` | Milestone 6 awaiting human visual acceptance | 0-2650 | Ten isolated chambers show zero-hit lifecycle, death counts, rescue and dragging, medical treatment, trauma withdrawal, execution/comfort, respawn staging, and limb treatment. |

Unknown scenario IDs show a clear error followed by the full menu. Scenario
pages include a **Back to visual test menu** link and start paused at tick 0;
use Resume or Step after reading the expected observations.

Scenario pages include a **Hide debug panels** control in the simulation
controls. It hides the metrics panel and visual-test scenario-information panel
without resizing the canvas, pausing, resetting, or changing simulation state.
The button remains visible, changes to **Show debug panels**, and restores both
panels with retained inspection history intact.

Individual-combat visual-test pages also include a **Hide reach overlays** /
**Show reach overlays** control. This is renderer/UI state only: it hides or
shows the faint weapon reach cones and preferred-distance markers without
changing the simulation, worker state, snapshots, or retained inspection
history.

They also include a **Hide combat events** / **Show combat events** control.
This toggles transient world-space combat indicators only. Event retention is
renderer/UI state, lasts about 10 simulation ticks, clears on reset/replay
restart/scenario change, and never returns to the simulation.

## Registry ownership

The stable registry is `src/content/visualTestRegistry.ts`. Each entry owns:

- stable scenario ID;
- title and milestone;
- short purpose;
- expected observations;
- recommended tick range;
- deterministic `SimulationScenario`.

The `/test` menu is generated directly from this registry. Browser routing is
kept in the small main-thread route-selection module; content files do not use
DOM or browser APIs, and simulation rules do not depend on routes.

## Adding a future visual test

1. Add or reuse deterministic scenario content under `src/content/`.
2. Add headless determinism and behavioural coverage for any new scenario.
3. Add exactly one stable registry entry with expectations and a tick range.
4. Confirm the menu link is generated from the registry; do not add a route
   switch case.
5. Run typecheck, tests, performance checks, build, and a browser inspection.
6. Record acceptance status and date without retuning earlier regression
   scenarios to demonstrate newer mechanics.

Screenshot automation is intentionally deferred. The current suite is a
manual human-inspection surface backed by deterministic headless tests.

## Individual Combat Regression Chambers

`/test?scenario=individual-combat` starts paused at tick 0. It contains seven
labelled chambers in a landscape-friendly grid within a 1200 by 580 world:

| Chamber | Centre | Entities |
| ---: | --- | --- |
| 1 | (150, 140) | 0, 1 |
| 2 | (450, 140) | 2, 3 |
| 3 | (750, 140) | 4, 5, 6 |
| 4 | (1050, 140) | 7, 8, 9, 10 |
| 5 | (150, 440) | 11, 12, 13, 14 |
| 6 | (450, 440) | 15, 16 |
| 7 | (750, 440) | 17, 18, 19 |

Chamber centres are separated by at least 300 units. Automated coverage checks
that all cross-chamber entity distances remain greater than the 192-unit local
interaction range throughout the useful inspection window.

Legend:

```text
Top row: 1 Parry · 2 Shield · 3 Guard overwhelm · 4 Reach
Bottom row: 5 Armour · 6 Gate · 7 Independent attackers
```

The native **Reset scenario** button recreates the selected registered fixture
with the same seed and configuration, returns to tick 0 paused, and clears
retained inspection/event presentation without navigating or refreshing.

### Individual Combat Debug Glyphs

The individual-combat route renders deterministic debug combat glyphs for the
explicitly inspected fighters only. These symbols are not final equipment
sprites and do not add a second combat authority; they are derived from the
authoritative individual-combat profile, action, defence, and threat-distance
state already present in the simulation snapshot.

Visual grammar:

- facing: a bright triangular nose anchored at the entity centre and aligned to
  the authoritative eight-direction facing octant;
- weapon: a simple vector in the facing direction; unarmed has no weapon line,
  dagger is very short, one-handed is short, great weapon is medium with a
  broad terminal marker, polearm is long and pointed, pike is longest and
  narrow-pointed, thrown has a small projectile marker, ranged has a compact
  bow-like arc, rod has a circular terminal marker, and staff is double-ended;
- reach: a faint forward cone uses world-space authoritative threat distance
  and attack arc; a dashed inner marker shows preferred minimum distance when
  that value is greater than zero;
- shield: held bucklers show a narrow frontal arc and held full shields show a
  wider frontal arc. Slung or absent shields draw no active shield coverage;
- armour: diagnostic body rings distinguish none, light, medium, heavy, and
  mageArmour. These rings do not imply passive damage mitigation or health.

Milestone 5 was accepted using the facing,
weapon, reach, shield, and armour glyphs together with the metrics/individual
inspection table. Exact equipment artwork, richer sprites, handedness
presentation, animation, and bow/crossbow appearance remain later
renderer/content work.

### Individual Combat Event Indicators

The individual-combat route derives compact current-tick visual events from the
accepted individual pipeline for explicitly inspected entities only. Normal
scenarios without inspected fighters emit no per-entity combat event records.

Event grammar:

- attackAttempt: fast line from attacker to target;
- parry, bucklerBlock, shieldBlock: one shared green crossed-line successful
  defence marker at the defender/front contact point; inspection and event-log
  text retain the exact defence source;
- failedDefence: hollow crossed marker for an in-arc attempted defence whose
  deterministic roll failed;
- landed: solid impact burst on the target;
- gateAccepted: small filled confirmation pulse;
- gateRejected: hollow/broken ring for contact without relationship-gated
  damage;
- hitApplied: compact `-1` hit-loss marker;
- zeroHit: stronger down-state pulse.

`failedDefence`, `landed`, and `hitApplied` are intentionally distinct. A
failed defence can still produce a landed outcome, and a landed outcome can be
gate-rejected and therefore show no hit-loss marker. The metrics panel also
keeps a small bounded UI-only rolling event list with tick, attacker, target,
and event kind. During human inspection, if anything remains ambiguous it is
most likely the brief overlap between a `failedDefence` marker, a `landed`
burst, and a nearby `gateAccepted` pulse in the same tick; pause/step mode and
the event list are the intended disambiguation tools.

| Area | Label | Useful ticks | Expected observation |
| --- | --- | ---: | --- |
| 1 | First frontal defence | 0-30 | A polearm attacker commits from reach; the ready weapon defender parries at tick 5 and first fails weapon defence at tick 25. |
| 2 | Held shield defence | 0-50 | A polearm attacker commits into a ready full-shield defender; initial shield blocks apply less target pressure than weapon parries, and the first shield failure is at tick 45. |
| 3 | Two attackers overwhelm guard | 0-8 | Two polearm attackers resolve against one ready weapon defender in the same tick; canonical order can show one successful defence and a later lower-readiness failed defence/landed outcome. |
| 4 | Weapon reach | 0-8 | The labelled polearm and one-handed pairs show that one-handed must close farther while polearm can select and commit from greater range. |
| 5 | Armour and global hits | 0-8 | The separated `Unarmoured target` and `Heavy-armoured target` pairs are both actively attacked; heavy armour starts with more maximum hits, and each accepted strike removes exactly one hit without cross-targeting or shared proximity pressure. |
| 6 | One-second relationship gate | 0-70 | One attacker lands faster than once per second against the same heavy target; accepted same-pair hits are at least 20 simulation ticks apart and intervening landed outcomes are gate-rejected. |
| 7 | Independent attackers | 0-8 | Two attackers independently land accepted hits on the same undefended target; the target reaches zero hits, remains present and standing, and becomes combat-ineligible on the next tick. |

The individual inspection table is shown only for scenarios with explicit
`inspectedEntityIds`. It displays compact current authoritative state and a
UI-only retained latest event per inspected entity. That retained event history
is not simulation state and clears on scenario load/replay reset. Retained event
tick labels use the combat-record tick, so records visible in a post-advance
position snapshot at tick 6 are labelled `t5`. Retained events include non-zero
incoming evidence, such as `in:P1/B0/S0/L1`, so the two-on-one chamber preserves
both the parry and landed incoming counts after current-tick fields clear.
Defence readiness is displayed as a bounded percentage: it controls how far
the current defence probability has recovered toward its maximum. The pressure
inspection record exposes the selected outcome contribution for the current
incoming attack (weapon parry 9, buckler block 6, shield block 3, otherwise
12), separately from the accepted-hit `+8` and attacker-frustration `+1`.
Unit morale uses explicit terminology: `Route risk` routes at 40 and must fall
below the recovery threshold of 20; `Recovery progress` shows its current value
against the required 240. These labels do not change either mechanic.

## Guard Readiness and Overwhelm Regression

`/test?scenario=defence-overwhelm` starts paused at tick 0 and retains six
isolated production-combat chambers: immediate counterattack, regular and
recruit shield cadence, regular and veteran two-attacker flurries, and rear
desperate defence. The route displays stored/effective readiness, per-tick
experience recovery, spend, equipment tier, chance, keyed roll, result, and
rear/offensive-suppression status.

The visual route uses real weapon commitment/recovery timing. Exact controlled
cadence acceptance remains headless: regular at 20 ticks stays at 100%; recruit
at 20 ticks and regular at 10 ticks trace 100%, 90%, 80%, 70%, 60%, 50%, 40%,
30%, 20%, 10%, with the tenth spend reaching stored zero; veteran at 10 ticks
traces 100%, 95%, 90%, 85%, 80%, 75%, 70%, 65%, 60%, 55%.

## Casualty lifecycle visual grammar

`/test?scenario=casualty-lifecycle` uses shared outlined ring clocks for death
counts, treatment and execution. Partial progress is an arc around the
circumference only; it has no centre-to-edge line and is never a filled wedge.
Execution adds an outward arrow to the executor and inward brackets to the
target while both display the same authoritative action progress. The target's
persistent dagger appears only from terminal cause `execution`.

Chambers 5 and 6 include ordinary hostile entities whose real local exposure
drives a 96-unit safe extraction. The resulting production dragging phase lasts
well beyond 30 ticks before the two-helper physical handoff or solo-Physick
treatment. Chamber 7 starts with an armed citizen selecting an adjacent hostile;
after the explicit trauma opportunity, the citizen drops that target, makes no
ordinary attack while withdrawing, and moves through production trauma-support
behaviour. The hostile remains an ordinary, targetable participant.

World-space H marks show current or reserved herbs, not cumulative consumption
history. Consumption remains in bounded inspection. Combat crosses remain
transient renderer records and expire after the standard ten-tick retention
window. The Chamber 9 death clock is lifecycle-specific and disappears as soon
as the barbarian becomes terminal; egress and waiting use their own presence
glyphs.

The debug panel constrains its height to the viewport, scrolls vertically when
the debug content is long, and wraps the individual table in horizontal
scrolling so the page itself does not overflow. Richer sprites, icons, and
specialised presentation remain deferred under DC-017. The retained Milestone 5 renderer does not yet depict a downed posture. Authoritative casualty lifecycle now exists in Milestone 6; its retained visual presentation arrives with `/test?scenario=casualty-lifecycle` in Milestone 6J.
