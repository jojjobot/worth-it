# Tuning guide

All game numbers live in `src/data/*.json`. Edit, save, and the running game
picks it up immediately. Keys starting with `__` are comments and are ignored.

If you break a file, the browser shows a JSON error — usually a missing comma or
a stray trailing comma. Undo and try again.

After a change, run `npm run calibrate` to see what it actually did.

---

## The attribute tree (`attributes.json`)

Every player is rated on **7 categories made of 29 sub-stats**, all 1-100.

| Category | Sub-stats |
|---|---|
| **AIM** | Tracking, Flicks, Accuracy, Headshot Aim |
| **MECHANICS** | Build Speed, Build Efficiency, Edit Speed, Edit Accuracy |
| **FIGHTING** | Edit IQ, Piece Control, Box Fighting, HG Retakes, Reset Timing, Movement |
| **GAME SENSE** | Positioning, Rotation, Fight Selection, Resource Mgmt |
| **OFFSPAWN** | Drop Accuracy, Fifty-Fifties, Offspawn Fights |
| **MENTAL** | Clutch, Under Pressure, Tilt Resistance, Big Stage Nerve, Consistency |
| **TEAMWORK** | Communication, Decision Making, Adaptivity |

The category number you see on a player card is a **weighted average, for
display only**. The match engine never reads it — it always reads the
individual sub-stats underneath.

- `categoryWeights` — how much each category counts toward the single OVR
  number on a player card. Cosmetic. Changing it does not change who wins
  matches.
- Each sub-stat has its own `weight` inside its category, for the same purpose.
- `displayCalibration` — a final scale/offset on OVR so the numbers line up with
  the hand-written overalls in `real_players.json`. Set `scale: 1, offset: 0`
  to see the raw maths.

### Current vs peak

Every player carries **two full sets of all 29 sub-stats**:

- **current** — what they are right now. This is what the roster shows and what
  the sim uses.
- **peak** — their ceiling. **Hidden.** Scouting only ever gives you a band or a
  phrase, never an exact number, and unsigned players never show a number at
  all.

Players drift toward peak every week, and start declining past
`progression.declineStartAge` in `balance.json` (currently 22).

- `peakModel.gapByAge` — how much room a player of a given age has left.
- `peakModel.categoryGapScale` — per category. Hands (aim, mechanics) are nearly
  finished early; heads (game sense, mental, teamwork) keep growing for years.
- `decline.categoryDeclineScale` — what falls off after the decline age. A
  **negative** value means the category keeps *growing*, which is how a veteran
  loses their hands but keeps improving their reads.

### Big Stage Nerve — the one stat that must be earned

Big Stage Nerve applies **only at LAN and Grand Final events** and is ignored
everywhere else. **No training program can move it.** It grows purely from
turning up to LANs, in `attributes.json` -> `bigStageNerve`:

- `startByAge` — where a player starts before their first LAN. Harsh on kids on
  purpose: this is why the 17-year-old world #1 loses the Grand Final.
- `peakBonusByAge` — how much they can eventually add. A 17-year-old starting on
  72 tops out around 94; a 22-year-old barely moves.
- `gainPerLan` / `gainDecayPerLan` — points per appearance, and how quickly
  later LANs stop teaching them anything.
- `goodResultMultiplier` / `badResultMultiplier` — winning on stage teaches more
  than getting rolled on stage.

---

## "The game is too hard / too easy"

**One dial fixes most of it:** `lobbyRating` on each event in
`tournaments.json`. It is how strong the rest of the field is.

It is measured on the **team power** scale, which is the number shown next to
each of your trios on the Dashboard — *not* the individual player ratings. Three
50-rated players make a trio worth roughly 68 team power, because specialists
carry the trio and chemistry adds on top.

| Your trio strength vs the lobby | What it feels like |
|---|---|
| lobby is 25+ below you | You farm it. Winning most sessions. |
| lobby is ~10 below you | Competitive. Cash sometimes, occasional deep runs. |
| lobby matches you | Mid-table grind. |
| lobby is 10+ above you | You are getting cooked. |

Lower every `lobbyRating` by 5 for an easier career; raise them for a harder one.
Region modifiers in `regions.json` stack on top (EU is +7, the hardest region).

## "I keep going bankrupt"

In `balance.json` → `economy`:

- `baseSponsorIncomePerWeek` — flat money every week regardless of fame. Raise
  this for a gentler start.
- `fansPerReputationPoint` and `sponsorIncomePerFanPerWeek` — the income engine.
  Reputation grows fans, fans pay sponsors.
- `fanReputationExponent` — below 1.0 gives diminishing returns at the top. Set
  it to 1.0 if you want a famous org to print money.
- `weeklyOverhead`, `startingCash`, `bankruptcyGraceWeeks`.

Training costs are in `training.json` (`costPerWeek` per program) and are a real
part of the bill.

## "Matches feel too random / not random enough"

`balance.json` → `simulation`:

- `duelScale` — the softness of every contested check.
  **Lower = skill matters more, fewer upsets. Higher = chaos.**
- `consistencyModel.baseSigma` — how big a player's per-match form swing is
  before their Consistency rating reduces it.
- `lobbySigma` — how varied the opponents inside one lobby are.

## "Nobody ever makes top 15" / "Everyone makes top 15"

`simulation.midGame.forcedEncounters` is the main gate. These are unavoidable
zone-pressure checks that no strategy plays around.

- `0` → almost everyone who survives the mid game reaches an endgame.
- `2` (default) → reaching top 15 is an achievement.
- `4` → brutal, only very strong trios ever see a final circle.

## "Elims should matter more"

Two options:

1. Raise `elimPoints` in `tournaments.json` → `scoringTables.standard`.
2. Switch an event to the alternative table already provided: set its
   `"scoring": "elimHeavy"`.

The default table is placement-heavy on purpose — that is how the real format
works, and it is why the Zone game plan is usually the safe pick.

## "I want players to be more extreme"

`balance.json` → `playerGeneration`:

- `strengthBonus` / `weaknessPenalty` — how big the 2–3 spikes and 2–3 holes are.
- `strengthCount` / `weaknessCount` — how many of each.
- `archetypeBiasStrength` — set to `0` to make archetypes cosmetic, or `1.5` to
  make an IGL genuinely unable to aim.
- `noiseSigma` — general randomness between players.

## "Training is too slow / too fast"

`training.json` → `model`:

- `baseGainPerWeek` — the master multiplier.
- `ageFactor` — how much faster young players learn.
- `headroomExponent` — how sharply gains die off near a player's potential.
- `burnout.*` — how much hard training costs in match performance.

Individual programs are easy to edit or copy. `targets` is a set of attribute
weights; `1.0` is a full-speed gain, `0.3` is a trickle. You can add your own
program by copying a block and giving it a new `id`.

## "I want a different season calendar"

Each event in `tournaments.json` has a `schedule`:

```json
"schedule": { "everyWeeks": 2, "offsetWeek": 1 }
```

That means it runs on weeks 1, 3, 5, 7… Set `everyWeeks: 1, offsetWeek: 0` for
every week. The FNCS is a `series` — its three stages each have their own
schedule, and `advanceCount` decides how many trios move on.

## Adding a new tournament

Copy an existing `session` event, give it a new `id`, and set `matches`,
`lobbyRating`, `fieldSize`, `prizePool`, `minReputation` and `schedule`. It
appears on the calendar automatically. Nothing in the code needs changing.

## Adding a new archetype

Copy a block in `archetypes.json`, give it a new `id`, set the `bias` for each
attribute, and list which attributes it can spike (`strengthPool`) and tank
(`weaknessPool`). Generated players will start using it immediately.
