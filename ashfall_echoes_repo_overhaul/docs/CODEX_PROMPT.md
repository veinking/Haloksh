# Codex Mega Prompt — Turn Ashfall Prototype Into an AAA-Feeling Mobile Roguelike Deckbuilder

You are working in the GitHub repo for **Ashfall: Echoes of the Hollow**.

## Mission

Take this browser/PWA prototype and transform it into a premium-feeling, mobile-first dark fantasy roguelike deckbuilder. The visual inspiration is grim pixel/HD-2D atmosphere, but the gameplay must stay close to Slay the Spire: cards, relics, energy, enemy intents, route decisions, build synergy, rewards, and replayable runs.

The current prototype is functional but not AAA-feeling. Your job is to refactor, stabilize, expand, polish, and prepare it for a real mobile game pipeline.

## Absolute Design Direction

**Do not turn this into an action RPG.**

Traversal should be atmospheric and route-presentational. Combat is the real game. The game should feel like:

- Octopath-style visual atmosphere
- Dark Souls-inspired lore and boss tone
- Slay-the-Spire-style strategic deck combat
- Roguelike replayability
- Mobile-first usability

## Current Repo

Key files:

- `index.html`
- `manifest.json`
- `src/js/app.js`
- `src/styles/main.css`
- `src/data/cards.json`
- `src/data/relics.json`
- `src/data/weapons.json`
- `src/data/enemies.json`
- `src/data/events.json`
- `docs/GAME_BIBLE.md`

## Non-Negotiable Quality Goals

1. The game must feel smooth on mobile.
2. Card combat must be satisfying, readable, and tactile.
3. Enemy intent must always be clear.
4. Deckbuilder systems must be data-driven.
5. No feature should be hardcoded if it belongs in JSON/content data.
6. The code must be modular enough to eventually port to Godot or wrap as a mobile app.
7. Add tests or validation scripts where reasonable.
8. Preserve the identity: every card is a memory, every relic is a bargain, first ending is a lie.

---

# Phase 1 — Architecture Refactor

Refactor `src/js/app.js` into modules.

Create:

```text
src/js/core/state.js
src/js/core/save.js
src/js/core/router.js
src/js/core/utils.js
src/js/data/dataLoader.js
src/js/systems/combatSystem.js
src/js/systems/deckSystem.js
src/js/systems/relicSystem.js
src/js/systems/statusSystem.js
src/js/systems/rewardSystem.js
src/js/systems/eventSystem.js
src/js/systems/mapSystem.js
src/js/ui/renderTitle.js
src/js/ui/renderCharacterSelect.js
src/js/ui/renderWorld.js
src/js/ui/renderCombat.js
src/js/ui/renderModal.js
src/js/ui/renderCards.js
src/js/ui/toast.js
src/js/main.js
```

Update `index.html` to load ES modules with:

```html
<script type="module" src="./src/js/main.js"></script>
```

Do not break current gameplay while refactoring.

Acceptance criteria:

- Game loads.
- Character selection works.
- World traversal works.
- Interact prompt works.
- Combat works.
- Rewards work.
- Shop works.
- Campfire works.
- Save/load works.
- Bell Mother false ending works.

---

# Phase 2 — Combat Polish Upgrade

Improve combat feel significantly.

Add:

1. Card lift/press animation.
2. Card play animation toward target.
3. Hitstop on damage.
4. Screen shake by damage tier.
5. Enemy flash on damage.
6. Floating damage numbers.
7. Block crack visual when block absorbs damage.
8. Relic pulse when triggered.
9. Draw/discard pile counters with tap inspection.
10. Energy spend animation.
11. End turn transition.
12. Enemy attack animation based on intent.
13. Player hurt animation.
14. Victory and death transitions.

Mobile constraints:

- Cards must be readable on iPhone-size screens.
- Tap targets must be large.
- Horizontal hand scrolling must feel smooth.
- Do not require drag-and-drop yet unless polished.

Acceptance criteria:

- A player can tell when a card is playable.
- Damage feels impactful.
- Enemy turns are understandable.
- No combat action should feel like a plain spreadsheet update.

---

# Phase 3 — Real Deckbuilder Completeness

Current combat exists but is shallow. Make it a stronger Slay-the-Spire-like loop.

Implement properly:

## Deck Zones

- draw pile
- hand
- discard pile
- exhaust pile

## Card Keywords

Support these in data:

- damage
- hits
- block
- fortify
- draw
- discard
- exhaust
- retain
- innate
- apply enemy status
- apply player status
- add card to draw/discard/hand
- self damage
- heal
- gain energy
- next attack bonus
- conditional bonus if player lost HP
- conditional bonus if enemy has status
- low HP bonus
- power cards
- curse cards
- unplayable cards

## Status Effects

Implement cleanly:

- Strength
- Weak
- Frail
- Vulnerable
- Bleed
- Burn
- Blight
- Ward
- Fortify
- Bound
- Doom

Add status tooltips.

## Powers

Power cards should persist for combat and trigger reliably.

Examples:

- `exhaust_damage`
- `block_damage`
- `curse_draw_energy`
- `attack_heal`

Acceptance criteria:

- Cards in `cards.json` can express most effects without custom JS per card.
- Adding a new card should usually require only JSON.

---

# Phase 4 — Relic System

Relics must become run-defining.

Implement a real event-based relic trigger system.

Trigger hooks:

- onCombatStart
- onTurnStart
- onTurnEnd
- onCardDraw
- onCardPlay
- onAttack
- onSkill
- onPower
- onBlockGained
- onDamageDealt
- onDamageTaken
- onEnemyDeath
- onCombatWin
- onBossWin
- onShopEnter
- onRest
- onLethalDamage

Existing relics should be moved fully into this system.

Add at least 25 more relics to `relics.json`:

Common:
- Old Bandage
- Rusted Coin
- Small Bell
- Grave Thread
- Pilgrim Nail
- Dull Whetstone

Uncommon:
- Rusted Fang
- Bellplate Charm
- Candle Stub
- Rat King Tooth
- Bone Prayer Beads
- Memory Wick

Rare:
- Vein Drinker
- Broken Hourglass
- Lantern Heart
- Mirror Nail
- Ashglass Lens

Cursed:
- Hollow Crown
- Infant Bell
- Mercy Root
- Faceless Mirror
- Wormwood Ring

Acceptance criteria:

- Relic triggers are visible in combat log and UI pulses.
- Relics materially change build direction.
- Cursed relics should be powerful but dangerous.

---

# Phase 5 — Bellgrave Parish Full Vertical Slice

Expand current first region into a complete vertical slice.

## Region Structure

Bellgrave Parish should include:

- 5 regular combat nodes
- 2 elite nodes
- 1 miniboss
- 1 shop
- 1 campfire
- 2 events
- 1 chest
- 1 boss

Still present it as a walkable atmospheric route, but internally treat it like a route map.

## Enemies

Add and implement:

Regular:
- Ash Hound
- Bell-Rat Swarm
- Hollow Pilgrim
- Candle Thief

Elites:
- Bell Knight Penitent
- Wax Saint

Miniboss:
- Candle Butcher

Boss:
- Bell Mother

## Enemy Personality

Each enemy must solve a different problem:

- Ash Hound: fast striker
- Bell-Rat Swarm: multi-hit / swarm pressure
- Hollow Pilgrim: curse/debuff
- Candle Thief: energy drain / tempo
- Bell Knight: armor / delayed slam
- Wax Saint: block + heal
- Candle Butcher: marks cards and punishes unplayed marked cards
- Bell Mother: curses, countdown bell pressure, big toll attacks

Acceptance criteria:

- Fights feel meaningfully different.
- Boss fight is at least 2 phases.
- Bell Mother has a unique mechanic beyond just adding curses.

---

# Phase 6 — Boss Overhaul: Bell Mother

Make Bell Mother feel like a real boss.

Add:

1. Intro cutscene.
2. Phase 1: curses and moderate attacks.
3. Phase 2 at 60% HP: summons Infant Bells or adds countdown bell mechanic.
4. Phase 3 at 30% HP: Great Toll pressure and Confession cards if true pilgrimage flag is active.
5. Unique defeat animation/transition.
6. False ending cutscene after first clear.

## Bell Mechanic

Implement one of:

- Add `Infant Bell` minions with countdown.
- Or add temporary `Bell Countdown` UI that triggers if not answered.

Simpler first version:
- Every 3 turns, Bell Mother adds a Bell Countdown.
- Player can play a special temporary card `Silence Bell` to remove countdown.
- If countdown reaches 0, add 2 Dissonance and deal 8 damage.

Acceptance criteria:

- Bell Mother feels mechanically different from other fights.
- The first win triggers `Ash Lie`.
- After Ash Lie, title screen/world state changes subtly.

---

# Phase 7 — Reward, Shop, Campfire, Chest

Improve run economy.

## Rewards

After combat, offer:

- 3 card choices
- skip option
- gold
- rare chance based on fight type

After elite/miniboss:

- card reward
- relic reward
- more gold

After boss:

- boss relic / unlock / ending

## Shop

Shop should offer:

- 3 cards
- 2 relics
- 1 potion/consumable
- card removal
- maybe mystery bargain

Prices should scale:
- common card 45-60
- uncommon 70-90
- rare 110-150
- relic 120-350
- removal starts 75 and increases

## Campfire

Options:

- Rest
- Upgrade card
- Remove basic card
- Inspect memory
- Later: weapon forge

Acceptance criteria:

- Rewards feel meaningful.
- Shop creates hard choices.
- Campfire creates hard choices.

---

# Phase 8 — Meta Progression and False Ending

Implement persistent meta state separate from current run.

Track:

- false ending unlocked
- endings unlocked
- cards discovered
- relics discovered
- enemies defeated
- deaths
- weapon mastery XP
- NPC states
- memory grave cards
- best run stats

After first Bell Mother win:

- trigger Ash Lie ending
- roll credits-like cutscene
- unlock true pilgrimage flag
- unlock Wax Lantern weapon
- unlock Memory cards pool
- update title screen copy to “The Hollow Remembers”
- add codex entry

Acceptance criteria:

- First win feels satisfying.
- Then it reveals deeper game.
- Starting a new run after false ending has new options.

---

# Phase 9 — UI/UX and Accessibility

Improve mobile UX.

Add:

- Settings screen
- Text size option
- Reduced motion option
- High contrast option
- Mute audio option
- Restart run
- Confirm before deleting save
- Tap-and-hold card tooltip
- Tap status icon tooltip
- Tap relic tooltip
- View draw/discard/exhaust piles
- End turn confirmation only when energy/cards remain, optional setting

Acceptance criteria:

- UI is readable on small screens.
- Tooltips explain keywords.
- Combat can be played comfortably with one thumb.

---

# Phase 10 — Audio and Atmosphere

Add audio system with placeholder generated/royalty-free sounds or silent stubs.

Implement:

- ambient loop hook
- button click
- card play
- attack hit
- block
- enemy hit
- player hit
- relic trigger
- curse added
- boss phase change
- death
- victory
- bell toll

Even if actual assets are placeholders, the code must support audio.

Acceptance criteria:

- Audio can be muted.
- Audio calls do not crash if files missing.
- Boss phase change has a distinct cue.

---

# Phase 11 — Content Expansion

Add enough content to make Bellgrave replayable.

Add:

## Cards

Bring total to 60 cards:
- 15 neutral/basic
- 12 blade
- 10 guard
- 10 blood
- 8 lantern
- 5 curse/root

## Relics

Bring total to 40 relics.

## Events

Add:
- Chained Knight
- Weeping Well
- Candle Girl
- Grave of Yourself
- Broken Shrine
- Dead Merchant
- Bell Puzzle
- Root Door Teaser

Each event should have 2-4 choices and consequences.

## NPC flags

Start with:
- Orvan state
- Lysa state
- Broker debt
- Root mercy accepted count

Acceptance criteria:

- Two runs should feel noticeably different.
- At least one event should react to death memory.
- At least one event should react to weapon choice.
- At least one event should react to false ending flag.

---

# Phase 12 — Testing and Validation

Add a validation script:

```text
tools/validateData.js
```

It should check:

- every starter deck card exists
- every enemy intent is valid
- every card reference exists
- every relic trigger is known
- every event choice references valid IDs
- no duplicate IDs
- required fields present

Add minimal automated tests if project setup allows.

Acceptance criteria:

- Running validation catches broken JSON references.
- No missing card/relic/enemy IDs.

---

# Phase 13 — Packaging

Improve packaging for GitHub Pages and mobile PWA.

Add:

- `package.json`
- simple dev server script
- `README` run instructions
- GitHub Pages notes
- optional service worker for offline play
- version number displayed in game

Possible scripts:

```json
{
  "scripts": {
    "dev": "npx http-server . -p 8080",
    "validate": "node tools/validateData.js"
  }
}
```

Acceptance criteria:

- Repo can be served locally.
- Game works on GitHub Pages.
- Data validation works.
- Mobile Add to Home Screen works if hosted.

---

# Phase 14 — Godot Port Plan

Do not port immediately unless asked. First stabilize the browser prototype.

Create `docs/GODOT_PORT_PLAN.md`.

It should explain:

- scenes
- managers
- data resources
- combat scene
- card UI
- touch controls
- save system
- animation controllers
- mobile export path
- APK/iOS build requirements

Acceptance criteria:

- A future Codex/dev pass can use the plan to port to Godot.

---

# Style and Code Rules

- Use clear module boundaries.
- Avoid giant functions.
- Keep rendering separate from rules.
- Keep data separate from behavior.
- Use semantic naming.
- Write comments only where useful.
- Preserve existing gameplay during refactor.
- Do not add dependencies unless justified.
- Prefer plain JS modules for now.
- Keep performance mobile-friendly.

---

# Definition of Done for This Codex Pass

The pass is complete when:

1. The repo runs locally.
2. Code is modularized.
3. Data validation exists.
4. Combat feels better.
5. Bellgrave Parish has a fuller route.
6. Bell Mother has a real boss mechanic.
7. Rewards, shops, campfires, relics, and deaths are improved.
8. False ending unlocks true pilgrimage state.
9. README is updated.
10. No broken references in JSON.
11. The game still works on mobile browser.

---

# Important Creative Tone

Keep all writing dark, sharp, and non-generic.

Good tone:

> “You were not spared. You were misplaced.”

> “You made it quiet. Why did you think that meant peace?”

> “Gold buys tools. Blood buys doors. Names buy what matters.”

Bad tone:

> “Welcome brave hero, you must save the kingdom.”

Avoid generic fantasy. Keep it eerie, tragic, tactile, and strange.

---

# Final Reminder

This is not supposed to become a normal RPG. It is a premium-feeling roguelike deckbuilder wearing the skin of a ruined pilgrimage.

The player should always feel:

- I can make a better deck.
- I can find a stranger route.
- I can beat that boss cleaner.
- I can unlock the real ending.
- One more run.
