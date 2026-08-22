// ---------------------------------------------------------------------------
// THE SEASON CALENDAR - the home screen.
//
// The whole FNCS cycle laid out week by week: which cups run when, which ones
// your duos are entered in, and how the weeks you have already played went.
// Entering an event happens right here on the week you are standing on, so the
// calendar is the only place you need to be between matches.
// ---------------------------------------------------------------------------

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { setEntry } from '../engine/game'
import { duoStrength } from '../engine/sim'
import {
  eventsForWeek,
  seasonLength,
  seasonOf,
  seasonStartWeek,
} from '../engine/tournament'
import type {
  GameState,
  Player,
  TournamentInstanceRef,
  TournamentResult,
} from '../engine/types'
import { money, ordinal, ratingColor } from './components'
import { PlayerLink } from './PlayerSheet'

/** Tier -> colour + short name. Tier 5 is the Grand Finals. */
const TIER: Record<number, { color: string; short: string }> = {
  1: { color: '#55607a', short: 'T1' },
  2: { color: '#37e08b', short: 'T2' },
  3: { color: '#35e0ff', short: 'T3' },
  4: { color: '#ffb020', short: 'T4' },
  5: { color: '#ff4d63', short: 'LAN' },
}

function tierOf(t: number) {
  return TIER[t] ?? TIER[1]
}

export default function Season({
  state,
  setState,
  onAdvance,
  flash,
}: {
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  onAdvance: () => void
  flash: (msg: string) => void
}) {
  const len = seasonLength()
  const here = seasonOf(state.week)
  const [season, setSeason] = useState(here.season)
  const [focusWeek, setFocusWeek] = useState<number>(state.week)

  // Advancing the week moves the calendar with you. Without this the view
  // stays parked on whatever week you were looking at, which reads as broken
  // the moment you hit Advance.
  const lastWeek = useRef(state.week)
  useEffect(() => {
    if (lastWeek.current !== state.week) {
      lastWeek.current = state.week
      setFocusWeek(state.week)
      setSeason(seasonOf(state.week).season)
    }
  }, [state.week])

  const startWeek = seasonStartWeek(season)
  const weeks = useMemo(
    () => Array.from({ length: len }, (_, i) => startWeek + i),
    [startWeek, len],
  )

  const resultsByWeek = useMemo(() => {
    const m = new Map<number, TournamentResult[]>()
    for (const r of state.results) {
      if (!m.has(r.week)) m.set(r.week, [])
      m.get(r.week)!.push(r)
    }
    return m
  }, [state.results])

  const focusEvents = eventsForWeek(state, focusWeek)
  const focusResults = resultsByWeek.get(focusWeek) ?? []
  const isNow = focusWeek === state.week
  const isPast = focusWeek < state.week

  const entriesThisWeek = Object.keys(state.entries).length
  const nextBig = useMemo(() => {
    for (let w = state.week; w < state.week + len * 2; w++) {
      const big = eventsForWeek(state, w).find((e) => e.tier >= 4)
      if (big) return { week: w, ev: big }
    }
    return null
  }, [state, len])

  return (
    <div className="space-y-4">
      {/* ---------- Season header ---------- */}
      <section className="panel cut relative overflow-hidden p-5">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-[0.07]"
          style={{
            background:
              'repeating-linear-gradient(115deg, var(--accent) 0 2px, transparent 2px 12px)',
          }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label">Competitive calendar</div>
            <h1 className="hud-huge mt-1">
              Season {season}
              <span className="ml-3 text-[var(--accent)]">
                W{seasonOf(focusWeek).weekInSeason}
                <span className="text-[var(--text-faint)]">/{len}</span>
              </span>
            </h1>
            <p className="mt-2 max-w-lg text-[12px] text-[var(--text-dim)]">
              Every cup in the cycle, and the ones your duos are entered in. Click a week to work
              on it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn"
              disabled={season <= 1}
              onClick={() => setSeason((s) => Math.max(1, s - 1))}
            >
              ‹ Prev
            </button>
            <button className="btn" onClick={() => { setSeason(here.season); setFocusWeek(state.week) }}>
              Today
            </button>
            <button className="btn" onClick={() => setSeason((s) => s + 1)}>
              Next ›
            </button>
            <button
              className="btn-primary ml-2"
              disabled={!!state.gameOver}
              onClick={onAdvance}
              title="Runs every event you entered, applies training, and pays the bills"
            >
              Advance week {entriesThisWeek > 0 ? `· ${entriesThisWeek} entered` : ''} →
            </button>
          </div>
        </div>

        {nextBig && (
          <div className="relative mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3 text-[12px]">
            <span className="label">Next major</span>
            <span
              className="chip"
              style={{
                background: `${tierOf(nextBig.ev.tier).color}22`,
                color: tierOf(nextBig.ev.tier).color,
                border: `1px solid ${tierOf(nextBig.ev.tier).color}66`,
              }}
            >
              <span>{tierOf(nextBig.ev.tier).short}</span>
            </span>
            <span className="font-bold">{nextBig.ev.name}</span>
            <span className="text-[var(--text-dim)]">
              {nextBig.week === state.week
                ? 'this week'
                : `in ${nextBig.week - state.week} week${nextBig.week - state.week === 1 ? '' : 's'}`}
            </span>
            <span className="k-num text-[var(--accent-warm)]">{money(nextBig.ev.prizePool)}</span>
          </div>
        )}
      </section>

      {/* ---------- The week strip ---------- */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {weeks.map((w) => (
          <WeekCard
            key={w}
            week={w}
            state={state}
            results={resultsByWeek.get(w) ?? []}
            selected={w === focusWeek}
            onSelect={() => setFocusWeek(w)}
          />
        ))}
      </div>

      {/* ---------- The focused week ---------- */}
      <section className="panel p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-2">
          <h2 className="hud-title rule-accent">
            Week {focusWeek}
            <span className="ml-2 text-[var(--text-faint)]">
              {isNow ? '· current' : isPast ? '· played' : '· upcoming'}
            </span>
          </h2>
          {!isNow && !isPast && (
            <span className="text-[11px] text-[var(--text-dim)]">
              You can only enter events on the current week.
            </span>
          )}
        </header>

        {focusEvents.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--text-faint)]">
            Nothing runs this week. A quiet one — train, scout, or rest the roster.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {focusEvents.map((ev) => (
              <EventCard
                key={ev.key}
                ev={ev}
                state={state}
                setState={setState}
                flash={flash}
                canEnter={isNow}
                result={focusResults.find((r) => r.key === ev.key) ?? null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// --- One week in the strip -------------------------------------------------

function WeekCard({
  week,
  state,
  results,
  selected,
  onSelect,
}: {
  week: number
  state: GameState
  results: TournamentResult[]
  selected: boolean
  onSelect: () => void
}) {
  const events = eventsForWeek(state, week)
  const isNow = week === state.week
  const isPast = week < state.week
  const enteredCount = events.filter((e) => state.entries[e.key]).length
  const best = results.length > 0 ? Math.min(...results.map((r) => r.rank)) : null
  const won = results.reduce((a, r) => a + r.prize, 0)

  return (
    <button
      onClick={onSelect}
      className={`panel relative p-2.5 text-left transition ${
        selected ? 'border-[var(--accent)]' : 'hover:border-[var(--line-bright)]'
      } ${isPast && !selected ? 'opacity-70' : ''}`}
    >
      {isNow && (
        <span className="absolute right-0 top-0 h-full w-[3px] bg-[var(--accent)]" aria-hidden />
      )}
      <div className="flex items-baseline justify-between">
        <span className={`k-num text-lg ${isNow ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
          W{week}
        </span>
        {isNow && <span className="label text-[var(--accent)]">Now</span>}
        {isPast && best !== null && (
          <span className="label" style={{ color: best <= 3 ? 'var(--accent-warm)' : undefined }}>
            best {ordinal(best)}
          </span>
        )}
      </div>

      <div className="mt-2 space-y-1">
        {events.length === 0 && (
          <span className="text-[10px] italic text-[var(--text-faint)]">no events</span>
        )}
        {events.map((e) => {
          const t = tierOf(e.tier)
          const entered = !!state.entries[e.key]
          const played = results.some((r) => r.key === e.key)
          return (
            <div key={e.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0"
                style={{
                  background: e.locked ? 'transparent' : t.color,
                  border: `1px solid ${t.color}`,
                  transform: 'skewX(-12deg)',
                }}
              />
              <span
                className={`truncate text-[10px] ${
                  e.locked
                    ? 'text-[var(--text-faint)] line-through'
                    : entered || played
                      ? 'text-[var(--text)]'
                      : 'text-[var(--text-dim)]'
                }`}
              >
                {e.name}
              </span>
              {entered && !played && (
                <span className="ml-auto text-[9px] font-bold text-[var(--accent)]">IN</span>
              )}
              {played && <span className="ml-auto text-[9px] text-[var(--good)]">✓</span>}
            </div>
          )
        })}
      </div>

      {isPast && won > 0 && (
        <div className="mt-2 border-t border-[var(--line)] pt-1.5">
          <span className="k-num text-[11px] text-[var(--accent-warm)]">+{money(won)}</span>
        </div>
      )}
      {!isPast && enteredCount > 0 && (
        <div className="mt-2 border-t border-[var(--line)] pt-1.5">
          <span className="text-[10px] font-bold text-[var(--accent)]">
            {enteredCount} entered
          </span>
        </div>
      )}
    </button>
  )
}

// --- One event, with entry ---------------------------------------------------

function EventCard({
  ev,
  state,
  setState,
  flash,
  canEnter,
  result,
}: {
  ev: TournamentInstanceRef
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  flash: (msg: string) => void
  canEnter: boolean
  result: TournamentResult | null
}) {
  const t = tierOf(ev.tier)
  const entryDuoId = state.entries[ev.key]
  const completeDuos = state.duos.filter((d) => d.playerIds.filter(Boolean).length === 2)
  const usedElsewhere = new Set(
    Object.entries(state.entries)
      .filter(([k]) => k !== ev.key)
      .map(([, v]) => v),
  )

  return (
    <div
      className={`panel-raised cut relative p-3.5 ${ev.locked ? 'opacity-60' : ''}`}
      style={entryDuoId && !result ? { borderColor: 'var(--accent)' } : undefined}
    >
      <span
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: t.color }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="chip"
              style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}66` }}
            >
              <span>{t.short}</span>
            </span>
            <h3 className="truncate text-[15px] font-extrabold uppercase tracking-wide">
              {ev.name}
            </h3>
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-dim)]">
            {ev.matches} matches · field {ev.fieldSize.toLocaleString()} · lobby{' '}
            <span className={`k-num ${ratingColor(ev.lobbyRating)}`}>{ev.lobbyRating}</span>
            {ev.advanceCount > 0 && ` · top ${ev.advanceCount} advance`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="k-num text-[15px] text-[var(--accent-warm)]">{money(ev.prizePool)}</div>
          <div className="label">prize pool</div>
        </div>
      </div>

      {/* Already played this one */}
      {result && (
        <div className="mt-3 border-t border-[var(--line)] pt-2.5 pl-2">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span>
              <span className="label mr-1.5">Finish</span>
              <span
                className={`k-num text-lg ${result.rank <= 3 ? 'text-[var(--accent-warm)]' : ''}`}
              >
                {ordinal(result.rank)}
              </span>
              <span className="text-[11px] text-[var(--text-faint)]">
                /{result.fieldSize.toLocaleString()}
              </span>
            </span>
            <span>
              <span className="label mr-1.5">Points</span>
              <span className="k-num">{result.points}</span>
            </span>
            <span>
              <span className="label mr-1.5">Prize</span>
              <span className="k-num text-[var(--good)]">
                {result.prize > 0 ? money(result.prize) : '—'}
              </span>
            </span>
            {result.advanced && (
              <span className="chip border border-[var(--good)] bg-[var(--good)]/10 text-[var(--good)]">
                <span>Qualified</span>
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-dim)]">
            {result.playerTags.map((tag, i) => (
              <span key={tag + i} className="flex items-center gap-1">
                {i > 0 && <span className="text-[var(--text-faint)]">+</span>}
                {result.playerIds?.[i] ? (
                  <PlayerLink playerId={result.playerIds[i]} className="text-[var(--text-dim)]">
                    {tag}
                  </PlayerLink>
                ) : (
                  tag
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Entry */}
      {!result && (
        <div className="mt-3 border-t border-[var(--line)] pt-2.5 pl-2">
          {ev.locked ? (
            <p className="text-[11px] text-[var(--bad)]">{ev.lockReason}</p>
          ) : !canEnter ? (
            <p className="text-[11px] text-[var(--text-faint)]">
              Opens when the calendar reaches this week.
            </p>
          ) : completeDuos.length === 0 ? (
            <p className="text-[11px] text-[var(--text-faint)]">
              You need a duo with both slots filled.
            </p>
          ) : (
            <>
              <div className="label mb-1.5">Enter a duo</div>
              <div className="space-y-1.5">
                {completeDuos.map((d) => {
                  const players = d.playerIds
                    .map((id) => (id ? state.players[id] : null))
                    .filter((p): p is Player => !!p)
                  const strength = duoStrength(players, d.gamesTogether)
                  const blocked = usedElsewhere.has(d.id)
                  const selected = entryDuoId === d.id
                  const edge = strength - ev.lobbyRating
                  return (
                    <button
                      key={d.id}
                      disabled={blocked}
                      title={blocked ? 'Already entered in another event this week' : ''}
                      onClick={() =>
                        setState((s) => (s ? setEntry(s, ev.key, selected ? null : d.id) : s))
                      }
                      className={`flex w-full items-center justify-between border px-2.5 py-1.5 text-left text-[12px] transition disabled:opacity-35 ${
                        selected
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                          : 'border-[var(--line-bright)] hover:border-[var(--accent-dim)]'
                      }`}
                      style={{ borderRadius: 2 }}
                    >
                      <span className="font-bold uppercase tracking-wide">
                        {d.name}
                        <span className="ml-2 text-[10px] font-normal normal-case text-[var(--text-faint)]">
                          {d.strategy} · {players.map((p) => p.tag).join(' + ')}
                        </span>
                      </span>
                      <span className="k-num shrink-0 text-[11px]">
                        <span className={ratingColor(strength)}>{strength.toFixed(1)}</span>
                        <span className={edge >= 0 ? ' text-[var(--good)]' : ' text-[var(--bad)]'}>
                          {' '}
                          {edge >= 0 ? '+' : ''}
                          {edge.toFixed(1)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {entryDuoId && (
                <button
                  className="btn mt-2 w-full"
                  onClick={() => {
                    setState((s) => (s ? setEntry(s, ev.key, null) : s))
                    flash('Entry withdrawn.')
                  }}
                >
                  Withdraw
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
