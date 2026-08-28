import React, { useState } from 'react'
import { CATEGORIES, SUB_BY_ID, getArchetype, getRegion } from '../engine/config'
import {
  playerOverall,
  profileHighlights,
  viewCategory,
  viewOverall,
  viewPeakSub,
  viewSub,
} from '../engine/players'
import { realOrgColor } from '../engine/realPlayers'
import { PlayerLink } from './PlayerSheet'
import type { CategoryKey, Player, SubKey } from '../engine/types'

export function money(n: number): string {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function ratingColor(v: number): string {
  if (v >= 85) return 'text-cyan-300'
  if (v >= 72) return 'text-emerald-300'
  if (v >= 58) return 'text-slate-200'
  if (v >= 44) return 'text-amber-300'
  return 'text-rose-400'
}

export function ratingBg(v: number): string {
  if (v >= 85) return 'bg-cyan-400'
  if (v >= 72) return 'bg-emerald-400'
  if (v >= 58) return 'bg-slate-400'
  if (v >= 44) return 'bg-amber-400'
  return 'bg-rose-500'
}

export function Panel({
  title,
  right,
  children,
  className = '',
}: {
  title?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`panel p-4 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="label">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'default' | 'good' | 'bad'
}) {
  const toneClass =
    tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-400' : 'text-slate-100'
  return (
    <div className="panel px-3 py-2.5">
      <div className="label">{label}</div>
      <div className={`font-mono text-lg font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}

export function ArchetypeChip({ id, small = false }: { id: string; small?: boolean }) {
  const a = getArchetype(id)
  return (
    <span
      className={`inline-block rounded border px-1.5 font-mono font-semibold uppercase tracking-wider ${
        small ? 'text-[9px] py-0' : 'text-[10px] py-0.5'
      }`}
      style={{ color: a.color, borderColor: `${a.color}55`, background: `${a.color}12` }}
      title={a.blurb}
    >
      {a.short}
    </span>
  )
}

export function OvrBadge({ player, owned }: { player: Player; owned: boolean }) {
  const v = viewOverall(player, owned)
  const mid = Math.round((v.low + v.high) / 2)
  const band = Math.round((v.high - v.low) / 2)
  return (
    <div
      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded border border-slate-700 bg-slate-950"
      title={v.known ? 'Overall rating' : `Estimated overall: ${v.low}-${v.high}`}
    >
      <span
        className={`font-mono text-lg font-bold leading-none ${v.known ? ratingColor(v.value) : 'text-slate-400'}`}
      >
        {v.known ? Math.round(v.value) : mid}
      </span>
      <span className="text-[8px] uppercase tracking-widest text-slate-500">
        {v.known ? 'OVR' : `±${band}`}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE RATING TREE
//
// Seven category rollups, each one expandable to its sub-stats. The category
// number is a weighted average and is DISPLAY ONLY - the match engine reads the
// sub-stats underneath it.
//
// The faint tick on each bar is the player's PEAK. It is only drawn for players
// you own, or unsigned players you have scouted far enough - and it is never
// printed as an exact number.
// ---------------------------------------------------------------------------

/** One bar: a filled current value, an optional shaded uncertainty band, and a peak tick. */
function RatingBar({
  low,
  high,
  value,
  known,
  peak,
  thick = false,
}: {
  low: number
  high: number
  value: number
  known: boolean
  peak?: { low: number; high: number } | null
  thick?: boolean
}) {
  return (
    <div
      className={`relative flex-1 overflow-hidden rounded-full bg-slate-800 ${thick ? 'h-2' : 'h-1.5'}`}
    >
      {known ? (
        <div
          className={`h-full rounded-full ${ratingBg(value)}`}
          style={{ width: `${clampPct(value)}%` }}
        />
      ) : (
        <div
          className="absolute h-full rounded-full bg-slate-600/70"
          style={{ left: `${clampPct(low)}%`, width: `${Math.max(1, clampPct(high) - clampPct(low))}%` }}
        />
      )}
      {peak && (
        <div
          className="absolute top-0 h-full border-l border-dashed border-slate-300/45"
          style={{ left: `${clampPct((peak.low + peak.high) / 2)}%` }}
        />
      )}
    </div>
  )
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v))
}

function SubRow({ player, sub, owned }: { player: Player; sub: SubKey; owned: boolean }) {
  const view = viewSub(player, sub, owned)
  const peak = viewPeakSub(player, sub, owned)
  const def = SUB_BY_ID[sub]
  const headroom = peak ? peak.value - view.value : 0
  return (
    <div
      className="flex items-center gap-2 py-[1px]"
      title={
        def.desc +
        (peak ? `\n\nCeiling: roughly ${peak.low}-${peak.high} (${headroom > 1 ? `+${Math.round(headroom)} to go` : 'about there already'})` : '')
      }
    >
      <span className="w-[104px] shrink-0 truncate text-[11px] text-slate-400">{def.name}</span>
      <RatingBar
        low={view.low}
        high={view.high}
        value={view.value}
        known={view.known}
        peak={peak}
      />
      <span
        className={`w-12 shrink-0 text-right font-mono text-[11px] ${
          view.known ? ratingColor(view.value) : 'text-slate-500'
        }`}
      >
        {view.known ? Math.round(view.value) : `${view.low}-${view.high}`}
      </span>
    </div>
  )
}

function CategoryBlock({
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

  return (
    <div className="rounded border border-slate-800/80 bg-slate-950/40">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-slate-900/60"
        title={def.blurb}
      >
        <span
          className="w-4 shrink-0 text-center font-mono text-[10px] text-slate-500"
          aria-hidden
        >
          {open ? '−' : '+'}
        </span>
        <span
          className="w-[74px] shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: def.color }}
        >
          {def.short}
        </span>
        <RatingBar
          low={view.low}
          high={view.high}
          value={view.value}
          known={view.known}
          thick
        />
        <span
          className={`w-12 shrink-0 text-right font-mono text-xs font-semibold ${
            view.known ? ratingColor(view.value) : 'text-slate-500'
          }`}
        >
          {view.known ? view.value.toFixed(1) : `${view.low}-${view.high}`}
        </span>
      </button>

      {open && (
        <div className="space-y-px border-t border-slate-800/80 px-2 py-1.5 pl-6">
          {def.subs.map((s) => (
            <SubRow key={s.id} player={player} sub={s.id} owned={owned} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The full 7-category tree. Categories start collapsed; click one to see the
 * sub-stats the match engine actually reads.
 */
export function RatingTree({
  player,
  owned,
  defaultOpen = [],
}: {
  player: Player
  owned: boolean
  defaultOpen?: CategoryKey[]
}) {
  const [open, setOpen] = useState<Set<CategoryKey>>(new Set(defaultOpen))
  const allOpen = open.size === CATEGORIES.length

  const toggle = (id: CategoryKey) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="label">Attributes</span>
        <button
          className="text-[10px] uppercase tracking-wider text-slate-500 transition hover:text-cyan-300"
          onClick={() =>
            setOpen(allOpen ? new Set() : new Set(CATEGORIES.map((c) => c.id as CategoryKey)))
          }
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {CATEGORIES.map((c) => (
        <CategoryBlock
          key={c.id}
          player={player}
          category={c.id as CategoryKey}
          owned={owned}
          open={open.has(c.id as CategoryKey)}
          onToggle={() => toggle(c.id as CategoryKey)}
        />
      ))}
      <p className="pt-0.5 text-[10px] leading-relaxed text-slate-600">
        Category numbers are a weighted average for display only — the match engine always reads the
        individual sub-stats. The dashed tick on a bar is their hidden ceiling.
      </p>
    </div>
  )
}

/** The "2-3 strengths / 2-3 weaknesses" read, only shown once fully scouted. */
export function Highlights({ player, owned }: { player: Player; owned: boolean }) {
  const fullyKnown = owned || player.scoutLevel >= 4
  if (!fullyKnown) {
    return (
      <p className="text-[11px] italic text-slate-500">
        Scout further to see their real strengths and weaknesses.
      </p>
    )
  }
  const { strengths, weaknesses } = profileHighlights(player)
  return (
    <div className="space-y-1 text-[11px]">
      <div>
        <span className="text-emerald-400">STRONG </span>
        <span className="text-slate-300">
          {strengths.map((k) => SUB_BY_ID[k].name).join(', ') || 'nothing stands out'}
        </span>
      </div>
      <div>
        <span className="text-rose-400">WEAK </span>
        <span className="text-slate-300">
          {weaknesses.map((k) => SUB_BY_ID[k].name).join(', ') || 'no glaring holes'}
        </span>
      </div>
    </div>
  )
}

export function PlayerHeader({
  player,
  owned,
  right,
}: {
  player: Player
  owned: boolean
  right?: React.ReactNode
}) {
  const region = getRegion(player.region)
  return (
    <div className="flex items-start gap-3">
      <OvrBadge player={player} owned={owned} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <PlayerLink
            playerId={player.id}
            className="truncate font-semibold text-slate-100"
            title={`Open ${player.tag}'s full stat sheet`}
          >
            {player.tag}
          </PlayerLink>
          {player.isReal && (
            <span
              className="rounded border border-cyan-700/60 bg-cyan-500/10 px-1 py-0 font-mono text-[9px] font-semibold uppercase tracking-wider text-cyan-300"
              title="One of the 17 real reference players. Ratings are estimates calibrated to public results."
            >
              REAL
            </span>
          )}
          <ArchetypeChip id={player.archetype} />
          <span className="font-mono text-[10px] text-slate-500">
            {region.id} · {player.age}y
          </span>
          {player.lanAppearances > 0 && (
            <span
              className="font-mono text-[10px] text-slate-500"
              title="LAN and Grand Final appearances. This is what grows Big Stage Nerve."
            >
              · {player.lanAppearances} LAN
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {player.orgName ? (
            <span style={{ color: realOrgColor(player.orgName) ?? undefined }}>
              {player.orgName}
            </span>
          ) : (
            'Free agent'
          )}{' '}
          · {money(player.salary)}/wk
          {player.buyout > 0 && ` · buyout ${money(player.buyout)}`}
        </div>
      </div>
      {right}
    </div>
  )
}

/**
 * The extra context strip shown for one of the 17 real reference players:
 * their org, their Power Ranking, who they duo with, and the author note that
 * explains why they are rated the way they are.
 *
 * The ratings themselves are ESTIMATES calibrated against public results, not
 * measured data - that caveat is surfaced here rather than buried in the JSON.
 */
export function RealPlayerCard({ player }: { player: Player }) {
  if (!player.isReal) return null
  const color = realOrgColor(player.orgName ?? '') ?? '#94a3b8'
  return (
    <div className="mt-2 rounded border border-slate-800 bg-slate-950/60 p-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span
          className="rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
          style={{ color, borderColor: `${color}55`, background: `${color}12` }}
        >
          {player.orgName}
        </span>
        {player.prRank !== undefined && (
          <span className="text-slate-400" title="Epic Power Rankings, August 2026 snapshot">
            World <span className="font-mono text-cyan-300">#{player.prRank}</span>
            <span className="text-slate-600"> · {player.pr?.toLocaleString()} PR</span>
          </span>
        )}
        {player.duo && (
          <span className="text-slate-500">
            duos with <span className="text-slate-300">{player.duo}</span>
          </span>
        )}
        {player.aliases && player.aliases.length > 0 && (
          <span className="text-slate-500">
            also known as <span className="text-slate-300">{player.aliases.join(', ')}</span>
          </span>
        )}
        {player.realName && <span className="text-slate-500">{player.realName}</span>}
      </div>
      {player.note && (
        <p className="mt-1.5 text-[11px] italic leading-relaxed text-slate-400">{player.note}</p>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">
        Ratings are estimates calibrated to public tournament results, not measured data. Only the
        Power Ranking, org, region and age are factual.
      </p>
    </div>
  )
}

export function BurnoutBar({ value }: { value: number }) {
  const tone = value > 70 ? 'bg-rose-500' : value > 40 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="flex items-center gap-2">
      <span className="label">Burnout</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-[10px] text-slate-500">{Math.round(value)}</span>
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

export function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => playerOverall(b) - playerOverall(a))
}
