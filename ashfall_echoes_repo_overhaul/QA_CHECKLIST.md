# QA Checklist

## Fresh install/load
- No existing save launches title screen.
- Continue only appears with active save.

## New run
- Start run, choose loadout/weapon/body, map loads.

## Map routing
- Reachable nodes highlight correctly.
- Completing a node unlocks valid next nodes.

## Combat / Enemy turn / Statuses / Boss phase
- Card play, end turn, status ticks resolve once per action.
- Boss phase transition triggers once and continues turn flow.

## Rewards / Relics
- Card and relic reward selections cannot be double-picked.
- Invalid reward data falls back without blank UI.

## Events / Shop / Rest
- Event choice applies once; event combat returns to map safely.
- Shop purchases cannot be double-bought; sold items stay sold.
- Rest actions apply once and persist after refresh.

## Save/load + recovery
- Refresh keeps run state.
- Old string-card save migrates successfully.
- Corrupt primary save attempts backup recovery.

## Run end / Meta progression
- Win/loss/abandon records run history once.

## Mobile Safari / PWA
- No key controls under home bar.
- Modals fit viewport; no horizontal overflow.

## Reduced motion/high contrast + stress tapping
- Focus outlines visible, controls labeled.
- Rapid tapping does not duplicate card/reward/shop/event actions.
