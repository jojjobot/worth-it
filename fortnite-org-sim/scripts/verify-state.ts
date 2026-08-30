// ---------------------------------------------------------------------------
// PER-PLAYER MATCH STATE (build step 4)
//
// The brief asks for two things to be true, and for them to be MEASURED rather
// than asserted:
//
//   1. mats actually deplete across a match
//   2. entering the closing circles under 100 mats usually kills you
//
//   npm run verify:state
//
// It also checks the rest of the state is really carried: HP falls and is not
// just shield, damage is recorded, a loot tier is assigned and survives, and
// nobody finishes a match holding impossible numbers.
// ---------------------------------------------------------------------------

import { createNewGame } from '../src/engine/game'
import { simulateMatch, type SessionOptions } from '../src/engine/sim'
import { Rng } from '../src/engine/rng'
import { BAL } from '../src/engine/config'
import type { Player, Strategy } from '../src/engine/types'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
}

const state = createNewGame('State Org', 'EU', 'verify-state')
function byTag(tag: string): Player {
  const p = Object.values(state.players).find((x) => x.tag.toLowerCase() === tag.toLowerCase())
  if (!p) throw new Error(`no such player: ${tag}`)
  return p
}

const DUOS: [string, string][] = [
  ['Peterbot', 'Pollo'],
  ['Kami', 'charyy'],
  ['Veno', 'Curve'],
]

interface Sample {
  placement: number
  matsAtEndgame: number
  reachedEndgame: boolean
  diedPhase: string
  minMats: number
  hp: number[]
  damage: number[]
  lootTier: string
  zones: number
}

function run(matches: number): Sample[] {
  const out: Sample[] = []
  for (const tags of DUOS) {
    const players = tags.map(byTag)
    for (const strategy of ['contest', 'balanced', 'safe'] as Strategy[]) {
      for (let seed = 1; seed <= matches; seed++) {
        const opts: SessionOptions = {
          matches: 10,
          lobbyRating: 118,
          scoringId: 'fncs',
          strategy,
          gamesTogether: 140,
        }
        const rng = new Rng(seed * 7919)
        for (let i = 0; i < opts.matches; i++) {
          const m = simulateMatch(players, opts, i, 2, rng)
          const lines = m.players ?? []
          out.push({
            placement: m.placement,
            matsAtEndgame: m.matsAtEndgame,
            reachedEndgame: m.diedPhase === 'endgame' || m.diedPhase === 'won',
            diedPhase: m.diedPhase,
            minMats: Math.min(...lines.map((l) => l.matsLeft ?? 0)),
            hp: lines.map((l) => l.hp ?? -1),
            damage: lines.map((l) => l.damageTaken ?? -1),
            lootTier: lines[0]?.lootTier ?? '?',
            zones: Math.max(...lines.map((l) => l.zonesSurvived ?? 0)),
          })
        }
      }
    }
  }
  return out
}

const samples = run(40)
console.log(`\n--- ${samples.length} matches ---\n`)

// --- 1. Is the state actually there? ---------------------------------------

console.log('--- the state is really carried ---')
check('every match reports per-player HP', samples.every((s) => s.hp.every((h) => h >= 0)))
check('every match reports damage taken', samples.every((s) => s.damage.every((d) => d >= 0)))
check(
  'every match assigns a loot tier',
  samples.every((s) => ['grey', 'green', 'blue', 'purple', 'gold'].includes(s.lootTier)),
)
check('HP never goes negative or above the cap',
  samples.every((s) => s.hp.every((h) => h >= 0 && h <= BAL.simulation.health.hpMax)))
check('mats never go negative', samples.every((s) => s.minMats >= 0))

// A match that ends at the drop cannot accrue damage - the duo is wiped by
// takeCasualty before anything chips them - so those are not evidence either way.
const pastDrop = samples.filter((s) => s.diedPhase !== 'drop')
const tookDamage = pastDrop.filter((s) => s.damage.some((d) => d > 0)).length / pastDrop.length
check('a match that gets past the drop nearly always costs real damage', tookDamage > 0.85,
  `${(tookDamage * 100).toFixed(0)}% of ${pastDrop.length}`)

const lostHp = samples.filter((s) => s.hp.some((h) => h < BAL.simulation.health.hpMax)).length
check('HP is a real number, not just shield', lostHp > 0,
  `${((lostHp / samples.length) * 100).toFixed(0)}% of matches end below full HP`)

const tierSpread = new Set(samples.map((s) => s.lootTier))
check('loot tiers vary rather than being one constant', tierSpread.size >= 3,
  [...tierSpread].join(', '))

// --- 2. Do mats deplete? ----------------------------------------------------

console.log('\n--- do mats deplete? ---')
const reached = samples.filter((s) => s.reachedEndgame)
const avgAtEndgame = reached.reduce((a, s) => a + s.matsAtEndgame, 0) / Math.max(1, reached.length)
const endedEmpty = reached.filter((s) => s.minMats <= 0).length
const matsCap = BAL.simulation.loot.matsCap

console.log(`  reached the endgame in ${reached.length} of ${samples.length} matches`)
console.log(`  average mats entering the endgame: ${avgAtEndgame.toFixed(0)} (cap ${matsCap})`)
console.log(`  finished on ZERO mats: ${((endedEmpty / Math.max(1, reached.length)) * 100).toFixed(0)}%`)

check('mats entering the endgame are well below the cap', avgAtEndgame < matsCap * 0.85,
  `${avgAtEndgame.toFixed(0)} vs cap ${matsCap}`)
check('somebody actually runs dry sometimes', endedEmpty > 0)
check('but not everybody, every time', endedEmpty < reached.length)

// --- 3. THE HEADLINE: does running short kill you? -------------------------

console.log('\n--- entering the closing circles short of mats ---')
const comfortable = BAL.simulation.endGame.matsPressure.comfortable
const rich = reached.filter((s) => s.matsAtEndgame >= comfortable)
const poor = reached.filter((s) => s.matsAtEndgame < comfortable)

function died(list: Sample[]): number {
  return list.filter((s) => s.placement > 1).length / Math.max(1, list.length)
}
function top5(list: Sample[]): number {
  return list.filter((s) => s.placement <= 5).length / Math.max(1, list.length)
}
function median(list: Sample[]): number {
  if (list.length === 0) return 0
  const v = list.map((s) => s.placement).sort((a, b) => a - b)
  return v[Math.floor(v.length / 2)]
}

console.log(`  with ${comfortable}+ mats:  ${rich.length} matches, median placement ${median(rich)}, top-5 ${(top5(rich) * 100).toFixed(0)}%`)
console.log(`  under ${comfortable} mats:  ${poor.length} matches, median placement ${median(poor)}, top-5 ${(top5(poor) * 100).toFixed(0)}%`)

check('a duo that arrives short of mats does reach the endgame sometimes', poor.length > 0)
check(
  `arriving under ${comfortable} mats USUALLY kills you`,
  died(poor) > 0.85,
  `${(died(poor) * 100).toFixed(0)}% of them died short of the win`,
)
check(
  'and it is measurably worse than arriving with mats',
  median(poor) > median(rich),
  `median ${median(poor)} vs ${median(rich)}`,
)
check(
  'arriving with mats converts to top 5 far more often',
  top5(rich) > top5(poor) * 1.4,
  `${(top5(rich) * 100).toFixed(0)}% vs ${(top5(poor) * 100).toFixed(0)}%`,
)

console.log(`\n${failures > 0 ? `${failures} check(s) failed` : 'OK - all checks passed'}\n`)
if (failures > 0) throw new Error(`${failures} check(s) failed`)
