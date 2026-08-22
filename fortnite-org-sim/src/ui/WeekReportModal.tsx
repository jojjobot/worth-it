import { useState } from 'react'
import { SUB_BY_ID } from '../engine/config'
import type { WeekReport } from '../engine/game'
import type { SubKey } from '../engine/types'
import { money } from './components'
import { TournamentBlock } from './Results'

export default function WeekReportModal({
  report,
  onClose,
}: {
  report: WeekReport
  onClose: () => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(report.results[0]?.key ?? null)
  const gains = report.training.filter((t) => Object.keys(t.gains).length > 0)

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel my-8 w-full max-w-4xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-lg font-bold text-cyan-300">Week {report.week} report</h2>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </header>

        {report.gameOver && (
          <div className="mb-4 rounded border border-rose-700/60 bg-rose-950/40 p-3 text-rose-200">
            {report.gameOver}
          </div>
        )}

        {report.results.length > 0 && (
          <div className="mb-4 space-y-3">
            {report.results.map((r) => (
              <TournamentBlock
                key={r.key + r.duoId}
                result={r}
                open={openKey === r.key}
                onToggle={() => setOpenKey(openKey === r.key ? null : r.key)}
              />
            ))}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <section>
            <h3 className="label mb-2">The books</h3>
            <ul className="space-y-1 font-mono text-xs">
              <Row label="Prize money" value={report.finance.prizes} good />
              <Row label="Sponsors" value={report.finance.sponsors} good />
              <Row label="Salaries" value={-report.finance.salaries} />
              <Row label="Training" value={-report.finance.training} />
              <Row label="Overhead" value={-report.finance.overhead} />
              <li className="flex justify-between border-t border-slate-800 pt-1 font-semibold">
                <span className="text-slate-300">Net</span>
                <span className={report.finance.net >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                  {money(report.finance.net)}
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h3 className="label mb-2">Training gains</h3>
            {gains.length === 0 ? (
              <p className="text-xs text-slate-500">Nobody improved this week.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {gains.map((t) => (
                  <li key={t.playerId} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-slate-200">{t.tag}</span>
                    {Object.entries(t.gains).map(([k, v]) => (
                      <span key={k} className="font-mono text-emerald-300">
                        {SUB_BY_ID[k as SubKey].short} +{(v as number).toFixed(2)}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            {report.training.some((t) => t.note) && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-amber-300">
                {report.training
                  .filter((t) => t.note)
                  .map((t) => (
                    <li key={`n-${t.playerId}`}>{t.note}</li>
                  ))}
              </ul>
            )}
          </section>
        </div>

        {report.news.length > 0 && (
          <section className="mt-4">
            <h3 className="label mb-2">Around the scene</h3>
            <ul className="space-y-1 text-[12px] text-slate-400">
              {report.news.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-5 flex justify-end">
          <button className="btn-primary" onClick={onClose}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, good }: { label: string; value: number; good?: boolean }) {
  return (
    <li className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={good ? 'text-emerald-400' : 'text-slate-300'}>{money(value)}</span>
    </li>
  )
}
