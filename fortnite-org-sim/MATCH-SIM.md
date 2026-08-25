# How a match is simulated

A match is never one random roll, and a duo is never one blended stat line. The
code is `src/engine/sim.ts`; every weight and chance it uses comes from
`balance.json` → `simulation`.

Three rules shape everything below.

1. **Sub-stats only.** Every check names the individual sub-stats it reads out
   of the 29-stat tree. There is no 11-attribute bridge left in the engine.
2. **Fighting is a multiplier.** Aim and Mechanics give you raw power. The
   Fighting category decides how much of it converts once someone is actually
   shooting back.
3. **One of them goes down first.** Losing a fight usually knocks a single
   player. The survivor plays the 1v2 alone — that is the only time Clutch is
   ever read — and can rebuild the partner afterwards.

---

## The lobby

A competitive duos lobby is **100 players = 50 duos**, so every placement in
the game is a placement out of 50 and the scoring table is written for that.

The engine tracks how many teams are still alive at each stage
(`simulation.lobby.survivors`):

| Stage | Teams left after it |
|---|---|
| Drop | 38 |
| First rotate | 30 |
| Zone 3 / 4 / 5 | 24 / 19 / 15 |
| Endgame circles | 11 · 8 · 6 · 4 · 3 · 2 · 1 |

**Placements are therefore never free-floating random numbers.** Dying off the
drop is always a bottom-ten finish. Surviving to the last mid-game zone is
always a top-25 one. Change these numbers and the whole shape of a leaderboard
changes with them.

---

## Before the match

**Effective ratings.** Each player gets their own 29-stat line for this match:

```
eff = current + form − fatigue×categorySensitivity − burnout − tilt + lanNerve + synergy
```

- **Form** is one normal roll per player, its spread set by their Consistency.
  A 30-Consistency player swings wildly; a 90 barely moves.
- **Fatigue** starts at match 5 and hits hands hardest (`mechanics` 1.15,
  `aim` 1.0) and reads barely at all (`game_sense` 0.5). There is no Stamina
  sub-stat, so endurance is read off Tilt Resistance, Under Pressure and
  Consistency (`fatigue.resistance`).
- **Tilt** only exists in the match *after* a disaster game (worse than 26th),
  and Tilt Resistance decides how much of it lands.
- **LAN nerve** is `(bigStageNerve − 80) × 0.25` and applies **only at events
  flagged `lan: true`** in `tournaments.json`. Everywhere else Big Stage Nerve
  is ignored completely. This is why a 15-year-old can farm cash cups and still
  fold at a Grand Final.
- **Synergy** is a flat number from average Communication, the best Decision
  Making in the duo, Ego, matches played together (rate set by Adaptivity) and
  archetype mix.

**Team numbers.** For a check, the two players are blended per *category*
(`teamAggregation`):

```
teamValue = average + aggregation × (best − average)
```

- `game_sense: 0.65` — one smart IGL can call for the whole duo.
- `fighting: 0.5`, `aim: 0.45` — a specialist carries, but not entirely.
- `teamwork: 0.15` — nearly a pure average.

**When one player is down, the survivor's own numbers are used unchanged.**
That is exactly why a lopsided duo is fragile: lose the carry and there is
nothing left.

**The Fighting multiplier.** Any check with a `fighting` weight set converts
its raw power around the neutral 50 line:

```
mult  = 1 + (fightScore − 50) × 0.007          (clamped 0.6 – 1.6)
power = 50 + (raw − 50) × mult                 when raw ≥ 50
power = 50 − (50 − raw) / mult                 when raw < 50
```

Fighting 90 turns a raw 85 into 93.6. Fighting 20 turns the same 85 into 77.6.
It can never manufacture aim that is not there — it only decides how much of
what you have survives contact.

Every check then compares:

```
winChance = 1 / (1 + e^−(myPower − theirPower) / duelScale)
```

where `theirPower` is the tournament's lobby rating plus a normal roll, plus
whatever difficulty ramp the stage carries.

---

## Phase 1 — DROP

The game plan sets how likely your POI is contested (Contest 92%, Balanced 45%,
Zone 10%), plus 9% per W-Key Aggro player in the duo.

**Contested** — the Offspawn category's moment:

```
raw      = 0.24 Fifty-Fifties + 0.22 Offspawn Fights + 0.12 Drop Accuracy
         + 0.12 Tracking + 0.10 Accuracy + 0.08 Flicks + 0.08 Build Speed
         + 0.04 Edit Speed
fighting = 0.40 Box Fighting + 0.30 Movement + 0.30 Reset Timing
```

- **Win** → 1–3 elims, +200 mats each, +50 shield, and a **+14 loot bonus** in
  phase 2 because the POI is now yours. That payoff is what makes contesting
  worth the risk of a bottom-ten finish.
- **Lose** → the casualty rules below. Usually one player is knocked; sometimes
  it is both, and the game is over 39th–50th.

**Uncontested** → +60 mats each and a quiet start.

## Phase 2 — LOOT and ROTATE

```
lootStat = 0.45 Drop Accuracy + 0.35 Resource Mgmt + 0.20 Fifty-Fifties
mats     = 180 + lootStat × 4.4   per player, capped at 800
shield   = 30  + lootStat × 0.70  capped at 100
```

Then the rotate: `0.40 Rotation + 0.28 Positioning + 0.20 Decision Making +
0.12 Resource Mgmt` against a lobby 4 points harder than normal. **A rotate has
no Fighting multiplier** — it is a map decision, and Fighting cannot save you
from a bad route.

Lose it and 38% of the time it becomes a fight you did not pick, resolved with
the mid-game weights at full opponent strength.

## Phase 3 — THE MID-GAME ZONES

One pass per zone in `lobby.survivors.afterZones` (three by default). Each pass
is three steps.

**a) The fights you choose.** Base chance by plan (Contest 62%, Balanced 40%,
Zone 20%) plus 11% per aggro player, up to two per zone.

`fight_selection` is modelled the way it actually works: it does **not** win
fights, it picks softer ones (−0.14 opponent power per point above 50) and
talks the duo out of the bad ones entirely. It never helps in a forced fight.

```
raw      = 0.18 Tracking + 0.13 Accuracy + 0.07 Headshot + 0.07 Flicks
         + 0.18 Build Speed + 0.13 Edit Speed + 0.09 Edit Accuracy
         + 0.05 Build Efficiency + 0.10 Movement
fighting = 0.30 Box Fighting + 0.25 Piece Control + 0.20 Edit IQ
         + 0.15 Reset Timing + 0.10 Movement
```

**b) The pressure you cannot avoid.** One check per zone that no strategy plays
around — shrinking zone, teams stacking your side, third parties:

```
raw      = 0.30 Positioning + 0.18 Rotation + 0.16 Build Speed
         + 0.14 Decision Making + 0.10 Resource Mgmt + 0.06 Build Efficiency
         + 0.06 Tracking
fighting = 0.40 Piece Control + 0.35 HG Retakes + 0.25 Movement
```

**This is the gate on reaching the top 15.** Failing it becomes a real fight
62% of the time (`midGame.zoneDeathChance`), and every zone the lobby gets 2.2
points stronger, because the bad teams are already dead.

**c) Rebuild.** If a player is down and there are more than 8 teams left, the
survivor gets a reboot roll off `0.35 Movement + 0.30 Positioning +
0.20 Resource Mgmt + 0.15 Rotation`, costing 60 mats. The partner comes back
with nothing — that is the point of losing a player.

## Phase 4 — ENDGAME

You enter at 15th and play one check per closing circle, not one per placement:
**several teams die in the early circles and it thins out from there**, which is
what a real endgame looks like.

```
raw      = 0.22 Build Speed + 0.14 Tracking + 0.13 Edit Speed + 0.12 Build Efficiency
         + 0.10 Accuracy + 0.09 Edit Accuracy + 0.09 Positioning + 0.06 Headshot
         + 0.05 Resource Mgmt
fighting = 0.34 Piece Control + 0.24 HG Retakes + 0.20 Box Fighting
         + 0.12 Edit IQ + 0.10 Reset Timing
```

Each surviving circle:

- makes the next opponent **4.5 points stronger**,
- burns ~70 mats per player, reduced by high **Build Efficiency**,
- has a 34% chance of elims.

Two things kill greedy duos here:

- **Running out of mats** costs a brutal 26 power. This is why the mats you
  carried out of the early game matter.
- **Shield under 50** costs another 7.

From the top 6 down, and in the closing games of a session, **Under Pressure**
is added to every check — both ways. A failed check can still be rescued by
**Clutch** (up to a 20% save). Surviving every circle wins the match.

## Casualties — what a lost fight actually costs

Every losing fight runs through `simulation.downedPartner`:

- **Both up:** 42% chance of a straight wipe, pulled down by Reset Timing and
  Movement (good players get out). Otherwise **one player is knocked**, weighted
  toward whoever was losing their own fight.
- **One up (a 1v2):** 72% chance they simply die — there is nobody to trade for
  you. Every check while down a man costs 11 power, and this is the only
  situation in which **Clutch** is read (±0.22 power per point off 50), so a
  genuinely clutch player can cancel most of the deficit.

In a typical session a duo takes about **one knock per match** and rebuilds
roughly **a third** of them.

## Phase 5 — RESULT

Placement out of 50 and elims go into the scoring table in `tournaments.json`:

```
1st = 60 · 2-3rd = 48 · 4-5th = 40 · 6-10th = 32 · 11-15th = 22
16-20th = 12 · 21-25th = 6 · 26th+ = 0 · each elim = 2
```

---

## The rest of the field

Running the full five-phase engine for 3,000 rival duos every tournament would
be slow, so the anonymous field is modelled (`simulation.aiField`) — but it is
modelled **the way a match actually resolves**. Each field duo draws a strength
around the lobby rating (with a long weak tail, `strengthSkew`), and then for
every match:

```
quality   = sigmoid( logit(random) + edge )        edge = strengthAboveLobby × 0.115
placement = ceil((1 − quality) × 50)
elims     = normal(0.9 + quality × 2.2, 1.1)
points    = the SAME scoring table you use
```

With `edge = 0` the placement roll is exactly uniform across the lobby, which is
what a lobby of identical teams should produce: one winner in fifty. Strength
shifts that roll — it never guarantees anything.

Because the field is scored through the real points table, **changing the
scoring table moves the whole leaderboard with you.** Under the old flat
"expected points" model it would not have budged.

If you change the match engine meaningfully, run `npm run calibrate` and check
that a duo whose strength *matches* the lobby lands mid-table.

---

## Reading the log

Every match produces a one-line summary, a per-player elim line, and an
expandable phase breakdown:

```
Match 4 — Dropped Grand Terminal contested, won the fight (2 elims).
Rotated late and burned mats getting in. Rebuilt after going a man down.
died 9th. 36 pts.

  Prism77 2e   Nova.ai 1e   1 knock · 1 rebuilt

  DROP · contested Grand Terminal · power 76.8 vs 72.2 (66%)
    won the drop fight, +2 elims, +200 mats each
  LOOT · loot quality 82 → 541 mats, 100 shield each
  ROTATE · read 84.6 vs 88.1 (37%)
    bad rotate: -90 mats, -40 shield
  ZONE 3 · took a fight and won (61%), +1 elims
  ZONE 4 · broken (38%), Nova.ai down
  ZONE 4 · rebooted Nova.ai
  ZONE 5 · held the position (57%)
  ENDGAME · reached top 15 with 412 mats each
    top 15: lost the piece but survived the reset
    top 11: lost the height fight (41%)
```

The percentages are the real win chances the engine rolled against, so you can
see exactly where a session went wrong.
