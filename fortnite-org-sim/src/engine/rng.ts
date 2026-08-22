// ---------------------------------------------------------------------------
// Seeded random number generator (mulberry32).
//
// Why not Math.random()? Because the whole point is reproducibility: the same
// save file + the same actions must always produce the same tournament.
// The generator state is a single 32-bit integer, so it serialises straight
// into the save file and a loaded game continues the exact same sequence.
// ---------------------------------------------------------------------------

export class Rng {
  s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  /** Pick from `arr` using a parallel array of relative weights. */
  weighted<T>(arr: readonly T[], weights: readonly number[]): T {
    let total = 0
    for (const w of weights) total += w
    let roll = this.next() * total
    for (let i = 0; i < arr.length; i++) {
      roll -= weights[i]
      if (roll <= 0) return arr[i]
    }
    return arr[arr.length - 1]
  }

  /** Normal distribution via Box-Muller. */
  gauss(mu = 0, sigma = 1): number {
    let u = 0
    let v = 0
    while (u === 0) u = this.next()
    while (v === 0) v = this.next()
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /** Fisher-Yates, returns a new array. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
}

/** Turn any text (a seed the user typed) into a 32-bit integer seed. */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/** Logistic win chance: how likely `power` beats `oppPower`, softened by `scale`. */
export function winChance(power: number, oppPower: number, scale: number): number {
  return 1 / (1 + Math.exp(-(power - oppPower) / scale))
}

/**
 * Linear interpolation across a table keyed by number, e.g. { 13: 1.6, 19: 1.0 }.
 * Values outside the table clamp to the nearest end.
 */
export function interpolateTable(table: Record<string, number>, x: number): number {
  const keys = Object.keys(table)
    .filter((k) => !k.startsWith('__'))
    .map(Number)
    .sort((a, b) => a - b)
  if (keys.length === 0) return 0
  if (x <= keys[0]) return table[String(keys[0])]
  if (x >= keys[keys.length - 1]) return table[String(keys[keys.length - 1])]
  for (let i = 0; i < keys.length - 1; i++) {
    if (x >= keys[i] && x <= keys[i + 1]) {
      const t = (x - keys[i]) / (keys[i + 1] - keys[i])
      return table[String(keys[i])] * (1 - t) + table[String(keys[i + 1])] * t
    }
  }
  return table[String(keys[keys.length - 1])]
}

/** Same as above but the table values are objects with mu/sigma. */
export function interpolateMuSigma(
  table: Record<string, { mu: number; sigma: number }>,
  x: number,
): { mu: number; sigma: number } {
  const mu: Record<string, number> = {}
  const sigma: Record<string, number> = {}
  for (const [k, v] of Object.entries(table)) {
    if (k.startsWith('__') || typeof v !== 'object') continue
    mu[k] = v.mu
    sigma[k] = v.sigma
  }
  return { mu: interpolateTable(mu, x), sigma: interpolateTable(sigma, x) }
}
