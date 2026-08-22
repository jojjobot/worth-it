import { useCallback, useEffect, useRef, useState } from 'react'
import { BAL } from './engine/config'
import { advanceWeek, weeklyBurn, type WeekReport } from './engine/game'
import { clearLocal, exportSave, importSave, loadFromLocal, saveToLocal } from './engine/save'
import type { GameState } from './engine/types'
import { money, Stat } from './ui/components'
import NewGame from './ui/NewGame'
import Dashboard from './ui/Dashboard'
import Roster from './ui/Roster'
import Scouting from './ui/Scouting'
import Training from './ui/Training'
import Tournaments from './ui/Tournaments'
import Results from './ui/Results'
import WeekReportModal from './ui/WeekReportModal'

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'roster', label: 'Roster & Duos' },
  { id: 'scouting', label: 'Scouting' },
  { id: 'training', label: 'Training' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'results', label: 'Results' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  const [state, setState] = useState<GameState | null>(() => loadFromLocal())
  const [tab, setTab] = useState<TabId>('dashboard')
  const [report, setReport] = useState<WeekReport | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Autosave on every change.
  useEffect(() => {
    if (state) saveToLocal(state)
  }, [state])

  const flash = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  const onAdvance = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.gameOver) return prev
      const { state: next, report: r } = advanceWeek(prev)
      setReport(r)
      return next
    })
  }, [])

  if (!state) {
    return (
      <NewGame
        onStart={(s) => setState(s)}
        onImport={async (file) => {
          try {
            setState(await importSave(file))
          } catch (err) {
            alert((err as Error).message)
          }
        }}
      />
    )
  }

  const burn = weeklyBurn(state)
  const entriesThisWeek = Object.keys(state.entries).length

  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col gap-4 p-4">
      {/* ---------- Header ---------- */}
      <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-lg font-bold tracking-tight text-cyan-300">
            {state.orgName}
          </h1>
          <span className="label">
            {state.region} · Week {state.week}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => exportSave(state)} title="Download your save as a JSON file">
            Export save
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import save
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (confirm('Delete this save and start a brand new org?')) {
                clearLocal()
                setState(null)
              }
            }}
          >
            New org
          </button>
          <button
            className="btn-primary"
            disabled={!!state.gameOver}
            onClick={onAdvance}
            title="Runs every tournament you entered, applies training, and pays the bills"
          >
            Advance week {entriesThisWeek > 0 ? `(${entriesThisWeek} entered)` : ''} →
          </button>
        </div>
      </header>

      {/* ---------- Top-line numbers ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="Cash"
          value={money(state.cash)}
          sub={`${money(burn)}/wk burn`}
          tone={state.cash < 0 ? 'bad' : state.cash > burn * 6 ? 'good' : 'default'}
        />
        <Stat label="Reputation" value={state.reputation.toFixed(1)} sub={`of ${BAL.economy.reputationMax}`} />
        <Stat label="Fans" value={state.fans.toLocaleString()} />
        <Stat label="Roster" value={`${state.rosterIds.length}/${BAL.org.rosterLimit}`} />
        <Stat label="Scout points" value={`${state.scoutPoints}/${BAL.scouting.pointsPerWeek}`} sub="refills each week" />
      </div>

      {state.gameOver && (
        <div className="panel border-rose-700/60 bg-rose-950/40 p-4 text-rose-200">
          <strong className="font-mono uppercase tracking-widest">Game over</strong>
          <p className="mt-1 text-sm">{state.gameOver}</p>
        </div>
      )}

      {/* ---------- Tabs ---------- */}
      <nav className="flex flex-wrap gap-1 border-b border-slate-800 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-b-2 border-cyan-400 text-cyan-200'
                : 'border-b-2 border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 pb-10">
        {tab === 'dashboard' && <Dashboard state={state} setState={setState} onAdvance={onAdvance} goto={setTab} />}
        {tab === 'roster' && <Roster state={state} setState={setState} flash={flash} />}
        {tab === 'scouting' && <Scouting state={state} setState={setState} flash={flash} />}
        {tab === 'training' && <Training state={state} setState={setState} />}
        {tab === 'tournaments' && <Tournaments state={state} setState={setState} flash={flash} />}
        {tab === 'results' && <Results state={state} />}
      </main>

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

      {report && <WeekReportModal report={report} onClose={() => setReport(null)} />}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded border border-cyan-600/50 bg-slate-900 px-4 py-2 text-sm text-cyan-200 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
