// ---------------------------------------------------------------------------
// Loads every JSON tuning file and hands the rest of the code typed access.
//
// >>> IF YOU WANT TO CHANGE HOW THE GAME PLAYS, EDIT THE FILES IN /src/data <<<
// Nothing in this file needs touching to rebalance the game.
// ---------------------------------------------------------------------------

import balanceJson from '../data/balance.json'
import archetypesJson from '../data/archetypes.json'
import regionsJson from '../data/regions.json'
import tournamentsJson from '../data/tournaments.json'
import namesJson from '../data/names.json'
import trainingJson from '../data/training.json'
import type { AttrKey, Attributes } from './types'

export const BAL = balanceJson as any
export const NAMES = namesJson as any
export const TRAIN = trainingJson as any
export const TOURN = tournamentsJson as any

// --- Archetypes ------------------------------------------------------------

export interface Archetype {
  id: string
  name: string
  short: string
  color: string
  blurb: string
  bias: Partial<Attributes>
  strengthPool: AttrKey[]
  weaknessPool: AttrKey[]
}

export const ARCHETYPES: Archetype[] = (archetypesJson as any).archetypes
export const ARCHETYPE_BY_ID: Record<string, Archetype> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
)
export function getArchetype(id: string): Archetype {
  return ARCHETYPE_BY_ID[id] ?? ARCHETYPES[ARCHETYPES.length - 1]
}

export const ATTR_ORDER: AttrKey[] = (archetypesJson as any).attributes.order
export const ATTR_LABELS: Record<AttrKey, { name: string; short: string; desc: string }> = (
  archetypesJson as any
).attributes.labels

// --- Regions ---------------------------------------------------------------

export interface Region {
  id: string
  name: string
  lobbyModifier: number
  reputationMultiplier: number
  talentModifier: number
  prizeMultiplier: number
  playerShare: number
  blurb: string
}

export const REGIONS: Region[] = (regionsJson as any).regions
export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
)
export function getRegion(id: string): Region {
  return REGION_BY_ID[id] ?? REGIONS[0]
}

// --- Tournaments -----------------------------------------------------------

export interface ScoringTable {
  name: string
  elimPoints: number
  placement: { from: number; to: number; points: number }[]
}

export function getScoring(id: string): ScoringTable {
  return (TOURN.scoringTables[id] ?? TOURN.scoringTables.standard) as ScoringTable
}

export function getPrizeDistribution(id: string): { from: number; to: number; share: number }[] {
  return TOURN.prizeDistributions[id] ?? TOURN.prizeDistributions.cashCup
}

/** Points for a single match result, using the named scoring table. */
export function pointsFor(scoringId: string, placement: number, elims: number): number {
  const table = getScoring(scoringId)
  let placementPoints = 0
  for (const band of table.placement) {
    if (placement >= band.from && placement <= band.to) {
      placementPoints = band.points
      break
    }
  }
  return placementPoints + elims * table.elimPoints
}

export function tierReputationMultiplier(tier: number): number {
  return TOURN.tierReputationMultiplier[String(tier)] ?? 1
}

// --- Training --------------------------------------------------------------

export interface TrainingProgram {
  id: string
  name: string
  desc: string
  targets: Partial<Record<AttrKey, number>>
  burnout: number
  costPerWeek: number
  synergyGain: number
  gamesTogether?: number
}

export const TRAINING_PROGRAMS: TrainingProgram[] = TRAIN.programs
export const TRAINING_BY_ID: Record<string, TrainingProgram> = Object.fromEntries(
  TRAINING_PROGRAMS.map((p) => [p.id, p]),
)
export function getProgram(id: string): TrainingProgram {
  return TRAINING_BY_ID[id] ?? TRAINING_BY_ID.rest
}
