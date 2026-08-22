// ---------------------------------------------------------------------------
// THE HUB
//
// The bottom-left button. Everything that is not the season calendar lives
// behind it: roster, scouting, training, the rival scene, results, finances
// and the front office.
//
// Keyboard: Esc closes, and the button itself is always reachable.
// ---------------------------------------------------------------------------

import { useEffect } from 'react'

export interface HubItem {
  id: string
  label: string
  hint: string
  group: string
  /** Small number or word shown on the right of the row, e.g. an alert count. */
  badge?: string
  badgeTone?: 'accent' | 'warn' | 'bad'
}

export const HUB_ITEMS: HubItem[] = [
  { id: 'season', label: 'Season', hint: 'The calendar. Enter cups and advance the week.', group: 'Compete' },
  { id: 'results', label: 'Results', hint: 'Every event you have played, match by match.', group: 'Compete' },
  { id: 'scene', label: 'The Scene', hint: 'The real orgs you are up against.', group: 'Compete' },

  { id: 'roster', label: 'Roster & Duos', hint: 'Who plays, who sits, and who plays with who.', group: 'Team' },
  { id: 'training', label: 'Training', hint: 'Weekly programs, burnout and development.', group: 'Team' },
  { id: 'scouting', label: 'Scouting', hint: 'The transfer market. Scout, then sign.', group: 'Team' },

  { id: 'finances', label: 'Finances', hint: 'Wages, sponsors, prize money and the weekly books.', group: 'Front Office' },
  { id: 'office', label: 'Front Office', hint: 'Org identity, saves and the seed.', group: 'Front Office' },
]

const GROUPS = ['Compete', 'Team', 'Front Office']

export function HubButton({
  open,
  onToggle,
  activeLabel,
}: {
  open: boolean
  onToggle: () => void
  activeLabel: string
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      aria-label="Open the menu"
      className="panel-raised group fixed bottom-4 left-4 z-40 flex items-center gap-3 px-3.5 py-2.5 transition hover:border-[var(--accent)]"
      style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.6)' }}
    >
      <span className="flex h-5 w-5 flex-col justify-center gap-[3px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[2px] w-full bg-[var(--accent)] transition-all"
            style={open ? { transform: i === 1 ? 'scaleX(0.4)' : 'scaleX(0.75)' } : undefined}
          />
        ))}
      </span>
      <span className="text-left">
        <span className="label block leading-none">Menu</span>
        <span className="block text-[12px] font-extrabold uppercase leading-tight tracking-wider">
          {activeLabel}
        </span>
      </span>
    </button>
  )
}

export function HubMenu({
  open,
  active,
  onPick,
  onClose,
  badges = {},
}: {
  open: boolean
  active: string
  onPick: (id: string) => void
  onClose: () => void
  badges?: Record<string, { text: string; tone: 'accent' | 'warn' | 'bad' }>
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const toneColor = (tone: string) =>
    tone === 'bad' ? 'var(--bad)' : tone === 'warn' ? 'var(--accent-warm)' : 'var(--accent)'

  return (
    <div
      className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <nav
        className="panel absolute bottom-[4.75rem] left-4 w-[min(22rem,calc(100vw-2rem))] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.75)' }}
      >
        {GROUPS.map((group) => (
          <div key={group} className="border-b border-[var(--line)] last:border-0">
            <div className="bg-[var(--panel-2)] px-3 py-1.5">
              <span className="label">{group}</span>
            </div>
            {HUB_ITEMS.filter((i) => i.group === group).map((item) => {
              const isActive = item.id === active
              const badge = badges[item.id]
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onPick(item.id)
                    onClose()
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                    isActive ? 'bg-[var(--accent)]/10' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span
                    className="h-7 w-[3px] shrink-0"
                    style={{ background: isActive ? 'var(--accent)' : 'transparent' }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[13px] font-extrabold uppercase tracking-wider ${
                        isActive ? 'text-[var(--accent)]' : 'text-[var(--text)]'
                      }`}
                    >
                      {item.label}
                    </span>
                    <span className="block truncate text-[10px] text-[var(--text-faint)]">
                      {item.hint}
                    </span>
                  </span>
                  {badge && (
                    <span
                      className="chip shrink-0"
                      style={{
                        color: toneColor(badge.tone),
                        border: `1px solid ${toneColor(badge.tone)}66`,
                        background: `${toneColor(badge.tone)}18`,
                      }}
                    >
                      <span>{badge.text}</span>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        <div className="bg-[var(--panel-2)] px-3 py-1.5 text-center">
          <span className="text-[10px] text-[var(--text-faint)]">Esc to close</span>
        </div>
      </nav>
    </div>
  )
}
