import React from 'react'
import { ATTR_LABELS, ATTR_ORDER, getArchetype, getRegion } from '../engine/config'
import { overall, profileHighlights, viewAttr, viewOverall } from '../engine/players'
import type { AttrKey, Player } from '../engine/types'

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
        {v.known ? v.value : mid}
      </span>
      <span className="text-[8px] uppercase tracking-widest text-slate-500">
        {v.known ? 'OVR' : `±${band}`}
      </span>
    </div>
  )
}

/** One attribute row: bar plus number, or a shaded band when unscouted. */
export function AttrRow({
  player,
  attr,
  owned,
}: {
  player: Player
  attr: AttrKey
  owned: boolean
}) {
  const view = viewAttr(player, attr, owned)
  const label = ATTR_LABELS[attr]
  return (
    <div className="flex items-center gap-2" title={label.desc}>
      <span className="w-10 shrink-0 font-mono text-[10px] uppercase text-slate-500">
        {label.short}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        {view.known ? (
          <div
            className={`h-full rounded-full ${ratingBg(view.value)}`}
            style={{ width: `${view.value}%` }}
          />
        ) : (
          <div
            className="h-full rounded-full bg-slate-600/70"
            style={{ left: `${view.low}%`, width: `${view.high - view.low}%`, position: 'absolute' }}
          />
        )}
      </div>
      <span
        className={`w-14 shrink-0 text-right font-mono text-[11px] ${
          view.known ? ratingColor(view.value) : 'text-slate-500'
        }`}
      >
        {view.known ? Math.round(view.value) : `${view.low}-${view.high}`}
      </span>
    </div>
  )
}

export function AttrGrid({ player, owned }: { player: Player; owned: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {ATTR_ORDER.map((attr) => (
        <AttrRow key={attr} player={player} attr={attr} owned={owned} />
      ))}
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
          {strengths.map((k) => ATTR_LABELS[k].name).join(', ') || 'nothing stands out'}
        </span>
      </div>
      <div>
        <span className="text-rose-400">WEAK </span>
        <span className="text-slate-300">
          {weaknesses.map((k) => ATTR_LABELS[k].name).join(', ') || 'no glaring holes'}
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
          <span className="truncate font-semibold text-slate-100">{player.tag}</span>
          <ArchetypeChip id={player.archetype} />
          <span className="font-mono text-[10px] text-slate-500">
            {region.id} · {player.age}y
          </span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {player.orgName ? player.orgName : 'Free agent'} · {money(player.salary)}/wk
          {player.buyout > 0 && ` · buyout ${money(player.buyout)}`}
        </div>
      </div>
      {right}
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
  return [...players].sort((a, b) => overall(b.attrs) - overall(a.attrs))
}
