// ---------------------------------------------------------------------------
// THE SCENE
//
// The real orgs you are up against. Their duos run through the same match
// engine you do, on the same ratings you can scout, so a result against them
// is a real result.
// ---------------------------------------------------------------------------

import { useMemo } from 'react'
import { computeSynergy, duoStrength } from '../engine/sim'
import { realOrgColor } from '../engine/realPlayers'
import type { GameState, Player } from '../engine/types'
import { ArchetypeChip, EmptyState, ratingColor } from './components'
import { PlayerLink } from './PlayerSheet'
import { OrgLink, useOrgSheet } from './OrgSheet'

export default function Scene({ state }: { state: GameState }) {
  const { openOrg } = useOrgSheet()
  const mine = useMemo(
    () =>
      state.duos
        .map((d) => {
          const players = d.playerIds
            .map((id) => (id ? state.players[id] : null))
            .filter((p): p is Player => !!p)
          return { name: d.name, players, games: d.gamesTogether, mine: true }
        })
        .filter((d) => d.players.length === 2),
    [state],
  )

  const rows = useMemo(() => {
    const rivals = state.rivalDuos.map((d) => {
      const players = d.playerIds
        .map((id) => state.players[id])
        .filter((p): p is Player => !!p)
      return {
        name: d.orgName,
        // A cross-org pairing is labelled "CGN Esports / AIGHT", which is not an
        // org page. Open the org the first player actually plays for.
        orgName: players[0]?.orgName ?? d.orgName,
        region: d.region,
        players,
        games: d.gamesTogether,
        mine: false,
      }
    })
    const own = mine.map((d) => ({
      ...d,
      region: state.region,
      orgName: state.orgName,
      name: `${state.orgName} - ${d.name}`,
    }))
    return [...rivals, ...own]
      .map((r) => ({ ...r, strength: r.players.length === 2 ? duoStrength(r.players, r.games) : 0 }))
      .sort((a, b) => b.strength - a.strength)
  }, [state, mine])

  if (state.rivalDuos.length === 0) {
    return <EmptyState>No rival orgs in this save.</EmptyState>
  }

  const top = rows[0]?.strength ?? 1

  return (
    <div className="space-y-4">
      <section className="panel cut p-5">
        <div className="label">Power rankings</div>
        <h1 className="hud-huge mt-1">The Scene</h1>
        <p className="mt-2 max-w-2xl text-[12px] text-[var(--text-dim)]">
          Ranked by team power. These duos are simulated with the same engine your duo is, on
          ratings you can scout — nothing about them is faked. Orgs outside your region only meet
          you at tier 5 international events. <strong className="text-[var(--text-dim)]">Click an
          org's mark</strong> to open their page: full roster, every duo they field, and every
          lobby you have shared with them.
        </p>
      </section>

      <div className="space-y-2">
        {rows.map((r, i) => {
          const color = r.mine ? 'var(--accent)' : (realOrgColor(r.name) ?? '#8892a6')
          const syn = computeSynergy(r.players, r.games)
          const home = r.region === state.region
          return (
            <section
              key={r.name + i}
              className={`panel relative p-3.5 ${r.mine ? 'border-[var(--accent)]' : ''}`}
            >
              <span
                className="absolute left-0 top-0 h-full w-[3px]"
                style={{ background: color }}
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-3">
                <span className="k-num w-8 shrink-0 text-lg text-[var(--text-faint)]">
                  {i + 1}
                </span>

                <OrgLink name={r.orgName} color={color} size={30} className="shrink-0" />

                <div className="min-w-[13rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openOrg(r.orgName)}
                      className="text-[15px] font-extrabold uppercase tracking-wide transition-opacity hover:opacity-80"
                      style={{ color }}
                      title={`Open ${r.orgName}`}
                    >
                      {r.name}
                    </button>
                    <span className="label">{r.region}</span>
                    {!home && !r.mine && (
                      <span className="label text-[var(--text-faint)]">international only</span>
                    )}
                    {r.mine && <span className="label text-[var(--accent)]">you</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {r.players.map((p) => (
                      <span key={p.id} className="flex items-center gap-1.5 text-[12px]">
                        <ArchetypeChip id={p.archetype} small />
                        <PlayerLink playerId={p.id} className="text-[var(--text-dim)]">
                          {p.tag}
                        </PlayerLink>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="w-40 shrink-0">
                  <div className="h-1.5 w-full bg-[var(--panel-2)]">
                    <div
                      className="h-full"
                      style={{ width: `${(r.strength / top) * 100}%`, background: color }}
                    />
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className={`k-num text-lg ${ratingColor(r.strength)}`}>
                    {r.strength.toFixed(1)}
                  </div>
                  <div className="label">team power</div>
                </div>

                <div className="shrink-0 text-right">
                  <div
                    className="k-num text-[13px]"
                    style={{
                      color:
                        syn.total > 2
                          ? 'var(--good)'
                          : syn.total < -2
                            ? 'var(--bad)'
                            : 'var(--text-dim)',
                    }}
                  >
                    {syn.total >= 0 ? '+' : ''}
                    {syn.total.toFixed(1)}
                  </div>
                  <div className="label">synergy</div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="k-num text-[13px] text-[var(--text-dim)]">{r.games}</div>
                  <div className="label">games together</div>
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
