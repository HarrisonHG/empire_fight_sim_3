# Combat Tempo and Defence Design Doctrine

## Purpose

Combat should model pressure, tempo, commitment, recovery, and defence readiness before detailed damage modelling.

The goal is not to build a fighting game. The goal is to make exchanges produce plausible behaviour.

## Defence

Defence must not be a context-free random block percentage. It may use a replay-stable keyed roll after authoritative state has produced the chance.

A fighter who is facing an obvious incoming attack, has readiness available, is not offensively committed, and is not flanked should usually defend successfully against the first simple attack. Full readiness approaches a 95% ceiling; equipment supplies different minimum chances when readiness is depleted, and rear attacks use a small desperate-defence chance when a usable defence source exists.

The interesting questions are:
- can they defend repeated attacks?
- can they recover after defending?
- can they answer?
- do they lose spacing?
- do they become pressured?
- do they get overwhelmed by multiple threats?

## Attack Commitment

Attacks should create commitment.

A committed attacker may:
- create threat
- force defence
- enter recovery
- overextend
- expose themselves
- gain confidence if successful
- lose confidence if repeatedly denied

## Recovery

Recovery represents the return of guard readiness and action availability after attacking, defending, being staggered, or being pressured.

The accepted guard model uses one persistent readiness meter:

- every valid incoming defence attempt spends readiness;
- experience determines continuous recovery;
- attacking suppresses effective readiness to zero during commitment/recovery while stored readiness may recover underneath;
- repeated attacks can overwhelm a guard even when the landed-hit gate limits damage frequency.

A recovering fighter should be worse at:
- attacking;
- changing direction;
- defending repeated threats;
- maintaining formation.

## Tempo

Tempo is the current initiative in a local exchange.

A fighter with tempo is more able to press, threaten, or force reactions.

A fighter losing tempo may defend, back up, or seek ally support.

## Design Rule

The first combat model should explain behaviour before it explains injury.

Damage is secondary to pressure, commitment, and positional consequence.
