// ---------------------------------------------------------------------------
// Proves that a save made BEFORE a player was added to real_players.json picks
// that player up on the next load.
//
// It fakes an old save by taking a fresh game and deleting the five players who
// were added in the 12 -> 17 pass, plus the two orgs (T1, XSET) that came with
// them - exactly the shape of a save started at commit dbfc4df. Then it runs
// syncRealScene() and checks the scene came back whole without disturbing
// anything the player owns.
//
//   npm run verify:sync
// ---------------------------------------------------------------------------

import { createNewGame, syncRealScene } from '../src/engine/game'
import { REAL, REAL_ORGS } from '../src/engine/realPlayers'
import { playerOverall } from '../src/engine/players'
import type { GameState } from '../src/engine/types'

const ADDED_LATER = ['Rapid', 'Veno', 'Th0masHD', 'Darm', 'Demus']
const ORGS_ADDED_LATER = ['t1', 'xset']

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
}

function findByTag(state: GameState, tag: string) {
  return Object.values(state.players).find((p) => p.tag.toLowerCase() === tag.toLowerCase())
}

/** Strip a fresh save back to what it would have looked like as an old one. */
function ageTheSaveBackwards(state: GameState): void {
  for (const tag of ADDED_LATER) {
    const p = findByTag(state, tag)
    if (!p) throw new Error(`${tag} is not in a fresh game - is real_players.json intact?`)
    delete state.players[p.id]
    state.marketIds = state.marketIds.filter((id) => id !== p.id)
  }
  state.rivalDuos = state.rivalDuos.filter((d) => {
    if (!ORGS_ADDED_LATER.includes(d.orgId)) return true
    for (const id of d.playerIds) {
      delete state.players[id]
      state.marketIds = state.marketIds.filter((x) => x !== id)
    }
    return false
  })
  // Twisted Minds fielded a generated stand-in in the seat Rapid now holds.
  const tm = state.rivalDuos.find((d) => d.orgId === 'twisted')!
  const gone = tm.playerIds.filter((id) => !state.players[id])
  for (const id of gone) {
    tm.playerIds = tm.playerIds.map((x) => (x === id ? 'stand-in' : x)) as [string, string]
  }
  if (tm.playerIds.includes('stand-in')) {
    const filler = Object.values(state.players).find((p) => !p.isReal && p.orgName === null)!
    const clone = { ...filler, id: 'standin-tm', tag: 'OldStandIn', orgName: 'Twisted Minds' }
    state.players[clone.id] = clone
    state.marketIds.push(clone.id)
    tm.playerIds = tm.playerIds.map((x) => (x === 'stand-in' ? clone.id : x)) as [string, string]
  }
}

console.log('--- an old save, before the sync ---')
const state = createNewGame('Test Org', 'EU', 'sync-test')

// Sign one real player first, so we can prove the sync leaves your roster alone.
const signed = findByTag(state, 'Kami')!
signed.orgName = state.orgName
signed.joinedWeek = 1
signed.contractWeeks = 40
state.rosterIds.push(signed.id)
state.marketIds = state.marketIds.filter((id) => id !== signed.id)
const signedOvrBefore = playerOverall(signed)
// Pretend a season of training happened.
for (const k of Object.keys(signed.current) as (keyof typeof signed.current)[]) {
  signed.current[k] = Math.min(99, signed.current[k] + 2)
}
const signedOvrTrained = playerOverall(signed)

ageTheSaveBackwards(state)
const realBefore = Object.values(state.players).filter((p) => p.isReal).length
console.log(`  real players in the old save: ${realBefore}`)
console.log(`  rival duos in the old save:   ${state.rivalDuos.length}`)

console.log('\n--- after syncRealScene() ---')
const added = syncRealScene(state)
console.log(`  added: ${added.join(', ') || '(none)'}`)

check('all five missing players came back', ADDED_LATER.every((t) => !!findByTag(state, t)),
  ADDED_LATER.filter((t) => !findByTag(state, t)).join(', '))
check('every player in the file is now live',
  (REAL.players as any[]).every((e) => !!findByTag(state, e.gamertag)))
check(`real player count is ${(REAL.players as any[]).length}`,
  Object.values(state.players).filter((p) => p.isReal).length === (REAL.players as any[]).length,
  String(Object.values(state.players).filter((p) => p.isReal).length))
check('the new names are on the transfer market',
  ADDED_LATER.every((t) => state.marketIds.includes(findByTag(state, t)!.id)))
check(`every org has a rival duo (${REAL_ORGS.length})`,
  REAL_ORGS.every((o) => state.rivalDuos.some((d) => d.orgId === o.id)),
  `${state.rivalDuos.length} duos`)
check('no rival duo has an empty or dangling seat',
  state.rivalDuos.every((d) => d.playerIds.length === 2 && d.playerIds.every((id) => !!state.players[id])))
check('Twisted Minds now fields Rapid instead of the stand-in',
  state.rivalDuos.find((d) => d.orgId === 'twisted')!.playerIds.includes(findByTag(state, 'Rapid')!.id))
check('the evicted stand-in is gone from players and market',
  !state.players['standin-tm'] && !state.marketIds.includes('standin-tm'))
check('the player you signed is still on your roster',
  state.rosterIds.includes(signed.id) && signed.orgName === state.orgName)
check('the sync did not wipe their trained ratings',
  playerOverall(signed) >= signedOvrTrained - 0.01,
  `${signedOvrBefore.toFixed(1)} -> trained ${signedOvrTrained.toFixed(1)} -> now ${playerOverall(signed).toFixed(1)}`)
check('their potential still sits at or above their current',
  Object.keys(signed.peak).every((k) => (signed.peak as any)[k] >= (signed.current as any)[k]))
check('no real player was given an ego',
  Object.values(state.players).filter((p) => p.isReal).every((p) => p.ego === null))
check('Th0masHD is still a clean free agent',
  (() => { const p = findByTag(state, 'Th0masHD')!; return p.orgName === null && p.buyout === 0 && p.contractWeeks === 0 })())
check('the news log tells you the new names arrived',
  state.newsLog.some((n) => n.text.includes('Rapid') && n.text.includes('Veno')))

console.log('\n--- running it a second time is a no-op ---')
const before = JSON.stringify({ p: Object.keys(state.players).sort(), m: [...state.marketIds].sort() })
const addedAgain = syncRealScene(state)
const after = JSON.stringify({ p: Object.keys(state.players).sort(), m: [...state.marketIds].sort() })
check('nothing added on the second pass', addedAgain.length === 0)
check('the roster is byte-identical', before === after)

if (failures > 0) throw new Error(`${failures} check(s) failed`)
console.log('')
console.log('OK - all checks passed')
