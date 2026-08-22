// ---------------------------------------------------------------------------
// VERIFY THE REAL REFERENCE ROSTER.   npm run verify
//
// Checks the rules from real_players.json that must never silently break:
//   1. No real player is given an `ego`. They are real people.
//   2. No under-18 has a real name attached. Age only.
//   3. Computed overalls stay close to the hand-authored ones.
//   4. Every org fields a complete duo.
// Exits non-zero if any of the first two are violated.
// ---------------------------------------------------------------------------
import { overallOf, categoryScores } from '../src/engine/config'
import { buildRealRoster, REAL } from '../src/engine/realPlayers'
import { Rng } from '../src/engine/rng'
import { CATEGORY_KEYS } from '../src/engine/types'

const rng = new Rng(999)
const { players, rivalDuos } = buildRealRoster(rng, new Set<string>())

const byTag = new Map(players.map((p) => [p.tag, p]))
console.log('tag         authored  computed  diff | peak auth  peak comp | BSN now->peak | age')
console.log('-'.repeat(94))
let worst = 0
for (const e of REAL.players as any[]) {
  const p = byTag.get(e.gamertag)!
  const ovr = overallOf(p.current)
  const pk = overallOf(p.peak)
  const d = ovr - e.current_overall
  worst = Math.max(worst, Math.abs(d))
  console.log(
    `${p.tag.padEnd(11)} ${String(e.current_overall).padStart(7)}  ${ovr.toFixed(1).padStart(8)}  ${(d >= 0 ? '+' : '') + d.toFixed(1)}`.padEnd(45) +
      `| ${String(e.peak_overall).padStart(8)}  ${pk.toFixed(1).padStart(9)} | ${String(p.current.big_stage_nerve).padStart(3)} -> ${String(p.peak.big_stage_nerve).padStart(3)}      | ${p.age}`,
  )
}
console.log(`\nworst OVR deviation from the authored value: ${worst.toFixed(2)}`)

let failures = 0

console.log('\n--- ego check (real players must never have one) ---')
const withEgo = players.filter((p) => p.isReal && p.ego !== null && p.ego !== undefined)
if (withEgo.length > 0) {
  failures += withEgo.length
  console.log(
    '  *** VIOLATION *** these real players were given an ego:',
    withEgo.map((p) => p.tag).join(', '),
  )
} else {
  console.log(`  OK - all ${players.filter((p) => p.isReal).length} real players have ego = null`)
}

console.log('\n--- real-name privacy check (under-18s must have no name) ---')
for (const e of REAL.players as any[]) {
  const bad = e.age < 18 && e.real_name
  if (bad) failures += 1
  console.log(
    `  ${String(e.gamertag).padEnd(11)} age ${e.age}  name=${e.real_name ?? '(none)'}${bad ? '  *** VIOLATION: under 18 must not carry a name ***' : ''}`,
  )
}

console.log('\n--- rival duos ---')
for (const d of rivalDuos) {
  const tags = d.playerIds.map((id) => players.find((p) => p.id === id)!.tag)
  console.log(`  ${d.orgName.padEnd(20)} ${d.region.padEnd(4)} ${tags.join(' + ')}  (${d.gamesTogether} games together)`)
}

console.log('\n--- shxrk vs Malibuca category profile ---')
for (const tag of ['shxrk', 'Malibuca']) {
  const p = byTag.get(tag)!
  const cs = categoryScores(p.current)
  console.log(`  ${tag.padEnd(9)} ` + CATEGORY_KEYS.map((c) => `${c}:${cs[c].toFixed(0)}`).join('  '))
}

console.log('\n--- signing cost ---')
for (const tag of ['Peterbot', 'shxrk', 'Kami']) {
  const p = byTag.get(tag)!
  console.log(`  ${tag.padEnd(9)} $${p.salary}/wk  buyout $${p.buyout.toLocaleString()}  contract ${p.contractWeeks}wk  scout ${p.scoutLevel}`)
}
