# Perception and Knowledge Design Doctrine

Entities must not make decisions from global battlefield knowledge unless that knowledge is explicitly available.

Individuals know local information.

Captains know local aggregated unit information.

Units know their own posture, cohesion, order, and nearby visible blockers or threats.

Future communication systems may transmit stale or unreliable information, but this is not part of the early model.

## Individual Knowledge

An individual may know:
- nearby allies
- nearby enemies
- current unit order
- approximate formation slot
- immediate threats
- whether they are isolated
- their own pressure/confidence/fatigue
- nearby visible routing or fallen allies

An individual may not know:
- global battle outcome
- distant objective state
- distant ally collapse
- enemy morale outside local perception
- captain intent unless represented by current order

## Captain Knowledge

A captain may know:
- own unit morale
- own unit cohesion
- own casualties
- nearby visible enemies
- nearby visible allies
- objective position/status if local or assigned
- current order
- time since last order change

A captain may not know the whole battlefield by default.

## Design Rule

Bad information should produce plausible bad decisions.

A captain or fighter being wrong because they lack knowledge is valid simulation behaviour, not a bug.
