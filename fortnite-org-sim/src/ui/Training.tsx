import type { Dispatch, SetStateAction } from 'react'
import { ATTR_LABELS, TRAINING_PROGRAMS, getProgram } from '../engine/config'
import { setTraining } from '../engine/game'
import { overall } from '../engine/players'
import { trainingCost } from '../engine/training'
import type { AttrKey, GameState, Player } from '../engine/types'
import { ArchetypeChip, BurnoutBar, EmptyState, money, Panel, ratingColor, sortPlayers } from './components'

export default function Training({
  state,
  setState,
}: {
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
}) {
  const roster = sortPlayers(state.rosterIds.map((id) => state.players[id]).filter(Boolean))
  const bill = trainingCost(roster)

  return (
    <div className="space-y-4">
      <Panel
        title="Weekly training"
        right={
          <span className="font-mono text-xs text-slate-400">
            Weekly bill <span className="text-amber-300">{money(bill)}</span>
          </span>
        }
      >
        <p className="text-[12px] text-slate-400">
          Each player runs one program per week. Gains slow down as a player approaches their hidden
          potential, and young players improve far faster than veterans. Hard programs stack burnout,
          which drags down match performance until they take a rest week.
        </p>
      </Panel>

      {roster.length === 0 ? (
        <EmptyState>Sign some players first.</EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {roster.map((p) => (
            <PlayerTraining key={p.id} player={p} setState={setState} />
          ))}
        </div>
      )}

      <Panel title="Program reference">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="label border-b border-slate-800 text-left">
                <th className="pb-1">Program</th>
                <th className="pb-1">Trains</th>
                <th className="pb-1 text-right">Burnout</th>
                <th className="pb-1 text-right">Chemistry</th>
                <th className="pb-1 text-right">Cost/wk</th>
              </tr>
            </thead>
            <tbody>
              {TRAINING_PROGRAMS.map((prog) => (
                <tr key={prog.id} className="border-b border-slate-900 last:border-0 align-top">
                  <td className="py-2">
                    <div className="font-medium text-slate-200">{prog.name}</div>
                    <div className="text-[11px] text-slate-500">{prog.desc}</div>
                  </td>
                  <td className="py-2 text-[11px] text-slate-400">
                    {Object.keys(prog.targets).length === 0
                      ? '—'
                      : Object.entries(prog.targets)
                          .sort((a, b) => (b[1] as number) - (a[1] as number))
                          .map(([k, v]) => `${ATTR_LABELS[k as AttrKey].short} ${v}`)
                          .join(', ')}
                  </td>
                  <td
                    className={`py-2 text-right font-mono ${prog.burnout > 12 ? 'text-rose-400' : prog.burnout <= 0 ? 'text-emerald-400' : 'text-slate-300'}`}
                  >
                    {prog.burnout > 0 ? `+${prog.burnout}` : prog.burnout}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-300">
                    {prog.synergyGain > 0 ? `+${prog.synergyGain}` : '—'}
                  </td>
                  <td className="py-2 text-right font-mono text-slate-300">
                    {money(prog.costPerWeek)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function PlayerTraining({
  player,
  setState,
}: {
  player: Player
  setState: Dispatch<SetStateAction<GameState | null>>
}) {
  const ovr = overall(player.attrs)
  const headroom = Math.max(0, player.potential - ovr)
  const program = getProgram(player.trainingProgram)

  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-100">{player.tag}</span>
          <ArchetypeChip id={player.archetype} />
          <span className="font-mono text-[11px] text-slate-500">{player.age}y</span>
        </div>
        <span className="font-mono text-xs">
          <span className={ratingColor(ovr)}>{ovr}</span>
          <span className="text-slate-600"> / {player.potential}</span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Headroom{' '}
          <span className={headroom > 8 ? 'text-emerald-300' : headroom > 3 ? 'text-amber-300' : 'text-slate-400'}>
            +{headroom}
          </span>
        </span>
        <BurnoutBar value={player.burnout} />
      </div>

      <select
        className="input mt-2 w-full"
        value={player.trainingProgram}
        onChange={(e) => setState((s) => (s ? setTraining(s, player.id, e.target.value) : s))}
      >
        {TRAINING_PROGRAMS.map((prog) => (
          <option key={prog.id} value={prog.id}>
            {prog.name} · {money(prog.costPerWeek)}/wk
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-slate-500">{program.desc}</p>
    </div>
  )
}
