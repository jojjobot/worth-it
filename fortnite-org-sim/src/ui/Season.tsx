// ---------------------------------------------------------------------------
// THE SEASON CALENDAR - the home screen.
//
// A square per day, laid out Mon-Sun across eight rows, one row per week of the
// FNCS cycle. Cups sit on the day they are actually played (tournaments.json ->
// calendar + each event's dayOfWeek). Click a day to work on it.
//
// The simulation still advances a WEEK at a time - the day grid is how the
// schedule is presented, not a change to how the engine ticks.
// ---------------------------------------------------------------------------

import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getProgram } from '../engine/config'
import { setEntry } from '../engine/game'
import { duoStrength } from '../engine/sim'
import {
  DAYS_PER_WEEK,
  dateForDay,
  dayNames,
  eventsForWeek,
  monthName,
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
  1: { color: '#6b7793', short: 'T1' },
  2: { color: '#37e08b', short: 'T2' },
  3: { color: '#35e0ff', short: 'T3' },
  4: { color: '#ffb020', short: 'T4' },
  5: { color: '#ff4d63', short: 'LAN' },
}
const tierOf = (t: number) => TIER[t] ?? TIER[1]

interface DayCell {
  week: number
  dow: number
  date: Date
  events: TournamentInstanceRef[]
  results: TournamentResult[]
  isPast: boolean
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
  const names = dayNames()
  const [season, setSeason] = useState(here.season)
  const [selected, setSelected] = useState<{ week: number; dow: number } | null>(null)

  /**
   * Where the calendar should point when you arrive or after advancing: the
   * next cup of the current week you have not played yet, or failing that the
   * first day of the week. Landing on "nothing selected" made the screen feel
   * inert.
   */
  const defaultDay = useMemo(() => {
    const evs = eventsForWeek(state, state.week)
      .filter((e) => !e.locked)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    const played = new Set(state.results.filter((r) => r.week === state.week).map((r) => r.key))
    const next = evs.find((e) => !played.has(e.key)) ?? evs[0]
    return { week: state.week, dow: next ? next.dayOfWeek : 0 }
  }, [state])


  // Advancing moves the calendar with you; without this it stays parked on
  // whatever you were looking at and reads as broken.
  const lastWeek = useRef(state.week)
  useEffect(() => {
    if (lastWeek.current !== state.week) {
      lastWeek.current = state.week
      setSeason(seasonOf(state.week).season)
      setSelected(null)
    }
  }, [state.week])

  const resultsByKey = useMemo(() => {
    const m = new Map<string, TournamentResult[]>()
    for (const r of state.results) {
      if (!m.has(r.key)) m.set(r.key, [])
      m.get(r.key)!.push(r)
    }
    return m
  }, [state.results])

  const startWeek = seasonStartWeek(season)

  // Build the whole grid: one row per week, DAYS_PER_WEEK squares per row.
  const rows: DayCell[][] = useMemo(() => {
    return Array.from({ length: len }, (_, wi) => {
      const week = startWeek + wi
      const weekEvents = eventsForWeek(state, week)
      return Array.from({ length: DAYS_PER_WEEK }, (_, dow) => {
        const events = weekEvents.filter((e) => e.dayOfWeek === dow)
        return {
          week,
          dow,
          date: dateForDay(week, dow),
          events,
          results: events.flatMap((e) => resultsByKey.get(e.key) ?? []),
          isPast: week < state.week,
        }
      })
    })
  }, [state, startWeek, len, resultsByKey])

  // Anyone actually training this week? Drives the faint practice marker.
  const practising = useMemo(
    () =>
      state.rosterIds.some((id) => {
        const p = state.players[id]
        return p && getProgram(p.trainingProgram).id !== 'rest'
      }),
    [state.rosterIds, state.players],
  )

  const firstDate = rows[0]?.[0]?.date
  const lastDate = rows[len - 1]?.[DAYS_PER_WEEK - 1]?.date
  const monthLabel =
    firstDate && lastDate
      ? firstDate.getMonth() === lastDate.getMonth()
        ? `${monthName(firstDate)} ${firstDate.getFullYear()}`
        : `${monthName(firstDate)} – ${monthName(lastDate)} ${lastDate.getFullYear()}`
      : ''

  const active = selected ?? defaultDay
  const sel = rows[active.week - startWeek]
    ? rows[active.week - startWeek][active.dow]
    : null

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
            <div className="label">{monthLabel}</div>
            <h1 className="hud-huge mt-1">
              Season {season}
              <span className="ml-3 text-[var(--accent)]">
                W{here.season === season ? here.weekInSeason : 1}
                <span className="text-[var(--text-faint)]">/{len}</span>
              </span>
            </h1>
            <p className="mt-2 max-w-lg text-[12px] text-[var(--text-dim)]">
              Every day of the cycle. Click a day with a cup on it to enter a duo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn" disabled={season <= 1} onClick={() => setSeason((s) => Math.max(1, s - 1))}>
              ‹ Prev
            </button>
            <button
              className="btn"
              onClick={() => {
                setSeason(here.season)
                setSelected(null)
              }}
            >
              Today
            </button>
            <button className="btn" onClick={() => setSeason((s) => s + 1)}>
              Next ›
            </button>
            <button
              className="btn-primary ml-2"
              disabled={!!state.gameOver}
              onClick={onAdvance}
              title="Plays every event you entered this week, applies training, and pays the bills"
            >
              Advance week {entriesThisWeek > 0 ? `· ${entriesThisWeek} entered` : ''} →
            </button>
          </div>
        </div>

        {nextBig && (
          <div className="relative mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3 text-[12px]">
            <span className="label">Next major</span>
            <TierChip tier={nextBig.ev.tier} />
            <span className="font-bold">{nextBig.ev.name}</span>
            <span className="text-[var(--text-dim)]">
              {nextBig.week === state.week
                ? 'this week'
                : `in ${nextBig.week - state.week} week${nextBig.week - state.week === 1 ? '' : 's'}`}
              {' · '}
              {names[nextBig.ev.dayOfWeek]}{' '}
              {dateForDay(nextBig.week, nextBig.ev.dayOfWeek).getDate()}
            </span>
            <span className="k-num text-[var(--accent-warm)]">{money(nextBig.ev.prizePool)}</span>
          </div>
        )}
      </section>

      {/* ---------- The day grid ---------- */}
      <section className="panel overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-[var(--line)] bg-[var(--panel-2)]">
          <div className="px-2 py-1.5" />
          {names.map((n) => (
            <div key={n} className="px-2 py-1.5 text-center">
              <span className="label">{n}</span>
            </div>
          ))}
        </div>

        {rows.map((row) => {
          const isCurrentWeek = row[0].week === state.week
          return (
            <div
              key={row[0].week}
              className="grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))] border-b border-[var(--line)] last:border-0"
            >
              {/* Week gutter */}
              <div
                className={`flex flex-col items-center justify-center border-r border-[var(--line)] px-1 py-2 ${
                  isCurrentWeek ? 'bg-[var(--accent)]/10' : 'bg-[var(--panel-2)]/40'
                }`}
              >
                <span
                  className={`k-num text-[13px] ${
                    isCurrentWeek ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'
                  }`}
                >
                  W{row[0].week}
                </span>
                {isCurrentWeek && <span className="label text-[var(--accent)]">now</span>}
              </div>

              {row.map((cell) => (
                <DaySquare
                  key={cell.dow}
                  cell={cell}
                  state={state}
                  practising={practising}
                  selected={active.week === cell.week && active.dow === cell.dow}
                  onSelect={() => setSelected({ week: cell.week, dow: cell.dow })}
                />
              ))}
            </div>
          )
        })}
      </section>

      {/* ---------- Legend ---------- */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {[1, 2, 3, 4, 5].map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <TierChip tier={t} />
            <span className="text-[11px] text-[var(--text-dim)]">
              {t === 5 ? 'Grand Finals · LAN' : `Tier ${t}`}
            </span>
          </span>
        ))}
        <span className="ml-auto text-[11px] text-[var(--text-faint)]">
          A struck-through cup is one you cannot enter yet.
        </span>
      </div>

      {/* ---------- The selected day ---------- */}
      <DayDetail
        cell={sel}
        state={state}
        setState={setState}
        flash={flash}
        resultsByKey={resultsByKey}
      />
    </div>
  )
}

function TierChip({ tier }: { tier: number }) {
  const t = tierOf(tier)
  return (
    <span
      className="chip"
      style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}66` }}
    >
      <span>{t.short}</span>
    </span>
  )
}

// --- One day square --------------------------------------------------------

function DaySquare({
  cell,
  state,
  practising,
  selected,
  onSelect,
}: {
  cell: DayCell
  state: GameState
  practising: boolean
  selected: boolean
  onSelect: () => void
}) {
  const { events, results, isPast, date } = cell
  const isCurrentWeek = cell.week === state.week
  const enteredHere = events.filter((e) => state.entries[e.key])
  const prize = results.reduce((a, r) => a + r.prize, 0)
  const firstOfMonth = date.getDate() === 1

  return (
    <button
      onClick={onSelect}
      className={`relative flex min-h-[5.5rem] flex-col gap-1 border-r border-[var(--line)] p-1.5 text-left align-top transition last:border-r-0 ${
        selected
          ? 'bg-[var(--accent)]/[0.16]'
          : isCurrentWeek
            ? 'bg-[var(--accent)]/[0.05] hover:bg-[var(--accent)]/[0.1]'
            : 'hover:bg-white/[0.03]'
      } ${isPast ? 'opacity-55' : ''}`}
    >
      {selected && (
        <span className="pointer-events-none absolute inset-0 border border-[var(--accent)]" aria-hidden />
      )}

      <div className="flex items-baseline justify-between">
        <span
          className={`k-num text-[12px] ${
            firstOfMonth ? 'text-[var(--accent-warm)]' : 'text-[var(--text-faint)]'
          }`}
        >
          {firstOfMonth ? `${monthName(date).slice(0, 3)} ${date.getDate()}` : date.getDate()}
        </span>
        {prize > 0 && (
          <span className="k-num text-[9px] text-[var(--accent-warm)]">+{money(prize)}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {events.map((e) => {
          const t = tierOf(e.tier)
          const entered = !!state.entries[e.key]
          const played = results.some((r) => r.key === e.key)
          const res = results.find((r) => r.key === e.key)
          return (
            <div
              key={e.key}
              className="border-l-2 px-1 py-[2px] leading-tight"
              style={{
                borderColor: t.color,
                background: entered && !played ? `${t.color}1f` : 'rgba(255,255,255,0.03)',
              }}
            >
              <div
                className={`truncate text-[9.5px] font-bold uppercase tracking-wide ${
                  e.locked ? 'text-[var(--text-faint)] line-through' : ''
                }`}
                style={{ color: e.locked ? undefined : t.color }}
                title={e.name}
              >
                {e.name}
              </div>
              {played && res ? (
                <div className="k-num text-[9px] text-[var(--text-dim)]">{ordinal(res.rank)}</div>
              ) : entered ? (
                <div className="text-[9px] font-bold text-[var(--accent)]">ENTERED</div>
              ) : null}
            </div>
          )
        })}

        {events.length === 0 && (
          <span className="mt-auto text-[9px] uppercase tracking-wider text-[var(--text-faint)]/60">
            {practising && !isPast ? 'Practice' : ''}
          </span>
        )}
      </div>

      {enteredHere.length > 0 && !isPast && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden />
      )}
    </button>
  )
}

// --- The panel under the grid ----------------------------------------------

function DayDetail({
  cell,
  state,
  setState,
  flash,
  resultsByKey,
}: {
  cell: DayCell | null
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  flash: (msg: string) => void
  resultsByKey: Map<string, TournamentResult[]>
}) {
  const names = dayNames()

  if (!cell) {
    return (
      <section className="panel p-6 text-center">
        <p className="text-[13px] text-[var(--text-faint)]">
          Pick a day above to see what is on.
        </p>
      </section>
    )
  }

  const isNow = cell.week === state.week
  const label = `${names[cell.dow]} ${cell.date.getDate()} ${monthName(cell.date)}`

  return (
    <section className="panel p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] pb-2">
        <h2 className="hud-title rule-accent">
          {label}
          <span className="ml-2 text-[var(--text-faint)]">
            · Week {cell.week}
            {isNow ? ' · current' : cell.isPast ? ' · played' : ' · upcoming'}
          </span>
        </h2>
        {!isNow && !cell.isPast && (
          <span className="text-[11px] text-[var(--text-dim)]">
            Entries open when the calendar reaches this week.
          </span>
        )}
      </header>

      {cell.events.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[var(--text-faint)]">
          No cup on this day. A rest or practice day — good time to train, scout, or shuffle a duo.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {cell.events.map((ev) => (
            <EventCard
              key={ev.key}
              ev={ev}
              state={state}
              setState={setState}
              flash={flash}
              canEnter={isNow}
              result={(resultsByKey.get(ev.key) ?? [])[0] ?? null}
            />
          ))}
        </div>
      )}
    </section>
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
      <span className="absolute left-0 top-0 h-full w-[3px]" style={{ background: t.color }} aria-hidden />

      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TierChip tier={ev.tier} />
            <h3 className="truncate text-[15px] font-extrabold uppercase tracking-wide">{ev.name}</h3>
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

      {result && (
        <div className="mt-3 border-t border-[var(--line)] pl-2 pt-2.5">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span>
              <span className="label mr-1.5">Finish</span>
              <span className={`k-num text-lg ${result.rank <= 3 ? 'text-[var(--accent-warm)]' : ''}`}>
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

      {!result && (
        <div className="mt-3 border-t border-[var(--line)] pl-2 pt-2.5">
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
