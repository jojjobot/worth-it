import { useState } from 'react'
import type { GameState, MatchResult, TournamentResult } from '../engine/types'
import { EmptyState, money, ordinal, Panel } from './components'

export default function Results({ state }: { state: GameState }) {
  const [openKey, setOpenKey] = useState<string | null>(
    state.results.length > 0 ? state.results[state.results.length - 1].key : null,
  )
  const results = [...state.results].reverse()

  if (results.length === 0) {
    return <EmptyState>No tournaments played yet.</EmptyState>
  }

  const totals = state.results.reduce(
    (acc, r) => ({
      prize: acc.prize + r.prize,
      wins: acc.wins + r.session.wins,
      elims: acc.elims + r.session.totalElims,
      matches: acc.matches + r.session.matches.length,
      titles: acc.titles + (r.rank === 1 ? 1 : 0),
    }),
    { prize: 0, wins: 0, elims: 0, matches: 0, titles: 0 },
  )

  return (
    <div className="space-y-4">
      <Panel title="Career totals">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Metric label="Prize money" value={money(totals.prize)} tone="text-emerald-300" />
          <Metric label="Event titles" value={String(totals.titles)} />
          <Metric label="Match wins" value={String(totals.wins)} />
          <Metric label="Elims" value={String(totals.elims)} />
          <Metric label="Matches" value={String(totals.matches)} />
        </div>
      </Panel>

      {results.map((r) => (
        <TournamentBlock
          key={r.key + r.trioId}
          result={r}
          open={openKey === r.key}
          onToggle={() => setOpenKey(openKey === r.key ? null : r.key)}
        />
      ))}
    </div>
  )
}

function Metric({ label, value, tone = 'text-slate-100' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/50 px-3 py-2">
      <div className="label">{label}</div>
      <div className={`font-mono text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

export function TournamentBlock({
  result,
  open,
  onToggle,
}: {
  result: TournamentResult
  open: boolean
  onToggle: () => void
}) {
  return (
    <section className="panel overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-800/40"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100">{result.name}</span>
            <span className="font-mono text-[10px] text-slate-500">
              W{result.week} · {result.region}
            </span>
            {result.advanced && (
              <span className="rounded border border-emerald-600/50 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                QUALIFIED
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {result.trioName} — {result.playerTags.join(', ')}
          </div>
        </div>
        <div className="flex items-center gap-5 font-mono text-sm">
          <span>
            <span className="label mr-1">Pts</span>
            <span className="text-slate-100">{result.points}</span>
          </span>
          <span>
            <span className="label mr-1">Rank</span>
            <span className={result.rank <= 3 ? 'text-cyan-300' : 'text-slate-200'}>
              {ordinal(result.rank)}
            </span>
            <span className="text-slate-600">/{result.fieldSize.toLocaleString()}</span>
          </span>
          <span>
            <span className="label mr-1">Prize</span>
            <span className="text-emerald-300">{result.prize > 0 ? money(result.prize) : '--'}</span>
          </span>
          <span className="text-slate-500">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Best finish" value={ordinal(result.session.bestPlacement)} />
            <Metric label="Match wins" value={String(result.session.wins)} />
            <Metric label="Total elims" value={String(result.session.totalElims)} />
            <Metric
              label="Reputation"
              value={`${result.reputation >= 0 ? '+' : ''}${result.reputation}`}
              tone={result.reputation >= 0 ? 'text-emerald-300' : 'text-rose-400'}
            />
          </div>
          <ol className="space-y-1.5">
            {result.session.matches.map((m) => (
              <MatchRow key={m.matchNumber} match={m} />
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function MatchRow({ match }: { match: MatchResult }) {
  const [open, setOpen] = useState(false)
  const tone =
    match.placement === 1
      ? 'border-cyan-700/60 bg-cyan-950/20'
      : match.placement <= 10
        ? 'border-emerald-900/60 bg-emerald-950/10'
        : match.placement > 40
          ? 'border-rose-950/60 bg-rose-950/10'
          : 'border-slate-800 bg-slate-950/40'

  return (
    <li className={`rounded border ${tone}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="text-[13px] leading-snug text-slate-300">{match.summary}</span>
        <span className="shrink-0 font-mono text-xs">
          <span className="text-slate-500">{match.elims}e</span>{' '}
          <span className={match.points >= 40 ? 'text-cyan-300' : 'text-slate-200'}>
            {match.points}p
          </span>
        </span>
      </button>
      {open && (
        <pre className="whitespace-pre-wrap border-t border-slate-800/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-500">
          {match.detail.join('\n')}
        </pre>
      )}
    </li>
  )
}
