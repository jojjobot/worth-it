import { useState } from 'react'
import { realOrgColor } from '../engine/realPlayers'
import { OrgMark, useOrgSheet } from './OrgSheet'
import { PlayerLink } from './PlayerSheet'
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
          key={r.key + r.duoId}
          result={r}
          open={openKey === r.key}
          onToggle={() => setOpenKey(openKey === r.key ? null : r.key)}
          yourOrgName={state.orgName}
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
  yourOrgName,
}: {
  result: TournamentResult
  open: boolean
  onToggle: () => void
  /** Your org's name, so your own row in the standings opens your org page too. */
  yourOrgName?: string
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
            {result.duoName} — {result.playerTags.join(', ')}
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
          <RivalStandings result={result} yourOrgName={yourOrgName} />

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

/**
 * Where the real orgs finished in the same event. These duos are simulated
 * with the SAME match engine on their real ratings, not modelled statistically
 * like the rest of the field - so finishing above BIG genuinely means you
 * out-scored vic0 and Malibuca that night.
 */
function RivalStandings({
  result,
  yourOrgName,
}: {
  result: TournamentResult
  yourOrgName?: string
}) {
  const { openOrg } = useOrgSheet()
  const rivals = result.rivals ?? []
  if (rivals.length === 0) return null

  const rows = [
    ...rivals.map((r) => ({
      name: r.orgName,
      orgName: r.orgName,
      tags: r.playerTags,
      ids: r.playerIds ?? [],
      points: r.points,
      rank: r.rank,
      you: false,
    })),
    {
      name: result.duoName,
      orgName: yourOrgName,
      tags: result.playerTags,
      ids: result.playerIds ?? [],
      points: result.points,
      rank: result.rank,
      you: true,
    },
  ].sort((a, b) => a.rank - b.rank)

  return (
    <details className="mb-3 rounded border border-slate-800 bg-slate-950/40" open>
      <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-300">
        How the scene finished
      </summary>
      <ul className="space-y-px px-3 pb-2">
        {rows.map((row) => {
          const color = row.you ? '#22d3ee' : (realOrgColor(row.name) ?? '#94a3b8')
          return (
            <li
              key={row.name + row.rank}
              className={`flex items-baseline gap-2 rounded px-1.5 py-1 font-mono text-[11px] ${
                row.you ? 'bg-cyan-500/10' : ''
              }`}
            >
              <span className="w-10 shrink-0 text-right text-slate-400">
                {ordinal(row.rank)}
              </span>
              <button
                type="button"
                disabled={!row.orgName}
                onClick={() => row.orgName && openOrg(row.orgName)}
                title={row.orgName ? `Open ${row.orgName}` : undefined}
                className="flex w-44 shrink-0 items-center gap-1.5 truncate text-left font-semibold transition-opacity enabled:hover:opacity-80"
                style={{ color }}
              >
                <OrgMark name={row.orgName ?? row.name} color={color} size={16} />
                <span className="truncate">{row.name}</span>
                {row.you && <span className="text-[9px] text-cyan-500">YOU</span>}
              </button>
              <span className="flex flex-1 flex-wrap items-center gap-1 text-slate-500">
                {row.tags.map((tag, i) =>
                  row.ids[i] ? (
                    <span key={row.ids[i]} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-700">+</span>}
                      <PlayerLink playerId={row.ids[i]} className="text-slate-500">
                        {tag}
                      </PlayerLink>
                    </span>
                  ) : (
                    <span key={tag}>{i > 0 ? ` + ${tag}` : tag}</span>
                  ),
                )}
              </span>
              <span className="shrink-0 text-slate-200">{row.points} pts</span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function MatchRow({ match }: { match: MatchResult }) {
  const [open, setOpen] = useState(false)
  const tone =
    match.placement === 1
      ? 'border-cyan-700/60 bg-cyan-950/20'
      : match.placement <= 10
        ? 'border-emerald-900/60 bg-emerald-950/10'
        : match.placement > 30
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
        <div className="border-t border-slate-800/70">
          {match.players && match.players.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 font-mono text-[11px]">
              {match.players.map((line) => (
                <span key={line.playerId} className="text-slate-400">
                  {line.tag}{' '}
                  <span className="text-slate-200">{line.elims}e</span>
                  {!line.survived && <span className="ml-1 text-rose-400">DOWN</span>}
                </span>
              ))}
              {match.partnerDowns > 0 && (
                <span className="text-slate-600">
                  {match.partnerDowns} knock{match.partnerDowns === 1 ? '' : 's'}
                  {match.reboots > 0 && ` · ${match.reboots} rebuilt`}
                </span>
              )}
            </div>
          )}
          <pre className="whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-500">
            {match.detail.join('\n')}
          </pre>
        </div>
      )}
    </li>
  )
}
