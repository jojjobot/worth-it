# Tuning guide

**The game mode is DUOS** — two players per team, up to four duos on a roster
of eight.

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

**Click any player name anywhere in the game** — roster, scouting, the duo
chips on the dashboard, the tournament standings — to open their full stat
sheet: all 7 categories and all 29 sub-stats at once, with a "Left" column
showing how much room they have before their ceiling. Scouting rules still
apply: an unsigned player shows ranges, not numbers.

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

## The real scene (`real_players.json`)

The game ships with **12 real players** and the **7 orgs** they play for. They
sit on the transfer market from week one, and their orgs enter your tournaments.

| Org | Region | Duo |
|---|---|---|
| Team Falcons | NAC | Peterbot + Pollo |
| BIG | EU | vic0 + Malibuca |
| Aurora Gaming | EU | shxrk + t3eny |
| AG | EU | Sky + Scroll |
| HavoK by Vitality | EU | SwizzY + Pixie |
| Twisted Minds | NAC | boltz + a generated partner |
| ROC | EU | Kami + a generated partner |

The last two orgs get a **generated fictional partner** because their real
duo partners are not in the reference set — the game does not invent ratings
for real players it has no data for.

> **The ratings in that file are estimates**, calibrated by hand against public
> tournament results. Only the Power Ranking, org, region and age are factual.

### Signing them

They are all under contract, so it costs a buyout on top of the wage. In
`real_players.json` -> `settings`:

- `buyoutMultiplier` — buyout = weekly wage × this. Currently 26-44, so the
  top players cost **$100k-155k** up front. Lower it to make a superteam
  reachable early.
- `minReputationToSign` — how famous your org must be before they will take the
  call at all. Currently **42**. Set to 0 to let a week-one nobody sign the
  world champion.
- `salaryMultiplier` — on top of the normal wage curve.

### How they compete

Their duos are run through the **same match engine you are**, on the same
ratings you can scout — not modelled statistically like the anonymous field.
Finishing above BIG means you genuinely out-scored vic0 and Malibuca.

- `minTierEntered` (2) — they do not bother with the tier-1 Open Practice Cup,
  so the bottom of the ladder is yours.
- `internationalFromTier` (5) — from this tier up, *every* org enters
  regardless of region. The FNCS Grand Finals puts Falcons and BIG in the same
  lobby as you.

Sign one of their players and the org **backfills** with somebody else, losing
all its duo chemistry — a real cost to them.

Run `npm run verify` after editing that file. It checks that no real player has
been given an ego, that no under-18 has a name attached, that the computed
overalls still match the authored ones, and that every org fields a full duo.

---

## "The game is too hard / too easy"

**One dial fixes most of it:** `lobbyRating` on each event in
`tournaments.json`. It is how strong the rest of the field is.

It is measured on the **team power** scale, which is the number shown next to
each of your duos on the Dashboard — *not* the individual player ratings. Three
50-rated players make a duo worth roughly 68 team power, because specialists
carry the duo and chemistry adds on top.

| Your duo strength vs the lobby | What it feels like |
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
- `4` → brutal, only very strong duos ever see a final circle.

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
schedule, and `advanceCount` decides how many duos move on.

## Adding a new tournament

Copy an existing `session` event, give it a new `id`, and set `matches`,
`lobbyRating`, `fieldSize`, `prizePool`, `minReputation` and `schedule`. It
appears on the calendar automatically. Nothing in the code needs changing.

## Adding a new archetype

Copy a block in `archetypes.json`, give it a new `id`, set the `bias` for each
attribute, and list which attributes it can spike (`strengthPool`) and tank
(`weaknessPool`). Generated players will start using it immediately.
