// ---------------------------------------------------------------------------
// Game state: creating a new save, every player-facing action, and the big
// advanceWeek() routine that runs tournaments, training and the books.
//
// All functions take a GameState and return a NEW GameState (the old one is
// never mutated), which keeps React re-rendering predictable.
// ---------------------------------------------------------------------------

import { BAL, NAMES, getProgram, getRegion } from './config'
import { Rng, clamp, hashSeed } from './rng'
import {
  generateOrgName,
  generatePlayer,
  nextId,
  overall,
  progressPlayer,
  recordLanAppearance,
} from './players'
import { backfillRivalDuo, buildRealRoster, realSignReputationGate } from './realPlayers'
import { eventsForWeek, nextStageQualKey, runTournament } from './tournament'
import { applyTraining, trainingCost, duoTrainingChemistry, type TrainingOutcome } from './training'
import type {
  GameState,
  Player,
  TournamentResult,
  Duo,
  WeeklyFinance,
} from './types'

// 2 = the attribute-tree rewrite (old 11-attribute `attrs` object).
// 3 = DUOS instead of trios, plus the real reference roster and rival orgs.
// Older saves cannot be migrated and are discarded on load.
export const SAVE_VERSION = 3

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

function takenTags(state: GameState): Set<string> {
  return new Set(Object.values(state.players).map((p) => p.tag.toLowerCase()))
}

// --- New game --------------------------------------------------------------

export function createNewGame(orgName: string, region: string, seedLabel: string): GameState {
  const rng = new Rng(hashSeed(seedLabel || 'default'))
  const org = BAL.org

  const state: GameState = {
    version: SAVE_VERSION,
    seedLabel,
    rngState: rng.s,
    orgName: orgName.trim() || 'Unnamed Org',
    region,
    week: 1,
    cash: BAL.economy.startingCash,
    reputation: BAL.economy.startingReputation,
    fans: BAL.economy.startingFans,
    negativeWeeks: 0,
    gameOver: null,
    players: {},
    rosterIds: [],
    marketIds: [],
    duos: [],
    rivalDuos: [],
    scoutPoints: BAL.scouting.pointsPerWeek,
    lastMarketRefreshWeek: 1,
    entries: {},
    qualifications: {},
    results: [],
    finances: [],
    newsLog: [],
  }

  const taken = new Set<string>()

  // Starters: one duo plus a sub, deliberately mediocre and deliberately
  // different, so your first roster decision is which two actually play.
  const startingArchetypes = ['igl', 'mech_carry', 'anchor'].slice(0, org.startingPlayers ?? 3)
  for (const archetype of startingArchetypes) {
    const p = generatePlayer(rng, taken, {
      baseRating: rng.gauss(org.startingPlayerRating.mu, org.startingPlayerRating.sigma),
      region,
      archetype,
      age: rng.int(15, 19),
      freeAgent: true,
    })
    p.orgName = state.orgName
    p.contractWeeks = org.startingContractWeeks
    p.joinedWeek = 1
    p.trainingProgram = 'full_scrims'
    p.scoutLevel = BAL.scouting.maxLevel
    state.players[p.id] = p
    state.rosterIds.push(p.id)
  }

  state.duos.push({
    id: nextId('t'),
    name: 'Main Duo',
    playerIds: state.rosterIds.slice(0, 2),
    strategy: 'balanced',
    gamesTogether: 0,
  })

  // The real scene: 12 hand-authored reference players in their real orgs,
  // plus the duos those orgs field against you every week. They sit on the
  // transfer market from day one - you can try to sign any of them, but they
  // are under contract and the buyout is brutal.
  const real = buildRealRoster(rng, taken)
  for (const p of real.players) {
    state.players[p.id] = p
    state.marketIds.push(p.id)
  }
  state.rivalDuos = real.rivalDuos

  refreshMarketInPlace(state, rng, taken)
  state.newsLog.push({
    week: 1,
    text: `${state.orgName} is founded in ${getRegion(region).name}. Nobody has heard of you.`,
  })
  state.rngState = rng.s
  return state
}

// --- Market ----------------------------------------------------------------

function generateMarketPlayer(rng: Rng, taken: Set<string>): Player {
  const m = BAL.org.marketRating
  const isProspect = rng.chance(m.prospectChance)
  const isStar = !isProspect && rng.chance(m.starChance)

  if (isProspect) {
    return generatePlayer(rng, taken, {
      baseRating: rng.gauss(m.commonMu - 9, m.commonSigma),
      age: rng.int(m.prospectAgeRange.min, m.prospectAgeRange.max),
    })
  }
  return generatePlayer(rng, taken, {
    baseRating: isStar ? rng.gauss(m.starMu, m.starSigma) : rng.gauss(m.commonMu, m.commonSigma),
  })
}

function refreshMarketInPlace(state: GameState, rng: Rng, taken: Set<string>): void {
  // Drop anyone the user has not scouted; keep scouted players so research is
  // not wasted, but let a few of them get signed elsewhere.
  const inRivalDuo = new Set(state.rivalDuos.flatMap((d) => d.playerIds))
  const kept = state.marketIds.filter((id) => {
    const p = state.players[id]
    if (!p) return false
    // The real players and the rival orgs' rosters are permanent fixtures of
    // the scene. They never rotate off the market.
    if (p.isReal || inRivalDuo.has(id)) return true
    if (p.scoutLevel === 0) return false
    return !rng.chance(0.35)
  })
  for (const id of state.marketIds) {
    if (!kept.includes(id)) delete state.players[id]
  }
  state.marketIds = kept

  const ordinary = () =>
    state.marketIds.filter((id) => {
      const p = state.players[id]
      return p && !p.isReal && !inRivalDuo.has(id)
    }).length
  while (ordinary() < BAL.scouting.freeAgentPoolSize) {
    const p = generateMarketPlayer(rng, taken)
    state.players[p.id] = p
    state.marketIds.push(p.id)
  }
  state.lastMarketRefreshWeek = state.week
}

// --- Actions ---------------------------------------------------------------

export function scoutPlayer(state: GameState, playerId: string): GameState {
  const s = clone(state)
  const p = s.players[playerId]
  if (!p) return state
  if (p.scoutLevel >= BAL.scouting.maxLevel) return state
  if (s.scoutPoints < BAL.scouting.costPerReport) return state
  if (s.cash < BAL.scouting.cashCostPerReport) return state
  s.scoutPoints -= BAL.scouting.costPerReport
  s.cash -= BAL.scouting.cashCostPerReport
  p.scoutLevel += 1
  return s
}

export interface SignQuote {
  ok: boolean
  reason: string
  upfront: number
  weekly: number
}

export function signQuote(state: GameState, playerId: string): SignQuote {
  const p = state.players[playerId]
  if (!p) return { ok: false, reason: 'Unknown player', upfront: 0, weekly: 0 }
  if (state.rosterIds.includes(playerId))
    return { ok: false, reason: 'Already on your roster', upfront: 0, weekly: 0 }
  if (state.rosterIds.length >= BAL.org.rosterLimit)
    return { ok: false, reason: 'Roster is full', upfront: 0, weekly: p.salary }
  const gate = realSignReputationGate()
  if (p.isReal && state.reputation < gate)
    return {
      ok: false,
      reason: `${p.tag} will not take the call until you are at ${gate} reputation`,
      upfront: p.buyout,
      weekly: p.salary,
    }
  const upfront = p.buyout
  if (state.cash < upfront)
    return { ok: false, reason: 'Not enough cash for the buyout', upfront, weekly: p.salary }
  return { ok: true, reason: '', upfront, weekly: p.salary }
}

export function signPlayer(state: GameState, playerId: string): GameState {
  const quote = signQuote(state, playerId)
  if (!quote.ok) return state
  const s = clone(state)
  const p = s.players[playerId]
  s.cash -= quote.upfront
  p.orgName = s.orgName
  p.contractWeeks = Math.max(
    BAL.playerGeneration.contract.lengthWeeks.min,
    p.contractWeeks || BAL.org.startingContractWeeks,
  )
  p.buyout = 0
  p.joinedWeek = s.week
  p.scoutLevel = BAL.scouting.maxLevel // you see everything once they are yours
  s.rosterIds.push(playerId)
  s.marketIds = s.marketIds.filter((id) => id !== playerId)

  // If you just took someone out of a real org's duo, that org has to replace
  // them - and the new pairing starts with zero chemistry.
  const rival = s.rivalDuos.find((d) => d.playerIds.includes(playerId))
  if (rival) {
    const rng = new Rng(s.rngState)
    const replacement = backfillRivalDuo(rival, playerId, rng, takenTags(s))
    s.players[replacement.id] = replacement
    s.marketIds.push(replacement.id)
    s.rngState = rng.s
    s.newsLog.push({
      week: s.week,
      text: `${rival.orgName} move fast after losing ${p.tag} and promote ${replacement.tag}.`,
    })
  }
  s.newsLog.push({
    week: s.week,
    text: `${s.orgName} sign ${p.tag}${quote.upfront > 0 ? ` for a $${quote.upfront.toLocaleString()} buyout` : ' as a free agent'}.`,
  })
  return s
}

export function releasePlayer(state: GameState, playerId: string): GameState {
  const s = clone(state)
  const p = s.players[playerId]
  if (!p) return state
  s.rosterIds = s.rosterIds.filter((id) => id !== playerId)
  for (const duo of s.duos) {
    duo.playerIds = duo.playerIds.map((id) => (id === playerId ? null : id))
  }
  p.orgName = null
  p.contractWeeks = 0
  p.joinedWeek = null
  s.marketIds.push(playerId)
  s.newsLog.push({ week: s.week, text: `${p.tag} is released by ${s.orgName}.` })
  return s
}

export function setDuoSlot(
  state: GameState,
  duoId: string,
  slot: number,
  playerId: string | null,
): GameState {
  const s = clone(state)
  const duo = s.duos.find((t) => t.id === duoId)
  if (!duo) return state
  // A player can only be in one duo at a time.
  if (playerId) {
    for (const t of s.duos) {
      t.playerIds = t.playerIds.map((id) => (id === playerId ? null : id))
    }
  }
  duo.playerIds[slot] = playerId
  // Changing the line-up resets chemistry.
  duo.gamesTogether = 0
  return s
}

export function setDuoStrategy(state: GameState, duoId: string, strategy: Duo['strategy']): GameState {
  const s = clone(state)
  const duo = s.duos.find((t) => t.id === duoId)
  if (!duo) return state
  duo.strategy = strategy
  return s
}

export function renameDuo(state: GameState, duoId: string, name: string): GameState {
  const s = clone(state)
  const duo = s.duos.find((t) => t.id === duoId)
  if (!duo) return state
  duo.name = name
  return s
}

export function addDuo(state: GameState): GameState {
  if (state.duos.length >= BAL.org.duoLimit) return state
  const s = clone(state)
  s.duos.push({
    id: nextId('t'),
    name: `Duo ${s.duos.length + 1}`,
    playerIds: [null, null],
    strategy: 'balanced',
    gamesTogether: 0,
  })
  return s
}

export function removeDuo(state: GameState, duoId: string): GameState {
  if (state.duos.length <= 1) return state
  const s = clone(state)
  s.duos = s.duos.filter((t) => t.id !== duoId)
  for (const key of Object.keys(s.entries)) {
    if (s.entries[key] === duoId) delete s.entries[key]
  }
  return s
}

export function setTraining(state: GameState, playerId: string, programId: string): GameState {
  const s = clone(state)
  const p = s.players[playerId]
  if (!p) return state
  p.trainingProgram = programId
  return s
}

export function setEntry(state: GameState, eventKey: string, duoId: string | null): GameState {
  const s = clone(state)
  if (duoId === null) delete s.entries[eventKey]
  else s.entries[eventKey] = duoId
  return s
}

export function setOrgName(state: GameState, name: string): GameState {
  const s = clone(state)
  s.orgName = name
  for (const id of s.rosterIds) s.players[id].orgName = name
  return s
}

// --- Advancing the week ----------------------------------------------------

export interface WeekReport {
  week: number
  results: TournamentResult[]
  finance: WeeklyFinance
  training: TrainingOutcome[]
  news: string[]
  gameOver: string | null
}

export function advanceWeek(state: GameState): { state: GameState; report: WeekReport } {
  const s = clone(state)
  const rng = new Rng(s.rngState)
  const news: string[] = []
  const results: TournamentResult[] = []

  let prizeTotal = 0
  let repTotal = 0

  // 1) Run every tournament the user entered this week.
  const events = eventsForWeek(s)
  for (const ref of events) {
    const duoId = s.entries[ref.key]
    if (!duoId) continue
    const duo = s.duos.find((t) => t.id === duoId)
    if (!duo) continue
    const players = duo.playerIds
      .map((id) => (id ? s.players[id] : null))
      .filter((p): p is Player => !!p)
    if (players.length < 2) {
      news.push(`${duo.name} could not play ${ref.name} - the duo was incomplete.`)
      continue
    }
    if (ref.locked) continue
    if (ref.entryFee > 0) s.cash -= ref.entryFee

    const result = runTournament(s, ref, duo, players, rng)
    results.push(result)
    s.results.push(result)

    prizeTotal += result.prize
    repTotal += result.reputation
    duo.gamesTogether += ref.matches
    for (const p of players) {
      p.matchesPlayed += ref.matches
      p.careerEarnings += Math.round(result.prize / Math.max(1, players.length))
      if (result.rank === 1) p.careerTitles += 1
    }

    // A bad event follows them into the next one - that is what Tilt
    // Resistance is for. Finishing in the bottom half counts as a disaster.
    const tiltedByResult = result.rank > Math.max(1, ref.fieldSize / 2)
    for (const p of players) p.lastResultWasBad = tiltedByResult

    // LANs and Grand Finals are the ONLY place Big Stage Nerve is earned, and
    // everyone who turned up earns some - the real orgs in the standings too,
    // otherwise your roster hardens while the scene stands still.
    if (ref.isLan) {
      const bandFor = (rank: number): 'good' | 'mid' | 'bad' =>
        rank <= ref.fieldSize / 3 ? 'good' : rank >= (ref.fieldSize * 2) / 3 ? 'bad' : 'mid'
      const myBand = bandFor(result.rank)
      for (const p of players) {
        const line = recordLanAppearance(p, myBand)
        if (line) news.push(line)
      }
      for (const standing of result.rivals) {
        const band = bandFor(standing.rank)
        for (const id of standing.playerIds) {
          const rival = s.players[id]
          if (rival) recordLanAppearance(rival, band)
        }
      }
    }

    // A qualification is spent by playing the stage it unlocked - you have to
    // earn your way back in next season.
    if (ref.stageId) delete s.qualifications[`${ref.eventId}:${ref.stageId}`]

    if (result.advanced && ref.stageId) {
      const qualKey = nextStageQualKey(ref.eventId, ref.stageId)
      if (qualKey) {
        s.qualifications[qualKey] = s.week
        news.push(`${duo.name} QUALIFIED out of the ${ref.name} in ${result.rank}${ordinalSuffix(result.rank)}.`)
      }
    }
    news.push(
      `${ref.name}: ${duo.name} finished ${result.rank}${ordinalSuffix(result.rank)} of ${ref.fieldSize.toLocaleString()} with ${result.points} points` +
        (result.prize > 0 ? ` and won $${result.prize.toLocaleString()}.` : '.'),
    )
  }

  // 2) Training.
  const training: TrainingOutcome[] = []
  const rosterPlayers = s.rosterIds.map((id) => s.players[id]).filter(Boolean)
  for (const duo of s.duos) {
    const members = duo.playerIds
      .map((id) => (id ? s.players[id] : null))
      .filter((p): p is Player => !!p)
    if (members.length === 0) continue
    const coachComms = Math.max(...members.map((p) => p.current.communication))
    for (const p of members) {
      training.push(applyTraining(p, coachComms, rng))
    }
    const chem = duoTrainingChemistry(members)
    duo.gamesTogether += chem.games
  }
  // Players not in any duo still train, just without a comms coach.
  const inDuo = new Set(s.duos.flatMap((t) => t.playerIds.filter(Boolean) as string[]))
  for (const p of rosterPlayers) {
    if (!inDuo.has(p.id)) training.push(applyTraining(p, 0, rng))
  }

  // 3) The books.
  const salaries = rosterPlayers.reduce((a, p) => a + p.salary, 0)
  const overhead = BAL.economy.weeklyOverhead
  const trainingBill = trainingCost(rosterPlayers)
  const sponsors = Math.round(
    BAL.economy.baseSponsorIncomePerWeek +
      s.fans * BAL.economy.sponsorIncomePerFanPerWeek * (1 + s.reputation / 100),
  )
  const net = prizeTotal + sponsors - salaries - overhead - trainingBill
  s.cash += sponsors - salaries - overhead - trainingBill + prizeTotal

  const finance: WeeklyFinance = {
    week: s.week,
    salaries,
    overhead,
    training: trainingBill,
    scouting: 0,
    sponsors,
    prizes: prizeTotal,
    net,
  }
  s.finances.push(finance)
  if (s.finances.length > 60) s.finances.shift()

  // 4) Reputation and fans.
  s.reputation = clamp(
    s.reputation + repTotal - BAL.economy.reputationDecayPerWeek,
    0,
    BAL.economy.reputationMax,
  )
  const targetFans =
    BAL.economy.fansPerReputationPoint *
    Math.pow(Math.max(0, s.reputation), BAL.economy.fanReputationExponent)
  s.fans = Math.round(s.fans + (targetFans - s.fans) * BAL.economy.fanDriftRate)

  // 5) Player progression and contracts.
  for (const p of rosterPlayers) {
    for (const note of progressPlayer(p, rng)) news.push(note)
    p.contractWeeks -= 1
    if (p.contractWeeks <= 0) {
      news.push(`${p.tag}'s contract has expired. Renew it on the Roster screen or they walk.`)
      p.contractWeeks = 0
    }
  }
  for (const id of s.marketIds) {
    const p = s.players[id]
    if (p && p.contractWeeks > 0) p.contractWeeks -= 1
  }

  // 6) Market rotation.
  if (s.week - s.lastMarketRefreshWeek >= BAL.scouting.poolRefreshWeeks) {
    refreshMarketInPlace(s, rng, takenTags(s))
    news.push('The transfer market has moved. New names are available.')
  }

  // 7) Scene flavour.
  if (rng.chance(0.7)) {
    const line = rng.pick(NAMES.storyBeats.lines) as string
    const anyPlayer = rng.pick(Object.values(s.players)) as Player
    news.push(
      line
        .replace('{player}', anyPlayer?.tag ?? 'Someone')
        .replace('{org}', generateOrgName(rng))
        .replace('{region}', getRegion(s.region).name),
    )
  }

  // 8) Bankruptcy watch.
  if (s.cash < 0) {
    s.negativeWeeks += 1
    news.push(
      `WARNING: you are $${Math.abs(Math.round(s.cash)).toLocaleString()} in the red (week ${s.negativeWeeks} of ${BAL.economy.bankruptcyGraceWeeks}).`,
    )
    if (s.negativeWeeks >= BAL.economy.bankruptcyGraceWeeks) {
      s.gameOver = `${s.orgName} folded in week ${s.week}. The money ran out.`
    }
  } else {
    s.negativeWeeks = 0
  }

  // 9) Roll the calendar over.
  s.entries = {}
  s.scoutPoints = BAL.scouting.pointsPerWeek
  s.week += 1
  s.cash = Math.round(s.cash)
  for (const text of news) s.newsLog.push({ week: s.week - 1, text })
  if (s.newsLog.length > 200) s.newsLog = s.newsLog.slice(-200)
  s.rngState = rng.s

  return {
    state: s,
    report: {
      week: s.week - 1,
      results,
      finance,
      training,
      news,
      gameOver: s.gameOver,
    },
  }
}

export function renewContract(state: GameState, playerId: string, weeks: number): GameState {
  const s = clone(state)
  const p = s.players[playerId]
  if (!p) return state
  const rng = new Rng(s.rngState)
  // Players re-price themselves on renewal based on what they are now.
  const ovr = overall(p.current)
  const demand = Math.round(
    p.salary * (1 + Math.max(-0.2, (ovr - 55) / 100)) * (1 + rng.range(0, 0.12)),
  )
  const signingFee = Math.round(demand * weeks * 0.15)
  if (s.cash < signingFee) return state
  s.cash -= signingFee
  p.salary = demand
  p.contractWeeks = weeks
  s.rngState = rng.s
  s.newsLog.push({
    week: s.week,
    text: `${p.tag} re-signs for ${weeks} weeks at $${demand.toLocaleString()}/wk.`,
  })
  return s
}

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

/** Players whose contract has run out and who will leave if not renewed. */
export function expiringContracts(state: GameState): Player[] {
  return state.rosterIds
    .map((id) => state.players[id])
    .filter((p) => p && p.contractWeeks <= 4)
}

export function weeklyBurn(state: GameState): number {
  const roster = state.rosterIds.map((id) => state.players[id]).filter(Boolean)
  return (
    roster.reduce((a, p) => a + p.salary, 0) +
    BAL.economy.weeklyOverhead +
    roster.reduce((a, p) => a + getProgram(p.trainingProgram).costPerWeek, 0)
  )
}
