// ---------------------------------------------------------------------------
// FINANCES
//
// Where the money comes from and where it goes. Sponsors pay the wages; prize
// money is the jackpot on top. If the net line is red for too many weeks in a
// row the org folds - see economy.bankruptcyGraceWeeks in balance.json.
// ---------------------------------------------------------------------------

import { BAL, getProgram } from '../engine/config'
import { weeklyBurn } from '../engine/game'
import type { GameState, Player } from '../engine/types'
import { money, sortPlayers } from './components'
import { PlayerLink } from './PlayerSheet'

function Row({
  label,
  value,
  tone,
  sub,
  strong,
}: {
  label: string
  value: string
  tone?: string
  sub?: string
  strong?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        strong ? 'border-t border-[var(--line-bright)] pt-2' : ''
      }`}
    >
      <span className={strong ? 'text-[13px] font-extrabold uppercase tracking-wider' : 'text-[13px]'}>
        {label}
        {sub && <span className="ml-2 text-[10px] text-[var(--text-faint)]">{sub}</span>}
      </span>
      <span className={`k-num ${strong ? 'text-[15px]' : 'text-[13px]'}`} style={{ color: tone }}>
        {value}
      </span>
    </div>
  )
}

export default function Finances({ state }: { state: GameState }) {
  const roster = sortPlayers(state.rosterIds.map((id) => state.players[id]).filter(Boolean) as Player[])
  const last = state.finances[state.finances.length - 1]
  const burn = weeklyBurn(state)
  const history = state.finances.slice(-14)

  const wages = roster.reduce((a, p) => a + p.salary, 0)
  const trainingBill = roster.reduce((a, p) => a + getProgram(p.trainingProgram).costPerWeek, 0)
  const overhead = BAL.economy.weeklyOverhead
  const sponsors = Math.round(
    BAL.economy.baseSponsorIncomePerWeek +
      state.fans * BAL.economy.sponsorIncomePerFanPerWeek * (1 + state.reputation / 100),
  )
  const projected = sponsors - wages - overhead - trainingBill
  const totalPrize = state.results.reduce((a, r) => a + r.prize, 0)
  const runway = projected >= 0 ? Infinity : Math.floor(state.cash / -projected)

  const maxAbs = Math.max(1, ...history.map((f) => Math.abs(f.net)))

  return (
    <div className="space-y-4">
      <section className="panel cut p-5">
        <div className="label">The books</div>
        <h1 className="hud-huge mt-1">
          {money(state.cash)}
          <span
            className="ml-4 text-[0.4em]"
            style={{ color: projected >= 0 ? 'var(--good)' : 'var(--bad)' }}
          >
            {projected >= 0 ? '+' : ''}
            {money(projected)}/wk
          </span>
        </h1>
        <p className="mt-2 text-[12px] text-[var(--text-dim)]">
          {projected >= 0 ? (
            <>You are profitable before prize money. Everything you win is upside.</>
          ) : runway > 0 ? (
            <>
              Losing money every week. At this rate you have{' '}
              <span className="font-bold text-[var(--accent-warm)]">{runway} weeks</span> of cash
              left — win something or cut wages.
            </>
          ) : (
            <span className="text-[var(--bad)]">
              You are out of money. The org folds after{' '}
              {BAL.economy.bankruptcyGraceWeeks} weeks in the red.
            </span>
          )}
        </p>
        {state.negativeWeeks > 0 && (
          <p className="mt-2 text-[12px] text-[var(--bad)]">
            {state.negativeWeeks} of {BAL.economy.bankruptcyGraceWeeks} grace weeks used.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ---- Projection ---- */}
        <section className="panel p-4">
          <h2 className="hud-title rule-accent mb-3">Next week, projected</h2>
          <Row label="Sponsors" value={`+${money(sponsors)}`} tone="var(--good)" sub={`${state.fans.toLocaleString()} fans`} />
          <Row label="Wages" value={`-${money(wages)}`} tone="var(--bad)" sub={`${roster.length} players`} />
          <Row label="Training" value={`-${money(trainingBill)}`} tone="var(--bad)" />
          <Row label="Overhead" value={`-${money(overhead)}`} tone="var(--bad)" />
          <Row
            label="Net"
            value={`${projected >= 0 ? '+' : ''}${money(projected)}`}
            tone={projected >= 0 ? 'var(--good)' : 'var(--bad)'}
            strong
          />
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-faint)]">
            Prize money is not in this projection — it only lands if you actually place. Weekly
            burn including training is {money(burn)}.
          </p>
        </section>

        {/* ---- Last week actual ---- */}
        <section className="panel p-4">
          <h2 className="hud-title rule-accent mb-3">
            {last ? `Week ${last.week}, actual` : 'Last week'}
          </h2>
          {!last ? (
            <p className="py-6 text-center text-[12px] text-[var(--text-faint)]">
              Advance a week and the books show up here.
            </p>
          ) : (
            <>
              <Row label="Sponsors" value={`+${money(last.sponsors)}`} tone="var(--good)" />
              <Row label="Prize money" value={`+${money(last.prizes)}`} tone="var(--accent-warm)" />
              <Row label="Wages" value={`-${money(last.salaries)}`} tone="var(--bad)" />
              <Row label="Training" value={`-${money(last.training)}`} tone="var(--bad)" />
              <Row label="Scouting" value={`-${money(last.scouting)}`} tone="var(--bad)" />
              <Row label="Overhead" value={`-${money(last.overhead)}`} tone="var(--bad)" />
              <Row
                label="Net"
                value={`${last.net >= 0 ? '+' : ''}${money(last.net)}`}
                tone={last.net >= 0 ? 'var(--good)' : 'var(--bad)'}
                strong
              />
            </>
          )}
        </section>

        {/* ---- Career ---- */}
        <section className="panel p-4">
          <h2 className="hud-title rule-accent mb-3">Career</h2>
          <Row label="Prize money won" value={money(totalPrize)} tone="var(--accent-warm)" />
          <Row label="Events played" value={String(state.results.length)} />
          <Row label="Event titles" value={String(state.results.filter((r) => r.rank === 1).length)} />
          <Row label="Reputation" value={`${state.reputation.toFixed(1)} / ${BAL.economy.reputationMax}`} />
          <Row label="Fans" value={state.fans.toLocaleString()} />
          <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-faint)]">
            Reputation grows fans, fans pay sponsors, sponsors pay wages. That loop is the whole
            economy — winning is how you start it.
          </p>
        </section>
      </div>

      {/* ---- Net history ---- */}
      {history.length > 0 && (
        <section className="panel p-4">
          <h2 className="hud-title rule-accent mb-3">Net by week</h2>
          <div className="flex h-32 gap-1">
            {history.map((f) => {
              const h = Math.max(2, (Math.abs(f.net) / maxAbs) * 100)
              return (
                <div key={f.week} className="flex flex-1 flex-col">
                  {/* This wrapper must be a full-height flex child, otherwise the
                      bar's percentage height has nothing to resolve against. */}
                  <div className="flex flex-1 flex-col justify-end">
                    <div
                      title={`Week ${f.week}: ${money(f.net)}`}
                      style={{
                        height: `${h}%`,
                        background: f.net >= 0 ? 'var(--good)' : 'var(--bad)',
                        opacity: 0.85,
                      }}
                    />
                  </div>
                  <span className="mt-1 text-center text-[9px] text-[var(--text-faint)]">
                    {f.week}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ---- Wage bill ---- */}
      <section className="panel p-4">
        <h2 className="hud-title rule-accent mb-3">Wage bill</h2>
        {roster.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-[var(--text-faint)]">
            Nobody on the books.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="label border-b border-[var(--line)] text-left">
                <th className="pb-1.5">Player</th>
                <th className="pb-1.5">Program</th>
                <th className="pb-1.5 text-right">Contract</th>
                <th className="pb-1.5 text-right">Training</th>
                <th className="pb-1.5 text-right">Wage</th>
                <th className="pb-1.5 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.id} className="border-b border-[var(--line)]/60 last:border-0">
                  <td className="py-1.5">
                    <PlayerLink playerId={p.id}>{p.tag}</PlayerLink>
                  </td>
                  <td className="py-1.5 text-[11px] text-[var(--text-dim)]">
                    {getProgram(p.trainingProgram).name}
                  </td>
                  <td
                    className="py-1.5 text-right text-[11px]"
                    style={{
                      color:
                        p.contractWeeks <= 0
                          ? 'var(--bad)'
                          : p.contractWeeks <= 4
                            ? 'var(--accent-warm)'
                            : undefined,
                    }}
                  >
                    {p.contractWeeks <= 0 ? 'EXPIRED' : `${p.contractWeeks} wks`}
                  </td>
                  <td className="k-num py-1.5 text-right text-[11px] text-[var(--text-dim)]">
                    {money(getProgram(p.trainingProgram).costPerWeek)}
                  </td>
                  <td className="k-num py-1.5 text-right">{money(p.salary)}</td>
                  <td className="k-num py-1.5 text-right text-[11px] text-[var(--text-faint)]">
                    {wages > 0 ? `${Math.round((p.salary / wages) * 100)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 text-[13px] font-extrabold uppercase tracking-wider" colSpan={4}>
                  Total
                </td>
                <td className="k-num pt-2 text-right text-[15px]">{money(wages)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
