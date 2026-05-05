/**
 * DamCash Game Server
 * Express + Socket.io — real-time multiplayer, invites, room codes, WebRTC signaling
 */
require('dotenv').config();

console.log('--- DAMCASH SERVER V3.1 STARTING ON PORT ' + (process.env.PORT || 3000) + ' ---');

const express    = require('express');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const { createServer } = require('http');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { Chess }  = require('chess.js');  // server-side move validation

// ── Startup safety checks ────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
const OWNER_ADMIN_EMAIL = 'yves.ahipo@gmail.com';
function adminEmails() {
  return Array.from(new Set([
    OWNER_ADMIN_EMAIL,
    ...(process.env.ADMIN_EMAILS || '').split(','),
  ].map(e => e.trim().toLowerCase()).filter(Boolean)));
}

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET env var is not set. Set it before starting the server.');
  process.exit(1);
}
if (JWT_SECRET === 'super_secret_dev_key_change_in_production') {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET is using the insecure default. Generate a secure key before running in production.');
    console.error('  Run: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  }
  console.warn('[WARN] JWT_SECRET is using the insecure default. Change it before deploying to production.');
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
});
const { supabase } = require('./supabase.cjs');

// ── Structured logger ─────────────────────────────────────────────────────────
const recentErrors = [];
const rawConsoleError = console.error.bind(console);
function rememberError(args) {
  const message = args.map((arg) => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'string') return arg;
    try { return JSON.stringify(arg); }
    catch { return String(arg); }
  }).join(' ');
  recentErrors.unshift({
    at: new Date().toISOString(),
    message: message.slice(0, 1200),
  });
  recentErrors.splice(50);
}

console.error = (...args) => {
  rememberError(args);
  rawConsoleError(...args);
};

const log = {
  info:  (...a) => console.log( `[${new Date().toISOString()}] INFO `, ...a),
  warn:  (...a) => console.warn(`[${new Date().toISOString()}] WARN `, ...a),
  error: (...a) => console.error(`[${new Date().toISOString()}] ERROR`, ...a),
};

const app = express();
const httpServer = createServer(app);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // managed by Vite in dev; set in prod CDN
  crossOriginEmbedderPolicy: false,
}));

// ── Body parsing (cap at 100kb to prevent payload attacks) ───────────────────
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buf) => {
    if (req.originalUrl?.startsWith('/api/wallet/stripe/webhook')) {
      req.rawBody = Buffer.from(buf);
    }
  },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const agoraLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many video token requests.' },
});
app.use('/api/auth',   authLimiter);
app.use('/api/wallet', apiLimiter);
app.use('/api',        apiLimiter);

// ── Input validation helpers ──────────────────────────────────────────────────
const MAX_BET     = 500;      // $500 max wager
const MAX_CHAT_LEN = 300;

/** Strip characters that could cause issues in broadcast or DB */
function sanitizeText(str, maxLen = MAX_CHAT_LEN) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`]/g, '').trim().slice(0, maxLen);
}

/** Clamp a numeric value and ensure it is a finite non-negative number */
function sanitizeMoney(val) {
  const n = parseFloat(val);
  if (!isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100) / 100, MAX_BET); // round to cents, cap
}

function normalizeUniverse(value) {
  return value === 'checkers' ? 'checkers' : 'chess';
}

function universeLabel(value) {
  return normalizeUniverse(value) === 'checkers' ? 'Checkers' : 'Chess';
}

/** Socket-level rate limiter — returns true if the event should be dropped */
const socketEventCounts = new Map(); // socketId → { count, resetAt }
function socketRateLimit(socketId, maxPerMinute = 60) {
  const now = Date.now();
  const entry = socketEventCounts.get(socketId) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
  entry.count++;
  socketEventCounts.set(socketId, entry);
  return entry.count > maxPerMinute;
}

// ── ELO engine (inline — no ESM import needed in CJS) ────────────────────────
function kFactor(rating, games) {
  if (games < 30)    return 40;
  if (rating >= 2400) return 10;
  if (rating >= 2100) return 20;
  return 32;
}

function expectedScore(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/**
 * result: 'win' | 'draw' | 'loss' — from WHITE's perspective
 * Returns { white: {before,after,delta}, black: {before,after,delta} }
 */
function computeElo(wRating, bRating, result, wGames, bGames) {
  const Ew = expectedScore(wRating, bRating);
  const Eb = expectedScore(bRating, wRating);
  const Sw = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const Sb = 1 - Sw;
  const Kw = kFactor(wRating, wGames);
  const Kb = kFactor(bRating, bGames);
  const newW = Math.round(wRating + Kw * (Sw - Ew));
  const newB = Math.round(bRating + Kb * (Sb - Eb));
  return {
    white: { before: wRating, after: newW, delta: newW - wRating },
    black: { before: bRating, after: newB, delta: newB - bRating },
  };
}

/**
 * Parse time control string (e.g., "5+0", "3+2", "10+5")
 * Returns { initial: ms, increment: ms }
 */
function parseTimeControl(tcString) {
  const match = (tcString || '5+0').match(/^(\d+)\+(\d+)$/);
  if (!match) {
    console.warn(`[parseTimeControl] Invalid format: ${tcString}, defaulting to 5+0`);
    return { initial: 5 * 60 * 1000, increment: 0 };
  }
  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  return {
    initial: minutes * 60 * 1000,
    increment: seconds * 1000,
  };
}

let io;
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');

// CORS_ORIGIN: comma-separated list of allowed origins.
// APP_URL is always added automatically so the server's own domain is never blocked
// (Vite module scripts send Origin even for same-origin requests).
const allowedOrigins = process.env.CORS_ORIGIN
  ? [...new Set([
      ...process.env.CORS_ORIGIN.split(',').map(o => o.trim()),
      process.env.APP_URL,
    ].filter(Boolean))]
  : null; // null = allow all origins

const corsOptions = {
  origin: allowedOrigins
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  credentials: true,
};

io = new Server(httpServer, {
  cors: corsOptions,
});

app.use(require('cors')(corsOptions));

const redisUrl = process.env.REDIS_URL;
if (redisUrl) {
  const pubClient = createClient({ url: redisUrl });
  const subClient = pubClient.duplicate();
  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[+] Redis Adapter Connected');
  }).catch(err => {
    console.error('[-] Redis connection failed:', err);
  });
}

// ── In-memory stores ─────────────────────────────────────────────────────────
const rooms      = new Map(); // roomId  -> { players, config, moves, bets, spectators: Set, escrowed: bool }
const codes      = new Map(); // code    -> { roomId, config, creatorId, expiresAt }
const queue      = new Map(); // tcKey   -> [socketId, ...]
const players    = new Map(); // socketId -> { name, rating:{chess,checkers}, gamesPlayed:{chess,checkers}, status, universe }
const invites    = new Map(); // inviteId -> { fromId, toId, config, expiresAt }
const seeks      = new Map(); // seekId  -> { socketId, name, rating, timeControl, universe, betAmount, rated, createdAt }
const spectators       = new Map(); // socketId -> roomId  (which room they're watching)
const takebackRequests = new Map(); // roomId   -> { fromId, timeoutId }
const seekTimeouts     = new Map(); // seekId   -> timeoutId (120s auto-expiry)
const reconnectTokens  = new Map(); // roomId   -> { white: {token,socketId}, black: {token,socketId} }
const socketToUserId = new Map(); // socketId -> db user id
const userIdToSocketId = new Map(); // db user id -> socketId
let tournamentMatchSchemaReady = false;
let safetySchemaReady = false;
let directMessageSchemaReady = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
function genCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function genId() {
  return crypto.randomBytes(16).toString('hex'); // 32 hex chars
}

function parseTimeControl(tc) {
  const parts = String(tc || '5+0').split('+').map(Number);
  const base = isNaN(parts[0]) ? 5 : parts[0];
  const inc  = isNaN(parts[1]) ? 0 : parts[1];
  return { initial: base * 60 * 1000, increment: inc * 1000 };
}

function resolveColor(colorPref, whiteId, blackId) {
  if (colorPref === 'white') return { white: whiteId, black: blackId };
  if (colorPref === 'black') return { white: blackId, black: whiteId };
  return Math.random() < 0.5
    ? { white: whiteId, black: blackId }
    : { white: blackId, black: whiteId };
}

async function ensureTournamentMatchSchema() {
  if (tournamentMatchSchemaReady) return;
  await prisma.$executeRawUnsafe('ALTER TABLE "Match" ADD COLUMN IF NOT EXISTS "tournamentId" TEXT');
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Match"
      ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "resultReason" TEXT,
      ADD COLUMN IF NOT EXISTS "moveList" JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "finalPosition" TEXT,
      ADD COLUMN IF NOT EXISTS "whiteRatingBefore" INTEGER,
      ADD COLUMN IF NOT EXISTS "whiteRatingAfter" INTEGER,
      ADD COLUMN IF NOT EXISTS "whiteRatingDelta" INTEGER,
      ADD COLUMN IF NOT EXISTS "blackRatingBefore" INTEGER,
      ADD COLUMN IF NOT EXISTS "blackRatingAfter" INTEGER,
      ADD COLUMN IF NOT EXISTS "blackRatingDelta" INTEGER,
      ADD COLUMN IF NOT EXISTS "walletStatus" TEXT NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS "walletSettledAt" TIMESTAMP(3)
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "Match_tournamentId_idx" ON "Match"("tournamentId")');
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Match_tournamentId_fkey'
      ) THEN
        ALTER TABLE "Match"
          ADD CONSTRAINT "Match_tournamentId_fkey"
          FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  tournamentMatchSchemaReady = true;
}

async function ensureSafetySchema() {
  if (safetySchemaReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ModerationReport" (
      id TEXT PRIMARY KEY,
      "reporterId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
      "targetId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
      "targetUsername" TEXT,
      reason TEXT NOT NULL,
      context TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      "matchId" TEXT,
      "paymentId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserBlock" (
      id TEXT PRIMARY KEY,
      "blockerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "targetId" TEXT REFERENCES "User"("id") ON DELETE SET NULL,
      "targetUsername" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("blockerId", "targetUsername")
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ModerationReport_status_createdAt_idx" ON "ModerationReport"(status, "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ModerationReport_targetUsername_idx" ON "ModerationReport"("targetUsername")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "UserBlock_blockerId_idx" ON "UserBlock"("blockerId")');
  safetySchemaReady = true;
}

async function ensureDirectMessageSchema() {
  if (directMessageSchemaReady) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DirectMessage" (
      id TEXT PRIMARY KEY,
      "senderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      body TEXT NOT NULL,
      "readAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DirectMessage_senderId_createdAt_idx" ON "DirectMessage"("senderId", "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DirectMessage_recipientId_createdAt_idx" ON "DirectMessage"("recipientId", "createdAt")');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "DirectMessage_recipientId_readAt_idx" ON "DirectMessage"("recipientId", "readAt")');
  directMessageSchemaReady = true;
}

async function findUserByUsername(username) {
  const clean = sanitizeText(username, 40);
  if (!clean) return null;
  const rows = await prisma.$queryRaw`
    SELECT id, username
    FROM "User"
    WHERE LOWER(username) = LOWER(${clean})
    LIMIT 1
  `;
  return rows?.[0] || null;
}

async function findBlockBetween(a, b) {
  if (!a?.id || !b?.id) return null;
  const rows = await prisma.$queryRaw`
    SELECT "blockerId", "targetId", "targetUsername"
    FROM "UserBlock"
    WHERE (
      "blockerId" = ${a.id}
      AND ("targetId" = ${b.id} OR LOWER("targetUsername") = LOWER(${b.username}))
    ) OR (
      "blockerId" = ${b.id}
      AND ("targetId" = ${a.id} OR LOWER("targetUsername") = LOWER(${a.username}))
    )
    LIMIT 1
  `;
  return rows?.[0] || null;
}

async function getLocalAuthUser(req) {
  if (req.dbUser?.id) return req.dbUser;
  const id = req.user?.id || '';
  const email = req.user?.email || '';
  const rows = await prisma.$queryRaw`
    SELECT id, username
    FROM "User"
    WHERE id = ${id} OR email = ${email}
    LIMIT 1
  `;
  return rows?.[0] || null;
}

function jsonSafe(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return null; }
}

function serializeRoomMoves(room) {
  if (!room?.moves) return [];
  return room.moves.map((m, index) => ({
    ply: index + 1,
    color: m.player === room.players?.white ? 'white' : m.player === room.players?.black ? 'black' : null,
    move: m.move || m.san || null,
    san: m.san || null,
    from: m.from || null,
    to: m.to || null,
    fen: m.fen || null,
    board: m.board ? jsonSafe(m.board) : null,
    whiteTime: typeof m.whiteTime === 'number' ? m.whiteTime : null,
    blackTime: typeof m.blackTime === 'number' ? m.blackTime : null,
  }));
}

function roomPgn(room) {
  return (room?.moves || [])
    .map(m => m.san || m.move || '')
    .filter(Boolean)
    .join(' ');
}

function roomFinalPosition(room) {
  const lastMove = room?.moves?.[room.moves.length - 1];
  if (room?.config?.universe === 'chess') return room.chessEngine?.fen?.() || lastMove?.fen || null;
  if (lastMove?.board) {
    const board = jsonSafe(lastMove.board);
    return board ? JSON.stringify(board) : null;
  }
  return lastMove?.fen || null;
}

function buildMatchEndData(room, result, reason, ratingAudit = {}) {
  const finalPosition = roomFinalPosition(room);
  return {
    status: 'ended',
    result: result === 'win' ? 'white' : result === 'loss' ? 'black' : 'draw',
    resultReason: reason || null,
    pgn: roomPgn(room),
    moveList: serializeRoomMoves(room),
    finalFen: room?.config?.universe === 'chess' ? finalPosition : undefined,
    finalPosition,
    endedAt: new Date(),
    ...ratingAudit,
  };
}

async function resetStaleTournamentPairingStatuses() {
  const result = await prisma.tournamentPlayer.updateMany({
    where: { status: 'in_game' },
    data: { status: 'available' },
  });
  if (result.count > 0) {
    log.info(`[Tournament] Reset ${result.count} stale in-game pairing status${result.count === 1 ? '' : 'es'}`);
  }
}

function broadcastPlayerList() {
  const list = Array.from(players.entries()).map(([socketId, info]) => ({
    socketId, ...info,
  }));
  io.emit('players:online', list);
}

function broadcastSeeks() {
  const list = Array.from(seeks.entries()).map(([seekId, s]) => ({ seekId, ...s }));
  io.emit('seeks:list', list);
}

function removeSeekBySocket(socketId) {
  for (const [seekId, s] of seeks.entries()) {
    if (s.socketId === socketId) {
      seeks.delete(seekId);
      const tid = seekTimeouts.get(seekId);
      if (tid) { clearTimeout(tid); seekTimeouts.delete(seekId); }
    }
  }
  broadcastSeeks();
}

function removeSeekById(seekId) {
  const tid = seekTimeouts.get(seekId);
  if (tid) { clearTimeout(tid); seekTimeouts.delete(seekId); }
  seeks.delete(seekId);
  broadcastSeeks();
}

async function startRoom(roomId, creatorId, joinerId, config) {
  console.log(`[GameStart] Attempting to start room ${roomId}. Creator: ${creatorId}, Joiner: ${joinerId}`);
  // Resolve the latest socket IDs for these users in case they blipped and reconnected
  const creatorUser = socketToUserId.get(creatorId);
  const joinerUser  = socketToUserId.get(joinerId);
  const currentCreatorId = creatorUser ? (userIdToSocketId.get(creatorUser) || creatorId) : creatorId;
  const currentJoinerId  = joinerUser  ? (userIdToSocketId.get(joinerUser)  || joinerId)  : joinerId;

  console.log(`[GameStart] Resolved IDs -> Creator: ${currentCreatorId}, Joiner: ${currentJoinerId}`);

  const { white, black } = resolveColor(config.colorPref, currentCreatorId, currentJoinerId);
  const tc = parseTimeControl(config.timeControl || '5+0');

  rooms.set(roomId, {
    players: { white, black }, config,
    moves: [], bets: {}, spectators: new Set(),
    spectatorNames: new Map(),
    escrowed: false, createdAt: Date.now(),
    chessEngine: config?.universe === 'chess' ? new Chess() : null,
    whiteTime: tc.initial,
    blackTime: tc.initial,
    lastMoveTime: Date.now(),
  });

  // Create DB Match records for every signed-in game, rated or casual.
  try {
    if (config?.tournamentId) await ensureTournamentMatchSchema();
    const whiteDbId = socketToUserId.get(white);
    const blackDbId = socketToUserId.get(black);
    if (whiteDbId && blackDbId) {
      const dbMatch = await prisma.match.create({
        data: {
          universe: config.universe || 'chess',
          timeControl: config.timeControl || '5+0',
          status: 'playing',
          startedAt: new Date(),
          betAmount: config.betAmount || 0,
          whiteId: whiteDbId,
          blackId: blackDbId,
          isRated: config?.rated !== false,
          ...(config.tournamentId ? { tournamentId: config.tournamentId } : {}),
        }
      });
      const r = rooms.get(roomId);
      if (r) r.dbMatchId = dbMatch.id;
    }
  } catch (e) {
    console.error('[DB] Failed to create initial Match record:', e.message);
  }

  removeSeekBySocket(currentCreatorId);
  removeSeekBySocket(currentJoinerId);

  const whiteSocket = io.sockets.sockets.get(white);
  const blackSocket = io.sockets.sockets.get(black);
  whiteSocket?.join(roomId);
  blackSocket?.join(roomId);

  const betAmount = config?.betAmount || 0;
  if (betAmount > 0) {
    const ok = await escrowBet(roomId);
    if (!ok) {
      rooms.delete(roomId);
      return;
    }
  }

  const whiteToken = genId();
  const blackToken = genId();
  reconnectTokens.set(roomId, {
    white: { token: whiteToken, socketId: white },
    black: { token: blackToken, socketId: black },
  });

  const wp = players.get(white);
  const bp = players.get(black);
  const gameData = {
    roomId, white, black, config,
    timeControl: config.timeControl,
    whitePlayer: { name: wp?.name || 'White', rating: wp?.rating || { chess: 1500, checkers: 1450 }, country: wp?.country || '' },
    blackPlayer: { name: bp?.name || 'Black', rating: bp?.rating || { chess: 1500, checkers: 1450 }, country: bp?.country || '' },
  };

  console.log(`[GameStart] Emitting game-start to White: ${white} and Black: ${black}`);
  io.to(white).emit('game-start', { ...gameData, color: 'w' });
  io.to(black).emit('game-start', { ...gameData, color: 'b' });
  io.to(roomId).emit('game-start', gameData);

  [white, black].forEach((id) => {
    const p = players.get(id);
    if (p) { p.status = 'playing'; p.currentTC = config?.timeControl || null; players.set(id, p); }
  });
  console.log(`[GameStart] Room ${roomId} fully initialized and signals sent.`);
  broadcastPlayerList();
}

async function releaseTournamentRoom(roomId) {
  const room = rooms.get(roomId);
  const tournamentId = room?.config?.tournamentId;
  if (!room || !tournamentId) return;
  const userIds = [room.players.white, room.players.black]
    .map(socketId => socketToUserId.get(socketId))
    .filter(Boolean);
  if (userIds.length === 0) return;
  try {
    await prisma.tournamentPlayer.updateMany({
      where: { tournamentId, userId: { in: userIds } },
      data: { status: 'available' },
    });
    io.to(`tournament:${tournamentId}`).emit('tournament:updated', { id: tournamentId });
  } catch (err) {
    log.error('[Tournament] Failed to release room players:', err.message);
  }
}

async function settleTournamentRoom(roomId, result) {
  const room = rooms.get(roomId);
  const tournamentId = room?.config?.tournamentId;
  if (!room || !tournamentId) return;

  const whiteUserId = socketToUserId.get(room.players.white);
  const blackUserId = socketToUserId.get(room.players.black);
  if (!whiteUserId || !blackUserId) return;

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { format: true },
    });
    const winScore = tournament?.format === 'arena' ? 2 : 1;
    const drawScore = tournament?.format === 'arena' ? 1 : 0.5;

    const whiteData =
      result === 'draw'
        ? { draws: { increment: 1 }, score: { increment: drawScore }, status: 'available' }
        : result === 'win'
        ? { wins: { increment: 1 }, score: { increment: winScore }, status: 'available' }
        : { losses: { increment: 1 }, status: 'available' };

    const blackData =
      result === 'draw'
        ? { draws: { increment: 1 }, score: { increment: drawScore }, status: 'available' }
        : result === 'loss'
        ? { wins: { increment: 1 }, score: { increment: winScore }, status: 'available' }
        : { losses: { increment: 1 }, status: 'available' };

    await prisma.$transaction([
      prisma.tournamentPlayer.updateMany({
        where: { tournamentId, userId: whiteUserId },
        data: whiteData,
      }),
      prisma.tournamentPlayer.updateMany({
        where: { tournamentId, userId: blackUserId },
        data: blackData,
      }),
    ]);
    io.to(`tournament:${tournamentId}`).emit('tournament:updated', { id: tournamentId });
    io.emit('tournament:global_update');
  } catch (err) {
    log.error('[Tournament] Failed to settle tournament standings:', err.message);
  }
}

async function markRoomMatchAborted(roomId, reason = 'Game aborted') {
  const room = rooms.get(roomId);
  if (!room?.dbMatchId) return;
  try {
    await prisma.match.update({
      where: { id: room.dbMatchId },
      data: {
        status: 'aborted',
        result: 'abandoned',
        resultReason: reason,
        pgn: roomPgn(room),
        moveList: serializeRoomMoves(room),
        finalFen: room.config?.universe === 'chess' ? roomFinalPosition(room) : undefined,
        finalPosition: roomFinalPosition(room),
        endedAt: new Date(),
        ...(room.escrowed ? { walletStatus: 'failed', walletSettledAt: new Date() } : {}),
      },
    });
  } catch (err) {
    log.error('[DB] Failed to mark match aborted:', err.message);
  }
}

// ── Socket middleware ────────────────────────────────────────────────────────
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        socket.user = user;
      }
    } catch (err) {
      // Treat as guest
    }
  }
  next();
});

// ── Socket events ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);

  // ── Register player ──────────────────────────────────────────────────────
  socket.on('player:register', async ({ name, rating, universe, gamesPlayed, country }) => {
    const safeUniverse = normalizeUniverse(universe);
    if (socket.user) {
      socketToUserId.set(socket.id, socket.user.id);
      userIdToSocketId.set(socket.user.id, socket.id);
    }

    let authProfile = null;
    if (socket.user) {
      try {
        authProfile = await prisma.user.findUnique({
          where: { id: socket.user.id },
          select: { username: true, chessRating: true, checkersRating: true, chessGames: true, checkersGames: true },
        });
      } catch (_) {
        // DB outage — fall back to client payload
      }
    }

    players.set(socket.id, {
      name: authProfile ? authProfile.username : (name || `Guest_${socket.id.slice(0, 4)}`),
      rating: authProfile
        ? { chess: authProfile.chessRating, checkers: authProfile.checkersRating }
        : (rating || { chess: 1500, checkers: 1450 }),
      gamesPlayed: authProfile
        ? { chess: authProfile.chessGames, checkers: authProfile.checkersGames }
        : (gamesPlayed || { chess: 0, checkers: 0 }),
      status: 'idle',
      universe: safeUniverse,
      country: country || '',
      registeredAt: Date.now(),
    });
    broadcastPlayerList();
    socket.emit('players:online', Array.from(players.entries()).map(([id, info]) => ({ socketId: id, ...info })));
    socket.emit('seeks:list', Array.from(seeks.entries()).map(([seekId, s]) => ({ seekId, ...s })));
  });

  socket.on('player:update-universe', ({ universe }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const nextUniverse = normalizeUniverse(universe);
    if (normalizeUniverse(p.universe) !== nextUniverse && p.status === 'seeking') {
      removeSeekBySocket(socket.id);
      for (const [, q] of queue) {
        const i = q.indexOf(socket.id);
        if (i !== -1) q.splice(i, 1);
      }
      p.status = 'idle';
      p.currentTC = null;
    }
    p.universe = nextUniverse;
    players.set(socket.id, p);
    broadcastPlayerList();
  });

  // ── Global Lobby Chat ───────────────────────────────────────────────────
  socket.on('lobby:chat:send', ({ message, universe }) => {
    if (socketRateLimit(socket.id, 15)) return;
    const player = players.get(socket.id);
    if (!player) return;
    const safe = sanitizeText(message);
    if (!safe) return;
    io.emit('lobby:chat:message', {
      id: crypto.randomBytes(8).toString('hex'),
      senderId: socket.id,
      senderName: sanitizeText(player.name, 30),
      universe: universe || player.universe,
      text: safe,
      timestamp: Date.now(),
    });
  });

  // ── Quick pairing (matchmaking queue) ───────────────────────────────────
  // Registered as both 'seek' (LobbyTab) and 'seek:create' (App.tsx home page)
  const handleSeek = ({ timeControl, universe, betAmount, rated, config: rawConfig }) => {
    universe = normalizeUniverse(universe || rawConfig?.universe || players.get(socket.id)?.universe);
    if (socketRateLimit(socket.id, 10)) {
      socket.emit('room:error', { message: 'Too many seek requests. Please wait.' });
      return;
    }
    const isRated = rawConfig?.rated !== false && rated !== false;
    if (isRated && !socket.user) {
      socket.emit('room:error', { message: 'You must be signed in to play rated games' });
      return;
    }
    const safeBet = sanitizeMoney(betAmount || rawConfig?.betAmount || 0);
    if (safeBet > 0 && !socket.user) {
      socket.emit('room:error', { message: 'You must be signed in to play for money' });
      return;
    }

    const key = `${universe}-${timeControl}`;
    if (!queue.has(key)) queue.set(key, []);
    const q = queue.get(key);

    // Update player status
    const p = players.get(socket.id);
    if (p) { p.status = 'seeking'; p.currentTC = timeControl; p.universe = universe; players.set(socket.id, p); broadcastPlayerList(); }

    // Remove any stale entry of this socket from the queue to prevent self-matching
    const existingIdx = q.indexOf(socket.id);
    if (existingIdx !== -1) q.splice(existingIdx, 1);

    // ── Rating-band matchmaking ──────────────────────────────────────────────
    // Find best candidate in queue within ±300 ELO (expands +100 per 30s, max ±600)
    const seekerRating = (players.get(socket.id)?.rating?.[universe]) ?? 1500;
    let matchedIdx    = -1;
    let matchedId     = null;

    for (let idx = 0; idx < q.length; idx++) {
      const candidateId = q[idx];
      // Find candidate's seek entry to check createdAt for adaptive band
      let candidateSeekAge = 0;
      for (const [, s] of seeks.entries()) {
        if (s.socketId === candidateId) { candidateSeekAge = Date.now() - (s.createdAt || 0); break; }
      }
      // Band starts ±300, grows +100 per 30s of waiting (from candidate's perspective), max ±600
      const expansions = Math.min(Math.floor(candidateSeekAge / 30_000), 3);
      const band = 300 + expansions * 100;
      const candidateRating = (players.get(candidateId)?.rating?.[universe]) ?? 1500;
      if (Math.abs(seekerRating - candidateRating) <= band) {
        matchedIdx = idx;
        matchedId  = candidateId;
        break;
      }
    }

    if (matchedId !== null) {
      q.splice(matchedIdx, 1);
      // Remove the opponent's seek from the public list (clears timeout too)
      removeSeekBySocket(matchedId);
      const roomId = `room-${genId()}`;
      const config = {
        ...(rawConfig || {
          timeControl,
          colorPref: 'random',
          rated: rated !== false,
        }),
        universe, timeControl, betAmount: safeBet,
      };
      startRoom(roomId, matchedId, socket.id, config);
      broadcastSeeks();
    } else {
      q.push(socket.id);
      // Add to public seeks list
      const seekId = genId();
      const playerInfo = players.get(socket.id) || {};
      seeks.set(seekId, {
        socketId: socket.id,
        name: playerInfo.name || 'Anonymous',
        rating: playerInfo.rating || { chess: 1500, checkers: 1450 },
        country: playerInfo.country || '',
        timeControl,
        universe,
        betAmount: safeBet,
        rated: rated !== false,
        createdAt: Date.now(),
      });
      broadcastSeeks();
      socket.emit('seeking', { timeControl, universe, seekId });

      // ── 120-second seek expiry ─────────────────────────────────────────────
      const expireTimeout = setTimeout(() => {
        if (!seeks.has(seekId)) return; // already matched or cancelled
        seeks.delete(seekId);
        seekTimeouts.delete(seekId);
        // Remove from queue
        const qNow = queue.get(key) || [];
        const qi   = qNow.indexOf(socket.id);
        if (qi !== -1) qNow.splice(qi, 1);
        // Set player idle
        const pExp = players.get(socket.id);
        if (pExp) { pExp.status = 'idle'; pExp.currentTC = null; players.set(socket.id, pExp); broadcastPlayerList(); }
        socket.emit('seek:expired', { seekId });
        socket.emit('seek:expire', { seekId });
        broadcastSeeks();
      }, 120_000);
      seekTimeouts.set(seekId, expireTimeout);
    }
  };
  socket.on('seek', handleSeek);
  socket.on('seek:create', ({ tc, timeControl, universe, betAmount, rated } = {}) => {
    handleSeek({ timeControl: tc || timeControl, universe, betAmount, rated });
  });

  // ── Accept a public seek from the lobby ──────────────────────────────────
  socket.on('seek:accept', ({ seekId }) => {
    const seek = seeks.get(seekId);
    if (!seek) { socket.emit('room:error', { message: 'Seek no longer available' }); return; }
    if (seek.socketId === socket.id) { socket.emit('room:error', { message: 'Cannot accept your own seek' }); return; }
    if (seek.rated !== false && !socket.user) {
      socket.emit('room:error', { message: 'You must be signed in to play rated games' });
      return;
    }
    const acceptor = players.get(socket.id);
    if (!acceptor || normalizeUniverse(acceptor.universe) !== seek.universe) {
      socket.emit('room:error', {
        message: `This table is in the ${universeLabel(seek.universe)} lobby. Switch universes to join it.`,
      });
      return;
    }

    // Remove from public list (and cancel its expiry timer) and from the queue
    removeSeekById(seekId);
    const key = `${seek.universe}-${seek.timeControl}`;
    const q = queue.get(key) || [];
    const i = q.indexOf(seek.socketId);
    if (i !== -1) q.splice(i, 1);

    const roomId = `room-${genId()}`;
    const config = {
      universe: seek.universe, timeControl: seek.timeControl,
      betAmount: seek.betAmount, colorPref: 'random', rated: seek.rated,
    };
    startRoom(roomId, seek.socketId, socket.id, config);
    broadcastSeeks();
  });

  socket.on('seek:cancel', () => {
    removeSeekBySocket(socket.id);
    for (const [, q] of queue) {
      const i = q.indexOf(socket.id);
      if (i !== -1) q.splice(i, 1);
    }
    const p = players.get(socket.id);
    if (p) { p.status = 'idle'; p.currentTC = null; players.set(socket.id, p); broadcastPlayerList(); }
    broadcastSeeks();
  });

  // ── Reconnect (page refresh mid-game) ───────────────────────────────────
  socket.on('room:rejoin', ({ roomId, token }) => {
    // Rate-limit rejoin attempts to prevent token brute-forcing
    if (socketRateLimit(socket.id, 10)) {  // max 10 rejoin attempts/min
      socket.emit('room:rejoin:denied', { reason: 'Too many attempts — try again later' });
      return;
    }
    if (typeof roomId !== 'string' || typeof token !== 'string') return;
    const tokens = reconnectTokens.get(roomId);
    if (!tokens) { socket.emit('room:rejoin:denied', { reason: 'Game not found' }); return; }

    let color = null;
    if (tokens.white.token === token) color = 'white';
    else if (tokens.black.token === token) color = 'black';
    else { socket.emit('room:rejoin:denied', { reason: 'Invalid token' }); return; }

    const room = rooms.get(roomId);
    if (!room) { socket.emit('room:rejoin:denied', { reason: 'Game over' }); return; }

    // Update socket ID in room and token store
    const oldSocketId = tokens[color].socketId;
    tokens[color].socketId = socket.id;
    room.players[color] = socket.id;
    socket.join(roomId);

    // Re-register in players map under new socket ID
    const oldPlayer = players.get(oldSocketId);
    if (oldPlayer) { players.set(socket.id, oldPlayer); players.delete(oldSocketId); }

    const lastMove  = room.moves.length > 0 ? room.moves[room.moves.length - 1] : null;
    const isCheckers = room.config?.universe === 'checkers';

    socket.emit('room:state', {
      roomId,
      color,
      config:   room.config,
      moves:    room.moves,
      fen:      !isCheckers ? (lastMove?.fen   || null) : null,
      board:    isCheckers  ? (lastMove?.board || null) : null,
      white: room.players.white,
      black: room.players.black,
      whitePlayer: players.get(room.players.white),
      blackPlayer: players.get(room.players.black),
      whiteTime: room.whiteTime,
      blackTime: room.blackTime,
    });
    socket.emit('room:tokens', { roomId, token, color });
    socket.to(roomId).emit('player-reconnected', { socketId: socket.id, color });

    log.info(`[rejoin] ${socket.id} rejoined ${roomId} as ${color}`);
  });

  // ── Request player info for a room (called on game component mount) ──────
  socket.on('room:request-players', ({ roomId }) => {
    if (socketRateLimit(socket.id, 10)) return;

    const room = rooms.get(roomId);
    if (!room) return;
    const wp = players.get(room.players.white);
    const bp = players.get(room.players.black);

    // Shortcut reconnect for mobile users who lost sessionStorage (can't use room:rejoin).
    // Guard: only update the slot when the original socket is confirmed dead.
    // If the original socket is still alive, the second tab gets read-only player info only.
    const myUserId = socketToUserId.get(socket.id);
    if (myUserId) {
      const whiteUserId = socketToUserId.get(room.players.white);
      const blackUserId = socketToUserId.get(room.players.black);

      if (whiteUserId === myUserId) {
        const oldSocketId = room.players.white;
        if (!io.sockets.sockets.has(oldSocketId)) {
          room.players.white = socket.id;
          log.warn(`[SHORTCUT-REJOIN] userId=${myUserId} roomId=${roomId} newSocket=${socket.id} replacedSocket=${oldSocketId} ts=${Date.now()}`);
        }
      } else if (blackUserId === myUserId) {
        const oldSocketId = room.players.black;
        if (!io.sockets.sockets.has(oldSocketId)) {
          room.players.black = socket.id;
          log.warn(`[SHORTCUT-REJOIN] userId=${myUserId} roomId=${roomId} newSocket=${socket.id} replacedSocket=${oldSocketId} ts=${Date.now()}`);
        }
      }
    }

    if (room.players.white === socket.id || room.players.black === socket.id) {
      socket.join(roomId);
    }

    socket.emit('room:players', {
      whitePlayer: { name: wp?.name || 'White', rating: wp?.rating || { chess: 1500, checkers: 1450 }, country: wp?.country || '' },
      blackPlayer: { name: bp?.name || 'Black', rating: bp?.rating || { chess: 1500, checkers: 1450 }, country: bp?.country || '' },
    });
  });

  socket.on('seeks:request', () => {
    const list = Array.from(seeks.entries()).map(([seekId, s]) => ({ seekId, ...s }));
    socket.emit('seeks:list', list);
  });

  // ── Berserk ──────────────────────────────────────────────────────────────
  socket.on('berserk:activate', ({ roomId }) => {
    if (typeof roomId !== 'string') return;
    const room = rooms.get(roomId);
    if (!room) return;
    // Validate the socket is actually in the room
    const color = room.players.white === socket.id ? 'white' : room.players.black === socket.id ? 'black' : null;
    if (!color) return;
    if (!room.berserk) room.berserk = { white: false, black: false };
    if (room.berserk[color]) return; // already activated
    room.berserk[color] = true;
    // Broadcast to both players so opponent sees the badge too
    io.to(roomId).emit('room:berserk', { socketId: socket.id, color });
    console.log(`[BERSERK] ${socket.id} (${color}) activated berserk in room ${roomId}`);
  });

  socket.on('room:leave', ({ roomId }) => {
    if (typeof roomId !== 'string') return;
    socket.leave(roomId);
    io.to(roomId).emit('player-disconnected', { socketId: socket.id, explicit: true });
    log.info(`[ROOM] Player ${socket.id} explicitly left room ${roomId}`);
  });

  // ── Direct invite ────────────────────────────────────────────────────────
  socket.on('invite:send', ({ targetSocketId, config }) => {
    const sender = players.get(socket.id);
    const target = players.get(targetSocketId);
    if (!sender || !target) {
      socket.emit('room:error', { message: 'That player is no longer available.' });
      return;
    }

    const inviteUniverse = normalizeUniverse(config?.universe || sender.universe);
    if (normalizeUniverse(sender.universe) !== inviteUniverse || normalizeUniverse(target.universe) !== inviteUniverse) {
      socket.emit('room:error', {
        message: `You can only challenge players who are in the ${universeLabel(inviteUniverse)} lobby.`,
      });
      return;
    }

    const safeConfig = { ...config, universe: inviteUniverse };
    const inviteId = genId();
    const expiresAt = Date.now() + 30_000;
    invites.set(inviteId, { fromId: socket.id, toId: targetSocketId, config: safeConfig, expiresAt });

    io.to(targetSocketId).emit('invite:received', {
      inviteId,
      fromSocketId: socket.id,
      fromName:   sender.name || 'Unknown',
      fromRating: sender.rating?.[inviteUniverse] || 1500,
      config: safeConfig,
      expiresAt,
    });

    // Auto-expire
    setTimeout(() => invites.delete(inviteId), 30_000);
  });

  socket.on('invite:accept', ({ inviteId, fromSocketId }) => {
    const invite = invites.get(inviteId);
    if (!invite) { socket.emit('invite:expired'); return; }
    if (invite.toId !== socket.id) { socket.emit('invite:expired'); return; }
    invites.delete(inviteId);

    const inviteUniverse = normalizeUniverse(invite.config?.universe);
    const inviter = players.get(invite.fromId);
    const accepter = players.get(socket.id);
    if (!inviter || !accepter || normalizeUniverse(inviter.universe) !== inviteUniverse || normalizeUniverse(accepter.universe) !== inviteUniverse) {
      socket.emit('room:error', {
        message: `This challenge is no longer available in the ${universeLabel(inviteUniverse)} lobby.`,
      });
      if (inviter) {
        io.to(invite.fromId).emit('invite:declined', {
          byName: accepter?.name || 'Opponent',
        });
      }
      return;
    }

    const roomId = `room-${genId()}`;
    // Notify the inviter so they can navigate immediately
    const wp = players.get(invite.fromId);
    const bp = players.get(socket.id);
    const gameData = {
      roomId,
      white: invite.fromId, // temporary mapping, startRoom will resolve correctly
      black: socket.id,
      config: invite.config,
      whitePlayer: { name: wp?.name || 'White', rating: wp?.rating || { chess: 1500, checkers: 1450 }, country: wp?.country || '' },
      blackPlayer: { name: bp?.name || 'Black', rating: bp?.rating || { chess: 1500, checkers: 1450 }, country: bp?.country || '' },
    };

    io.to(invite.fromId).emit('invite:accepted', gameData);
    // Notify the joiner as well
    socket.emit('invite:started', gameData);

    startRoom(roomId, invite.fromId, socket.id, invite.config);
  });

  socket.on('invite:decline', ({ inviteId, fromSocketId }) => {
    invites.delete(inviteId);
    io.to(fromSocketId).emit('invite:declined', {
      byName: players.get(socket.id)?.name || 'Opponent',
    });
  });

  socket.on('invite:cancel', () => {
    for (const [inviteId, invite] of invites.entries()) {
      if (invite.fromId !== socket.id) continue;
      invites.delete(inviteId);
      io.to(invite.toId).emit('invite:cancelled', { inviteId });
    }
  });

  // ── Room code flow ───────────────────────────────────────────────────────
  socket.on('room:create', ({ config, creatorName }) => {
    const creator = players.get(socket.id);
    const roomUniverse = normalizeUniverse(config?.universe || creator?.universe);
    if (creator && normalizeUniverse(creator.universe) !== roomUniverse) {
      socket.emit('room:error', {
        message: `Create the room from the ${universeLabel(roomUniverse)} lobby first.`,
      });
      return;
    }

    const safeConfig = { ...config, universe: roomUniverse };
    const code = genCode();
    const roomId = `room-${genId()}`;
    const expiresAt = Date.now() + 10 * 60_000; // 10 min
    codes.set(code, { roomId, config: safeConfig, creatorId: socket.id, expiresAt });

    // Update name if given
    const p = creator || players.get(socket.id);
    if (p && creatorName) { p.name = creatorName; players.set(socket.id, p); }

    socket.emit('room:created', { code, roomId, config: safeConfig, expiresAt });

    // Auto-expire code
    setTimeout(() => codes.delete(code), 10 * 60_000);
  });

  socket.on('room:join', ({ code, joinerName, joinerRating }) => {
    const upper = (code || '').toUpperCase();
    const room = codes.get(upper);

    if (!room) { socket.emit('room:error', { message: 'Room not found or expired' }); return; }
    if (room.creatorId === socket.id) { socket.emit('room:error', { message: 'Cannot join your own room' }); return; }
    if (room.expiresAt < Date.now()) { codes.delete(upper); socket.emit('room:error', { message: 'Room code expired' }); return; }

    // Update joiner info
    const p = players.get(socket.id) || { name: joinerName || 'Guest', rating: { chess: joinerRating || 1500, checkers: 1450 }, status: 'idle', universe: 'chess' };
    if (joinerName) p.name = joinerName;
    players.set(socket.id, p);

    codes.delete(upper);
    startRoom(room.roomId, room.creatorId, socket.id, room.config);
  });


  // ── Spectate events ──────────────────────────────────────────────────────
  socket.on('spectate:join', ({ roomId, username }) => {
    const room = rooms.get(roomId);
    if (!room) { socket.emit('room:error', { message: 'Game not found' }); return; }
    socket.join(roomId);
    if (!room.spectators)     room.spectators     = new Set();
    if (!room.spectatorNames) room.spectatorNames = new Map();
    room.spectators.add(socket.id);
    spectators.set(socket.id, roomId);

    // Determine display name (use registered player name, provided username, or fallback)
    const displayName = sanitizeText(
      players.get(socket.id)?.name || username || `Spectator_${socket.id.slice(0, 4)}`,
      30
    );
    room.spectatorNames.set(socket.id, displayName);

    // Send current game state to the new spectator
    const wName = players.get(room.players.white)?.name || room.players.white;
    const bName = players.get(room.players.black)?.name || room.players.black;
    const specList = Array.from(room.spectatorNames.values());
    socket.emit('spectate:state', {
      fen:      room.config?.universe !== 'checkers' ? (room.moves.length > 0 ? room.moves[room.moves.length - 1].fen : undefined) : undefined,
      board:    room.config?.universe === 'checkers' ? (room.moves.length > 0 ? room.moves[room.moves.length - 1].board : undefined) : undefined,
      moves:    room.moves.map(m => m.move || m.san || ''),
      white:    wName,
      black:    bName,
      viewers:  room.spectators.size,
      spectators: specList,
    });

    // Notify the whole room (players + other spectators) of the updated list
    io.to(roomId).emit('spectate:list', specList);

    // Broadcast a system chat message so players know who joined
    io.to(roomId).emit('chat', {
      message: displayName,
      username: '__spectator_join__',
      isSpectator: false,
      isSystem: true,
      systemType: 'spec_join',
      timestamp: Date.now(),
    });
  });

  socket.on('spectate:leave', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room?.spectators) {
      const name = room.spectatorNames?.get(socket.id);
      room.spectators.delete(socket.id);
      room.spectatorNames?.delete(socket.id);
      const specList = Array.from((room.spectatorNames || new Map()).values());
      io.to(roomId).emit('spectate:list', specList);
      if (name) {
        io.to(roomId).emit('chat', {
          message: name,
          username: '__spectator_leave__',
          isSpectator: false,
          isSystem: true,
          systemType: 'spec_leave',
          timestamp: Date.now(),
        });
      }
    }
    spectators.delete(socket.id);
    socket.leave(roomId);
  });

  // ── Tournament Events ────────────────────────────────────────────────────
  socket.on('tournament:subscribe', ({ id }) => {
    socket.join(`tournament:${id}`);
  });
  socket.on('tournament:unsubscribe', ({ id }) => {
    socket.leave(`tournament:${id}`);
  });

  // ── Friend events ────────────────────────────────────────────────────────
  socket.on('friend:request', ({ targetSocketId }) => {
    const sender = players.get(socket.id);
    if (!sender) return;
    io.to(targetSocketId).emit('friend:request', {
      id: genId(),
      fromSocketId: socket.id,
      fromName: sender.name,
      fromRating: sender.rating || { chess: 1500, checkers: 1450 },
      sentAt: Date.now(),
    });
  });

  socket.on('friend:accept', ({ fromSocketId }) => {
    const accepter = players.get(socket.id);
    if (!accepter) return;
    io.to(fromSocketId).emit('friend:accepted', {
      socketId: socket.id,
      name: accepter.name,
      rating: accepter.rating || { chess: 1500, checkers: 1450 },
    });
  });

  socket.on('friend:decline', ({ fromSocketId }) => {
    io.to(fromSocketId).emit('friend:declined', { bySocketId: socket.id });
  });

  // ── Server-detected game over (authoritative) ─────────────────────────────
  function serverGameOver(roomId, result, reason) {
    // result: 'win' | 'loss' | 'draw' (from white's perspective)
    const room = rooms.get(roomId);
    if (!room) return;
    const universe = room.config?.universe;
    io.to(roomId).emit('game-over', { result: reason, by: 'server' });
    if (room.config?.rated !== false) settleElo(roomId, result, universe, reason);
    else settleUnratedGameStats(roomId, result, reason);
    settleBets(roomId, result);
    settleTournamentRoom(roomId, result);
    [room.players.white, room.players.black].forEach(id => {
      const p = players.get(id);
      if (p) { p.status = 'idle'; p.currentTC = null; players.set(id, p); }
    });
    rooms.delete(roomId);
    reconnectTokens.delete(roomId);
    broadcastPlayerList();
    io.emit('tournament:global_update'); // notify any active tournament pages that a game ended
    log.info(`[GAME] Server-detected game over: ${reason} in room ${roomId}`);
  }

  // ── In-game events ───────────────────────────────────────────────────────
  socket.on('move', (payload) => {
    if (socketRateLimit(socket.id, 200)) return; // 200 moves/min cap
    if (!payload || typeof payload.roomId !== 'string') return;
    const room = rooms.get(payload.roomId);
    if (!room) return;
    // Verify sender is an actual participant (not a spectator injecting moves)
    const isParticipant = room.players.white === socket.id || room.players.black === socket.id;
    if (!isParticipant) return;
    
    // For rated games, we prefer socket.user (Supabase verified), 
    // but if it's missing (e.g. auth fail), we fallback to our verified presence record
    const pRecord = players.get(socket.id);
    if (room.config?.rated && !socket.user && (!pRecord || pRecord.status === 'idle')) {
      console.warn(`[Auth] Rated move rejected: User unverified. socket.id=${socket.id}`);
      socket.emit('room:error', { message: 'Authentication required for rated games' });
      return;
    }
    // Verify turn order: white moves on even indices (0, 2, 4…), black on odd (1, 3, 5…)
    const expectedWhite = room.moves.length % 2 === 0;
    const senderIsWhite = room.players.white === socket.id;
    if (senderIsWhite !== expectedWhite) return; // out of turn — reject silently

    // ── Update authoritative clocks ──────────────────────────────────────
    const now = Date.now();
    const elapsed = now - room.lastMoveTime;
    const tc = parseTimeControl(room.config?.timeControl || '5+0');
    
    if (senderIsWhite) {
      room.whiteTime = Math.max(0, room.whiteTime - elapsed + tc.increment);
    } else {
      room.blackTime = Math.max(0, room.blackTime - elapsed + tc.increment);
    }
    room.lastMoveTime = now;
    
    // Attach times to payload for client synchronization
    payload.whiteTime = room.whiteTime;
    payload.blackTime = room.blackTime;

    // ── Chess: server-side move validation via chess.js ──────────────────
    if (room.chessEngine) {
      const moveResult = room.chessEngine.move({
        from: payload.from,
        to:   payload.to,
        promotion: payload.promotion || undefined,
      });
      if (!moveResult) {
        // Illegal move — reject silently (don't relay to opponent)
        log.warn(`[MOVE] Illegal chess move rejected: ${payload.from}->${payload.to} in room ${payload.roomId}`);
        socket.emit('move:rejected', { reason: 'illegal', from: payload.from, to: payload.to });
        return;
      }
      // Attach the validated SAN and FEN to the payload for consistency
      payload.san = moveResult.san;
      payload.fen = room.chessEngine.fen();
    }

    room.moves.push({ ...payload, player: socket.id });
    socket.to(payload.roomId).emit('move', payload);
    io.to(payload.roomId).emit('spectate:move', {
      fen:          payload.fen,
      move:         payload.move || payload.san,
      board:        payload.board,
      draughtsMove: payload.draughtsMove,
      whiteTime:    room.whiteTime,
      blackTime:    room.blackTime,
    });

    // ── Chess: server-side game-over detection ──────────────────────────
    if (room.chessEngine && room.chessEngine.isGameOver()) {
      let result, reason;
      if (room.chessEngine.isCheckmate()) {
        // The side whose turn it is has been checkmated → they lost
        // chess.js turn() returns the side TO MOVE, which is the losing side after checkmate
        const loserTurn = room.chessEngine.turn(); // 'w' or 'b'
        result = loserTurn === 'w' ? 'loss' : 'win'; // from white's perspective
        reason = loserTurn === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
      } else if (room.chessEngine.isStalemate()) {
        result = 'draw'; reason = 'Draw by stalemate';
      } else if (room.chessEngine.isThreefoldRepetition()) {
        result = 'draw'; reason = 'Draw by threefold repetition';
      } else if (room.chessEngine.isInsufficientMaterial()) {
        result = 'draw'; reason = 'Draw by insufficient material';
      } else if (room.chessEngine.isDraw()) {
        result = 'draw'; reason = 'Draw by 50-move rule';
      } else {
        result = 'draw'; reason = 'Draw';
      }
      serverGameOver(payload.roomId, result, reason);
    }
  });

  socket.on('chat', ({ roomId, message }) => {
    if (socketRateLimit(socket.id, 20)) return; // 20 chat msgs/min
    if (typeof roomId !== 'string') return;
    const safe = sanitizeText(message);
    if (!safe) return;
    const room = rooms.get(roomId);
    // Resolve name from server-authoritative sources only — never trust client-provided username.
    // Spectator name (set at spectate:join) takes precedence over the player registry.
    const specName = room?.spectatorNames?.get(socket.id);
    const isSpectator = !!specName;
    const safeName = sanitizeText(specName || players.get(socket.id)?.name || 'Player', 30);
    io.to(roomId).emit('chat', { message: safe, username: safeName, isSpectator, timestamp: Date.now() });
  });

  socket.on('place-bet', ({ roomId, amount }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const safeAmount = sanitizeMoney(amount);
    if (safeAmount <= 0) return;
    const color = room.players.white === socket.id ? 'white' : 'black';
    room.bets[color] = safeAmount;
    io.to(roomId).emit('bet-placed', { color, amount: safeAmount });
  });

  // ── Game over: compute + broadcast ELO ──────────────────────────────────
  async function settleElo(roomId, result, universe, reason) {
    const room = rooms.get(roomId);
    if (!room || !room.config?.rated) return;

    const whiteId = room.players.white;
    const blackId = room.players.black;
    const wp = players.get(whiteId);
    const bp = players.get(blackId);
    if (!wp || !bp) return;

    const uv = universe || room.config?.universe || 'chess';

    // Resolve DB user IDs — guests have no DB record, skip ELO
    const dbWhiteId = socketToUserId.get(whiteId);
    const dbBlackId = socketToUserId.get(blackId);
    if (!dbWhiteId || !dbBlackId) return;

    // Fetch authoritative ratings from DB — never trust client-supplied values
    let whiteDb, blackDb;
    try {
      [whiteDb, blackDb] = await Promise.all([
        prisma.user.findUnique({
          where: { id: dbWhiteId },
          select: {
            chessRating: true, checkersRating: true,
            chessGames: true,  checkersGames: true,
            peakChessRating: true, peakCheckersRating: true,
          },
        }),
        prisma.user.findUnique({
          where: { id: dbBlackId },
          select: {
            chessRating: true, checkersRating: true,
            chessGames: true,  checkersGames: true,
            peakChessRating: true, peakCheckersRating: true,
          },
        }),
      ]);
    } catch (e) {
      console.error('[ELO] DB fetch failed before ELO computation:', e);
      return;
    }
    if (!whiteDb || !blackDb) return;

    const wR = uv === 'chess' ? whiteDb.chessRating    : whiteDb.checkersRating;
    const bR = uv === 'chess' ? blackDb.chessRating    : blackDb.checkersRating;
    const wG = uv === 'chess' ? whiteDb.chessGames     : whiteDb.checkersGames;
    const bG = uv === 'chess' ? blackDb.chessGames     : blackDb.checkersGames;

    const elo = computeElo(wR, bR, result, wG, bG);

    // Update in-memory Map so broadcastPlayerList() shows fresh ratings
    if (!wp.rating) wp.rating = {};
    if (!bp.rating) bp.rating = {};
    wp.rating[uv] = elo.white.after;
    bp.rating[uv] = elo.black.after;
    if (!wp.gamesPlayed) wp.gamesPlayed = {};
    if (!bp.gamesPlayed) bp.gamesPlayed = {};
    wp.gamesPlayed[uv] = wG + 1;
    bp.gamesPlayed[uv] = bG + 1;
    players.set(whiteId, wp);
    players.set(blackId, bp);

    const wWinsInc   = result === 'win'  ? 1 : 0;
    const wLossesInc = result === 'loss' ? 1 : 0;
    const wDrawsInc  = result === 'draw' ? 1 : 0;
    const bWinsInc   = result === 'loss' ? 1 : 0;
    const bLossesInc = result === 'win'  ? 1 : 0;
    const bDrawsInc  = result === 'draw' ? 1 : 0;

    // Build field names dynamically based on universe
    const ratingField = uv === 'chess' ? 'chessRating'         : 'checkersRating';
    const peakWField  = uv === 'chess' ? 'peakChessRating'     : 'peakCheckersRating';
    const peakBField  = uv === 'chess' ? 'peakChessRating'     : 'peakCheckersRating';
    const gamesField  = uv === 'chess' ? 'chessGames'          : 'checkersGames';
    const wWinsField  = uv === 'chess' ? 'chessWins'           : 'checkersWins';
    const wLossField  = uv === 'chess' ? 'chessLosses'         : 'checkersLosses';
    const wDrawField  = uv === 'chess' ? 'chessDraws'          : 'checkersDraws';

    // Persist ELO atomically. Match update is conditional: room.dbMatchId can be
    // null if the initial match.create() failed silently during room setup.
    try {
      const ops = [
        prisma.user.update({
          where: { id: dbWhiteId },
          data: {
            [ratingField]: elo.white.after,
            [peakWField]:  Math.max(whiteDb[peakWField], elo.white.after),
            [gamesField]:  { increment: 1 },
            [wWinsField]:  { increment: wWinsInc },
            [wLossField]:  { increment: wLossesInc },
            [wDrawField]:  { increment: wDrawsInc },
          },
        }),
        prisma.user.update({
          where: { id: dbBlackId },
          data: {
            [ratingField]: elo.black.after,
            [peakBField]:  Math.max(blackDb[peakBField], elo.black.after),
            [gamesField]:  { increment: 1 },
            [wWinsField]:  { increment: bWinsInc },
            [wLossField]:  { increment: bLossesInc },
            [wDrawField]:  { increment: bDrawsInc },
          },
        }),
      ];
      if (room.dbMatchId) {
        ops.push(prisma.match.update({
          where: { id: room.dbMatchId },
          data: buildMatchEndData(room, result, reason, {
            whiteRatingBefore: elo.white.before,
            whiteRatingAfter: elo.white.after,
            whiteRatingDelta: elo.white.delta,
            blackRatingBefore: elo.black.before,
            blackRatingAfter: elo.black.after,
            blackRatingDelta: elo.black.delta,
          }),
        }));
      }
      await prisma.$transaction(ops);

      // Only emit rating changes after DB confirms the write
      const whiteSocket = io.sockets.sockets.get(whiteId);
      const blackSocket = io.sockets.sockets.get(blackId);

      whiteSocket?.emit('rating:update', {
        universe: uv,
        before:   elo.white.before,
        after:    elo.white.after,
        delta:    elo.white.delta,
        opponent: bp.name,
        opponentRating: bR,
        result,
        playedAt: Date.now(),
      });

      blackSocket?.emit('rating:update', {
        universe: uv,
        before:   elo.black.before,
        after:    elo.black.after,
        delta:    elo.black.delta,
        opponent: wp.name,
        opponentRating: wR,
        result: result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw',
        playedAt: Date.now(),
      });

      broadcastPlayerList();
      console.log(`[ELO] ${uv} | ${wp.name} ${wR}→${elo.white.after} (${elo.white.delta > 0 ? '+' : ''}${elo.white.delta}) vs ${bp.name} ${bR}→${elo.black.after}`);
    } catch (e) {
      console.error('[DB] ELO transaction failed — ratings not saved, not emitted:', e);
    }
  }

  async function settleUnratedGameStats(roomId, result, reason) {
    const room = rooms.get(roomId);
    if (!room || room.config?.rated !== false) return;

    const whiteId = room.players.white;
    const blackId = room.players.black;
    const dbWhiteId = socketToUserId.get(whiteId);
    const dbBlackId = socketToUserId.get(blackId);
    if (!dbWhiteId || !dbBlackId) return;

    const uv = room.config?.universe || 'chess';
    const gamesField = uv === 'chess' ? 'chessGames' : 'checkersGames';
    const wWinsField = uv === 'chess' ? 'chessWins' : 'checkersWins';
    const wLossField = uv === 'chess' ? 'chessLosses' : 'checkersLosses';
    const wDrawField = uv === 'chess' ? 'chessDraws' : 'checkersDraws';
    const wWinsInc = result === 'win' ? 1 : 0;
    const wLossesInc = result === 'loss' ? 1 : 0;
    const wDrawsInc = result === 'draw' ? 1 : 0;
    const bWinsInc = result === 'loss' ? 1 : 0;
    const bLossesInc = result === 'win' ? 1 : 0;
    const bDrawsInc = result === 'draw' ? 1 : 0;

    try {
      const ops = [
        prisma.user.update({
          where: { id: dbWhiteId },
          data: {
            [gamesField]: { increment: 1 },
            [wWinsField]: { increment: wWinsInc },
            [wLossField]: { increment: wLossesInc },
            [wDrawField]: { increment: wDrawsInc },
          },
        }),
        prisma.user.update({
          where: { id: dbBlackId },
          data: {
            [gamesField]: { increment: 1 },
            [wWinsField]: { increment: bWinsInc },
            [wLossField]: { increment: bLossesInc },
            [wDrawField]: { increment: bDrawsInc },
          },
        }),
      ];

      if (room.dbMatchId) {
        ops.push(prisma.match.update({
          where: { id: room.dbMatchId },
          data: buildMatchEndData(room, result, reason),
        }));
      }

      await prisma.$transaction(ops);

      const wp = players.get(whiteId);
      const bp = players.get(blackId);
      if (wp) {
        if (!wp.gamesPlayed) wp.gamesPlayed = {};
        wp.gamesPlayed[uv] = (wp.gamesPlayed[uv] || 0) + 1;
        players.set(whiteId, wp);
      }
      if (bp) {
        if (!bp.gamesPlayed) bp.gamesPlayed = {};
        bp.gamesPlayed[uv] = (bp.gamesPlayed[uv] || 0) + 1;
        players.set(blackId, bp);
      }
      broadcastPlayerList();
    } catch (e) {
      console.error('[DB] Unrated game stats transaction failed:', e);
    }
  }

  // ── Bet escrow: deduct betAmount from both wallets when game starts ──────────
  // Returns true if escrow succeeded (or no bet). Returns false on failure.
  async function escrowBet(roomId) {
    const room = rooms.get(roomId);
    if (!room) return false;
    const betAmount = room.config?.betAmount || 0;
    if (betAmount <= 0) return true;

    const whiteDbId = socketToUserId.get(room.players.white);
    const blackDbId = socketToUserId.get(room.players.black);
    if (!whiteDbId || !blackDbId) return false; // guests can't bet

    try {
      await prisma.$transaction(async (tx) => {
        // SELECT FOR UPDATE: lock both wallet rows to prevent race conditions
        const lockedWallets = await tx.$queryRawUnsafe(
          `SELECT id, "userId", balance FROM "Wallet"
           WHERE "userId" IN ($1, $2)
           FOR UPDATE`,
          whiteDbId, blackDbId
        );

        const whiteWallet = lockedWallets.find(w => w.userId === whiteDbId);
        const blackWallet = lockedWallets.find(w => w.userId === blackDbId);

        if (!whiteWallet || Number(whiteWallet.balance) < betAmount) {
          throw new Error(`White has insufficient balance (need $${betAmount})`);
        }
        if (!blackWallet || Number(blackWallet.balance) < betAmount) {
          throw new Error(`Black has insufficient balance (need $${betAmount})`);
        }

        // 1. Update Match record if it exists, otherwise create it (fallback)
        let finalMatchId = room.dbMatchId;
        if (finalMatchId) {
          await tx.match.update({
            where: { id: finalMatchId },
            data: { betAmount, walletStatus: 'escrowed' }
          });
        } else {
          const dbMatch = await tx.match.create({
            data: {
              universe: room.config?.universe || 'chess',
              timeControl: room.config?.timeControl || '5+0',
              status: 'playing',
              startedAt: new Date(room.createdAt || Date.now()),
              betAmount,
              whiteId: whiteDbId,
              blackId: blackDbId,
              isRated: room.config?.rated !== false,
              walletStatus: 'escrowed',
              ...(room.config?.tournamentId ? { tournamentId: room.config.tournamentId } : {}),
            }
          });
          finalMatchId = dbMatch.id;
          room.dbMatchId = finalMatchId;
        }

        // 2. Deduct from both wallets
        const [w, b] = await Promise.all([
          tx.wallet.update({
            where: { id: whiteWallet.id },
            data: { balance: { decrement: betAmount } },
          }),
          tx.wallet.update({
            where: { id: blackWallet.id },
            data: { balance: { decrement: betAmount } },
          }),
        ]);

        // 3. Record escrow transactions linked to the Match
        await tx.transaction.createMany({
          data: [
            { walletId: whiteWallet.id, amount: -betAmount, type: 'BET_PLACED', status: 'COMPLETED', matchId: finalMatchId },
            { walletId: blackWallet.id, amount: -betAmount, type: 'BET_PLACED', status: 'COMPLETED', matchId: finalMatchId },
          ],
        });

        // Notify clients of updated balance
        const whiteSocket = io.sockets.sockets.get(room.players.white);
        const blackSocket = io.sockets.sockets.get(room.players.black);
        whiteSocket?.emit('wallet:update', { balance: Number(w.balance) });
        blackSocket?.emit('wallet:update', { balance: Number(b.balance) });
      });

      room.escrowed = true;
      rooms.set(roomId, room);
      console.log(`[BET] Escrowed $${betAmount} from each player for room ${roomId}`);
      return true;
    } catch (e) {
      console.error('[BET] Escrow failed:', e.message);
      // Cancel the game and refund nothing (nothing was taken yet)
      io.to(roomId).emit('room:error', { message: `Bet escrow failed: ${e.message}` });
      return false;
    }
  }

  // ── Bet settlement: pay winner (or refund on draw) atomically ───────────────
  // result: 'win' | 'draw' | 'loss'  (from white's perspective)
  async function settleBets(roomId, result) {
    const room = rooms.get(roomId);
    if (!room || !room.escrowed) return; 
    const betAmount = room.config?.betAmount || 0;
    if (betAmount <= 0) return;

    const whiteDbId = socketToUserId.get(room.players.white);
    const blackDbId = socketToUserId.get(room.players.black);
    if (!whiteDbId || !blackDbId) return;

    const HOUSE_CUT = 0.05; 
    const payout    = betAmount * 2 * (1 - HOUSE_CUT); 

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        if (result === 'draw') {
          await prisma.$transaction(async (tx) => {
            const lockedWallets = await tx.$queryRawUnsafe(
              `SELECT id, "userId", balance FROM "Wallet"
               WHERE "userId" IN ($1, $2)
               FOR UPDATE`,
              whiteDbId, blackDbId
            );
            const ww = lockedWallets.find(w => w.userId === whiteDbId);
            const bw = lockedWallets.find(w => w.userId === blackDbId);
            if (!ww || !bw) throw new Error('Wallet not found');

            const [w, b] = await Promise.all([
              tx.wallet.update({ where: { id: ww.id }, data: { balance: { increment: betAmount } } }),
              tx.wallet.update({ where: { id: bw.id }, data: { balance: { increment: betAmount } } }),
              tx.match.update({
                where: { id: room.dbMatchId || roomId },
                data: { status: 'ended', result: 'draw', walletStatus: 'refunded', walletSettledAt: new Date(), endedAt: new Date() }
              })
            ]);
            
            await tx.transaction.createMany({
              data: [
                { walletId: ww.id, amount: betAmount, type: 'BET_REFUND', status: 'COMPLETED', matchId: room.dbMatchId || roomId },
                { walletId: bw.id, amount: betAmount, type: 'BET_REFUND', status: 'COMPLETED', matchId: room.dbMatchId || roomId },
              ],
            });
            io.sockets.sockets.get(room.players.white)?.emit('wallet:update', { balance: Number(w.balance) });
            io.sockets.sockets.get(room.players.black)?.emit('wallet:update', { balance: Number(b.balance) });
          });
        } else {
          const winnerDbId = result === 'win' ? whiteDbId : blackDbId;
          const winnerSocketId = result === 'win' ? room.players.white : room.players.black;

          await prisma.$transaction(async (tx) => {
            const [lockedWallet] = await tx.$queryRawUnsafe(
              `SELECT id, "userId", balance FROM "Wallet" WHERE "userId" = $1 FOR UPDATE`,
              winnerDbId
            );
            if (!lockedWallet) throw new Error('Winner wallet not found');

            const [updated] = await Promise.all([
              tx.wallet.update({ where: { id: lockedWallet.id }, data: { balance: { increment: payout } } }),
              tx.match.update({ 
                where: { id: room.dbMatchId || roomId }, 
                data: {
                  status: 'ended',
                  result: result === 'win' ? 'white' : 'black',
                  walletStatus: 'settled',
                  walletSettledAt: new Date(),
                  endedAt: new Date()
                } 
              })
            ]);

            await tx.transaction.create({
              data: { walletId: lockedWallet.id, amount: payout, type: 'BET_WON', status: 'COMPLETED', matchId: room.dbMatchId || roomId },
            });
            io.sockets.sockets.get(winnerSocketId)?.emit('wallet:update', { balance: Number(updated.balance) });
          });
        }
        return; // Success!
      } catch (e) {
        attempts++;
        console.error(`[BET] Settlement attempt ${attempts} failed:`, e.message);
        if (attempts === maxAttempts) {
          // Final failure — should probably notify admin or mark Match as "NEEDS_SETTLEMENT"
          console.error(`[BET] FATAL: Settlement failed after ${maxAttempts} attempts for room ${roomId}`);
          if (room.dbMatchId) {
            await prisma.match.update({
              where: { id: room.dbMatchId },
              data: { walletStatus: 'failed' },
            }).catch(err => console.error('[BET] Failed to mark wallet settlement failure:', err.message));
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000)); // wait before retry
        }
      }
    }
  }
  socket.on('room:cancel', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    // Only allow cancellation if no moves were made
    if (room.moves.length === 0) {
      socket.to(roomId).emit('room:cancelled');
      markRoomMatchAborted(roomId, 'Cancelled before first move');
      releaseTournamentRoom(roomId);
      rooms.delete(roomId);
      reconnectTokens.delete(roomId);
      const p = players.get(socket.id);
      if (p) { p.status = 'idle'; players.set(socket.id, p); broadcastPlayerList(); }
    }
  });

  socket.on('resign', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.settling) return;
    room.settling = true;
    // Determine result from white's perspective
    const isWhite = room.players.white === socket.id;
    const result  = isWhite ? 'loss' : 'win';
    const universe = room.config?.universe;
    const reason = isWhite ? 'White resigned' : 'Black resigned';
    io.to(roomId).emit('game-over', { result: 'resign', by: socket.id });
    if (room.config?.rated !== false) settleElo(roomId, result, universe, reason);
    else settleUnratedGameStats(roomId, result, reason);
    settleBets(roomId, result);
    settleTournamentRoom(roomId, result);
    rooms.delete(roomId);
    reconnectTokens.delete(roomId);
    const p = players.get(socket.id);
    if (p) { p.status = 'idle'; p.currentTC = null; players.set(socket.id, p); broadcastPlayerList(); }
  });

  socket.on('flag:claim', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.settling) return;

    const isParticipant = room.players.white === socket.id || room.players.black === socket.id;
    if (!isParticipant) return;
    if (room.moves.length === 0) return;

    const whiteToMove = room.moves.length % 2 === 0;
    const flaggedColor = whiteToMove ? 'white' : 'black';
    const now = Date.now();
    const elapsed = Math.max(0, now - room.lastMoveTime);
    const remaining = Math.max(0, (flaggedColor === 'white' ? room.whiteTime : room.blackTime) - elapsed);
    if (remaining > 0) {
      socket.emit('flag:denied', { roomId, remaining, color: flaggedColor });
      return;
    }

    room.settling = true;
    if (flaggedColor === 'white') room.whiteTime = 0;
    else room.blackTime = 0;

    const result = flaggedColor === 'white' ? 'loss' : 'win';
    const winner = flaggedColor === 'white' ? 'black' : 'white';
    const universe = room.config?.universe;
    const reason = `${winner === 'white' ? 'White' : 'Black'} wins on time`;
    io.to(roomId).emit('game-over', {
      result: 'timeout',
      reason,
      winner,
      whiteTime: room.whiteTime,
      blackTime: room.blackTime,
      by: 'server',
    });
    if (room.config?.rated !== false) settleElo(roomId, result, universe, reason);
    else settleUnratedGameStats(roomId, result, reason);
    settleBets(roomId, result);
    settleTournamentRoom(roomId, result);
    [room.players.white, room.players.black].forEach(id => {
      const p = players.get(id);
      if (p) { p.status = 'idle'; p.currentTC = null; players.set(id, p); }
    });
    rooms.delete(roomId);
    reconnectTokens.delete(roomId);
    broadcastPlayerList();
    io.emit('tournament:global_update');
    log.info(`[GAME] Timeout claimed in room ${roomId}: ${winner} wins`);
  });

  // ── game:over — SECURED: only accepted for draughts (no server-side engine),
  // and only from actual participants. Chess game-over is detected server-side
  // after each validated move (see move handler above).
  socket.on('game:over', ({ roomId, result, universe }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    // Idempotency: if settlement is already in progress (e.g. both players emit simultaneously), ignore
    if (room.settling) {
      log.warn(`[GAME] Duplicate game:over for room ${roomId} — ignored`);
      return;
    }

    // Reject if sender is not a participant
    const isParticipant = room.players.white === socket.id || room.players.black === socket.id;
    if (!isParticipant) {
      log.warn(`[GAME] Non-participant tried to end game in room ${roomId}`);
      return;
    }

    // Chess games are settled by the server after move validation — ignore client claims
    if (room.config?.universe === 'chess' || room.chessEngine) {
      log.warn(`[GAME] Client tried to dictate chess result in room ${roomId} — ignored`);
      return;
    }

    // For draughts: accept but validate the result value
    if (!['white', 'black', 'draw'].includes(result)) return;

    // Mark as settling immediately to prevent race with a second simultaneous claim
    room.settling = true;

    const eloResult = result === 'white' ? 'win' : result === 'draw' ? 'draw' : 'loss';
    const reasonText = result === 'draw' ? 'Draw' : (result === 'white' ? 'White wins' : 'Black wins');
    io.to(roomId).emit('game-over', {
      result: reasonText,
      by: 'server',
    });
    if (room.config?.rated !== false) settleElo(roomId, eloResult, universe, reasonText);
    else settleUnratedGameStats(roomId, eloResult, reasonText);
    settleBets(roomId, eloResult);
    settleTournamentRoom(roomId, eloResult);
    [room.players.white, room.players.black].forEach(id => {
      const p = players.get(id);
      if (p) { p.status = 'idle'; p.currentTC = null; players.set(id, p); }
    });
    rooms.delete(roomId);
    reconnectTokens.delete(roomId);
    broadcastPlayerList();
  });

  // ── Draw offer / accept / decline ───────────────────────────────────────────
  socket.on('draw:offer', ({ roomId }) => {
    socket.to(roomId).emit('draw:offer', { from: socket.id });
  });

  socket.on('draw:accept', ({ roomId }) => {
    const room = rooms.get(roomId);
    io.to(roomId).emit('game-over', { result: 'draw', reason: 'agreement' });
    if (room) {
      if (room.config?.rated !== false) settleElo(roomId, 'draw', room.config?.universe, 'Draw by agreement');
      else settleUnratedGameStats(roomId, 'draw', 'Draw by agreement');
      settleBets(roomId, 'draw');
      settleTournamentRoom(roomId, 'draw');
      [room.players.white, room.players.black].forEach(id => {
        const p = players.get(id);
        if (p) { p.status = 'idle'; p.currentTC = null; players.set(id, p); }
      });
      rooms.delete(roomId);
      reconnectTokens.delete(roomId);
      broadcastPlayerList();
    }
  });

  socket.on('draw:decline', ({ roomId }) => {
    socket.to(roomId).emit('draw:declined');
  });

  // ── Takeback request / accept / decline ─────────────────────────────────
  socket.on('takeback:request', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.players.white !== socket.id && room.players.black !== socket.id) return;
    // Cancel any stale pending request from this room first
    const existing = takebackRequests.get(roomId);
    if (existing) { clearTimeout(existing.timeoutId); takebackRequests.delete(roomId); }
    const opponentId = room.players.white === socket.id ? room.players.black : room.players.white;
    const timeoutId  = setTimeout(() => {
      takebackRequests.delete(roomId);
      socket.emit('takeback:expired');
    }, 15_000);
    takebackRequests.set(roomId, { fromId: socket.id, timeoutId });
    io.sockets.sockets.get(opponentId)?.emit('takeback:request', { from: socket.id });
  });

  socket.on('takeback:accept', ({ roomId }) => {
    const req  = takebackRequests.get(roomId);
    const room = rooms.get(roomId);
    if (!req || !room || req.fromId === socket.id) return; // only opponent can accept
    clearTimeout(req.timeoutId);
    takebackRequests.delete(roomId);
    // How many half-moves to undo: 1 if requester moved last, 2 if opponent replied
    const movesLen          = room.moves.length;
    const requesterIsWhite  = room.players.white === req.fromId;
    // White moves on odd-indexed half-moves (1st, 3rd…), black on even-indexed (2nd, 4th…)
    const requesterMovedLast = requesterIsWhite ? (movesLen % 2 === 1) : (movesLen % 2 === 0);
    const undoCount = (movesLen > 0 && requesterMovedLast) ? 1 : (movesLen >= 2 ? 2 : 0);
    for (let i = 0; i < undoCount; i++) room.moves.pop();
    const lastMove  = room.moves.length > 0 ? room.moves[room.moves.length - 1] : null;
    const isCheckers = room.config?.universe === 'checkers';
    io.to(roomId).emit('takeback:accept', {
      undoCount,
      fen:   !isCheckers ? (lastMove?.fen   ?? undefined) : undefined,
      board:  isCheckers ? (lastMove?.board ?? undefined) : undefined,
    });
  });

  socket.on('takeback:decline', ({ roomId }) => {
    const req = takebackRequests.get(roomId);
    if (!req) return;
    clearTimeout(req.timeoutId);
    takebackRequests.delete(roomId);
    io.sockets.sockets.get(req.fromId)?.emit('takeback:declined');
  });

  // ── WebRTC signaling ─────────────────────────────────────────────────────
  socket.on('webrtc-offer',         ({ roomId, offer })     => socket.to(roomId).emit('webrtc-offer',         { offer, from: socket.id }));
  socket.on('webrtc-answer',        ({ roomId, answer })    => socket.to(roomId).emit('webrtc-answer',        { answer, from: socket.id }));
  socket.on('webrtc-ice-candidate', ({ roomId, candidate }) => socket.to(roomId).emit('webrtc-ice-candidate', { candidate, from: socket.id }));

  // ── Disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    players.delete(socket.id);
    broadcastPlayerList();

    // Cancel seeks
    removeSeekBySocket(socket.id);
    broadcastSeeks();
    for (const [, q] of queue) {
      const i = q.indexOf(socket.id);
      if (i !== -1) q.splice(i, 1);
    }

    // Remove from spectators
    const watchingRoom = spectators.get(socket.id);
    if (watchingRoom) {
      const r = rooms.get(watchingRoom);
      if (r?.spectators) {
        const name = r.spectatorNames?.get(socket.id);
        r.spectators.delete(socket.id);
        r.spectatorNames?.delete(socket.id);
        const specList = Array.from((r.spectatorNames || new Map()).values());
        io.to(watchingRoom).emit('spectate:list', specList);
        if (name) {
          io.to(watchingRoom).emit('chat', {
            message: name, username: '__spectator_leave__',
            isSpectator: false, isSystem: true, systemType: 'spec_leave', timestamp: Date.now(),
          });
        }
      }
      spectators.delete(socket.id);
    }

    const uid = socketToUserId.get(socket.id);
    if (uid) userIdToSocketId.delete(uid);
    socketToUserId.delete(socket.id);

    // Notify rooms
    for (const [roomId, room] of rooms.entries()) {
      if (Object.values(room.players).includes(socket.id)) {
        socket.to(roomId).emit('player-disconnected', { socketId: socket.id });
        markRoomMatchAborted(roomId, 'Player disconnected');
        releaseTournamentRoom(roomId);
        rooms.delete(roomId);
        reconnectTokens.delete(roomId);
      }
    }
  });
});

// ── REST: health check & Auth ────────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, players: players.size, rooms: rooms.size, uptime: process.uptime() });
  } catch (e) {
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

// Railway / Render health check alias
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));


// Supabase Test Endpoint
app.get('/api/supabase/todos', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('todos').select();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Supabase request failed', message: err.message });
  }
});

// Live rooms (for the lobby live-games feed)
app.get('/api/rooms/live', (req, res) => {
  const requestedUniverse = typeof req.query.universe === 'string' ? req.query.universe : '';
  const universeFilter = ['chess', 'checkers'].includes(requestedUniverse) ? requestedUniverse : null;
  const requestedLimit = Number.parseInt(String(req.query.limit || '10'), 10);
  const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 10, 10));

  const live = Array.from(rooms.entries())
    .map(([roomId, room]) => {
      if (!room.players?.white || !room.players?.black || room.settling) return null;
      const uv = room.config?.universe || 'chess';
      if (universeFilter && uv !== universeFilter) return null;

      const wp = players.get(room.players.white);
      const bp = players.get(room.players.black);
      if (!wp || !bp) return null;

      const whiteRating = Number(wp.rating?.[uv]) || 1500;
      const blackRating = Number(bp.rating?.[uv]) || 1500;
      const lastMove = room.moves[room.moves.length - 1];
      const spectators = room.spectators?.size || 0;

      return {
        id: roomId,
        universe: uv,
        white: { name: wp.name || 'White', rating: whiteRating },
        black: { name: bp.name || 'Black', rating: blackRating },
        tc: room.config?.timeControl || '5+0',
        bet: room.config?.betAmount || 0,
        moveCount: room.moves.length,
        spectators,
        startedAt: room.createdAt || Date.now(),
        strength: whiteRating + blackRating,
        fen: uv !== 'checkers'
          ? (lastMove?.fen || room.chessEngine?.fen?.() || new Chess().fen())
          : undefined,
        draughtsBoard: uv === 'checkers' ? lastMove?.board : undefined,
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      (b.strength - a.strength) ||
      (b.spectators - a.spectators) ||
      (b.moveCount - a.moveCount) ||
      (b.startedAt - a.startedAt)
    )
    .slice(0, limit)
    .map(({ strength, ...room }) => room);

  res.json(live);
});

// ── API: Auth sync (Me) ─────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    // Lazy sync: Ensure the Supabase user has a local Prisma profile
    // Also try by Supabase ID directly (handles cases where email changed)
    let user = await prisma.user.findFirst({
      where: { OR: [{ id: req.user.id }, { email: req.user.email }] },
      include: {
        wallet: true,
        matchesAsWhite: true,
        matchesAsBlack: true,
      }
    });

    if (!user) {
      // Create local profile from Supabase user metadata
      let username = req.user.user_metadata?.username || `user_${req.user.id.slice(0, 8)}`;

      // Strip email addresses — some browsers autofill the username field with the email
      if (username.includes('@')) username = username.split('@')[0];
      // Ensure username isn't empty after stripping
      if (!username) username = `user_${req.user.id.slice(0, 8)}`;

      // Ensure username is unique — append random suffix on collision
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing) {
        username = `${username}_${req.user.id.slice(0, 4)}`;
      }

      try {
        const metaCountry = req.user.user_metadata?.country || '';
        user = await prisma.user.create({
          data: {
            id: req.user.id,
            email: req.user.email,
            username,
            country: metaCountry,
            passwordHash: 'SUPABASE_AUTH',
            wallet: { create: { balance: 0 } },
          },
          include: { wallet: true, matchesAsWhite: true, matchesAsBlack: true },
        });
      } catch (createErr) {
        // Race condition: another request already created the profile — just fetch it
        user = await prisma.user.findUnique({
          where: { email: req.user.email },
          include: { wallet: true, matchesAsWhite: true, matchesAsBlack: true },
        });
        if (!user) throw createErr;
      }
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        country: user.country,
        avatarUrl: user.avatarUrl || null,
        bio: user.bio || '',
        socialLinks: user.socialLinks || {},
        walletBalance: user.wallet?.balance || 0,
        rating: { chess: user.chessRating, checkers: user.checkersRating },
        chess: { wins: user.chessWins, losses: user.chessLosses, draws: user.chessDraws, games: user.chessGames },
        checkers: { wins: user.checkersWins, losses: user.checkersLosses, draws: user.checkersDraws, games: user.checkersGames }
      }
    });
  } catch (err) {
    console.error('[/api/auth/me] DB error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});


async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) throw new Error('Invalid session');
    req.user = user;
    // Attach Prisma profile for admin checks
    req.dbUser = await prisma.user.findUnique({ where: { email: user.email }, select: { id: true, username: true } }).catch(() => null);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/** Middleware: require the user to be listed in ADMIN_EMAILS env var. */
async function requireAdmin(req, res, next) {
  // requireAuth must run first
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!adminEmails().includes(req.user.email?.toLowerCase())) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Registration and login are handled by Supabase Auth on the client.
// The /api/auth/me endpoint above lazy-creates the Prisma profile on first sign-in.

// ── REST: Account settings ───────────────────────────────────────────────────
app.patch('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    const { username, country, avatarUrl, bio, socialLinks } = req.body;
    
    const updateData = {};
    if (username && typeof username === 'string' && username.trim().length >= 2) {
      updateData.username = username.trim();
    }
    if (typeof country === 'string') {
      updateData.country = country.toUpperCase().slice(0, 2);
    }
    if (typeof avatarUrl === 'string') {
      updateData.avatarUrl = avatarUrl;
    }
    if (typeof bio === 'string') {
      updateData.bio = bio.slice(0, 500); // cap at 500 chars
    }
    if (socialLinks && typeof socialLinks === 'object') {
      // Only allow known keys; sanitize values
      const allowed = ['twitter', 'lichess', 'chessCom'];
      const cleaned = {};
      for (const k of allowed) {
        if (typeof socialLinks[k] === 'string') cleaned[k] = socialLinks[k].slice(0, 100);
      }
      updateData.socialLinks = cleaned;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No data to update' });
    }

    // Try update by Supabase UUID first; fall back to email in case the row
    // was created before the ID was properly synced (edge case after trigger removal)
    let updated;
    try {
      updated = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
        include: { wallet: true },
      });
    } catch (idErr) {
      if (idErr.code !== 'P2025') throw idErr; // re-throw unexpected errors
      updated = await prisma.user.update({
        where: { email: req.user.email },
        data: { ...updateData, id: req.user.id }, // also fix the ID while we're here
        include: { wallet: true },
      });
    }

    res.json({ user: {
      id: updated.id, username: updated.username, country: updated.country || '',
      avatarUrl: updated.avatarUrl,
      bio: updated.bio || '',
      socialLinks: updated.socialLinks || {},
      walletBalance: updated.wallet?.balance || 0,
      rating: { chess: updated.chessRating, checkers: updated.checkersRating },
      chess:    { wins: updated.chessWins,    losses: updated.chessLosses,    draws: updated.chessDraws,    games: updated.chessGames },
      checkers: { wins: updated.checkersWins, losses: updated.checkersLosses, draws: updated.checkersDraws, games: updated.checkersGames },
    }});
  } catch (err) {
    if (err.code === 'P2002') return res.status(400).json({ error: 'Username already taken' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Profile not found — please sign out and back in.' });
    console.error('[PATCH /api/auth/profile]', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Password changes are handled entirely by Supabase Auth on the client.
// This endpoint is intentionally removed — clients call supabase.auth.updateUser({ password }).
app.post('/api/auth/change-password', (_req, res) => {
  res.status(410).json({ error: 'Use Supabase Auth to change your password.' });
});

// ── REST: Leaderboard ────────────────────────────────────────────────────────
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { universe } = req.query;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const orderByField = universe === 'checkers' ? 'checkersRating' : 'chessRating';
    const users = await prisma.user.findMany({
      orderBy: { [orderByField]: 'desc' },
      take: limit,
      skip: offset,
    });
    const entries = users.map((u, i) => ({
      rank: offset + i + 1,
      id: u.id,
      username: u.username,
      country: u.country || '',
      chessRating: u.chessRating,
      checkersRating: u.checkersRating,
      peakChessRating: u.peakChessRating,
      peakCheckersRating: u.peakCheckersRating,
      chessGames: u.chessGames,
      checkersGames: u.checkersGames,
      chessWins: u.chessWins,
      chessLosses: u.chessLosses,
      chessDraws: u.chessDraws,
      checkersWins: u.checkersWins,
      checkersLosses: u.checkersLosses,
      checkersDraws: u.checkersDraws,
    }));
    res.json(entries);
  } catch (err) {
    console.error('[/api/leaderboard] DB error:', err);
    res.status(500).json({ error: 'Database error fetching leaderboard', details: err.message });
  }
});

// ── REST: Tournaments ────────────────────────────────────────────────────────
const TOURNAMENT_PAIRING_CUTOFF_MS = 2 * 60_000;
const TOURNAMENT_FINISHED_VISIBLE_MS = 5 * 60_000;

function getTournamentLifecycle(tournament, nowMs = Date.now()) {
  const startsAt = new Date(tournament.startsAt).getTime();
  const endsAt = startsAt + (Number(tournament.durationMs) || 0);
  if (nowMs >= endsAt) return 'finished';
  if (nowMs >= startsAt) return 'running';
  return 'upcoming';
}

function getTournamentEndMs(tournament) {
  return new Date(tournament.startsAt).getTime() + (Number(tournament.durationMs) || 0);
}

function isTournamentVisibleInLobby(tournament, nowMs = Date.now()) {
  if (getTournamentLifecycle(tournament, nowMs) !== 'finished') return true;
  return nowMs < getTournamentEndMs(tournament) + TOURNAMENT_FINISHED_VISIBLE_MS;
}

function getTournamentPairingCutoff(tournament) {
  return getTournamentEndMs(tournament) - TOURNAMENT_PAIRING_CUTOFF_MS;
}

app.get('/api/tournaments', async (req, res) => {
  try {
    const ts = await prisma.tournament.findMany({
      include: {
        players: {
          include: { user: { select: { id: true, username: true, chessRating: true, checkersRating: true } } }
        }
      },
      orderBy: { startsAt: 'asc' },
    });
    const nowMs = Date.now();
    const visibleTournaments = ts.filter(t => isTournamentVisibleInLobby(t, nowMs));
    res.json(visibleTournaments.map(t => ({
      ...t,
      status: getTournamentLifecycle(t, nowMs),
      playerCount: t.players.length,
      players: t.players.map(p => ({
        id: p.id, userId: p.userId, score: p.score,
        wins: p.wins, draws: p.draws, losses: p.losses,
        rating: t.universe === 'checkers' ? p.user.checkersRating : p.user.chessRating,
        user: { id: p.user.id, username: p.user.username },
      })),
    })));
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/tournaments', requireAuth, async (req, res) => {
  try {
    const { name, icon, universe, format, timeControl, startsAt, maxPlayers, betEntry, prizePool, durationMs, description, rated, totalRounds } = req.body;

    // Schema validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'name is required (2+ chars)' });
    }
    if (!['chess', 'checkers'].includes(universe)) {
      return res.status(400).json({ error: 'universe must be chess or checkers' });
    }
    if (!['arena', 'swiss', 'roundrobin'].includes(format)) {
      return res.status(400).json({ error: 'format must be arena, swiss, or roundrobin' });
    }
    if (!timeControl || typeof timeControl !== 'string') {
      return res.status(400).json({ error: 'timeControl is required (e.g. "5+0")' });
    }
    if (!startsAt || isNaN(Date.parse(startsAt))) {
      return res.status(400).json({ error: 'startsAt must be a valid ISO date' });
    }
    // Non-admins: must start at least 5 minutes from now, max 30 days out
    const isAdmin = adminEmails().includes(req.user.email?.toLowerCase());
    const startDate = new Date(startsAt);
    const minStart = new Date(Date.now() + 5 * 60 * 1000);
    const maxStart = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (startDate < minStart) {
      return res.status(400).json({ error: 'Tournament must start at least 5 minutes from now' });
    }
    if (!isAdmin && startDate > maxStart) {
      return res.status(400).json({ error: 'Tournament must start within 30 days' });
    }

    const t = await prisma.tournament.create({
      data: {
        name: name.trim().slice(0, 100),
        icon: typeof icon === 'string' ? icon.slice(0, 10) : '🏆',
        universe,
        format,
        timeControl,
        startsAt: startDate,
        maxPlayers: Math.min(Math.max(Number(maxPlayers) || 64, 2), 512),
        betEntry:   Math.max(Number(betEntry)   || 0, 0),
        prizePool:  Math.max(Number(prizePool)  || 0, 0),
        durationMs: Math.max(Math.min(Number(durationMs) || 3600000, 4 * 3600000), 600000),
        description: typeof description === 'string' ? description.slice(0, 500) : '',
        rated: rated !== false,
        totalRounds: Number(totalRounds) || 0,
      },
    });
    io.emit('tournament:global_update');
    res.json(t);
  } catch (err) {
    console.error('[Tournament] Create failed:', err);
    res.status(500).json({ error: 'Failed to create tournament' });
  }
});

app.post('/api/tournaments/:id/join', requireAuth, async (req, res) => {
  const tournamentId = req.params.id;
  const userId = req.user.id;
  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { _count: { select: { players: true } } },
    });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const lifecycle = getTournamentLifecycle(tournament);
    if (lifecycle === 'finished') return res.status(400).json({ error: 'Tournament has finished' });
    if (tournament._count.players >= tournament.maxPlayers) return res.status(400).json({ error: 'Tournament is full' });

    const alreadyJoined = await prisma.tournamentPlayer.findFirst({ where: { tournamentId, userId } });
    if (alreadyJoined) return res.status(400).json({ error: 'Already registered' });

    const entryFee = Number(tournament.betEntry) || 0;

    if (entryFee > 0) {
      await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({ where: { userId } });
        if (!wallet || Number(wallet.balance) < entryFee) {
          throw new Error('Insufficient balance');
        }
        await tx.wallet.update({ where: { userId }, data: { balance: { decrement: entryFee } } });
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: -entryFee,
            type: 'TOURNAMENT_ENTRY',
            status: 'COMPLETED',
            matchId: tournamentId,
          },
        });
        await tx.tournament.update({ where: { id: tournamentId }, data: { prizePool: { increment: entryFee } } });
        await tx.tournamentPlayer.create({ data: { tournamentId, userId } });
      });
      const updated = await prisma.wallet.findUnique({ where: { userId } });
      const sock = [...io.sockets.sockets.values()].find(s => s.user?.id === userId);
      sock?.emit('wallet:update', { balance: Number(updated?.balance ?? 0) });
    } else {
      await prisma.tournamentPlayer.create({ data: { tournamentId, userId } });
    }

    io.to(`tournament:${tournamentId}`).emit('tournament:updated', { id: tournamentId });
    res.json({ ok: true });
  } catch (err) {
    if (err.message === 'Insufficient balance') return res.status(402).json({ error: 'Insufficient balance to pay entry fee' });
    res.status(500).json({ error: 'Failed' });
  }
});

// ── REST: Tournaments (additional) ──────────────────────────────────────────
app.get('/api/tournaments/:id', async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: {
        players: {
          include: { user: { select: { id: true, username: true, chessRating: true, checkersRating: true } } },
          orderBy: { score: 'desc' },
        }
      },
    });
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json({
      ...t,
      status: getTournamentLifecycle(t),
      playerCount: t.players.length,
      players: t.players.map(p => ({
        id: p.id, userId: p.userId, score: p.score,
        wins: p.wins, draws: p.draws, losses: p.losses,
        rating: t.universe === 'checkers' ? p.user.checkersRating : p.user.chessRating,
        user: { id: p.user.id, username: p.user.username },
      })),
    });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/tournaments/:id/leave', requireAuth, async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    const player = await prisma.tournamentPlayer.findFirst({
      where: { tournamentId, userId: req.user.id },
    });
    if (!player) return res.status(404).json({ error: 'You are not registered for this tournament' });

    const lifecycle = getTournamentLifecycle(tournament);
    const entryFee = Number(tournament.betEntry) || 0;
    let refunded = 0;
    let updatedWallet = null;

    if (entryFee > 0 && lifecycle === 'upcoming') {
      updatedWallet = await prisma.$transaction(async (tx) => {
        await tx.tournamentPlayer.delete({ where: { id: player.id } });
        const wallet = await tx.wallet.update({
          where: { userId: req.user.id },
          data: { balance: { increment: entryFee } },
        });
        await tx.tournament.update({
          where: { id: tournamentId },
          data: { prizePool: { decrement: entryFee } },
        });
        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount: entryFee,
            type: 'TOURNAMENT_REFUND',
            status: 'COMPLETED',
            matchId: tournamentId,
          },
        });
        return wallet;
      });
      refunded = entryFee;
    } else {
      await prisma.tournamentPlayer.delete({ where: { id: player.id } });
    }

    if (updatedWallet) {
      const sock = [...io.sockets.sockets.values()].find(s => s.user?.id === req.user.id);
      sock?.emit('wallet:update', {
        balance: Number(updatedWallet.balance),
        message: `Tournament entry refund recorded: $${refunded.toFixed(2)}`,
      });
    }
    io.to(`tournament:${tournamentId}`).emit('tournament:updated', { id: tournamentId });
    res.json({
      ok: true,
      refunded,
      message: refunded > 0
        ? `Entry fee refunded: $${refunded.toFixed(2)}`
        : entryFee > 0 && lifecycle !== 'upcoming'
        ? 'Entry fees are not automatically refunded after a tournament starts'
        : 'Left tournament',
    });
  } catch (err) {
    console.error('[Tournament] Leave failed:', err);
    res.status(500).json({ error: 'Could not leave tournament. No wallet changes were made; please try again.' });
  }
});

app.get('/api/tournaments/:id/games', async (req, res) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { players: true }
    });
    if (!t) return res.status(404).json({ error: 'Not found' });

    await ensureTournamentMatchSchema();

    const matches = await prisma.match.findMany({
      where: { tournamentId: t.id },
      include: {
        white: { select: { username: true } },
        black: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' }
    });

    const games = matches.map(m => {
      let result = '*';
      if (m.result === 'white') result = '1-0';
      else if (m.result === 'black') result = '0-1';
      else if (m.result === 'draw') result = '½-½';

      let moves = 0;
      if (m.pgn) {
        moves = (m.pgn.match(/\d+\./g) || []).length;
      }

      let duration = '0:00';
      if (m.endedAt) {
        const startedAt = m.startedAt || m.createdAt;
        const ms = m.endedAt.getTime() - startedAt.getTime();
        const mnt = Math.floor(ms / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        duration = `${mnt}:${sec.toString().padStart(2, '0')}`;
      }

      return {
        id: m.id,
        white: m.white.username,
        black: m.black.username,
        result,
        moves,
        duration,
        playedAt: (m.endedAt || m.startedAt || m.createdAt).getTime()
      };
    });

    res.json(games);
  } catch (err) {
    console.error('[Tournament] Games error:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── REST: Users ──────────────────────────────────────────────────────────────
app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!user) return res.status(404).json({ error: 'Not found' });
    const { passwordHash, ...safe } = user;
    res.json(safe);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/users/:username/stats', async (req, res) => {
  try {
    const u = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!u) return res.status(404).json({ error: 'Not found' });
    const matches = await prisma.match.findMany({
      where: { OR: [{ whiteId: u.id }, { blackId: u.id }], status: 'ended' },
      select: { universe: true, result: true, whiteId: true, blackId: true },
    });
    const summarize = (universe) => {
      const games = matches.filter(m => m.universe === universe);
      const wins = games.filter(m => (m.whiteId === u.id && m.result === 'white') || (m.blackId === u.id && m.result === 'black')).length;
      const losses = games.filter(m => (m.whiteId === u.id && m.result === 'black') || (m.blackId === u.id && m.result === 'white')).length;
      const draws = games.filter(m => m.result === 'draw').length;
      return { games: games.length, wins, losses, draws, winRate: games.length > 0 ? Math.round((wins / games.length) * 100) : 0 };
    };
    const chessStats = summarize('chess');
    const checkersStats = summarize('checkers');
    res.json({
      username: u.username,
      chess: {
        rating: u.chessRating, peak: u.peakChessRating,
        ...chessStats,
      },
      checkers: {
        rating: u.checkersRating, peak: u.peakCheckersRating,
        ...checkersStats,
      },
    });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/users/:username/games', async (req, res) => {
  try {
    const u = await prisma.user.findUnique({ where: { username: req.params.username } });
    if (!u) return res.status(404).json({ error: 'Not found' });
    const matches = await prisma.match.findMany({
      where: { OR: [{ whiteId: u.id }, { blackId: u.id }], status: 'ended' },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(matches);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ── Full stats: everything needed for the profile deep-dive ──────────────────
app.get('/api/users/:username/full-stats', async (req, res) => {
  try {
    const u = await prisma.user.findUnique({
      where: { username: req.params.username },
      include: {
        wallet: { include: { transactions: { orderBy: { createdAt: 'desc' }, take: 200 } } },
        tournaments: { include: { tournament: { select: { id: true, name: true, icon: true, universe: true, format: true, timeControl: true, status: true, betEntry: true, prizePool: true, startsAt: true } } } },
      },
    });
    if (!u) return res.status(404).json({ error: 'Not found' });

    const matches = await prisma.match.findMany({
      where: { OR: [{ whiteId: u.id }, { blackId: u.id }], status: 'ended' },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Time on platform: sum real completed game durations, with a small fallback for old rows.
    const totalGames   = matches.length;
    const estimatedMs  = matches.reduce((sum, m) => {
      if (m.endedAt) return sum + Math.max(0, m.endedAt.getTime() - m.createdAt.getTime());
      return sum + 5 * 60 * 1000;
    }, 0);

    const resultForUser = (m) => {
      if (m.result === 'draw') return 'draw';
      if ((m.whiteId === u.id && m.result === 'white') || (m.blackId === u.id && m.result === 'black')) return 'win';
      if ((m.whiteId === u.id && m.result === 'black') || (m.blackId === u.id && m.result === 'white')) return 'loss';
      return null;
    };

    const bestStreakFor = (rows) => {
      let best = 0, cur = 0;
      for (const m of [...rows].reverse()) {
        if (resultForUser(m) === 'win') { cur++; best = Math.max(best, cur); } else cur = 0;
      }
      return best;
    };

    const favouriteTCFor = (rows) => {
      const count = {};
      for (const m of rows) { count[m.timeControl] = (count[m.timeControl] || 0) + 1; }
      return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    };

    // Favourite time control
    const bestStreak = bestStreakFor(matches);
    const favouriteTC = favouriteTCFor(matches);

    // Earnings summary from transactions
    const txns = u.wallet?.transactions || [];
    const totalDeposited  = txns.filter(t => t.type === 'DEPOSIT').reduce((s, t) => s + parseFloat(t.amount.toString()), 0);
    const totalWithdrawn  = txns.filter(t => t.type === 'WITHDRAWAL').reduce((s, t) => s + Math.abs(parseFloat(t.amount.toString())), 0);
    const totalBetWon     = txns.filter(t => t.type === 'BET_WON').reduce((s, t) => s + parseFloat(t.amount.toString()), 0);
    const totalBetLost    = txns.filter(t => t.type === 'BET_PLACED').reduce((s, t) => s + Math.abs(parseFloat(t.amount.toString())), 0);

    // Games with bets
    const gamesWithBets   = matches.filter(m => m.betAmount > 0).length;
    const betsWon         = matches.filter(m => m.betAmount > 0 && (
      (m.whiteId === u.id && m.result === 'white') || (m.blackId === u.id && m.result === 'black')
    )).length;

    // By universe
    const chess    = matches.filter(m => m.universe === 'chess');
    const checkers = matches.filter(m => m.universe === 'checkers');
    const summarizeUniverse = (rows, rating, peak) => ({
      games: rows.length,
      wins: rows.filter(m => resultForUser(m) === 'win').length,
      losses: rows.filter(m => resultForUser(m) === 'loss').length,
      draws: rows.filter(m => resultForUser(m) === 'draw').length,
      rating,
      peak,
      bestStreak: bestStreakFor(rows),
      favouriteTC: favouriteTCFor(rows),
    });

    const ratingHistory = matches
      .filter(m => m.isRated)
      .map(m => {
        const isWhite = m.whiteId === u.id;
        const result = resultForUser(m);
        const before = isWhite ? m.whiteRatingBefore : m.blackRatingBefore;
        const after = isWhite ? m.whiteRatingAfter : m.blackRatingAfter;
        const delta = isWhite ? m.whiteRatingDelta : m.blackRatingDelta;
        const opponentRating = isWhite ? m.blackRatingBefore : m.whiteRatingBefore;
        if (!result || typeof before !== 'number' || typeof after !== 'number' || typeof delta !== 'number') return null;
        return {
          matchId: m.id,
          universe: m.universe,
          before,
          after,
          delta,
          opponent: isWhite ? m.black.username : m.white.username,
          opponentRating: typeof opponentRating === 'number' ? opponentRating : 0,
          result,
          playedAt: (m.endedAt || m.createdAt).getTime(),
          timeControl: m.timeControl,
          tournamentId: m.tournamentId,
        };
      })
      .filter(Boolean);

    res.json({
      joinedAt: u.createdAt,
      estimatedPlayMs: estimatedMs,
      totalGames,
      bestStreak,
      favouriteTC,
      chess: summarizeUniverse(chess, u.chessRating, u.peakChessRating),
      checkers: summarizeUniverse(checkers, u.checkersRating, u.peakCheckersRating),
      ratingHistory,
      tournaments: u.tournaments.map(tp => ({
        id: tp.tournament.id,
        name: tp.tournament.name,
        icon: tp.tournament.icon,
        universe: tp.tournament.universe,
        format: tp.tournament.format,
        timeControl: tp.tournament.timeControl,
        status: tp.tournament.status,
        betEntry: tp.tournament.betEntry,
        prizePool: tp.tournament.prizePool,
        startsAt: tp.tournament.startsAt,
        score: tp.score,
        wins: tp.wins, draws: tp.draws, losses: tp.losses,
      })),
      wallet: {
        balance: u.wallet?.balance || 0,
        totalDeposited, totalWithdrawn,
        totalBetWon, totalBetLost,
        netProfit: totalBetWon - totalBetLost,
        gamesWithBets, betsWon,
        transactions: txns.map(t => ({
          id: t.id, amount: t.amount, type: t.type,
          status: t.status, matchId: t.matchId, stripeSessionId: t.stripeSessionId, createdAt: t.createdAt,
        })),
      },
    });
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const match = await prisma.match.findUnique({
      where: { id: req.params.id },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
    });
    if (!match) return res.status(404).json({ error: 'Not found' });
    res.json(match);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ── REST: Head-to-head score ─────────────────────────────────────────────────
// GET /api/h2h?a=usernameA&b=usernameB&universe=chess
app.get('/api/h2h', async (req, res) => {
  try {
    const { a, b, universe } = req.query;
    if (!a || !b || !universe) return res.status(400).json({ error: 'Missing params' });

    const [userA, userB] = await Promise.all([
      prisma.user.findUnique({ where: { username: String(a) } }),
      prisma.user.findUnique({ where: { username: String(b) } }),
    ]);
    if (!userA || !userB) return res.status(404).json({ error: 'User not found' });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const yearStart  = new Date(todayStart.getFullYear(), 0, 1);

    const h2hWhere = {
      universe: String(universe),
      status: 'ended',
      OR: [
        { whiteId: userA.id, blackId: userB.id },
        { whiteId: userB.id, blackId: userA.id },
      ],
    };

    const [todayMatches, yearMatches, allMatches] = await Promise.all([
      prisma.match.findMany({ where: { ...h2hWhere, createdAt: { gte: todayStart } } }),
      prisma.match.findMany({ where: { ...h2hWhere, createdAt: { gte: yearStart  } } }),
      prisma.match.findMany({ where: h2hWhere }),
    ]);

    const tally = (matches) => {
      let aW = 0, bW = 0, draws = 0;
      for (const m of matches) {
        if (!m.result || m.result === 'draw') { draws++; continue; }
        const aIsWhite = m.whiteId === userA.id;
        const whiteWon = m.result === 'white';
        if ((aIsWhite && whiteWon) || (!aIsWhite && !whiteWon)) aW++; else bW++;
      }
      return { a: aW, b: bW, draws };
    };

    res.json({ today: tally(todayMatches), year: tally(yearMatches), all: tally(allMatches) });
  } catch (err) {
    log.error('H2H query failed', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── REST: Correspondence Games ───────────────────────────────────────────────
app.get('/api/correspondence', requireAuth, async (req, res) => {
  try {
    const games = await prisma.correspondenceGame.findMany({
      where: { OR: [{ whiteId: req.user.id }, { blackId: req.user.id }] },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(games);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/correspondence', requireAuth, async (req, res) => {
  try {
    const { universe, timePerMove, opponentUsername } = req.body;
    const CHESS_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    let blackId = null;
    if (opponentUsername) {
      const opp = await prisma.user.findUnique({ where: { username: opponentUsername } });
      if (!opp) return res.status(404).json({ error: 'Opponent not found' });
      blackId = opp.id;
    }
    const game = await prisma.correspondenceGame.create({
      data: {
        universe,
        timePerMove,
        whiteId: req.user.id,
        blackId,
        currentPosition: universe === 'chess' ? CHESS_START : 'initial',
        status: blackId ? 'active' : 'waiting',
      },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
    });
    res.json(game);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.get('/api/correspondence/:id', async (req, res) => {
  try {
    const game = await prisma.correspondenceGame.findUnique({
      where: { id: req.params.id },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
    });
    if (!game) return res.status(404).json({ error: 'Not found' });
    res.json(game);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/correspondence/:id/move', requireAuth, async (req, res) => {
  try {
    const game = await prisma.correspondenceGame.findUnique({ where: { id: req.params.id } });
    if (!game) return res.status(404).json({ error: 'Not found' });
    if (game.status === 'ended') return res.status(400).json({ error: 'Game is over' });

    const isWhite = game.whiteId === req.user.id;
    const isBlack = game.blackId === req.user.id;
    if (!isWhite && !isBlack) return res.status(403).json({ error: 'Not a player' });

    const moverColor = isWhite ? 'white' : 'black';
    if (game.currentTurn !== moverColor) return res.status(400).json({ error: 'Not your turn' });

    const { from, to, promotion } = req.body;
    if (!from || !to || typeof from !== 'string' || typeof to !== 'string') {
      return res.status(400).json({ error: 'from and to squares are required' });
    }

    // ── Chess: validate move server-side using chess.js ──────────────────────
    let san = null;
    let newFen = game.currentPosition;
    let gameStatus = game.status; // 'waiting' | 'active' | 'ended'
    let gameResult = null;
    let resultReason = null;

    if (game.universe === 'chess') {
      const { Chess } = require('chess.js');
      const engine = new Chess(game.currentPosition);

      // Validate it's the right side's turn
      const engineTurn = engine.turn() === 'w' ? 'white' : 'black';
      if (engineTurn !== moverColor) {
        return res.status(400).json({ error: 'Move colour mismatch — board desync' });
      }

      const moveResult = engine.move({
        from: from.toLowerCase(),
        to:   to.toLowerCase(),
        promotion: promotion || undefined,
      });

      if (!moveResult) {
        return res.status(400).json({ error: `Illegal move: ${from}->${to}` });
      }

      san    = moveResult.san;
      newFen = engine.fen();

      // Auto-detect game over
      if (engine.isGameOver()) {
        gameStatus = 'ended';
        if (engine.isCheckmate()) {
          // The side that just moved wins
          gameResult = moverColor;
          resultReason = `${moverColor === 'white' ? 'White' : 'Black'} wins by checkmate`;
        } else if (engine.isStalemate()) {
          gameResult = 'draw'; resultReason = 'Draw by stalemate';
        } else if (engine.isInsufficientMaterial()) {
          gameResult = 'draw'; resultReason = 'Draw by insufficient material';
        } else if (engine.isThreefoldRepetition()) {
          gameResult = 'draw'; resultReason = 'Draw by threefold repetition';
        } else {
          gameResult = 'draw'; resultReason = 'Draw';
        }
      }
    }
    // Draughts: no server-side engine yet — accept client move (turn order already validated above)

    const currentMoves = Array.isArray(game.moves) ? game.moves : [];
    const newMove = { from, to, san: san || `${from}${to}`, fen: newFen, movedAt: Date.now(), player: moverColor };

    const updated = await prisma.correspondenceGame.update({
      where: { id: req.params.id },
      data: {
        moves: [...currentMoves, newMove],
        currentTurn: moverColor === 'white' ? 'black' : 'white',
        currentPosition: newFen,
        ...(gameStatus === 'ended' ? { status: 'ended', result: gameResult, resultReason } : {}),
      },
      include: {
        white: { select: { id: true, username: true, email: true } },
        black: { select: { id: true, username: true, email: true } },
      },
    });

    // Notify opponent by email (fire-and-forget)
    if (gameStatus !== 'ended') {
      const opponent = moverColor === 'white' ? updated.black : updated.white;
      const mover    = moverColor === 'white' ? updated.white : updated.black;
      if (opponent?.email) {
        sendTurnEmail(opponent.email, opponent.username, mover.username, updated.id, san || `${from}${to}`);
      }
    }

    res.json(updated);
  } catch (err) {
    console.error('[Corr] Move failed:', err);
    res.status(500).json({ error: 'Failed' });
  }
});

app.post('/api/correspondence/:id/resign', requireAuth, async (req, res) => {
  try {
    const game = await prisma.correspondenceGame.findUnique({ where: { id: req.params.id } });
    if (!game) return res.status(404).json({ error: 'Not found' });
    if (game.status === 'ended') return res.status(400).json({ error: 'Game is already over' });
    const isWhite = game.whiteId === req.user.id;
    const isBlack = game.blackId === req.user.id;
    if (!isWhite && !isBlack) return res.status(403).json({ error: 'Not a player in this game' });
    const winner = isWhite ? 'black' : 'white';
    const updated = await prisma.correspondenceGame.update({
      where: { id: req.params.id },
      data: { status: 'ended', result: winner, resultReason: 'resignation' },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
    });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/correspondence/:id/draw', requireAuth, async (req, res) => {
  try {
    const game = await prisma.correspondenceGame.findUnique({ where: { id: req.params.id } });
    if (!game) return res.status(404).json({ error: 'Not found' });
    if (game.status === 'ended') return res.status(400).json({ error: 'Game is already over' });
    const isWhite = game.whiteId === req.user.id;
    const isBlack = game.blackId === req.user.id;
    if (!isWhite && !isBlack) return res.status(403).json({ error: 'Not a player in this game' });
    const updated = await prisma.correspondenceGame.update({
      where: { id: req.params.id },
      data: { status: 'ended', result: 'draw', resultReason: 'agreement' },
      include: {
        white: { select: { id: true, username: true } },
        black: { select: { id: true, username: true } },
      },
    });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ── REST: Users ──────────────────────────────────────────────────────────────
app.get('/api/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string') return res.json([]);
    const results = await prisma.$queryRaw`
      SELECT id, username, "chessRating" as "chessRating", "checkersRating" as "checkersRating", country
      FROM "User"
      WHERE username ILIKE ${q + '%'}
      LIMIT 10
    `;
    res.json(results);
  } catch (err) {
    console.error('[Search] Error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.get('/api/friends', requireAuth, async (req, res) => {
  try {
    const all = await prisma.friend.findMany({
      where: { OR: [{ requesterId: req.user.id }, { addresseeId: req.user.id }] },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    });
    const friends  = all.filter(f => f.status === 'accepted');
    const incoming = all.filter(f => f.status === 'pending' && f.addresseeId === req.user.id);
    const outgoing = all.filter(f => f.status === 'pending' && f.requesterId === req.user.id);
    res.json({ friends, incoming, outgoing });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/friends/request', requireAuth, async (req, res) => {
  try {
    const { targetUsername } = req.body;
    const target = await prisma.user.findUnique({ where: { username: targetUsername } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });
    const friend = await prisma.friend.upsert({
      where: { requesterId_addresseeId: { requesterId: req.user.id, addresseeId: target.id } },
      update: { status: 'pending' },
      create: { requesterId: req.user.id, addresseeId: target.id, status: 'pending' },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    });
    res.json(friend);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/friends/accept', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.body;
    const request = await prisma.friend.findUnique({ where: { id: requestId } });
    if (!request || request.addresseeId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    const updated = await prisma.friend.update({
      where: { id: requestId },
      data: { status: 'accepted' },
      include: {
        requester: { select: { id: true, username: true } },
        addressee: { select: { id: true, username: true } },
      },
    });
    res.json(updated);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/friends/decline', requireAuth, async (req, res) => {
  try {
    const { requestId } = req.body;
    await prisma.friend.update({ where: { id: requestId }, data: { status: 'declined' } });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.delete('/api/friends/:friendId', requireAuth, async (req, res) => {
  try {
    await prisma.friend.deleteMany({
      where: {
        id: req.params.friendId,
        OR: [{ requesterId: req.user.id }, { addresseeId: req.user.id }],
      },
    });
    res.json({ ok: true });
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ── REST: Safety and moderation ─────────────────────────────────────────────
app.post('/api/safety/report', requireAuth, async (req, res) => {
  try {
    await ensureSafetySchema();
    const reporter = await getLocalAuthUser(req);
    if (!reporter) return res.status(404).json({ error: 'Account profile not synced yet' });

    const reason = sanitizeText(req.body?.reason, 80) || 'player_report';
    const context = sanitizeText(req.body?.context, 80) || null;
    const notes = sanitizeText(req.body?.notes, 1000) || null;
    const matchId = sanitizeText(req.body?.matchId, 80) || null;
    const paymentId = sanitizeText(req.body?.paymentId, 120) || null;
    const targetUsername = sanitizeText(req.body?.targetUsername, 40);
    const target = targetUsername ? await findUserByUsername(targetUsername) : null;

    const id = genId();
    await prisma.$executeRaw`
      INSERT INTO "ModerationReport"
        (id, "reporterId", "targetId", "targetUsername", reason, context, notes, "matchId", "paymentId")
      VALUES
        (${id}, ${reporter.id}, ${target?.id || null}, ${target?.username || targetUsername || null}, ${reason}, ${context}, ${notes}, ${matchId}, ${paymentId})
    `;
    res.json({ ok: true, id });
  } catch (err) {
    console.error('[Safety report] Error:', err);
    res.status(500).json({ error: 'Could not record report' });
  }
});

app.post('/api/safety/review', requireAuth, async (req, res) => {
  try {
    await ensureSafetySchema();
    const reporter = await getLocalAuthUser(req);
    if (!reporter) return res.status(404).json({ error: 'Account profile not synced yet' });

    const reason = sanitizeText(req.body?.reason, 80) || 'suspicious_review';
    const notes = sanitizeText(req.body?.notes, 1000) || null;
    const matchId = sanitizeText(req.body?.matchId, 80) || null;
    const paymentId = sanitizeText(req.body?.paymentId, 120) || null;
    const targetUsername = sanitizeText(req.body?.targetUsername, 40);
    const target = targetUsername ? await findUserByUsername(targetUsername) : null;
    const id = genId();

    await prisma.$executeRaw`
      INSERT INTO "ModerationReport"
        (id, "reporterId", "targetId", "targetUsername", reason, context, notes, "matchId", "paymentId")
      VALUES
        (${id}, ${reporter.id}, ${target?.id || null}, ${target?.username || targetUsername || null}, ${reason}, 'suspicious_review', ${notes}, ${matchId}, ${paymentId})
    `;
    res.json({ ok: true, id });
  } catch (err) {
    console.error('[Safety review] Error:', err);
    res.status(500).json({ error: 'Could not request review' });
  }
});

app.get('/api/safety/blocked', requireAuth, async (req, res) => {
  try {
    await ensureSafetySchema();
    const blocker = await getLocalAuthUser(req);
    if (!blocker) return res.json({ blockedUsers: [] });
    const rows = await prisma.$queryRaw`
      SELECT "targetUsername"
      FROM "UserBlock"
      WHERE "blockerId" = ${blocker.id}
      ORDER BY "createdAt" DESC
    `;
    res.json({ blockedUsers: rows.map(r => r.targetUsername) });
  } catch (err) {
    console.error('[Safety blocked] Error:', err);
    res.status(500).json({ error: 'Could not load blocked users' });
  }
});

app.post('/api/safety/block', requireAuth, async (req, res) => {
  try {
    await ensureSafetySchema();
    const blocker = await getLocalAuthUser(req);
    if (!blocker) return res.status(404).json({ error: 'Account profile not synced yet' });

    const targetUsername = sanitizeText(req.body?.targetUsername, 40);
    if (!targetUsername) return res.status(400).json({ error: 'Target username is required' });
    const target = await findUserByUsername(targetUsername);
    const canonicalUsername = target?.username || targetUsername;
    if (canonicalUsername.toLowerCase() === blocker.username.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    await prisma.$executeRaw`
      INSERT INTO "UserBlock" (id, "blockerId", "targetId", "targetUsername")
      VALUES (${genId()}, ${blocker.id}, ${target?.id || null}, ${canonicalUsername})
      ON CONFLICT ("blockerId", "targetUsername") DO NOTHING
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Safety block] Error:', err);
    res.status(500).json({ error: 'Could not block user' });
  }
});

app.delete('/api/safety/block/:username', requireAuth, async (req, res) => {
  try {
    await ensureSafetySchema();
    const blocker = await getLocalAuthUser(req);
    if (!blocker) return res.json({ ok: true });
    const targetUsername = sanitizeText(req.params.username, 40);
    await prisma.$executeRaw`
      DELETE FROM "UserBlock"
      WHERE "blockerId" = ${blocker.id} AND LOWER("targetUsername") = LOWER(${targetUsername})
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Safety unblock] Error:', err);
    res.status(500).json({ error: 'Could not unblock user' });
  }
});

app.get('/api/admin/moderation', requireAuth, requireAdmin, async (req, res) => {
  try {
    await ensureSafetySchema();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const reports = await prisma.$queryRaw`
      SELECT
        r.id,
        r.reason,
        r.context,
        r.notes,
        r.status,
        r."targetUsername",
        r."matchId",
        r."paymentId",
        r."createdAt",
        reporter.username AS "reporterUsername",
        target.username AS "targetResolvedUsername"
      FROM "ModerationReport" r
      LEFT JOIN "User" reporter ON reporter.id = r."reporterId"
      LEFT JOIN "User" target ON target.id = r."targetId"
      ORDER BY r."createdAt" DESC
      LIMIT ${limit}
    `;
    res.json({ reports });
  } catch (err) {
    console.error('[Admin moderation] Error:', err);
    res.status(500).json({ error: 'Could not load moderation dashboard' });
  }
});

app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (_req, res) => {
  try {
    await ensureSafetySchema();
    await ensureTournamentMatchSchema();

    const now = Date.now();
    await prisma.$queryRaw`SELECT 1`;

    const activeUsers = Array.from(players.entries()).map(([socketId, player]) => ({
      socketId,
      name: player.name || 'Unknown',
      status: player.status || 'idle',
      universe: player.universe || 'chess',
      rating: player.rating || { chess: 1500, checkers: 1450 },
      country: player.country || '',
      connectedForMs: player.registeredAt ? now - player.registeredAt : null,
    })).sort((a, b) => a.name.localeCompare(b.name));

    const activeGames = Array.from(rooms.entries()).map(([roomId, room]) => {
      const white = players.get(room.players?.white);
      const black = players.get(room.players?.black);
      return {
        roomId,
        dbMatchId: room.dbMatchId || null,
        universe: room.config?.universe || 'chess',
        timeControl: room.config?.timeControl || '5+0',
        rated: room.config?.rated !== false,
        betAmount: Number(room.config?.betAmount || 0),
        tournamentId: room.config?.tournamentId || null,
        tournamentName: room.config?.tournamentName || null,
        white: white ? { name: white.name, rating: white.rating?.[room.config?.universe || 'chess'] || 1500 } : null,
        black: black ? { name: black.name, rating: black.rating?.[room.config?.universe || 'chess'] || 1500 } : null,
        moveCount: room.moves?.length || 0,
        spectators: room.spectators?.size || 0,
        durationMs: room.createdAt ? now - room.createdAt : null,
        walletStatus: room.escrowed ? 'escrowed' : 'none',
      };
    }).sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));

    const tournaments = await prisma.tournament.findMany({
      include: {
        _count: { select: { players: true, matches: true } },
      },
      orderBy: { startsAt: 'desc' },
      take: 30,
    });
    const tournamentRows = tournaments.map(tournament => ({
      id: tournament.id,
      name: tournament.name,
      universe: tournament.universe,
      format: tournament.format,
      status: tournament.status,
      lifecycle: getTournamentLifecycle(tournament),
      startsAt: tournament.startsAt,
      durationMs: tournament.durationMs,
      playerCount: tournament._count.players,
      matchCount: tournament._count.matches,
      prizePool: Number(tournament.prizePool || 0),
      betEntry: Number(tournament.betEntry || 0),
    }));
    const tournamentSummary = tournamentRows.reduce((acc, tournament) => {
      acc[tournament.lifecycle] = (acc[tournament.lifecycle] || 0) + 1;
      return acc;
    }, { upcoming: 0, running: 0, finished: 0 });

    const failedTransactions = await prisma.transaction.findMany({
      where: { status: { not: 'COMPLETED' } },
      include: {
        wallet: {
          include: {
            user: { select: { id: true, username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const walletFailures = await prisma.match.findMany({
      where: { walletStatus: 'failed' },
      include: {
        white: { select: { username: true } },
        black: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const disputedGames = await prisma.$queryRaw`
      SELECT
        r.id,
        r.reason,
        r.context,
        r.notes,
        r.status,
        r."matchId",
        r."paymentId",
        r."createdAt",
        reporter.username AS "reporterUsername",
        COALESCE(target.username, r."targetUsername") AS "targetUsername"
      FROM "ModerationReport" r
      LEFT JOIN "User" reporter ON reporter.id = r."reporterId"
      LEFT JOIN "User" target ON target.id = r."targetId"
      WHERE r."matchId" IS NOT NULL
        OR r.context = 'suspicious_review'
        OR r.reason ILIKE '%suspicious%'
      ORDER BY r."createdAt" DESC
      LIMIT 25
    `;

    const flaggedUsers = await prisma.$queryRaw`
      SELECT
        COALESCE(target.username, r."targetUsername") AS username,
        COUNT(*)::int AS "reportCount",
        COUNT(*) FILTER (WHERE r.status = 'open')::int AS "openCount",
        MAX(r."createdAt") AS "lastFlaggedAt",
        ARRAY_AGG(DISTINCT r.reason) AS reasons
      FROM "ModerationReport" r
      LEFT JOIN "User" target ON target.id = r."targetId"
      WHERE COALESCE(target.username, r."targetUsername") IS NOT NULL
      GROUP BY COALESCE(target.username, r."targetUsername")
      ORDER BY "openCount" DESC, "reportCount" DESC, "lastFlaggedAt" DESC
      LIMIT 25
    `;

    const recentReports = await prisma.$queryRaw`
      SELECT
        r.id,
        r.reason,
        r.context,
        r.notes,
        r.status,
        r."targetUsername",
        r."matchId",
        r."paymentId",
        r."createdAt",
        reporter.username AS "reporterUsername",
        target.username AS "targetResolvedUsername"
      FROM "ModerationReport" r
      LEFT JOIN "User" reporter ON reporter.id = r."reporterId"
      LEFT JOIN "User" target ON target.id = r."targetId"
      ORDER BY r."createdAt" DESC
      LIMIT 25
    `;

    res.json({
      health: {
        ok: true,
        db: 'ok',
        uptime: process.uptime(),
        checkedAt: new Date().toISOString(),
        nodeEnv: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        activeUsers: activeUsers.length,
        activeGames: activeGames.length,
        openSeeks: seeks.size,
        recentErrorCount: recentErrors.length,
      },
      activeUsers,
      activeGames,
      tournaments: {
        summary: tournamentSummary,
        recent: tournamentRows,
      },
      failedPayments: {
        transactions: failedTransactions.map(tx => ({
          id: tx.id,
          userId: tx.wallet?.user?.id || null,
          username: tx.wallet?.user?.username || 'Unknown',
          amount: Number(tx.amount),
          type: tx.type,
          status: tx.status,
          matchId: tx.matchId,
          stripeSessionId: tx.stripeSessionId,
          createdAt: tx.createdAt,
        })),
        walletFailures: walletFailures.map(match => ({
          id: match.id,
          universe: match.universe,
          timeControl: match.timeControl,
          result: match.result,
          resultReason: match.resultReason,
          white: match.white?.username || 'White',
          black: match.black?.username || 'Black',
          betAmount: Number(match.betAmount),
          walletStatus: match.walletStatus,
          createdAt: match.createdAt,
          endedAt: match.endedAt,
        })),
      },
      disputedGames,
      flaggedUsers,
      recentReports,
      recentErrors,
    });
  } catch (err) {
    console.error('[Admin dashboard] Error:', err);
    res.status(500).json({ error: 'Could not load admin dashboard' });
  }
});

// ── REST: Direct messages ───────────────────────────────────────────────────
app.get('/api/messages/conversations', requireAuth, async (req, res) => {
  try {
    await ensureDirectMessageSchema();
    const me = await getLocalAuthUser(req);
    if (!me) return res.status(404).json({ error: 'Account profile not synced yet' });

    const rows = await prisma.$queryRaw`
      SELECT DISTINCT ON (other_user.id)
        other_user.id AS "otherUserId",
        other_user.username AS "otherUsername",
        other_user.country AS "otherCountry",
        dm.id AS "lastMessageId",
        dm.body AS "lastBody",
        dm."createdAt" AS "lastCreatedAt",
        dm."senderId" AS "lastSenderId",
        (
          SELECT COUNT(*)
          FROM "DirectMessage" unread
          WHERE unread."recipientId" = ${me.id}
            AND unread."senderId" = other_user.id
            AND unread."readAt" IS NULL
        ) AS "unreadCount"
      FROM "DirectMessage" dm
      JOIN "User" other_user
        ON other_user.id = CASE
          WHEN dm."senderId" = ${me.id} THEN dm."recipientId"
          ELSE dm."senderId"
        END
      WHERE dm."senderId" = ${me.id} OR dm."recipientId" = ${me.id}
      ORDER BY other_user.id, dm."createdAt" DESC
    `;

    const conversations = rows
      .map(row => ({
        otherUserId: row.otherUserId,
        otherUsername: row.otherUsername,
        otherCountry: row.otherCountry || '',
        lastMessageId: row.lastMessageId,
        lastBody: row.lastBody,
        lastCreatedAt: row.lastCreatedAt,
        lastSenderId: row.lastSenderId,
        unreadCount: Number(row.unreadCount || 0),
      }))
      .sort((a, b) => new Date(b.lastCreatedAt).getTime() - new Date(a.lastCreatedAt).getTime());

    res.json({ conversations });
  } catch (err) {
    console.error('[Messages conversations] Error:', err);
    res.status(500).json({ error: 'Could not load messages' });
  }
});

app.get('/api/messages/thread/:username', requireAuth, async (req, res) => {
  try {
    await ensureDirectMessageSchema();
    const me = await getLocalAuthUser(req);
    if (!me) return res.status(404).json({ error: 'Account profile not synced yet' });
    const other = await findUserByUsername(req.params.username);
    if (!other) return res.status(404).json({ error: 'User not found' });

    await prisma.$executeRaw`
      UPDATE "DirectMessage"
      SET "readAt" = CURRENT_TIMESTAMP
      WHERE "senderId" = ${other.id}
        AND "recipientId" = ${me.id}
        AND "readAt" IS NULL
    `;

    const rows = await prisma.$queryRaw`
      SELECT
        dm.id,
        dm.body,
        dm."senderId",
        sender.username AS "senderUsername",
        dm."recipientId",
        recipient.username AS "recipientUsername",
        dm."readAt",
        dm."createdAt"
      FROM "DirectMessage" dm
      JOIN "User" sender ON sender.id = dm."senderId"
      JOIN "User" recipient ON recipient.id = dm."recipientId"
      WHERE
        (dm."senderId" = ${me.id} AND dm."recipientId" = ${other.id})
        OR
        (dm."senderId" = ${other.id} AND dm."recipientId" = ${me.id})
      ORDER BY dm."createdAt" ASC
      LIMIT 150
    `;

    res.json({
      other,
      messages: rows,
    });
  } catch (err) {
    console.error('[Messages thread] Error:', err);
    res.status(500).json({ error: 'Could not load conversation' });
  }
});

app.post('/api/messages', requireAuth, async (req, res) => {
  try {
    await ensureSafetySchema();
    await ensureDirectMessageSchema();
    const me = await getLocalAuthUser(req);
    if (!me) return res.status(404).json({ error: 'Account profile not synced yet' });

    const recipient = await findUserByUsername(req.body?.toUsername);
    if (!recipient) return res.status(404).json({ error: 'User not found' });
    if (recipient.id === me.id) return res.status(400).json({ error: 'You cannot message yourself' });

    const body = sanitizeText(req.body?.body, 1000);
    if (!body) return res.status(400).json({ error: 'Message cannot be empty' });

    const block = await findBlockBetween(me, recipient);
    if (block?.blockerId === me.id) {
      return res.status(403).json({ error: 'Unblock this user before messaging them' });
    }
    if (block?.blockerId === recipient.id) {
      return res.status(403).json({ error: 'This user cannot receive your message' });
    }

    const id = genId();
    const rows = await prisma.$queryRaw`
      INSERT INTO "DirectMessage" (id, "senderId", "recipientId", body)
      VALUES (${id}, ${me.id}, ${recipient.id}, ${body})
      RETURNING id, body, "senderId", "recipientId", "readAt", "createdAt"
    `;
    const message = {
      ...rows[0],
      senderUsername: me.username,
      recipientUsername: recipient.username,
    };

    const recipientSocket = userIdToSocketId.get(recipient.id);
    if (recipientSocket) {
      io.to(recipientSocket).emit('direct-message:new', {
        id: message.id,
        fromUsername: me.username,
        body: message.body,
        createdAt: message.createdAt,
      });
    }

    res.json({ message });
  } catch (err) {
    console.error('[Messages send] Error:', err);
    res.status(500).json({ error: 'Could not send message' });
  }
});

app.post('/api/tournaments/:id/pair', requireAuth, async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const userId = req.user.id;
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        players: {
          include: {
            user: { select: { id: true, username: true, chessRating: true, checkersRating: true } },
          },
        },
      },
    });
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (getTournamentLifecycle(tournament) !== 'running') {
      return res.status(400).json({ error: 'Tournament games can only be paired while the tournament is running' });
    }
    if (Date.now() >= getTournamentPairingCutoff(tournament)) {
      return res.status(400).json({ error: 'Pairing is closed for the final 2 minutes of the tournament' });
    }

    const me = tournament.players.find(p => p.userId === userId);
    if (!me) return res.status(403).json({ error: 'Join the tournament before pairing' });
    if (me.status === 'in_game') return res.status(409).json({ error: 'You are already in a tournament game' });

    const mySocketId = userIdToSocketId.get(userId);
    const myPresence = mySocketId ? players.get(mySocketId) : null;
    if (!mySocketId || !myPresence || myPresence.status === 'playing') {
      return res.status(409).json({ error: 'You must be online and idle to pair' });
    }

    await ensureTournamentMatchSchema();
    const previousMatches = await prisma.match.findMany({
      where: { tournamentId },
      select: { whiteId: true, blackId: true },
    });
    const hasPlayed = new Set(previousMatches.map(m => [m.whiteId, m.blackId].sort().join(':')));

    const candidates = tournament.players
      .filter(p => p.userId !== userId && p.status !== 'in_game')
      .map(p => {
        const socketId = userIdToSocketId.get(p.userId);
        const presence = socketId ? players.get(socketId) : null;
        return { player: p, socketId, presence };
      })
      .filter(c => c.socketId && c.presence && c.presence.status !== 'playing');

    if (candidates.length === 0) {
      await prisma.tournamentPlayer.updateMany({
        where: { tournamentId, userId },
        data: { status: 'available' },
      });
      return res.json({ paired: false, message: 'No available opponent yet. Stay on this page or try again in a few seconds.' });
    }

    const pairKey = (otherId) => [userId, otherId].sort().join(':');
    let sorted;
    if (tournament.format === 'arena') {
      sorted = [...candidates].sort(() => Math.random() - 0.5);
    } else {
      sorted = [...candidates].sort((a, b) => {
        const aPlayed = hasPlayed.has(pairKey(a.player.userId)) ? 1 : 0;
        const bPlayed = hasPlayed.has(pairKey(b.player.userId)) ? 1 : 0;
        if (aPlayed !== bPlayed) return aPlayed - bPlayed;
        const aScoreGap = Math.abs(Number(a.player.score) - Number(me.score));
        const bScoreGap = Math.abs(Number(b.player.score) - Number(me.score));
        if (aScoreGap !== bScoreGap) return aScoreGap - bScoreGap;
        const ratingField = tournament.universe === 'checkers' ? 'checkersRating' : 'chessRating';
        return Math.abs(a.player.user[ratingField] - me.user[ratingField])
             - Math.abs(b.player.user[ratingField] - me.user[ratingField]);
      });
    }

    const opponent = sorted[0];
    const locked = await prisma.tournamentPlayer.updateMany({
      where: {
        tournamentId,
        userId: { in: [userId, opponent.player.userId] },
        status: { not: 'in_game' },
      },
      data: { status: 'in_game' },
    });
    if (locked.count !== 2) {
      return res.status(409).json({ error: 'Pairing changed, please try again' });
    }

    const roomId = `tournament-${tournamentId}-${genId()}`;
    const config = {
      universe: tournament.universe,
      timeControl: tournament.timeControl,
      rated: tournament.rated,
      betAmount: 0,
      colorPref: 'random',
      tournamentId,
      tournamentName: tournament.name,
    };

    try {
      await startRoom(roomId, mySocketId, opponent.socketId, config);
    } catch (err) {
      await prisma.tournamentPlayer.updateMany({
        where: { tournamentId, userId: { in: [userId, opponent.player.userId] } },
        data: { status: 'available' },
      });
      throw err;
    }

    io.to(`tournament:${tournamentId}`).emit('tournament:updated', { id: tournamentId });
    res.json({
      paired: true,
      roomId,
      opponent: opponent.player.user.username,
    });
  } catch (err) {
    console.error('[Tournament] Pairing error:', err);
    res.status(500).json({ error: 'Pairing failed' });
  }
});

// ── REST: Wallet ─────────────────────────────────────────────────────────────
app.get('/api/wallet', requireAuth, async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    res.json(wallet);
  } catch { res.status(500).json({ error: 'Could not load wallet. Refresh or sign in again.' }); }
});

app.post('/api/wallet/deposit', requireAuth, async (req, res) => {
  res.status(403).json({ error: 'Direct wallet deposits are disabled. Use secure checkout so payment is verified before funds are credited.' });
});

app.post('/api/wallet/withdraw', requireAuth, async (req, res) => {
  try {
    const safeAmount = sanitizeMoney(req.body.amount);
    if (safeAmount <= 0) return res.status(400).json({ error: 'Withdrawal amount must be greater than $0' });
    let wallet;
    try {
      wallet = await prisma.$transaction(async (tx) => {
        // SELECT FOR UPDATE locks the row so concurrent withdrawals can't both
        // pass the balance check before either decrement lands (double-spend).
        const [locked] = await tx.$queryRaw`
          SELECT id, balance FROM "Wallet" WHERE "userId" = ${req.user.id} FOR UPDATE
        `;
        if (!locked || Number(locked.balance) < safeAmount) {
          throw new Error('Insufficient funds');
        }
        const updated = await tx.wallet.update({
          where: { userId: req.user.id },
          data: { balance: { decrement: safeAmount } },
        });
        await tx.transaction.create({
          data: { walletId: updated.id, amount: -safeAmount, type: 'WITHDRAWAL', status: 'COMPLETED' },
        });
        return updated;
      });
    } catch (err) {
      if (err.message === 'Insufficient funds') return res.status(400).json({ error: 'Insufficient wallet balance. Reduce the amount or deposit funds first.' });
      throw err;
    }
    res.json(wallet);
  } catch { res.status(500).json({ error: 'Could not complete withdrawal. No funds were changed; please try again.' }); }
});

app.get('/api/wallet/transactions', requireAuth, async (req, res) => {
  try {
    const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
    const txns = await prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(txns);
  } catch { res.status(500).json({ error: 'Could not load transaction history. Refresh or try again in a few seconds.' }); }
});

// ── REST: Puzzle Progress ────────────────────────────────────────────────────
app.get('/api/puzzles/progress', requireAuth, async (req, res) => {
  try {
    const progress = await prisma.puzzleProgress.findMany({ where: { userId: req.user.id } });
    res.json(progress);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

app.post('/api/puzzles/complete', requireAuth, async (req, res) => {
  try {
    const { puzzleId, solved } = req.body;
    const entry = await prisma.puzzleProgress.upsert({
      where: { userId_puzzleId: { userId: req.user.id, puzzleId } },
      update: { attempts: { increment: 1 }, solved: solved || undefined, lastAttemptAt: new Date() },
      create: { userId: req.user.id, puzzleId, solved, attempts: 1 },
    });
    res.json(entry);
  } catch { res.status(500).json({ error: 'Failed' }); }
});

// ── Agora video token ─────────────────────────────────────────────────────────
// Requires: npm install agora-access-token   (server-side only)
// Docs: https://docs.agora.io/en/video-calling/get-started/authentication-workflow
const AGORA_APP_ID          = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

// Lazy-load so the server starts even if the package isn't installed yet
let AgoraAccessToken = null;
try { AgoraAccessToken = require('agora-access-token'); } catch { /* not installed yet */ }

app.post('/api/agora/token', agoraLimiter, async (req, res) => {
  if (!AGORA_APP_ID) {
    return res.status(503).json({ error: 'Agora not configured (AGORA_APP_ID missing)' });
  }

  try {
    const { channelName, uid = 0, socketId } = req.body;
    const safeUid = (Number.isInteger(uid) && uid >= 0 && uid <= 0xFFFFFFFF) ? uid : 0;
    if (!channelName || typeof channelName !== 'string') {
      return res.status(400).json({ error: 'channelName is required' });
    }

    // ── Room membership gate (covers audit #2 and #13) ───────────────────────
    const room = rooms.get(channelName);
    if (!room) return res.status(403).json({ error: 'Forbidden' });

    const bearerToken = req.headers.authorization?.split(' ')[1];
    if (bearerToken) {
      // Path A — authenticated user: verify via Supabase JWT → DB user ID
      let userId = null;
      try {
        const { data: { user }, error } = await supabase.auth.getUser(bearerToken);
        if (error || !user) return res.status(401).json({ error: 'Unauthorized' });
        userId = user.id;
      } catch {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const isInRoom =
        socketToUserId.get(room.players.white) === userId ||
        socketToUserId.get(room.players.black) === userId;
      if (!isInRoom) return res.status(403).json({ error: 'Forbidden' });
    } else {
      // Path B — guest: verify via live socket ID + room membership
      if (!socketId || typeof socketId !== 'string') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (!io.sockets.sockets.has(socketId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (room.players.white !== socketId && room.players.black !== socketId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    // If agora-access-token is not installed or App Certificate is missing,
    // return a null token (Agora allows this in testing mode with no App Certificate set)
    if (!AgoraAccessToken || !AGORA_APP_CERTIFICATE) {
      if (process.env.NODE_ENV === 'production') {
        return res.status(503).json({ error: 'Video not configured' });
      }
      console.warn('[Agora] No App Certificate — returning null token (testing only)');
      return res.json({ token: null, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
    }

    const { RtcTokenBuilder, RtcRole } = AgoraAccessToken;
    const expireTime = 3600; // 1 hour
    const currentTime = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTime + expireTime;

    const token = RtcTokenBuilder.buildTokenWithUid(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channelName,
      safeUid,
      RtcRole.PUBLISHER,
      privilegeExpireTime
    );

    res.json({ token, appId: AGORA_APP_ID, channel: channelName, uid: safeUid });
  } catch (err) {
    console.error('[Agora] Token generation failed:', err);
    res.status(500).json({ error: 'Failed to generate video token' });
  }
});

// ── Stripe wallet ─────────────────────────────────────────────────────────────
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const stripe = STRIPE_SECRET && !STRIPE_SECRET.includes('REPLACE_ME') ? require('stripe')(STRIPE_SECRET) : null;
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;


app.post('/api/wallet/stripe/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payment gateway not configured' });
  try {
    const { amount } = req.body; // amount in USD (integer, e.g. 5)
    if (!amount || amount < 5 || amount > 10000) return res.status(400).json({ error: 'Amount must be $5–$10,000' });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: 'DamCash Wallet Top-Up', description: `Add $${amount} to your DamCash wallet` },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${APP_URL}/wallet/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${APP_URL}/wallet/cancel`,
      metadata: { userId: req.user.id, amount: String(amount) },
    });
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) { res.status(500).json({ error: 'Failed to create checkout session' }); }
});

app.get('/api/wallet/stripe/verify', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payment gateway not configured' });
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Payment not completed' });
    if (session.metadata?.userId !== req.user.id) return res.status(403).json({ error: 'Session mismatch' });

    const amount = parseFloat(session.metadata?.amount || '0');
    if (amount <= 0) return res.status(400).json({ error: 'Invalid amount in session' });

    // Use a transaction for atomicity and a unique constraint check for idempotency
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.transaction.findUnique({
        where: { stripeSessionId: session_id },
        include: { wallet: true },
      });

      if (existing) {
        return { already_credited: true, balance: Number(existing.wallet?.balance ?? 0) };
      }

      const wallet = await tx.wallet.update({
        where: { userId: req.user.id },
        data: { balance: { increment: amount } },
      });

      await tx.transaction.create({
        data: { 
          walletId: wallet.id, 
          amount, 
          type: 'DEPOSIT', 
          status: 'COMPLETED', 
          stripeSessionId: session_id 
        },
      });

      return { ok: true, balance: Number(wallet.balance) };
    });

    res.json(result);
  } catch (err) {
    // Handle unique constraint failure (P2002) which means it was already processed
    if (err.code === 'P2002') {
      const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
      return res.json({ already_credited: true, balance: Number(wallet?.balance ?? 0), message: 'Session already processed' });
    }
    console.error('[Stripe Verify] Error:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// Stripe webhook (for server-initiated fulfillment — optional but recommended in prod)
app.post('/api/wallet/stripe/webhook', async (req, res) => {
  if (!stripe) return res.sendStatus(200);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.sendStatus(200);
  if (!req.rawBody) return res.status(400).send('Webhook Error: raw body missing');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) { 
    console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`); 
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status === 'paid' && session.metadata?.userId) {
      const userId = session.metadata.userId;
      const amount = parseFloat(session.metadata.amount || '0');
      if (amount > 0) {
        try {
          const existing = await prisma.transaction.findFirst({ where: { stripeSessionId: session.id } });
          if (!existing) {
            const wallet = await prisma.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });
            await prisma.transaction.create({
              data: { walletId: wallet.id, amount, type: 'DEPOSIT', status: 'COMPLETED', stripeSessionId: session.id },
            });
          }
        } catch (e) { console.error('[Stripe Webhook] DB error', e); }
      }
    }
  }
  res.sendStatus(200);
});

// ── Email notifications ───────────────────────────────────────────────────────
const nodemailer = require('nodemailer');
let mailer = null;
if (process.env.SMTP_HOST) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendTurnEmail(toEmail, toUsername, fromUsername, gameId, san) {
  if (!mailer) return;
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM || 'DamCash <noreply@damcash.com>',
      to: toEmail,
      subject: `Your turn in correspondence game — ${fromUsername} played ${san}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#6366f1">DamCash — Your turn!</h2>
          <p>Hi <strong>${toUsername}</strong>,</p>
          <p><strong>${fromUsername}</strong> just played <strong>${san}</strong> in your correspondence game.</p>
          <p>It's your turn to respond.</p>
          <a href="${APP_URL}/correspondence/${gameId}"
             style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px">
            Make your move →
          </a>
          <p style="margin-top:24px;font-size:12px;color:#888">
            You received this because you're playing a correspondence game on DamCash.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Email] Failed to send turn notification:', err.message);
  }
}

// ── API 404 catch-all (must come BEFORE the static file server) ──────────────
// Without this, unmatched /api/* requests fall through to the HTML catch-all
// and the client receives HTML instead of JSON, causing parse errors.
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ── Serve built frontend ─────────────────────────────────────────────────────
const distPath = path.join(__dirname, '../dist');

// Serve static assets (JS, CSS, images) but not index.html — we inject config into it.
// Hashed Vite assets can be cached, but the HTML shell must stay fresh because it
// contains the current hashed script names.
app.use(express.static(distPath, {
  index: false,
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// If a browser asks for an old hashed asset after a new build, do not let the SPA
// fallback return index.html as JavaScript. That causes a blank screen with
// "text/html is not a valid JavaScript MIME type".
app.get(['/assets/*', '/*.js', '/*.css', '/*.map'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).type('text/plain').send(`Asset not found: ${req.path}. Reload the app to fetch the latest build.`);
});

// Inject runtime Supabase config into index.html so the frontend works even when
// VITE_ build-time env vars weren't available during the Docker build (Railway quirk)
let _indexHtmlCache = null;
app.get('*', (_req, res) => {
  const indexPath = path.join(distPath, 'index.html');
  try {
    if (!_indexHtmlCache) _indexHtmlCache = fs.readFileSync(indexPath, 'utf8');
    const cfg = JSON.stringify({
      SUPABASE_URL: process.env.VITE_SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || '',
      AGORA_APP_ID: process.env.AGORA_APP_ID || process.env.VITE_AGORA_APP_ID || '',
    });
    const html = _indexHtmlCache.replace('</head>', `<script>window.__DC_CFG__=${cfg};</script></head>`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.type('html').send(html);
  } catch {
    res.status(500).send('App not built — run npm run build first.');
  }
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  log.error(`[ERROR] ${req.method} ${req.path}`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Periodic memory cleanup ──────────────────────────────────────────────────
// Prevents Maps from growing unbounded on long-running instances
setInterval(() => {
  const now = Date.now();

  // Rooms older than 4 hours with no moves are stale
  for (const [id, room] of rooms.entries()) {
    const age = now - (room.createdAt || 0);
    if (age > 4 * 60 * 60 * 1000 && room.moves.length === 0) {
      markRoomMatchAborted(id, 'Stale room cleanup');
      releaseTournamentRoom(id);
      rooms.delete(id);
      log.warn(`[CLEANUP] Removed stale room ${id}`);
    }
  }

  // Seeks older than 10 minutes
  for (const [id, seek] of seeks.entries()) {
    if (now - seek.createdAt > 10 * 60 * 1000) seeks.delete(id);
  }

  // Socket rate limiter entries older than 2 minutes
  for (const [id, entry] of socketEventCounts.entries()) {
    if (now > entry.resetAt + 60_000) socketEventCounts.delete(id);
  }

  log.info(`[CLEANUP] rooms=${rooms.size} seeks=${seeks.size} players=${players.size}`);
}, 5 * 60 * 1000); // run every 5 minutes

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  log.info(`[SHUTDOWN] Received ${signal} — closing gracefully`);

  // Stop accepting new connections
  httpServer.close(async () => {
    log.info('[SHUTDOWN] HTTP server closed');
    try {
      await prisma.$disconnect();
      log.info('[SHUTDOWN] Prisma disconnected');
    } catch (e) {
      log.error('[SHUTDOWN] Prisma disconnect error', e);
    }
    process.exit(0);
  });

  // Force exit after 15s if something hangs
  setTimeout(() => {
    log.error('[SHUTDOWN] Force exit after timeout');
    process.exit(1);
  }, 15_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  log.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
  log.error('[UNCAUGHT EXCEPTION]', err);
  shutdown('uncaughtException');
});

const PORT = process.env.PORT || 3000;
async function startServer() {
  await ensureTournamentMatchSchema();
  await ensureSafetySchema();
  await ensureDirectMessageSchema();
  await resetStaleTournamentPairingStatuses();
  httpServer.listen(PORT, '0.0.0.0', () => {
    log.info(`DamCash server → http://0.0.0.0:${PORT}`);
    startTournamentScheduler();
  });
}

startServer().catch((err) => {
  log.error('[FATAL] Server startup failed:', err);
  process.exit(1);
});

// ── Automated Tournament Scheduler ───────────────────────────────────────────

const SCHEDULE_WINDOW_HOURS = 24;
const HOURLY_TOURNAMENT_DURATION_MS = 60 * 60 * 1000;
let schedulerTickInFlight = false;

function utcHourStart(date = new Date()) {
  const start = new Date(date);
  start.setUTCMinutes(0, 0, 0);
  return start;
}

function tournamentNameForHourlySlot(startAt) {
  return `⚡ Hourly Blitz ${String(startAt.getUTCHours()).padStart(2, '0')}:00 UTC`;
}

async function createScheduledTournament({ name, icon, universe, timeControl, format, startsAt, durationMs, description, totalRounds }) {
  try {
    const startDate = startsAt ? new Date(startsAt) : new Date(Date.now() + 5 * 60 * 1000);
    const existing = await prisma.tournament.findFirst({
      where: {
        name,
        universe: universe || 'chess',
        startsAt: startDate,
      },
      select: { id: true },
    });
    if (existing) return false;

    await prisma.tournament.create({
      data: {
        name,
        icon: icon || '🏆',
        universe: universe || 'chess',
        format: format || 'arena',
        timeControl: timeControl || '5+0',
        startsAt: startDate,
        durationMs: Number(durationMs) || 3_600_000,
        maxPlayers: 50,
        betEntry: 0,
        prizePool: 0,
        status: getTournamentLifecycle({ startsAt: startDate, durationMs: Number(durationMs) || 3_600_000 }),
        description: description || '',
        rated: true,
        totalRounds: Number(totalRounds) || 0,
      },
    });
    log.info(`[Scheduler] Created tournament: ${name}`);
    return true;
  } catch (e) {
    log.error('[Scheduler] Failed to create tournament:', e.message);
    return false;
  }
}

async function refreshTournamentStatusFields(nowMs = Date.now()) {
  const tournaments = await prisma.tournament.findMany({
    select: { id: true, startsAt: true, durationMs: true, status: true },
  });
  const updates = tournaments
    .map(tournament => ({ id: tournament.id, currentStatus: tournament.status, nextStatus: getTournamentLifecycle(tournament, nowMs) }))
    .filter(tournament => tournament.nextStatus !== tournament.currentStatus);

  for (const update of updates) {
    await prisma.tournament.update({
      where: { id: update.id },
      data: { status: update.nextStatus },
    });
  }
  return updates.length;
}

async function ensureHourlyTournamentWindow(now = new Date()) {
  const anchor = utcHourStart(now);
  let created = 0;
  for (let offset = 0; offset <= SCHEDULE_WINDOW_HOURS; offset++) {
    const startsAt = new Date(anchor.getTime() + offset * HOURLY_TOURNAMENT_DURATION_MS);
    for (const universe of ['chess', 'checkers']) {
      const wasCreated = await createScheduledTournament({
        name: tournamentNameForHourlySlot(startsAt),
        icon: '⚡',
        universe,
        timeControl: '5+0',
        format: 'arena',
        startsAt,
        durationMs: HOURLY_TOURNAMENT_DURATION_MS,
        description: 'Automated hourly blitz arena. Registration opens 3 minutes before the hour, late joining stays open while pairings are available, and pairing closes for the final 2 minutes.',
        totalRounds: 0,
      });
      if (wasCreated) created += 1;
    }
  }
  return created;
}

async function ensureSpecialTournamentSchedule(now = new Date()) {
  let created = 0;
  const dow = now.getUTCDay();   // 0 = Sunday
  const d = now.getUTCDate();
  const mo = now.getUTCMonth();
  const yr = now.getUTCFullYear();
  const nowMs = now.getTime();

  if (dow === 0) {
    const startsAt = new Date(Date.UTC(yr, mo, d, 14, 0, 0, 0));
    if (nowMs <= startsAt.getTime() + 2 * 60 * 60 * 1000) {
      const wasCreated = await createScheduledTournament({
        name: '☀️ Sunday Special',
        icon: '☀️',
        universe: 'chess',
        timeControl: '3+2',
        format: 'arena',
        startsAt,
        durationMs: 2 * 60 * 60 * 1000,
        description: 'The weekly Sunday Special! 2 hours of exciting blitz action.',
        totalRounds: 0,
      });
      if (wasCreated) created += 1;
    }
  }

  if (d === 1) {
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const startsAt = new Date(Date.UTC(yr, mo, d, 16, 0, 0, 0));
    if (nowMs <= startsAt.getTime() + 4 * 60 * 60 * 1000) {
      const wasCreated = await createScheduledTournament({
        name: `🏆 Grand Slam — ${monthNames[mo]} ${yr}`,
        icon: '🏆',
        universe: 'chess',
        timeControl: '10+5',
        format: 'swiss',
        startsAt,
        durationMs: 4 * 60 * 60 * 1000,
        description: `The monthly Grand Slam championship! The biggest tournament of ${monthNames[mo]}.`,
        totalRounds: 7,
      });
      if (wasCreated) created += 1;
    }
  }

  return created;
}

async function runSchedulerTick() {
  if (schedulerTickInFlight) return;
  schedulerTickInFlight = true;
  try {
    const [statusUpdates, hourlyCreated, specialCreated] = await Promise.all([
      refreshTournamentStatusFields(),
      ensureHourlyTournamentWindow(),
      ensureSpecialTournamentSchedule(),
    ]);
    if (statusUpdates || hourlyCreated || specialCreated) {
      io.emit('tournament:global_update');
      log.info(`[Scheduler] Synced tournaments — ${hourlyCreated} hourly created, ${specialCreated} special created, ${statusUpdates} statuses updated`);
    }
  } catch (e) {
    log.error('[Scheduler] Tick failed:', e.message);
  } finally {
    schedulerTickInFlight = false;
  }
}

function startTournamentScheduler() {
  runSchedulerTick();
  const msUntilNextMinute = (60 - new Date().getUTCSeconds()) * 1000 - new Date().getUTCMilliseconds();
  setTimeout(() => {
    runSchedulerTick();
    setInterval(runSchedulerTick, 60_000);
  }, msUntilNextMinute);
  log.info(`[Scheduler] Tournament scheduler started — first tick in ${Math.round(msUntilNextMinute / 1000)}s`);
}
