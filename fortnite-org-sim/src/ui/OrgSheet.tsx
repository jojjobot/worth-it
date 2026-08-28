// ---------------------------------------------------------------------------
// THE ORG SHEET
//
// Click any org mark anywhere in the game and this opens: who is on their
// books, which duos they field, and every time you have finished in the same
// lobby as them.
//
// Everything here is read off state - the roster from state.players, the duos
// from state.rivalDuos, the history from state.results[].rivals. Nothing is
// stored twice, so an org page can never disagree with the rest of the save.
//
// The scouting fog still applies: a rival's overall shows as a RANGE until you
// have scouted them, exactly as it does on the player sheet.
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getRegion } from '../engine/config'
import { viewOverall } from '../engine/players'
import { REAL_ORGS, realOrgColor } from '../engine/realPlayers'
import { computeSynergy, duoStrength } from '../engine/sim'
import type { GameState, Player, RivalDuo } from '../engine/types'
import { ArchetypeChip, EmptyState, money, ordinal, ratingColor } from './components'
import { PlayerLink } from './PlayerSheet'

// --- Opening the sheet from anywhere ---------------------------------------

interface OrgSheetApi {
  /** Open the org page for this org NAME (the same string players carry). */
  openOrg: (orgName: string) => void
}

const Ctx = createContext<OrgSheetApi>({ openOrg: () => {} })

/** Any screen can call this to make an org clickable. */
export function useOrgSheet(): OrgSheetApi {
  return useContext(Ctx)
}

export function OrgSheetProvider({ state, children }: { state: GameState; children: ReactNode }) {
  const [openName, setOpenName] = useState<string | null>(null)
  const openOrg = useCallback((orgName: string) => setOpenName(orgName), [])
  const api = useMemo(() => ({ openOrg }), [openOrg])

  return (
    <Ctx.Provider value={api}>
      {children}
      {openName && (
        <OrgSheet state={state} orgName={openName} onClose={() => setOpenName(null)} />
      )}
    </Ctx.Provider>
  )
}

// --- The mark ---------------------------------------------------------------

/**
 * An org's mark: their brand colour and their initials. There are no image
 * assets in this project, so a logo is drawn rather than loaded - which also
 * means a made-up org gets one for free.
 */
export function orgInitials(name: string): string {
  const words = name.replace(/[^\w\s.]/g, ' ').split(/[\s.]+/).filter(Boolean)
  if (words.length === 0) return '??'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function OrgMark({
  name,
  color,
  size = 34,
}: {
  name: string
  color: string
  size?: number
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-extrabold uppercase leading-none"
      style={{
        width: size,
        height: size,
        color,
        background: `${color}18`,
        border: `1px solid ${color}66`,
        borderLeft: `3px solid ${color}`,
        fontSize: Math.round(size * 0.36),
        letterSpacing: '0.02em',
      }}
      aria-hidden
    >
      {orgInitials(name)}
    </span>
  )
}

/** An org's mark plus name, rendered as a button that opens their page. */
export function OrgLink({
  name,
  color,
  size,
  children,
  className = '',
}: {
  name: string
  color: string
  size?: number
  children?: ReactNode
  className?: string
}) {
  const { openOrg } = useOrgSheet()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openOrg(name)
      }}
      title={`Open ${name}`}
      className={`group inline-flex items-center gap-2 text-left transition-opacity hover:opacity-80 ${className}`}
    >
      <OrgMark name={name} color={color} size={size} />
      {children}
    </button>
  )
}

// --- The page ---------------------------------------------------------------

/** The number actually on screen: the rating if known, the middle of the range if not. */
function shownOvr(v: { known: boolean; value: number; low: number; high: number }): number {
  return v.known ? v.value : (v.low + v.high) / 2
}

interface HistoryRow {
  week: number
  event: string
  tier: number
  lan: boolean
  theirRank: number
  theirPoints: number
  theirTags: string[]
  yourRank: number
  yourPoints: number
  fieldSize: number
}

function Fact({ label, value, tone, title }: {
  label: string
  value: string
  tone?: string
  title?: string
}) {
  return (
    <div title={title}>
      <div className="label">{label}</div>
      <div className="k-num text-[13px]" style={{ color: tone }}>
        {value}
      </div>
    </div>
  )
}

export function OrgSheet({
  state,
  orgName,
  onClose,
}: {
  state: GameState
  orgName: string
  onClose: () => void
}) {
  const isYou = orgName === state.orgName
  const def = REAL_ORGS.find((o) => o.name === orgName)
  const color = isYou ? 'var(--accent)' : (realOrgColor(orgName) ?? '#8892a6')

  // Roster: anybody carrying this org's name, whether or not they are in a duo.
  const roster = useMemo(() => {
    const owned = new Set(state.rosterIds)
    return Object.values(state.players)
      .filter((p) => p.orgName === orgName)
      .map((p) => ({ p, owned: owned.has(p.id), ovr: viewOverall(p, owned.has(p.id)) }))
      // Sort by what you can SEE, not by the true rating - ordering an
      // unscouted roster by its real overall would leak the fog away.
      .sort((a, b) => shownOvr(b.ovr) - shownOvr(a.ovr))
  }, [state.players, state.rosterIds, orgName])

  const duos = useMemo(() => {
    const rows: { key: string; label: string; players: Player[]; games: number }[] = []
    if (isYou) {
      for (const d of state.duos) {
        rows.push({
          key: d.id,
          label: d.name,
          players: d.playerIds.map((id) => (id ? state.players[id] : null)).filter((p): p is Player => !!p),
          games: d.gamesTogether,
        })
      }
    } else {
      // A duo belongs to this org if one of ITS PLAYERS does - not if the duo
      // happens to be labelled with the org name. That is what puts the
      // CGN Esports / AIGHT pairing on both of those orgs' pages.
      const theirs = state.rivalDuos.filter((r: RivalDuo) =>
        r.playerIds.some((id) => state.players[id]?.orgName === orgName),
      )
      for (const d of theirs) {
        rows.push({
          key: d.id,
          label: d.orgName,
          players: d.playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p),
          games: d.gamesTogether,
        })
      }
    }
    return rows.map((r) => ({
      ...r,
      strength: r.players.length === 2 ? duoStrength(r.players, r.games) : 0,
      synergy: computeSynergy(r.players, r.games).total,
    }))
  }, [state, orgName, isYou])

  // History: every event of yours this org also appears in. An org that fields
  // two duos shows up twice in the same event - both lines are kept.
  const history = useMemo<HistoryRow[]>(() => {
    const out: HistoryRow[] = []
    for (const res of state.results) {
      if (isYou) {
        out.push({
          week: res.week,
          event: res.name,
          tier: res.tier,
          lan: false,
          theirRank: res.rank,
          theirPoints: res.points,
          theirTags: res.playerTags,
          yourRank: res.rank,
          yourPoints: res.points,
          fieldSize: res.fieldSize,
        })
        continue
      }
      for (const s of res.rivals ?? []) {
        const theirs =
          s.orgName === orgName ||
          (s.playerIds ?? []).some((id) => state.players[id]?.orgName === orgName)
        if (!theirs) continue
        out.push({
          week: res.week,
          event: res.name,
          tier: res.tier,
          lan: false,
          theirRank: s.rank,
          theirPoints: s.points,
          theirTags: s.playerTags,
          yourRank: res.rank,
          yourPoints: res.points,
          fieldSize: res.fieldSize,
        })
      }
    }
    return out.reverse()
  }, [state.results, orgName, isYou])

  const met = history.length
  const beaten = history.filter((h) => !isYou && h.yourRank < h.theirRank).length
  const bestFinish = history.length > 0 ? Math.min(...history.map((h) => h.theirRank)) : null
  const avgFinish =
    history.length > 0
      ? history.reduce((a, h) => a + h.theirRank, 0) / history.length
      : null

  const bestPr = roster
    .map((r) => r.p.prRank)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b)[0]

  const topPower = duos.length > 0 ? Math.max(...duos.map((d) => d.strength)) : 0
  const region = def ? getRegion(def.region) : getRegion(isYou ? state.region : roster[0]?.p.region ?? state.region)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="panel my-6 w-full max-w-5xl p-5" onClick={(e) => e.stopPropagation()}>
        {/* ---------- Header ---------- */}
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-4">
            <OrgMark name={orgName} color={color} size={64} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold uppercase tracking-wide" style={{ color }}>
                  {orgName}
                </h2>
                {def && (
                  <span className="rounded border border-cyan-700/60 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-cyan-300">
                    REAL ORG
                  </span>
                )}
                {isYou && <span className="label text-[var(--accent)]">your org</span>}
              </div>
              <p className="mt-1 text-[12px] text-[var(--text-dim)]">
                {region.name} ({region.id}) · {roster.length}{' '}
                {roster.length === 1 ? 'player' : 'players'} · {duos.length}{' '}
                {duos.length === 1 ? 'duo' : 'duos'} fielded
                {!isYou && def && def.region !== state.region && ' · international events only'}
              </p>
            </div>
          </div>
          <button className="btn shrink-0" onClick={onClose}>
            Close
          </button>
        </header>

        {/* ---------- Facts ---------- */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Fact
            label="Best duo power"
            value={topPower > 0 ? topPower.toFixed(1) : '—'}
          />
          <Fact
            label="Best world rank"
            value={bestPr ? `#${bestPr}` : '—'}
            title="Epic Power Rankings, August 2026 snapshot. Factual, unlike the ratings."
          />
          <Fact label="Lobbies shared" value={met > 0 ? String(met) : 'none yet'} />
          <Fact
            label="Their best finish"
            value={bestFinish ? ordinal(bestFinish) : '—'}
            tone={bestFinish === 1 ? 'var(--accent-warm)' : undefined}
          />
          <Fact
            label="Their avg finish"
            value={avgFinish ? avgFinish.toFixed(1) : '—'}
          />
          {!isYou && (
            <Fact
              label="You finished above"
              value={met > 0 ? `${beaten} of ${met}` : '—'}
              tone={met > 0 ? (beaten * 2 >= met ? 'var(--good)' : 'var(--bad)') : undefined}
            />
          )}
        </div>

        {/* ---------- Duos ---------- */}
        <section className="mb-5">
          <div className="label mb-2">Duos fielded</div>
          {duos.length === 0 ? (
            <p className="text-[12px] text-[var(--text-faint)]">
              No duo on the board. Everyone here is on the books without a fixed partner.
            </p>
          ) : (
            <div className="space-y-2">
              {duos.map((d) => (
                <div key={d.key} className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-slate-800 bg-slate-950/40 p-2.5">
                  <div className="min-w-[12rem] flex-1">
                    {d.label !== orgName && (
                      <div className="label mb-1 text-[var(--text-faint)]">{d.label}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {d.players.map((p) => (
                        <span key={p.id} className="flex items-center gap-1.5 text-[12px]">
                          <ArchetypeChip id={p.archetype} small />
                          <PlayerLink playerId={p.id} className="text-[var(--text-dim)]">
                            {p.tag}
                          </PlayerLink>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="w-32 shrink-0">
                    <div className="h-1.5 w-full bg-[var(--panel-2)]">
                      <div
                        className="h-full"
                        style={{
                          width: `${topPower > 0 ? (d.strength / topPower) * 100 : 0}%`,
                          background: color,
                        }}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`k-num text-[15px] ${ratingColor(d.strength)}`}>
                      {d.strength.toFixed(1)}
                    </div>
                    <div className="label">team power</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className="k-num text-[13px]"
                      style={{
                        color:
                          d.synergy > 2 ? 'var(--good)' : d.synergy < -2 ? 'var(--bad)' : 'var(--text-dim)',
                      }}
                    >
                      {d.synergy >= 0 ? '+' : ''}
                      {d.synergy.toFixed(1)}
                    </div>
                    <div className="label">synergy</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="k-num text-[13px] text-[var(--text-dim)]">{d.games}</div>
                    <div className="label">games together</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- Roster ---------- */}
        <section className="mb-5">
          <div className="label mb-2">On the books</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-[12px]">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="label py-1.5 pr-3 font-normal">Player</th>
                  <th className="label py-1.5 pr-3 font-normal">Role</th>
                  <th className="label py-1.5 pr-3 text-right font-normal">Age</th>
                  <th className="label py-1.5 pr-3 text-right font-normal">OVR</th>
                  <th className="label py-1.5 pr-3 text-right font-normal">World</th>
                  <th className="label py-1.5 pr-3 text-right font-normal">Wage</th>
                  <th className="label py-1.5 pr-3 text-right font-normal">Buyout</th>
                  <th className="label py-1.5 pr-3 text-right font-normal">Contract</th>
                  <th className="label py-1.5 font-normal">Plays with</th>
                </tr>
              </thead>
              <tbody>
                {roster.map(({ p, ovr }) => {
                  const inDuo = duos.find((d) => d.players.some((x) => x.id === p.id))
                  const partner = inDuo?.players.find((x) => x.id !== p.id)
                  return (
                    <tr key={p.id} className="border-b border-slate-900/80">
                      <td className="py-1.5 pr-3">
                        <PlayerLink playerId={p.id} className="font-semibold text-slate-200">
                          {p.tag}
                        </PlayerLink>
                      </td>
                      <td className="py-1.5 pr-3">
                        <ArchetypeChip id={p.archetype} small />
                      </td>
                      <td className="k-num py-1.5 pr-3 text-right text-[var(--text-dim)]">{p.age}</td>
                      <td className={`k-num py-1.5 pr-3 text-right ${ratingColor(ovr.value)}`}>
                        {ovr.known
                          ? Math.round(ovr.value)
                          : `${Math.round(ovr.low)}-${Math.round(ovr.high)}`}
                      </td>
                      <td className="k-num py-1.5 pr-3 text-right text-[var(--text-dim)]">
                        {p.prRank ? `#${p.prRank}` : '—'}
                      </td>
                      <td className="k-num py-1.5 pr-3 text-right text-[var(--text-dim)]">
                        {money(p.salary)}
                      </td>
                      <td className="k-num py-1.5 pr-3 text-right" style={{ color: p.buyout > 0 ? 'var(--accent-warm)' : 'var(--good)' }}>
                        {p.buyout > 0 ? money(p.buyout) : 'free'}
                      </td>
                      <td className="k-num py-1.5 pr-3 text-right text-[var(--text-dim)]">
                        {p.contractWeeks > 0 ? `${p.contractWeeks}w` : 'expired'}
                      </td>
                      <td className="py-1.5 text-[var(--text-faint)]">
                        {partner ? partner.tag : 'no fixed partner'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!isYou && (
            <p className="mt-2 text-[11px] text-[var(--text-faint)]">
              An OVR shown as a range is one you have not scouted far enough to pin down. Scout
              them and it narrows.
            </p>
          )}
        </section>

        {/* ---------- History ---------- */}
        <section>
          <div className="label mb-2">
            {isYou ? 'Your results' : 'Every lobby you have shared'}
          </div>
          {history.length === 0 ? (
            <EmptyState>
              {isYou
                ? 'You have not played an event yet.'
                : 'You have never finished an event alongside them. Enter something at their tier and this fills in.'}
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-[12px]">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="label py-1.5 pr-3 font-normal">Wk</th>
                    <th className="label py-1.5 pr-3 font-normal">Event</th>
                    <th className="label py-1.5 pr-3 font-normal">Duo</th>
                    <th className="label py-1.5 pr-3 text-right font-normal">Finish</th>
                    <th className="label py-1.5 pr-3 text-right font-normal">Pts</th>
                    {!isYou && <th className="label py-1.5 text-right font-normal">You</th>}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => {
                    const won = !isYou && h.yourRank < h.theirRank
                    return (
                      <tr key={`${h.week}-${h.event}-${i}`} className="border-b border-slate-900/80">
                        <td className="k-num py-1.5 pr-3 text-[var(--text-faint)]">{h.week}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{h.event}</td>
                        <td className="py-1.5 pr-3 text-[var(--text-faint)]">
                          {h.theirTags.join(' + ')}
                        </td>
                        <td
                          className="k-num whitespace-nowrap py-1.5 pr-3 text-right"
                          style={{ color: h.theirRank === 1 ? 'var(--accent-warm)' : undefined }}
                        >
                          {ordinal(h.theirRank)}
                          <span className="text-[var(--text-faint)]"> / {h.fieldSize}</span>
                        </td>
                        <td className="k-num py-1.5 pr-3 text-right text-[var(--text-dim)]">
                          {h.theirPoints}
                        </td>
                        {!isYou && (
                          <td
                            className="k-num py-1.5 text-right"
                            style={{ color: won ? 'var(--good)' : 'var(--bad)' }}
                            title={won ? 'You finished above them' : 'They finished above you'}
                          >
                            {ordinal(h.yourRank)}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
