// ---------------------------------------------------------------------------
// MATCH SIMULATION
//
// A match is NOT one random roll. It runs five phases, each one a contested
// check between a team power number and a lobby opponent, and each one feeding
// state (mats, shield, elims) into the next:
//
//   1 DROP     contested or not. Aim + Build Speed decide it. Losers can die 90th.
//   2 LOOT     Loot Pathing sets mats/shield. Game Sense decides the rotate.
//   3 MID      Aggro trios seek fights (points + risk), zone players survive.
//   4 ENDGAME  Piece Control + Endgame + Clutch, circle by circle. Mats matter.
//   5 RESULT   placement + elims -> points from the scoring table.
//
// Every weight, chance and penalty below is read from balance.json.
// ---------------------------------------------------------------------------

import trainingJson from '../data/training.json'
import namesJson from '../data/names.json'
import { BAL, legacyAttrs, pointsFor } from './config'
import { Rng, clamp, winChance } from './rng'
import {
  PERF_ATTRS,
  type AttrKey,
  type Attributes,
  type MatchResult,
  type Player,
  type SessionResult,
  type Strategy,
  type Trio,
} from './types'

// Burnout penalty and POI flavour text both live in the data files.
const BAL_TRAIN_BURNOUT_PENALTY = (trainingJson as any).model.burnout.matchPenaltyAtMax as number
const BAL_POIS = (namesJson as any).pois as { hot: string[]; medium: string[]; cold: string[] }

// TEMPORARY BRIDGE (build step 3 deletes this). The engine below still speaks
// the old 11-attribute vocabulary; players now carry 29 sub-stats. legacyAttrs
// collapses one into the other using attributes.json -> legacyBridge, so the
// old phases keep running unchanged until they are rewritten around the new
// tree and the Fighting multiplier.
/** Archetypes that press W. Drives contest chance and mid-game fight count. */
const AGGRO_ARCHETYPES = new Set(['mech_carry', 'fragger', 'prodigy'])

function la(p: Player): Attributes {
  return legacyAttrs(p.current)
}

export interface SessionOptions {
  matches: number
  lobbyRating: number
  scoringId: string
  strategy: Strategy
  gamesTogether: number
}

// --- Trio chemistry --------------------------------------------------------

export interface SynergyBreakdown {
  total: number
  comms: number
  ego: number
  chemistry: number
  composition: number
  notes: string[]
}

/** Flat bonus (or penalty) applied to every team attribute all session long. */
export function computeSynergy(players: Player[], gamesTogether: number): SynergyBreakdown {
  const s = BAL.simulation.synergy
  const notes: string[] = []
  const alive = players.filter(Boolean)
  if (alive.length === 0) {
    return { total: 0, comms: 0, ego: 0, chemistry: 0, composition: 0, notes }
  }

  const avgComms = alive.reduce((a, p) => a + la(p).comms, 0) / alive.length
  // Real reference players have no ego rating at all - treat them as neutral.
  const egos = alive.map((p) => p.ego ?? 50)
  const avgEgo = egos.reduce((a, b) => a + b, 0) / egos.length
  const maxEgo = Math.max(...egos)

  const comms = (avgComms - 50) * s.commsWeight
  const ego = -(Math.max(0, avgEgo - 50) * s.egoPenaltyWeight)
  const topDog = -(Math.max(0, maxEgo - 50) * s.egoTopDogPenalty)
  const chemistry =
    s.gamesTogetherBonus * Math.sqrt(clamp(gamesTogether / s.gamesTogetherFull, 0, 1))

  // Archetype composition.
  const ids = alive.map((p) => p.archetype)
  let composition = 0
  const c = s.composition
  if (ids.includes('igl')) {
    composition += c.hasIGL
    notes.push('An IGL is making the calls.')
  } else {
    notes.push('No IGL - nobody is calling the rotates.')
  }
  if (ids.includes('anchor')) composition += c.hasSupportAnchor
  if (ids.includes('all_rounder')) composition += c.hasZonePlayer
  if (ids.length === 3 && ids[0] === ids[1] && ids[1] === ids[2]) {
    composition += c.threeOfSameArchetype
    notes.push('Three of the same archetype - the roles overlap badly.')
  }
  const aggroCount = ids.filter((a) => AGGRO_ARCHETYPES.has(a)).length
  if (aggroCount >= 2) {
    composition += c.twoOrMoreAggro
    notes.push('Two or more aggro players - somebody has to hold the piece.')
  }
  if (aggroCount === 0) {
    composition += c.noAggro
    notes.push('Nobody wants to take a fight.')
  }
  if (maxEgo > 80) notes.push('There is a big ego in this trio.')

  const total = clamp(comms + ego + topDog + chemistry + composition, s.clamp.min, s.clamp.max)
  return { total, comms, ego: ego + topDog, chemistry, composition, notes }
}

// --- Per-match player state ------------------------------------------------

/** Fatigue points for one player in match `matchIndex` (0-based) of a session. */
export function fatigueAmount(player: Player, matchIndex: number): number {
  const f = BAL.simulation.fatigue
  const over = Math.max(0, matchIndex + 1 - f.freeMatches)
  const raw = over * f.perMatch
  const resistance = (la(player).stamina / 99) * f.staminaScale
  return raw * (1 - resistance)
}

/** Per-match form roll. Low Consistency = huge swings. */
function formRoll(player: Player, rng: Rng): number {
  const cm = BAL.simulation.consistencyModel
  const sigma = cm.baseSigma * (1 - (player.current.consistency / 99) * cm.consistencyScale)
  return rng.gauss(0, sigma)
}

interface TeamSnapshot {
  stats: Record<AttrKey, number>
  form: number[] // per player, for the log
  fatigue: number[]
}

function buildTeamSnapshot(
  players: Player[],
  matchIndex: number,
  synergy: number,
  rng: Rng,
): TeamSnapshot {
  const agg = BAL.simulation.teamAggregation as Record<string, number>
  const sens = BAL.simulation.fatigue.sensitivity as Record<string, number>

  const form = players.map((p) => formRoll(p, rng))
  const fatigue = players.map((p) => fatigueAmount(p, matchIndex))
  const legacy = players.map((p) => la(p))

  const stats = {} as Record<AttrKey, number>
  for (const key of PERF_ATTRS) {
    const values = players.map((p, i) => {
      let v = legacy[i][key]
      v -= fatigue[i] * (sens[key] ?? 1)
      v -= (p.burnout / 100) * BAL_TRAIN_BURNOUT_PENALTY
      v += form[i]
      return v
    })
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const best = Math.max(...values)
    const a = agg[key] ?? 0.4
    stats[key] = avg * (1 - a) + best * a + synergy
  }
  // Non-performance attributes pass through as plain averages for display.
  stats.consistency = players.reduce((a, p) => a + p.current.consistency, 0) / players.length
  stats.stamina = legacy.reduce((a, l) => a + l.stamina, 0) / players.length
  return { stats, form, fatigue }
}

/** Weighted power number for a phase check. Weight sets in balance.json sum to 1. */
function power(stats: Record<AttrKey, number>, weights: Record<string, number>): number {
  let sum = 0
  for (const [key, w] of Object.entries(weights)) {
    if (key.startsWith('__')) continue
    sum += (stats[key as AttrKey] ?? 50) * w
  }
  return sum
}

function opponentPower(rng: Rng, lobbyRating: number, bonus = 0): number {
  return lobbyRating + bonus + rng.gauss(0, BAL.simulation.lobbySigma)
}

function contest(rng: Rng, myPower: number, oppPower: number): { win: boolean; chance: number } {
  const jitter = rng.gauss(0, BAL.simulation.consistencyModel.perCheckJitter)
  const chance = winChance(myPower + jitter, oppPower, BAL.simulation.duelScale)
  return { win: rng.next() < chance, chance }
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

// --- One match -------------------------------------------------------------

export function simulateMatch(
  players: Player[],
  opts: SessionOptions,
  matchIndex: number,
  synergy: number,
  rng: Rng,
): MatchResult {
  const S = BAL.simulation
  const snap = buildTeamSnapshot(players, matchIndex, synergy, rng)
  const stats = snap.stats
  const detail: string[] = []
  const fragments: string[] = []

  let elims = 0
  let mats = 0
  let shield = 0

  const aggroCount = players.filter((p) => AGGRO_ARCHETYPES.has(p.archetype)).length

  // --- PHASE 1: DROP -------------------------------------------------------
  const d = S.drop
  const contestChance = clamp(
    (d.contestChanceByStrategy[opts.strategy] ?? 0.45) + aggroCount * d.aggroContestBonus,
    0,
    0.98,
  )
  const contested = rng.chance(contestChance)
  const poiPool = contested
    ? rng.chance(0.75)
      ? BAL_POIS.hot
      : BAL_POIS.medium
    : opts.strategy === 'safe'
      ? BAL_POIS.cold
      : rng.chance(0.5)
        ? BAL_POIS.medium
        : BAL_POIS.cold
  const poi = rng.pick(poiPool) as string

  const finish = (
    placement: number,
    diedPhase: MatchResult['diedPhase'],
    matsAtEndgame: number,
  ): MatchResult => {
    const points = pointsFor(opts.scoringId, placement, elims)
    const summary =
      `Match ${matchIndex + 1} — ${fragments.join(' ')} ` +
      `${placement === 1 ? 'WON THE GAME' : `died ${ordinal(placement)}`}. ${points} pts.`
    return {
      matchNumber: matchIndex + 1,
      placement,
      elims,
      points,
      poi,
      contested,
      diedPhase,
      matsAtEndgame,
      summary: summary.replace(/\s+/g, ' ').trim(),
      detail,
    }
  }

  if (contested) {
    const my = power(stats, d.power)
    const opp = opponentPower(rng, opts.lobbyRating)
    const res = contest(rng, my, opp)
    detail.push(
      `DROP · contested ${poi} · power ${my.toFixed(1)} vs ${opp.toFixed(1)} (${pct(res.chance)})`,
    )
    if (res.win) {
      const gained = rng.int(d.winElims.min, d.winElims.max)
      elims += gained
      mats += d.winMats
      shield += d.winShieldBonus
      fragments.push(`Dropped ${poi} contested, won the fight (${gained} elims).`)
      detail.push(`  won the drop fight, +${gained} elims, +${d.winMats} mats`)
    } else {
      if (rng.chance(d.loseDeathChance)) {
        const placement = rng.int(d.losePlacement.min, d.losePlacement.max)
        fragments.push(`Dropped ${poi} contested and lost the fight.`)
        detail.push('  lost the drop fight and got cleaned up instantly')
        return finish(placement, 'drop', 0)
      }
      mats -= d.loseMatsPenalty
      shield -= d.loseShieldPenalty
      fragments.push(`Dropped ${poi} contested, lost the fight but scraped out.`)
      detail.push('  lost the drop fight, survived on scraps')
    }
  } else {
    mats += d.uncontestedMatsBonus
    fragments.push(`Dropped ${poi} uncontested.`)
    detail.push(`DROP · uncontested ${poi} · +${d.uncontestedMatsBonus} mats`)
  }

  // --- PHASE 2: LOOT + ROTATE ---------------------------------------------
  const l = S.loot
  mats = clamp(mats + l.matsBase + stats.lootPathing * l.matsPerLootPathing, 0, l.matsCap)
  shield = clamp(shield + l.shieldBase + stats.lootPathing * l.shieldPerLootPathing, 0, l.shieldCap)
  detail.push(
    `LOOT · loot pathing ${stats.lootPathing.toFixed(0)} → ${Math.round(mats)} mats, ${Math.round(shield)} shield`,
  )

  {
    const my = power(stats, l.rotatePower)
    const opp = opponentPower(rng, opts.lobbyRating, l.rotateDifficultyBonus)
    const res = contest(rng, my, opp)
    detail.push(`ROTATE · read ${my.toFixed(1)} vs ${opp.toFixed(1)} (${pct(res.chance)})`)
    if (res.win) {
      detail.push('  clean rotate, took the zone early')
    } else {
      if (rng.chance(l.failDeathChance)) {
        const placement = rng.int(l.failPlacement.min, l.failPlacement.max)
        const how = rng.chance(0.5) ? 'Storm-blocked on the rotate' : 'Third-partied mid-rotate'
        fragments.push(`${how}.`)
        detail.push('  caught out of position and killed')
        return finish(placement, 'rotate', Math.round(mats))
      }
      mats = Math.max(0, mats - l.failMatsPenalty)
      shield = Math.max(0, shield - l.failShieldPenalty)
      if (rng.chance(l.thirdPartyElimChance)) {
        elims += 1
        fragments.push('Messy rotate but traded one on the way in.')
      } else {
        fragments.push('Rotated late and burned mats getting in.')
      }
      detail.push(`  bad rotate: -${l.failMatsPenalty} mats, -${l.failShieldPenalty} shield`)
    }
  }

  // --- PHASE 3: MID GAME ---------------------------------------------------
  const m = S.midGame
  const expectedFights = clamp(
    (m.baseFights + aggroCount * m.aggroFightsPerPlayer) *
      (m.strategyFightMod[opts.strategy] ?? 1),
    0,
    m.maxFights,
  )
  const fights = clamp(Math.round(rng.gauss(expectedFights, 0.8)), 0, m.maxFights)
  detail.push(`MID GAME · took ${fights} fight${fights === 1 ? '' : 's'}`)

  let midElims = 0
  for (let f = 0; f < fights; f++) {
    let my = power(stats, m.power)
    if (mats < m.lowMatsThreshold) my -= m.lowMatsPenalty
    const opp = opponentPower(rng, opts.lobbyRating)
    const res = contest(rng, my, opp)
    mats = Math.max(0, mats - m.matsPerFight)
    if (res.win) {
      const gained = rng.int(m.winElims.min, m.winElims.max)
      elims += gained
      midElims += gained
      mats = Math.min(l.matsCap, mats + m.winMats)
      shield = Math.min(l.shieldCap, shield + m.healOffShield)
      detail.push(`  fight ${f + 1}: won (${pct(res.chance)}), +${gained} elims`)
    } else if (rng.chance(m.loseDeathChance)) {
      const placement = rng.int(m.losePlacement.min, m.losePlacement.max)
      if (midElims > 0) fragments.push(`Won a mid-game fight for ${midElims} more, then lost the next.`)
      else fragments.push('Lost a mid-game fight.')
      detail.push(`  fight ${f + 1}: lost (${pct(res.chance)}) and wiped`)
      return finish(placement, 'midgame', Math.round(mats))
    } else {
      shield = Math.max(0, shield - 40)
      detail.push(`  fight ${f + 1}: lost (${pct(res.chance)}) but disengaged`)
    }
  }
  if (midElims > 0) fragments.push(`${midElims} more in the mid game.`)

  // Unavoidable pressure on the way to the top 15. You cannot rotate around
  // these - this is what makes reaching an endgame an achievement rather than
  // the default outcome of playing passively.
  for (let f = 0; f < m.forcedEncounters; f++) {
    let my = power(stats, m.forcedPower)
    if (mats < m.lowMatsThreshold) my -= m.lowMatsPenalty
    const opp = opponentPower(rng, opts.lobbyRating)
    const res = contest(rng, my, opp)
    mats = Math.max(0, mats - m.forcedMatsCost)
    if (res.win) {
      if (rng.chance(m.forcedElimChance)) elims += 1
      detail.push(`  zone pressure ${f + 1}: held on (${pct(res.chance)})`)
    } else if (rng.chance(m.forcedDeathChance)) {
      const placement = rng.int(m.forcedPlacement.min, m.forcedPlacement.max)
      const how = rng.chance(0.5)
        ? 'Got squeezed out of the zone'
        : 'Third-partied moving into the circle'
      fragments.push(`${how}.`)
      detail.push(`  zone pressure ${f + 1}: broken (${pct(res.chance)}) and wiped`)
      return finish(placement, 'midgame', Math.round(mats))
    } else {
      shield = Math.max(0, shield - 35)
      detail.push(`  zone pressure ${f + 1}: survived on low HP (${pct(res.chance)})`)
    }
  }

  // --- PHASE 4: ENDGAME ----------------------------------------------------
  const e = S.endGame
  const matsAtEndgame = Math.round(mats)
  let alive = e.startPlacement
  const matsPerCircle = Math.max(
    25,
    e.matsPerCircle - Math.max(0, stats.pieceControl - 50) * e.matsSavedByPieceControl,
  )
  detail.push(`ENDGAME · reached top ${alive} with ${matsAtEndgame} mats`)

  let outOfMatsCalled = false
  while (alive > 1) {
    let my = power(stats, e.power)
    if (mats <= 0) {
      my -= e.outOfMatsPenalty
      if (!outOfMatsCalled) {
        outOfMatsCalled = true
        detail.push('  OUT OF MATS in the final circles')
      }
    }
    if (shield < e.lowShieldThreshold) my -= e.lowShieldPenalty
    const circlesSurvived = e.startPlacement - alive
    const opp = opponentPower(rng, opts.lobbyRating, circlesSurvived * e.difficultyRamp)
    const res = contest(rng, my, opp)

    if (!res.win) {
      const clutchSave =
        e.clutchSaveChance * clamp((stats.clutch - 50) / 49, 0, 1)
      if (rng.chance(clutchSave)) {
        detail.push(`  top ${alive}: lost the piece but clutched out of it`)
        mats = Math.max(0, mats - matsPerCircle * 1.5)
        alive -= 1
        continue
      }
      const cause = mats <= 0 ? 'ran out of mats' : circlesSurvived >= 8 ? 'lost the height fight' : 'lost the piece'
      fragments.push(`${capitalise(cause)} in the endgame.`)
      detail.push(`  top ${alive}: ${cause} (${pct(res.chance)})`)
      return finish(alive, 'endgame', matsAtEndgame)
    }

    if (rng.chance(e.elimChancePerCircle)) {
      const gained = rng.int(e.elimsPerCircle.min, e.elimsPerCircle.max)
      elims += gained
    }
    mats = Math.max(0, mats - matsPerCircle)
    alive -= 1
  }

  fragments.push('Held height all the way through the endgame.')
  detail.push('  survived every circle')
  return finish(1, 'won', matsAtEndgame)
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// --- A full session (one tournament sitting) -------------------------------

export function simulateSession(
  players: Player[],
  opts: SessionOptions,
  rng: Rng,
): SessionResult {
  const synergy = computeSynergy(players, opts.gamesTogether).total
  const matches: MatchResult[] = []
  for (let i = 0; i < opts.matches; i++) {
    matches.push(simulateMatch(players, opts, i, synergy, rng))
  }
  return {
    matches,
    totalPoints: matches.reduce((a, m) => a + m.points, 0),
    totalElims: matches.reduce((a, m) => a + m.elims, 0),
    bestPlacement: Math.min(...matches.map((m) => m.placement)),
    wins: matches.filter((m) => m.placement === 1).length,
  }
}

/**
 * Rough "how strong is this trio" number, used to seed the AI field and to
 * show the user a single readable strength value. Same weights as the phases,
 * averaged, so it tracks what actually wins matches.
 */
export function trioStrength(players: Player[], gamesTogether: number): number {
  if (players.length === 0) return 0
  const synergy = computeSynergy(players, gamesTogether).total
  const agg = BAL.simulation.teamAggregation as Record<string, number>
  const S = BAL.simulation
  const legacy = players.map((p) => la(p))
  const stats = {} as Record<AttrKey, number>
  for (const key of PERF_ATTRS) {
    const values = legacy.map((l) => l[key])
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    const best = Math.max(...values)
    const a = agg[key] ?? 0.4
    stats[key] = avg * (1 - a) + best * a + synergy
  }
  stats.consistency = 50
  stats.stamina = 50
  const phases = [
    { w: S.drop.power, weight: 0.2 },
    { w: S.loot.rotatePower, weight: 0.2 },
    { w: S.midGame.power, weight: 0.25 },
    { w: S.endGame.power, weight: 0.35 },
  ]
  let sum = 0
  for (const p of phases) sum += power(stats, p.w) * p.weight
  return sum
}
