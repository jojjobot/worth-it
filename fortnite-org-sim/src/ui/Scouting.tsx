import type { Dispatch, SetStateAction } from 'react'
import { useMemo, useState } from 'react'
import { ARCHETYPES, BAL, REGIONS, getArchetype } from '../engine/config'
import { scoutPlayer, signPlayer, signQuote } from '../engine/game'
import { uncertaintyFor, viewEgo, viewOverall, viewPeakOverall } from '../engine/players'
import type { GameState, Player } from '../engine/types'
import { EmptyState, Highlights, money, Panel, PlayerHeader, RatingTree } from './components'

export default function Scouting({
  state,
  setState,
  flash,
}: {
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  flash: (msg: string) => void
}) {
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [archFilter, setArchFilter] = useState('ALL')
  const [sort, setSort] = useState<'ovr' | 'salary' | 'age'>('ovr')
  const [expanded, setExpanded] = useState<string | null>(null)

  const market = useMemo(() => {
    let list = state.marketIds.map((id) => state.players[id]).filter(Boolean) as Player[]
    if (regionFilter !== 'ALL') list = list.filter((p) => p.region === regionFilter)
    if (archFilter !== 'ALL') list = list.filter((p) => p.archetype === archFilter)
    return list.sort((a, b) => {
      if (sort === 'salary') return a.salary - b.salary
      if (sort === 'age') return a.age - b.age
      return viewOverall(b, false).value - viewOverall(a, false).value
    })
  }, [state.marketIds, state.players, regionFilter, archFilter, sort])

  const canScout =
    state.scoutPoints >= BAL.scouting.costPerReport && state.cash >= BAL.scouting.cashCostPerReport

  return (
    <div className="space-y-4">
      <Panel title="Scouting">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="label">Region</div>
            <select className="input mt-1" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
              <option value="ALL">All regions</option>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id} — {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label">Archetype</div>
            <select className="input mt-1" value={archFilter} onChange={(e) => setArchFilter(e.target.value)}>
              <option value="ALL">All archetypes</option>
              {ARCHETYPES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label">Sort by</div>
            <select className="input mt-1" value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="ovr">Estimated overall</option>
              <option value="salary">Cheapest salary</option>
              <option value="age">Youngest</option>
            </select>
          </div>
          <p className="ml-auto max-w-md text-[11px] text-slate-500">
            Each report costs {BAL.scouting.costPerReport} scout point and{' '}
            {money(BAL.scouting.cashCostPerReport)}. Ranges narrow from ±
            {BAL.scouting.uncertaintyByLevel[0]} down to exact numbers at level {BAL.scouting.maxLevel}.
            Signing a player reveals everything.
          </p>
        </div>
      </Panel>

      {market.length === 0 ? (
        <EmptyState>Nobody matches those filters. The market rotates every few weeks.</EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {market.map((p) => {
            const quote = signQuote(state, p.id)
            const open = expanded === p.id
            const band = uncertaintyFor(p.scoutLevel)
            return (
              <div key={p.id} className="panel p-3">
                <PlayerHeader
                  player={p}
                  owned={false}
                  right={
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-[10px] text-slate-500">
                        SCOUT {p.scoutLevel}/{BAL.scouting.maxLevel}
                        {band > 0 ? ` · ±${band}` : ' · exact'}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          className="btn"
                          disabled={!canScout || p.scoutLevel >= BAL.scouting.maxLevel}
                          onClick={() => {
                            setState((s) => (s ? scoutPlayer(s, p.id) : s))
                          }}
                        >
                          Scout
                        </button>
                        <button
                          className="btn-primary"
                          disabled={!quote.ok}
                          title={quote.ok ? '' : quote.reason}
                          onClick={() => {
                            setState((s) => (s ? signPlayer(s, p.id) : s))
                            flash(`${p.tag} signed.`)
                          }}
                        >
                          Sign
                        </button>
                      </div>
                    </div>
                  }
                />

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span title="Their hidden ceiling. Never shown as a number for a player you have not signed - scout them and you get a read, not a rating.">
                    Ceiling <span className="text-slate-300">{viewPeakOverall(p, false)}</span>
                  </span>
                  <span>
                    Ego <span className="text-slate-300">{viewEgo(p, false)}</span>
                  </span>
                  <span>
                    Buyout{' '}
                    <span className="text-slate-300">{p.buyout > 0 ? money(p.buyout) : 'free'}</span>
                  </span>
                  {!quote.ok && quote.reason && (
                    <span className="text-rose-400">{quote.reason}</span>
                  )}
                </div>

                <button
                  className="mt-2 text-[11px] text-slate-500 hover:text-slate-300"
                  onClick={() => setExpanded(open ? null : p.id)}
                >
                  {open ? 'Hide ratings' : 'Show ratings'}
                </button>

                {open && (
                  <div className="mt-2 space-y-2 border-t border-slate-800 pt-2">
                    <RatingTree player={p} owned={false} />
                    <Highlights player={p} owned={false} />
                    <p className="text-[11px] italic text-slate-500">
                      {getArchetype(p.archetype).blurb}
                    </p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
