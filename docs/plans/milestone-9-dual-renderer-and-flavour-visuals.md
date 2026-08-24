# Milestone 9: Dual Renderer and Flavour Visuals

Status: planned. Begins after Milestone 8 personal-space/collision is accepted.

This milestone deliberately moves a major part of the old late renderer milestone forward.

The current token renderer has become excellent diagnostic instrumentation, but the simulation is now complex enough that an exclusively abstract battlefield makes human judgement harder. The project previously explored and selected a clean, colourful, slightly cartoonish top-down layered-character style. Milestone 9 makes that the readable battlefield presentation while preserving the existing debug view as a separate first-class layer.

---

# Product goal

Provide two complementary ways to look at exactly the same simulation:

```text
Flavour
Debug
Both
```

The flavour renderer should let a human look at the battle and understand:

- roughly what kind of person each entity is;
- what broad equipment they are using;
- which way they are facing/moving;
- whether they are fighting, resting, downed, treating, dragging, routing, or leaving the field;
- which team they belong to;
- where physical crowding/fronts/casualties exist.

The debug renderer should continue to answer:

- why did this entity move or fail to move;
- what formation/unit does it belong to;
- what are its collision footprint, slot, anchor, vectors, state flags, and current authorities;
- what gait/activity/energy state is active;
- what exact inspected values explain the visible result.

Neither presentation owns simulation behaviour.

---

# Chosen flavour direction

Use a simple, clean, slightly cartoonish top-down person sprite assembled from layered transparent visual components.

Do not build a photorealistic miniature renderer.

The intended visual read is closer to:

> a colourful top-down tabletop/battlefield illustration where armour, weapons, posture, and motion are recognisable at a glance.

than:

> a diagram made entirely of circles.

The debug circles remain available separately.

---

# Dual-layer architecture

The renderer must have one shared scene/camera/entity transform and two presentation layers.

Suggested modes:

```ts
type BattlefieldRenderMode =
  | "flavour"
  | "debug"
  | "both";
```

Exact UI naming may differ.

## Flavour layer

Owns only visual interpretation of renderer-facing snapshot state:

- layered character appearance;
- equipment silhouettes;
- pose/action presentation;
- team ring/border;
- subtle state markers;
- centre gait/activity pip;
- casualty/treatment/egress presentation.

## Debug layer

Retains/refactors the current token/debug grammar:

- entity circles/tokens;
- unit/formation identity;
- collision radius/occupancy class;
- formation slots and anchors;
- movement vectors;
- requested/effective/actual gait;
- centre gait/activity pip;
- energy arcs;
- pressure/morale/casualty/treatment state where currently exposed;
- inspected IDs/text;
- later command/perception/terrain diagnostic overlays.

## Both

Both layers render simultaneously without:

- duplicating simulation snapshots;
- duplicating camera controls;
- introducing divergent entity positions;
- allowing debug rendering to modify flavour state;
- allowing flavour rendering to hide or mutate diagnostic truth.

The debug overlay should sit above/around flavour entities rather than replacing their coordinates.

---

# Renderer/simulation boundary

The renderer consumes snapshot/read-model state only.

Forbidden in renderer code:

- deciding whether an attack is valid;
- deciding physical collision;
- choosing gait;
- selecting targets;
- calculating morale;
- assigning lifecycle;
- spending resources;
- changing sim positions to make sprites look better.

If a flavour presentation needs state the snapshot does not expose, add a narrow read-only renderer-facing field derived from existing authority. Do not recompute mechanics in Pixi code.

The sim must never import flavour assets or Pixi types.

---

# Layered character composition

Start with a small stable layer stack rather than a combinatorial sprite catalogue.

Suggested stack, back-to-front:

```text
ground shadow / footprint cue
team ring
body / clothing base
armour torso/body layer
head / hair / helmet layer
rear/left equipment where needed
front/right equipment where needed
weapon
shield
state/action accents
centre gait/activity pip
optional debug overlay
```

Exact stacking may differ per asset set.

## Body/clothing

Use a small number of neutral readable body/clothing bases.

Do not attempt nation costume fidelity in Milestone 9. Nation-specific look-and-feel belongs with later content authoring unless an existing scenario explicitly provides cosmetic metadata.

## Armour

Broad visual categories should correspond to existing authoritative runtime equipment categories:

```text
none
light
medium
heavy
mageArmour
```

The visual should make these categories recognisably different without implying unmodelled exact coverage.

Examples of visual language:

- none/light: clothing/padded/leather-like silhouette;
- medium: visibly substantial armour, chain/partial rigid appearance;
- heavy: broad plate/heavy-armour silhouette;
- mage armour: visually distinct non-mundane armour treatment without adding mechanics.

Do not reintroduce `dreadnought` as an armour category. If a later Dreadnought-qualified heavy fighter needs flavour distinction, use a separate cosmetic/read-model cue only when canonical runtime content supports it.

## Helmet/head

Helmeted/unhelmeted presentation should follow existing authoritative helmet/equipment data when present.

Do not infer protection from the chosen art.

## Weapons

Use broad recognisable top-down silhouettes for existing categories:

```text
unarmed
dagger
oneHanded
greatWeapon
polearm
pike
thrown
ranged
rod
staff
```

Bow/crossbow may later have cosmetic style while remaining one mechanical `ranged` category.

Weapon art may rotate/follow facing. Visual weapon reach must not become combat authority.

## Shields

Render:

```text
none
buckler
shield
```

Held/slung/broken state should become visible when authoritative state exists.

Do not change defence calculations based on sprite placement.

---

# Team readability

Do not recolour the entire character into a faction blob.

Prefer a restrained team indicator:

- tinted ring/border;
- small base marker;
- subtle accent.

The person/equipment should remain visually readable independently of team colour.

Exact colours remain presentation constants.

Nation is not team. Do not use nation colour as hostility authority.

---

# Pose and activity presentation

Milestone 9 needs enough state presentation to make the existing simulation readable, not a full skeletal animation system.

At minimum distinguish:

```text
stationary/alert
walking
jogging
sprinting
attacking/committed combat
recovering attack
guarding/defending where readable
routing
safe resting
downed/dying
under treatment
treating
drag/helper movement
being moved as casualty
respawn egress
waiting/removed as appropriate
```

This may be represented by:

- sprite-frame changes;
- body orientation;
- small offsets/lean;
- weapon/shield pose;
- a short deterministic visual cycle driven by snapshot tick;
- state icon/halo where a pose is insufficient.

Do not use wall-clock randomness.

Visual animation must be deterministic from snapshot/tick where practical so replay screenshots are stable.

---

# Preserve the centre gait/activity pip

The small coloured centre dot used during Milestone 7 is explicitly retained.

It proved unusually useful at revealing gait/sprint chatter that smooth positional motion concealed.

Requirements:

- available in debug mode;
- available in flavour mode by default or through a lightweight toggle;
- uses actual activity/gait evidence, not requested intent;
- remains visually small enough not to dominate the character;
- later milestones may extend its vocabulary cautiously, but must not turn it into a second giant status UI.

Current accepted conceptual grammar includes clear distinctions for:

- sprint;
- jog;
- walk;
- recovery;
- other exertion;
- stationary/no significant change.

---

# Collision presentation

Milestone 8 becomes the first major mechanic that the dual renderer must present on both layers.

## Flavour

Crowding should be visible naturally because sprites no longer overlap illegally.

Downed people should visibly lie/downshift posture.

Yielding dead barbarians should visibly move off-field without looking like active combatants.

No giant collision circles in flavour-only mode.

## Debug

Expose hideable:

- personal-space footprint;
- occupancy class;
- intended and resolved movement;
- blocked/reduced/redirected state;
- downed-soft footprint/crossing;
- yielding-egress state;
- collision neighbours/priority when inspecting.

This becomes the pattern for future milestones: flavour communicates the result; debug communicates the authority/evidence.

---

# Casualty, medicine, and player-presence visuals

Existing Milestone 6 state should become visually legible.

At minimum:

- active fighter;
- dying/downed player;
- terminal/downed player;
- person being moved by helpers;
- helpers committed to casualty movement;
- Physick treating;
- patient under treatment;
- terminal barbarian respawn egress;
- waiting/removed states omitted or presented outside battlefield according to existing renderer conventions.

Do not invent a literal unconscious corpse pose if the LARP procedure represents a conscious player lying down. The visual needs “down and out of active combat,” not medical realism.

Terminal citizen Gate egress remains a later scenario mechanic.

---

# Energy visuals

Retain the accepted Milestone 7 visual grammar as optional debug/state presentation.

Flavour mode should not become covered in permanent numeric bars.

Prefer:

- centre activity pip;
- restrained optional energy arc;
- visible gait/pace;
- posture/tempo doing most of the work.

Detailed energy percentages/multipliers remain inspection/debug UI.

---

# Future-milestone visual contract

After Milestone 9, every detailed milestone plan should include a short presentation section.

For each new mechanic, explicitly decide:

```text
Flavour representation:
What should a normal human viewer see?

Debug representation:
What evidence should a reviewer inspect?

Neither:
Why is this mechanic intentionally invisible?
```

Examples:

- command: flavour may show captain/banner/order gesture; debug shows command links/delay/order state;
- scenario objectives: flavour shows physical objective/gate; debug shows capture radius/progress/ownership;
- perception: flavour may hide unknown enemies where appropriate; debug can expose visibility cones/known state;
- terrain: flavour shows ground/obstacle; debug shows passability/cost/safety fields;
- calls: flavour shows transient readable effect; debug shows source/duration/target/effect record;
- projectiles: flavour shows arrows/ground objects; debug shows IDs, ownership neutrality, perception/pickup state.

The flavour layer should not block implementation of a headless mechanic, but a milestone with important visible consequences is not human-accepted until its presentation is intelligible.

---

# Asset pipeline principles

Milestone 9 may introduce repository-owned image assets.

Requirements:

- use ordinary project assets, not runtime web dependencies;
- transparent backgrounds for layered sprites;
- consistent canvas size/origin/anchor;
- consistent top-down orientation convention;
- compact atlas/texture strategy where useful;
- avoid one bespoke full sprite for every equipment combination;
- reuse layers;
- preserve asset-generation/source notes in repository documentation where needed;
- no font files or unrelated binary baggage.

If generated art is used, normalise it into a deterministic shipping asset set. Runtime generation is out of scope.

---

# Performance architecture

The flavour renderer must remain viable for large battles.

Prefer:

- persistent per-entity render objects;
- sprite/container pooling;
- shared textures/atlases;
- updating only changed texture/pose/state where practical;
- no destroy/recreate per entity per frame;
- no per-frame asset loading;
- no per-frame text label for every entity in flavour mode;
- culling if the existing camera supports it;
- debug overlays separately toggleable because they may be more expensive.

Measure:

```text
render update CPU
Pixi/GPU frame cost
sprite/container count
texture switches where measurable
worker snapshot/message size
debug-overlay incremental cost
```

Do not optimise by guessing.

---

# Implementation slices

## 9A — Dual-layer renderer contract and mode control

Deliver:

- refactor current renderer into an explicit debug presentation layer without changing its accepted visual semantics;
- add flavour/debug/both mode;
- shared camera/world/entity transform;
- shared renderer-facing snapshot;
- no duplicate sim subscription;
- debug layer can be hidden completely;
- flavour layer initially may use simple placeholder body glyphs;
- preserve all retained `/test` routes and controls.

Tests:

- mode toggling does not alter sim state/snapshot;
- identical world positions in all modes;
- debug-only output remains compatible;
- no renderer mode field enters `src/sim`;
- pooling/object counts remain bounded.

## 9B — Layered base person renderer

Deliver:

- persistent per-entity flavour container;
- body/clothing base;
- head/base orientation;
- team ring;
- facing;
- deterministic basic stationary/walk/jog/sprint pose/cycle;
- preserve centre activity pip.

Human inspection should already look like people rather than counters.

## 9C — Equipment layers

Deliver:

- armour category visuals;
- helmet state;
- weapon silhouettes;
- shield/buckler;
- held/slung/broken visual state where already available;
- no mechanical inference from art;
- fallback art for unsupported/missing cosmetic metadata.

## 9D — Combat, morale, and energy presentation

Deliver:

- attack commitment/recovery pose;
- defence/guard indication where useful;
- routing;
- safe rest;
- gait/activity;
- optional energy arc/debug values;
- pressure/morale remains restrained in flavour and rich in debug.

Do not create screen-filling combat effects.

## 9E — Casualty, medicine, collision, and player-presence presentation

Deliver:

- downed/dying pose;
- treatment/Physick interaction;
- casualty movement/drag-group visual;
- yielding respawn-egress presentation;
- Milestone 8 collision debug overlay;
- flavour/debug/both remain readable in dense groups.

## 9F — Main-battle integration, pooling/performance, retained visual acceptance

Deliver:

- `/` defaults to the agreed flavour-oriented presentation;
- debug and both modes remain one action away;
- retained `/test` routes default to debug or their most useful inspection mode;
- renderer performance cases at representative populations;
- no per-frame sprite churn;
- browser smoke;
- human visual acceptance.

Milestone 9 is accepted only when the battle is materially more readable without sacrificing the diagnostic power of the current token system.

---

# Retained debug layer requirements

Do not “upgrade” the current debug layer by deleting the things that made it useful.

Preserve or supersede with equivalent diagnostic clarity:

- entity position/token;
- team/unit identification;
- formation slot/anchor data;
- movement vectors;
- requested/effective/actual gait;
- energy centre pip and optional arcs;
- casualty/treatment inspection;
- collision footprint/resolution after Milestone 8;
- hideable detailed tables;
- pause/reset/step/speed/debug controls.

The debug layer is a product feature for developing the simulation, not temporary scaffolding.

---

# Explicit deferrals

## Milestone 10

- captain-specific art/order gestures/command overlays beyond generic hooks.

## Milestone 11

- Sentinel Gate, respawn structures, objectives, scenario-specific scenery.

## Milestone 12

- true fog-of-war presentation and perception-limited rendering.

## Milestone 13 / 18

- nation-rich clothing/unit-generation cosmetic variety;
- full authored-character bespoke appearance.

## Milestone 14

- terrain art and obstacle presentation.

## Milestone 15

- call/effect visual vocabulary.

## Milestone 16

- projectile/arrow ground-object presentation.

## Milestone 17

- full replay timeline UI, after-action visualisation, advanced renderer profiling.

Later:

- cinematic animation;
- inverse kinematics;
- exact weapon swing arcs;
- ragdolls;
- 3D;
- physics-driven cloth;
- individual portrait art.

---

# Definition of done

Milestone 9 is complete when:

- flavour/debug/both modes are explicit;
- current debug diagnostics remain available and trustworthy;
- flavour entities are recognisable top-down people;
- broad armour, helmet, weapon, shield, team, facing, gait and major lifecycle/action state are readable;
- the centre gait/activity pip remains available;
- collision/casualty/egress outcomes are understandable in flavour mode and explainable in debug mode;
- renderer code owns no mechanics;
- sim imports no renderer/art dependencies;
- persistent/pool-based rendering remains viable at representative battle scale;
- all retained visual routes still work;
- future milestone plans have a clear dual-presentation contract;
- human inspection judges the main battle materially easier to understand.

## Milestone boundary

> The flavour layer shows what the battlefield looks like. The debug layer shows why it looks that way. Neither gets a vote in what actually happened.
