// ---------------------------------------------------------------------------
// Weekly training. Everything here is driven by /src/data/training.json.
//
// The two brakes on training are HIDDEN POTENTIAL (you cannot train a player
// past their ceiling, and gains slow down as they approach it) and AGE (a
// 14-year-old improves several times faster than a 23-year-old).
// Hard programs stack BURNOUT, which hurts match performance until they rest.
// ---------------------------------------------------------------------------

import { TRAIN, getProgram } from './config'
import { Rng, clamp, interpolateTable } from './rng'
import { overall } from './players'
import type { AttrKey, Player } from './types'

export interface TrainingOutcome {
  playerId: string
  tag: string
  gains: Partial<Record<AttrKey, number>>
  burnoutDelta: number
  cost: number
  note: string
}

/**
 * Apply one week of training to one player.
 * `coachComms` is the highest Comms rating in their trio - good communicators
 * lift the whole room, so the trio leader speeds everyone up a little.
 */
export function applyTraining(player: Player, coachComms: number, rng: Rng): TrainingOutcome {
  const m = TRAIN.model
  const program = getProgram(player.trainingProgram)
  const gains: Partial<Record<AttrKey, number>> = {}

  const ovr = overall(player.attrs)
  const ageFactor = interpolateTable(m.ageFactor, player.age)
  const headroom = clamp((player.potential - ovr) / 20, 0, 1)
  const headroomFactor = Math.pow(headroom, m.headroomExponent)
  const burnoutFactor = 1 - (player.burnout / 100) * m.burnout.trainingPenaltyAtMax
  const commsFactor = 1 + Math.max(0, coachComms - 60) * m.commsCoachBonus * 0.01 * 10

  for (const [key, weight] of Object.entries(program.targets)) {
    if (key.startsWith('__')) continue
    const attr = key as AttrKey
    const roll = 1 + rng.range(-m.randomness, m.randomness)
    let gain =
      m.baseGainPerWeek *
      (weight as number) *
      ageFactor *
      headroomFactor *
      burnoutFactor *
      commsFactor *
      roll
    // A single attribute may run a little past the overall potential - that is
    // how specialists happen - but not far past it.
    const attrCap = Math.min(99, player.potential + 6)
    const before = player.attrs[attr]
    const after = clamp(before + Math.max(0, gain), 18, attrCap)
    gain = after - before
    if (gain > 0.001) {
      player.attrs[attr] = after
      gains[attr] = (gains[attr] ?? 0) + gain
    }
  }

  // Burnout: hard programs add it, rest removes it, and there is passive recovery.
  const staminaResist = 1 - (player.attrs.stamina / 99) * m.burnout.staminaResistance
  const raw = program.burnout >= 0 ? program.burnout * staminaResist : program.burnout
  const before = player.burnout
  player.burnout = clamp(player.burnout + raw - m.burnout.recoveryPerWeek, 0, 100)
  const burnoutDelta = player.burnout - before

  let note = ''
  if (player.burnout > 70) note = `${player.tag} is burnt out and needs a rest week.`
  else if (headroomFactor < 0.1 && program.id !== 'rest')
    note = `${player.tag} has hit their ceiling - training is barely moving anything.`

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
  // Chemistry only builds when the trio trains together, so take the minimum.
  return { synergyGain, games: Math.round(games / Math.max(1, players.length)) }
}
