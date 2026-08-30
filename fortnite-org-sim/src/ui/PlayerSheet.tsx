// ---------------------------------------------------------------------------
// THE PLAYER PROFILE
//
// Click any player anywhere in the game and this opens. It is a TABBED page
// (design brief Part 7): a header that never changes, and eight tabs beneath
// it. Only the open tab is rendered, so the expensive ones cost nothing until
// they are asked for.
//
// THE HEADER SHOWS: gamertag, org, region, age, archetype, duo, CURRENT
// overall, PR rank and contract status. It never shows peak. Their ceiling is
// a scouting matter and lives further down.
//
// The scouting fog applies throughout. For a player you have not signed you
// see RANGES, not numbers, and their ceiling is a phrase rather than a rating
// until you have scouted them far enough. Signing somebody reveals everything.
//
// Tabs 2 to 8 are named here but arrive later in the build order - each one
// says which step brings it, rather than showing an empty shell.
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CATEGORIES, getArchetype, getRegion, ratingBand } from '../engine/config'
import {
  categoryScores,
  profileHighlights,
  viewCategory,
  viewOverall,
  viewPeakOverall,
  viewPeakSub,
  viewSub,
} from '../engine/players'
import { realOrgColor } from '../engine/realPlayers'
import type { CategoryKey, GameState, Player, SubKey } from '../engine/types'
import { OrgMark, useOrgSheet } from './OrgSheet'
import { BandLegend, CategoryRadar } from './Radar'
import { ArchetypeChip, money, ordinal, RealPlayerCard } from './components'

// --- Opening the sheet from anywhere ---------------------------------------

interface PlayerSheetApi {
  /** Open the full profile for this player id. */
  openPlayer: (playerId: string) => void
}

const Ctx = createContext<PlayerSheetApi>({ openPlayer: () => {} })

/** Any screen can call this to make a player clickable. */
export function usePlayerSheet(): PlayerSheetApi {
  return useContext(Ctx)
}

export function PlayerSheetProvider({
  state,
  children,
}: {
  state: GameState
  children: ReactNode
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const openPlayer = useCallback((playerId: string) => setOpenId(playerId), [])
  const api = useMemo(() => ({ openPlayer }), [openPlayer])
  const player = openId ? state.players[openId] : null

  return (
    <Ctx.Provider value={api}>
      {children}
      {player && (
        <PlayerSheet
          player={player}
          owned={state.rosterIds.includes(player.id)}
          state={state}
          onClose={() => setOpenId(null)}
        />
      )}
    </Ctx.Provider>
  )
}

/** A player's name, rendered as a button that opens their profile. */
export function PlayerLink({
  playerId,
  children,
  className = '',
  title,
}: {
  playerId: string
  children: ReactNode
  className?: string
  title?: string
}) {
  const { openPlayer } = usePlayerSheet()
  return (
    <button
      type="button"
      title={title ?? 'Open full profile'}
      onClick={(e) => {
        e.stopPropagation()
        openPlayer(playerId)
      }}
      className={`text-left underline decoration-slate-700 decoration-dotted underline-offset-2 transition hover:text-cyan-300 hover:decoration-cyan-500 ${className}`}
    >
      {children}
    </button>
  )
}

// --- The tabs --------------------------------------------------------------

type TabId =
  | 'attributes'
  | 'badges'
  | 'playstyles'
  | 'career'
  | 'highs'
  | 'advanced'
  | 'scouting'
  | 'chemistry'

interface TabDef {
  id: TabId
  label: string
  /** Build-order step that delivers it. undefined = it is here now. */
  step?: number
  /** What it will hold, shown in the placeholder. */
  blurb: string
}

const TABS: TabDef[] = [
  {
    id: 'attributes',
    label: 'Attributes',
    blurb: 'All 7 categories, all 29 sub-stats, and the category radar.',
  },
  {
    id: 'badges',
    label: 'Badges',
    step: 9,
    blurb:
      'Earned badges with their tier, and locked ones spelling out exactly what is missing - the attribute gate and the challenge, with a progress bar counted from real match events.',
  },
  {
    id: 'playstyles',
    label: 'Playstyles',
    step: 8,
    blurb:
      'The 2 to 4 things this player actually does in a match, in plain English. Hidden behind scouting level 2 for anyone you have not signed - it is the main reason to scout.',
  },
  {
    id: 'career',
    label: 'Career',
    step: 12,
    blurb:
      'Season by season: org, partner, events, best finish, titles and earnings, with major honours underneath.',
  },
  {
    id: 'highs',
    label: 'Career highs',
    step: 12,
    blurb:
      'Most elims in a game, most points in a session, best FNCS finish, longest top-10 streak, biggest single payday - each with the event and the date.',
  },
  {
    id: 'advanced',
    label: 'Advanced stats',
    step: 12,
    blurb:
      'Everything computed from real match events, never stored: average placement, top-10 rate, contest win rate, average mats entering zone 8, 1vX conversion, and the LAN versus online split that exposes a stage-fright player.',
  },
  {
    id: 'scouting',
    label: 'Scouting',
    step: 12,
    blurb:
      'The scouting ladder for an unsigned player, level 0 to 3, with a ceiling confidence band that narrows as you learn more. For your own players this tab becomes their contract instead.',
  },
  {
    id: 'chemistry',
    label: 'Duo chemistry',
    step: 12,
    blurb:
      'Synergy out of 100 from communication, adaptivity, games played together and archetype fit - who covers whose weakness, results with past partners, and a real best-fit recommendation.',
  },
]

function TabPlaceholder({ tab }: { tab: TabDef }) {
  return (
    <div className="rounded border border-dashed border-slate-800 bg-slate-950/40 p-6 text-center">
      <div className="label mb-2">{tab.label}</div>
      <p className="mx-auto max-w-lg text-[12px] leading-relaxed text-slate-500">{tab.blurb}</p>
      <p className="mt-3 font-mono text-[11px] text-slate-600">
        Not built yet - it arrives at build step {tab.step}.
      </p>
    </div>
  )
}

// --- Tab 1: attributes -----------------------------------------------------

function SubStatRow({ player, sub, owned }: { player: Player; sub: SubKey; owned: boolean }) {
  const view = viewSub(player, sub, owned)
  const peak = viewPeakSub(player, sub, owned)
  const def = CATEGORIES.flatMap((c) => c.subs).find((s) => s.id === sub)!
  const headroom = peak ? peak.value - view.value : 0
  const band = ratingBand(view.known ? view.value : (view.low + view.high) / 2)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,7rem)_4.5rem] items-center gap-2 py-[3px]">
      <span className="truncate text-[12px] text-slate-300" title={def.desc}>
        {def.name}
      </span>

      <span
        className="text-right font-mono text-[13px] font-semibold"
        style={{ color: view.known ? band.hex : '#94a3b8' }}
        title={view.known ? band.label : 'Estimated range - scout them to narrow it'}
      >
        {view.known ? Math.round(view.value) : `${view.low}-${view.high}`}
      </span>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800">
        {view.known ? (
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, view.value))}%`,
              background: band.hex,
            }}
          />
        ) : (
          <div
            className="absolute h-full rounded-full bg-slate-600/70"
            style={{
              left: `${Math.max(0, Math.min(100, view.low))}%`,
              width: `${Math.max(1, Math.min(100, view.high) - Math.max(0, view.low))}%`,
            }}
          />
        )}
        {peak && (
          <div
            className="absolute top-0 h-full border-l border-dashed border-slate-300/50"
            style={{ left: `${Math.max(0, Math.min(100, (peak.low + peak.high) / 2))}%` }}
          />
        )}
      </div>

      <span
        className="text-right font-mono text-[11px] text-slate-500"
        title="Their hidden ceiling in this sub-stat. Always an estimate."
      >
        {peak ? (headroom >= 1 ? `+${Math.round(headroom)}` : 'max') : '·'}
      </span>
    </div>
  )
}

function CategorySection({
  player,
  category,
  owned,
  open,
  onToggle,
}: {
  player: Player
  category: CategoryKey
  owned: boolean
  open: boolean
  onToggle: () => void
}) {
  const def = CATEGORIES.find((c) => c.id === category)!
  const view = viewCategory(player, category, owned)
  const band = ratingBand(view.known ? view.value : (view.low + view.high) / 2)

  return (
    <section className="rounded border border-slate-800 bg-slate-950/50 p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-baseline justify-between gap-2 border-b border-slate-800/80 pb-1.5 text-left"
        title={open ? 'Collapse the sub-stats' : 'Expand to all sub-stats'}
      >
        <div className="min-w-0">
          <h3
            className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-widest"
            style={{ color: def.color }}
          >
            <span className="text-slate-600">{open ? '−' : '+'}</span>
            {def.name}
          </h3>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-600">{def.blurb}</p>
        </div>
        <span
          className="shrink-0 font-mono text-lg font-bold"
          style={{ color: view.known ? band.hex : '#94a3b8' }}
          title="Weighted average of the sub-stats below. Display only - the match engine reads the sub-stats."
        >
          {view.known ? view.value.toFixed(1) : `${view.low}-${view.high}`}
        </span>
      </button>

      {open && (
        <>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,7rem)_4.5rem] gap-2 pb-1">
            <span className="label">Sub-stat</span>
            <span className="label text-right">Now</span>
            <span className="label" />
            <span className="label text-right" title="Room left before they hit their ceiling">
              Left
            </span>
          </div>

          {def.subs.map((s) => (
            <SubStatRow key={s.id} player={player} sub={s.id as SubKey} owned={owned} />
          ))}
        </>
      )}
    </section>
  )
}

function Fact({ label, value, tone = 'text-slate-200', title }: {
  label: string
  value: string
  tone?: string
  title?: string
}) {
  return (
    <div title={title}>
      <div className="label">{label}</div>
      <div className={`font-mono text-[13px] ${tone}`}>{value}</div>
    </div>
  )
}

function AttributesTab({ player, owned }: { player: Player; owned: boolean }) {
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.id, true])),
  )
  const allOpen = CATEGORIES.every((c) => openCats[c.id])

  const scores = categoryScores(player.current)
  const { strengths, weaknesses } = profileHighlights(player)
  const fullyKnown = owned || player.scoutLevel >= 4

  const best = [...CATEGORIES].sort(
    (a, b) => scores[b.id as CategoryKey] - scores[a.id as CategoryKey],
  )[0]
  const worst = [...CATEGORIES].sort(
    (a, b) => scores[a.id as CategoryKey] - scores[b.id as CategoryKey],
  )[0]

  return (
    <>
      {/* ---------- Radar + the read ---------- */}
      <div className="mb-4 grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
          <CategoryRadar player={player} owned={owned} />
          <div className="mt-2 border-t border-slate-800/80 pt-2">
            <BandLegend />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
            <div className="label mb-1.5">The read</div>
            {fullyKnown ? (
              <ul className="space-y-1 text-[12px]">
                <li>
                  <span className="text-emerald-400">Best category </span>
                  <span className="text-slate-300">
                    {best.name} ({scores[best.id as CategoryKey].toFixed(1)})
                  </span>
                </li>
                <li>
                  <span className="text-rose-400">Worst category </span>
                  <span className="text-slate-300">
                    {worst.name} ({scores[worst.id as CategoryKey].toFixed(1)})
                  </span>
                </li>
                <li>
                  <span className="text-emerald-400">Standout </span>
                  <span className="text-slate-300">
                    {strengths
                      .map((k) => CATEGORIES.flatMap((c) => c.subs).find((s) => s.id === k)!.name)
                      .join(', ') || 'nothing stands out'}
                  </span>
                </li>
                <li>
                  <span className="text-rose-400">Holes </span>
                  <span className="text-slate-300">
                    {weaknesses
                      .map((k) => CATEGORIES.flatMap((c) => c.subs).find((s) => s.id === k)!.name)
                      .join(', ') || 'no glaring holes'}
                  </span>
                </li>
              </ul>
            ) : (
              <p className="text-[12px] italic text-slate-500">
                Scout them to level 4 and this becomes a real read. Right now every number on this
                tab is a range.
              </p>
            )}
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
            <div className="label mb-1.5">Standing</div>
            <div className="grid grid-cols-2 gap-2">
              <Fact label="Wage" value={`${money(player.salary)}/wk`} />
              <Fact
                label="Buyout"
                value={player.buyout > 0 ? money(player.buyout) : 'free agent'}
                tone={player.buyout > 0 ? 'text-amber-300' : 'text-emerald-300'}
              />
              <Fact
                label="Ceiling"
                value={viewPeakOverall(player, owned)}
                title="Their hidden peak. Never an exact number - a coach estimates a ceiling, they do not read it off a screen. It is kept out of the header on purpose."
              />
              <Fact
                label="LANs"
                value={String(player.lanAppearances)}
                title="LAN and Grand Final appearances. The only thing that grows Big Stage Nerve."
              />
              <Fact label="Matches" value={player.matchesPlayed.toLocaleString()} />
              <Fact
                label="Scouted"
                value={owned ? 'signed' : `${player.scoutLevel}/4`}
                tone={owned || player.scoutLevel >= 4 ? 'text-emerald-300' : 'text-slate-200'}
              />
              <Fact
                label="Prize money"
                value={money(player.careerEarnings)}
                tone="text-emerald-300"
              />
              <Fact
                label="Burnout"
                value={`${Math.round(player.burnout)}/100`}
                tone={
                  player.burnout > 70
                    ? 'text-rose-400'
                    : player.burnout > 40
                      ? 'text-amber-300'
                      : 'text-slate-200'
                }
              />
            </div>
          </div>
        </div>
      </div>

      {player.isReal && (
        <div className="mb-4">
          <RealPlayerCard player={player} />
        </div>
      )}

      {/* ---------- Every category, every sub-stat ---------- */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="label">All 7 categories · all 29 sub-stats</h3>
        <div className="flex items-center gap-3">
          <p className="hidden max-w-md text-[10px] text-slate-600 sm:block">
            The big number on each category is a weighted average for display only. The match engine
            always reads the individual sub-stats.
          </p>
          <button
            type="button"
            className="btn shrink-0 !py-1 !text-[10px]"
            onClick={() =>
              setOpenCats(
                Object.fromEntries(CATEGORIES.map((c) => [c.id, !allOpen])) as Record<
                  string,
                  boolean
                >,
              )
            }
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        {CATEGORIES.map((c) => (
          <CategorySection
            key={c.id}
            player={player}
            category={c.id as CategoryKey}
            owned={owned}
            open={!!openCats[c.id]}
            onToggle={() => setOpenCats((prev) => ({ ...prev, [c.id]: !prev[c.id] }))}
          />
        ))}
      </div>

      {!owned && player.scoutLevel < 4 && (
        <p className="mt-3 rounded border border-slate-800 bg-slate-950/50 p-2.5 text-[11px] text-slate-500">
          You have not signed {player.tag}, so these are estimates. Every scout report narrows the
          ranges; signing them reveals the exact numbers.
        </p>
      )}
    </>
  )
}

// --- The profile itself ----------------------------------------------------

export function PlayerSheet({
  player,
  owned,
  state,
  onClose,
}: {
  player: Player
  owned: boolean
  state: GameState
  onClose: () => void
}) {
  const [tab, setTab] = useState<TabId>('attributes')

  const arch = getArchetype(player.archetype)
  const region = getRegion(player.region)
  const ovr = viewOverall(player, owned)
  const ovrBand = ratingBand(ovr.known ? ovr.value : (ovr.low + ovr.high) / 2)

  const duo = state.duos.find((d) => d.playerIds.includes(player.id))
  const rival = state.rivalDuos.find((d) => d.playerIds.includes(player.id))
  const orgColor = realOrgColor(player.orgName ?? '')
  const { openOrg } = useOrgSheet()

  const duoLabel = duo
    ? duo.name
    : rival
      ? `${rival.orgName} roster`
      : player.duo
        ? `with ${player.duo}`
        : 'no fixed duo'

  const contractLabel = owned
    ? player.contractWeeks > 0
      ? `${player.contractWeeks} wks left`
      : 'expired'
    : player.orgName
      ? player.contractWeeks > 0
        ? `under contract · ${player.contractWeeks} wks`
        : 'out of contract'
      : 'free agent'

  const activeTab = TABS.find((t) => t.id === tab)!

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="panel my-6 w-full max-w-5xl p-5" onClick={(e) => e.stopPropagation()}>
        {/* ---------- Header: always visible, never shows peak ---------- */}
        <header className="mb-3 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded border border-slate-700 bg-slate-950">
              <span
                className="font-mono text-2xl font-bold leading-none"
                style={{ color: ovr.known ? ovrBand.hex : '#94a3b8' }}
              >
                {ovr.known ? Math.round(ovr.value) : Math.round((ovr.low + ovr.high) / 2)}
              </span>
              <span className="mt-0.5 text-[8px] uppercase tracking-widest text-slate-500">
                {ovr.known ? 'OVR' : `±${Math.round((ovr.high - ovr.low) / 2)}`}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-slate-50">{player.tag}</h2>
                {player.isReal && (
                  <span className="rounded border border-cyan-700/60 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-cyan-300">
                    REAL
                  </span>
                )}
                <ArchetypeChip id={player.archetype} />
                {player.prRank !== undefined && (
                  <span
                    className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-400"
                    title="Epic Power Rankings world rank"
                  >
                    PR {ordinal(player.prRank)}
                  </span>
                )}
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[12px] text-slate-400">
                {player.orgName ? (
                  <button
                    type="button"
                    onClick={() => openOrg(player.orgName as string)}
                    title={`Open ${player.orgName}`}
                    className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
                    style={{ color: orgColor ?? undefined }}
                  >
                    <OrgMark name={player.orgName} color={orgColor ?? 'var(--accent)'} size={15} />
                    {player.orgName}
                  </button>
                ) : (
                  <span className="text-emerald-300">Free agent</span>
                )}
                {' · '}
                {region.name} ({region.id}) · {player.age} years old · {duoLabel}
                {' · '}
                <span
                  className={
                    contractLabel === 'free agent'
                      ? 'text-emerald-300'
                      : contractLabel.includes('expired') || contractLabel.includes('out of')
                        ? 'text-rose-400'
                        : 'text-slate-300'
                  }
                >
                  {contractLabel}
                </span>
              </p>

              <p className="mt-1 max-w-xl text-[11px] italic leading-relaxed text-slate-500">
                {arch.blurb}
              </p>
            </div>
          </div>

          <button className="btn shrink-0" onClick={onClose}>
            Close
          </button>
        </header>

        {/* ---------- Tab bar: scrolls sideways on a phone, never wraps ---------- */}
        <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-800 px-1 pb-px">
          {TABS.map((t) => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                title={t.step ? `${t.blurb} (build step ${t.step})` : t.blurb}
                className={`shrink-0 border-b-2 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                  active
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
                {t.step && <span className="ml-1.5 text-[9px] text-slate-600">soon</span>}
              </button>
            )
          })}
        </nav>

        {/* ---------- Only the open tab renders ---------- */}
        {tab === 'attributes' ? (
          <AttributesTab player={player} owned={owned} />
        ) : (
          <TabPlaceholder tab={activeTab} />
        )}
      </div>
    </div>
  )
}
