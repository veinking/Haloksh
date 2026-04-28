# Ashfall: Echoes of the Hollow

A mobile-first dark fantasy roguelike deckbuilding RPG prototype.

**Design target:** Octopath-like atmosphere and traversal flavor, Slay-the-Spire-like gameplay depth.

This repo is a browser/PWA prototype intended to be pushed to GitHub and iterated with Codex before a later Godot/mobile APK port.

## Current Build

This repo overhaul includes:

- Mobile-first PWA shell
- Data-driven cards, relics, weapons, enemies, and events
- Light side-scrolling traversal for atmosphere
- Interact prompts instead of auto-collision
- Slay-the-Spire-inspired combat:
  - Draw pile / hand / discard / exhaust
  - Energy
  - Block
  - Fortify
  - Enemy intents
  - Status effects
  - Curses
  - Card rewards
  - Shops
  - Campfires
  - Death memory
- First region: Bellgrave Parish
- Boss: The Bell Mother
- False ending: The Ash Lie

## How to Run

Open `index.html` in a browser.

For mobile testing, host the folder on any static file server and open it on your phone. Then use "Add to Home Screen" for app-like behavior.

Example local server:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Repo Structure

```text
.
├── index.html
├── manifest.json
├── src
│   ├── data
│   │   ├── cards.json
│   │   ├── enemies.json
│   │   ├── events.json
│   │   ├── relics.json
│   │   └── weapons.json
│   ├── js
│   │   └── app.js
│   └── styles
│       └── main.css
├── docs
│   ├── CODEX_PROMPT.md
│   └── GAME_BIBLE.md
└── assets
    ├── audio
    ├── concept
    └── sprites
```

## Honest Status

This is still a prototype, not a production game. It is structured to support the next phase:

1. Stabilize code architecture.
2. Add a real renderer layer.
3. Add sprite sheets and animation states.
4. Add sound.
5. Expand content.
6. Port to Godot or Capacitor-style mobile app packaging.
7. Prepare APK/iOS builds.

## Core Design Rule

Traversal is flavor. Combat is the game.

Every system should support:
- replayability
- clean deckbuilding
- readable enemy intent
- satisfying combat feedback
- meaningful run choices
- dark worldbuilding
- false ending into deeper game
