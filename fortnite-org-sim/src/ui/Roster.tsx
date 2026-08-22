import type { Dispatch, SetStateAction } from 'react'
import { useState } from 'react'
import { BAL, getArchetype } from '../engine/config'
import {
  addTrio,
  releasePlayer,
  removeTrio,
  renameTrio,
  renewContract,
  setTrioSlot,
  setTrioStrategy,
} from '../engine/game'
import { computeSynergy, trioStrength } from '../engine/sim'
import { viewEgo, viewPeakOverall } from '../engine/players'
import type { GameState, Player, Strategy } from '../engine/types'
import {
  BurnoutBar,
  EmptyState,
  Highlights,
  money,
  Panel,
  PlayerHeader,
  RatingTree,
  ratingColor,
  sortPlayers,
} from './components'

const STRATEGIES: { id: Strategy; label: string; desc: string }[] = [
  { id: 'contest', label: 'Contest', desc: 'Drop hot, fight early, chase elim points. High risk.' },
  { id: 'balanced', label: 'Balanced', desc: 'Take fights that come to you, rotate on time.' },
  { id: 'safe', label: 'Zone', desc: 'Avoid fights, farm placement points, live to the endgame.' },
]

export default function Roster({
  state,
  setState,
  flash,
}: {
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  flash: (msg: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const roster = sortPlayers(state.rosterIds.map((id) => state.players[id]).filter(Boolean))
  const assigned = new Set(state.trios.flatMap((t) => t.playerIds.filter(Boolean) as string[]))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---------------- Trios ---------------- */}
      <div className="space-y-4">
        <Panel
          title="Trios"
          right={
            <button
              className="btn"
              disabled={state.trios.length >= BAL.org.trioLimit}
              onClick={() => setState((s) => (s ? addTrio(s) : s))}
            >
              + Add trio
            </button>
          }
        >
          <div className="space-y-4">
            {state.trios.map((trio) => {
              const players = trio.playerIds
                .map((id) => (id ? state.players[id] : null))
                .filter((p): p is Player => !!p)
              const syn = computeSynergy(players, trio.gamesTogether)
              const strength = players.length === 3 ? trioStrength(players, trio.gamesTogether) : 0

              return (
                <div key={trio.id} className="rounded border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className="input flex-1 font-semibold"
                      value={trio.name}
                      onChange={(e) =>
                        setState((s) => (s ? renameTrio(s, trio.id, e.target.value) : s))
                      }
                    />
                    {state.trios.length > 1 && (
                      <button
                        className="btn-danger"
                        onClick={() => setState((s) => (s ? removeTrio(s, trio.id) : s))}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {[0, 1, 2].map((slot) => {
                      const current = trio.playerIds[slot]
                      return (
                        <select
                          key={slot}
                          className="input w-full"
                          value={current ?? ''}
                          onChange={(e) =>
                            setState((s) =>
                              s ? setTrioSlot(s, trio.id, slot, e.target.value || null) : s,
                            )
                          }
                        >
                          <option value="">-- empty slot {slot + 1} --</option>
                          {roster.map((p) => (
                            <option
                              key={p.id}
                              value={p.id}
                              disabled={assigned.has(p.id) && p.id !== current}
                            >
                              {p.tag} · {getArchetype(p.archetype).short}
                              {assigned.has(p.id) && p.id !== current ? ' (in another trio)' : ''}
                            </option>
                          ))}
                        </select>
                      )
                    })}
                  </div>

                  <div className="mt-3">
                    <div className="label mb-1">Game plan</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {STRATEGIES.map((s) => (
                        <button
                          key={s.id}
                          title={s.desc}
                          onClick={() =>
                            setState((prev) => (prev ? setTrioStrategy(prev, trio.id, s.id) : prev))
                          }
                          className={`rounded border px-2 py-1.5 text-xs transition ${
                            trio.strategy === s.id
                              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                              : 'border-slate-700 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {STRATEGIES.find((s) => s.id === trio.strategy)?.desc}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-800 pt-2 font-mono text-xs">
                    <div>
                      <div className="label">Strength</div>
                      <span className={players.length === 3 ? ratingColor(strength) : 'text-slate-600'}>
                        {players.length === 3 ? strength.toFixed(1) : '--'}
                      </span>
                    </div>
                    <div>
                      <div className="label">Synergy</div>
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
                    </div>
                    <div>
                      <div className="label">Games together</div>
                      <span className="text-slate-300">{trio.gamesTogether}</span>
                    </div>
                  </div>

                  {players.length === 3 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300">
                        Chemistry breakdown
                      </summary>
                      <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-400">
                        <li>comms {syn.comms >= 0 ? '+' : ''}{syn.comms.toFixed(1)}</li>
                        <li>ego {syn.ego.toFixed(1)}</li>
                        <li>time together +{syn.chemistry.toFixed(1)}</li>
                        <li>composition {syn.composition >= 0 ? '+' : ''}{syn.composition.toFixed(1)}</li>
                      </ul>
                      <p className="mt-1 text-[11px] text-slate-500">{syn.notes.join(' ')}</p>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {/* ---------------- Roster ---------------- */}
      <Panel title={`Roster (${roster.length}/${BAL.org.rosterLimit})`}>
        {roster.length === 0 ? (
          <EmptyState>No players signed. Head to Scouting.</EmptyState>
        ) : (
          <div className="space-y-2">
            {roster.map((p) => {
              const open = expanded === p.id
              return (
                <div key={p.id} className="rounded border border-slate-800 bg-slate-950/50 p-3">
                  <PlayerHeader
                    player={p}
                    owned
                    right={
                      <button
                        className="btn shrink-0"
                        onClick={() => setExpanded(open ? null : p.id)}
                      >
                        {open ? 'Hide' : 'Details'}
                      </button>
                    }
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span>
                      Contract{' '}
                      <span
                        className={
                          p.contractWeeks <= 0
                            ? 'text-rose-400'
                            : p.contractWeeks <= 4
                              ? 'text-amber-300'
                              : 'text-slate-300'
                        }
                      >
                        {p.contractWeeks <= 0 ? 'EXPIRED' : `${p.contractWeeks} wks`}
                      </span>
                    </span>
                    <span title="Their hidden ceiling, as your coaching staff estimate it. Always a band - a coach guesses a ceiling, they do not read it off a screen.">
                      Ceiling <span className="text-slate-300">{viewPeakOverall(p, true)}</span>
                    </span>
                    <span title="LAN and Grand Final appearances. The only thing that grows Big Stage Nerve.">
                      LANs <span className="text-slate-300">{p.lanAppearances}</span>
                    </span>
                    <span>
                      Ego <span className="text-slate-300">{viewEgo(p, true)}</span>
                    </span>
                    <span>
                      Matches <span className="text-slate-300">{p.matchesPlayed}</span>
                    </span>
                    <span>
                      Earned <span className="text-slate-300">{money(p.careerEarnings)}</span>
                    </span>
                    <BurnoutBar value={p.burnout} />
                  </div>

                  {open && (
                    <div className="mt-3 space-y-3 border-t border-slate-800 pt-3">
                      <RatingTree player={p} owned />
                      <Highlights player={p} owned />
                      <p className="text-[11px] italic text-slate-500">
                        {getArchetype(p.archetype).blurb}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {[26, 52].map((weeks) => (
                          <button
                            key={weeks}
                            className="btn"
                            onClick={() => {
                              setState((s) => (s ? renewContract(s, p.id, weeks) : s))
                              flash(`${p.tag} offered a ${weeks} week extension.`)
                            }}
                          >
                            Re-sign {weeks} wks
                          </button>
                        ))}
                        <button
                          className="btn-danger"
                          onClick={() => {
                            if (confirm(`Release ${p.tag}? They go back on the market.`)) {
                              setState((s) => (s ? releasePlayer(s, p.id) : s))
                            }
                          }}
                        >
                          Release
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </div>
  )
}
