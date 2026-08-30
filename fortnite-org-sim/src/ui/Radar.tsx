// ---------------------------------------------------------------------------
// THE CATEGORY RADAR
//
// A seven-sided web of the seven CATEGORY scores. Those scores are weighted
// averages of the sub-stats and exist only to be looked at - the match engine
// never reads them.
//
// Everything about the scale (where the centre sits, where the outer ring sits,
// how many guide rings) is in /src/data/attributes.json -> radar. Hand-drawn
// SVG, because this project ships no chart library.
//
// SCOUTING: for a player you have not signed, each category is a RANGE, not a
// number. We draw the range honestly - a band between the low polygon and the
// high polygon - instead of drawing the true value and pretending it is an
// estimate.
// ---------------------------------------------------------------------------

import { CATEGORIES, RADAR, RATING_BANDS, ratingBand } from '../engine/config'
import { viewCategory } from '../engine/players'
import type { CategoryKey, Player } from '../engine/types'

const SIZE = 260
const CENTRE = SIZE / 2
const RADIUS = 84 // leaves room for the labels outside the web

/** Where a value sits between the centre and the outer ring, 0..1. */
function norm(value: number): number {
  const span = RADAR.max - RADAR.min
  if (span <= 0) return 0
  return Math.max(0, Math.min(1, (value - RADAR.min) / span))
}

/** Vertex i of a regular polygon, first point straight up. */
function point(index: number, count: number, radius: number): [number, number] {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count
  return [CENTRE + Math.cos(angle) * radius, CENTRE + Math.sin(angle) * radius]
}

function polygon(radii: number[]): string {
  return radii
    .map((r, i) => {
      const [x, y] = point(i, radii.length, r)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export function CategoryRadar({ player, owned }: { player: Player; owned: boolean }) {
  const axes = CATEGORIES.map((c) => {
    const view = viewCategory(player, c.id as CategoryKey, owned)
    return { def: c, view }
  })
  const count = axes.length

  // What we are allowed to draw. For an unsigned player that is the range the
  // scouting report gives us, never the true number underneath it.
  const outer = axes.map((a) => norm(a.view.known ? a.view.value : a.view.high) * RADIUS)
  const inner = axes.map((a) => norm(a.view.known ? a.view.value : a.view.low) * RADIUS)
  const shownMid = axes.map((a) => (a.view.known ? a.view.value : (a.view.low + a.view.high) / 2))

  const ringCount = Math.max(1, RADAR.rings)
  const rings = Array.from({ length: ringCount }, (_, i) => ((i + 1) / ringCount) * RADIUS)

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-auto w-full max-w-[260px]"
        role="img"
        aria-label="Category radar"
      >
        {/* guide rings */}
        {rings.map((r, i) => (
          <polygon
            key={`ring-${i}`}
            points={polygon(Array(count).fill(r))}
            fill="none"
            stroke="var(--line)"
            strokeWidth={0.7}
          />
        ))}

        {/* spokes */}
        {axes.map((a, i) => {
          const [x, y] = point(i, count, RADIUS)
          return (
            <line
              key={`spoke-${a.def.id}`}
              x1={CENTRE}
              y1={CENTRE}
              x2={x}
              y2={y}
              stroke="var(--line)"
              strokeWidth={0.7}
            />
          )
        })}

        {/* the uncertainty band, unsigned players only */}
        {!axes[0].view.known && (
          <polygon points={polygon(outer)} fill="rgba(142,160,181,0.14)" stroke="none" />
        )}
        {!axes[0].view.known && (
          <polygon
            points={polygon(inner)}
            fill="var(--panel)"
            stroke="rgba(142,160,181,0.5)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
        )}

        {/* the shape itself */}
        <polygon
          points={polygon(axes[0].view.known ? outer : outer.map((v, i) => (v + inner[i]) / 2))}
          fill="rgba(53,224,255,0.13)"
          stroke="var(--accent)"
          strokeWidth={1.6}
        />

        {/* one dot per category, coloured by its band */}
        {axes.map((a, i) => {
          const r = a.view.known ? outer[i] : (outer[i] + inner[i]) / 2
          const [x, y] = point(i, count, r)
          return (
            <circle
              key={`dot-${a.def.id}`}
              cx={x}
              cy={y}
              r={2.6}
              fill={ratingBand(shownMid[i]).hex}
              stroke="#0b0f16"
              strokeWidth={0.8}
            />
          )
        })}

        {/* labels */}
        {axes.map((a, i) => {
          const [x, y] = point(i, count, RADIUS + 22)
          const anchor = x < CENTRE - 6 ? 'end' : x > CENTRE + 6 ? 'start' : 'middle'
          return (
            <g key={`label-${a.def.id}`}>
              <text
                x={x}
                y={y}
                textAnchor={anchor}
                fontSize={8.5}
                fontWeight={700}
                letterSpacing={1.1}
                fill={a.def.color}
              >
                {a.def.short}
              </text>
              <text
                x={x}
                y={y + 10}
                textAnchor={anchor}
                fontSize={9.5}
                fontFamily="ui-monospace, Menlo, Consolas, monospace"
                fontWeight={700}
                fill={ratingBand(shownMid[i]).hex}
              >
                {a.view.known
                  ? a.view.value.toFixed(1)
                  : `${Math.round(a.view.low)}-${Math.round(a.view.high)}`}
              </text>
            </g>
          )
        })}
      </svg>

      <p className="mt-1 text-center text-[10px] leading-snug text-slate-600">
        Web runs {RADAR.min} to {RADAR.max}
        {axes[0].view.known
          ? '. Category scores are display only.'
          : '. Dashed band = how little you actually know.'}
      </p>
    </div>
  )
}

/**
 * The key to the colour bands. Reads attributes.json -> displayBands, so if you
 * add a band there it appears here without anybody touching this file.
 */
export function BandLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {RATING_BANDS.map((b, i) => {
        const above = RATING_BANDS[i - 1]
        const range = above ? `${b.from}-${above.from - 1}` : `${b.from}+`
        return (
          <span key={b.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[1px]" style={{ background: b.hex }} />
            <span className="text-[10px] uppercase tracking-wider text-slate-500">
              {b.label} {b.from > 0 ? range : `under ${above ? above.from : 0}`}
            </span>
          </span>
        )
      })}
    </div>
  )
}
