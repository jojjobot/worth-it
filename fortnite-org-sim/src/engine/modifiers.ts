// ---------------------------------------------------------------------------
// THE MODIFIER PIPELINE
//
// One rule: no phase of the match engine computes an outcome inline. Every
// probability, penalty and cost is worked out from the player's sub-stats and
// then passed through resolve() before it is used.
//
//     resolve(key, baseValue, context) -> finalValue
//
// Badges and playstyles do not raise sub-stats. They register here, against a
// named key, and reshape one named situation. That is the whole design: if a
// badge cannot be written as a change to one of these keys, it is written
// wrong, and if a key does not exist, the badge hooking into it is dead code.
//
// The key list lives in /src/data/modifiers.json with a note on each one.
//
// AS OF BUILD STEP 3 NOTHING IS REGISTERED. resolve() hands every value
// straight back, so the sim behaves exactly as it did before the pipeline
// existed - `npm run verify:sim` proves it against a committed baseline.
// Playstyles register at step 8, badges at step 9.
// ---------------------------------------------------------------------------

import modifiersJson from '../data/modifiers.json'

// --- The keys --------------------------------------------------------------

export interface ModifierKeyDef {
  id: string
  phase: string
  clamp: 'probability' | 'substat' | 'amount' | 'signed'
  /** Build step at which the engine actually calls resolve() for this key. */
  wiredIn: number
  base: string
  calledFrom: string
}

export const MODIFIER_KEYS: ModifierKeyDef[] = (modifiersJson as any).keys

export const KEY_BY_ID: Record<string, ModifierKeyDef> = Object.fromEntries(
  MODIFIER_KEYS.map((k) => [k.id, k]),
)

/** Every key in the registry, as a type. A typo is a compile error. */
export type ModifierKey =
  | 'UNDER_FIRE_PENALTY'
  | 'DISTANCE_FALLOFF_PENALTY'
  | 'OPENING_EXCHANGE_PROB'
  | 'EDIT_WHIFF_CHANCE'
  | 'MAT_COST'
  | 'PIECE_DISADVANTAGE_PENALTY'
  | 'PIECE_STEAL_PROB'
  | 'PIECE_STEAL_PUNISH'
  | 'LOW_GROUND_PENALTY'
  | 'RESET_DAMAGE'
  | 'RESET_CHASE_CONVERSION'
  | 'NEXT_ZONE_POSITION_PROB'
  | 'STORM_DAMAGE'
  | 'THIRD_PARTY_CHANCE'
  | 'OUTNUMBERED_DROP_PENALTY'
  | 'CHEST_RACE_PROB'
  | 'BAD_LOOT_PENALTY'
  | 'OUTNUMBERED_FIGHT_PENALTY'
  | 'LAN_PENALTY'
  | 'VARIANCE_WIDTH'
  | 'DUO_DECISION_SOURCE'
  | 'PARTNER_SAVE_PROB'
  | 'SAVE_DAMAGE'

// --- The context a modifier gets to look at --------------------------------

/**
 * Match state at the moment of the roll. A modifier decides whether it applies
 * by reading this - "only in the endgame", "only on a contested drop", "only
 * while outnumbered".
 *
 * Fields marked STEP 4 are declared but not populated yet: the engine does not
 * carry that state through the phases until build step 4. A modifier must
 * therefore treat `undefined` as "not known here" and decline to apply, which
 * is what triggerMatches() below does for it.
 */
export interface ModifierContext {
  /** Which phase asked. */
  phase: 'offspawn' | 'rotate' | 'midgame' | 'endgame' | 'global'
  /** Zone number, counting the way the match log does. */
  zone?: number
  /** Duos still alive in the lobby. */
  teamsAlive?: number
  /** Players of YOUR duo still standing. 1 means somebody is on the floor. */
  teammatesAlive?: number
  /** Mats in hand, averaged across whoever is still up. */
  mats?: number
  /** Shield, averaged across whoever is still up. */
  shield?: number
  /** True if the drop was contested. */
  contested?: boolean
  /** LAN or Grand Final. */
  isLan?: boolean
  /** 0-based index of this match within the session. */
  matchNumber?: number
  /** Closing games of a session, where Under Pressure is read. */
  closingGame?: boolean
  /** The player this roll is about, where it is about one player. */
  playerId?: string

  // --- STEP 4: per-player state the engine does not carry yet -------------
  hp?: number
  lootTier?: 'grey' | 'green' | 'blue' | 'purple' | 'gold'
  hasHeight?: boolean
  pieceAdvantage?: boolean
  inFight?: boolean
  fightDuration?: number
  /** How outnumbered: 1 = even, 2 = a 1v2, 3 = a 1v3. */
  outnumberedBy?: number
}

// --- What a modifier is ----------------------------------------------------

export interface Modifier {
  /** Unique id, e.g. "badge.box_god.gold" or "playstyle.mat_miser". */
  id: string
  /** What the player sees in the match log when this fires. */
  label: string
  source: 'badge' | 'playstyle'
  key: ModifierKey
  /**
   * How strong this modifier is, used ONLY to break ties. Modifiers on the
   * same key never stack - the strongest applicable one wins outright. A Gold
   * badge must therefore carry a higher strength than its Bronze tier.
   */
  strength: number
  /** Does this modifier apply in this situation? Keep it cheap - it is hot. */
  applies?: (ctx: ModifierContext) => boolean
  /** Reshape the value. Must be pure. */
  apply: (value: number, ctx: ModifierContext) => number
}

const registered = new Map<ModifierKey, Modifier[]>()

/** Which keys the engine actually asked about. Powers the coverage ledger. */
const seenKeys = new Set<string>()

export function registerModifier(mod: Modifier): void {
  if (!KEY_BY_ID[mod.key]) {
    throw new Error(
      `Modifier ${mod.id} hooks "${mod.key}", which is not in modifiers.json. ` +
        'Add the key to the registry or fix the name - a modifier on an unknown key would silently do nothing.',
    )
  }
  const list = registered.get(mod.key) ?? []
  list.push(mod)
  registered.set(mod.key, list)
}

export function clearModifiers(): void {
  registered.clear()
}

export function registeredFor(key: ModifierKey): Modifier[] {
  return registered.get(key) ?? []
}

/** Keys the engine has resolved at least once since the process started. */
export function keysExercised(): Set<string> {
  return new Set(seenKeys)
}

export function resetKeysExercised(): void {
  seenKeys.clear()
}

// --- Resolving -------------------------------------------------------------

function clampFor(kind: ModifierKeyDef['clamp'], v: number): number {
  if (kind === 'probability') return Math.max(0.01, Math.min(0.99, v))
  if (kind === 'substat') return Math.min(99, v)
  // A swing that is meaningfully negative - LAN_PENALTY - is left alone.
  // Clamping it at zero would delete stage fright.
  if (kind === 'signed') return v
  return Math.max(0, v)
}

/**
 * A modifier applies only if its own trigger says so. A trigger that reads a
 * context field the engine does not populate yet returns undefined, and an
 * undefined comparison is false - so a modifier waiting on step 4 state simply
 * does not fire rather than firing on garbage.
 */
function triggerMatches(mod: Modifier, ctx: ModifierContext): boolean {
  if (!mod.applies) return true
  try {
    return mod.applies(ctx) === true
  } catch {
    return false
  }
}

/**
 * THE ONE FUNCTION. Every roll in the engine goes through it.
 *
 * With nothing registered this returns `base` untouched - the clamp is applied
 * only when a modifier actually changed the value, so an untouched base is
 * byte-identical to what the engine computed. That is what makes build step 3
 * a true no-op refactor.
 */
export function resolve(key: ModifierKey, base: number, ctx: ModifierContext): number {
  seenKeys.add(key)

  const candidates = registered.get(key)
  if (!candidates || candidates.length === 0) return base

  // Strongest applicable wins. They do NOT stack.
  let winner: Modifier | null = null
  for (const mod of candidates) {
    if (!triggerMatches(mod, ctx)) continue
    if (!winner || mod.strength > winner.strength) winner = mod
  }
  if (!winner) return base

  const out = winner.apply(base, ctx)
  if (!Number.isFinite(out)) return base

  lastFired.push({ key, id: winner.id, label: winner.label, from: base, to: out })
  return clampFor(KEY_BY_ID[key].clamp, out)
}

// --- What fired, for the match log ----------------------------------------
// Build step 11 makes every match log line name the modifiers that fired. The
// engine collects them here per match rather than threading a log through
// every function.

export interface FiredModifier {
  key: string
  id: string
  label: string
  from: number
  to: number
}

let lastFired: FiredModifier[] = []

export function beginModifierCapture(): void {
  lastFired = []
}

export function firedModifiers(): FiredModifier[] {
  return lastFired
}
