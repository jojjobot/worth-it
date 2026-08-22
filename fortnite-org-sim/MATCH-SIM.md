# How a match is simulated

A match is never one random roll. It is five phases, each a contested check, and
each one feeds state into the next. The code is `src/engine/sim.ts`; every
weight and chance it uses comes from `balance.json` → `simulation`.

---

## Before the match

**Team stats.** For each attribute the three players are blended into one number:

```
teamValue = average + aggregation × (best − average) + synergy
```

`teamAggregation` in `balance.json` sets that blend per attribute:

- `gameSense: 0.65` — one smart IGL can call for the whole trio.
- `clutch: 0.6` — one clutch player is enough.
- `lootPathing: 0.35` — everyone has to loot properly.
- `comms: 0.15` — comms is nearly a pure average.

**Synergy** is a flat bonus or penalty applied to every attribute, from average
Comms, average and highest Ego, matches played together, and archetype mix
(having an IGL helps; three of the same archetype hurts).

**Fatigue** is subtracted from match 5 onwards, scaled per attribute — Editing
and Build Speed fall off hardest, Game Sense barely at all. Stamina cancels most
of it.

**Form.** Each player rolls a single normal number for the match, with a spread
set by their Consistency. A 30-Consistency player swings wildly; a 90 barely moves.

**Burnout** from over-training is subtracted on top.

Every check then compares:

```
winChance = 1 / (1 + e^−(myPower − theirPower) / duelScale)
```

where `theirPower` is the tournament's lobby rating plus a normal roll.

---

## Phase 1 — DROP

The game plan sets how likely your POI is contested (Contest 92%, Balanced 45%,
Zone 10%), plus 9% per W-Key Aggro player in the trio.

**Contested:** `0.55 × Aim + 0.30 × Build Speed + 0.15 × Editing` against the lobby.

- Win → 1–3 elims, +250 mats, +30 shield.
- Lose → 72% of the time you die there, placement 68th–96th. Otherwise you
  survive with 220 fewer mats and 45 less shield.

**Uncontested:** +120 mats and a quiet start.

## Phase 2 — LOOT and ROTATE

Loot Pathing converts straight into resources:

```
mats   = base + lootPathing × 5.6   (capped at 1300)
shield = base + lootPathing × 0.72  (capped at 100)
```

Then a rotate check: `0.70 × Game Sense + 0.30 × Loot Pathing` against a lobby
that is 4 points harder than normal.

- Win → clean rotate.
- Lose → 38% chance you die out of position (38th–72nd). Otherwise you get in
  late having burned 200 mats and 40 shield — and sometimes trade for an elim.

## Phase 3 — MID GAME

How many fights you *choose* to take:

```
fights ≈ (1.1 + 0.75 per aggro player) × strategy modifier
```

Contest ×1.35, Balanced ×1.0, Zone ×0.65, capped at 6.

Each fight is `0.40 × Aim + 0.22 × Build Speed + 0.20 × Piece Control +
0.18 × Editing`, minus 9 if you are under 200 mats. Win → 1–3 elims and
resources. Lose → 80% chance you are wiped (14th–46th).

Then **zone pressure**: two unavoidable checks nobody can play around, using
`0.40 × Game Sense + 0.25 × Piece Control + 0.20 × Endgame + 0.15 × Build Speed`.
Failing one is an 86% death. **This is what makes reaching the top 15 an
achievement rather than the default** — tune it with
`midGame.forcedEncounters`.

## Phase 4 — ENDGAME

You enter at 15th place and fight down one circle at a time using
`0.36 × Piece Control + 0.34 × Endgame + 0.18 × Clutch + 0.12 × Build Speed`.

Each surviving circle:

- makes the next opponent **1.9 points stronger** (the last few circles are all
  sweats),
- burns ~95 mats, reduced by high Piece Control,
- has a 42% chance of an elim.

Two things kill greedy trios here:

- **Running out of mats** costs a brutal 26 power. This is why the mats you
  carried out of the early game matter.
- **Shield under 50** costs another 7.

A failed check can still be rescued by **Clutch** (up to a 22% save, scaled by
how far above 50 the team's Clutch is). Surviving every circle wins the match.

## Phase 5 — RESULT

Placement and elims go into the scoring table in `tournaments.json`:

```
1st = 60 · 2-3rd = 50 · 4-5th = 45 · 6-10th = 40 · 11-15th = 30 · 16-25th = 20
each elim = 2
```

---

## The rest of the field

Simulating 3000 rival trios phase by phase for every tournament would be slow
and pointless, so rivals are modelled statistically (`simulation.aiField`): each
gets a strength drawn around the lobby rating, which converts to expected points
per match, plus noise. Your real simulated score is then ranked against them.

Those numbers are calibrated against the real phase simulation. If you change
the match engine meaningfully, run `npm run calibrate` and adjust
`aiField.pointsPerMatchBase` so a trio sitting *at* the lobby rating scores
about that many points per match — otherwise ranks and prize money drift.

---

## Reading the log

Every match produces a one-line summary and an expandable phase breakdown:

```
Match 4 — Dropped Grand Terminal contested, won the fight (3 elims).
Rotated late and burned mats getting in. Lost the piece in the endgame.
died 13th. 42 pts.

  DROP · contested Grand Terminal · power 76.8 vs 72.2 (66%)
    won the drop fight, +3 elims, +250 mats
  LOOT · loot pathing 82 → 1089 mats, 100 shield
  ROTATE · read 84.6 vs 88.1 (37%)
    bad rotate: -200 mats, -40 shield
  MID GAME · took 1 fight
    fight 1: won (61%), +1 elims
    zone pressure 1: held on (74%)
    zone pressure 2: held on (68%)
  ENDGAME · reached top 15 with 620 mats
    top 13: lost the piece (44%)
```

The percentages are the real win chances the engine rolled against, so you can
see exactly where a session went wrong.
