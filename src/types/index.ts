export type Universe = 'chess' | 'checkers';
export type Color = 'white' | 'black';
export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type DraughtsPieceType = 'man' | 'king';

export interface ChessPiece {
  type: PieceType;
  color: Color;
}

export interface DraughtsPiece {
  type: DraughtsPieceType;
  color: Color;
}

export type ChessBoard = (ChessPiece | null)[][];
export type DraughtsBoard = (DraughtsPiece | null)[][];

export interface Position {
  row: number;
  col: number;
}

export interface DraughtsMove {
  from: Position;
  to: Position;
  captured?: Position[];
  promotesToKing?: boolean;
}

export type GameStatus = 'waiting' | 'playing' | 'paused' | 'ended';
export type GameResult = 'white' | 'black' | 'draw' | null;

export interface Player {
  id: string;
  name: string;
  rating: number;
  avatar?: string;
  country?: string;
}

export interface GameState {
  id: string;
  universe: Universe;
  status: GameStatus;
  result: GameResult;
  white: Player;
  black: Player;
  turn: Color;
  fen?: string; // chess
  draughtsBoard?: DraughtsBoard; // checkers
  moveHistory: string[];
  whiteTime: number; // ms
  blackTime: number; // ms
  increment: number; // ms
  createdAt: number;
  bet?: Bet;
}

export interface Bet {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'active' | 'won' | 'lost' | 'refunded';
  createdBy: string;
  acceptedBy?: string;
}

export interface SocialLinks {
  twitter?: string;
  lichess?: string;
  chessCom?: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  rating: { chess: number; checkers: number };
  walletBalance: number;
  currency: string;
  avatarUrl?: string;
  country?: string;
  bio?: string;
  socialLinks?: SocialLinks;
  // per-universe stats (populated from API)
  wins: number;
  losses: number;
  draws: number;
  chess?:    { wins: number; losses: number; draws: number; games: number };
  checkers?: { wins: number; losses: number; draws: number; games: number };
  betsWon: number;
  betsLost: number;
}

export interface TimeControl {
  initial: number; // minutes
  increment: number; // seconds
  label: string;
  category: 'Bullet' | 'Blitz' | 'Rapid' | 'Classical' | 'Custom';
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

export interface VideoStream {
  userId: string;
  stream: MediaStream | null;
  muted: boolean;
  videoOff: boolean;
}

export interface LobbyGame {
  id: string;
  universe: Universe;
  white: Player;
  black: Player;
  timeControl: TimeControl;
  bet?: number;
  status: GameStatus;
}

export interface Tournament {
  id: string;
  name: string;
  universe: Universe;
  players: number;
  startsIn: string;
  prizePool?: number;
}

export interface LeaderboardEntry {
  rank: number;
  player: Player;
  rating: number;
  gamesPlayed: number;
  winRate: number;
}
