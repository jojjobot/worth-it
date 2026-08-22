// ---------------------------------------------------------------------------
// Tournament calendar, the rival field, and turning a session into a result.
//
// The user's duo is simulated match by match in sim.ts. The other 200-3000
// duos in the field are modelled statistically (aiField in balance.json) so a
// tournament resolves instantly instead of running 3000 full simulations.
// ---------------------------------------------------------------------------

import {
  BAL,
  TOURN,
  getPrizeDistribution,
  getRegion,
  tierReputationMultiplier,
} from './config'
import { Rng } from './rng'
import { REAL } from './realPlayers'
import { simulateSession, type SessionOptions } from './sim'
import type {
  GameState,
  Player,
  RivalStanding,
  SessionResult,
  TournamentInstanceRef,
  TournamentResult,
  Duo,
} from './types'

interface Schedule {
  everyWeeks: number
  offsetWeek: number
}

function isScheduled(week: number, schedule: Schedule): boolean {
  if (!schedule) return false
  if (week < schedule.offsetWeek) return false
  return (week - schedule.offsetWeek) % schedule.everyWeeks === 0
}

/** Every tournament happening in `week`, in calendar order, with lock reasons. */
export function eventsForWeek(state: GameState): TournamentInstanceRef[] {
  const week = state.week
  const region = getRegion(state.region)
  const out: TournamentInstanceRef[] = []

  for (const ev of TOURN.events as any[]) {
    if (ev.type === 'session') {
      if (!isScheduled(week, ev.schedule)) continue
      const locked = state.reputation < ev.minReputation
      out.push({
        eventId: ev.id,
        key: `w${week}:${ev.id}`,
        name: ev.name,
        tier: ev.tier,
        matches: ev.matches,
        lobbyRating: ev.lobbyRating + region.lobbyModifier,
        fieldSize: ev.fieldSize,
        prizePool: Math.round(ev.prizePool * region.prizeMultiplier),
        prizeDistribution: ev.prizeDistribution,
        scoring: ev.scoring,
        entryFee: ev.entryFee,
        minReputation: ev.minReputation,
        advanceCount: 0,
        locked,
        lockReason: locked ? `Needs ${ev.minReputation} reputation` : '',
      })
    } else if (ev.type === 'series') {
      ev.stages.forEach((stage: any, index: number) => {
        if (!isScheduled(week, stage.schedule)) return
        // Stage 0 is open to everyone; later stages need the qualification.
        const needsQual = index > 0
        const qualKey = `${ev.id}:${stage.id}`
        const qualified = state.qualifications[qualKey] !== undefined
        const locked = needsQual && !qualified
        out.push({
          eventId: ev.id,
          stageId: stage.id,
          key: `w${week}:${ev.id}:${stage.id}`,
          name: stage.name,
          tier: stage.tier,
          matches: stage.matches,
          lobbyRating: stage.lobbyRating + region.lobbyModifier,
          fieldSize: stage.fieldSize,
          prizePool: Math.round(stage.prizePool * region.prizeMultiplier),
          prizeDistribution: stage.prizeDistribution,
          scoring: ev.scoring,
          entryFee: ev.entryFee,
          minReputation: ev.minReputation,
          advanceCount: stage.advanceCount ?? 0,
          locked,
          lockReason: locked
            ? `You did not qualify from the ${ev.stages[index - 1].name}`
            : '',
        })
      })
    }
  }
  return out
}

/** The stage id that qualifying from `stageId` unlocks, if any. */
export function nextStageQualKey(eventId: string, stageId: string): string | null {
  const ev = (TOURN.events as any[]).find((e) => e.id === eventId)
  if (!ev || ev.type !== 'series') return null
  const idx = ev.stages.findIndex((s: any) => s.id === stageId)
  if (idx < 0 || idx + 1 >= ev.stages.length) return null
  return `${eventId}:${ev.stages[idx + 1].id}`
}

// --- The rival field -------------------------------------------------------

/** Total points scored by one modelled rival duo across the session. */
function simulateFieldDuo(rng: Rng, lobbyRating: number, matches: number): number {
  const f = BAL.simulation.aiField
  const strength = rng.gauss(lobbyRating, f.strengthSigma)
  const expected = f.pointsPerMatchBase + (strength - lobbyRating) * f.slopePerRatingPoint
  let total = 0
  for (let i = 0; i < matches; i++) {
    total += Math.max(f.minPointsPerMatch, rng.gauss(expected, f.matchSigma))
  }
  return Math.round(total)
}

/**
 * Roll the whole anonymous field ONCE, sorted best first.
 *
 * Everybody with a name - you and every real org - is then ranked against this
 * same array. Rolling a fresh field per competitor would let a duo with fewer
 * points finish above one with more, which is exactly the kind of nonsense that
 * shows up in a standings table.
 */
export function sampleAnonymousField(
  rng: Rng,
  lobbyRating: number,
  matches: number,
  count: number,
): number[] {
  const out: number[] = []
  for (let i = 0; i < Math.max(0, count); i++) {
    out.push(simulateFieldDuo(rng, lobbyRating, matches))
  }
  return out.sort((a, b) => b - a)
}

/** How many entries of a sorted-descending field beat `points`. Binary search. */
export function countBetter(sortedDesc: number[], points: number): number {
  let lo = 0
  let hi = sortedDesc.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedDesc[mid] > points) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Rank the user's score inside a field of `fieldSize` duos (1 = first). */
export function rankInField(
  rng: Rng,
  myPoints: number,
  lobbyRating: number,
  matches: number,
  fieldSize: number,
): number {
  const field = sampleAnonymousField(rng, lobbyRating, matches, fieldSize - 1)
  return countBetter(field, myPoints) + 1
}

// --- Prize + reputation ----------------------------------------------------

export function prizeForRank(distributionId: string, rank: number, prizePool: number): number {
  if (prizePool <= 0) return 0
  for (const band of getPrizeDistribution(distributionId)) {
    if (rank >= band.from && rank <= band.to) return Math.round(prizePool * band.share)
  }
  return 0
}

export function reputationForResult(
  rank: number,
  fieldSize: number,
  tier: number,
  regionId: string,
): number {
  const rep = BAL.economy.reputationPerTournament
  const pctile = rank / Math.max(1, fieldSize)
  let base: number
  if (rank === 1) base = rep.win
  else if (pctile <= 0.01) base = rep.top1pct
  else if (pctile <= 0.05) base = rep.top5pct
  else if (pctile <= 0.15) base = rep.top15pct
  else if (pctile <= 0.4) base = rep.top40pct
  else base = rep.rest

  const mult = tierReputationMultiplier(tier) * getRegion(regionId).reputationMultiplier
  return Math.round(base * mult * 100) / 100
}

// --- Running one tournament ------------------------------------------------

export function runTournament(
  state: GameState,
  ref: TournamentInstanceRef,
  duo: Duo,
  players: Player[],
  rng: Rng,
): TournamentResult {
  const opts: SessionOptions = {
    matches: ref.matches,
    lobbyRating: ref.lobbyRating,
    scoringId: ref.scoring,
    strategy: duo.strategy,
    gamesTogether: duo.gamesTogether,
  }
  const session: SessionResult = simulateSession(players, opts, rng)

  // The real orgs in your region enter the same event, and they are simulated
  // with the SAME match engine on their real ratings - not modelled
  // statistically like the rest of the field. Finishing above BIG or Falcons
  // means you actually out-scored them.
  const rs = REAL.settings
  const isInternational = ref.tier >= (rs.internationalFromTier ?? 99)
  const realOrgsEnter = ref.tier >= (rs.minTierEntered ?? 0)
  const namedEntries = (realOrgsEnter ? state.rivalDuos : [])
    .filter((d) => isInternational || d.region === state.region)
    .map((d) => {
      const roster = d.playerIds
        .map((id) => state.players[id])
        .filter((p): p is Player => !!p)
      if (roster.length === 0) return null
      const theirs = simulateSession(
        roster,
        {
          matches: ref.matches,
          lobbyRating: ref.lobbyRating,
          scoringId: ref.scoring,
          strategy: d.strategy,
          gamesTogether: d.gamesTogether,
        },
        rng,
      )
      return {
        orgName: d.orgName,
        playerTags: roster.map((p) => p.tag),
        points: theirs.totalPoints,
      }
    })
    .filter((r): r is { orgName: string; playerTags: string[]; points: number } => !!r)

  // One shared anonymous field for the whole event, so every placement in the
  // standings is consistent with every other one.
  const anonymous = sampleAnonymousField(
    rng,
    ref.lobbyRating,
    ref.matches,
    ref.fieldSize - 1 - namedEntries.length,
  )
  const named = [
    ...namedEntries.map((r) => ({ ...r, isYou: false })),
    {
      orgName: state.orgName,
      playerTags: players.map((p) => p.tag),
      points: session.totalPoints,
      isYou: true,
    },
  ]
  const rankOf = (points: number, self: number): number => {
    const namedAbove = named.filter((o, i) => i !== self && o.points > points).length
    return countBetter(anonymous, points) + namedAbove + 1
  }

  const rank = rankOf(session.totalPoints, named.length - 1)
  const rivals: RivalStanding[] = namedEntries
    .map((r, i) => ({ ...r, rank: rankOf(r.points, i) }))
    .sort((a, b) => a.rank - b.rank)

  const prize = prizeForRank(ref.prizeDistribution, rank, ref.prizePool)
  const reputation = reputationForResult(rank, ref.fieldSize, ref.tier, state.region)
  const advanced = ref.advanceCount > 0 && rank <= ref.advanceCount

  return {
    week: state.week,
    key: ref.key,
    name: ref.name,
    tier: ref.tier,
    region: state.region,
    duoId: duo.id,
    duoName: duo.name,
    playerTags: players.map((p) => p.tag),
    points: session.totalPoints,
    rank,
    fieldSize: ref.fieldSize,
    prize,
    reputation,
    advanced,
    session,
    rivals,
  }
}
