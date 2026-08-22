// ---------------------------------------------------------------------------
// Player generation, ratings maths, scouting fog and weekly progression.
//
// EVERY PLAYER CARRIES TWO FULL SETS OF THE 29 SUB-STATS:
//   current - what they are right now. Shown on the roster; the sim reads this.
//   peak    - their ceiling. HIDDEN. Only estimable through scouting, and never
//             shown as a number for a player you have not signed.
//
// THE CORE GENERATION RULE (balance.json -> playerGeneration):
//   every player gets 2-3 spiked sub-stats and 2-3 tanked ones, drawn from
//   pools defined by their archetype. Nobody is good at everything, and a
//   cracked mechanical kid with no game sense genuinely plays differently from
//   a smart passive zone player with mid aim.
//
// BIG STAGE NERVE is the exception to all of it: it is not spiked, not tanked
// and cannot be trained. It starts low for young players and is EARNED by
// turning up to LANs. See attributes.json -> bigStageNerve.
// ---------------------------------------------------------------------------

import {
  ARCHETYPES,
  ATTRS,
  BAL,
  NAMES,
  REGIONS,
  categoryScore,
  categoryScores,
  getArchetype,
  getRegion,
  overallOf,
} from './config'
import { Rng, clamp, interpolateMuSigma, interpolateTable } from './rng'
import {
  CATEGORY_KEYS,
  CATEGORY_OF,
  SUB_KEYS,
  type CategoryKey,
  type Player,
  type Ratings,
  type SubKey,
} from './types'

let idCounter = 0
export function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
}

// --- Ratings maths ---------------------------------------------------------

/** The single OVR number. Cosmetic - the sim always reads sub-stats. */
export function overall(ratings: Ratings): number {
  return overallOf(ratings)
}

export function playerOverall(player: Player): number {
  return overallOf(player.current)
}

/** Their ceiling as a single number. Hidden from the UI by the usual rules. */
export function peakOverall(player: Player): number {
  return overallOf(player.peak)
}

export { categoryScore, categoryScores }

/** A blank ratings set, every sub-stat at the same value. */
export function flatRatings(value: number): Ratings {
  return Object.fromEntries(SUB_KEYS.map((k) => [k, value])) as Ratings
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

// --- Big Stage Nerve -------------------------------------------------------

/**
 * Where a freshly generated player's nerve starts, before a single LAN.
 * Age-driven and deliberately harsh on kids: the 17-year-old world #1 losing
 * the Grand Final is the intended behaviour, not a bug.
 */
export function startingBigStageNerve(rng: Rng, age: number, archetypeBias: number): number {
  const b = ATTRS.bigStageNerve
  const base = interpolateTable(b.startByAge, age)
  return clamp(Math.round(base + archetypeBias + rng.gauss(0, b.startSigma)), 20, 95)
}

/**
 * Points of Big Stage Nerve earned from one LAN / Grand Final appearance.
 * `resultBand` is 'good' (top third of the field), 'mid', or 'bad'.
 * Each LAN teaches less than the one before it (gainDecayPerLan), so the first
 * time on stage is worth several later ones.
 */
export function bigStageNerveGain(
  lansAlreadyPlayed: number,
  resultBand: 'good' | 'mid' | 'bad',
): number {
  const b = ATTRS.bigStageNerve
  const decayed = b.gainPerLan * Math.pow(b.gainDecayPerLan, lansAlreadyPlayed)
  const mult =
    resultBand === 'good'
      ? b.goodResultMultiplier
      : resultBand === 'bad'
        ? b.badResultMultiplier
        : 1
  return decayed * mult
}

/** Apply one LAN appearance to a player. Returns a news line if it moved much. */
export function recordLanAppearance(
  player: Player,
  resultBand: 'good' | 'mid' | 'bad',
): string | null {
  const before = player.current.big_stage_nerve
  const gain = bigStageNerveGain(player.lanAppearances, resultBand)
  player.lanAppearances += 1
  player.current.big_stage_nerve = clamp(before + gain, 1, player.peak.big_stage_nerve)
  const moved = player.current.big_stage_nerve - before
  if (moved < 0.8) return null
  return `${player.tag} looked more at home on stage (Big Stage Nerve +${moved.toFixed(1)}, LAN #${player.lanAppearances}).`
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

  // 1) Base + archetype bias + noise on every sub-stat.
  const current = {} as Ratings
  for (const key of SUB_KEYS) {
    const bias = ((arch.bias as any)[key] ?? 0) * gen.archetypeBiasStrength
    current[key] = base + bias + rng.gauss(0, gen.noiseSigma)
  }

  // 2) Spike 2-3 strengths and tank 2-3 weaknesses, drawn from the archetype
  //    pools. Big Stage Nerve is excluded - it is set by its own model below.
  const spikeable = (k: SubKey) => k !== 'big_stage_nerve'
  const strengthCount = rng.int(gen.strengthCount.min, gen.strengthCount.max)
  const weaknessCount = rng.int(gen.weaknessCount.min, gen.weaknessCount.max)

  const used = new Set<SubKey>(['big_stage_nerve'])
  for (let i = 0; i < strengthCount; i++) {
    const key = pickFromPool(rng, arch.strengthPool.filter(spikeable), used)
    if (!key) break
    used.add(key)
    current[key] += rng.range(gen.strengthBonus.min, gen.strengthBonus.max)
  }
  for (let i = 0; i < weaknessCount; i++) {
    const key = pickFromPool(rng, arch.weaknessPool.filter(spikeable), used)
    if (!key) break
    used.add(key)
    current[key] -= rng.range(gen.weaknessPenalty.min, gen.weaknessPenalty.max)
  }

  for (const key of SUB_KEYS) {
    current[key] = clamp(Math.round(current[key]), gen.attrFloor, gen.attrCeiling)
  }

  // 3) Big Stage Nerve overrides whatever the noise produced. It is earned.
  const nerveBias = ((arch.bias as any).big_stage_nerve ?? 0) * gen.archetypeBiasStrength
  current.big_stage_nerve = startingBigStageNerve(rng, age, nerveBias)

  // 4) PEAK: current + an age-driven gap, scaled per category. Hands finish
  //    early, heads keep growing - that is why veterans stay relevant.
  const peak = buildPeak(rng, current, age)

  // 5) Hidden traits. Generated players get an ego; real players never do.
  const ovr = overallOf(current)
  const ego = clamp(
    Math.round(gen.ego.mu + rng.gauss(0, gen.ego.sigma) + Math.max(0, ovr - 70) * gen.egoStarBonus),
    gen.ego.min,
    gen.ego.max,
  )

  // 6) Money.
  const salary = computeSalary(rng, ovr, overallOf(peak))
  const signed = opts.freeAgent ? false : rng.chance(NAMES.playerOrgAffiliation.signedChance)
  const buyout = signed
    ? Math.round(
        salary * rng.range(gen.contract.buyoutMultiplier.min, gen.contract.buyoutMultiplier.max),
      )
    : 0

  // Older players have been to more LANs. Rough, but it keeps the nerve model
  // self-consistent for players who exist before the save file does.
  const lanAppearances = Math.max(0, Math.round((age - 15) * rng.range(0.4, 1.6)))

  return {
    id: nextId('p'),
    tag: generateTag(rng, taken),
    age,
    region,
    archetype,
    current,
    peak,
    lanAppearances,
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
    lastResultWasBad: false,
    careerEarnings: 0,
    careerTitles: 0,
    joinedWeek: null,
  }
}

/**
 * Build a peak set from a current set. Exported because real_players.json
 * supplies its own peak values and only needs this as a fallback.
 */
export function buildPeak(rng: Rng, current: Ratings, age: number): Ratings {
  const pk = ATTRS.peakModel
  const gap = interpolateMuSigma(pk.gapByAge, age)
  const peak = {} as Ratings
  for (const key of SUB_KEYS) {
    const scale = pk.categoryGapScale[CATEGORY_OF[key]] ?? 1
    const raw = Math.max(0, rng.gauss(gap.mu, gap.sigma)) * scale
    peak[key] = clamp(Math.round(current[key] + raw), current[key], pk.ceiling)
  }
  // Big Stage Nerve ignores the normal peak gap and uses its own age-scaled
  // bonus. This is where most of a young player's hidden upside lives: a
  // 17-year-old starting on 72 tops out around 94, a 22-year-old barely moves.
  const b = ATTRS.bigStageNerve
  const nerveBonus = interpolateTable(b.peakBonusByAge, age)
  peak.big_stage_nerve = clamp(
    Math.round(current.big_stage_nerve + Math.max(2, rng.gauss(nerveBonus, b.peakBonusSigma))),
    current.big_stage_nerve,
    pk.ceiling,
  )
  return peak
}

function pickFromPool(rng: Rng, pool: SubKey[], used: Set<SubKey>): SubKey | null {
  const available = pool.filter((k) => !used.has(k))
  if (available.length > 0) return rng.pick(available)
  // Pool exhausted - fall back to any unused sub-stat so we still hit the quota.
  const rest = SUB_KEYS.filter((k) => !used.has(k))
  return rest.length > 0 ? rng.pick(rest) : null
}

export function pickRegion(rng: Rng): string {
  return rng.weighted(
    REGIONS.map((r) => r.id),
    REGIONS.map((r) => r.playerShare),
  )
}

export function computeSalary(rng: Rng, ovr: number, peak: number): number {
  const s = BAL.playerGeneration.salary
  const raw = s.base * Math.exp(s.growth * (ovr - s.pivot)) + s.potentialBonus * Math.max(0, peak - ovr)
  const noisy = raw * (1 + rng.range(-s.randomness, s.randomness))
  return Math.max(50, Math.round(noisy / 10) * 10)
}

// --- Scouting fog ----------------------------------------------------------

/** The +/- band shown on every sub-stat at the player's current scout level. */
export function uncertaintyFor(scoutLevel: number): number {
  const table: number[] = BAL.scouting.uncertaintyByLevel
  return table[clamp(scoutLevel, 0, table.length - 1)]
}

export interface AttrView {
  known: boolean
  value: number // exact value when known, else the true value behind the range
  low: number
  high: number
}

/**
 * What the user is allowed to SEE for one sub-stat. Unscouted players show a
 * range; the range narrows with each scout report until it collapses to the
 * true number at max scout level.
 *
 * The displayed range is deliberately centred near the true value (no lying to
 * the player) but it is wide enough early on that signing blind is a gamble.
 */
export function viewSub(player: Player, key: SubKey, owned: boolean): AttrView {
  return viewValue(player, key, player.current[key], owned)
}

/** Same fog, applied to a rolled-up category score. */
export function viewCategory(player: Player, category: CategoryKey, owned: boolean): AttrView {
  const value = categoryScore(player.current, category)
  if (owned || player.scoutLevel >= BAL.scouting.maxLevel) {
    return { known: true, value, low: value, high: value }
  }
  // A category is an average of 3-6 sub-stats, so it is inherently better known
  // than any single one of them - errors cancel out. Hence the 0.6 narrowing.
  const band = Math.max(2, Math.round(uncertaintyFor(player.scoutLevel) * 0.6))
  const [low, high] = slideWindow(value, band)
  return { known: false, value, low, high }
}

function viewValue(player: Player, key: string, value: number, owned: boolean): AttrView {
  if (owned || player.scoutLevel >= BAL.scouting.maxLevel) {
    return { known: true, value, low: value, high: value }
  }
  const band = uncertaintyFor(player.scoutLevel)
  // Deterministic offset per player+stat so the band does not jitter on every
  // re-render, and so it is not always perfectly centred on the truth.
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
  const v = overallOf(player.current)
  if (owned || player.scoutLevel >= BAL.scouting.maxLevel) {
    return { known: true, value: v, low: v, high: v }
  }
  const band = Math.max(2, Math.round(uncertaintyFor(player.scoutLevel) * 0.55))
  const [low, high] = slideWindow(v, band)
  return { known: false, value: v, low, high }
}

/**
 * PEAK IS NEVER A NUMBER FOR AN UNSIGNED PLAYER. Below the scout threshold you
 * get nothing at all; above it you get a word, not a rating. Once they are on
 * your roster your coaching staff can put a rough band on it - and even then it
 * is a band, because a coach estimates a ceiling, they do not read it off a
 * screen.
 */
export function viewPeakOverall(player: Player, owned: boolean): string {
  const need = BAL.scouting.hiddenRevealLevel.potential
  if (!owned && player.scoutLevel < need) return '???'
  const peak = overallOf(player.peak)
  if (!owned) return describeCeiling(peak - overallOf(player.current))
  const [low, high] = slideWindow(peak, 5)
  return `${low}-${high}`
}

/** Peak for one sub-stat. Owned players only ever get a band; nobody gets exact. */
export function viewPeakSub(player: Player, key: SubKey, owned: boolean): AttrView | null {
  const need = BAL.scouting.hiddenRevealLevel.potential
  if (!owned && player.scoutLevel < need) return null
  const value = player.peak[key]
  const band = owned ? 3 : 8
  const [low, high] = slideWindow(value, band)
  return { known: false, value, low, high }
}

function describeCeiling(headroom: number): string {
  if (headroom >= 14) return 'Enormous room to grow'
  if (headroom >= 9) return 'Plenty left in the tank'
  if (headroom >= 5) return 'Some room to grow'
  if (headroom >= 2) return 'Close to finished'
  return 'This is who they are'
}

export function viewEgo(player: Player, owned: boolean): string {
  if (player.ego === null || player.ego === undefined) return '--'
  const need = BAL.scouting.hiddenRevealLevel.ego
  if (!owned && player.scoutLevel < need) return '???'
  const e = player.ego
  if (e < 30) return 'Humble'
  if (e < 50) return 'Grounded'
  if (e < 68) return 'Confident'
  if (e < 84) return 'Big Ego'
  return 'Diva'
}

/** The clearest strengths and weaknesses, for the player card. */
export function profileHighlights(player: Player): {
  strengths: SubKey[]
  weaknesses: SubKey[]
} {
  const values = SUB_KEYS.map((k) => player.current[k])
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const sorted = [...SUB_KEYS].sort((a, b) => player.current[b] - player.current[a])
  const strengths = sorted.filter((k) => player.current[k] >= avg + 8).slice(0, 3)
  const weaknesses = sorted
    .slice()
    .reverse()
    .filter((k) => player.current[k] <= avg - 8)
    .slice(0, 3)
  return { strengths, weaknesses }
}

/** Best and worst CATEGORY, for one-line summaries. */
export function categoryHighlights(player: Player): { best: CategoryKey; worst: CategoryKey } {
  const scores = categoryScores(player.current)
  const sorted = [...CATEGORY_KEYS].sort((a, b) => scores[b] - scores[a])
  return { best: sorted[0], worst: sorted[sorted.length - 1] }
}

// --- Weekly progression ----------------------------------------------------

/**
 * Passive growth/decline applied every week, independently of training.
 *
 *  - Under the decline age, players DRIFT TOWARD PEAK. The further they are
 *    from their ceiling the faster they close the gap.
 *  - Past the decline age (balance.json -> progression.declineStartAge) the
 *    categories fall at different rates. attributes.json -> decline lets a
 *    category have a NEGATIVE decline scale, meaning it keeps growing - which
 *    is how a veteran loses their hands but keeps improving their reads.
 *  - Big Stage Nerve is never touched here. It only moves at LANs.
 */
export function progressPlayer(player: Player, rng: Rng): string[] {
  const prog = BAL.progression
  const declineScale = ATTRS.decline.categoryDeclineScale as Record<CategoryKey, number>
  const notes: string[] = []

  // Age. 52 weeks per year.
  if (rng.chance(1 / prog.weeksPerYear)) {
    player.age += 1
    if (player.age === prog.declineStartAge) {
      notes.push(`${player.tag} turned ${player.age}. The reactions start going.`)
    }
  }

  const declining = player.age > prog.declineStartAge
  const yearsOver = Math.max(0, player.age - prog.declineStartAge)

  for (const key of SUB_KEYS) {
    if (key === 'big_stage_nerve') continue // earned at LANs, never drifts
    const cat = CATEGORY_OF[key]
    const ceiling = player.peak[key]

    if (declining) {
      const scale = declineScale[cat] ?? 1
      const move = prog.declinePerWeek * yearsOver * scale
      // A negative scale means this category is still improving. It still may
      // not cross the player's own ceiling.
      player.current[key] = clamp(player.current[key] - move, 18, Math.max(ceiling, 18))
    }

    // Drift toward peak from simply playing and practising.
    const headroom = ceiling - player.current[key]
    if (headroom > 0.01) {
      const gain = prog.matchExperienceGain * headroom * rng.range(0.4, 1.6)
      player.current[key] = clamp(player.current[key] + gain, 18, ceiling)
    }
  }

  return notes
}
