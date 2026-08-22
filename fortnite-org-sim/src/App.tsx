import { useCallback, useEffect, useMemo, useState } from 'react'
import { BAL } from './engine/config'
import { advanceWeek, expiringContracts, weeklyBurn, type WeekReport } from './engine/game'
import { loadFromLocal, saveToLocal } from './engine/save'
import { importSave } from './engine/save'
import { seasonOf } from './engine/tournament'
import type { GameState } from './engine/types'
import { money } from './ui/components'
import { HUB_ITEMS, HubButton, HubMenu } from './ui/Hub'
import NewGame from './ui/NewGame'
import Season from './ui/Season'
import Roster from './ui/Roster'
import Scouting from './ui/Scouting'
import Training from './ui/Training'
import Results from './ui/Results'
import Scene from './ui/Scene'
import Finances from './ui/Finances'
import FrontOffice from './ui/FrontOffice'
import WeekReportModal from './ui/WeekReportModal'
import { PlayerSheetProvider } from './ui/PlayerSheet'

type ScreenId = (typeof HUB_ITEMS)[number]['id']

/** The top strip: one number per thing you can run out of. */
function HeadlineStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div className="min-w-0">
      <div className="label truncate">{label}</div>
      <div className="k-num truncate text-[17px] leading-tight" style={{ color: tone }}>
        {value}
      </div>
      {sub && <div className="truncate text-[10px] text-[var(--text-faint)]">{sub}</div>}
    </div>
  )
}

export default function App() {
  const [state, setState] = useState<GameState | null>(() => loadFromLocal())
  const [screen, setScreen] = useState<ScreenId>('season')
  const [menuOpen, setMenuOpen] = useState(false)
  const [report, setReport] = useState<WeekReport | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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

  // Alerts on the menu rows, so you know what needs attention without opening
  // every screen.
  const badges = useMemo(() => {
    if (!state) return {}
    const out: Record<string, { text: string; tone: 'accent' | 'warn' | 'bad' }> = {}
    const entered = Object.keys(state.entries).length
    if (entered > 0) out.season = { text: `${entered} in`, tone: 'accent' }
    const expiring = expiringContracts(state).length
    if (expiring > 0) out.roster = { text: `${expiring} exp`, tone: 'warn' }
    if (state.scoutPoints > 0) out.scouting = { text: `${state.scoutPoints} pts`, tone: 'accent' }
    const burn = weeklyBurn(state)
    if (state.cash < burn * 3) out.finances = { text: 'low', tone: 'bad' }
    return out
  }, [state])

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
  const here = seasonOf(state.week)
  const active = HUB_ITEMS.find((i) => i.id === screen) ?? HUB_ITEMS[0]

  return (
    <PlayerSheetProvider state={state}>
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col gap-4 p-4 pb-24">
        {/* ---------- Header ---------- */}
        <header className="panel flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-3">
          <div className="rule-accent min-w-0">
            <div className="label">
              Season {here.season} · Week {state.week}
            </div>
            <h1 className="truncate text-[19px] font-extrabold uppercase tracking-wider">
              {state.orgName}
            </h1>
          </div>

          <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
            <HeadlineStat
              label="Cash"
              value={money(state.cash)}
              sub={`${money(burn)}/wk burn`}
              tone={state.cash < 0 ? 'var(--bad)' : state.cash > burn * 6 ? 'var(--good)' : undefined}
            />
            <HeadlineStat
              label="Reputation"
              value={state.reputation.toFixed(1)}
              sub={`of ${BAL.economy.reputationMax}`}
            />
            <HeadlineStat label="Fans" value={state.fans.toLocaleString()} />
            <HeadlineStat
              label="Roster"
              value={`${state.rosterIds.length}/${BAL.org.rosterLimit}`}
            />
            <HeadlineStat
              label="Scout pts"
              value={`${state.scoutPoints}/${BAL.scouting.pointsPerWeek}`}
              sub="refills weekly"
            />
          </div>

          <button
            className="btn-primary shrink-0"
            disabled={!!state.gameOver}
            onClick={onAdvance}
            title="Runs every event you entered, applies training, and pays the bills"
          >
            Advance week →
          </button>
        </header>

        {state.gameOver && (
          <div
            className="panel p-4"
            style={{ borderColor: 'var(--bad)', background: 'rgba(255,77,99,0.08)' }}
          >
            <strong className="hud-title" style={{ color: 'var(--bad)' }}>
              Game over
            </strong>
            <p className="mt-1 text-[13px] text-[var(--text-dim)]">{state.gameOver}</p>
          </div>
        )}

        {/* ---------- Screen ---------- */}
        <main className="flex-1">
          {screen === 'season' && (
            <Season state={state} setState={setState} onAdvance={onAdvance} flash={flash} />
          )}
          {screen === 'roster' && <Roster state={state} setState={setState} flash={flash} />}
          {screen === 'scouting' && <Scouting state={state} setState={setState} flash={flash} />}
          {screen === 'training' && <Training state={state} setState={setState} />}
          {screen === 'results' && <Results state={state} />}
          {screen === 'scene' && <Scene state={state} />}
          {screen === 'finances' && <Finances state={state} />}
          {screen === 'office' && (
            <FrontOffice state={state} setState={setState} flash={flash} />
          )}
        </main>

        {/* ---------- The hub ---------- */}
        <HubMenu
          open={menuOpen}
          active={screen}
          badges={badges}
          onPick={(id) => setScreen(id as ScreenId)}
          onClose={() => setMenuOpen(false)}
        />
        <HubButton
          open={menuOpen}
          activeLabel={active.label}
          onToggle={() => setMenuOpen((o) => !o)}
        />

        {report && <WeekReportModal report={report} onClose={() => setReport(null)} />}

        {toast && (
          <div className="panel-raised fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 px-4 py-2 text-[12px] text-[var(--accent)]">
            {toast}
          </div>
        )}
      </div>
    </PlayerSheetProvider>
  )
}
