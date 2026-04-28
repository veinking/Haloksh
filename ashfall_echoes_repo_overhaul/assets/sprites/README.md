# Sprite + Animation Pipeline (AAA-ready scaffold)

Current build still uses CSS-driven placeholder silhouettes, but the runtime is now wired for richer animation states:

- Player states: `idle`, `attack`, `cast`, `hurt`
- Enemy states: `idle`, `attack`, `chant`, `hit`
- Stage FX layers: `embers`, `fog`, `shake-light`, `shake-heavy`
- Accessibility: `prefers-reduced-motion` fallback

## Expected atlas layout (future content)

```text
assets/sprites/
  player/
    hollowbound_male.png
    hollowbound_female.png
    hollowbound.json
  enemies/
    ash_hound.png
    bell_knight.png
    bell_mother.png
    enemies.json
  fx/
    embers.png
    smoke.png
    slash.png
    fx.json
```

## Animation naming contract

Use this naming convention in future sprite metadata so runtime adapters stay stable:

- `player_idle`
- `player_attack_light`
- `player_attack_heavy`
- `player_cast`
- `player_hurt`
- `enemy_idle`
- `enemy_attack`
- `enemy_chant`
- `enemy_hurt`
- `enemy_death`

## Style target

- Dark Souls tone in idle/impact: weighty anticipation and recovery.
- Slay-the-Spire readability in combat: clear telegraph > impact > settle.
- Keep silhouettes readable on small mobile screens first.
