# Official Skills, Character XP, Runtime Resources, and Banners — Simulation Extraction

Status: design extraction and project rulings.

Reviewed: 2026-07-11.

Primary official sources:

- https://www.profounddecisions.co.uk/empire-wiki/Skills
- https://www.profounddecisions.co.uk/empire-wiki/Characters
- https://www.profounddecisions.co.uk/empire-wiki/Combat_skills
- https://www.profounddecisions.co.uk/empire-wiki/Magical_skills
- https://www.profounddecisions.co.uk/empire-wiki/Surgical_skills
- https://www.profounddecisions.co.uk/empire-wiki/Religious_skills
- https://www.profounddecisions.co.uk/empire-wiki/Exorcism
- https://www.profounddecisions.co.uk/empire-wiki/Crafting_skills
- https://www.profounddecisions.co.uk/empire-wiki/Heroic_skills
- https://www.profounddecisions.co.uk/empire-wiki/Calls
- https://www.profounddecisions.co.uk/empire-wiki/Bands

This document extracts only rules and behaviour relevant to the deterministic top-down Empire battle simulation. Lineage, nation-specific character creation, Imperial Orc distinctions, personal-resource economics, non-battle priest ceremonies, and most artisan crafting are deliberately excluded.

---

## 1. Core placement decision

Skills have three separate concerns and must not be implemented as one tangled system:

```txt
runtime qualification
runtime effect/resource use
character-build legality
```

Runtime qualification answers questions such as:

- may this character wield a pike?
- may this character use a large shield?
- does this character have extra hits?
- may this character perform Chirurgeon treatment?
- does this character possess Cleaving Strike?

Runtime effect/resource use answers questions such as:

- how many hero points remain?
- how much mana remains?
- can this five-second heroic action begin?
- does this exorcist have liao?
- does this physick have a herb?

Character-build legality answers questions such as:

- did the character have enough XP to buy these skills?
- were prerequisites purchased?
- was the increasing repeat-purchase cost calculated correctly?
- is the assigned equipment legal for the purchased skills?

The first two are needed before full calls, treatment, and support-role behaviour. The third can remain deferred to a dedicated character creation and roster-authoring milestone.

Until that later milestone, scenario and loadout content may assume that every entity has the XP and skills required for its assigned equipment and battlefield role.

---

## 2. Character XP and advancement

Official rules establish:

- a new character begins with 8 points to spend on skills
- unspent XP may be saved
- skill points spent on a character are locked to that character
- players gain one XP after attending their first event in a year and a second XP after attending their third event
- repeatable skills either increase in cost with each purchase or retain a flat cost, depending on the skill

The simulation does not need to reproduce event attendance. The future character builder should instead accept an explicit XP budget, defaulting to 8 for an ordinary starting citizen, and validate purchases against that budget.

Suggested authoring data:

```ts
interface CharacterBuildDraft {
  characterId: CharacterId;
  name: string;
  team: "citizen" | "barbarian";
  unitId: UnitId;
  xpBudget: number;
  purchases: readonly SkillPurchase[];
  equipment: IndividualEquipmentDraft;
  roleTags: readonly RoleTag[];
}

interface SkillPurchase {
  skillId: SkillId;
  ranks: number;
}
```

Derived validation should expose:

```txt
xp spent
xp unspent
missing prerequisites
illegal repeat count
illegal equipment
unfunded role capability
maximum hits
maximum hero points
maximum mana
support-role inventories
```

Project boundary:

- nation and lineage are absent
- Imperial Orc character restrictions are absent
- the only team distinction is `citizen` versus `barbarian`
- name, XP, skills, equipment, unit, and team are enough for the first authoring model

---

## 3. Skill definition model

A skill definition should be data-driven and able to express prerequisites and repeat costs without bespoke character-builder code for each skill.

Suggested shape:

```ts
type RepeatCostRule =
  | { kind: "notRepeatable" }
  | { kind: "flat"; costPerRank: number }
  | { kind: "increasing"; firstCost: number; increasePerRank: number };

interface SkillDefinition {
  id: SkillId;
  category: SkillCategory;
  prerequisiteSkillIds: readonly SkillId[];
  repeatCost: RepeatCostRule;
  runtimeClassification:
    | "equipmentPermission"
    | "passiveModifier"
    | "activeHeroic"
    | "activeMagic"
    | "activeTreatment"
    | "activeCeremony"
    | "activeRepair";
}
```

Do not store prerequisite knowledge only in UI code. The same validator must work in headless tests, scenario imports, future UI, and replay metadata.

---

## 4. Relevant combat skills

### Thrown

Official cost: 1 XP.

Simulation effect:

- permits use of the `thrown` weapon category
- thrown weapons remain subject to the later recoverable-projectile system
- this is an always-on equipment permission and continues to function under `WEAKNESS`

### Ambidexterity

Official cost: 1 XP.

Simulation effect:

- permits a dual-wield loadout using two compatible one-handed weapons or implements
- does not bypass the one-second per-attacker/per-target damage rule
- requires both held items to be ready and the relevant arms usable
- if one arm is disabled or one item is shattered/dropped, the character falls back to the remaining item

The simulation does not need exact inch measurements for each item. A weapon/equipment definition should carry a simple `ambidextrousCompatible` flag.

### Weapon Master

Official cost: 2 XP.

Simulation effect:

- permits `greatWeapon`, `polearm`, and `pike`
- one-handed spears are explicitly excluded from project content
- provides an additional prerequisite for Mortal Blow and Mighty Strikedown
- extends Cleaving Strike to compatible larger weapons
- remains an always-on qualification under `WEAKNESS`

### Marksman

Official cost: 4 XP.

Simulation effect:

- permits the unified `ranged` weapon category
- bow and crossbow are aesthetic variants only
- ranged attacks require both hands
- every landed ranged projectile automatically delivers `IMPALE`
- remains an always-on equipment permission under `WEAKNESS`

### Shield

Official cost: 2 XP.

Simulation effect:

- any character may use a `buckler`
- the `Shield` skill permits the larger `shield` category
- shield protection is active facing/coverage defence rather than passive damage reduction
- `ENTANGLE`, `REPEL`, and `STRIKEDOWN` still apply through a shield block, without the ordinary hit
- remains an always-on equipment permission under `WEAKNESS`

### Endurance

Official first cost: 2 XP.

Official repeat rule: each later rank costs one more XP than the previous rank.

Simulation effect:

```txt
+1 maximum global hit per rank
```

This is an always-on passive modifier and remains active under `WEAKNESS`.

### Fortitude

Official first cost: 1 XP.

Official repeat rule: each later rank costs one more XP than the previous rank.

Simulation effect:

Normal death count:

```txt
rank 0: 3 minutes
rank 1: 4 minutes
rank 2: 6 minutes
rank 3: 9 minutes
rank 4: 13 minutes
rank 5: 18 minutes
```

Under `VENOM`:

```txt
rank 0: 30 seconds
rank 1: 40 seconds
rank 2: 50 seconds
rank 3: 60 seconds
rank 4: 70 seconds
rank 5: 80 seconds
```

Use a formula for normal Fortitude where practical, but retain table tests for accepted ranks so later refactors cannot quietly change it.

Fortitude is an always-on passive modifier and remains active under `WEAKNESS`.

### Dreadnought

Official cost: 1 XP.

Simulation effect:

```txt
if hasDreadnought && armour == heavy:
  +1 maximum global hit
```

Project ruling: all simulated heavy armour is substantial steel-equivalent armour and therefore qualifies. No material/thickness subtype is stored.

Dreadnought is a skill, never an armour category. It is an always-on modifier under `WEAKNESS`.

---

## 5. Relevant magical skills

### Magician

Official cost: 2 XP.

Prerequisite role: required before any other magical skill.

Simulation effect:

- grants a maximum of 4 personal mana
- grants the basic spell capability set
- permits use of a rod as a mage implement
- personal mana does not regenerate during a normal battle
- active spellcasting is suppressed by `WEAKNESS` and `PARALYSE`

The basic spells and the complete selectable spell list should be reviewed on the dedicated Magic/Spellcasting pass. The skills milestone only needs the selected spell IDs and resource pool.

### Extra Mana

Official first cost: 1 XP.

Official repeat rule: each later rank costs one more XP than the previous rank.

Simulation effect:

```txt
+2 maximum personal mana per rank
```

Suggested derivation:

```txt
maximumMana =
  (hasMagician ? 4 : 0)
  + (2 * extraManaRanks)
  + temporaryAlwaysOnManaModifiers
```

### Extra Spell

Official cost: 1 XP per purchase, with a flat repeat cost.

Simulation effect:

- permits one additional selected spell per rank
- does not grant mana
- spell IDs are authoring data
- exact spell effects remain deferred to the Magic/Spellcasting rules pass

### Battle Mage

Official cost: 2 XP.

Prerequisite: Magician.

Simulation effect:

- permits use of `staff` as a mage implement
- permits `mageArmour`
- mage armour grants its existing two-hit equipment bonus
- mage armour does not protect against `CLEAVE` or `IMPALE`
- Battle Mage does not grant additional mana by itself

Wands remain excluded.

---

## 6. Relevant surgical skills and herbs

### Chirurgeon

Official cost: 1 XP.

Prerequisite role: required before Physick.

Official battlefield effect:

- thirty uninterrupted seconds treating a character at zero hits
- pauses the patient's death count while treatment remains valid
- restores one global hit on completion
- fails and restarts if healer or patient attacks, or either is hit

Project default:

- every Physick also has Chirurgeon

### Physick

Official cost: 3 XP.

Prerequisite: Chirurgeon.

Relevant official effects:

- can restore a limb disabled by `CLEAVE` or `IMPALE`
- can apply herbs to remove conditions or restore hits
- cannot use Physick on themselves

Existing project treatment abstraction remains authoritative for the simulation:

- battlefield issues are treated one at a time
- each treatment action takes 30 uninterrupted seconds
- the physick continues treating the current patient until all treatable issues are resolved or a higher-priority casualty supersedes them after the current action

Project consumable simplification:

```txt
starting generic herbs: 12 per Physick
cost: 1 herb per completed Physick treatment action
```

The generic herb pool replaces individual Bladeroot, Roseweald, Mazzarine, Marrowort, and True Vervain inventories for now.

Recommended interruption rule:

- reserve a herb when treatment begins
- consume it only when treatment successfully completes
- release the reservation if treatment is interrupted

This preserves the important official behaviour that an interrupted herb application does not destroy the herb.

Chirurgeon treatment of a zero-hit patient does not require a herb merely to restore the first hit. A Physick may optionally consume a herb during the same treatment only when a separate eligible issue is also being resolved under the project's treatment action rules.

---

## 7. Relevant religious skills, liao, and simplified CURSE

### Dedication

Official cost: 2 XP.

Simulation effect:

- prerequisite for Exorcism
- no other priest mechanics are currently modelled
- virtue choice, auras, anointing, consecration, testimony, and similar systems are excluded

### Exorcism

Official cost: 1 XP.

Prerequisite: Dedication.

Relevant official ceremony rules:

- requires liao
- requires at least ten seconds of roleplaying
- usually requires touch range and target presence throughout
- fails if priest or target attacks or is hit

Project consumable simplification:

```txt
starting liao: 9 per Exorcist
cost: 1 liao per completed exorcism
```

Project scope deliberately ignores cooperative ceremony strength and variable spirit resistance for the generic battlefield curse.

### Simplified deterministic CURSE

This is a deliberate project replacement for the official ref-authored `CURSE` call, which otherwise has variable narrative effects.

On receiving the simulated `CURSE` effect, the character:

- stops attacking and defending as an active combatant
- abandons formation-slot following and current unit/order priorities
- slowly moves toward the nearest known or visible friendly Exorcist
- avoids enemies, hostile-controlled space, and active combat where possible
- does not contest objectives, rally allies, carry casualties, treat patients, repair equipment, cast spells, or use heroic abilities
- remains able to walk and navigate
- dies if not cured within 15 minutes

Only a completed Exorcism cures this simplified curse.

Suggested state:

```ts
interface CurseState {
  appliedTick: number;
  fatalAtTick: number;
  knownExorcistTargetId?: EntityId;
  navigationMode: "seekExorcist" | "seekFriendlySafety";
}
```

If no friendly Exorcist is currently known, the character moves toward a low-threat friendly/rear area and continues searching rather than pathing omnisciently to an unseen priest.

On cure:

- clear the curse timer and compulsive movement state
- restore ordinary decision-making
- do not teleport the character back into formation
- let normal reform/order systems reacquire the character

Important project ruling:

- generic hero-point resistance to roleplaying effects does not resist or cure this simplified CURSE
- only Exorcism cures it

---

## 8. Relevant artisan skill and repair consumables

### Artisan

Official cost: 4 XP.

Relevant simulation effect only:

- permits application of Artisan's Oil to repair an eligible shattered item

Everything else about crafting, item recipes, material production, bonding, and downtime is ignored for now.

Runtime inventory:

```txt
Artisan's Oil is finite
default starting quantity: 6 doses per Artisan
scenario definitions may explicitly override this default
```

Existing project behaviour remains:

- citizens with a shattered primary item seek a known or visible friendly Artisan when they lack a usable backup
- Artisan's Oil repair is an uninterrupted timed action
- barbarians do not require Artisan; they move to terrain or the battlefield edge and perform their existing 30-second self-repair abstraction

---

## 9. Relevant heroic skills and hero points

### Hero

Official cost: 2 XP.

Prerequisite role: required before every other heroic skill.

Simulation effect:

```txt
+2 maximum hero points
```

### Extra Hero Points

Official first cost: 1 XP.

Official repeat rule: each later rank costs one more XP than the previous rank.

Simulation effect:

```txt
+1 maximum hero point per rank
```

Suggested derivation:

```txt
maximumHeroPoints =
  (hasHero ? 2 : 0)
  + extraHeroPointRanks
  + mediumArmourHeroPointBonus
  + temporaryAlwaysOnHeroPointModifiers
```

Hero points begin full in an ordinary battle scenario and do not regenerate during the battle.

### Cleaving Strike

Official cost: 1 XP.

Prerequisite: Hero.

Runtime effect:

- spend one hero point to deliver `CLEAVE` with a compatible weapon strike
- ordinary one-handed weapons may qualify without Weapon Master
- Weapon Master extends eligibility to compatible larger weapons up to the official limit
- mage implements may not deliver this heroic call

Project equipment data should use a `supportsCleavingStrike` flag rather than reconstructing exact physical inches during combat.

### Mortal Blow

Official cost: 1 XP.

Prerequisites:

```txt
Hero
Weapon Master
```

Runtime effect:

- spend one hero point to deliver `IMPALE`
- requires a compatible great weapon
- does not work with polearms, pikes, rods, staves, or ranged weapons

Use an explicit `supportsMortalBlow` equipment flag because the simplified `greatWeapon` category does not preserve every official shape/material distinction.

### Mighty Strikedown

Official cost: 1 XP.

Prerequisites:

```txt
Hero
Weapon Master
```

Runtime effect:

- spend one hero point to deliver `STRIKEDOWN`
- requires a compatible two-handed polearm

Use an explicit `supportsMightyStrikedown` equipment flag.

### Relentless

Official cost: 2 XP.

Prerequisite: Hero.

Runtime effect:

- spend one hero point
- perform a five-second committed self-recovery action
- restore one disabled arm or leg caused by `CLEAVE` or `IMPALE`
- making an attack interrupts/restarts the action without spending the point

Simulation behaviour:

- high priority when a leg injury makes the character immobile
- high priority when the disabled arm prevents use of the primary role
- may be deferred briefly if beginning the five-second action would be suicidal
- successful use removes the corresponding casualty/treatment demand

### Unstoppable

Official cost: 2 XP.

Prerequisite: Hero.

Runtime effect:

- spend one hero point
- remain stationary and take no offensive action for five seconds
- restore up to three global hits
- may begin immediately after falling to zero hits
- cannot be delayed and then activated from zero hits
- does not repair disabled limbs or remove `VENOM`
- cannot be used under `WEAKNESS` or `PARALYSE`

Required explicit action state:

```txt
eligibleImmediateZeroHitWindow
committedUntilTick
startedAtZeroHits
```

If begun immediately at zero hits, the character remains vulnerable to normal effects during the action but ends with three hits if the action completes according to the official skill rule.

AI priority:

- immediate survival option at zero hits when legal
- otherwise favoured at dangerously low hits during a defensible pause
- competes with offensive hero-point uses through a per-character resource policy

### Stay With Me

Official cost: 1 XP.

Prerequisite: Hero.

Runtime effect:

- spend one hero point
- touch-range five-second uninterrupted action on a companion at zero hits
- restore one hit and end the ordinary dying state
- does not restore a disabled limb
- if user or target attacks, or either is hit, restart without spending the point

Behaviour:

- acts as a fast rescue alternative when a physick is absent, occupied, too distant, or the death count is urgent
- should not cause every hero to abandon formation for every casualty
- local relationship, command responsibility, available hero points, threat, and nearby physick capacity influence use

### Get It Together

Official cost: 1 XP.

Prerequisite: Hero.

Runtime effect:

- spend one hero point
- touch-range five-second uninterrupted action on a companion who still has at least one hit
- restore up to three lost hits
- does not restore a disabled limb
- if user or target attacks, or either is hit, restart without spending the point

Behaviour:

- normally used during a lull or behind a line
- favours low-hit allies whose continued role is valuable
- does not target a zero-hit casualty; that is Stay With Me or Chirurgeon territory

---

## 10. Runtime resource ownership

Every resource belongs to an individual, not a unit aggregate.

Required pools:

```txt
currentHeroPoints / maximumHeroPoints
currentMana / maximumMana
currentHerbs / maximumHerbs
currentLiao / maximumLiao
currentArtisanOil / maximumArtisanOil
```

The unit may expose derived summaries such as:

```txt
available hero points
available mana
available physick treatments
available exorcisms
available repairs
```

Those summaries are advisory and must not spend resources directly.

Resource event records should include:

```txt
entity
resource type
amount before
amount after
source skill/action
success or refund/release reason
```

No resource replenishes during an ordinary one-hour battle unless a later explicit spell, item, scenario, or reinforcement rule says so.

---

## 11. Active versus always-on classification

This distinction already matters because `WEAKNESS` suppresses active abilities while leaving always-on permissions and modifiers intact.

Always-on examples:

```txt
Thrown equipment permission
Ambidexterity equipment permission
Weapon Master equipment permission
Marksman equipment permission
Shield equipment permission
Endurance hits
Fortitude timers
Dreadnought hit
Battle Mage equipment permission and mage armour qualification
```

Active examples suppressed by `WEAKNESS`:

```txt
spellcasting
Exorcism
Cleaving Strike
Mortal Blow
Mighty Strikedown
Relentless
Unstoppable
Stay With Me
Get It Together
```

Chirurgeon and Physick should remain modelled as active treatment abilities. Whether `WEAKNESS` suppresses mundane treatment is not implied by the call text and should remain allowed unless a later official rule says otherwise.

---

## 12. Hero-point tactical policy

Hero points are a shared individual budget across offensive, defensive, recovery, and rescue skills.

A character with multiple heroic skills should not maintain separate charges for each skill.

Suggested decision inputs:

```txt
current hits
active limb disability
current/nearby casualty urgency
current target armour and role
chance of a called blow landing
remaining hero points
nearby physick availability
current order
local threat
experience and aggression profile
battle time remaining
```

Broad priority direction:

- `Unstoppable` at zero hits is time-critical and must be decided immediately
- `Relentless` becomes urgent when the character cannot move or perform their primary role
- `Stay With Me` is urgent for a nearby dying ally when no faster medical option is credible
- `Get It Together` is valuable but rarely worth using in direct contact
- offensive calls are used against targets where the effect is expected to matter
- competent users avoid spending finite calls into visibly protective armour or impossible delivery situations

Do not give veterans perfect optimisation. Experience should improve resource judgement without making it omniscient.

---

## 13. Banner behaviour

The official Bands page defines banners as warrior bands but does not provide the battlefield morale behaviour required here. The following is a project behavioural rule.

Some units possess a physical banner.

While the banner is present, held/displayed, and available to the unit:

- members have higher morale/confidence
- routed or scattered members are more willing to reform
- reform attraction and persistence are stronger
- the banner provides a visible local rally reference rather than magical global knowledge

Enemy behaviour:

- a visible hostile banner increases target attractiveness
- this attraction applies mainly when the enemy has no more appropriate objective, immediate threat, assigned target, or valuable local opportunity
- enemies do not abandon urgent objectives or expose themselves absurdly merely because a banner exists

Suggested data:

```ts
interface UnitBannerState {
  unitId: UnitId;
  carrierEntityId?: EntityId;
  positionEntityId?: EntityId;
  state: "held" | "displayed" | "dropped" | "absent";
}
```

Suggested derived effects:

```txt
morale support
reform attraction
reform patience
enemy opportunistic target score
```

Perception remains authoritative. A character cannot rally on or target a banner they do not know about.

Exact hand occupation, banner weapon use, capture, and formal band/gonfalon rules remain deferred until the relevant official page is reviewed.

---

## 14. Milestone ownership

### Milestone 5: Individual combat

Owns minimal runtime hooks required for ordinary combat:

- equipment permissions as trusted profile data
- Endurance hit levels
- Dreadnought qualification
- Fortitude data hook
- Ambidexterity combat profile
- skill-derived maximum hits

It does not validate XP purchases.

### Milestone 6: Casualties and treatment

Owns active mechanics for:

- Chirurgeon
- Physick
- generic 12-herb inventory
- uninterrupted actions and patient prioritisation

### Milestone 11: Roles, skills, equipment, resources, and banners

Owns:

- canonical skill IDs and definitions
- prerequisites and repeat-cost metadata
- individual hero-point and mana derivation
- selected spell IDs
- liao, herb, and Artisan's Oil inventories
- support-role profiles
- banner item/carrier state
- banner morale/reform/target-attraction integration

It still does not require every scenario entity to be built through XP validation.

### Milestone 13: Calls and active battlefield abilities

Owns:

- Cleaving Strike
- Mortal Blow
- Mighty Strikedown
- Relentless
- Unstoppable
- Stay With Me
- Get It Together
- simplified CURSE
- Exorcism cure behaviour
- hero-point and liao spending during these actions

Full spell content waits for the dedicated Magic/Spellcasting review, but the mana pool and source interfaces already exist.

### Milestone 18: Character creation, XP validation, rosters, and deployment

New dedicated late milestone.

Owns:

- named character creation
- arbitrary/default XP budgets
- skill purchase UI/data model
- prerequisite validation
- repeat-cost validation
- equipment and role legality
- derived resources and stats
- assignment to citizen/barbarian team and a specific unit
- roster import/export and deterministic scenario deployment

---

## 15. Suggested implementation slices for Milestone 11 additions

```txt
11A canonical skill IDs, definitions, prerequisites, and runtime classification
11B trusted individual skill profiles and derived equipment permissions
11C hero-point and mana maximum/current resource stores
11D support consumable stores: herbs, liao, Artisan's Oil
11E combat/survivability skill derivation: Endurance, Fortitude, Dreadnought
11F magical profile: Magician, Extra Mana, Extra Spell, Battle Mage
11G support-role profile: Chirurgeon, Physick, Dedication, Exorcism, Artisan
11H heroic capability profile and compatible-equipment tags
11I banner carrier/state, morale/reform integration, and target-attraction policy
11J integration, scenario defaults, replay, validation, and performance coverage
```

These are data/content/runtime-resource slices. Active call and heroic action resolution remains in Milestone 13.

---

## 16. Suggested implementation slices for the new character milestone

```txt
18A skill catalogue and XP-cost evaluator reuse
18B character draft, name, team, unit, and stable ID
18C purchase/prerequisite/repeat validation
18D equipment and role legality validation
18E derived hits, hero points, mana, and support inventories
18F roster authoring, import/export, and scenario deployment
18G simple authoring UI and validation feedback
18H deterministic tests, example builds, and consolidation
```

The headless build validator must exist before the UI. The UI is not the source of truth, because we have suffered enough.

---

## 17. Explicit exclusions

Do not include in this pass:

- lineage
- nation mechanics
- Imperial Orc-specific rules
- personal resource production/economics
- ritual lore or ritual performance
- priest skills other than Dedication and Exorcism
- artisan crafting other than Artisan's Oil repair
- exact herb types
- exact bow/crossbow differences
- wands
- one-handed spears
- formal banner/coven/sect bonuses
- magic item catalogue
- spell catalogue beyond selected spell IDs and mana requirements

---

## 18. Testing requirements

Minimum headless tests:

- every skill cost and prerequisite
- increasing costs for Endurance, Fortitude, Extra Mana, and Extra Hero Points
- flat repeat cost for Extra Spell
- illegal Physick without Chirurgeon
- illegal Exorcism without Dedication
- illegal heroic skill without Hero
- illegal Mortal Blow or Mighty Strikedown without Weapon Master
- equipment permission matrix
- maximum hit derivation from Endurance and Dreadnought
- maximum hero-point derivation
- maximum mana derivation
- resources do not replenish during battle
- interrupted treatments do not consume generic herbs
- simplified CURSE abandons combat and seeks a perceived friendly Exorcist
- simplified CURSE kills after 15 minutes if uncured
- Exorcism consumes one liao on successful cure
- cursed characters cannot use ordinary combat/support behaviour
- banner presence improves morale/reform outputs
- banner attraction only affects opportunistic enemy target selection
- deterministic roster deployment from the same authored character data

