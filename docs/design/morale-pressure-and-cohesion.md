# Morale, Pressure, and Cohesion Design Doctrine

## Purpose

Morale, pressure, and cohesion are separate concepts.

They must not collapse into one generic "bravery" number.

## Morale

Morale is the willingness to continue participating in the fight.

Morale is affected by:
- casualties
- isolation
- nearby routs
- being outnumbered
- captain presence
- unit cohesion
- mission importance
- repeated pressure

Low morale may cause:
- hesitation
- falling back
- refusal to advance
- rout

## Pressure

Pressure is immediate personal combat stress. It is stored per individual and summarised for the unit; it is not a continuously accumulating “enemy nearby” timer.

The accepted model is:

```txt
nearby active enemies and allies
→ a static local social-threat floor

incoming valid attack
→ a pressure impulse and a short recovery pause

gate-accepted damaging hit
→ an additional pressure impulse

successful weapon defence
→ lower defender impulse than an undefended attack

successful buckler/shield block
→ progressively lower defender impulse

attack successfully defended
→ a tiny frustration impulse to the attacker, without pausing recovery

no fresh attack
→ deterministic recovery toward the current floor
```

Nearby enemies raise the floor; nearby allies reduce it. The floor changes with local numbers but does not ramp merely because time passes.

Pressure is affected by:
- incoming attacks and accepted hits;
- local numbers and ally support;
- being flanked, crowded, pushed back, or unable to answer;
- being unable to maintain role distance;
- nearby enemy aggression and routing disruption.

Experience changes recovery rate. Veterans recover faster during a staredown; everyone recovers faster when stationary and safely away from enemies.

Pressure does not directly reduce block probability. Defence chance is owned by equipment, readiness, facing, action state and deterministic roll identity. Pressure instead affects behaviour, morale and whether the fighter eventually breaks.

High pressure may cause:
- slower or worse follow-up decisions;
- defensive behaviour and backing up;
- hesitation or mistakes;
- morale loss and routing over time.

## Confidence

Confidence is short-term belief that the current action can succeed.

Confidence is affected by:
- nearby ally support
- local advantage
- recent successful defence
- enemy hesitation
- captain/order support
- personal bravery and experience

High confidence may enable:
- closing distance
- pressing an attack
- stepping into gaps
- holding under threat

## Cohesion

Cohesion is the unit’s ability to remain a functioning group.

Cohesion is affected by:
- spacing
- formation integrity
- order clarity
- casualties
- routs
- push-through movement
- terrain obstruction
- captain influence

Low cohesion should weaken group influence over individuals.

## Discipline

Discipline is an individual trait that affects how strongly the fighter follows group intent despite fear, pressure, or temptation.

## Design Rule

Pressure affects the moment.
Morale affects willingness to continue.
Cohesion affects group shape.
Confidence affects willingness to act.
Discipline affects obedience to intent.
