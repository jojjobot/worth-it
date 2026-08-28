// ---------------------------------------------------------------------------
// THE REAL REFERENCE ROSTER
//
// Turns /src/data/real_players.json into live Player objects and into the rival
// duos that the real orgs field against you.
//
// Two rules from that file are enforced here, in code, so they cannot drift:
//   1. Real players NEVER get an ego rating. `ego` stays null for all of them.
//   2. Their PEAK is derived, never invented per sub-stat. The file authors a
//      single `peak_overall` and derivePeak() spreads that ceiling across the
//      29 sub-stats using the same category gap model everyone else uses.
//
// The ratings themselves are estimates calibrated against public results - see
// the header of real_players.json.
// ---------------------------------------------------------------------------

import realJson from '../data/real_players.json'
import { ATTRS, BAL, overallOf, resolveArchetypeId } from './config'
import { Rng, clamp, interpolateTable } from './rng'
import { computeSalary, generatePlayer, nextId, peakBigStageNerve } from './players'
import {
  CATEGORY_OF,
  SUB_KEYS,
  SUBS_BY_CATEGORY,
  type CategoryKey,
  type Player,
  type Ratings,
  type RivalDuo,
  type SubKey,
} from './types'

export const REAL = realJson as any

/**
 * One duo an org puts on the server. A real org can field several - Twisted
 * Minds run boltz/Acorn and Cold/Rapid at the same time - so this is a list on
 * the org rather than a single roster pair.
 */
export interface RealDuoDef {
  id: string
  players: string[]
  /** Defaults to the org's region. Set it where a duo plays a different one. */
  region?: string
}

export interface RealOrgDef {
  id: string
  name: string
  region: string
  color: string
  duos: RealDuoDef[]
}

/**
 * A duo whose two players are at DIFFERENT orgs. Fortnite duos are not bound by
 * org - JannisZ (CGN Esports) and Cheatiin (AIGHT) ran FNCS 2026 Major 1
 * together - so a pairing like that cannot live inside either org's `duos`.
 * It gets its own entry, with its own name and colour for the board.
 */
export interface RealCrossDuoDef {
  id: string
  name: string
  region: string
  color: string
  players: string[]
}

export const REAL_ORGS: RealOrgDef[] = (REAL.orgs as any[]).filter((o) => !o.id.startsWith('__'))

export const REAL_CROSS_DUOS: RealCrossDuoDef[] = ((REAL.crossOrgDuos ?? []) as any[]).filter(
  (d) => !String(d.id).startsWith('__'),
)

/** Look up an org's - or a cross-org pairing's - brand colour by name, for the UI. */
export function realOrgColor(name: string): string | null {
  const org = REAL_ORGS.find((o) => o.name === name)
  if (org) return org.color
  const cross = REAL_CROSS_DUOS.find((d) => d.name === name)
  return cross ? cross.color : null
}

/** Every duo the real scene fields, org-internal and cross-org alike, flattened. */
export interface ResolvedDuoDef {
  /** Org id, or the cross-duo's own id when the pair spans two orgs. */
  orgId: string
  defId: string
  /** What the board calls them: an org name, or "CGN Esports / AIGHT". */
  orgName: string
  region: string
  players: string[]
}

export function realDuoDefs(): ResolvedDuoDef[] {
  const out: ResolvedDuoDef[] = []
  for (const org of REAL_ORGS) {
    for (const def of org.duos ?? []) {
      out.push({
        orgId: org.id,
        defId: def.id,
        orgName: org.name,
        region: def.region ?? org.region,
        players: def.players,
      })
    }
  }
  for (const cd of REAL_CROSS_DUOS) {
    out.push({
      orgId: cd.id,
      defId: cd.id,
      orgName: cd.name,
      region: cd.region,
      players: cd.players,
    })
  }
  return out
}

// --- Peak derivation -------------------------------------------------------

/**
 * How much one point on sub-stat `key` moves the overall rating. Overall is a
 * linear weighted average, so this is exact rather than an approximation.
 */
function ovrSensitivity(base: Ratings, key: SubKey): number {
  const bumped = { ...base, [key]: base[key] + 1 }
  return overallOf(bumped) - overallOf(base)
}

/**
 * Spread an authored `peak_overall` across all 29 sub-stats.
 *
 * Big Stage Nerve is handled first and separately, because it is the one stat
 * whose ceiling is set by age rather than by how good the player already is -
 * that is the whole point of the mechanic. A 17-year-old on 74 gets a huge
 * nerve ceiling even if their overall is nearly maxed.
 *
 * Whatever overall headroom is left after that is distributed across the other
 * 28 sub-stats in proportion to peakModel.categoryGapScale, so a young player's
 * ceiling lands mostly on game sense, mental and teamwork rather than on aim.
 */
export function derivePeak(current: Ratings, targetPeakOverall: number, age: number): Ratings {
  const pk = ATTRS.peakModel
  const gapScale = pk.categoryGapScale as Record<CategoryKey, number>
  const ceiling: number = pk.ceiling

  const peak: Ratings = { ...current }

  // 1) Big Stage Nerve, on its own age-anchored budget.
  peak.big_stage_nerve = peakBigStageNerve(age, current.big_stage_nerve)

  // 2) Whatever overall headroom the author asked for, minus what nerve used.
  let remaining = targetPeakOverall - overallOf(peak)
  if (remaining <= 0) return peak

  const others = SUB_KEYS.filter((k) => k !== 'big_stage_nerve')
  const sens: Record<string, number> = {}
  for (const k of others) sens[k] = ovrSensitivity(current, k)

  // Two passes: the first distributes, the second re-spends whatever was lost
  // to sub-stats that hit 99 and could not absorb their share.
  for (let pass = 0; pass < 4 && remaining > 0.001; pass++) {
    const open = others.filter((k) => peak[k] < ceiling)
    if (open.length === 0) break
    let denom = 0
    for (const k of open) denom += (gapScale[CATEGORY_OF[k]] ?? 1) * sens[k]
    if (denom <= 0) break
    const alpha = remaining / denom
    for (const k of open) {
      const want = alpha * (gapScale[CATEGORY_OF[k]] ?? 1)
      const next = clamp(peak[k] + want, peak[k], ceiling)
      remaining -= (next - peak[k]) * sens[k]
      peak[k] = next
    }
  }

  for (const k of SUB_KEYS) peak[k] = clamp(Math.round(peak[k]), current[k], ceiling)
  return peak
}

// --- Building the players --------------------------------------------------

export function ratingsFromEntry(entry: any): Ratings {
  const out = {} as Ratings
  for (const [cat, subs] of Object.entries(SUBS_BY_CATEGORY)) {
    const block = entry[cat] ?? {}
    for (const sub of subs as SubKey[]) {
      const v = block[sub]
      if (typeof v !== 'number') {
        throw new Error(`real_players.json: ${entry.gamertag} is missing ${cat}.${sub}`)
      }
      out[sub] = v
    }
  }
  return out
}

/**
 * How many LANs a real player has behind them. Estimated from age and from how
 * high their authored Big Stage Nerve already sits, so the nerve model stays
 * self-consistent for players who existed before the save file did.
 */
function estimateLans(entry: any, current: Ratings): number {
  const start = interpolateTable(ATTRS.bigStageNerve.startByAge, entry.age)
  const earned = Math.max(0, current.big_stage_nerve - start)
  return Math.max(0, Math.round(earned / Math.max(0.5, ATTRS.bigStageNerve.gainPerLan)))
}

export function buildRealPlayer(rng: Rng, taken: Set<string>, entry: any): Player {
  const s = REAL.settings
  const current = ratingsFromEntry(entry)
  const peak = derivePeak(current, entry.peak_overall, entry.age)

  const ovr = overallOf(current)
  const salary = Math.round(computeSalary(rng, ovr, overallOf(peak)) * s.salaryMultiplier)

  // A real player with no `org` in the file is a FREE AGENT: nobody to pay a
  // buyout to and no contract to run down. Both draws still happen so the rng
  // stream does not depend on who happens to be signed.
  const freeAgent = !entry.org
  const buyoutDraw = Math.round(
    salary * rng.range(s.buyoutMultiplier.min, s.buyoutMultiplier.max),
  )
  const contractDraw = rng.int(s.contractWeeks.min, s.contractWeeks.max)

  taken.add(String(entry.gamertag).toLowerCase())

  return {
    id: nextId('real'),
    tag: entry.gamertag,
    age: entry.age,
    region: entry.region,
    archetype: resolveArchetypeId(entry.archetype),
    current,
    peak,
    lanAppearances: estimateLans(entry, current),

    // RULE: real people do not get an invented personality-defect stat.
    ego: null,

    salary,
    contractWeeks: freeAgent ? 0 : contractDraw,
    buyout: freeAgent ? 0 : buyoutDraw,
    orgName: entry.org ?? null,

    scoutLevel: s.scoutLevelAtStart,
    matchesPlayed: Math.max(0, Math.round((entry.age - 13) * rng.range(180, 320))),
    burnout: 0,
    trainingProgram: 'full_scrims',
    lastResultWasBad: false,
    careerEarnings: 0,
    careerTitles: 0,
    joinedWeek: null,

    isReal: true,
    realName: entry.real_name,
    aliases: entry.aliases,
    pr: entry.pr,
    prRank: entry.pr_rank,
    duo: entry.duo,
    note: entry.note,
  }
}

/**
 * The generated stand-in that fills a rival org's empty seat - either because
 * their real partner is not in the reference set, or because you signed one of
 * them away.
 */
export function generateOrgFiller(
  rng: Rng,
  taken: Set<string>,
  org: { name: string; region: string },
): Player {
  const filler = generatePlayer(rng, taken, {
    region: org.region,
    baseRating: rng.gauss(84, 3),
    age: rng.int(17, 21),
  })
  filler.orgName = org.name
  filler.contractWeeks = rng.int(30, 70)
  filler.buyout = Math.round(filler.salary * rng.range(20, 34))
  filler.scoutLevel = REAL.settings.scoutLevelAtStart
  return filler
}

/**
 * Bring a real player who is ALREADY in a save back in line with
 * real_players.json. The roster is otherwise only read at createNewGame(), so
 * a save started before a research pass carries the old numbers forever.
 *
 * Spends no rng draw, so a buyout and a contract already ticking are left
 * exactly as they were.
 *
 * A player you have SIGNED keeps their live `current` ratings - they have been
 * training and the file is behind them. An unsigned player has never
 * progressed (only roster players do), so their ratings are just the stale file
 * values and are safe to replace outright.
 */
export function refreshRealPlayer(player: Player, entry: any): void {
  const signed = player.joinedWeek !== null

  if (!signed) {
    player.current = ratingsFromEntry(entry)
    player.age = entry.age
    player.lanAppearances = estimateLans(entry, player.current)
    player.orgName = entry.org ?? null
    // A player the file has since made a free agent loses the buyout with it.
    if (!entry.org) {
      player.buyout = 0
      player.contractWeeks = 0
    }
  }

  // Potential is re-derived off whatever `current` now is, so the ceiling can
  // never land underneath somebody who has already trained past the old one.
  player.peak = derivePeak(player.current, entry.peak_overall, player.age)
  player.region = entry.region
  player.archetype = resolveArchetypeId(entry.archetype)
  player.realName = entry.real_name
  player.aliases = entry.aliases
  player.pr = entry.pr
  player.prRank = entry.pr_rank
  player.duo = entry.duo
  player.note = entry.note
  player.ego = null // RULE: real people never get one, not even by migration.
}

export interface RealRosterResult {
  players: Player[]
  rivalDuos: RivalDuo[]
}

/**
 * Build all 17 real players plus the rival duos their orgs field. A player with
 * `org: null` is a free agent - no buyout, no contract, in no rival duo, so
 * they simply sit on the market.
 *
 * An org whose real-life partner is not in the reference set (XSET, ROC) gets a
 * GENERATED fictional partner rather than an invented version of a real person.
 * See the __duos notes in real_players.json.
 */
export function buildRealRoster(rng: Rng, taken: Set<string>): RealRosterResult {
  const players: Player[] = []
  const byTag = new Map<string, Player>()

  for (const entry of REAL.players as any[]) {
    const p = buildRealPlayer(rng, taken, entry)
    players.push(p)
    byTag.set(p.tag, p)
  }

  const rivalDuos: RivalDuo[] = []
  for (const def of realDuoDefs()) {
    const ids: string[] = []
    for (const tag of def.players) {
      const p = byTag.get(tag)
      if (p) ids.push(p.id)
    }
    // Fill any empty seat with a generated player of a believable standard.
    while (ids.length < 2) {
      const filler = generateOrgFiller(rng, taken, { name: def.orgName, region: def.region })
      players.push(filler)
      ids.push(filler.id)
    }
    rivalDuos.push({
      id: nextId('rival'),
      orgId: def.orgId,
      defId: def.defId,
      orgName: def.orgName,
      region: def.region,
      playerIds: [ids[0], ids[1]],
      gamesTogether: rng.int(90, 260),
      strategy: 'balanced',
    })
  }

  return { players, rivalDuos }
}

/**
 * Called when the user signs a player who was in a rival duo. The org does not
 * fold - it replaces them with somebody, same as a real org would.
 */
export function backfillRivalDuo(
  duo: RivalDuo,
  leavingPlayerId: string,
  rng: Rng,
  taken: Set<string>,
): Player {
  const org = REAL_ORGS.find((o) => o.id === duo.orgId)
  const replacement = generatePlayer(rng, taken, {
    region: duo.region,
    baseRating: rng.gauss(82, 4),
    age: rng.int(16, 22),
  })
  replacement.orgName = duo.orgName
  replacement.contractWeeks = rng.int(26, 62)
  replacement.buyout = Math.round(replacement.salary * rng.range(18, 30))
  replacement.scoutLevel = REAL.settings.scoutLevelAtStart
  duo.playerIds = duo.playerIds.map((id) =>
    id === leavingPlayerId ? replacement.id : id,
  ) as [string, string]
  // A brand new pairing has no chemistry at all - that is the cost to the org.
  duo.gamesTogether = 0
  void org
  return replacement
}

/** Reputation you need before a top-17 player will even take the call. */
export function realSignReputationGate(): number {
  return REAL.settings.minReputationToSign ?? 0
}
