import type { Dispatch, SetStateAction } from 'react'
import { computeSynergy, duoStrength } from '../engine/sim'
import { eventsForWeek } from '../engine/tournament'
import { expiringContracts } from '../engine/game'
import { realOrgColor } from '../engine/realPlayers'
import type { GameState, Player } from '../engine/types'
import { ArchetypeChip, EmptyState, money, ordinal, Panel, ratingColor } from './components'

export default function Dashboard({
  state,
  goto,
}: {
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  onAdvance: () => void
  goto: (tab: any) => void
}) {
  const events = eventsForWeek(state)
  const entered = events.filter((e) => state.entries[e.key])
  const recent = state.results.slice(-5).reverse()
  const news = state.newsLog.slice(-12).reverse()
  const expiring = expiringContracts(state)
  const lastFinance = state.finances[state.finances.length - 1]

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ---- Duos ---- */}
      <Panel title="Your duos" className="lg:col-span-2">
        <div className="space-y-3">
          {state.duos.map((duo) => {
            const players = duo.playerIds
              .map((id) => (id ? state.players[id] : null))
              .filter((p): p is Player => !!p)
            const complete = players.length === 2
            const strength = complete ? duoStrength(players, duo.gamesTogether) : 0
            const syn = computeSynergy(players, duo.gamesTogether)
            return (
              <div key={duo.id} className="rounded border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-100">{duo.name}</span>
                    <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-400">
                      {duo.strategy}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-xs">
                    <span>
                      <span className="label mr-1">Strength</span>
                      <span className={complete ? ratingColor(strength) : 'text-slate-600'}>
                        {complete ? strength.toFixed(1) : '--'}
                      </span>
                    </span>
                    <span>
                      <span className="label mr-1">Synergy</span>
                      <span
                        className={
                          syn.total > 2
                            ? 'text-emerald-300'
                            : syn.total < -2
                              ? 'text-rose-400'
                              : 'text-slate-300'
                        }
                      >
                        {syn.total >= 0 ? '+' : ''}
                        {syn.total.toFixed(1)}
                      </span>
                    </span>
                    <span>
                      <span className="label mr-1">Games</span>
                      <span className="text-slate-300">{duo.gamesTogether}</span>
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {duo.playerIds.map((id, i) => {
                    const p = id ? state.players[id] : null
                    return p ? (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-xs"
                      >
                        <ArchetypeChip id={p.archetype} small />
                        <span className="text-slate-200">{p.tag}</span>
                      </span>
                    ) : (
                      <span
                        key={i}
                        className="rounded border border-dashed border-slate-700 px-2 py-1 text-xs text-slate-600"
                      >
                        empty slot
                      </span>
                    )
                  })}
                </div>

                {syn.notes.length > 0 && (
                  <p className="mt-2 text-[11px] text-slate-500">{syn.notes.join(' ')}</p>
                )}
              </div>
            )
          })}
        </div>
        <button className="btn mt-3" onClick={() => goto('roster')}>
          Manage roster & duos
        </button>
      </Panel>

      {/* ---- This week ---- */}
      <Panel title={`Week ${state.week} calendar`}>
        {events.length === 0 ? (
          <EmptyState>Nothing on this week. Advance to the next one.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => {
              const entry = state.entries[e.key]
              const duo = state.duos.find((t) => t.id === entry)
              return (
                <li key={e.key} className="rounded border border-slate-800 bg-slate-950/50 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-200">{e.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">T{e.tier}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                    {e.matches} matches · lobby {e.lobbyRating} · {money(e.prizePool)} pool
                  </div>
                  <div className="mt-1 text-[11px]">
                    {e.locked ? (
                      <span className="text-rose-400">{e.lockReason}</span>
                    ) : duo ? (
                      <span className="text-emerald-300">Entered: {duo.name}</span>
                    ) : (
                      <span className="text-slate-500">Not entered</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <button className="btn mt-3 w-full" onClick={() => goto('tournaments')}>
          {entered.length > 0 ? 'Change entries' : 'Enter a tournament'}
        </button>
      </Panel>

      {/* ---- Recent results ---- */}
      {/* ---- The scene: the real orgs you are up against ---- */}
      <Panel title="The scene" className="lg:col-span-3">
        <p className="mb-3 text-[11px] text-slate-500">
          The orgs you actually compete against. Their duos are simulated with the same match
          engine you are, on the same ratings you can scout — so a result against them is real.
          Orgs outside your region only meet you at international events.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {state.rivalDuos.map((d) => {
            const roster = d.playerIds
              .map((id) => state.players[id])
              .filter((p): p is Player => !!p)
            const strength = roster.length === 2 ? duoStrength(roster, d.gamesTogether) : 0
            const color = realOrgColor(d.orgName) ?? '#94a3b8'
            const home = d.region === state.region
            return (
              <div
                key={d.id}
                className={`rounded border p-2.5 ${home ? 'border-slate-700 bg-slate-950/60' : 'border-slate-800/60 bg-slate-950/30'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-[13px]" style={{ color }}>
                    {d.orgName}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">{d.region}</span>
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-400">
                  {roster.map((p) => p.tag).join(' + ') || '--'}
                </div>
                <div className="mt-1.5 flex items-center justify-between font-mono text-[10px]">
                  <span className="text-slate-600">
                    {home ? 'in your region' : 'international only'}
                  </span>
                  <span className={ratingColor(strength)}>{strength.toFixed(1)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title="Recent results" className="lg:col-span-2">
        {recent.length === 0 ? (
          <EmptyState>No results yet. Enter a tournament and advance the week.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="label border-b border-slate-800 text-left">
                <th className="pb-1">Wk</th>
                <th className="pb-1">Event</th>
                <th className="pb-1">Duo</th>
                <th className="pb-1 text-right">Pts</th>
                <th className="pb-1 text-right">Rank</th>
                <th className="pb-1 text-right">Prize</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.key + r.duoId} className="border-b border-slate-900 last:border-0">
                  <td className="py-1.5 font-mono text-xs text-slate-500">{r.week}</td>
                  <td className="py-1.5 text-slate-200">{r.name}</td>
                  <td className="py-1.5 text-slate-400">{r.duoName}</td>
                  <td className="py-1.5 text-right font-mono">{r.points}</td>
                  <td className="py-1.5 text-right font-mono text-slate-300">
                    {ordinal(r.rank)}
                    <span className="text-slate-600">/{r.fieldSize.toLocaleString()}</span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-emerald-300">
                    {r.prize > 0 ? money(r.prize) : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* ---- Side column ---- */}
      <div className="space-y-4">
        {expiring.length > 0 && (
          <Panel title="Contracts running out">
            <ul className="space-y-1 text-sm">
              {expiring.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span className="text-slate-200">{p.tag}</span>
                  <span
                    className={`font-mono text-xs ${p.contractWeeks <= 0 ? 'text-rose-400' : 'text-amber-300'}`}
                  >
                    {p.contractWeeks <= 0 ? 'EXPIRED' : `${p.contractWeeks} wks`}
                  </span>
                </li>
              ))}
            </ul>
            <button className="btn mt-3 w-full" onClick={() => goto('roster')}>
              Go to roster
            </button>
          </Panel>
        )}

        {lastFinance && (
          <Panel title={`Week ${lastFinance.week} books`}>
            <ul className="space-y-1 font-mono text-xs">
              <Line label="Prize money" value={lastFinance.prizes} positive />
              <Line label="Sponsors" value={lastFinance.sponsors} positive />
              <Line label="Salaries" value={-lastFinance.salaries} />
              <Line label="Training" value={-lastFinance.training} />
              <Line label="Overhead" value={-lastFinance.overhead} />
              <li className="mt-1 flex justify-between border-t border-slate-800 pt-1 font-semibold">
                <span className="text-slate-300">Net</span>
                <span className={lastFinance.net >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                  {money(lastFinance.net)}
                </span>
              </li>
            </ul>
          </Panel>
        )}

        <Panel title="Scene ticker">
          <ul className="space-y-1.5 text-[12px] text-slate-400">
            {news.map((n, i) => (
              <li key={i}>
                <span className="font-mono text-[10px] text-slate-600">W{n.week} </span>
                {n.text}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function Line({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <li className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={positive ? 'text-emerald-400' : 'text-slate-300'}>{money(value)}</span>
    </li>
  )
}
