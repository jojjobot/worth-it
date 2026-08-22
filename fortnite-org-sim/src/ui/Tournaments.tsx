import type { Dispatch, SetStateAction } from 'react'
import { TOURN, getScoring } from '../engine/config'
import { setEntry } from '../engine/game'
import { trioStrength } from '../engine/sim'
import type { GameState, Player } from '../engine/types'
import { EmptyState, money, Panel, ratingColor } from './components'
import { eventsForWeek } from '../engine/tournament'

export default function Tournaments({
  state,
  setState,
  flash,
}: {
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  flash: (msg: string) => void
}) {
  const events = eventsForWeek(state)
  const completeTrios = state.trios.filter(
    (t) => t.playerIds.filter(Boolean).length === 3,
  )

  return (
    <div className="space-y-4">
      <Panel title={`Week ${state.week} — tournaments`}>
        <p className="text-[12px] text-slate-400">
          Pick a trio for each event, then hit <span className="text-cyan-300">Advance week</span>.
          Each event is one full session of matches simulated phase by phase. A trio can only play
          one event per week.
        </p>
      </Panel>

      {events.length === 0 ? (
        <EmptyState>Nothing is running this week. Advance to move the calendar on.</EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {events.map((ev) => {
            const entryTrioId = state.entries[ev.key]
            const usedElsewhere = new Set(
              Object.entries(state.entries)
                .filter(([k]) => k !== ev.key)
                .map(([, v]) => v),
            )
            return (
              <div
                key={ev.key}
                className={`panel p-4 ${ev.locked ? 'opacity-60' : ''} ${
                  entryTrioId ? 'border-cyan-700/60' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-100">{ev.name}</h3>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                      Tier {ev.tier} · {ev.matches} matches · field{' '}
                      {ev.fieldSize.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-emerald-300">{money(ev.prizePool)}</div>
                    <div className="label">prize pool</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                    <div className="label">Lobby rating</div>
                    <div className={`font-mono ${ratingColor(ev.lobbyRating)}`}>
                      {ev.lobbyRating}
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                    <div className="label">Advances</div>
                    <div className="font-mono text-slate-300">
                      {ev.advanceCount > 0 ? `top ${ev.advanceCount}` : '—'}
                    </div>
                  </div>
                </div>

                {ev.locked ? (
                  <p className="mt-3 text-xs text-rose-400">{ev.lockReason}</p>
                ) : (
                  <div className="mt-3">
                    <div className="label mb-1">Enter a trio</div>
                    <div className="space-y-1.5">
                      {completeTrios.length === 0 && (
                        <p className="text-xs text-slate-500">
                          You need a trio with all three slots filled.
                        </p>
                      )}
                      {completeTrios.map((t) => {
                        const players = t.playerIds
                          .map((id) => (id ? state.players[id] : null))
                          .filter((p): p is Player => !!p)
                        const strength = trioStrength(players, t.gamesTogether)
                        const blocked = usedElsewhere.has(t.id)
                        const selected = entryTrioId === t.id
                        const edge = strength - ev.lobbyRating
                        return (
                          <button
                            key={t.id}
                            disabled={blocked}
                            onClick={() =>
                              setState((s) =>
                                s ? setEntry(s, ev.key, selected ? null : t.id) : s,
                              )
                            }
                            className={`flex w-full items-center justify-between rounded border px-2.5 py-2 text-left text-sm transition disabled:opacity-40 ${
                              selected
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-100'
                                : 'border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            <span>
                              {t.name}
                              <span className="ml-2 font-mono text-[11px] text-slate-500">
                                {t.strategy}
                              </span>
                            </span>
                            <span className="font-mono text-xs">
                              <span className={ratingColor(strength)}>{strength.toFixed(1)}</span>
                              <span
                                className={
                                  edge >= 0 ? ' text-emerald-400' : ' text-rose-400'
                                }
                              >
                                {' '}
                                ({edge >= 0 ? '+' : ''}
                                {edge.toFixed(1)})
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    {entryTrioId && (
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
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ScoringReference />
      <CalendarReference />
    </div>
  )
}

function ScoringReference() {
  const table = getScoring('standard')
  return (
    <Panel title="Points table (edit in /src/data/tournaments.json)">
      <div className="flex flex-wrap gap-2">
        {table.placement
          .filter((b) => b.points > 0)
          .map((b) => (
            <div
              key={`${b.from}-${b.to}`}
              className="rounded border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-center"
            >
              <div className="label">
                {b.from === b.to ? `${b.from}${b.from === 1 ? 'st' : ''}` : `${b.from}-${b.to}`}
              </div>
              <div className="font-mono text-sm text-slate-200">{b.points}</div>
            </div>
          ))}
        <div className="rounded border border-cyan-800/60 bg-cyan-950/30 px-3 py-1.5 text-center">
          <div className="label">Per elim</div>
          <div className="font-mono text-sm text-cyan-300">{table.elimPoints}</div>
        </div>
      </div>
    </Panel>
  )
}

function CalendarReference() {
  return (
    <Panel title="Season calendar">
      <ul className="space-y-2 text-sm">
        {(TOURN.events as any[]).map((ev) => (
          <li key={ev.id} className="rounded border border-slate-800 bg-slate-950/50 p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-slate-200">{ev.name}</span>
              <span className="font-mono text-[10px] text-slate-500">
                {ev.type === 'series'
                  ? `${ev.stages.length} stages`
                  : `every ${ev.schedule.everyWeeks} wk`}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">{ev.blurb}</p>
            {ev.type === 'series' && (
              <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-400">
                {ev.stages.map((s: any) => (
                  <li key={s.id}>
                    {s.name} — {s.matches} matches, lobby {s.lobbyRating}
                    {s.advanceCount > 0 ? `, top ${s.advanceCount} advance` : ''}
                    {s.prizePool > 0 ? `, ${money(s.prizePool)}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  )
}
