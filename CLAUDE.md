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
