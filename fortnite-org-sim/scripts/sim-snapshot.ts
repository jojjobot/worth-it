// ---------------------------------------------------------------------------
// THE REFACTOR NET
//
// Build step 3 is a PURE REFACTOR: every roll in the match engine moves behind
// the modifier pipeline, with no modifiers registered. The sim must therefore
// produce byte-identical results to before. This script is what proves it.
//
//   npm run snapshot:sim    writes the baseline (run it BEFORE refactoring)
//   npm run verify:sim      re-runs and diffs against that baseline
//
// It sims a fixed matrix - real duos x seeds x strategies x online/LAN - and
// records every field of every match, the readable summary and the whole
// per-phase detail log included. If a single character moves, the diff names
// the match and the line.
//
// The baseline file is committed. When a LATER build step deliberately changes
// the numbers, re-run `npm run snapshot:sim` and the diff in that commit shows
// exactly what the change did to the sim - which is the point.
// ---------------------------------------------------------------------------

import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createNewGame } from '../src/engine/game'
import { simulateSession, type SessionOptions } from '../src/engine/sim'
import { Rng } from '../src/engine/rng'
import type { GameState, Player, Strategy } from '../src/engine/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASELINE = join(HERE, '__sim-baseline.json')

// --- The matrix ------------------------------------------------------------
// Fixed and deliberately varied: a top duo, a mid duo and a mismatched pair,
// against three lobby strengths, every strategy, online and on stage.

const DUOS: [string, string][] = [
  ['Peterbot', 'Pollo'], // the best duo in the file
  ['Kami', 'charyy'], // thinker + fragger
  ['shxrk', 't3eny'], // stage fright, huge ceiling
  ['Veno', 'Curve'], // the cross-org duo
  ['Peterbot', 'Kami'], // two players who never play together
]
const STRATEGIES: Strategy[] = ['contest', 'balanced', 'safe']
const LOBBIES = [96, 118, 126]
const SEEDS = [1, 7, 4242]

function playersOf(state: GameState, tags: [string, string]): Player[] {
  return tags.map((t) => {
    const p = Object.values(state.players).find(
      (x) => x.tag.toLowerCase() === t.toLowerCase(),
    )
    if (!p) throw new Error(`snapshot matrix names a player who is not in the file: ${t}`)
    return p
  })
}

interface Row {
  id: string
  totalPoints: number
  totalElims: number
  bestPlacement: number
  wins: number
  matches: unknown[]
}

function run(): Row[] {
  // One fixed game so the players, and the fillers around them, are identical
  // every run. createNewGame is deterministic for a given seed.
  const state = createNewGame('Snapshot Org', 'EU', 'sim-snapshot-v1')
  const rows: Row[] = []

  for (const tags of DUOS) {
    const players = playersOf(state, tags)
    for (const strategy of STRATEGIES) {
      for (const lobbyRating of LOBBIES) {
        for (const seed of SEEDS) {
          for (const isLan of [false, true]) {
            const opts: SessionOptions = {
              matches: 8,
              lobbyRating,
              scoringId: 'fncs',
              strategy,
              gamesTogether: 120,
              isLan,
            }
            const res = simulateSession(players, opts, new Rng(seed))
            rows.push({
              id: `${tags.join('+')}|${strategy}|lobby${lobbyRating}|seed${seed}|${isLan ? 'LAN' : 'online'}`,
              totalPoints: res.totalPoints,
              totalElims: res.totalElims,
              bestPlacement: res.bestPlacement,
              wins: res.wins,
              // Everything, including the readable log. A refactor that quietly
              // reorders a phase would still show up here even if the placement
              // happened to land the same.
              matches: res.matches.map((m) => ({
                placement: m.placement,
                elims: m.elims,
                points: m.points,
                poi: m.poi,
                contested: m.contested,
                diedPhase: m.diedPhase,
                matsAtEndgame: m.matsAtEndgame,
                partnerDowns: m.partnerDowns,
                reboots: m.reboots,
                // Tag, not id: player ids embed Date.now() and so can never
                // be stable between two runs. The tag identifies them just as
                // well and does not lie about what changed.
                players: (m.players ?? []).map((pl) => ({
                  tag: pl.tag,
                  elims: pl.elims,
                  survived: pl.survived,
                })),
                summary: m.summary,
                detail: m.detail,
              })),
            })
          }
        }
      }
    }
  }
  return rows
}

function hashOf(rows: Row[]): string {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16)
}

const mode = process.argv[2] === 'write' ? 'write' : 'verify'
const rows = run()
const hash = hashOf(rows)
const sessions = rows.length
const matches = rows.reduce((a, r) => a + r.matches.length, 0)

if (mode === 'write') {
  writeFileSync(BASELINE, JSON.stringify({ hash, sessions, rows }, null, 1))
  console.log(`\nwrote baseline: ${sessions} sessions, ${matches} matches, hash ${hash}`)
  console.log(`  -> ${BASELINE}\n`)
  process.exit(0)
}

if (!existsSync(BASELINE)) {
  console.error('\nNo baseline. Run `npm run snapshot:sim` first.\n')
  process.exit(1)
}

const prev = JSON.parse(readFileSync(BASELINE, 'utf8')) as { hash: string; rows: Row[] }
console.log(`\n${sessions} sessions, ${matches} matches`)
console.log(`  baseline hash ${prev.hash}`)
console.log(`  current  hash ${hash}`)

if (prev.hash === hash) {
  console.log('\nOK - the sim is byte-identical to the baseline.\n')
  process.exit(0)
}

// Something moved. Say exactly what.
let shown = 0
let differing = 0
for (let i = 0; i < Math.max(prev.rows.length, rows.length); i++) {
  const a = prev.rows[i]
  const b = rows[i]
  if (JSON.stringify(a) === JSON.stringify(b)) continue
  differing++
  if (shown >= 5) continue
  shown++
  console.log(`\n  DIFF  ${b?.id ?? a?.id}`)
  if (!a || !b) {
    console.log('    the matrix itself changed size')
    continue
  }
  for (const k of ['totalPoints', 'totalElims', 'bestPlacement', 'wins'] as const) {
    if (a[k] !== b[k]) console.log(`    ${k}: ${a[k]} -> ${b[k]}`)
  }
  for (let m = 0; m < Math.max(a.matches.length, b.matches.length); m++) {
    const ma = JSON.stringify(a.matches[m])
    const mb = JSON.stringify(b.matches[m])
    if (ma === mb) continue
    console.log(`    match ${m + 1} was: ${ma?.slice(0, 220)}`)
    console.log(`    match ${m + 1} now: ${mb?.slice(0, 220)}`)
    break
  }
}

console.log(`\n${differing} of ${rows.length} sessions differ.`)
console.log('If this was meant to be a pure refactor, something broke.')
console.log('If you changed the sim on purpose, re-run `npm run snapshot:sim`.\n')
process.exit(1)
