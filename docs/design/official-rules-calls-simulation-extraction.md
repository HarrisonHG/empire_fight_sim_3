# Official Rules Extraction: Calls

Status: proposed simulation design input.

Primary source reviewed: Profound Decisions, **Calls**  
https://www.profounddecisions.co.uk/empire-wiki/Calls

Linked pages consulted where they resolve direct dependencies:

- Rules FAQ: https://www.profounddecisions.co.uk/empire-wiki/Rules_FAQ
- Heroic skills: https://www.profounddecisions.co.uk/empire-wiki/Heroic_skills
- Combat skills: https://www.profounddecisions.co.uk/empire-wiki/Combat_skills
- Purify: https://www.profounddecisions.co.uk/empire-wiki/Purify
- Combat: https://www.profounddecisions.co.uk/empire-wiki/Combat

Reviewed: 2026-07-11.

Safety calls are intentionally excluded from this extraction. `FIRST AID`, `MAN DOWN`, `TIME FREEZE`, and `TIME IN` are out-of-character safety procedures and are not part of the autonomous battle simulation.

---

## Purpose

Extract the official call rules that materially affect a believable Empire battle simulation, identify the state and dependencies each call requires, compare them with the current Milestone 4F project state, and refine the future calls milestone.

This document distinguishes between:

- **call effect** — what `CLEAVE`, `REPEL`, `WEAKNESS`, and so on actually do
- **delivery** — a landed blow, a weapon or shield contact, a timed execution, an automatic projectile effect, or a MASS cone
- **source** — heroic skill, spell, magic item, potion coating, monster ability, scenario effect, or another rule that grants the call
- **resource** — hero point, mana, per-day item use, prepared coating, no resource, or a future source-specific pool
- **observable acceptance** — whether the caller can tell that the target took the call, which determines whether many sources are expended
- **active effect state** — the resulting limb, movement, equipment, death-count, or ability restriction on the target

These concepts must not be collapsed into one `SpecialCallCapability` string.

---

# Executive conclusions

## 1. Calls require a generic effect pipeline, not eleven bespoke attack branches

The official calls share a common application process but differ in delivery, defence interaction, target eligibility, duration, and resulting state.

A future pipeline should resolve, in order:

```txt
source eligibility
→ resource availability
→ delivery attempt
→ physical contact result
→ ordinary-hit result
→ call-effect eligibility
→ call-effect application
→ caller-observable acceptance
→ resource consumption
→ event emission
```

The pipeline must produce separate outcomes for the ordinary one-hit component and the special effect. A shield may prevent the hit while still allowing `ENTANGLE`, `REPEL`, or `STRIKEDOWN` to apply.

## 2. A call name is not a skill or loadout capability

Characters can obtain the same call from very different sources:

- a heroic skill spending a hero point
- a spell spending mana
- a magic item with per-day uses
- a weapon or implement that spends another resource
- a prepared potion or oil coating
- an NPC or monstrous ability
- a scripted scenario effect

The simulation should therefore store call sources separately from call definitions.

The current unit-level `SpecialCallCapability` vocabulary is temporary design debt. It currently omits official calls and includes `heal`, `restore`, and `fixWeapon`, which are abilities or effects rather than official calls.

## 3. No probabilistic resistance is allowed

Applicable calls are not resisted by bravery, morale, armour score, veteran status, or a random saving throw. The effect applies when its delivery conditions are satisfied, unless a specific rule prevents it.

The principal exceptions are:

- the blow misses or is dodged
- a normal block or parry prevents a call that does not pass through defence
- qualifying armour changes `CLEAVE` or `IMPALE` into an ordinary one-hit result when the physical armour is struck
- oversized monstrous creatures are immune to calls
- the target or item is not eligible for that effect

Morale may affect whether a character chooses to use a call or how they behave afterward, but not whether they mechanically resist it.

## 4. Resource spending depends on observable acceptance, not merely state mutation

If a target visibly does not take a call, the call is not used and heroic or magical resources are not spent. This requires the simulation to distinguish:

- **effect applied** — target state changed
- **effect accepted but redundant** — target took the call, but the state was already present
- **visibly ineffective** — blocked, parried, immune, invalid, or otherwise clearly not taken
- **hidden acceptance** — `VENOM` and `WEAKNESS` cannot be visibly confirmed, so the caller must assume they were taken after a valid unblocked delivery

A repeated `WEAKNESS` call against an already weakened valid target may make no new state change, but the caller cannot know that and should still expend the source according to its rules.

## 5. Calls force several new state domains

The effects require more than a generic status list:

- legal body-location result and armour coverage
- left/right arm availability
- left/right leg availability
- held-item ownership and forced dropping
- standing, falling, grounded, getting-up, and immobile states
- forced movement and obstacle pinning
- broken weapons, implements, and shields
- persistent venom and weakness conditions
- death-count modification
- active/passive ability classification
- timed actions such as execution
- finite hero, mana, item-use, and prepared-effect resources
- target type and monstrous-call immunity

## 6. MASS is a delivery modifier, not a separate family of effects

`MASS` applies another call to every eligible character in a ninety-degree cone up to 20 feet / 6 metres in front of the source.

For simulation purposes:

- MASS has no accompanying ordinary hit
- MASS does not require a weapon strike
- shields do not create a strike block because there is no strike
- the query is faction-blind unless a specific source says otherwise
- targets should be resolved in stable deterministic entity order
- the initial implementation should not invent line-of-sight, cover, or ally-exclusion rules absent from the official call
- valid MASS combinations should be content-defined rather than assuming every theoretical call combination exists in play

## 7. Calls affect believable battlefield behaviour before and after impact

Finite powerful effects should not be fired on cooldown like videogame powers. Characters need tactical use policies informed by:

- available resources
- confidence that contact will land
- target equipment and perceived role
- target value
- local support and risk during recovery
- current order and unit doctrine
- whether the effect creates an exploitable opening
- whether allies are positioned to follow up

This decision layer is behavioural simulation, not part of the official mechanical call definition.

---

# Common official call rules

## Strike-delivered calls

Classification: **core effect-delivery rule**.

Ordinary heroic and magical calls are delivered by striking or touching the target with a suitable weapon or implement. One call may accompany one blow.

When the blow lands on the character:

- the target loses one global hit under the ordinary one-second rule
- the call effect is then resolved according to its own rules
- `CLEAVE` and `IMPALE` may replace the ordinary outcome with a more severe torso or limb result

When a shield or weapon prevents the blow:

- there is no ordinary hit loss
- most calls do not apply and are not expended
- `ENTANGLE`, `REPEL`, and `STRIKEDOWN` still affect the character through weapon or shield contact
- `SHATTER` affects the item that was struck

`EXECUTE`, MASS calls, and automatic projectile `IMPALE` require distinct delivery modes and should not be forced through the ordinary strike path.

## One call per blow

Classification: **core validation rule**.

A strike may carry at most one call. A source that offers several possible calls must select one before resolution.

The call’s ordinary hit remains subject to the per-attacker/per-target one-second damage gate. The special effect is not permission to inflict an extra ordinary hit.

## No resistance

Classification: **core eligibility rule**.

Do not add:

- saving throws
- morale checks to ignore a call
- veteran resistance
- armour-score resistance
- random partial resistance

The target may avoid the delivery through normal movement or defence where permitted. Once an applicable call is validly delivered, the target takes it.

## Call awareness

Classification: **core procedural assumption**.

Empire participants are expected to know how all calls work. The simulation should not make recruits fail to obey a call because they do not recognise its name.

A future sound/perception model may affect whether a distant character reacts to someone else being called, but it should not invalidate an effect on the struck target.

## Monstrous creatures

Classification: **later content and eligibility rule**.

Oversized creatures represented by bulky, all-encompassing full-body costumes are unaffected by calls. Ordinary player characters always count as human-sized regardless of costume. Large humanoids such as ogres are affected normally.

Simulation consequences:

- add a specific `callEffectImmune` or creature-category eligibility flag
- do not turn this into general damage immunity
- do not infer immunity from visual size alone
- ordinary healing also does not work on monstrous creatures; that belongs to healing/content rules
- a visibly immune target normally prevents resource expenditure under the common acceptance rule

---

# Delivery and defence matrix

The initial call resolver should distinguish these physical outcomes:

```txt
missedOrDodged
bodyContact
armourContact
weaponParryContact
shieldBlockContact
itemContact
massAreaContact
executionCompletion
projectileBodyContact
projectileShieldContact
```

Recommended effect matrix:

| Call | Body contact | Qualifying armour contact | Weapon parry | Shield block | Ordinary hit |
|---|---|---|---|---|---|
| CLEAVE | torso zeroes hits; limb ruined; legal head/neck result one hit | medium or heavy armour reduces to ordinary one-hit result | no effect | no effect | yes when character is hit |
| IMPALE | torso zeroes hits; limb ruined; legal head/neck result one hit | heavy armour reduces to ordinary one-hit result | no effect for melee delivery | no effect | yes when character is hit |
| STRIKEDOWN | fall | fall | fall | fall | only on character/armour contact, not a successful block/parry |
| CURSE | curse marker/payload | curse marker/payload | no effect | no effect | yes when character is hit |
| ENTANGLE | feet locked | feet locked | feet locked | feet locked | only on character/armour contact |
| PARALYSE | action lock | action lock | no effect | no effect | yes when character is hit |
| REPEL | forced retreat | forced retreat | forced retreat | forced retreat | only on character/armour contact |
| SHATTER | no item effect unless an eligible item is struck | no item effect unless an eligible item is struck | struck weapon/implement breaks | struck shield breaks | yes only if the character is struck rather than an item blocking it |
| VENOM | venom condition | venom condition | no effect | no effect | yes when character is hit |
| WEAKNESS | weakness condition | weakness condition | no effect | no effect | yes when character is hit |

Notes:

- `armourContact` is still a landed character hit for most calls. Armour only provides special locational protection from `CLEAVE` and `IMPALE` where specified.
- An arrow or bolt automatically delivers `IMPALE`; it may not be parried with a weapon. A shield may block it through ordinary projectile coverage.
- Intentional head and neck targeting is prohibited by the combat rules. The initial simulation should not deliberately select head or neck as an aim location. See the open decisions section.

---

# Heroic calls

## CLEAVE

Classification: **core severe-hit effect once body state exists**.

Official effect:

- torso contact reduces the target to zero global hits and causes dying
- limb contact ruins that limb
- head or neck contact causes one ordinary hit
- contact with the actual phys-rep of medium or heavy armour causes one ordinary hit instead
- a normal block or parry prevents the call and preserves its use

Required simulation state:

- resolved contact location
- actual armour coverage at that location
- current global hits
- arm and leg usability
- held items by hand
- active/dying transition

Behavioural consequences:

- an arm loss forces the held item in that hand to be dropped
- either arm loss prevents continued two-handed weapon use
- shield-arm loss removes active shield defence
- leg loss prevents translational movement; the character may continue defending from the ground
- limb loss should create immediate unit-level pressure and local morale consequences

Initial abstraction recommendation:

Use legal battlefield contact locations only:

```txt
torso
leftArm
rightArm
leftLeg
rightLeg
```

Do not have AI intentionally aim for head or neck. Incidental head/neck modelling can be deferred until there is a reason to simulate unsafe accidental contact.

## IMPALE

Classification: **core severe-hit effect and mandatory ranged dependency**.

Official effect:

- same torso and limb consequences as `CLEAVE`
- only actual heavy armour protects against the severe effect
- every landed arrow and bolt automatically causes `IMPALE`
- arrows and bolts cannot be parried with weapons

Simulation consequences:

- melee `IMPALE` and projectile `IMPALE` share the same effect resolver but use different delivery rules
- projectile combat is not rules-faithful until this effect exists
- a shield may intercept the projectile before body-location resolution
- a projectile that reaches medium armour still applies the severe `IMPALE` result; only heavy armour downgrades it

## STRIKEDOWN

Classification: **core temporary body-state and movement effect**.

Official effect:

- the target must fall so that backside or torso touches the ground before taking another action or standing
- weapon parry and shield block do not prevent the effect
- the target may take at most two safety steps to reach a safe place to fall
- the steps cannot become a tactical retreat or attack opportunity
- the target cannot convert the fall into a roll and immediate leap-up

Required simulation state:

```txt
standing
→ forcedFall
→ grounded
→ gettingUp
→ standing
```

Simulation consequences:

- cancel current attack commitment, movement, and active defence
- choose the nearest safe down position within the equivalent of two steps
- do not use the adjustment to improve tactical position
- grounded characters remain valid targets
- getting-up duration is not fixed by the official call; it should be a deterministic human-physical action influenced later by equipment, energy, crowding, and mobility profile
- nearby allies may protect, make space, or lose cohesion

The initial implementation should model a short explicit fall/get-up action rather than teleporting directly back to standing on the same tick.

## EXECUTE

Classification: **core casualty lifecycle action, technically a call but not an ordinary blow effect**.

Official effect:

- a dying or terminal character can be executed
- the executor spends at least five seconds in appropriate fatal-blow roleplaying
- completion immediately kills the target
- paralysis alone does not make an active character executable
- a character may consent to execution, bypassing the normal dying/terminal and five-second requirements

Simulation consequences:

- represent execution as a committed timed action against a vulnerable target
- the executor cannot simultaneously fight normally while performing it
- battle AI should only attempt it when local risk, orders, and priorities justify spending five seconds exposed
- consent should be scripted or scenario-authored, not an ordinary tactical AI decision
- completion must update character lifecycle while preserving player-presence procedure
- for barbarian battle entities, execution may accelerate the point at which the player begins respawn egress; scenario rules own the later return

The exact interruption conditions are not fully specified on the Calls page. The future plan should define them consistently with other timed actions and record the chosen simulation assumption.

---

# Magic calls

## CURSE

Classification: **scenario/ref-driven extension hook**.

Official effect:

- the target knows they have been cursed
- there is no immediate standard mechanical consequence
- the target seeks referee details when appropriate
- the curse lasts until cured

Simulation consequences:

- do not invent a random generic curse table
- apply a persistent `cursed` marker and event record
- allow an optional scenario-defined curse payload or script identifier
- if no payload is defined, the marker has no autonomous combat effect
- future scenarios may use curse state for objectives, after-action outcomes, or special NPC logic

## ENTANGLE

Classification: **core temporary movement restriction**.

Official effect:

- feet may not move for ten seconds
- the target may otherwise move their upper body, fight, block, parry, talk, and act normally
- weapon parry or shield block does not prevent the effect

Simulation consequences:

- stop positional translation immediately
- retain facing changes, attacks within reach, active defence, speech, item use, and ordinary abilities
- preserve current position even if formation slots move away
- formation cohesion and local pressure should respond to the fighter becoming anchored
- expire after 200 ticks at a 20 Hz simulation rate unless cured earlier

A later interaction table must decide how `ENTANGLE` combines with contradictory forced movement such as `REPEL`.

## PARALYSE

Classification: **core temporary hard action lock**.

Official effect:

- lasts ten seconds
- target cannot move or take actions
- target may talk
- target may drink a potion if another character feeds it to them
- a normal block or parry prevents the call
- MASS PARALYSE applies without a shield strike to block it

Simulation consequences:

- cancel attacks, movement, active defence, casting, treatment, carrying, command actions, item use, and other active abilities
- preserve passive always-on effects
- permit speech/perception events
- permit an external feed-potion action targeted at the paralysed character
- the target remains vulnerable to ordinary attacks
- expire after 200 ticks at 20 Hz unless removed by an applicable cure

The initial effect should lock voluntary actions. How external forced movement and carrying interact requires an explicit ruling rather than an invented physics rule.

## REPEL

Classification: **core forced-movement and obstacle interaction**.

Official effect:

- move directly away from the source at a brisk walk or faster
- lasts ten seconds or until more than 20 feet / 6 metres of retreat has been completed
- weapon parry or shield block does not prevent the effect
- if an obstacle prevents further movement, move as far as possible and remain pressed against it
- while pinned, the target may talk but take no other actions, including shield block or weapon parry
- the target may hold a solid immovable object instead of retreating, but then has the same no-action restriction for ten seconds
- a friend cannot hold the target in place to resist it

Simulation consequences:

- store effect source position or source entity plus application origin
- forced movement direction must remain away from the original caster/source position unless a later official ruling says otherwise
- forced movement overrides unit orders and ordinary morale movement
- movement ends on the earlier of duration expiry or 6 metres travelled
- local allies should attempt to give way rather than becoming magical anchors
- terrain and impassable obstacles can create a pinned state
- pinned state disables attack, defence, command, treatment, and item actions but permits speech
- voluntary grabbing of an immovable terrain object may be a deterministic behavioural choice if one is immediately available

Do not use REPEL to grant a tactical retreat route chosen by the target.

## SHATTER

Classification: **core equipment-state effect**.

Official effect:

- an eligible weapon, implement, or shield struck by the call becomes broken and useless
- the item remains broken until repaired by an applicable effect such as the mend spell or artisan's oil
- if a shattered shield is difficult to discard, future blows striking it count as blows to the shield arm

Simulation consequences:

- item entities or individual equipment records need `ready`, `broken`, `dropped`, and possibly `slung` states
- a broken weapon or implement cannot attack, parry, cast through that implement, or provide reach
- a broken shield cannot block
- if retained, its geometry may still physically occupy the arm but offers no defence
- AI should drop or switch away from a broken item when physically and tactically possible
- units may immediately lose role capability: pike line, shield wall, battle-mage casting, and so on
- repair should be a generic timed ability/effect hook rather than a fake `FIXWEAPON` call

`SHATTER` demonstrates why contact must identify the struck object rather than only the target character.

## VENOM

Classification: **core persistent condition tied to casualty timers**.

Official effect:

- the condition lasts until cured
- it does not directly remove hits
- when the victim reaches zero hits, their normal death count is replaced by the shorter venom count
- without Fortitude the venom count is thirty seconds
- each Fortitude level adds ten seconds
- if venom is applied to a dying character with more time remaining than their venom count, remaining time is reduced to the venom limit
- applying venom never increases a shorter existing death count
- normal block or parry prevents the call
- because the condition is not visible, the caller must assume a valid landed call was taken

Fortitude reference:

```txt
0 levels: 30 seconds
1 level: 40 seconds
2 levels: 50 seconds
3 level: 60 seconds
4 level: 70 seconds
5 level: 80 seconds
```

Simulation consequences:

- active characters carry a persistent venom condition without immediate movement penalty
- zero-hit transition selects the venom death-count duration
- applying venom while dying clamps remaining time downward but never upward
- cure removes the condition
- the exact timer behaviour when venom is cured during an active death count should be confirmed before implementation; the Calls page establishes that cure matters but does not fully specify elapsed-time recalculation

## WEAKNESS

Classification: **core persistent active-ability suppression**.

Official effect:

- target cannot make calls, including `EXECUTE`
- target cannot use heroic skills
- target cannot use religious skills
- target cannot cast spells
- target cannot contribute to rituals
- always-on skills, enchantments, and item effects continue to work
- the target may otherwise move and fight normally
- the condition lasts until cured
- normal block or parry prevents the call
- because the condition is not visible, the caller must assume a valid landed call was taken

Simulation consequences:

Every ability or modifier relevant to battle needs an activation classification:

```txt
activeAbility
passiveAlwaysOn
```

Examples that remain active under weakness:

- additional global hits
- permission to wield a polearm
- permission to fire a crossbow
- passive armour/equipment properties

Examples suppressed by weakness:

- spending hero points on heroic skills
- casting spells
- making any call from an active source
- `EXECUTE`
- active religious abilities

Do not disable ordinary weapon attacks, walking, running, blocking, or passive skill qualifications.

---

# MASS calls

Classification: **core area-delivery framework, content-dependent use**.

Official geometry:

```txt
range: 20 feet / 6 metres
shape: 90-degree cone
origin: caster/source position
orientation: caster/source facing
ordinary hit: none
```

Recommended deterministic query:

1. Query spatial cells intersecting a 6-metre bounding radius.
2. Exclude the source entity.
3. Test distance at `<= 6m`.
4. Test angular difference at `<= 45 degrees` from source facing.
5. Sort or iterate by stable entity ID.
6. Apply the paired call effect to every eligible target.
7. Do not apply ordinary hit loss or the attacker-target one-second damage gate.

The official wording says everyone in the area. The initial implementation should therefore be faction-blind. Friendly fire is part of the effect unless a specific source definition overrides it.

Open content issue:

Not every theoretical `MASS + call` combination necessarily exists or makes sense in live content. The engine should support data-defined MASS sources, while scenario and item/spell content should whitelist the combinations that actually occur.

---

# Cures and recovery hooks discovered from linked pages

This extraction does not attempt to implement all healing or magic, but calls cannot be designed as permanent dead ends.

Known relevant hooks:

- `Purify` removes `VENOM` and `WEAKNESS`.
- Swift-cast `Purify` also removes `ENTANGLE` and `PARALYSE`.
- `Relentless` can restore one ruined limb after at least five seconds of appropriate roleplaying and spending a hero point.
- `SHATTER` is repairable by effects such as mend and artisan's oil.
- Further limb restoration, physick, potion, and item rules should be extracted from their own official pages before being implemented.

The generic effect system should therefore support:

```txt
applyEffect
removeEffect
restoreLimb
repairItem
modifyDeathCount
cancelTimedAction
```

Do not encode cures inside individual call modules.

---

# Believable use behaviour

The official rules define what calls do, not when an autonomous fighter should choose them. The following are simulation design inferences and must remain configurable by role, experience, discipline, confidence, orders, and faction doctrine.

## Shared decision factors

A fighter should consider:

- remaining source uses or resources
- likelihood of making valid contact
- whether the target can block or parry
- target armour coverage for `CLEAVE` or `IMPALE`
- target equipment and likely role
- local ally follow-up
- risk during the source's commitment or recovery
- whether the unit is attacking, holding, disengaging, or protecting someone
- whether the effect would be redundant
- what the fighter can actually perceive, not omniscient target state

## Likely battlefield purposes

- `CLEAVE`: remove or disable an unarmoured or lightly protected frontline target; create a breach.
- `IMPALE`: threaten armoured targets and make ranged hits decisive.
- `STRIKEDOWN`: create a temporary opening, collapse a defensive rhythm, or expose a target to allies.
- `ENTANGLE`: pin a mobile target, stop pursuit, hold someone in a kill zone, or disrupt formation movement.
- `PARALYSE`: disable a high-value fighter, healer, caster, or blocker while allies act.
- `REPEL`: peel enemies from allies, clear a chokepoint, break contact, disrupt a shield line, or protect a casualty/treatment action.
- `SHATTER`: remove a shield, long weapon, casting implement, or key defensive item.
- `VENOM`: make a future casualty harder to save; tactically valuable even before zero hits.
- `WEAKNESS`: suppress known or suspected active heroic, magical, or religious capability.
- `EXECUTE`: deny rescue or accelerate an enemy casualty lifecycle when five seconds of exposure is acceptable.
- `CURSE`: scenario-specific rather than ordinary tactical use until a payload exists.

## Knowledge limits

A fighter should not know hidden conditions such as existing `VENOM`, existing `WEAKNESS`, exact remaining hero points, or exact mana unless scenario knowledge provides it. They may infer role from equipment, behaviour, previous observed calls, and unit identity.

---

# Recommended data model

The names below are illustrative, not implementation commitments.

## Stable call identity

```ts
type CallId =
  | "cleave"
  | "impale"
  | "strikedown"
  | "execute"
  | "curse"
  | "entangle"
  | "paralyse"
  | "repel"
  | "shatter"
  | "venom"
  | "weakness";
```

Safety calls must not appear in this union.

## Delivery modes

```ts
type CallDeliveryMode =
  | "strike"
  | "automaticProjectile"
  | "massCone"
  | "timedExecution";
```

## Call source

```ts
interface CallSourceDefinition {
  readonly sourceId: string;
  readonly callId: CallId;
  readonly deliveryMode: CallDeliveryMode;
  readonly compatibleEquipment: readonly string[];
  readonly resourcePool?: "heroPoint" | "mana" | "dailyUse" | "preparedUse";
  readonly resourceCost?: number;
  readonly useCommitPolicy: "onObservedAcceptance" | "onAttempt" | "sourceSpecific";
  readonly requiresActiveAbility: boolean;
}
```

A call definition should not assume that `CLEAVE` always costs a hero point or `PARALYSE` always costs mana.

## Effect state

Prefer explicit authority for mechanically important state over an untyped bag of strings:

```txt
limbState
postureState
forcedMovementState
itemCondition
venomCondition
weaknessCondition
paralysisUntilTick
entangleUntilTick
cursePayloadId
deathCountState
```

A generic effect registry may index and log these, but hot-path systems should own their relevant data directly.

## Resolution record

```ts
interface CallResolutionRecord {
  readonly tick: number;
  readonly sourceEntityId: number;
  readonly targetEntityId?: number;
  readonly targetItemId?: number;
  readonly callId: CallId;
  readonly deliveryMode: CallDeliveryMode;
  readonly contactOutcome: string;
  readonly ordinaryHitApplied: boolean;
  readonly effectOutcome:
    | "applied"
    | "acceptedNoStateChange"
    | "blocked"
    | "immune"
    | "invalidTarget"
    | "missed";
  readonly resourceSpent: boolean;
}
```

Events must explain why a call did or did not apply. “Call failed” is insufficient for debugging.

---

# Recommended Milestone 13 plan

## 13A: Call Vocabulary, Sources, and Migration

Purpose:

- replace the unit-level `SpecialCallCapability` concept with individual call-source capability data
- add the complete official call ID set
- remove `heal`, `restore`, and `fixWeapon` from official call vocabulary
- preserve those concepts as general ability/effect hooks
- add hero-point, mana, daily-use, and prepared-use resource interfaces without implementing every source

No call effects active yet.

## 13B: Common Delivery and Resolution Pipeline

Purpose:

- strike, automatic projectile hook, MASS cone hook, and timed execution delivery types
- one call per blow
- separate ordinary-hit and call-effect outcomes
- block/parry/shield/item contact matrix
- target eligibility and monstrous immunity
- observable acceptance and source consumption
- deterministic resolution and event records

Use inert test effects before activating official calls if necessary.

## 13C: ENTANGLE and PARALYSE

Purpose:

- timed status expiry
- movement-only lock versus complete voluntary-action lock
- speech and externally fed potion permissions
- active/passive ability filtering
- effect removal hooks

## 13D: REPEL and STRIKEDOWN

Purpose:

- forced movement away from source
- distance and duration termination
- obstacle pinning and immovable-object hold
- safe fall within two steps
- grounded and getting-up action state
- cancellation of conflicting active actions

## 13E: CLEAVE and IMPALE

Purpose:

- legal body contact locations
- locational armour coverage
- torso-to-zero and limb ruin
- held-item dropping and hand restrictions
- leg immobility
- melee and automatic projectile delivery sharing one effect resolver

## 13F: SHATTER and Equipment Condition

Purpose:

- struck-item identity
- broken weapon, implement, and shield state
- retained shattered-shield arm-hit behaviour
- switching/dropping decisions
- generic repair hooks without implementing every repair source

## 13G: VENOM and WEAKNESS

Purpose:

- persistent hidden conditions
- Fortitude-dependent venom count
- dying-timer clamp behaviour
- active ability/call suppression
- always-on effect preservation
- Purify/remove-effect hooks
- observable-assumption resource rules

## 13H: EXECUTE

Purpose:

- dying/terminal eligibility
- five-second committed action
- consent-only scripted override
- completion and lifecycle records
- interruption policy documented as an explicit simulation assumption

## 13I: MASS Delivery

Purpose:

- deterministic 90-degree, 6-metre cone query
- faction-blind targeting
- no ordinary hit
- source/content whitelist
- performance coverage for dense formations

## 13J: CURSE, Integration, Behaviour, and Consolidation

Purpose:

- persistent curse marker and optional scenario payload
- tactical call-use policies
- interaction with morale, orders, energy, casualties, treatment, perception, and equipment
- one-hour resource behaviour
- representative performance scenarios
- replay and event inspection
- explicit unresolved interaction matrix

---

# Testing requirements

Minimum headless deterministic coverage:

- same seed and commands produce identical call choices, target selection, resource spending, effects, and expiry
- one call maximum per strike
- ordinary hit and special effect resolve separately
- one-second damage gate applies to the ordinary hit component
- ordinary shield block prevents ordinary hit
- `ENTANGLE`, `REPEL`, and `STRIKEDOWN` pass through weapon parry and shield block
- blocked `CLEAVE`, `IMPALE`, `PARALYSE`, `VENOM`, `WEAKNESS`, and `CURSE` do not apply
- `SHATTER` breaks the contacted item rather than the character
- medium/heavy locational protection against `CLEAVE`
- heavy-only locational protection against `IMPALE`
- torso severe effect, each limb effect, and forced item drop
- projectile `IMPALE` cannot be weapon-parried
- `STRIKEDOWN` does not create tactical movement beyond the safe-fall allowance
- `ENTANGLE` allows upper-body combat but no foot movement
- `PARALYSE` permits speech and external potion feeding only
- `REPEL` stops after 6 metres or ten seconds and pins against obstacles
- `VENOM` clamps but never increases a dying timer
- `WEAKNESS` suppresses active abilities but preserves always-on qualifications and modifiers
- `EXECUTE` requires correct target state and five-second completion
- MASS cone boundary, orientation, faction-blind targets, stable ordering, and no ordinary hit
- monstrous creatures ignore call effects without automatically becoming immune to unrelated ordinary combat rules
- hidden duplicate `VENOM`/`WEAKNESS` can spend a source despite no new state mutation
- blocked or visibly immune effects preserve resources where the source uses observed-acceptance spending

Performance scenarios:

- dense shield line receiving repeated through-defence calls
- multiple simultaneous timed effects without per-tick allocations
- MASS cone across 100, 500, 1000, and 2000 nearby entities
- many short-lived attacker-target source records expiring deterministically
- one-hour soak test for persistent effects and finite resource pools

---

# Current project gaps

The Milestone 4F archive currently stores call vocabulary at unit level in `src/sim/unitLoadout.ts`:

```txt
repel
strikedown
entangle
weakness
heal
restore
venom
cleave
impale
fixWeapon
```

Problems:

- missing official `execute`, `curse`, `paralyse`, and `shatter`
- mixes official calls with non-call abilities/effects
- assigns capability to a whole unit rather than an individual source-holder
- does not identify delivery mode
- does not identify compatible equipment
- does not identify resource type or use count
- does not distinguish spell, skill, item, coating, monster, or scenario source
- has no effect state, duration, body location, item condition, or resolution records

This is acceptable as inactive taxonomy from Milestone 2. It should not be incrementally stretched into the final effect system. Milestone 11 should replace it with individual source data, and Milestone 13 should activate resolution.

---

# Explicit deferrals

Do not pull these into the calls milestone merely because they can generate or cure calls:

- complete spell list and casting system
- every heroic skill
- every magic item
- every potion, oil, herb, and physick treatment
- ritual generation of MASS effects
- detailed monster combat rules
- generic roleplaying effects
- arbitrary referee adjudication
- safety calls
- full audio simulation
- cinematic fall animation
- detailed projectile ballistics

Implement the call semantics and generic source/effect hooks first. Add content sources from their own official pages later.

---

# Open rulings and design decisions

These should be resolved before the relevant implementation slice, either through further official documentation or an explicit project ruling.

## 1. Contradictory simultaneous movement effects

Examples:

- `ENTANGLE` says feet cannot move while `REPEL` says the target must move away.
- `PARALYSE` says the target cannot move at all while `REPEL` imposes forced movement.
- `STRIKEDOWN` may be applied while another lock is active.

Do not silently invent precedence in implementation. Create an explicit interaction matrix.

## 2. Venom cured while already dying

The rules establish that venom can be cured and that it shortens the death count, but the reviewed pages do not fully specify how elapsed and remaining time are recalculated if the condition is removed after the death count begins.

## 3. Incidental head and neck contact

Official rules provide a one-hit outcome, while combat safety forbids deliberate targeting. Proposed initial ruling: autonomous fighters never select head or neck, and incidental unsafe contact is omitted until physical strike-location fidelity makes it useful.

## 4. Execution interruption

The official call requires five seconds of appropriate roleplaying but does not fully define every interruption condition on the reviewed page. The simulation should use a consistent timed-action interruption policy and document it as a project assumption.

## 5. MASS combination whitelist and obstruction

The generic call page defines a cone and everyone within it, but individual source pages determine which MASS effects actually exist. Do not invent a complete unrestricted content catalogue or obstacle-occlusion rule without further sources.

---

# Roadmap impact summary

No milestone reorder is required.

Required roadmap adjustments:

1. Milestone 11 must replace unit-level `SpecialCallCapability` data with individual, source-based call affordances.
2. Milestone 13 must be expanded into the shared delivery/effect/resource slices described above.
3. Milestone 13 must include monstrous immunity, observer-based resource spending, body and equipment state, active/passive ability suppression, and MASS geometry.
4. Milestone 14 remains dependent on Milestone 13 because arrows and bolts automatically deliver `IMPALE`.
5. Safety calls remain entirely outside the simulation roadmap.
