// ---------------------------------------------------------------------------
// Weekly training. Everything here is driven by /src/data/training.json.
//
// The two brakes on training are the player's hidden PEAK (you cannot train a
// sub-stat past its ceiling, and gains slow right down as they approach it)
// and AGE (a 14-year-old improves several times faster than a 23-year-old).
// Hard programs stack BURNOUT, which hurts match performance until they rest.
//
// BIG STAGE NERVE CANNOT BE TRAINED. It is earned at LANs and Grand Finals -
// see attributes.json -> bigStageNerve. No program may move it.
//
// NOTE: the programs in training.json are still written in the OLD 11-attribute
// vocabulary. Each old name is expanded into its group of new sub-stats through
// attributes.json -> legacyBridge. Build step 6 rewrites the programs directly
// in sub-stat terms and this expansion goes away.
// ---------------------------------------------------------------------------

import { ATTRS, LEGACY_BRIDGE, TRAIN, getProgram } from './config'
import { Rng, clamp, interpolateTable } from './rng'
import type { AttrKey, Player, SubKey } from './types'

export interface TrainingOutcome {
  playerId: string
  tag: string
  gains: Partial<Record<SubKey, number>>
  burnoutDelta: number
  cost: number
  note: string
}

/**
 * Apply one week of training to one player.
 * `coachComms` is the highest Communication rating in their trio - good
 * communicators lift the whole room, so the trio leader speeds everyone up.
 */
export function applyTraining(player: Player, coachComms: number, rng: Rng): TrainingOutcome {
  const m = TRAIN.model
  const program = getProgram(player.trainingProgram)
  const gains: Partial<Record<SubKey, number>> = {}

  const ageFactor = interpolateTable(m.ageFactor, player.age)
  const burnoutFactor = 1 - (player.burnout / 100) * m.burnout.trainingPenaltyAtMax
  const commsFactor = 1 + Math.max(0, coachComms - 60) * m.commsCoachBonus * 0.01 * 10
  const nerveLocked = ATTRS.bigStageNerve.cannotBeTrained !== false

  let atCeiling = true

  for (const [key, weight] of Object.entries(program.targets)) {
    if (key.startsWith('__')) continue
    const subs = LEGACY_BRIDGE[key as AttrKey] ?? []
    for (const sub of subs) {
      if (nerveLocked && sub === 'big_stage_nerve') continue

      const before = player.current[sub]
      const ceiling = player.peak[sub]

      // Gains scale by how much room is left in THIS sub-stat, not in the
      // player's overall rating. A maxed-out aim does not stop them learning
      // to rotate.
      const headroom = clamp((ceiling - before) / 20, 0, 1)
      const headroomFactor = Math.pow(headroom, m.headroomExponent)
      if (headroomFactor > 0.1) atCeiling = false

      const roll = 1 + rng.range(-m.randomness, m.randomness)
      const gain =
        m.baseGainPerWeek *
        (weight as number) *
        ageFactor *
        headroomFactor *
        burnoutFactor *
        commsFactor *
        roll

      const after = clamp(before + Math.max(0, gain), 18, ceiling)
      const applied = after - before
      if (applied > 0.001) {
        player.current[sub] = after
        gains[sub] = (gains[sub] ?? 0) + applied
      }
    }
  }

  // Burnout: hard programs add it, rest removes it, plus passive recovery.
  // Tilt Resistance is the sub-stat that stands in for how well a player copes
  // with a heavy grind week.
  const resist = 1 - (player.current.tilt_resistance / 99) * m.burnout.staminaResistance
  const raw = program.burnout >= 0 ? program.burnout * resist : program.burnout
  const beforeBurnout = player.burnout
  player.burnout = clamp(player.burnout + raw - m.burnout.recoveryPerWeek, 0, 100)
  const burnoutDelta = player.burnout - beforeBurnout

  let note = ''
  if (player.burnout > 70) note = `${player.tag} is burnt out and needs a rest week.`
  else if (atCeiling && program.id !== 'rest')
    note = `${player.tag} has hit their ceiling in everything this program touches.`

  return {
    playerId: player.id,
    tag: player.tag,
    gains,
    burnoutDelta,
    cost: program.costPerWeek,
    note,
  }
}

/** Total weekly training bill for a list of players. */
export function trainingCost(players: Player[]): number {
  return players.reduce((sum, p) => sum + getProgram(p.trainingProgram).costPerWeek, 0)
}

/** Synergy/chemistry that programs add to a trio each week. */
export function trioTrainingChemistry(players: Player[]): { synergyGain: number; games: number } {
  let synergyGain = 0
  let games = 0
  for (const p of players) {
    const program = getProgram(p.trainingProgram)
    synergyGain += program.synergyGain
    games += program.gamesTogether ?? 0
  }
  // Chemistry only builds when the trio trains together, so take the average.
  return { synergyGain, games: Math.round(games / Math.max(1, players.length)) }
}
