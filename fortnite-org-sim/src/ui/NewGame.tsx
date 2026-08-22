import { useRef, useState } from 'react'
import { REGIONS } from '../engine/config'
import { createNewGame } from '../engine/game'
import type { GameState } from '../engine/types'

export default function NewGame({
  onStart,
  onImport,
}: {
  onStart: (state: GameState) => void
  onImport: (file: File) => void
}) {
  const [orgName, setOrgName] = useState('')
  const [region, setRegion] = useState('EU')
  const [seed, setSeed] = useState(() => Math.random().toString(36).slice(2, 10))
  const fileRef = useRef<HTMLInputElement>(null)
  const selected = REGIONS.find((r) => r.id === region)!

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="font-mono text-3xl font-bold tracking-tight text-cyan-300">APEX ORG</h1>
        <p className="mt-1 text-sm text-slate-400">
          Competitive duos management. Scout players, build duos, train them, and drag a no-name
          org to the top of the scene.
        </p>
      </div>

      <div className="panel space-y-5 p-6">
        <div>
          <label className="label">Organisation name</label>
          <input
            className="input mt-1 w-full"
            placeholder="e.g. Nightfall Esports"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            maxLength={28}
          />
        </div>

        <div>
          <label className="label">Home region</label>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {REGIONS.map((r) => (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                className={`rounded border px-2 py-2 text-left transition ${
                  region === r.id
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="font-mono text-sm font-semibold text-slate-100">{r.id}</div>
                <div className="text-[10px] text-slate-500">{r.name}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            <span className="text-slate-300">{selected.name}.</span> {selected.blurb} Lobbies{' '}
            <span className="font-mono text-slate-300">
              {selected.lobbyModifier >= 0 ? '+' : ''}
              {selected.lobbyModifier}
            </span>
            , reputation earned{' '}
            <span className="font-mono text-slate-300">×{selected.reputationMultiplier}</span>.
          </p>
        </div>

        <div>
          <label className="label">Seed</label>
          <div className="mt-1 flex gap-2">
            <input
              className="input flex-1 font-mono"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
            <button className="btn" onClick={() => setSeed(Math.random().toString(36).slice(2, 10))}>
              Randomise
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            The same seed plus the same decisions always produces the same career. Share a seed to
            replay someone else's run.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <button className="btn-primary" onClick={() => onStart(createNewGame(orgName, region, seed))}>
            Found the org →
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Load a save file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImport(file)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-600">
        All players, orgs and locations are fictional and randomly generated. Not affiliated with or
        endorsed by any game publisher.
      </p>
    </div>
  )
}
