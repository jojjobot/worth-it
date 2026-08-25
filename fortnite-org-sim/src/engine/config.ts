// ---------------------------------------------------------------------------
// Loads every JSON tuning file and hands the rest of the code typed access.
//
// >>> IF YOU WANT TO CHANGE HOW THE GAME PLAYS, EDIT THE FILES IN /src/data <<<
// Nothing in this file needs touching to rebalance the game.
// ---------------------------------------------------------------------------

import attributesJson from '../data/attributes.json'
import balanceJson from '../data/balance.json'
import archetypesJson from '../data/archetypes.json'
import regionsJson from '../data/regions.json'
import tournamentsJson from '../data/tournaments.json'
import namesJson from '../data/names.json'
import trainingJson from '../data/training.json'
import {
  CATEGORY_KEYS,
  SUB_KEYS,
  type AttrKey,
  type Attributes,
  type CategoryKey,
  type Ratings,
  type SubKey,
} from './types'

export const BAL = balanceJson as any
export const NAMES = namesJson as any
export const TRAIN = trainingJson as any
export const TOURN = tournamentsJson as any
export const ATTRS = attributesJson as any

// --- The attribute tree ----------------------------------------------------

export interface SubStatDef {
  id: SubKey
  name: string
  short: string
  weight: number
  desc: string
}

export interface CategoryDef {
  id: CategoryKey
  name: string
  short: string
  color: string
  blurb: string
  subs: SubStatDef[]
}

export const CATEGORIES: CategoryDef[] = ATTRS.categories
export const CATEGORY_BY_ID: Record<CategoryKey, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryKey, CategoryDef>

export const SUB_BY_ID: Record<SubKey, SubStatDef> = Object.fromEntries(
  CATEGORIES.flatMap((c) => c.subs.map((s) => [s.id, s])),
) as Record<SubKey, SubStatDef>

/** attributes.json -> categoryWeights, minus the __doc key. */
export const CATEGORY_WEIGHTS: Record<CategoryKey, number> = Object.fromEntries(
  Object.entries(ATTRS.categoryWeights as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('__') && typeof v === 'number')
    .map(([k, v]) => [k, v as number]),
) as Record<CategoryKey, number>

/**
 * One category score: the weighted average of its sub-stats.
 * DISPLAY ONLY. The match engine must never read this - it reads sub-stats.
 */
export function categoryScore(ratings: Ratings, category: CategoryKey): number {
  const def = CATEGORY_BY_ID[category]
  if (!def) return 50
  let sum = 0
  let total = 0
  for (const sub of def.subs) {
    sum += (ratings[sub.id] ?? 50) * sub.weight
    total += sub.weight
  }
  return total > 0 ? sum / total : 50
}

/** All seven category scores at once. DISPLAY ONLY. */
export function categoryScores(ratings: Ratings): Record<CategoryKey, number> {
  return Object.fromEntries(
    CATEGORY_KEYS.map((c) => [c, categoryScore(ratings, c)]),
  ) as Record<CategoryKey, number>
}

/**
 * The single OVR number on a player card. A weighted average of the seven
 * category scores, then nudged by displayCalibration so the numbers line up
 * with the hand-authored overalls in real_players.json. Cosmetic only.
 */
export function overallOf(ratings: Ratings): number {
  let sum = 0
  let total = 0
  for (const c of CATEGORY_KEYS) {
    const w = CATEGORY_WEIGHTS[c] ?? 1
    sum += categoryScore(ratings, c) * w
    total += w
  }
  const raw = total > 0 ? sum / total : 50
  const cal = ATTRS.displayCalibration ?? { scale: 1, offset: 0 }
  return raw * (cal.scale ?? 1) + (cal.offset ?? 0)
}

// --- Legacy bridge ---------------------------------------------------------
// TEMPORARY: see attributes.json -> legacyBridge. The match engine is off it -
// only the training programs in training.json still speak the old vocabulary.

export const LEGACY_BRIDGE: Record<AttrKey, SubKey[]> = Object.fromEntries(
  Object.entries(ATTRS.legacyBridge as Record<string, unknown>).filter(
    ([k, v]) => !k.startsWith('__') && Array.isArray(v),
  ),
) as Record<AttrKey, SubKey[]>

/** Collapse the 29 sub-stats down to the 11 old attribute names. */
export function legacyAttrs(ratings: Ratings): Attributes {
  const out = {} as Attributes
  for (const [key, subs] of Object.entries(LEGACY_BRIDGE) as [AttrKey, SubKey[]][]) {
    let sum = 0
    for (const s of subs) sum += ratings[s] ?? 50
    out[key] = subs.length > 0 ? sum / subs.length : 50
  }
  return out
}

// --- Archetypes ------------------------------------------------------------

export interface Archetype {
  id: string
  name: string
  short: string
  color: string
  blurb: string
  bias: Partial<Ratings>
  strengthPool: SubKey[]
  weaknessPool: SubKey[]
}

export const ARCHETYPES: Archetype[] = (archetypesJson as any).archetypes
export const ARCHETYPE_BY_ID: Record<string, Archetype> = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
)

const ARCHETYPE_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries((archetypesJson as any).labelAliases as Record<string, string>).filter(
    ([k]) => !k.startsWith('__'),
  ),
)

/** Accepts either an archetype id or a free-text label from real_players.json. */
export function resolveArchetypeId(idOrLabel: string): string {
  if (ARCHETYPE_BY_ID[idOrLabel]) return idOrLabel
  return ARCHETYPE_ALIASES[idOrLabel] ?? 'flex'
}

export function getArchetype(idOrLabel: string): Archetype {
  return ARCHETYPE_BY_ID[resolveArchetypeId(idOrLabel)] ?? ARCHETYPES[ARCHETYPES.length - 1]
}

/** Display order for the sub-stats, straight off the tree. */
export const SUB_ORDER: SubKey[] = SUB_KEYS

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
