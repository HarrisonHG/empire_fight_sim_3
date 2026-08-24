# Empire Fight Sim Milestone Roadmap

Status: current working roadmap, rebased 2026-08-24 after Milestone 7 human acceptance.

This file is the numbering authority for all work after Milestone 7.

Detailed accepted milestone plans remain authoritative for the behaviour they implemented. Where an older accepted plan refers to a future milestone number, treat that number as historical and use the rebase table below to find the current milestone.

The guiding rule remains: simulate the physical and procedural reality of an Empire LARP battle with deterministic, headless, testable systems. Where idealised military behaviour conflicts with what players actually do on the field, the LARP reality is authoritative.

---

## Core project principles

- `src/sim` remains pure, deterministic, and headless.
- No `Math.random`, wall-clock randomness, DOM, browser APIs, PixiJS, worker APIs, renderer imports, or UI imports in the sim core.
- Prefer explicit data ownership, typed/data-oriented storage, stable iteration order, caller-owned output reuse, and deterministic integer/fixed-point state.
- Use bounded local spatial queries rather than all-entity pair scans.
- Do not add a large generic framework where one narrow authority boundary will do.
- New mechanics require headless regression coverage. Visual inspection supplements tests; it does not replace them.
- Measure realistic representative performance before optimising.
- Preserve the distinction between fictional character state and physical player-presence state.
- Physical constraints such as fatigue, personal space, death-count procedure, egress, ammunition handling, and respawn behaviour are first-class mechanics.
- Runtime skill qualification, runtime resource state, character-build legality, and pre-battle enhancement sources remain separate concerns.
- Team controls hostility and battle lifecycle. Nation controls content/generation flavour and must not secretly modify otherwise identical runtime combat state.
- Future mechanics that have a meaningful visible consequence should update both the flavour presentation and the debug presentation after Milestone 9 establishes that contract.

Normal project checks remain:

```text
npm run typecheck
npm test
npm run perf
npm run build
git diff --check
```

---

# Rebase from the pre-collision roadmap

Milestones 1–7 retain their accepted numbers.

The newly discovered personal-space foundation and the early flavour-renderer milestone are inserted before command behaviour.

| Previous future number | Current number | Milestone |
| --- | ---: | --- |
| — | 8 | Personal Space, Collision, and Crowd Flow |
| — | 9 | Dual Renderer and Flavour Visuals |
| 8 | 10 | Captains, Orders, and Command Behaviour |
| 9 | 11 | Scenarios, Objectives, Battle Lifecycle, and Victory |
| 10 | 12 | Perception, Knowledge, and Fog of War |
| 11 | 13 | Roles, Individual Loadouts, Skills, Runtime Resources, Banners, Support Roles, and Content Expansion |
| 12 | 14 | Terrain and Battlefield Constraints |
| 13 | 15 | Calls, Heroic Active Skills, Hard Effects, Treatment Pressure, and Equipment Repair |
| 14 | 16 | Ammunition and Recoverable Battlefield Projectiles |
| 15 + 16 | 17 | Replay/Debug Consolidation and Performance/Scale Hardening |
| 17 | 18 | Content Authoring, Scenario Schema, and Nation-Flavoured Generation |
| 18 | 19 | Character Creation, XP Validation, Rosters, and Unit Deployment |
| 19 | 20 | Pre-Battle Persistent Enhancements |

The old renderer milestone is intentionally split. The flavour/dual-layer foundation moves forward to Milestone 9; later replay, after-action, diagnostic tooling, and scale hardening remain in Milestone 17.

---

# Accepted milestones

## Milestone 1 — Foundation / App Skeleton

Status: accepted / implemented.

Delivered the TypeScript/Vite/Pixi/worker project foundation, deterministic sim loop, controls, metrics, tests, build pipeline, and initial performance baseline.

---

## Milestone 2 — Movement, Unit Identity, and Loadouts

Status: accepted / implemented.

Delivered unit identity, faction membership, summaries, local unit queries, formation movement, orders, blocker arbitration, movement styles, formed detour, loose flow, push-through behaviour, behaviour profiles, and initial loadout taxonomy.

Important limitation discovered later:

Milestone 2's blocker model primarily arbitrates unit/formation movement. It does not provide authoritative individual occupied space. Milestone 8 now supplies that missing physical layer.

---

## Milestone 3 — Combat Foundation

Status: accepted / implemented.

Delivered deterministic engagement, reach/contact geometry, combat opportunities, strike resolution, pressure/cohesion consequences, routing hooks, and consolidation. Later individual-combat work retained the useful unit-level summaries while replacing prototype survivability authority.

---

## Milestone 4 — Morale, Pressure, and Routing

Status: accepted / implemented.

Delivered persistent pressure, morale transitions, degraded movement, routing, bounded contagion, recovery, pursuit differences, and retained human-inspection scenarios.

---

## Milestone 5 — Individual Combat State, Defence, and Empire Hit Rules

Status: accepted / implemented.

Delivered authoritative per-entity combat profiles, targeting, attack commitment/recovery, parry/shield defence and readiness, global hits, one-second attacker-target damage gating, individual consequences, unit aggregation, and retained combat inspection.

---

## Milestone 6 — Casualties, Dying, Battlefield Treatment, Rescue, and Player Presence

Status: accepted / implemented.

Delivered dying and terminal lifecycle, Fortitude/death counts, traumatic wounds, rescue and drag groups, Physick/Chirurgeon treatment, herb reservation, execution, terminal citizen comfort, barbarian respawn egress/waiting hooks, bounded history, soak/performance coverage, and retained casualty inspection.

Milestone 6 deliberately made downed/terminal characters non-active blockers and deferred detailed body collision so casualties could not create permanent corpse walls. Milestone 8 replaces that temporary abstraction with explicit physical occupancy classes.

---

## Milestone 7 — Energy, Exertion, and Rest

Status: accepted / implemented following human visual acceptance on 2026-08-24.

Final accepted tuning is recorded in:

```text
docs/plans/milestone-7-energy-exertion-and-rest.md
docs/plans/milestone-7-human-tuning-corrections.md
```

Accepted behaviour includes:

- deterministic individual energy with large endurance tanks and slower recovery/depletion;
- walking as slow recovery;
- no special drag energy surcharge;
- full trusted safe-rest recovery while downed;
- voluntary 20% reserve;
- critical-rest hysteresis;
- energy-limited attack tempo, guard recovery, pressure recovery, jog and sprint;
- sprint intent separated from sprint capability;
- destination-affordable urgent sprinting;
- 90% voluntary sprint re-arm hysteresis;
- continuous energy through casualty, treatment, egress, and waiting states;
- retained targeted visual suite and main-battle inspection.

Milestone 7 is closed.

---

# Current and future milestones

## Milestone 8 — Personal Space, Collision, and Crowd Flow

Status: next.

Detailed plan:

```text
docs/plans/milestone-8-personal-space-collision-and-crowd-flow.md
```

Purpose:

Give every physical player presence meaningful occupied space so lines form, allies yield and flow, casualties matter without becoming walls, and dead barbarians can leave the battlefield as deliberately low-priority physical presences.

High-level direction:

- deterministic individual personal-space footprints;
- local collision/spacing resolution after movement intent;
- no illegal standing overlap;
- hard hostile fronts without rigid-body physics;
- allied yielding, sidestepping, squeezing, merging, overtaking, and push-through;
- routing priority and congestion;
- downed casualties as soft/hazardous physical occupancy;
- coherent drag-group occupancy;
- respawn-egress barbarians as physical but strongly yielding presences;
- existing stuck handling consumes genuine inability to progress;
- local spatial queries only;
- retained collision visual test and representative 2,000-entity performance.

Begin with 8A, a deliberately isolated feasibility spike. Do not commit the whole production movement pipeline to a collision algorithm until the spike demonstrates believable crowd behaviour.

---

## Milestone 9 — Dual Renderer and Flavour Visuals

Status: future; immediately after Milestone 8.

Detailed plan:

```text
docs/plans/milestone-9-dual-renderer-and-flavour-visuals.md
```

Purpose:

Keep the current token renderer as a first-class debug view while adding the previously selected clean, colourful, slightly cartoonish top-down layered-character presentation.

The two presentation modes consume the same renderer-facing snapshot:

```text
Flavour
Debug
Both
```

The debug layer remains responsible for analytical clarity: collision footprints, formation slots, anchors, vectors, identifiers, state overlays, and the useful centre gait/activity pip.

The flavour layer makes increasingly complex later milestones readable as a battle: body/clothing, armour, helmet, weapon, shield, facing, movement/action pose, casualty/treatment/egress state, and restrained team identification.

After Milestone 9, later milestones must consider both visual surfaces whenever they introduce a mechanic with a meaningful visible consequence.

---

## Milestone 10 — Captains, Orders, and Command Behaviour

Status: future.

Purpose:

Make command matter after individuals can physically occupy and obstruct space.

Expected direction:

- explicit captain role/state;
- captain-issued and maintained orders;
- order communication and bounded propagation;
- imperfect obedience based on pressure, cohesion, discipline/profile, casualties, energy, and command presence;
- command delay/failure as inspectable state;
- retained, suspended, lost, or reinterpreted orders under stress;
- captain-led rest, relief, rotation, withdrawal, rallying, and re-engagement;
- local consequences of captain loss;
- no magical army-wide command;
- later perception remains responsible for what a captain can actually know.

Collision is a dependency: relief, rotation, withdrawal, reserve passage, and line replacement must involve real bodies rather than units phasing through one another.

---

## Milestone 11 — Scenarios, Objectives, Battle Lifecycle, and Victory

Status: future.

Purpose:

Turn the evolving sandbox into repeatable one-hour Empire battle simulations.

Expected direction:

- scenario definitions and battle clock;
- deployment zones;
- Sentinel Gate citizen entry/exit;
- barbarian respawn locations;
- objective areas and objective progress;
- hold, breakthrough, escort, ritual, asset, retrieval, capture, and destruction objectives;
- barbarian waiting-group batching and reinforcement re-entry;
- energy-aware willingness/timing of barbarian return;
- late-battle reduction/cessation of respawns;
- citizen withdrawal through the Gate;
- scoring, victory conditions, and after-action outcomes.

Scenario logic coordinates existing systems; it does not duplicate combat, collision, command, morale, casualty, treatment, or energy authority.

Citizen terminal egress introduced here should reuse Milestone 8's low-priority/yielding physical-presence semantics where applicable.

---

## Milestone 12 — Perception, Knowledge, and Fog of War

Status: future.

Purpose:

Remove omniscience where it damages battlefield behaviour.

Expected direction:

- local perception and deterministic visibility;
- known/unknown hostile positions;
- visible allies, casualties, support roles, objectives, banners, ground objects, and treatment;
- bounded memory of recently observed state;
- scouting value;
- command uncertainty and delayed response;
- perceived tiredness rather than exact hostile energy;
- perceived/remembered support locations;
- dying players may perceive/communicate locally without becoming omniscient sensors.

---

## Milestone 13 — Roles, Individual Loadouts, Skills, Runtime Resources, Banners, Support Roles, and Content Expansion

Status: future.

Purpose:

Create the canonical runtime content layer without yet requiring every participant to be authored through an XP-valid character build.

Expected direction:

- canonical skill IDs, definitions, prerequisites, repeat-cost metadata;
- trusted runtime skill profiles;
- equipment permissions;
- hero-point and mana stores;
- finite herbs, liao, and Artisan's Oil;
- combat/survivability derivation;
- magical/support/heroic capability profiles;
- richer individual loadouts and mixed unit compositions;
- ranged/thrown capability and ammunition capacities;
- banners as physical state with morale/reform/target-attraction consequences;
- generated/default energy profiles adopted through the Milestone 7 authority rather than duplicated.

Until Milestone 19, authored scenarios may directly assign trusted legal runtime profiles without proving their XP purchase history.

---

## Milestone 14 — Terrain and Battlefield Constraints

Status: future.

Purpose:

Make battlefield geometry and local safety matter on top of the individual collision foundation.

Expected direction:

- chokepoints;
- rough, unsafe, soft-blocking, and impassable ground;
- objective, Gate, and respawn approach zones;
- formation disruption from terrain;
- slopes/mud/rough-ground energy cost;
- safe down-position adjustment;
- casualty extraction routes and treatment refuges;
- controlled shield pushing at slow movement only;
- long-weapon clearance/crowding constraints where useful;
- obstacle handling for forced movement;
- local safe/hostile-controlled space.

Milestone 8 owns person-person occupancy. Milestone 14 owns person-terrain constraints. Do not merge them into a monolithic pathfinding engine.

---

## Milestone 15 — Calls, Heroic Active Skills, Simplified Curse/Exorcism, Hard Effects, Treatment Pressure, and Equipment Repair

Status: future.

Purpose:

Activate reviewed Empire calls/effects and selected heroic/support actions after the underlying movement, collision, casualty, perception, content/resource, and terrain authorities exist.

Expected direction includes:

- CLEAVE/IMPALE coarse body/arm/leg consequences;
- PARALYSE, REPEL, STRIKEDOWN, ENTANGLE, WEAKNESS, VENOM, SHATTER, EXECUTE and MASS semantics;
- relevant heroic skills and shared hero-point spending;
- simplified CURSE and Exorcism;
- repair behaviour and finite Artisan's Oil;
- treatment consequences and interaction precedence;
- deterministic effect records and duration/expiry.

Safety calls remain out of autonomous simulation scope.

---

## Milestone 16 — Ammunition and Recoverable Battlefield Projectiles

Status: future.

Purpose:

Model the physical LARP reality of finite arrows/bolts and thrown weapons.

Expected direction:

- mechanically unified bow/crossbow ranged category;
- finite carried ammunition;
- firing consumes inventory;
- fired projectiles become neutral recoverable ground objects;
- landed ranged projectiles apply the approved IMPALE semantics;
- active shield interception; no weapon parry of arrows/bolts;
- perception-aware local projectile discovery;
- threat-aware deterministic pickup;
- competing retrieval resolution;
- thrown weapons use the same physical-object foundation with different retrieval policy;
- no detailed ballistic flight simulator.

---

## Milestone 17 — Replay/Debug Consolidation and Performance/Scale Hardening

Status: future unless earlier measured pain forces a targeted intervention.

Purpose:

Consolidate the diagnostic and replay systems accumulated during development and harden realistic battle scale.

Expected direction:

- replay and scenario playback tooling;
- richer bounded event/state inspection;
- after-action timelines and summaries;
- debug visual consolidation across the dual renderer;
- representative profiling of sim CPU, renderer CPU/GPU, worker messages, GC, spatial queries, and UI;
- spatial-index reuse and hot-path allocation reduction where measurement justifies it;
- stable representative 2,000-entity battle performance;
- long deterministic soak coverage.

Do not optimise from abstract anxiety.

---

## Milestone 18 — Content Authoring, Scenario Schema, and Nation-Flavoured Generation

Status: future.

Purpose:

Make battles authorable and generate believable Empire and barbarian forces without editing TypeScript.

Expected direction:

- JSON/data-driven scenario and army definitions;
- unit archetypes/member templates;
- citizen/barbarian team-safe nation IDs;
- nation-biased but not nation-exclusive loadout/role/experience composition;
- configurable “national soup”/messiness so units range from coherent to authentically eccentric;
- support quotas, banners, experience distributions, and scenario overrides;
- deterministic generation from seed;
- replay/import/export metadata;
- nation never overrides actual generated individual runtime state.

Current citizen nations:

```text
Brass Coast
Dawn
Highguard
Imperial Orcs
League
Marches
Navarr
Urizen
Varushka
Wintermark
```

Current barbarian nations:

```text
Jotun
Druj
Grendel
```

Generated Imperial Orcs do not use the fresh-recruit tier unless a scenario explicitly overrides it.

---

## Milestone 19 — Character Creation, XP Validation, Rosters, and Unit Deployment

Status: future.

Purpose:

Allow named authored individuals to be built legally and placed into a battle.

Expected direction:

- stable character ID and name;
- citizen/barbarian team and compatible nation;
- unit assignment;
- explicit XP budget, default 8 for a normal starting character;
- skill purchases/ranks;
- prerequisite and repeat-cost validation;
- equipment/role legality;
- derived hits, hero points, mana, death counts, spell slots, support resources and energy profile;
- deterministic roster import/export and deployment;
- nation-weighted suggestions without nation-exclusive legality;
- legacy/generated trusted profiles remain available as explicit XP-validation bypasses.

The headless validator is authoritative; any UI merely presents it.

---

## Milestone 20 — Pre-Battle Persistent Enhancements

Status: future.

Purpose:

Allow explicitly selected tonic, bonded magic-item, and ritual-enchantment effects to modify battle setup through typed source-owned adapters.

Expected direction:

- one tonic;
- one bonded personal item per supported form;
- one direct ritual enchantment;
- explicit multi-target ritual application records;
- deterministic setup-derived modifiers and charge pools;
- source IDs, suspension, consumption, item loss, and charge state remain inspectable;
- character-builder/scenario integration;
- no battle-time crafting, economy, bonding ceremony, potion application, or ritual performance simulation.

Full spellcasting content requires its own reviewed battlefield semantics before activation.

---

# Dependency summary

The current near-term sequence is deliberate:

```text
7 Energy accepted
→ 8 Personal space / collision
→ 9 Dual renderer / flavour visuals
→ 10 Command
→ 11 Whole battle scenarios
→ 12 Perception
→ 13 Canonical roles/resources/content
→ 14 Terrain
→ 15 Calls/effects
→ 16 Physical ammunition/projectiles
→ 17 Replay/debug/scale hardening
→ 18 Authoring + nation generation
→ 19 Character XP authoring
→ 20 Pre-battle enhancements
```

Why 8 now:

Command, relief, reserve passage, routing congestion, casualty extraction, chokepoints, and later terrain all produce misleading behaviour while people can occupy the same space.

Why 9 immediately afterward:

The project now has enough interacting physical state that token-only presentation is becoming a comprehension bottleneck. The debug renderer remains essential, but increasingly complex mechanics also need a readable battlefield-facing presentation.

---

# Roadmap authority rule

For completed milestones:

> The accepted detailed milestone plan and its accepted correction/addendum documents own implemented behaviour.

For future milestones:

> This roadmap owns numbering and dependency placement until a detailed milestone plan is accepted.

If an older document says “Milestone 9” when referring to a future scenario system, consult the rebase table rather than editing historical implementation claims in place.
