# Official Rules Extraction: Pre-Battle Tonics, Magic Items, and Ritual Enchantments

Status: design extraction and targeted future plan.

Reviewed: 2026-07-11.

Primary official sources:

- Potion and tonic rules: https://www.profounddecisions.co.uk/empire-wiki/Potion
- Artisan and standard crafted-item catalogue: https://www.profounddecisions.co.uk/empire-wiki/Crafting_skills#Artisan
- General magic-item rules: https://www.profounddecisions.co.uk/empire-wiki/Magic_items
- Magic-item index: https://www.profounddecisions.co.uk/empire-wiki/Category:Magic_Items
- Ritual index: https://www.profounddecisions.co.uk/empire-wiki/Category:Rituals
- Spring rituals: https://www.profounddecisions.co.uk/empire-wiki/Category:Spring_Ritual
- Summer rituals: https://www.profounddecisions.co.uk/empire-wiki/Category:Summer_Ritual
- Autumn rituals: https://www.profounddecisions.co.uk/empire-wiki/Category:Autumn_Ritual
- Winter rituals: https://www.profounddecisions.co.uk/empire-wiki/Category:Winter_Ritual
- Day rituals: https://www.profounddecisions.co.uk/empire-wiki/Category:Day_Ritual
- Night rituals: https://www.profounddecisions.co.uk/empire-wiki/Category:Night_Ritual

This document filters those catalogues for effects that explicitly interact with systems already planned for the battle simulation. It does not infer useful combat effects from flavour text.

---

## Executive decision

Treat tonics, bonded magic items, and ritual enchantments as **pre-battle persistent enhancement sources**.

They are selected while authoring a character or scenario, resolved during deterministic battle setup, and then affect the character for the whole simulated battle unless their own rule ends, suspends, consumes, or removes the effect.

Initial implementation does not model:

- drinking or applying these tonics during battle
- crafting or bonding magic items
- performing rituals during battle
- gathering materials or paying ritual mana
- item creation time, expiry across summits, or wealth economy
- ritual performance, coven membership, mastery, magnitude, or crystal-mana calculation
- campaign `military unit` effects

This is a deliberate battle-simulation boundary, not a claim that those procedures do not exist in Empire.

The feature belongs late in the roadmap because it depends on individual hits, calls, conditions, hero points, mana, healing, repair, equipment state, skill qualification, and the character builder. Once those dependencies exist, the runtime framework itself should be relatively small.

---

## Inclusion test

Include a tonic, magic item, or ritual only when its mechanical text explicitly does at least one of the following:

```txt
changes Endurance, Fortitude, hero points, or personal mana
grants a skill already in the canonical skill catalogue
grants or modifies a heroic skill already planned
grants a call or spell whose battlefield effect is already planned
changes healing, Purify, Restore Limb, Chirurgeon, Physick, Exorcism, or Mend behaviour
changes SHATTER repair behaviour
starts, removes, or reacts to VENOM or WEAKNESS
adds a finite daily/battle use of a supported action
converts one already-modelled finite resource into another
creates an explicit linked-character or same-banner combat effect
```

Exclude when its only effects concern:

```txt
campaign armies, fleets, military units, guarding, raiding, scouting, or questing
resource production, trade, crafting output, or ritual-material substitution
a ritualist's lore ranks, ritual magnitude, or ritual performance only
portals, regio, divination, messages, curses outside the battlefield model
fortifications, territory, weather, farms, forests, mines, congregations, or mana sites
roleplaying effects without an explicit planned mechanical consequence
lineage, species, Imperial Orc spiritual strength, vallorn transformation, or husks
ceremonies and priest mechanics other than the already-retained Exorcism surface
traumatic wounds before traumatic wounds are explicitly designed
an omitted weapon category such as one-handed spear or wand
```

When an entry expressly grants a battlefield spell but that spell's casting rules have not yet been reviewed, retain the entry in a **magic-gated catalogue**. Do not invent its mana cost, cast time, range, or interruption behaviour.

---

# Part I: Tonics

## Shared tonic rules

Officially, only one tonic can affect a character at a time; a later tonic replaces the earlier tonic. The full game allows potion use with five seconds of appropriate roleplay, including feeding a willing dying character, but the first simulation implementation selects and applies a tonic before battle.

Runtime slot:

```ts
tonicId?: TonicId;
```

The initial battlefield-relevant catalogue contains eight tonics.

| Tonic | Explicit mechanical effect | Simulation adapter |
|---|---|---|
| Oakenhide Tonic | +1 Endurance until next sunrise | `enduranceDelta: +1` for the battle |
| Winterskin Tonic | +2 Endurance until next sunrise | `enduranceDelta: +2` |
| Ironblood Tonic | +3 Endurance until next sunrise | `enduranceDelta: +3` |
| Tonic of Sunlit Glass | +1 Fortitude until next sunrise | `fortitudeDelta: +1` |
| Tonic of the Distant Shore | +3 Fortitude until next sunrise | `fortitudeDelta: +3` |
| Tonic of Surging Flame | Once that day use Unstoppable without knowing it or spending hero points | one source-specific free `Unstoppable` charge |
| Warming Armour | Subject to VENOM; +3 Endurance for orcs or +2 for humans; premature VENOM removal drops target to zero hits | project species-neutral adapter: +2 Endurance, starting `VENOM`, and `dropToZeroOnSourceConditionRemoved` |
| Weakening Sun | Subject to WEAKNESS; +3 Endurance for orcs or +2 for humans; premature WEAKNESS removal drops target to zero hits | project species-neutral adapter: +2 Endurance, starting `WEAKNESS`, and `dropToZeroOnSourceConditionRemoved` |

Project ruling for species-specific tonics:

- The simulation currently models citizens and barbarians, not human/orc species.
- Use the official human branch, +2 Endurance, for Warming Armour and Weakening Sun.
- Do not add hidden species state solely to obtain the +3 branch.
- Record this as a deliberate simplification and keep the adapter replaceable.

Important interaction:

Warming Armour and Weakening Sun must own their starting condition through a source link. Removing the condition ends the risky tonic effect and immediately sets current hits to zero. A generic `conditionRemoved` event without source ownership is insufficient.

Excluded tonics:

- ritual-lore rank tonics
- ritual mana-substitution tonics
- ceremony-strength tonics
- species-specific Imperial Orc tonics such as Ancestor's Word, Legionnaire's Will, Indomitable Might, and Skar's Strength
- tonics whose only retained effect would be spiritual strength or roleplaying influence

---

# Part II: Magic Items

## General item model

Official personal magic items have three bonding forms:

```txt
weapon
armour
talisman
```

A character may be bonded to at most one personal item of each form. Magical standards and other group items need a separate held-item record rather than being squeezed into a personal talisman slot.

Initial authoring shape:

```ts
interface MagicItemSelection {
  weaponItemId?: MagicItemId;
  armourItemId?: MagicItemId;
  talismanItemId?: MagicItemId;
  standardItemId?: MagicItemId;
}
```

Each definition needs explicit activation requirements:

```txt
bonded
worn
held
wielded
bearing standard aloft
required mundane weapon/armour/shield category
required skill
required current condition
required other equipped item
required linked character
```

If the required item is dropped, slung, broken, no longer worn, or no longer wielded, its effect suspends. Charges already spent remain spent. Effects resume only if the item becomes valid again and its rules permit that.

Do not model crafting materials, months, artisan recipe ownership, bonding ceremonies, or expiration across events.

## Directly supported magic-item effects

The following groups explicitly map onto systems already in the roadmap.

### Passive Endurance, Fortitude, hero-point, and mana modifiers

Retain these as typed stat/resource modifiers rather than bespoke item code.

Endurance items identified in the official catalogue include:

```txt
Hero's Girdle                         +1 Endurance
Pilgrim's Shield                      +1 Endurance while required religious status applies
Warrior's Plate                       +1 Endurance
Bloodamber Hauberk                    +1 Endurance
Soldier's Harness                     +1 Endurance
Shimmergold Coat                      +1 Endurance
Knightly Redoubt                      +2 Endurance
Wardensweave                          +2 Endurance
Winterborn Warmail                    +3 Endurance
Titan's Battlemark                    +5 Endurance while wielding the standard
Gryphonsoul Aegis                     +2 Endurance and +1 hero point
Stormguard Bulwark                    +1 Endurance and +1 mana
Sunfire Pectoral                      +1 Endurance and +1 mana
Battlesmith's Panoply                 +2 Endurance and +2 mana
Oakheart Shield                       +1 Endurance and +1 Fortitude
```

Fortitude items include:

```txt
Stoutheart Gambeson                   +1 Fortitude
Boarskin Vest                         +2 Fortitude
Alabaster Cerement                    +3 Fortitude
Bloodfeather Harness                  +3 Fortitude
Ivory Aketon                          +3 Fortitude
```

Hero-point items include:

```txt
Banner of the Bold                    +1 hero point while wielding the standard
Dawn's Glory                          +1 hero point
Ironbrand Thorn                       +1 hero point
Runebound Ward                        +1 hero point
Runemark Shirt                        +1 hero point
Triumphant Blade                      +1 hero point
Vowkeeper                             +1 hero point
Warden's Bardiche                     +1 hero point
Trollslayer's Crescent                +2 hero points
Wayfinder                             +2 hero points
Runeplate                             +2 hero points
Troubadour's Tunic                    +2 hero points
Thaneshall Banner                     +3 hero points while wielding the standard
Trodwalker's Readiness                +1 hero point and +1 mana
```

Mana items include:

```txt
Neophyte's Aid                        +2 personal mana
Opaline Coat                          +2 personal mana
Ashen Mantle                          +4 personal mana
Twilight Pauldrons                    +4 personal mana
Celestial Sigil                       +5 personal mana while wielding the standard
```

### Explicit skill grants

```txt
Alder's Edge                          grants Weapon Master
Greensteel Bracelets                  grants Shield
Lowther's Gaze                        grants Marksman
```

These become runtime qualification grants. They do not alter the underlying XP build and cease to qualify the character when the item is inactive.

### Resource conversion and event-triggered modifiers

```txt
Arms of the Warwitch                  spend 1 hero point to regain 1 mana, or 3 mana to regain 1 hero point
Warcaster's Oath                      permits Unstoppable using mana under its stated equipment/skill conditions
Champion's Bastion                    regain 1 hit whenever the wearer spends a hero point
Virtuous Ward                         regain additional hits when another character restores hits by a qualifying source
Bloodfire Periapt                     +3 Endurance while VENOM; lose current hits when VENOM is cured/item lost
Abraxus Stone                         hit restoration also cures removable VENOM
Sanguine Thorn                        qualifying Heal also removes VENOM and WEAKNESS
Grimnir's Hearthfire                  qualifying Heal also restores disabled limbs
Altruist's Recompense                 qualifying healing/Purify restores 1 hit to the user
Healer's Harness                      qualifying healing/Purify restores 1 hit to the user
```

These need explicit event subscriptions with stable source IDs, not arbitrary callbacks attached to entities.

### Heroic-skill grants and modifiers

Relentless:

```txt
Jack of Irons                         one free Relentless use per day
Martán's Mark                         one free Relentless use per day
Cerulean Protector                    spend hero point to use Relentless
Defiant Steel                         two free Relentless uses per day
Vambraces of Regeneration             two free Relentless uses per day
```

Unstoppable:

```txt
Warmage's Belt                        one free Unstoppable use per day
Winter's Breath                       one free Unstoppable use per day
Scrivener's Guard                     spend hero point to use Unstoppable
Spiritskin Coat                       two free Unstoppable uses per day
Tombshroud Guardian                   two free Unstoppable uses per day
Baersark's Rage                       Unstoppable restores up to 5 hits
Goldenfire Scale                      Unstoppable restores up to 5 hits
Gravedigger's Vest                    Unstoppable restores up to 5 hits
```

Stay With Me / Get It Together:

```txt
Bolstering Bill                       one free Stay With Me use per day
Troubadour's Ring                     hero-point Stay With Me plus one free daily use
Chirurgeon's Ensign                   affects two valid targets for one Stay With Me cost
Keeper's Habit                        three free Get It Together uses per day
Circlet of Command                    affects two valid targets for one Get It Together cost
Loyal Stanchion                       five free Get It Together uses per day
Bondring                              one free linked-target Stay With Me or Get It Together per day
```

Other heroic/call modifiers:

```txt
Rake's Progress                       a successful CLEAVE may extend to a second target under its timing rule
```

Bondring requires explicit pre-battle linked-character selection. It must not search dynamically for a convenient friend.

### Call-granting weapons and implements

These items expressly grant supported calls or replace one supported call with another. They can reuse the Milestone 13 delivery/effect engine.

Hero-point or charge-based melee calls:

```txt
Apprentice's Blade                    CLEAVE with one-handed weapon
Farmer's Scythe                       STRIKEDOWN with polearm
Marauder's Cote                       CLEAVE with eligible melee weapon
Sanguine Spear                        CLEAVE with polearm
Biting Blade                          one daily CLEAVE with one-handed weapon
Reaving Mattock                       one daily IMPALE with great weapon
Butcher's Cleaver                     IMPALE with great weapon
Butcher's Bill                        one daily CLEAVE or STRIKEDOWN with polearm
Giant's Maul                          one daily STRIKEDOWN with great weapon
Vorpal Sword                          two daily CLEAVE uses
Landsknecht's Zweihander              two daily IMPALE uses with great weapon
Fell Iron Fury                        two daily CLEAVE or STRIKEDOWN uses with polearm
Ironbound Axe                         three daily CLEAVE uses with one-handed weapon
Bullroarer's Shout                    three daily STRIKEDOWN uses with polearm
Labyrinth's Gate                      IMPALE with polearm
Trollhammer                           PARALYSE with great weapon
Captain's Command                     STRIKEDOWN or REPEL with great weapon
Shieldbreaker                         SHATTER when striking a shield
Bravo's Blade                         IMPALE with one-handed weapon
Bear Claws                            SHATTER after the paired-hit requirement
Woodcutter's Axe                      SHATTER with great weapon
Terunael Warlord                      limited choice of ENTANGLE, REPEL, or CLEAVE
Splintering Hammer                    one daily SHATTER with great weapon
Thundering Mace                       one daily STRIKEDOWN with one-handed weapon
Barbed Spear                          VENOM with polearm
Magistrate's Grasp                    ENTANGLE with polearm
Thresher's Cudgel                     SHATTER when striking an eligible magical implement
Duelist's Scales                      WEAKNESS with one-handed weapon and self-WEAKNESS
Scorpion's Sting                      one daily VENOM with dagger and self-VENOM
```

Magic/call crossover items:

```txt
Binding Threads                       ENTANGLE on a valid hit under its armour restriction
Children of Thunder                   REPEL on a valid hit under its armour restriction
Earthquake Drummers                   REPEL after its simultaneous paired-hit requirement
Warden's Fists                        limited CLEAVE or no-mana REPEL option
Furrowed Wake                         may replace ENTANGLE spell result with STRIKEDOWN
Jade Hammers                          spend mana to deliver STRIKEDOWN using paired arcane items
Shears of Winter                      grants SHATTER access under paired item requirements
Witches' Hammer                       two free SHATTER uses per day
Thorns of the Rose                    successful ENTANGLE can enable an IMPALE follow-up
Sceptre of Necropolis                 replaces PARALYSE spell result with IMPALE
Suzerain's Command                    limited free ENTANGLE or REPEL uses
Caress of Arhallogen                  limited free VENOM or PARALYSE uses
```

Do not retain one-handed spear item variants. Do not retain wand items. Do not convert either category into a neighbouring supported weapon.

### Healing, treatment, Purify, Restore Limb, Exorcism, and repair

Directly reusable or supportable entries include:

```txt
Acolyte's Mercy                       grants Heal
Forlorn Hope                          grants Heal
Mazzarine Spindle                     grants Restore Limb
Runesmith's Gavel                     grants Mend
Swanfeather Schema                    grants Purify
Icon of Justicar                      grants Exorcism while validly wielded
Mendicant Cassock                     one qualifying religious-skill use without liao
Bloodsilver Spike                     one free swift Heal per day
Redsteel Chisel                       two free Mend uses per day
Beneficent Sigil                      Exorcism may remove WEAKNESS instead
Phial of Sun                          +1 flexible Physick treatment use per day
Ambergelt Baton                       one combined Heal, Purify, and Restore Limb use per day
Blacksmith's Wage                     self-repair the weapon with hero point and committed action
Brother Blades                        one daily paired-weapon repair action
Blood-sweat Hauberk                   limited self-removal of VENOM
Goldentide Mail                       hero-point self-removal of VENOM
Chrysalis Pendant                     hero-point Restore Limb action
Boneweaver                            limited free Restore Limb uses
Burnished Rampart                     hero-point self-repair of shield
Blood-dimming Tide                    limited free swift Heal uses
Bloodwoven Braid                      limited free Heal uses
Trollsweave Vest                      limited no-mana Heal uses if qualified
Robe of Blood and Bone                limited free Heal/Purify/Restore Limb uses on another
Woundbinder                           limited free Heal uses
Radiant Torrent                       limited free swift Heal uses
Forge of Isenbrad                     swift Mend using mana
Moonsilver Doublet                    swift Heal using mana
Bloodcloak                            +3 flexible Physick treatment uses per day
Thorn's Dance                         limited five-second Restore Limb actions
Warsmith's Shingle                    limited five-second SHATTER repair actions
```

Under the project's generic herb abstraction:

- Phial of Sun adds one generic Physick treatment charge.
- Bloodcloak adds three generic Physick treatment charges.
- Do not reintroduce herb species solely for these items.

### Magic-gated item catalogue

The following kinds of items explicitly grant battlefield spells or modify spellcasting that maps to planned effects, but cannot become active until a dedicated Magic/Spellcasting review defines spell cost, cast time, range, swift casting, interruption, implements, and targeting:

```txt
items granting ENTANGLE, REPEL, PARALYSE, VENOM, WEAKNESS, HEAL, PURIFY,
RESTORE LIMB, MEND, or combinations of those spells
staffs that grant several battlefield spells
items that make a supported spell free, swift, repeatable, or replace its call
items that permit a spell using an alternative resource
```

Known examples include:

```txt
Staff of Command
Staff of Life
Staff of Imperial Mastery
Lamia's Whisper
Landskeeper's Oath
Pugilist's Shillelagh
Storm Sceptre
Unseen Encasement
Yeoman's Bounty
Agramant's Bargain
Quiet Word
Amberglass Chain
Death's Door
Enfeebling Echo
Tumultuous Gyre
Ethereal Manacle
Stormweaver
Mountainfall Bracers
```

Retain their catalogue metadata, but mark them `activationDependency: magicSpellcastingReview`.

### Explicit magic-item exclusions or deferrals

Exclude:

- ritual-focus items that only add ritual ranks or substitute materials
- production, campaign, fleet, military-unit, trading, and resource items
- divination, communication, portal, regio, and political items
- roleplaying/spiritual-strength-only effects
- one-handed spear and wand items
- artisan recipe and creation rules

Defer:

- Empower-granting items until Empower is reviewed
- traumatic-wound resistance items until traumatic wounds exist
- effects whose official text is conditional on omitted species/lineage mechanics
- rare plot/unique items unless an explicit scenario requests one
- ambiguous entries whose exact item form or target requirement has not been checked

---

# Part III: Ritual Enchantments

## General ritual model

The initial implementation models only an enchantment that has already been successfully performed before battle.

It does not simulate the ritual performance.

Most direct character enchantments expressly allow only one enchantment on a target at a time. Multi-target enchantments still apply that one enchantment to each named target. The simulation therefore needs:

```ts
interface RitualEnhancementSelection {
  directEnchantmentId?: RitualId;
  inheritedApplications?: readonly RitualApplicationId[];
}
```

`inheritedApplications` is reserved for explicit group/banner applications whose current official rules support several named characters. It is not a loophole for stacking direct enchantments.

Application rules:

- assign exact target character IDs at setup
- do not dynamically follow later sim-unit membership changes
- preserve source ritual and application IDs in replay metadata
- normalize event/season duration to the whole simulated battle
- do not calculate magnitude, contributors, mana, lore ranks, or ritual failure
- do not confuse an official `banner` or `band` targeting condition with every member of a simulation unit

## Curated relevant ritual catalogue

Only rituals with an explicit battlefield mechanical effect are retained below.

### Spring

```txt
Call Down Lightning's Wrath           battle-mage offensive spell can deliver STRIKEDOWN with staff
Chirurgeon's Healing Touch            two Stay With Me uses per day
Viridian's Wildfire Emberstrike       battle-mage offensive spell can deliver CLEAVE with staff
Fountain of Life                      grants Heal, Purify, and Restore Limb
Touch of Vile Humours                 one daily VENOM delivery with eligible weapon/implement
Unending Cascade of Blood's Fire      repeatable magical VENOM access
Vitality of Rushing Water             hit restoration also removes removable VENOM
Skin of Bark, Blood of Amber          +3 Endurance
Irrepressible Monkey Spirit           two daily uses chosen from Unstoppable or Relentless
Hands of the Healer                    modifies Heal casting speed/cost under its exact rules
Forest Remains                        two daily SHATTER uses with great weapon
Good Green Oak                        +1 Endurance
Rhythm of the Tempest                 repeatable REPEL access with staff
A Goblet of Stars                     Physick can treat with broader herb substitutions
```

Project adapter notes:

- A Goblet of Stars remains inactive while herbs are a single generic pool unless the project adopts a specific generic-charge interpretation.
- Spell-granting entries remain magic-gated.

### Summer

```txt
Skar's Gentle Push                    grants Shield
Crimson Ward                          +2 Endurance while wearing mage armour
Star's Mantle                         grants one Extra Mana rank
Unbreakable Spirit, Unbreakable Blades one daily Mend use for eligible item
Vigour of Youth                       +3 Fortitude
Sound of Drums                        two Unstoppable uses per day
Splendid Panoply of Knighthood        +1 Endurance to its valid target group
Champion's Shining Resolve            +2 hero points
Devastating Maul                      hero-point SHATTER with great weapon
Mantle of Lordly Might                three daily uses chosen from Stay With Me/Get It Together
Mantle of the Kriegszauberer          +3 Endurance and +4 mana under mage-armour condition
Glory to the Sovereign                +2 Endurance and two daily CLEAVE uses
Remember the Fallen                   up to five same-banner warriors gain two supported calls per day
Unbreakable Behemoth's Strength       +5 Endurance
Might of the Myrmidon                 grants Weapon Master, Shield, Thrown, and offensive heroic skills
Thundering Roar of the Lion-bound Horn one MASS REPEL use
Strength of the Bull                  +1 Endurance
Hammer of Thunder                     one daily IMPALE with great weapon
Swan's Cruel Wing                     one daily CLEAVE with eligible weapon
Swift Leaping Hare                    one daily STRIKEDOWN with polearm
```

Remember the Fallen needs an explicit per-character charge pool and call choice constrained by its official weapon requirements. It does not create a shared unit-wide pool.

Defer Glorious Crown of Enchantment until Empower exists. Defer Stout Resolve until traumatic wounds exist. Exclude campaign army, fortification, and military-unit effects.

### Autumn

```txt
Stance of the Constricting Scourge    one daily ENTANGLE with eligible weapon/implement
Brazen Claws of the Lictor            repeatable ENTANGLE access
Sum of the Parts                      +3 Endurance
Circle of Gold                        up to five linked targets gain one daily Stay With Me on each other
Smooth Hands Shape the World          swift Mend using mana under its qualification rules
Shadow of the Bronze Colossus         +4 Endurance while wearing heavy armour
Inescapable Chains of the Immortal    one MASS ENTANGLE use
```

Circle of Gold requires an explicit ritual-linked target set, not merely `sameUnit == true`.

Defer Barked Command of the Iron Serjant until its exact current granted-weapon permissions have been represented. Exclude direct immediate repair rituals such as Anvil of Estavus because they are not persistent pre-battle enhancements.

### Winter

```txt
Hunger of the Draughir                +1 Fortitude
Crumbling Flesh and Withering Limbs   two daily CLEAVE uses with rod
Petrifying Command                    two free PARALYSE uses per day
Ravenous Tongue of Entropy            grants SHATTER, WEAKNESS, and PARALYSE spell access
Fight Tooth and Nail                  two Unstoppable uses per day
Unending Onslaught                    two Relentless uses per day
Pallid Flesh of the Dead              +3 Endurance and starting VENOM
Hungry Grasp of Despair               repeatable WEAKNESS access
Sorin's Chastising Touch              repeatable CLEAVE access with rod
Coil of the Black Leech               self-healing trigger associated with successful WEAKNESS casting
Devastating Scythe                    IMPALE access with staff
Howling Despite of the Yawning Maw    one MASS WEAKNESS use
Grave's Treacherous Edge              one MASS VENOM use
```

Defer effects with incomplete quantities or traumatic-wound mechanics. Exclude harmful campaign curses, corpse-information rituals, production effects, and roleplaying-only enchantments.

### Day

```txt
Horizon Razor                         one daily CLEAVE with eligible weapon
Alignment of Mind and Blade           one daily IMPALE with supported one-handed weapon branch
Kimus' Glaring Eye                    limited REPEL targeting
Blades of Clear Sight                 three daily IMPALE uses with Weapon Master requirement
Irresistible Stance of Force          four daily REPEL uses
Irresistible Stance of Focus          four daily REPEL uses
A Perfect Moment                      grants Marksman
Revelatory Light of the Empyrean Spheres one MASS PARALYSE use
```

Exclude the one-handed spear branch of Alignment of Mind and Blade. Retain spell-granting ascendance rituals only as magic-gated catalogue entries.

### Night

```txt
Embrace the Living Flame              +1 hero point
Still Waters Running Deep             +3 hero points
```

Most Night rituals are excluded because their explicit mechanics concern information, roleplaying, ritual performance, production, transformation, or campaign resources rather than current battlefield systems.

## Ritual exclusions

Explicitly ignore:

- any ritual that buffs an official campaign `military unit`, army, fleet, navy, fortification, territory, resource, or downtime action
- immediate healing/repair rituals performed during the battle
- ritual-learning, ritual-lore, mana-substitution, or coven-performance effects
- curses and enchantments with only narrative/ref-defined results
- lineage/species transformation and spiritual-strength effects
- location auras unless a later terrain/aura review explicitly adds them
- direct ritual casting as an AI action

---

# Shared Enhancement Architecture

## Source data

```ts
type PreBattleEnhancementKind =
  | 'tonic'
  | 'magicItem'
  | 'ritualEnchantment';

interface PreBattleEnhancementSource {
  id: string;
  kind: PreBattleEnhancementKind;
  effects: readonly EnhancementEffectDefinition[];
  activationRequirements: readonly EnhancementRequirement[];
  incompatibilityTags: readonly string[];
  implementationState: 'supported' | 'magicGated' | 'deferred';
}
```

Recommended typed effect primitives:

```txt
statDelta
maximumResourceDelta
grantRuntimeSkill
grantAction
grantCallSource
sourceSpecificChargePool
resourceCostSubstitution
conditionalModifier
startingCondition
onResourceSpent
onHitsRestored
onConditionRemoved
onSuccessfulCall
linkedTargetRestriction
equipmentActivationRequirement
repairActionModifier
treatmentActionModifier
```

Do not create a general-purpose scripting language. Most catalogue entries should be data over a small typed vocabulary; genuinely unusual effects should use named deterministic adapters.

## Source-owned state

Every persistent or charged effect needs its source identity:

```txt
source character
source tonic/item/ritual ID
source item entity where applicable
ritual application ID
remaining charges
active/suspended/consumed/removed state
linked condition or linked target set
```

This is necessary for:

- dangerous tonic removal
- magic-item suspension after drop or SHATTER
- daily use accounting
- same-banner and bonded-person restrictions
- identifying which effect should end when an enchantment is replaced
- deterministic replay and debugging

## Derived stat pipeline

Do not mutate maximum hits or resource maxima ad hoc when loading content.

Recommended setup order:

```txt
1. identity, team, nation, unit, and base human profile
2. purchased or trusted runtime skills
3. mundane equipment and armour
4. bonded magic-item validation and skill grants
5. tonic selection
6. direct ritual enchantment
7. explicit multi-target ritual applications
8. derive effective skills, Endurance, Fortitude, hero maximum, and mana maximum
9. initialise current hits and resource pools
10. apply starting conditions such as VENOM or WEAKNESS
11. create source-specific daily charge pools
12. validate contradictions and unsupported dependencies
13. preserve all setup choices in replay metadata
```

Starting current hits should normally equal the derived maximum after all valid pre-battle bonuses. Risky tonic conditions then apply from tick zero.

## Mid-battle activation changes

The system must support enhancement suspension even though enhancement creation is pre-battle only.

Examples:

- dropping a magical standard suspends `while wielding` bonuses
- SHATTERing a bonded weapon or shield suspends its magical properties
- changing to an unqualified equipment state may suspend an effect
- curing VENOM can end Warming Armour or Bloodfire Periapt logic
- using the last charge leaves the source present but exhausted

Open rules question for later exact review:

> When an active +Endurance source stops applying, how should current hits change if they exceed the new maximum?

Do not silently choose clamping, hit loss, or temporary overflow while implementing unrelated work. Resolve this once against the current official general rules and encode it centrally.

---

# Roadmap Placement

Add:

## Milestone 19: Pre-Battle Persistent Enhancements

This comes after character creation/XP because:

- the user-facing selection belongs naturally on authored characters
- runtime dependencies already exist by then
- magic items can grant skills and affect equipment legality
- many effects consume hero points or mana
- healing, repair, calls, conditions, and item state must already be authoritative
- the content catalogue is broad enough to deserve isolated testing and consolidation

It may look mechanically easy—and the basic stat modifiers are—but it creates a wide interaction matrix. Late placement protects earlier milestones from being forced to support hundreds of dormant source definitions.

Suggested slices:

```txt
19A enhancement source IDs, typed effect primitives, and deterministic setup pipeline
19B tonic slot and eight supported tonic definitions
19C magic-item forms, bonding selections, activation requirements, and passive modifiers
19D magic-item skill grants, hero/mana conversions, charges, and event triggers
19E magic-item call/heroic/treatment/repair adapters
19F ritual enchantment slot and explicit multi-target application records
19G curated Spring/Summer/Autumn/Winter/Day/Night catalogue
19H character-builder and scenario-schema selection UI/data
19I source suspension, SHATTER/drop interactions, replay/debug views, property tests, and consolidation
```

## Testing requirements

- only one tonic can be selected
- only one personal item of each official form can be selected
- direct ritual enchantment exclusivity
- explicit multi-target ritual links remain stable when units split or merge
- same seed/setup produces identical effective profile and charge pools
- unsupported magic-gated entries fail authoring validation rather than partially activating
- Warming Armour/Weakening Sun start the required condition and drop to zero when it is removed
- magic-item skill grant affects runtime qualification but not purchased XP
- item drop/SHATTER suspends only effects requiring that item
- source-specific charge pools do not leak between identical item definitions
- hero/mana conversion cannot exceed derived maximums unless an official effect explicitly allows it
- daily charges do not replenish during a normal one-hour battle
- dangerous condition removal, healing triggers, and item-loss triggers resolve in stable order
- replay contains selected source IDs, activation states, charges, and explicit ritual target sets
- performance scales linearly with equipped entities and does not scan the whole catalogue each tick

## Boundary

No in-battle potion use, ritual performance, item crafting, bonding ceremony, wealth simulation, campaign resource system, ritual-magnitude engine, arbitrary effect scripting, or complete spell catalogue.

