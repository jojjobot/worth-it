// ---------------------------------------------------------------------------
// THE MODIFIER LEDGER
//
// The brief's rule: if a key in the registry is never actually reached by the
// engine, every badge hooking into it is dead code. A comment claiming a key is
// wired in proves nothing - so this runs real matches and records which keys
// the engine genuinely asked about.
//
//   npm run verify:modifiers
//
// It fails if a key says `wiredIn: 3` but never gets called. Keys marked for a
// later build step are listed as pending, not failed - they are declared on
// purpose, waiting for the phases that give them meaning.
//
// It also proves the pipeline does what it claims: strongest-wins rather than
// stacking, clamping, and no-op behaviour when nothing is registered.
// ---------------------------------------------------------------------------

import { createNewGame } from '../src/engine/game'
import { simulateSession, type SessionOptions } from '../src/engine/sim'
import { Rng } from '../src/engine/rng'
import {
  MODIFIER_KEYS,
  clearModifiers,
  keysExercised,
  registerModifier,
  resetKeysExercised,
  resolve,
  type ModifierContext,
} from '../src/engine/modifiers'
import type { Player, Strategy } from '../src/engine/types'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  -> ' + detail : ''}`)
}

// --- 1. Exercise the engine hard -------------------------------------------

const state = createNewGame('Ledger Org', 'EU', 'modifier-ledger')
function byTag(tag: string): Player {
  const p = Object.values(state.players).find((x) => x.tag.toLowerCase() === tag.toLowerCase())
  if (!p) throw new Error(`no such player: ${tag}`)
  return p
}

resetKeysExercised()
let matchesRun = 0
for (const tags of [
  ['Peterbot', 'Pollo'],
  ['Kami', 'charyy'],
  ['shxrk', 't3eny'],
]) {
  const players = tags.map(byTag)
  for (const strategy of ['contest', 'balanced', 'safe'] as Strategy[]) {
    for (const isLan of [false, true]) {
      for (let seed = 1; seed <= 12; seed++) {
        const opts: SessionOptions = {
          matches: 10,
          lobbyRating: seed % 2 === 0 ? 96 : 124,
          scoringId: 'fncs',
          strategy,
          gamesTogether: 60,
          isLan,
        }
        simulateSession(players, opts, new Rng(seed * 977))
        matchesRun += opts.matches
      }
    }
  }
}

const seen = keysExercised()
console.log(`\n--- ran ${matchesRun} matches ---\n`)

const live = MODIFIER_KEYS.filter((k) => k.wiredIn <= 3)
const pending = MODIFIER_KEYS.filter((k) => k.wiredIn > 3)

console.log(`--- keys the engine actually reached (${seen.size}) ---`)
for (const k of live) {
  check(`${k.id.padEnd(28)} ${k.phase}`, seen.has(k.id), seen.has(k.id) ? '' : 'NEVER CALLED')
}

console.log(`\n--- declared, waiting on a later step (${pending.length}) ---`)
for (const k of pending) {
  const wrong = seen.has(k.id)
  if (wrong) failures++
  console.log(
    `  ${wrong ? 'FAIL' : 'wait'}  ${k.id.padEnd(28)} step ${k.wiredIn}` +
      (wrong ? '  -> called already, so update wiredIn' : ''),
  )
}

console.log('\n--- registry sanity ---')
check('every key has a clamp shape',
  MODIFIER_KEYS.every((k) => ['probability', 'substat', 'amount', 'signed'].includes(k.clamp)))
check('every key explains where its base comes from',
  MODIFIER_KEYS.every((k) => typeof k.base === 'string' && k.base.length > 10))
check('no duplicate keys',
  new Set(MODIFIER_KEYS.map((k) => k.id)).size === MODIFIER_KEYS.length)
check(`the brief's 23 keys all exist`, MODIFIER_KEYS.length === 23,
  `${MODIFIER_KEYS.length} keys`)

// --- 2. The pipeline's own rules -------------------------------------------

console.log('\n--- pipeline behaviour ---')
const ctx: ModifierContext = { phase: 'midgame' }

clearModifiers()
check('with nothing registered, resolve is the identity function',
  resolve('MAT_COST', 137.5, ctx) === 137.5)

registerModifier({
  id: 'test.weak', label: 'Weak', source: 'badge', key: 'MAT_COST', strength: 1,
  apply: (v) => v - 10,
})
registerModifier({
  id: 'test.strong', label: 'Strong', source: 'badge', key: 'MAT_COST', strength: 5,
  apply: (v) => v - 50,
})
check('modifiers on one key do NOT stack - strongest wins outright',
  resolve('MAT_COST', 100, ctx) === 50, `100 -> ${resolve('MAT_COST', 100, ctx)}`)

clearModifiers()
registerModifier({
  id: 'test.endgame_only', label: 'Endgame only', source: 'playstyle', key: 'MAT_COST', strength: 1,
  applies: (c) => c.phase === 'endgame',
  apply: (v) => v * 0.5,
})
check('a modifier whose trigger does not match leaves the value alone',
  resolve('MAT_COST', 80, { phase: 'midgame' }) === 80)
check('and applies when it does match',
  resolve('MAT_COST', 80, { phase: 'endgame' }) === 40)

clearModifiers()
registerModifier({
  id: 'test.waits_on_step4', label: 'Needs loot tier', source: 'badge', key: 'MAT_COST', strength: 1,
  applies: (c) => c.lootTier === 'grey',
  apply: (v) => v * 0.1,
})
check('a modifier waiting on state the engine does not carry yet never fires',
  resolve('MAT_COST', 80, { phase: 'midgame' }) === 80)

clearModifiers()
registerModifier({
  id: 'test.overshoot', label: 'Overshoot', source: 'badge', key: 'OPENING_EXCHANGE_PROB', strength: 1,
  apply: () => 4.2,
})
check('a probability is clamped to 0.99, never a certainty',
  resolve('OPENING_EXCHANGE_PROB', 0.5, ctx) === 0.99)

clearModifiers()
registerModifier({
  id: 'test.undershoot', label: 'Undershoot', source: 'badge', key: 'OPENING_EXCHANGE_PROB', strength: 1,
  apply: () => -3,
})
check('and to 0.01, never an impossibility',
  resolve('OPENING_EXCHANGE_PROB', 0.5, ctx) === 0.01)

clearModifiers()
registerModifier({
  id: 'test.negative_cost', label: 'Negative cost', source: 'badge', key: 'MAT_COST', strength: 1,
  apply: () => -40,
})
check('a cost can never go negative and pay you mats',
  resolve('MAT_COST', 50, ctx) === 0)

clearModifiers()
registerModifier({
  id: 'test.stage_fright', label: 'Stage fright', source: 'badge', key: 'LAN_PENALTY', strength: 1,
  apply: (v) => v - 5,
})
check('LAN_PENALTY keeps its sign - stage fright is a negative swing',
  resolve('LAN_PENALTY', -2, ctx) === -7, `-2 -> ${resolve('LAN_PENALTY', -2, ctx)}`)

clearModifiers()
let threw = false
try {
  registerModifier({
    id: 'test.typo', label: 'Typo', source: 'badge', key: 'NOT_A_REAL_KEY' as never, strength: 1,
    apply: (v) => v,
  })
} catch {
  threw = true
}
check('registering against an unknown key throws instead of silently doing nothing', threw)
clearModifiers()

console.log(
  `\n${failures > 0 ? `${failures} check(s) failed` : 'OK - all checks passed'}` +
    `\n${live.length} keys live, ${pending.length} declared for later steps.\n`,
)
if (failures > 0) throw new Error(`${failures} check(s) failed`)
