// ---------------------------------------------------------------------------
// Player generation, ratings maths, scouting fog and weekly progression.
//
// THE CORE GENERATION RULE (from balance.json -> playerGeneration):
//   every player gets 2-3 spiked attributes and 2-3 tanked attributes, drawn
//   from pools defined by their archetype. Nobody is good at everything, and a
//   cracked mechanical player with no game sense genuinely plays differently
//   from a smart passive zone player with mid aim.
// ---------------------------------------------------------------------------

import {
  ARCHETYPES,
  ATTR_ORDER,
  BAL,
  NAMES,
  REGIONS,
  getArchetype,
  getRegion,
} from './config'
import { Rng, clamp, interpolateMuSigma } from './rng'
import { ATTR_KEYS, type AttrKey, type Attributes, type Player } from './types'

let idCounter = 0
export function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
}

// --- Overall rating --------------------------------------------------------

export function overall(attrs: Attributes): number {
  const w = BAL.overallWeights as Record<string, number>
  let sum = 0
  let total = 0
  for (const key of ATTR_KEYS) {
    const weight = w[key] ?? 1
    sum += attrs[key] * weight
    total += weight
  }
  return Math.round(sum / total)
}

// --- Gamertags -------------------------------------------------------------

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function generateTag(rng: Rng, taken: Set<string>): string {
  for (let attempt = 0; attempt < 60; attempt++) {
    const patterns = NAMES.gamertagPatterns.patterns as { template: string; weight: number }[]
    const template = rng.weighted(
      patterns.map((p) => p.template),
      patterns.map((p) => p.weight),
    )
    const tag = template
      .replace('{prefix}', rng.pick(NAMES.prefixes))
      .replace('{Core}', capitalise(rng.pick(NAMES.cores)))
      .replace('{suffix}', rng.pick(NAMES.suffixes))
      .replace('{Adj}', rng.pick(NAMES.adjectives))
      .replace('{number}', rng.pick(NAMES.numbers))
    if (!taken.has(tag.toLowerCase())) {
      taken.add(tag.toLowerCase())
      return tag
    }
  }
  const fallback = `Player${rng.int(1000, 9999)}`
  taken.add(fallback.toLowerCase())
  return fallback
}

export function generateOrgName(rng: Rng): string {
  const o = NAMES.orgNames
  const prefix = rng.pick(o.prefixes)
  const core = rng.pick(o.cores)
  const suffix = rng.pick(o.suffixes)
  return [prefix, core, suffix].filter(Boolean).join(' ')
}

// --- Generation ------------------------------------------------------------

export interface GenerateOptions {
  /** Average quality of this player, before archetype and spikes. ~35 = amateur, ~80 = superstar. */
  baseRating?: number
  region?: string
  archetype?: string
  age?: number
  /** Force free agent (no buyout) regardless of the signedChance roll. */
  freeAgent?: boolean
  week?: number
}

export function generatePlayer(rng: Rng, taken: Set<string>, opts: GenerateOptions = {}): Player {
  const gen = BAL.playerGeneration

  const region = opts.region ?? pickRegion(rng)
  const regionData = getRegion(region)
  const archetype = opts.archetype ?? rng.pick(ARCHETYPES).id
  const arch = getArchetype(archetype)
  const age = opts.age ?? rng.int(gen.ageRange.min, gen.ageRange.max)

  const base = (opts.baseRating ?? 50) + regionData.talentModifier

  // 1) Base + archetype bias + noise on every attribute.
  const attrs = {} as Attributes
  for (const key of ATTR_KEYS) {
    const bias = ((arch.bias as any)[key] ?? 0) * gen.archetypeBiasStrength
    attrs[key] = base + bias + rng.gauss(0, gen.noiseSigma)
  }

  // 2) Spike 2-3 strengths, drawn mostly from the archetype strength pool.
  const strengthCount = rng.int(gen.strengthCount.min, gen.strengthCount.max)
  const weaknessCount = rng.int(gen.weaknessCount.min, gen.weaknessCount.max)

  const used = new Set<AttrKey>()
  const strengths: AttrKey[] = []
  for (let i = 0; i < strengthCount; i++) {
    const key = pickFromPool(rng, arch.strengthPool, used)
    if (!key) break
    used.add(key)
    strengths.push(key)
    attrs[key] += rng.range(gen.strengthBonus.min, gen.strengthBonus.max)
  }

  // 3) Tank 2-3 weaknesses from the weakness pool, never overlapping a strength.
  const weaknesses: AttrKey[] = []
  for (let i = 0; i < weaknessCount; i++) {
    const key = pickFromPool(rng, arch.weaknessPool, used)
    if (!key) break
    used.add(key)
    weaknesses.push(key)
    attrs[key] -= rng.range(gen.weaknessPenalty.min, gen.weaknessPenalty.max)
  }

  for (const key of ATTR_KEYS) {
    attrs[key] = clamp(Math.round(attrs[key]), gen.attrFloor, gen.attrCeiling)
  }

  // 4) Hidden traits.
  const ovr = overall(attrs)
  const gap = interpolateMuSigma(gen.potentialGapByAge, age)
  const potential = clamp(
    Math.round(ovr + Math.max(0, rng.gauss(gap.mu, gap.sigma))),
    ovr,
    gen.potentialCeiling,
  )
  const ego = clamp(
    Math.round(
      rng.gauss(gen.ego.mu, gen.ego.sigma) + Math.max(0, ovr - 70) * gen.egoStarBonus,
    ),
    gen.ego.min,
    gen.ego.max,
  )

  // 5) Money.
  const salary = computeSalary(rng, ovr, potential)
  const signed = opts.freeAgent ? false : rng.chance(NAMES.playerOrgAffiliation.signedChance)
  const buyout = signed
    ? Math.round(
        salary * rng.range(gen.contract.buyoutMultiplier.min, gen.contract.buyoutMultiplier.max),
      )
    : 0

  return {
    id: nextId('p'),
    tag: generateTag(rng, taken),
    age,
    region,
    archetype,
    attrs,
    potential,
    ego,
    salary,
    contractWeeks: signed
      ? rng.int(gen.contract.lengthWeeks.min, gen.contract.lengthWeeks.max)
      : 0,
    buyout,
    orgName: signed ? generateOrgName(rng) : null,
    scoutLevel: 0,
    matchesPlayed: rng.int(0, 400),
    burnout: 0,
    trainingProgram: 'rest',
    careerEarnings: 0,
    careerTitles: 0,
    joinedWeek: null,
  }
}

function pickFromPool(rng: Rng, pool: AttrKey[], used: Set<AttrKey>): AttrKey | null {
  const available = pool.filter((k) => !used.has(k))
  if (available.length > 0) return rng.pick(available)
  // Pool exhausted - fall back to any unused attribute so we still hit the quota.
  const rest = ATTR_KEYS.filter((k) => !used.has(k))
  return rest.length > 0 ? rng.pick(rest) : null
}

export function pickRegion(rng: Rng): string {
  return rng.weighted(
    REGIONS.map((r) => r.id),
    REGIONS.map((r) => r.playerShare),
  )
}

export function computeSalary(rng: Rng, ovr: number, potential: number): number {
  const s = BAL.playerGeneration.salary
  const raw =
    s.base * Math.exp(s.growth * (ovr - s.pivot)) + s.potentialBonus * Math.max(0, potential - ovr)
  const noisy = raw * (1 + rng.range(-s.randomness, s.randomness))
  return Math.max(50, Math.round(noisy / 10) * 10)
}

// --- Scouting fog ----------------------------------------------------------

/** The +/- band shown on every attribute at the player's current scout level. */
export function uncertaintyFor(scoutLevel: number): number {
  const table: number[] = BAL.scouting.uncertaintyByLevel
  return table[clamp(scoutLevel, 0, table.length - 1)]
}

export interface AttrView {
  known: boolean
  value: number // exact value when known, else the centre of the range
  low: number
  high: number
}

/**
 * What the user is allowed to SEE for one attribute. Unscouted players show a
 * range; the range narrows with each scout report until it collapses to the
 * true number at max scout level.
 *
 * The displayed range is deliberately centred on the true value (no lying to
 * the player) but it is wide enough early on that signing blind is a gamble.
 */
export function viewAttr(player: Player, key: AttrKey, owned: boolean): AttrView {
  const value = player.attrs[key]
  if (owned || player.scoutLevel >= BAL.scouting.maxLevel) {
    return { known: true, value, low: value, high: value }
  }
  const band = uncertaintyFor(player.scoutLevel)
  // Deterministic offset per player+attribute so the band does not jitter on
  // every re-render, and so it is not always perfectly centred on the truth.
  const skew = deterministicSkew(player.id, key)
  const [low, high] = slideWindow(value + skew * band * 0.35, band)
  return { known: false, value, low, high }
}

/**
 * A range of fixed width around `centre`, slid (not squashed) to stay inside
 * 1-99. Clamping instead of sliding would make every high rating read "78-99",
 * which tells the user nothing.
 */
function slideWindow(centre: number, band: number): [number, number] {
  const width = band * 2
  let low = centre - band
  let high = centre + band
  if (high > 99) {
    low -= high - 99
    high = 99
  }
  if (low < 1) {
    high = Math.min(99, high + (1 - low))
    low = 1
  }
  return [Math.round(Math.max(1, low)), Math.round(Math.min(99, Math.max(low + width * 0.5, high)))]
}

function deterministicSkew(id: string, key: string): number {
  let h = 2166136261 >>> 0
  const text = id + key
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967296) * 2 - 1 // -1..1
}

export function viewOverall(player: Player, owned: boolean): AttrView {
  if (owned || player.scoutLevel >= BAL.scouting.maxLevel) {
    const v = overall(player.attrs)
    return { known: true, value: v, low: v, high: v }
  }
  const v = overall(player.attrs)
  const band = Math.round(uncertaintyFor(player.scoutLevel) * 0.55)
  const [low, high] = slideWindow(v, band)
  return { known: false, value: v, low, high }
}

/**
 * Hidden traits stay hidden until the scout level threshold in balance.json.
 * Potential is NEVER shown exactly, not even for your own players - a coach
 * estimates a ceiling, they do not read it off a screen.
 */
export function viewPotential(player: Player, owned: boolean): string {
  const need = BAL.scouting.hiddenRevealLevel.potential
  if (!owned && player.scoutLevel < need) return '???'
  const band = owned ? 5 : 9
  const [low, high] = slideWindow(player.potential, band)
  return `${low}-${high}`
}

export function viewEgo(player: Player, owned: boolean): string {
  const need = BAL.scouting.hiddenRevealLevel.ego
  if (!owned && player.scoutLevel < need) return '???'
  const e = player.ego
  if (e < 30) return 'Humble'
  if (e < 50) return 'Grounded'
  if (e < 68) return 'Confident'
  if (e < 84) return 'Big Ego'
  return 'Diva'
}

/** Names of the 2-3 clearest strengths and weaknesses, for the player card. */
export function profileHighlights(player: Player): { strengths: AttrKey[]; weaknesses: AttrKey[] } {
  const avg =
    ATTR_KEYS.reduce((sum, k) => sum + player.attrs[k], 0) / ATTR_KEYS.length
  const sorted = [...ATTR_ORDER].sort((a, b) => player.attrs[b] - player.attrs[a])
  const strengths = sorted.filter((k) => player.attrs[k] >= avg + 8).slice(0, 3)
  const weaknesses = sorted
    .slice()
    .reverse()
    .filter((k) => player.attrs[k] <= avg - 8)
    .slice(0, 3)
  return { strengths, weaknesses }
}

// --- Weekly progression ----------------------------------------------------

/** Passive growth/decline applied every week, independently of training. */
export function progressPlayer(player: Player, rng: Rng): string[] {
  const prog = BAL.progression
  const notes: string[] = []
  const ovr = overall(player.attrs)

  // Age. 52 weeks per year.
  if (rng.chance(1 / prog.weeksPerYear)) {
    player.age += 1
    if (player.age === prog.declineStartAge) {
      notes.push(`${player.tag} turned ${player.age}. The reactions start going.`)
    }
  }

  // Decline past the decline age.
  if (player.age > prog.declineStartAge) {
    const yearsOver = player.age - prog.declineStartAge
    const loss = prog.declinePerWeek * yearsOver
    for (const key of ATTR_KEYS) {
      // Mechanical attributes go first; game sense and comms age well.
      const mechanical = key === 'aim' || key === 'buildSpeed' || key === 'editing'
      const scale = mechanical ? 1.4 : key === 'gameSense' || key === 'comms' ? 0.15 : 0.7
      player.attrs[key] = clamp(player.attrs[key] - loss * scale, 18, 99)
    }
  }

  // A little passive growth from simply playing matches.
  const headroom = Math.max(0, player.potential - ovr)
  if (headroom > 0) {
    const gain = prog.matchExperienceGain * headroom * rng.range(0.5, 1.5)
    const key = rng.pick(ATTR_KEYS)
    player.attrs[key] = clamp(player.attrs[key] + gain, 18, 99)
  }

  return notes
}
