# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

A collection of self-contained browser games. Each game is a **single HTML file** with all CSS and JS inline — no build tools, no dependencies, no package manager.

To play any game: open the `.html` file directly in a browser.

## Conventions

- **One file per game** — HTML, CSS, and JS all inline in a single `.html` file.
- **No external libraries** — Canvas API, vanilla JS, and standard DOM only.
- **Dark background, neon color palette** — consistent visual style across games.
- **All game state lives in JS variables** — no localStorage, no backend.

## Current Games

| File | Description |
|------|-------------|
| `tictactoe.html` | 2-player Tic Tac Toe with score tracking. Dark/neon theme (`#1a1a2e` bg, `#e94560` X, `#a8dadc` O). |
| `shooter_game.html` | 2D side-scrolling Canvas shooter (800×450px). Player: cyan. 3 enemy types. Physics with gravity, 6 platforms, particle effects. Game states: start → playing → gameover. |
| `hoops/index.html` | 3D basketball quick match (Three.js, NBA-2K-style). 3v3 full court; you control one MyPlayer. Timing-based shot meter, dunking, AI teammates/opponents, 3:00 + 24s shot clock. Block-primitive models. |
| `fortnite-org-sim/` | **Exception to the single-file rule** — a React + Vite + TypeScript + Tailwind app (esports org management **DUOS** sim). Run with `START.bat` or `npm start`. See its own README.md / TUNING.md / MATCH-SIM.md. |
| `fortnite-drop-index/index.html` | Not a game — a reference page. Every named Fortnite POI from C1 S1 to C7 S4 (220 across 40 seasons), tier-ranked S–D on the loot-rarity palette. Board view (tier rows) + Dossier view (by season), filters, click-through detail drawer. Open via `Fortnite Drop Index.url`. |

## fortnite-org-sim (APEX ORG)

The only project here with a build step, because the user asked for React + Vite
+ TypeScript + Tailwind explicitly. Key rule: **all balance numbers live in
`src/data/*.json`** (commented with `__`-prefixed keys) so a non-developer can
tune the game without touching code. Never hard-code balance in `src/engine/`.

- The game mode is **DUOS** (two players per team), not trios.
- Players are rated on **7 categories / 29 sub-stats** defined in
  `src/data/attributes.json`. Category scores are DISPLAY ONLY — the engine must
  always read individual sub-stats. Every player carries two full rating sets:
  `current` (shown, used by the sim) and `peak` (hidden ceiling).
- **Big Stage Nerve** applies only at LAN / Grand Finals, cannot be trained, and
  is earned per LAN appearance. It is the headline progression mechanic.
- `src/data/real_players.json` holds 22 real reference players and 10 real orgs
  fielding 11 duos. An org carries a LIST of duos (`orgs[].duos[]`, each with a
  stable `id`), because real orgs field more than one — Twisted Minds run
  boltz/Acorn and Cold/Rapid. A real player can be signed to an org and in NO
  duo (Clix). A seat naming somebody outside the file gets a generated
  stand-in, never an invented version of a real person.
  Ratings there are ESTIMATES; ages, orgs, duos and real names are SOURCED
  (see `__SOURCES`). Real players never get an `ego`; under-18s have no real
  name. Those rules are enforced in `src/engine/realPlayers.ts`. An entry with
  `org: null` is a FREE AGENT — no buyout, no contract, in no rival duo, but
  still behind the reputation gate. **Potential is `peak_overall` and nothing
  else** — it is set off verified age on the ladder in `__POTENTIAL`, and each
  player carries a `potential_note` arguing their number. `npm run verify`
  checks all of it.
- **The real roster is read only at `createNewGame`**, so adding a player to
  `real_players.json` does NOT reach a save that already exists. `syncRealScene()`
  (game.ts, called from `loadFromLocal`) re-reads the file into an old save on
  every load — new names onto the market, new orgs get a rival duo, everyone
  else brought back in line — instead of a SAVE_VERSION bump that would throw
  the save away. It never touches a player you have signed. `npm run verify:sync`
  proves it against a faked 12-player save.
- `src/engine/` — rng (seeded mulberry32, state serialises into the save),
  players (generation, current/peak, scouting fog, progression), realPlayers
  (the real roster + rival orgs), sim (5-phase match engine), tournament
  (calendar + modelled field + named real-org standings), training,
  game (state + advanceWeek), save (localStorage + JSON export/import).
- **The match engine is sub-stat native.** sim.ts reads the 29 sub-stats
  directly; `legacyAttrs`/`legacyBridge` survive ONLY for training.json's
  program list (build step 6) and must die with it.
- A lobby is **50 duos** (`balance.json` → simulation.lobby). Placements come
  from a tracked survivor curve, not random bands, and the scoring table in
  tournaments.json is written for 50 teams.
- Fighting is a MULTIPLIER on raw power, not an additive stat. Big Stage Nerve
  applies only at events flagged `"lan": true`. Clutch is read only in a real
  1v2. Each player is simulated separately (own mats/shield/form), so one can
  be knocked and rebooted while the other plays the 1v2.
- `src/ui/` — one file per screen. The shell is a **season calendar home page**
  plus a bottom-left **hub menu** (`Hub.tsx`) for every other screen; there is
  no tab bar. `Season.tsx` is the home page and also handles tournament entry.
  `PlayerSheet.tsx` is the click-any-player full stat sheet, opened through a
  context provider so any screen can trigger it.
- The look is broadcast-sports: near-black ground, one electric accent, hard
  edges, wide-tracked uppercase labels, tabular numbers. All tokens live at the
  top of `src/index.css` as CSS variables — restyle there, not per component.
- `npm run calibrate` runs thousands of simulated sessions and prints balance
  stats. Run it after touching the engine or `balance.json`.
- `lobbyRating` in `tournaments.json` is on the TEAM POWER scale, not the
  individual rating scale. Team power ≈ 1.45 × player OVR − 8, so a DUO of
  50-OVR players is ~65 and a duo of real players (~90 OVR) is ~126.

## shooter_game.html Architecture

The shooter is driven by a single `requestAnimationFrame` loop calling `update(now)` then `draw()`.

- **Game state machine:** `state` variable — `'start'`, `'playing'`, `'gameover'`
- **Physics:** `applyPlatformCollisions(obj)` handles gravity landing, head bumps, and world bounds — shared by player and ground-based enemies; flyers skip this and clamp to screen bounds manually
- **Collision:** AABB for player↔enemy body contact; circle-AABB (`circleAABB`) for bullet↔enemy and enemy bullet↔player
- **Difficulty scaling:** spawn interval and enemy speed both derived from `score` at runtime
- **Input:** `keys` object (keydown/keyup), `mouse` position (mousemove), `mousedown` fires bullets and transitions state; `keys['Shift']` triggers dash

### Enemy types

| Type | Color | AI | Score |
|------|-------|----|-------|
| `grunt` | Red | Walks toward player, jumps when player is above | 10 |
| `flyer` | Purple | Flies (no gravity/platforms), sine-wave vertical movement, tracks player altitude | 15 |
| `shooter` | Orange | Maintains ~220px distance, fires projectiles at player every ~2s | 20 |

Enemy types unlock by score: grunts only (<30), grunts+flyers (<80), all three (≥80).

### Player mechanics

- **Weapon cooldown:** `player.shootCooldown` — 18 frames between shots. Enforced in `mousedown`. Green `GUN` bar in HUD.
- **Dash:** `Shift` key. 10-frame burst at speed 14 in facing direction. Invincible during dash (`dashActive` keeps `invincibleTimer` alive). 90-frame cooldown. Blue `DASH` bar in HUD. Cyan particle trail.
- **Invincibility:** 120-frame window after any hit (blink effect). Dash also grants brief invincibility.

### Projectiles

- `bullets` — player shots (yellow), speed 12, aimed at mouse cursor
- `enemyBullets` — shooter enemy shots (orange), speed 5, aimed at player position at fire time

## Git & GitHub

- Remote: `https://github.com/jojjobot/worth-it` (renamed from `neon-shooter` 2026-05-22; worth-it/ is deployed at https://jojjobot.github.io/worth-it/)
- Commit and push after every meaningful change.
