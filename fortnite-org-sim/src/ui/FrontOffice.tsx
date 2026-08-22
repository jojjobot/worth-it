// ---------------------------------------------------------------------------
// FRONT OFFICE
//
// Org identity, the save file, the seed, and the news ticker. Everything about
// running the organisation rather than playing the matches.
// ---------------------------------------------------------------------------

import type { Dispatch, SetStateAction } from 'react'
import { useRef } from 'react'
import { BAL, getRegion } from '../engine/config'
import { setOrgName } from '../engine/game'
import { clearLocal, exportSave, importSave } from '../engine/save'
import type { GameState } from '../engine/types'
import { money } from './components'

export default function FrontOffice({
  state,
  setState,
  flash,
}: {
  state: GameState
  setState: Dispatch<SetStateAction<GameState | null>>
  flash: (msg: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const region = getRegion(state.region)
  const news = state.newsLog.slice(-40).reverse()

  return (
    <div className="space-y-4">
      <section className="panel cut p-5">
        <div className="label">Front office</div>
        <h1 className="hud-huge mt-1">{state.orgName}</h1>
        <p className="mt-2 text-[12px] text-[var(--text-dim)]">
          {region.name} · founded week 1 · now week {state.week}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel p-4">
          <h2 className="hud-title rule-accent mb-3">Identity</h2>
          <label className="label mb-1 block">Org name</label>
          <input
            className="input w-full"
            value={state.orgName}
            onChange={(e) => setState((s) => (s ? setOrgName(s, e.target.value) : s))}
          />
          <div className="mt-3 space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Home region</span>
              <span className="font-bold">{region.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Lobby difficulty</span>
              <span className="k-num">
                {region.lobbyModifier >= 0 ? '+' : ''}
                {region.lobbyModifier}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Reputation earned</span>
              <span className="k-num">×{region.reputationMultiplier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Prize money</span>
              <span className="k-num">×{region.prizeMultiplier}</span>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-faint)]">
            {region.blurb}
          </p>
        </section>

        <section className="panel p-4">
          <h2 className="hud-title rule-accent mb-3">Standing</h2>
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Cash</span>
              <span className="k-num" style={{ color: state.cash < 0 ? 'var(--bad)' : 'var(--good)' }}>
                {money(state.cash)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Reputation</span>
              <span className="k-num">
                {state.reputation.toFixed(1)}
                <span className="text-[var(--text-faint)]">/{BAL.economy.reputationMax}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Fans</span>
              <span className="k-num">{state.fans.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Roster</span>
              <span className="k-num">
                {state.rosterIds.length}/{BAL.org.rosterLimit}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Duos</span>
              <span className="k-num">
                {state.duos.length}/{BAL.org.duoLimit}
              </span>
            </div>
          </div>
          <div className="mt-3 h-1.5 w-full bg-[var(--panel-2)]">
            <div
              className="h-full bg-[var(--accent)]"
              style={{ width: `${(state.reputation / BAL.economy.reputationMax) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--text-faint)]">
            Reputation unlocks bigger events and is what makes elite players return your calls.
          </p>
        </section>

        <section className="panel p-4">
          <h2 className="hud-title rule-accent mb-3">Save file</h2>
          <div className="space-y-2">
            <button className="btn w-full" onClick={() => exportSave(state)}>
              Export save
            </button>
            <button className="btn w-full" onClick={() => fileRef.current?.click()}>
              Import save
            </button>
            <button
              className="btn-danger w-full"
              onClick={() => {
                if (confirm('Delete this save and start a brand new org?')) {
                  clearLocal()
                  setState(null)
                }
              }}
            >
              Start a new org
            </button>
          </div>
          <div className="mt-3 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[var(--text-dim)]">Seed</span>
              <span className="k-num text-[var(--text)]">{state.seedLabel || '(none)'}</span>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-faint)]">
            The game autosaves to this browser. Export if you want a backup or want to move the
            career to another machine. The same seed plus the same decisions always replays the
            same career.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                setState(await importSave(file))
                flash('Save imported.')
              } catch (err) {
                flash((err as Error).message)
              }
              e.target.value = ''
            }}
          />
        </section>
      </div>

      <section className="panel p-4">
        <h2 className="hud-title rule-accent mb-3">Scene ticker</h2>
        {news.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[var(--text-faint)]">
            Nothing has happened yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {news.map((n, i) => (
              <li
                key={i}
                className="flex gap-3 border-b border-[var(--line)]/50 py-1.5 text-[12px] last:border-0"
              >
                <span className="k-num shrink-0 text-[11px] text-[var(--text-faint)]">
                  W{n.week}
                </span>
                <span className="text-[var(--text-dim)]">{n.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
