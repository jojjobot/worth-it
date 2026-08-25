// ---------------------------------------------------------------------------
// MATCH SIMULATION
//
// A match is NOT one random roll, and a duo is NOT one blended stat line.
// Two players are tracked individually - their own mats, their own shield,
// their own form roll - through the real shape of a competitive match:
//
//   1 DROP     contested or not. Offspawn decides it. Losers die 40th-ish.
//   2 LOOT     Drop Accuracy + Resource Mgmt set mats/shield. Rotation rotates.
//   3 ZONES    one pass per mid-game zone: fights you CHOOSE, then pressure
//              you cannot avoid, then a chance to reboot a downed partner.
//   4 ENDGAME  top 15 down to the win, circle by circle. Mats matter.
//   5 RESULT   placement + elims -> points from the scoring table.
//
// Three rules make this different from a single power roll:
//
//   * SUB-STATS ONLY. Every check reads named sub-stats out of balance.json.
//     There is no 11-attribute bridge any more.
//   * FIGHTING IS A MULTIPLIER. Aim and mechanics give you raw power; the
//     Fighting category decides how much of it converts in an actual fight.
//   * ONE OF THEM GOES DOWN FIRST. Losing a fight usually knocks a single
//     player. The survivor plays the 1v2 alone - that is when Clutch is read,
//     and the only time it is read - and may rebuild the partner afterwards.
//
// PLACEMENTS ARE NOT RANDOM NUMBERS. The lobby is 50 duos and the engine keeps
// track of how many are still alive at each stage, so dying off the drop is
// always a bottom-ten finish and surviving to zone 6 is always a top-25 one.
//
// Every weight, chance and penalty below is read from balance.json.
// ---------------------------------------------------------------------------

import trainingJson from '../data/training.json'
import namesJson from '../data/names.json'
import { BAL, pointsFor } from './config'
import { Rng, clamp, winChance } from './rng'
import {
  CATEGORY_OF,
  SUB_KEYS,
  type CategoryKey,
  type MatchResult,
  type Player,
  type PlayerMatchLine,
  type Ratings,
  type SessionResult,
  type Strategy,
  type SubKey,
} from './types'

// Burnout penalty and POI flavour text both live in the data files.
const BAL_TRAIN_BURNOUT_PENALTY = (trainingJson as any).model.burnout.matchPenaltyAtMax as number
const BAL_POIS = (namesJson as any).pois as { hot: string[]; medium: string[]; cold: string[] }

/** Archetypes that press W. Drives contest chance and how many fights they seek. */
const AGGRO_ARCHETYPES = new Set(['mech_carry', 'fragger', 'prodigy'])

/** Sub-stats that are dials rather than performance, so form/fatigue never move them. */
const DIAL_SUBS = new Set<SubKey>(['consistency', 'big_stage_nerve'])

export interface SessionOptions {
  matches: number
  lobbyRating: number
  scoringId: string
  strategy: Strategy
  gamesTogether: number
  /** LAN / Grand Final. The ONLY situation in which Big Stage Nerve is read. */
  isLan?: boolean
}

// --- Weight sets -----------------------------------------------------------
// Everything in balance.json is a map of sub-stat id -> weight. A check that
// can be fought over also carries a `fighting` set: those sub-stats do not add
// power, they multiply it.

type SubWeights = Record<string, number>
interface CheckDef {
  raw: SubWeights
  fighting?: SubWeights
}

/** Weighted average over a rating-ish record, ignoring __comment keys. */
function weightedOf(source: (sub: SubKey) => number, weights: SubWeights): number {
  let sum = 0
  let total = 0
  for (const [key, w] of Object.entries(weights)) {
    if (key.startsWith('__') || typeof w !== 'number') continue
    sum += source(key as SubKey) * w
    total += w
  }
  return total > 0 ? sum / total : 50
}

/**
 * Fighting converts raw ability. Above the neutral 50 line the surplus is
 * multiplied; below it the deficit is divided, so a great fighter also wastes
 * less of a bad hand. Fighting can never manufacture aim it does not have.
 */
function convert(raw: number, fightScore: number): number {
  const f = BAL.simulation.fightingMultiplier
  const mult = clamp(1 + (fightScore - 50) * f.perPoint, f.minMult, f.maxMult)
  return raw >= 50 ? 50 + (raw - 50) * mult : 50 - (50 - raw) / mult
}

// --- Duo chemistry ---------------------------------------------------------

export interface SynergyBreakdown {
  total: number
  comms: number
  ego: number
  chemistry: number
  composition: number
  notes: string[]
}

/** Flat bonus (or penalty) applied to every performance sub-stat all session. */
export function computeSynergy(players: Player[], gamesTogether: number): SynergyBreakdown {
  const s = BAL.simulation.synergy
  const notes: string[] = []
  const alive = players.filter(Boolean)
  if (alive.length === 0) {
    return { total: 0, comms: 0, ego: 0, chemistry: 0, composition: 0, notes }
  }

  const avg = (pick: (p: Player) => number) =>
    alive.reduce((a, p) => a + pick(p), 0) / alive.length

  // Communication lifts the room; Decision Making is the calling voice, and
  // only the loudest one in the duo counts - two IGLs is not two sets of calls.
  const commsPart = (avg((p) => p.current.communication) - 50) * s.commsWeight
  const iglPart =
    (Math.max(...alive.map((p) => p.current.decision_making)) - 50) * (s.iglWeight ?? 0)

  // Real reference players have no ego rating at all - treat them as neutral.
  const egos = alive.map((p) => p.ego ?? 50)
  const avgEgo = egos.reduce((a, b) => a + b, 0) / egos.length
  const maxEgo = Math.max(...egos)
  const ego = -(Math.max(0, avgEgo - 50) * s.egoPenaltyWeight)
  const topDog = -(Math.max(0, maxEgo - 50) * s.egoTopDogPenalty)

  // Adaptivity is the sub-stat that decides how fast a new pairing gels.
  const adaptivity = avg((p) => p.current.adaptivity)
  const rampScale = 1 - ((adaptivity - 50) / 49) * (s.adaptivityRampScale ?? 0)
  const gamesNeeded = Math.max(10, s.gamesTogetherFull * clamp(rampScale, 0.35, 1.8))
  const chemistry = s.gamesTogetherBonus * Math.sqrt(clamp(gamesTogether / gamesNeeded, 0, 1))

  // Archetype composition.
  const ids = alive.map((p) => p.archetype)
  let composition = 0
  const c = s.composition
  if (ids.includes('igl')) {
    composition += c.hasIGL
    notes.push('An IGL is making the calls.')
  } else {
    notes.push('Neither of them is an IGL - nobody is calling the rotates.')
  }
  if (ids.includes('anchor')) composition += c.hasSupportAnchor
  if (ids.includes('all_rounder')) composition += c.hasZonePlayer
  if (ids.length === 2 && ids[0] === ids[1]) {
    composition += c.bothSameArchetype
    notes.push('Two of the same archetype - the roles overlap badly.')
  }
  const aggroCount = ids.filter((a) => AGGRO_ARCHETYPES.has(a)).length
  if (aggroCount >= 2) {
    composition += c.twoOrMoreAggro
    notes.push('Both of them want to press W - nobody is holding the piece.')
  }
  if (aggroCount === 0) {
    composition += c.noAggro
    notes.push('Nobody wants to take a fight.')
  }
  if (maxEgo > 80) notes.push('There is a big ego in this duo.')
  if (adaptivity >= 72 && gamesTogether < gamesNeeded)
    notes.push('Both of them adapt fast - this duo is gelling quicker than most.')
  if (adaptivity <= 38 && gamesTogether < gamesNeeded)
    notes.push('Neither of them adapts easily - this pairing will take a long time to click.')

  const comms = commsPart + iglPart
  const total = clamp(comms + ego + topDog + chemistry + composition, s.clamp.min, s.clamp.max)
  return { total, comms, ego: ego + topDog, chemistry, composition, notes }
}

// --- Per-player match state ------------------------------------------------

/** Endurance: there is no Stamina sub-stat, so it is read off the head. */
function endurance(player: Player): number {
  return weightedOf((s) => player.current[s], BAL.simulation.fatigue.resistance)
}

/** Fatigue points for one player in match `matchIndex` (0-based) of a session. */
export function fatigueAmount(player: Player, matchIndex: number): number {
  const f = BAL.simulation.fatigue
  const over = Math.max(0, matchIndex + 1 - f.freeMatches)
  const raw = over * f.perMatch
  const resistance = (endurance(player) / 99) * f.resistanceScale
  return raw * (1 - resistance)
}

type Status = 'up' | 'down' | 'dead'

interface PlayerState {
  p: Player
  /** This match's ratings: form, fatigue, burnout, tilt, synergy, LAN nerve. */
  eff: Ratings
  status: Status
  mats: number
  shield: number
  elims: number
  form: number
  fatigue: number
}

interface MatchContext {
  matchIndex: number
  synergy: number
  tilted: boolean
  isLan: boolean
  opts: SessionOptions
}

function buildStates(players: Player[], ctx: MatchContext, rng: Rng): PlayerState[] {
  const S = BAL.simulation
  const cm = S.consistencyModel
  const sens = S.fatigue.sensitivityByCategory as Record<CategoryKey, number>
  const mental = S.mental

  return players.map((p) => {
    const sigma = cm.baseSigma * (1 - (p.current.consistency / 99) * cm.consistencyScale)
    const form = rng.gauss(0, sigma)
    const fatigue = fatigueAmount(p, ctx.matchIndex)
    const burn = (p.burnout / 100) * BAL_TRAIN_BURNOUT_PENALTY
    // Tilt Resistance only ever shows up in the match AFTER a disaster.
    const tilt = ctx.tilted
      ? mental.tilt.basePenalty * (1 - p.current.tilt_resistance / 99)
      : 0
    // Big Stage Nerve is ignored everywhere except LAN and Grand Finals.
    const nerve = ctx.isLan
      ? (p.current.big_stage_nerve - mental.bigStageNerve.anchor) * mental.bigStageNerve.perPoint
      : 0

    const eff = {} as Ratings
    for (const sub of SUB_KEYS) {
      if (DIAL_SUBS.has(sub)) {
        eff[sub] = p.current[sub]
        continue
      }
      const drop = fatigue * (sens[CATEGORY_OF[sub]] ?? 1)
      eff[sub] = Math.max(1, p.current[sub] + form - drop - burn - tilt + nerve + ctx.synergy)
    }
    return { p, eff, status: 'up', mats: 0, shield: 0, elims: 0, form, fatigue }
  })
}

// --- Team numbers ----------------------------------------------------------

const AGG = BAL.simulation.teamAggregation as Record<CategoryKey, number>

/** One sub-stat, blended across the players who are still UP. */
function teamStat(states: PlayerState[], sub: SubKey): number {
  const ups = states.filter((s) => s.status === 'up')
  if (ups.length === 0) return 50
  // A lone survivor gets no help from a partner who is on the floor.
  if (ups.length === 1) return ups[0].eff[sub]
  const values = ups.map((s) => s.eff[sub])
  const a = AGG[CATEGORY_OF[sub]] ?? 0.4
  const avg = values.reduce((x, y) => x + y, 0) / values.length
  const best = Math.max(...values)
  return avg * (1 - a) + best * a
}

function teamWeighted(states: PlayerState[], weights: SubWeights): number {
  return weightedOf((sub) => teamStat(states, sub), weights)
}

/** Raw power for a check, with the Fighting multiplier applied if it applies. */
function checkPower(states: PlayerState[], def: CheckDef): number {
  const raw = teamWeighted(states, def.raw)
  if (!def.fighting) return raw
  return convert(raw, teamWeighted(states, def.fighting))
}

interface Situation {
  /** A moment where Under Pressure is read: closing games, final circles. */
  pressure?: boolean
}

/**
 * Every contextual modifier that is NOT part of a weight set: being a man down,
 * being out of mats, the 1v2 clutch read, and the pressure read.
 */
function situationalMod(states: PlayerState[], sit: Situation): number {
  const S = BAL.simulation
  const ups = states.filter((s) => s.status === 'up')
  let mod = 0

  if (ups.length === 1 && states.length > 1) {
    // Playing the 1v2. This is the ONLY place Clutch is read.
    mod -= S.downedPartner.powerPenalty
    mod += (ups[0].eff.clutch - S.mental.clutch.anchor) * S.mental.clutch.perPoint
  }
  if (sit.pressure && ups.length > 0) {
    mod += (teamStat(states, 'under_pressure') - S.mental.pressure.anchor) * S.mental.pressure.perPoint
  }
  return mod
}

function avgMats(states: PlayerState[]): number {
  const ups = states.filter((s) => s.status === 'up')
  if (ups.length === 0) return 0
  return ups.reduce((a, s) => a + s.mats, 0) / ups.length
}

function avgShield(states: PlayerState[]): number {
  const ups = states.filter((s) => s.status === 'up')
  if (ups.length === 0) return 0
  return ups.reduce((a, s) => a + s.shield, 0) / ups.length
}

function teamAlive(states: PlayerState[]): boolean {
  return states.some((s) => s.status === 'up')
}

// --- Contested checks ------------------------------------------------------

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

/**
 * A fight has gone badly. Work out what it actually costs.
 *   'wiped'   - the team is out of the game
 *   'downed'  - one player is on the floor, the other plays the 1v2
 *   'escaped' - broke contact, chip damage only
 */
function takeCasualty(states: PlayerState[], rng: Rng): 'wiped' | 'downed' | 'escaped' {
  const dp = BAL.simulation.downedPartner
  const ups = states.filter((s) => s.status === 'up')
  if (ups.length === 0) return 'wiped'

  if (ups.length === 1) {
    // No partner left to trade for you.
    if (rng.chance(dp.soloWipeChance)) {
      ups[0].status = 'dead'
      for (const s of states) if (s.status === 'down') s.status = 'dead'
      return 'wiped'
    }
    return 'escaped'
  }

  // Reset Timing and Movement are what turn a lost fight into a lost player
  // instead of a lost game.
  const escapeSkill = teamWeighted(states, dp.wipeReducedBy)
  const wipeChance = clamp(
    dp.wipeChanceOnLoss * (1 - ((escapeSkill - 50) / 50) * dp.wipeSkillScale),
    0.05,
    0.92,
  )
  if (rng.chance(wipeChance)) {
    for (const s of states) s.status = 'dead'
    return 'wiped'
  }

  // Somebody goes down - usually the one who was losing their own fight.
  const scores = ups.map((s) => teamWeighted([s], BAL.simulation.midGame.power.raw))
  const weights = scores.map((v) => Math.max(0.1, 100 - v))
  const victim = rng.weighted(ups, weights)
  victim.status = 'down'
  return 'downed'
}

/** Hand out elims to whoever is still standing. */
function awardElims(states: PlayerState[], count: number, rng: Rng): void {
  const ups = states.filter((s) => s.status === 'up')
  if (ups.length === 0) return
  for (let i = 0; i < count; i++) rng.pick(ups).elims += 1
}

function spendMats(states: PlayerState[], amount: number): void {
  for (const s of states) if (s.status === 'up') s.mats = Math.max(0, s.mats - amount)
}

function addMats(states: PlayerState[], amount: number, cap: number): void {
  for (const s of states) if (s.status === 'up') s.mats = clamp(s.mats + amount, 0, cap)
}

function addShield(states: PlayerState[], amount: number): void {
  const cap = BAL.simulation.loot.shieldCap
  for (const s of states) if (s.status === 'up') s.shield = clamp(s.shield + amount, 0, cap)
}

/** Try to rebuild the duo. Returns the tag of whoever came back, if anyone. */
function tryReboot(states: PlayerState[], teamsAlive: number, rng: Rng): string | null {
  const r = BAL.simulation.downedPartner.reboot
  if (teamsAlive <= r.notBelowPlacement) return null
  const downed = states.find((s) => s.status === 'down')
  const survivor = states.find((s) => s.status === 'up')
  if (!downed || !survivor) return null

  const power = teamWeighted(states, r.power)
  const chance = clamp(r.baseChance * (1 + ((power - 50) / 50) * r.skillScale), 0.02, 0.95)
  if (!rng.chance(chance)) return null
  if (survivor.mats < r.matsCost) return null

  survivor.mats -= r.matsCost
  downed.status = 'up'
  // They come back with nothing. That is the point of losing a player.
  downed.mats = 0
  downed.shield = 0
  return downed.p.tag
}

// --- One match -------------------------------------------------------------

export function simulateMatch(
  players: Player[],
  opts: SessionOptions,
  matchIndex: number,
  synergy: number,
  rng: Rng,
  tilted = false,
): MatchResult {
  const S = BAL.simulation
  const LOBBY = S.lobby
  const teams: number = LOBBY.teams
  const surv = LOBBY.survivors
  const zones: number[] = surv.afterZones

  const ctx: MatchContext = { matchIndex, synergy, tilted, isLan: !!opts.isLan, opts }
  const states = buildStates(players, ctx, rng)

  const detail: string[] = []
  const fragments: string[] = []
  let partnerDowns = 0
  let reboots = 0
  let teamsAlive = teams
  /** Clearing a contested POI means you own everything on it. */
  let lootBonus = 0

  // The closing games of a session are where a run is won or thrown away.
  const closingGame = matchIndex >= opts.matches - S.mental.pressure.lastMatchesOfSession
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

  let matsAtEndgame = 0
  const lines = (): PlayerMatchLine[] =>
    states.map((s) => ({
      playerId: s.p.id,
      tag: s.p.tag,
      elims: s.elims,
      survived: s.status === 'up',
    }))

  const finish = (placement: number, diedPhase: MatchResult['diedPhase']): MatchResult => {
    const elims = states.reduce((a, s) => a + s.elims, 0)
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
      partnerDowns,
      reboots,
      players: lines(),
      summary: summary.replace(/\s+/g, ' ').trim(),
      detail,
    }
  }

  const bandDeath = (from: number, to: number): number => rng.int(Math.min(from, to), Math.max(from, to))

  if (contested) {
    const my = checkPower(states, d.power) + situationalMod(states, { pressure: closingGame })
    const opp = opponentPower(rng, opts.lobbyRating)
    const res = contest(rng, my, opp)
    detail.push(
      `DROP · contested ${poi} · power ${my.toFixed(1)} vs ${opp.toFixed(1)} (${pct(res.chance)})`,
    )
    if (res.win) {
      const gained = rng.int(d.winElims.min, d.winElims.max)
      awardElims(states, gained, rng)
      addMats(states, d.winMats, S.loot.matsCap)
      addShield(states, d.winShieldBonus)
      lootBonus += d.winLootBonus ?? 0
      fragments.push(`Dropped ${poi} contested, won the fight (${gained} elims).`)
      detail.push(`  won the drop fight, +${gained} elims, +${d.winMats} mats each`)
    } else {
      const cost = takeCasualty(states, rng)
      if (cost === 'wiped') {
        fragments.push(`Dropped ${poi} contested and lost the fight.`)
        detail.push('  lost the drop fight and got cleaned up instantly')
        return finish(bandDeath(surv.afterDrop + 1, teams), 'drop')
      }
      spendMats(states, d.loseMatsPenalty)
      addShield(states, -d.loseShieldPenalty)
      if (cost === 'downed') {
        partnerDowns++
        const downTag = states.find((s) => s.status === 'down')!.p.tag
        fragments.push(`Lost the ${poi} contest - ${downTag} went down off spawn.`)
        detail.push(`  lost the drop fight, ${downTag} down, playing the 1v2`)
      } else {
        fragments.push(`Dropped ${poi} contested, lost the fight but scraped out.`)
        detail.push('  lost the drop fight, survived on scraps')
      }
    }
  } else {
    addMats(states, d.uncontestedMatsBonus, S.loot.matsCap)
    fragments.push(`Dropped ${poi} uncontested.`)
    detail.push(`DROP · uncontested ${poi} · +${d.uncontestedMatsBonus} mats each`)
  }
  teamsAlive = surv.afterDrop

  // --- PHASE 2: LOOT + FIRST ROTATE ----------------------------------------
  const l = S.loot
  {
    const lootStat = teamWeighted(states, l.lootPower) + lootBonus
    addMats(states, l.matsBase + lootStat * l.matsPerLootStat, l.matsCap)
    addShield(states, l.shieldBase + lootStat * l.shieldPerLootStat)
    detail.push(
      `LOOT · loot quality ${lootStat.toFixed(0)} → ${Math.round(avgMats(states))} mats, ${Math.round(avgShield(states))} shield each`,
    )

    const my = checkPower(states, l.rotatePower) + situationalMod(states, { pressure: closingGame })
    const opp = opponentPower(rng, opts.lobbyRating, l.rotateDifficultyBonus)
    const res = contest(rng, my, opp)
    detail.push(`ROTATE · read ${my.toFixed(1)} vs ${opp.toFixed(1)} (${pct(res.chance)})`)
    if (res.win) {
      detail.push('  clean rotate, took the zone early')
    } else if (rng.chance(l.failDeathChance)) {
      // A blown rotate is a fight you did not pick, so Fight Selection is no
      // help here - it runs on the mid-game weights at full opponent strength.
      const fightPower = checkPower(states, S.midGame.power) + situationalMod(states, { pressure: closingGame })
      const fightRes = contest(rng, fightPower, opponentPower(rng, opts.lobbyRating, 2))
      const how = rng.chance(0.5) ? 'Storm-blocked on the rotate' : 'Third-partied mid-rotate'
      if (!fightRes.win) {
        const cost = takeCasualty(states, rng)
        if (cost === 'wiped') {
          fragments.push(`${how}.`)
          detail.push('  caught out of position and killed')
          return finish(bandDeath(surv.afterRotate + 1, surv.afterDrop), 'rotate')
        }
        if (cost === 'downed') {
          partnerDowns++
          const downTag = states.find((s) => s.status === 'down')!.p.tag
          fragments.push(`${how} - ${downTag} went down.`)
          detail.push(`  ${downTag} down on the rotate, playing the 1v2`)
        } else {
          fragments.push(`${how} but broke contact.`)
          detail.push('  broke contact, chip damage only')
        }
        spendMats(states, l.failMatsPenalty)
        addShield(states, -l.failShieldPenalty)
      } else {
        awardElims(states, 1, rng)
        fragments.push(`${how} but won the fight on the way in.`)
        detail.push('  fought through it, +1 elim')
        spendMats(states, l.failMatsPenalty)
      }
    } else {
      spendMats(states, l.failMatsPenalty)
      addShield(states, -l.failShieldPenalty)
      if (rng.chance(l.thirdPartyElimChance)) {
        awardElims(states, 1, rng)
        fragments.push('Messy rotate but traded one on the way in.')
      } else {
        fragments.push('Rotated late and burned mats getting in.')
      }
      detail.push(`  bad rotate: -${l.failMatsPenalty} mats, -${l.failShieldPenalty} shield`)
    }
  }
  teamsAlive = surv.afterRotate
  {
    const back = tryReboot(states, teamsAlive, rng)
    if (back) {
      reboots++
      fragments.push(`Rebuilt ${back}.`)
      detail.push(`  rebooted ${back} before the zone pulled`)
    }
  }

  // --- PHASE 3: THE MID-GAME ZONES -----------------------------------------
  const m = S.midGame
  let midElims = 0

  for (let z = 0; z < zones.length; z++) {
    const zoneNumber = z + 3 // reads like a real zone number in the log
    const bandFrom = zones[z] + 1
    const bandTo = z === 0 ? surv.afterRotate : zones[z - 1]
    const pressure = closingGame
    const rampBonus = z * m.zoneDifficultyRamp

    // 3a) The fights they CHOOSE. Fight Selection does not win fights - it
    //     picks softer ones, and talks them out of the bad ones entirely.
    const fightSelection = teamStat(states, 'fight_selection')
    let fightChance = clamp(
      (m.optionalFightChance[opts.strategy] ?? 0.4) + aggroCount * m.aggroFightBonus,
      0,
      0.95,
    )
    for (let f = 0; f < m.maxOptionalFightsPerZone; f++) {
      if (!teamAlive(states)) break
      if (!rng.chance(fightChance)) break
      // A duo with real fight selection walks away from the bad ones.
      if (rng.chance(clamp(Math.max(0, fightSelection - 50) * m.fightSelectionSkipScale, 0, 0.6))) {
        detail.push(`ZONE ${zoneNumber} · saw a fight and turned it down`)
        break
      }
      let my = checkPower(states, m.power) + situationalMod(states, { pressure })
      if (avgMats(states) < m.lowMatsThreshold) my -= m.lowMatsPenalty
      const softer = Math.max(0, fightSelection - 50) * m.fightSelectionScale
      const opp = opponentPower(rng, opts.lobbyRating, rampBonus - softer)
      const res = contest(rng, my, opp)
      spendMats(states, m.matsPerFight)
      if (res.win) {
        const gained = rng.int(m.winElims.min, m.winElims.max)
        awardElims(states, gained, rng)
        midElims += gained
        addMats(states, m.winMats, l.matsCap)
        addShield(states, m.healOffShield)
        detail.push(`ZONE ${zoneNumber} · took a fight and won (${pct(res.chance)}), +${gained} elims`)
      } else {
        const cost = takeCasualty(states, rng)
        if (cost === 'wiped') {
          if (midElims > 0)
            fragments.push(`Won a mid-game fight for ${midElims} more, then lost the next.`)
          else fragments.push('Lost a mid-game fight.')
          detail.push(`ZONE ${zoneNumber} · lost the fight (${pct(res.chance)}) and wiped`)
          return finish(bandDeath(bandFrom, bandTo), 'midgame')
        }
        if (cost === 'downed') {
          partnerDowns++
          const downTag = states.find((s) => s.status === 'down')!.p.tag
          detail.push(`ZONE ${zoneNumber} · lost the fight (${pct(res.chance)}), ${downTag} down`)
        } else {
          addShield(states, -40)
          detail.push(`ZONE ${zoneNumber} · lost the fight (${pct(res.chance)}) but disengaged`)
        }
        fightChance = 0 // one beating per zone is enough
      }
    }
    if (!teamAlive(states)) return finish(bandDeath(bandFrom, bandTo), 'midgame')

    // 3b) The pressure they CANNOT avoid. This is the gate on reaching top 15.
    {
      let my = checkPower(states, m.zonePower) + situationalMod(states, { pressure })
      if (avgMats(states) < m.lowMatsThreshold) my -= m.lowMatsPenalty
      const opp = opponentPower(rng, opts.lobbyRating, rampBonus)
      const res = contest(rng, my, opp)
      spendMats(states, m.zoneMatsCost)
      if (res.win) {
        if (rng.chance(m.zoneElimChance)) {
          awardElims(states, 1, rng)
          midElims += 1
        }
        detail.push(`ZONE ${zoneNumber} · held the position (${pct(res.chance)})`)
      } else if (rng.chance(m.zoneDeathChance)) {
        const cost = takeCasualty(states, rng)
        const how = rng.chance(0.5)
          ? 'Got squeezed out of the zone'
          : 'Third-partied moving into the circle'
        if (cost === 'wiped') {
          fragments.push(`${how}.`)
          detail.push(`ZONE ${zoneNumber} · broken (${pct(res.chance)}) and wiped`)
          return finish(bandDeath(bandFrom, bandTo), 'midgame')
        }
        if (cost === 'downed') {
          partnerDowns++
          const downTag = states.find((s) => s.status === 'down')!.p.tag
          detail.push(`ZONE ${zoneNumber} · broken (${pct(res.chance)}), ${downTag} down`)
        } else {
          addShield(states, -m.zoneShieldCost)
          detail.push(`ZONE ${zoneNumber} · broken (${pct(res.chance)}), survived on low HP`)
        }
      } else {
        addShield(states, -m.zoneShieldCost)
        detail.push(`ZONE ${zoneNumber} · lost ground (${pct(res.chance)}), took damage getting in`)
      }
    }
    if (!teamAlive(states)) return finish(bandDeath(bandFrom, bandTo), 'midgame')

    teamsAlive = zones[z]

    // 3c) Rebuild, if there is anyone to rebuild.
    const back = tryReboot(states, teamsAlive, rng)
    if (back) {
      reboots++
      detail.push(`ZONE ${zoneNumber} · rebooted ${back}`)
    }
  }

  if (midElims > 0) fragments.push(`${midElims} more in the mid game.`)
  if (partnerDowns > 0 && reboots > 0) fragments.push('Rebuilt after going a man down.')
  else if (partnerDowns > 0 && states.some((s) => s.status === 'down'))
    fragments.push('Carried the endgame a man down.')

  // --- PHASE 4: ENDGAME ----------------------------------------------------
  const e = S.endGame
  const circles: number[] = e.circles
  let alive = teamsAlive
  matsAtEndgame = Math.round(avgMats(states))
  const matsPerCircle = Math.max(
    20,
    e.matsPerCircle -
      Math.max(0, teamStat(states, 'build_efficiency') - 50) * e.matsSavedByBuildEfficiency,
  )
  detail.push(`ENDGAME · reached top ${alive} with ${matsAtEndgame} mats each`)

  let outOfMatsCalled = false
  // One check per closing circle. Several teams die in the early ones and it
  // thins out from there, so surviving circle four is worth far more than
  // surviving circle one.
  for (let c = 0; c < circles.length; c++) {
    const nextAlive = circles[c]
    const pressure = closingGame || alive <= S.mental.pressure.endgameFromPlacement
    let my = checkPower(states, e.power) + situationalMod(states, { pressure })
    if (avgMats(states) <= 0) {
      my -= e.outOfMatsPenalty
      if (!outOfMatsCalled) {
        outOfMatsCalled = true
        detail.push('  OUT OF MATS in the final circles')
      }
    }
    if (avgShield(states) < e.lowShieldThreshold) my -= e.lowShieldPenalty
    const circlesSurvived = c
    const opp = opponentPower(rng, opts.lobbyRating, circlesSurvived * e.difficultyRamp)
    const res = contest(rng, my, opp)

    if (!res.win) {
      // The last-man clutch save. Only a player who is actually alone gets it.
      const solo = states.filter((s) => s.status === 'up')
      const clutchStat = solo.length === 1 ? solo[0].eff.clutch : teamStat(states, 'clutch')
      const saveChance =
        S.mental.clutch.saveChance * clamp((clutchStat - S.mental.clutch.anchor) / 49, 0, 1)
      if (rng.chance(saveChance)) {
        detail.push(`  top ${alive}: lost the piece but clutched out of it`)
        spendMats(states, matsPerCircle * 1.5)
        alive = nextAlive
        continue
      }
      const cost = takeCasualty(states, rng)
      if (cost !== 'wiped' && teamAlive(states)) {
        if (cost === 'downed') {
          partnerDowns++
          const downTag = states.find((s) => s.status === 'down')!.p.tag
          detail.push(`  top ${alive}: ${downTag} down, still in it`)
        } else {
          detail.push(`  top ${alive}: lost the piece but survived the reset`)
        }
        spendMats(states, matsPerCircle)
        alive = nextAlive
        continue
      }
      const cause =
        avgMats(states) <= 0
          ? 'ran out of mats'
          : circlesSurvived >= circles.length - 3
            ? 'lost the height fight'
            : 'lost the piece'
      fragments.push(`${capitalise(cause)} in the endgame.`)
      detail.push(`  top ${alive}: ${cause} (${pct(res.chance)})`)
      return finish(bandDeath(nextAlive + 1, alive), 'endgame')
    }

    if (rng.chance(e.elimChancePerCircle)) {
      awardElims(states, rng.int(e.elimsPerCircle.min, e.elimsPerCircle.max), rng)
    }
    spendMats(states, matsPerCircle)
    alive = nextAlive
    if (alive <= 1) break
  }

  fragments.push('Held height all the way through the endgame.')
  detail.push('  survived every circle')
  return finish(1, 'won')
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
  const badPlacement = BAL.simulation.mental.tilt.badPlacement
  // A disaster game follows you into the NEXT one. That is Tilt Resistance.
  let tilted = players.some((p) => p.lastResultWasBad)

  for (let i = 0; i < opts.matches; i++) {
    const m = simulateMatch(players, opts, i, synergy, rng, tilted)
    matches.push(m)
    tilted = m.placement > badPlacement
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
 * Rough "how strong is this duo" number, used to seed the AI field and to show
 * the user a single readable strength value. It runs the real phase weight
 * sets - Fighting multiplier included - so it tracks what actually wins
 * matches rather than being a second, parallel rating system.
 */
export function duoStrength(players: Player[], gamesTogether: number): number {
  if (players.length === 0) return 0
  const S = BAL.simulation
  const synergy = computeSynergy(players, gamesTogether).total

  // A no-form, no-fatigue snapshot of the duo.
  const states: PlayerState[] = players.map((p) => {
    const eff = {} as Ratings
    for (const sub of SUB_KEYS) {
      eff[sub] = DIAL_SUBS.has(sub) ? p.current[sub] : p.current[sub] + synergy
    }
    return { p, eff, status: 'up', mats: 0, shield: 0, elims: 0, form: 0, fatigue: 0 }
  })

  const phases: { def: CheckDef; weight: number }[] = [
    { def: S.drop.power, weight: 0.14 },
    { def: S.loot.rotatePower, weight: 0.16 },
    { def: S.midGame.power, weight: 0.2 },
    { def: S.midGame.zonePower, weight: 0.2 },
    { def: S.endGame.power, weight: 0.3 },
  ]
  let sum = 0
  for (const p of phases) sum += checkPower(states, p.def) * p.weight
  return sum
}
