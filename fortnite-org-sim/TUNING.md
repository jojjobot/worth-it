# Tuning guide

All game numbers live in `src/data/*.json`. Edit, save, and the running game
picks it up immediately. Keys starting with `__` are comments and are ignored.

If you break a file, the browser shows a JSON error — usually a missing comma or
a stray trailing comma. Undo and try again.

After a change, run `npm run calibrate` to see what it actually did.

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
