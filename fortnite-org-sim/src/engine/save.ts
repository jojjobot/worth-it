// ---------------------------------------------------------------------------
// Saving: automatic to localStorage, manual to a .json file you can back up
// or move to another computer.
// ---------------------------------------------------------------------------

import { SAVE_VERSION, syncRealScene } from './game'
import type { GameState } from './types'

const KEY = 'fortnite-org-sim.save.v1'

export function saveToLocal(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch (err) {
    console.warn('Could not save to localStorage', err)
  }
}

export function loadFromLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (parsed.version !== SAVE_VERSION) {
      console.warn('Save file is from a different version - starting fresh.')
      return null
    }
    // The real reference roster is only built when a game is created, so a save
    // made before a player was added to real_players.json would never see them.
    // Pull the file back in on every load instead of throwing the save away.
    syncRealScene(parsed)
    return parsed
  } catch (err) {
    console.warn('Could not read save', err)
    return null
  }
}

export function clearLocal(): void {
  localStorage.removeItem(KEY)
}

export function exportSave(state: GameState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = state.orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  a.href = url
  a.download = `${safeName}-week-${state.week}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function importSave(file: File): Promise<GameState> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as GameState
        if (!parsed || typeof parsed.week !== 'number' || !parsed.players) {
          reject(new Error('That file is not a valid save.'))
          return
        }
        resolve(parsed)
      } catch (err) {
        reject(new Error('That file is not valid JSON.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsText(file)
  })
}
