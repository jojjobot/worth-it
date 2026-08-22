# APEX ORG — competitive trios esports manager

You own an esports organisation. Scout players, build trios, train them, enter
tournaments, and drag a no-name org from the open cups to the Grand Finals.

Everything runs on your own computer. No account, no server, no internet needed
after the first install.

---

## How to play it

**Double-click `START.bat`.**

That's it. The first time it runs it downloads the bits it needs (one minute,
needs internet). After that it opens the game in your browser straight away.

Leave the black window open while you play — closing it stops the game.

If you have never installed Node.js, `START.bat` will tell you and point you at
<https://nodejs.org> (click the big LTS button, accept everything, restart
`START.bat`).

> Prefer the terminal? `npm install` once, then `npm start`.

---

## Saving

- The game **saves itself** to your browser after every action.
- **Export save** downloads a `.json` file — use it for backups or to move a
  career to another computer.
- **Import save** loads one of those files back.
- **New org** wipes the current save and starts fresh.

Because the save lives in your browser, clearing browser data deletes it. Export
occasionally if a career matters to you.

---

## The loop

1. **Scout** the market. Unsigned players show ratings as *ranges*, not numbers.
   Each scout report narrows the range; at scouting level 4 you see exact values.
2. **Sign** who you like. Free agents cost nothing up front, players at rival
   orgs cost a buyout.
3. **Build a trio** on the *Roster & Trios* screen and pick a game plan
   (Contest / Balanced / Zone).
4. **Set training** for each player. Hard programs improve them fast but stack
   burnout.
5. **Enter a tournament** for the week.
6. **Advance week** — the session is simulated match by match, you get a full
   readable log, prize money, reputation, and the weekly bill.
7. Repeat. Reputation grows fans, fans bring sponsor money, sponsor money pays
   the salaries that let you sign better players.

You lose if you run a negative balance for six weeks straight.

---

## The eleven ratings

| Rating | What it does |
|---|---|
| **Aim** | Wins fights. Weighted heaviest in drop fights and mid-game fights. |
| **Build Speed** | Mechanics under pressure. Drop fights, mid game, endgame. |
| **Editing** | Fast plays and edit windows. Drop and mid-game fights. |
| **Piece Control** | Taking and holding the other trio's builds. Dominates endgames, and saves mats. |
| **Game Sense** | Zone reads. Decides your rotate and how you handle zone pressure. |
| **Loot Pathing** | How many mats and how much shield you carry out of the early game. |
| **Endgame** | Final circles and height retakes. |
| **Clutch** | Can rescue a lost endgame check. |
| **Consistency** | *Low = boom or bust.* Controls how big that player's random swing is each match. |
| **Stamina** | Cancels fatigue in matches 5–10 of a session. |
| **Comms** | Lifts the whole trio through synergy, and speeds up teammates' training. |

**Nobody is good at everything.** Every generated player gets 2–3 spiked
attributes and 2–3 tanked ones, drawn from pools based on their archetype. A
cracked mechanical W-Key player with no game sense really does play differently
from a smart, passive zone player with mid aim.

Two ratings are **hidden**: **Potential** (their ceiling — only ever an estimate,
never an exact number) and **Ego** (high ego wrecks trio chemistry). Scouting
reveals rough versions of both.

---

## Tuning the game yourself

Every number lives in **`src/data/`** as plain, commented JSON. Open a file in
Notepad, change a number, save — the game reloads instantly while it is running.

| File | Controls |
|---|---|
| `balance.json` | **The master file.** Player generation, the whole match engine, economy, scouting, ageing. |
| `tournaments.json` | The points table, prize splits, and the season calendar. |
| `archetypes.json` | The five archetypes and the 11 rating descriptions. |
| `regions.json` | Region difficulty, reputation value, prize money. |
| `training.json` | Training programs, gain rates, burnout. |
| `names.json` | Gamertag word banks, org names, drop spot names, ticker lines. |

Keys starting with `__` are comments — the game ignores them. See
[`TUNING.md`](TUNING.md) for the dials worth touching first, and
[`MATCH-SIM.md`](MATCH-SIM.md) for how a match is actually simulated.

To check a change without playing twenty weeks:

```
npm run calibrate
```

It runs a few thousand simulated sessions and prints what actually happens —
points per match, win rate, where trios die, and how each real event feels.

---

## Reproducibility

Every career runs off a **seed** you choose on the first screen. The same seed
plus the same decisions always produces the exact same results, so you can
replay a run or share a seed with someone else.

---

## Notes

Every player, org and location in this game is **fictional and randomly
generated** from word lists. There are no real pros, no publisher logos, and no
game assets — the whole interface is plain text and CSS. Not affiliated with or
endorsed by any game publisher.
