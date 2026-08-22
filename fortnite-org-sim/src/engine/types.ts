// ---------------------------------------------------------------------------
// Shared type definitions. These describe the SHAPE of the game data.
// Actual numbers live in /src/data/*.json - never hard-code balance here.
// ---------------------------------------------------------------------------

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

/** Attributes that describe in-match execution (used for the "team power" maths). */
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

export type Strategy = 'contest' | 'balanced' | 'safe'

export interface Player {
  id: string
  tag: string
  age: number
  region: string
  archetype: string
  attrs: Attributes

  // Hidden until scouted (or never, for rivals)
  potential: number
  ego: number

  salary: number // per week
  contractWeeks: number // weeks left on the deal; 0 for free agents
  buyout: number // cost to prise them off a rival org
  orgName: string | null // null = free agent

  scoutLevel: number // 0..balance.scouting.maxLevel
  matchesPlayed: number
  burnout: number // 0..100
  trainingProgram: string // program id from training.json

  // Career record, purely for display
  careerEarnings: number
  careerTitles: number
  joinedWeek: number | null
}

export interface Trio {
  id: string
  name: string
  playerIds: (string | null)[] // always length 3
  strategy: Strategy
  gamesTogether: number
}

// --- Match simulation ------------------------------------------------------

export interface MatchResult {
  matchNumber: number
  placement: number
  elims: number
  points: number
  poi: string
  contested: boolean
  diedPhase: 'drop' | 'rotate' | 'midgame' | 'endgame' | 'won'
  matsAtEndgame: number
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
  matches: number
  lobbyRating: number
  fieldSize: number
  prizePool: number
  prizeDistribution: string
  scoring: string
  entryFee: number
  minReputation: number
  advanceCount: number
  locked: boolean // true if the player cannot enter (missing qualification / rep)
  lockReason: string
}

export interface TournamentResult {
  week: number
  key: string
  name: string
  tier: number
  region: string
  trioId: string
  trioName: string
  playerTags: string[]
  points: number
  rank: number
  fieldSize: number
  prize: number
  reputation: number
  advanced: boolean
  session: SessionResult
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
  trios: Trio[]

  scoutPoints: number
  lastMarketRefreshWeek: number

  /** eventKey -> trioId the user entered */
  entries: Record<string, string>
  /** stage qualifications the user has earned, e.g. "fncs:major" -> week earned */
  qualifications: Record<string, number>

  results: TournamentResult[]
  finances: WeeklyFinance[]
  newsLog: { week: number; text: string }[]
}
