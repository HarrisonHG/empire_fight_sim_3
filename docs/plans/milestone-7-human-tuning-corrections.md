# Milestone 7 Human-Tuning Corrections

Status: 7K-1 through 7K-4 are implemented; Milestone 7 remains awaiting human
visual acceptance.

This addendum supersedes conflicting Milestone 7 tuning text in
`docs/plans/milestone-7-energy-exertion-and-rest.md` until these corrections
are merged back into that plan.

## 7K-1 — Energy scale and movement economics

Status: implemented.

Human visual inspection found the current energy cycle too short and casualty
dragging too expensive for LARP reality.

### Tuning changes

Use deterministic fixed-point/integer arithmetic. Do not introduce floating
point drift.

Relative to the accepted 7J implementation:

- double every entity's maximum energy;
- double starting energy proportionally so starting percentages are preserved;
- halve ordinary expenditure rates;
- halve ordinary recovery rates;
- remove the drag-helper surcharge entirely;
- walking becomes slow recovery rather than expenditure.

Target baseline rates, expressed in user-facing energy units:

```text
safe stationary rest:       +2.5 per tick
alert stationary:           +1.0 per tick
downed rest:                +2.0 per tick
walking:                    +0.5 per tick
jogging:                    -4.0 per tick
sprinting/charging:        -20.0 per tick
dragging surcharge:          0.0 per moving tick
treating:                    0.0 per tick
under treatment:            +1.5 per tick
execution commitment:        0.0 per tick
waiting at respawn:         +2.5 per tick

valid attack attempt:       -40 impulse
valid defence attempt:      -25 impulse
```

Scenario-specific safe-rest recovery profiles are also halved in effect.

Half-unit rates must retain deterministic remainder across ticks rather than
being rounded away each tick.

### Walking and burden

Walking is deliberately recuperative. Equipment burden and injury must not turn
walking into an expenditure. Burden/injury continue to modify genuinely
energetic self-propelled movement such as jogging and sprinting.

If the retained burden visual needs equal-work comparison, use jogging rather
than walking.

### Casualty movement

In LARP, the casualty player gets up and moves with the helpers. Therefore:

- helpers receive no special drag energy surcharge;
- each helper receives only their own normal gait energy semantics;
- an externally moved patient still receives no personal movement expenditure;
- do not change casualty selection, grouping, geometry, or movement speed in
  this correction.

## 7K-2 — Reserve conservation and distance-aware gait choice

Status: implemented.

Energy is a reserve people conserve, not a fuel bar they voluntarily empty.

Named initial thresholds:

```text
critical-rest enter:       <10%
critical-rest exit:        >=15%
voluntary reserve floor:    20%
voluntary sprint entry/re-arm threshold: 90%
voluntary jog threshold:    60%
```

These are tuning constants and may be revisited only after retained visual
inspection.

### Behaviour

When safe:

- below 10%, a unit may enter stationary rest;
- once it reaches 15%, it may leave stationary rest;
- configured `advance` and `advanceCautious` orders are temporarily suspended
  during critical rest, not replaced, and resume unchanged on rest exit;
- from 15% upward, a unit that still needs to move may walk;
- walking slowly recovers energy;
- below 20%, do not voluntarily attack, jog, sprint, or charge;
- from 20% to below 60%, voluntary movement toward an objective is walking;
- from 60% to below 80%, ordinary fast advance is at most jogging;
- at 80% or above, jogging remains the default fast advance.

Voluntary sprint/charge is exceptional:

- only enter or re-arm it at or above 90%;
- only use it for a known nearby destination/contact where the remaining
  distance can plausibly be completed at sprint gait;
- predicted completion must not take the relevant member/unit below the 20%
  voluntary reserve floor;
- if the sprint cannot be completed within that budget, fall back to jog or
  walk rather than sprint-rest-sprint oscillation.

Use existing order/target geometry and bounded local information. Do not add
global battlefield knowledge or a second order system.

### Forced expenditure

The voluntary reserve floor does not block genuinely forced behaviour.

Examples that may consume energy below 20%:

- routing/panic movement;
- canonical defence attempts.

Existing compulsory casualty/treatment/execution commitments remain
authoritative. They must not be cancelled merely because the voluntary reserve
is low.

### Combat

Below the 20% reserve floor, do not initiate voluntary offensive attacks.
Defence remains available.

For fighters above the reserve floor, low energy must visibly slow attack
cadence through the existing attack-recovery authority.

Retune attack-recovery multipliers to make this visually legible:

```text
fresh:    100%
working:  120%
winded:   160%
spent:    220%
```

Guard-recovery multipliers remain unchanged unless a focused regression proves a
separate problem:

```text
fresh:    100%
working:   90%
winded:    70%
spent:     50%
```

Do not change damage, defence floors/ceilings, readiness spending, roll identity,
or pressure impulses.

## 7K-3 — Retained visual correction and acceptance

Status: implemented; awaiting human visual acceptance.

Update `/test?scenario=energy-exertion` before revisiting `/`.

Required chamber corrections:

- Chamber 5: compare light/heavy burden under energetic movement such as jogging
  rather than relying on walking expenditure.
- Chamber 6: demonstrate that casualty helpers receive no extra drag cost and
  the patient remains externally moved without personal movement expenditure.
- Chamber 7: make attack/guard recovery differences obvious. Use otherwise
  identical fresh and tired pairs, with the tired attacker above the 20%
  voluntary reserve floor so it still attacks. Expose/compare attack count,
  attack-recovery multiplier/remaining recovery, guard-recovery multiplier,
  and readiness over the same observation window.
- Chamber 9: demonstrate a non-stuttering progression:
  stationary critical rest -> walking recovery toward the objective ->
  jogging when sufficiently recovered -> sprint/charge only when both
  high-energy and close enough to finish the sprint within reserve.

Update fixture capacities/start values for the new doubled-energy scale while
preserving intended starting percentages.

Milestone 7 remains awaiting human acceptance after these corrections.
Do not tune the main-battle presentation further until the retained targeted
suite has been re-inspected.

## 7K-4 — Human-feedback correction

Status: implemented; awaiting human visual acceptance.

- Dying/downed people recover at their own full trusted safe-rest recovery
  rate. Nearby hostile presence does not downgrade that recovery.
- Energy remains sprint capability, not sprint intent. Ordinary advance/travel
  continues to walk or jog under conservation policy even at 80% or above.
- Voluntary sprint remains limited to an existing urgent movement authority:
  an affordable short final hostile contact, routing/panic, or an already
  requested urgent casualty/medical movement.
- Urgent self-propelled specialist sprint requests use their already-selected
  bounded destination and the exertion-adjusted tick-start sprint budget:
  sprint entry/re-arm requires at least 90% energy and enough budget to arrive
  without crossing the 20% voluntary reserve. Once begun, the same urgent
  sprint episode may continue below 90% while that completion proof remains
  valid. If conservation ends the sprint, continued ordinary movement remains
  at jog/walk until energy recovers to 90%; it does not chatter back into
  sprint. Routing/panic remains forced and exempt.
- The retained energy suite demonstrates full downed recovery near a hostile
  and contrasts a distant high-energy jog with a stable close sprint burst
  followed by sustained jog/walk activity.

Milestone 7 remains awaiting human visual acceptance. Do not tune `/` yet.
