// ---------------------------------------------------------------------------
// Proves that a save made BEFORE a player was added to real_players.json picks
// that player up on the next load.
//
// It fakes an old save by taking a fresh game and stripping it back to the
// original twelve players and seven orgs - the shape of a save started at
// commit dbfc4df - including the boltz + Rapid pairing that file wrongly
// carried for Twisted Minds. Then it runs syncRealScene() and checks the scene
// comes back whole without disturbing anything the player owns.
//
//   npm run verify:sync
// ---------------------------------------------------------------------------

import { createNewGame, syncRealScene } from '../src/engine/game'
import { REAL, realDuoDefs } from '../src/engine/realPlayers'
import { playerOverall } from '../src/engine/players'
import type { GameState } from '../src/engine/types'

/** Everyone who was not in the original twelve. */
const ADDED_LATER = [
  'Rapid', 'Veno', 'Th0masHD', 'Darm', 'Demus',
  'Cold', 'Acorn', 'Clix', 'Ajerss', 'Ritual',
  'Queasy', 'Merstach', 'TaySon', 'Setty', 'JannisZ',
  'Cheatiin', 'Flickzy', 'Chap', 'Khanada', 'VicterV',
]
const ORGS_ADDED_LATER = [
  't1', 'xset', 'geng',
  'godlike', 'dignitas', 'nigma', 'mates', 'cgn-aight',
]

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
}

function findByTag(state: GameState, tag: string) {
  return Object.values(state.players).find((p) => p.tag.toLowerCase() === tag.toLowerCase())
}

function drop(state: GameState, id: string) {
  delete state.players[id]
  state.marketIds = state.marketIds.filter((x) => x !== id)
}

/** Strip a fresh save back to what it would have looked like as an old one. */
function ageTheSaveBackwards(state: GameState): void {
  for (const tag of ADDED_LATER) {
    const p = findByTag(state, tag)
    if (!p) throw new Error(`${tag} is not in a fresh game - is real_players.json intact?`)
    drop(state, p.id)
  }

  // Orgs that did not exist yet lose their duos and everyone sitting in them.
  state.rivalDuos = state.rivalDuos.filter((d) => {
    if (!ORGS_ADDED_LATER.includes(d.orgId)) return true
    for (const id of d.playerIds) drop(state, id)
    return false
  })

  // An old save had no defId at all - that is what the fallback matching is for.
  for (const d of state.rivalDuos) delete d.defId

  // Twisted Minds fielded ONE duo, boltz + Rapid. Rapid is gone with the rest,
  // so rebuild that duo as boltz plus the stand-in an old save would have had,
  // and delete the second duo, which could not have existed.
  const tmDuos = state.rivalDuos.filter((d) => d.orgId === 'twisted')
  for (const d of tmDuos.slice(1)) {
    for (const id of d.playerIds) drop(state, id)
  }
  state.rivalDuos = state.rivalDuos.filter((d) => !tmDuos.slice(1).includes(d))
  const tm = tmDuos[0]
  const boltz = findByTag(state, 'boltz')!
  const standIn = {
    ...boltz,
    id: 'standin-tm',
    tag: 'OldStandIn',
    isReal: false,
    realName: undefined,
    orgName: 'Twisted Minds',
    joinedWeek: null,
  }
  for (const id of tm.playerIds) if (id !== boltz.id) drop(state, id)
  state.players[standIn.id] = standIn as typeof boltz
  state.marketIds.push(standIn.id)
  tm.playerIds = [boltz.id, standIn.id]
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
console.log(`  real players in the old save: ${Object.values(state.players).filter((p) => p.isReal).length}`)
console.log(`  rival duos in the old save:   ${state.rivalDuos.length}`)
console.log(`  Twisted Minds fielded:        boltz + OldStandIn`)

console.log('')
console.log('--- after syncRealScene() ---')
const added = syncRealScene(state)
console.log(`  added: ${added.join(', ') || '(none)'}`)

const expectedDuos = realDuoDefs().length
const tagsOf = (orgId: string, defId: string) =>
  state.rivalDuos
    .filter((d) => d.orgId === orgId && d.defId === defId)
    .flatMap((d) => d.playerIds.map((id) => state.players[id]?.tag))

check('all twenty missing players came back', ADDED_LATER.every((t) => !!findByTag(state, t)),
  ADDED_LATER.filter((t) => !findByTag(state, t)).join(', '))
check('every player in the file is now live',
  (REAL.players as any[]).every((e) => !!findByTag(state, e.gamertag)))
check(`real player count is ${(REAL.players as any[]).length}`,
  Object.values(state.players).filter((p) => p.isReal).length === (REAL.players as any[]).length,
  String(Object.values(state.players).filter((p) => p.isReal).length))
check('the new names are on the transfer market',
  ADDED_LATER.every((t) => state.marketIds.includes(findByTag(state, t)!.id)))
check(`every authored duo exists (${expectedDuos})`,
  state.rivalDuos.length === expectedDuos, `${state.rivalDuos.length} duos`)
check('no rival duo has an empty or dangling seat',
  state.rivalDuos.every((d) => d.playerIds.length === 2 && d.playerIds.every((id) => !!state.players[id])))
check('every duo carries its defId now',
  state.rivalDuos.every((d) => !!d.defId))
check('Twisted Minds fields TWO duos',
  state.rivalDuos.filter((d) => d.orgId === 'twisted').length === 2)
check('the old boltz duo became boltz + Acorn, not a new pair',
  tagsOf('twisted', 'twisted-a').includes('boltz') && tagsOf('twisted', 'twisted-a').includes('Acorn'),
  tagsOf('twisted', 'twisted-a').join(' + '))
check('the second Twisted Minds duo is Cold + Rapid',
  tagsOf('twisted', 'twisted-b').includes('Cold') && tagsOf('twisted', 'twisted-b').includes('Rapid'),
  tagsOf('twisted', 'twisted-b').join(' + '))
check('Gen.G arrived with Ajerss + Ritual',
  tagsOf('geng', 'geng-a').includes('Ajerss') && tagsOf('geng', 'geng-a').includes('Ritual'),
  tagsOf('geng', 'geng-a').join(' + '))
check('the cross-org pairing exists as one duo',
  tagsOf('cgn-aight', 'cgn-aight').includes('JannisZ') &&
    tagsOf('cgn-aight', 'cgn-aight').includes('Cheatiin'),
  tagsOf('cgn-aight', 'cgn-aight').join(' + '))
check('its two players stayed at their own separate orgs',
  findByTag(state, 'JannisZ')!.orgName === 'CGN Esports' &&
    findByTag(state, 'Cheatiin')!.orgName === 'AIGHT')
check('Dignitas arrived with Khanada + VicterV',
  tagsOf('dignitas', 'dignitas-a').includes('Khanada') &&
    tagsOf('dignitas', 'dignitas-a').includes('VicterV'),
  tagsOf('dignitas', 'dignitas-a').join(' + '))
check('the free agents are in no duo at all',
  ['TaySon', 'Setty'].every(
    (t) => !state.rivalDuos.some((d) => d.playerIds.includes(findByTag(state, t)!.id)),
  ))
check('the evicted stand-in is gone from players and market',
  !state.players['standin-tm'] && !state.marketIds.includes('standin-tm'))
check('Clix is on XSET but in no duo (he has no fixed partner)',
  findByTag(state, 'Clix')!.orgName === 'XSET' &&
    !state.rivalDuos.some((d) => d.playerIds.includes(findByTag(state, 'Clix')!.id)))
check('nobody sits in two duos at once',
  (() => {
    const seen = new Set<string>()
    for (const d of state.rivalDuos) for (const id of d.playerIds) {
      if (seen.has(id)) return false
      seen.add(id)
    }
    return true
  })())
check('the player you signed is still on your roster',
  state.rosterIds.includes(signed.id) && signed.orgName === state.orgName)
check('the sync did not wipe their trained ratings',
  playerOverall(signed) >= signedOvrTrained - 0.01,
  `${signedOvrBefore.toFixed(1)} -> trained ${signedOvrTrained.toFixed(1)} -> now ${playerOverall(signed).toFixed(1)}`)
check('their potential still sits at or above their current',
  Object.keys(signed.peak).every((k) => (signed.peak as any)[k] >= (signed.current as any)[k]))
check('no real player was given an ego',
  Object.values(state.players).filter((p) => p.isReal).every((p) => p.ego === null))
check('no under-18 carries a real name',
  Object.values(state.players).filter((p) => p.isReal).every((p) => p.age >= 18 || !p.realName))
check('Th0masHD is still a clean free agent',
  (() => { const p = findByTag(state, 'Th0masHD')!; return p.orgName === null && p.buyout === 0 && p.contractWeeks === 0 })())
check('the news log tells you the new names arrived',
  state.newsLog.some((n) => n.text.includes('Clix') && n.text.includes('Ajerss')))

console.log('')
console.log('--- running it a second time is a no-op ---')
const before = JSON.stringify({ p: Object.keys(state.players).sort(), m: [...state.marketIds].sort() })
const addedAgain = syncRealScene(state)
const after = JSON.stringify({ p: Object.keys(state.players).sort(), m: [...state.marketIds].sort() })
check('nothing added on the second pass', addedAgain.length === 0)
check('the roster is byte-identical', before === after)
check('still exactly the authored number of duos', state.rivalDuos.length === expectedDuos,
  `${state.rivalDuos.length} duos`)

console.log('')
if (failures > 0) throw new Error(`${failures} check(s) failed`)
console.log('OK - all checks passed')
