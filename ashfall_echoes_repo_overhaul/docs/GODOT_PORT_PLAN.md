# Godot Port Plan

Do not port until the browser prototype has stable systems and content.

## Target

Godot 4.x, 2D mobile-first.

## Main Scenes

- MainMenu.tscn
- CharacterSelect.tscn
- WorldRoute.tscn
- Combat.tscn
- Reward.tscn
- Shop.tscn
- Campfire.tscn
- Event.tscn
- Codex.tscn

## Managers

- GameManager
- SaveManager
- RunManager
- CombatManager
- DeckManager
- RelicManager
- StatusManager
- RewardManager
- EventManager
- AudioManager
- AnimationManager

## Data

Convert JSON into Godot Resources or keep JSON loaded at runtime.

## Mobile Export

- Android APK first
- iOS later requires Apple developer setup
- Keep portrait orientation first
- Large tap targets
- Low memory sprite atlases

## Art

Replace CSS sprites with sprite sheets:
- player male/female idle/walk/combat
- enemies
- boss
- card frames
- UI panels
- particles

## Combat Feel

Godot should add:
- real tweening
- particles
- camera shake
- audio
- sprite animation tree
- shader glow
