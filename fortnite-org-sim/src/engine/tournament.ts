// ---------------------------------------------------------------------------
// Tournament calendar, the rival field, and turning a session into a result.
//
// The user's trio is simulated match by match in sim.ts. The other 200-3000
// trios in the field are modelled statistically (aiField in balance.json) so a
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
import { simulateSession, type SessionOptions } from './sim'
import type {
  GameState,
  Player,
  SessionResult,
  TournamentInstanceRef,
  TournamentResult,
  Trio,
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

/** Total points scored by one modelled rival trio across the session. */
function simulateFieldTrio(rng: Rng, lobbyRating: number, matches: number): number {
  const f = BAL.simulation.aiField
  const strength = rng.gauss(lobbyRating, f.strengthSigma)
  const expected = f.pointsPerMatchBase + (strength - lobbyRating) * f.slopePerRatingPoint
  let total = 0
  for (let i = 0; i < matches; i++) {
    total += Math.max(f.minPointsPerMatch, rng.gauss(expected, f.matchSigma))
  }
  return Math.round(total)
}

/** Rank the user's score inside a field of `fieldSize` trios (1 = first). */
export function rankInField(
  rng: Rng,
  myPoints: number,
  lobbyRating: number,
  matches: number,
  fieldSize: number,
): number {
  let better = 0
  for (let i = 0; i < fieldSize - 1; i++) {
    if (simulateFieldTrio(rng, lobbyRating, matches) > myPoints) better++
  }
  return better + 1
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
  trio: Trio,
  players: Player[],
  rng: Rng,
): TournamentResult {
  const opts: SessionOptions = {
    matches: ref.matches,
    lobbyRating: ref.lobbyRating,
    scoringId: ref.scoring,
    strategy: trio.strategy,
    gamesTogether: trio.gamesTogether,
  }
  const session: SessionResult = simulateSession(players, opts, rng)
  const rank = rankInField(rng, session.totalPoints, ref.lobbyRating, ref.matches, ref.fieldSize)
  const prize = prizeForRank(ref.prizeDistribution, rank, ref.prizePool)
  const reputation = reputationForResult(rank, ref.fieldSize, ref.tier, state.region)
  const advanced = ref.advanceCount > 0 && rank <= ref.advanceCount

  return {
    week: state.week,
    key: ref.key,
    name: ref.name,
    tier: ref.tier,
    region: state.region,
    trioId: trio.id,
    trioName: trio.name,
    playerTags: players.map((p) => p.tag),
    points: session.totalPoints,
    rank,
    fieldSize: ref.fieldSize,
    prize,
    reputation,
    advanced,
    session,
  }
}
