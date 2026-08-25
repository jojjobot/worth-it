/**
 * Balance check-up.  Run it with:   npm run calibrate
 *
 * It builds three deliberately different duos, runs a few hundred sessions of
 * each against a range of lobbies, and prints what actually happens. Use it
 * after editing /src/data/*.json to see whether your changes did what you
 * expected without having to play twenty in-game weeks.
 */

import { Rng } from '../src/engine/rng'
import { generatePlayer, overall } from '../src/engine/players'
import { simulateSession, duoStrength } from '../src/engine/sim'
import type { Player, Strategy } from '../src/engine/types'

const SESSIONS = 200
const MATCHES = 10

function makeDuo(rng: Rng, archetypes: string[], rating: number): Player[] {
  const taken = new Set<string>()
  return archetypes.map((archetype) =>
    generatePlayer(rng, taken, { baseRating: rating, archetype, region: 'EU', freeAgent: true }),
  )
}

function run(label: string, players: Player[], strategy: Strategy, lobbyRating: number) {
  const rng = new Rng(12345)
  let points = 0
  let elims = 0
  let wins = 0
  let top10 = 0
  const placements: number[] = []
  const deaths: Record<string, number> = {}

  for (let s = 0; s < SESSIONS; s++) {
    const res = simulateSession(
      players,
      { matches: MATCHES, lobbyRating, scoringId: 'standard', strategy, gamesTogether: 60 },
      rng,
    )
    points += res.totalPoints
    elims += res.totalElims
    wins += res.wins
    for (const m of res.matches) {
      placements.push(m.placement)
      if (m.placement <= 10) top10++
      deaths[m.diedPhase] = (deaths[m.diedPhase] ?? 0) + 1
    }
  }

  const totalMatches = SESSIONS * MATCHES
  const sorted = placements.slice().sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const strength = duoStrength(players, 60).toFixed(1)
  const ovrs = players.map((p) => overall(p.current)).join('/')

  console.log(
    [
      label.padEnd(30),
      `lobby ${String(lobbyRating).padStart(3)}`,
      `ovr ${ovrs.padEnd(9)}`,
      `str ${strength.padStart(5)}`,
      `pts/session ${(points / SESSIONS).toFixed(1).padStart(6)}`,
      `pts/match ${(points / totalMatches).toFixed(2).padStart(5)}`,
      `elims/match ${(elims / totalMatches).toFixed(2)}`,
      `win% ${((wins / totalMatches) * 100).toFixed(2).padStart(5)}`,
      `top10% ${((top10 / totalMatches) * 100).toFixed(1).padStart(5)}`,
      `median ${String(median).padStart(3)}`,
      `deaths ${Object.entries(deaths)
        .map(([k, v]) => `${k}:${((v / totalMatches) * 100).toFixed(0)}%`)
        .join(' ')}`,
    ].join('  '),
  )
}

const rng = new Rng(777)

const duos: { label: string; players: Player[] }[] = [
  { label: 'Amateur (~50 ovr, mixed)', players: makeDuo(rng, ['igl', 'mech_carry'], 42) },
  { label: 'Solid pro (~65 ovr, mixed)', players: makeDuo(rng, ['igl', 'mech_carry'], 58) },
  { label: 'Elite (~81 ovr, mixed)', players: makeDuo(rng, ['igl', 'mech_carry'], 75) },
  { label: 'Two fraggers (~65 ovr)', players: makeDuo(rng, ['mech_carry', 'fragger'], 58) },
  { label: 'IGL + anchor (~65 ovr)', players: makeDuo(rng, ['igl', 'anchor'], 58) },
]

console.log('\n=== STRATEGY COMPARISON (lobby 85, about a Weekly Cash Cup in EU) ===')
for (const strategy of ['contest', 'balanced', 'safe'] as Strategy[]) {
  for (const t of duos) run(`${t.label} [${strategy}]`, t.players, strategy, 85)
  console.log('')
}

console.log('=== DIFFICULTY CURVE (balanced) ===')
for (const lobby of [62, 85, 100, 115, 125]) {
  for (const t of duos.slice(0, 3)) run(t.label, t.players, 'balanced', lobby)
  console.log('')
}

console.log('=== FATIGUE: points by match number (solid pro, lobby 85) ===')
{
  const r = new Rng(999)
  const byMatch = new Array(MATCHES).fill(0)
  for (let s = 0; s < SESSIONS; s++) {
    const res = simulateSession(
      duos[1].players,
      { matches: MATCHES, lobbyRating: 85, scoringId: 'standard', strategy: 'balanced', gamesTogether: 60 },
      r,
    )
    res.matches.forEach((m, i) => (byMatch[i] += m.points))
  }
  console.log(byMatch.map((p, i) => `M${i + 1}:${(p / SESSIONS).toFixed(1)}`).join('  '))
}
console.log('')

// --- What the real events actually feel like -------------------------------
import tournamentsJson from '../src/data/tournaments.json'
import { getRegion } from '../src/engine/config'
import { prizeForRank, rankInField } from '../src/engine/tournament'

const REGION = 'EU'
const regionData = getRegion(REGION)
const RUNS = 60

interface EvRow {
  name: string
  matches: number
  lobbyRating: number
  fieldSize: number
  prizePool: number
  dist: string
}
const evs: EvRow[] = []
for (const ev of (tournamentsJson as any).events) {
  if (ev.type === 'session') {
    evs.push({
      name: ev.name,
      matches: ev.matches,
      lobbyRating: ev.lobbyRating + regionData.lobbyModifier,
      fieldSize: ev.fieldSize,
      prizePool: Math.round(ev.prizePool * regionData.prizeMultiplier),
      dist: ev.prizeDistribution,
    })
  } else {
    for (const st of ev.stages) {
      evs.push({
        name: st.name,
        matches: st.matches,
        lobbyRating: st.lobbyRating + regionData.lobbyModifier,
        fieldSize: st.fieldSize,
        prizePool: Math.round(st.prizePool * regionData.prizeMultiplier),
        dist: st.prizeDistribution,
      })
    }
  }
}

console.log(`=== REAL EVENTS IN ${REGION} (${RUNS} runs each, balanced strategy) ===`)
for (const ev of evs) {
  console.log(`\n-- ${ev.name}  lobby ${ev.lobbyRating}  field ${ev.fieldSize}`)
  for (const t of duos) {
    const r = new Rng(4242)
    const ranks: number[] = []
    let prize = 0
    let cashed = 0
    for (let i = 0; i < RUNS; i++) {
      const res = simulateSession(
        t.players,
        {
          matches: ev.matches,
          lobbyRating: ev.lobbyRating,
          scoringId: 'standard',
          strategy: 'balanced',
          gamesTogether: 60,
        },
        r,
      )
      const rank = rankInField(r, res.totalPoints, ev.lobbyRating, ev.matches, ev.fieldSize, 'standard')
      ranks.push(rank)
      const p = prizeForRank(ev.dist, rank, ev.prizePool)
      prize += p
      if (p > 0) cashed++
    }
    ranks.sort((a, b) => a - b)
    const median = ranks[Math.floor(ranks.length / 2)]
    console.log(
      `   ${t.label.padEnd(28)} str ${duoStrength(t.players, 60).toFixed(1).padStart(5)}` +
        `  median rank ${String(median).padStart(5)}/${ev.fieldSize}` +
        `  best ${String(ranks[0]).padStart(4)}` +
        `  cashed ${((cashed / RUNS) * 100).toFixed(0).padStart(3)}%` +
        `  avg prize $${Math.round(prize / RUNS).toLocaleString()}`,
    )
  }
}
console.log('')

// --- The mechanics that only exist in certain situations -------------------
// Big Stage Nerve is read at LANs and nowhere else, and a lone survivor plays
// a real 1v2. Both are invisible in the numbers above, so check them here.

console.log('=== LAN vs ONLINE (same duo, same lobby) ===')
{
  const lobby = 115
  for (const t of duos.slice(0, 4)) {
    const nerve = (
      t.players.reduce((a, p) => a + p.current.big_stage_nerve, 0) / t.players.length
    ).toFixed(0)
    const row: string[] = []
    for (const isLan of [false, true]) {
      const r = new Rng(31337)
      let pts = 0
      for (let i = 0; i < SESSIONS; i++) {
        pts += simulateSession(
          t.players,
          {
            matches: MATCHES,
            lobbyRating: lobby,
            scoringId: 'standard',
            strategy: 'balanced',
            gamesTogether: 60,
            isLan,
          },
          r,
        ).totalPoints
      }
      row.push(`${isLan ? 'LAN' : 'online'} ${(pts / SESSIONS).toFixed(1).padStart(6)}`)
    }
    console.log(`   ${t.label.padEnd(28)} nerve ${nerve.padStart(3)}  ${row.join('   ')}`)
  }
}
console.log('')

console.log('=== DUO SURVIVAL (solid pro, lobby 85) ===')
{
  const r = new Rng(5150)
  let downs = 0
  let reboots = 0
  let soloFinishes = 0
  let n = 0
  for (let i = 0; i < SESSIONS; i++) {
    const res = simulateSession(
      duos[1].players,
      { matches: MATCHES, lobbyRating: 85, scoringId: 'standard', strategy: 'balanced', gamesTogether: 60 },
      r,
    )
    for (const m of res.matches) {
      n++
      downs += m.partnerDowns
      reboots += m.reboots
      if (m.players && m.players.some((p) => !p.survived) && m.placement <= 15) soloFinishes++
    }
  }
  console.log(
    `   knocks per match ${(downs / n).toFixed(2)}   reboots per match ${(reboots / n).toFixed(2)}` +
      `   top-15 finishes reached a man down ${((soloFinishes / n) * 100).toFixed(1)}%`,
  )
}
console.log('')
