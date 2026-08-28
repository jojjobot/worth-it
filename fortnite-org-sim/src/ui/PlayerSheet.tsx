// ---------------------------------------------------------------------------
// THE PLAYER SHEET
//
// Click any player anywhere in the game and this opens: the complete rating
// tree, all 7 categories and all 29 sub-stats at once, with their hidden
// ceiling shown alongside.
//
// The scouting rules still apply here. For a player you have not signed you
// see RANGES, not numbers, and their ceiling is a phrase rather than a rating
// until you have scouted them far enough. Signing somebody reveals everything.
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CATEGORIES, getArchetype, getRegion } from '../engine/config'
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
import {
  ArchetypeChip,
  money,
  ordinal,
  ratingBg,
  ratingColor,
  RealPlayerCard,
} from './components'

// --- Opening the sheet from anywhere ---------------------------------------

interface PlayerSheetApi {
  /** Open the full stat sheet for this player id. */
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

/** A player's name, rendered as a button that opens their sheet. */
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
      title={title ?? 'Open full stat sheet'}
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

// --- The sheet itself ------------------------------------------------------

function SubStatRow({ player, sub, owned }: { player: Player; sub: SubKey; owned: boolean }) {
  const view = viewSub(player, sub, owned)
  const peak = viewPeakSub(player, sub, owned)
  const def = CATEGORIES.flatMap((c) => c.subs).find((s) => s.id === sub)!
  const headroom = peak ? peak.value - view.value : 0

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,7rem)_4.5rem] items-center gap-2 py-[3px]">
      <span className="truncate text-[12px] text-slate-300" title={def.desc}>
        {def.name}
      </span>

      <span
        className={`text-right font-mono text-[13px] font-semibold ${
          view.known ? ratingColor(view.value) : 'text-slate-400'
        }`}
      >
        {view.known ? Math.round(view.value) : `${view.low}-${view.high}`}
      </span>

      <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800">
        {view.known ? (
          <div
            className={`h-full rounded-full ${ratingBg(view.value)}`}
            style={{ width: `${Math.max(0, Math.min(100, view.value))}%` }}
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
}: {
  player: Player
  category: CategoryKey
  owned: boolean
}) {
  const def = CATEGORIES.find((c) => c.id === category)!
  const view = viewCategory(player, category, owned)

  return (
    <section className="rounded border border-slate-800 bg-slate-950/50 p-3">
      <header className="mb-2 flex items-baseline justify-between gap-2 border-b border-slate-800/80 pb-1.5">
        <div className="min-w-0">
          <h3
            className="font-mono text-[11px] font-bold uppercase tracking-widest"
            style={{ color: def.color }}
          >
            {def.name}
          </h3>
          <p className="mt-0.5 text-[10px] leading-snug text-slate-600">{def.blurb}</p>
        </div>
        <span
          className={`shrink-0 font-mono text-lg font-bold ${
            view.known ? ratingColor(view.value) : 'text-slate-400'
          }`}
          title="Weighted average of the sub-stats below. Display only - the match engine reads the sub-stats."
        >
          {view.known ? view.value.toFixed(1) : `${view.low}-${view.high}`}
        </span>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,7rem)_4.5rem] gap-2 pb-1">
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
  const arch = getArchetype(player.archetype)
  const region = getRegion(player.region)
  const ovr = viewOverall(player, owned)
  const scores = categoryScores(player.current)
  const { strengths, weaknesses } = profileHighlights(player)
  const fullyKnown = owned || player.scoutLevel >= 4

  const best = [...CATEGORIES].sort((a, b) => scores[b.id as CategoryKey] - scores[a.id as CategoryKey])[0]
  const worst = [...CATEGORIES].sort((a, b) => scores[a.id as CategoryKey] - scores[b.id as CategoryKey])[0]

  const duo = state.duos.find((d) => d.playerIds.includes(player.id))
  const rival = state.rivalDuos.find((d) => d.playerIds.includes(player.id))
  const orgColor = realOrgColor(player.orgName ?? '')
  const { openOrg } = useOrgSheet()

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel my-6 w-full max-w-5xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------- Header ---------- */}
        <header className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded border border-slate-700 bg-slate-950">
              <span
                className={`font-mono text-2xl font-bold leading-none ${
                  ovr.known ? ratingColor(ovr.value) : 'text-slate-400'
                }`}
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
                    <OrgMark
                      name={player.orgName}
                      color={orgColor ?? 'var(--accent)'}
                      size={15}
                    />
                    {player.orgName}
                  </button>
                ) : (
                  <span className="text-emerald-300">Free agent</span>
                )}
                {' · '}
                {region.name} ({region.id}) · {player.age} years old
                {duo && ` · plays in ${duo.name}`}
                {rival && !owned && ` · duos with the ${rival.orgName} roster`}
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

        {/* ---------- Facts ---------- */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Fact label="Wage" value={`${money(player.salary)}/wk`} />
          <Fact
            label="Buyout"
            value={player.buyout > 0 ? money(player.buyout) : 'free agent'}
            tone={player.buyout > 0 ? 'text-amber-300' : 'text-emerald-300'}
          />
          <Fact
            label="Contract"
            value={player.contractWeeks > 0 ? `${player.contractWeeks} wks` : 'expired'}
            tone={player.contractWeeks <= 0 ? 'text-rose-400' : player.contractWeeks <= 4 ? 'text-amber-300' : 'text-slate-200'}
          />
          <Fact
            label="Ceiling"
            value={viewPeakOverall(player, owned)}
            title="Their hidden peak. Never an exact number - a coach estimates a ceiling, they do not read it off a screen."
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
        </div>

        {player.isReal && <RealPlayerCard player={player} />}

        {/* ---------- Read ---------- */}
        <div className="my-4 grid gap-3 sm:grid-cols-2">
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
                Scout them to level 4 and this becomes a real read. Right now every number below is
                a range.
              </p>
            )}
          </div>

          <div className="rounded border border-slate-800 bg-slate-950/50 p-3">
            <div className="label mb-1.5">Career</div>
            <div className="grid grid-cols-2 gap-2">
              <Fact label="Prize money" value={money(player.careerEarnings)} tone="text-emerald-300" />
              <Fact label="Titles" value={String(player.careerTitles)} />
              <Fact
                label="Joined"
                value={player.joinedWeek ? `week ${player.joinedWeek}` : 'not your player'}
              />
              <Fact label="Burnout" value={`${Math.round(player.burnout)}/100`} tone={player.burnout > 70 ? 'text-rose-400' : player.burnout > 40 ? 'text-amber-300' : 'text-slate-200'} />
            </div>
          </div>
        </div>

        {/* ---------- Every category, every sub-stat ---------- */}
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="label">All 7 categories · all 29 sub-stats</h3>
          <p className="text-[10px] text-slate-600">
            The big number on each category is a weighted average for display only. The match engine
            always reads the individual sub-stats. &quot;Left&quot; is the room between where they
            are now and their hidden ceiling.
          </p>
        </div>

        <div className="grid items-start gap-3 lg:grid-cols-2">
          {CATEGORIES.map((c) => (
            <CategorySection
              key={c.id}
              player={player}
              category={c.id as CategoryKey}
              owned={owned}
            />
          ))}
        </div>

        {!owned && player.scoutLevel < 4 && (
          <p className="mt-3 rounded border border-slate-800 bg-slate-950/50 p-2.5 text-[11px] text-slate-500">
            You have not signed {player.tag}, so these are estimates. Every scout report narrows the
            ranges; signing them reveals the exact numbers.
          </p>
        )}

        {player.prRank !== undefined && (
          <p className="mt-3 text-[11px] text-slate-600">
            Power Ranking {ordinal(player.prRank)} in the world.
          </p>
        )}
      </div>
    </div>
  )
}
