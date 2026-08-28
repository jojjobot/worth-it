// ---------------------------------------------------------------------------
// Shared type definitions. These describe the SHAPE of the game data.
// Actual numbers live in /src/data/*.json - never hard-code balance here.
//
// THE ATTRIBUTE TREE: 7 categories, 29 sub-stats, every one rated 1-100.
// Category scores are a weighted average of their sub-stats and are DISPLAY
// ONLY. The match engine must always read individual sub-stats.
// The tree itself is defined in /src/data/attributes.json.
// ---------------------------------------------------------------------------

export type CategoryKey =
  | 'aim'
  | 'mechanics'
  | 'fighting'
  | 'game_sense'
  | 'offspawn'
  | 'mental'
  | 'teamwork'

export const CATEGORY_KEYS: CategoryKey[] = [
  'aim',
  'mechanics',
  'fighting',
  'game_sense',
  'offspawn',
  'mental',
  'teamwork',
]

export type SubKey =
  // AIM
  | 'tracking'
  | 'flicks'
  | 'accuracy'
  | 'headshot'
  // MECHANICS
  | 'build_speed'
  | 'build_efficiency'
  | 'edit_speed'
  | 'edit_accuracy'
  // FIGHTING
  | 'edit_iq'
  | 'piece_control'
  | 'box_fighting'
  | 'hg_retakes'
  | 'reset_timing'
  | 'movement'
  // GAME SENSE
  | 'positioning'
  | 'rotation'
  | 'fight_selection'
  | 'resource_mgmt'
  // OFFSPAWN
  | 'drop_accuracy'
  | 'fifty_fifties'
  | 'offspawn_fights'
  // MENTAL
  | 'clutch'
  | 'under_pressure'
  | 'tilt_resistance'
  | 'big_stage_nerve'
  | 'consistency'
  // TEAMWORK
  | 'communication'
  | 'decision_making'
  | 'adaptivity'

/** Which sub-stats belong to which category. Mirrors attributes.json. */
export const SUBS_BY_CATEGORY: Record<CategoryKey, SubKey[]> = {
  aim: ['tracking', 'flicks', 'accuracy', 'headshot'],
  mechanics: ['build_speed', 'build_efficiency', 'edit_speed', 'edit_accuracy'],
  fighting: ['edit_iq', 'piece_control', 'box_fighting', 'hg_retakes', 'reset_timing', 'movement'],
  game_sense: ['positioning', 'rotation', 'fight_selection', 'resource_mgmt'],
  offspawn: ['drop_accuracy', 'fifty_fifties', 'offspawn_fights'],
  mental: ['clutch', 'under_pressure', 'tilt_resistance', 'big_stage_nerve', 'consistency'],
  teamwork: ['communication', 'decision_making', 'adaptivity'],
}

/** All 29 sub-stat keys, in display order. */
export const SUB_KEYS: SubKey[] = CATEGORY_KEYS.flatMap((c) => SUBS_BY_CATEGORY[c])

/** Which category a sub-stat belongs to. */
export const CATEGORY_OF: Record<SubKey, CategoryKey> = Object.fromEntries(
  CATEGORY_KEYS.flatMap((c) => SUBS_BY_CATEGORY[c].map((s) => [s, c])),
) as Record<SubKey, CategoryKey>

/** One full set of 29 ratings. A player carries two: `current` and `peak`. */
export type Ratings = Record<SubKey, number>

// --- Legacy attribute names ------------------------------------------------
// TEMPORARY. The old 11-attribute vocabulary. THE MATCH ENGINE NO LONGER USES
// IT - sim.ts reads the 29 sub-stats directly. The only thing left standing on
// this bridge is the training program list in training.json (build step 6).
// Delete this block, and attributes.json -> legacyBridge, once that is rewired.

export type AttrKey =
  | 'aim'
  | 'buildSpeed'
  | 'editing'
  | 'pieceControl'
  | 'gameSense'
  | 'lootPathing'
  | 'endgame'
  | 'clutch'
  | 'consistency'
  | 'stamina'
  | 'comms'

export const ATTR_KEYS: AttrKey[] = [
  'aim',
  'buildSpeed',
  'editing',
  'pieceControl',
  'gameSense',
  'lootPathing',
  'endgame',
  'clutch',
  'consistency',
  'stamina',
  'comms',
]

/** Legacy attributes that describe in-match execution. */
export const PERF_ATTRS: AttrKey[] = [
  'aim',
  'buildSpeed',
  'editing',
  'pieceControl',
  'gameSense',
  'lootPathing',
  'endgame',
  'clutch',
  'comms',
]

export type Attributes = Record<AttrKey, number>

// --- Players ---------------------------------------------------------------

export type Strategy = 'contest' | 'balanced' | 'safe'

export interface Player {
  id: string
  tag: string
  age: number
  region: string
  archetype: string

  /** What they are RIGHT NOW. Shown on the roster screen; the sim reads this. */
  current: Ratings
  /** Their ceiling. HIDDEN - only estimable through scouting, never shown as a
   *  number for an unsigned player. Players drift toward it and decline past ~21. */
  peak: Ratings

  /**
   * LAN and Grand Final appearances. Drives Big Stage Nerve growth, which is
   * the one sub-stat that cannot be trained.
   */
  lanAppearances: number

  /**
   * Hidden personality-defect stat, 1-100. `null` for the real reference
   * players in real_players.json - we do not invent character flaws for real
   * people. Only generated fictional players get one.
   */
  ego: number | null

  salary: number // per week
  contractWeeks: number // weeks left on the deal; 0 for free agents
  buyout: number // cost to prise them off a rival org
  orgName: string | null // null = free agent

  scoutLevel: number // 0..balance.scouting.maxLevel
  matchesPlayed: number
  burnout: number // 0..100
  trainingProgram: string // program id from training.json

  /** Placement of their last tournament, used by the Tilt Resistance modifier. */
  lastResultWasBad: boolean

  // Career record, purely for display
  careerEarnings: number
  careerTitles: number
  joinedWeek: number | null

  // --- Real reference players only (see /src/data/real_players.json) --------
  /** True for the hand-authored real players. They are never given an ego. */
  isReal?: boolean
  /** Optional, adults with a publicly documented name only. */
  realName?: string
  aliases?: string[]
  /** Epic Power Rankings points and world rank, August 2026 snapshot. Factual. */
  pr?: number
  prRank?: number
  /** Gamertag of their usual duo partner. */
  duo?: string
  /** Author note explaining why they are rated the way they are. */
  note?: string
}

export interface Duo {
  id: string
  name: string
  playerIds: (string | null)[] // always length 2
  strategy: Strategy
  gamesTogether: number
}

/**
 * A duo fielded by one of the real orgs (Team Falcons, BIG, Aurora, AG, HavoK,
 * Twisted Minds, ROC). Unlike the statistical rest of the field, these are
 * simulated with the real match engine using real player ratings, so you
 * genuinely finish above or below them.
 */
export interface RivalDuo {
  id: string
  orgId: string
  orgName: string
  region: string
  playerIds: [string, string]
  gamesTogether: number
  strategy: Strategy
}

/** One named org's finish in a tournament you also played, for the standings. */
export interface RivalStanding {
  orgName: string
  playerTags: string[]
  /** Ids alongside the tags so the standings table can open a player sheet. */
  playerIds: string[]
  points: number
  rank: number
}

// --- Match simulation ------------------------------------------------------

/** What one PLAYER did in one match. The duo is two people, not one stat line. */
export interface PlayerMatchLine {
  playerId: string
  tag: string
  elims: number
  /** Still standing when the game ended for the duo. */
  survived: boolean
}

export interface MatchResult {
  matchNumber: number
  placement: number
  elims: number
  points: number
  poi: string
  contested: boolean
  diedPhase: 'drop' | 'rotate' | 'midgame' | 'endgame' | 'won'
  matsAtEndgame: number
  /** How many times a player was knocked while the other kept the game alive. */
  partnerDowns: number
  /** How many of those were rebuilt. */
  reboots: number
  /** Per-player breakdown. Optional so results saved before this existed load. */
  players?: PlayerMatchLine[]
  summary: string // the one-line readable log
  detail: string[] // per-phase breakdown
}

export interface SessionResult {
  matches: MatchResult[]
  totalPoints: number
  totalElims: number
  bestPlacement: number
  wins: number
}

// --- Tournaments -----------------------------------------------------------

export interface TournamentInstanceRef {
  eventId: string
  stageId?: string
  key: string // unique per week+event
  name: string
  tier: number
  /** 0 = Monday. Which day of its week this cup is played on. */
  dayOfWeek: number
  matches: number
  lobbyRating: number
  fieldSize: number
  prizePool: number
  prizeDistribution: string
  scoring: string
  entryFee: number
  minReputation: number
  advanceCount: number
  /** LAN / Grand Final. Big Stage Nerve is read ONLY at these, and only these
   *  add a LAN appearance to a player's record. Set with `lan: true` in
   *  tournaments.json. */
  isLan: boolean
  locked: boolean // true if the player cannot enter (missing qualification / rep)
  lockReason: string
}

export interface TournamentResult {
  week: number
  key: string
  name: string
  tier: number
  region: string
  duoId: string
  duoName: string
  playerTags: string[]
  playerIds: string[]
  points: number
  rank: number
  fieldSize: number
  prize: number
  reputation: number
  advanced: boolean
  session: SessionResult
  /** How the named real orgs in your region finished in the same event. */
  rivals: RivalStanding[]
}

// --- Org / game state ------------------------------------------------------

export interface WeeklyFinance {
  week: number
  salaries: number
  overhead: number
  training: number
  scouting: number
  sponsors: number
  prizes: number
  net: number
}

export interface GameState {
  version: number
  seedLabel: string
  rngState: number

  orgName: string
  region: string
  week: number

  cash: number
  reputation: number
  fans: number
  negativeWeeks: number
  gameOver: string | null

  players: Record<string, Player>
  rosterIds: string[]
  marketIds: string[]
  duos: Duo[]

  /** The real orgs fielding real duos against you. See realPlayers.ts. */
  rivalDuos: RivalDuo[]

  scoutPoints: number
  lastMarketRefreshWeek: number

  /** eventKey -> duoId the user entered */
  entries: Record<string, string>
  /** stage qualifications the user has earned, e.g. "fncs:major" -> week earned */
  qualifications: Record<string, number>

  results: TournamentResult[]
  finances: WeeklyFinance[]
  newsLog: { week: number; text: string }[]
}
